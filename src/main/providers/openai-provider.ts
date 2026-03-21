/**
 * OpenAI Provider — Direct API integration (no proxy)
 *
 * Uses native fetch() to call OpenAI's REST API directly.
 * Supports chat completions and embeddings.
 *
 * API Reference: https://platform.openai.com/docs/api-reference
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
} from './provider-interface'
import type {
  MessageContent,
  TextContentBlock,
  ImageContentBlock,
} from './provider-interface'

// ── Vision Serialization Helpers ──────────────────────────────────────────

/**
 * Extract plain text from MessageContent (for system messages which don't support images).
 */
function extractTextContent(content: MessageContent): string {
  if (typeof content === 'string') return content
  return content
    .filter((block): block is TextContentBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/**
 * Serialize MessageContent to OpenAI's format.
 *
 * OpenAI uses a content array with typed blocks:
 *   - Text: { type: 'text', text: '...' }
 *   - Image: { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
 *
 * For backward compatibility: if content is a plain string, return as-is.
 * If content is ContentBlock[], serialize each block to OpenAI format.
 */
function serializeContentForOpenAI(content: MessageContent): string | any[] {
  if (typeof content === 'string') return content

  const parts: any[] = []
  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push({ type: 'text', text: block.text })
        break
      case 'image': {
        const img = block as ImageContentBlock
        parts.push({
          type: 'image_url',
          image_url: {
            url: `data:${img.source.media_type};base64,${img.source.data}`,
          },
        })
        break
      }
      case 'tool_use':
        // OpenAI handles tool_use via the tools parameter, not content blocks
        // Include as text fallback
        parts.push({ type: 'text', text: `[Tool call: ${block.name}]` })
        break
      case 'tool_result':
        parts.push({ type: 'text', text: block.content })
        break
      default:
        // Unknown block type — skip
        break
    }
  }

  // If only one text block, unwrap for efficiency
  if (parts.length === 1 && parts[0].type === 'text') {
    return parts[0].text
  }

  return parts.length > 0 ? parts : ''
}

/**
 * OpenAI chat and embedding models with their capabilities.
 */
const OPENAI_MODELS: Record<string, ModelCard> = {
  'gpt-5.4': {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    provider: 'openai',
    capabilities: {
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 1_050_000,
      maxOutputTokens: 16_000,
    },
    costPer1kInput: 0.15,
    costPer1kOutput: 0.60,
  },
  'gpt-5.4-pro': {
    id: 'gpt-5.4-pro',
    name: 'GPT-5.4 Pro',
    provider: 'openai',
    capabilities: {
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 1_050_000,
      maxOutputTokens: 16_000,
    },
    costPer1kInput: 0.30,
    costPer1kOutput: 1.20,
  },
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    capabilities: {
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
    },
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    capabilities: {
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
    },
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
}

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai'
  readonly name = 'OpenAI (ChatGPT)'
  readonly isLocal = false

  private apiKey: string
  private baseUrl: string = 'https://api.openai.com/v1'
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
    // Verify API key by listing models
    await this.listModels()
    console.log('[OpenAI] Provider initialized and authenticated')
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
    console.log('[OpenAI] Provider shutdown')
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startMs = Date.now()
    try {
      const response = await this.makeRequest('/models', {
        method: 'GET',
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
    return Object.values(OPENAI_MODELS)
  }

  getModelCapabilities(modelId: string): ModelCapabilities | null {
    const card = OPENAI_MODELS[modelId]
    return card?.capabilities ?? null
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startMs = Date.now()
    const model = request.model || 'gpt-4o'

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        // System messages: extract text only (no image support)
        // User/assistant messages: serialize with vision support
        content: m.role === 'system'
          ? extractTextContent(m.content)
          : serializeContentForOpenAI(m.content),
      })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stop: request.stop,
      response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
      tools: request.tools?.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
    }

    const response = await this.makeRequest('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const latencyMs = Date.now() - startMs
    const toolCalls = response.choices?.[0]?.message?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: tc.function?.arguments,
    }))

    return {
      content: response.choices?.[0]?.message?.content ?? '',
      model,
      provider: this.id,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason: response.choices?.[0]?.finish_reason ?? 'stop',
      toolCalls,
      latencyMs,
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const model = request.model || 'gpt-4o'

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.role === 'system'
          ? extractTextContent(m.content)
          : serializeContentForOpenAI(m.content),
      })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stop: request.stop,
      stream: true,
      tools: request.tools?.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
    }

    const response = await this.makeStreamRequest('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(payload),
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
            if (data === '[DONE]') {
              yield { content: '', done: true, model }
              break
            }
            try {
              const json = JSON.parse(data)
              const content = json.choices?.[0]?.delta?.content ?? ''
              if (content) {
                yield {
                  content,
                  done: false,
                  model,
                  usage: {
                    promptTokens: json.usage?.prompt_tokens ?? 0,
                    completionTokens: json.usage?.completion_tokens ?? 0,
                    totalTokens: json.usage?.total_tokens ?? 0,
                  },
                }
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
    return true
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model || 'text-embedding-3-small'

    const payload = {
      model,
      input: request.texts,
    }

    const response = await this.makeRequest('/embeddings', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const embeddings = response.data.map((item: any) =>
      new Float32Array(item.embedding)
    )

    return {
      embeddings,
      model,
      dimensions: embeddings[0]?.length ?? 0,
      usage: {
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    }
  }

  // ── Private helpers ──

  private async makeRequest(
    path: string,
    init: RequestInit
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...(init.headers || {}),
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
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...(init.headers || {}),
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
