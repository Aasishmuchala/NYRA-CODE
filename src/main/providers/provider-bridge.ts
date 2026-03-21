/**
 * Provider Bridge — backwards-compatible replacement for callAgentLLM()
 *
 * This is the bridge between the old agent-llm-client.ts (wsproxy) and
 * the new Provider Abstraction Layer. The orchestrator calls this instead
 * of the old callAgentLLM().
 *
 * Responsibilities:
 * - Route agent requests to appropriate provider
 * - Handle fallback logic (preferredModel → fallbackModel → any available)
 * - Convert agent definition to chat request
 * - Support both non-streaming and streaming responses
 */

import { providerRegistry } from './provider-registry'
import type { AgentDefinition } from '../agent-registry'
import type {
  ChatRequest, ChatResponse, ContentBlock, ComputerUseTool,
} from './provider-interface'

/**
 * Error handling wrapper for provider errors.
 */
class AgentLLMError extends Error {
  constructor(
    public readonly agentId: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(`[Agent ${agentId}] ${message}`)
    this.name = 'AgentLLMError'
  }
}

/**
 * Call an agent's LLM with a user message, using the Provider Abstraction Layer.
 *
 * Flow:
 * 1. Get agent definition
 * 2. Try preferred model first
 * 3. On failure, try fallback model
 * 4. On failure, try any available provider
 * 5. Return response or throw error
 *
 * @param agent Agent definition with model preferences
 * @param userMessage User input for the agent
 * @returns LLM response content
 * @throws AgentLLMError if all attempts fail
 */
export async function callAgentLLMV2(
  agent: AgentDefinition,
  userMessage: string,
): Promise<string> {
  const systemPrompt = agent.systemPrompt
  const preferredModel = agent.preferredModel
  const fallbackModel = agent.fallbackModel

  // Try preferred model first
  try {
    const response = await chatWithModel(
      preferredModel,
      systemPrompt,
      userMessage,
      agent.tokenBudget
    )
    console.log(`[AgentLLM] ${agent.name} completed with ${preferredModel}`)
    return response.content
  } catch (err) {
    console.warn(
      `[AgentLLM] ${agent.name} failed with preferred model ${preferredModel}:`,
      err
    )
  }

  // Try fallback model
  if (fallbackModel && fallbackModel !== preferredModel) {
    try {
      const response = await chatWithModel(
        fallbackModel,
        systemPrompt,
        userMessage,
        agent.tokenBudget
      )
      console.log(`[AgentLLM] ${agent.name} completed with fallback ${fallbackModel}`)
      return response.content
    } catch (err) {
      console.warn(
        `[AgentLLM] ${agent.name} failed with fallback model ${fallbackModel}:`,
        err
      )
    }
  }

  // Try any available provider
  try {
    const provider = providerRegistry.findBestProvider({
      requiresLocal: false, // Prefer cloud for agents
    })

    if (!provider) {
      throw new AgentLLMError(
        agent.id,
        'No available providers for agent'
      )
    }

    const models = await provider.listModels()
    if (models.length === 0) {
      throw new AgentLLMError(
        agent.id,
        `No models available from ${provider.name}`
      )
    }

    const model = models[0].id
    const response = await chatWithModel(
      model,
      systemPrompt,
      userMessage,
      agent.tokenBudget
    )
    console.log(`[AgentLLM] ${agent.name} completed with fallback provider ${provider.name}`)
    return response.content
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new AgentLLMError(
      agent.id,
      `All LLM attempts failed: ${message}`,
      err instanceof Error ? err : undefined
    )
  }
}

/**
 * Streaming version of callAgentLLM for progressive response generation.
 *
 * @param agent Agent definition with model preferences
 * @param userMessage User input for the agent
 * @yields Response chunks as they arrive
 * @throws AgentLLMError if all attempts fail
 */
