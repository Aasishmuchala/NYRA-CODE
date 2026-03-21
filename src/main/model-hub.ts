/**
 * Model Hub — Enhanced local model management layer on top of Ollama
 *
 * Features:
 *   - Library search with filters (size, family, quantization)
 *   - Download queue with concurrent limit, pause/resume per-download
 *   - VRAM estimation from model metadata
 *   - Side-by-side model comparison (send same prompt to 2 models)
 *   - Model performance tracking (tokens/sec, user ratings)
 *
 * Architecture:
 *   ModelHub (singleton) → Ollama REST API (localhost:11434)
 *   Events emitted for UI updates: download:progress, download:complete, etc.
 */

import { EventEmitter } from 'events'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import {
  OLLAMA_BASE_URL,
  isOllamaRunning,
  getOllamaModels,
  getModelInfo,
  pullModel,
  deleteModel,
  OllamaModel,
  RECOMMENDED_MODELS,
} from './ollama'

const execFileAsync = promisify(execFile)

// ── Types ────────────────────────────────────────────────────────────────────

export interface LibraryModel {
  name: string
  description: string
  tags: string[]        // e.g. ['7b', '13b', '70b', 'latest']
  pulls: number         // popularity metric
  family: string        // e.g. 'llama', 'qwen', 'deepseek', 'phi'
  lastUpdated: string
}

export interface ModelCard {
  name: string
  displayName: string
  family: string
  parameterSize: string       // e.g. '7B', '70B'
  quantization: string        // e.g. 'Q4_K_M', 'Q8_0'
  contextLength: number
  license: string
  description: string
  sizeBytes: number           // download size in bytes
  estimatedVramMb: number     // estimated GPU VRAM needed
  capabilities: string[]      // e.g. ['chat', 'code', 'vision', 'tools']
  installed: boolean
}

export interface DownloadJob {
  id: string
  modelName: string
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled'
  progress: number            // 0-100
  downloadedBytes: number
  totalBytes: number
  speed: string               // e.g. '12.5 MB/s'
  eta: string                 // e.g. '2m 30s'
  startedAt?: number
  completedAt?: number
  error?: string
}

export interface ComparisonResult {
  id: string
  prompt: string
  modelA: { name: string; response: string; tokensPerSec: number; latencyMs: number }
  modelB: { name: string; response: string; tokensPerSec: number; latencyMs: number }
  createdAt: number
}

export interface ModelPerformance {
  modelName: string
  avgTokensPerSec: number
  avgLatencyMs: number
  totalInferences: number
  userRating: number           // 0-5 stars
  lastUsed: number
}

export interface SystemGpuInfo {
  gpuName: string
  totalVramMb: number
  availableVramMb: number
  platform: string
}

// ── Known Model Library ─────────────────────────────────────────────────────
// Since Ollama doesn't have a public library search API, we maintain a curated
// catalog of popular models. This can be extended via periodic updates.

