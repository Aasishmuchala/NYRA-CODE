import { randomUUID } from 'crypto';
import type {
  MemoryTierProvider,
  MemoryEntry,
  MemoryMetadata,
  MemoryQuery,
  MemorySearchResult,
  MemoryTier,
} from '../memory-interfaces';
import { memoryManager } from '../../memory';

class ArchivalMemory implements MemoryTierProvider {
  readonly tier: MemoryTier = 'archival';
  readonly name: string = 'Archival Memory';

  async init(): Promise<void> {
    const initSql = `
      CREATE TABLE IF NOT EXISTS archival_memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT,
        embedding BLOB,
        original_entry_count INTEGER DEFAULT 1,
        original_tier TEXT,
        date_range_start INTEGER,
        date_range_end INTEGER,
        compression_ratio REAL DEFAULT 1.0,
        importance REAL DEFAULT 0.5,
        decay_factor REAL DEFAULT 0.95,
        access_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER
      )
    `;
    memoryManager.run(initSql);

    const indexSql1 = `
      CREATE INDEX IF NOT EXISTS idx_archival_created_at
      ON archival_memories(created_at)
    `;
    memoryManager.run(indexSql1);

    const indexSql2 = `
      CREATE INDEX IF NOT EXISTS idx_archival_original_tier
      ON archival_memories(original_tier)
    `;
    memoryManager.run(indexSql2);
  }

  async add(entry: MemoryEntry): Promise<string> {
    const id = entry.id || randomUUID();
    const now = Date.now();

    const metadataJson = entry.metadata ? JSON.stringify(entry.metadata) : null;

    const sql = `
      INSERT INTO archival_memories (
        id, content, metadata, embedding, original_entry_count, original_tier,
        date_range_start, date_range_end, compression_ratio, importance,
        decay_factor, access_count, created_at, updated_at, last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    memoryManager.run(sql, [
      id,
      entry.content,
      metadataJson,
      entry.embedding ? Buffer.from(entry.embedding) : null,
      1,
      entry.metadata?.tier || null,
      entry.createdAt || now,
      entry.createdAt || now,
      1.0,
      entry.importance || 0.5,
      entry.decayFactor || 0.95,
      entry.accessCount || 0,
      entry.createdAt || now,
      now,
      entry.lastAccessedAt || null,
    ]);

    return id;
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    let sql = `
      SELECT * FROM archival_memories
      WHERE 1=1
    `;
    const params: Array<string | number> = [];

    if (query.text) {
      sql += ` AND content LIKE ?`;
      params.push(`%${query.text}%`);
    }

    if (query.timeRange) {
      sql += ` AND date_range_end >= ?`;
      params.push(query.timeRange.start);
      sql += ` AND date_range_start <= ?`;
      params.push(query.timeRange.end);
    }

    sql += ` ORDER BY importance DESC`;

    const limit = query.limit || 10;
    sql += ` LIMIT ?`;
    params.push(limit);

    const rows = memoryManager.queryAll(sql, params) as Array<{
      id: string;
      content: string;
      metadata: string | null;
      embedding: Buffer | null;
      original_entry_count: number;
      original_tier: string | null;
      date_range_start: number;
      date_range_end: number;
      compression_ratio: number;
      importance: number;
      decay_factor: number;
      access_count: number;
      created_at: number;
      updated_at: number;
      last_accessed_at: number | null;
    }>;

    return rows.map((row) => {
      const entry = this.rowToEntry(row);
      return {
        entry,
        relevance: entry.importance,
        matchType: 'keyword' as const,
        tier: this.tier,
        explanation: `Archived entry from original tier ${row.original_tier}`,
      };
    });
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const sql = `SELECT * FROM archival_memories WHERE id = ?`;
    const row = memoryManager.queryOne(sql, [id]) as {
      id: string;
      content: string;
      metadata: string | null;
      embedding: Buffer | null;
      original_entry_count: number;
      original_tier: string | null;
      date_range_start: number;
      date_range_end: number;
      compression_ratio: number;
      importance: number;
      decay_factor: number;
      access_count: number;
      created_at: number;
      updated_at: number;
      last_accessed_at: number | null;
    } | undefined;

    if (!row) {
      return null;
    }

    // Increment access count and update last_accessed_at
    const updateSql = `
      UPDATE archival_memories
      SET access_count = access_count + 1, last_accessed_at = ?
      WHERE id = ?
    `;
    memoryManager.run(updateSql, [Date.now(), id]);

    return this.rowToEntry(row);
  }

  async list(offset: number, limit: number): Promise<MemoryEntry[]> {
    const sql = `
      SELECT * FROM archival_memories
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = memoryManager.queryAll(sql, [limit, offset]) as Array<{
      id: string;
      content: string;
      metadata: string | null;
      embedding: Buffer | null;
      original_entry_count: number;
      original_tier: string | null;
      date_range_start: number;
      date_range_end: number;
      compression_ratio: number;
      importance: number;
      decay_factor: number;
      access_count: number;
      created_at: number;
      updated_at: number;
      last_accessed_at: number | null;
    }>;

    return rows.map((row) => this.rowToEntry(row));
  }

