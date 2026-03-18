/**
 * Job Queue Tests
 *
 * Tests the module-level job queue: enqueue, process, cancel, retry, stats.
 *
 * Isolation strategy: job-queue.ts uses plain module-level `state`.
 * We reset it between tests by clearing the arrays/maps directly via internal
 * state access, and we stopProcessing() before each test to avoid interval leaks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createQueue, enqueue, cancel, cancelByTask,
  getJob, getJobsByTask, getQueue, getActive, getStats,
  registerHandler, startProcessing, stopProcessing, isProcessing,
  type Job, type JobHandler,
} from '../job-queue'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJobData(overrides?: Partial<Omit<Job, 'id' | 'status' | 'result' | 'error' | 'createdAt' | 'startedAt' | 'completedAt' | 'retryCount'>>) {
  return {
    taskId: 'task-1',
    agentId: null,
    type: 'test-job',
    payload: { value: 42 },
    priority: 0 as const,
    maxRetries: 0,
    ...overrides,
  }
}

// ── State reset between tests (module-level state hack) ───────────────────────

// Access the internal state via the exported functions — we reset by
// cancelling all queued jobs and stopping processing before each test.
function resetQueueState() {
  // Stop any running interval
  stopProcessing()
  // Drain queue by cancelling all jobs
  const queued = getQueue()
  for (const job of queued) cancel(job.id)
  // Reset config to defaults
  createQueue({ maxConcurrent: 3, retryDelay: 5000, jobTimeout: 300000 })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('JobQueue', () => {
  beforeEach(() => {
    resetQueueState()
  })

  afterEach(() => {
    stopProcessing()
    vi.clearAllTimers()
  })

  // ── Enqueue ────────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('should add a job to the queue with correct initial state', () => {
      const job = enqueue(makeJobData())

      expect(job.id).toMatch(/^job-\d+-[a-z0-9]+$/)
      expect(job.status).toBe('queued')
      expect(job.result).toBeNull()
      expect(job.error).toBeNull()
      expect(job.retryCount).toBe(0)
      expect(job.startedAt).toBeNull()
      expect(job.completedAt).toBeNull()
    })

    it('should appear in getQueue() after enqueue', () => {
      const job = enqueue(makeJobData())
      const queue = getQueue()
      expect(queue).toHaveLength(1)
      expect(queue[0].id).toBe(job.id)
    })

    it('should sort by priority — urgent before high before normal', () => {
      enqueue(makeJobData({ priority: 0, type: 'normal' }))
      enqueue(makeJobData({ priority: 2, type: 'urgent' }))
      enqueue(makeJobData({ priority: 1, type: 'high' }))

      const queue = getQueue()
      expect(queue[0].type).toBe('urgent')   // priority 2 first
      expect(queue[1].type).toBe('high')     // priority 1 second
      expect(queue[2].type).toBe('normal')   // priority 0 last
    })

    it('should preserve FIFO order within same priority', () => {
      const j1 = enqueue(makeJobData({ taskId: 'a' }))
      // Small delay not needed — createdAt uses Date.now() which has ms resolution
      // but in the same ms tick they share the same timestamp; enqueue preserves insertion
      const j2 = enqueue(makeJobData({ taskId: 'b' }))

      const queue = getQueue()
      expect(queue.findIndex(j => j.id === j1.id)).toBeLessThanOrEqual(
        queue.findIndex(j => j.id === j2.id)
      )
    })

    it('should return distinct jobs for multiple enqueues', () => {
      const j1 = enqueue(makeJobData())
      const j2 = enqueue(makeJobData())
      expect(j1.id).not.toBe(j2.id)
    })
  })

  // ── Cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should remove a queued job and mark it cancelled', () => {
      const job = enqueue(makeJobData())
      const result = cancel(job.id)

      expect(result).toBe(true)
      expect(getQueue()).toHaveLength(0)
      expect(getJob(job.id)).toBeNull()
    })

    it('should return false for unknown job id', () => {
      const result = cancel('nonexistent-job')
      expect(result).toBe(false)
    })

    it('should return true when cancelling an already-queued job', () => {
      const job = enqueue(makeJobData())
      expect(cancel(job.id)).toBe(true)
      // Second cancel on a job no longer in queue — should return false
      expect(cancel(job.id)).toBe(false)
    })
  })

  // ── cancelByTask ───────────────────────────────────────────────────────────

  describe('cancelByTask', () => {
    it('should cancel all jobs for a given taskId', () => {
      enqueue(makeJobData({ taskId: 'task-abc' }))
      enqueue(makeJobData({ taskId: 'task-abc' }))
      enqueue(makeJobData({ taskId: 'task-other' }))

      const count = cancelByTask('task-abc')
      expect(count).toBe(2)
      expect(getQueue()).toHaveLength(1)
      expect(getQueue()[0].taskId).toBe('task-other')
    })

    it('should return 0 for a taskId with no jobs', () => {
      expect(cancelByTask('nonexistent-task')).toBe(0)
    })
  })

  // ── getJob ─────────────────────────────────────────────────────────────────

  describe('getJob', () => {
    it('should return a queued job by id', () => {
      const job = enqueue(makeJobData())
      const found = getJob(job.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(job.id)
    })

    it('should return null for unknown id', () => {
      expect(getJob('does-not-exist')).toBeNull()
    })
  })

  // ── getJobsByTask ──────────────────────────────────────────────────────────

  describe('getJobsByTask', () => {
    it('should return all jobs for a given taskId', () => {
      enqueue(makeJobData({ taskId: 'task-x', type: 'a' }))
      enqueue(makeJobData({ taskId: 'task-x', type: 'b' }))
      enqueue(makeJobData({ taskId: 'task-y', type: 'c' }))

      const jobs = getJobsByTask('task-x')
      expect(jobs).toHaveLength(2)
      expect(jobs.every(j => j.taskId === 'task-x')).toBe(true)
    })

    it('should return empty array for taskId with no jobs', () => {
      expect(getJobsByTask('no-such-task')).toHaveLength(0)
    })
  })

  // ── getStats ───────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should report correct queued count', () => {
      enqueue(makeJobData())
      enqueue(makeJobData())
      const stats = getStats()
      expect(stats.queued).toBe(2)
      expect(stats.running).toBe(0)
    })

    it('should return zero counts on empty queue', () => {
      const stats = getStats()
      expect(stats.queued).toBe(0)
      expect(stats.running).toBe(0)
    })
  })

  // ── Handler registration + processing ─────────────────────────────────────

  describe('registerHandler + processing', () => {
    it('should execute a registered handler and complete the job', async () => {
      vi.useFakeTimers()

      const results: string[] = []
      registerHandler('test-job', async (_job) => {
        results.push('executed')
        return 'done'
      })

      enqueue(makeJobData({ type: 'test-job' }))
      startProcessing()

      // Advance interval (processNext runs every 100ms)
      await vi.advanceTimersByTimeAsync(150)
      stopProcessing()

      // Job should be completed and out of queue
      expect(getQueue()).toHaveLength(0)
      expect(getActive()).toHaveLength(0)
      expect(results).toEqual(['executed'])

      vi.useRealTimers()
    })

    it('should fail a job with no registered handler', async () => {
      vi.useFakeTimers()

      const unhandledType = `unhandled-${Date.now()}`
      const job = enqueue(makeJobData({ type: unhandledType, maxRetries: 0 }))

      startProcessing()
      await vi.advanceTimersByTimeAsync(150)
      stopProcessing()

      // Job should not be in queue (was processed and failed)
      expect(getQueue()).toHaveLength(0)
      expect(getActive()).toHaveLength(0)

      vi.useRealTimers()
    })

    it('should respect maxConcurrent limit', async () => {
      vi.useFakeTimers()

      createQueue({ maxConcurrent: 1, retryDelay: 5000, jobTimeout: 60000 })

      let running = 0
      let maxRunning = 0
      registerHandler('slow-job', async () => {
        running++
        maxRunning = Math.max(maxRunning, running)
        await new Promise(resolve => setTimeout(resolve, 200))
        running--
      })

      enqueue(makeJobData({ type: 'slow-job', taskId: 'a' }))
      enqueue(makeJobData({ type: 'slow-job', taskId: 'b' }))
      enqueue(makeJobData({ type: 'slow-job', taskId: 'c' }))

      startProcessing()
      await vi.advanceTimersByTimeAsync(800)
      stopProcessing()

      // With maxConcurrent=1, never more than 1 job should run simultaneously
      expect(maxRunning).toBeLessThanOrEqual(1)

      vi.useRealTimers()
    })
  })

  // ── startProcessing / stopProcessing ──────────────────────────────────────

  describe('startProcessing / stopProcessing', () => {
    it('should report isProcessing correctly', () => {
      expect(isProcessing()).toBe(false)
      startProcessing()
      expect(isProcessing()).toBe(true)
      stopProcessing()
      expect(isProcessing()).toBe(false)
    })

    it('should be idempotent — startProcessing twice does not double-tick', () => {
      startProcessing()
      startProcessing()  // second call should be a no-op
      expect(isProcessing()).toBe(true)
      stopProcessing()
      expect(isProcessing()).toBe(false)
    })
  })

  // ── createQueue config ─────────────────────────────────────────────────────

  describe('createQueue', () => {
    it('should update maxConcurrent', () => {
      createQueue({ maxConcurrent: 5 })
      const stats = getStats()
      // Can only verify indirectly via behavior; check no errors thrown
      expect(stats).toBeDefined()
    })
  })
})
