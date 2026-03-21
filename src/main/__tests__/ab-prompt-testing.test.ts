/**
 * Unit tests for ABPromptTesting module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMockDb } from './helpers/mock-db'

vi.mock('../providers/provider-registry', () => ({
  providerRegistry: {
    get: vi.fn((providerId) => null),
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

describe('ABPromptTesting', () => {
  it('should initialize and create tables', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    tester.init()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('ab_tests')
    expect(tableNames).toContain('ab_variants')
  })

  it('should create test with variants', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    tester.init()

    const test = tester.createTest('compare', 'What is AI?', [
      { providerId: 'openai', modelId: 'gpt-4' },
      { providerId: 'anthropic', modelId: 'claude-3' },
    ])

    expect(test.id).toBeDefined()
    expect(test.name).toBe('compare')
    expect(test.variants.length).toBe(2)
    expect(test.status).toBe('pending')
  })

  it('should score variants', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    tester.init()

    const test = tester.createTest('compare', 'test prompt', [
      { providerId: 'openai', modelId: 'gpt-4' },
    ])
    const variantId = test.variants[0].id

    tester.scoreVariant(variantId, 5, 'Excellent')

    const updated = db.prepare('SELECT score, notes FROM ab_variants WHERE id = ?').get(variantId) as any
    expect(updated.score).toBe(5)
    expect(updated.notes).toBe('Excellent')
  })

  it('should clamp score to 1-5 range', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    tester.init()

    const test = tester.createTest('compare', 'test', [
      { providerId: 'openai', modelId: 'gpt-4' },
    ])
    const variantId = test.variants[0].id

    tester.scoreVariant(variantId, 10, 'too high')
    let row = db.prepare('SELECT score FROM ab_variants WHERE id = ?').get(variantId) as any
    expect(row.score).toBe(5)

    tester.scoreVariant(variantId, 0, 'too low')
    row = db.prepare('SELECT score FROM ab_variants WHERE id = ?').get(variantId) as any
    expect(row.score).toBe(1)
  })

  it('should get test by id', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    tester.init()

    const created = tester.createTest('test1', 'prompt', [
      { providerId: 'openai', modelId: 'gpt-4' },
    ])

    const retrieved = tester.getTest(created.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.name).toBe('test1')
    expect(retrieved!.variants.length).toBe(1)
  })

  it('should list tests with limit', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    tester.init()

    tester.createTest('test1', 'p1', [{ providerId: 'a', modelId: 'm1' }])
    tester.createTest('test2', 'p2', [{ providerId: 'b', modelId: 'm2' }])
    tester.createTest('test3', 'p3', [{ providerId: 'c', modelId: 'm3' }])

    const list = tester.listTests(2)
    expect(list.length).toBe(2)
  })

  it('should delete test and its variants', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    tester.init()

    const test = tester.createTest('test', 'prompt', [
      { providerId: 'a', modelId: 'm1' },
      { providerId: 'b', modelId: 'm2' },
    ])

    tester.deleteTest(test.id)

    expect(tester.getTest(test.id)).toBeNull()

    const variants = db.prepare('SELECT COUNT(*) as c FROM ab_variants WHERE testId = ?').get(test.id) as any
    expect(variants.c).toBe(0)
  })

  it('should handle tokenInput=0 as valid (NOT falsy)', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    tester.init()

    const test = tester.createTest('test', 'prompt', [
      { providerId: 'openai', modelId: 'gpt-4' },
    ])
    const variantId = test.variants[0].id

    // Directly insert a variant with tokenInput=0 and tokenOutput=0
    db.prepare(`UPDATE ab_variants SET tokenInput = ?, tokenOutput = ? WHERE id = ?`)
      .run(0, 0, variantId)

    const retrieved = tester.getTest(test.id)
    const variant = retrieved!.variants[0]

    // This is the critical test: tokenInput=0 should create a tokenUsage object
    // NOT be treated as falsy and omitted
    expect(variant.tokenUsage).toBeDefined()
    expect(variant.tokenUsage!.input).toBe(0)
    expect(variant.tokenUsage!.output).toBe(0)
  })

  it('should calculate stats correctly', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    tester.init()

    tester.createTest('test1', 'p1', [
      { providerId: 'openai', modelId: 'gpt-4' },
      { providerId: 'anthropic', modelId: 'claude' },
    ])
    tester.createTest('test2', 'p2', [
      { providerId: 'openai', modelId: 'gpt-4' },
    ])

    const stats = tester.getStats()
    expect(stats.totalTests).toBe(2)
    expect(stats.totalVariants).toBe(3)
  })

  it('should return null when test not found', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    tester.init()

    expect(tester.getTest('nonexistent')).toBeNull()
  })

  it('should return empty list when DB not initialized', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    ;(tester as any).db = null

    expect(tester.listTests()).toEqual([])
  })

  it('should throw when creating test with DB not initialized', async () => {
    const { ABPromptTesting } = await import('../ab-prompt-testing')
    const tester = new ABPromptTesting()
    ;(tester as any).db = null

    expect(() => {
      tester.createTest('test', 'prompt', [{ providerId: 'a', modelId: 'm' }])
    }).toThrow('DB not initialized')
  })
})
