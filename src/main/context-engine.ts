import { eventBus } from './event-bus'

/**
 * Context Source Types
 * Represents different categories of context that can be assembled for a task
 */
export type ContextSourceType =
  | 'global_instruction'
  | 'project_instruction'
  | 'folder_instruction'
  | 'task_instruction'
  | 'temporary'
  | 'document'
  | 'connector_feed'
  | 'conversation_summary'
  | 'agent_memory'

/**
 * A single piece of context with metadata
 */
export interface ContextSource {
  id: string
  projectId: string | null
  type: ContextSourceType
  label: string
  content: string
  tokenEstimate: number
  pinned: boolean
  active: boolean
  createdAt: number
  expiresAt: number | null
}

/**
 * Complete context assembly for a task
 * Includes all relevant sources, token accounting, and budget status
 */
export interface ContextAssembly {
  sources: ContextSource[]
  totalTokens: number
  budgetLimit: number
  budgetUsedPercent: number
  overflow: boolean
}

/**
 * Budget status for a specific model
 */
export interface ContextBudget {
  used: number
  limit: number
  percent: number
}

/**
 * Input parameters for adding a new context source
 */
export interface AddSourceInput {
  projectId?: string
  type: ContextSourceType
  label: string
  content: string
  pinned?: boolean
  expiresAt?: number
}

/**
 * Token budget limits per model family
 * Used to determine how much context can be assembled
 */
const MODEL_BUDGETS: Record<string, number> = {
  'claude': 120000,
  'gpt-4o': 96000,
  'gpt-4o-mini': 96000,
  'gemini': 96000,
  'deepseek': 96000,
  'llama': 64000,
  'default': 64000,
}

/**
 * Internal storage for all context sources
 * Key: sourceId, Value: ContextSource
 */
const contextSources = new Map<string, ContextSource>()

/**
 * Priority order for assembling context
 * Higher priority sources are included first
 */
const ASSEMBLY_PRIORITY: ContextSourceType[] = [
  'global_instruction',
  'project_instruction',
  'folder_instruction',
  'task_instruction',
  'document',
  'connector_feed',
  'conversation_summary',
  'agent_memory',
  'temporary',
]

/**
 * Generate a unique ID for a new context source
 * Format: ctx-${timestamp}-${random}
 */
function generateSourceId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  return `ctx-${timestamp}-${random}`
}

/**
 * Estimate token count from text content
 * Uses simple heuristic: characters / 3.5
 * This is a rough approximation; actual token counts vary by model
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

/**
 * Extract model family from model ID
 * Checks if the model ID contains known model family strings
 */
function getModelFamily(modelId?: string): string {
  if (!modelId) return 'default'

  const lowerModelId = modelId.toLowerCase()

  if (lowerModelId.includes('claude')) return 'claude'
  if (lowerModelId.includes('gpt-4o')) return 'gpt-4o'
  if (lowerModelId.includes('gpt-4o-mini')) return 'gpt-4o-mini'
  if (lowerModelId.includes('gemini')) return 'gemini'
  if (lowerModelId.includes('deepseek')) return 'deepseek'
  if (lowerModelId.includes('llama')) return 'llama'

  return 'default'
}

/**
 * Add a new context source
 * Auto-calculates token estimate and generates unique ID
 *
 * @param input - Source configuration
 * @returns The created ContextSource
 */
export function addSource(input: AddSourceInput): ContextSource {
  const source: ContextSource = {
    id: generateSourceId(),
    projectId: input.projectId ?? null,
    type: input.type,
    label: input.label,
    content: input.content,
    tokenEstimate: estimateTokens(input.content),
    pinned: input.pinned ?? false,
    active: true,
    createdAt: Date.now(),
    expiresAt: input.expiresAt ?? null,
  }

  contextSources.set(source.id, source)
  eventBus.emit('context:source-added', { source })

  return source
}

