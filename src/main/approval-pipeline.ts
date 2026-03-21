import { eventBus } from './event-bus'

// In-memory approval request store
const approvalRequests: Map<string, ApprovalRequest> = new Map()

export type ActionRisk = 'safe' | 'low' | 'medium' | 'high' | 'critical'

export interface ApprovalRequest {
  id: string
  taskId: string
  agentId: string | null
  actionType: string
  description: string
  details: any
  status: 'pending' | 'approved' | 'denied' | 'modified'
  dryRunOutput: string | null
  respondedAt: number | null
  createdAt: number
}

const ACTION_RISKS: Record<string, ActionRisk> = {
  'file:read': 'safe',
  'file:list': 'safe',
  'file:create_new': 'low',
  'file:modify': 'medium',
  'file:delete': 'high',
  'file:move': 'medium',
  'file:overwrite': 'high',
  'shell:safe_command': 'low',
  'shell:build_command': 'medium',
  'shell:arbitrary': 'high',
  'network:fetch': 'low',
  'network:send': 'high',
  'git:commit': 'medium',
  'git:push': 'high',
  'git:force_push': 'critical',
  'sensitive:env': 'critical',
  'sensitive:keys': 'critical',
}

/**
 * Classify the risk level of an action based on its type.
 * Returns the risk category that determines approval requirements.
 */
export function classifyRisk(actionType: string): ActionRisk {
  return ACTION_RISKS[actionType] || 'medium'
}

/**
 * Determine if an action needs explicit user approval.
 * Safe/low actions auto-approve.
 * Medium actions auto-approve if folder is 'trusted' or 'full'.
 * High/critical actions always need approval.
 */
export function needsApproval(
  actionType: string,
  folderAccessLevel: string
): boolean {
  const risk = classifyRisk(actionType)

  if (risk === 'safe' || risk === 'low') {
    return false
  }

  if (risk === 'medium') {
    return folderAccessLevel !== 'trusted' && folderAccessLevel !== 'full'
  }

  // high and critical always need approval
  return true
}

/**
 * Create a new approval request for a pending action.
 * Generates a unique ID and emits a 'task:approval-needed' event.
 */
export function requestApproval(
  taskId: string,
  agentId: string | null,
  actionType: string,
  description: string,
  details?: any
): ApprovalRequest {
  const id = `appr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const createdAt = Date.now()

  const request: ApprovalRequest = {
    id,
    taskId,
    agentId,
    actionType,
    description,
    details: details || {},
    status: 'pending',
    dryRunOutput: null,
    respondedAt: null,
    createdAt,
  }

  // Store in memory database
  approvalRequests.set(id, request)

  // Emit event for UI notification
  eventBus.emit('task:approval-needed', {
    approvalId: id,
    taskId,
    agentId,
    actionType,
    description,
    risk: classifyRisk(actionType),
  })

  return request
}

/**
 * Respond to an approval request.
 * Valid status values: 'approved', 'denied', 'modified'
 * If status is 'modified', provide the modification string.
 */
export function respondToApproval(
  approvalId: string,
  status: 'approved' | 'denied' | 'modified',
  modification?: string
): ApprovalRequest {
  const request = approvalRequests.get(approvalId)

  if (!request) {
    throw new Error(`Approval request not found: ${approvalId}`)
  }

  if (request.status !== 'pending') {
    throw new Error(
      `Cannot respond to non-pending approval: current status is ${request.status}`
    )
  }

  request.status = status
  request.respondedAt = Date.now()

  if (status === 'modified' && modification) {
    request.details.modification = modification
  }

  approvalRequests.set(approvalId, request)

  // Emit event for task completion
  eventBus.emit('task:approval-responded', {
    approvalId,
    taskId: request.taskId,
    agentId: request.agentId,
    status,
    modification,
  })

  return request
}

/**
 * Retrieve all pending approval requests.
 */
export function listPendingApprovals(): ApprovalRequest[] {
  const pending: ApprovalRequest[] = []

  approvalRequests.forEach((request) => {
    if (request.status === 'pending') {
      pending.push(request)
    }
  })

  return pending.sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * Get a specific approval request by ID.
 */
export function getApproval(approvalId: string): ApprovalRequest | null {
  return approvalRequests.get(approvalId) || null
}

/**
 * Get all approval requests associated with a specific task.
 */
export function getApprovalsByTask(taskId: string): ApprovalRequest[] {
  const results: ApprovalRequest[] = []

  approvalRequests.forEach((request) => {
    if (request.taskId === taskId) {
      results.push(request)
    }
  })

  return results.sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * Set dry-run output for an approval request.
 * Useful for showing what would happen if the action is approved.
 */
export function setDryRunOutput(approvalId: string, output: string): void {
  const request = approvalRequests.get(approvalId)

  if (!request) {
    throw new Error(`Approval request not found: ${approvalId}`)
  }

  request.dryRunOutput = output
  approvalRequests.set(approvalId, request)

  eventBus.emit('task:approval-dry-run', {
    approvalId,
    taskId: request.taskId,
    output,
  })
}

/**
 * Check if there are any pending approvals for a given task.
 */
export function hasPendingApprovals(taskId: string): boolean {
  const approvals = getApprovalsByTask(taskId)
  return approvals.some((a) => a.status === 'pending')
}

/**
 * Get approval request statistics.
 */
export function getApprovalStats(): {
  totalRequests: number
  pending: number
  approved: number
  denied: number
  modified: number
} {
  let totalRequests = 0
  let pending = 0
  let approved = 0
  let denied = 0
  let modified = 0

  approvalRequests.forEach((request) => {
    totalRequests++
    if (request.status === 'pending') pending++
    else if (request.status === 'approved') approved++
    else if (request.status === 'denied') denied++
    else if (request.status === 'modified') modified++
  })

  return { totalRequests, pending, approved, denied, modified }
}

/**
 * Clear old approval requests (archival/cleanup).
 * Removes requests older than maxAge milliseconds that are not pending.
 */
export function clearOldApprovals(maxAge: number): number {
  let cleared = 0
  const cutoffTime = Date.now() - maxAge

  const idsToDelete: string[] = []

  approvalRequests.forEach((request, id) => {
    if (request.status !== 'pending' && request.createdAt < cutoffTime) {
      idsToDelete.push(id)
      cleared++
    }
  })

  idsToDelete.forEach((id) => {
    approvalRequests.delete(id)
  })

  return cleared
}

/**
 * Get the highest risk level among pending approvals for a task.
 */
export function getMaxPendingRisk(taskId: string): ActionRisk | null {
  const approvals = getApprovalsByTask(taskId).filter(
    (a) => a.status === 'pending'
  )

  if (approvals.length === 0) return null

  const riskOrder: ActionRisk[] = [
    'critical',
    'high',
    'medium',
    'low',
    'safe',
  ]

  for (const risk of riskOrder) {
    if (approvals.some((a) => classifyRisk(a.actionType) === risk)) {
      return risk
    }
  }

  return null
}
