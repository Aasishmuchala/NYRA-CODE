import { memory } from './memory'
import { emitEvent } from './event-bus'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AgentRole =
  | 'planner' | 'research' | 'file_ops' | 'writer'
  | 'spreadsheet' | 'browser' | 'code' | 'qa'
  | 'security' | 'context_curator' | 'review'
  | 'desktop' | 'generalist'

export type AgentStatus = 'idle' | 'running' | 'blocked' | 'done' | 'error'

export interface AgentDefinition {
  id: string                    // 'agent-planner', 'agent-writer', etc.
  role: AgentRole
  name: string                  // Human-readable: 'Planner Agent'
  description: string
  systemPrompt: string          // Role-specific system prompt
  preferredModel: string        // e.g. 'anthropic/claude-3.5-sonnet'
  fallbackModel: string
  allowedTools: string[]        // Tool names this agent can use
  maxFolderAccess: string       // Max folder access level: 'read_only', 'trusted', 'full'
  canRequestApproval: boolean
  canSpawnSubagents: boolean
  tokenBudget: number           // Max tokens per run
  icon: string                  // Emoji for UI: '🧠', '✍️', etc.
}

export interface AgentState {
  id: string
  status: AgentStatus
  currentTaskId: string | null
  currentAssignment: string | null
  lastActiveAt: number | null
}

// ============================================================================
// DEFAULT AGENT DEFINITIONS
// ============================================================================

