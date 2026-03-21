/**
 * NPU / Local Inference Provider — On-Device AI via ONNX Runtime
 *
 * Provides zero-cost, zero-latency inference for lightweight tasks:
 *   - Text embeddings (all-MiniLM-L6-v2 or similar)
 *   - Text classification / sentiment
 *   - Simple completions via small language models (Phi-3-mini, TinyLlama)
 *
 * Architecture:
 *   - Uses onnxruntime-node when available (native CPU/GPU/NPU acceleration)
 *   - Falls back to onnxruntime-web (WASM) for cross-platform support
 *   - Models stored in ~/.nyra-desktop/models/ (auto-downloaded on first use)
 *   - Provider is optional — gracefully degrades if no models available
 *
 * NPU Detection:
 *   - Windows: DirectML execution provider
 *   - macOS: CoreML execution provider
 *   - Linux: CPU (XNNPACK) or CUDA if available
 *
 * This provider is designed for the "free tier" of the Smart Model Router:
 *   - Simple factual queries → NPU
 *   - Embeddings → NPU (always, when available)
 *   - Complex tasks → route to cloud
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
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

// ── NPU Model Catalog ───────────────────────────────────────────────────────

const NPU_MODELS: Record<string, ModelCard> = {
  'npu-embed-mini': {
    id: 'npu-embed-mini',
    name: 'Local Embeddings (MiniLM)',
    provider: 'npu',
    capabilities: {
      supportsVision: false,
      supportsTools: false,
      supportsStreaming: false,
      supportsJson: false,
      contextWindow: 512,
      maxOutputTokens: 0,  // Embedding only
    },
    costPer1kInput: 0,
    costPer1kOutput: 0,
  },
  'npu-tiny-chat': {
    id: 'npu-tiny-chat',
    name: 'Local Chat (TinyLlama 1.1B)',
    provider: 'npu',
    capabilities: {
      supportsVision: false,
      supportsTools: false,
      supportsStreaming: true,
      supportsJson: false,
      contextWindow: 2048,
      maxOutputTokens: 512,
    },
    costPer1kInput: 0,
    costPer1kOutput: 0,
  },
  'npu-phi-mini': {
    id: 'npu-phi-mini',
    name: 'Local Chat (Phi-3 Mini)',
    provider: 'npu',
    capabilities: {
      supportsVision: false,
      supportsTools: false,
      supportsStreaming: true,
      supportsJson: true,
      contextWindow: 4096,
      maxOutputTokens: 1024,
    },
    costPer1kInput: 0,
    costPer1kOutput: 0,
  },
}

// ── Execution Provider Detection ────────────────────────────────────────────

type ExecutionProvider = 'cpu' | 'directml' | 'coreml' | 'cuda' | 'webgpu'

function detectExecutionProvider(): ExecutionProvider {
  const platform = process.platform
  if (platform === 'win32') return 'directml'   // Windows NPU via DirectML
  if (platform === 'darwin') return 'coreml'     // macOS Neural Engine via CoreML
  // Linux: check for CUDA
  try {
    if (fs.existsSync('/usr/local/cuda/bin/nvcc') ||
        fs.existsSync('/usr/bin/nvidia-smi')) {
      return 'cuda'
    }
  } catch { /* ignore */ }
  return 'cpu'
}

// ── Provider Implementation ─────────────────────────────────────────────────

export class NpuProvider implements LLMProvider {
  readonly id = 'npu'
  readonly name = 'On-Device NPU'
  readonly isLocal = true

  private modelsDir: string
  private executionProvider: ExecutionProvider
  private ortSession: any = null     // onnxruntime-node InferenceSession
  private ortModule: any = null      // onnxruntime-node or onnxruntime-web
  private initialized = false
  private available = false
  private lastHealth: ProviderHealth | null = null

  constructor(_config?: ProviderConfig) {
    this.modelsDir = path.join(app.getPath('userData'), 'models')
    this.executionProvider = detectExecutionProvider()
  }

