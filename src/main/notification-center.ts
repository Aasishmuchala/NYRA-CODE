/**
 * NotificationCenter — Persistent notification hub for Nyra Desktop
 *
 * Provides a centralized system for managing notifications across the app with:
 * - Categories: agent, system, error, security, memory, provider, task
 * - Severity levels: info, warning, error, success
 * - Read/unread state tracking
 * - Dismissal and action support
 * - Search and filtering capabilities
 */

import { memoryManager } from './memory'

// ── Types ────────────────────────────────────────────────────────────────────

export type NotificationCategory = 'agent' | 'system' | 'error' | 'security' | 'memory' | 'provider' | 'task'
export type NotificationSeverity = 'info' | 'warning' | 'error' | 'success'

export interface Notification {
  id: string
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  body?: string
  source?: string
  sourceId?: string
  actionType?: string
  actionPayload?: string
  read: boolean
  dismissed: boolean
  createdAt: number
  readAt?: number
}

export interface PushOptions {
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  body?: string
  source?: string
  sourceId?: string
  actionType?: string
  actionPayload?: string
}

export interface ListOptions {
  category?: NotificationCategory
  unreadOnly?: boolean
  limit?: number
  offset?: number
}

export interface NotificationStats {
  total: number
  unread: number
  byCategory: Record<NotificationCategory, number>
  bySeverity: Record<NotificationSeverity, number>
}

// ── NotificationCenter ───────────────────────────────────────────────────────

class NotificationCenter {
  private initialized = false