export const DEFAULT_AGENTS: AgentDefinition[] = [
  {
    id: 'agent-planner',
    role: 'planner',
    name: 'Planner Agent',
    description: 'Breaks complex tasks into clear, actionable subtasks and coordinates other agents',
    systemPrompt: 'You are a task planning specialist. Analyze the user\'s objective, break it into clear actionable subtasks, identify dependencies, and determine which specialist agents should handle each part.',
    preferredModel: 'anthropic/claude-3.5-sonnet',
    fallbackModel: 'anthropic/claude-3-opus',
    allowedTools: ['memory:query', 'context:read'],
    maxFolderAccess: 'read_only',
    canRequestApproval: false,
    canSpawnSubagents: true,
    tokenBudget: 8000,
    icon: '🧠',
  },
  {
    id: 'agent-research',
    role: 'research',
    name: 'Research Agent',
    description: 'Gathers and synthesizes information from files and codebase indexes',
    systemPrompt: 'You are a research specialist. Gather relevant information from files, codebase indexes, and memory. Return structured summaries with source references.',
    preferredModel: 'openai/gpt-4o',
    fallbackModel: 'openai/gpt-4-turbo',
    allowedTools: ['files:read', 'memory:search', 'indexer:search'],
    maxFolderAccess: 'read_only',
    canRequestApproval: false,
    canSpawnSubagents: false,
    tokenBudget: 16000,
    icon: '🔍',
  },
  {
    id: 'agent-file-ops',
    role: 'file_ops',
    name: 'File Operations Agent',
    description: 'Handles file organization, moving, renaming, and deletion tasks',
    systemPrompt: 'You are a file operations specialist. Execute file organization tasks efficiently. Always confirm destructive operations and create snapshots before modifying files.',
    preferredModel: 'openai/gpt-4o-mini',
    fallbackModel: 'openai/gpt-4-turbo',
    allowedTools: ['files:read', 'files:write', 'files:move', 'files:delete'],
    maxFolderAccess: 'trusted',
    canRequestApproval: true,
    canSpawnSubagents: false,
    tokenBudget: 4000,
    icon: '📁',
  },
  {
    id: 'agent-writer',
    role: 'writer',
    name: 'Writer Agent',
    description: 'Drafts high-quality documents, emails, reports, and summaries',
    systemPrompt: 'You are a writing specialist. Draft high-quality documents, emails, reports, and summaries. Match the user\'s tone and style preferences.',
    preferredModel: 'anthropic/claude-3.5-sonnet',
    fallbackModel: 'anthropic/claude-3-opus',
    allowedTools: ['files:write', 'memory:query'],
    maxFolderAccess: 'read_only',
    canRequestApproval: false,
    canSpawnSubagents: false,
    tokenBudget: 16000,
    icon: '✍️',
  },
  {
    id: 'agent-spreadsheet',
    role: 'spreadsheet',
    name: 'Spreadsheet Agent',
    description: 'Creates, edits, and analyzes spreadsheets and CSV files',
    systemPrompt: 'You are a data and spreadsheet specialist. Create, edit, and analyze spreadsheets and CSV files. Use clear formatting and include calculations where relevant.',
    preferredModel: 'openai/gpt-4o',
    fallbackModel: 'openai/gpt-4-turbo',
    allowedTools: ['files:read', 'files:write'],
    maxFolderAccess: 'trusted',
    canRequestApproval: false,
    canSpawnSubagents: false,
    tokenBudget: 12000,
    icon: '📊',
  },
  {
    id: 'agent-browser',
    role: 'browser',
    name: 'Browser Agent',
    description: 'Performs web research and accesses connected services',
    systemPrompt: 'You are a web research specialist. Search the web and use connected services to gather information. Return clean, structured data.',
    preferredModel: 'openai/gpt-4o-mini',
    fallbackModel: 'openai/gpt-4-turbo',
    allowedTools: ['mcp:*'],
    maxFolderAccess: 'read_only',
    canRequestApproval: false,
    canSpawnSubagents: false,
    tokenBudget: 8000,
    icon: '🌐',
  },
  {
    id: 'agent-code',
    role: 'code',
    name: 'Code Agent',
    description: 'Writes clean, well-documented code and runs tests',
    systemPrompt: 'You are a code specialist. Write clean, well-documented code. Run tests before proposing changes. Follow the project\'s existing conventions.',
    preferredModel: 'anthropic/claude-3.5-sonnet',
    fallbackModel: 'anthropic/claude-3-opus',
    allowedTools: ['files:*', 'pty:*', 'git:*', 'indexer:*'],
    maxFolderAccess: 'trusted',
    canRequestApproval: true,
    canSpawnSubagents: false,
    tokenBudget: 24000,
    icon: '💻',
  },
  {
    id: 'agent-qa',
    role: 'qa',
    name: 'QA Agent',
    description: 'Verifies outputs for correctness, completeness, and adherence to requirements',
    systemPrompt: 'You are a quality assurance specialist. Verify outputs for correctness, completeness, and adherence to requirements. Run test suites and check for regressions.',
    preferredModel: 'anthropic/claude-3.5-sonnet',
    fallbackModel: 'anthropic/claude-3-opus',
    allowedTools: ['files:read', 'pty:exec', 'git:diff'],
    maxFolderAccess: 'read_only',
    canRequestApproval: false,
    canSpawnSubagents: false,
    tokenBudget: 8000,
    icon: '✅',
  },
  {
    id: 'agent-security',
    role: 'security',
    name: 'Security Agent',
    description: 'Audits code and configurations for vulnerabilities and security risks',
    systemPrompt: 'You are a security specialist. Audit code and configurations for vulnerabilities. Check for exposed secrets, insecure permissions, and common attack vectors.',
    preferredModel: 'anthropic/claude-3.5-sonnet',
    fallbackModel: 'anthropic/claude-3-opus',
    allowedTools: ['files:read', 'guard:scan', 'indexer:search'],
    maxFolderAccess: 'read_only',
    canRequestApproval: false,
    canSpawnSubagents: false,
    tokenBudget: 8000,
    icon: '🛡️',
  },
  {
    id: 'agent-context-curator',
    role: 'context_curator',
    name: 'Context Curator Agent',
    description: 'Manages context windows and optimizes token usage',
    systemPrompt: 'You are a context management specialist. Summarize long conversations, curate relevant knowledge, and optimize context budgets by compressing older information.',
    preferredModel: 'openai/gpt-4o-mini',
    fallbackModel: 'openai/gpt-4-turbo',
    allowedTools: ['memory:*', 'context:*', 'files:read'],
    maxFolderAccess: 'read_only',
    canRequestApproval: false,
    canSpawnSubagents: false,
    tokenBudget: 8000,
    icon: '📚',
  },
  {
    id: 'agent-review',
    role: 'review',
    name: 'Review Agent',
    description: 'Evaluates work products and provides constructive feedback',
    systemPrompt: 'You are a review and critique specialist. Evaluate work products for quality, suggest improvements, and provide constructive feedback.',
    preferredModel: 'anthropic/claude-3.5-sonnet',
    fallbackModel: 'anthropic/claude-3-opus',
    allowedTools: ['files:read', 'memory:query'],
    maxFolderAccess: 'read_only',
    canRequestApproval: false,
    canSpawnSubagents: false,
    tokenBudget: 12000,
    icon: '🔎',
  },
]