const KNOWN_MODELS: LibraryModel[] = [
  { name: 'llama3.3', description: 'Meta Llama 3.3 — Best open-weight general model', tags: ['70b', '70b-instruct-q4_K_M'], pulls: 500000, family: 'llama', lastUpdated: '2025-12' },
  { name: 'llama3.2', description: 'Meta Llama 3.2 — Lightweight & efficient', tags: ['1b', '3b', '11b-vision', '90b-vision'], pulls: 800000, family: 'llama', lastUpdated: '2025-10' },
  { name: 'qwen3', description: 'Alibaba Qwen 3 — Strong coding & reasoning', tags: ['0.6b', '1.7b', '4b', '8b', '14b', '32b', '30b-a3b'], pulls: 350000, family: 'qwen', lastUpdated: '2025-11' },
  { name: 'deepseek-r1', description: 'DeepSeek R1 — Advanced chain-of-thought reasoning', tags: ['1.5b', '7b', '8b', '14b', '32b', '70b', '671b'], pulls: 600000, family: 'deepseek', lastUpdated: '2025-11' },
  { name: 'deepseek-coder-v2', description: 'DeepSeek Coder V2 — Code-specialized MoE model', tags: ['16b', '236b'], pulls: 200000, family: 'deepseek', lastUpdated: '2025-06' },
  { name: 'codestral', description: 'Mistral Codestral — Code generation & completion', tags: ['22b'], pulls: 180000, family: 'mistral', lastUpdated: '2025-08' },
  { name: 'phi4', description: 'Microsoft Phi-4 — Compact reasoning model', tags: ['14b'], pulls: 250000, family: 'phi', lastUpdated: '2025-10' },
  { name: 'phi3', description: 'Microsoft Phi-3 — Small but capable', tags: ['3.8b', '14b'], pulls: 400000, family: 'phi', lastUpdated: '2025-04' },
  { name: 'gemma2', description: 'Google Gemma 2 — Open model from Google', tags: ['2b', '9b', '27b'], pulls: 300000, family: 'gemma', lastUpdated: '2025-07' },
  { name: 'mistral', description: 'Mistral 7B — Pioneer open model', tags: ['7b', '7b-instruct'], pulls: 900000, family: 'mistral', lastUpdated: '2025-03' },
  { name: 'mixtral', description: 'Mistral Mixtral — MoE architecture, 8x7B', tags: ['8x7b', '8x22b'], pulls: 350000, family: 'mistral', lastUpdated: '2025-03' },
  { name: 'command-r', description: 'Cohere Command R — RAG-optimized', tags: ['35b', '104b'], pulls: 120000, family: 'cohere', lastUpdated: '2025-05' },
  { name: 'nomic-embed-text', description: 'Nomic Embed Text — High-quality embeddings', tags: ['v1.5'], pulls: 500000, family: 'nomic', lastUpdated: '2025-04' },
  { name: 'starcoder2', description: 'BigCode StarCoder 2 — Code model', tags: ['3b', '7b', '15b'], pulls: 150000, family: 'starcoder', lastUpdated: '2025-02' },
  { name: 'yi', description: '01.AI Yi — Bilingual excellence', tags: ['6b', '9b', '34b'], pulls: 200000, family: 'yi', lastUpdated: '2025-05' },
  { name: 'solar', description: 'Upstage Solar — Korean + English', tags: ['10.7b'], pulls: 100000, family: 'solar', lastUpdated: '2025-03' },
  { name: 'llava', description: 'LLaVA — Vision-Language model', tags: ['7b', '13b', '34b'], pulls: 350000, family: 'llava', lastUpdated: '2025-06' },
]

// ── VRAM estimation heuristic ────────────────────────────────────────────────
// Rule of thumb: ~0.5-0.6 GB per billion parameters for Q4 quantization
// Higher quantization levels (Q8, FP16) require proportionally more
const VRAM_PER_BILLION_PARAMS: Record<string, number> = {
  'Q4_0': 0.5,
  'Q4_K_M': 0.55,
  'Q4_K_S': 0.52,
  'Q5_0': 0.63,
  'Q5_K_M': 0.66,
  'Q5_K_S': 0.64,
  'Q6_K': 0.78,
  'Q8_0': 1.0,
  'FP16': 2.0,
  'FP32': 4.0,
}

function estimateVramMb(paramBillions: number, quantization: string): number {
  const factor = VRAM_PER_BILLION_PARAMS[quantization] ?? 0.55
  // Base VRAM + model weights + KV cache overhead (~15%)
  return Math.round(paramBillions * factor * 1024 * 1.15)
}

function parseParamSize(paramSize: string): number {
  // Parse strings like '7B', '70B', '1.5B', '8x7B'
  const match = paramSize.match(/([\d.]+)\s*[Bb]/)
  if (match) return parseFloat(match[1])
  // Handle MoE like '8x7B' — active params ≈ 2x single expert
  const moeMatch = paramSize.match(/(\d+)x([\d.]+)\s*[Bb]/)
  if (moeMatch) return parseFloat(moeMatch[2]) * 2
  return 7 // default fallback
}

