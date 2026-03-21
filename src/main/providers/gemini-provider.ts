/**
 * Gemini Provider — Google Generative AI integration (no proxy)
 *
 * Uses native fetch() to call Gemini's REST API directly.
 * Supports chat completions, vision (multimodal), and embeddings.
 *
 * API Reference: https://ai.google.dev/api/rest
 *
 * Key differences from OpenAI/Anthropic:
 *   - Model name goes in the URL path, not the request body
 *   - Content uses `parts[]` with `text` or `inlineData` blocks
 *   - Responses come back in `candidates[0].content.parts`
 *   - System instruction is a top-level field, not a message role
 *   - Streaming uses SSE with `candidates[0].content.parts` per chunk
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
 * Extract plain text from MessageContent (for system instructions).
 */
function extractTextContent(content: MessageContent): string {
  if (typeof content === 'string') return content
  return content
    .filter((block): block is TextContentBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/**
 * Serialize MessageContent to Gemini's `parts[]` format.
 *
 * Gemini uses:
 *   - Text: { text: '...' }
 *   - Image: { inlineData: { mimeType: 'image/png', data: '<base64>' } }
 *
 * For plain strings, wrap in a single text part.
 */
function serializeContentForGemini(content: MessageContent): any[] {
  if (typeof content === 'string') {
    return [{ text: content }]
  }

  const parts: any[] = []
  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push({ text: block.text })
        break
      case 'image': {
        const img = block as ImageContentBlock
        parts.push({
          inlineData: {
            mimeType: img.source.media_type,
            data: img.source.data,
          },
        })
        break
      }
      case 'tool_use':
        // Gemini handles function calls via the tools parameter
        parts.push({ text: `[Tool call: ${block.name}]` })
        break
      case 'tool_result':
        parts.push({ text: block.content })
        break
      default:
        break
    }
  }

  return parts.length > 0 ? parts : [{ text: '' }]
}

/**
 * Gemini model catalog with capabilities and pricing.
 */
const GEMINI_MODELS: Record<string, ModelCard> = {
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    capabilities: {
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
    },
    costPer1kInput: 0.00125,
    costPer1kOutput: 0.01,
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    capabilities: {
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
    },
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'gemini',
    capabilities: {
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 1_048_576,
      maxOutputTokens: 8_192,
    },
    costPer1kInput: 0.0001,
    costPer1kOutput: 0.0004,
  },
  'gemini-2.0-flash-lite': {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    provider: 'gemini',
    capabilities: {
      supportsVision: true,
      supportsTools: false,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 1_048_576,
      maxOutputTokens: 8_192,
    },
    costPer1kInput: 0.000075,
    costPer1kOutput: 0.0003,
  },
}

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini'
  readonly name = 'Google Gemini'
  readonly isLocal = false

  private apiKey: string
  private baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta'
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
    await this.listModels()
    console.log('[Gemini] Provider initialized and authenticated')
  }

  async shutdown(): Promise<void> {
    console.log('[Gemini] Provider shutdown')
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startMs = Date.now()
    try {
      await this.makeRequest(`/models?key=${this.apiKey}`, { method: 'GET' })
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
    return Object.values(GEMINI_MODELS)
  }

  getModelCapabilities(modelId: string): ModelCapabilities | null {
    const card = GEMINI_MODELS[modelId]
    return card?.capabilities ?? null
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startMs = Date.now()
    const model = request.model || 'gemini-2.5-flash'

    // Separate system messages from conversation
    const systemParts = request.messages
      .filter(m => m.role === 'system')
      .map(m => extractTextContent(m.content))
      .join('\n')

    // Map conversation messages to Gemini format
    // Gemini uses 'user' and 'model' roles (not 'assistant')
    const contents = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: serializeContentForGemini(m.content),
      }))

    const payload: any = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
        topP: request.topP,
        stopSequences: request.stop,
        responseMimeType: request.responseFormat === 'json' ? 'application/json' : undefined,
      },
    }

    // System instruction as top-level field
    if (systemParts) {
      payload.systemInstruction = {
        parts: [{ text: systemParts }],
      }
    }

    // Tool declarations
    if (request.tools && request.tools.length > 0) {
      payload.tools = [{
        functionDeclarations: request.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }]
    }

    const path = `/models/${model}:generateContent?key=${this.apiKey}`
    const response = await this.makeRequest(path, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const latencyMs = Date.now() - startMs
    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts || []

    // Extract text content
    const textContent = parts
      .filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('')

    // Extract function calls
    const toolCalls = parts
      .filter((p: any) => p.functionCall)
      .map((p: any, idx: number) => ({
        id: `call-${Date.now()}-${idx}`,
        name: p.functionCall.name,
        arguments: JSON.stringify(p.functionCall.args || {}),
      }))

    return {
      content: textContent,
      model,
      provider: this.id,
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
      },
      finishReason: this.mapFinishReason(candidate?.finishReason),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      latencyMs,
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const model = request.model || 'gemini-2.5-flash'

    const systemParts = request.messages
      .filter(m => m.role === 'system')
      .map(m => extractTextContent(m.content))
      .join('\n')

    const contents = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: serializeContentForGemini(m.content),
      }))

    const payload: any = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
        topP: request.topP,
        stopSequences: request.stop,
      },
    }

    if (systemParts) {
      payload.systemInstruction = {
        parts: [{ text: systemParts }],
      }
    }

    if (request.tools && request.tools.length > 0) {
      payload.tools = [{
        functionDeclarations: request.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }]
    }

    // Gemini streaming uses streamGenerateContent with alt=sse
    const path = `/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`
    const response = await this.makeStreamRequest(path, {
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
            const data = line.slice(6).trim()
            if (!data || data === '[DONE]') continue
            try {
              const json = JSON.parse(data)
              const parts = json.candidates?.[0]?.content?.parts || []
              const text = parts
                .filter((p: any) => p.text)
                .map((p: any) => p.text)
                .join('')

              if (text) {
                yield {
                  content: text,
                  done: false,
                  model,
                  usage: {
                    promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
                    completionTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
                    totalTokens: json.usageMetadata?.totalTokenCount ?? 0,
                  },
                }
              }

              // Check for finish
              if (json.candidates?.[0]?.finishReason) {
                yield { content: '', done: true, model }
              }
            } catch {
              // Ignore JSON parse errors in stream
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
    const model = request.model || 'text-embedding-004'

    // Gemini batch embed endpoint
    const path = `/models/${model}:batchEmbedContents?key=${this.apiKey}`

    const payload = {
      requests: request.texts.map(text => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
      })),
    }

    const response = await this.makeRequest(path, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const embeddings = response.embeddings.map((item: any) =>
      new Float32Array(item.values)
    )

    return {
      embeddings,
      model,
      dimensions: embeddings[0]?.length ?? 0,
      usage: {
        totalTokens: 0, // Gemini doesn't report embedding token usage
      },
    }
  }

  // ── Private helpers ──

  private mapFinishReason(reason?: string): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (reason) {
      case 'STOP': return 'stop'
      case 'MAX_TOKENS': return 'length'
      case 'SAFETY': return 'error'
      case 'RECITATION': return 'error'
      default: return 'stop'
    }
  }

  private async makeRequest(
    path: string,
    init: RequestInit
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> || {}),
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
      ...(init.headers as Record<string, string> || {}),
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
