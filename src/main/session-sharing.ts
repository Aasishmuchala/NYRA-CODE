/**
 * Session Sharing — Export individual sessions as shareable JSON bundles
 */
import { memoryManager } from './memory'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

interface SharedSession {
  id: string
  sessionId: string
  title: string
  messageCount: number
  format: 'json' | 'markdown'
  filePath: string
  sizeBytes: number
  createdAt: number
}

export class SessionSharing {
  private db: any = null
  private shareDir: string = ''

  init(): void {
    try {
      this.db = (memoryManager as any).db
      this.shareDir = path.join(app.getPath('userData'), 'shared')
      if (!fs.existsSync(this.shareDir)) fs.mkdirSync(this.shareDir, { recursive: true })
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS shared_sessions (
          id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, title TEXT,
          messageCount INTEGER, format TEXT NOT NULL, filePath TEXT NOT NULL,
          sizeBytes INTEGER, createdAt INTEGER NOT NULL)`)
        console.log('[SessionSharing] Initialized')
      }
    } catch (error) {
      console.warn('[SessionSharing] Init error (non-fatal):', error)
    }
  }

  exportSession(sessionId: string, format: 'json' | 'markdown' = 'json'): SharedSession | null {
    if (!this.db) return null
    try {
      const session = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as any
      if (!session) return null
      const messages = this.db.prepare(`SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp ASC`).all(sessionId) as any[]
      const title = session.title || 'Untitled Session'

      let content: string
      let ext: string

      if (format === 'markdown') {
        ext = 'md'
        content = `# ${title}\n\n*Exported: ${new Date().toLocaleString()}*\n*Messages: ${messages.length}*\n\n---\n\n`
        for (const m of messages) {
          const role = (m.role || 'user').toUpperCase()
          const time = new Date(m.timestamp).toLocaleTimeString()
          content += `### ${role} (${time})\n\n${m.content}\n\n---\n\n`
        }
      } else {
        ext = 'json'
        content = JSON.stringify({
          session: { id: session.id, title, createdAt: session.createdAt, updatedAt: session.updatedAt },
          messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp })),
          exportedAt: Date.now(),
        }, null, 2)
      }

      const id = randomUUID()
      const fileName = `session-${sessionId.slice(0, 8)}-${Date.now()}.${ext}`
      const filePath = path.join(this.shareDir, fileName)
      fs.writeFileSync(filePath, content, 'utf-8')
      const sizeBytes = fs.statSync(filePath).size

      this.db.prepare(`INSERT INTO shared_sessions (id, sessionId, title, messageCount, format, filePath, sizeBytes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, sessionId, title, messages.length, format, filePath, sizeBytes, Date.now())

      return { id, sessionId, title, messageCount: messages.length, format, filePath, sizeBytes, createdAt: Date.now() }
    } catch (err) {
      console.warn('[SessionSharing] Export failed:', err)
      return null
    }
  }

  importSession(filePath: string): { success: boolean; sessionId?: string; messageCount?: number; error?: string } {
    if (!this.db) return { success: false, error: 'DB not initialized' }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw)
      if (!data.session || !data.messages) return { success: false, error: 'Invalid session file' }

      const sessionId = randomUUID()
      const now = Date.now()
      this.db.prepare(`INSERT INTO sessions (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)`)
        .run(sessionId, data.session.title || 'Imported Session', now, now)

      let imported = 0
      for (const m of data.messages) {
        const msgId = randomUUID()
        this.db.prepare(`INSERT INTO messages (id, sessionId, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`)
          .run(msgId, sessionId, m.role || 'user', m.content || '', m.timestamp || now)
        imported++
      }

      return { success: true, sessionId, messageCount: imported }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  listShared(limit: number = 20): SharedSession[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM shared_sessions ORDER BY createdAt DESC LIMIT ?`).all(limit) as any[]).map(r => ({
      id: r.id, sessionId: r.sessionId, title: r.title, messageCount: r.messageCount,
      format: r.format, filePath: r.filePath, sizeBytes: r.sizeBytes, createdAt: r.createdAt,
    }))
  }

  deleteShared(id: string): void {
    if (!this.db) return
    const row = this.db.prepare(`SELECT filePath FROM shared_sessions WHERE id = ?`).get(id) as any
    if (row?.filePath && fs.existsSync(row.filePath)) try { fs.unlinkSync(row.filePath) } catch {}
    this.db.prepare(`DELETE FROM shared_sessions WHERE id = ?`).run(id)
  }
}

export const sessionSharing = new SessionSharing()