  async count(): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM archival_memories`;
    const result = memoryManager.queryOne(sql) as { count: number };
    return result.count;
  }

  async remove(id: string): Promise<void> {
    const sql = `DELETE FROM archival_memories WHERE id = ?`;
    memoryManager.run(sql, [id]);
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    const now = Date.now();
    const fields: string[] = ['updated_at = ?'];
    const values: Array<string | number | null | Buffer> = [now];

    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }

    if (updates.importance !== undefined) {
      fields.push('importance = ?');
      values.push(updates.importance);
    }

    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (updates.embedding !== undefined) {
      fields.push('embedding = ?');
      values.push(updates.embedding ? Buffer.from(updates.embedding) : null);
    }

    if (updates.decayFactor !== undefined) {
      fields.push('decay_factor = ?');
      values.push(updates.decayFactor);
    }

    if (updates.accessCount !== undefined) {
      fields.push('access_count = ?');
      values.push(updates.accessCount);
    }

    if (updates.lastAccessedAt !== undefined) {
      fields.push('last_accessed_at = ?');
      values.push(updates.lastAccessedAt);
    }

    values.push(id);

    const sql = `
      UPDATE archival_memories
      SET ${fields.join(', ')}
      WHERE id = ?
    `;

    memoryManager.run(sql, values);
  }

  async estimateTokens(): Promise<number> {
    const sql = `
      SELECT COALESCE(SUM(LENGTH(content) / 4), 0) as token_estimate
      FROM archival_memories
    `;
    const result = memoryManager.queryOne(sql) as { token_estimate: number };
    return result.token_estimate;
  }

  async getPromotionCandidates(limit: number): Promise<MemoryEntry[]> {
    const sql = `
      SELECT * FROM archival_memories
      WHERE access_count > 10
      ORDER BY access_count DESC, last_accessed_at DESC
      LIMIT ?
    `;
    const rows = memoryManager.queryAll(sql, [limit]) as Array<{
      id: string;
      content: string;
      metadata: string | null;
      embedding: Buffer | null;
      original_entry_count: number;
      original_tier: string | null;
      date_range_start: number;
      date_range_end: number;
      compression_ratio: number;
      importance: number;
      decay_factor: number;
      access_count: number;
      created_at: number;
      updated_at: number;
      last_accessed_at: number | null;
    }>;

    return rows.map((row) => this.rowToEntry(row));
  }

  async getDemotionCandidates(limit: number): Promise<MemoryEntry[]> {
    return [];
  }

  async archive(entries: MemoryEntry[], sourceTier: MemoryTier): Promise<void> {
    if (entries.length === 0) return;

    const contents = entries.map((e) => e.content).join('\n---\n');
    const originalLengths = entries.reduce((sum, e) => sum + e.content.length, 0);
    const compressionRatio = originalLengths > 0 ? originalLengths / contents.length : 1.0;

    const importance =
      entries.reduce((sum, e) => sum + (e.importance || 0.5), 0) / entries.length;

    const timestamps = entries.map((e) => e.createdAt);
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);

    const metadata: MemoryMetadata = {
      source: 'compaction',
      tier: 'archival',
      tags: ['archived'],
      associations: entries.map((e) => e.id),
      contentType: 'summary',
      confidence: 0.9,
      pinned: false,
    };

    const archivalEntry: MemoryEntry = {
      id: randomUUID(),
      content: contents,
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: Date.now(),
      importance,
      decayFactor: 0.95,
    };

    await this.add(archivalEntry);
  }

  async getArchivesByDateRange(start: number, end: number): Promise<MemoryEntry[]> {
    const sql = `
      SELECT * FROM archival_memories
      WHERE date_range_end >= ? AND date_range_start <= ?
      ORDER BY date_range_start DESC
    `;
    const rows = memoryManager.queryAll(sql, [start, end]) as Array<{
      id: string;
      content: string;
      metadata: string | null;
      embedding: Buffer | null;
      original_entry_count: number;
      original_tier: string | null;
      date_range_start: number;
      date_range_end: number;
      compression_ratio: number;
      importance: number;
      decay_factor: number;
      access_count: number;
      created_at: number;
      updated_at: number;
      last_accessed_at: number | null;
    }>;

    return rows.map((row) => this.rowToEntry(row));
  }

  async getArchivesByOriginalTier(tier: MemoryTier): Promise<MemoryEntry[]> {
    const sql = `
      SELECT * FROM archival_memories
      WHERE original_tier = ?
      ORDER BY created_at DESC
    `;
    const rows = memoryManager.queryAll(sql, [tier]) as Array<{
      id: string;
      content: string;
      metadata: string | null;
      embedding: Buffer | null;
      original_entry_count: number;
      original_tier: string | null;
      date_range_start: number;
      date_range_end: number;
      compression_ratio: number;
      importance: number;
      decay_factor: number;
      access_count: number;
      created_at: number;
      updated_at: number;
      last_accessed_at: number | null;
    }>;

    return rows.map((row) => this.rowToEntry(row));
  }

  async getStorageStats(): Promise<{
    totalEntries: number;
    totalTokens: number;
    oldestEntry: number | null;
    newestEntry: number | null;
    avgCompressionRatio: number;
  }> {
    const sql = `
      SELECT
        COUNT(*) as total_entries,
        COALESCE(SUM(LENGTH(content) / 4), 0) as total_tokens,
        MIN(date_range_start) as oldest_entry,
        MAX(date_range_end) as newest_entry,
        COALESCE(AVG(compression_ratio), 1.0) as avg_compression_ratio
      FROM archival_memories
    `;
    const result = memoryManager.queryOne(sql) as {
      total_entries: number;
      total_tokens: number;
      oldest_entry: number | null;
      newest_entry: number | null;
      avg_compression_ratio: number;
    };

    return {
      totalEntries: result.total_entries,
      totalTokens: result.total_tokens,
      oldestEntry: result.oldest_entry,
      newestEntry: result.newest_entry,
      avgCompressionRatio: result.avg_compression_ratio,
    };
  }

  private rowToEntry(row: {
    id: string;
    content: string;
    metadata: string | null;
    embedding: Buffer | null;
    original_entry_count: number;
    original_tier: string | null;
    date_range_start: number;
    date_range_end: number;
    compression_ratio: number;
    importance: number;
    decay_factor: number;
    access_count: number;
    created_at: number;
    updated_at: number;
    last_accessed_at: number | null;
  }): MemoryEntry {
    const metadata: MemoryMetadata = row.metadata
      ? JSON.parse(row.metadata)
      : {
          source: 'compaction',
          tier: 'archival',
          tags: [],
          associations: [],
          contentType: 'summary' as const,
          confidence: 0.9,
          pinned: false,
        };

    return {
      id: row.id,
      content: row.content,
      metadata,
      embedding: row.embedding ? new Float32Array(row.embedding.buffer) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at || Date.now(),
      importance: row.importance,
      decayFactor: row.decay_factor,
    };
  }
}

export const archivalMemory = new ArchivalMemory();
