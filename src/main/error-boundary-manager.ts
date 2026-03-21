/**
 * Error Boundary Manager — Track, categorize, and recover from errors across all modules
 */
import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

interface ErrorEntry {
  id: string
  module: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  stack?: string
  context?: Record<string, any>
  recovered: boolean
  timestamp: number
}

export class ErrorBoundaryManager {
  private db: any = null
  private listeners: Array<(err: ErrorEntry) => void> = []

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS error_entries (
          id TEXT PRIMARY KEY, module TEXT NOT NULL, severity TEXT NOT NULL,
          message TEXT NOT NULL, stack TEXT, context TEXT,
          recovered INTEGER DEFAULT 0, timestamp INTEGER NOT NULL)`)
        run(`CREATE INDEX IF NOT EXISTS idx_error_ts ON error_entries(timestamp)`)
        run(`CREATE INDEX IF NOT EXISTS idx_error_severity ON error_entries(severity)`)
        console.log('[ErrorBoundaryManager] Initialized')
      }
    } catch (error) {
      console.warn('[ErrorBoundaryManager] Init error (non-fatal):', error)
    }
  }

  capture(module: string, error: Error | string, opts?: { severity?: ErrorEntry['severity']; context?: Record<string, any>; recovered?: boolean }): ErrorEntry {
    const entry: ErrorEntry = {
      id: randomUUID(), module,
      severity: opts?.severity || 'medium',
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'string' ? undefined : error.stack,
      context: opts?.context, recovered: opts?.recovered ?? false,
      timestamp: Date.now(),
    }

    if (this.db) {
      try {
        this.db.prepare(`INSERT INTO error_entries (id, module, severity, message, stack, context, recovered, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(entry.id, entry.module, entry.severity, entry.message, entry.stack || null, JSON.stringify(entry.context || {}), entry.recovered ? 1 : 0, entry.timestamp)
      } catch {}
    }

    for (const fn of this.listeners) try { fn(entry) } catch {}
    return entry
  }

  markRecovered(id: string): void {
    if (this.db) this.db.prepare(`UPDATE error_entries SET recovered = 1 WHERE id = ?`).run(id)
  }

  onError(fn: (err: ErrorEntry) => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(f => f !== fn) }
  }

  getRecent(limit: number = 50): ErrorEntry[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM error_entries ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[]).map(r => this.rowToEntry(r))
  }

  getByModule(module: string, limit: number = 30): ErrorEntry[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM error_entries WHERE module = ? ORDER BY timestamp DESC LIMIT ?`).all(module, limit) as any[]).map(r => this.rowToEntry(r))
  }

  getBySeverity(severity: string, limit: number = 30): ErrorEntry[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM error_entries WHERE severity = ? ORDER BY timestamp DESC LIMIT ?`).all(severity, limit) as any[]).map(r => this.rowToEntry(r))
  }

  getStats(hours: number = 24): { total: number; unrecovered: number; byModule: Record<string, number>; bySeverity: Record<string, number>; trend: Array<{ hour: number; count: number }> } {
    if (!this.db) return { total: 0, unrecovered: 0, byModule: {}, bySeverity: {}, trend: [] }
    const since = Date.now() - hours * 3600000
    const total = (this.db.prepare(`SELECT COUNT(*) as c FROM error_entries WHERE timestamp >= ?`).get(since) as any)?.c || 0
    const unrecovered = (this.db.prepare(`SELECT COUNT(*) as c FROM error_entries WHERE timestamp >= ? AND recovered = 0`).get(since) as any)?.c || 0
    const byModuleRows = this.db.prepare(`SELECT module, COUNT(*) as c FROM error_entries WHERE timestamp >= ? GROUP BY module ORDER BY c DESC`).all(since) as any[]
    const bySevRows = this.db.prepare(`SELECT severity, COUNT(*) as c FROM error_entries WHERE timestamp >= ? GROUP BY severity`).all(since) as any[]
    const byModule: Record<string, number> = {}
    const bySeverity: Record<string, number> = {}
    for (const r of byModuleRows) byModule[r.module] = r.c
    for (const r of bySevRows) bySeverity[r.severity] = r.c

    const bucketMs = 3600000
    const rows = this.db.prepare(`SELECT timestamp FROM error_entries WHERE timestamp >= ?`).all(since) as any[]
    const buckets = new Map<number, number>()
    for (const r of rows) {
      const b = Math.floor(r.timestamp / bucketMs) * bucketMs
      buckets.set(b, (buckets.get(b) || 0) + 1)
    }
    const trend = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count }))

    return { total, unrecovered, byModule, bySeverity, trend }
  }

  prune(keepDays: number = 14): number {
    if (!this.db) return 0
    const cutoff = Date.now() - keepDays * 86400000
    return (this.db.prepare(`DELETE FROM error_entries WHERE timestamp < ?`).run(cutoff) as any).changes || 0
  }

  private rowToEntry(row: any): ErrorEntry {
    return {
      id: row.id, module: row.module, severity: row.severity as ErrorEntry['severity'],
      message: row.message, stack: row.stack || undefined,
      context: row.context ? JSON.parse(row.context) : undefined,
      recovered: row.recovered === 1, timestamp: row.timestamp,
    }
  }
}

export const errorBoundaryManager = new ErrorBoundaryManager()
