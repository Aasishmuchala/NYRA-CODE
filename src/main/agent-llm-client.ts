/**
 * Agent LLM Client — unified LLM request routing for all agents
 *
 * Architecture (Phase 1.1 upgrade):
 *   agent-orchestrator → callAgentLLM()
 *     → [1] Provider Abstraction Layer (direct API: OpenAI, Anthropic, Ollama)
 *     → [2] wsproxy fallback (WebSocket → OpenClaw gateway)
 *
 * The Provider Abstraction Layer is tried first for direct API calls.
 * If no provider has a matching API key, falls back to wsproxy/OpenClaw.
 *
 * All existing consumers (orchestrator, plan-engine, plan-executor,
 * semantic-memory, composer-engine, computer-use-agent) continue to
 * import callAgentLLM() from this file — zero changes required.
 */

import WebSocket from 'ws'
import { PROXY_PORT } from './wsproxy'
import type { AgentDefinition } from './agent-registry'

// ── Phase 1.1: Provider Abstraction Layer ────────────────────────────────────
// Try direct API providers first (OpenAI, Anthropic, Ollama)
// Falls back to wsproxy if no direct provider is available
let providerBridgeAvailable = false
let callAgentLLMV2: ((agent: AgentDefinition, msg: string) => Promise<string>) | null = null

// Lazy-load the provider bridge to avoid circular imports at module init
async function ensureProviderBridge(): Promise<boolean> {
  if (callAgentLLMV2 !== null) return providerBridgeAvailable
  try {
    const bridge = await import('./providers/provider-bridge')
    callAgentLLMV2 = bridge.callAgentLLMV2
    providerBridgeAvailable = true
    console.log('[AgentLLM] Provider Abstraction Layer loaded — direct API mode available')
  } catch (err) {
    providerBridgeAvailable = false
    console.log('[AgentLLM] Provider Abstraction Layer not available, using wsproxy fallback')
  }
  return providerBridgeAvailable
}

// ── Legacy wsproxy connection ────────────────────────────────────────────────

const PROXY_URL = `ws://127.0.0.1:${PROXY_PORT}`
const CALL_TIMEOUT = 120_000 // 2 minutes max per agent call

let agentWs: WebSocket | null = null
let agentWsReady = false
const pendingCalls = new Map<string, {
  resolve: (value: string) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}>()
let rpcIdCounter = 0

/**
 * Ensure we have a live WebSocket connection to the proxy
 */
function ensureConnection(): Promise<void> {
  if (agentWs?.readyState === WebSocket.OPEN && agentWsReady) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    // Close stale connection
    if (agentWs) {
      try { agentWs.close() } catch { /* ignore */ }
    }

    console.log('[AgentLLM] Connecting to proxy at', PROXY_URL)
    agentWs = new WebSocket(PROXY_URL)

    // Settled flag prevents double-resolve/reject from timeout + open race
    let settled = false

    const connectTimeout = setTimeout(() => {
      if (settled) return
      settled = true
      agentWsReady = false
      reject(new Error('Agent WS connection timeout (10s)'))
      try { agentWs?.close() } catch { /* */ }
    }, 10_000)

    agentWs.on('open', () => {
      if (settled) return  // timeout already fired — this connection is stale
      settled = true
      clearTimeout(connectTimeout)
      agentWsReady = true
      console.log('[AgentLLM] Connected to proxy')
      resolve()
    })

    agentWs.on('message', (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString())

        // Handle JSON-RPC response: { id, result } or { id, error }
        if (msg.id && pendingCalls.has(msg.id)) {
          const pending = pendingCalls.get(msg.id)!
          pendingCalls.delete(msg.id)
          clearTimeout(pending.timer)

          if (msg.error) {
            pending.reject(new Error(msg.error.message || 'LLM call failed'))
          } else {
            // Extract text content from the response payload
            const result = msg.result
            const content = typeof result === 'string' ? result
              : result?.content ?? result?.message ?? result?.text
              ?? result?.payload?.content ?? result?.payload?.message
              ?? JSON.stringify(result)
            pending.resolve(String(content))
          }
          return
        }

        // Handle gateway events (streaming tokens, tool use, etc.)
        // For agent calls we collect the full response, not streaming
        if (msg.type === 'event' && msg.event === 'chat.token') {
          // Streaming token — accumulate if we have a pending call
          // The gateway may send tokens before the final response
          // For now we rely on the final res message
        }
      } catch (err) {
        console.warn('[AgentLLM] Failed to parse message:', err)
      }
    })

    agentWs.on('close', () => {
      agentWsReady = false
      console.log('[AgentLLM] Disconnected from proxy')
      // Reject all pending calls
      for (const [id, pending] of pendingCalls) {
        clearTimeout(pending.timer)
        pending.reject(new Error('Agent WebSocket closed'))
        pendingCalls.delete(id)
      }
    })

    agentWs.on('error', (err: Error) => {
      agentWsReady = false
      console.error('[AgentLLM] WebSocket error:', err.message)
      if (!settled) {
        settled = true
        clearTimeout(connectTimeout)
        reject(err)
      }
    })
  })
}

