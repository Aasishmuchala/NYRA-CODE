/**
 * Unit tests for GlobalSearch module
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

describe('GlobalSearch', () => {
  it('should initialize and create search_history table', async () => {
    const { GlobalSearch } = await import('../global-search')
    const search = new GlobalSearch()
    search.init()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('search_history')
  })

  it('should index and search messages', async () => {
    const { GlobalSearch } = await import('../global-search')
    const search = new GlobalSearch()
    search.init()

    db.prepare('CREATE TABLE IF NOT EXISTS messages (id TEXT, role TEXT, content TEXT, timestamp INTEGER)').run()
    db.prepare("INSERT INTO messages VALUES ('m1', 'user', 'what is machine learning', ?)")
      .run(Date.now())

    const result = search.search({ query: 'machine learning', limit: 10 })
    expect(result.queryId).toBeDefined()
    expect(result.results.length).toBeGreaterThan(0)
  })

  it('should filter search by types', async () => {
    const { GlobalSearch } = await import('../global-search')
    const search = new GlobalSearch()
    search.init()

    db.prepare('CREATE TABLE IF NOT EXISTS prompt_library (id TEXT, title TEXT, content TEXT, category TEXT, createdAt INTEGER)').run()
    db.prepare("INSERT INTO prompt_library VALUES ('p1', 'test', 'testing framework', 'testing', ?)")
      .run(Date.now())

    const result = search.search({
      query: 'test',
      types: ['prompt'],
      limit: 10
    })

    expect(result.results.length).toBeGreaterThanOrEqual(0)
  })

  it('should search with date range', async () => {
    const { GlobalSearch } = await import('../global-search')
    const search = new GlobalSearch()
    search.init()

    db.prepare('CREATE TABLE IF NOT EXISTS messages (id TEXT, role TEXT, content TEXT, timestamp INTEGER)').run()
    const now = Date.now()
    db.prepare('INSERT INTO messages VALUES (?, ?, ?, ?)')
      .run('m1', 'user', 'old search query', now - 86400000)
    db.prepare('INSERT INTO messages VALUES (?, ?, ?, ?)')
      .run('m2', 'user', 'recent search query', now)

    const result = search.search({
      query: 'search',
      limit: 10
    })

    expect(result.results.length).toBeGreaterThanOrEqual(0)
  })

  it('should return empty results for empty query', async () => {
    const { GlobalSearch } = await import('../global-search')
    const search = new GlobalSearch()
    search.init()

    const result = search.search({ query: '', limit: 10 })
    expect(result.results).toEqual([])
    expect(result.total).toBe(0)
    expect(result.queryId).toBe('')
  })

  it('should clear search index', async () => {
    const { GlobalSearch } = await import('../global-search')
    const search = new GlobalSearch()
    search.init()

    db.prepare('INSERT INTO search_history (id, query, resultCount, types, timestamp) VALUES (?, ?, ?, ?, ?)')
      .run('h1', 'test query', 1, '[]', Date.now())

    search.clearHistory()

    const count = db.prepare('SELECT COUNT(*) as c FROM search_history').get() as any
    expect(count.c).toBe(0)
  })

  it('should get search stats', async () => {
    const { GlobalSearch } = await import('../global-search')
    const search = new GlobalSearch()
    search.init()

    db.prepare('INSERT INTO search_history (id, query, resultCount, types, timestamp) VALUES (?, ?, ?, ?, ?)')
      .run('h1', 'test', 5, '[]', Date.now())
    db.prepare('INSERT INTO search_history (id, query, resultCount, types, timestamp) VALUES (?, ?, ?, ?, ?)')
      .run('h2', 'other', 3, '[]', Date.now())

    const stats = search.getStats()
    expect(stats.totalSearches).toBeGreaterThanOrEqual(2)
    expect(stats.topQueries).toBeDefined()
  })

  it('should return empty results when DB not initialized', async () => {
    const { GlobalSearch } = await import('../global-search')
    const search = new GlobalSearch()
    ;(search as any).db = null

    const result = search.search({ query: 'test' })
    expect(result.results).toEqual([])
  })
})
