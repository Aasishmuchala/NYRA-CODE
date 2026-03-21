/**
 * Smart Model Router — Phase 7A
 *
 * Auto-selects the cheapest capable model for each task based on:
 *   1. Task complexity & type (from ReasoningEngine.analyzeTask)
 *   2. Required capabilities (vision, tools, JSON, context window)
 *   3. Cost optimization (cheapest model that meets requirements)
 *   4. Provider health & availability
 *   5. User preferences (local-first, preferred providers)
 *
 * Architecture:
 *   TaskAnalysis + RoutingContext → score each available model → rank → return best
 *
 * The router is injected into agent-orchestrator between task analysis
 * and LLM call, replacing hardcoded preferred→fallback logic.
 */

import type { TaskAnalysis, TaskType, ComplexityLevel } from './reasoning/reasoning-interfaces'
import type { ModelCard, ModelCapabilities, LLMProvider } from './providers/provider-interface'
import { providerRegistry } from './providers/provider-registry'

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoutingContext {
  /** Capabilities the selected model MUST have */
  requiredCapabilities?: Partial<ModelCapabilities>
  /** Maximum cost per 1K input tokens (USD). 0 = no limit */
  maxCostPer1kInput?: number
  /** Prefer local/offline models when available */
  preferLocal?: boolean
  /** Prefer a specific provider (soft preference, not hard filter) */
  preferredProvider?: string
  /** Prefer a specific model (soft preference) */
  preferredModel?: string
  /** Minimum context window needed for this request */
  minContextWindow?: number
  /** Whether the request includes images */
  hasVision?: boolean
  /** Whether the request needs tool calling */
  needsTools?: boolean
  /** Estimated input tokens (for cost calculation) */
  estimatedInputTokens?: number
  /** Estimated output tokens */
  estimatedOutputTokens?: number
}

export interface ModelRoutingDecision {
  providerId: string
  modelId: string
  reason: string
  score: number
  estimatedCost: number  // USD for this request
  alternatives: Array<{
    providerId: string
    modelId: string
    score: number
    estimatedCost: number
  }>
  routingTimeMs: number
}

export interface RoutingPolicy {
  /** Weight for cost factor (0-1). Higher = prefer cheaper */
  costWeight: number
  /** Weight for capability match (0-1). Higher = prefer more capable */
  capabilityWeight: number
  /** Weight for provider health/latency (0-1) */
  healthWeight: number
  /** Weight for task-model specialty alignment (0-1) */
  specialtyWeight: number
  /** Bonus score for local models (0-1) */
  localBonus: number
  /** Bonus score for preferred provider (0-1) */
  preferredBonus: number
}

// ── Default Policy ──────────────────────────────────────────────────────────

const DEFAULT_POLICY: RoutingPolicy = {
  costWeight: 0.30,
  capabilityWeight: 0.25,
  healthWeight: 0.15,
  specialtyWeight: 0.20,
  localBonus: 0.05,
  preferredBonus: 0.05,
}

// ── Task→Model Specialty Map ────────────────────────────────────────────────
// Which model families are best suited for each task type.

