/**
 * RAG Knowledge Stacks — Per-project knowledge bases with chunk & embed
 *
 * Features:
 *   - Ingest: Upload PDFs, markdown, code files, plain text, URLs
 *   - Chunk & embed: Split documents into overlapping chunks, generate embeddings
 *   - Per-project stacks: Each project can have its own knowledge base
 *   - Semantic query: Cosine similarity search across chunks
 *   - Context injection: Return top-K chunks formatted for LLM context
 *
 * Architecture:
 *   KnowledgeStackManager → SQLite (chunks + embeddings)
 *                         → Ollama embeddings API (nomic-embed-text)
 *                         → Fallback: keyword search when embeddings unavailable
 */

import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import { memoryManager } from './memory'
import { OLLAMA_BASE_URL, isOllamaRunning } from './ollama'

// ── Types ────────────────────────────────────────────────────────────────────

export interface KnowledgeStack {
  id: string
  name: string
  projectId: string
  description?: string
  documentCount: number
  chunkCount: number
  totalTokens: number
  createdAt: number
  updatedAt: number
}

export interface KnowledgeDocument {
  id: string
  stackId: string
  fileName: string
  filePath?: string
  fileType: string          // 'markdown' | 'code' | 'text' | 'pdf' | 'url'
  content: string           // original full text
  chunkCount: number
  tokenEstimate: number
  addedAt: number
}

export interface KnowledgeChunk {
  id: string
  documentId: string
  stackId: string
  content: string
  tokenEstimate: number
  chunkIndex: number
  metadata: Record<string, any>  // e.g. { lineStart, lineEnd, heading }
}

export interface ChunkSearchResult extends KnowledgeChunk {
  relevanceScore: number
  documentName: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'nomic-embed-text'
const CHUNK_SIZE = 512           // target tokens per chunk
const CHUNK_OVERLAP = 64         // overlap between chunks
const CHARS_PER_TOKEN = 4        // rough estimate
const MAX_CHUNKS_PER_QUERY = 8
const CHUNK_SIZE_CHARS = CHUNK_SIZE * CHARS_PER_TOKEN
const CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP * CHARS_PER_TOKEN

// ── Knowledge Stack Manager ──────────────────────────────────────────────────

class KnowledgeStackManager extends EventEmitter {
  private initialized = false
  private embeddingAvailable = false

  init(): void {
    if (this.initialized) return

    this.ensureTables()
    this.checkEmbeddingModel().catch(() => {})
    this.initialized = true
    console.log('[KnowledgeStacks] Initialized')
  }

