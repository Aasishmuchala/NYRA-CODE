/**
 * Performance Profiler — Latency waterfall, token throughput, p50/p95/p99 metrics
 *
 * Tracks every LLM request with detailed timing breakdown.
 * Provides percentile-based analysis per provider and model.
 */

import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

interface ProfileEntry {
  id: string
  providerId: string
  modelId: string
  operation: string
  latencyMs: number
  ttfbMs?: number
  inputTokens: number
  outputTokens: number
  tokensPerSecond: number
  statusCode: number
  error?: string
  timestamp: number
}

interface PercentileStats {
  p50: number
  p75: number
  p90: number
  p95: number
  p99: number
  min: number
  max: number
  mean: number
  count: number
}

interface ProviderProfile {
  providerId: string
  totalRequests: number
  errorCount: number
  errorRate: number
  latency: PercentileStats
  throughput: PercentileStats
  avgInputTokens: number
  avgOutputTokens: number
}

// ── Performance Profiler ─────────────────────────────────────────────────────

export class PerformanceProfiler {
  private db: any = null

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS perf_profile_entries (
            id TEXT PRIMARY KEY,
            providerId TEXT NOT NULL,
            modelId TEXT NOT NULL,
            operation TEXT DEFAULT 'chat',
            latencyMs INTEGER NOT NULL,
            ttfbMs INTEGER,
            inputTokens INTEGER DEFAULT 0,
            outputTokens INTEGER DEFAULT 0,
            tokensPerSecond REAL DEFAULT 0,
            statusCode INTEGER DEFAULT 200,
            error TEXT,
            timestamp INTEGER NOT NULL
          )
        `)
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_perf_profile_ts ON perf_profile_entries(timestamp)`)
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_perf_profile_provider ON perf_profile_entries(providerId)`)
        console.log('[PerformanceProfiler] Initialized')
      }
    } catch (error) {
      console.warn('[PerformanceProfiler] Init error (non-fatal):', error)
    }
  }

  record(entry: Omit<ProfileEntry, 'id' | 'timestamp'>): ProfileEntry {
    const id = randomUUID()
    const timestamp = Date.now()
    const full: ProfileEntry = { ...entry, id, timestamp }

    if (this.db) {
      try {
        this.db.prepare(`
          INSERT INTO perf_profile_entries (id, providerId, modelId, operation, latencyMs, ttfbMs, inputTokens, outputTokens, tokensPerSecond, statusCode, error, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, entry.providerId, entry.modelId, entry.operation, entry.latencyMs, entry.ttfbMs || null, entry.inputTokens, entry.outputTokens, entry.tokensPerSecond, entry.statusCode, entry.error || null, timestamp)

        this.db.prepare(`DELETE FROM perf_profile_entries WHERE id NOT IN (SELECT id FROM perf_profile_entries ORDER BY timestamp DESC LIMIT 5000)`).run()
      } catch { /* non-fatal */ }
    }

    return full
  }

  getProviderProfile(providerId: string, hours: number = 24): ProviderProfile {
    const cutoff = Date.now() - hours * 3600000
    const entries = this.getEntries(providerId, cutoff)

    if (entries.length === 0) {
      return {
        providerId,
        totalRequests: 0, errorCount: 0, errorRate: 0,
        latency: this.emptyPercentiles(),
        throughput: this.emptyPercentiles(),
        avgInputTokens: 0, avgOutputTokens: 0,
      }
    }

    const latencies = entries.map(e => e.latencyMs).sort((a, b) => a - b)
    const throughputs = entries.map(e => e.tokensPerSecond).filter(t => t > 0).sort((a, b) => a - b)
    const errors = entries.filter(e => e.error)

    return {
      providerId,
      totalRequests: entries.length,
      errorCount: errors.length,
      errorRate: errors.length / entries.length,
      latency: this.computePercentiles(latencies),
      throughput: throughputs.length > 0 ? this.computePercentiles(throughputs) : this.emptyPercentiles(),
      avgInputTokens: entries.reduce((s, e) => s + e.inputTokens, 0) / entries.length,
      avgOutputTokens: entries.reduce((s, e) => s + e.outputTokens, 0) / entries.length,
    }
  }

  getAllProviderProfiles(hours: number = 24): ProviderProfile[] {
    if (!this.db) return []
    const cutoff = Date.now() - hours * 3600000
    const providerIds = this.db.prepare(`SELECT DISTINCT providerId FROM perf_profile_entries WHERE timestamp > ?`).all(cutoff) as any[]
    return providerIds.map(p => this.getProviderProfile(p.providerId, hours))
  }

  getLatencyTimeSeries(providerId?: string, hours: number = 24, bucketMinutes: number = 15): Array<{ timestamp: number; avgLatency: number; p95Latency: number; count: number }> {
    if (!this.db) return []
    const cutoff = Date.now() - hours * 3600000
    const bucketMs = bucketMinutes * 60000
    let sql = `SELECT * FROM perf_profile_entries WHERE timestamp > ?`
    const params: (string | number)[] = [cutoff]
    if (providerId) {
      sql += ` AND providerId = ?`
      params.push(providerId)
    }
    sql += ` ORDER BY timestamp ASC`
    const entries = (this.db.prepare(sql).all(...params) as any[]).map(r => this.rowToEntry(r))

    const buckets = new Map<number, ProfileEntry[]>()
    for (const e of entries) {
      const key = Math.floor(e.timestamp / bucketMs) * bucketMs
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(e)
    }

    return Array.from(buckets.entries()).map(([ts, items]) => {
      const latencies = items.map(e => e.latencyMs).sort((a, b) => a - b)
      return {
        timestamp: ts,
        avgLatency: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
        p95Latency: Math.round(this.percentile(latencies, 95)),
        count: items.length,
      }
    })
  }

  getWaterfall(limit: number = 20): ProfileEntry[] {
    if (!this.db) return []
    const rows = this.db.prepare(`SELECT * FROM perf_profile_entries ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[]
    return rows.map(r => this.rowToEntry(r)).reverse()
  }

  getOverallStats(hours: number = 24): {
    totalRequests: number
    avgLatency: number
    p95Latency: number
    avgThroughput: number
    errorRate: number
    topModels: Array<{ modelId: string; count: number; avgLatency: number }>
  } {
    if (!this.db) return { totalRequests: 0, avgLatency: 0, p95Latency: 0, avgThroughput: 0, errorRate: 0, topModels: [] }
    const cutoff = Date.now() - hours * 3600000
    const entries = (this.db.prepare(`SELECT * FROM perf_profile_entries WHERE timestamp > ? ORDER BY timestamp ASC`).all(cutoff) as any[]).map(r => this.rowToEntry(r))

    if (entries.length === 0) return { totalRequests: 0, avgLatency: 0, p95Latency: 0, avgThroughput: 0, errorRate: 0, topModels: [] }

    const latencies = entries.map(e => e.latencyMs).sort((a, b) => a - b)
    const throughputs = entries.map(e => e.tokensPerSecond).filter(t => t > 0)
    const errors = entries.filter(e => e.error)

    const modelMap = new Map<string, { count: number; totalLat: number }>()
    for (const e of entries) {
      const m = modelMap.get(e.modelId) || { count: 0, totalLat: 0 }
      m.count++
      m.totalLat += e.latencyMs
      modelMap.set(e.modelId, m)
    }
    const topModels = Array.from(modelMap.entries())
      .map(([modelId, stats]) => ({ modelId, count: stats.count, avgLatency: Math.round(stats.totalLat / stats.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      totalRequests: entries.length,
      avgLatency: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      p95Latency: Math.round(this.percentile(latencies, 95)),
      avgThroughput: throughputs.length > 0 ? Math.round(throughputs.reduce((a, b) => a + b, 0) / throughputs.length) : 0,
      errorRate: errors.length / entries.length,
      topModels,
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getEntries(providerId: string, cutoff: number): ProfileEntry[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM perf_profile_entries WHERE providerId = ? AND timestamp > ? ORDER BY timestamp ASC`).all(providerId, cutoff) as any[]).map(r => this.rowToEntry(r))
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const idx = Math.ceil(sorted.length * (p / 100)) - 1
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
  }

  private computePercentiles(sorted: number[]): PercentileStats {
    if (sorted.length === 0) return this.emptyPercentiles()
    return {
      p50: Math.round(this.percentile(sorted, 50)),
      p75: Math.round(this.percentile(sorted, 75)),
      p90: Math.round(this.percentile(sorted, 90)),
      p95: Math.round(this.percentile(sorted, 95)),
      p99: Math.round(this.percentile(sorted, 99)),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
      count: sorted.length,
    }
  }

  private emptyPercentiles(): PercentileStats {
    return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0, count: 0 }
  }

  private rowToEntry(row: any): ProfileEntry {
    return {
      id: row.id,
      providerId: row.providerId,
      modelId: row.modelId,
      operation: row.operation,
      latencyMs: row.latencyMs,
      ttfbMs: row.ttfbMs || undefined,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      tokensPerSecond: row.tokensPerSecond,
      statusCode: row.statusCode,
      error: row.error || undefined,
      timestamp: row.timestamp,
    }
  }
}

export const performanceProfiler = new PerformanceProfiler()
