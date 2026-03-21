/**
 * Agent Manager — High-level agent management orchestration
 * Combines factory, store, and registry into a unified interface
 */

import type { AgentDefinition, AgentState } from '../agent-registry'
import {
  DEFAULT_AGENTS,
  getAgent as getRegistryAgent,
  getAllAgents as getAllRegistryAgents,
  updateAgentStatus,
  getAllAgentStates,
  resetAllAgents,
} from '../agent-registry'
import type {
  CustomAgentDefinition,
  ExtendedAgentRole,
  AgentCapability,
  ModelPreference,
  AgentPerformanceMetrics,
  AgentTemplate,
} from './agent-interface'
import { AgentFactory, type AgentCreationConfig, type TemplateOverrides } from './agent-factory'
import { AgentStore } from './agent-store'
import { BUILT_IN_TEMPLATES, getTemplate, getTemplatesByCategory } from './agent-templates'

/**
 * List filters for agent queries
 */
export interface AgentListFilters {
  /** Include only built-in agents */
  isBuiltIn?: boolean
  /** Filter by role */
  role?: string
  /** Filter by tags (OR logic) */
  tags?: string[]
  /** Search in name/description */
  search?: string
}

/**
 * Agent Manager — Singleton for all agent operations
 */
export class AgentManager {
  private store: AgentStore
  private initialized: boolean = false

  /**
   * Create new agent manager instance
   */
  constructor() {
    this.store = new AgentStore()
  }

  /**
   * Initialize the manager and load all agents
   * Converts built-in agents to custom format and registers them
   */
  initialize(): void {
    if (this.initialized) return

    // Convert all built-in agents and store them
    for (const builtInAgent of DEFAULT_AGENTS) {
      const customAgent = AgentFactory.convertBuiltIn(builtInAgent)
      try {
        this.store.saveAgent(customAgent)
      } catch (error) {
        console.error(`Failed to store built-in agent ${builtInAgent.id}:`, error)
      }
    }

    this.initialized = true
  }

  /**
   * Create a new custom agent from configuration
   * @param config Agent creation configuration
   * @returns Created agent
   */
  createAgent(config: AgentCreationConfig): CustomAgentDefinition {
    const agent = AgentFactory.createFromScratch(config)

    // Validate before saving
    const validation = AgentFactory.validateAgent(agent)
    if (!validation.valid) {
      throw new Error(`Invalid agent: ${validation.errors.join(', ')}`)
    }

    // Save to store
    this.store.saveAgent(agent)

    // Emit event
    AgentFactory.emitCreatedEvent(agent)

    return agent
  }

  /**
   * Create an agent from a template with optional overrides
   * @param templateId ID of template to use
   * @param overrides Optional field overrides
   * @returns Created agent
   */
  createFromTemplate(templateId: string, overrides?: TemplateOverrides): CustomAgentDefinition {
    const agent = AgentFactory.createFromTemplate(templateId, overrides)

    // Validate before saving
    const validation = AgentFactory.validateAgent(agent)
    if (!validation.valid) {
      throw new Error(`Invalid agent: ${validation.errors.join(', ')}`)
    }

    // Save to store
    this.store.saveAgent(agent)

    // Emit event
    AgentFactory.emitCreatedEvent(agent)

    return agent
  }

  /**
   * Get an agent by ID
   * Checks custom store first, then built-in agents
   * @param agentId Agent ID
   * @returns Agent or undefined
   */
  getAgent(agentId: string): CustomAgentDefinition | undefined {
    // Check custom store first
    let agent = this.store.getAgent(agentId)
    if (agent) return agent

    // Check built-in registry
    const builtIn = getRegistryAgent(agentId)
    if (builtIn) {
      agent = AgentFactory.convertBuiltIn(builtIn)
      return agent
    }

    return undefined
  }

  /**
   * List agents with optional filters
   * @param filters Filter criteria
   * @returns Array of agents
   */
  listAgents(filters?: AgentListFilters): CustomAgentDefinition[] {
    const agents = this.store.listAgents(filters)

    // If not filtering by built-in status, include registry agents
    if (filters?.isBuiltIn !== false) {
      const builtInAgents = getAllRegistryAgents()
        .map(agent => AgentFactory.convertBuiltIn(agent))
        .filter(agent => {
          // Apply role filter if specified
          if (filters?.role && agent.role !== filters.role) return false
          // Apply tag filter if specified
          if (filters?.tags && filters.tags.length > 0) {
            if (!filters.tags.some(tag => agent.tags.includes(tag))) return false
          }
          return true
        })

      agents.push(...builtInAgents)
    }

    return agents
  }