/**
 * Remove a context source by ID
 * No-op if source doesn't exist
 *
 * @param sourceId - ID of the source to remove
 */
export function removeSource(sourceId: string): void {
  const source = contextSources.get(sourceId)
  if (source) {
    contextSources.delete(sourceId)
    eventBus.emit('context:source-removed', { sourceId })
  }
}

/**
 * Retrieve a single context source by ID
 *
 * @param sourceId - ID of the source
 * @returns The ContextSource or null if not found
 */
export function getSource(sourceId: string): ContextSource | null {
  return contextSources.get(sourceId) ?? null
}

/**
 * List all context sources, optionally filtered by project
 *
 * @param projectId - Optional project ID to filter by
 * @returns Array of ContextSource objects
 */
export function listSources(projectId?: string): ContextSource[] {
  const sources = Array.from(contextSources.values())

  if (projectId) {
    return sources.filter(
      (source) => source.projectId === projectId || source.projectId === null
    )
  }

  return sources
}

/**
 * Pin a context source to ensure it's always included in assemblies
 * Pinned sources are included regardless of token budget
 *
 * @param sourceId - ID of the source to pin
 */
export function pinSource(sourceId: string): void {
  const source = contextSources.get(sourceId)
  if (source) {
    source.pinned = true
    eventBus.emit('context:source-pinned', { sourceId })
  }
}

/**
 * Unpin a context source
 *
 * @param sourceId - ID of the source to unpin
 */
export function unpinSource(sourceId: string): void {
  const source = contextSources.get(sourceId)
  if (source) {
    source.pinned = false
    eventBus.emit('context:source-unpinned', { sourceId })
  }
}

/**
 * Toggle the active state of a context source
 * Inactive sources are excluded from context assemblies
 *
 * @param sourceId - ID of the source to toggle
 */
export function toggleSourceActive(sourceId: string): void {
  const source = contextSources.get(sourceId)
  if (source) {
    source.active = !source.active
    eventBus.emit('context:source-toggled', { sourceId, active: source.active })
  }
}

/**
 * Get the current budget for a specific model
 *
 * @param modelId - Optional model ID to determine budget
 * @returns ContextBudget with used/limit/percent
 */
export function getBudget(modelId?: string): ContextBudget {
  const modelFamily = getModelFamily(modelId)
  const limit = MODEL_BUDGETS[modelFamily] || MODEL_BUDGETS['default']

  // Calculate used tokens from all active sources
  let used = 0
  contextSources.forEach((source) => {
    if (source.active) {
      used += source.tokenEstimate
    }
  })

  const percent = Math.round((used / limit) * 100)

  return { used, limit, percent }
}

/**
 * Assemble context for a project and optional task
 * Collects relevant sources in priority order, stopping when budget is exceeded
 *
 * Priority order:
 * 1. Pinned sources (always included)
 * 2. Global instructions
 * 3. Project instructions
 * 4. Folder instructions
 * 5. Task instructions
 * 6. Documents (by recency)
 * 7. Connector feeds
 * 8. Conversation summaries
 * 9. Agent memory
 * 10. Temporary sources
 *
 * @param projectId - Project ID for assembly
 * @param taskId - Optional task ID for task-specific context
 * @param modelId - Optional model ID to determine budget limit
 * @returns ContextAssembly with sources and budget info
 */