// ============================================================================
// INTERNAL STATE MANAGEMENT
// ============================================================================

// In-memory registry of agents
let agentRegistry: Map<string, AgentDefinition> = new Map()

// In-memory state tracking
let agentStates: Map<string, AgentState> = new Map()

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the agent registry with default agents.
 * Inserts DEFAULT_AGENTS into memory if not already present.
 */
export function initializeAgents(): void {
  // Populate in-memory registry
  for (const agent of DEFAULT_AGENTS) {
    agentRegistry.set(agent.id, agent)

    // Initialize state
    const initialState: AgentState = {
      id: agent.id,
      status: 'idle',
      currentTaskId: null,
      currentAssignment: null,
      lastActiveAt: null,
    }
    agentStates.set(agent.id, initialState)
  }

  // Store in memory for persistence
  try {
    const existing = memory.listFacts('agents')
    if (existing.length === 0) {
      memory.setFact('agents', 'registry', JSON.stringify(DEFAULT_AGENTS))
    }
  } catch (error) {
    console.warn('Failed to persist agent registry to memory:', error)
  }

  emitEvent('agent:initialized', { count: DEFAULT_AGENTS.length })
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get a specific agent by ID
 */
export function getAgent(agentId: string): AgentDefinition | null {
  return agentRegistry.get(agentId) ?? null
}

/**
 * Get all registered agents
 */
export function getAllAgents(): AgentDefinition[] {
  return Array.from(agentRegistry.values())
}

/**
 * Get all agents with a specific role
 */
export function getAgentsByRole(role: AgentRole): AgentDefinition[] {
  return Array.from(agentRegistry.values()).filter((agent) => agent.role === role)
}

/**
 * Get the first agent matching a role (convenience function)
 */
export function getAgentForRole(role: AgentRole): AgentDefinition | null {
  const agents = getAgentsByRole(role)
  return agents.length > 0 ? agents[0] : null
}

/**
 * Get the current state of an agent
 */
export function getAgentState(agentId: string): AgentState {
  let state = agentStates.get(agentId)
  if (!state) {
    // Initialize state if not found
    state = {
      id: agentId,
      status: 'idle',
      currentTaskId: null,
      currentAssignment: null,
      lastActiveAt: null,
    }
    agentStates.set(agentId, state)
  }
  return state
}

/**
 * Get all agent states
 */
export function getAllAgentStates(): AgentState[] {
  return Array.from(agentStates.values())
}

// ============================================================================
// STATE MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Update an agent's status and current task
 */
export function updateAgentStatus(
  agentId: string,
  status: AgentStatus,
  taskId?: string,
  assignment?: string
): void {
  const state = getAgentState(agentId)

  state.status = status
  if (taskId !== undefined) {
    state.currentTaskId = taskId
  }
  if (assignment !== undefined) {
    state.currentAssignment = assignment
  }
  state.lastActiveAt = Date.now()

  agentStates.set(agentId, state)

  emitEvent('agent:status-changed', {
    agentId,
    status,
    taskId: state.currentTaskId,
    assignment: state.currentAssignment,
    timestamp: state.lastActiveAt,
  })
}

/**
 * Reset all agents to idle state
 */
export function resetAllAgents(): void {
  for (const [agentId, state] of agentStates.entries()) {
    state.status = 'idle'
    state.currentTaskId = null
    state.currentAssignment = null
    state.lastActiveAt = null
    agentStates.set(agentId, state)
  }

  emitEvent('agent:reset', { count: agentStates.size })
}

// ============================================================================
// TOOL AUTHORIZATION
// ============================================================================

/**
 * Check if an agent is allowed to use a specific tool
 * Supports wildcard matching (e.g., 'files:*' allows 'files:read', 'files:write')
 */
// ============================================================================
// CRUD OPERATIONS (Agent Studio)
// ============================================================================

/**
 * Create a new custom agent definition.
 */
export function createAgent(def: AgentDefinition): AgentDefinition {
  if (agentRegistry.has(def.id)) {
    throw new Error(`Agent already exists: ${def.id}`)
  }

  agentRegistry.set(def.id, def)
  agentStates.set(def.id, {
    id: def.id,
    status: 'idle',
    currentTaskId: null,
    currentAssignment: null,
    lastActiveAt: null,
  })

  persistRegistry()
  emitEvent('agent:created', { agentId: def.id })
  return def
}

/**
 * Update an existing agent definition (partial updates supported).
 */
export function updateAgent(agentId: string, updates: Partial<Omit<AgentDefinition, 'id'>>): AgentDefinition | null {
  const existing = agentRegistry.get(agentId)
  if (!existing) return null

  const updated: AgentDefinition = { ...existing, ...updates, id: agentId }
  agentRegistry.set(agentId, updated)

  persistRegistry()
  emitEvent('agent:updated', { agentId })
  return updated
}

/**
 * Delete a custom agent. Built-in agents (from DEFAULT_AGENTS) cannot be deleted
 * but can be hidden via updateAgent with a custom flag.
 */
export function deleteAgent(agentId: string): boolean {
  if (!agentRegistry.has(agentId)) return false

  agentRegistry.delete(agentId)
  agentStates.delete(agentId)

  persistRegistry()
  emitEvent('agent:deleted', { agentId })
  return true
}

/**
 * Duplicate an existing agent with a new ID and name.
 */
export function duplicateAgent(sourceId: string, newName?: string): AgentDefinition | null {
  const source = agentRegistry.get(sourceId)
  if (!source) return null

  const newId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const clone: AgentDefinition = {
    ...source,
    id: newId,
    name: newName || `${source.name} (Copy)`,
  }

  return createAgent(clone)
}

/**
 * Export an agent definition as JSON string.
 */
export function exportAgent(agentId: string): string | null {
  const agent = agentRegistry.get(agentId)
  if (!agent) return null
  return JSON.stringify(agent, null, 2)
}

/**
 * Import an agent definition from JSON string.
 */
export function importAgent(jsonStr: string): AgentDefinition {
  const data = JSON.parse(jsonStr)
  const def: AgentDefinition = {
    id: data.id || `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role: data.role || 'general',
    name: data.name || 'Imported Agent',
    description: data.description || '',
    systemPrompt: data.systemPrompt || '',
    preferredModel: data.preferredModel || 'openai/gpt-4o-mini',
    fallbackModel: data.fallbackModel || 'openai/gpt-4o',
    allowedTools: data.allowedTools || [],
    maxFolderAccess: data.maxFolderAccess || 'read_only',
    canRequestApproval: data.canRequestApproval ?? false,
    canSpawnSubagents: data.canSpawnSubagents ?? false,
    tokenBudget: data.tokenBudget || 4000,
    icon: data.icon || '🤖',
  }

  // Avoid ID collision
  if (agentRegistry.has(def.id)) {
    def.id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  }

  return createAgent(def)
}

/** Persist the full registry to memory facts */
function persistRegistry(): void {
  try {
    const all = Array.from(agentRegistry.values())
    memory.setFact('agents', 'registry', JSON.stringify(all))
  } catch (error) {
    console.warn('Failed to persist agent registry:', error)
  }
}

export function isToolAllowed(agentId: string, toolName: string): boolean {
  const agent = getAgent(agentId)
  if (!agent) {
    return false
  }

  for (const allowedTool of agent.allowedTools) {
    // Exact match
    if (allowedTool === toolName) {
      return true
    }

    // Wildcard match (e.g., 'files:*' matches 'files:read', 'files:write')
    if (allowedTool.endsWith('*')) {
      const prefix = allowedTool.slice(0, -1) // Remove the '*'
      if (toolName.startsWith(prefix)) {
        return true
      }
    }
  }

  return false
}
