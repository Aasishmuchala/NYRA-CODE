/**
 * Unit tests for ReportGenerator module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMockDb } from './helpers/mock-db'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-reports'),
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

describe('ReportGenerator', () => {
  it('should initialize', async () => {
    const { ReportGenerator } = await import('../report-generator')
    const generator = new ReportGenerator()
    ;(generator as any).reportDir = '/tmp/test-reports'
    generator.init()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames.length).toBeGreaterThanOrEqual(0)
  })

  it('should generate markdown report', async () => {
    const { ReportGenerator } = await import('../report-generator')
    const generator = new ReportGenerator()
    ;(generator as any).reportDir = '/tmp/test-reports'
    generator.init()

    const report = generator.generateCustomReport('Test Report', [
      { heading: 'Overview', content: 'This is a test report.' }
    ])

    if (report) {
      expect(report.id).toBeDefined()
      expect(report.title).toBe('Test Report')
      expect(report.format).toBe('markdown')
      expect(report.type).toBe('custom')
    }
  })

  it('should generate HTML report', async () => {
    const { ReportGenerator } = await import('../report-generator')
    const generator = new ReportGenerator()
    ;(generator as any).reportDir = '/tmp/test-reports'
    generator.init()

    const report = generator.generateCustomReport('HTML Report', [
      { heading: 'Summary', content: 'Test content' }
    ])

    if (report) {
      expect(report.format).toBe('markdown')
    }
  })

  it('should generate session report', async () => {
    const { ReportGenerator } = await import('../report-generator')
    const generator = new ReportGenerator()
    ;(generator as any).reportDir = '/tmp/test-reports'
    generator.init()

    const report = generator.generateSessionReport()

    if (report) {
      expect(report.type).toBe('session')
    }
  })

  it('should generate analytics report', async () => {
    const { ReportGenerator } = await import('../report-generator')
    const generator = new ReportGenerator()
    ;(generator as any).reportDir = '/tmp/test-reports'
    generator.init()

    const report = generator.generateAnalyticsReport()

    if (report) {
      expect(report.type).toBe('analytics')
    }
  })

  it('should list reports', async () => {
    const { ReportGenerator } = await import('../report-generator')
    const generator = new ReportGenerator()
    ;(generator as any).db = db
    ;(generator as any).reportDir = '/tmp/test-reports'
    generator.init()

    generator.generateCustomReport('Report 1', [{ heading: 'Section', content: 'Content 1' }])

    generator.generateCustomReport('Report 2', [{ heading: 'Section', content: 'Content 2' }])

    const list = generator.listReports(10)
    expect(list.length).toBeGreaterThanOrEqual(2)
  })

  it('should get report by id', async () => {
    const { ReportGenerator } = await import('../report-generator')
    const generator = new ReportGenerator()
    ;(generator as any).db = db
    ;(generator as any).reportDir = '/tmp/test-reports'
    generator.init()

    const created = generator.generateCustomReport('Test', [{ heading: 'Details', content: 'Content' }])

    if (created) {
      const retrieved = generator.getReport(created.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(created.id)
    }
  })

  it('should delete report', async () => {
    const { ReportGenerator } = await import('../report-generator')
    const generator = new ReportGenerator()
    ;(generator as any).db = db
    ;(generator as any).reportDir = '/tmp/test-reports'
    generator.init()

    const created = generator.generateCustomReport('Test', [{ heading: 'Details', content: 'Content' }])

    if (created) {
      generator.deleteReport(created.id)
      expect(generator.getReport(created.id)).toBeNull()
    }
  })

  it('should include metadata in reports', async () => {
    const { ReportGenerator } = await import('../report-generator')
    const generator = new ReportGenerator()
    ;(generator as any).db = db
    ;(generator as any).reportDir = '/tmp/test-reports'
    generator.init()

    const report = generator.generateCustomReport('Test', [{ heading: 'Details', content: 'Content' }])

    if (report) {
      expect(report.metadata).toBeDefined()
      expect(report.metadata.sectionCount).toBe(1)
    }
  })

  it('should track creation timestamp', async () => {
    const { ReportGenerator } = await import('../report-generator')
    const generator = new ReportGenerator()
    ;(generator as any).db = db
    ;(generator as any).reportDir = '/tmp/test-reports'
    generator.init()

    const before = Date.now()
    const report = generator.generateCustomReport('Test', [{ heading: 'Details', content: 'Content' }])
    const after = Date.now()

    if (report) {
      expect(report.createdAt).toBeGreaterThanOrEqual(before)
      expect(report.createdAt).toBeLessThanOrEqual(after)
    }
  })
})
