/**
 * Smart Model Router (Year 2 Features)
 *
 * Decides whether to route a query to a local model (Ollama) or cloud model
 * based on query complexity, latency requirements, and cost.
 *
 * Decision factors:
 * - Query complexity (token count, reasoning required)
 * - Latency target (voice queries need <200ms first-token)
 * - Cost budget (daily/monthly spending limits)
 * - Model capability (code gen, reasoning, creative writing)
 * - Privacy sensitivity (user can flag queries as "local only")
 * - Available local models and their capabilities
 */
import { EventEmitter } from 'events'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export type ModelTier = 'local' | 'cloud-fast' | 'cloud-smart' | 'cloud-reasoning'

export interface RoutingDecision {
  tier: ModelTier
  modelId: string
  reason: string
  estimatedLatencyMs: number
  estimatedCost: number
  confidence: number
}

export interface QueryContext {
  text: string
  type: 'chat' | 'code' | 'reasoning' | 'creative' | 'search' | 'voice'
  maxLatencyMs?: number
  localOnly?: boolean
  previousTurns?: number
  hasImages?: boolean
  hasCode?: boolean
}

export interface ModelProfile {
  id: string
  tier: ModelTier
  maxTokens: number
  strengths: string[]
  avgLatencyMs: number
  costPer1kTokens: number
  available: boolean
  contextWindow: number
}

export interface CostBudget {
  dailyLimitCents: number
  monthlyLimitCents: number
  spentTodayCents: number
  spentThisMonthCents: number
}

const DEFAULT_MODELS: ModelProfile[] = [
  { id: 'ollama/llama3.2:3b', tier: 'local', maxTokens: 4096, strengths: ['chat', 'quick'], avgLatencyMs: 50, costPer1kTokens: 0, available: false, contextWindow: 8192 },
  { id: 'ollama/codellama:13b', tier: 'local', maxTokens: 4096, strengths: ['code'], avgLatencyMs: 200, costPer1kTokens: 0, available: false, contextWindow: 16384 },
  { id: 'ollama/mistral:7b', tier: 'local', maxTokens: 4096, strengths: ['chat', 'reasoning'], avgLatencyMs: 100, costPer1kTokens: 0, available: false, contextWindow: 32768 },
  { id: 'openai/gpt-4o-mini', tier: 'cloud-fast', maxTokens: 16384, strengths: ['chat', 'quick', 'code'], avgLatencyMs: 300, costPer1kTokens: 0.015, available: true, contextWindow: 128000 },
  { id: 'anthropic/claude-haiku-4-5', tier: 'cloud-fast', maxTokens: 8192, strengths: ['chat', 'quick', 'code'], avgLatencyMs: 250, costPer1kTokens: 0.025, available: true, contextWindow: 200000 },
  { id: 'openai/gpt-4o', tier: 'cloud-smart', maxTokens: 16384, strengths: ['chat', 'code', 'reasoning', 'creative'], avgLatencyMs: 800, costPer1kTokens: 0.25, available: true, contextWindow: 128000 },
  { id: 'anthropic/claude-sonnet-4-6', tier: 'cloud-smart', maxTokens: 8192, strengths: ['chat', 'code', 'reasoning', 'creative'], avgLatencyMs: 600, costPer1kTokens: 0.3, available: true, contextWindow: 200000 },
  { id: 'anthropic/claude-opus-4-6', tier: 'cloud-reasoning', maxTokens: 8192, strengths: ['reasoning', 'creative', 'code', 'analysis'], avgLatencyMs: 2000, costPer1kTokens: 1.5, available: true, contextWindow: 200000 },
  { id: 'openai/o3', tier: 'cloud-reasoning', maxTokens: 32768, strengths: ['reasoning', 'code', 'math', 'analysis'], avgLatencyMs: 5000, costPer1kTokens: 2.0, available: true, contextWindow: 200000 },
]

