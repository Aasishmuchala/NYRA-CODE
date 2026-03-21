/**
 * File Attachment & Multimodal Input — Handle file uploads, base64 encoding, previews
 *
 * Supports images (PNG, JPG, GIF, WebP), PDFs, text files, and code files.
 * Stores attachment metadata in SQLite, files on disk in temp directory.
 */

import { memoryManager } from './memory'
import { randomUUID } from 'crypto'
import { readFile, stat, mkdir } from 'fs/promises'
import { join, extname, basename } from 'path'
import { app } from 'electron'

// ── Types ────────────────────────────────────────────────────────────────────

interface Attachment {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  category: 'image' | 'document' | 'code' | 'data' | 'other'
  sessionId?: string
  base64Preview?: string       // small preview for images (thumbnailed)
  filePath: string             // path on disk
  createdAt: number
}

interface AttachmentStats {
  totalFiles: number
  totalSizeBytes: number
  byCategory: Record<string, number>
}

// ── MIME detection ───────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
  '.json': 'application/json', '.xml': 'application/xml',
  '.ts': 'text/typescript', '.tsx': 'text/typescript', '.js': 'text/javascript',
  '.jsx': 'text/javascript', '.py': 'text/x-python', '.go': 'text/x-go',
  '.rs': 'text/x-rust', '.java': 'text/x-java', '.cpp': 'text/x-c++',
  '.c': 'text/x-c', '.rb': 'text/x-ruby', '.sh': 'text/x-shellscript',
  '.yaml': 'text/yaml', '.yml': 'text/yaml', '.html': 'text/html', '.css': 'text/css',
  '.zip': 'application/zip', '.tar': 'application/x-tar', '.gz': 'application/gzip',
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'])
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.rb', '.sh', '.html', '.css'])
const DATA_EXTS = new Set(['.csv', '.json', '.xml', '.yaml', '.yml'])

function detectCategory(ext: string): 'image' | 'document' | 'code' | 'data' | 'other' {
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (CODE_EXTS.has(ext)) return 'code'
  if (DATA_EXTS.has(ext)) return 'data'
  if (['.pdf', '.doc', '.docx', '.txt', '.md'].includes(ext)) return 'document'
  return 'other'
}

// ── File Attachment Manager ──────────────────────────────────────────────────

export class FileAttachmentManager {
  private db: any = null
  private storageDir: string = ''

  init(): void {
    try {
      this.db = (memoryManager as any).db
      this.storageDir = join(app.getPath('userData'), 'attachments')

      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS file_attachments (
            id TEXT PRIMARY KEY, fileName TEXT NOT NULL, mimeType TEXT NOT NULL,
            sizeBytes INTEGER NOT NULL, category TEXT DEFAULT 'other',
            sessionId TEXT, base64Preview TEXT, filePath TEXT NOT NULL,
            createdAt INTEGER NOT NULL)`)
        run(`CREATE INDEX IF NOT EXISTS idx_attach_session ON file_attachments(sessionId)`)
        run(`CREATE INDEX IF NOT EXISTS idx_attach_ts ON file_attachments(createdAt)`)

        // Ensure storage dir exists (async fire-and-forget)
        mkdir(this.storageDir, { recursive: true }).catch(() => {})
        console.log('[FileAttachment] Initialized')
      }
    } catch (error) {
      console.warn('[FileAttachment] Init error (non-fatal):', error)
    }
  }

  // ── Process file from path ────────────────────────────────────────────────

  async processFile(filePath: string, sessionId?: string): Promise<Attachment> {
    const stats = await stat(filePath)
    const ext = extname(filePath).toLowerCase()
    const fileName = basename(filePath)
    const mimeType = MIME_MAP[ext] || 'application/octet-stream'
    const category = detectCategory(ext)
    const id = randomUUID()

    // Read file for base64 preview (images only, max 500KB for preview)
    let base64Preview: string | undefined
    if (category === 'image' && stats.size < 512000) {
      try {
        const buf = await readFile(filePath)
        base64Preview = `data:${mimeType};base64,${buf.toString('base64')}`
      } catch { /* non-fatal */ }
    }

    const attachment: Attachment = {
      id,
      fileName,
      mimeType,
      sizeBytes: stats.size,
      category,
      sessionId,
      base64Preview,
      filePath,
      createdAt: Date.now(),
    }

    this.saveAttachment(attachment)
    return attachment
  }

  // ── Process raw buffer (e.g. from clipboard) ─────────────────────────────

  async processBuffer(buffer: Buffer, fileName: string, mimeType: string, sessionId?: string): Promise<Attachment> {
    const id = randomUUID()
    const ext = extname(fileName).toLowerCase()
    const category = detectCategory(ext)

    // Save to disk
    await mkdir(this.storageDir, { recursive: true }).catch(() => {})
    const destPath = join(this.storageDir, `${id}${ext}`)
    const { writeFile } = await import('fs/promises')
    await writeFile(destPath, buffer)

    let base64Preview: string | undefined
    if (category === 'image' && buffer.length < 512000) {
      base64Preview = `data:${mimeType};base64,${buffer.toString('base64')}`
    }

    const attachment: Attachment = {
      id,
      fileName,
      mimeType,
      sizeBytes: buffer.length,
      category,
      sessionId,
      base64Preview,
      filePath: destPath,
      createdAt: Date.now(),
    }

    this.saveAttachment(attachment)
    return attachment
  }

  // ── Read file content ─────────────────────────────────────────────────────

  async readFileContent(attachmentId: string): Promise<{ text?: string; base64?: string; mimeType: string } | null> {
    const attachment = this.get(attachmentId)
    if (!attachment) return null

    try {
      const buf = await readFile(attachment.filePath)
      if (attachment.category === 'image') {
        return { base64: buf.toString('base64'), mimeType: attachment.mimeType }
      }
      // Text-based files
      return { text: buf.toString('utf-8'), mimeType: attachment.mimeType }
    } catch {
      return null
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  get(id: string): Attachment | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM file_attachments WHERE id = ?`).get(id) as any
    return row ? this.rowToAttachment(row) : null
  }

