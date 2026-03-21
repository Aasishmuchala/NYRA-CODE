/**
 * useOpenClaw — WebSocket client hook for the OpenClaw Gateway  (v4)
 *
 * v4 — single source of truth:
 *  • ELIMINATED the separate `activeSession` state that caused sync bugs
 *  • Sessions array is the ONLY place messages live
 *  • `activeSession` is derived via useMemo — can NEVER go out of sync
 *  • `activeSessionId` (string) is the only thing that changes when switching sessions
 *  • All message updates go through `setSessions` — one state, one truth
 *
 * v3 features retained:
 *  • Dual event format: JSON-RPC notifications + gateway native events
 *  • Streaming token field name flexibility (token, content, text, delta)
 *  • Token batching via requestAnimationFrame
 *  • 60s streaming safety timeout
 *  • Pending promise cleanup on WS close
 *  • Fast reconnect: 500 ms
 *  • WebSocket keepalive ping every 15 s
 *  • Offline message queue
 *  • Pin / unpin, color label, system prompt, branch, export, search
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
export type GatewayStatus   = 'idle' | 'checking' | 'installing' | 'starting' | 'ready' | 'error'
export type WsStatus        = 'connecting' | 'connected' | 'disconnected' | 'error'
export type SessionColor    = 'indigo' | 'violet' | 'rose' | 'amber' | 'emerald' | 'cyan' | 'none'
export type StreamingPhase  = 'thinking' | 'generating' | 'tool-use' | null

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  attachments?: Array<{ name: string; mimeType: string; content: string }>
}

export interface Session {
  id: string
  title: string
  model?: string
  systemPrompt?: string
  updatedAt: number
  messages: ChatMessage[]
  incognito?: boolean
  pinned?: boolean
  color?: SessionColor
  projectId?: string
  branchedFrom?: string
  tags?: string[]
}

export interface WizardStep {
  id: string
  type: 'note' | 'select' | 'text' | 'confirm' | 'multiselect' | 'progress' | 'action'
  title?: string
  message?: string
  options?: Array<{ value: string; label: string; hint?: string }>
  initialValue?: unknown
  placeholder?: string
  sensitive?: boolean
  executor?: 'gateway' | 'client'
}

interface RpcRequest {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: unknown
}

// v3: Accept both JSON-RPC responses and gateway native frames
interface IncomingMessage {
  jsonrpc?: '2.0'
  id?: string
  result?: unknown
  error?: { code: number; message: string }
  method?: string
  params?: unknown
  type?: 'event' | 'res'
  event?: string
  payload?: unknown
  ok?: boolean
}

type PendingResolver = {
  resolve: (v: unknown) => void
  reject:  (e: Error)   => void
}

interface QueuedMessage {
  content: string
  sessionId: string
  attachments?: ChatMessage['attachments']
  model?: string
}

let rpcIdCounter = 1
function newId() { return String(rpcIdCounter++) }

/**
 * Extract text from an OpenClaw message object.
 * Messages can have: { text: "..." } or { content: [{ type:"text", text:"..." }, ...] }
 * or { role: "assistant", content: "..." }
 */
/**
 * Resolve a gateway session key to a local session id.
 * The gateway uses compound keys like "agent:main:main" internally,
 * but our local sessions may use the simple key "main".
 * This function bridges the two formats.
 */
function resolveSessionKey(
  key: string,
  sessions: Session[],
  streamingKey: string | null
): string {
  // 1. Direct match — most common case
  if (sessions.some(s => s.id === key)) return key

  // 2. If we're actively streaming to a local session, check if the gateway
  //    key contains our local key (e.g., "agent:main:main" contains "main")
  if (streamingKey && key.includes(streamingKey)) return streamingKey

  // 3. Extract the middle segment from compound keys (agent:X:main → X)
  const parts = key.split(':')
  if (parts.length >= 2) {
    const simple = parts[1]
    if (sessions.some(s => s.id === simple)) return simple
  }

  // 4. Fallback: return the original key
  return key
}