/**
 * Send a raw JSON-RPC request and wait for response
 */
function sendRpc(method: string, params: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!agentWs || agentWs.readyState !== WebSocket.OPEN) {
      reject(new Error('Agent WebSocket not connected'))
      return
    }

    const id = `agent-${++rpcIdCounter}-${Date.now()}`
    const timer = setTimeout(() => {
      pendingCalls.delete(id)
      reject(new Error(`LLM call timeout after ${CALL_TIMEOUT / 1000}s`))
    }, CALL_TIMEOUT)

    pendingCalls.set(id, { resolve, reject, timer })

    const frame = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    })

    agentWs.send(frame)
    console.log(`[AgentLLM] Sent ${method} (id=${id})`)
  })
}

/**
 * Call an agent's LLM with a system prompt and user input.
 *
 * Routing priority (Phase 1.1):
 *  1. Provider Abstraction Layer (direct OpenAI/Anthropic/Ollama API)
 *  2. wsproxy → OpenClaw gateway (legacy fallback)
 *
 * All existing consumers continue to call this function unchanged.
 */
export async function callAgentLLM(
  agent: AgentDefinition,
  userMessage: string,
): Promise<string> {
  // ── Try Provider Abstraction Layer first (direct API) ──
  const hasProviders = await ensureProviderBridge()
  if (hasProviders && callAgentLLMV2) {
    try {
      const result = await callAgentLLMV2(agent, userMessage)
      return result
    } catch (providerErr) {
      console.warn(
        `[AgentLLM] Provider bridge failed for ${agent.name}, falling back to wsproxy:`,
        (providerErr as Error).message
      )
      // Fall through to wsproxy
    }
  }

  // ── Legacy wsproxy fallback ──
  await ensureConnection()

  // Try preferred model first
  try {
    return await tryModel(agent.preferredModel, agent.systemPrompt, userMessage, agent.tokenBudget)
  } catch (err) {
    const errMsg = (err as Error).message || ''
    console.warn(`[AgentLLM] Preferred model ${agent.preferredModel} failed: ${errMsg}`)

    // If it's an auth/model error, try fallback
    if (agent.fallbackModel && agent.fallbackModel !== agent.preferredModel) {
      console.log(`[AgentLLM] Trying fallback model: ${agent.fallbackModel}`)
      try {
        return await tryModel(agent.fallbackModel, agent.systemPrompt, userMessage, agent.tokenBudget)
      } catch (fallbackErr) {
        console.error(`[AgentLLM] Fallback model also failed:`, (fallbackErr as Error).message)
        throw fallbackErr
      }
    }
    throw err
  }
}

/**
 * Send a chat.send request with a specific model
 */
async function tryModel(
  _modelId: string,
  systemPrompt: string,
  userMessage: string,
  _maxTokens: number,
): Promise<string> {
  // Note: OpenClaw chat.send uses the default provider from config.
  // We include the full message with system context prepended.
  // The actual model routing is handled by auth-profiles.json default-provider.
  //
  // For agent-specific models, we'd need per-request model override.
  // Currently OpenClaw gateway rejects 'model' in chat.send params.
  // So agents use whatever the current default provider is configured to.
  //
  // TODO: When OpenClaw supports per-request model override, pass it here.

  const sessionKey = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Combine system prompt + user message into the message field
  // since OpenClaw's chat.send doesn't support a separate system param
  const fullMessage = systemPrompt
    ? `[System Instructions]\n${systemPrompt}\n\n[Task]\n${userMessage}`
    : userMessage

  const response = await sendRpc('chat.send', {
    sessionKey,
    message: fullMessage,
    deliver: false,
    idempotencyKey: `agent-${sessionKey}`,
  })

  return response
}

/**
 * Gracefully close the agent WebSocket connection
 */
export function closeAgentLLMConnection(): void {
  if (agentWs) {
    try { agentWs.close() } catch { /* */ }
    agentWs = null
    agentWsReady = false
  }
}
