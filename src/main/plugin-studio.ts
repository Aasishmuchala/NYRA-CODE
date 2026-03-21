/**
 * Plugin Studio — Visual plugin manager with registry, install/uninstall, enable/disable
 *
 * SQLite-backed plugin metadata, configuration, and usage tracking.
 * Wraps the existing plugins.ts module with richer metadata and UI-facing queries.
 */

import { memoryManager } from './memory'

// ── Types ────────────────────────────────────────────────────────────────────

interface PluginMeta {
  id: string
  name: string
  version: string
  author: string
  description: string
  homepage?: string
  category: PluginCategory
  enabled: boolean
  installedAt: number
  updatedAt: number
  config: Record<string, unknown>
  rating?: number
  downloads?: number
}

type PluginCategory = 'provider' | 'agent' | 'tool' | 'theme' | 'integration' | 'utility' | 'other'

interface RegistryEntry {
  id: string
  name: string
  version: string
  author: string
  description: string
  category: PluginCategory
  homepage?: string
  rating: number
  downloads: number
  tags: string[]
}

// ── Plugin Studio ────────────────────────────────────────────────────────────

export class PluginStudio {
  private db: any = null

  // ── Built-in registry (simulated — in production this would hit a remote registry)
  private builtinRegistry: RegistryEntry[] = [
    { id: 'nyra-web-search', name: 'Web Search', version: '1.2.0', author: 'Nyra Team', description: 'Search the web from within conversations using multiple engines', category: 'tool', rating: 4.8, downloads: 12400, tags: ['search', 'web', 'browse'], homepage: 'https://github.com/nyra/plugins' },
    { id: 'nyra-code-runner', name: 'Code Runner', version: '2.0.1', author: 'Nyra Team', description: 'Execute code snippets in sandboxed environments (Python, JS, Go, Rust)', category: 'tool', rating: 4.9, downloads: 18200, tags: ['code', 'execute', 'sandbox'] },
    { id: 'nyra-slack-bridge', name: 'Slack Bridge', version: '1.0.3', author: 'Community', description: 'Send and receive Slack messages directly from Nyra', category: 'integration', rating: 4.3, downloads: 5600, tags: ['slack', 'messaging', 'chat'] },
    { id: 'nyra-github-agent', name: 'GitHub Agent', version: '1.1.0', author: 'Community', description: 'Create PRs, review code, manage issues from natural language', category: 'agent', rating: 4.7, downloads: 9800, tags: ['github', 'git', 'code-review'] },
    { id: 'nyra-ollama-models', name: 'Ollama Model Hub', version: '1.0.0', author: 'Nyra Team', description: 'Browse, pull, and manage Ollama models with a visual interface', category: 'provider', rating: 4.5, downloads: 7300, tags: ['ollama', 'models', 'local'] },
    { id: 'nyra-dark-themes', name: 'Theme Pack', version: '2.1.0', author: 'Community', description: 'Collection of 15 premium dark themes for Nyra Desktop', category: 'theme', rating: 4.6, downloads: 11000, tags: ['theme', 'dark', 'ui'] },
    { id: 'nyra-rag-pipeline', name: 'RAG Pipeline', version: '1.3.0', author: 'Nyra Team', description: 'Build and manage retrieval-augmented generation pipelines', category: 'utility', rating: 4.4, downloads: 6200, tags: ['rag', 'retrieval', 'embeddings'] },
    { id: 'nyra-notion-sync', name: 'Notion Sync', version: '1.0.1', author: 'Community', description: 'Bi-directional sync between Nyra knowledge base and Notion', category: 'integration', rating: 4.2, downloads: 3400, tags: ['notion', 'sync', 'knowledge'] },
  ]

