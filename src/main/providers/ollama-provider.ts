/**
 * Ollama Provider — Local LLM via Ollama
 *
 * Runs locally on the machine via Ollama.
 * Supports chat completions and embeddings.
 * Default: http://localhost:11434
 *
 * Ollama API Reference: https://github.com/jmorganca/ollama/blob/main/docs/api.md
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

/**
 * Ollama model capabilities — these are generic as they vary by model.
 */
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsVision: false,
  supportsTools: false,
  supportsStreaming: true,
  supportsJson: false,
  contextWindow: 4_096,
  maxOutputTokens: 2_048,
}

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama'
  readonly name = 'Ollama (Local)'
  readonly isLocal = true

  private baseUrl: string = 'http://localhost:11434'
  private timeout: number = 120_000
  private maxRetries: number = 2
  private lastHealth: ProviderHealth | null = null
  private models: ModelCard[] = []

  constructor(config: ProviderConfig) {
    if (config.baseUrl) this.baseUrl = config.baseUrl
    if (config.timeout) this.timeout = config.timeout
    if (config.maxRetries) this.maxRetries = config.maxRetries
  }

  async initialize(): Promise<void> {
    // Load available models
    await this.listModels()
    // Verify connectivity
    const health = await this.healthCheck()
    if (health.status !== 'healthy') {
      throw new ProviderError(
        this.id,
        'INITIALIZATION_FAILED',
        `Ollama is not available at ${this.baseUrl}`
      )
    }
    console.log(`[Ollama] Provider initialized with ${this.models.length} models`)
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
    console.log('[Ollama] Provider shutdown')
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startMs = Date.now()
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      })
      const latencyMs = Date.now() - startMs

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

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
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      const data = await response.json()

      this.models = (data.models ?? []).map((model: any) => ({
        id: model.name,
        name: model.name,
        provider: this.id,
        capabilities: DEFAULT_CAPABILITIES,
      }))

      return this.models
    } catch (err) {
      console.warn('[Ollama] Failed to list models:', err)
      return []
    }
  }

  getModelCapabilities(modelId: string): ModelCapabilities | null {
    // All Ollama models have the same default capabilities
    return DEFAULT_CAPABILITIES
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startMs = Date.now()
    const model = request.model || 'mistral'

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: request.temperature,
        top_p: request.topP,
        num_predict: request.maxTokens,
      },
    }

    const response = await this.makeRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const latencyMs = Date.now() - startMs

    return {
      content: response.message?.content ?? '',
      model,
      provider: this.id,
      usage: {
        promptTokens: response.prompt_eval_count ?? 0,
        completionTokens: response.eval_count ?? 0,
        totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
      },
      finishReason: 'stop',
      latencyMs,
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const model = request.model || 'mistral'

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      options: {
        temperature: request.temperature,
        top_p: request.topP,
        num_predict: request.maxTokens,
      },
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      throw new ProviderError(
        this.id,
        'API_ERROR',
        `HTTP ${response.status}`,
        response.status
      )
    }

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
          if (line.trim()) {
            try {
              const json = JSON.parse(line)
              const content = json.message?.content ?? ''
              if (content) {
                yield {
                  content,
                  done: false,
                  model,
                }
              }
              if (json.done) {
                yield {
                  content: '',
                  done: true,
                  model,
                  usage: {
                    promptTokens: json.prompt_eval_count ?? 0,
                    completionTokens: json.eval_count ?? 0,
                    totalTokens: (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0),
                  },
                }
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
    return true
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model || 'nomic-embed-text'

    const payload = {
      model,
      input: request.texts,
    }

    const response = await this.makeRequest('/api/embeddings', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const embeddings = (response.embeddings ?? []).map((emb: number[]) =>
      new Float32Array(emb)
    )

    return {
      embeddings,
      model,
      dimensions: embeddings[0]?.length ?? 0,
      usage: {
        totalTokens: 0, // Ollama doesn't return token counts
      },
    }
  }

  // ── Private helpers ──

  private async makeRequest(
    path: string,
    init: RequestInit
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await Promise.race([
          fetch(url, init),
          new Promise<Response>((_, reject) =>
            setTimeout(
              () => reject(new Error('Request timeout')),
              this.timeout
            )
          ),
        ])

        if (!response.ok) {
          throw new ProviderError(
            this.id,
            'API_ERROR',
            response.statusText,
            response.status
          )
        }

        return await response.json()
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < this.maxRetries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
        }
      }
    }

    throw lastError || new ProviderError(
      this.id,
      'REQUEST_FAILED',
      'All retry attempts exhausted'
    )
  }
}
