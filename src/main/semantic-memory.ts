/**
 * Semantic Memory — Cross-session persistent memory with embedding-based retrieval
 *
 * Features:
 *   - Embedding generation via Ollama (nomic-embed-text or similar)
 *   - Cosine similarity search across stored memories
 *   - Memory types: facts, preferences, decisions, code_patterns, context
 *   - Auto-extraction: LLM extracts key memories from conversations
 *   - Decay & relevance: Recent memories weighted higher; pinned memories persist
 *   - Export/Import: Backup memories as JSON
 *
 * Architecture:
 *   SemanticMemory → MemoryManager (SQLite) + Ollama embeddings API
 *   Schema extension: adds `memories` and `memory_embeddings` tables
 *
 * Note: If Ollama/embedding model isn't available, falls back to keyword search
 * via the existing MemoryManager.searchFacts() method.
 */

import { EventEmitter } from 'events'
import { memoryManager } from './memory'
import { OLLAMA_BASE_URL, isOllamaRunning } from './ollama'
import { callAgentLLM } from './agent-llm-client'
import type { AgentDefinition } from './agent-registry'

// ── Types ────────────────────────────────────────────────────────────────────

export type MemoryType = 'fact' | 'preference' | 'decision' | 'code_pattern' | 'context' | 'summary'

export interface MemoryEntry {
  id: number
  type: MemoryType
  content: string
  topic: string           // auto-extracted topic label
  source: string          // session ID, file path, or 'user' for manual entries
  projectId?: string
  confidence: number      // 0-1
  pinned: boolean
  accessCount: number
  createdAt: number
  updatedAt: number
  lastAccessedAt: number
  tags: string[]
}

export interface MemorySearchResult extends MemoryEntry {
  relevanceScore: number  // 0-1 similarity score
}

export interface MemoryStats {
  totalMemories: number
  byType: Record<MemoryType, number>
  byProject: Record<string, number>
  oldestMemory: number
  newestMemory: number
  totalEmbeddings: number
  embeddingModelAvailable: boolean
}

