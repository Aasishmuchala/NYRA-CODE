/**
 * Agent Factory — Creates agents from templates or scratch
 * Handles validation, unique ID generation, and event emission
 */

import { randomBytes } from 'crypto'
import { emitEvent } from '../event-bus'
import type { AgentDefinition } from '../agent-registry'
import type {
  CustomAgentDefinition,
  ExtendedAgentRole,
  AgentCapability,
  ModelPreference,
  AgentEvent,
} from './agent-interface'
import { getTemplate } from './agent-templates'

/**
 * Configuration for creating a custom agent from scratch
 */
export interface AgentCreationConfig {
  /** Name of the agent */
  name: string
  /** Role/purpose of the agent */
  role: ExtendedAgentRole
  /** Description of what the agent does */
  description: string
  /** System prompt for the agent */
  systemPrompt: string
  /** Preferred model ID */
  preferredModel?: string
  /** Fallback model ID */
  fallbackModel?: string
  /** Tools this agent can use */
  allowedTools?: string[]
  /** Maximum folder access level */
  maxFolderAccess?: string
  /** Can this agent request user approval */
  canRequestApproval?: boolean
  /** Can this agent spawn sub-agents */
  canSpawnSubagents?: boolean
  /** Token budget for the agent */
  tokenBudget?: number
  /** Icon identifier */
  icon?: string
  /** Capabilities this agent has */
  capabilities?: AgentCapability[]
  /** Model preferences */
  modelPreferences?: ModelPreference[]
  /** Tags for organization */
  tags?: string[]
  /** Custom metadata */
  metadata?: Record<string, unknown>
  /** User identifier creating this agent */
  createdBy?: string
}

/**
 * Configuration overrides for template-based creation
 */
export type TemplateOverrides = Partial<AgentCreationConfig>

/**
 * Validation result with errors if any
 */
export interface ValidationResult {
  /** Is the agent valid */
  valid: boolean
  /** Array of error messages */
  errors: string[]
  /** Array of warning messages */
  warnings: string[]
}

/**
 * Agent Factory for creating and validating custom agents
 */
export class AgentFactory {
  /**
   * Create a new agent from scratch with explicit configuration
   * @param config Agent creation configuration
   * @returns New custom agent definition
   */
  static createFromScratch(config: AgentCreationConfig): CustomAgentDefinition {
    const now = Date.now()
    const agentId = this.generateAgentId()

    const agent: CustomAgentDefinition = {
      // ===== Base required fields (from AgentDefinition) =====
      id: agentId,
      role: String(config.role) as any,
      name: config.name,
      description: config.description,
      systemPrompt: config.systemPrompt,
      preferredModel: config.preferredModel || 'claude-sonnet',
      fallbackModel: config.fallbackModel || 'claude-opus',
      allowedTools: config.allowedTools || [],
      maxFolderAccess: config.maxFolderAccess || 'read-only',
      canRequestApproval: config.canRequestApproval ?? false,
      canSpawnSubagents: config.canSpawnSubagents ?? false,
      tokenBudget: config.tokenBudget || 500000,
      icon: config.icon || 'robot',

      // ===== Custom fields =====
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
      createdBy: config.createdBy || 'user',

      // ===== Capabilities and preferences =====
      capabilities: config.capabilities || [],
      modelPreferences: config.modelPreferences || [
        { modelId: config.preferredModel || 'claude-sonnet', priority: 1 },
        { modelId: config.fallbackModel || 'claude-opus', priority: 2 },
      ],

      // ===== Organization =====
      tags: config.tags || [],
      metadata: config.metadata || {},
    }

    return agent
  }

  /**
   * Create an agent from a template with optional overrides
   * @param templateId ID of the template to use
   * @param overrides Optional field overrides
   * @returns New custom agent definition
   */
  static createFromTemplate(
    templateId: string,
    overrides?: TemplateOverrides,
  ): CustomAgentDefinition {
    const template = getTemplate(templateId)
    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }

    const config: AgentCreationConfig = {
      name: overrides?.name || template.name,
      role: overrides?.role || template.defaultRole,
      description: overrides?.description || template.description,
      systemPrompt: overrides?.systemPrompt || template.defaultSystemPrompt,
      preferredModel: overrides?.preferredModel || template.defaultModelPreferences[0]?.modelId,
      fallbackModel: overrides?.fallbackModel || template.defaultModelPreferences[1]?.modelId,
      allowedTools: overrides?.allowedTools || template.defaultAllowedTools,
      maxFolderAccess: overrides?.maxFolderAccess || template.defaultMaxFolderAccess,
      canRequestApproval: overrides?.canRequestApproval ?? template.defaultCanRequestApproval,
      canSpawnSubagents: overrides?.canSpawnSubagents ?? template.defaultCanSpawnSubagents,
      tokenBudget: overrides?.tokenBudget || template.defaultTokenBudget,
      icon: overrides?.icon || template.icon,
      capabilities: overrides?.capabilities || template.defaultCapabilities,
      modelPreferences: overrides?.modelPreferences || template.defaultModelPreferences,
      tags: overrides?.tags || template.defaultTags,
      metadata: overrides?.metadata || {},
      createdBy: overrides?.createdBy || 'user',
    }

    const agent = this.createFromScratch(config)
    agent.templateId = templateId
    agent.templateVersion = template.version