// ── Download Queue Manager ──────────────────────────────────────────────────

const MAX_CONCURRENT_DOWNLOADS = 2

class DownloadQueue {
  private jobs: Map<string, DownloadJob> = new Map()
  private activeCount = 0
  private abortControllers: Map<string, AbortController> = new Map()
  private emitter: EventEmitter

  constructor(emitter: EventEmitter) {
    this.emitter = emitter
  }

  enqueue(modelName: string): DownloadJob {
    const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const job: DownloadJob = {
      id,
      modelName,
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: '—',
      eta: '—',
    }
    this.jobs.set(id, job)
    this.emitter.emit('download:queued', job)
    this.processQueue()
    return job
  }

  pause(jobId: string): boolean {
    const job = this.jobs.get(jobId)
    if (!job || job.status !== 'downloading') return false

    const controller = this.abortControllers.get(jobId)
    if (controller) controller.abort()

    job.status = 'paused'
    this.activeCount = Math.max(0, this.activeCount - 1)
    this.emitter.emit('download:paused', job)
    this.processQueue()
    return true
  }

  resume(jobId: string): boolean {
    const job = this.jobs.get(jobId)
    if (!job || job.status !== 'paused') return false
    job.status = 'queued'
    this.emitter.emit('download:resumed', job)
    this.processQueue()
    return true
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId)
    if (!job) return false

    if (job.status === 'downloading') {
      const controller = this.abortControllers.get(jobId)
      if (controller) controller.abort()
      this.activeCount = Math.max(0, this.activeCount - 1)
    }

    job.status = 'cancelled'
    this.emitter.emit('download:cancelled', job)
    this.processQueue()
    return true
  }

  getAll(): DownloadJob[] {
    return Array.from(this.jobs.values())
  }

  get(jobId: string): DownloadJob | undefined {
    return this.jobs.get(jobId)
  }

  private async processQueue(): Promise<void> {
    if (this.activeCount >= MAX_CONCURRENT_DOWNLOADS) return

    for (const [, job] of this.jobs) {
      if (job.status !== 'queued') continue
      if (this.activeCount >= MAX_CONCURRENT_DOWNLOADS) break

      this.activeCount++
      job.status = 'downloading'
      job.startedAt = Date.now()
      this.emitter.emit('download:started', job)

      this.runDownload(job).catch(() => {})
    }
  }

  private async runDownload(job: DownloadJob): Promise<void> {
    const controller = new AbortController()
    this.abortControllers.set(job.id, controller)

    let lastBytes = 0
    let lastTime = Date.now()

    try {
      await pullModel(job.modelName, (progress) => {
        if (job.status !== 'downloading') return

        job.downloadedBytes = progress.completed ?? job.downloadedBytes
        job.totalBytes = progress.total ?? job.totalBytes

        if (job.totalBytes > 0) {
          job.progress = Math.round((job.downloadedBytes / job.totalBytes) * 100)
        }

        // Calculate speed
        const now = Date.now()
        const elapsed = (now - lastTime) / 1000
        if (elapsed >= 1) {
          const bytesDelta = job.downloadedBytes - lastBytes
          const bytesPerSec = bytesDelta / elapsed
          job.speed = formatBytes(bytesPerSec) + '/s'

          if (bytesPerSec > 0 && job.totalBytes > 0) {
            const remaining = job.totalBytes - job.downloadedBytes
            const etaSec = remaining / bytesPerSec
            job.eta = formatDuration(etaSec)
          }

          lastBytes = job.downloadedBytes
          lastTime = now
        }

        this.emitter.emit('download:progress', { ...job })
      })

      job.status = 'completed'
      job.progress = 100
      job.completedAt = Date.now()
      this.emitter.emit('download:completed', job)
    } catch (err: any) {
      if (job.status === 'paused' || job.status === 'cancelled') {
        return
      }
      job.status = 'failed'
      job.error = err.message || 'Download failed'
      this.emitter.emit('download:failed', job)
    } finally {
      this.abortControllers.delete(job.id)
      this.activeCount = Math.max(0, this.activeCount - 1)
      this.processQueue()
    }
  }
}

