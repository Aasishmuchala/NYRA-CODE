import { memory } from './memory'
import { eventBus } from './event-bus'

export interface AuditEntry {
  id: string
  taskId: string | null
  agentId: string | null
  action: string // file_read, file_write, file_delete, command_exec, etc.
  target: string | null // file path, URL, etc.
  details: any
  reversible: boolean
  snapshotId: string | null
  timestamp: number
}

export interface AuditFilters {
  taskId?: string
  agentId?: string
  action?: string
  fromTimestamp?: number
  toTimestamp?: number
  limit?: number
  offset?: number
}

/**
 * Log an action to the audit trail.
 * The audit log is append-only; entries cannot be modified or deleted.
 * Generates a unique ID and timestamp automatically.
 */
export function logAction(
  entry: Omit<AuditEntry, 'id' | 'timestamp'>
): AuditEntry {
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const timestamp = Date.now()

  const auditEntry: AuditEntry = {
    id,
    taskId: entry.taskId,
    agentId: entry.agentId,
    action: entry.action,
    target: entry.target,
    details: entry.details || {},
    reversible: entry.reversible,
    snapshotId: entry.snapshotId,
    timestamp,
  }

  // Store in memory database
  memory.auditLog.push(auditEntry)

  // Emit event for real-time monitoring
  eventBus.emit('audit:action-logged', {
    auditId: id,
    action: entry.action,
    target: entry.target,
    taskId: entry.taskId,
    agentId: entry.agentId,
  })

  return auditEntry
}

/**
 * Query the audit log with optional filters.
 * Returns matching entries sorted by timestamp (newest first).
 */
export function queryAudit(filters: AuditFilters): AuditEntry[] {
  let results = [...memory.auditLog]

  // Apply filters
  if (filters.taskId) {
    results = results.filter((e) => e.taskId === filters.taskId)
  }

  if (filters.agentId) {
    results = results.filter((e) => e.agentId === filters.agentId)
  }

  if (filters.action) {
    results = results.filter((e) => e.action === filters.action)
  }

  if (filters.fromTimestamp !== undefined) {
    results = results.filter((e) => e.timestamp >= filters.fromTimestamp!)
  }

  if (filters.toTimestamp !== undefined) {
    results = results.filter((e) => e.timestamp <= filters.toTimestamp!)
  }

  // Sort by timestamp descending (newest first)
  results.sort((a, b) => b.timestamp - a.timestamp)

  // Apply offset and limit
  const offset = filters.offset || 0
  const limit = filters.limit || 100

  return results.slice(offset, offset + limit)
}

/**
 * Get a specific audit entry by ID.
 */
export function getAuditEntry(auditId: string): AuditEntry | null {
  return memory.auditLog.find((e) => e.id === auditId) || null
}

/**
 * Get the total count of audit entries matching optional filters.
 */
export function getAuditCount(filters?: Partial<AuditFilters>): number {
  if (!filters || Object.keys(filters).length === 0) {
    return memory.auditLog.length
  }

  return queryAudit(filters as AuditFilters).length
}

/**
 * Get the most recent audit entries.
 */
export function getRecentActions(limit: number = 50): AuditEntry[] {
  return memory.auditLog.slice(-limit).reverse()
}

/**
 * Get all audit entries related to a specific file.
 */
export function getActionsForFile(filePath: string): AuditEntry[] {
  const results = memory.auditLog.filter((e) => e.target === filePath)
  results.sort((a, b) => b.timestamp - a.timestamp)
  return results
}

/**
 * Get all reversible actions (those with snapshots).
 */
export function getReversibleActions(taskId?: string): AuditEntry[] {
  let results = memory.auditLog.filter(
    (e) => e.reversible && e.snapshotId !== null
  )

  if (taskId) {
    results = results.filter((e) => e.taskId === taskId)
  }

  results.sort((a, b) => b.timestamp - a.timestamp)
  return results
}

/**
 * Get all actions performed by a specific agent.
 */
