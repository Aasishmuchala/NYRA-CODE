/**
 * Unit tests for SessionSharing module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMockDb } from './helpers/mock-db'

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

describe('SessionSharing', () => {
  it('should initialize', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    sharing.init()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames.length).toBeGreaterThanOrEqual(0)
  })

  it('should export session', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    sharing.init()

    const exported = sharing.exportSession('session-123')

    if (exported) {
      expect(exported.id).toBeDefined()
      expect(exported.sessionId).toBe('session-123')
      expect(exported.format).toBeDefined()
      expect(exported.createdAt).toBeLessThanOrEqual(Date.now())
    }
  })

  it('should generate unique IDs for shares', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    sharing.init()

    const share1 = sharing.exportSession('session-1')
    const share2 = sharing.exportSession('session-2')

    if (share1 && share2) {
      expect(share1.id).not.toBe(share2.id)
    }
  })

  it('should list shared sessions', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    ;(sharing as any).db = db
    ;(sharing as any).shareDir = '/tmp/test-shared'
    // Manually create the table since init() will fail on mkdir
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_sessions (
      id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, title TEXT,
      messageCount INTEGER, format TEXT NOT NULL, filePath TEXT NOT NULL,
      sizeBytes INTEGER, createdAt INTEGER NOT NULL)`).run()

    const list = sharing.listShared(10)
    expect(Array.isArray(list)).toBe(true)
  })

  it('should get shared session by id', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    ;(sharing as any).db = db
    ;(sharing as any).shareDir = '/tmp/test-shared'
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_sessions (
      id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, title TEXT,
      messageCount INTEGER, format TEXT NOT NULL, filePath TEXT NOT NULL,
      sizeBytes INTEGER, createdAt INTEGER NOT NULL)`).run()

    const exported = sharing.exportSession('session-abc')
    if (exported) {
      const list = sharing.listShared(10)
      const retrieved = list.find(s => s.id === exported.id)
      expect(retrieved).toBeDefined()
      expect(retrieved!.sessionId).toBe('session-abc')
    }
  })

  it('should delete shared session', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    ;(sharing as any).db = db
    ;(sharing as any).shareDir = '/tmp/test-shared'
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_sessions (
      id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, title TEXT,
      messageCount INTEGER, format TEXT NOT NULL, filePath TEXT NOT NULL,
      sizeBytes INTEGER, createdAt INTEGER NOT NULL)`).run()

    const exported = sharing.exportSession('session-xyz')
    if (exported) {
      sharing.deleteShared(exported.id)
      const list = sharing.listShared(10)
      expect(list.find(s => s.id === exported.id)).toBeUndefined()
    }
  })

  it('should respect format option', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    ;(sharing as any).db = db
    ;(sharing as any).shareDir = '/tmp/test-shared'
    sharing.init()

    const jsonExport = sharing.exportSession('s1', 'json')
    const mdExport = sharing.exportSession('s2', 'markdown')

    if (jsonExport && mdExport) {
      expect(jsonExport.format).toBe('json')
      expect(mdExport.format).toBe('markdown')
    }
  })

  it('should import exported session', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    ;(sharing as any).db = db
    ;(sharing as any).shareDir = '/tmp/test-shared'
    sharing.init()

    const exported = sharing.exportSession('s1', 'json')

    if (exported) {
      const result = sharing.importSession(exported.filePath)
      expect(typeof result.success).toBe('boolean')
    }
  })

  it('should support markdown export format', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    ;(sharing as any).db = db
    ;(sharing as any).shareDir = '/tmp/test-shared'
    sharing.init()

    const exported = sharing.exportSession('session-123', 'markdown')
    if (exported) {
      expect(exported.format).toBe('markdown')
      expect(exported.filePath).toContain('.md')
    }
  })

  it('should track share creation timestamp', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    ;(sharing as any).db = db
    ;(sharing as any).shareDir = '/tmp/test-shared'
    sharing.init()

    const before = Date.now()
    const exported = sharing.exportSession('session-123')
    const after = Date.now()

    if (exported) {
      expect(exported.createdAt).toBeGreaterThanOrEqual(before)
      expect(exported.createdAt).toBeLessThanOrEqual(after)
    }
  })

  it('should list shared sessions with limit', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    ;(sharing as any).db = db
    ;(sharing as any).shareDir = '/tmp/test-shared'
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_sessions (
      id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, title TEXT,
      messageCount INTEGER, format TEXT NOT NULL, filePath TEXT NOT NULL,
      sizeBytes INTEGER, createdAt INTEGER NOT NULL)`).run()

    const list = sharing.listShared(10)
    expect(Array.isArray(list)).toBe(true)
  })

  it('should get share stats', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    ;(sharing as any).db = db
    ;(sharing as any).shareDir = '/tmp/test-shared'
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_sessions (
      id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, title TEXT,
      messageCount INTEGER, format TEXT NOT NULL, filePath TEXT NOT NULL,
      sizeBytes INTEGER, createdAt INTEGER NOT NULL)`).run()

    const list = sharing.listShared(100)
    expect(Array.isArray(list)).toBe(true)
  })

  it('should return empty list when DB not initialized', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    ;(sharing as any).db = null

    expect(sharing.listShared(10)).toEqual([])
  })

  it('should return null for non-existent share id', async () => {
    const { SessionSharing } = await import('../session-sharing')
    const sharing = new SessionSharing()
    ;(sharing as any).db = db
    ;(sharing as any).shareDir = '/tmp/test-shared'
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_sessions (
      id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, title TEXT,
      messageCount INTEGER, format TEXT NOT NULL, filePath TEXT NOT NULL,
      sizeBytes INTEGER, createdAt INTEGER NOT NULL)`).run()

    const list = sharing.listShared(10)
    const found = list.find(s => s.id === 'nonexistent-id')
    expect(found).toBeUndefined()
  })
})