  listBySession(sessionId: string): Attachment[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM file_attachments WHERE sessionId = ? ORDER BY createdAt DESC`).all(sessionId) as any[]).map(r => this.rowToAttachment(r))
  }

  listRecent(limit: number = 20): Attachment[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM file_attachments ORDER BY createdAt DESC LIMIT ?`).all(limit) as any[]).map(r => this.rowToAttachment(r))
  }

  delete(id: string): void {
    if (!this.db) return
    this.db.prepare(`DELETE FROM file_attachments WHERE id = ?`).run(id)
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats(): AttachmentStats {
    if (!this.db) return { totalFiles: 0, totalSizeBytes: 0, byCategory: {} }
    const total = (this.db.prepare(`SELECT COUNT(*) as c FROM file_attachments`).get() as any)?.c || 0
    const size = (this.db.prepare(`SELECT SUM(sizeBytes) as s FROM file_attachments`).get() as any)?.s || 0
    const cats = this.db.prepare(`SELECT category, COUNT(*) as c FROM file_attachments GROUP BY category`).all() as any[]
    const byCategory: Record<string, number> = {}
    for (const c of cats) byCategory[c.category] = c.c
    return { totalFiles: total, totalSizeBytes: size, byCategory }
  }

  // ── Supported formats ─────────────────────────────────────────────────────

  getSupportedFormats(): { images: string[]; documents: string[]; code: string[]; data: string[] } {
    return {
      images: [...IMAGE_EXTS],
      documents: ['.pdf', '.doc', '.docx', '.txt', '.md'],
      code: [...CODE_EXTS],
      data: [...DATA_EXTS],
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private saveAttachment(a: Attachment): void {
    if (!this.db) return
    try {
      this.db.prepare(`INSERT INTO file_attachments (id, fileName, mimeType, sizeBytes, category, sessionId, base64Preview, filePath, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(a.id, a.fileName, a.mimeType, a.sizeBytes, a.category, a.sessionId || null, a.base64Preview || null, a.filePath, a.createdAt)
    } catch { /* non-fatal */ }
  }

  private rowToAttachment(row: any): Attachment {
    return {
      id: row.id, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes,
      category: row.category, sessionId: row.sessionId || undefined,
      base64Preview: row.base64Preview || undefined, filePath: row.filePath, createdAt: row.createdAt,
    }
  }
}

export const fileAttachment = new FileAttachmentManager()
