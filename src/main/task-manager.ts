import { memory } from './memory'
import { eventBus } from './event-bus'

/**
 * Task Manager for Nyra Desktop
 * Handles task CRUD operations, state machine transitions, and persistence to SQLite
 */

export type TaskStatus =
  | 'intake' | 'planning' | 'gathering_context' | 'delegation'
  | 'execution' | 'verification' | 'awaiting_approval'
  | 'finalizing' | 'completed' | 'failed' | 'paused' | 'cancelled'

export type TaskMode = 'solo' | 'subagent' | 'team'

export interface Task {
  id: string
  projectId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: number
  mode: TaskMode
  model: string | null
  folderScope: string[]
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  error: string | null
  summary: string | null
  parentTask: string | null
  assignedAgent: string | null
}

export interface TaskEvent {
  id: string
  taskId: string
  eventType: string
  agentId: string | null
  data: any
  timestamp: number
}

export interface TaskArtifact {
  id: string
  taskId: string
  name: string
  type: string | null
  path: string | null
  content: string | null
  createdAt: number
}

export interface TaskApproval {
  id: string
  taskId: string
  requiredFrom: string
  status: 'pending' | 'approved' | 'rejected'
  comment: string | null
  createdAt: number
  respondedAt: number | null
}

export interface CreateTaskInput {
  title: string
  description?: string
  projectId?: string
  priority?: number
  mode?: TaskMode
  model?: string
  folderScope?: string[]
  parentTask?: string
}

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  intake:             ['planning', 'cancelled'],
  planning:           ['gathering_context', 'execution', 'failed', 'cancelled'],
  gathering_context:  ['delegation', 'execution', 'failed', 'cancelled'],
  delegation:         ['execution', 'failed', 'cancelled'],
  execution:          ['verification', 'awaiting_approval', 'finalizing', 'completed', 'failed', 'paused', 'cancelled'],
  verification:       ['finalizing', 'execution', 'failed', 'paused', 'cancelled'],
  awaiting_approval:  ['execution', 'failed', 'cancelled'],
  finalizing:         ['completed', 'failed'],
  completed:          [],
  failed:             ['planning'],
  paused:             ['planning', 'execution', 'cancelled'],
  cancelled:          [],
}

/**
 * Initialize database schema on module load
 */
function initializeSchema(): void {
  try {
    memory.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'intake',
        priority INTEGER NOT NULL DEFAULT 0,
        mode TEXT NOT NULL DEFAULT 'solo',
        model TEXT,
        folderScope TEXT NOT NULL DEFAULT '[]',
        createdAt INTEGER NOT NULL,
        startedAt INTEGER,
        completedAt INTEGER,
        error TEXT,
        summary TEXT,
        parentTask TEXT,
        assignedAgent TEXT
      )
    `)

    memory.run(`
      CREATE TABLE IF NOT EXISTS task_events (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        eventType TEXT NOT NULL,
        agentId TEXT,
        data TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY(taskId) REFERENCES tasks(id)
      )
    `)

    memory.run(`
      CREATE TABLE IF NOT EXISTS task_artifacts (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        path TEXT,
        content TEXT,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(taskId) REFERENCES tasks(id)
      )
    `)

    memory.run(`
      CREATE TABLE IF NOT EXISTS task_approvals (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        requiredFrom TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        comment TEXT,
        createdAt INTEGER NOT NULL,
        respondedAt INTEGER,
        FOREIGN KEY(taskId) REFERENCES tasks(id)
      )
    `)

    memory.run(`
      CREATE TABLE IF NOT EXISTS task_notes (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        note TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(taskId) REFERENCES tasks(id)
      )
    `)

    memory.run(`
      CREATE INDEX IF NOT EXISTS idx_tasks_projectId ON tasks(projectId)
    `)

    memory.run(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)
    `)

    memory.run(`
      CREATE INDEX IF NOT EXISTS idx_task_events_taskId ON task_events(taskId)
    `)

    memory.run(`
      CREATE INDEX IF NOT EXISTS idx_task_artifacts_taskId ON task_artifacts(taskId)
    `)

    memory.run(`
      CREATE INDEX IF NOT EXISTS idx_task_approvals_taskId ON task_approvals(taskId)
    `)

    memory.run(`
      CREATE INDEX IF NOT EXISTS idx_task_notes_taskId ON task_notes(taskId)
    `)
  } catch (err) {
    console.error('Failed to initialize task schema:', err)
  }
}

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Generate a unique artifact ID
 */