export function assembleContext(
  projectId: string,
  _taskId?: string,
  modelId?: string
): ContextAssembly {
  const modelFamily = getModelFamily(modelId)
  const budgetLimit = MODEL_BUDGETS[modelFamily] || MODEL_BUDGETS['default']

  const allSources = Array.from(contextSources.values())
    .filter((source) => source.active && (source.projectId === projectId || source.projectId === null))
    .filter((source) => !source.expiresAt || source.expiresAt >= Date.now())

  const assembled: ContextSource[] = []
  let totalTokens = 0
  let overflow = false

  // Separate pinned sources (always include)
  const pinned = allSources.filter((s) => s.pinned)
  const unpinned = allSources.filter((s) => !s.pinned)

  // Add all pinned sources first
  for (const source of pinned) {
    assembled.push(source)
    totalTokens += source.tokenEstimate
  }

  // Group unpinned sources by type
  const sourcesByType = new Map<ContextSourceType, ContextSource[]>()
  for (const type of ASSEMBLY_PRIORITY) {
    const sources = unpinned.filter((s) => s.type === type)

    if (type === 'document') {
      // Sort documents by recency (newest first)
      sources.sort((a, b) => b.createdAt - a.createdAt)
    }

    sourcesByType.set(type, sources)
  }

  // Add unpinned sources in priority order
  for (const type of ASSEMBLY_PRIORITY) {
    const sources = sourcesByType.get(type) || []

    for (const source of sources) {
      const projectionTokens = totalTokens + source.tokenEstimate

      if (projectionTokens <= budgetLimit) {
        assembled.push(source)
        totalTokens = projectionTokens
      } else {
        overflow = true
        break
      }
    }

    if (overflow) break
  }

  const budgetUsedPercent = Math.round((totalTokens / budgetLimit) * 100)

  // Emit warning if budget usage is high
  if (budgetUsedPercent > 90) {
    eventBus.emit('context:budget-warning', { budgetUsedPercent, projectId })
  }

  return {
    sources: assembled,
    totalTokens,
    budgetLimit,
    budgetUsedPercent,
    overflow,
  }
}

/**
 * Remove all expired context sources
 * A source is expired if expiresAt < current time
 *
 * @returns Number of sources removed
 */
export function clearExpiredSources(): number {
  const now = Date.now()
  let removed = 0

  const expiredIds: string[] = []
  contextSources.forEach((source, id) => {
    if (source.expiresAt && source.expiresAt < now) {
      expiredIds.push(id)
    }
  })

  for (const id of expiredIds) {
    removeSource(id)
    removed++
  }

  return removed
}

/**
 * Clear all temporary sources for a project
 * Temporary sources have type 'temporary' and are typically short-lived
 *
 * @param projectId - Optional project ID to filter by
 * @returns Number of sources removed
 */
export function clearTemporarySources(projectId?: string): number {
  let removed = 0

  const tempIds: string[] = []
  contextSources.forEach((source, id) => {
    if (
      source.type === 'temporary' &&
      (!projectId || source.projectId === projectId)
    ) {
      tempIds.push(id)
    }
  })

  for (const id of tempIds) {
    removeSource(id)
    removed++
  }

  return removed
}

/**
 * Get current context statistics
 * Useful for debugging and monitoring
 */
export function getContextStats() {
  const totalSources = contextSources.size
  const activeSources = Array.from(contextSources.values()).filter((s) => s.active).length
  const pinnedSources = Array.from(contextSources.values()).filter((s) => s.pinned).length

  const sourcesByType = new Map<ContextSourceType, number>()
  contextSources.forEach((source) => {
    const count = sourcesByType.get(source.type) || 0
    sourcesByType.set(source.type, count + 1)
  })

  return {
    totalSources,
    activeSources,
    pinnedSources,
    sourcesByType: Object.fromEntries(sourcesByType),
  }
}

/**
 * Clear all context sources
 * Warning: This is destructive and cannot be undone
 * Typically only used during testing or reset operations
 */
export function clearAllSources(): void {
  contextSources.clear()
  eventBus.emit('context:cleared')
}

/**
 * Export current context state for persistence or debugging
 */
export function exportContextState() {
  return Array.from(contextSources.values())
}

/**
 * Import context state (e.g., from persistence)
 */
export function importContextState(sources: ContextSource[]): void {
  contextSources.clear()
  for (const source of sources) {
    contextSources.set(source.id, source)
  }
  eventBus.emit('context:imported', { count: sources.length })
}