function extractTextFromMessage(message: Record<string, unknown> | undefined | null): string | null {
  if (!message) return null
  // Direct text field
  if (typeof message.text === 'string') return message.text
  // Direct content string
  if (typeof message.content === 'string') return message.content
  // Content array (OpenClaw standard format)
  if (Array.isArray(message.content)) {
    const textParts = (message.content as Array<Record<string, unknown>>)
      .filter(c => c.type === 'text' && typeof c.text === 'string')
      .map(c => c.text as string)
    if (textParts.length > 0) return textParts.join('')
  }
  return null
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useOpenClaw() {
  const [status,       setStatus]       = useState<GatewayStatus>('idle')
  const [log,          setLog]          = useState<string>('')
  const [wsUrl,        setWsUrl]        = useState<string>('ws://127.0.0.1:18789')
  const [wsStatus,     setWsStatus]     = useState<WsStatus>('disconnected')
  const [streaming,       setStreaming]       = useState(false)
  const [streamingPhase,  setStreamingPhase]  = useState<StreamingPhase>(null)
  const [offlineQueue,    setOfflineQueue]    = useState<QueuedMessage[]>([])

  // ── SINGLE SOURCE OF TRUTH ──────────────────────────────────────────────────
  // Sessions array is the ONE place messages live.
  // activeSessionId is just a pointer into the array.
  // activeSession is DERIVED — never stale, never out of sync.
  const [sessions,        setSessions]        = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const activeSession = useMemo(
    () => (activeSessionId ? sessions.find(s => s.id === activeSessionId) ?? null : null),
    [sessions, activeSessionId]
  )

  // ── Refs ────────────────────────────────────────────────────────────────────
  const wsRef              = useRef<WebSocket | null>(null)
  const connectingRef      = useRef<boolean>(false)
  const pendingRef         = useRef<Map<string, PendingResolver>>(new Map())
  const streamingSessionRef= useRef<string | null>(null)
  const reconnectTimer     = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const pingTimer          = useRef<ReturnType<typeof setInterval> | null>(null)
  const tokenBufferRef     = useRef<Map<string, string>>(new Map())
  const rafRef             = useRef<number | null>(null)
  const offlineQueueRef    = useRef<QueuedMessage[]>([])
  const streamTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toolCallHandlerRef = useRef<((callId: string, toolName: string, params: Record<string, unknown>) => Promise<{ callId: string; result?: unknown; error?: string }>) | null>(null)
  const fetchDebounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messageSendingRef  = useRef<boolean>(false)
  // Gate ws.onclose reconnects — no point reconnecting if the gateway hasn't come up yet
  const gatewayReadyRef    = useRef(false)

  // Stable ref for activeSessionId (for use inside callbacks without stale closures)
  const activeSessionIdRef = useRef<string | null>(null)
  activeSessionIdRef.current = activeSessionId

  // Stable ref for sessions array (for use inside callbacks)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // ── Flush batched tokens (rAF — one React update per frame) ─────────────────
  // v4: Only updates sessions — activeSession derives automatically
  const flushTokens = useCallback(() => {
    rafRef.current = null
    if (tokenBufferRef.current.size === 0) return
    const updates = new Map(tokenBufferRef.current)
    tokenBufferRef.current.clear()

    setSessions(prev => prev.map(s => {
      const tok = updates.get(s.id)
      if (!tok) return s
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + tok }
      return { ...s, messages: msgs }
    }))
  }, [])

  // Ref for streaming phase to avoid stale closures in handleStreamToken
  const streamingPhaseRef = useRef<StreamingPhase>(null)
  streamingPhaseRef.current = streamingPhase

  // Helper to handle streaming token from either event format
  const handleStreamToken = useCallback((sessionId: string, token: string) => {
    tokenBufferRef.current.set(sessionId, (tokenBufferRef.current.get(sessionId) ?? '') + token)
    if (!rafRef.current) rafRef.current = requestAnimationFrame(flushTokens)

    // Auto-detect streaming phase from content
    if (token.includes('<thinking>') || token.includes('<thinking')) {
      setStreamingPhase('thinking')
    } else if (token.includes('</thinking>')) {
      setStreamingPhase('generating')
    } else if (streamingPhaseRef.current === null) {
      // First token and no thinking detected — must be generating
      setStreamingPhase('generating')
    }
  }, [flushTokens])

  // Helper to handle stream done from either event format
  // v4: Only updates sessions — activeSession derives automatically
  const handleStreamDone = useCallback((sessionId: string) => {
    // Flush remaining buffer immediately
    const remaining = tokenBufferRef.current.get(sessionId)
    if (remaining) {
      tokenBufferRef.current.delete(sessionId)
      setSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s
        const msgs = [...s.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + remaining }
        return { ...s, messages: msgs }
      }))
    }

    // ── Direct API fallback: detect gateway-streamed error responses ──────
    // Some gateways stream error messages as if they were assistant content
    // (e.g. "⚠️ API rate limit reached"). Detect these and retry via direct API.
    const currentSession = sessionsRef.current.find(s => s.id === sessionId)
    const lastMsg = currentSession?.messages[currentSession.messages.length - 1]
    const errorPatterns = ['rate limit', 'rate_limit', 'API rate limit', 'api error', 'unauthorized', 'authentication failed']
    const assistantContent = lastMsg?.role === 'assistant' ? (lastMsg.content || '') : ''
    const looksLikeError = assistantContent.length < 200 &&
      errorPatterns.some(p => assistantContent.toLowerCase().includes(p))

    if (looksLikeError && window.nyra?.streaming?.directStream) {
      console.warn('[OpenClaw] Gateway streamed an error response — trying direct API fallback')
      console.warn('[OpenClaw] Error content:', assistantContent)

      // Collect user messages for the fallback
      const chatMessages = (currentSession?.messages ?? [])
        .filter(m => m.role === 'user' && m.content)
        .map(m => ({ role: m.role, content: m.content }))

      if (chatMessages.length > 0) {
        const fallbackStreamId = `direct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

        // Clear the error content and restart streaming
        setSessions(prev => prev.map(s => {
          if (s.id !== sessionId) return s
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant') {
            msgs[msgs.length - 1] = { ...last, content: '' }
          }
          return { ...s, messages: msgs }
        }))
        setStreaming(true)
        setStreamingPhase('generating')
        streamingSessionRef.current = sessionId

        window.nyra.streaming.directStream({
          streamId: fallbackStreamId,
          messages: chatMessages,
          maxTokens: 4096,
          temperature: 0.7,
        }).then((result: any) => {
          if (!result?.success) {
            console.error('[OpenClaw] Direct fallback failed:', result?.error)
            setSessions(prev => prev.map(s => {
              if (s.id !== sessionId) return s
              const msgs = [...s.messages]
              const last = msgs[msgs.length - 1]
              if (last?.role === 'assistant') {
                msgs[msgs.length - 1] = { ...last, content: `⚠️ ${result?.error || 'No providers configured'}\n\nPlease add an API key in Settings.` }
              }
              return { ...s, messages: msgs }
            }))
            setStreaming(false)
            streamingSessionRef.current = null
            messageSendingRef.current = false
          }
          // If success, stream:chunk and stream:done events handle the rest
        }).catch(() => {
          setStreaming(false)
          streamingSessionRef.current = null
          messageSendingRef.current = false
        })

        // Don't clear streaming state yet — the direct stream will handle it
        return
      }
    }

    if (streamingSessionRef.current === sessionId) {
      setStreaming(false)
      setStreamingPhase(null)
      streamingSessionRef.current = null
    }
    // Clear send guard immediately — the stream is done, state is final.
    // fetchSessions merge logic now safely preserves messages from local state.
    messageSendingRef.current = false
    if (streamTimeoutRef.current) { clearTimeout(streamTimeoutRef.current); streamTimeoutRef.current = null }
  }, [])

  // ── Direct API fallback (bypasses gateway when it can't route) ──────────────
  // Called when the gateway streams an error (rate limit, auth failure, missing provider).
  // Collects user messages from the session, calls chat:direct-stream IPC which
  // resolves the provider from saved keys and streams directly to the LLM API.
  const tryDirectApiFallback = useCallback((sessionId: string, gatewayError: string) => {
    if (!window.nyra?.streaming?.directStream) {
      // No direct stream support — show the original error
      setSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s
        const msgs = [...s.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant' && (!last.content || last.content === '')) {
          msgs[msgs.length - 1] = { ...last, content: `⚠️ ${gatewayError}` }
        }
        return { ...s, messages: msgs }
      }))
      handleStreamDone(sessionId)
      return
    }

    // Collect user messages for the fallback request
    const currentSession = sessionsRef.current.find(s => s.id === sessionId)
    const chatMessages = (currentSession?.messages ?? [])
      .filter(m => m.role === 'user' && m.content)
      .map(m => ({ role: m.role, content: m.content }))

    if (chatMessages.length === 0) {
      setSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s
        const msgs = [...s.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, content: `⚠️ ${gatewayError}` }
        }
        return { ...s, messages: msgs }
      }))
      handleStreamDone(sessionId)
      return
    }

    console.log('[OpenClaw] Falling back to direct API stream (bypassing gateway)')
    const fallbackStreamId = `direct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    // Clear any error content and (re)start streaming state
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: '' }
      }
      return { ...s, messages: msgs }
    }))
    setStreaming(true)
    setStreamingPhase('generating')
    streamingSessionRef.current = sessionId

    // Clear safety timeout — we're retrying
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current)
      streamTimeoutRef.current = null
    }

    window.nyra.streaming.directStream({
      streamId: fallbackStreamId,
      messages: chatMessages,
      maxTokens: 4096,
      temperature: 0.7,
    }).then((result: any) => {
      if (!result?.success) {
        console.error('[OpenClaw] Direct fallback also failed:', result?.error)
        setSessions(prev => prev.map(s => {
          if (s.id !== sessionId) return s
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant') {
            msgs[msgs.length - 1] = { ...last, content: `⚠️ ${result?.error || gatewayError}\n\nPlease check your API key in Settings.` }
          }
          return { ...s, messages: msgs }
        }))
        setStreaming(false)
        streamingSessionRef.current = null
        messageSendingRef.current = false
      }
      // If success, stream events (onChunk/onDone/onError) handle the rest
    }).catch((err: Error) => {
      console.error('[OpenClaw] Direct fallback error:', err)
      setSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s
        const msgs = [...s.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, content: `⚠️ ${err.message}\n\nPlease check your API key in Settings.` }
        }
        return { ...s, messages: msgs }
      }))
      setStreaming(false)
      streamingSessionRef.current = null
      messageSendingRef.current = false
    })
  }, [handleStreamDone, handleStreamToken])

  // ── WebSocket connect ────────────────────────────────────────────────────────
  const connect = useCallback(async (source = 'unknown') => {
    if (connectingRef.current) {
      console.log(`[OpenClaw] connect() from "${source}" skipped — already connecting (lock)`)
      return
    }
    const rs = wsRef.current?.readyState
    if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING || rs === WebSocket.CLOSING) {
      console.log(`[OpenClaw] connect() from "${source}" skipped — ws readyState=${rs}`)
      return
    }
    console.log(`[OpenClaw] connect() from "${source}" — proceeding`)
    connectingRef.current = true

    try {
      const url = await window.nyra.openclaw.getWsUrl()
      setWsUrl(url)

      setWsStatus('connecting')
      const ws = new WebSocket(url)
      wsRef.current = ws
      connectingRef.current = false

      ws.onopen = () => {
        setWsStatus('connected')
        // Debounced fetch: only run once even if WS opens multiple times rapidly.
        // Reduced from 200ms → 50ms for faster session list hydration.
        if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
        fetchDebounceRef.current = setTimeout(() => {
          if (!streamingSessionRef.current && !messageSendingRef.current) {
            fetchSessions()
          }
        }, 50)

        // Keepalive ping every 15 s
        if (pingTimer.current) clearInterval(pingTimer.current)
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ jsonrpc: '2.0', id: newId(), method: 'health', params: {} }))
          }
        }, 15_000)

        // Drain offline queue
        if (offlineQueueRef.current.length > 0) {
          const queue = [...offlineQueueRef.current]
          offlineQueueRef.current = []
          setOfflineQueue([])
          for (const msg of queue) {
            const id = newId()
            ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: 'chat.send', params: { sessionKey: msg.sessionId, message: msg.content, deliver: false, ...(msg.attachments?.length ? { attachments: msg.attachments } : {}), idempotencyKey: `queue-${id}` } }))
          }
        }
      }

      ws.onclose = () => {
        setWsStatus('disconnected')
        if (pingTimer.current) clearInterval(pingTimer.current)
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
        // Clean up pending promises on close
        for (const [, p] of pendingRef.current) {
          p.reject(new Error('WebSocket disconnected'))
        }
        pendingRef.current.clear()
        // Always try to reconnect — use longer delay if gateway isn't confirmed ready
        const delay = gatewayReadyRef.current ? 500 : 3000
        reconnectTimer.current = setTimeout(() => connect('ws.onclose-reconnect'), delay)
      }

      ws.onerror = () => setWsStatus('error')

      ws.onmessage = (event) => {
        try {
          const raw = event.data as string
          const msg: IncomingMessage = JSON.parse(raw)

          // Debug: log ALL incoming WS messages (truncated) to trace gateway communication
          const preview = raw.length > 250 ? raw.slice(0, 250) + '…' : raw
          if (msg.result !== 'pong') {
            console.log(`[OpenClaw WS ←] ${preview}`)
          }

          const effectiveMethod = msg.method ?? (msg.type === 'event' ? msg.event : undefined)

          // ── Streaming token — batch via rAF ────────────────────────────────
          if (effectiveMethod === 'session.token' || effectiveMethod === 'stream.token'
            || effectiveMethod === 'message.delta' || effectiveMethod === 'content.delta') {
            const p = (msg.params ?? msg.payload ?? {}) as Record<string, unknown>
            const rawSid = (p.sessionId ?? p.sessionKey ?? p.session_id ?? p.session) as string | undefined
            const sessionId = rawSid ? resolveSessionKey(rawSid, sessionsRef.current, streamingSessionRef.current) : undefined
            const token = (p.token ?? p.content ?? p.text ?? p.delta) as string | undefined
            if (sessionId && token) {
              handleStreamToken(sessionId, token)
            } else {
              console.warn('[OpenClaw WS] Token event missing sessionId or token:', JSON.stringify(p).slice(0, 200))
            }
            return
          }

          // ── Stream done ────────────────────────────────────────────────────
          if (effectiveMethod === 'session.done' || effectiveMethod === 'stream.done'
            || effectiveMethod === 'message.done' || effectiveMethod === 'content.done') {
            const p = (msg.params ?? msg.payload ?? {}) as Record<string, unknown>
            const rawSid = (p.sessionId ?? p.sessionKey ?? p.session_id ?? p.session) as string | undefined
            const sessionId = rawSid ? resolveSessionKey(rawSid, sessionsRef.current, streamingSessionRef.current) : undefined
            if (sessionId) handleStreamDone(sessionId)
            return
          }

          // ── Tool call from AI — route to desktop tools handler ──────────
          if (effectiveMethod === 'tool.call' || effectiveMethod === 'tool_call' || effectiveMethod === 'tool.use') {
            setStreamingPhase('tool-use')
            const p = (msg.params ?? msg.payload ?? {}) as Record<string, unknown>
            const callId   = (p.callId ?? p.call_id ?? p.id) as string
            const toolName = (p.name ?? p.tool ?? p.toolName ?? p.tool_name) as string
            const params   = (p.parameters ?? p.params ?? p.arguments ?? {}) as Record<string, unknown>

            if (callId && toolName && toolCallHandlerRef.current) {
              toolCallHandlerRef.current(callId, toolName, params).then((result) => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  const rpcId = newId()
                  wsRef.current.send(JSON.stringify({
                    jsonrpc: '2.0', id: rpcId,
                    method: 'tool.result',
                    params: { callId: result.callId, result: result.result, error: result.error }
                  }))
                }
              })
            }
            return
          }

          // ── OpenClaw 'agent' event — real-time token streaming ─────────
          // Gateway sends: { type:"event", event:"agent", payload: {
          //   stream: "assistant" | "lifecycle",
          //   data: { text, delta } | { phase: "start"|"end" },
          //   sessionKey, runId, seq } }
          if (effectiveMethod === 'agent') {
            const p = (msg.params ?? msg.payload ?? {}) as Record<string, unknown>
            const stream = p.stream as string | undefined
            const data = p.data as Record<string, unknown> | undefined
            const rawSKey = (p.sessionKey ?? p.sessionId ?? p.session) as string | undefined
            const sKey = rawSKey
              ? resolveSessionKey(rawSKey, sessionsRef.current, streamingSessionRef.current)
              : undefined

            if (sKey && stream === 'assistant' && data?.delta) {
              // Token-by-token streaming — feed delta to the token buffer
              handleStreamToken(sKey, data.delta as string)
            } else if (sKey && stream === 'lifecycle' && data?.phase === 'end') {
              // Agent run completed — finalize the stream
              // (Don't call handleStreamDone here — let the 'chat.final' event do it
              //  so we get the full accumulated text for correctness)
            } else if (sKey && stream === 'lifecycle' && data?.phase === 'error') {
              // Agent run failed — try direct API fallback before showing error
              const errText = (data.error ?? 'Unknown error') as string
              console.warn('[OpenClaw] Agent lifecycle error:', errText, '— trying direct API fallback')
              tryDirectApiFallback(sKey, errText)
            }
            return
          }

          // ── OpenClaw 'chat' event — the main streaming mechanism ──────
          // Gateway sends: { type:"event", event:"chat", payload: { state, sessionKey, message, runId } }
          // state: "delta" | "final" | "aborted" | "error"
          if (effectiveMethod === 'chat') {
            const p = (msg.params ?? msg.payload ?? {}) as Record<string, unknown>
            const state = p.state as string | undefined
            const rawSessionKey = (p.sessionKey ?? p.sessionId ?? p.session) as string | undefined
            // Normalize: gateway uses compound keys like "agent:main:main"
            // but our local sessions use simple keys like "main"
            const sessionKey = rawSessionKey
              ? resolveSessionKey(rawSessionKey, sessionsRef.current, streamingSessionRef.current)
              : undefined
            const message = p.message as Record<string, unknown> | undefined

            if (sessionKey && state === 'delta') {
              // chat.delta carries the FULL accumulated text (not a delta).
              // If we're already streaming via 'agent' events (which send actual deltas),
              // skip this to avoid double-counting. Only use chat.delta as a fallback
              // if agent events aren't being used.
              const text = extractTextFromMessage(message)
              if (text && !streamingSessionRef.current) {
                // Not streaming via agent events — use chat.delta as primary
                handleStreamToken(sessionKey, text)
              }
            } else if (sessionKey && (state === 'final' || state === 'aborted')) {
              // Final message — extract full content and set it
              const text = extractTextFromMessage(message)
              if (text) {
                // Set the full content (not append) since delta may have accumulated
                setSessions(prev => prev.map(s => {
                  if (s.id !== sessionKey) return s
                  const msgs = [...s.messages]
                  const last = msgs[msgs.length - 1]
                  if (last?.role === 'assistant') {
                    // Use full text if longer than what we've accumulated
                    const currentContent = (tokenBufferRef.current.get(sessionKey) ?? '') + (last.content ?? '')
                    if (text.length >= currentContent.length) {
                      msgs[msgs.length - 1] = { ...last, content: text }
                    }
                  }
                  return { ...s, messages: msgs }
                }))
              }
              handleStreamDone(sessionKey)
            } else if (sessionKey && state === 'error') {
              const errMsg = (p.errorMessage ?? 'Unknown error') as string
              console.warn('[OpenClaw] Chat error event:', errMsg, '— trying direct API fallback')
              // Don't show the error yet — try direct API fallback first.
              // The agent lifecycle handler may have already started the fallback,
              // so check if we're still streaming (fallback in progress).
              if (!streamingSessionRef.current) {
                // No fallback running — try now
                tryDirectApiFallback(sessionKey, errMsg)
              }
              // If fallback is already running, let it handle the response
            }
            return
          }

          // ── Catch-all: any event with session + content-like fields ──────
          if (effectiveMethod && msg.type === 'event') {
            const p = (msg.params ?? msg.payload ?? {}) as Record<string, unknown>
            const rawSid = (p.sessionId ?? p.sessionKey ?? p.session_id ?? p.session) as string | undefined
            const sid = rawSid ? resolveSessionKey(rawSid, sessionsRef.current, streamingSessionRef.current) : undefined
            const tok = (p.token ?? p.content ?? p.text ?? p.delta) as string | undefined
            if (sid && tok && streamingSessionRef.current === sid) {
              console.log(`[OpenClaw WS] Catch-all token from event "${effectiveMethod}"`)
              handleStreamToken(sid, tok)
              return
            }
          }

          // Ping pong — ignore
          if (msg.result === 'pong') return

          // ── RPC response ──────────────────────────────────────────────────
          if (msg.id) {
            const pending = pendingRef.current.get(msg.id)
            if (!pending) return
            pendingRef.current.delete(msg.id)
            if (msg.error) pending.reject(new Error(msg.error.message))
            else pending.resolve(msg.result)
          }
        } catch (e) {
          console.warn('[OpenClaw WS] Parse error:', e)
        }
      }
    } catch (err) {
      connectingRef.current = false
      console.error('[OpenClaw] connect error:', err)
    }
  }, [flushTokens, handleStreamToken, handleStreamDone])

  // ── JSON-RPC helper ──────────────────────────────────────────────────────────
  const rpc = useCallback(<T>(method: string, params?: unknown, timeoutMs = 15_000): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }
      const id = newId()

      // Safety timeout — prevent indefinite hangs if response never arrives
      const timer = setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id)
          reject(new Error(`RPC timeout: ${method} (${timeoutMs}ms)`))
        }
      }, timeoutMs)

      pendingRef.current.set(id, {
        resolve: (v: unknown) => { clearTimeout(timer); resolve(v as T) },
        reject:  (e: Error)   => { clearTimeout(timer); reject(e) },
      })
      wsRef.current.send(JSON.stringify({ jsonrpc: '2.0', id, method, params } satisfies RpcRequest))
    })
  }, [])

  // ── Fetch sessions ────────────────────────────────────────────────────────────
  // v4: Only updates `sessions` — activeSession derives automatically.
  //     NEVER touches activeSessionId or activeSession directly.
  const fetchSessions = useCallback(async () => {
    if (messageSendingRef.current) {
      console.log('[OpenClaw] fetchSessions skipped — message send in flight')
      return []
    }
    try {
      const result = await rpc<Record<string, unknown>>('sessions.list')
      console.log('[OpenClaw] sessions.list result:', JSON.stringify(result).slice(0, 500))
      if (messageSendingRef.current) {
        console.log('[OpenClaw] fetchSessions result discarded — message send started during RPC')
        return []
      }
      // Accept sessions from various response shapes
      const rawSessions = (result?.sessions ?? result?.data ?? result?.items ?? (Array.isArray(result) ? result : [])) as Array<Record<string, unknown>>
      const mapped: Session[] = rawSessions.map((s: Record<string, unknown>) => {
        // Gateway uses compound keys like "agent:main:main".
        // Extract the simple key (middle segment) for our local session id,
        // but keep the full key as a fallback reference.
        const fullKey = (s.key ?? s.sessionKey ?? s.sessionId ?? s.id ?? '') as string
        const parts = fullKey.split(':')
        const simpleKey = parts.length >= 2 ? parts[1] : fullKey
        return {
          id: simpleKey || fullKey,
          title: ((s.label ?? s.title) as string) || 'New chat',
          model: s.model as string | undefined,
          updatedAt: (s.updatedAt as number) ?? Date.now(),
          messages: []
        }
      })
      setSessions(prev => {
        // Merge server sessions with local state. NEVER drop messages.
        // Build map keeping the entry with the MOST messages for each ID
        // (guards against duplicate IDs from race conditions).
        const existingMap = new Map<string, Session>()
        for (const s of prev) {
          const existing = existingMap.get(s.id)
          if (!existing || s.messages.length > existing.messages.length) {
            existingMap.set(s.id, s)
          }
        }
        const merged = mapped.map(newS => {
          const ex = existingMap.get(newS.id)
          if (ex) {
            existingMap.delete(newS.id)
            return { ...newS, pinned: ex.pinned, color: ex.color, tags: ex.tags, systemPrompt: ex.systemPrompt, model: ex.model ?? newS.model, messages: ex.messages }
          }
          return newS
        })
        // Keep local-only sessions that have messages
        for (const [, localSession] of existingMap) {
          if (localSession.messages.length > 0) {
            merged.push(localSession)
          }
        }
        return merged
      })
      // v4: No setActiveSession call at all! activeSession derives from sessions.
      return mapped
    } catch { return [] }
  }, [rpc])

  // ── Load session history ──────────────────────────────────────────────────────
  // v4: Only updates sessions array
  const loadSessionHistory = useCallback(async (sessionId: string) => {
    try {
      const result = await rpc<{ messages: Array<{ role: string; content: string; id: string; timestamp: number }> }>('chat.history', { sessionKey: sessionId, limit: 200 })
      const messages: ChatMessage[] = (result?.messages ?? []).map(m => ({
        id: m.id ?? String(Date.now()), role: m.role as 'user' | 'assistant',
        content: m.content, timestamp: m.timestamp ?? Date.now()
      }))
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages } : s))
      return messages
    } catch { return [] }
  }, [rpc])

  // ── Create session ────────────────────────────────────────────────────────────
  // v4: Adds to sessions array + sets activeSessionId
  const createSession = useCallback(async (opts?: {
    model?: string; incognito?: boolean; systemPrompt?: string
    projectId?: string; branchedFrom?: string
  }): Promise<Session> => {
    // OpenClaw doesn't have sessions.create — use sessions.reset to clear
    // the current session, or just create a local session with 'main' key.
    // New sessions are implicitly created by chat.send with a sessionKey.
    const sessionKey = 'main'
    try {
      await rpc('sessions.reset', { key: sessionKey })
    } catch {
      // sessions.reset may fail if no session exists yet — that's fine
    }
    const session: Session = {
      id: sessionKey, title: 'New chat', updatedAt: Date.now(), messages: [],
      model: opts?.model, incognito: opts?.incognito, systemPrompt: opts?.systemPrompt,
      projectId: opts?.projectId, branchedFrom: opts?.branchedFrom, pinned: false
    }
    setSessions(prev => prev.map(s => s.id === sessionKey ? session : s).concat(
      prev.some(s => s.id === sessionKey) ? [] : [session]
    ))
    setActiveSessionId(session.id)
    return session
  }, [rpc])

  // ── Select session ────────────────────────────────────────────────────────────
  const selectSession = useCallback(async (sessionId: string) => {
    const found = sessionsRef.current.find(s => s.id === sessionId)
    if (found) {
      setActiveSessionId(sessionId)
      if (found.messages.length === 0) await loadSessionHistory(sessionId)
    }
  }, [loadSessionHistory])

  // ── Send message (with offline queue + local fallback) ─────────────────────
  const sendMessage = useCallback(async (
    content: string,
    attachments?: ChatMessage['attachments'],
    model?: string
  ): Promise<void> => {
    // Read current active session from refs (not stale closure)
    const currentId = activeSessionIdRef.current
    let session = currentId ? sessionsRef.current.find(s => s.id === currentId) ?? null : null

    // If no active session, create one locally using 'main' as the session key.
    // OpenClaw doesn't have sessions.create — sessions are implicitly created
    // when you send chat.send with a new sessionKey. The default key is 'main'.
    if (!session) {
      const sessionKey = 'main'
      session = {
        id: sessionKey, title: content.slice(0, 45), updatedAt: Date.now(), messages: [],
        pinned: false, color: 'none' as SessionColor, tags: [],
      }
      setSessions(prev => {
        // Don't create a duplicate if 'main' already exists
        if (prev.some(s => s.id === sessionKey)) return prev
        return [session!, ...prev]
      })
      setActiveSessionId(sessionKey)
      activeSessionIdRef.current = sessionKey
    }

    const userMsg: ChatMessage      = { id: `user-${Date.now()}`, role: 'user', content, timestamp: Date.now(), attachments }
    const assistantMsg: ChatMessage = { id: `asst-${Date.now()}`, role: 'assistant', content: '', timestamp: Date.now() }

    // Guard: prevent fetchSessions from overwriting local state during send
    messageSendingRef.current = true

    // v4: Only update sessions array — activeSession derives automatically
    const sessionId = session.id
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s
      return {
        ...s,
        messages: [...s.messages, userMsg, assistantMsg],
        title: s.messages.length === 0 ? content.slice(0, 45) : s.title,
        updatedAt: Date.now()
      }
    }))
    setActiveSessionId(sessionId)
    setStreaming(true)
    setStreamingPhase('thinking')    // Start in thinking phase — will switch to generating on first non-thinking token
    streamingSessionRef.current = sessionId

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('[OpenClaw] WS not connected — queuing message')
      offlineQueueRef.current.push({ content, sessionId, attachments, model: model || session.model })
      setOfflineQueue([...offlineQueueRef.current])
      handleStreamToken(sessionId, '⏳ Gateway not connected. Message queued — it will be sent automatically when the connection is restored.')
      // Reset send guard immediately — no streaming to protect in offline path
      messageSendingRef.current = false
      handleStreamDone(sessionId)
      return
    }

    // Safety timeout — auto-clear streaming after 20s (reduced from 30s for snappier UX).
    // If no tokens arrive at all, the user shouldn't stare at a spinner for 30s.
    if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current)
    streamTimeoutRef.current = setTimeout(() => {
      if (streamingSessionRef.current) {
        console.warn('[OpenClaw] Streaming safety timeout (20s) — clearing')
        // Add a fallback message so the user knows what happened
        setSessions(prev => prev.map(s => {
          if (s.id !== sessionId) return s
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant' && last.content === '') {
            msgs[msgs.length - 1] = { ...last, content: '⏳ No response received. The model may be loading or the gateway may need a restart. Try sending your message again.' }
          }
          return { ...s, messages: msgs }
        }))
        setStreaming(false)
        streamingSessionRef.current = null
        messageSendingRef.current = false
      }
    }, 20_000)

    // Fire-and-forget: Many gateways only respond via streaming events
    // (session.token / session.done), NOT with a direct RPC response.
    // Using rpc() here would always timeout because no { type:"res" } comes back.
    // Instead, send the request directly and let streaming events handle the flow.
    try {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not connected')
      }
      const chatId = String(rpcIdCounter++)
      // OpenClaw gateway params for chat.send
      // Format: { sessionKey, message, deliver?, idempotencyKey?, attachments? }
      // NOTE: model is NOT sent per-message — it's configured via auth-profiles.
      // Sending 'model' causes gateway error: "unexpected property 'model'"
      const chatParams: Record<string, unknown> = {
        sessionKey: sessionId,
        message: content,
        deliver: false,
        idempotencyKey: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...(attachments?.length ? { attachments } : {}),
      }
      console.log(`[OpenClaw] Sending chat.send (id=${chatId}, session=${sessionId}):`, JSON.stringify(chatParams).slice(0, 200))
      wsRef.current.send(JSON.stringify({
        jsonrpc: '2.0',
        id: chatId,
        method: 'chat.send',
        params: chatParams
      }))

      // Register a pending resolver so that IF the gateway sends a direct
      // { type:"res" } response (non-streaming mode), we capture the content.
      // Without this, direct replies show as blank assistant messages.
      pendingRef.current.set(chatId, {
        resolve: (v: unknown) => {
          const r = v as Record<string, unknown> | null
          console.log('[OpenClaw] chat.send response:', JSON.stringify(r).slice(0, 300))
          // Extract content from various possible response shapes
          const fullContent = (r?.content ?? r?.message ?? r?.text ??
            (r?.payload as Record<string, unknown>)?.content) as string | undefined
          if (fullContent) {
            // Gateway returned full response directly — inject into assistant msg
            setSessions(prev => prev.map(s => {
              if (s.id !== sessionId) return s
              const msgs = [...s.messages]
              const last = msgs[msgs.length - 1]
              if (last?.role === 'assistant') {
                msgs[msgs.length - 1] = { ...last, content: last.content + fullContent }
              }
              return { ...s, messages: msgs }
            }))
            handleStreamDone(sessionId)
          }
          // If no content, this was just an ack — streaming events will follow
        },
        reject: (err: Error) => {
          // Gateway explicitly rejected chat.send — try direct API fallback
          // before showing an error to the user.
          console.warn('[OpenClaw] chat.send REJECTED:', err.message, '— trying direct API fallback')

          // Attempt direct streaming bypass
          const fallbackStreamId = `direct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          const originalMessages = sessionsRef.current.find(s => s.id === sessionId)?.messages ?? []
          const chatMessages = originalMessages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .filter(m => m.content) // Skip empty assistant placeholder
            .map(m => ({ role: m.role, content: m.content }))

          if (window.nyra?.streaming?.directStream && chatMessages.length > 0) {
            console.log('[OpenClaw] Falling back to direct API stream (bypassing gateway)')
            // Clear the timeout — we're retrying
            if (streamTimeoutRef.current) { clearTimeout(streamTimeoutRef.current); streamTimeoutRef.current = null }

            // Keep streamingSessionRef pointed at this session
            streamingSessionRef.current = sessionId

            window.nyra.streaming.directStream({
              streamId: fallbackStreamId,
              messages: chatMessages,
              maxTokens: 4096,
              temperature: 0.7,
            }).then((result: any) => {
              if (!result?.success) {
                console.error('[OpenClaw] Direct fallback also failed:', result?.error)
                setSessions(prev => prev.map(s => {
                  if (s.id !== sessionId) return s
                  const msgs = [...s.messages]
                  const last = msgs[msgs.length - 1]
                  if (last?.role === 'assistant' && (last.content === '' || !last.content)) {
                    msgs[msgs.length - 1] = { ...last, content: `⚠️ ${result?.error || err.message}\n\nPlease check your API key in Settings.` }
                  }
                  return { ...s, messages: msgs }
                }))
                handleStreamDone(sessionId)
              }
              // If success, streaming events (stream:chunk, stream:done) will handle the rest
            }).catch((fallbackErr: Error) => {
              console.error('[OpenClaw] Direct fallback error:', fallbackErr)
              setSessions(prev => prev.map(s => {
                if (s.id !== sessionId) return s
                const msgs = [...s.messages]
                const last = msgs[msgs.length - 1]
                if (last?.role === 'assistant' && (last.content === '' || !last.content)) {
                  msgs[msgs.length - 1] = { ...last, content: `⚠️ ${fallbackErr.message}\n\nPlease check your API key in Settings.` }
                }
                return { ...s, messages: msgs }
              }))
              handleStreamDone(sessionId)
            })
          } else {
            // No direct fallback available — show the original error
            setSessions(prev => prev.map(s => {
              if (s.id !== sessionId) return s
              const msgs = [...s.messages]
              const last = msgs[msgs.length - 1]
              if (last?.role === 'assistant' && last.content === '') {
                msgs[msgs.length - 1] = { ...last, content: `⚠️ Gateway error: ${err.message}\n\nThis usually means the session or model isn't recognized. Try starting a new chat.` }
              }
              return { ...s, messages: msgs }
            }))
            handleStreamDone(sessionId)
          }
        },
      })
      setTimeout(() => { pendingRef.current.delete(chatId) }, 30_000)
    } catch (err) {
      console.error('[OpenClaw] chat.send error:', err)
      // Show error to user as assistant response
      handleStreamToken(sessionId, `⚠️ Failed to send: ${(err as Error).message}`)
      setStreaming(false)
      streamingSessionRef.current = null
      messageSendingRef.current = false
      if (streamTimeoutRef.current) { clearTimeout(streamTimeoutRef.current); streamTimeoutRef.current = null }
    }
  }, [rpc, handleStreamDone, handleStreamToken])

  // ── Pin / unpin ────────────────────────────────────────────────────────────────
  // v4: All session mutations only touch sessions array
  const pinSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, pinned: !s.pinned } : s))
  }, [])

  const setSessionColor = useCallback((sessionId: string, color: SessionColor) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, color } : s))
  }, [])

  const setSessionSystemPrompt = useCallback((sessionId: string, prompt: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, systemPrompt: prompt } : s))
  }, [])

  const setSessionModel = useCallback(async (sessionId: string, model: string) => {
    // 1. Update local UI state immediately for responsiveness
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, model } : s))

    // 2. Translate UI model ID → OpenClaw format (e.g. "openai/gpt-5.4" → "openai-codex/gpt-5.4")
    const MODEL_PREFIX_MAP: Record<string, string> = {
      openai: 'openai-codex', gemini: 'google-gemini', copilot: 'github-copilot',
    }
    let openclawModel = model
    if (model !== 'auto' && model.includes('/')) {
      const [prefix, ...rest] = model.split('/')
      const mapped = MODEL_PREFIX_MAP[prefix]
      if (mapped) openclawModel = `${mapped}/${rest.join('/')}`
    }

    // 3. Patch the gateway session — THIS is the correct way to switch models.
    //    sessions.patch sets modelOverride/providerOverride on the session entry,
    //    which the gateway uses for all subsequent chat.send calls on this session.
    if (model !== 'auto') {
      try {
        await rpc('sessions.patch', { key: sessionId, model: openclawModel })
        console.log(`[OpenClaw] ✅ Model switched via sessions.patch: ${model} → ${openclawModel} (session=${sessionId})`)
      } catch (err) {
        console.warn('[OpenClaw] sessions.patch failed, falling back to auth-profiles:', err)
      }
    }

    // 4. Also update auth-profiles as a fallback (for new sessions / default model)
    try {
      await window.nyra?.providers?.switchModel(model)
    } catch { /* best effort */ }
  }, [rpc])

  const renameSession = useCallback((sessionId: string, title: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s))
  }, [])

  const deleteSession = useCallback(async (sessionId: string) => {
    try { await rpc('sessions.delete', { sessionKey: sessionId }) } catch { /* gateway may not support */ }
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    // If the deleted session was active, clear the pointer
    setActiveSessionId(prev => prev === sessionId ? null : prev)
  }, [rpc])

  // ── Branch (fork) session ─────────────────────────────────────────────────────
  const branchSession = useCallback(async (fromSessionId: string, fromMsgIndex: number): Promise<Session> => {
    const source = sessionsRef.current.find(s => s.id === fromSessionId)
    if (!source) throw new Error('Session not found')
    // OpenClaw doesn't have sessions.create — create a local branch with a unique key
    const branchKey = `branch-${Date.now()}`
    const session: Session = {
      id: branchKey,
      title: `↗ ${source.title.slice(0, 35)}`,
      updatedAt: Date.now(),
      messages: source.messages.slice(0, fromMsgIndex + 1),
      model: source.model,
      systemPrompt: source.systemPrompt,
      branchedFrom: fromSessionId,
      projectId: source.projectId,
      pinned: false
    }
    setSessions(prev => [session, ...prev])
    setActiveSessionId(session.id)
    return session
  }, [])

  // ── Export to Markdown ────────────────────────────────────────────────────────
  const exportSessionMarkdown = useCallback((session: Session): string => {
    const lines = [
      `# ${session.title}`,
      `> Exported from Nyra Desktop · ${new Date(session.updatedAt).toLocaleString()}`,
      session.systemPrompt ? `\n**System Prompt:** ${session.systemPrompt}\n` : '',
      ''
    ]
    for (const msg of session.messages) {
      const role = msg.role === 'user' ? '**You**' : '**Nyra**'
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      lines.push(`### ${role} · ${time}`, msg.content, '')
    }
    return lines.join('\n')
  }, [])

  // ── Global search ─────────────────────────────────────────────────────────────
  const searchSessions = useCallback((query: string): Array<{ session: Session; matchedMsg?: ChatMessage; score: number }> => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const results: Array<{ session: Session; matchedMsg?: ChatMessage; score: number }> = []
    for (const s of sessionsRef.current) {
      const titleMatch = (s.title || '').toLowerCase().includes(q)
      if (titleMatch) results.push({ session: s, score: 2 })
      for (const m of s.messages) {
        if (m.content.toLowerCase().includes(q)) {
          results.push({ session: s, matchedMsg: m, score: 1 })
          break
        }
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 20)
  }, [])

  // ── Tool call handler registration ────────────────────────────────────────────
  const setToolCallHandler = useCallback((handler: ((callId: string, toolName: string, params: Record<string, unknown>) => Promise<{ callId: string; result?: unknown; error?: string }>) | null) => {
    toolCallHandlerRef.current = handler
  }, [])

  const registerTools = useCallback(async (tools: ReadonlyArray<{ name: string; description: string; parameters: unknown }>) => {
    try {
      await rpc('tools.register', { tools })
      console.log('[OpenClaw] Registered', tools.length, 'desktop tools')
    } catch (err) {
      console.warn('[OpenClaw] tools.register not supported:', err)
    }
  }, [rpc])

  // ── Fetch dynamic model catalog from gateway ─────────────────────────────────
  const fetchModelCatalog = useCallback(async (): Promise<Array<{ id: string; name: string; provider: string; contextWindow?: number; reasoning?: boolean }>> => {
    try {
      // Try gateway RPC first (most accurate, includes all configured providers)
      const catalog = await rpc<Array<{ id: string; name: string; provider: string; contextWindow?: number; reasoning?: boolean }>>('models.list', {})
      if (Array.isArray(catalog) && catalog.length > 0) {
        console.log(`[OpenClaw] Fetched ${catalog.length} models from gateway`)
        return catalog
      }
    } catch (err) {
      console.warn('[OpenClaw] models.list RPC failed, trying IPC fallback:', err)
    }
    // Fallback: IPC to main process (which also calls gateway via separate WS)
    try {
      const catalog = await window.nyra?.openclaw?.modelCatalog?.()
      if (Array.isArray(catalog) && catalog.length > 0) {
        console.log(`[OpenClaw] Fetched ${catalog.length} models via IPC`)
        return catalog
      }
    } catch {
      console.warn('[OpenClaw] IPC model catalog fallback failed')
    }
    return [] // empty = use hardcoded fallback in ModelSelector
  }, [rpc])

  // ── Patch session config (model, thinking level, etc.) ──────────────────────
  const patchSession = useCallback(async (sessionId: string, patch: Record<string, unknown>) => {
    try {
      return await rpc('sessions.patch', { key: sessionId, ...patch })
    } catch (err) {
      console.warn('[OpenClaw] sessions.patch failed:', err)
      return null
    }
  }, [rpc])

  // ── Wizard RPC methods (onboarding flow) ─────────────────────────────────────
  const wizardStart = useCallback(async (mode: 'local' | 'remote' = 'local', workspace?: string) => {
    try {
      return await rpc<{ sessionId: string; done: boolean; step?: WizardStep; status?: string; error?: string }>(
        'wizard.start', { mode, ...(workspace ? { workspace } : {}) }
      )
    } catch (err) {
      console.warn('[OpenClaw] wizard.start failed:', err)
      return { sessionId: '', done: true, error: String(err) }
    }
  }, [rpc])

  const wizardNext = useCallback(async (sessionId: string, answer?: { stepId?: string; value?: unknown }) => {
    try {
      return await rpc<{ done: boolean; step?: WizardStep; status?: string; error?: string }>(
        'wizard.next', { sessionId, ...(answer ? { answer } : {}) }
      )
    } catch (err) {
      console.warn('[OpenClaw] wizard.next failed:', err)
      return { done: true, error: String(err) }
    }
  }, [rpc])

  const wizardCancel = useCallback(async (sessionId: string) => {
    try {
      return await rpc<{ status: string; error?: string }>('wizard.cancel', { sessionId })
    } catch (err) {
      console.warn('[OpenClaw] wizard.cancel failed:', err)
      return { status: 'error', error: String(err) }
    }
  }, [rpc])

  // ── Config RPC methods ──────────────────────────────────────────────────────
  const configGet = useCallback(async () => {
    try {
      return await rpc<{ config: Record<string, unknown>; schema: Record<string, unknown>; hash: string }>('config.get', {})
    } catch (err) {
      console.warn('[OpenClaw] config.get failed:', err)
      return null // config read failures are expected when gateway is offline
    }
  }, [rpc])

  const configPatch = useCallback(async (raw: string, options?: { sessionKey?: string; note?: string }) => {
    try {
      return await rpc<{ ok: boolean; config: Record<string, unknown>; path: string }>('config.patch', { raw, ...options })
    } catch (err) {
      console.warn('[OpenClaw] config.patch failed:', err)
      throw new Error(`Config patch failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [rpc])

  // ── Channel status ──────────────────────────────────────────────────────────
  const channelsStatus = useCallback(async () => {
    try {
      return await rpc<Record<string, unknown>>('channels.status', {})
    } catch (err) {
      console.warn('[OpenClaw] channels.status failed:', err)
      return null // status read failures are expected when gateway is offline
    }
  }, [rpc])

  // ── Gateway restart ───────────────────────────────────────────────────────────
  const restart = useCallback(() => {
    wsRef.current?.close()
    window.nyra.openclaw.restart()
  }, [])

  // ── Soft reconnect (close WS so it auto-reconnects with new config) ─────────
  // Used after model switch — forces any active stream to end cleanly first,
  // preventing stale streaming state from leaking into the new connection.
  const reconnect = useCallback(() => {
    console.log('[OpenClaw] Soft reconnect — closing WS to pick up new config')

    // Force-end any active stream so the new connection starts with a clean slate
    if (streamingSessionRef.current) {
      const staleSessionId = streamingSessionRef.current
      console.log('[OpenClaw] Ending stale stream for session', staleSessionId, 'before reconnect')
      // Append notice to the last assistant message so the user knows what happened
      setSessions(prev => prev.map(s => {
        if (s.id !== staleSessionId) return s
        const msgs = [...s.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, content: last.content + '\n\n*[Model switched — reconnecting...]*' }
        }
        return { ...s, messages: msgs }
      }))
      setStreaming(false)
      setStreamingPhase(null)
      streamingSessionRef.current = null
      messageSendingRef.current = false
      if (streamTimeoutRef.current) { clearTimeout(streamTimeoutRef.current); streamTimeoutRef.current = null }
    }

    wsRef.current?.close()
    // The onclose handler will auto-reconnect in 500ms with fresh auth-profiles
  }, [])

  // ── v4: Compatibility shim — setActiveSession that works with the old API ────
  // Some external callers (App.tsx) may call setActiveSession(session).
  // We translate that to setActiveSessionId(session.id) + ensure session is in array.
  const setActiveSession = useCallback((sessionOrNull: Session | null) => {
    if (!sessionOrNull) {
      setActiveSessionId(null)
    } else {
      // Make sure the session exists in the array
      setSessions(prev => {
        if (prev.some(s => s.id === sessionOrNull.id)) return prev
        return [sessionOrNull, ...prev]
      })
      setActiveSessionId(sessionOrNull.id)
    }
  }, [])

  // ── Main process status listeners ─────────────────────────────────────────────
  useEffect(() => {
    const cleanups: Array<() => void> = []

    const mapStatus = (s: string): GatewayStatus =>
      s === 'running'    ? 'ready' :
      s === 'checking'   ? 'checking' :
      s === 'installing' ? 'installing' :
      s === 'starting'   ? 'starting' :
      s === 'error'      ? 'error' : 'idle'

    window.nyra.openclaw.getStatus().then((s: string) => {
      setStatus(mapStatus(s))
      if (s === 'running') {
        gatewayReadyRef.current = true
        connect('getStatus.then')
      }
    }).catch(() => {})

    cleanups.push(window.nyra.openclaw.onStatusChange((s: string) => {
      const mapped = mapStatus(s)
      setStatus(mapped)
      if (s === 'running') {
        gatewayReadyRef.current = true
        connect('onStatusChange')
      } else if (s === 'stopped' || s === 'error') {
        gatewayReadyRef.current = false
      }
    }))

    cleanups.push(window.nyra.openclaw.onLog?.((line: string)        => setLog(line)))
    cleanups.push(window.nyra.openclaw.onInstallLog?.((line: string) => setLog(line)))
    cleanups.push(window.nyra.openclaw.onReady(() => {
      setStatus('ready')
      gatewayReadyRef.current = true
      connect('onReady')
    }))
    cleanups.push(window.nyra.openclaw.onError?.((msg: string) => { setStatus('error'); setLog(msg) }))

    // ── Direct stream event listeners (for gateway fallback) ─────────────
    // When the direct API fallback fires, it uses IPC stream events instead of
    // WebSocket. These listeners route those events into the session state.
    if (window.nyra?.streaming) {
      cleanups.push(window.nyra.streaming.onChunk?.((data: any) => {
        const sid = streamingSessionRef.current
        if (sid && data.content) {
          handleStreamToken(sid, data.content)
        }
        if (data.done && sid) {
          handleStreamDone(sid)
        }
      }))
      cleanups.push(window.nyra.streaming.onDone?.((data: any) => {
        const sid = streamingSessionRef.current
        if (sid) handleStreamDone(sid)
      }))
      cleanups.push(window.nyra.streaming.onError?.((data: any) => {
        const sid = streamingSessionRef.current
        if (sid) {
          setSessions(prev => prev.map(s => {
            if (s.id !== sid) return s
            const msgs = [...s.messages]
            const last = msgs[msgs.length - 1]
            if (last?.role === 'assistant' && (last.content === '' || !last.content)) {
              msgs[msgs.length - 1] = { ...last, content: `⚠️ ${data.error}\n\nPlease check your API key in Settings.` }
            }
            return { ...s, messages: msgs }
          }))
          handleStreamDone(sid)
        }
      }))
    }

    // NOTE: Do NOT call connect('useEffect-direct') here — we wait for the
    // gateway to report 'running' before attempting to connect. Connecting
    // prematurely starts a fast connect/disconnect loop against the proxy
    // because the gateway isn't listening yet on port 18789.

    // Single safety fallback: if after 12 s the gateway hasn't reported
    // 'running' via events (IPC drop, timing issue), try once.
    const safetyTimer = setTimeout(() => {
      if (!gatewayReadyRef.current) {
        console.log('[OpenClaw] Safety fallback at 12s — trying connect')
        connect('safety-fallback-12s')
      }
    }, 12_000)

    return () => {
      clearTimeout(safetyTimer)
      wsRef.current?.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pingTimer.current) clearInterval(pingTimer.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current)
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
      // Scoped cleanup — only removes THIS hook's listeners, not SettingsPanel's
      cleanups.forEach(fn => fn?.())
    }
  }, [connect])

  return {
    // State
    status, log, wsUrl, wsStatus, connected: (wsStatus === 'connected'), streaming, streamingPhase, sessions, activeSession, offlineQueue,
    // Core
    sendMessage, selectSession, createSession, fetchSessions, setActiveSession,
    // Session management
    pinSession, setSessionColor, setSessionSystemPrompt, setSessionModel,
    renameSession, deleteSession, branchSession,
    // Export / search
    exportSessionMarkdown, searchSessions,
    // Gateway
    restart, reconnect,
    // Model catalog + session patching
    fetchModelCatalog, patchSession,
    // Wizard (onboarding)
    wizardStart, wizardNext, wizardCancel,
    // Config + channels
    configGet, configPatch, channelsStatus,
    // Desktop tools
    setToolCallHandler, registerTools,
  }
}
