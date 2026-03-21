/**
 * Specialize Strategy — route to the model best suited for the task type.
 *
 * Uses the model's declared specialties to match against detected task type.
 * Falls back to the highest-weight model if no specialty match is found.
 *
 * Flow:
 *   1. Detect task type from the request (coding, creative, analysis, etc.)
 *   2. Find models whose specialties match
 *   3. Call the best-matching specialist
 *   4. Fall back to primary model if no specialist found
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

const TASK_KEYWORDS: Record<string, string[]> = {
  coding: ['code', 'function', 'implement', 'bug', 'fix', 'class', 'module', 'api'],
  creative: ['write', 'story', 'poem', 'create', 'imagine', 'design', 'brainstorm'],
  analysis: ['analyze', 'compare', 'evaluate', 'assess', 'review', 'examine'],
  math: ['calculate', 'equation', 'formula', 'proof', 'theorem', 'math'],
  planning: ['plan', 'schedule', 'organize', 'roadmap', 'strategy', 'prioritize'],
}

export async function specialize(
  request: ChatRequest,
  config: EnsembleConfig,
  lookupProvider: ProviderLookupFn
): Promise<EnsembleResult> {
  const startTime = Date.now()
  budgetTracker.initialize(config.maxBudgetTokens, config.models)

  const queryText = request.messages.map((m) => m.content).join(' ')
  const taskType = detectTaskType(queryText)

  // Find specialist model
  const specialist = findSpecialist(config.models, taskType)
  const fallback = config.models.find((m) => m.role === 'primary')
    ?? config.models.reduce((a, b) => (b.weight > a.weight ? b : a), config.models[0])

  const selectedSpec = specialist ?? fallback
  const candidates: EnsembleCandidate[] = []

  const provider = lookupProvider(selectedSpec.providerId)
  if (!provider) {
    throw new Error(`Provider not found: ${selectedSpec.providerId}`)
  }

  const modelRequest: ChatRequest = { ...request, model: selectedSpec.model }
  const start = Date.now()
  const response: ChatResponse = await provider.chat(modelRequest)
  const latencyMs = Date.now() - start
  const tokenCost = response.usage.totalTokens

  budgetTracker.recordSpend(selectedSpec.providerId, selectedSpec.model, tokenCost)

  const candidate: EnsembleCandidate = {
    providerId: selectedSpec.providerId,
    model: selectedSpec.model,
    response,
    score: 0,
    latencyMs,
    tokenCost,
  }

  candidates.push(candidate)

  const breakdown = responseScorer.scoreCandidate(candidate, queryText, candidates)
  candidate.score = breakdown.weighted

  return {
    strategy: 'specialize',
    selectedCandidate: candidate,
    allCandidates: candidates,
    consensus: 1.0,
    totalTokenCost: tokenCost,
    totalLatencyMs: Date.now() - startTime,
    budgetRemaining: budgetTracker.getRemaining(),
    metadata: { detectedTaskType: taskType, usedSpecialist: !!specialist },
  }
}

function detectTaskType(text: string): string {
  const lower = text.toLowerCase()
  let bestMatch = 'general'
  let bestCount = 0

  for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS)) {
    const count = keywords.filter((kw) => lower.includes(kw)).length
    if (count > bestCount) {
      bestCount = count
      bestMatch = taskType
    }
  }

  return bestMatch
}

function findSpecialist(models: EnsembleModelSpec[], taskType: string): EnsembleModelSpec | null {
  const specialists = models.filter(
    (m) => m.specialties && m.specialties.includes(taskType)
  )

  if (specialists.length === 0) return null

  // Pick the highest-weight specialist
  return specialists.reduce((a, b) => (b.weight > a.weight ? b : a), specialists[0])
}
