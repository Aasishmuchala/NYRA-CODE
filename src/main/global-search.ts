/**
 * Global Search — Cross-module search across messages, tasks, prompts, files, themes, tests
 */
import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

interface SearchResult {
  id: string
  type: 'message' | 'task' | 'prompt' | 'file' | 'theme' | 'ab-test' | 'diff' | 'plugin' | 'voice'
  title: string
  snippet: string
  score: number
  metadata: Record<string, any>
  timestamp: number
}

interface SearchQuery {
  query: string
  types?: string[]
  limit?: number
  offset?: number
  dateFrom?: number
  dateTo?: number
}

export class GlobalSearch {
  private db: any = null

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS search_history (
          id TEXT PRIMARY KEY, query TEXT NOT NULL, resultCount INTEGER DEFAULT 0,
          types TEXT, timestamp INTEGER NOT NULL)`)
        run(`CREATE INDEX IF NOT EXISTS idx_search_ts ON search_history(timestamp)`)
        console.log('[GlobalSearch] Initialized')
      }
    } catch (error) {
      console.warn('[GlobalSearch] Init error (non-fatal):', error)
    }
  }

  search(params: SearchQuery): { results: SearchResult[]; total: number; queryId: string } {
    if (!this.db) return { results: [], total: 0, queryId: '' }
    const q = params.query.toLowerCase().trim()
    if (!q) return { results: [], total: 0, queryId: '' }

    const limit = params.limit || 50
    const offset = params.offset || 0
    const types = params.types || ['message', 'task', 'prompt', 'file', 'theme', 'ab-test', 'diff', 'plugin', 'voice']
    const results: SearchResult[] = []

    // Search messages
    if (types.includes('message')) {
      try {
        const rows = this.db.prepare(`SELECT id, role, content, timestamp FROM messages WHERE content LIKE ? ORDER BY timestamp DESC LIMIT 20`).all(`%${q}%`) as any[]
        for (const r of rows) {
          const content = String(r.content || '')
          const idx = content.toLowerCase().indexOf(q)
          const start = Math.max(0, idx - 40)
          const snippet = content.slice(start, start + 120)
          results.push({ id: r.id, type: 'message', title: `${r.role} message`, snippet, score: 1, metadata: { role: r.role }, timestamp: r.timestamp })
        }
      } catch {}
    }

    // Search tasks
    if (types.includes('task')) {
      try {
        const rows = this.db.prepare(`SELECT id, title, description, status, priority, createdAt FROM task_board WHERE title LIKE ? OR description LIKE ? ORDER BY createdAt DESC LIMIT 20`).all(`%${q}%`, `%${q}%`) as any[]
        for (const r of rows) {
          results.push({ id: r.id, type: 'task', title: r.title, snippet: (r.description || '').slice(0, 120), score: 1, metadata: { status: r.status, priority: r.priority }, timestamp: r.createdAt })
        }
      } catch {}
    }

    // Search prompts
    if (types.includes('prompt')) {
      try {
        const rows = this.db.prepare(`SELECT id, title, content, category, createdAt FROM prompt_library WHERE title LIKE ? OR content LIKE ? ORDER BY createdAt DESC LIMIT 20`).all(`%${q}%`, `%${q}%`) as any[]
        for (const r of rows) {
          results.push({ id: r.id, type: 'prompt', title: r.title, snippet: (r.content || '').slice(0, 120), score: 1, metadata: { category: r.category }, timestamp: r.createdAt })
        }
      } catch {}
    }

    // Search files
    if (types.includes('file')) {
      try {
        const rows = this.db.prepare(`SELECT id, originalName, mimeType, category, createdAt FROM file_attachments WHERE originalName LIKE ? ORDER BY createdAt DESC LIMIT 20`).all(`%${q}%`) as any[]
        for (const r of rows) {
          results.push({ id: r.id, type: 'file', title: r.originalName, snippet: `${r.mimeType} — ${r.category}`, score: 1, metadata: { mimeType: r.mimeType, category: r.category }, timestamp: r.createdAt })
        }
      } catch {}
    }

    // Search themes
    if (types.includes('theme')) {
      try {
        const rows = this.db.prepare(`SELECT id, name, description, createdAt FROM theme_configs WHERE name LIKE ? OR description LIKE ? ORDER BY createdAt DESC LIMIT 10`).all(`%${q}%`, `%${q}%`) as any[]
        for (const r of rows) {
          results.push({ id: r.id, type: 'theme', title: r.name, snippet: r.description || '', score: 1, metadata: {}, timestamp: r.createdAt })
        }
      } catch {}
    }

    // Search A/B tests
    if (types.includes('ab-test')) {
      try {
        const rows = this.db.prepare(`SELECT id, name, prompt, createdAt FROM ab_tests WHERE name LIKE ? OR prompt LIKE ? ORDER BY createdAt DESC LIMIT 10`).all(`%${q}%`, `%${q}%`) as any[]
        for (const r of rows) {
          results.push({ id: r.id, type: 'ab-test', title: r.name, snippet: (r.prompt || '').slice(0, 120), score: 1, metadata: {}, timestamp: r.createdAt })
        }
      } catch {}
    }

    // Search plugins
    if (types.includes('plugin')) {
      try {
        const rows = this.db.prepare(`SELECT id, name, description, installedAt FROM plugin_studio_plugins WHERE name LIKE ? OR description LIKE ? ORDER BY installedAt DESC LIMIT 10`).all(`%${q}%`, `%${q}%`) as any[]
        for (const r of rows) {
          results.push({ id: r.id, type: 'plugin', title: r.name, snippet: (r.description || '').slice(0, 120), score: 1, metadata: {}, timestamp: r.installedAt })
        }
      } catch {}
    }

    // Sort by timestamp desc
    results.sort((a, b) => b.timestamp - a.timestamp)
    const total = results.length
    const paged = results.slice(offset, offset + limit)

    // Record search
    const queryId = randomUUID()
    try {
      this.db.prepare(`INSERT INTO search_history (id, query, resultCount, types, timestamp) VALUES (?, ?, ?, ?, ?)`)
        .run(queryId, q, total, JSON.stringify(types), Date.now())
    } catch {}

    return { results: paged, total, queryId }
  }

  getSearchHistory(limit: number = 20): Array<{ id: string; query: string; resultCount: number; timestamp: number }> {
    if (!this.db) return []
    try {
      return this.db.prepare(`SELECT id, query, resultCount, timestamp FROM search_history ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[]
    } catch { return [] }
  }

  clearHistory(): void {
    if (!this.db) return
    try { this.db.prepare(`DELETE FROM search_history`).run() } catch {}
  }

  getStats(): { totalSearches: number; topQueries: Array<{ query: string; count: number }> } {
    if (!this.db) return { totalSearches: 0, topQueries: [] }
    try {
      const total = (this.db.prepare(`SELECT COUNT(*) as c FROM search_history`).get() as any)?.c || 0
      const top = this.db.prepare(`SELECT query, COUNT(*) as count FROM search_history GROUP BY query ORDER BY count DESC LIMIT 10`).all() as any[]
      return { totalSearches: total, topQueries: top }
    } catch { return { totalSearches: 0, topQueries: [] } }
  }
}

export const globalSearch = new GlobalSearch()
