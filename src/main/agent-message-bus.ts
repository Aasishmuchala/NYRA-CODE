/**
 * Agent Message Bus — Direct agent-to-agent communication layer.
 *
 * Enables agents to collaborate without round-tripping through the orchestrator:
 *   - Direct messages: agent → specific agent
 *   - Broadcasts: agent → all agents
 *   - Request/Reply: async question → answer with correlation IDs
 *   - Artifact sharing: pass files, code, analysis between agents
 *   - Help requests: an agent can ask another specialist for assistance
 *
 * The orchestrator still observes all traffic via the `agent:*` EventBus domain
 * for audit logging and can intercept/block messages if needed.
 *
 * Design:
 *   - In-process pub/sub (not network), so zero serialization overhead
 *   - Per-agent inbox with bounded capacity (prevents memory leaks)
 *   - Message TTL for auto-expiry of stale requests
 *   - Correlation IDs link request→reply pairs for async conversations
 */

import { emitEvent } from './event-bus'
import * as auditLog from './audit-log'

// ── Types ────────────────────────────────────────────────────────────────────

export type AgentMessageType =
  | 'direct'            // Point-to-point message
  | 'broadcast'         // Sent to all agents
  | 'help_request'      // Agent asking another for assistance
  | 'help_response'     // Response to a help request
  | 'artifact_share'    // Sharing a file, code snippet, or analysis result
  | 'capability_query'  // "Can you handle X?"
  | 'capability_reply'  // "Yes, I can handle X because..."
  | 'handoff'           // Transferring ownership of a subtask
  | 'status_ping'       // Lightweight heartbeat/status check
  | 'status_pong'       // Response to status ping

export interface AgentBusMessage {
  /** Unique message ID for deduplication */
  id: string
  /** Correlation ID linking request→reply pairs */
  correlationId?: string
  /** Sender agent ID */
  from: string
  /** Recipient agent ID, or '*' for broadcast */
  to: string
  /** Message classification */
  type: AgentMessageType
  /** Task context (optional — messages can be task-independent) */
  taskId?: string
  /** Message payload */
  payload: {
    /** Human-readable summary */
    summary: string
    /** Structured data (type depends on message type) */
    data?: unknown
    /** Shared artifacts */
    artifacts?: Array<{ name: string; type: string; content: string }>
    /** Requested capabilities (for capability_query) */
    capabilities?: string[]
    /** Priority: 0 = background, 1 = normal, 2 = urgent */
    priority?: number
  }
  /** Unix timestamp (ms) */
  timestamp: number
  /** TTL in ms — message expires after this duration (default: 60s) */
  ttlMs: number
  /** Whether this message has been read by the recipient */
  read: boolean
}

/** Callback for message delivery */
export type MessageHandler = (message: AgentBusMessage) => void | Promise<void>

/** Reply resolver for request/reply pattern */
export interface PendingReply {
  resolve: (message: AgentBusMessage) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

// ── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_TTL_MS = 60_000        // 60 seconds
const MAX_INBOX_SIZE = 100           // Per-agent inbox capacity
const REPLY_TIMEOUT_MS = 30_000      // 30 seconds for request/reply
const MAX_HISTORY_SIZE = 500         // Global message history

// ── Message Bus Implementation ───────────────────────────────────────────────

export class AgentMessageBus {
  /** Per-agent message handlers (agent subscribes to receive messages) */
  private handlers = new Map<string, Set<MessageHandler>>()

  /** Per-agent inboxes for queued messages (when no handler is registered) */
  private inboxes = new Map<string, AgentBusMessage[]>()

  /** Pending request/reply correlation map */
  private pendingReplies = new Map<string, PendingReply>()

  /** Global message history for audit/UI */
  private history: AgentBusMessage[] = []

  /** Global observers (orchestrator, UI, audit) */
  private observers = new Set<MessageHandler>()

  // ── Core Messaging ─────────────────────────────────────────────────────

  /**
   * Send a direct message from one agent to another.
   */
  send(message: Omit<AgentBusMessage, 'id' | 'timestamp' | 'read' | 'ttlMs'> & { ttlMs?: number }): AgentBusMessage {
    const fullMessage: AgentBusMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
      ttlMs: message.ttlMs ?? DEFAULT_TTL_MS,
    }

    // Record in history
    this.addToHistory(fullMessage)

    // Notify observers (orchestrator, audit, UI)
    this.notifyObservers(fullMessage)

