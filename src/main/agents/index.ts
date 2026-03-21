/**
 * Custom Agent Framework — Public API exports
 * Phase 1.3 of the Nyra 5-Year Plan
 */

// Interfaces and types
export type {
  ExtendedAgentRole,
  AgentCapability,
  AgentLearningProfile,
  ModelPreference,
  CustomAgentDefinition,
  AgentTemplate,
  AgentPerformanceMetrics,
  AgentEvent,
} from './agent-interface'

// Factory
export { AgentFactory } from './agent-factory'
export type { AgentCreationConfig, TemplateOverrides, ValidationResult } from './agent-factory'

// Templates
export { BUILT_IN_TEMPLATES, getTemplate, getTemplatesByCategory, getTemplateCategories } from './agent-templates'

// Store
export { AgentStore } from './agent-store'

// Manager (singleton)
export { agentManager, AgentManager } from './agent-manager'
export type { AgentListFilters } from './agent-manager'