const TASK_SPECIALTY_MAP: Record<TaskType, Record<string, number>> = {
  coding: {
    'claude-sonnet': 0.95, 'claude-opus': 0.90, 'gpt-4o': 0.85,
    'gemini-2.5-pro': 0.85, 'gemini-2.5-flash': 0.75,
    'gpt-4o-mini': 0.65, 'gemini-2.0-flash': 0.60,
    'claude-haiku': 0.60, 'gemini-2.0-flash-lite': 0.40,
  },
  analysis: {
    'claude-opus': 0.95, 'claude-sonnet': 0.90, 'gpt-4o': 0.85,
    'gemini-2.5-pro': 0.90, 'gemini-2.5-flash': 0.70,
    'gpt-4o-mini': 0.60, 'gemini-2.0-flash': 0.55,
    'claude-haiku': 0.55,
  },
  creative: {
    'claude-opus': 0.95, 'claude-sonnet': 0.90, 'gpt-4o': 0.80,
    'gemini-2.5-pro': 0.75, 'gpt-4o-mini': 0.60,
    'gemini-2.5-flash': 0.55, 'claude-haiku': 0.50,
  },
  debugging: {
    'claude-sonnet': 0.95, 'claude-opus': 0.90, 'gpt-4o': 0.85,
    'gemini-2.5-pro': 0.80, 'gemini-2.5-flash': 0.65,
    'gpt-4o-mini': 0.55, 'gemini-2.0-flash': 0.50,
  },
  planning: {
    'claude-opus': 0.95, 'claude-sonnet': 0.85, 'gemini-2.5-pro': 0.85,
    'gpt-4o': 0.80, 'gemini-2.5-flash': 0.65,
    'gpt-4o-mini': 0.50, 'claude-haiku': 0.45,
  },
  factual: {
    'gemini-2.5-flash': 0.85, 'gpt-4o-mini': 0.80,
    'gemini-2.0-flash': 0.75, 'claude-haiku': 0.75,
    'gpt-4o': 0.70, 'claude-sonnet': 0.70,
    'gemini-2.0-flash-lite': 0.65,
  },
  general: {
    'claude-sonnet': 0.80, 'gpt-4o': 0.80, 'gemini-2.5-flash': 0.75,
    'gpt-4o-mini': 0.70, 'claude-haiku': 0.65,
    'gemini-2.0-flash': 0.60,
  },
}

// ── Complexity→Minimum Tier Map ─────────────────────────────────────────────
// Minimum cost tier for each complexity level.
// 'simple' tasks can use the cheapest models, 'complex' needs premium.

const COMPLEXITY_MIN_TIER: Record<ComplexityLevel, 'cheap' | 'medium' | 'expensive'> = {
  simple: 'cheap',
  moderate: 'medium',
  complex: 'expensive',
}

// ── Cost tier classification ────────────────────────────────────────────────

function classifyCostTier(card: ModelCard): 'cheap' | 'medium' | 'expensive' {
  const cost = card.costPer1kInput ?? 0
  if (cost <= 0.0003) return 'cheap'       // Flash Lite, Haiku, GPT-4o-mini
  if (cost <= 0.003) return 'medium'        // Flash, Sonnet
  return 'expensive'                        // Pro, Opus, GPT-4o
}

const TIER_SCORE: Record<string, number> = {
  'cheap': 0.3,
  'medium': 0.6,
  'expensive': 1.0,
}

const MIN_TIER_SCORE: Record<string, number> = {
  'cheap': 0.0,
  'medium': 0.3,
  'expensive': 0.6,
}

// ── Smart Model Router ──────────────────────────────────────────────────────

export class ModelRouter {
  private policy: RoutingPolicy
  private modelCacheMs = 0
  private modelCache: Array<{ provider: LLMProvider; card: ModelCard }> = []
  private static readonly CACHE_TTL = 60_000  // 1 minute

  constructor(policy?: Partial<RoutingPolicy>) {
    this.policy = { ...DEFAULT_POLICY, ...policy }
  }

  /**
   * Select the best model for a given task analysis and routing context.
   *
   * Scoring formula per model:
   *   score = (costScore × costWeight)
   *         + (capabilityScore × capabilityWeight)
   *         + (healthScore × healthWeight)
   *         + (specialtyScore × specialtyWeight)
   *         + localBonus + preferredBonus
   */
  async route(
    analysis: TaskAnalysis,
    context: RoutingContext = {},
  ): Promise<ModelRoutingDecision> {
    const startMs = Date.now()

    // 1. Gather all available models from all healthy providers
    const candidates = await this.gatherCandidates()

    // 2. Filter by hard requirements
    const eligible = candidates.filter(c => this.meetsRequirements(c.card, analysis, context))

    if (eligible.length === 0) {
      // Fallback: return preferred model or first available
      const fallback = candidates[0]
      return {
        providerId: fallback?.provider.id || 'openai',
        modelId: fallback?.card.id || 'gpt-4o-mini',
        reason: 'No model met all requirements, using fallback',
        score: 0,
        estimatedCost: 0,
        alternatives: [],
        routingTimeMs: Date.now() - startMs,
      }
    }

    // 3. Score each eligible model
    const scored = eligible.map(c => ({
      ...c,
      score: this.scoreModel(c.card, c.provider, analysis, context),
      estimatedCost: this.estimateCost(c.card, context),
    }))

    // 4. Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score)

    const best = scored[0]
    const alternatives = scored.slice(1, 4).map(s => ({
      providerId: s.provider.id,
      modelId: s.card.id,
      score: s.score,
      estimatedCost: s.estimatedCost,
    }))

    return {
      providerId: best.provider.id,
      modelId: best.card.id,
      reason: this.explainChoice(best.card, analysis, context),
      score: best.score,
      estimatedCost: best.estimatedCost,
      alternatives,
      routingTimeMs: Date.now() - startMs,
    }
  }