export interface ExtractedMemory {
  type: MemoryType
  content: string
  topic: string
  confidence: number
  tags: string[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'nomic-embed-text'
const _EMBEDDING_DIMENSIONS = 768
const DEFAULT_SEARCH_LIMIT = 10
const DECAY_HALF_LIFE_DAYS = 30  // memories lose half relevance after 30 days
const MAX_CONTEXT_MEMORIES = 8   // max memories injected into context

// ── Virtual agent definition for extraction LLM calls ────────────────────────

const EXTRACTOR_AGENT: AgentDefinition = {
  id: 'memory-extractor',
  name: 'Memory Extractor',
  role: 'research',
  description: 'Extracts key facts, decisions, and preferences from conversations',
  preferredModel: 'default',
  fallbackModel: 'default',
  tokenBudget: 2000,
  systemPrompt: `You are a memory extraction agent. Given a conversation or text, extract key memories that would be useful to remember across sessions.

For each memory, output a JSON array of objects with these fields:
- type: one of "fact", "preference", "decision", "code_pattern", "context"
- content: the memory content (concise, 1-2 sentences)
- topic: a short topic label (2-4 words)
- confidence: 0-1 how confident you are this is worth remembering
- tags: array of relevant tags

Only extract memories with confidence >= 0.6. Focus on:
- User preferences and working style
- Technical decisions and their rationale
- Project-specific facts (tech stack, architecture)
- Code patterns the user prefers
- Important context about goals or constraints

Output ONLY a valid JSON array. No other text.`,
  allowedTools: [],
  maxFolderAccess: 'none',
  canRequestApproval: false,
  canSpawnSubagents: false,
  icon: '🧠',
}

// ── SemanticMemory Class ─────────────────────────────────────────────────────

class SemanticMemory extends EventEmitter {
  private initialized = false
  private embeddingAvailable = false

  /**
   * Initialize semantic memory tables (extends existing SQLite schema)
   */
  init(): void {
    if (this.initialized) return

    try {
      // Create semantic memory tables
      memoryManager.run(`
        CREATE TABLE IF NOT EXISTS memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          topic TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT 'unknown',
          project_id TEXT,
          confidence REAL DEFAULT 1.0,
          pinned INTEGER DEFAULT 0,
          access_count INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch()),
          last_accessed_at INTEGER DEFAULT (unixepoch()),
          tags TEXT DEFAULT '[]'
        )
      `)

      memoryManager.run(`
        CREATE TABLE IF NOT EXISTS memory_embeddings (
          memory_id INTEGER PRIMARY KEY,
          embedding BLOB NOT NULL,
          model TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch()),
          FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
        )
      `)

      // Indexes for common queries
      memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)`)
      memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id)`)
      memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_memories_topic ON memories(topic)`)
      memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(pinned)`)
      memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC)`)

      this.initialized = true
      console.log('[SemanticMemory] Schema initialized')

      // Check embedding model availability in background
      this.checkEmbeddingModel().catch(() => {})
    } catch (err) {
      console.error('[SemanticMemory] Failed to initialize:', err)
    }
  }

  // ── Embedding Generation ────────────────────────────────────────────────

  private async checkEmbeddingModel(): Promise<void> {
    try {
      const online = await isOllamaRunning()
      if (!online) {
        this.embeddingAvailable = false
        return
      }

      // Try generating a test embedding
      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: 'test' }),
        signal: AbortSignal.timeout(10000),
      })

      this.embeddingAvailable = response.ok
      console.log(`[SemanticMemory] Embedding model ${EMBEDDING_MODEL}: ${this.embeddingAvailable ? 'available' : 'not available'}`)
    } catch {
      this.embeddingAvailable = false
    }
  }

  private async generateEmbedding(text: string): Promise<Float32Array | null> {
    if (!this.embeddingAvailable) return null

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
        signal: AbortSignal.timeout(15000),
      })

      if (!response.ok) return null

      const data = await response.json() as { embedding?: number[] }
      if (!data.embedding) return null

      return new Float32Array(data.embedding)
    } catch {
      return null
    }
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    return denom === 0 ? 0 : dot / denom
  }

  // ── CRUD Operations ─────────────────────────────────────────────────────

  /**
   * Store a new memory with optional embedding generation
   */
  async addMemory(opts: {
    type: MemoryType
    content: string
    topic?: string
    source?: string
    projectId?: string
    confidence?: number
    tags?: string[]
    pinned?: boolean
  }): Promise<MemoryEntry> {
    const result = memoryManager.run(
      `INSERT INTO memories (type, content, topic, source, project_id, confidence, pinned, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        opts.type,
        opts.content,
        opts.topic || '',
        opts.source || 'unknown',
        opts.projectId || null,
        opts.confidence ?? 1.0,
        opts.pinned ? 1 : 0,
        JSON.stringify(opts.tags || []),
      ]
    )

    const id = result.lastInsertRowid

    // Generate embedding in background (non-blocking)
    this.generateEmbedding(opts.content).then(embedding => {
      if (embedding) {
        const buffer = Buffer.from(embedding.buffer)
        memoryManager.run(
          `INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding, model) VALUES (?, ?, ?)`,
          [id, buffer, EMBEDDING_MODEL]
        )
      }
    }).catch(() => {})

    const entry = this.getMemory(id)!
    this.emit('memory:added', entry)
    return entry
  }

  getMemory(id: number): MemoryEntry | null {
    const row = memoryManager.queryOne(
      `SELECT * FROM memories WHERE id = ?`, [id]
    )
    return row ? this.rowToEntry(row) : null
  }

  updateMemory(id: number, updates: Partial<Pick<MemoryEntry, 'content' | 'topic' | 'confidence' | 'pinned' | 'tags'>>): MemoryEntry | null {
    const sets: string[] = ['updated_at = unixepoch()']
    const params: any[] = []

    if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content) }
    if (updates.topic !== undefined) { sets.push('topic = ?'); params.push(updates.topic) }
    if (updates.confidence !== undefined) { sets.push('confidence = ?'); params.push(updates.confidence) }
    if (updates.pinned !== undefined) { sets.push('pinned = ?'); params.push(updates.pinned ? 1 : 0) }
    if (updates.tags !== undefined) { sets.push('tags = ?'); params.push(JSON.stringify(updates.tags)) }

    params.push(id)
    memoryManager.run(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`, params)

    // Re-generate embedding if content changed
    if (updates.content) {
      this.generateEmbedding(updates.content).then(embedding => {
        if (embedding) {
          const buffer = Buffer.from(embedding.buffer)
          memoryManager.run(
            `INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding, model) VALUES (?, ?, ?)`,
            [id, buffer, EMBEDDING_MODEL]
          )
        }
      }).catch(() => {})
    }

    const entry = this.getMemory(id)
    if (entry) this.emit('memory:updated', entry)
    return entry
  }

  deleteMemory(id: number): boolean {
    const result = memoryManager.run(`DELETE FROM memories WHERE id = ?`, [id])
    if (result.changes > 0) {
      this.emit('memory:deleted', { id })
      return true
    }
    return false
  }

  // ── Search ──────────────────────────────────────────────────────────────

  /**
   * Semantic search: if embedding model is available, use cosine similarity.
   * Otherwise falls back to keyword LIKE search.
   */
  async search(query: string, opts?: {
    type?: MemoryType
    projectId?: string
    limit?: number
    minRelevance?: number
  }): Promise<MemorySearchResult[]> {
    const limit = opts?.limit ?? DEFAULT_SEARCH_LIMIT
    const minRelevance = opts?.minRelevance ?? 0.3

    // Try semantic search first
    const queryEmbedding = await this.generateEmbedding(query)

    if (queryEmbedding) {
      return this.semanticSearch(queryEmbedding, opts?.type, opts?.projectId, limit, minRelevance)
    }

    // Fallback to keyword search
    return this.keywordSearch(query, opts?.type, opts?.projectId, limit)
  }

  private semanticSearch(
    queryEmbedding: Float32Array,
    type?: MemoryType,
    projectId?: string,
    limit?: number,
    minRelevance?: number,
  ): MemorySearchResult[] {
    // Load all embeddings — for large datasets this would need a proper vector DB
    // For typical personal memory (<10K entries) this is fast enough
    let sql = `
      SELECT m.*, me.embedding
      FROM memories m
      JOIN memory_embeddings me ON me.memory_id = m.id
      WHERE 1=1
    `
    const params: any[] = []

    if (type) { sql += ` AND m.type = ?`; params.push(type) }
    if (projectId) { sql += ` AND m.project_id = ?`; params.push(projectId) }

    const rows = memoryManager.queryAll(sql, params)

    const results: MemorySearchResult[] = []
    const now = Date.now() / 1000

    for (const row of rows) {
      const embedding = new Float32Array(new Uint8Array(row.embedding).buffer)
      let similarity = this.cosineSimilarity(queryEmbedding, embedding)

      // Apply decay: reduce relevance for older memories (unless pinned)
      if (!row.pinned) {
        const ageDays = (now - row.created_at) / 86400
        const decayFactor = Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS)
        similarity *= (0.5 + 0.5 * decayFactor) // decay reduces score by up to 50%
      }

      // Boost by access count (capped)
      const accessBoost = Math.min(0.1, row.access_count * 0.01)
      similarity += accessBoost

      if (similarity >= (minRelevance ?? 0.3)) {
        results.push({
          ...this.rowToEntry(row),
          relevanceScore: Math.round(similarity * 1000) / 1000,
        })
      }
    }

    // Sort by relevance and limit
    results.sort((a, b) => b.relevanceScore - a.relevanceScore)

    // Mark access for returned results
    for (const r of results.slice(0, limit)) {
      memoryManager.run(
        `UPDATE memories SET access_count = access_count + 1, last_accessed_at = unixepoch() WHERE id = ?`,
        [r.id]
      )
    }

    return results.slice(0, limit)
  }

  private keywordSearch(
    query: string,
    type?: MemoryType,
    projectId?: string,
    limit?: number,
  ): MemorySearchResult[] {
    let sql = `
      SELECT * FROM memories
      WHERE (content LIKE ? OR topic LIKE ? OR tags LIKE ?)
    `
    const params: any[] = [`%${query}%`, `%${query}%`, `%${query}%`]

    if (type) { sql += ` AND type = ?`; params.push(type) }
    if (projectId) { sql += ` AND project_id = ?`; params.push(projectId) }

    sql += ` ORDER BY pinned DESC, updated_at DESC LIMIT ?`
    params.push(limit ?? DEFAULT_SEARCH_LIMIT)

    const rows = memoryManager.queryAll(sql, params)
    return rows.map((row, i) => ({
      ...this.rowToEntry(row),
      relevanceScore: 1 - (i * 0.05), // simple rank-based score
    }))
  }

  // ── Browse & List ───────────────────────────────────────────────────────

  listMemories(opts?: {
    type?: MemoryType
    projectId?: string
    pinned?: boolean
    limit?: number
    offset?: number
  }): MemoryEntry[] {
    let sql = `SELECT * FROM memories WHERE 1=1`
    const params: any[] = []

    if (opts?.type) { sql += ` AND type = ?`; params.push(opts.type) }
    if (opts?.projectId) { sql += ` AND project_id = ?`; params.push(opts.projectId) }
    if (opts?.pinned !== undefined) { sql += ` AND pinned = ?`; params.push(opts.pinned ? 1 : 0) }

    sql += ` ORDER BY pinned DESC, updated_at DESC`

    if (opts?.limit) { sql += ` LIMIT ?`; params.push(opts.limit) }
    if (opts?.offset) { sql += ` OFFSET ?`; params.push(opts.offset) }

    const rows = memoryManager.queryAll(sql, params)
    return rows.map(r => this.rowToEntry(r))
  }

  getTopics(): string[] {
    const rows = memoryManager.queryAll(
      `SELECT DISTINCT topic FROM memories WHERE topic != '' ORDER BY topic`
    )
    return rows.map(r => r.topic)
  }

  // ── Auto-Extraction ─────────────────────────────────────────────────────

  /**
   * Extract memories from a conversation or text block.
   * Uses the LLM to identify key facts, decisions, and preferences.
   */
  async extractFromText(text: string, source: string, projectId?: string): Promise<MemoryEntry[]> {
    try {
      const truncated = text.length > 8000 ? text.slice(-8000) : text
      const response = await callAgentLLM(EXTRACTOR_AGENT, truncated)

      const extracted = this.parseExtractions(response)
      const entries: MemoryEntry[] = []

      for (const mem of extracted) {
        if (mem.confidence < 0.6) continue

        // Check for duplicates
        const existing = this.keywordSearch(mem.content, mem.type, projectId, 1)
        if (existing.length > 0 && existing[0].relevanceScore > 0.9) {
          // Update confidence of existing memory instead
          this.updateMemory(existing[0].id, { confidence: Math.max(existing[0].confidence, mem.confidence) })
          continue
        }

        const entry = await this.addMemory({
          type: mem.type,
          content: mem.content,
          topic: mem.topic,
          source,
          projectId,
          confidence: mem.confidence,
          tags: mem.tags,
        })
        entries.push(entry)
      }

      this.emit('extraction:completed', { source, count: entries.length })
      return entries
    } catch (err) {
      console.error('[SemanticMemory] Extraction failed:', err)
      return []
    }
  }

  private parseExtractions(response: string): ExtractedMemory[] {
    try {
      // Try direct JSON parse
      const parsed = JSON.parse(response)
      if (Array.isArray(parsed)) return parsed

      // Try extracting from markdown code block
      const codeMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeMatch) {
        const inner = JSON.parse(codeMatch[1])
        if (Array.isArray(inner)) return inner
      }

      // Try brace matching
      const braceMatch = response.match(/\[[\s\S]*\]/)
      if (braceMatch) {
        const inner = JSON.parse(braceMatch[0])
        if (Array.isArray(inner)) return inner
      }
    } catch {
      console.warn('[SemanticMemory] Failed to parse extraction response')
    }
    return []
  }

  // ── Context Assembly ────────────────────────────────────────────────────

  /**
   * Build a context block of relevant memories for injection into LLM prompts.
   * Queries by project and/or semantic similarity to the current conversation.
   */
  async buildMemoryContext(opts: {
    query?: string
    projectId?: string
    maxTokens?: number
  }): Promise<string> {
    const maxMemories = MAX_CONTEXT_MEMORIES
    let memories: MemorySearchResult[]

    if (opts.query) {
      memories = await this.search(opts.query, {
        projectId: opts.projectId,
        limit: maxMemories,
        minRelevance: 0.4,
      })
    } else {
      // Get recent + pinned memories for the project
      const recent = this.listMemories({ projectId: opts.projectId, limit: maxMemories })
      memories = recent.map((m, i) => ({ ...m, relevanceScore: 1 - i * 0.1 }))
    }

    if (memories.length === 0) return ''

    const blocks = memories.map(m => {
      const pinLabel = m.pinned ? ' [pinned]' : ''
      const date = new Date(m.createdAt * 1000).toLocaleDateString()
      return `- [${m.type}${pinLabel}] ${m.content} (${m.topic}, ${date})`
    })

    return `## Remembered Context\n${blocks.join('\n')}`
  }

  // ── Statistics ──────────────────────────────────────────────────────────

  getStats(): MemoryStats {
    const total = memoryManager.queryOne(`SELECT COUNT(*) as count FROM memories`)
    const byType = memoryManager.queryAll(`SELECT type, COUNT(*) as count FROM memories GROUP BY type`)
    const byProject = memoryManager.queryAll(`SELECT COALESCE(project_id, 'global') as pid, COUNT(*) as count FROM memories GROUP BY project_id`)
    const oldest = memoryManager.queryOne(`SELECT MIN(created_at) as ts FROM memories`)
    const newest = memoryManager.queryOne(`SELECT MAX(created_at) as ts FROM memories`)
    const embeddings = memoryManager.queryOne(`SELECT COUNT(*) as count FROM memory_embeddings`)

    const typeMap: Record<MemoryType, number> = { fact: 0, preference: 0, decision: 0, code_pattern: 0, context: 0, summary: 0 }
    for (const row of byType) typeMap[row.type as MemoryType] = row.count

    const projectMap: Record<string, number> = {}
    for (const row of byProject) projectMap[row.pid] = row.count

    return {
      totalMemories: total?.count ?? 0,
      byType: typeMap,
      byProject: projectMap,
      oldestMemory: oldest?.ts ?? 0,
      newestMemory: newest?.ts ?? 0,
      totalEmbeddings: embeddings?.count ?? 0,
      embeddingModelAvailable: this.embeddingAvailable,
    }
  }

  // ── Export / Import ─────────────────────────────────────────────────────

  exportMemories(projectId?: string): string {
    const memories = this.listMemories({ projectId, limit: 100000 })
    return JSON.stringify({ version: 1, exportedAt: Date.now(), memories }, null, 2)
  }

  async importMemories(jsonStr: string, projectId?: string): Promise<number> {
    const data = JSON.parse(jsonStr)
    if (!data.memories || !Array.isArray(data.memories)) throw new Error('Invalid memory export format')

    let imported = 0
    for (const m of data.memories) {
      await this.addMemory({
        type: m.type || 'fact',
        content: m.content,
        topic: m.topic || '',
        source: m.source || 'import',
        projectId: projectId || m.projectId,
        confidence: m.confidence ?? 1.0,
        tags: m.tags || [],
        pinned: m.pinned ?? false,
      })
      imported++
    }

    this.emit('import:completed', { count: imported })
    return imported
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private rowToEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      type: row.type as MemoryType,
      content: row.content,
      topic: row.topic || '',
      source: row.source || 'unknown',
      projectId: row.project_id || undefined,
      confidence: row.confidence ?? 1.0,
      pinned: !!row.pinned,
      accessCount: row.access_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAccessedAt: row.last_accessed_at ?? row.created_at,
      tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [],
    }
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────

export const semanticMemory = new SemanticMemory()
