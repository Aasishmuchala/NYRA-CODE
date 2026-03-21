/**
 * Workspace Export — Export/import full workspace state (sessions, prompts, tasks, themes, settings)
 */
import { memoryManager } from './memory'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

interface ExportManifest {
  id: string
  version: string
  exportedAt: number
  tables: string[]
  rowCounts: Record<string, number>
}

interface ExportResult {
  manifest: ExportManifest
  filePath: string
  sizeBytes: number
}

interface ImportResult {
  success: boolean
  tablesImported: string[]
  rowsImported: Record<string, number>
  errors: string[]
}

const EXPORTABLE_TABLES = [
  'prompt_library', 'task_board', 'theme_configs', 'ab_tests', 'ab_variants',
  'plugin_studio_plugins', 'search_history', 'activity_feed',
  'api_playground_presets', 'voice_settings',
]

/** Allowlist Set for O(1) table-name validation — prevents SQL injection via interpolation */
const ALLOWED_TABLE_SET = new Set(EXPORTABLE_TABLES)

/** Validate identifier (table/column name) contains only safe characters */
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export class WorkspaceExport {
  private db: any = null
  private exportDir: string = ''

  init(): void {
    try {
      this.db = (memoryManager as any).db
      this.exportDir = path.join(app.getPath('userData'), 'exports')
      if (!fs.existsSync(this.exportDir)) fs.mkdirSync(this.exportDir, { recursive: true })
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS export_history (
          id TEXT PRIMARY KEY, filePath TEXT, tables TEXT,
          rowCounts TEXT, sizeBytes INTEGER, timestamp INTEGER NOT NULL)`)
        console.log('[WorkspaceExport] Initialized')
      }
    } catch (error) {
      console.warn('[WorkspaceExport] Init error (non-fatal):', error)
    }
  }

  exportWorkspace(tables?: string[]): ExportResult | null {
    if (!this.db) return null
    const targetTables = tables || EXPORTABLE_TABLES
    const data: Record<string, any[]> = {}
    const rowCounts: Record<string, number> = {}

    for (const table of targetTables) {
      if (!ALLOWED_TABLE_SET.has(table) || !SAFE_IDENTIFIER.test(table)) continue
      try {
        const rows = this.db.prepare(`SELECT * FROM ${table}`).all() as any[]
        data[table] = rows
        rowCounts[table] = rows.length
      } catch {
        // Table may not exist — skip
      }
    }

    const manifest: ExportManifest = {
      id: randomUUID(), version: '1.0.0',
      exportedAt: Date.now(), tables: Object.keys(data),
      rowCounts,
    }

    const exportData = { manifest, data }
    const json = JSON.stringify(exportData, null, 2)
    const fileName = `nyra-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const filePath = path.join(this.exportDir, fileName)
    fs.writeFileSync(filePath, json, 'utf-8')
    const stats = fs.statSync(filePath)

    // Record in history
    try {
      this.db.prepare(`INSERT INTO export_history (id, filePath, tables, rowCounts, sizeBytes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(manifest.id, filePath, JSON.stringify(manifest.tables), JSON.stringify(rowCounts), stats.size, Date.now())
    } catch {}

    return { manifest, filePath, sizeBytes: stats.size }
  }

  importWorkspace(filePath: string, merge: boolean = false): ImportResult {
    if (!this.db) return { success: false, tablesImported: [], rowsImported: {}, errors: ['DB not initialized'] }
    const errors: string[] = []
    const rowsImported: Record<string, number> = {}
    const tablesImported: string[] = []

    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const exportData = JSON.parse(raw)
      if (!exportData.manifest || !exportData.data) {
        return { success: false, tablesImported: [], rowsImported: {}, errors: ['Invalid export file format'] }
      }

      for (const [table, rows] of Object.entries(exportData.data)) {
        if (!ALLOWED_TABLE_SET.has(table) || !SAFE_IDENTIFIER.test(table)) { errors.push(`Skipped non-importable table: ${table}`); continue }
        try {
          if (!merge) {
            this.db.prepare(`DELETE FROM ${table}`).run()
          }
          const typedRows = rows as any[]
          if (typedRows.length === 0) continue
          const cols = Object.keys(typedRows[0])
          // Validate every column name to prevent SQL injection via crafted column names
          if (cols.some(c => !SAFE_IDENTIFIER.test(c))) { errors.push(`Invalid column names in table: ${table}`); continue }
          const placeholders = cols.map(() => '?').join(', ')
          const insertStmt = this.db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)
          let imported = 0
          for (const row of typedRows) {
            try {
              insertStmt.run(...cols.map(c => row[c]))
              imported++
            } catch {}
          }
          rowsImported[table] = imported
          tablesImported.push(table)
        } catch (err: any) {
          errors.push(`Error importing ${table}: ${err.message}`)
        }
      }
      return { success: true, tablesImported, rowsImported, errors }
    } catch (err: any) {
      return { success: false, tablesImported: [], rowsImported: {}, errors: [err.message] }
    }
  }

  getExportHistory(limit: number = 20): Array<{ id: string; filePath: string; tables: string[]; sizeBytes: number; timestamp: number }> {
    if (!this.db) return []
    try {
      const rows = this.db.prepare(`SELECT * FROM export_history ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[]
      return rows.map(r => ({ id: r.id, filePath: r.filePath, tables: JSON.parse(r.tables || '[]'), sizeBytes: r.sizeBytes, timestamp: r.timestamp }))
    } catch { return [] }
  }

  getExportDir(): string { return this.exportDir }
}

export const workspaceExport = new WorkspaceExport()