    return agent
  }

  /**
   * Clone an existing agent with a new name
   * @param existingAgent Agent to clone
   * @param newName Name for the cloned agent
   * @param createdBy Optional creator identifier
   * @returns Cloned agent with new ID and name
   */
  static cloneAgent(
    existingAgent: CustomAgentDefinition,
    newName: string,
    createdBy?: string,
  ): CustomAgentDefinition {
    const now = Date.now()
    const clonedAgent: CustomAgentDefinition = {
      ...existingAgent,
      id: this.generateAgentId(),
      name: newName,
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
      createdBy: createdBy || existingAgent.createdBy || 'user',
      // Reset learning profile for cloned agent
      learningProfile: undefined,
    }

    return clonedAgent
  }

  /**
   * Convert a built-in agent to a custom agent definition
   * @param builtInAgent Built-in agent from DEFAULT_AGENTS
   * @returns CustomAgentDefinition version of the agent
   */
  static convertBuiltIn(builtInAgent: AgentDefinition): CustomAgentDefinition {
    return {
      ...builtInAgent,
      isBuiltIn: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'system',
      capabilities: [],
      modelPreferences: [
        { modelId: builtInAgent.preferredModel, priority: 1 },
        { modelId: builtInAgent.fallbackModel, priority: 2 },
      ],
      tags: [],
      metadata: {},
    }
  }

  /**
   * Validate an agent definition
   * @param agent Agent to validate
   * @returns Validation result with errors and warnings
   */
  static validateAgent(agent: CustomAgentDefinition): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Required string fields
    if (!agent.id || typeof agent.id !== 'string') {
      errors.push('Agent must have a valid id')
    }
    if (!agent.name || typeof agent.name !== 'string') {
      errors.push('Agent must have a name')
    }
    if (!agent.description || typeof agent.description !== 'string') {
      errors.push('Agent must have a description')
    }
    if (!agent.systemPrompt || typeof agent.systemPrompt !== 'string') {
      errors.push('Agent must have a systemPrompt')
    }
    if (!agent.role) {
      errors.push('Agent must have a role')
    }

    // Model preferences
    if (!agent.preferredModel || typeof agent.preferredModel !== 'string') {
      errors.push('Agent must have a preferredModel')
    }
    if (!agent.fallbackModel || typeof agent.fallbackModel !== 'string') {
      errors.push('Agent must have a fallbackModel')
    }

    // Token budget
    if (typeof agent.tokenBudget !== 'number' || agent.tokenBudget <= 0) {
      errors.push('Agent tokenBudget must be a positive number')
    }

    // Custom fields
    if (typeof agent.isBuiltIn !== 'boolean') {
      errors.push('Agent must have isBuiltIn flag')
    }
    if (typeof agent.createdAt !== 'number' || agent.createdAt <= 0) {
      errors.push('Agent must have valid createdAt timestamp')
    }
    if (typeof agent.updatedAt !== 'number' || agent.updatedAt <= 0) {
      errors.push('Agent must have valid updatedAt timestamp')
    }

    // Arrays
    if (!Array.isArray(agent.allowedTools)) {
      warnings.push('Agent allowedTools should be an array')
    }
    if (!Array.isArray(agent.capabilities)) {
      warnings.push('Agent capabilities should be an array')
    }
    if (!Array.isArray(agent.tags)) {
      warnings.push('Agent tags should be an array')
    }

    // Metadata
    if (typeof agent.metadata !== 'object' || agent.metadata === null) {
      warnings.push('Agent metadata should be an object')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Generate a unique agent ID
   * Format: agent-custom-${timestamp}-${randomHex}
   * @returns Unique agent ID
   */
  private static generateAgentId(): string {
    const timestamp = Date.now()
    const random = randomBytes(6).toString('hex')
    return `agent-custom-${timestamp}-${random}`
  }

  /**
   * Emit agent creation event
   * @param agent Created agent
   */
  static emitCreatedEvent(agent: CustomAgentDefinition): void {
    const event: AgentEvent = {
      type: 'agent:created',
      agentId: agent.id,
      data: {
        name: agent.name,
        role: agent.role,
        fromTemplate: agent.templateId,
        createdBy: agent.createdBy,
      },
      timestamp: Date.now(),
    }
    emitEvent('agent:created', event)
  }

  /**
   * Emit agent update event
   * @param agentId ID of updated agent
   * @param changes Fields that were changed
   */
  static emitUpdatedEvent(agentId: string, changes: Record<string, unknown>): void {
    const event: AgentEvent = {
      type: 'agent:updated',
      agentId,
      data: changes,
      timestamp: Date.now(),
    }
    emitEvent('agent:updated', event)
  }

  /**
   * Emit agent deletion event
   * @param agentId ID of deleted agent
   */
  static emitDeletedEvent(agentId: string): void {
    const event: AgentEvent = {
      type: 'agent:deleted',
      agentId,
      data: {},
      timestamp: Date.now(),
    }
    emitEvent('agent:deleted', event)
  }

  /**
   * Emit agent clone event
   * @param originalId Original agent ID
   * @param cloneId New cloned agent ID
   * @param cloneName Name of clone
   */
  static emitClonedEvent(originalId: string, cloneId: string, cloneName: string): void {
    const event: AgentEvent = {
      type: 'agent:cloned',
      agentId: cloneId,
      data: {
        originalId,
        cloneName,
      },
      timestamp: Date.now(),
    }
    emitEvent('agent:cloned', event)
  }
}
