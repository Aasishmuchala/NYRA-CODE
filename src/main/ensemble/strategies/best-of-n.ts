/**
 * Best-of-N Strategy — generate N responses from one or more models, pick the best.
 *
 * Useful for creative tasks where quality variance is high.
 * Temperature spread can be applied to diversify outputs.
 *
 * Flow:
 *   1. Generate N candidates (possibly with varying temperatures)
 *   2. Score each with the response scorer
 *   3. Return the highest-scoring candidate
 */

import type { ChatRequest, ChatResponse } from '../../providers/provider-interface'
import type {
  EnsembleCandidate,
  EnsembleResult,
  EnsembleConfig,
} from '../ensemble-interfaces'
import type { ProviderLookupFn } from '../ensemble-engine'
import { responseScorer } from '../scoring/response-scorer'
import { budgetTracker } from '../budget/budget-tracker'

export async function bestOfN(
  request: ChatRequest,
  config: EnsembleConfig,
  lookupProvider: ProviderLookupFn
): Promise<EnsembleResult> {
  const startTime = Date.now()
  budgetTracker.initialize(config.maxBudgetTokens, config.models)

  const candidates: EnsembleCandidate[] = []
  const baseTemp = request.temperature ?? 0.7

  for (let i = 0; i < config.models.length; i++) {
    const spec = config.models[i]
    if (budgetTracker.isExhausted()) break

    const provider = lookupProvider(spec.providerId)
    if (!provider) continue

    // Optionally spread temperature to diversify outputs
    const temperature = config.temperatureSpread
      ? baseTemp + (i - Math.floor(config.models.length / 2)) * 0.15
      : baseTemp

    const modelRequest: ChatRequest = {
      ...request,
      model: spec.model,
      temperature: Math.max(0, Math.min(2, temperature)),
    }

    try {
      const start = Date.now()
      const response: ChatResponse = await provider.chat(modelRequest)
      const latencyMs = Date.now() - start
      const tokenCost = response.usage.totalTokens

      budgetTracker.recordSpend(spec.providerId, spec.model, tokenCost)

      candidates.push({
        providerId: spec.providerId,
        model: spec.model,
        response,
        score: 0,
        latencyMs,
        tokenCost,
      })
    } catch {
      // Skip failed models
    }
  }

  if (candidates.length === 0) {
    throw new Error('All models failed in best-of-n ensemble')
  }

  const queryText = request.messages.map((m) => m.content).join(' ')
  const ranked = responseScorer.rankCandidates(candidates, queryText)
  const consensus = responseScorer.computeConsensus(candidates)

  return {
    strategy: 'best-of-n',
    selectedCandidate: ranked[0],
    allCandidates: ranked,
    consensus,
    totalTokenCost: candidates.reduce((s, c) => s + c.tokenCost, 0),
    totalLatencyMs: Date.now() - startTime,
    budgetRemaining: budgetTracker.getRemaining(),
    metadata: { generationCount: candidates.length, temperatureSpread: config.temperatureSpread },
  }
}
