/**
 * Custom Agent Framework — Phase 1.3 of the Nyra 5-Year Plan
 *
 * Extends AgentDefinition to support custom agents, templates, capabilities,
 * and learning profiles. Backwards-compatible with existing AgentDefinition.
 */

import type { AgentDefinition, AgentRole, AgentStatus, AgentState } from '../agent-registry'

/**
 * Extended role type that allows custom string roles beyond the hardcoded 11
 */
export type ExtendedAgentRole = AgentRole | string

/**
 * Agent capability — what an agent can do
 */
export interface AgentCapability {
  /** e.g. 'code-review', 'web-research', 'data-analysis' */
  name: string
  /** semver: '1.0.0' */
  version: string
  /** Human-readable description */
  description: string
  /** Other capabilities this depends on */
  requires?: string[]
}

/**
 * Learning profile — how an agent improves over time
 */
export interface AgentLearningProfile {
  /** Total tasks completed by this agent */
  totalTasksCompleted: number
  /** Success rate as decimal 0-1 */
  successRate: number
  /** Average tokens per task */
  avgTokensPerTask: number
  /** Average latency in milliseconds */
  avgLatencyMs: number
  /** Topics where this agent excels */
  strengthAreas: string[]
  /** Topics where this agent struggles */
  weaknessAreas: string[]
  /** User rating 0-5 average */
  userRating: number
  /** Unix timestamp of last update */
  lastUpdatedAt: number
}

/**
 * Model preference with fallback chain
 */
export interface ModelPreference {
  /** Model identifier */
  modelId: string
  /** Provider: 'openai', 'anthropic', 'ollama', etc. */
  provider?: string
  /** Lower priority = higher precedence */
  priority: number
  /** Conditions for using this model */
  conditions?: {
    /** Only use for these task types */
    taskType?: string[]
    /** Only if task is below this token estimate */
    maxTokens?: number
    /** Whether model must run locally */
    requiresLocal?: boolean
  }
}

/**
 * Extended agent definition for custom agents
 * Fully backwards-compatible with AgentDefinition
 */
export interface CustomAgentDefinition extends AgentDefinition {
  // ===== Custom fields =====
  /** true for DEFAULT_AGENTS, false for user-created */
  isBuiltIn: boolean
  /** Unix timestamp when created */
  createdAt: number
  /** Unix timestamp of last update */
  updatedAt: number
  /** 'system' or user identifier */
  createdBy: string

  // ===== Enhanced capabilities =====
  /** What this agent can do */
  capabilities: AgentCapability[]
  /** Model preferences in order of priority */
  modelPreferences: ModelPreference[]

  // ===== Learning =====
  /** Performance and learning data */
  learningProfile?: AgentLearningProfile

  // ===== Template info =====
  /** Which template this was created from */
  templateId?: string
  /** Template version when created */
  templateVersion?: string

  // ===== Organization =====
  /** Tags for search/filter */
  tags: string[]
  /** Custom user-defined metadata */
  metadata: Record<string, unknown>
}

/**
 * Agent template — blueprint for creating agents
 */
export interface AgentTemplate {
  /** Unique template identifier */
  id: string
  /** Display name */
  name: string
  /** Long-form description */
  description: string
  /** Category: 'development', 'writing', 'research', 'operations', etc. */
  category: string
  /** Icon name/identifier */
  icon: string

  // ===== Defaults for new agents =====
  /** Default role for agents from this template */
  defaultRole: ExtendedAgentRole
  /** Default system prompt */
  defaultSystemPrompt: string
  /** Default model preferences */
  defaultModelPreferences: ModelPreference[]
  /** Default allowed tools */
  defaultAllowedTools: string[]
  /** Default folder access level */
  defaultMaxFolderAccess: string
  /** Whether agents can request user approval */
  defaultCanRequestApproval: boolean
  /** Whether agents can spawn sub-agents */
  defaultCanSpawnSubagents: boolean
  /** Default token budget */
  defaultTokenBudget: number
  /** Default capabilities */
  defaultCapabilities: AgentCapability[]
  /** Default tags */
  defaultTags: string[]

  // ===== Template metadata =====
  /** Author name */
  author: string
  /** Semantic version */
  version: string
  /** Whether this is an official template */
  isOfficial: boolean
  /** Download count (for popular templates) */
  downloads?: number
}

/**
 * Agent performance metrics
 */
export interface AgentPerformanceMetrics {
  /** Agent ID this metrics is for */
  agentId: string
  /** Time period: 'hour', 'day', 'week', 'month' */
  period: 'hour' | 'day' | 'week' | 'month'
  /** Number of tasks completed in period */
  tasksCompleted: number
  /** Number of tasks failed in period */
  tasksFailed: number
  /** Average response time in milliseconds */
  avgResponseTime: number
  /** Average tokens used per task */
  avgTokensUsed: number
  /** User satisfaction rating 0-5 */
  userSatisfaction: number
  /** Estimated cost in USD */
  costEstimate: number
}

/**
 * Custom agent framework events
 */
export interface AgentEvent {
  /** Event type */
  type: 'agent:created' | 'agent:updated' | 'agent:deleted' | 'agent:cloned' |
        'agent:status-changed' | 'agent:performance-updated'
  /** ID of affected agent */
  agentId: string
  /** Event-specific data */
  data: Record<string, unknown>
  /** Unix timestamp */
  timestamp: number
}
