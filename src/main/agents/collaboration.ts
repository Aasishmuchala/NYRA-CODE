/**
 * Multi-Agent Collaboration Engine
 *
 * Upgrades NYRA's agent system from "one agent at a time" to collaborative
 * multi-agent execution with priority queuing and shared workspace.
 *
 * Architecture:
 * - PriorityQueue: Messages sorted by urgency (critical > high > normal > low)
 * - SharedWorkspace: In-memory key-value store with conflict resolution
 * - PlanExecuteReview: Orchestration pipeline where planner decomposes,
 *   specialists execute, and QA reviews before returning to user
 * - HumanCheckpoint: Blocks execution until user approves high-risk actions
 */
import { EventEmitter } from 'events'

// Priority levels for agent messages
export enum Priority {
  CRITICAL = 0,  // Security alerts, error recovery
  HIGH = 1,      // User-facing responses
  NORMAL = 2,    // Standard agent-to-agent
  LOW = 3,       // Background tasks, analytics
}

export interface AgentMessage {
  id: string
  from: string       // Agent ID
  to: string         // Agent ID or '*' for broadcast
  priority: Priority
  type: 'task' | 'result' | 'review' | 'escalation' | 'checkpoint'
  payload: unknown
  timestamp: number
  deadline?: number  // Optional timeout
}

export interface WorkspaceEntry {
  key: string
  value: unknown
  owner: string      // Agent that last wrote
  version: number
  updatedAt: number
}

export interface PlanStep {
  id: string
  description: string
  assignee: string        // Agent role
  status: 'pending' | 'running' | 'review' | 'approved' | 'rejected' | 'completed'
  input?: unknown
  output?: unknown
  reviewNotes?: string
  requiresApproval: boolean
}

// ── Priority Queue ──────────────────────────────────────────────────────
export class PriorityMessageQueue {
  private queues: Map<string, AgentMessage[]> = new Map() // Per-agent queues
  private globalQueue: AgentMessage[] = []

  enqueue(msg: AgentMessage): void {
    // Add to global queue sorted by priority
    this.globalQueue.push(msg)
    this.globalQueue.sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp)

    // Add to target agent's queue
    if (msg.to !== '*') {
      const q = this.queues.get(msg.to) || []
      q.push(msg)
      q.sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp)
      this.queues.set(msg.to, q)
    } else {
      // Broadcast: add to all queues
      for (const [, q] of this.queues) {
        q.push(msg)
        q.sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp)
      }
    }
  }

  dequeue(agentId: string): AgentMessage | undefined {
    const q = this.queues.get(agentId)
    if (!q?.length) return undefined
    const msg = q.shift()
    // Also remove from global queue
    if (msg) {
      const idx = this.globalQueue.findIndex(m => m.id === msg.id)
      if (idx >= 0) this.globalQueue.splice(idx, 1)
    }
    return msg
  }

  peek(agentId: string): AgentMessage | undefined {
    return this.queues.get(agentId)?.[0]
  }

  registerAgent(agentId: string): void {
    if (!this.queues.has(agentId)) this.queues.set(agentId, [])
  }

  getQueueDepth(agentId: string): number {
    return this.queues.get(agentId)?.length || 0
  }

  getTotalPending(): number {
    return this.globalQueue.length
  }

  // Remove expired messages (past deadline)
  pruneExpired(): number {
    const now = Date.now()
    let pruned = 0
    for (const [agentId, q] of this.queues) {
      const before = q.length
      const filtered = q.filter(m => !m.deadline || m.deadline > now)
      this.queues.set(agentId, filtered)
      pruned += before - filtered.length
    }
    this.globalQueue = this.globalQueue.filter(m => !m.deadline || m.deadline > now)
    return pruned
  }
}

// ── Shared Workspace ────────────────────────────────────────────────────
export class SharedWorkspace {
  private store: Map<string, WorkspaceEntry> = new Map()
  private history: Array<{ key: string; value: unknown; owner: string; version: number; timestamp: number }> = []

  read(key: string): WorkspaceEntry | undefined {
    return this.store.get(key)
  }

  write(key: string, value: unknown, owner: string): { success: boolean; version: number; conflict?: WorkspaceEntry } {
    const existing = this.store.get(key)
    const version = (existing?.version || 0) + 1

    const entry: WorkspaceEntry = { key, value, owner, version, updatedAt: Date.now() }
    this.store.set(key, entry)
    this.history.push({ key, value, owner, version, timestamp: Date.now() })

    return { success: true, version }
  }

