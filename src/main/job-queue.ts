import { EventEmitter as _EventEmitter } from 'events'
import { emitEvent } from './event-bus'

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type JobPriority = 0 | 1 | 2  // 0=normal, 1=high, 2=urgent

export interface Job {
  id: string
  taskId: string
  agentId: string | null
  type: string            // 'agent-run' | 'file-op' | 'scan' | 'context-assembly'
  payload: any
  status: JobStatus
  priority: JobPriority
  result: any | null
  error: string | null
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  retryCount: number
  maxRetries: number
}

export interface QueueConfig {
  maxConcurrent: number    // Default: 3
  retryDelay: number       // ms, default: 5000
  jobTimeout: number       // ms, default: 300000 (5 min)
}

interface InternalQueueState {
  queue: Job[]
  active: Map<string, Job>
  handlers: Map<string, JobHandler>
  config: Required<QueueConfig>
  processing: boolean
  processingInterval: NodeJS.Timeout | null
}

export type JobHandler = (job: Job) => Promise<any>

// Internal state
const state: InternalQueueState = {
  queue: [],
  active: new Map(),
  handlers: new Map(),
  config: {
    maxConcurrent: 3,
    retryDelay: 5000,
    jobTimeout: 300000,
  },
  processing: false,
  processingInterval: null,
}

/**
 * Initialize or reconfigure the job queue
 */
export function createQueue(config?: Partial<QueueConfig>): void {
  if (config?.maxConcurrent !== undefined) {
    state.config.maxConcurrent = config.maxConcurrent
  }
  if (config?.retryDelay !== undefined) {
    state.config.retryDelay = config.retryDelay
  }
  if (config?.jobTimeout !== undefined) {
    state.config.jobTimeout = config.jobTimeout
  }
}

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Enqueue a new job
 */
export function enqueue(
  jobData: Omit<Job, 'id' | 'status' | 'result' | 'error' | 'createdAt' | 'startedAt' | 'completedAt' | 'retryCount'>
): Job {
  const job: Job = {
    id: generateJobId(),
    status: 'queued',
    result: null,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    retryCount: 0,
    ...jobData,
  }

  state.queue.push(job)
  // Sort by priority (desc) then by createdAt (asc)
  state.queue.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority
    }
    return a.createdAt - b.createdAt
  })

  emitEvent('task:queued', job)
  return job
}

/**
 * Cancel a specific job by ID
 */
export function cancel(jobId: string): boolean {
  // Check if it's queued
  const queueIndex = state.queue.findIndex((j) => j.id === jobId)
  if (queueIndex !== -1) {
    const job = state.queue[queueIndex]
    job.status = 'cancelled'
    state.queue.splice(queueIndex, 1)
    emitEvent('task:cancelled', job)
    return true
  }

  // Check if it's running (can't really cancel, but mark it)
  const activeJob = state.active.get(jobId)
  if (activeJob) {
    activeJob.status = 'cancelled'
    emitEvent('task:cancelled', activeJob)
    // Note: The actual running task won't stop, but we mark it as cancelled
    return true
  }

  return false
}

/**
 * Cancel all jobs for a given taskId
 */
export function cancelByTask(taskId: string): number {
  let count = 0

  // Cancel queued jobs
  const remaining: Job[] = []
  for (const job of state.queue) {
    if (job.taskId === taskId) {
      job.status = 'cancelled'
      emitEvent('task:cancelled', job)
      count++
    } else {
      remaining.push(job)
    }
  }
  state.queue = remaining

  // Cancel active jobs
  for (const [_jobId, job] of state.active.entries()) {
    if (job.taskId === taskId) {
      job.status = 'cancelled'
      emitEvent('task:cancelled', job)
      count++
    }
  }

  return count
}

/**
 * Get a job by ID
 */
export function getJob(jobId: string): Job | null {
  // Check queue
  const queuedJob = state.queue.find((j) => j.id === jobId)
  if (queuedJob) return queuedJob

  // Check active
  const activeJob = state.active.get(jobId)
  if (activeJob) return activeJob

  return null
}

/**
 * Get all jobs for a given taskId
 */
export function getJobsByTask(taskId: string): Job[] {
  const jobs: Job[] = []

  for (const job of state.queue) {
    if (job.taskId === taskId) jobs.push(job)
  }

  for (const job of state.active.values()) {
    if (job.taskId === taskId) jobs.push(job)
  }

  return jobs
}

/**
 * Get all queued jobs
 */
export function getQueue(): Job[] {
  return [...state.queue]
}

/**
 * Get all running jobs
 */
export function getActive(): Job[] {
  return Array.from(state.active.values())
}

/**
 * Get queue statistics
 */
export function getStats(): { queued: number; running: number; completed: number; failed: number } {
  return {
    queued: state.queue.length,
    running: state.active.size,
    completed: 0, // Completed jobs are not tracked in memory (could be persisted if needed)
    failed: 0,    // Failed jobs are not tracked in memory (could be persisted if needed)
  }
}

/**
 * Register a handler for a job type
 */
export function registerHandler(jobType: string, handler: JobHandler): void {
  state.handlers.set(jobType, handler)
}

/**
 * Process the next job in the queue
 */
export async function processNext(): Promise<void> {
  // Don't process if at capacity
  if (state.active.size >= state.config.maxConcurrent) {
    return
  }

  // Don't process if no jobs queued
  if (state.queue.length === 0) {
    return
  }

  // Get the next job (already sorted by priority and time)
  const job = state.queue.shift()!

  // Move to active
  job.status = 'running'
  job.startedAt = Date.now()
  state.active.set(job.id, job)
  emitEvent('task:started', job)

  try {
    // Look up handler
    const handler = state.handlers.get(job.type)
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.type}`)
    }

    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Job execution timeout')), state.config.jobTimeout)
    )

    const result = await Promise.race([handler(job), timeoutPromise])

    job.result = result
    job.status = 'completed'
    job.completedAt = Date.now()
    state.active.delete(job.id)
    emitEvent('task:completed', job)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    job.error = errorMessage
    job.status = 'failed'
    job.completedAt = Date.now()

    // Retry logic
    if (job.retryCount < job.maxRetries) {
      job.retryCount++
      job.status = 'queued'
      job.startedAt = null
      job.completedAt = null
      job.error = null

      // Re-enqueue after delay
      setTimeout(() => {
        state.queue.push(job)
        // Re-sort queue
        state.queue.sort((a, b) => {
          if (a.priority !== b.priority) {
            return b.priority - a.priority
          }
          return a.createdAt - b.createdAt
        })
      }, state.config.retryDelay)

      state.active.delete(job.id)
      emitEvent('task:cancelled', job) // Emit as cancelled for now, retry scheduled
    } else {
      state.active.delete(job.id)
      emitEvent('task:failed', job)
    }
  }
}

/**
 * Start the processing loop
 */
export function startProcessing(): void {
  if (state.processing) {
    return
  }

  state.processing = true
  state.processingInterval = setInterval(() => {
    processNext().catch((err) => {
      console.error('[JobQueue] Error processing next job:', err)
    })
  }, 100)
}

/**
 * Stop the processing loop
 */
export function stopProcessing(): void {
  state.processing = false
  if (state.processingInterval) {
    clearInterval(state.processingInterval)
    state.processingInterval = null
  }
}

/**
 * Check if processing is active
 */
export function isProcessing(): boolean {
  return state.processing
}