export class ModelRouter extends EventEmitter {
  private models: ModelProfile[]
  private budget: CostBudget
  private routingHistory: Array<{ timestamp: number; decision: RoutingDecision; feedback?: 'good' | 'bad' }> = []

  constructor(models?: ModelProfile[]) {
    super()
    this.models = models || [...DEFAULT_MODELS]
    this.budget = { dailyLimitCents: 500, monthlyLimitCents: 5000, spentTodayCents: 0, spentThisMonthCents: 0 }
  }

  init(): void {
    const dataDir = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra')
    const filePath = join(dataDir, 'model-router.json')

    try {
      if (existsSync(filePath)) {
        const data = readFileSync(filePath, 'utf-8')
        const parsed = JSON.parse(data)

        if (parsed.budget) {
          this.budget = parsed.budget
        }
        if (parsed.models && Array.isArray(parsed.models)) {
          // Merge loaded model availability and routing configs
          for (const loadedModel of parsed.models) {
            const idx = this.models.findIndex(m => m.id === loadedModel.id)
            if (idx >= 0) {
              this.models[idx].available = loadedModel.available
            }
          }
        }
        if (parsed.routingHistory && Array.isArray(parsed.routingHistory)) {
          this.routingHistory = parsed.routingHistory
        }
      }
    } catch (err) {
      console.warn(`Failed to load model-router.json: ${err}`)
    }
  }

  shutdown(): void {
    const dataDir = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra')
    mkdirSync(dataDir, { recursive: true })
    const filePath = join(dataDir, 'model-router.json')

    try {
      const data = {
        budget: this.budget,
        models: this.models,
        routingHistory: this.routingHistory,
      }
      writeFileSync(filePath, JSON.stringify(data, null, 2))
    } catch (err) {
      console.warn(`Failed to save model-router.json: ${err}`)
    }
  }

  route(query: QueryContext): RoutingDecision {
    if (query.localOnly) {
      return this.routeLocal(query)
    }

    const complexity = this.estimateComplexity(query)
    const budgetAvailable = this.budget.dailyLimitCents - this.budget.spentTodayCents

    if (query.type === 'voice' || (query.maxLatencyMs && query.maxLatencyMs < 500)) {
      return this.routeLowLatency(query, complexity, budgetAvailable)
    }

    if (complexity < 0.3) return this.selectBest(query, 'local', 'cloud-fast')
    if (complexity < 0.6) return this.selectBest(query, 'cloud-fast', 'cloud-smart')
    if (complexity < 0.85) return this.selectBest(query, 'cloud-smart')
    return this.selectBest(query, 'cloud-reasoning', 'cloud-smart')
  }

  private estimateComplexity(query: QueryContext): number {
    let score = 0
    const text = query.text.toLowerCase()
    const wordCount = text.split(/\s+/).length

    if (wordCount > 200) score += 0.2
    else if (wordCount > 50) score += 0.1

    if (query.type === 'reasoning') score += 0.4
    if (query.type === 'code') score += 0.2
    if (query.type === 'creative') score += 0.15

    if (text.includes('explain') || text.includes('analyze') || text.includes('compare')) score += 0.15
    if (text.includes('step by step') || text.includes('reasoning')) score += 0.2
    if (text.includes('debug') || text.includes('refactor') || text.includes('architect')) score += 0.25
    if (text.includes('write a') || text.includes('create a') || text.includes('build a')) score += 0.1

    if (query.hasImages) score += 0.3
    if (query.hasCode) score += 0.15
    if ((query.previousTurns || 0) > 10) score += 0.1

    return Math.min(score, 1)
  }