function generateArtifactId(): string {
  return `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Generate a unique approval ID
 */
function generateApprovalId(): string {
  return `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Parse a task row from SQLite into a Task object
 */
function parseTask(row: any): Task {
  return {
    id: row.id,
    projectId: row.projectId || null,
    title: row.title,
    description: row.description || null,
    status: row.status as TaskStatus,
    priority: row.priority,
    mode: row.mode as TaskMode,
    model: row.model || null,
    folderScope: JSON.parse(row.folderScope || '[]'),
    createdAt: row.createdAt,
    startedAt: row.startedAt || null,
    completedAt: row.completedAt || null,
    error: row.error || null,
    summary: row.summary || null,
    parentTask: row.parentTask || null,
    assignedAgent: row.assignedAgent || null,
  }
}

/**
 * Parse a task event row from SQLite
 */
function parseTaskEvent(row: any): TaskEvent {
  return {
    id: row.id,
    taskId: row.taskId,
    eventType: row.eventType,
    agentId: row.agentId || null,
    data: row.data ? JSON.parse(row.data) : null,
    timestamp: row.timestamp,
  }
}

/**
 * Parse a task artifact row from SQLite
 */
function parseTaskArtifact(row: any): TaskArtifact {
  return {
    id: row.id,
    taskId: row.taskId,
    name: row.name,
    type: row.type || null,
    path: row.path || null,
    content: row.content || null,
    createdAt: row.createdAt,
  }
}

/**
 * Parse a task approval row from SQLite
 */
function parseTaskApproval(row: any): TaskApproval {
  return {
    id: row.id,
    taskId: row.taskId,
    requiredFrom: row.requiredFrom,
    status: row.status as 'pending' | 'approved' | 'rejected',
    comment: row.comment || null,
    createdAt: row.createdAt,
    respondedAt: row.respondedAt || null,
  }
}

/**
 * Create a new task
 */
export function createTask(input: CreateTaskInput): Task {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error('Task title is required')
  }

  const taskId = generateTaskId()
  const now = Date.now()
  const folderScope = input.folderScope || []
  const priority = input.priority ?? 0
  const mode = input.mode || 'solo'

  memory.run(
    `INSERT INTO tasks (
      id, projectId, title, description, status, priority, mode, model,
      folderScope, createdAt, startedAt, completedAt, error, summary, parentTask, assignedAgent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      taskId,
      input.projectId || null,
      input.title.trim(),
      input.description || null,
      'intake',
      priority,
      mode,
      input.model || null,
      JSON.stringify(folderScope),
      now,
      null,
      null,
      null,
      null,
      input.parentTask || null,
      null,
    ]
  )

  const task = getTask(taskId)!
  eventBus.emit('task:created', { task })

  return task
}

/**
 * Get a single task by ID
 */
export function getTask(taskId: string): Task | null {
  const row = memory.queryOne('SELECT * FROM tasks WHERE id = ?', [taskId])
  return row ? parseTask(row) : null
}

/**
 * List all tasks, optionally filtered by project ID
 */
export function listTasks(projectId?: string): Task[] {
  let query = 'SELECT * FROM tasks'
  const params: any[] = []

  if (projectId) {
    query += ' WHERE projectId = ?'
    params.push(projectId)
  }

  query += ' ORDER BY priority DESC, createdAt DESC'

  const rows = memory.queryAll(query, params)
  return rows.map(parseTask)
}

/**
 * Update a task with partial data
 */
export function updateTask(taskId: string, patch: Partial<Task>): Task {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  const updates: string[] = []
  const values: any[] = []

  if (patch.title !== undefined) {
    updates.push('title = ?')
    values.push(patch.title)
  }

  if (patch.description !== undefined) {
    updates.push('description = ?')
    values.push(patch.description)
  }

  if (patch.priority !== undefined) {
    updates.push('priority = ?')
    values.push(patch.priority)
  }

  if (patch.mode !== undefined) {
    updates.push('mode = ?')
    values.push(patch.mode)
  }

  if (patch.model !== undefined) {
    updates.push('model = ?')
    values.push(patch.model)
  }

  if (patch.folderScope !== undefined) {
    updates.push('folderScope = ?')
    values.push(JSON.stringify(patch.folderScope))
  }

  if (patch.error !== undefined) {
    updates.push('error = ?')
    values.push(patch.error)
  }

  if (patch.summary !== undefined) {
    updates.push('summary = ?')
    values.push(patch.summary)
  }

  if (patch.assignedAgent !== undefined) {
    updates.push('assignedAgent = ?')
    values.push(patch.assignedAgent)
  }

  if (updates.length === 0) {
    return task
  }

  values.push(taskId)
  const query = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`
  memory.run(query, values)

  const updated = getTask(taskId)!
  eventBus.emit('task:updated', { task: updated, patch })

  return updated
}

/**
 * Transition a task to a new status with validation
 */
export function transitionTask(
  taskId: string,
  newStatus: TaskStatus,
  data?: any
): Task {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  const validTransitions = VALID_TRANSITIONS[task.status]
  if (!validTransitions.includes(newStatus)) {
    throw new Error(
      `Invalid transition from ${task.status} to ${newStatus}. Valid transitions: ${validTransitions.join(', ')}`
    )
  }

  const updates: Record<string, any> = { status: newStatus }

  if (newStatus === 'execution' && task.startedAt === null) {
    updates.startedAt = Date.now()
  }

  if (
    (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'cancelled') &&
    task.completedAt === null
  ) {
    updates.completedAt = Date.now()
  }

  memory.run(
    'UPDATE tasks SET status = ?, startedAt = ?, completedAt = ? WHERE id = ?',
    [newStatus, updates.startedAt ?? task.startedAt, updates.completedAt ?? task.completedAt, taskId]
  )

  const updated = getTask(taskId)!
  addTaskEvent(taskId, 'status_changed', undefined, {
    from: task.status,
    to: newStatus,
    ...data,
  })

  eventBus.emit('task:status-changed', {
    task: updated,
    previousStatus: task.status,
    newStatus,
    data,
  })

  return updated
}

/**
 * Cancel a task
 */
export function cancelTask(taskId: string): void {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  if (task.status === 'completed' || task.status === 'cancelled') {
    throw new Error(`Cannot cancel task in ${task.status} state`)
  }

  transitionTask(taskId, 'cancelled')
  eventBus.emit('task:cancelled', { taskId })
}

/**
 * Pause a task
 */
export function pauseTask(taskId: string): void {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  if (!['planning', 'execution', 'verification'].includes(task.status)) {
    throw new Error(`Cannot pause task in ${task.status} state`)
  }

  transitionTask(taskId, 'paused')
  eventBus.emit('task:paused', { taskId })
}

/**
 * Resume a paused task
 */
export function resumeTask(taskId: string): void {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  if (task.status !== 'paused') {
    throw new Error(`Cannot resume task not in paused state`)
  }

  transitionTask(taskId, 'execution')
  eventBus.emit('task:resumed', { taskId })
}

/**
 * Retry a failed task by transitioning back to planning
 */
export function retryTask(taskId: string): void {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  if (task.status !== 'failed') {
    throw new Error(`Cannot retry task not in failed state`)
  }

  updateTask(taskId, { error: undefined })
  transitionTask(taskId, 'planning')
  addTaskEvent(taskId, 'retry_initiated', undefined, { attemptNumber: 2 })
  eventBus.emit('task:retried', { taskId })
}

/**
 * Add a note to a task
 */
export function addTaskNote(taskId: string, note: string): void {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  if (!note || note.trim().length === 0) {
    throw new Error('Note cannot be empty')
  }

  const noteId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()

  memory.run(
    'INSERT INTO task_notes (id, taskId, note, createdAt) VALUES (?, ?, ?, ?)',
    [noteId, taskId, note.trim(), now]
  )

  eventBus.emit('task:note-added', { taskId, noteId, note })
}

/**
 * Get all events for a task
 */
export function getTaskEvents(taskId: string): TaskEvent[] {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  const rows = memory.queryAll(
    'SELECT * FROM task_events WHERE taskId = ? ORDER BY timestamp ASC',
    [taskId]
  )
  return rows.map(parseTaskEvent)
}

/**
 * Add an event to a task
 */
export function addTaskEvent(
  taskId: string,
  eventType: string,
  agentId?: string,
  data?: any
): TaskEvent {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  if (!eventType || eventType.trim().length === 0) {
    throw new Error('Event type is required')
  }

  const eventId = generateEventId()
  const now = Date.now()

  memory.run(
    'INSERT INTO task_events (id, taskId, eventType, agentId, data, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    [eventId, taskId, eventType.trim(), agentId || null, data ? JSON.stringify(data) : null, now]
  )

  const event: TaskEvent = {
    id: eventId,
    taskId,
    eventType,
    agentId: agentId || null,
    data: data || null,
    timestamp: now,
  }

  eventBus.emit('task:event-added', { event })

  return event
}

/**
 * Get all artifacts for a task
 */
export function getTaskArtifacts(taskId: string): TaskArtifact[] {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  const rows = memory.queryAll(
    'SELECT * FROM task_artifacts WHERE taskId = ? ORDER BY createdAt ASC',
    [taskId]
  )
  return rows.map(parseTaskArtifact)
}

/**
 * Add an artifact to a task
 */
export function addTaskArtifact(
  taskId: string,
  artifact: Omit<TaskArtifact, 'id' | 'taskId' | 'createdAt'>
): TaskArtifact {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  if (!artifact.name || artifact.name.trim().length === 0) {
    throw new Error('Artifact name is required')
  }

  const artifactId = generateArtifactId()
  const now = Date.now()

  memory.run(
    `INSERT INTO task_artifacts (id, taskId, name, type, path, content, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      artifactId,
      taskId,
      artifact.name.trim(),
      artifact.type || null,
      artifact.path || null,
      artifact.content || null,
      now,
    ]
  )

  const result: TaskArtifact = {
    id: artifactId,
    taskId,
    name: artifact.name.trim(),
    type: artifact.type || null,
    path: artifact.path || null,
    content: artifact.content || null,
    createdAt: now,
  }

  eventBus.emit('task:artifact-added', { artifact: result })

  return result
}

/**
 * Get all approvals for a task
 */
export function getTaskApprovals(taskId: string): TaskApproval[] {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  const rows = memory.queryAll(
    'SELECT * FROM task_approvals WHERE taskId = ? ORDER BY createdAt DESC',
    [taskId]
  )
  return rows.map(parseTaskApproval)
}

/**
 * Create an approval request for a task
 */
export function createTaskApproval(
  taskId: string,
  requiredFrom: string
): TaskApproval {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  if (!requiredFrom || requiredFrom.trim().length === 0) {
    throw new Error('Approval requiredFrom is required')
  }

  const approvalId = generateApprovalId()
  const now = Date.now()

  memory.run(
    `INSERT INTO task_approvals (id, taskId, requiredFrom, status, comment, createdAt, respondedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [approvalId, taskId, requiredFrom.trim(), 'pending', null, now, null]
  )

  const approval: TaskApproval = {
    id: approvalId,
    taskId,
    requiredFrom: requiredFrom.trim(),
    status: 'pending',
    comment: null,
    createdAt: now,
    respondedAt: null,
  }

  eventBus.emit('task:approval-requested', { approval })

  return approval
}

/**
 * Respond to a task approval
 */
export function respondToApproval(
  approvalId: string,
  approved: boolean,
  comment?: string
): TaskApproval {
  const row = memory.queryOne(
    'SELECT * FROM task_approvals WHERE id = ?',
    [approvalId]
  )
  if (!row) {
    throw new Error(`Approval ${approvalId} not found`)
  }

  if (row.status !== 'pending') {
    throw new Error(`Cannot respond to approval already in ${row.status} state`)
  }

  const now = Date.now()
  const status = approved ? 'approved' : 'rejected'

  memory.run(
    'UPDATE task_approvals SET status = ?, comment = ?, respondedAt = ? WHERE id = ?',
    [status, comment || null, now, approvalId]
  )

  const updated = parseTaskApproval(
    memory.queryOne('SELECT * FROM task_approvals WHERE id = ?', [approvalId])!
  )

  eventBus.emit('task:approval-responded', { approval: updated })

  return updated
}

/**
 * Get the count of active tasks
 */
export function getActiveTaskCount(): number {
  const result = memory.queryOne(
    `SELECT COUNT(*) as count FROM tasks
     WHERE status NOT IN ('completed', 'failed', 'cancelled')`,
    []
  )
  return result?.count ?? 0
}

/**
 * Get all queued tasks (intake and planning states)
 */
export function getQueuedTasks(): Task[] {
  const rows = memory.queryAll(
    `SELECT * FROM tasks WHERE status IN ('intake', 'planning')
     ORDER BY priority DESC, createdAt ASC`,
    []
  )
  return rows.map(parseTask)
}

/**
 * Get all pending approvals across all tasks
 */
export function getPendingApprovals(): TaskApproval[] {
  const rows = memory.queryAll(
    `SELECT * FROM task_approvals WHERE status = 'pending'
     ORDER BY createdAt ASC`,
    []
  )
  return rows.map(parseTaskApproval)
}

/**
 * Initialize the module
 */
initializeSchema()
