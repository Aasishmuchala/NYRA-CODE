/**
 * Cascade Strategy — start with cheapest model, escalate if confidence is low.
 *
 * Budget-friendly: only uses expensive models when the cheap one isn't confident.
 *
 * Flow:
 *   1. Sort models by cost tier (cheap → medium → expensive)
 *   2. Call the cheapest model first
 *   3. Score the response; if above cascadeThreshold, accept it
 *   4. If below threshold, escalate to next tier
 *   5. Repeat until threshold met or models exhausted
 */

import type { ChatRequest, ChatResponse } from '../../providers/provider-interface'
import type {
  EnsembleCandidate,
  EnsembleResult,
  EnsembleConfig,
  EnsembleModelSpec,
} from '../ensemble-interfaces'
import type { ProviderLookupFn } from '../ensemble-engine'
import { responseScorer } from '../scoring/response-scorer'
import { budgetTracker } from '../budget/budget-tracker'

const COST_ORDER: Record<string, number> = { cheap: 0, medium: 1, expensive: 2 }

export async function cascade(
  request: ChatRequest,
  config: EnsembleConfig,
  lookupProvider: ProviderLookupFn
): Promise<EnsembleResult> {
  const startTime = Date.now()
  budgetTracker.initialize(config.maxBudgetTokens, config.models)

  // Sort by cost tier
  const sorted = [...config.models].sort(
    (a, b) => (COST_ORDER[a.costTier] ?? 1) - (COST_ORDER[b.costTier] ?? 1)
  )

  const candidates: EnsembleCandidate[] = []
  const queryText = request.messages.map((m) => m.content).join(' ')

  for (const spec of sorted) {
    if (budgetTracker.isExhausted()) break

    const candidate = await callModel(spec, request, lookupProvider)
    if (!candidate) continue

    candidates.push(candidate)

    // Score this candidate
    const breakdown = responseScorer.scoreCandidate(candidate, queryText, candidates)
    candidate.score = breakdown.weighted

    // Accept if above threshold
    if (candidate.score >= config.cascadeThreshold) {
      break
    }
  }

  if (candidates.length === 0) {
    throw new Error('All models failed in cascade ensemble')
  }

  // Pick the best we got (last one attempted, or highest scored)
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a), candidates[0])

  return {
    strategy: 'cascade',
    selectedCandidate: best,
    allCandidates: candidates,
    consensus: 1.0, // Only one answer is authoritative in cascade
    totalTokenCost: candidates.reduce((s, c) => s + c.tokenCost, 0),
    totalLatencyMs: Date.now() - startTime,
    budgetRemaining: budgetTracker.getRemaining(),
    metadata: { escalations: candidates.length - 1, threshold: config.cascadeThreshold },
  }
}

async function callModel(
  spec: EnsembleModelSpec,
  request: ChatRequest,
  lookupProvider: ProviderLookupFn
): Promise<EnsembleCandidate | null> {
  const provider = lookupProvider(spec.providerId)
  if (!provider) return null

  try {
    const modelRequest: ChatRequest = { ...request, model: spec.model }
    const start = Date.now()
    const response: ChatResponse = await provider.chat(modelRequest)
    const latencyMs = Date.now() - start
    const tokenCost = response.usage.totalTokens

    budgetTracker.recordSpend(spec.providerId, spec.model, tokenCost)

    return {
      providerId: spec.providerId,
      model: spec.model,
      response,
      score: 0,
      latencyMs,
      tokenCost,
    }
  } catch {
    return null
  }
}