export function getAgentActions(agentId: string): AuditEntry[] {
  const results = memory.auditLog.filter((e) => e.agentId === agentId)
  results.sort((a, b) => b.timestamp - a.timestamp)
  return results
}

/**
 * Get all actions from a specific task.
 */
export function getTaskActions(taskId: string): AuditEntry[] {
  const results = memory.auditLog.filter((e) => e.taskId === taskId)
  results.sort((a, b) => b.timestamp - a.timestamp)
  return results
}

/**
 * Get audit entries by action type.
 */
export function getActionsByType(action: string): AuditEntry[] {
  const results = memory.auditLog.filter((e) => e.action === action)
  results.sort((a, b) => b.timestamp - a.timestamp)
  return results
}

/**
 * Get audit statistics for a given time window.
 */
export function getAuditStats(
  fromTimestamp: number,
  toTimestamp: number
): {
  totalActions: number
  byAction: Record<string, number>
  byAgent: Record<string, number>
  reversible: number
} {
  const entries = memory.auditLog.filter(
    (e) => e.timestamp >= fromTimestamp && e.timestamp <= toTimestamp
  )

  const byAction: Record<string, number> = {}
  const byAgent: Record<string, number> = {}
  let reversible = 0

  entries.forEach((entry) => {
    // Count by action type
    byAction[entry.action] = (byAction[entry.action] || 0) + 1

    // Count by agent
    if (entry.agentId) {
      byAgent[entry.agentId] = (byAgent[entry.agentId] || 0) + 1
    }

    // Count reversible
    if (entry.reversible) {
      reversible++
    }
  })

  return {
    totalActions: entries.length,
    byAction,
    byAgent,
    reversible,
  }
}

/**
 * Export audit log entries in a specified format.
 * Useful for compliance reporting and archival.
 */
export function exportAudit(
  format: 'json' | 'csv',
  filters?: AuditFilters
): string {
  const entries = queryAudit(filters || {})

  if (format === 'json') {
    return JSON.stringify(entries, null, 2)
  }

  if (format === 'csv') {
    const headers = [
      'ID',
      'Timestamp',
      'Task ID',
      'Agent ID',
      'Action',
      'Target',
      'Reversible',
      'Snapshot ID',
    ]
    const rows = entries.map((e) => [
      e.id,
      new Date(e.timestamp).toISOString(),
      e.taskId || '',
      e.agentId || '',
      e.action,
      e.target || '',
      e.reversible ? 'Yes' : 'No',
      e.snapshotId || '',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(',')),
    ].join('\n')

    return csvContent
  }

  throw new Error(`Unsupported export format: ${format}`)
}

/**
 * Get a summary of actions for a given time window.
 */
export function getAuditSummary(
  fromTimestamp?: number,
  toTimestamp?: number
): {
  total: number
  timeWindow: { from: number; to: number }
  recentActions: AuditEntry[]
} {
  const from = fromTimestamp || Date.now() - 24 * 60 * 60 * 1000 // Default: last 24 hours
  const to = toTimestamp || Date.now()

  const entries = memory.auditLog.filter(
    (e) => e.timestamp >= from && e.timestamp <= to
  )

  const recent = entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10)

  return {
    total: entries.length,
    timeWindow: { from, to },
    recentActions: recent,
  }
}

/**
 * Check if a file has been modified since a specific timestamp.
 */
export function hasFileBeenModified(
  filePath: string,
  sinceTimestamp: number
): boolean {
  return memory.auditLog.some(
    (e) =>
      e.target === filePath &&
      e.timestamp > sinceTimestamp &&
      (e.action === 'file_write' || e.action === 'file_delete' || e.action === 'file_move')
  )
}

/**
 * Get the modification history of a specific file.
 */
export function getFileModificationHistory(filePath: string): AuditEntry[] {
  const results = memory.auditLog.filter(
    (e) =>
      e.target === filePath &&
      (e.action === 'file_write' ||
        e.action === 'file_delete' ||
        e.action === 'file_move' ||
        e.action === 'file_create')
  )
  results.sort((a, b) => b.timestamp - a.timestamp)
  return results
}
