/**
 * Unit tests for StartupProfiler module
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

describe('StartupProfiler', () => {
  it('should initialize and create tables', async () => {
    const { StartupProfiler } = await import('../startup-profiler')
    const profiler = new StartupProfiler()
    profiler.init()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('startup_profiles')
  })

  it('should record metric', async () => {
    const { StartupProfiler } = await import('../startup-profiler')
    const profiler = new StartupProfiler()
    ;(profiler as any).currentMetrics = []
    profiler.init()

    profiler.recordMetric('database', 'init', 125)

    const metrics = (profiler as any).currentMetrics
    expect(metrics.length).toBe(1)
    expect(metrics[0].module).toBe('database')
    expect(metrics[0].durationMs).toBe(125)
  })

  it('should start and end timer', async () => {
    const { StartupProfiler } = await import('../startup-profiler')
    const profiler = new StartupProfiler()
    ;(profiler as any).currentMetrics = []
    profiler.init()

    const timer = profiler.startTimer('renderer', 'render')
    
    // Simulate work
    vi.useFakeTimers()
    vi.advanceTimersByTime(50)
    vi.useRealTimers()
    
    timer()

    const metrics = (profiler as any).currentMetrics
    expect(metrics.length).toBe(1)
    expect(metrics[0].module).toBe('renderer')
  })

  it('should finalize startup and create profile', async () => {
    const { StartupProfiler } = await import('../startup-profiler')
    const profiler = new StartupProfiler()
    ;(profiler as any).currentMetrics = []
    profiler.init()

    profiler.recordMetric('database', 'init', 100)
    profiler.recordMetric('renderer', 'render', 200)
    profiler.recordMetric('memory', 'init', 50)

    const profile = profiler.finalizeStartup()

    expect(profile.id).toBeDefined()
    expect(profile.totalMs).toBeGreaterThan(0)
    expect(profile.metrics.length).toBe(3)
    expect(profile.bottlenecks.length).toBeGreaterThan(0)
    expect(profile.bottlenecks[0].module).toBe('renderer')
  })

  it('should identify bottlenecks correctly', async () => {
    const { StartupProfiler } = await import('../startup-profiler')
    const profiler = new StartupProfiler()
    ;(profiler as any).currentMetrics = []
    profiler.init()

    profiler.recordMetric('slow', 'init', 500)
    profiler.recordMetric('fast', 'init', 10)
    profiler.recordMetric('medium', 'init', 100)

    const profile = profiler.finalizeStartup()

    const bottlenecks = profile.bottlenecks.map(b => b.module)
    expect(bottlenecks[0]).toBe('slow')
  })

  it('should get history of profiles', async () => {
    const { StartupProfiler } = await import('../startup-profiler')
    const profiler = new StartupProfiler()
    ;(profiler as any).db = db
    ;(profiler as any).currentMetrics = []
    profiler.init()

    profiler.recordMetric('mod', 'init', 100)
    profiler.finalizeStartup()

    ;(profiler as any).currentMetrics = []
    profiler.recordMetric('mod', 'init', 150)
    profiler.finalizeStartup()

    const history = profiler.getHistory(10)
    expect(history.length).toBe(2)
  })

  it('should get profile by id', async () => {
    const { StartupProfiler } = await import('../startup-profiler')
    const profiler = new StartupProfiler()
    ;(profiler as any).db = db
    ;(profiler as any).currentMetrics = []
    profiler.init()

    profiler.recordMetric('mod', 'init', 100)
    const profile = profiler.finalizeStartup()

    const retrieved = profiler.getProfile(profile.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.id).toBe(profile.id)
    expect(retrieved!.totalMs).toBe(profile.totalMs)
  })

  it('should calculate average startup time', async () => {
    const { StartupProfiler } = await import('../startup-profiler')
    const profiler = new StartupProfiler()
    ;(profiler as any).db = db
    ;(profiler as any).currentMetrics = []
    profiler.init()

    profiler.recordMetric('mod', 'init', 100)
    profiler.finalizeStartup()

    // Add delay to ensure totalMs has meaningful value
    await new Promise(r => setTimeout(r, 2))

    ;(profiler as any).currentMetrics = []
    profiler.recordMetric('mod', 'init', 200)
    profiler.finalizeStartup()

    await new Promise(r => setTimeout(r, 2))

    ;(profiler as any).currentMetrics = []
    profiler.recordMetric('mod', 'init', 300)
    profiler.finalizeStartup()

    const result = profiler.getAverageStartup()
    expect(result.avgMs).toBeGreaterThanOrEqual(0)
    expect(result.trend).toBeDefined()
  })

  it('should clear metrics after finalize', async () => {
    const { StartupProfiler } = await import('../startup-profiler')
    const profiler = new StartupProfiler()
    ;(profiler as any).db = db
    ;(profiler as any).currentMetrics = []
    profiler.init()

    profiler.recordMetric('mod', 'init', 100)
    expect((profiler as any).currentMetrics.length).toBe(1)

    profiler.finalizeStartup()
    expect((profiler as any).currentMetrics.length).toBe(0)
  })

  it('should return empty history when DB not initialized', async () => {
    const { StartupProfiler } = await import('../startup-profiler')
    const profiler = new StartupProfiler()
    ;(profiler as any).db = null

    expect(profiler.getHistory(10)).toEqual([])
  })
})
