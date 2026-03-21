/**
 * Reasoning Module — Multi-Strategy Reasoning Engine
 *
 * Strategies:
 *   Chain-of-Thought (CoT) → Sequential reasoning for simple tasks
 *   Tree-of-Thought (ToT) → Branching exploration for ambiguous/creative tasks
 *   Graph-of-Thought (GoT) → DAG-based reasoning for multi-constraint problems
 *
 * Usage:
 *   import { reasoningEngine } from './reasoning'
 *   const result = await reasoningEngine.execute(taskText, llmCall)
 */

// ── Types ─────────────────────────────────────────────────────
export type {
  ReasoningStrategy,
  TaskAnalysis,
  ReasoningStep,
  ReasoningBranch,
  ReasoningGraph,
  ReasoningNode,
  ReasoningEdge,
  ReasoningResult,
  ReasoningConfig,
  ReflectionResult,
} from './reasoning-interfaces'

export { DEFAULT_REASONING_CONFIG } from './reasoning-interfaces'

// ── Strategy Implementations ──────────────────────────────────
export { chainOfThought } from './chain-of-thought'
export type { StepGenerator } from './chain-of-thought'

export { treeOfThought } from './tree-of-thought'
export type { StepScorer } from './tree-of-thought'

export { graphOfThought } from './graph-of-thought'
export type { NodeResolver } from './graph-of-thought'

// ── Orchestrator ──────────────────────────────────────────────
export { reasoningEngine } from './reasoning-engine'
export type { LLMCallFn } from './reasoning-engine'

// ── Reflection ────────────────────────────────────────────────
export { selfCritique } from './reflection/self-critique'
