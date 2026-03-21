/**
 * Task Board (Kanban) — SQLite-backed task management with columns and agent assignment
 *
 * Columns: Backlog | Todo | In Progress | Review | Done
 * Each task can be assigned to an agent and linked to a conversation session.
 */

import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

interface TaskItem {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assignedAgent?: string
  sessionId?: string
  tags: string[]
  position: number
  createdAt: number
  updatedAt: number
  completedAt?: number
}

interface BoardStats {
  total: number
  byStatus: Record<TaskStatus, number>
  byPriority: Record<TaskPriority, number>
  completedToday: number
  avgCompletionTimeMs: number
}

// ── Task Board ───────────────────────────────────────────────────────────────

export class TaskBoard {
  private db: any = null

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS task_board (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'todo',
            priority TEXT DEFAULT 'medium',
            assignedAgent TEXT,
            sessionId TEXT,
            tags TEXT DEFAULT '[]',
            position INTEGER DEFAULT 0,
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL,
            completedAt INTEGER
          )
        `)
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_task_board_status ON task_board(status)`)
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_task_board_priority ON task_board(priority)`)
        console.log('[TaskBoard] Initialized')
      }
    } catch (error) {
      console.warn('[TaskBoard] Init error (non-fatal):', error)
    }
  }

  create(title: string, opts?: { description?: string; status?: TaskStatus; priority?: TaskPriority; assignedAgent?: string; sessionId?: string; tags?: string[] }): TaskItem {
    if (!this.db) throw new Error('DB not initialized')
    const id = randomUUID()
    const now = Date.now()
    const status = opts?.status || 'todo'
    const priority = opts?.priority || 'medium'
    const maxPos = (this.db.prepare(`SELECT MAX(position) as m FROM task_board WHERE status = ?`).get(status) as any)?.m || 0
    this.db.prepare(`
      INSERT INTO task_board (id, title, description, status, priority, assignedAgent, sessionId, tags, position, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, opts?.description || '', status, priority, opts?.assignedAgent || null, opts?.sessionId || null, JSON.stringify(opts?.tags || []), maxPos + 1, now, now)
    return this.get(id)!
  }

  update(id: string, updates: Partial<Pick<TaskItem, 'title' | 'description' | 'priority' | 'assignedAgent' | 'tags'>>): TaskItem | null {
    if (!this.db) return null
    const existing = this.get(id)
    if (!existing) return null
    const title = updates.title ?? existing.title
    const description = updates.description ?? existing.description
    const priority = updates.priority ?? existing.priority
    const assignedAgent = updates.assignedAgent !== undefined ? updates.assignedAgent : existing.assignedAgent
    const tags = updates.tags ?? existing.tags
    this.db.prepare(`
      UPDATE task_board SET title = ?, description = ?, priority = ?, assignedAgent = ?, tags = ?, updatedAt = ? WHERE id = ?
    `).run(title, description, priority, assignedAgent || null, JSON.stringify(tags), Date.now(), id)
    return this.get(id)
  }

  delete(id: string): void {
    if (!this.db) return
    this.db.prepare(`DELETE FROM task_board WHERE id = ?`).run(id)
  }

  get(id: string): TaskItem | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM task_board WHERE id = ?`).get(id) as any
    return row ? this.rowToTask(row) : null
  }

  moveToStatus(id: string, newStatus: TaskStatus, position?: number): TaskItem | null {
    if (!this.db) return null
    const now = Date.now()
    const pos = position ?? ((this.db.prepare(`SELECT MAX(position) as m FROM task_board WHERE status = ?`).get(newStatus) as any)?.m || 0) + 1
    const completedAt = newStatus === 'done' ? now : null
    this.db.prepare(`
      UPDATE task_board SET status = ?, position = ?, updatedAt = ?, completedAt = COALESCE(?, completedAt) WHERE id = ?
    `).run(newStatus, pos, now, completedAt, id)
    return this.get(id)
  }

  reorder(id: string, newPosition: number): void {
    if (!this.db) return
    this.db.prepare(`UPDATE task_board SET position = ?, updatedAt = ? WHERE id = ?`).run(newPosition, Date.now(), id)
  }

  listByStatus(status?: TaskStatus): TaskItem[] {
    if (!this.db) return []
    if (status) {
      return (this.db.prepare(`SELECT * FROM task_board WHERE status = ? ORDER BY position ASC`).all(status) as any[]).map(r => this.rowToTask(r))
    }
    return (this.db.prepare(`SELECT * FROM task_board ORDER BY status, position ASC`).all() as any[]).map(r => this.rowToTask(r))
  }

  listAll(): TaskItem[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM task_board ORDER BY position ASC`).all() as any[]).map(r => this.rowToTask(r))
  }

  getBoard(): Record<TaskStatus, TaskItem[]> {
    const all = this.listAll()
    const board: Record<TaskStatus, TaskItem[]> = { backlog: [], todo: [], in_progress: [], review: [], done: [] }
    for (const task of all) {
      if (board[task.status]) board[task.status].push(task)
    }
    return board
  }

  search(query: string): TaskItem[] {
    if (!this.db) return []
    const q = `%${query}%`
    return (this.db.prepare(`SELECT * FROM task_board WHERE title LIKE ? OR description LIKE ? OR tags LIKE ? ORDER BY updatedAt DESC`).all(q, q, q) as any[]).map(r => this.rowToTask(r))
  }

  getStats(): BoardStats {
    if (!this.db) return { total: 0, byStatus: { backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0 }, byPriority: { low: 0, medium: 0, high: 0, critical: 0 }, completedToday: 0, avgCompletionTimeMs: 0 }

    const all = this.listAll()
    const byStatus: Record<TaskStatus, number> = { backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0 }
    const byPriority: Record<TaskPriority, number> = { low: 0, medium: 0, high: 0, critical: 0 }

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    let completedToday = 0
    const completionTimes: number[] = []

    for (const t of all) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1
      if (t.completedAt && t.completedAt >= todayStart.getTime()) completedToday++
      if (t.completedAt) completionTimes.push(t.completedAt - t.createdAt)
    }

    const avgCompletionTimeMs = completionTimes.length > 0 ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length : 0

    return { total: all.length, byStatus, byPriority, completedToday, avgCompletionTimeMs }
  }

  private rowToTask(row: any): TaskItem {
    let tags: string[] = []
    try { tags = JSON.parse(row.tags || '[]') } catch { /* ignore */ }
    return {
      id: row.id,
      title: row.title,
      description: row.description || '',
      status: row.status as TaskStatus,
      priority: row.priority as TaskPriority,
      assignedAgent: row.assignedAgent || undefined,
      sessionId: row.sessionId || undefined,
      tags,
      position: row.position,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt || undefined,
    }
  }
}

export const taskBoard = new TaskBoard()