  private routeLocal(query: QueryContext): RoutingDecision {
    const locals = this.models.filter(m => m.tier === 'local' && m.available)
    if (locals.length === 0) {
      return { tier: 'local', modelId: 'ollama/llama3.2:3b', reason: 'No local models available — install via Ollama', estimatedLatencyMs: 0, estimatedCost: 0, confidence: 0 }
    }

    const best = this.pickBestForQuery(locals, query)
    return { tier: 'local', modelId: best.id, reason: 'Local-only mode', estimatedLatencyMs: best.avgLatencyMs, estimatedCost: 0, confidence: 0.7 }
  }

  private routeLowLatency(query: QueryContext, complexity: number, budgetCents: number): RoutingDecision {
    const locals = this.models.filter(m => m.tier === 'local' && m.available)
    if (locals.length > 0 && complexity < 0.4) {
      const best = this.pickBestForQuery(locals, query)
      return { tier: 'local', modelId: best.id, reason: 'Low latency + simple query → local', estimatedLatencyMs: best.avgLatencyMs, estimatedCost: 0, confidence: 0.8 }
    }

    return this.selectBest(query, 'cloud-fast')
  }

  private selectBest(query: QueryContext, ...tiers: ModelTier[]): RoutingDecision {
    const candidates = this.models.filter(m => tiers.includes(m.tier) && m.available)
    if (candidates.length === 0) {
      const anyAvailable = this.models.filter(m => m.available)
      if (anyAvailable.length === 0) {
        return { tier: 'cloud-fast', modelId: 'openai/gpt-4o-mini', reason: 'No models available', estimatedLatencyMs: 300, estimatedCost: 0.015, confidence: 0 }
      }
      const best = this.pickBestForQuery(anyAvailable, query)
      return { tier: best.tier, modelId: best.id, reason: 'Fallback — preferred tier unavailable', estimatedLatencyMs: best.avgLatencyMs, estimatedCost: best.costPer1kTokens, confidence: 0.5 }
    }

    const best = this.pickBestForQuery(candidates, query)
    return {
      tier: best.tier,
      modelId: best.id,
      reason: `Best match for ${query.type} query in ${tiers.join('/')} tier`,
      estimatedLatencyMs: best.avgLatencyMs,
      estimatedCost: best.costPer1kTokens,
      confidence: 0.85,
    }
  }

  private pickBestForQuery(models: ModelProfile[], query: QueryContext): ModelProfile {
    return models.reduce((best, m) => {
      const score = m.strengths.includes(query.type) ? 2 : 0
      const bestScore = best.strengths.includes(query.type) ? 2 : 0
      return score > bestScore ? m : best
    })
  }

  setModelAvailability(modelId: string, available: boolean): void {
    const model = this.models.find(m => m.id === modelId)
    if (model) model.available = available
  }

  addModel(profile: ModelProfile): void {
    this.models.push(profile)
  }

  getAvailableModels(): ModelProfile[] {
    return this.models.filter(m => m.available)
  }

  recordSpend(cents: number): void {
    this.budget.spentTodayCents += cents
    this.budget.spentThisMonthCents += cents
  }

  setBudget(daily: number, monthly: number): void {
    this.budget.dailyLimitCents = daily
    this.budget.monthlyLimitCents = monthly
  }

  getBudget(): CostBudget {
    return { ...this.budget }
  }

  resetDailySpend(): void {
    this.budget.spentTodayCents = 0
  }

  recordFeedback(modelId: string, feedback: 'good' | 'bad'): void {
    const recent = this.routingHistory.findLast(h => h.decision.modelId === modelId)
    if (recent) recent.feedback = feedback
  }

  getRoutingStats(): { total: number; byTier: Record<string, number>; satisfaction: number } {
    const byTier: Record<string, number> = {}
    let good = 0, total = 0
    for (const h of this.routingHistory) {
      byTier[h.decision.tier] = (byTier[h.decision.tier] || 0) + 1
      if (h.feedback === 'good') good++
      if (h.feedback) total++
    }
    return { total: this.routingHistory.length, byTier, satisfaction: total > 0 ? good / total : 0 }
  }
}

export const modelRouter = new ModelRouter()
