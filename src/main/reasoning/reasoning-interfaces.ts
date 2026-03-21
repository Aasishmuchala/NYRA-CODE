/**
 * Type system for multi-strategy reasoning engine (CoT, ToT, GoT)
 * Used in Electron app for structured reasoning and decision-making
 */

/**
 * Supported reasoning strategies
 */
export type ReasoningStrategy = 'chain-of-thought' | 'tree-of-thought' | 'graph-of-thought';

/**
 * Complexity levels for task analysis
 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex';

/**
 * Task type categories
 */
export type TaskType = 'factual' | 'creative' | 'debugging' | 'planning' | 'analysis' | 'coding' | 'general';

/**
 * Step role types
 */
export type StepRole = 'reasoning' | 'observation' | 'action' | 'conclusion';

/**
 * Branch status in tree-of-thought
 */
export type BranchStatus = 'exploring' | 'promising' | 'pruned' | 'selected';

/**
 * Node types in graph-of-thought
 */
export type NodeType = 'premise' | 'inference' | 'constraint' | 'conclusion';

/**
 * Edge relation types in graph-of-thought
 */
export type EdgeRelation = 'requires' | 'supports' | 'contradicts' | 'refines';

/**
 * Result of analyzing a task before choosing strategy
 */
export interface TaskAnalysis {
  taskText: string;
  complexity: ComplexityLevel;
  ambiguity: number;
  constraintCount: number;
  estimatedSteps: number;
  suggestedStrategy: ReasoningStrategy;
  confidence: number;
  taskType: TaskType;
}

/**
 * Single step in a reasoning chain or tree
 */
export interface ReasoningStep {
  id: string;
  content: string;
  role: StepRole;
  parentId: string | null;
  children: string[];
  score: number;
  tokenCost: number;
  timestamp: number;
  metadata: Record<string, unknown>;
}

/**
 * Branch in tree-of-thought reasoning
 */
export interface ReasoningBranch {
  id: string;
  steps: ReasoningStep[];
  totalScore: number;
  status: BranchStatus;
  depth: number;
}

/**
 * Single node in graph-of-thought reasoning
 */
export interface ReasoningNode {
  id: string;
  content: string;
  type: NodeType;
  resolved: boolean;
  value: string | null;
  dependencies: string[];
}

/**
 * Edge connecting nodes in graph-of-thought reasoning
 */
export interface ReasoningEdge {
  from: string;
  to: string;
  relation: EdgeRelation;
}

/**
 * Graph structure for graph-of-thought reasoning
 */
export interface ReasoningGraph {
  nodes: Map<string, ReasoningNode>;
  edges: ReasoningEdge[];
}

/**
 * Configuration for reasoning engine
 */
export interface ReasoningConfig {
  maxDepth: number;
  maxBranches: number;
  pruneThreshold: number;
  tokenBudget: number;
  enableReflection: boolean;
  timeoutMs: number;
}

/**
 * Complete reasoning result with strategy-specific data
 */
export interface ReasoningResult {
  strategy: ReasoningStrategy;
  analysis: TaskAnalysis;
  steps: ReasoningStep[];
  conclusion: string;
  confidence: number;
  totalTokenCost: number;
  durationMs: number;
  branches?: ReasoningBranch[];
  graph?: ReasoningGraph;
}

/**
 * Reflection critique and improvements
 */
export interface ReflectionResult {
  originalResult: ReasoningResult;
  critique: string;
  improvements: string[];
  revisedConclusion: string | null;
  confidenceAdjustment: number;
}

/**
 * Default configuration for reasoning engine
 */
export const DEFAULT_REASONING_CONFIG: ReasoningConfig = {
  maxDepth: 5,
  maxBranches: 3,
  pruneThreshold: 0.3,
  tokenBudget: 8000,
  enableReflection: true,
  timeoutMs: 30000,
};
