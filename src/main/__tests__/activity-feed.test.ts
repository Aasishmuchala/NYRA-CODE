/**
 * Unit tests for ActivityFeed module
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

describe('ActivityFeed', () => {
  it('should initialize and create activity_feed table', async () => {
    const { ActivityFeed } = await import('../activity-feed')
    const feed = new ActivityFeed()
    feed.init()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('activity_feed')
  })

  it('should record activity event', async () => {
    const { ActivityFeed } = await import('../activity-feed')
    const feed = new ActivityFeed()
    feed.init()

    const event = feed.record('chat', 'created', 'New conversation', {
      detail: 'Started chat session',
      sourceId: 'chat-123'
    })

    expect(event.id).toBeDefined()
    expect(event.type).toBe('chat')
    expect(event.action).toBe('created')
    expect(event.title).toBe('New conversation')
    expect(event.timestamp).toBeLessThanOrEqual(Date.now())
  })

  it('should get recent events', async () => {
    const { ActivityFeed } = await import('../activity-feed')
    const feed = new ActivityFeed()
    feed.init()

    feed.record('chat', 'created', 'Event 1')
    feed.record('task', 'completed', 'Event 2')
    feed.record('agent', 'started', 'Event 3')

    const recent = feed.getRecent(10)
    expect(recent.length).toBe(3)
    expect(recent[0].title).toBe('Event 3')
    expect(recent[2].title).toBe('Event 1')
  })

  it('should filter events by type', async () => {
    const { ActivityFeed } = await import('../activity-feed')
    const feed = new ActivityFeed()
    feed.init()

    feed.record('chat', 'created', 'Chat event')
    feed.record('task', 'completed', 'Task event')
    feed.record('chat', 'updated', 'Another chat')

    const chatEvents = feed.getByType('chat', 10)
    expect(chatEvents.length).toBe(2)
    expect(chatEvents.every(e => e.type === 'chat')).toBe(true)
  })

  it('should get events by date range', async () => {
    const { ActivityFeed } = await import('../activity-feed')
    const feed = new ActivityFeed()
    feed.init()

    const now = Date.now()
    const old = now - 86400000 // 1 day ago

    feed.record('chat', 'created', 'Recent')
    
    db.prepare('INSERT INTO activity_feed (id, type, action, title, timestamp) VALUES (?, ?, ?, ?, ?)')
      .run('old1', 'task', 'completed', 'Old event', old)

    const recent = feed.getByDateRange(now - 3600000, now, 10)
    expect(recent.length).toBeGreaterThan(0)
    expect(recent.some(e => e.title === 'Recent')).toBe(true)
    expect(recent.some(e => e.title === 'Old event')).toBe(false)
  })

  it('should get stats by type', async () => {
    const { ActivityFeed } = await import('../activity-feed')
    const feed = new ActivityFeed()
    feed.init()

    feed.record('chat', 'created', 'Event 1')
    feed.record('chat', 'updated', 'Event 2')
    feed.record('task', 'completed', 'Event 3')
    feed.record('agent', 'started', 'Event 4')

    const stats = feed.getStats(24)
    expect(stats.total).toBe(4)
    expect(stats.byType['chat']).toBe(2)
    expect(stats.byType['task']).toBe(1)
    expect(stats.byType['agent']).toBe(1)
  })

  it('should get stats with hourly breakdown', async () => {
    const { ActivityFeed } = await import('../activity-feed')
    const feed = new ActivityFeed()
    feed.init()

    const now = Date.now()
    for (let i = 0; i < 3; i++) {
      feed.record('chat', 'created', `Event ${i}`)
    }

    const stats = feed.getStats(24)
    expect(stats.hourly).toBeDefined()
    expect(stats.hourly.length).toBeGreaterThan(0)
  })

  it('should get stats by action', async () => {
    const { ActivityFeed } = await import('../activity-feed')
    const feed = new ActivityFeed()
    feed.init()

    feed.record('chat', 'created', 'Event 1')
    feed.record('chat', 'created', 'Event 2')
    feed.record('chat', 'deleted', 'Event 3')

    const stats = feed.getStats(24)
    expect(stats.byAction['created']).toBe(2)
    expect(stats.byAction['deleted']).toBe(1)
  })

  it('should return empty results when DB not initialized', async () => {
    const { ActivityFeed } = await import('../activity-feed')
    const feed = new ActivityFeed()
    ;(feed as any).db = null

    expect(feed.getRecent(10)).toEqual([])
    expect(feed.getByType('chat', 10)).toEqual([])
  })

  it('should include metadata in events', async () => {
    const { ActivityFeed } = await import('../activity-feed')
    const feed = new ActivityFeed()
    feed.init()

    const event = feed.record('task', 'created', 'New task', {
      metadata: { priority: 'high', assignee: 'john' }
    })

    expect(event.metadata).toBeDefined()
    expect(event.metadata!.priority).toBe('high')
  })
})