  // ── Initialization ────────────────────────────────────────────────────────

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS plugin_studio_plugins (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            version TEXT NOT NULL,
            author TEXT DEFAULT 'Unknown',
            description TEXT DEFAULT '',
            homepage TEXT,
            category TEXT DEFAULT 'other',
            enabled INTEGER DEFAULT 1,
            installedAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL,
            config TEXT DEFAULT '{}'
          )
        `)
        this.db.run(`
          CREATE TABLE IF NOT EXISTS plugin_studio_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pluginId TEXT NOT NULL,
            action TEXT NOT NULL,
            timestamp INTEGER NOT NULL
          )
        `)
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_plugin_usage_ts ON plugin_studio_usage(timestamp)`)
        console.log('[PluginStudio] Initialized')
      }
    } catch (error) {
      console.warn('[PluginStudio] Init error (non-fatal):', error)
    }
  }

  // ── Registry ──────────────────────────────────────────────────────────────

  browseRegistry(query?: string, category?: string): RegistryEntry[] {
    let results = [...this.builtinRegistry]
    if (category && category !== 'all') {
      results = results.filter(r => r.category === category)
    }
    if (query) {
      const q = query.toLowerCase()
      results = results.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.tags.some(t => t.includes(q))
      )
    }
    return results.sort((a, b) => b.downloads - a.downloads)
  }

  // ── Install / Uninstall ───────────────────────────────────────────────────

  install(entry: { id: string; name: string; version: string; author: string; description: string; category: string; homepage?: string }): PluginMeta {
    if (!this.db) throw new Error('DB not initialized')
    const now = Date.now()
    this.db.prepare(`
      INSERT OR REPLACE INTO plugin_studio_plugins (id, name, version, author, description, homepage, category, enabled, installedAt, updatedAt, config)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, '{}')
    `).run(entry.id, entry.name, entry.version, entry.author, entry.description, entry.homepage || null, entry.category, now, now)
    this.recordUsage(entry.id, 'install')
    return this.getPlugin(entry.id)!
  }

  uninstall(pluginId: string): void {
    if (!this.db) return
    this.recordUsage(pluginId, 'uninstall')
    this.db.prepare(`DELETE FROM plugin_studio_plugins WHERE id = ?`).run(pluginId)
  }

  // ── Enable / Disable ──────────────────────────────────────────────────────

  enable(pluginId: string): void {
    if (!this.db) return
    this.db.prepare(`UPDATE plugin_studio_plugins SET enabled = 1, updatedAt = ? WHERE id = ?`).run(Date.now(), pluginId)
    this.recordUsage(pluginId, 'enable')
  }

  disable(pluginId: string): void {
    if (!this.db) return
    this.db.prepare(`UPDATE plugin_studio_plugins SET enabled = 0, updatedAt = ? WHERE id = ?`).run(Date.now(), pluginId)
    this.recordUsage(pluginId, 'disable')
  }

  // ── Configure ─────────────────────────────────────────────────────────────

  setConfig(pluginId: string, config: Record<string, unknown>): void {
    if (!this.db) return
    this.db.prepare(`UPDATE plugin_studio_plugins SET config = ?, updatedAt = ? WHERE id = ?`).run(JSON.stringify(config), Date.now(), pluginId)
  }

  getConfig(pluginId: string): Record<string, unknown> {
    if (!this.db) return {}
    const row = this.db.prepare(`SELECT config FROM plugin_studio_plugins WHERE id = ?`).get(pluginId) as any
    try { return row ? JSON.parse(row.config) : {} } catch { return {} }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getPlugin(pluginId: string): PluginMeta | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM plugin_studio_plugins WHERE id = ?`).get(pluginId) as any
    return row ? this.rowToMeta(row) : null
  }

  listInstalled(): PluginMeta[] {
    if (!this.db) return []
    const rows = this.db.prepare(`SELECT * FROM plugin_studio_plugins ORDER BY installedAt DESC`).all() as any[]
    return rows.map(r => this.rowToMeta(r))
  }

  getStats(): { installed: number; enabled: number; disabled: number; categories: Record<string, number> } {
    if (!this.db) return { installed: 0, enabled: 0, disabled: 0, categories: {} }
    const installed = this.listInstalled()
    const categories: Record<string, number> = {}
    for (const p of installed) {
      categories[p.category] = (categories[p.category] || 0) + 1
    }
    return {
      installed: installed.length,
      enabled: installed.filter(p => p.enabled).length,
      disabled: installed.filter(p => !p.enabled).length,
      categories,
    }
  }

  // ── Usage Tracking ────────────────────────────────────────────────────────

  private recordUsage(pluginId: string, action: string): void {
    try {
      this.db?.prepare(`INSERT INTO plugin_studio_usage (pluginId, action, timestamp) VALUES (?, ?, ?)`).run(pluginId, action, Date.now())
    } catch { /* non-fatal */ }
  }

  getUsageHistory(pluginId: string, days: number = 30): Array<{ action: string; timestamp: number }> {
    if (!this.db) return []
    const cutoff = Date.now() - days * 86400000
    return (this.db.prepare(`SELECT action, timestamp FROM plugin_studio_usage WHERE pluginId = ? AND timestamp > ? ORDER BY timestamp DESC`).all(pluginId, cutoff) as any[])
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private rowToMeta(row: any): PluginMeta {
    let config: Record<string, unknown> = {}
    try { config = JSON.parse(row.config || '{}') } catch { /* ignore */ }
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      author: row.author,
      description: row.description,
      homepage: row.homepage || undefined,
      category: row.category as PluginCategory,
      enabled: !!row.enabled,
      installedAt: row.installedAt,
      updatedAt: row.updatedAt,
      config,
    }
  }
}

export const pluginStudio = new PluginStudio()
