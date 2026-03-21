/**
 * Theme Engine — Full theme editor with custom palettes, live preview, import/export
 *
 * Stores themes in SQLite. Ships with 6 built-in themes.
 */

import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

interface ThemePalette {
  primary: string
  secondary: string
  accent: string
  success: string
  warning: string
  danger: string
  surface: string
  surfaceAlt: string
  border: string
  text: string
  textMuted: string
  textDim: string
}

interface ThemeConfig {
  id: string
  name: string
  description: string
  palette: ThemePalette
  fontFamily: string
  fontSize: number        // base px
  borderRadius: number    // base px
  isBuiltin: boolean
  isActive: boolean
  createdAt: number
  updatedAt: number
}

// ── Theme Engine ─────────────────────────────────────────────────────────────

export class ThemeEngine {
  private db: any = null

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS theme_configs (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
            palette TEXT NOT NULL, fontFamily TEXT DEFAULT 'Inter',
            fontSize INTEGER DEFAULT 13, borderRadius INTEGER DEFAULT 8,
            isBuiltin INTEGER DEFAULT 0, isActive INTEGER DEFAULT 0,
            createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)`)
        run(`CREATE INDEX IF NOT EXISTS idx_theme_active ON theme_configs(isActive)`)

        const count = (this.db.prepare(`SELECT COUNT(*) as c FROM theme_configs`).get() as any)?.c || 0
        if (count === 0) this.seedBuiltinThemes()

        console.log('[ThemeEngine] Initialized')
      }
    } catch (error) {
      console.warn('[ThemeEngine] Init error (non-fatal):', error)
    }
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  createTheme(name: string, palette: ThemePalette, opts?: { description?: string; fontFamily?: string; fontSize?: number; borderRadius?: number }): ThemeConfig {
    if (!this.db) throw new Error('DB not initialized')
    const id = randomUUID()
    const now = Date.now()
    this.db.prepare(`INSERT INTO theme_configs (id, name, description, palette, fontFamily, fontSize, borderRadius, isBuiltin, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`)
      .run(id, name, opts?.description || '', JSON.stringify(palette), opts?.fontFamily || 'Inter', opts?.fontSize || 13, opts?.borderRadius || 8, now, now)
    return this.getTheme(id)!
  }

  updateTheme(id: string, updates: Partial<{ name: string; description: string; palette: ThemePalette; fontFamily: string; fontSize: number; borderRadius: number }>): ThemeConfig | null {
    if (!this.db) return null
    const existing = this.getTheme(id)
    if (!existing || existing.isBuiltin) return null
    const sets: string[] = []
    const vals: any[] = []
    if (updates.name) { sets.push('name = ?'); vals.push(updates.name) }
    if (updates.description !== undefined) { sets.push('description = ?'); vals.push(updates.description) }
    if (updates.palette) { sets.push('palette = ?'); vals.push(JSON.stringify(updates.palette)) }
    if (updates.fontFamily) { sets.push('fontFamily = ?'); vals.push(updates.fontFamily) }
    if (updates.fontSize) { sets.push('fontSize = ?'); vals.push(updates.fontSize) }
    if (updates.borderRadius !== undefined) { sets.push('borderRadius = ?'); vals.push(updates.borderRadius) }
    if (sets.length === 0) return existing
    sets.push('updatedAt = ?'); vals.push(Date.now())
    vals.push(id)
    this.db.prepare(`UPDATE theme_configs SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return this.getTheme(id)
  }

  deleteTheme(id: string): void {
    if (!this.db) return
    const theme = this.getTheme(id)
    if (!theme || theme.isBuiltin) return
    this.db.prepare(`DELETE FROM theme_configs WHERE id = ? AND isBuiltin = 0`).run(id)
  }

  // ── Activate ────────────────────────────────────────────────────────────────

  activateTheme(id: string): ThemeConfig | null {
    if (!this.db) return null
    this.db.prepare(`UPDATE theme_configs SET isActive = 0`).run()
    this.db.prepare(`UPDATE theme_configs SET isActive = 1 WHERE id = ?`).run(id)
    return this.getTheme(id)
  }

