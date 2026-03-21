/**
 * API Playground — Test any provider endpoint with custom payloads
 *
 * Records request/response history for debugging. Supports all registered providers.
 */

import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

interface PlaygroundRequest {
  id: string
  providerId: string
  modelId: string
  endpoint: string
  payload: Record<string, unknown>
  response?: string
  statusCode?: number
  latencyMs?: number
  tokenUsage?: { input: number; output: number; total: number }
  error?: string
  timestamp: number
}

interface PlaygroundPreset {
  id: string
  name: string
  providerId: string
  modelId: string
  endpoint: string
  payload: Record<string, unknown>
  createdAt: number
}

// ── API Playground ───────────────────────────────────────────────────────────

export class ApiPlayground {
  private db: any = null

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS api_playground_history (
            id TEXT PRIMARY KEY,
            providerId TEXT NOT NULL,
            modelId TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            payload TEXT NOT NULL,
            response TEXT,
            statusCode INTEGER,
            latencyMs INTEGER,
            tokenInput INTEGER DEFAULT 0,
            tokenOutput INTEGER DEFAULT 0,
            error TEXT,
            timestamp INTEGER NOT NULL
          )
        `)
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS api_playground_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            providerId TEXT NOT NULL,
            modelId TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            payload TEXT NOT NULL,
            createdAt INTEGER NOT NULL
          )
        `)
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_api_pg_ts ON api_playground_history(timestamp)`)

        const count = (this.db.prepare(`SELECT COUNT(*) as c FROM api_playground_presets`).get() as any)?.c || 0
        if (count === 0) this.seedPresets()

        console.log('[ApiPlayground] Initialized')
      }
    } catch (error) {
      console.warn('[ApiPlayground] Init error (non-fatal):', error)
    }
  }

  // ── Execute Request ───────────────────────────────────────────────────────

  async executeRequest(providerId: string, modelId: string, endpoint: string, payload: Record<string, unknown>): Promise<PlaygroundRequest> {
    const id = randomUUID()
    const startTime = Date.now()

    const entry: PlaygroundRequest = {
      id,
      providerId,
      modelId,
      endpoint,
      payload,
      timestamp: startTime,
    }

    try {
      const { providerRegistry } = await import('./providers/provider-registry')
      const provider = providerRegistry.get(providerId)
      if (!provider) throw new Error(`Provider '${providerId}' not found`)

      const rawMessages = (payload.messages as any[]) || [{ role: 'user', content: String(payload.prompt || 'Hello') }]
      const messages = rawMessages.map((m: any) => ({ role: m.role as 'user' | 'system' | 'assistant' | 'tool', content: String(m.content) }))

      const result = await provider.chat({
        model: modelId,
        messages,
        temperature: (payload.temperature as number) ?? 0.7,
        maxTokens: (payload.max_tokens as number) ?? (payload.maxTokens as number) ?? 1024,
        stream: false,
      })

      entry.latencyMs = Date.now() - startTime
      entry.response = typeof result === 'string' ? result : JSON.stringify(result)
      entry.statusCode = 200
      entry.tokenUsage = (result as any)?.usage || { input: 0, output: 0, total: 0 }
    } catch (err: any) {
      entry.latencyMs = Date.now() - startTime
      entry.error = err.message || String(err)
      entry.statusCode = err.status || 500
    }

    this.saveRequest(entry)
    return entry
  }

  // ── History ───────────────────────────────────────────────────────────────

  getHistory(limit: number = 50): PlaygroundRequest[] {
    if (!this.db) return []
    const rows = this.db.prepare(`SELECT * FROM api_playground_history ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[]
    return rows.map(r => this.rowToRequest(r))
  }

  getRequest(id: string): PlaygroundRequest | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM api_playground_history WHERE id = ?`).get(id) as any
    return row ? this.rowToRequest(row) : null
  }

  clearHistory(): void {
    if (!this.db) return
    this.db.prepare(`DELETE FROM api_playground_history`).run()
  }

  // ── Presets ───────────────────────────────────────────────────────────────

  listPresets(): PlaygroundPreset[] {
    if (!this.db) return []
    const rows = this.db.prepare(`SELECT * FROM api_playground_presets ORDER BY createdAt DESC`).all() as any[]
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      providerId: r.providerId,
      modelId: r.modelId,
      endpoint: r.endpoint,
      payload: JSON.parse(r.payload || '{}'),
      createdAt: r.createdAt,
    }))
  }

  savePreset(name: string, providerId: string, modelId: string, endpoint: string, payload: Record<string, unknown>): PlaygroundPreset {
    if (!this.db) throw new Error('DB not initialized')
    const id = randomUUID()
    const now = Date.now()
    this.db.prepare(`INSERT INTO api_playground_presets (id, name, providerId, modelId, endpoint, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name, providerId, modelId, endpoint, JSON.stringify(payload), now)
    return { id, name, providerId, modelId, endpoint, payload, createdAt: now }
  }

  deletePreset(id: string): void {
    if (!this.db) return
    this.db.prepare(`DELETE FROM api_playground_presets WHERE id = ?`).run(id)
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats(): { totalRequests: number; avgLatency: number; errorRate: number; providerBreakdown: Record<string, number> } {
    if (!this.db) return { totalRequests: 0, avgLatency: 0, errorRate: 0, providerBreakdown: {} }
    const total = (this.db.prepare(`SELECT COUNT(*) as c FROM api_playground_history`).get() as any)?.c || 0
    const avgLat = (this.db.prepare(`SELECT AVG(latencyMs) as a FROM api_playground_history WHERE latencyMs IS NOT NULL`).get() as any)?.a || 0
    const errors = (this.db.prepare(`SELECT COUNT(*) as c FROM api_playground_history WHERE error IS NOT NULL`).get() as any)?.c || 0
    const providers = this.db.prepare(`SELECT providerId, COUNT(*) as c FROM api_playground_history GROUP BY providerId`).all() as any[]
    const providerBreakdown: Record<string, number> = {}
    for (const p of providers) providerBreakdown[p.providerId] = p.c
    return { totalRequests: total, avgLatency: Math.round(avgLat), errorRate: total > 0 ? errors / total : 0, providerBreakdown }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private saveRequest(entry: PlaygroundRequest): void {
    if (!this.db) return
    try {
      this.db.prepare(`
        INSERT INTO api_playground_history (id, providerId, modelId, endpoint, payload, response, statusCode, latencyMs, tokenInput, tokenOutput, error, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.id, entry.providerId, entry.modelId, entry.endpoint,
        JSON.stringify(entry.payload), entry.response || null, entry.statusCode || null,
        entry.latencyMs || null, entry.tokenUsage?.input || 0, entry.tokenUsage?.output || 0,
        entry.error || null, entry.timestamp
      )
      this.db.prepare(`DELETE FROM api_playground_history WHERE id NOT IN (SELECT id FROM api_playground_history ORDER BY timestamp DESC LIMIT 200)`).run()
    } catch { /* non-fatal */ }
  }

  private rowToRequest(row: any): PlaygroundRequest {
    return {
      id: row.id,
      providerId: row.providerId,
      modelId: row.modelId,
      endpoint: row.endpoint,
      payload: JSON.parse(row.payload || '{}'),
      response: row.response || undefined,
      statusCode: row.statusCode || undefined,
      latencyMs: row.latencyMs || undefined,
      tokenUsage: (row.tokenInput || row.tokenOutput) ? { input: row.tokenInput, output: row.tokenOutput, total: row.tokenInput + row.tokenOutput } : undefined,
      error: row.error || undefined,
      timestamp: row.timestamp,
    }
  }

  private seedPresets(): void {
    const presets = [
      { name: 'Simple Chat', providerId: 'anthropic', modelId: 'claude-3.5-sonnet', endpoint: '/v1/messages', payload: { messages: [{ role: 'user', content: 'Hello! Tell me a fun fact.' }], max_tokens: 256, temperature: 0.7 } },
      { name: 'Code Generation', providerId: 'anthropic', modelId: 'claude-3.5-sonnet', endpoint: '/v1/messages', payload: { messages: [{ role: 'user', content: 'Write a TypeScript function that generates a UUID v4' }], max_tokens: 1024, temperature: 0.3 } },
      { name: 'JSON Mode', providerId: 'openai', modelId: 'gpt-4o', endpoint: '/v1/chat/completions', payload: { messages: [{ role: 'user', content: 'List 5 programming languages as JSON' }], max_tokens: 512, temperature: 0.2 } },
      { name: 'Creative Writing', providerId: 'anthropic', modelId: 'claude-3.5-sonnet', endpoint: '/v1/messages', payload: { messages: [{ role: 'user', content: 'Write a haiku about programming' }], max_tokens: 128, temperature: 1.0 } },
    ]
    for (const p of presets) {
      this.savePreset(p.name, p.providerId, p.modelId, p.endpoint, p.payload)
    }
  }
}

export const apiPlayground = new ApiPlayground()
