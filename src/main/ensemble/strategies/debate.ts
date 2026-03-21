/**
 * Debate Strategy — models critique and refine each other's answers.
 *
 * Produces the deepest analysis but takes longest. Best for high-stakes decisions.
 *
 * Flow:
 *   1. Model A generates initial response
 *   2. Model B critiques Model A's response
 *   3. Model A responds to critique (rebuttal)
 *   4. Repeat for N rounds
 *   5. Judge model (or scorer) picks the best final answer
 */

import type { ChatRequest, ChatResponse } from '../../providers/provider-interface'
import type {
  EnsembleCandidate,
  EnsembleResult,
  EnsembleConfig,
  EnsembleModelSpec,
  DebateRound,
} from '../ensemble-interfaces'
import type { ProviderLookupFn } from '../ensemble-engine'
import { responseScorer } from '../scoring/response-scorer'
import { budgetTracker } from '../budget/budget-tracker'

export async function debate(
  request: ChatRequest,
  config: EnsembleConfig,
  lookupProvider: ProviderLookupFn
): Promise<EnsembleResult> {
  const startTime = Date.now()
  budgetTracker.initialize(config.maxBudgetTokens, config.models)

  if (config.models.length < 2) {
    throw new Error('Debate strategy requires at least 2 models')
  }

  const proposer = config.models[0]
  const critic = config.models[1]
  const queryText = request.messages.map((m) => m.content).join(' ')

  const debateRounds: DebateRound[] = []
  const candidates: EnsembleCandidate[] = []

  // Step 1: Initial proposal
  let currentAnswer = await callModelForContent(
    proposer,
    request,
    lookupProvider,
    candidates
  )

  // Step 2: Debate rounds
  for (let round = 0; round < config.debateRounds; round++) {
    if (budgetTracker.isExhausted()) break

    // Critic critiques
    const critiqueRequest: ChatRequest = {
      ...request,
      messages: [
        ...request.messages,
        {
          role: 'assistant' as const,
          content: currentAnswer,
        },
        {
          role: 'user' as const,
          content: `Critically evaluate the above response. Identify weaknesses, errors, or missing perspectives. Be specific and constructive.`,
        },
      ],
      model: critic.model,
    }

    const critique = await callModelForContent(
      critic,
      critiqueRequest,
      lookupProvider,
      candidates
    )

    // Proposer rebuts
    const rebuttalRequest: ChatRequest = {
      ...request,
      messages: [
        ...request.messages,
        {
          role: 'assistant' as const,
          content: currentAnswer,
        },
        {
          role: 'user' as const,
          content: `A reviewer provided this critique:\n\n${critique}\n\nAddress these points and provide an improved response.`,
        },
      ],
      model: proposer.model,
    }

    const rebuttal = await callModelForContent(
      proposer,
      rebuttalRequest,
      lookupProvider,
      candidates
    )

    debateRounds.push({
      round: round + 1,
      proposer,
      critique,
      defender: proposer,
      rebuttal,
    })

    currentAnswer = rebuttal
  }

  // Score all candidates
  const ranked = responseScorer.rankCandidates(candidates, queryText)
  const consensus = responseScorer.computeConsensus(candidates)

  // The final rebuttal is our best answer — find it
  const finalCandidate = ranked[0]

  return {
    strategy: 'debate',
    selectedCandidate: finalCandidate,
    allCandidates: ranked,
    consensus,
    totalTokenCost: candidates.reduce((s, c) => s + c.tokenCost, 0),
    totalLatencyMs: Date.now() - startTime,
    budgetRemaining: budgetTracker.getRemaining(),
    metadata: { debateRounds, roundCount: debateRounds.length },
  }
}

async function callModelForContent(
  spec: EnsembleModelSpec,
  request: ChatRequest,
  lookupProvider: ProviderLookupFn,
  candidates: EnsembleCandidate[]
): Promise<string> {
  const provider = lookupProvider(spec.providerId)
  if (!provider) throw new Error(`Provider not found: ${spec.providerId}`)

  const modelRequest: ChatRequest = { ...request, model: spec.model }
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

  return response.content
}