  getActiveTheme(): ThemeConfig | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM theme_configs WHERE isActive = 1 LIMIT 1`).get() as any
    return row ? this.rowToTheme(row) : null
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  getTheme(id: string): ThemeConfig | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM theme_configs WHERE id = ?`).get(id) as any
    return row ? this.rowToTheme(row) : null
  }

  listThemes(): ThemeConfig[] {
    if (!this.db) return []
    const rows = this.db.prepare(`SELECT * FROM theme_configs ORDER BY isBuiltin DESC, createdAt ASC`).all() as any[]
    return rows.map(r => this.rowToTheme(r))
  }

  // ── Import / Export ─────────────────────────────────────────────────────────

  exportTheme(id: string): string | null {
    const theme = this.getTheme(id)
    if (!theme) return null
    return JSON.stringify({ name: theme.name, description: theme.description, palette: theme.palette, fontFamily: theme.fontFamily, fontSize: theme.fontSize, borderRadius: theme.borderRadius }, null, 2)
  }

  importTheme(json: string): ThemeConfig | null {
    try {
      const data = JSON.parse(json)
      if (!data.name || !data.palette) return null
      return this.createTheme(data.name, data.palette, { description: data.description, fontFamily: data.fontFamily, fontSize: data.fontSize, borderRadius: data.borderRadius })
    } catch { return null }
  }

  // ── CSS Generation ──────────────────────────────────────────────────────────

  generateCSS(themeId?: string): string {
    const theme = themeId ? this.getTheme(themeId) : this.getActiveTheme()
    if (!theme) return ''
    const p = theme.palette
    return `:root {
  --nyra-primary: ${p.primary};
  --nyra-secondary: ${p.secondary};
  --nyra-accent: ${p.accent};
  --nyra-success: ${p.success};
  --nyra-warning: ${p.warning};
  --nyra-danger: ${p.danger};
  --nyra-surface: ${p.surface};
  --nyra-surface-alt: ${p.surfaceAlt};
  --nyra-border: ${p.border};
  --nyra-text: ${p.text};
  --nyra-text-muted: ${p.textMuted};
  --nyra-text-dim: ${p.textDim};
  --nyra-font: '${theme.fontFamily}', system-ui, sans-serif;
  --nyra-font-size: ${theme.fontSize}px;
  --nyra-radius: ${theme.borderRadius}px;
}`
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private rowToTheme(row: any): ThemeConfig {
    return {
      id: row.id, name: row.name, description: row.description || '',
      palette: JSON.parse(row.palette), fontFamily: row.fontFamily || 'Inter',
      fontSize: row.fontSize || 13, borderRadius: row.borderRadius ?? 8,
      isBuiltin: row.isBuiltin === 1, isActive: row.isActive === 1,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    }
  }

  private seedBuiltinThemes(): void {
    const builtins: Array<{ name: string; description: string; palette: ThemePalette }> = [
      {
        name: 'Nyra Default', description: 'Warm earth tones — the signature look',
        palette: { primary: '#C4956A', secondary: '#D4A574', accent: '#A8C5A0', success: '#8FB88A', warning: '#D4A574', danger: '#C97B7B', surface: '#0D0B09', surfaceAlt: '#161411', border: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.85)', textMuted: 'rgba(255,255,255,0.50)', textDim: 'rgba(255,255,255,0.20)' },
      },
      {
        name: 'Midnight Blue', description: 'Deep ocean depths with cyan accents',
        palette: { primary: '#60A5FA', secondary: '#818CF8', accent: '#34D399', success: '#34D399', warning: '#FBBF24', danger: '#F87171', surface: '#0B0E14', surfaceAlt: '#111827', border: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.90)', textMuted: 'rgba(255,255,255,0.55)', textDim: 'rgba(255,255,255,0.25)' },
      },
      {
        name: 'Forest', description: 'Deep greens and natural wood tones',
        palette: { primary: '#6EE7B7', secondary: '#A7F3D0', accent: '#FCD34D', success: '#86EFAC', warning: '#FDE68A', danger: '#FCA5A5', surface: '#0A120E', surfaceAlt: '#111F17', border: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.88)', textMuted: 'rgba(255,255,255,0.52)', textDim: 'rgba(255,255,255,0.22)' },
      },
      {
        name: 'Sunset', description: 'Warm oranges and purples at dusk',
        palette: { primary: '#FB923C', secondary: '#C084FC', accent: '#F472B6', success: '#4ADE80', warning: '#FACC15', danger: '#EF4444', surface: '#120B0E', surfaceAlt: '#1C1015', border: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.87)', textMuted: 'rgba(255,255,255,0.50)', textDim: 'rgba(255,255,255,0.20)' },
      },
      {
        name: 'Monochrome', description: 'Clean grayscale — zero distraction',
        palette: { primary: '#A3A3A3', secondary: '#737373', accent: '#D4D4D4', success: '#86EFAC', warning: '#FDE68A', danger: '#FCA5A5', surface: '#0A0A0A', surfaceAlt: '#141414', border: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.85)', textMuted: 'rgba(255,255,255,0.45)', textDim: 'rgba(255,255,255,0.18)' },
      },
      {
        name: 'Cyberpunk', description: 'Neon pink and electric cyan on black',
        palette: { primary: '#F472B6', secondary: '#22D3EE', accent: '#A78BFA', success: '#4ADE80', warning: '#FDE047', danger: '#EF4444', surface: '#09090B', surfaceAlt: '#18181B', border: 'rgba(255,255,255,0.10)', text: 'rgba(255,255,255,0.92)', textMuted: 'rgba(255,255,255,0.55)', textDim: 'rgba(255,255,255,0.25)' },
      },
    ]

    const now = Date.now()
    for (const t of builtins) {
      const id = randomUUID()
      this.db.prepare(`INSERT INTO theme_configs (id, name, description, palette, fontFamily, fontSize, borderRadius, isBuiltin, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'Inter', 13, 8, 1, ?, ?, ?)`)
        .run(id, t.name, t.description, JSON.stringify(t.palette), t.name === 'Nyra Default' ? 1 : 0, now, now)
    }
  }
}

export const themeEngine = new ThemeEngine()
