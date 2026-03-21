/**
 * Background Agent Automations — Event-driven rule engine
 *
 * Features:
 *   - Rule format: WHEN <event> IF <condition> THEN <action>
 *   - Event sources: file system, git, schedule, webhook, manual
 *   - Actions: run agent, send notification, execute command, call MCP tool
 *   - Cooldown / dedup: prevent rapid re-triggering
 *   - Persistent rules: stored in memory.db via MemoryManager
 *
 * Architecture:
 *   AutomationEngine → EventBus (listens for events)
 *                    → AgentOrchestrator (for agent actions)
 *                    → MCP Tool Router (for tool actions)
 *                    → Notifications (for notify actions)
 */

import { EventEmitter } from 'events'
import { eventBus } from './event-bus'
import { memoryManager } from './memory'
import { sendNotification } from './notifications'

// ── Types ────────────────────────────────────────────────────────────────────

export type EventSource =
  | 'file:created' | 'file:modified' | 'file:deleted'
  | 'git:commit' | 'git:push' | 'git:branch-changed'
  | 'schedule:cron' | 'schedule:interval'
  | 'task:completed' | 'task:failed'
  | 'agent:completed' | 'agent:error'
  | 'manual'

export type ActionType = 'run-agent' | 'send-notification' | 'execute-command' | 'call-tool' | 'run-script'

export interface AutomationCondition {
  field: string          // dot-path into event data, e.g. 'filePath', 'agent.role'
  operator: 'equals' | 'contains' | 'matches' | 'startsWith' | 'endsWith' | 'exists'
  value?: string         // comparison value (regex for 'matches')
}

export interface AutomationAction {
  type: ActionType
  config: Record<string, any>
  // run-agent: { taskTitle, taskDescription, agentRole, projectId }
  // send-notification: { title, body }
  // execute-command: { command, args, cwd }
  // call-tool: { toolName, args }
  // run-script: { scriptPath }
}

export interface AutomationRule {
  id: string
  name: string
  description?: string
  enabled: boolean
  event: EventSource
  conditions: AutomationCondition[]     // all must match (AND logic)
  actions: AutomationAction[]           // executed sequentially
  cooldownMs: number                    // minimum time between triggers (default 5s)
  projectId?: string                    // scope to a project
  createdAt: number
  updatedAt: number
  lastTriggeredAt?: number
  triggerCount: number
}

export interface AutomationLog {
  id: string
  ruleId: string
  ruleName: string
  event: string
  eventData: Record<string, any>
  actionsExecuted: number
  actionsFailed: number
  timestamp: number
  durationMs: number
  error?: string
}

// ── Automation Engine ────────────────────────────────────────────────────────

class AutomationEngine extends EventEmitter {
  private rules: Map<string, AutomationRule> = new Map()
  private logs: AutomationLog[] = []
  private initialized = false

  /**
   * Initialize: load rules from DB, subscribe to events
   */
  init(): void {
    if (this.initialized) return

    this.ensureTable()
    this.loadRules()
    this.subscribeToEvents()
    this.initialized = true

    console.log(`[Automations] Initialized with ${this.rules.size} rule(s)`)
  }