  /**
   * Quick route for simple cases — returns just provider + model.
   */
  async quickRoute(
    taskType: TaskType,
    complexity: ComplexityLevel,
    context: RoutingContext = {},
  ): Promise<{ providerId: string; modelId: string }> {
    const analysis: TaskAnalysis = {
      taskText: '',
      complexity,
      ambiguity: 0,
      constraintCount: complexity === 'complex' ? 5 : complexity === 'moderate' ? 2 : 0,
      estimatedSteps: complexity === 'complex' ? 8 : complexity === 'moderate' ? 4 : 1,
      suggestedStrategy: 'chain-of-thought' as any,
      confidence: 0.8,
      taskType,
    }

    const decision = await this.route(analysis, context)
    return { providerId: decision.providerId, modelId: decision.modelId }
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private async gatherCandidates(): Promise<Array<{ provider: LLMProvider; card: ModelCard }>> {
    const now = Date.now()
    if (this.modelCache.length > 0 && now - this.modelCacheMs < ModelRouter.CACHE_TTL) {
      return this.modelCache
    }

    const providers = providerRegistry.getAvailable()
    const candidates: Array<{ provider: LLMProvider; card: ModelCard }> = []

    for (const provider of providers) {
      try {
        const models = await provider.listModels()
        for (const card of models) {
          candidates.push({ provider, card })
        }
      } catch {
        // Provider failed to list models, skip
      }
    }

    this.modelCache = candidates
    this.modelCacheMs = now
    return candidates
  }

  private meetsRequirements(
    card: ModelCard,
    analysis: TaskAnalysis,
    context: RoutingContext,
  ): boolean {
    const caps = card.capabilities

    // Hard capability filters
    if (context.hasVision && !caps.supportsVision) return false
    if (context.needsTools && !caps.supportsTools) return false
    if (context.minContextWindow && caps.contextWindow < context.minContextWindow) return false

    // Required capabilities override
    if (context.requiredCapabilities) {
      const req = context.requiredCapabilities
      if (req.supportsVision && !caps.supportsVision) return false
      if (req.supportsTools && !caps.supportsTools) return false
      if (req.supportsStreaming && !caps.supportsStreaming) return false
      if (req.supportsJson && !caps.supportsJson) return false
      if (req.contextWindow && caps.contextWindow < req.contextWindow) return false
    }

    // Cost ceiling
    if (context.maxCostPer1kInput && (card.costPer1kInput ?? 0) > context.maxCostPer1kInput) {
      return false
    }

    // Complexity minimum tier: don't send complex tasks to cheap models
    const tier = classifyCostTier(card)
    const minTier = COMPLEXITY_MIN_TIER[analysis.complexity]
    if (TIER_SCORE[tier] < MIN_TIER_SCORE[minTier]) return false

    return true
  }

  private scoreModel(
    card: ModelCard,
    provider: LLMProvider,
    analysis: TaskAnalysis,
    context: RoutingContext,
  ): number {
    let score = 0

    // 1. Cost score (lower cost = higher score)
    const costScore = this.scoreCost(card, analysis)
    score += costScore * this.policy.costWeight

    // 2. Capability score (more relevant capabilities = higher)
    const capScore = this.scoreCapabilities(card, context)
    score += capScore * this.policy.capabilityWeight

    // 3. Health score (based on last health check)
    const healthScore = provider.isAvailable() ? 1.0 : 0.1
    score += healthScore * this.policy.healthWeight

    // 4. Specialty score (task type → model family alignment)
    const specialtyScore = this.scoreSpecialty(card, analysis)
    score += specialtyScore * this.policy.specialtyWeight

    // 5. Bonuses
    if (context.preferLocal && provider.isLocal) {
      score += this.policy.localBonus
    }
    if (context.preferredProvider && provider.id === context.preferredProvider) {
      score += this.policy.preferredBonus
    }
    if (context.preferredModel && card.id === context.preferredModel) {
      score += this.policy.preferredBonus * 2  // Double bonus for exact model match
    }

    return Math.min(1.0, Math.max(0, score))
  }

  private scoreCost(card: ModelCard, analysis: TaskAnalysis): number {
    const cost = card.costPer1kInput ?? 0
    if (cost === 0) return 1.0  // Free (local) models get perfect cost score

    // For simple tasks, strongly prefer cheap models
    // For complex tasks, cost matters less
    const costSensitivity = analysis.complexity === 'simple' ? 1.0
      : analysis.complexity === 'moderate' ? 0.7
      : 0.4

    // Normalize: $0.01/1K = 0.0, $0 = 1.0 (linear interpolation)
    const normalizedCost = Math.min(1.0, cost / 0.01)
    return (1.0 - normalizedCost) * costSensitivity
  }

  private scoreCapabilities(card: ModelCard, context: RoutingContext): number {
    const caps = card.capabilities
    let score = 0.5  // Base

    // Reward capabilities that match the context
    if (context.hasVision && caps.supportsVision) score += 0.15
    if (context.needsTools && caps.supportsTools) score += 0.15
    if (caps.supportsStreaming) score += 0.05
    if (caps.supportsJson) score += 0.05

    // Reward larger context windows (logarithmic scale)
    const ctxScore = Math.min(1.0, Math.log2(caps.contextWindow / 4096) / 8)
    score += ctxScore * 0.1

    return Math.min(1.0, score)
  }

  private scoreSpecialty(card: ModelCard, analysis: TaskAnalysis): number {
    const map = TASK_SPECIALTY_MAP[analysis.taskType] || TASK_SPECIALTY_MAP.general

    // Try exact model match first
    if (map[card.id]) return map[card.id]

    // Try fuzzy match on model family
    for (const [pattern, score] of Object.entries(map)) {
      if (card.id.includes(pattern) || card.name.toLowerCase().includes(pattern.toLowerCase())) {
        return score
      }
    }

    // Ollama / local models — decent for simple, worse for complex
    if (card.provider === 'ollama' || card.provider === 'npu') {
      return analysis.complexity === 'simple' ? 0.6 : 0.3
    }

    return 0.5  // Unknown model, neutral score
  }

  private estimateCost(card: ModelCard, context: RoutingContext): number {
    const inputTokens = context.estimatedInputTokens || 500
    const outputTokens = context.estimatedOutputTokens || 200
    const inputCost = ((card.costPer1kInput ?? 0) / 1000) * inputTokens
    const outputCost = ((card.costPer1kOutput ?? 0) / 1000) * outputTokens
    return inputCost + outputCost
  }

  private explainChoice(
    card: ModelCard,
    analysis: TaskAnalysis,
    context: RoutingContext,
  ): string {
    const tier = classifyCostTier(card)
    const parts: string[] = []

    parts.push(`${card.id} selected for ${analysis.complexity} ${analysis.taskType} task`)

    if (tier === 'cheap') parts.push('cost-optimized')
    else if (tier === 'expensive') parts.push('premium tier for quality')

    if (context.hasVision) parts.push('vision-capable')
    if (context.needsTools) parts.push('tool-calling enabled')
    if (context.preferLocal && card.provider === 'ollama') parts.push('local-first preference')

    return parts.join('; ')
  }

  /** Update routing policy at runtime */
  setPolicy(updates: Partial<RoutingPolicy>): void {
    this.policy = { ...this.policy, ...updates }
  }

  getPolicy(): RoutingPolicy {
    return { ...this.policy }
  }

  /** Clear the model cache to force re-discovery */
  invalidateCache(): void {
    this.modelCache = []
    this.modelCacheMs = 0
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────

export const modelRouter = new ModelRouter()