    // Emit on EventBus for renderer forwarding
    emitEvent('agent:message' as any, {
      id: fullMessage.id,
      from: fullMessage.from,
      to: fullMessage.to,
      type: fullMessage.type,
      taskId: fullMessage.taskId,
      summary: fullMessage.payload.summary,
      timestamp: fullMessage.timestamp,
    })

    // Route the message
    if (fullMessage.to === '*') {
      this.deliverBroadcast(fullMessage)
    } else {
      this.deliverDirect(fullMessage)
    }

    // Check if this is a reply to a pending request
    if (fullMessage.correlationId && this.pendingReplies.has(fullMessage.correlationId)) {
      const pending = this.pendingReplies.get(fullMessage.correlationId)!
      clearTimeout(pending.timer)
      this.pendingReplies.delete(fullMessage.correlationId)
      pending.resolve(fullMessage)
    }

    return fullMessage
  }

  /**
   * Broadcast a message to all registered agents.
   */
  broadcast(
    from: string,
    type: AgentMessageType,
    payload: AgentBusMessage['payload'],
    taskId?: string,
  ): AgentBusMessage {
    return this.send({ from, to: '*', type, payload, taskId })
  }

  /**
   * Send a message and wait for a reply (request/reply pattern).
   * Returns a Promise that resolves when the recipient replies with the same correlationId.
   */
  async request(
    message: Omit<AgentBusMessage, 'id' | 'timestamp' | 'read' | 'ttlMs' | 'correlationId'>,
    timeoutMs: number = REPLY_TIMEOUT_MS,
  ): Promise<AgentBusMessage> {
    const correlationId = `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    return new Promise<AgentBusMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingReplies.delete(correlationId)
        reject(new Error(`Agent reply timeout: ${message.to} did not respond within ${timeoutMs}ms`))
      }, timeoutMs)

      this.pendingReplies.set(correlationId, { resolve, reject, timer })

      this.send({ ...message, correlationId })
    })
  }

  /**
   * Reply to a received message (preserves correlationId).
   */
  reply(
    originalMessage: AgentBusMessage,
    from: string,
    type: AgentMessageType,
    payload: AgentBusMessage['payload'],
  ): AgentBusMessage {
    return this.send({
      from,
      to: originalMessage.from,
      type,
      correlationId: originalMessage.correlationId || originalMessage.id,
      taskId: originalMessage.taskId,
      payload,
    })
  }

  // ── Convenience Methods ────────────────────────────────────────────────

  /**
   * Request help from a specific agent.
   */
  async requestHelp(
    from: string,
    to: string,
    summary: string,
    data?: unknown,
    taskId?: string,
  ): Promise<AgentBusMessage> {
    return this.request({
      from,
      to,
      type: 'help_request',
      taskId,
      payload: { summary, data, priority: 2 },
    })
  }

  /**
   * Share an artifact with another agent.
   */
  shareArtifact(
    from: string,
    to: string,
    artifact: { name: string; type: string; content: string },
    summary: string,
    taskId?: string,
  ): AgentBusMessage {
    return this.send({
      from,
      to,
      type: 'artifact_share',
      taskId,
      payload: { summary, artifacts: [artifact] },
    })
  }

  /**
   * Query whether an agent can handle specific capabilities.
   */
  async queryCapabilities(
    from: string,
    to: string,
    capabilities: string[],
  ): Promise<AgentBusMessage> {
    return this.request({
      from,
      to,
      type: 'capability_query',
      payload: { summary: `Can you handle: ${capabilities.join(', ')}?`, capabilities },
    })
  }

  /**
   * Hand off a subtask to another agent.
   */
  handoff(
    from: string,
    to: string,
    taskId: string,
    summary: string,
    artifacts?: Array<{ name: string; type: string; content: string }>,
  ): AgentBusMessage {
    // Also record in audit log for the existing handoff tracking
    auditLog.logAction({
      taskId,
      agentId: from,
      action: 'agent_handoff_via_bus',
      target: to,
      reversible: false,
      snapshotId: null,
      details: { summary, artifactCount: artifacts?.length || 0 },
    })

    return this.send({
      from,
      to,
      type: 'handoff',
      taskId,
      payload: { summary, artifacts, priority: 2 },
    })
  }

  // ── Subscription ───────────────────────────────────────────────────────

  /**
   * Register a handler for an agent's incoming messages.
   * Returns an unsubscribe function.
   */
  subscribe(agentId: string, handler: MessageHandler): () => void {
    const handlers = this.handlers.get(agentId) ?? new Set()
    handlers.add(handler)
    this.handlers.set(agentId, handlers)

    // Deliver any queued inbox messages
    const inbox = this.inboxes.get(agentId)
    if (inbox && inbox.length > 0) {
      const now = Date.now()
      const validMessages = inbox.filter(m => now - m.timestamp < m.ttlMs)
      this.inboxes.set(agentId, [])
      for (const msg of validMessages) {
        this.safeDeliver(handler, msg)
      }
    }

    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) this.handlers.delete(agentId)
    }
  }

  /**
   * Register a global observer (receives ALL messages regardless of recipient).
   * Used by the orchestrator and UI for audit/monitoring.
   */
  observe(handler: MessageHandler): () => void {
    this.observers.add(handler)
    return () => { this.observers.delete(handler) }
  }

  // ── Inbox & History ────────────────────────────────────────────────────

  /**
   * Get unread messages for an agent.
   */
  getInbox(agentId: string): AgentBusMessage[] {
    const now = Date.now()
    const inbox = this.inboxes.get(agentId) || []
    return inbox.filter(m => now - m.timestamp < m.ttlMs)
  }

  /**
   * Get global message history (newest first).
   */
  getHistory(limit: number = 50): AgentBusMessage[] {
    return this.history.slice(0, limit)
  }

  /**
   * Get conversation thread by correlationId.
   */
  getThread(correlationId: string): AgentBusMessage[] {
    return this.history.filter(
      m => m.correlationId === correlationId || m.id === correlationId
    ).sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get all messages for a specific task.
   */
  getTaskMessages(taskId: string): AgentBusMessage[] {
    return this.history.filter(m => m.taskId === taskId)
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get message counts per agent (for UI badges).
   */
  getUnreadCounts(): Record<string, number> {
    const counts: Record<string, number> = {}
    const now = Date.now()
    for (const [agentId, inbox] of this.inboxes) {
      const valid = inbox.filter(m => !m.read && now - m.timestamp < m.ttlMs)
      if (valid.length > 0) counts[agentId] = valid.length
    }
    return counts
  }

  /**
   * Mark a message as read.
   */
  markRead(messageId: string): void {
    const msg = this.history.find(m => m.id === messageId)
    if (msg) msg.read = true

    // Also mark in inbox
    for (const inbox of this.inboxes.values()) {
      const msg = inbox.find(m => m.id === messageId)
      if (msg) msg.read = true
    }
  }

  /**
   * Clear expired messages from all inboxes.
   */
  purgeExpired(): number {
    const now = Date.now()
    let purged = 0
    for (const [agentId, inbox] of this.inboxes) {
      const before = inbox.length
      const valid = inbox.filter(m => now - m.timestamp < m.ttlMs)
      this.inboxes.set(agentId, valid)
      purged += before - valid.length
    }
    return purged
  }

  // ── Internal Routing ───────────────────────────────────────────────────

  private deliverDirect(message: AgentBusMessage): void {
    const handlers = this.handlers.get(message.to)
    if (handlers && handlers.size > 0) {
      for (const handler of handlers) {
        this.safeDeliver(handler, message)
      }
    } else {
      // No handler registered — queue in inbox
      this.addToInbox(message.to, message)
    }
  }

  private deliverBroadcast(message: AgentBusMessage): void {
    // Deliver to all registered handlers except the sender
    for (const [agentId, handlers] of this.handlers) {
      if (agentId === message.from) continue
      for (const handler of handlers) {
        this.safeDeliver(handler, message)
      }
    }
  }

  private safeDeliver(handler: MessageHandler, message: AgentBusMessage): void {
    try {
      const result = handler(message)
      if (result instanceof Promise) {
        result.catch(err => {
          console.error(`[MessageBus] Handler error for message ${message.id}:`, err)
        })
      }
    } catch (err) {
      console.error(`[MessageBus] Sync handler error for message ${message.id}:`, err)
    }
  }

  private addToInbox(agentId: string, message: AgentBusMessage): void {
    const inbox = this.inboxes.get(agentId) ?? []
    inbox.push(message)
    // Enforce capacity — drop oldest
    if (inbox.length > MAX_INBOX_SIZE) {
      inbox.splice(0, inbox.length - MAX_INBOX_SIZE)
    }
    this.inboxes.set(agentId, inbox)
  }

  private addToHistory(message: AgentBusMessage): void {
    this.history.unshift(message) // Newest first
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history.length = MAX_HISTORY_SIZE
    }
  }

  private notifyObservers(message: AgentBusMessage): void {
    for (const observer of this.observers) {
      this.safeDeliver(observer, message)
    }
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────

export const agentMessageBus = new AgentMessageBus()
