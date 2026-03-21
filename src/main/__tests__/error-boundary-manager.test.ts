/**
 * Unit tests for ErrorBoundaryManager module
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

describe('ErrorBoundaryManager', () => {
  it('should initialize and create error_entries table', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    manager.init()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('error_entries')
  })

  it('should capture error from string', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    manager.init()

    const entry = manager.capture('memory', 'Out of memory', {
      severity: 'critical',
      context: { used: 1024 }
    })

    expect(entry.id).toBeDefined()
    expect(entry.module).toBe('memory')
    expect(entry.message).toBe('Out of memory')
    expect(entry.severity).toBe('critical')
    expect(entry.context).toBeDefined()
  })

  it('should capture error from Error object', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    manager.init()

    const err = new Error('Database connection failed')
    const entry = manager.capture('database', err, { severity: 'high' })

    expect(entry.message).toBe('Database connection failed')
    expect(entry.stack).toBeDefined()
    expect(entry.severity).toBe('high')
  })

  it('should set default severity to medium', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    manager.init()

    const entry = manager.capture('module', 'some error')
    expect(entry.severity).toBe('medium')
  })

  it('should set recovered flag', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    manager.init()

    const entry = manager.capture('module', 'error', { recovered: true })
    expect(entry.recovered).toBe(true)
  })

  it('should mark error as recovered', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    manager.init()

    const entry = manager.capture('module', 'error', { recovered: false })
    expect(entry.recovered).toBe(false)

    manager.markRecovered(entry.id)

    const row = db.prepare('SELECT recovered FROM error_entries WHERE id = ?').get(entry.id) as any
    expect(row.recovered).toBe(1)
  })

  it('should get recent errors', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    manager.init()

    manager.capture('mod1', 'error1', { severity: 'low' })
    manager.capture('mod2', 'error2', { severity: 'high' })
    manager.capture('mod3', 'error3', { severity: 'critical' })

    const recent = manager.getRecent(10)
    expect(recent.length).toBe(3)
    expect(recent[0].message).toBe('error3')
  })

  it('should filter errors by module', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    manager.init()

    manager.capture('database', 'error1')
    manager.capture('database', 'error2')
    manager.capture('memory', 'error3')

    const dbErrors = manager.getByModule('database', 10)
    expect(dbErrors.length).toBe(2)
    expect(dbErrors.every(e => e.module === 'database')).toBe(true)
  })

  it('should filter errors by severity', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    manager.init()

    manager.capture('mod', 'e1', { severity: 'critical' })
    manager.capture('mod', 'e2', { severity: 'critical' })
    manager.capture('mod', 'e3', { severity: 'low' })

    const critical = manager.getBySeverity('critical', 10)
    expect(critical.length).toBe(2)
    expect(critical.every(e => e.severity === 'critical')).toBe(true)
  })

  it('should allow error listeners', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    manager.init()

    const captured: any[] = []
    const unsubscribe = manager.onError((err) => {
      captured.push(err)
    })

    manager.capture('mod', 'error1')
    expect(captured.length).toBe(1)

    manager.capture('mod', 'error2')
    expect(captured.length).toBe(2)

    unsubscribe()
    manager.capture('mod', 'error3')
    expect(captured.length).toBe(2)
  })

  it('should get stats by severity', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    manager.init()

    manager.capture('mod', 'e1', { severity: 'critical' })
    manager.capture('mod', 'e2', { severity: 'high' })
    manager.capture('mod', 'e3', { severity: 'high' })
    manager.capture('mod', 'e4', { severity: 'low' })

    const stats = manager.getStats()
    expect(stats.bySeverity['critical']).toBe(1)
    expect(stats.bySeverity['high']).toBe(2)
    expect(stats.bySeverity['low']).toBe(1)
  })

  it('should return empty results when DB not initialized', async () => {
    const { ErrorBoundaryManager } = await import('../error-boundary-manager')
    const manager = new ErrorBoundaryManager()
    ;(manager as any).db = null

    expect(manager.getRecent(10)).toEqual([])
    expect(manager.getByModule('test', 10)).toEqual([])
    expect(manager.getBySeverity('high', 10)).toEqual([])
  })
})