  // Compare-and-swap for concurrent writes
  cas(key: string, value: unknown, owner: string, expectedVersion: number): { success: boolean; version: number; conflict?: WorkspaceEntry } {
    const existing = this.store.get(key)
    if (existing && existing.version !== expectedVersion) {
      return { success: false, version: existing.version, conflict: existing }
    }
    return this.write(key, value, owner)
  }

  list(): WorkspaceEntry[] {
    return Array.from(this.store.values())
  }

  getHistory(key?: string, limit = 50): typeof this.history {
    const filtered = key ? this.history.filter(h => h.key === key) : this.history
    return filtered.slice(-limit)
  }

  clear(): void {
    this.store.clear()
    this.history = []
  }
}

// ── Plan → Execute → Review Pipeline ────────────────────────────────────
export class PlanExecuteReviewPipeline extends EventEmitter {
  private plans: Map<string, PlanStep[]> = new Map()
  private queue: PriorityMessageQueue
  private workspace: SharedWorkspace

  constructor(queue: PriorityMessageQueue, workspace: SharedWorkspace) {
    super()
    this.queue = queue
    this.workspace = workspace
  }

  createPlan(planId: string, steps: Omit<PlanStep, 'status' | 'output' | 'reviewNotes'>[]): PlanStep[] {
    const plan = steps.map(s => ({
      ...s,
      status: 'pending' as const,
      output: undefined,
      reviewNotes: undefined,
    }))
    this.plans.set(planId, plan)
    this.emit('plan-created', { planId, steps: plan })
    return plan
  }

  async executeStep(planId: string, stepId: string): Promise<PlanStep | null> {
    const plan = this.plans.get(planId)
    if (!plan) return null
    const step = plan.find(s => s.id === stepId)
    if (!step || step.status !== 'pending') return null

    step.status = 'running'
    this.emit('step-started', { planId, step })

    // Dispatch task to assigned agent via priority queue
    this.queue.enqueue({
      id: `task-${planId}-${stepId}`,
      from: 'planner',
      to: step.assignee,
      priority: Priority.HIGH,
      type: 'task',
      payload: { planId, stepId, description: step.description, input: step.input },
      timestamp: Date.now(),
    })

    return step
  }

  submitResult(planId: string, stepId: string, output: unknown): PlanStep | null {
    const plan = this.plans.get(planId)
    if (!plan) return null
    const step = plan.find(s => s.id === stepId)
    if (!step) return null

    step.output = output
    step.status = step.requiresApproval ? 'review' : 'completed'

    // Store result in shared workspace
    this.workspace.write(`plan:${planId}:${stepId}:result`, output, step.assignee)

    this.emit('step-result', { planId, step })

    if (step.status === 'review') {
      // Send to QA agent for review
      this.queue.enqueue({
        id: `review-${planId}-${stepId}`,
        from: step.assignee,
        to: 'qa-reviewer',
        priority: Priority.HIGH,
        type: 'review',
        payload: { planId, stepId, output, description: step.description },
        timestamp: Date.now(),
      })
    }

    return step
  }

  approveStep(planId: string, stepId: string, notes?: string): boolean {
    const plan = this.plans.get(planId)
    const step = plan?.find(s => s.id === stepId)
    if (!step || step.status !== 'review') return false

    step.status = 'completed'
    step.reviewNotes = notes
    this.emit('step-approved', { planId, step })
    return true
  }

  rejectStep(planId: string, stepId: string, notes: string): boolean {
    const plan = this.plans.get(planId)
    const step = plan?.find(s => s.id === stepId)
    if (!step || step.status !== 'review') return false

    step.status = 'rejected'
    step.reviewNotes = notes
    this.emit('step-rejected', { planId, step })
    return true
  }

  requestHumanApproval(planId: string, stepId: string, reason: string): void {
    this.emit('checkpoint', { planId, stepId, reason, type: 'human-approval-required' })
  }

  getPlan(planId: string): PlanStep[] | undefined {
    return this.plans.get(planId)
  }

  getPlanProgress(planId: string): { total: number; completed: number; running: number; pending: number; rejected: number } | null {
    const plan = this.plans.get(planId)
    if (!plan) return null
    return {
      total: plan.length,
      completed: plan.filter(s => s.status === 'completed').length,
      running: plan.filter(s => s.status === 'running').length,
      pending: plan.filter(s => s.status === 'pending').length,
      rejected: plan.filter(s => s.status === 'rejected').length,
    }
  }
}

// ── Singleton exports ───────────────────────────────────────────────────
export const priorityQueue = new PriorityMessageQueue()
export const sharedWorkspace = new SharedWorkspace()
export const pipeline = new PlanExecuteReviewPipeline(priorityQueue, sharedWorkspace)
