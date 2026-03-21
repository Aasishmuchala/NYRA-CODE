/**
 * Report Generator — Generate markdown/HTML reports from agent runs, sessions, analytics
 */
import { memoryManager } from './memory'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

interface Report {
  id: string
  title: string
  type: 'session' | 'agent' | 'analytics' | 'custom'
  format: 'markdown' | 'html'
  content: string
  metadata: Record<string, any>
  createdAt: number
}

export class ReportGenerator {
  private db: any = null
  private reportDir: string = ''

  init(): void {
    try {
      this.db = (memoryManager as any).db
      this.reportDir = path.join(app.getPath('userData'), 'reports')
      if (!fs.existsSync(this.reportDir)) fs.mkdirSync(this.reportDir, { recursive: true })
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS generated_reports (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL,
          format TEXT NOT NULL, filePath TEXT, metadata TEXT,
          createdAt INTEGER NOT NULL)`)
        console.log('[ReportGenerator] Initialized')
      }
    } catch (error) {
      console.warn('[ReportGenerator] Init error (non-fatal):', error)
    }
  }

  generateSessionReport(sessionId?: string): Report {
    const title = sessionId ? `Session Report — ${sessionId.slice(0, 8)}` : 'All Sessions Report'
    let md = `# ${title}\n\n*Generated: ${new Date().toLocaleString()}*\n\n`

    if (this.db) {
      try {
        // Session summary
        const sessions = sessionId
          ? this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).all(sessionId) as any[]
          : this.db.prepare(`SELECT * FROM sessions ORDER BY updatedAt DESC LIMIT 10`).all() as any[]

        md += `## Sessions (${sessions.length})\n\n`
        for (const s of sessions) {
          md += `### ${s.title || 'Untitled'}\n`
          md += `- **ID:** \`${s.id}\`\n`
          md += `- **Created:** ${new Date(s.createdAt).toLocaleString()}\n`
          md += `- **Updated:** ${new Date(s.updatedAt).toLocaleString()}\n\n`
        }

        // Message count per session
        if (sessionId) {
          const msgCount = (this.db.prepare(`SELECT COUNT(*) as c FROM messages WHERE sessionId = ?`).get(sessionId) as any)?.c || 0
          md += `**Total Messages:** ${msgCount}\n\n`
        }
      } catch {}
    }

    return this.saveReport(title, 'session', 'markdown', md, { sessionId })
  }

  generateAnalyticsReport(hours: number = 24): Report {
    const title = `Analytics Report — Last ${hours}h`
    const since = Date.now() - hours * 3600000
    let md = `# ${title}\n\n*Generated: ${new Date().toLocaleString()}*\n\n`

    if (this.db) {
      try {
        // Activity summary
        const activityCount = (this.db.prepare(`SELECT COUNT(*) as c FROM activity_feed WHERE timestamp >= ?`).get(since) as any)?.c || 0
        md += `## Activity Summary\n\n- **Total Events:** ${activityCount}\n`

        const byType = this.db.prepare(`SELECT type, COUNT(*) as c FROM activity_feed WHERE timestamp >= ? GROUP BY type ORDER BY c DESC`).all(since) as any[]
        if (byType.length > 0) {
          md += '\n| Type | Count |\n|------|-------|\n'
          for (const r of byType) md += `| ${r.type} | ${r.c} |\n`
        }

        // Task summary
        const taskStats = this.db.prepare(`SELECT status, COUNT(*) as c FROM task_board GROUP BY status`).all() as any[]
        if (taskStats.length > 0) {
          md += '\n## Task Board\n\n| Status | Count |\n|--------|-------|\n'
          for (const r of taskStats) md += `| ${r.status} | ${r.c} |\n`
        }

        // Search activity
        const searchCount = (this.db.prepare(`SELECT COUNT(*) as c FROM search_history WHERE timestamp >= ?`).get(since) as any)?.c || 0
        md += `\n## Search Activity\n\n- **Searches:** ${searchCount}\n`
      } catch {}
    }

    return this.saveReport(title, 'analytics', 'markdown', md, { hours })
  }

  generateCustomReport(title: string, sections: Array<{ heading: string; content: string }>): Report {
    let md = `# ${title}\n\n*Generated: ${new Date().toLocaleString()}*\n\n`
    for (const s of sections) {
      md += `## ${s.heading}\n\n${s.content}\n\n`
    }
    return this.saveReport(title, 'custom', 'markdown', md, { sectionCount: sections.length })
  }

  getReport(id: string): Report | null {
    if (!this.db) return null
    try {
      const row = this.db.prepare(`SELECT * FROM generated_reports WHERE id = ?`).get(id) as any
      if (!row) return null
      const content = row.filePath && fs.existsSync(row.filePath) ? fs.readFileSync(row.filePath, 'utf-8') : ''
      return { id: row.id, title: row.title, type: row.type, format: row.format, content, metadata: JSON.parse(row.metadata || '{}'), createdAt: row.createdAt }
    } catch { return null }
  }

  listReports(limit: number = 20): Array<Omit<Report, 'content'>> {
    if (!this.db) return []
    try {
      const rows = this.db.prepare(`SELECT id, title, type, format, metadata, createdAt FROM generated_reports ORDER BY createdAt DESC LIMIT ?`).all(limit) as any[]
      return rows.map(r => ({ id: r.id, title: r.title, type: r.type, format: r.format, metadata: JSON.parse(r.metadata || '{}'), createdAt: r.createdAt }))
    } catch { return [] }
  }

  deleteReport(id: string): void {
    if (!this.db) return
    try {
      const row = this.db.prepare(`SELECT filePath FROM generated_reports WHERE id = ?`).get(id) as any
      if (row?.filePath && fs.existsSync(row.filePath)) fs.unlinkSync(row.filePath)
      this.db.prepare(`DELETE FROM generated_reports WHERE id = ?`).run(id)
    } catch {}
  }

  private saveReport(title: string, type: Report['type'], format: Report['format'], content: string, metadata: Record<string, any>): Report {
    const id = randomUUID()
    const ext = format === 'html' ? 'html' : 'md'
    const fileName = `report-${id.slice(0, 8)}.${ext}`
    const filePath = path.join(this.reportDir, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')

    if (this.db) {
      try {
        this.db.prepare(`INSERT INTO generated_reports (id, title, type, format, filePath, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(id, title, type, format, filePath, JSON.stringify(metadata), Date.now())
      } catch {}
    }

    return { id, title, type, format, content, metadata, createdAt: Date.now() }
  }
}

export const reportGenerator = new ReportGenerator()
