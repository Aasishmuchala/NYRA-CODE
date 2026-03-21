/**
 * Activity Feed — Unified activity stream aggregating events from all modules
 */
import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

interface ActivityEvent {
  id: string
  type: string           // 'chat' | 'task' | 'agent' | 'file' | 'plugin' | 'search' | 'system' | 'ab-test' | 'theme' | 'diff'
  action: string         // 'created' | 'updated' | 'deleted' | 'completed' | 'started' | 'failed' | 'installed' | etc.
  title: string
  detail?: string
  sourceId?: string
  metadata?: Record<string, any>
  timestamp: number
}

export class ActivityFeed {
  private db: any = null

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS activity_feed (
          id TEXT PRIMARY KEY, type TEXT NOT NULL, action TEXT NOT NULL,
          title TEXT NOT NULL, detail TEXT, sourceId TEXT,
          metadata TEXT, timestamp INTEGER NOT NULL)`)
        run(`CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_feed(timestamp)`)
        run(`CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_feed(type)`)
        console.log('[ActivityFeed] Initialized')
      }
    } catch (error) {
      console.warn('[ActivityFeed] Init error (non-fatal):', error)
    }
  }

  record(type: string, action: string, title: string, opts?: { detail?: string; sourceId?: string; metadata?: Record<string, any> }): ActivityEvent {
    const event: ActivityEvent = {
      id: randomUUID(), type, action, title,
      detail: opts?.detail, sourceId: opts?.sourceId,
      metadata: opts?.metadata, timestamp: Date.now(),
    }
    if (this.db) {
      try {
        this.db.prepare(`INSERT INTO activity_feed (id, type, action, title, detail, sourceId, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(event.id, event.type, event.action, event.title, event.detail || null, event.sourceId || null, JSON.stringify(event.metadata || {}), event.timestamp)
      } catch {}
    }
    return event
  }

  getRecent(limit: number = 50, offset: number = 0): ActivityEvent[] {
    if (!this.db) return []
    try {
      const rows = this.db.prepare(`SELECT * FROM activity_feed ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(limit, offset) as any[]
      return rows.map(r => this.rowToEvent(r))
    } catch { return [] }
  }

  getByType(type: string, limit: number = 30): ActivityEvent[] {
    if (!this.db) return []
    try {
      const rows = this.db.prepare(`SELECT * FROM activity_feed WHERE type = ? ORDER BY timestamp DESC LIMIT ?`).all(type, limit) as any[]
      return rows.map(r => this.rowToEvent(r))
    } catch { return [] }
  }

  getByDateRange(from: number, to: number, limit: number = 100): ActivityEvent[] {
    if (!this.db) return []
    try {
      const rows = this.db.prepare(`SELECT * FROM activity_feed WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT ?`).all(from, to, limit) as any[]
      return rows.map(r => this.rowToEvent(r))
    } catch { return [] }
  }

  getStats(hours: number = 24): { total: number; byType: Record<string, number>; byAction: Record<string, number>; hourly: Array<{ hour: number; count: number }> } {
    if (!this.db) return { total: 0, byType: {}, byAction: {}, hourly: [] }
    const since = Date.now() - hours * 3600000
    try {
      const total = (this.db.prepare(`SELECT COUNT(*) as c FROM activity_feed WHERE timestamp >= ?`).get(since) as any)?.c || 0
      const byTypeRows = this.db.prepare(`SELECT type, COUNT(*) as c FROM activity_feed WHERE timestamp >= ? GROUP BY type`).all(since) as any[]
      const byActionRows = this.db.prepare(`SELECT action, COUNT(*) as c FROM activity_feed WHERE timestamp >= ? GROUP BY action`).all(since) as any[]
      const byType: Record<string, number> = {}
      const byAction: Record<string, number> = {}
      for (const r of byTypeRows) byType[r.type] = r.c
      for (const r of byActionRows) byAction[r.action] = r.c

      // Hourly buckets
      const bucketMs = 3600000
      const hourly: Array<{ hour: number; count: number }> = []
      const hourRows = this.db.prepare(`SELECT timestamp FROM activity_feed WHERE timestamp >= ? ORDER BY timestamp`).all(since) as any[]
      const buckets = new Map<number, number>()
      for (const r of hourRows) {
        const bucket = Math.floor(r.timestamp / bucketMs) * bucketMs
        buckets.set(bucket, (buckets.get(bucket) || 0) + 1)
      }
      for (const [hour, count] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
        hourly.push({ hour, count })
      }

      return { total, byType, byAction, hourly }
    } catch { return { total: 0, byType: {}, byAction: {}, hourly: [] } }
  }

  prune(keepDays: number = 30): number {
    if (!this.db) return 0
    const cutoff = Date.now() - keepDays * 86400000
    try {
      const info = this.db.prepare(`DELETE FROM activity_feed WHERE timestamp < ?`).run(cutoff)
      return info.changes || 0
    } catch { return 0 }
  }

  private rowToEvent(row: any): ActivityEvent {
    return {
      id: row.id, type: row.type, action: row.action, title: row.title,
      detail: row.detail || undefined, sourceId: row.sourceId || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    }
  }
}

export const activityFeed = new ActivityFeed()
