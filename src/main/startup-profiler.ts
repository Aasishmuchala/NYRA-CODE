/**
 * Startup Profiler — Track module init times, detect bottlenecks, optimize cold start
 */
import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

interface StartupMetric {
  module: string
  phase: 'init' | 'ready' | 'render' | 'custom'
  durationMs: number
  timestamp: number
}

interface StartupProfile {
  id: string
  totalMs: number
  metrics: StartupMetric[]
  bottlenecks: Array<{ module: string; durationMs: number }>
  timestamp: number
}

export class StartupProfiler {
  private db: any = null
  private currentMetrics: StartupMetric[] = []
  private startTime: number = Date.now()

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS startup_profiles (
          id TEXT PRIMARY KEY, totalMs INTEGER NOT NULL, metrics TEXT NOT NULL,
          bottlenecks TEXT, timestamp INTEGER NOT NULL)`)
        run(`CREATE TABLE IF NOT EXISTS startup_settings (
          key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
        console.log('[StartupProfiler] Initialized')
      }
    } catch (error) {
      console.warn('[StartupProfiler] Init error (non-fatal):', error)
    }
  }

  recordMetric(module: string, phase: StartupMetric['phase'], durationMs: number): void {
    this.currentMetrics.push({ module, phase, durationMs, timestamp: Date.now() })
  }

  startTimer(module: string, phase: StartupMetric['phase'] = 'init'): () => void {
    const start = Date.now()
    return () => { this.recordMetric(module, phase, Date.now() - start) }
  }

  finalizeStartup(): StartupProfile {
    const totalMs = Date.now() - this.startTime
    const sorted = [...this.currentMetrics].sort((a, b) => b.durationMs - a.durationMs)
    const bottlenecks = sorted.slice(0, 5).map(m => ({ module: m.module, durationMs: m.durationMs }))

    const profile: StartupProfile = {
      id: randomUUID(), totalMs, metrics: this.currentMetrics,
      bottlenecks, timestamp: Date.now(),
    }

    if (this.db) {
      try {
        this.db.prepare(`INSERT INTO startup_profiles (id, totalMs, metrics, bottlenecks, timestamp) VALUES (?, ?, ?, ?, ?)`)
          .run(profile.id, profile.totalMs, JSON.stringify(profile.metrics), JSON.stringify(profile.bottlenecks), profile.timestamp)
      } catch {}
    }

    this.currentMetrics = []
    this.startTime = Date.now()
    return profile
  }

  getHistory(limit: number = 20): Array<Omit<StartupProfile, 'metrics'>> {
    if (!this.db) return []
    return (this.db.prepare(`SELECT id, totalMs, bottlenecks, timestamp FROM startup_profiles ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[])
      .map(r => ({ id: r.id, totalMs: r.totalMs, metrics: [], bottlenecks: JSON.parse(r.bottlenecks || '[]'), timestamp: r.timestamp }))
  }

  getProfile(id: string): StartupProfile | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM startup_profiles WHERE id = ?`).get(id) as any
    if (!row) return null
    return { id: row.id, totalMs: row.totalMs, metrics: JSON.parse(row.metrics || '[]'), bottlenecks: JSON.parse(row.bottlenecks || '[]'), timestamp: row.timestamp }
  }

  getAverageStartup(count: number = 10): { avgMs: number; minMs: number; maxMs: number; trend: 'improving' | 'degrading' | 'stable' } {
    if (!this.db) return { avgMs: 0, minMs: 0, maxMs: 0, trend: 'stable' }
    const rows = this.db.prepare(`SELECT totalMs FROM startup_profiles ORDER BY timestamp DESC LIMIT ?`).all(count) as any[]
    if (rows.length === 0) return { avgMs: 0, minMs: 0, maxMs: 0, trend: 'stable' }
    const vals = rows.map(r => r.totalMs)
    const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    // Trend: compare first half vs second half
    const half = Math.floor(vals.length / 2)
    const recent = vals.slice(0, half)
    const older = vals.slice(half)
    const recentAvg = recent.length ? recent.reduce((a: number, b: number) => a + b, 0) / recent.length : avg
    const olderAvg = older.length ? older.reduce((a: number, b: number) => a + b, 0) / older.length : avg
    const diff = recentAvg - olderAvg
    const trend = diff < -50 ? 'improving' : diff > 50 ? 'degrading' : 'stable'
    return { avgMs: Math.round(avg), minMs: min, maxMs: max, trend }
  }

  getSetting(key: string): string | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT value FROM startup_settings WHERE key = ?`).get(key) as any
    return row?.value || null
  }

  setSetting(key: string, value: string): void {
    if (!this.db) return
    this.db.prepare(`INSERT OR REPLACE INTO startup_settings (key, value) VALUES (?, ?)`).run(key, value)
  }
}

export const startupProfiler = new StartupProfiler()
