/**
 * Type system for Multi-Model Ensemble Engine
 *
 * Strategies:
 *   majority-vote  → N models vote on best answer
 *   best-of-n      → N generations, score and pick best
 *   cascade         → Cheap model first, escalate if uncertain
 *   specialize      → Route to model best suited for task type
 *   debate          → Models critique each other's answers
 */

import type { ChatRequest, ChatResponse, ModelCard } from '../providers/provider-interface'

// ── Strategy Types ─────────────────────────────────────────

export type EnsembleStrategy =
  | 'majority-vote'
  | 'best-of-n'
  | 'cascade'
  | 'specialize'
  | 'debate'

// ── Candidate & Result ─────────────────────────────────────

/**
 * A single model's contribution to the ensemble.
 */
export interface EnsembleCandidate {
  providerId: string
  model: string
  response: ChatResponse
  score: number
  latencyMs: number
  tokenCost: number
}

/**
 * Final ensemble result after strategy resolution.
 */
export interface EnsembleResult {
  strategy: EnsembleStrategy
  selectedCandidate: EnsembleCandidate
  allCandidates: EnsembleCandidate[]
  consensus: number          // 0-1, agreement level among candidates
  totalTokenCost: number
  totalLatencyMs: number
  budgetRemaining: number
  metadata: Record<string, unknown>
}

// ── Configuration ──────────────────────────────────────────

/**
 * Configuration for a single ensemble run.
 */
export interface EnsembleConfig {
  strategy: EnsembleStrategy
  models: EnsembleModelSpec[]
  maxBudgetTokens: number
  timeoutMs: number
  minConsensus: number       // For majority-vote: minimum agreement ratio
  cascadeThreshold: number   // For cascade: confidence below this escalates
  debateRounds: number       // For debate: number of critique rounds
  temperatureSpread: boolean // Vary temperature across candidates
}

/**
 * Specification for a model participating in the ensemble.
 */
export interface EnsembleModelSpec {
  providerId: string
  model: string
  role: 'primary' | 'secondary' | 'judge' | 'specialist'
  weight: number             // Scoring weight (higher = more trusted)
  costTier: 'cheap' | 'medium' | 'expensive'
  specialties?: string[]     // Task types this model excels at
}

// ── Scoring ────────────────────────────────────────────────

/**
 * Criteria for scoring a candidate response.
 */
export interface ScoringCriteria {
  coherence: number          // 0-1 weight
  relevance: number
  completeness: number
  consistency: number        // Agreement with other candidates
  costEfficiency: number     // Inverse of token cost
}

/**
 * Detailed score breakdown for a candidate.
 */
export interface ScoreBreakdown {
  coherence: number
  relevance: number
  completeness: number
  consistency: number
  costEfficiency: number
  weighted: number           // Final weighted score
}

// ── Budget ─────────────────────────────────────────────────

/**
 * Budget tracker state.
 */
export interface BudgetState {
  totalBudget: number
  spent: number
  remaining: number
  allocations: BudgetAllocation[]
}

/**
 * Per-model budget allocation.
 */
export interface BudgetAllocation {
  providerId: string
  model: string
  allocated: number
  spent: number
}

// ── Debate ─────────────────────────────────────────────────

/**
 * A single round in a debate between models.
 */
export interface DebateRound {
  round: number
  proposer: EnsembleModelSpec
  critique: string
  defender: EnsembleModelSpec
  rebuttal: string
}

// ── Defaults ───────────────────────────────────────────────

export const DEFAULT_ENSEMBLE_CONFIG: EnsembleConfig = {
  strategy: 'best-of-n',
  models: [],
  maxBudgetTokens: 16000,
  timeoutMs: 60000,
  minConsensus: 0.6,
  cascadeThreshold: 0.7,
  debateRounds: 2,
  temperatureSpread: true,
}

export const DEFAULT_SCORING_CRITERIA: ScoringCriteria = {
  coherence: 0.25,
  relevance: 0.30,
  completeness: 0.25,
  consistency: 0.10,
  costEfficiency: 0.10,
}
