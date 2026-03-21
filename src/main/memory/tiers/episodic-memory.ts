import type {
  MemoryTierProvider,
  MemoryEntry,
  MemoryQuery,
  MemorySearchResult,
  EpisodicEntry,
  MemoryMetadata,
} from '../memory-interfaces'
import { randomUUID } from 'crypto'
import { memoryManager } from '../../memory'

class EpisodicMemory implements MemoryTierProvider {
  readonly tier = 'episodic' as const
  readonly name = 'Episodic Memory'

  async init(): Promise<void> {
    // Create episodic_memories table
    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS episodic_memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT,
        session_id TEXT,
        sequence_index INTEGER,
        emotional_valence REAL,
        outcome TEXT,
        related_task_id TEXT,
        importance REAL,
        decay_factor REAL,
        access_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER
      )
    `)

    // Create indices for common queries
    memoryManager.run(`
      CREATE INDEX IF NOT EXISTS idx_episodic_session_id
      ON episodic_memories(session_id)
    `)

    memoryManager.run(`
      CREATE INDEX IF NOT EXISTS idx_episodic_created_at
      ON episodic_memories(created_at)
    `)
  }

  async add(entry: MemoryEntry): Promise<string> {
    const episodic = entry as EpisodicEntry

    const id = episodic.id || randomUUID()
    const now = Date.now()

    const metadataJson = episodic.metadata ? JSON.stringify(episodic.metadata) : null

    memoryManager.run(
      `
      INSERT INTO episodic_memories (
        id,
        content,
        metadata,
        session_id,
        sequence_index,
        emotional_valence,
        outcome,
        related_task_id,
        importance,
        decay_factor,
        access_count,
        created_at,
        updated_at,
        last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        episodic.content,
        metadataJson,
        episodic.sessionId ?? null,
        episodic.sequenceIndex ?? null,
        episodic.emotionalValence ?? null,
        episodic.outcome ?? null,
        episodic.relatedTaskId ?? null,
        episodic.importance ?? 0.5,
        episodic.decayFactor ?? 1.0,
        0, // access_count starts at 0
        episodic.createdAt ?? now,
        episodic.updatedAt ?? now,
        null, // last_accessed_at
      ]
    )

    return id
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    const now = Date.now()
    const sets: string[] = []
    const params: any[] = []

    if (updates.content !== undefined) {
      sets.push('content = ?')
      params.push(updates.content)
    }

    if (updates.metadata !== undefined) {
      sets.push('metadata = ?')
      params.push(JSON.stringify(updates.metadata))
    }

    if (updates.importance !== undefined) {
      sets.push('importance = ?')
      params.push(updates.importance)
    }

    if (updates.decayFactor !== undefined) {
      sets.push('decay_factor = ?')
      params.push(updates.decayFactor)
    }

    if (updates.accessCount !== undefined) {
      sets.push('access_count = ?')
      params.push(updates.accessCount)
    }

    if (sets.length === 0) {
      return
    }

    sets.push('updated_at = ?')
    params.push(now)
    params.push(id)

    const sql = `UPDATE episodic_memories SET ${sets.join(', ')} WHERE id = ?`
    memoryManager.run(sql, params)
  }

  async remove(id: string): Promise<void> {
    memoryManager.run('DELETE FROM episodic_memories WHERE id = ?', [id])
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = []

    let sql = `
      SELECT * FROM episodic_memories
      WHERE 1=1
    `
    const params: unknown[] = []

    // Text search
    if (query.text) {
      sql += ` AND LOWER(content) LIKE LOWER(?)`
      params.push(`%${query.text}%`)
    }

    // Session filter
    if (query.sessionId) {
      sql += ` AND session_id = ?`
      params.push(query.sessionId)
    }

    // Time range filter
    if (query.timeRange) {
      if (query.timeRange.start) {
        sql += ` AND created_at >= ?`
        params.push(query.timeRange.start)
      }
      if (query.timeRange.end) {
        sql += ` AND created_at <= ?`
        params.push(query.timeRange.end)
      }
    }

    // Tags filter (search in metadata JSON)
    if (query.tags && query.tags.length > 0) {
      sql += ` AND (`
      const tagConditions = query.tags.map(() => `metadata LIKE ?`)
      sql += tagConditions.join(' OR ')
      sql += `)`
      query.tags.forEach((tag) => {
        params.push(`%"${tag}"%`)
      })
    }

    // Sort by importance * decay_factor descending
    sql += ` ORDER BY (importance * decay_factor) DESC`

    // Limit results (default 10)
    const limit = query.limit ?? 10
    sql += ` LIMIT ?`
    params.push(limit)

    const rows = memoryManager.queryAll(sql, params as any[])

    for (const row of rows) {
      const entry = this.rowToEntry(row)
      results.push({
        entry,
        relevance: (entry.importance ?? 0.5) * (entry.decayFactor ?? 1.0),
        matchType: 'keyword',
        tier: 'episodic',
      })
    }

    return results
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const row = memoryManager.queryOne(`
      SELECT * FROM episodic_memories WHERE id = ?
    `, [id])

    if (!row) {
      return null
    }

    // Update access_count and last_accessed_at
    const now = Date.now()
    memoryManager.run(
      `
      UPDATE episodic_memories
      SET access_count = access_count + 1, last_accessed_at = ?
      WHERE id = ?
    `,
      [now, id]
    )

    return this.rowToEntry(row)
  }

  async list(offset: number, limit: number): Promise<MemoryEntry[]> {
    const rows = memoryManager.queryAll(
      `
      SELECT * FROM episodic_memories
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
      [limit, offset]
    )

    return rows.map((row) => this.rowToEntry(row))
  }

  async count(): Promise<number> {
    const result = memoryManager.queryOne(`SELECT COUNT(*) as count FROM episodic_memories`)

    return result?.count ?? 0
  }

  async estimateTokens(): Promise<number> {
    const result = memoryManager.queryOne(
      `SELECT SUM(LENGTH(content)) as total FROM episodic_memories`
    )

    const totalLength = result?.total ?? 0
    return Math.ceil(totalLength / 4)
  }

  async getPromotionCandidates(limit: number): Promise<MemoryEntry[]> {
    const rows = memoryManager.queryAll(
      `
      SELECT * FROM episodic_memories
      WHERE access_count > ? AND importance > ? AND outcome = ?
      ORDER BY (importance * access_count) DESC
      LIMIT ?
    `,
      [5, 0.7, 'success', limit]
    )

    return rows.map((row) => this.rowToEntry(row))
  }

  async getDemotionCandidates(limit: number): Promise<MemoryEntry[]> {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

    const rows = memoryManager.queryAll(
      `
      SELECT * FROM episodic_memories
      WHERE created_at < ?
        AND importance < ?
        AND (metadata IS NULL OR metadata NOT LIKE '%"pinned":true%')
      ORDER BY created_at ASC
      LIMIT ?
    `,
      [thirtyDaysAgo, 0.2, limit]
    )

    return rows.map((row) => this.rowToEntry(row))
  }

  async recordEpisode(
    sessionId: string,
    content: string,
    outcome: string,
    taskId?: string
  ): Promise<string> {
    const now = Date.now()

    const entry: EpisodicEntry = {
      id: randomUUID(),
      content,
      sessionId,
      sequenceIndex: 0,
      emotionalValence: 0,
      outcome: outcome as 'success' | 'failure' | 'partial' | 'unknown',
      relatedTaskId: taskId,
      importance: 0.5,
      decayFactor: 1.0,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
      metadata: {
        source: 'agent_output',
        tier: 'episodic',
        tags: [],
        associations: [],
        contentType: 'text',
        confidence: 1.0,
        pinned: false,
      },
    }

    return this.add(entry)
  }

  async getSessionHistory(sessionId: string): Promise<EpisodicEntry[]> {
    const rows = memoryManager.queryAll(
      `
      SELECT * FROM episodic_memories
      WHERE session_id = ?
      ORDER BY sequence_index ASC, created_at ASC
    `,
      [sessionId]
    )

    return rows.map((row) => this.rowToEntry(row))
  }

  async getRecentSessions(
    limit: number
  ): Promise<Array<{ sessionId: string; lastEpisode: EpisodicEntry }>> {
    const rows = memoryManager.queryAll(
      `
      SELECT DISTINCT session_id FROM episodic_memories
      WHERE session_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT ?
    `,
      [limit]
    )

    const results: Array<{ sessionId: string; lastEpisode: EpisodicEntry }> = []

    for (const row of rows) {
      const sessionId = (row as any).session_id
      if (sessionId) {
        const lastRow = memoryManager.queryOne(
          `
          SELECT * FROM episodic_memories
          WHERE session_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
          [sessionId]
        )
        if (lastRow) {
          results.push({
            sessionId,
            lastEpisode: this.rowToEntry(lastRow),
          })
        }
      }
    }

    return results
  }

  private rowToEntry(row: any): EpisodicEntry {
    let parsedMetadata: MemoryMetadata | undefined
    if (row.metadata) {
      try {
        parsedMetadata = JSON.parse(row.metadata) as MemoryMetadata
      } catch {
        parsedMetadata = {
          source: 'agent_output',
          tier: 'episodic',
          tags: [],
          associations: [],
          contentType: 'text',
          confidence: 1.0,
          pinned: false,
        }
      }
    } else {
      parsedMetadata = {
        source: 'agent_output',
        tier: 'episodic',
        tags: [],
        associations: [],
        contentType: 'text',
        confidence: 1.0,
        pinned: false,
      }
    }

    return {
      id: row.id,
      content: row.content,
      metadata: parsedMetadata,
      sessionId: row.session_id ?? undefined,
      sequenceIndex: row.sequence_index ?? 0,
      emotionalValence: row.emotional_valence ?? 0,
      outcome: (row.outcome ?? 'unknown') as
        | 'success'
        | 'failure'
        | 'partial'
        | 'unknown',
      relatedTaskId: row.related_task_id ?? undefined,
      importance: row.importance ?? 0.5,
      decayFactor: row.decay_factor ?? 1.0,
      accessCount: row.access_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAccessedAt: row.last_accessed_at ?? Date.now(),
    }
  }
}

export const episodicMemory = new EpisodicMemory()