export async function* callAgentLLMStream(
  agent: AgentDefinition,
  userMessage: string,
): AsyncGenerator<string> {
  const systemPrompt = agent.systemPrompt
  const preferredModel = agent.preferredModel
  const fallbackModel = agent.fallbackModel

  // Try preferred model first
  try {
    for await (const chunk of streamChatWithModel(
      preferredModel,
      systemPrompt,
      userMessage,
      agent.tokenBudget
    )) {
      yield chunk
    }
    console.log(`[AgentLLM] ${agent.name} streamed with ${preferredModel}`)
    return
  } catch (err) {
    console.warn(
      `[AgentLLM] ${agent.name} failed streaming with preferred model ${preferredModel}:`,
      err
    )
  }

  // Try fallback model
  if (fallbackModel && fallbackModel !== preferredModel) {
    try {
      for await (const chunk of streamChatWithModel(
        fallbackModel,
        systemPrompt,
        userMessage,
        agent.tokenBudget
      )) {
        yield chunk
      }
      console.log(`[AgentLLM] ${agent.name} streamed with fallback ${fallbackModel}`)
      return
    } catch (err) {
      console.warn(
        `[AgentLLM] ${agent.name} failed streaming with fallback model ${fallbackModel}:`,
        err
      )
    }
  }

  // Try any available provider
  try {
    const provider = providerRegistry.findBestProvider({
      requiresLocal: false,
    })

    if (!provider) {
      throw new AgentLLMError(
        agent.id,
        'No available providers for agent'
      )
    }

    const models = await provider.listModels()
    if (models.length === 0) {
      throw new AgentLLMError(
        agent.id,
        `No models available from ${provider.name}`
      )
    }

    const model = models[0].id
    for await (const chunk of streamChatWithModel(
      model,
      systemPrompt,
      userMessage,
      agent.tokenBudget
    )) {
      yield chunk
    }
    console.log(`[AgentLLM] ${agent.name} streamed with fallback provider ${provider.name}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new AgentLLMError(
      'unknown',
      `All streaming attempts failed: ${message}`,
      err instanceof Error ? err : undefined
    )
  }
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Chat with a specific model identifier (e.g. 'openai/gpt-4o').
 */
async function chatWithModel(
  modelId: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<ChatResponse> {
  // Parse model ID: "provider/model" or just "model"
  const [providerId, modelName] = modelId.includes('/')
    ? modelId.split('/')
    : [extractProviderFromModel(modelId), modelId]

  const provider = providerRegistry.get(providerId)
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`)
  }

  if (!provider.isAvailable()) {
    throw new Error(`Provider not available: ${providerId}`)
  }

  const request: ChatRequest = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    model: modelName,
    maxTokens,
    temperature: 0.7,
  }

  return provider.chat(request)
}

/**
 * Stream chat with a specific model identifier.
 */
