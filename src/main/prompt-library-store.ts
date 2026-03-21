/**
 * Prompt Library Store — Save, organize, tag, and retrieve reusable prompts
 *
 * SQLite-backed with variable interpolation support ({{variable}} syntax).
 * Supports categories, tags, favorites, and usage tracking.
 */

import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

interface PromptEntry {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  variables: string[]
  favorite: boolean
  useCount: number
  createdAt: number
  updatedAt: number
}

// ── Prompt Library Store ─────────────────────────────────────────────────────

export class PromptLibraryStore {
  private db: any = null

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS prompt_library (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT DEFAULT 'general',
            tags TEXT DEFAULT '[]',
            favorite INTEGER DEFAULT 0,
            useCount INTEGER DEFAULT 0,
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL
          )
        `)
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_lib_cat ON prompt_library(category)`)
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_lib_fav ON prompt_library(favorite)`)

        const count = (this.db.prepare(`SELECT COUNT(*) as c FROM prompt_library`).get() as any)?.c || 0
        if (count === 0) this.seedDefaults()

        console.log('[PromptLibraryStore] Initialized')
      }
    } catch (error) {
      console.warn('[PromptLibraryStore] Init error (non-fatal):', error)
    }
  }

  create(title: string, content: string, category: string = 'general', tags: string[] = []): PromptEntry {
    if (!this.db) throw new Error('DB not initialized')
    const id = randomUUID()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO prompt_library (id, title, content, category, tags, favorite, useCount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).run(id, title, content, category, JSON.stringify(tags), now, now)
    return this.get(id)!
  }

  update(id: string, updates: { title?: string; content?: string; category?: string; tags?: string[] }): PromptEntry | null {
    if (!this.db) return null
    const existing = this.get(id)
    if (!existing) return null
    const title = updates.title ?? existing.title
    const content = updates.content ?? existing.content
    const category = updates.category ?? existing.category
    const tags = updates.tags ?? existing.tags
    this.db.prepare(`
      UPDATE prompt_library SET title = ?, content = ?, category = ?, tags = ?, updatedAt = ? WHERE id = ?
    `).run(title, content, category, JSON.stringify(tags), Date.now(), id)
    return this.get(id)
  }

  delete(id: string): void {
    if (!this.db) return
    this.db.prepare(`DELETE FROM prompt_library WHERE id = ?`).run(id)
  }

  get(id: string): PromptEntry | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM prompt_library WHERE id = ?`).get(id) as any
    return row ? this.rowToEntry(row) : null
  }

  list(opts?: { category?: string; favorite?: boolean; search?: string; limit?: number }): PromptEntry[] {
    if (!this.db) return []
    let sql = `SELECT * FROM prompt_library WHERE 1=1`
    const params: (string | number)[] = []

    if (opts?.category && opts.category !== 'all') {
      sql += ` AND category = ?`
      params.push(opts.category)
    }
    if (opts?.favorite) {
      sql += ` AND favorite = 1`
    }
    if (opts?.search) {
      sql += ` AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)`
      const q = `%${opts.search}%`
      params.push(q, q, q)
    }
    sql += ` ORDER BY favorite DESC, updatedAt DESC`
    if (opts?.limit) {
      sql += ` LIMIT ?`
      params.push(opts.limit)
    }

    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map(r => this.rowToEntry(r))
  }

  getCategories(): string[] {
    if (!this.db) return []
    const rows = this.db.prepare(`SELECT DISTINCT category FROM prompt_library ORDER BY category`).all() as any[]
    return rows.map(r => r.category)
  }

  toggleFavorite(id: string): boolean {
    if (!this.db) return false
    const entry = this.get(id)
    if (!entry) return false
    const newVal = entry.favorite ? 0 : 1
    this.db.prepare(`UPDATE prompt_library SET favorite = ?, updatedAt = ? WHERE id = ?`).run(newVal, Date.now(), id)
    return !!newVal
  }

  recordUse(id: string): void {
    if (!this.db) return
    this.db.prepare(`UPDATE prompt_library SET useCount = useCount + 1, updatedAt = ? WHERE id = ?`).run(Date.now(), id)
  }

  interpolate(content: string, variables: Record<string, string>): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match
    })
  }

  getStats(): { total: number; favorites: number; categories: number; totalUses: number } {
    if (!this.db) return { total: 0, favorites: 0, categories: 0, totalUses: 0 }
    const total = (this.db.prepare(`SELECT COUNT(*) as c FROM prompt_library`).get() as any)?.c || 0
    const favorites = (this.db.prepare(`SELECT COUNT(*) as c FROM prompt_library WHERE favorite = 1`).get() as any)?.c || 0
    const categories = (this.db.prepare(`SELECT COUNT(DISTINCT category) as c FROM prompt_library`).get() as any)?.c || 0
    const totalUses = (this.db.prepare(`SELECT SUM(useCount) as s FROM prompt_library`).get() as any)?.s || 0
    return { total, favorites, categories, totalUses }
  }

  private extractVariables(content: string): string[] {
    const matches = content.match(/\{\{(\w+)\}\}/g)
    if (!matches) return []
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))]
  }

  private rowToEntry(row: any): PromptEntry {
    let tags: string[] = []
    try { tags = JSON.parse(row.tags || '[]') } catch { /* ignore */ }
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      tags,
      variables: this.extractVariables(row.content),
      favorite: !!row.favorite,
      useCount: row.useCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private seedDefaults(): void {
    const defaults = [
      { title: 'Code Review', content: 'Review this code for bugs, performance issues, and best practices:\n\n```{{language}}\n{{code}}\n```\n\nFocus on: security, readability, and edge cases.', category: 'development', tags: ['code', 'review'] },
      { title: 'Explain Like I\'m 5', content: 'Explain {{topic}} in simple terms that a 5-year-old could understand. Use analogies and examples.', category: 'learning', tags: ['explain', 'simple'] },
      { title: 'Email Draft', content: 'Draft a {{tone}} email to {{recipient}} about {{subject}}.\n\nKey points:\n- {{point1}}\n- {{point2}}\n\nKeep it concise and professional.', category: 'writing', tags: ['email', 'draft'] },
      { title: 'Debug Helper', content: 'I\'m getting this error:\n\n```\n{{error}}\n```\n\nIn this code:\n```{{language}}\n{{code}}\n```\n\nHelp me understand and fix it.', category: 'development', tags: ['debug', 'error'] },
      { title: 'Meeting Summary', content: 'Summarize the following meeting notes into:\n1. Key decisions made\n2. Action items (with owners)\n3. Follow-ups needed\n\nNotes:\n{{notes}}', category: 'productivity', tags: ['meeting', 'summary'] },
      { title: 'Refactor Plan', content: 'Create a refactoring plan for this {{language}} code:\n\n```{{language}}\n{{code}}\n```\n\nGoals: improve readability, reduce complexity, follow {{pattern}} patterns.', category: 'development', tags: ['refactor', 'plan'] },
    ]
    for (const d of defaults) {
      this.create(d.title, d.content, d.category, d.tags)
    }
  }
}

export const promptLibraryStore = new PromptLibraryStore()
