import { randomUUID } from 'crypto'
import type {
  MemoryTierProvider,
  MemoryEntry,
  MemoryQuery,
  MemorySearchResult,
  ProceduralEntry,
  ProceduralStep,
} from '../memory-interfaces'
import { memoryManager } from '../../memory'

/** SQLite row shape (snake_case columns) */
interface ProceduralRow {
  id: string
  content: string
  metadata: string | null
  trigger_text: string
  steps: string
  success_rate: number
  execution_count: number
  last_executed_at: number | null
  required_capabilities: string | null
  importance: number
  decay_factor: number
  access_count: number
  created_at: number
  updated_at: number
  last_accessed_at: number | null
}

class ProceduralMemory implements MemoryTierProvider {
  readonly tier = 'procedural' as const
  readonly name = 'Procedural Memory'

  async init(): Promise<void> {
    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS procedural_memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT,
        trigger_text TEXT NOT NULL,
        steps TEXT NOT NULL,
        success_rate REAL DEFAULT 0.5,
        execution_count INTEGER DEFAULT 0,
        last_executed_at INTEGER,
        required_capabilities TEXT,
        importance REAL DEFAULT 0.5,
        decay_factor REAL DEFAULT 1.0,
        access_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER
      )
    `)
    memoryManager.run(`
      CREATE INDEX IF NOT EXISTS idx_procedural_trigger
      ON procedural_memories(trigger_text)
    `)
  }

  async add(entry: MemoryEntry): Promise<string> {
    const id = entry.id || randomUUID()
    const now = Date.now()
    const pe = entry as ProceduralEntry

    memoryManager.run(
      `INSERT OR REPLACE INTO procedural_memories (
        id, content, metadata, trigger_text, steps,
        success_rate, execution_count, last_executed_at,
        required_capabilities, importance, decay_factor,
        access_count, created_at, updated_at, last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entry.content,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        pe.trigger ?? '',
        JSON.stringify(pe.steps ?? []),
        pe.successRate ?? 0.5,
        pe.executionCount ?? 0,
        pe.lastExecutedAt ?? null,
        pe.requiredCapabilities ? JSON.stringify(pe.requiredCapabilities) : null,
        entry.importance ?? 0.5,
        entry.decayFactor ?? 1.0,
        0,
        now,
        now,
        null,
      ]
    )
    return id
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    const now = Date.now()
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content) }
    if (updates.metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)) }
    if (updates.importance !== undefined) { fields.push('importance = ?'); values.push(updates.importance) }
    if (updates.decayFactor !== undefined) { fields.push('decay_factor = ?'); values.push(updates.decayFactor) }
    if (updates.accessCount !== undefined) { fields.push('access_count = ?'); values.push(updates.accessCount) }
    if (updates.lastAccessedAt !== undefined) { fields.push('last_accessed_at = ?'); values.push(updates.lastAccessedAt) }

    // ProceduralEntry-specific fields
    const pu = updates as Partial<ProceduralEntry>
    if (pu.trigger !== undefined) { fields.push('trigger_text = ?'); values.push(pu.trigger) }
    if (pu.steps !== undefined) { fields.push('steps = ?'); values.push(JSON.stringify(pu.steps)) }
    if (pu.successRate !== undefined) { fields.push('success_rate = ?'); values.push(pu.successRate) }
    if (pu.executionCount !== undefined) { fields.push('execution_count = ?'); values.push(pu.executionCount) }
    if (pu.lastExecutedAt !== undefined) { fields.push('last_executed_at = ?'); values.push(pu.lastExecutedAt) }
    if (pu.requiredCapabilities !== undefined) {
      fields.push('required_capabilities = ?')
      values.push(JSON.stringify(pu.requiredCapabilities))
    }

    if (fields.length === 0) return

    fields.push('updated_at = ?')
    values.push(now)
    values.push(id)

    memoryManager.run(
      `UPDATE procedural_memories SET ${fields.join(', ')} WHERE id = ?`,
      values
    )
  }

  async remove(id: string): Promise<void> {
    memoryManager.run(`DELETE FROM procedural_memories WHERE id = ?`, [id])
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const limit = query.limit ?? 10
    const pattern = `%${(query.text ?? '').toLowerCase()}%`

    const rows = memoryManager.queryAll(
      `SELECT * FROM procedural_memories
       WHERE (LOWER(trigger_text) LIKE ? OR LOWER(content) LIKE ?)
       ORDER BY (success_rate * importance) DESC
       LIMIT ?`,
      [pattern, pattern, limit]
    ) as ProceduralRow[]

    return rows.map((row) => ({
      entry: this.rowToEntry(row),
      relevance: row.success_rate * row.importance,
      matchType: 'keyword' as const,
      tier: 'procedural' as const,
    }))
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const row = memoryManager.queryOne(
      `SELECT * FROM procedural_memories WHERE id = ?`, [id]
    ) as ProceduralRow | undefined
    if (!row) return null
    return this.rowToEntry(row)
  }

  async list(offset: number, limit: number): Promise<MemoryEntry[]> {
    const rows = memoryManager.queryAll(
      `SELECT * FROM procedural_memories ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    ) as ProceduralRow[]
    return rows.map((r) => this.rowToEntry(r))
  }

  async count(): Promise<number> {
    const r = memoryManager.queryOne(
      `SELECT COUNT(*) as cnt FROM procedural_memories`
    ) as { cnt: number } | undefined
    return r?.cnt ?? 0
  }

  async estimateTokens(): Promise<number> {
    const r = memoryManager.queryOne(
      `SELECT SUM(LENGTH(content) + LENGTH(steps)) as total FROM procedural_memories`
    ) as { total: number | null } | undefined
    return Math.ceil((r?.total ?? 0) / 4)
  }

  async getPromotionCandidates(limit: number): Promise<MemoryEntry[]> {
    const rows = memoryManager.queryAll(
      `SELECT * FROM procedural_memories
       WHERE success_rate > 0.8 AND execution_count > 10
       ORDER BY (success_rate * importance) DESC LIMIT ?`,
      [limit]
    ) as ProceduralRow[]
    return rows.map((r) => this.rowToEntry(r))
  }

  async getDemotionCandidates(limit: number): Promise<MemoryEntry[]> {
    const rows = memoryManager.queryAll(
      `SELECT * FROM procedural_memories
       WHERE success_rate < 0.3 AND execution_count > 5
       ORDER BY success_rate ASC LIMIT ?`,
      [limit]
    ) as ProceduralRow[]
    return rows.map((r) => this.rowToEntry(r))
  }

  // ── Procedural-Specific Helpers ────────────────────────────

  async findMatchingProcedure(triggerText: string): Promise<ProceduralEntry | null> {
    const row = memoryManager.queryOne(
      `SELECT * FROM procedural_memories
       WHERE LOWER(trigger_text) LIKE ?
       ORDER BY success_rate DESC LIMIT 1`,
      [`%${triggerText.toLowerCase()}%`]
    ) as ProceduralRow | undefined
    if (!row) return null
    return this.rowToEntry(row)
  }

  async recordExecution(id: string, success: boolean): Promise<void> {
    const entry = await this.get(id) as ProceduralEntry | null
    if (!entry) return
    const newCount = entry.executionCount + 1
    const newRate = (entry.successRate * (newCount - 1) + (success ? 1 : 0)) / newCount
    memoryManager.run(
      `UPDATE procedural_memories SET execution_count = ?, success_rate = ?,
       last_executed_at = ?, updated_at = ? WHERE id = ?`,
      [newCount, newRate, Date.now(), Date.now(), id]
    )
  }

  async learnProcedure(
    trigger: string,
    steps: ProceduralStep[],
    capabilities?: string[]
  ): Promise<string> {
    const id = randomUUID()
    const now = Date.now()
    memoryManager.run(
      `INSERT INTO procedural_memories (
        id, content, metadata, trigger_text, steps,
        success_rate, execution_count, last_executed_at,
        required_capabilities, importance, decay_factor,
        access_count, created_at, updated_at, last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, `Workflow: ${trigger}`,
        JSON.stringify({ source: 'workflow_learning', tier: 'procedural', tags: ['learned'], associations: [], contentType: 'workflow', confidence: 0.5, pinned: false }),
        trigger, JSON.stringify(steps),
        0.5, 0, null,
        capabilities ? JSON.stringify(capabilities) : null,
        0.5, 1.0, 0, now, now, null,
      ]
    )
    return id
  }

  // ── Row ↔ Entry Mapping ────────────────────────────────────

  private rowToEntry(row: ProceduralRow): ProceduralEntry {
    const parsedMeta = row.metadata ? JSON.parse(row.metadata) : {}
    return {
      id: row.id,
      content: row.content,
      metadata: {
        source: parsedMeta.source ?? 'workflow_learning',
        tier: 'procedural',
        tags: parsedMeta.tags ?? [],
        associations: parsedMeta.associations ?? [],
        contentType: parsedMeta.contentType ?? 'workflow',
        confidence: parsedMeta.confidence ?? 0.5,
        pinned: parsedMeta.pinned ?? false,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at ?? row.updated_at,
      importance: row.importance,
      decayFactor: row.decay_factor,
      trigger: row.trigger_text,
      steps: JSON.parse(row.steps),
      successRate: row.success_rate,
      executionCount: row.execution_count,
      lastExecutedAt: row.last_executed_at ?? 0,
      requiredCapabilities: row.required_capabilities
        ? JSON.parse(row.required_capabilities)
        : [],
    }
  }
}

export const proceduralMemory = new ProceduralMemory()