// ── ModelHub Class ───────────────────────────────────────────────────────────

class ModelHub extends EventEmitter {
  private downloadQueue: DownloadQueue
  private performanceCache: Map<string, ModelPerformance> = new Map()
  private comparisons: Map<string, ComparisonResult> = new Map()

  constructor() {
    super()
    this.downloadQueue = new DownloadQueue(this)
  }

  // ── Library Search ──────────────────────────────────────────────────────

  searchLibrary(opts?: {
    query?: string
    family?: string
    maxSizeGb?: number
    capabilities?: string[]
  }): LibraryModel[] {
    let results = [...KNOWN_MODELS]

    if (opts?.query) {
      const q = opts.query.toLowerCase()
      results = results.filter(m =>
        m.name.includes(q) || m.description.toLowerCase().includes(q) || m.family.includes(q)
      )
    }

    if (opts?.family) {
      const fam = opts.family.toLowerCase()
      results = results.filter(m => m.family === fam)
    }

    results.sort((a, b) => b.pulls - a.pulls)
    return results
  }

  getFamilies(): string[] {
    const families = new Set(KNOWN_MODELS.map(m => m.family))
    return Array.from(families).sort()
  }

  // ── Model Cards ─────────────────────────────────────────────────────────

  async getModelCard(modelName: string): Promise<ModelCard> {
    const installedModels = await getOllamaModels()
    const installed = installedModels.find(m => m.name === modelName || m.name.startsWith(modelName + ':'))

    let info: Record<string, any> = {}
    if (installed) {
      try {
        info = await getModelInfo(modelName)
      } catch { /* model info unavailable */ }
    }

    const paramSize = installed?.parameterSize || info?.details?.parameter_size || extractParamSize(modelName)
    const quantization = installed?.quantization || info?.details?.quantization_level || 'Q4_K_M'
    const paramBillions = parseParamSize(paramSize)
    const family = info?.details?.family || extractFamily(modelName)

    return {
      name: modelName,
      displayName: formatModelName(modelName),
      family,
      parameterSize: paramSize,
      quantization,
      contextLength: info?.model_info?.context_length ?? guessContextLength(paramBillions),
      license: info?.license ?? 'Unknown',
      description: info?.modelfile ?? findDescription(modelName),
      sizeBytes: installed?.size ?? 0,
      estimatedVramMb: estimateVramMb(paramBillions, quantization),
      capabilities: inferCapabilities(modelName, family),
      installed: !!installed,
    }
  }

  // ── Download Management ─────────────────────────────────────────────────

  startDownload(modelName: string): DownloadJob {
    return this.downloadQueue.enqueue(modelName)
  }

  pauseDownload(jobId: string): boolean {
    return this.downloadQueue.pause(jobId)
  }

  resumeDownload(jobId: string): boolean {
    return this.downloadQueue.resume(jobId)
  }

  cancelDownload(jobId: string): boolean {
    return this.downloadQueue.cancel(jobId)
  }

  getDownloads(): DownloadJob[] {
    return this.downloadQueue.getAll()
  }

  getDownload(jobId: string): DownloadJob | undefined {
    return this.downloadQueue.get(jobId)
  }

  async removeModel(modelName: string): Promise<void> {
    await deleteModel(modelName)
    this.emit('model:removed', { modelName })
  }

  // ── VRAM Estimation ─────────────────────────────────────────────────────

