/**
 * Desktop Action Safety Layer
 *
 * Extends the approval pipeline with desktop-specific risk classification
 * and learnable trust rules. This is the trust boundary between the AI
 * and the user's computer.
 *
 * Three-tier trust model:
 *   Safe     — read-only (screenshots, list windows, list apps)
 *   Moderate — reversible interaction (click, type, scroll, focus app)
 *   Dangerous — potentially destructive (launch app, drag, hotkeys, shell)
 *
 * Learnable trust: when a user approves an action with "trust this type",
 * future identical action types auto-approve without prompting.
 */

import { eventBus } from './event-bus'
import { classifyRisk, requestApproval, respondToApproval, setDryRunOutput } from './approval-pipeline'
import type { ApprovalRequest, ActionRisk } from './approval-pipeline'
import { captureScreen } from './screen'
import type { ScreenCapture } from './screen'

// ── Desktop-specific action types ────────────────────────────────────────────

export type DesktopActionType =
  | 'desktop:screenshot'
  | 'desktop:capture-window'
  | 'desktop:list-sources'
  | 'desktop:list-apps'
  | 'desktop:active-window'
  | 'desktop:mouse-move'
  | 'desktop:mouse-click'
  | 'desktop:mouse-double-click'
  | 'desktop:mouse-scroll'
  | 'desktop:mouse-drag'
  | 'desktop:type-text'
  | 'desktop:press-key'
  | 'desktop:hotkey'
  | 'desktop:launch-app'
  | 'desktop:focus-app'

/**
 * Risk classification for desktop-specific actions.
 * Separate from the file/shell/git risks in approval-pipeline.ts
 */
const DESKTOP_RISKS: Record<DesktopActionType, ActionRisk> = {
  'desktop:screenshot':       'safe',
  'desktop:capture-window':   'safe',
  'desktop:list-sources':     'safe',
  'desktop:list-apps':        'safe',
  'desktop:active-window':    'safe',
  'desktop:mouse-move':       'low',
  'desktop:mouse-click':      'medium',
  'desktop:mouse-double-click': 'medium',
  'desktop:mouse-scroll':     'low',
  'desktop:mouse-drag':       'medium',
  'desktop:type-text':        'medium',
  'desktop:press-key':        'medium',
  'desktop:hotkey':           'high',      // Hotkeys can be destructive (Cmd+Q, Ctrl+Del)
  'desktop:launch-app':       'medium',
  'desktop:focus-app':        'low',
}

// ── Trust mode ───────────────────────────────────────────────────────────────

export type TrustMode = 'always-ask' | 'smart' | 'autopilot'

// ── Learnable trust rules ────────────────────────────────────────────────────

interface TrustRule {
  actionType: DesktopActionType
  autoApprove: boolean
  createdAt: number
  approvedCount: number
}

// ── State ────────────────────────────────────────────────────────────────────

let currentTrustMode: TrustMode = 'smart'
const trustRules = new Map<DesktopActionType, TrustRule>()
const actionHistory: DesktopActionRecord[] = []

export interface DesktopActionRecord {
  id: string
  actionType: DesktopActionType
  description: string
  params: Record<string, unknown>
  status: 'pending' | 'approved' | 'denied' | 'executed' | 'failed'
  screenshot?: ScreenCapture | null
  result?: string
  timestamp: number
}

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * Set the global trust mode.
 */
export function setTrustMode(mode: TrustMode): void {
  currentTrustMode = mode
  console.log(`[DesktopSafety] Trust mode set to: ${mode}`)
  eventBus.emit('desktop:trust-mode-changed', { mode })
}

/**
 * Get the current trust mode.
 */
export function getTrustMode(): TrustMode {
  return currentTrustMode
}

// ── Risk classification ──────────────────────────────────────────────────────

/**
 * Classify risk of a desktop action.
 */
export function classifyDesktopRisk(actionType: DesktopActionType): ActionRisk {
  return DESKTOP_RISKS[actionType] ?? classifyRisk(actionType)
}

// ── Approval flow ────────────────────────────────────────────────────────────

/**
 * Check if a desktop action needs approval based on trust mode, risk, and learned rules.
 */
export function needsDesktopApproval(actionType: DesktopActionType): boolean {
  // Autopilot mode: never ask
  if (currentTrustMode === 'autopilot') return false

  // Always-ask mode: always ask (except safe actions)
  const risk = classifyDesktopRisk(actionType)
  if (currentTrustMode === 'always-ask') {
    return risk !== 'safe'
  }

  // Smart mode: check learned trust rules first
  const rule = trustRules.get(actionType)
  if (rule?.autoApprove) return false

  // Smart defaults: safe & low auto-approve, medium+ requires approval
  return risk !== 'safe' && risk !== 'low'
}

/**
 * Request approval for a desktop action with optional screenshot preview.
 * Returns a promise that resolves when the user responds.
 */
