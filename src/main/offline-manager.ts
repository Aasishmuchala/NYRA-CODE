/**
 * Offline Manager — Detect connectivity, queue requests, graceful degradation
 */
import { memoryManager } from './memory'
import { randomUUID } from 'crypto'
import { net } from 'electron'

interface QueuedRequest {
  id: string
  channel: string
  payload: string
  priority: number
  retries: number
  maxRetries: number
  status: 'queued' | 'processing' | 'completed' | 'failed'
  error?: string
  createdAt: number
  processedAt?: number
}

export class OfflineManager {
  private db: any = null
  private _isOnline: boolean = true
  private checkInterval: ReturnType<typeof setInterval> | null = null
  private listeners: Array<(online: boolean) => void> = []

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS offline_queue (
          id TEXT PRIMARY KEY, channel TEXT NOT NULL, payload TEXT NOT NULL,
          priority INTEGER DEFAULT 5, retries INTEGER DEFAULT 0,
          maxRetries INTEGER DEFAULT 3, status TEXT DEFAULT 'queued',
          error TEXT, createdAt INTEGER NOT NULL, processedAt INTEGER)`)
        run(`CREATE TABLE IF NOT EXISTS connectivity_log (
          id TEXT PRIMARY KEY, online INTEGER NOT NULL, timestamp INTEGER NOT NULL)`)
        run(`CREATE INDEX IF NOT EXISTS idx_offline_q_status ON offline_queue(status)`)
        console.log('[OfflineManager] Initialized')
        // Start connectivity check inside db guard so interval only runs when db is ready
        this._isOnline = net.isOnline()
        this.checkInterval = setInterval(() => this.checkConnectivity(), 15000)
      }
    } catch (error) {
      console.warn('[OfflineManager] Init error (non-fatal):', error)
    }
  }

  destroy(): void {
    if (this.checkInterval) clearInterval(this.checkInterval)
  }

  get isOnline(): boolean { return this._isOnline }

  onStatusChange(fn: (online: boolean) => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(f => f !== fn) }
  }

  queueRequest(channel: string, payload: any, priority: number = 5): QueuedRequest {
    const id = randomUUID()
    const now = Date.now()
    const payloadStr = JSON.stringify(payload)
    if (this.db) {
      this.db.prepare(`INSERT INTO offline_queue (id, channel, payload, priority, retries, maxRetries, status, createdAt) VALUES (?, ?, ?, ?, 0, 3, 'queued', ?)`)
        .run(id, channel, payloadStr, priority, now)
    }
    return { id, channel, payload: payloadStr, priority, retries: 0, maxRetries: 3, status: 'queued', createdAt: now }
  }

  getQueue(status?: string): QueuedRequest[] {
    if (!this.db) return []
    const q = status
      ? this.db.prepare(`SELECT * FROM offline_queue WHERE status = ? ORDER BY priority DESC, createdAt ASC`)
      : this.db.prepare(`SELECT * FROM offline_queue ORDER BY priority DESC, createdAt ASC`)
    return (status ? q.all(status) : q.all()) as QueuedRequest[]
  }

  markProcessed(id: string, success: boolean, error?: string): void {
    if (!this.db) return
    const status = success ? 'completed' : 'failed'
    this.db.prepare(`UPDATE offline_queue SET status = ?, error = ?, processedAt = ?, retries = retries + 1 WHERE id = ?`)
      .run(status, error || null, Date.now(), id)
  }

  clearCompleted(): number {
    if (!this.db) return 0
    return (this.db.prepare(`DELETE FROM offline_queue WHERE status = 'completed'`).run() as any).changes || 0
  }

  getConnectivityLog(limit: number = 50): Array<{ online: boolean; timestamp: number }> {
    if (!this.db) return []
    return (this.db.prepare(`SELECT online, timestamp FROM connectivity_log ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[])
      .map(r => ({ online: r.online === 1, timestamp: r.timestamp }))
  }

  getStats(): { isOnline: boolean; queuedCount: number; failedCount: number; uptimePercent: number } {
    if (!this.db) return { isOnline: this._isOnline, queuedCount: 0, failedCount: 0, uptimePercent: 100 }
    const queued = (this.db.prepare(`SELECT COUNT(*) as c FROM offline_queue WHERE status = 'queued'`).get() as any)?.c || 0
    const failed = (this.db.prepare(`SELECT COUNT(*) as c FROM offline_queue WHERE status = 'failed'`).get() as any)?.c || 0
    // Calculate uptime from last 24h of connectivity logs
    const since = Date.now() - 86400000
    const logs = this.db.prepare(`SELECT online, timestamp FROM connectivity_log WHERE timestamp >= ? ORDER BY timestamp ASC`).all(since) as any[]
    let onlineMs = 0
    let lastTs = since
    let lastOnline = true
    for (const l of logs) {
      if (lastOnline) onlineMs += l.timestamp - lastTs
      lastTs = l.timestamp
      lastOnline = l.online === 1
    }
    if (lastOnline) onlineMs += Date.now() - lastTs
    const totalMs = Date.now() - since
    const uptimePercent = totalMs > 0 ? Math.round((onlineMs / totalMs) * 100) : 100
    return { isOnline: this._isOnline, queuedCount: queued, failedCount: failed, uptimePercent }
  }

  private checkConnectivity(): void {
    const wasOnline = this._isOnline
    this._isOnline = net.isOnline()
    if (wasOnline !== this._isOnline) {
      if (this.db) {
        try {
          this.db.prepare(`INSERT INTO connectivity_log (id, online, timestamp) VALUES (?, ?, ?)`).run(randomUUID(), this._isOnline ? 1 : 0, Date.now())
        } catch {}
      }
      for (const fn of this.listeners) try { fn(this._isOnline) } catch {}
    }
  }
}

export const offlineManager = new OfflineManager()