  /**
   * Estimate GPU info using safe execFile (no shell injection).
   * Falls back to system memory estimate on failure.
   */
  async getSystemGpuInfo(): Promise<SystemGpuInfo> {
    const platform = os.platform()

    let gpuName = 'Unknown'
    let totalVramMb = 0

    try {
      if (platform === 'darwin') {
        const { stdout } = await execFileAsync('system_profiler', ['SPDisplaysDataType', '-json'], { timeout: 5000 })
        const data = JSON.parse(stdout)
        const gpu = data?.SPDisplaysDataType?.[0]
        gpuName = gpu?.chipset_model || gpu?.sppci_model || 'Apple GPU'
        // Apple Silicon: GPU uses unified memory — ~75% is accessible
        const totalMem = os.totalmem()
        totalVramMb = Math.round((totalMem / (1024 * 1024)) * 0.75)
      } else if (platform === 'win32') {
        try {
          const { stdout } = await execFileAsync('nvidia-smi', [
            '--query-gpu=name,memory.total,memory.free',
            '--format=csv,noheader,nounits',
          ], { timeout: 5000 })
          const parts = stdout.trim().split(',').map(s => s.trim())
          gpuName = parts[0] || 'NVIDIA GPU'
          totalVramMb = parseInt(parts[1]) || 0
        } catch {
          // No NVIDIA GPU — fallback to system memory estimate
          gpuName = 'Integrated GPU'
          totalVramMb = Math.round(os.totalmem() / (1024 * 1024))
        }
      } else {
        // Linux
        try {
          const { stdout } = await execFileAsync('nvidia-smi', [
            '--query-gpu=name,memory.total',
            '--format=csv,noheader,nounits',
          ], { timeout: 5000 })
          const parts = stdout.trim().split(',').map(s => s.trim())
          gpuName = parts[0] || 'NVIDIA GPU'
          totalVramMb = parseInt(parts[1]) || 0
        } catch {
          gpuName = 'CPU Only'
          totalVramMb = Math.round(os.totalmem() / (1024 * 1024))
        }
      }
    } catch {
      totalVramMb = Math.round(os.totalmem() / (1024 * 1024))
    }

    return {
      gpuName,
      totalVramMb,
      availableVramMb: Math.round(totalVramMb * 0.85),
      platform,
    }
  }

  async canFitModel(modelName: string): Promise<{ fits: boolean; requiredMb: number; availableMb: number }> {
    const card = await this.getModelCard(modelName)
    const gpu = await this.getSystemGpuInfo()
    return {
      fits: card.estimatedVramMb <= gpu.availableVramMb,
      requiredMb: card.estimatedVramMb,
      availableMb: gpu.availableVramMb,
    }
  }

  // ── Side-by-Side Comparison ─────────────────────────────────────────────