  private ensureTables(): void {
    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS knowledge_stacks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        project_id TEXT NOT NULL,
        description TEXT,
        document_count INTEGER DEFAULT 0,
        chunk_count INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `)

    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY,
        stack_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT,
        file_type TEXT NOT NULL,
        content TEXT NOT NULL,
        chunk_count INTEGER DEFAULT 0,
        token_estimate INTEGER DEFAULT 0,
        added_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (stack_id) REFERENCES knowledge_stacks(id) ON DELETE CASCADE
      )
    `)

    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        stack_id TEXT NOT NULL,
        content TEXT NOT NULL,
        token_estimate INTEGER DEFAULT 0,
        chunk_index INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        FOREIGN KEY (stack_id) REFERENCES knowledge_stacks(id) ON DELETE CASCADE
      )
    `)

    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS knowledge_embeddings (
        chunk_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (chunk_id) REFERENCES knowledge_chunks(id) ON DELETE CASCADE
      )
    `)

    memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_kd_stack ON knowledge_documents(stack_id)`)
    memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_kc_stack ON knowledge_chunks(stack_id)`)
    memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_kc_doc ON knowledge_chunks(document_id)`)
    memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_ks_project ON knowledge_stacks(project_id)`)
  }

  private async checkEmbeddingModel(): Promise<void> {
    try {
      const online = await isOllamaRunning()
      if (!online) { this.embeddingAvailable = false; return }

      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: 'test' }),
        signal: AbortSignal.timeout(10000),
      })
      this.embeddingAvailable = response.ok
      console.log(`[KnowledgeStacks] Embedding model: ${this.embeddingAvailable ? 'available' : 'unavailable'}`)
    } catch {
      this.embeddingAvailable = false
    }
  }

  // ── Stack CRUD ──────────────────────────────────────────────────────────

  createStack(name: string, projectId: string, description?: string): KnowledgeStack {
    const id = `ks-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = Math.floor(Date.now() / 1000)

    memoryManager.run(
      `INSERT INTO knowledge_stacks (id, name, project_id, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, projectId, description || null, now, now]
    )

    const stack: KnowledgeStack = {
      id, name, projectId, description,
      documentCount: 0, chunkCount: 0, totalTokens: 0,
      createdAt: now, updatedAt: now,
    }

    this.emit('stack:created', stack)
    return stack
  }

  getStack(id: string): KnowledgeStack | null {
    const row = memoryManager.queryOne(`SELECT * FROM knowledge_stacks WHERE id = ?`, [id])
    return row ? this.rowToStack(row) : null
  }

  listStacks(projectId?: string): KnowledgeStack[] {
    let sql = `SELECT * FROM knowledge_stacks`
    const params: any[] = []
    if (projectId) { sql += ` WHERE project_id = ?`; params.push(projectId) }
    sql += ` ORDER BY updated_at DESC`
    return memoryManager.queryAll(sql, params).map(r => this.rowToStack(r))
  }

  deleteStack(id: string): boolean {
    const result = memoryManager.run(`DELETE FROM knowledge_stacks WHERE id = ?`, [id])
    if (result.changes > 0) {
      this.emit('stack:deleted', { id })
      return true
    }
    return false
  }

  // ── Document Ingestion ──────────────────────────────────────────────────

  /**
   * Ingest a document into a knowledge stack.
   * Reads the file (or uses provided content), chunks it, and generates embeddings.
   */
  async ingestDocument(stackId: string, opts: {
    filePath?: string
    content?: string
    fileName?: string
    fileType?: string
  }): Promise<KnowledgeDocument> {
    const stack = this.getStack(stackId)
    if (!stack) throw new Error(`Stack not found: ${stackId}`)

    let content = opts.content || ''
    let fileName = opts.fileName || 'untitled'
    let fileType = opts.fileType || 'text'

    // Read from file if path provided
    if (opts.filePath && !content) {
      content = fs.readFileSync(opts.filePath, 'utf-8')
      fileName = path.basename(opts.filePath)
      fileType = this.detectFileType(opts.filePath)
    }

    if (!content.trim()) throw new Error('Empty document content')

    const docId = `kdoc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const tokenEstimate = Math.ceil(content.length / CHARS_PER_TOKEN)

    // Chunk the content
    const chunks = this.chunkContent(content, fileType, fileName)

    // Store document
    memoryManager.run(
      `INSERT INTO knowledge_documents (id, stack_id, file_name, file_path, file_type, content, chunk_count, token_estimate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [docId, stackId, fileName, opts.filePath || null, fileType, content, chunks.length, tokenEstimate]
    )

    // Store chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const chunkId = `kchk-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 4)}`
      const chunkTokens = Math.ceil(chunk.content.length / CHARS_PER_TOKEN)

      memoryManager.run(
        `INSERT INTO knowledge_chunks (id, document_id, stack_id, content, token_estimate, chunk_index, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [chunkId, docId, stackId, chunk.content, chunkTokens, i, JSON.stringify(chunk.metadata)]
      )

      // Generate embedding in background
      if (this.embeddingAvailable) {
        this.generateAndStoreEmbedding(chunkId, chunk.content).catch(() => {})
      }
    }

    // Update stack counters
    memoryManager.run(
      `UPDATE knowledge_stacks SET
         document_count = document_count + 1,
         chunk_count = chunk_count + ?,
         total_tokens = total_tokens + ?,
         updated_at = unixepoch()
       WHERE id = ?`,
      [chunks.length, tokenEstimate, stackId]
    )

    const doc: KnowledgeDocument = {
      id: docId, stackId, fileName, filePath: opts.filePath,
      fileType, content, chunkCount: chunks.length, tokenEstimate,
      addedAt: Math.floor(Date.now() / 1000),
    }

    this.emit('document:ingested', { stackId, documentId: docId, fileName, chunks: chunks.length })
    return doc
  }

  removeDocument(docId: string): boolean {
    const doc = memoryManager.queryOne(`SELECT stack_id, chunk_count, token_estimate FROM knowledge_documents WHERE id = ?`, [docId])
    if (!doc) return false

    memoryManager.run(`DELETE FROM knowledge_documents WHERE id = ?`, [docId])

    // Update stack counters
    memoryManager.run(
      `UPDATE knowledge_stacks SET
         document_count = MAX(0, document_count - 1),
         chunk_count = MAX(0, chunk_count - ?),
         total_tokens = MAX(0, total_tokens - ?),
         updated_at = unixepoch()
       WHERE id = ?`,
      [doc.chunk_count, doc.token_estimate, doc.stack_id]
    )

    this.emit('document:removed', { documentId: docId, stackId: doc.stack_id })
    return true
  }

  listDocuments(stackId: string): KnowledgeDocument[] {
    return memoryManager.queryAll(
      `SELECT id, stack_id, file_name, file_path, file_type, chunk_count, token_estimate, added_at
       FROM knowledge_documents WHERE stack_id = ? ORDER BY added_at DESC`, [stackId]
    ).map(r => ({
      id: r.id, stackId: r.stack_id, fileName: r.file_name, filePath: r.file_path,
      fileType: r.file_type, content: '', chunkCount: r.chunk_count,
      tokenEstimate: r.token_estimate, addedAt: r.added_at,
    }))
  }

  // ── Semantic Query ──────────────────────────────────────────────────────

  /**
   * Search across a knowledge stack for chunks relevant to a query.
   * Uses embedding similarity if available, else keyword search.
   */
  async query(stackId: string, queryText: string, opts?: {
    limit?: number
    minRelevance?: number
  }): Promise<ChunkSearchResult[]> {
    const limit = opts?.limit ?? MAX_CHUNKS_PER_QUERY
    const minRelevance = opts?.minRelevance ?? 0.3

    // Try semantic search
    if (this.embeddingAvailable) {
      const queryEmbedding = await this.generateEmbedding(queryText)
      if (queryEmbedding) {
        return this.semanticQuery(stackId, queryEmbedding, limit, minRelevance)
      }
    }

    // Fallback to keyword search
    return this.keywordQuery(stackId, queryText, limit)
  }

  /**
   * Query across ALL stacks for a project
   */
  async queryProject(projectId: string, queryText: string, opts?: {
    limit?: number
  }): Promise<ChunkSearchResult[]> {
    const stacks = this.listStacks(projectId)
    const allResults: ChunkSearchResult[] = []

    for (const stack of stacks) {
      const results = await this.query(stack.id, queryText, { limit: opts?.limit ?? 4 })
      allResults.push(...results)
    }

    // Sort by relevance and limit
    allResults.sort((a, b) => b.relevanceScore - a.relevanceScore)
    return allResults.slice(0, opts?.limit ?? MAX_CHUNKS_PER_QUERY)
  }

  /**
   * Build a context block from query results for LLM injection.
   */
  async buildRAGContext(projectId: string, query: string, opts?: {
    maxTokens?: number
  }): Promise<string> {
    const maxTokens = opts?.maxTokens ?? 4000
    const results = await this.queryProject(projectId, query, { limit: 12 })

    if (results.length === 0) return ''

    const blocks: string[] = ['## Knowledge Base Context']
    let tokensUsed = 0

    for (const chunk of results) {
      const chunkTokens = chunk.tokenEstimate
      if (tokensUsed + chunkTokens > maxTokens) break

      blocks.push(`\n### From: ${chunk.documentName} (relevance: ${(chunk.relevanceScore * 100).toFixed(0)}%)`)
      blocks.push(chunk.content)
      tokensUsed += chunkTokens
    }

    return blocks.join('\n')
  }

  // ── Private: Chunking ───────────────────────────────────────────────────

  private chunkContent(content: string, fileType: string, fileName: string): Array<{ content: string; metadata: Record<string, any> }> {
    const chunks: Array<{ content: string; metadata: Record<string, any> }> = []

    if (fileType === 'markdown') {
      // Chunk by headings for markdown
      const sections = content.split(/(?=^#{1,3}\s)/m)
      for (const section of sections) {
        if (!section.trim()) continue
        const headingMatch = section.match(/^(#{1,3})\s+(.+)/)
        const heading = headingMatch?.[2] || ''

        if (section.length <= CHUNK_SIZE_CHARS) {
          chunks.push({ content: section.trim(), metadata: { heading, fileName } })
        } else {
          // Sub-chunk large sections
          const subChunks = this.splitBySize(section, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS)
          for (const sc of subChunks) {
            chunks.push({ content: sc.trim(), metadata: { heading, fileName } })
          }
        }
      }
    } else if (fileType === 'code') {
      // Chunk by function/class boundaries for code
      const lines = content.split('\n')
      let currentChunk: string[] = []
      let lineStart = 0

      for (let i = 0; i < lines.length; i++) {
        currentChunk.push(lines[i])
        const currentText = currentChunk.join('\n')

        if (currentText.length >= CHUNK_SIZE_CHARS) {
          chunks.push({
            content: currentText.trim(),
            metadata: { lineStart, lineEnd: i, fileName },
          })
          // Overlap: keep last few lines
          const overlapLines = Math.ceil(CHUNK_OVERLAP_CHARS / 80)
          currentChunk = currentChunk.slice(-overlapLines)
          lineStart = i - overlapLines + 1
        }
      }

      // Remaining lines
      if (currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.join('\n').trim(),
          metadata: { lineStart, lineEnd: lines.length - 1, fileName },
        })
      }
    } else {
      // Generic: split by paragraph boundaries with overlap
      const subChunks = this.splitBySize(content, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS)
      for (const sc of subChunks) {
        chunks.push({ content: sc.trim(), metadata: { fileName } })
      }
    }

    return chunks.filter(c => c.content.length > 20) // Skip tiny chunks
  }

  private splitBySize(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = []
    let start = 0

    while (start < text.length) {
      let end = start + chunkSize

      // Try to break at paragraph or sentence boundary
      if (end < text.length) {
        const paragraphBreak = text.lastIndexOf('\n\n', end)
        if (paragraphBreak > start + chunkSize * 0.5) end = paragraphBreak

        const sentenceBreak = text.lastIndexOf('. ', end)
        if (sentenceBreak > start + chunkSize * 0.5 && sentenceBreak > (paragraphBreak || 0)) end = sentenceBreak + 1
      }

      chunks.push(text.slice(start, end))
      start = end - overlap
    }

    return chunks
  }

  // ── Private: Embeddings ─────────────────────────────────────────────────

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
      return data.embedding ? new Float32Array(data.embedding) : null
    } catch {
      return null
    }
  }

  private async generateAndStoreEmbedding(chunkId: string, content: string): Promise<void> {
    const embedding = await this.generateEmbedding(content)
    if (embedding) {
      const buffer = Buffer.from(embedding.buffer)
      memoryManager.run(
        `INSERT OR REPLACE INTO knowledge_embeddings (chunk_id, embedding, model) VALUES (?, ?, ?)`,
        [chunkId, buffer, EMBEDDING_MODEL]
      )
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

  private semanticQuery(stackId: string, queryEmbedding: Float32Array, limit: number, minRelevance: number): ChunkSearchResult[] {
    const rows = memoryManager.queryAll(`
      SELECT kc.*, ke.embedding, kd.file_name as doc_name
      FROM knowledge_chunks kc
      JOIN knowledge_embeddings ke ON ke.chunk_id = kc.id
      JOIN knowledge_documents kd ON kd.id = kc.document_id
      WHERE kc.stack_id = ?
    `, [stackId])

    const results: ChunkSearchResult[] = []

    for (const row of rows) {
      const embedding = new Float32Array(new Uint8Array(row.embedding).buffer)
      const similarity = this.cosineSimilarity(queryEmbedding, embedding)

      if (similarity >= minRelevance) {
        results.push({
          id: row.id,
          documentId: row.document_id,
          stackId: row.stack_id,
          content: row.content,
          tokenEstimate: row.token_estimate,
          chunkIndex: row.chunk_index,
          metadata: row.metadata ? JSON.parse(row.metadata) : {},
          relevanceScore: Math.round(similarity * 1000) / 1000,
          documentName: row.doc_name,
        })
      }
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore)
    return results.slice(0, limit)
  }

  private keywordQuery(stackId: string, query: string, limit: number): ChunkSearchResult[] {
    const rows = memoryManager.queryAll(`
      SELECT kc.*, kd.file_name as doc_name
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.id = kc.document_id
      WHERE kc.stack_id = ? AND kc.content LIKE ?
      ORDER BY kc.chunk_index
      LIMIT ?
    `, [stackId, `%${query}%`, limit])

    return rows.map((row, i) => ({
      id: row.id,
      documentId: row.document_id,
      stackId: row.stack_id,
      content: row.content,
      tokenEstimate: row.token_estimate,
      chunkIndex: row.chunk_index,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      relevanceScore: 1 - (i * 0.05),
      documentName: row.doc_name,
    }))
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private detectFileType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.rb', '.swift', '.kt']
    const mdExts = ['.md', '.mdx', '.markdown']
    if (mdExts.includes(ext)) return 'markdown'
    if (codeExts.includes(ext)) return 'code'
    if (ext === '.pdf') return 'pdf'
    return 'text'
  }

  private rowToStack(row: any): KnowledgeStack {
    return {
      id: row.id,
      name: row.name,
      projectId: row.project_id,
      description: row.description,
      documentCount: row.document_count ?? 0,
      chunkCount: row.chunk_count ?? 0,
      totalTokens: row.total_tokens ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────

export const knowledgeStacks = new KnowledgeStackManager()
