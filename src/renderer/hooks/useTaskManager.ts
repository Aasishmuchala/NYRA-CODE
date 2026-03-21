import { useState, useEffect, useCallback } from 'react'

// Types
export type TaskStatus = 'intake' | 'planning' | 'gathering_context' | 'delegation' | 'execution' | 'verification' | 'awaiting_approval' | 'finalizing' | 'completed' | 'failed' | 'paused' | 'cancelled'
export type ExecutionMode = 'solo' | 'subagent' | 'team'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  mode: ExecutionMode
  projectId?: string
  assignedAgent?: string
  createdAt: number
  updatedAt: number
}

export interface TaskApproval {
  id: string
  taskId: string
  action: string
  status: 'pending' | 'approved' | 'denied'
}

export interface UseTaskManager {
  tasks: Task[]
  activeTask: Task | null
  loading: boolean
  error: string | null
  createTask: (title: string, description: string, mode?: ExecutionMode) => Promise<void>
  cancelTask: (id: string) => Promise<void>
  pauseTask: (id: string) => Promise<void>
  resumeTask: (id: string) => Promise<void>
  retryTask: (id: string) => Promise<void>
  executeTask: (id: string) => Promise<void>
  refreshTasks: () => Promise<void>
  activeCount: number
  pendingApprovals: TaskApproval[]
}

export function useTaskManager(): UseTaskManager {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<TaskApproval[]>([])

  // Load tasks from the preload API: window.nyra.tasks.*
  const refreshTasks = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const taskList = await window.nyra.tasks.list()
      setTasks(Array.isArray(taskList) ? (taskList as unknown as Task[]) : [])

      const approvals = await window.nyra.tasks.pendingApprovals()
      setPendingApprovals(Array.isArray(approvals) ? approvals : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load tasks'
      setError(message)
      console.error('Error loading tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Create a new task
  const createTask = useCallback(
    async (title: string, description: string, _mode: ExecutionMode = 'solo') => {
      try {
        setError(null)
        await window.nyra.tasks.create({ title, description, status: 'intake' } as any)
        await refreshTasks()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create task')
        throw err
      }
    },
    [refreshTasks]
  )

  // Cancel a task
  const cancelTask = useCallback(
    async (id: string) => {
      try {
        setError(null)
        await window.nyra.tasks.cancel(id)
        await refreshTasks()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to cancel task')
        throw err
      }
    },
    [refreshTasks]
  )

  // Pause a task
  const pauseTask = useCallback(
    async (id: string) => {
      try {
        setError(null)
        await window.nyra.tasks.pause(id)
        await refreshTasks()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to pause task')
        throw err
      }
    },
    [refreshTasks]
  )

  // Resume a task
  const resumeTask = useCallback(
    async (id: string) => {
      try {
        setError(null)
        await window.nyra.tasks.resume(id)
        await refreshTasks()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to resume task')
        throw err
      }
    },
    [refreshTasks]
  )

  // Retry a task
  const retryTask = useCallback(
    async (id: string) => {
      try {
        setError(null)
        await window.nyra.tasks.retry(id)
        await refreshTasks()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to retry task')
        throw err
      }
    },
    [refreshTasks]
  )

  // Execute a task (delegates to orchestrator)
  const executeTask = useCallback(
    async (id: string) => {
      try {
        setError(null)
        await window.nyra.tasks.execute(id)
        await refreshTasks()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to execute task')
        throw err
      }
    },
    [refreshTasks]
  )

  // Load tasks on mount
  useEffect(() => {
    refreshTasks()
  }, [refreshTasks])

  // Auto-refresh every 3 seconds while there are active tasks
  useEffect(() => {
    const hasActive = tasks.some(
      t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled'
    )
    if (!hasActive) return

    const interval = setInterval(() => {
      refreshTasks().catch(err => console.error('Auto-refresh error:', err))
    }, 3000)
    return () => clearInterval(interval)
  }, [tasks, refreshTasks])

  // Subscribe to real-time status change events
  useEffect(() => {
    const unsub = window.nyra.tasks.onStatusChanged(() => {
      refreshTasks()
    })
    return unsub as (() => void) | undefined
  }, [refreshTasks])

  // Compute derived state
  const activeTask = tasks.find(t => t.status !== 'completed' && t.status !== 'failed') || null
  const activeCount = tasks.filter(
    t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled'
  ).length

  return {
    tasks,
    activeTask,
    loading,
    error,
    createTask,
    cancelTask,
    pauseTask,
    resumeTask,
    retryTask,
    executeTask,
    refreshTasks,
    activeCount,
    pendingApprovals,
  }
}
