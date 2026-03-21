/**
 * A/B Prompt Testing — Run same prompt against multiple models, compare outputs
 *
 * Supports scoring, ranking, and statistical comparison.
 */

import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

interface ABTest {
  id: string
  name: string
  prompt: string
  systemPrompt?: string
  variants: ABVariant[]
  status: 'pending' | 'running' | 'completed'
  createdAt: number
  completedAt?: number
}

interface ABVariant {
  id: string
  testId: string
  providerId: string
  modelId: string
  response?: string
  latencyMs?: number
  tokenUsage?: { input: number; output: number }
  score?: number               // user rating 1-5
  notes?: string
  status: 'pending' | 'running' | 'completed' | 'error'
  error?: string
  timestamp: number
}

// ── A/B Prompt Testing ───────────────────────────────────────────────────────

export class ABPromptTesting {
  private db: any = null

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS ab_tests (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, prompt TEXT NOT NULL,
            systemPrompt TEXT, status TEXT DEFAULT 'pending',
            createdAt INTEGER NOT NULL, completedAt INTEGER)`)
        run(`CREATE TABLE IF NOT EXISTS ab_variants (
            id TEXT PRIMARY KEY, testId TEXT NOT NULL, providerId TEXT NOT NULL,
            modelId TEXT NOT NULL, response TEXT, latencyMs INTEGER,
            tokenInput INTEGER DEFAULT 0, tokenOutput INTEGER DEFAULT 0,
            score INTEGER, notes TEXT, status TEXT DEFAULT 'pending',
            error TEXT, timestamp INTEGER NOT NULL)`)
        run(`CREATE INDEX IF NOT EXISTS idx_ab_test_ts ON ab_tests(createdAt)`)
        run(`CREATE INDEX IF NOT EXISTS idx_ab_variant_test ON ab_variants(testId)`)
        console.log('[ABPromptTesting] Initialized')
      }
    } catch (error) {
      console.warn('[ABPromptTesting] Init error (non-fatal):', error)
    }
  }

  // ── Create Test ───────────────────────────────────────────────────────────

  createTest(name: string, prompt: string, models: Array<{ providerId: string; modelId: string }>, systemPrompt?: string): ABTest {
    if (!this.db) throw new Error('DB not initialized')
    const testId = randomUUID()
    const now = Date.now()

    this.db.prepare(`INSERT INTO ab_tests (id, name, prompt, systemPrompt, status, createdAt) VALUES (?, ?, ?, ?, 'pending', ?)`)
      .run(testId, name, prompt, systemPrompt || null, now)

    const variants: ABVariant[] = models.map(m => {
      const varId = randomUUID()
      this.db.prepare(`INSERT INTO ab_variants (id, testId, providerId, modelId, status, timestamp) VALUES (?, ?, ?, ?, 'pending', ?)`)
        .run(varId, testId, m.providerId, m.modelId, now)
      return { id: varId, testId, providerId: m.providerId, modelId: m.modelId, status: 'pending' as const, timestamp: now }
    })

    return { id: testId, name, prompt, systemPrompt, variants, status: 'pending', createdAt: now }
  }

  // ── Run Test ──────────────────────────────────────────────────────────────

  async runTest(testId: string): Promise<ABTest> {
    if (!this.db) throw new Error('DB not initialized')

    this.db.prepare(`UPDATE ab_tests SET status = 'running' WHERE id = ?`).run(testId)
    const test = this.getTest(testId)
    if (!test) throw new Error('Test not found')

    const { providerRegistry } = await import('./providers/provider-registry')

    // Run all variants in parallel
    const results = await Promise.allSettled(
      test.variants.map(async (variant) => {
        this.db.prepare(`UPDATE ab_variants SET status = 'running' WHERE id = ?`).run(variant.id)
        const startTime = Date.now()

        try {
          const provider = providerRegistry.get(variant.providerId)
          if (!provider) throw new Error(`Provider '${variant.providerId}' not found`)

          const messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }> = []
          if (test.systemPrompt) messages.push({ role: 'system', content: test.systemPrompt })
          messages.push({ role: 'user', content: test.prompt })

          const result = await provider.chat({
            model: variant.modelId,
            messages,
            temperature: 0.7,
            maxTokens: 2048,
            stream: false,
          })

          const latencyMs = Date.now() - startTime
          const response = typeof result === 'string' ? result : JSON.stringify(result)
          const usage = (result as any)?.usage || { input: 0, output: 0 }

          this.db.prepare(`UPDATE ab_variants SET response = ?, latencyMs = ?, tokenInput = ?, tokenOutput = ?, status = 'completed', timestamp = ? WHERE id = ?`)
            .run(response, latencyMs, usage.input || 0, usage.output || 0, Date.now(), variant.id)
        } catch (err: any) {
          this.db.prepare(`UPDATE ab_variants SET error = ?, status = 'error', timestamp = ? WHERE id = ?`)
            .run(err.message || String(err), Date.now(), variant.id)
        }
      })
    )

    this.db.prepare(`UPDATE ab_tests SET status = 'completed', completedAt = ? WHERE id = ?`).run(Date.now(), testId)
    return this.getTest(testId)!
  }

  // ── Score a variant ───────────────────────────────────────────────────────

  scoreVariant(variantId: string, score: number, notes?: string): void {
    if (!this.db) return
    this.db.prepare(`UPDATE ab_variants SET score = ?, notes = ? WHERE id = ?`).run(Math.min(5, Math.max(1, score)), notes || null, variantId)
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getTest(testId: string): ABTest | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM ab_tests WHERE id = ?`).get(testId) as any
    if (!row) return null
    const variants = this.getVariants(testId)
    return {
      id: row.id, name: row.name, prompt: row.prompt, systemPrompt: row.systemPrompt || undefined,
      variants, status: row.status, createdAt: row.createdAt, completedAt: row.completedAt || undefined,
    }
  }

  listTests(limit: number = 20): ABTest[] {
    if (!this.db) return []
    const rows = this.db.prepare(`SELECT * FROM ab_tests ORDER BY createdAt DESC LIMIT ?`).all(limit) as any[]
    return rows.map(r => {
      const variants = this.getVariants(r.id)
      return {
        id: r.id, name: r.name, prompt: r.prompt, systemPrompt: r.systemPrompt || undefined,
        variants, status: r.status, createdAt: r.createdAt, completedAt: r.completedAt || undefined,
      }
    })
  }

  deleteTest(testId: string): void {
    if (!this.db) return
    this.db.prepare(`DELETE FROM ab_variants WHERE testId = ?`).run(testId)
    this.db.prepare(`DELETE FROM ab_tests WHERE id = ?`).run(testId)
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats(): { totalTests: number; totalVariants: number; avgScore: number; modelRankings: Array<{ modelId: string; avgScore: number; count: number }> } {
    if (!this.db) return { totalTests: 0, totalVariants: 0, avgScore: 0, modelRankings: [] }
    const tests = (this.db.prepare(`SELECT COUNT(*) as c FROM ab_tests`).get() as any)?.c || 0
    const variants = (this.db.prepare(`SELECT COUNT(*) as c FROM ab_variants`).get() as any)?.c || 0
    const avgScore = (this.db.prepare(`SELECT AVG(score) as a FROM ab_variants WHERE score IS NOT NULL`).get() as any)?.a || 0

    const rankings = (this.db.prepare(`SELECT modelId, AVG(score) as avgScore, COUNT(*) as count FROM ab_variants WHERE score IS NOT NULL GROUP BY modelId ORDER BY avgScore DESC`).all() as any[])
      .map(r => ({ modelId: r.modelId, avgScore: Math.round(r.avgScore * 10) / 10, count: r.count }))

    return { totalTests: tests, totalVariants: variants, avgScore: Math.round(avgScore * 10) / 10, modelRankings: rankings }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getVariants(testId: string): ABVariant[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM ab_variants WHERE testId = ? ORDER BY timestamp ASC`).all(testId) as any[]).map(r => ({
      id: r.id, testId: r.testId, providerId: r.providerId, modelId: r.modelId,
      response: r.response || undefined, latencyMs: r.latencyMs || undefined,
      tokenUsage: (r.tokenInput != null || r.tokenOutput != null) ? { input: r.tokenInput, output: r.tokenOutput } : undefined,
      score: r.score || undefined, notes: r.notes || undefined,
      status: r.status, error: r.error || undefined, timestamp: r.timestamp,
    }))
  }
}

export const abPromptTesting = new ABPromptTesting()
