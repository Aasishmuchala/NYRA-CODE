/**
 * Backup Manager — Automated and manual backups of the entire SQLite database
 */
import { memoryManager } from './memory'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

interface BackupEntry {
  id: string
  fileName: string
  filePath: string
  sizeBytes: number
  type: 'manual' | 'auto' | 'pre-import'
  label?: string
  createdAt: number
}

export class BackupManager {
  private db: any = null
  private backupDir: string = ''

  init(): void {
    try {
      this.db = (memoryManager as any).db
      this.backupDir = path.join(app.getPath('userData'), 'backups')
      if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true })
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS backup_history (
          id TEXT PRIMARY KEY, fileName TEXT NOT NULL, filePath TEXT NOT NULL,
          sizeBytes INTEGER, type TEXT NOT NULL, label TEXT,
          createdAt INTEGER NOT NULL)`)
        console.log('[BackupManager] Initialized')
      }
    } catch (error) {
      console.warn('[BackupManager] Init error (non-fatal):', error)
    }
  }

  createBackup(type: 'manual' | 'auto' | 'pre-import' = 'manual', label?: string): BackupEntry | null {
    if (!this.db) return null
    try {
      const id = randomUUID()
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `nyra-backup-${type}-${ts}.db`
      const filePath = path.join(this.backupDir, fileName)

      // Use SQLite backup API via better-sqlite3
      this.db.backup(filePath).then(() => {}).catch(() => {})
      // Synchronous fallback: copy the file
      const dbPath = (memoryManager as any).dbPath
      if (dbPath && fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, filePath)
      }

      const sizeBytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
      const now = Date.now()
      this.db.prepare(`INSERT INTO backup_history (id, fileName, filePath, sizeBytes, type, label, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, fileName, filePath, sizeBytes, type, label || null, now)

      return { id, fileName, filePath, sizeBytes, type, label, createdAt: now }
    } catch (err) {
      console.warn('[BackupManager] Backup failed:', err)
      return null
    }
  }

  restoreBackup(backupId: string): { success: boolean; error?: string } {
    if (!this.db) return { success: false, error: 'DB not initialized' }
    const entry = this.getBackup(backupId)
    if (!entry) return { success: false, error: 'Backup not found' }
    if (!fs.existsSync(entry.filePath)) return { success: false, error: 'Backup file missing' }

    try {
      // Create safety backup before restore
      this.createBackup('pre-import', `Before restore of ${backupId.slice(0, 8)}`)
      // Copy backup file over current DB
      const dbPath = (memoryManager as any).dbPath
      if (dbPath) {
        fs.copyFileSync(entry.filePath, dbPath)
        return { success: true }
      }
      return { success: false, error: 'DB path unknown' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  getBackup(id: string): BackupEntry | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM backup_history WHERE id = ?`).get(id) as any
    return row ? this.rowToEntry(row) : null
  }

  listBackups(limit: number = 30): BackupEntry[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM backup_history ORDER BY createdAt DESC LIMIT ?`).all(limit) as any[]).map(r => this.rowToEntry(r))
  }

  deleteBackup(id: string): void {
    if (!this.db) return
    const entry = this.getBackup(id)
    if (entry?.filePath && fs.existsSync(entry.filePath)) {
      try { fs.unlinkSync(entry.filePath) } catch {}
    }
    this.db.prepare(`DELETE FROM backup_history WHERE id = ?`).run(id)
  }

  pruneOldBackups(keepCount: number = 10): number {
    if (!this.db) return 0
    const all = this.listBackups(1000)
    const autoBackups = all.filter(b => b.type === 'auto')
    if (autoBackups.length <= keepCount) return 0
    const toDelete = autoBackups.slice(keepCount)
    for (const b of toDelete) this.deleteBackup(b.id)
    return toDelete.length
  }

  getStats(): { totalBackups: number; totalSize: number; lastBackup?: number; oldestBackup?: number } {
    if (!this.db) return { totalBackups: 0, totalSize: 0 }
    const total = (this.db.prepare(`SELECT COUNT(*) as c FROM backup_history`).get() as any)?.c || 0
    const size = (this.db.prepare(`SELECT SUM(sizeBytes) as s FROM backup_history`).get() as any)?.s || 0
    const last = (this.db.prepare(`SELECT MAX(createdAt) as m FROM backup_history`).get() as any)?.m
    const oldest = (this.db.prepare(`SELECT MIN(createdAt) as m FROM backup_history`).get() as any)?.m
    return { totalBackups: total, totalSize: size, lastBackup: last || undefined, oldestBackup: oldest || undefined }
  }

  private rowToEntry(row: any): BackupEntry {
    return { id: row.id, fileName: row.fileName, filePath: row.filePath, sizeBytes: row.sizeBytes || 0, type: row.type, label: row.label || undefined, createdAt: row.createdAt }
  }
}

export const backupManager = new BackupManager()