  private ensureTable(): void {
    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS automation_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        enabled INTEGER DEFAULT 1,
        event TEXT NOT NULL,
        conditions TEXT DEFAULT '[]',
        actions TEXT DEFAULT '[]',
        cooldown_ms INTEGER DEFAULT 5000,
        project_id TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        last_triggered_at INTEGER,
        trigger_count INTEGER DEFAULT 0
      )
    `)

    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS automation_logs (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        rule_name TEXT NOT NULL,
        event TEXT NOT NULL,
        event_data TEXT,
        actions_executed INTEGER DEFAULT 0,
        actions_failed INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL,
        duration_ms INTEGER DEFAULT 0,
        error TEXT
      )
    `)

    memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_auto_rules_event ON automation_rules(event)`)
    memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_auto_logs_rule ON automation_logs(rule_id)`)
    memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_auto_logs_ts ON automation_logs(timestamp DESC)`)
  }

  private loadRules(): void {
    const rows = memoryManager.queryAll(`SELECT * FROM automation_rules`)
    for (const row of rows) {
      this.rules.set(row.id, this.rowToRule(row))
    }
  }

  // ── Event Subscription ──────────────────────────────────────────────────

  private subscribeToEvents(): void {
    // Subscribe to all event domains we care about
    const domains = ['file', 'git', 'task', 'agent', 'schedule'] as const

    for (const domain of domains) {
      const handler = (data: unknown) => {
        // The event name is passed as part of the EventBus emission
        // We need to match against all rules for this domain
        this.evaluateRulesForDomain(domain, data)
      }

      eventBus.on(`${domain}:*` as any, handler)
    }
  }

  private evaluateRulesForDomain(domain: string, data: unknown): void {
    for (const [, rule] of this.rules) {
      if (!rule.enabled) continue
      if (!rule.event.startsWith(domain + ':')) continue

      // Check cooldown
      if (rule.lastTriggeredAt && Date.now() - rule.lastTriggeredAt < rule.cooldownMs) {
        continue
      }

      // Check conditions
      if (!this.evaluateConditions(rule.conditions, data as Record<string, any>)) {
        continue
      }

      // Execute actions
      this.executeRule(rule, data as Record<string, any>).catch(err => {
        console.error(`[Automations] Rule ${rule.name} failed:`, err)
      })
    }
  }

  private evaluateConditions(conditions: AutomationCondition[], data: Record<string, any>): boolean {
    if (conditions.length === 0) return true

    return conditions.every(cond => {
      const fieldValue = this.getNestedValue(data, cond.field)

      switch (cond.operator) {
        case 'equals':
          return String(fieldValue) === cond.value
        case 'contains':
          return String(fieldValue ?? '').includes(cond.value || '')
        case 'startsWith':
          return String(fieldValue ?? '').startsWith(cond.value || '')
        case 'endsWith':
          return String(fieldValue ?? '').endsWith(cond.value || '')
        case 'matches':
          try {
            return new RegExp(cond.value || '').test(String(fieldValue ?? ''))
          } catch {
            return false
          }
        case 'exists':
          return fieldValue !== undefined && fieldValue !== null
        default:
          return false
      }
    })
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((curr, key) => curr?.[key], obj)
  }

  // ── Rule Execution ──────────────────────────────────────────────────────

  private async executeRule(rule: AutomationRule, eventData: Record<string, any>): Promise<void> {
    const logId = `alog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const start = Date.now()
    let actionsExecuted = 0
    let actionsFailed = 0
    let error: string | undefined

    this.emit('automation:triggered', { ruleId: rule.id, ruleName: rule.name, event: rule.event })

    try {
      for (const action of rule.actions) {
        try {
          await this.executeAction(action, eventData, rule)
          actionsExecuted++
        } catch (err: any) {
          actionsFailed++
          error = err.message
          console.error(`[Automations] Action ${action.type} failed in rule ${rule.name}:`, err)
        }
      }
    } catch (err: any) {
      error = err.message
    }

    const durationMs = Date.now() - start

    // Update rule stats
    rule.lastTriggeredAt = Date.now()
    rule.triggerCount++
    memoryManager.run(
      `UPDATE automation_rules SET last_triggered_at = ?, trigger_count = ?, updated_at = unixepoch() WHERE id = ?`,
      [rule.lastTriggeredAt, rule.triggerCount, rule.id]
    )

    // Store log
    const log: AutomationLog = {
      id: logId,
      ruleId: rule.id,
      ruleName: rule.name,
      event: rule.event,
      eventData,
      actionsExecuted,
      actionsFailed,
      timestamp: Date.now(),
      durationMs,
      error,
    }

    this.logs.push(log)
    if (this.logs.length > 500) this.logs.splice(0, this.logs.length - 500)

    memoryManager.run(
      `INSERT INTO automation_logs (id, rule_id, rule_name, event, event_data, actions_executed, actions_failed, timestamp, duration_ms, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [logId, rule.id, rule.name, rule.event, JSON.stringify(eventData), actionsExecuted, actionsFailed, Date.now(), durationMs, error || null]
    )

    this.emit('automation:executed', log)
  }

  private async executeAction(action: AutomationAction, eventData: Record<string, any>, rule: AutomationRule): Promise<void> {
    const cfg = action.config

    switch (action.type) {
      case 'send-notification':
        sendNotification(
          this.interpolate(cfg.title || 'Automation', eventData),
          this.interpolate(cfg.body || rule.name, eventData)
        )
        break

      case 'run-agent': {
        // Dynamic import to avoid circular dependency
        const agentOrchestrator = await import('./agent-orchestrator')
        const title = this.interpolate(cfg.taskTitle || rule.name, eventData)
        const desc = this.interpolate(cfg.taskDescription || '', eventData)
        await agentOrchestrator.submitTask({
          title,
          description: desc,
          projectId: rule.projectId || cfg.projectId,
          mode: 'solo',
        })
        break
      }

      case 'call-tool': {
        const mcpRouter = await import('./mcp-tool-router')
        await mcpRouter.executeToolCall(cfg.toolName)
        break
      }

      case 'run-script':
        // Safety: only run scripts from project folders
        // The script execution is handled by the task manager's terminal
        this.emit('automation:run-script', { scriptPath: cfg.scriptPath, cwd: cfg.cwd })
        break

      case 'execute-command':
        // Emit event for the terminal to handle
        this.emit('automation:run-command', {
          command: this.interpolate(cfg.command || '', eventData),
          args: cfg.args || [],
          cwd: cfg.cwd,
        })
        break
    }
  }

  /**
   * Simple template interpolation: {{field.path}} → value from eventData
   */
  private interpolate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w[\w.]*)\}\}/g, (_, path) => {
      const val = this.getNestedValue(data, path)
      return val !== undefined ? String(val) : `{{${path}}}`
    })
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  addRule(opts: {
    name: string
    description?: string
    event: EventSource
    conditions?: AutomationCondition[]
    actions: AutomationAction[]
    cooldownMs?: number
    projectId?: string
  }): AutomationRule {
    const id = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = Math.floor(Date.now() / 1000)

    const rule: AutomationRule = {
      id,
      name: opts.name,
      description: opts.description,
      enabled: true,
      event: opts.event,
      conditions: opts.conditions || [],
      actions: opts.actions,
      cooldownMs: opts.cooldownMs ?? 5000,
      projectId: opts.projectId,
      createdAt: now,
      updatedAt: now,
      triggerCount: 0,
    }

    memoryManager.run(
      `INSERT INTO automation_rules (id, name, description, enabled, event, conditions, actions, cooldown_ms, project_id, created_at, updated_at, trigger_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, rule.name, rule.description || null, 1, rule.event,
       JSON.stringify(rule.conditions), JSON.stringify(rule.actions),
       rule.cooldownMs, rule.projectId || null, now, now, 0]
    )

    this.rules.set(id, rule)
    this.emit('automation:rule-added', rule)
    return rule
  }

  updateRule(id: string, updates: Partial<Pick<AutomationRule, 'name' | 'description' | 'enabled' | 'event' | 'conditions' | 'actions' | 'cooldownMs'>>): AutomationRule | null {
    const rule = this.rules.get(id)
    if (!rule) return null

    if (updates.name !== undefined) rule.name = updates.name
    if (updates.description !== undefined) rule.description = updates.description
    if (updates.enabled !== undefined) rule.enabled = updates.enabled
    if (updates.event !== undefined) rule.event = updates.event
    if (updates.conditions !== undefined) rule.conditions = updates.conditions
    if (updates.actions !== undefined) rule.actions = updates.actions
    if (updates.cooldownMs !== undefined) rule.cooldownMs = updates.cooldownMs
    rule.updatedAt = Math.floor(Date.now() / 1000)

    memoryManager.run(
      `UPDATE automation_rules SET name=?, description=?, enabled=?, event=?, conditions=?, actions=?, cooldown_ms=?, updated_at=unixepoch() WHERE id=?`,
      [rule.name, rule.description || null, rule.enabled ? 1 : 0, rule.event,
       JSON.stringify(rule.conditions), JSON.stringify(rule.actions),
       rule.cooldownMs, id]
    )

    this.emit('automation:rule-updated', rule)
    return rule
  }

  deleteRule(id: string): boolean {
    if (!this.rules.has(id)) return false
    this.rules.delete(id)
    memoryManager.run(`DELETE FROM automation_rules WHERE id = ?`, [id])
    this.emit('automation:rule-deleted', { id })
    return true
  }

  getRule(id: string): AutomationRule | undefined {
    return this.rules.get(id)
  }

  listRules(projectId?: string): AutomationRule[] {
    const all = Array.from(this.rules.values())
    if (projectId) return all.filter(r => r.projectId === projectId)
    return all.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  // ── Logs ────────────────────────────────────────────────────────────────

  getLogs(opts?: { ruleId?: string; limit?: number }): AutomationLog[] {
    let sql = `SELECT * FROM automation_logs`
    const params: any[] = []

    if (opts?.ruleId) { sql += ` WHERE rule_id = ?`; params.push(opts.ruleId) }
    sql += ` ORDER BY timestamp DESC`
    if (opts?.limit) { sql += ` LIMIT ?`; params.push(opts.limit) }

    return memoryManager.queryAll(sql, params).map(row => ({
      id: row.id,
      ruleId: row.rule_id,
      ruleName: row.rule_name,
      event: row.event,
      eventData: row.event_data ? JSON.parse(row.event_data) : {},
      actionsExecuted: row.actions_executed,
      actionsFailed: row.actions_failed,
      timestamp: row.timestamp,
      durationMs: row.duration_ms,
      error: row.error,
    }))
  }

  getStats(): { totalRules: number; enabledRules: number; totalTriggers: number; recentLogs: number } {
    const totalRules = this.rules.size
    const enabledRules = Array.from(this.rules.values()).filter(r => r.enabled).length
    const totalTriggers = Array.from(this.rules.values()).reduce((s, r) => s + r.triggerCount, 0)
    const recentRow = memoryManager.queryOne(`SELECT COUNT(*) as count FROM automation_logs WHERE timestamp > ?`, [Date.now() - 86400000])

    return { totalRules, enabledRules, totalTriggers, recentLogs: recentRow?.count ?? 0 }
  }

  /**
   * Manually trigger a rule (for testing)
   */
  async triggerManual(ruleId: string, eventData?: Record<string, any>): Promise<void> {
    const rule = this.rules.get(ruleId)
    if (!rule) throw new Error(`Rule not found: ${ruleId}`)
    await this.executeRule(rule, eventData || {})
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private rowToRule(row: any): AutomationRule {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: !!row.enabled,
      event: row.event,
      conditions: row.conditions ? JSON.parse(row.conditions) : [],
      actions: row.actions ? JSON.parse(row.actions) : [],
      cooldownMs: row.cooldown_ms ?? 5000,
      projectId: row.project_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastTriggeredAt: row.last_triggered_at,
      triggerCount: row.trigger_count ?? 0,
    }
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────

export const automationEngine = new AutomationEngine()
