/**
 * Anthropic Provider — Direct API integration (no proxy)
 *
 * Uses native fetch() to call Anthropic's REST API directly.
 * Supports chat completions. Does NOT support embeddings natively.
 *
 * API Reference: https://docs.anthropic.com/claude/reference/getting-started-with-the-api
 */

import {
  LLMProvider,
  ProviderConfig,
  ProviderHealth,
  ModelCapabilities,
  ModelCard,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderError,
  type MessageContent,
  type ContentBlock,
} from './provider-interface'

/**
 * Anthropic Claude models with their capabilities.
 */
const ANTHROPIC_MODELS: Record<string, ModelCard> = {
  'claude-opus-4.6': {
    id: 'claude-opus-4.6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    capabilities: {
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 200_000,
      maxOutputTokens: 4_096,
    },
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
  },
  'claude-sonnet-4.6': {
    id: 'claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    capabilities: {
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 200_000,
      maxOutputTokens: 4_096,
    },
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  'claude-haiku-4.5': {
    id: 'claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    capabilities: {
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 200_000,
      maxOutputTokens: 1_024,
    },
    costPer1kInput: 0.00080,
    costPer1kOutput: 0.0024,
  },
}

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic'
  readonly name = 'Anthropic (Claude)'
  readonly isLocal = false

  private apiKey: string
  private baseUrl: string = 'https://api.anthropic.com/v1'
  private timeout: number = 120_000
  private maxRetries: number = 3
  private lastHealth: ProviderHealth | null = null

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new ProviderError(this.id, 'INVALID_CONFIG', 'apiKey is required')
    }
    this.apiKey = config.apiKey
    if (config.baseUrl) this.baseUrl = config.baseUrl
    if (config.timeout) this.timeout = config.timeout
    if (config.maxRetries) this.maxRetries = config.maxRetries
  }

  async initialize(): Promise<void> {
    // Verify API key by making a simple test call
    const result = await this.healthCheck()
    if (result.status !== 'healthy') {
      throw new ProviderError(
        this.id,
        'AUTH_FAILED',
        'Failed to authenticate with Anthropic API'
      )
    }
    console.log('[Anthropic] Provider initialized and authenticated')
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
    console.log('[Anthropic] Provider shutdown')
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startMs = Date.now()
    try {
      // Make a minimal test call
      await this.makeRequest('/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-haiku-4.5',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })
      const latencyMs = Date.now() - startMs
      this.lastHealth = {
        status: 'healthy',
        latencyMs,
        lastCheckedAt: Date.now(),
      }
      return this.lastHealth
    } catch (err) {
      const latencyMs = Date.now() - startMs
      const error = err instanceof Error ? err.message : String(err)
      this.lastHealth = {
        status: 'down',
        latencyMs,
        lastCheckedAt: Date.now(),
        error,
      }
      return this.lastHealth
    }
  }

  isAvailable(): boolean {
    return this.lastHealth?.status === 'healthy'
  }

  async listModels(): Promise<ModelCard[]> {
    return Object.values(ANTHROPIC_MODELS)
  }

  getModelCapabilities(modelId: string): ModelCapabilities | null {
    const card = ANTHROPIC_MODELS[modelId]
    return card?.capabilities ?? null
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startMs = Date.now()
    const model = request.model || 'claude-opus-4.6'

    // Extract system message text (system messages should always be text)
    const systemMessages = request.messages.filter(m => m.role === 'system')
    const system = systemMessages
      .map(m => extractTextContent(m.content))
      .filter(Boolean)
      .join('\n') || undefined

    // Non-system messages for API — serialize content to Anthropic format
    const messages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: serializeContentForAnthropic(m.content),
      }))

    const payload: any = {
      model,
      max_tokens: request.maxTokens || 1024,
      messages,
    }

    if (system) {
      payload.system = system
    }

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature
    }

    if (request.stop) {
      payload.stop_sequences = request.stop
    }

    // Convert tools format
    const tools: any[] = []
    if (request.tools && request.tools.length > 0) {
      for (const t of request.tools) {
        tools.push({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })
      }
    }

    // Add computer_use beta tools (special tool type)
    if (request.computerUseTools && request.computerUseTools.length > 0) {
      for (const cu of request.computerUseTools) {
        tools.push({
          type: cu.type,
          name: cu.name,
          display_width_px: cu.display_width_px,
          display_height_px: cu.display_height_px,
        })
      }
    }

    if (tools.length > 0) {
      payload.tools = tools
    }

    // Add beta headers if specified (e.g., computer-use)
    const extraHeaders: Record<string, string> = {}
    if (request.betaHeaders && request.betaHeaders.length > 0) {
      extraHeaders['anthropic-beta'] = request.betaHeaders.join(',')
    }

    const response = await this.makeRequest('/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: extraHeaders,
    })

    const latencyMs = Date.now() - startMs
    const content = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('')

    const toolCalls = response.content
      .filter((block: any) => block.type === 'tool_use')
      .map((block: any) => ({
        id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input),
      }))

    return {
      content,
      model,
      provider: this.id,
      usage: {
        promptTokens: response.usage?.input_tokens ?? 0,
        completionTokens: response.usage?.output_tokens ?? 0,
        totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      },
      finishReason: response.stop_reason ?? 'stop',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      latencyMs,
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const model = request.model || 'claude-opus-4.6'

    // Extract system message text
    const systemMessages = request.messages.filter(m => m.role === 'system')
    const system = systemMessages
      .map(m => extractTextContent(m.content))
      .filter(Boolean)
      .join('\n') || undefined

    // Non-system messages — serialize content to Anthropic format
    const messages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: serializeContentForAnthropic(m.content),
      }))

    const payload: any = {
      model,
      max_tokens: request.maxTokens || 1024,
      messages,
      stream: true,
    }

    if (system) {
      payload.system = system
    }

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature
    }

    if (request.stop) {
      payload.stop_sequences = request.stop
    }

    const tools: any[] = []
    if (request.tools && request.tools.length > 0) {
      for (const t of request.tools) {
        tools.push({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })
      }
    }
    if (request.computerUseTools && request.computerUseTools.length > 0) {
      for (const cu of request.computerUseTools) {
        tools.push({
          type: cu.type,
          name: cu.name,
          display_width_px: cu.display_width_px,
          display_height_px: cu.display_height_px,
        })
      }
    }
    if (tools.length > 0) {
      payload.tools = tools
    }

    const extraHeaders: Record<string, string> = {}
    if (request.betaHeaders && request.betaHeaders.length > 0) {
      extraHeaders['anthropic-beta'] = request.betaHeaders.join(',')
    }

    const response = await this.makeStreamRequest('/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: extraHeaders,
    })

    if (!response.body) {
      throw new ProviderError(
        this.id,
        'STREAM_ERROR',
        'No response body for streaming request'
      )
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          yield { content: '', done: true, model }
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            try {
              const event = JSON.parse(data)

              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                yield {
                  content: event.delta.text ?? '',
                  done: false,
                  model,
                }
              }

              if (event.type === 'message_delta' && event.usage) {
                yield {
                  content: '',
                  done: false,
                  model,
                  usage: {
                    promptTokens: event.usage.input_tokens ?? 0,
                    completionTokens: event.usage.output_tokens ?? 0,
                    totalTokens: (event.usage.input_tokens ?? 0) + (event.usage.output_tokens ?? 0),
                  },
                }
              }

              if (event.type === 'message_stop') {
                yield { content: '', done: true, model }
                break
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  supportsEmbeddings(): boolean {
    return false
  }

  async embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new ProviderError(
      this.id,
      'NOT_SUPPORTED',
      'Anthropic does not support embeddings natively'
    )
  }

  // ── Private helpers ──

  private async makeRequest(
    path: string,
    init: RequestInit
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    }
    // Merge any extra headers (e.g., anthropic-beta for computer-use)
    if (init.headers) {
      Object.assign(headers, init.headers)
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await Promise.race([
          fetch(url, { ...init, headers }),
          new Promise<Response>((_, reject) =>
            setTimeout(
              () => reject(new Error('Request timeout')),
              this.timeout
            )
          ),
        ])

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new ProviderError(
            this.id,
            'API_ERROR',
            data.error?.message || response.statusText,
            response.status,
            response.status >= 500
          )
        }

        return await response.json()
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < this.maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        }
      }
    }

    throw lastError || new ProviderError(
      this.id,
      'REQUEST_FAILED',
      'All retry attempts exhausted'
    )
  }

  private async makeStreamRequest(
    path: string,
    init: RequestInit
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    }
    // Merge any extra headers (e.g., anthropic-beta)
    if (init.headers) {
      Object.assign(headers, init.headers)
    }

    const response = await Promise.race([
      fetch(url, { ...init, headers }),
      new Promise<Response>((_, reject) =>
        setTimeout(
          () => reject(new Error('Request timeout')),
          this.timeout
        )
      ),
    ])

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new ProviderError(
        this.id,
        'API_ERROR',
        data.error?.message || response.statusText,
        response.status
      )
    }

    return response
  }
}

// ============================================================================
// CONTENT SERIALIZATION HELPERS
// ============================================================================

/**
 * Extract plain text from a MessageContent value.
 * Used for system messages which should always be text-only.
 */
function extractTextContent(content: MessageContent): string {
  if (typeof content === 'string') return content
  // Array of content blocks — extract text blocks only
  return content
    .filter((block): block is import('./provider-interface').TextContentBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/**
 * Serialize MessageContent into the format Anthropic's API expects.
 *
 * Anthropic accepts either:
 * - A plain string (for text-only messages)
 * - An array of content blocks: [{ type: "text", text: "..." }, { type: "image", source: { ... } }]
 *
 * Our ContentBlock types map directly to Anthropic's format, so array content
 * passes through mostly unchanged. The only transform is that our
 * ImageContentBlock uses the exact same structure as Anthropic's.
 */
function serializeContentForAnthropic(content: MessageContent): string | any[] {
  if (typeof content === 'string') return content

  // Pass content blocks through — they're already in Anthropic format
  return content.map(block => {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text }
      case 'image':
        return {
          type: 'image',
          source: block.source,
        }
      case 'tool_use':
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        }
      case 'tool_result':
        return {
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: block.content,
        }
      default:
        return block
    }
  })
}
