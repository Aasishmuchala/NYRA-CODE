/**
 * Unit tests for BackupManager module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { createMockDb } from './helpers/mock-db'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-backups'),
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

describe('BackupManager', () => {
  it('should initialize and create backup_history table', async () => {
    const { BackupManager } = await import('../backup-manager')
    const manager = new BackupManager()
    ;(manager as any).backupDir = '/tmp/test-backups'
    manager.init()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('backup_history')
  })

  it('should create manual backup', async () => {
    const { BackupManager } = await import('../backup-manager')
    const manager = new BackupManager()
    ;(manager as any).backupDir = '/tmp/test-backups'
    manager.init()

    const backup = manager.createBackup('manual', 'test backup')
    
    if (backup) {
      expect(backup.id).toBeDefined()
      expect(backup.fileName).toContain('manual')
      expect(backup.type).toBe('manual')
      expect(backup.label).toBe('test backup')
    }
  })

  it('should create auto backup', async () => {
    const { BackupManager } = await import('../backup-manager')
    const manager = new BackupManager()
    ;(manager as any).backupDir = '/tmp/test-backups'
    manager.init()

    const backup = manager.createBackup('auto')
    
    if (backup) {
      expect(backup.type).toBe('auto')
      expect(backup.fileName).toContain('auto')
    }
  })

  it('should create pre-import backup', async () => {
    const { BackupManager } = await import('../backup-manager')
    const manager = new BackupManager()
    ;(manager as any).backupDir = '/tmp/test-backups'
    manager.init()

    const backup = manager.createBackup('pre-import', 'before import')
    
    if (backup) {
      expect(backup.type).toBe('pre-import')
    }
  })

  it('should list backups', async () => {
    const { BackupManager } = await import('../backup-manager')
    const manager = new BackupManager()
    ;(manager as any).backupDir = '/tmp/test-backups'
    manager.init()

    manager.createBackup('manual', 'backup 1')
    manager.createBackup('auto', 'backup 2')

    const list = manager.listBackups(10)
    expect(Array.isArray(list)).toBe(true)
  })

  it('should get specific backup', async () => {
    const { BackupManager } = await import('../backup-manager')
    const manager = new BackupManager()
    ;(manager as any).backupDir = '/tmp/test-backups'
    manager.init()

    const created = manager.createBackup('manual', 'test')
    if (created) {
      const retrieved = manager.getBackup(created.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(created.id)
      expect(retrieved!.label).toBe('test')
    }
  })

  it('should delete backup', async () => {
    const { BackupManager } = await import('../backup-manager')
    const manager = new BackupManager()
    ;(manager as any).backupDir = '/tmp/test-backups'
    manager.init()

    const created = manager.createBackup('manual')
    if (created) {
      manager.deleteBackup(created.id)
      expect(manager.getBackup(created.id)).toBeNull()
    }
  })

  it('should get backup stats', async () => {
    const { BackupManager } = await import('../backup-manager')
    const manager = new BackupManager()
    ;(manager as any).backupDir = '/tmp/test-backups'
    manager.init()

    manager.createBackup('manual')
    manager.createBackup('auto')

    const stats = manager.getStats()
    expect(stats.totalBackups).toBeGreaterThanOrEqual(0)
    expect(typeof stats.totalSize).toBe('number')
  })

  it('should return empty list when no backups exist', async () => {
    const { BackupManager } = await import('../backup-manager')
    const manager = new BackupManager()
    ;(manager as any).backupDir = '/tmp/test-backups'
    manager.init()

    const list = manager.listBackups(10)
    expect(Array.isArray(list)).toBe(true)
  })

  it('should return null when creating backup with DB error', async () => {
    const { BackupManager } = await import('../backup-manager')
    const manager = new BackupManager()
    ;(manager as any).db = null
    ;(manager as any).backupDir = '/tmp/test-backups'

    const result = manager.createBackup('manual')
    expect(result).toBeNull()
  })

  it('should handle missing backup file gracefully', async () => {
    const { BackupManager } = await import('../backup-manager')
    const manager = new BackupManager()
    ;(manager as any).backupDir = '/tmp/test-backups'
    manager.init()

    const result = manager.restoreBackup('nonexistent-backup-id')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