  /**
   * Update a custom agent
   * Built-in agents cannot be modified
   * @param agentId Agent ID
   * @param updates Fields to update
   * @returns Updated agent
   */
  updateAgent(agentId: string, updates: Partial<CustomAgentDefinition>): CustomAgentDefinition {
    const agent = this.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    if (agent.isBuiltIn) {
      throw new Error(`Cannot modify built-in agent: ${agentId}`)
    }

    const changes = { ...updates }
    delete changes.id
    delete changes.createdAt
    delete changes.createdBy
    delete changes.isBuiltIn

    this.store.updateAgent(agentId, changes)
    AgentFactory.emitUpdatedEvent(agentId, changes)

    const updated = this.store.getAgent(agentId)
    if (!updated) {
      throw new Error(`Failed to retrieve updated agent: ${agentId}`)
    }

    return updated
  }

  /**
   * Delete a custom agent
   * Built-in agents cannot be deleted
   * @param agentId Agent ID
   */
  deleteAgent(agentId: string): void {
    const agent = this.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    if (agent.isBuiltIn) {
      throw new Error(`Cannot delete built-in agent: ${agentId}`)
    }

    this.store.deleteAgent(agentId)
    AgentFactory.emitDeletedEvent(agentId)
  }

  /**
   * Clone an agent (including built-in agents)
   * Creates a new custom agent as a copy
   * @param agentId Agent to clone
   * @param newName Name for cloned agent
   * @returns Cloned agent
   */
  cloneAgent(agentId: string, newName: string): CustomAgentDefinition {
    const agent = this.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    const cloned = AgentFactory.cloneAgent(agent, newName)

    // Validate before saving
    const validation = AgentFactory.validateAgent(cloned)
    if (!validation.valid) {
      throw new Error(`Invalid cloned agent: ${validation.errors.join(', ')}`)
    }

    this.store.saveAgent(cloned)
    AgentFactory.emitClonedEvent(agentId, cloned.id, newName)

    return cloned
  }

  /**
   * Get available templates
   * @returns Array of templates
   */
  getTemplates(): AgentTemplate[] {
    return BUILT_IN_TEMPLATES
  }

  /**
   * Get templates by category
   * @param category Category name
   * @returns Matching templates
   */
  getTemplatesByCategory(category: string): AgentTemplate[] {
    return getTemplatesByCategory(category)
  }

  /**
   * Get a specific template
   * @param templateId Template ID
   * @returns Template or undefined
   */
  getTemplate(templateId: string): AgentTemplate | undefined {
    return getTemplate(templateId)
  }

  /**
   * Get performance metrics for an agent
   * @param agentId Agent ID
   * @param period Time period
   * @returns Performance metrics or undefined
   */
  getPerformance(
    agentId: string,
    period: 'hour' | 'day' | 'week' | 'month' = 'day',
  ): AgentPerformanceMetrics | undefined {
    return this.store.getPerformanceMetrics(agentId, period)
  }

  /**
   * Record task completion for performance tracking
   * @param agentId Agent ID
   * @param success Whether task succeeded
   * @param tokensUsed Tokens consumed
   * @param latencyMs Latency in milliseconds
   */
  recordCompletion(
    agentId: string,
    success: boolean,
    tokensUsed?: number,
    latencyMs?: number,
  ): void {
    const agent = this.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    this.store.recordTaskCompletion(agentId, success, tokensUsed, latencyMs)
  }

  /**
   * Record performance metrics
   * @param agentId Agent ID
   * @param metrics Metrics to record
   */
  recordPerformanceMetrics(agentId: string, metrics: AgentPerformanceMetrics): void {
    const agent = this.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    this.store.recordPerformanceMetrics(agentId, metrics)
  }

  /**
   * Update agent status in the registry
   * (Delegates to existing agent-registry functionality)
   * @param agentId Agent ID
   * @param status New status
   */
  updateStatus(
    agentId: string,
    status: 'idle' | 'running' | 'blocked' | 'done' | 'error',
  ): void {
    updateAgentStatus(agentId, status)
  }

  /**
   * Get all agent states from registry
   * @returns Array of agent states
   */
  getAllStates(): AgentState[] {
    return getAllAgentStates()
  }

  /**
   * Reset all agent states in registry
   */
  resetAllStates(): void {
    resetAllAgents()
  }

  /**
   * Get statistics about agents
   * @returns Statistics object
   */
  getStatistics(): {
    totalAgents: number
    builtInAgents: number
    customAgents: number
    builtInRoles: string[]
  } {
    const all = this.listAgents()
    const builtIn = this.store.listAgents({ isBuiltIn: true })
    const custom = this.store.listAgents({ isBuiltIn: false })

    return {
      totalAgents: all.length,
      builtInAgents: builtIn.length,
      customAgents: custom.length,
      builtInRoles: Array.from(new Set(builtIn.map(a => a.role as string))),
    }
  }

  /**
   * Close the store connection
   */
  close(): void {
    this.store.close()
  }
}

/**
 * Global singleton instance of AgentManager
 * Export and use this for all agent operations
 */
export const agentManager = new AgentManager()