async function* streamChatWithModel(
  modelId: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): AsyncGenerator<string> {
  const [providerId, modelName] = modelId.includes('/')
    ? modelId.split('/')
    : [extractProviderFromModel(modelId), modelId]

  const provider = providerRegistry.get(providerId)
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`)
  }

  if (!provider.isAvailable()) {
    throw new Error(`Provider not available: ${providerId}`)
  }

  const request: ChatRequest = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    model: modelName,
    maxTokens,
    temperature: 0.7,
  }

  for await (const chunk of provider.chatStream(request)) {
    if (chunk.content) {
      yield chunk.content
    }
  }
}

/**
 * Extract provider ID from a model name (heuristic).
 * Examples:
 * - 'gpt-4o' → 'openai'
 * - 'claude-opus' → 'anthropic'
 * - 'mistral' → 'ollama'
 */
function extractProviderFromModel(modelId: string): string {
  const lower = modelId.toLowerCase()

  if (lower.includes('gpt') || lower.includes('o4') || lower.includes('o3')) {
    return 'openai'
  }
  if (lower.includes('claude')) {
    return 'anthropic'
  }
  if (lower.includes('gemini')) {
    return 'gemini'
  }
  if (lower.startsWith('mistral') || lower.includes('ollama')) {
    return 'ollama'
  }

  // Default to Ollama for unknown models
  return 'ollama'
}

// ============================================================================
// VISION & COMPUTER-USE SUPPORT
// ============================================================================

/**
 * Image attachment for vision calls.
 */
export interface VisionImage {
  base64: string
  mediaType?: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  width?: number
  height?: number
}

/**
 * Call an agent's LLM with vision (image + text).
 * Sends screenshots as multimodal content blocks.
 *
 * Falls back to text-only if the resolved provider doesn't support vision.
 */
export async function callAgentLLMVision(
  agent: AgentDefinition,
  textPrompt: string,
  images: VisionImage[],
): Promise<string> {
  const systemPrompt = agent.systemPrompt

  // Build multimodal content blocks: images first, then text
  const contentBlocks: ContentBlock[] = []
  for (const img of images) {
    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType ?? 'image/png',
        data: img.base64,
      },
    })
  }
  contentBlocks.push({ type: 'text', text: textPrompt })

  const models = [agent.preferredModel, agent.fallbackModel].filter(Boolean) as string[]

  for (const modelId of models) {
    try {
      const response = await chatWithModelMultimodal(
        modelId,
        systemPrompt,
        contentBlocks,
        agent.tokenBudget,
      )
      console.log(`[AgentLLM] ${agent.name} vision call completed with ${modelId}`)
      return response.content
    } catch (err) {
      console.warn(`[AgentLLM] ${agent.name} vision failed with ${modelId}:`, err)
    }
  }

  throw new AgentLLMError(agent.id, 'All vision LLM attempts failed')
}

/**
 * Call an agent's LLM with Anthropic computer_use beta tools.
 * The model receives screenshots and returns structured computer_use actions.
 */
export async function callAgentLLMComputerUse(
  agent: AgentDefinition,
  textPrompt: string,
  images: VisionImage[],
  displayWidth: number,
  displayHeight: number,
): Promise<ChatResponse> {
  const systemPrompt = agent.systemPrompt

  // Build multimodal content
  const contentBlocks: ContentBlock[] = []
  for (const img of images) {
    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType ?? 'image/png',
        data: img.base64,
      },
    })
  }
  contentBlocks.push({ type: 'text', text: textPrompt })

  // Computer use tool spec
  const computerUseTool: ComputerUseTool = {
    type: 'computer_20241022',
    name: 'computer',
    display_width_px: displayWidth,
    display_height_px: displayHeight,
  }

  const modelId = agent.preferredModel
  const [providerId, modelName] = modelId.includes('/')
    ? modelId.split('/')
    : [extractProviderFromModel(modelId), modelId]

  const provider = providerRegistry.get(providerId)
  if (!provider) {
    throw new AgentLLMError(agent.id, `Provider not found: ${providerId}`)
  }
  if (!provider.isAvailable()) {
    throw new AgentLLMError(agent.id, `Provider not available: ${providerId}`)
  }

  const request: ChatRequest = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contentBlocks },
    ],
    model: modelName,
    maxTokens: agent.tokenBudget,
    temperature: 0.5,
    computerUseTools: [computerUseTool],
    betaHeaders: ['computer-use-2024-10-22'],
  }

  return provider.chat(request)
}

/**
 * Chat with a model using multimodal content blocks.
 */
async function chatWithModelMultimodal(
  modelId: string,
  systemPrompt: string,
  contentBlocks: ContentBlock[],
  maxTokens: number,
): Promise<ChatResponse> {
  const [providerId, modelName] = modelId.includes('/')
    ? modelId.split('/')
    : [extractProviderFromModel(modelId), modelId]

  const provider = providerRegistry.get(providerId)
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`)
  }
  if (!provider.isAvailable()) {
    throw new Error(`Provider not available: ${providerId}`)
  }

  // Check if provider's model supports vision
  const caps = provider.getModelCapabilities(modelName)
  if (caps && !caps.supportsVision) {
    // Fallback: strip images, send text only
    const textOnly = contentBlocks
      .filter((b): b is import('./provider-interface').TextContentBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')

    const request: ChatRequest = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: textOnly },
      ],
      model: modelName,
      maxTokens,
      temperature: 0.7,
    }
    return provider.chat(request)
  }

  // Send multimodal request
  const request: ChatRequest = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contentBlocks },
    ],
    model: modelName,
    maxTokens,
    temperature: 0.7,
  }

  return provider.chat(request)
}

export { AgentLLMError }