  async compareModels(
    modelA: string,
    modelB: string,
    prompt: string,
  ): Promise<ComparisonResult> {
    const id = `cmp-${Date.now()}`
    this.emit('comparison:started', { id, modelA, modelB, prompt })

    const runInference = async (modelName: string) => {
      const start = Date.now()
      let fullResponse = ''
      let tokenCount = 0

      const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt,
          stream: true,
        }),
      })

      if (!response.ok) throw new Error(`Ollama generate failed for ${modelName}: ${response.statusText}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const chunk = JSON.parse(line)
            if (chunk.response) {
              fullResponse += chunk.response
              tokenCount++
            }
            this.emit('comparison:token', { id, model: modelName, token: chunk.response })
          } catch { /* skip */ }
        }
      }

      const latencyMs = Date.now() - start
      const tokensPerSec = latencyMs > 0 ? (tokenCount / (latencyMs / 1000)) : 0

      return { name: modelName, response: fullResponse, tokensPerSec: Math.round(tokensPerSec * 10) / 10, latencyMs }
    }

    const [resultA, resultB] = await Promise.all([
      runInference(modelA),
      runInference(modelB),
    ])

    const result: ComparisonResult = {
      id,
      prompt,
      modelA: resultA,
      modelB: resultB,
      createdAt: Date.now(),
    }

    this.comparisons.set(id, result)
    this.emit('comparison:completed', result)
    return result
  }

  getComparison(id: string): ComparisonResult | undefined {
    return this.comparisons.get(id)
  }

  listComparisons(): ComparisonResult[] {
    return Array.from(this.comparisons.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  // ── Performance Tracking ────────────────────────────────────────────────

  recordInference(modelName: string, tokensPerSec: number, latencyMs: number): void {
    const existing = this.performanceCache.get(modelName)
    if (existing) {
      existing.totalInferences++
      existing.avgTokensPerSec = (existing.avgTokensPerSec * (existing.totalInferences - 1) + tokensPerSec) / existing.totalInferences
      existing.avgLatencyMs = (existing.avgLatencyMs * (existing.totalInferences - 1) + latencyMs) / existing.totalInferences
      existing.lastUsed = Date.now()
    } else {
      this.performanceCache.set(modelName, {
        modelName,
        avgTokensPerSec: tokensPerSec,
        avgLatencyMs: latencyMs,
        totalInferences: 1,
        userRating: 0,
        lastUsed: Date.now(),
      })
    }
  }

  rateModel(modelName: string, rating: number): void {
    const perf = this.performanceCache.get(modelName) ?? {
      modelName,
      avgTokensPerSec: 0,
      avgLatencyMs: 0,
      totalInferences: 0,
      userRating: 0,
      lastUsed: Date.now(),
    }
    perf.userRating = Math.max(0, Math.min(5, rating))
    this.performanceCache.set(modelName, perf)
    this.emit('performance:updated', perf)
  }

  getPerformance(modelName: string): ModelPerformance | undefined {
    return this.performanceCache.get(modelName)
  }

  getAllPerformance(): ModelPerformance[] {
    return Array.from(this.performanceCache.values()).sort((a, b) => b.lastUsed - a.lastUsed)
  }

  // ── Convenience ─────────────────────────────────────────────────────────

  async getInstalledModels(): Promise<OllamaModel[]> {
    return getOllamaModels()
  }

  async isOnline(): Promise<boolean> {
    return isOllamaRunning()
  }

  getRecommended() {
    return RECOMMENDED_MODELS
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function formatModelName(name: string): string {
  const base = name.split(':')[0]
  return base
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function extractParamSize(modelName: string): string {
  const match = modelName.match(/(\d+\.?\d*)\s*[Bb]/)
  if (match) return match[1] + 'B'
  const tag = modelName.split(':')[1]
  if (tag) {
    const tagMatch = tag.match(/^(\d+\.?\d*)[Bb]?/)
    if (tagMatch) return tagMatch[1] + 'B'
  }
  return '7B'
}

function extractFamily(modelName: string): string {
  const base = modelName.split(':')[0].split('/').pop() || modelName
  return base.replace(/[\d.]+$/, '').replace(/-$/, '').toLowerCase()
}

function guessContextLength(paramBillions: number): number {
  if (paramBillions >= 70) return 128000
  if (paramBillions >= 30) return 32768
  if (paramBillions >= 7) return 8192
  return 4096
}

function findDescription(modelName: string): string {
  const lib = KNOWN_MODELS.find(m => modelName.startsWith(m.name))
  return lib?.description ?? `Local model: ${modelName}`
}

function inferCapabilities(modelName: string, family: string): string[] {
  const caps = ['chat']
  const lower = modelName.toLowerCase()
  if (lower.includes('code') || lower.includes('coder') || lower.includes('codestral') || lower.includes('starcoder')) caps.push('code')
  if (lower.includes('vision') || lower.includes('llava')) caps.push('vision')
  if (lower.includes('embed')) caps.push('embeddings')
  if (family === 'qwen' || family === 'llama') caps.push('tools')
  return caps
}

// ── Singleton Export ─────────────────────────────────────────────────────────

export const modelHub = new ModelHub()
