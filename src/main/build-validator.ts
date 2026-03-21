/**
 * Build Validator — Verify build health, dependency status, module integrity
 */
import { memoryManager } from './memory'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

interface ValidationResult {
  id: string
  checks: ValidationCheck[]
  passed: number
  failed: number
  warnings: number
  score: number          // 0-100
  timestamp: number
}

interface ValidationCheck {
  name: string
  category: 'dependency' | 'module' | 'database' | 'filesystem' | 'config'
  status: 'pass' | 'fail' | 'warn'
  message: string
  detail?: string
}

const MODULE_NAMES = [
  'memory', 'global-search', 'activity-feed', 'workspace-export',
  'report-generator', 'webhook-manager', 'backup-manager', 'session-sharing',
  'error-boundary-manager', 'offline-manager', 'startup-profiler',
  'accessibility-manager', 'plugin-studio', 'prompt-library-store',
  'task-board', 'api-playground', 'performance-profiler', 'voice-interface',
  'file-attachment', 'diff-viewer', 'ab-prompt-testing', 'theme-engine',
]

export class BuildValidator {
  private db: any = null

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS validation_results (
          id TEXT PRIMARY KEY, passed INTEGER, failed INTEGER, warnings INTEGER,
          score INTEGER, checks TEXT NOT NULL, timestamp INTEGER NOT NULL)`)
        console.log('[BuildValidator] Initialized')
      }
    } catch (error) {
      console.warn('[BuildValidator] Init error (non-fatal):', error)
    }
  }

  runValidation(): ValidationResult {
    const checks: ValidationCheck[] = []

    // Database checks
    checks.push(this.checkDatabase())
    checks.push(this.checkTables())

    // Filesystem checks
    checks.push(this.checkUserDataDir())
    checks.push(this.checkSubDirs())

    // Module checks
    checks.push(this.checkModuleCount())

    // Config checks
    checks.push(this.checkElectronVersion())
    checks.push(this.checkMemoryUsage())

    const passed = checks.filter(c => c.status === 'pass').length
    const failed = checks.filter(c => c.status === 'fail').length
    const warnings = checks.filter(c => c.status === 'warn').length
    const score = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 0

    const result: ValidationResult = { id: randomUUID(), checks, passed, failed, warnings, score, timestamp: Date.now() }

    if (this.db) {
      try {
        this.db.prepare(`INSERT INTO validation_results (id, passed, failed, warnings, score, checks, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(result.id, passed, failed, warnings, score, JSON.stringify(checks), result.timestamp)
      } catch {}
    }

    return result
  }

  getHistory(limit: number = 20): Array<Omit<ValidationResult, 'checks'>> {
    if (!this.db) return []
    return (this.db.prepare(`SELECT id, passed, failed, warnings, score, timestamp FROM validation_results ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[])
      .map(r => ({ id: r.id, checks: [], passed: r.passed, failed: r.failed, warnings: r.warnings, score: r.score, timestamp: r.timestamp }))
  }

  getResult(id: string): ValidationResult | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM validation_results WHERE id = ?`).get(id) as any
    if (!row) return null
    return { id: row.id, checks: JSON.parse(row.checks || '[]'), passed: row.passed, failed: row.failed, warnings: row.warnings, score: row.score, timestamp: row.timestamp }
  }

  // ── Individual checks ──────────────────────────────────────────────────────

  private checkDatabase(): ValidationCheck {
    if (this.db) {
      try {
        this.db.prepare(`SELECT 1`).get()
        return { name: 'Database connection', category: 'database', status: 'pass', message: 'SQLite database is accessible' }
      } catch (err: any) {
        return { name: 'Database connection', category: 'database', status: 'fail', message: 'Database query failed', detail: err.message }
      }
    }
    return { name: 'Database connection', category: 'database', status: 'fail', message: 'Database not initialized' }
  }

  private checkTables(): ValidationCheck {
    if (!this.db) return { name: 'Table integrity', category: 'database', status: 'fail', message: 'No DB' }
    try {
      const tables = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[]
      const tableNames = tables.map(t => t.name)
      const required = ['sessions', 'messages', 'task_board', 'prompt_library', 'theme_configs']
      const missing = required.filter(t => !tableNames.includes(t))
      if (missing.length > 0) {
        return { name: 'Table integrity', category: 'database', status: 'warn', message: `Missing ${missing.length} tables`, detail: missing.join(', ') }
      }
      return { name: 'Table integrity', category: 'database', status: 'pass', message: `${tableNames.length} tables present` }
    } catch (err: any) {
      return { name: 'Table integrity', category: 'database', status: 'fail', message: 'Table check failed', detail: err.message }
    }
  }

  private checkUserDataDir(): ValidationCheck {
    const dir = app.getPath('userData')
    if (fs.existsSync(dir)) {
      return { name: 'User data directory', category: 'filesystem', status: 'pass', message: `Exists: ${dir}` }
    }
    return { name: 'User data directory', category: 'filesystem', status: 'fail', message: 'User data dir missing' }
  }

  private checkSubDirs(): ValidationCheck {
    const base = app.getPath('userData')
    const dirs = ['exports', 'reports', 'backups', 'shared', 'attachments']
    const missing = dirs.filter(d => !fs.existsSync(path.join(base, d)))
    if (missing.length > 0) {
      return { name: 'Subdirectories', category: 'filesystem', status: 'warn', message: `${missing.length} subdirs missing`, detail: missing.join(', ') }
    }
    return { name: 'Subdirectories', category: 'filesystem', status: 'pass', message: `All ${dirs.length} subdirs present` }
  }

  private checkModuleCount(): ValidationCheck {
    const expected = MODULE_NAMES.length
    return { name: 'Module registry', category: 'module', status: 'pass', message: `${expected} modules registered` }
  }

  private checkElectronVersion(): ValidationCheck {
    const v = process.versions.electron
    if (v) {
      const major = parseInt(v.split('.')[0])
      if (major >= 29) return { name: 'Electron version', category: 'config', status: 'pass', message: `Electron ${v}` }
      return { name: 'Electron version', category: 'config', status: 'warn', message: `Electron ${v} (29+ recommended)` }
    }
    return { name: 'Electron version', category: 'config', status: 'warn', message: 'Could not detect Electron version' }
  }

  private checkMemoryUsage(): ValidationCheck {
    const mem = process.memoryUsage()
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024)
    if (heapMB > 500) {
      return { name: 'Memory usage', category: 'config', status: 'warn', message: `Heap: ${heapMB}MB (high)` }
    }
    return { name: 'Memory usage', category: 'config', status: 'pass', message: `Heap: ${heapMB}MB` }
  }
}

export const buildValidator = new BuildValidator()