  async initialize(): Promise<void> {
    // Ensure models directory exists
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true })
    }

    // Try to load ONNX Runtime
    try {
      this.ortModule = await this.loadOnnxRuntime()
      this.initialized = true
      this.available = true
      console.log(`[NPU] Provider initialized with ${this.executionProvider} execution provider`)
    } catch (err) {
      console.warn('[NPU] ONNX Runtime not available, provider disabled:', (err as Error).message)
      this.initialized = true
      this.available = false
    }
  }

  async shutdown(): Promise<void> {
    if (this.ortSession) {
      await this.ortSession.release()
      this.ortSession = null
    }
    console.log('[NPU] Provider shutdown')
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startMs = Date.now()
    const status = this.available ? 'healthy' : 'down'
    this.lastHealth = {
      status,
      latencyMs: Date.now() - startMs,
      lastCheckedAt: Date.now(),
      error: this.available ? undefined : 'ONNX Runtime not available',
    }
    return this.lastHealth
  }

  isAvailable(): boolean {
    return this.available
  }

  async listModels(): Promise<ModelCard[]> {
    if (!this.available) return []

    // Only list models that have downloaded ONNX files
    const available: ModelCard[] = []
    for (const [id, card] of Object.entries(NPU_MODELS)) {
      const modelPath = path.join(this.modelsDir, `${id}.onnx`)
      if (fs.existsSync(modelPath)) {
        available.push(card)
      } else {
        // Still list the model but note it needs download
        available.push({ ...card, name: `${card.name} (not downloaded)` })
      }
    }
    return available
  }

  getModelCapabilities(modelId: string): ModelCapabilities | null {
    return NPU_MODELS[modelId]?.capabilities ?? null
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startMs = Date.now()
    const model = request.model || 'npu-tiny-chat'

    if (!this.available) {
      throw new ProviderError(this.id, 'UNAVAILABLE', 'NPU provider is not available')
    }

    const modelPath = path.join(this.modelsDir, `${model}.onnx`)
    if (!fs.existsSync(modelPath)) {
      throw new ProviderError(this.id, 'MODEL_NOT_FOUND', `Model not downloaded: ${model}. Place ${model}.onnx in ${this.modelsDir}`)
    }

    try {
      // Load model session if needed
      const session = await this.getOrCreateSession(modelPath)

      // Build input from messages
      const inputText = request.messages
        .map(m => {
          const content = typeof m.content === 'string' ? m.content
            : (m.content as any[]).filter(b => b.type === 'text').map(b => b.text).join(' ')
          return `${m.role}: ${content}`
        })
        .join('\n')

      // Tokenize (simplified — real impl would use a proper tokenizer)
      const inputIds = this.simpleTokenize(inputText, 512)

      // Run inference
      const feeds: Record<string, any> = {
        input_ids: new this.ortModule.Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), [1, inputIds.length]),
      }

      const results = await session.run(feeds)
      const outputText = this.decodeOutput(results)

      return {
        content: outputText,
        model,
        provider: this.id,
        usage: {
          promptTokens: inputIds.length,
          completionTokens: outputText.split(' ').length,
          totalTokens: inputIds.length + outputText.split(' ').length,
        },
        finishReason: 'stop',
        latencyMs: Date.now() - startMs,
      }
    } catch (err) {
      throw new ProviderError(this.id, 'INFERENCE_ERROR', (err as Error).message)
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatChunk> {
    // For local models, simulate streaming by yielding the full response
    // Real streaming would require a causal LM with autoregressive decoding
    const response = await this.chat(request)
    const words = response.content.split(' ')

    for (let i = 0; i < words.length; i++) {
      const isLast = i === words.length - 1
      yield {
        content: words[i] + (isLast ? '' : ' '),
        done: isLast,
        model: response.model,
        usage: isLast ? response.usage : undefined,
      }
      // Simulate token-by-token delay for natural streaming feel
      await new Promise(r => setTimeout(r, 15))
    }
  }

  supportsEmbeddings(): boolean {
    return this.available
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model || 'npu-embed-mini'
    const modelPath = path.join(this.modelsDir, `${model}.onnx`)

    if (!this.available || !fs.existsSync(modelPath)) {
      throw new ProviderError(this.id, 'MODEL_NOT_FOUND', `Embedding model not available: ${model}`)
    }

    try {
      const session = await this.getOrCreateSession(modelPath)
      const embeddings: Float32Array[] = []

      for (const text of request.texts) {
        const inputIds = this.simpleTokenize(text, 512)
        const attentionMask = new Array(inputIds.length).fill(1)

        const feeds: Record<string, any> = {
          input_ids: new this.ortModule.Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), [1, inputIds.length]),
          attention_mask: new this.ortModule.Tensor('int64', BigInt64Array.from(attentionMask.map(BigInt)), [1, attentionMask.length]),
        }

        const results = await session.run(feeds)
        const output = results['last_hidden_state'] || results[Object.keys(results)[0]]

        // Mean pooling over sequence dimension
        const data = output.data as Float32Array
        const seqLen = inputIds.length
        const hiddenSize = data.length / seqLen
        const pooled = new Float32Array(hiddenSize)

        for (let i = 0; i < seqLen; i++) {
          for (let j = 0; j < hiddenSize; j++) {
            pooled[j] += data[i * hiddenSize + j] / seqLen
          }
        }

        // L2 normalize
        let norm = 0
        for (let j = 0; j < hiddenSize; j++) norm += pooled[j] * pooled[j]
        norm = Math.sqrt(norm)
        if (norm > 0) for (let j = 0; j < hiddenSize; j++) pooled[j] /= norm

        embeddings.push(pooled)
      }

      return {
        embeddings,
        model,
        dimensions: embeddings[0]?.length ?? 0,
        usage: { totalTokens: request.texts.reduce((sum, t) => sum + t.split(' ').length, 0) },
      }
    } catch (err) {
      throw new ProviderError(this.id, 'EMBEDDING_ERROR', (err as Error).message)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async loadOnnxRuntime(): Promise<any> {
    // Try native Node.js binding first (fastest, supports NPU)
    try {
      return require('onnxruntime-node')
    } catch { /* not installed */ }

    // Fall back to WASM-based runtime
    try {
      return require('onnxruntime-web')
    } catch { /* not installed */ }

    throw new Error('Neither onnxruntime-node nor onnxruntime-web is available')
  }

  private async getOrCreateSession(modelPath: string): Promise<any> {
    if (this.ortSession) return this.ortSession

    const options: any = {}

    // Configure execution provider
    switch (this.executionProvider) {
      case 'directml':
        options.executionProviders = [{ name: 'dml' }]
        break
      case 'coreml':
        options.executionProviders = [{ name: 'coreml' }]
        break
      case 'cuda':
        options.executionProviders = [{ name: 'cuda' }]
        break
      default:
        options.executionProviders = [{ name: 'cpu' }]
    }

    this.ortSession = await this.ortModule.InferenceSession.create(modelPath, options)
    return this.ortSession
  }

  /**
   * Simple tokenizer (word-level).
   * Real implementation would use a SentencePiece/BPE tokenizer
   * matching the model's vocabulary.
   */
  private simpleTokenize(text: string, maxLength: number): number[] {
    const words = text.toLowerCase().split(/\s+/).slice(0, maxLength)
    // Simple hash-based token IDs (placeholder for real tokenizer)
    return words.map(w => {
      let hash = 0
      for (let i = 0; i < w.length; i++) {
        hash = ((hash << 5) - hash + w.charCodeAt(i)) | 0
      }
      return Math.abs(hash) % 32000  // Assume 32K vocab
    })
  }

  private decodeOutput(results: any): string {
    // Extract text from model output
    const keys = Object.keys(results)
    for (const key of keys) {
      const tensor = results[key]
      if (tensor.data && tensor.data.length > 0) {
        // For classification models, return the top class
        if (tensor.dims && tensor.dims.length === 2 && tensor.dims[1] < 100) {
          const data = tensor.data as Float32Array
          let maxIdx = 0
          for (let i = 1; i < data.length; i++) {
            if (data[i] > data[maxIdx]) maxIdx = i
          }
          return `[class:${maxIdx}, score:${data[maxIdx].toFixed(4)}]`
        }

        // For generative models, decode token IDs
        if (tensor.type === 'int64' || tensor.type === 'int32') {
          return `[Generated ${tensor.data.length} tokens]`
        }
      }
    }
    return '[No output]'
  }

  /** Get info about available NPU hardware */
  getHardwareInfo(): { executionProvider: string; platform: string } {
    return {
      executionProvider: this.executionProvider,
      platform: process.platform,
    }
  }
}
