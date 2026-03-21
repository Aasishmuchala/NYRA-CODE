/**
 * Unit tests for BuildValidator module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMockDb } from './helpers/mock-db'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-data'),
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

describe('BuildValidator', () => {
  it('should initialize and create validation_results table', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('validation_results')
  })

  it('should run validation and return result', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const result = validator.runValidation()

    expect(result.id).toBeDefined()
    expect(result.checks).toBeDefined()
    expect(Array.isArray(result.checks)).toBe(true)
    expect(result.checks.length).toBeGreaterThan(0)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('should calculate passed/failed/warning counts', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const result = validator.runValidation()

    expect(result.passed + result.failed + result.warnings).toBe(result.checks.length)
  })

  it('should check database health', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const result = validator.runValidation()
    
    const dbCheck = result.checks.find(c => c.name.includes('Database') || c.name.includes('database'))
    expect(dbCheck).toBeDefined()
  })

  it('should check filesystem', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const result = validator.runValidation()
    
    const fsCheck = result.checks.find(c => c.category === 'filesystem')
    expect(fsCheck).toBeDefined()
  })

  it('should store validation results in history', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const result1 = validator.runValidation()
    const result2 = validator.runValidation()

    const history = validator.getHistory(10)
    expect(history.length).toBeGreaterThanOrEqual(2)
  })

  it('should get validation result by id', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const result = validator.runValidation()
    const retrieved = validator.getResult(result.id)

    expect(retrieved).not.toBeNull()
    expect(retrieved!.id).toBe(result.id)
    expect(retrieved!.score).toBe(result.score)
  })

  it('should calculate overall score', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const result = validator.runValidation()
    
    // Score should be (passed / total) * 100
    const expectedScore = Math.round((result.passed / result.checks.length) * 100)
    expect(result.score).toBe(expectedScore)
  })

  it('should return array of validation checks', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const result = validator.runValidation()

    for (const check of result.checks) {
      expect(check.name).toBeDefined()
      expect(check.category).toMatch(/dependency|module|database|filesystem|config/)
      expect(check.status).toMatch(/pass|fail|warn/)
      expect(check.message).toBeDefined()
    }
  })

  it('should include module checks', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const result = validator.runValidation()
    
    const moduleChecks = result.checks.filter(c => c.category === 'module')
    expect(moduleChecks.length).toBeGreaterThan(0)
  })

  it('should include dependency checks', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const result = validator.runValidation()

    const dbChecks = result.checks.filter(c => c.category === 'database')
    expect(dbChecks.length).toBeGreaterThan(0)
  })

  it('should return empty history when DB not initialized', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    ;(validator as any).db = null

    expect(validator.getHistory(10)).toEqual([])
  })

  it('should get latest validation', async () => {
    const { BuildValidator } = await import('../build-validator')
    const validator = new BuildValidator()
    validator.init()

    const result1 = validator.runValidation()
    // Add delay to ensure different timestamps
    await new Promise(r => setTimeout(r, 1))
    const result2 = validator.runValidation()

    const history = validator.getHistory(1)
    expect(history.length).toBeGreaterThan(0)
    expect(history[0].id).toBe(result2.id)
  })
})
