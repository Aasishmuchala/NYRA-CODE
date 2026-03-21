/**
 * Ensemble Module — Multi-Model Inference Engine
 *
 * Strategies:
 *   majority-vote  → N models vote on best answer
 *   best-of-n      → N generations, score and pick best
 *   cascade         → Cheap model first, escalate if uncertain
 *   specialize      → Route to model best suited for task type
 *   debate          → Models critique each other's answers
 *
 * Usage:
 *   import { ensembleEngine } from './ensemble'
 *   const result = await ensembleEngine.execute(request, config, lookupProvider)
 */

// ── Types ─────────────────────────────────────────────────────
export type {
  EnsembleStrategy,
  EnsembleCandidate,
  EnsembleResult,
  EnsembleConfig,
  EnsembleModelSpec,
  ScoringCriteria,
  ScoreBreakdown,
  BudgetState,
  BudgetAllocation,
  DebateRound,
} from './ensemble-interfaces'

export {
  DEFAULT_ENSEMBLE_CONFIG,
  DEFAULT_SCORING_CRITERIA,
} from './ensemble-interfaces'

// ── Engine ────────────────────────────────────────────────────
export { ensembleEngine } from './ensemble-engine'
export type { ProviderLookupFn } from './ensemble-engine'

// ── Scoring ───────────────────────────────────────────────────
export { responseScorer } from './scoring/response-scorer'

// ── Budget ────────────────────────────────────────────────────
export { budgetTracker } from './budget/budget-tracker'

// ── Strategies (for direct use if needed) ─────────────────────
export { majorityVote } from './strategies/majority-vote'
export { bestOfN } from './strategies/best-of-n'
export { cascade } from './strategies/cascade'
export { specialize } from './strategies/specialize'
export { debate } from './strategies/debate'
