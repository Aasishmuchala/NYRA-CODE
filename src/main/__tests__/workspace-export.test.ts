/**
 * Unit tests for WorkspaceExport module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { createMockDb } from './helpers/mock-db'

// Mock electron and memory before importing the module
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-exports'),
  },
}))

let db: any

beforeEach(async () => {
  db = await createMockDb()
  ;(globalThis as any).__mockMemoryManager.db = db
})

afterEach(() => {
  ;(globalThis as any).__mockMemoryManager.db = null
  db.close()
  vi.clearAllMocks()
})

describe('WorkspaceExport', () => {
  it('should initialize and create export_history table', async () => {
    const { WorkspaceExport } = await import('../workspace-export')
    const exporter = new WorkspaceExport()
    exporter.init()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='export_history'").all()
    expect(tables).toHaveLength(1)
  })

  it('should export workspace with allowed tables only', async () => {
    const { WorkspaceExport } = await import('../workspace-export')
    
    // Setup
    db.prepare('CREATE TABLE IF NOT EXISTS prompt_library (id TEXT PRIMARY KEY, name TEXT)').run()
    db.prepare("INSERT INTO prompt_library VALUES ('p1', 'test prompt')").run()
    db.prepare('CREATE TABLE IF NOT EXISTS task_board (id TEXT PRIMARY KEY, title TEXT)').run()
    db.prepare("INSERT INTO task_board VALUES ('t1', 'test task')").run()
    db.prepare('CREATE TABLE IF NOT EXISTS malicious_table (id TEXT PRIMARY KEY, data TEXT)').run()
    db.prepare("INSERT INTO malicious_table VALUES ('m1', 'should not export')").run()

    const exporter = new WorkspaceExport()
    ;(exporter as any).exportDir = '/tmp/test-exports'
    exporter.init()

    const result = exporter.exportWorkspace(['prompt_library', 'task_board', 'malicious_table'])
    
    expect(result).not.toBeNull()
    expect(result!.manifest.tables).toContain('prompt_library')
    expect(result!.manifest.tables).toContain('task_board')
    expect(result!.manifest.tables).not.toContain('malicious_table')
  })

  it('should reject non-allowlisted table names (SQL injection prevention)', async () => {
    const { WorkspaceExport } = await import('../workspace-export')
    
    db.prepare('CREATE TABLE IF NOT EXISTS prompt_library (id TEXT PRIMARY KEY)').run()
    db.prepare("INSERT INTO prompt_library VALUES ('p1')").run()

    const exporter = new WorkspaceExport()
    ;(exporter as any).exportDir = '/tmp/test-exports'
    exporter.init()

    const result = exporter.exportWorkspace(['prompt_library', 'DROP TABLE users'])
    
    expect(result!.manifest.tables).toContain('prompt_library')
    expect(result!.manifest.tables).not.toContain('DROP TABLE users')
  })

  it('should reject invalid column names during import', async () => {
    const { WorkspaceExport } = await import('../workspace-export')
    
    db.prepare('CREATE TABLE IF NOT EXISTS prompt_library (id TEXT PRIMARY KEY, name TEXT)').run()

    const exporter = new WorkspaceExport()
    ;(exporter as any).db = db
    
    // Create malicious export data with SQL injection in column names
    const maliciousData = {
      manifest: { id: 'test', version: '1.0.0', exportedAt: Date.now(), tables: ['prompt_library'], rowCounts: {} },
      data: {
        prompt_library: [
          { id: 'p1', 'name OR 1=1--': 'hacked' }
        ]
      }
    }

    const testFile = '/tmp/malicious-export.json'
    fs.writeFileSync(testFile, JSON.stringify(maliciousData))

    const result = exporter.importWorkspace(testFile, false)
    expect(result.success).toBe(true)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.includes('Invalid column names'))).toBe(true)
    
    fs.unlinkSync(testFile)
  })

  it('should import workspace with merge mode', async () => {
    const { WorkspaceExport } = await import('../workspace-export')
    
    db.prepare('CREATE TABLE IF NOT EXISTS prompt_library (id TEXT PRIMARY KEY, name TEXT)').run()
    db.prepare("INSERT INTO prompt_library VALUES ('p1', 'existing')").run()

    const exporter = new WorkspaceExport()
    ;(exporter as any).db = db

    const importData = {
      manifest: { id: 'test', version: '1.0.0', exportedAt: Date.now(), tables: ['prompt_library'], rowCounts: { prompt_library: 1 } },
      data: {
        prompt_library: [
          { id: 'p2', name: 'imported' }
        ]
      }
    }

    const testFile = '/tmp/merge-export.json'
    fs.writeFileSync(testFile, JSON.stringify(importData))

    const result = exporter.importWorkspace(testFile, true)
    expect(result.success).toBe(true)
    expect(result.tablesImported).toContain('prompt_library')

    const rows = db.prepare('SELECT COUNT(*) as c FROM prompt_library').get() as any
    expect(rows.c).toBe(2)
    
    fs.unlinkSync(testFile)
  })

  it('should track export history', async () => {
    const { WorkspaceExport } = await import('../workspace-export')
    
    db.prepare('CREATE TABLE IF NOT EXISTS prompt_library (id TEXT PRIMARY KEY)').run()
    db.prepare("INSERT INTO prompt_library VALUES ('p1')").run()

    const exporter = new WorkspaceExport()
    ;(exporter as any).exportDir = '/tmp/test-exports'
    exporter.init()

    exporter.exportWorkspace(['prompt_library'])
    const history = exporter.getExportHistory(10)

    expect(history.length).toBeGreaterThan(0)
    expect(history[0].tables).toContain('prompt_library')
  })

  it('should return null when DB not initialized', async () => {
    const { WorkspaceExport } = await import('../workspace-export')
    
    const exporter = new WorkspaceExport()
    ;(exporter as any).db = null

    const result = exporter.exportWorkspace(['prompt_library'])
    expect(result).toBeNull()
  })
})
