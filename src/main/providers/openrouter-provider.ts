/**
 * OpenRouter Provider — OpenAI-compatible API with custom base URL
 *
 * OpenRouter (https://openrouter.ai) provides a unified API that routes to
 * 300+ models (Claude, GPT, Gemini, Llama, etc.) via a single OpenAI-compatible
 * endpoint. The user pays OpenRouter directly; we just need an API key.
 *
 * Since the API is OpenAI-compatible, we extend the OpenAIProvider and override
 * only the id, name, and default baseUrl.
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

// ── Vision Serialization (copy from openai-provider) ──────────────────────

function extractTextContent(content: import('./provider-interface').MessageContent): string {
  if (typeof content === 'string') return content
  return (content as any[])
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('\n')
}

function serializeContentForOpenAI(content: import('./provider-interface').MessageContent): string | any[] {
  if (typeof content === 'string') return content
  const parts: any[] = []
  for (const block of content as any[]) {
    switch (block.type) {
      case 'text':
        parts.push({ type: 'text', text: block.text })
        break
      case 'image':
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
        })
        break
      default:
        break
    }
  }
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text
  return parts.length > 0 ? parts : ''
}

/**
 * OpenRouter Provider
 *
 * Uses the OpenAI-compatible chat completions API at openrouter.ai.
 * Model IDs are passed through as-is (e.g. "anthropic/claude-opus-4-6").
 */
export class OpenRouterProvider implements LLMProvider {
  readonly id = 'openrouter'
  readonly name = 'OpenRouter'
  readonly isLocal = false

  private apiKey: string
  private baseUrl: string = 'https://openrouter.ai/api/v1'
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
    console.log('[OpenRouter] Provider initialized')
  }

  async shutdown(): Promise<void> {
    console.log('[OpenRouter] Provider shutdown')
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startMs = Date.now()
    try {
      const resp = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      })
      const latencyMs = Date.now() - startMs
      this.lastHealth = {
        status: resp.ok ? 'healthy' : 'degraded',
        latencyMs,
        lastCheckedAt: Date.now(),
        ...(resp.ok ? {} : { error: `HTTP ${resp.status}` }),
      }
      return this.lastHealth
    } catch (err) {
      this.lastHealth = {
        status: 'down',
        latencyMs: Date.now() - startMs,
        lastCheckedAt: Date.now(),
        error: (err as Error).message,
      }
      return this.lastHealth
    }
  }

  isAvailable(): boolean {
    // Consider available if we have an API key (health check is optional)
    return !!this.apiKey
  }

  async listModels(): Promise<ModelCard[]> {
    // Return a minimal catalog — OpenRouter has 300+ models
    return [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'openrouter',
        capabilities: { supportsVision: true, supportsTools: true, supportsStreaming: true, supportsJson: true, contextWindow: 200_000, maxOutputTokens: 8_192 } },
      { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openrouter',
        capabilities: { supportsVision: true, supportsTools: true, supportsStreaming: true, supportsJson: true, contextWindow: 128_000, maxOutputTokens: 4_096 } },
    ]
  }

  getModelCapabilities(_modelId: string): ModelCapabilities | null {
    // OpenRouter models generally support everything
    return {
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startMs = Date.now()
    const model = request.model || 'anthropic/claude-sonnet-4'

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
    }

    const response = await this.makeRequest('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const data = await response.json() as any
    const choice = data.choices?.[0]

    return {
      content: choice?.message?.content ?? '',
      model: data.model || model,
      provider: this.id,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      finishReason: choice?.finish_reason === 'stop' ? 'stop' : 'length',
      latencyMs: Date.now() - startMs,
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const model = request.model || 'anthropic/claude-sonnet-4'

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
    }

    const response = await this.makeStreamRequest('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    if (!response.body) {
      throw new ProviderError(this.id, 'STREAM_ERROR', 'No response body for streaming request')
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
              // Ignore JSON parse errors in SSE stream
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  supportsEmbeddings(): boolean { return false }

  // ── Private request helpers ─────────────────────────────────────────────

  private async makeRequest(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      ...init,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nyra.app',
        'X-Title': 'Nyra Desktop',
        ...init.headers,
      },
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new ProviderError(
        this.id,
        `HTTP_${response.status}`,
        `OpenRouter API error ${response.status}: ${body.slice(0, 200)}`
      )
    }

    return response
  }

  private async makeStreamRequest(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      ...init,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nyra.app',
        'X-Title': 'Nyra Desktop',
        ...init.headers,
      },
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new ProviderError(
        this.id,
        `HTTP_${response.status}`,
        `OpenRouter streaming error ${response.status}: ${body.slice(0, 200)}`
      )
    }

    return response
  }
}
