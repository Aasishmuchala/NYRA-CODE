/**
 * Webhook Manager — Manage outgoing webhooks triggered by workspace events
 */
import { memoryManager } from './memory'
import { randomUUID } from 'crypto'
import { net } from 'electron'

interface Webhook {
  id: string
  name: string
  url: string
  events: string[]        // event types to listen for
  headers: Record<string, string>
  enabled: boolean
  secret?: string
  lastTriggered?: number
  lastStatus?: number
  failCount: number
  createdAt: number
}

interface WebhookLog {
  id: string
  webhookId: string
  event: string
  status: number
  responseTime: number
  error?: string
  timestamp: number
}

/** Validate webhook URL — block private/internal networks (SSRF prevention) */
function validateWebhookUrl(url: string): void {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error('Invalid webhook URL') }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Webhook URL must use http or https protocol')
  }
  const hostname = parsed.hostname.toLowerCase()
  const blocked = [
    'localhost', '127.0.0.1', '0.0.0.0', '[::1]', '169.254.169.254',
  ]
  if (blocked.includes(hostname)) throw new Error('Webhook URL cannot target localhost or metadata endpoints')
  // Block RFC1918 private ranges
  const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number)
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      throw new Error('Webhook URL cannot target private network addresses')
    }
  }
}

/** Sanitize event payload — strip fields that may contain credentials */
function sanitizePayload(payload: any): any {
  if (payload == null || typeof payload !== 'object') return payload
  const sensitive = ['password', 'secret', 'token', 'apiKey', 'api_key', 'authorization', 'credential']
  const sanitized = Array.isArray(payload) ? [...payload] : { ...payload }
  for (const key of Object.keys(sanitized)) {
    if (sensitive.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizePayload(sanitized[key])
    }
  }
  return sanitized
}