export async function requestDesktopApproval(
  actionType: DesktopActionType,
  description: string,
  params: Record<string, unknown>,
  taskId: string = 'manual'
): Promise<{ approved: boolean; trustType?: boolean }> {
  // Capture current screen for action preview
  let screenshot: ScreenCapture | null = null
  try {
    screenshot = await captureScreen()
  } catch {
    // Non-fatal: preview just won't have a screenshot
  }

  const record: DesktopActionRecord = {
    id: `da-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actionType,
    description,
    params,
    status: 'pending',
    screenshot,
    timestamp: Date.now(),
  }
  actionHistory.push(record)

  // Create approval request using existing pipeline
  const approval = requestApproval(
    taskId,
    null,
    actionType,
    description,
    { ...params, screenshotAvailable: !!screenshot, recordId: record.id }
  )

  // If we have a dry-run description, set it
  const dryRunText = formatDryRun(actionType, params)
  if (dryRunText) {
    setDryRunOutput(approval.id, dryRunText)
  }

  // Emit desktop-specific event with screenshot
  eventBus.emit('desktop:action-preview', {
    recordId: record.id,
    approvalId: approval.id,
    actionType,
    description,
    risk: classifyDesktopRisk(actionType),
    params,
    screenshot: screenshot ? { width: screenshot.width, height: screenshot.height } : null,
  })

  // Wait for approval response
  return new Promise((resolve) => {
    const handler = (data: unknown) => {
      const event = data as { approvalId: string; status: string; trustType?: boolean }
      if (event.approvalId !== approval.id) return

      eventBus.off('task:approval-responded', handler)

      const approved = event.status === 'approved' || event.status === 'modified'
      record.status = approved ? 'approved' : 'denied'

      // Learn trust rule if user checked "trust this type"
      if (approved && event.trustType) {
        learnTrustRule(actionType)
      }

      resolve({ approved, trustType: event.trustType })
    }

    eventBus.on('task:approval-responded', handler)
  })
}

// ── Trust learning ───────────────────────────────────────────────────────────

/**
 * Learn to trust an action type (auto-approve in future).
 */
export function learnTrustRule(actionType: DesktopActionType): void {
  const existing = trustRules.get(actionType)
  if (existing) {
    existing.approvedCount++
    return
  }

  trustRules.set(actionType, {
    actionType,
    autoApprove: true,
    createdAt: Date.now(),
    approvedCount: 1,
  })

  console.log(`[DesktopSafety] Learned trust rule: ${actionType} now auto-approves`)
  eventBus.emit('desktop:trust-rule-learned', { actionType })
}

/**
 * Revoke a trust rule (require approval again).
 */
export function revokeTrustRule(actionType: DesktopActionType): void {
  trustRules.delete(actionType)
  console.log(`[DesktopSafety] Revoked trust rule: ${actionType}`)
  eventBus.emit('desktop:trust-rule-revoked', { actionType })
}

/**
 * Get all current trust rules.
 */
export function getTrustRules(): TrustRule[] {
  return Array.from(trustRules.values())
}

/**
 * Reset all trust rules (back to defaults).
 */
export function resetTrustRules(): void {
  trustRules.clear()
  console.log('[DesktopSafety] All trust rules reset')
  eventBus.emit('desktop:trust-rules-reset', {})
}

// ── Action history ───────────────────────────────────────────────────────────

/**
 * Get recent desktop action history.
 */
export function getActionHistory(limit: number = 50): DesktopActionRecord[] {
  return actionHistory.slice(-limit)
}

/**
 * Record an action execution result.
 */
export function recordActionResult(recordId: string, status: 'executed' | 'failed', result?: string): void {
  const record = actionHistory.find((r) => r.id === recordId)
  if (record) {
    record.status = status
    record.result = result
    eventBus.emit('desktop:action-completed', { recordId, status, result })
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a dry-run description for action preview.
 */
function formatDryRun(actionType: DesktopActionType, params: Record<string, unknown>): string {
  switch (actionType) {
    case 'desktop:mouse-click':
      return `Will click ${params.button ?? 'left'} mouse button at (${params.x}, ${params.y})`
    case 'desktop:mouse-double-click':
      return `Will double-click at (${params.x}, ${params.y})`
    case 'desktop:mouse-move':
      return `Will move mouse to (${params.x}, ${params.y})`
    case 'desktop:mouse-scroll':
      return `Will scroll ${params.direction} by ${params.amount ?? 5} at (${params.x}, ${params.y})`
    case 'desktop:mouse-drag':
      return `Will drag from (${params.fromX}, ${params.fromY}) to (${params.toX}, ${params.toY})`
    case 'desktop:type-text':
      return `Will type: "${String(params.text ?? '').slice(0, 100)}${String(params.text ?? '').length > 100 ? '...' : ''}"`
    case 'desktop:press-key':
      return `Will press key: ${params.key}`
    case 'desktop:hotkey':
      return `Will press hotkey: ${Array.isArray(params.modifiers) ? params.modifiers.join('+') : ''}+${params.key}`
    case 'desktop:launch-app':
      return `Will launch app: ${params.appName}`
    case 'desktop:focus-app':
      return `Will focus app: ${params.appName}`
    default:
      return `Will execute: ${actionType}`
  }
}