  /**
   * Initialize the notification system
   * Creates table and indexes if they don't exist
   */
  init(): void {
    if (this.initialized) return

    const db = (memoryManager as any).db
    if (!db) {
      console.warn('[NotificationCenter] Database not available')
      return
    }

    try {
      // Create notifications table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT,
          source TEXT,
          sourceId TEXT,
          actionType TEXT,
          actionPayload TEXT,
          read INTEGER DEFAULT 0,
          dismissed INTEGER DEFAULT 0,
          createdAt INTEGER NOT NULL,
          readAt INTEGER
        )
      `).run()

      // Create indexes for common queries
      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_notifications_category
        ON notifications(category)
      `).run()

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_notifications_read
        ON notifications(read)
      `).run()

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_notifications_created
        ON notifications(createdAt DESC)
      `).run()

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_notifications_category_read
        ON notifications(category, read)
      `).run()

      this.initialized = true
      console.log('[NotificationCenter] Initialized')
    } catch (err) {
      console.error('[NotificationCenter] Failed to initialize:', err)
    }
  }

  /**
   * Push a new notification
   */
  push(opts: PushOptions): Notification {
    const db = (memoryManager as any).db
    if (!db) throw new Error('Database not available')

    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const createdAt = Date.now()

    db.prepare(`
      INSERT INTO notifications (
        id, category, severity, title, body, source, sourceId,
        actionType, actionPayload, read, dismissed, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `).run(
      id,
      opts.category,
      opts.severity,
      opts.title,
      opts.body || null,
      opts.source || null,
      opts.sourceId || null,
      opts.actionType || null,
      opts.actionPayload || null,
      createdAt
    )

    return {
      id,
      category: opts.category,
      severity: opts.severity,
      title: opts.title,
      body: opts.body,
      source: opts.source,
      sourceId: opts.sourceId,
      actionType: opts.actionType,
      actionPayload: opts.actionPayload,
      read: false,
      dismissed: false,
      createdAt,
    }
  }

  /**
   * List notifications with optional filtering
   */
  list(opts?: ListOptions): Notification[] {
    const db = (memoryManager as any).db
    if (!db) return []

    let sql = 'SELECT * FROM notifications WHERE dismissed = 0'
    const params: any[] = []

    if (opts?.category) {
      sql += ' AND category = ?'
      params.push(opts.category)
    }

    if (opts?.unreadOnly) {
      sql += ' AND read = 0'
    }

    sql += ' ORDER BY createdAt DESC'

    if (opts?.limit) {
      sql += ' LIMIT ?'
      params.push(opts.limit)
    }

    if (opts?.offset) {
      sql += ' OFFSET ?'
      params.push(opts.offset)
    }

    const rows = db.prepare(sql).all(...params) || []
    return rows.map(this.rowToNotification)
  }

  /**
   * Mark a single notification as read
   */
  markRead(id: string): void {
    const db = (memoryManager as any).db
    if (!db) return

    db.prepare(`
      UPDATE notifications
      SET read = 1, readAt = ?
      WHERE id = ?
    `).run(Date.now(), id)
  }

  /**
   * Mark all notifications as read, optionally filtered by category
   */
  markAllRead(category?: NotificationCategory): void {
    const db = (memoryManager as any).db
    if (!db) return

    const params: (string | number)[] = [Date.now()]
    let sql = 'UPDATE notifications SET read = 1, readAt = ? WHERE dismissed = 0'

    if (category) {
      sql += ' AND category = ?'
      params.push(category)
    }

    db.prepare(sql).run(...params)
  }

  /**
   * Dismiss a single notification (soft delete)
   */
  dismiss(id: string): void {
    const db = (memoryManager as any).db
    if (!db) return

    db.prepare(`
      UPDATE notifications
      SET dismissed = 1
      WHERE id = ?
    `).run(id)
  }

  /**
   * Dismiss all notifications, optionally filtered by category
   */
  dismissAll(category?: NotificationCategory): void {
    const db = (memoryManager as any).db
    if (!db) return

    const params: any[] = []
    let sql = 'UPDATE notifications SET dismissed = 1 WHERE dismissed = 0'

    if (category) {
      sql += ' AND category = ?'
      params.push(category)
    }

    db.prepare(sql).run(...params)
  }

  /**
   * Get count of unread notifications, optionally by category
   */
  getUnreadCount(category?: NotificationCategory): number {
    const db = (memoryManager as any).db
    if (!db) return 0

    const params: any[] = []
    let sql = 'SELECT COUNT(*) as count FROM notifications WHERE read = 0 AND dismissed = 0'

    if (category) {
      sql += ' AND category = ?'
      params.push(category)
    }

    const result = db.prepare(sql).get(...params)
    return result?.count || 0
  }

  /**
   * Get unread counts for each category
   */
  getUnreadCounts(): Record<NotificationCategory, number> {
    const db = (memoryManager as any).db
    if (!db) return {} as Record<NotificationCategory, number>

    const categories: NotificationCategory[] = ['agent', 'system', 'error', 'security', 'memory', 'provider', 'task']
    const counts: Record<NotificationCategory, number> = {} as any

    for (const category of categories) {
      counts[category] = this.getUnreadCount(category)
    }

    return counts
  }

  /**
   * Permanently delete a notification
   */
  delete(id: string): void {
    const db = (memoryManager as any).db
    if (!db) return

    db.prepare('DELETE FROM notifications WHERE id = ?').run(id)
  }

  /**
   * Prune old notifications (default: keep last 30 days)
   */
  prune(daysToKeep: number = 30): number {
    const db = (memoryManager as any).db
    if (!db) return 0

    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000
    const result = db.prepare(`
      DELETE FROM notifications
      WHERE createdAt < ? AND dismissed = 1
    `).run(cutoffTime)

    return result?.changes || 0
  }

  /**
   * Search notifications by title and body
   */
  search(query: string): Notification[] {
    const db = (memoryManager as any).db
    if (!db) return []

    const searchQuery = `%${query}%`
    const rows = db.prepare(`
      SELECT * FROM notifications
      WHERE dismissed = 0 AND (title LIKE ? OR body LIKE ?)
      ORDER BY createdAt DESC
    `).all(searchQuery, searchQuery) || []

    return rows.map(this.rowToNotification)
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): NotificationStats {
    const db = (memoryManager as any).db
    if (!db) {
      return {
        total: 0,
        unread: 0,
        byCategory: {} as Record<NotificationCategory, number>,
        bySeverity: {} as Record<NotificationSeverity, number>,
      }
    }

    // Total count
    const totalResult = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE dismissed = 0'
    ).get()
    const total = totalResult?.count || 0

    // Unread count
    const unreadResult = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE read = 0 AND dismissed = 0'
    ).get()
    const unread = unreadResult?.count || 0

    // By category
    const byCategory: Record<NotificationCategory, number> = {} as any
    const categories: NotificationCategory[] = ['agent', 'system', 'error', 'security', 'memory', 'provider', 'task']
    for (const category of categories) {
      const result = db.prepare(
        'SELECT COUNT(*) as count FROM notifications WHERE category = ? AND dismissed = 0'
      ).get(category)
      byCategory[category] = result?.count || 0
    }

    // By severity
    const bySeverity: Record<NotificationSeverity, number> = {} as any
    const severities: NotificationSeverity[] = ['info', 'warning', 'error', 'success']
    for (const severity of severities) {
      const result = db.prepare(
        'SELECT COUNT(*) as count FROM notifications WHERE severity = ? AND dismissed = 0'
      ).get(severity)
      bySeverity[severity] = result?.count || 0
    }

    return { total, unread, byCategory, bySeverity }
  }

  /**
   * Convert database row to Notification object
   */
  private rowToNotification(row: any): Notification {
    return {
      id: row.id,
      category: row.category,
      severity: row.severity,
      title: row.title,
      body: row.body,
      source: row.source,
      sourceId: row.sourceId,
      actionType: row.actionType,
      actionPayload: row.actionPayload,
      read: row.read === 1,
      dismissed: row.dismissed === 1,
      createdAt: row.createdAt,
      readAt: row.readAt,
    }
  }
}

// ── Export singleton ─────────────────────────────────────────────────────────

export const notificationCenter = new NotificationCenter()