export class WebhookManager {
  private db: any = null

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS webhooks (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
          events TEXT NOT NULL, headers TEXT, enabled INTEGER DEFAULT 1,
          secret TEXT, lastTriggered INTEGER, lastStatus INTEGER,
          failCount INTEGER DEFAULT 0, createdAt INTEGER NOT NULL)`)
        run(`CREATE TABLE IF NOT EXISTS webhook_logs (
          id TEXT PRIMARY KEY, webhookId TEXT NOT NULL, event TEXT NOT NULL,
          status INTEGER, responseTime INTEGER, error TEXT,
          timestamp INTEGER NOT NULL)`)
        run(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_ts ON webhook_logs(timestamp)`)
        console.log('[WebhookManager] Initialized')
      }
    } catch (error) {
      console.warn('[WebhookManager] Init error (non-fatal):', error)
    }
  }

  createWebhook(name: string, url: string, events: string[], opts?: { headers?: Record<string, string>; secret?: string }): Webhook {
    if (!this.db) throw new Error('DB not initialized')
    validateWebhookUrl(url)
    const id = randomUUID()
    const now = Date.now()
    this.db.prepare(`INSERT INTO webhooks (id, name, url, events, headers, enabled, secret, failCount, createdAt) VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?)`)
      .run(id, name, url, JSON.stringify(events), JSON.stringify(opts?.headers || {}), opts?.secret || null, now)
    return this.getWebhook(id)!
  }

  updateWebhook(id: string, updates: Partial<{ name: string; url: string; events: string[]; headers: Record<string, string>; secret: string }>): Webhook | null {
    if (!this.db) return null
    const sets: string[] = []
    const vals: any[] = []
    if (updates.name) { sets.push('name = ?'); vals.push(updates.name) }
    if (updates.url) { validateWebhookUrl(updates.url); sets.push('url = ?'); vals.push(updates.url) }
    if (updates.events) { sets.push('events = ?'); vals.push(JSON.stringify(updates.events)) }
    if (updates.headers) { sets.push('headers = ?'); vals.push(JSON.stringify(updates.headers)) }
    if (updates.secret !== undefined) { sets.push('secret = ?'); vals.push(updates.secret) }
    if (sets.length === 0) return this.getWebhook(id)
    vals.push(id)
    this.db.prepare(`UPDATE webhooks SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return this.getWebhook(id)
  }

  deleteWebhook(id: string): void {
    if (!this.db) return
    this.db.prepare(`DELETE FROM webhooks WHERE id = ?`).run(id)
    this.db.prepare(`DELETE FROM webhook_logs WHERE webhookId = ?`).run(id)
  }

  enableWebhook(id: string): void { if (this.db) this.db.prepare(`UPDATE webhooks SET enabled = 1 WHERE id = ?`).run(id) }
  disableWebhook(id: string): void { if (this.db) this.db.prepare(`UPDATE webhooks SET enabled = 0 WHERE id = ?`).run(id) }

  getWebhook(id: string): Webhook | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM webhooks WHERE id = ?`).get(id) as any
    return row ? this.rowToWebhook(row) : null
  }

  listWebhooks(): Webhook[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM webhooks ORDER BY createdAt DESC`).all() as any[]).map(r => this.rowToWebhook(r))
  }

  async fireEvent(event: string, payload: any): Promise<void> {
    if (!this.db) return
    const webhooks = this.db.prepare(`SELECT * FROM webhooks WHERE enabled = 1`).all() as any[]
    for (const row of webhooks) {
      const wh = this.rowToWebhook(row)
      if (!wh.events.includes(event) && !wh.events.includes('*')) continue
      this.sendWebhook(wh, event, payload).catch(() => {})
    }
  }

  private async sendWebhook(wh: Webhook, event: string, payload: any): Promise<void> {
    const logId = randomUUID()
    const start = Date.now()
    try {
      const body = JSON.stringify({ event, payload: sanitizePayload(payload), timestamp: Date.now(), webhookId: wh.id })
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...wh.headers }
      if (wh.secret) headers['X-Nyra-Secret'] = wh.secret

      const response = await new Promise<{ status: number }>((resolve, reject) => {
        const request = net.request({ method: 'POST', url: wh.url })
        for (const [k, v] of Object.entries(headers)) request.setHeader(k, v)
        request.on('response', (res) => resolve({ status: res.statusCode }))
        request.on('error', reject)
        request.write(body)
        request.end()
      })

      const elapsed = Date.now() - start
      this.db.prepare(`UPDATE webhooks SET lastTriggered = ?, lastStatus = ?, failCount = 0 WHERE id = ?`).run(Date.now(), response.status, wh.id)
      this.db.prepare(`INSERT INTO webhook_logs (id, webhookId, event, status, responseTime, timestamp) VALUES (?, ?, ?, ?, ?, ?)`).run(logId, wh.id, event, response.status, elapsed, Date.now())
    } catch (err: any) {
      const elapsed = Date.now() - start
      this.db.prepare(`UPDATE webhooks SET lastTriggered = ?, lastStatus = 0, failCount = failCount + 1 WHERE id = ?`).run(Date.now(), wh.id)
      this.db.prepare(`INSERT INTO webhook_logs (id, webhookId, event, status, responseTime, error, timestamp) VALUES (?, ?, ?, 0, ?, ?, ?)`).run(logId, wh.id, event, elapsed, err.message, Date.now())
    }
  }

  getLogs(webhookId?: string, limit: number = 50): WebhookLog[] {
    if (!this.db) return []
    const q = webhookId
      ? this.db.prepare(`SELECT * FROM webhook_logs WHERE webhookId = ? ORDER BY timestamp DESC LIMIT ?`)
      : this.db.prepare(`SELECT * FROM webhook_logs ORDER BY timestamp DESC LIMIT ?`)
    const rows = webhookId ? q.all(webhookId, limit) : q.all(limit)
    return (rows as any[]).map(r => ({ id: r.id, webhookId: r.webhookId, event: r.event, status: r.status, responseTime: r.responseTime, error: r.error || undefined, timestamp: r.timestamp }))
  }

  getStats(): { totalWebhooks: number; activeWebhooks: number; totalFired: number; failRate: number } {
    if (!this.db) return { totalWebhooks: 0, activeWebhooks: 0, totalFired: 0, failRate: 0 }
    const total = (this.db.prepare(`SELECT COUNT(*) as c FROM webhooks`).get() as any)?.c || 0
    const active = (this.db.prepare(`SELECT COUNT(*) as c FROM webhooks WHERE enabled = 1`).get() as any)?.c || 0
    const fired = (this.db.prepare(`SELECT COUNT(*) as c FROM webhook_logs`).get() as any)?.c || 0
    const failed = (this.db.prepare(`SELECT COUNT(*) as c FROM webhook_logs WHERE status = 0 OR status >= 400`).get() as any)?.c || 0
    return { totalWebhooks: total, activeWebhooks: active, totalFired: fired, failRate: fired > 0 ? failed / fired : 0 }
  }

  private rowToWebhook(row: any): Webhook {
    return {
      id: row.id, name: row.name, url: row.url,
      events: JSON.parse(row.events || '[]'), headers: JSON.parse(row.headers || '{}'),
      enabled: row.enabled === 1, secret: row.secret || undefined,
      lastTriggered: row.lastTriggered || undefined, lastStatus: row.lastStatus || undefined,
      failCount: row.failCount || 0, createdAt: row.createdAt,
    }
  }
}

export const webhookManager = new WebhookManager()
