/**
 * Majority Vote Strategy — run N models in parallel, pick the answer most agree on.
 *
 * Flow:
 *   1. Fan-out request to all models simultaneously
 *   2. Score each response with the response scorer
 *   3. Compute pairwise similarity (Jaccard on word sets)
 *   4. Select the candidate with highest agreement + quality score
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

export async function majorityVote(
  request: ChatRequest,
  config: EnsembleConfig,
  lookupProvider: ProviderLookupFn
): Promise<EnsembleResult> {
  const startTime = Date.now()
  budgetTracker.initialize(config.maxBudgetTokens, config.models)

  // Fan out to all models in parallel
  const promises = config.models.map((spec) => callModel(spec, request, lookupProvider))
  const candidates = (await Promise.allSettled(promises))
    .filter((r): r is PromiseFulfilledResult<EnsembleCandidate> => r.status === 'fulfilled')
    .map((r) => r.value)

  if (candidates.length === 0) {
    throw new Error('All models failed in majority-vote ensemble')
  }

  // Score and rank
  const queryText = request.messages.map((m) => m.content).join(' ')
  const ranked = responseScorer.rankCandidates(candidates, queryText)
  const consensus = responseScorer.computeConsensus(candidates)

  const totalTokens = candidates.reduce((sum, c) => sum + c.tokenCost, 0)

  return {
    strategy: 'majority-vote',
    selectedCandidate: ranked[0],
    allCandidates: ranked,
    consensus,
    totalTokenCost: totalTokens,
    totalLatencyMs: Date.now() - startTime,
    budgetRemaining: budgetTracker.getRemaining(),
    metadata: { votingRound: 1, candidateCount: candidates.length },
  }
}

async function callModel(
  spec: EnsembleModelSpec,
  request: ChatRequest,
  lookupProvider: ProviderLookupFn
): Promise<EnsembleCandidate> {
  const provider = lookupProvider(spec.providerId)
  if (!provider) throw new Error(`Provider not found: ${spec.providerId}`)

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
    score: 0, // Scored later by responseScorer
    latencyMs,
    tokenCost,
  }
}
