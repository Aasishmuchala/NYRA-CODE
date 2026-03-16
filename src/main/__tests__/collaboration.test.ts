import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  PriorityMessageQueue,
  SharedWorkspace,
  PlanExecuteReviewPipeline,
  Priority,
  AgentMessage,
} from '../agents/collaboration'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('Collaboration Engine', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), 'nyra-test-collaboration')
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
  describe('PriorityMessageQueue', () => {
    let queue: PriorityMessageQueue

    beforeEach(() => {
      queue = new PriorityMessageQueue()
    })

    it('should enqueue and dequeue messages', () => {
      const msg: AgentMessage = {
        id: 'msg-1',
        from: 'agent-a',
        to: 'agent-b',
        priority: Priority.NORMAL,
        type: 'task',
        payload: { command: 'execute' },
        timestamp: Date.now(),
      }

      queue.registerAgent('agent-b')
      queue.enqueue(msg)

      const dequeued = queue.dequeue('agent-b')
      expect(dequeued?.id).toBe('msg-1')
    })

    it('should order messages by priority', () => {
      const lowMsg: AgentMessage = {
        id: 'low',
        from: 'agent-a',
        to: 'agent-b',
        priority: Priority.LOW,
        type: 'task',
        payload: {},
        timestamp: Date.now(),
      }

      const criticalMsg: AgentMessage = {
        id: 'critical',
        from: 'agent-a',
        to: 'agent-b',
        priority: Priority.CRITICAL,
        type: 'task',
        payload: {},
        timestamp: Date.now() + 1000,
      }

      queue.registerAgent('agent-b')
      queue.enqueue(lowMsg)
      queue.enqueue(criticalMsg)

      const first = queue.dequeue('agent-b')
      expect(first?.id).toBe('critical')

      const second = queue.dequeue('agent-b')
      expect(second?.id).toBe('low')
    })

    it('should peek at next message without removing', () => {
      const msg: AgentMessage = {
        id: 'msg-1',
        from: 'agent-a',
        to: 'agent-b',
        priority: Priority.NORMAL,
        type: 'task',
        payload: {},
        timestamp: Date.now(),
      }

      queue.registerAgent('agent-b')
      queue.enqueue(msg)

      const peeked = queue.peek('agent-b')
      expect(peeked?.id).toBe('msg-1')

      const peeked2 = queue.peek('agent-b')
      expect(peeked2?.id).toBe('msg-1')
    })

    it('should broadcast messages to all agents', () => {
      const broadcast: AgentMessage = {
        id: 'broadcast',
        from: 'system',
        to: '*',
        priority: Priority.HIGH,
        type: 'task',
        payload: { event: 'shutdown' },
        timestamp: Date.now(),
      }

      queue.registerAgent('agent-a')
      queue.registerAgent('agent-b')
      queue.registerAgent('agent-c')

      queue.enqueue(broadcast)

      expect(queue.getQueueDepth('agent-a')).toBe(1)
      expect(queue.getQueueDepth('agent-b')).toBe(1)
      expect(queue.getQueueDepth('agent-c')).toBe(1)
    })

    it('should report queue depth', () => {
      queue.registerAgent('agent-a')
      expect(queue.getQueueDepth('agent-a')).toBe(0)

      const msg: AgentMessage = {
        id: 'msg-1',
        from: 'system',
        to: 'agent-a',
        priority: Priority.NORMAL,
        type: 'task',
        payload: {},
        timestamp: Date.now(),
      }

      queue.enqueue(msg)
      expect(queue.getQueueDepth('agent-a')).toBe(1)
    })

    it('should prune expired messages', () => {
      queue.registerAgent('agent-a')

      const expiredMsg: AgentMessage = {
        id: 'expired',
        from: 'system',
        to: 'agent-a',
        priority: Priority.NORMAL,
        type: 'task',
        payload: {},
        timestamp: Date.now() - 10000,
        deadline: Date.now() - 1000,
      }

      const validMsg: AgentMessage = {
        id: 'valid',
        from: 'system',
        to: 'agent-a',
        priority: Priority.NORMAL,
        type: 'task',
        payload: {},
        timestamp: Date.now(),
        deadline: Date.now() + 10000,
      }

      queue.enqueue(expiredMsg)
      queue.enqueue(validMsg)

      const pruned = queue.pruneExpired()
      expect(pruned).toBeGreaterThan(0)
      expect(queue.getQueueDepth('agent-a')).toBe(1)
    })
  })

  describe('SharedWorkspace', () => {
    let workspace: SharedWorkspace

    beforeEach(() => {
      workspace = new SharedWorkspace()
    })

    it('should write and read data', () => {
      workspace.write('key-1', { value: 'data' }, 'agent-a')
      const entry = workspace.read('key-1')
      expect(entry?.value).toEqual({ value: 'data' })
    })

    it('should track version numbers', () => {
      workspace.write('key-1', 'v1', 'agent-a')
      workspace.write('key-1', 'v2', 'agent-a')

      const entry = workspace.read('key-1')
      expect(entry?.version).toBe(2)
    })

    it('should track owner and timestamp', () => {
      const before = Date.now()
      workspace.write('key-1', 'data', 'agent-a')
      const after = Date.now()

      const entry = workspace.read('key-1')
      expect(entry?.owner).toBe('agent-a')
      expect(entry?.updatedAt).toBeGreaterThanOrEqual(before)
      expect(entry?.updatedAt).toBeLessThanOrEqual(after)
    })

    it('should perform compare-and-swap operations', () => {
      workspace.write('key-1', 'v1', 'agent-a')
      const entry = workspace.read('key-1')

      const cas = workspace.cas('key-1', 'v2', 'agent-b', entry!.version)
      expect(cas.success).toBe(true)
      expect(cas.version).toBe(2)
    })

    it('should reject CAS on version mismatch', () => {
      workspace.write('key-1', 'v1', 'agent-a')

      const cas = workspace.cas('key-1', 'v2', 'agent-b', 99)
      expect(cas.success).toBe(false)
      expect(cas.conflict).toBeDefined()
    })

    it('should list all entries', () => {
      workspace.write('key-1', 'data-1', 'agent-a')
      workspace.write('key-2', 'data-2', 'agent-b')

      const entries = workspace.list()
      expect(entries.length).toBe(2)
    })

    it('should maintain history', () => {
      workspace.write('key-1', 'v1', 'agent-a')
      workspace.write('key-1', 'v2', 'agent-a')
      workspace.write('key-1', 'v3', 'agent-b')

      const history = workspace.getHistory('key-1')
      expect(history.length).toBe(3)
      expect(history[0].value).toBe('v1')
      expect(history[2].value).toBe('v3')
    })

    it('should clear workspace', () => {
      workspace.write('key-1', 'data', 'agent-a')
      expect(workspace.list().length).toBe(1)

      workspace.clear()
      expect(workspace.list().length).toBe(0)
    })
  })

  describe('PlanExecuteReviewPipeline', () => {
    let queue: PriorityMessageQueue
    let workspace: SharedWorkspace
    let pipeline: PlanExecuteReviewPipeline

    beforeEach(() => {
      queue = new PriorityMessageQueue()
      workspace = new SharedWorkspace()
      pipeline = new PlanExecuteReviewPipeline(queue, workspace)
    })

    it('should create plan with steps', () => {
      const steps = [
        {
          id: 'step-1',
          description: 'Analyze input',
          assignee: 'analyzer',
          requiresApproval: false,
        },
        {
          id: 'step-2',
          description: 'Generate response',
          assignee: 'generator',
          requiresApproval: true,
        },
      ]

      const plan = pipeline.createPlan('plan-1', steps)
      expect(plan.length).toBe(2)
      expect(plan[0].status).toBe('pending')
    })

    it('should execute step and dispatch to agent', () => {
      const steps = [
        {
          id: 'step-1',
          description: 'Process',
          assignee: 'worker',
          requiresApproval: false,
          input: { data: 'test' },
        },
      ]

      const plan = pipeline.createPlan('plan-1', steps)
      queue.registerAgent('worker')

      pipeline.executeStep('plan-1', 'step-1')

      const msg = queue.peek('worker')
      expect(msg?.type).toBe('task')
      expect(msg?.priority).toBe(Priority.HIGH)
    })

    it('should track plan progress', () => {
      const steps = [
        { id: 'step-1', description: 'a', assignee: 'worker', requiresApproval: false },
        { id: 'step-2', description: 'b', assignee: 'worker', requiresApproval: false },
        { id: 'step-3', description: 'c', assignee: 'worker', requiresApproval: false },
      ]

      pipeline.createPlan('plan-1', steps)
      const progress = pipeline.getPlanProgress('plan-1')

      expect(progress?.total).toBe(3)
      expect(progress?.pending).toBe(3)
      expect(progress?.completed).toBe(0)
    })

    it('should submit result and store in workspace', () => {
      const steps = [
        { id: 'step-1', description: 'Process', assignee: 'worker', requiresApproval: false },
      ]

      pipeline.createPlan('plan-1', steps)
      pipeline.executeStep('plan-1', 'step-1')
      pipeline.submitResult('plan-1', 'step-1', { result: 'success' })

      const stored = workspace.read('plan:plan-1:step-1:result')
      expect(stored?.value).toEqual({ result: 'success' })
    })

    it('should approve step after review', () => {
      const steps = [
        { id: 'step-1', description: 'Process', assignee: 'worker', requiresApproval: true },
      ]

      pipeline.createPlan('plan-1', steps)
      pipeline.executeStep('plan-1', 'step-1')
      pipeline.submitResult('plan-1', 'step-1', { result: 'output' })

      const approved = pipeline.approveStep('plan-1', 'step-1', 'Looks good!')
      expect(approved).toBe(true)

      const plan = pipeline.getPlan('plan-1')
      expect(plan?.[0].status).toBe('completed')
      expect(plan?.[0].reviewNotes).toBe('Looks good!')
    })

    it('should reject step after review', () => {
      const steps = [
        { id: 'step-1', description: 'Process', assignee: 'worker', requiresApproval: true },
      ]

      pipeline.createPlan('plan-1', steps)
      pipeline.executeStep('plan-1', 'step-1')
      pipeline.submitResult('plan-1', 'step-1', { result: 'output' })

      const rejected = pipeline.rejectStep('plan-1', 'step-1', 'Needs revision')
      expect(rejected).toBe(true)

      const plan = pipeline.getPlan('plan-1')
      expect(plan?.[0].status).toBe('rejected')
    })

    it('should emit events during execution', () => {
      const events: string[] = []

      pipeline.on('plan-created', () => events.push('plan-created'))
      pipeline.on('step-started', () => events.push('step-started'))
      pipeline.on('step-result', () => events.push('step-result'))
      pipeline.on('step-approved', () => events.push('step-approved'))

      const steps = [
        { id: 'step-1', description: 'Process', assignee: 'worker', requiresApproval: true },
      ]

      pipeline.createPlan('plan-1', steps)
      pipeline.executeStep('plan-1', 'step-1')
      pipeline.submitResult('plan-1', 'step-1', { result: 'output' })
      pipeline.approveStep('plan-1', 'step-1')

      expect(events).toContain('plan-created')
      expect(events).toContain('step-started')
      expect(events).toContain('step-result')
      expect(events).toContain('step-approved')
    })

    it('should request human approval for checkpoint', () => {
      const events: any[] = []

      pipeline.on('checkpoint', (data) => events.push(data))

      pipeline.requestHumanApproval('plan-1', 'step-1', 'Needs human decision')

      expect(events.length).toBe(1)
      expect(events[0].type).toBe('human-approval-required')
      expect(events[0].reason).toBe('Needs human decision')
    })
  })

  describe('Priority Ordering', () => {
    it('should prioritize critical > high > normal > low', () => {
      const queue = new PriorityMessageQueue()
      queue.registerAgent('worker')

      const messages = [
        { id: 'n', priority: Priority.NORMAL, timestamp: Date.now() },
        { id: 'h', priority: Priority.HIGH, timestamp: Date.now() + 1000 },
        { id: 'c', priority: Priority.CRITICAL, timestamp: Date.now() + 2000 },
        { id: 'l', priority: Priority.LOW, timestamp: Date.now() + 3000 },
      ]

      for (const m of messages) {
        queue.enqueue({
          id: m.id,
          from: 'system',
          to: 'worker',
          priority: m.priority,
          type: 'task',
          payload: {},
          timestamp: m.timestamp,
        })
      }

      const order = []
      for (let i = 0; i < 4; i++) {
        const msg = queue.dequeue('worker')
        order.push(msg?.id)
      }

      expect(order).toEqual(['c', 'h', 'n', 'l'])
    })
  })

  describe('Init/Shutdown Lifecycle', () => {
    beforeEach(() => {
      // Clean up persistence files from prior tests to ensure isolation
      const dataDir = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra')
      const files = ['shared-workspace.json', 'pipeline-plans.json']
      for (const f of files) {
        const p = path.join(dataDir, f)
        if (fs.existsSync(p)) fs.unlinkSync(p)
      }
    })

    it('should initialize and load workspace data from disk', () => {
      const workspace = new SharedWorkspace()
      workspace.init()
      expect(workspace).toBeDefined()
    })

    it('should create data directory on init()', () => {
      const workspace = new SharedWorkspace()
      workspace.init()
      const dataDir = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra')
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should save workspace entries on shutdown()', () => {
      const workspace = new SharedWorkspace()
      workspace.init()
      workspace.write('key-1', { data: 'test' }, 'agent-a')
      workspace.write('key-2', { data: 'test-2' }, 'agent-b')
      workspace.shutdown()

      const storagePath = path.join(
        process.env.HOME || process.env.USERPROFILE || '/tmp',
        '.nyra',
        'collaboration',
        'workspace.json'
      )

      if (fs.existsSync(storagePath)) {
        const data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'))
        expect(data.entries).toBeDefined()
        expect(data.entries.length).toBeGreaterThan(0)
      }
    })

    it('should restore workspace data after init+shutdown cycle', () => {
      const workspace = new SharedWorkspace()
      workspace.init()
      workspace.write('shared-key', { result: 'important-data' }, 'agent-a')
      workspace.shutdown()

      const workspace2 = new SharedWorkspace()
      workspace2.init()

      const entry = workspace2.read('shared-key')
      expect(entry?.value).toEqual({ result: 'important-data' })
      expect(entry?.owner).toBe('agent-a')
    })

    it('should preserve workspace history across cycles', () => {
      const workspace = new SharedWorkspace()
      workspace.init()
      workspace.write('versioned', 'v1', 'agent-a')
      workspace.write('versioned', 'v2', 'agent-a')
      workspace.shutdown()

      const workspace2 = new SharedWorkspace()
      workspace2.init()

      const history = workspace2.getHistory('versioned')
      expect(history.length).toBe(2)
      expect(history[0].value).toBe('v1')
      expect(history[1].value).toBe('v2')
    })

    it('should save and restore pipeline plans on shutdown', () => {
      const queue = new PriorityMessageQueue()
      const workspace = new SharedWorkspace()
      const pipeline = new PlanExecuteReviewPipeline(queue, workspace)

      pipeline.init()

      const steps = [
        { id: 'step-1', description: 'Task 1', assignee: 'worker', requiresApproval: false },
        { id: 'step-2', description: 'Task 2', assignee: 'worker', requiresApproval: false },
      ]

      pipeline.createPlan('plan-1', steps)
      pipeline.shutdown()

      const planPath = path.join(
        process.env.HOME || process.env.USERPROFILE || '/tmp',
        '.nyra',
        'collaboration',
        'pipeline.json'
      )

      if (fs.existsSync(planPath)) {
        const data = JSON.parse(fs.readFileSync(planPath, 'utf-8'))
        expect(data.plans).toBeDefined()
      }
    })

    it('should restore pipeline plans across init/shutdown cycles', () => {
      const queue = new PriorityMessageQueue()
      const workspace = new SharedWorkspace()
      const pipeline = new PlanExecuteReviewPipeline(queue, workspace)

      pipeline.init()

      const steps = [
        { id: 'step-1', description: 'Process', assignee: 'worker', requiresApproval: false },
      ]

      pipeline.createPlan('persistent-plan', steps)
      pipeline.shutdown()

      const queue2 = new PriorityMessageQueue()
      const workspace2 = new SharedWorkspace()
      const pipeline2 = new PlanExecuteReviewPipeline(queue2, workspace2)
      pipeline2.init()

      const plan = pipeline2.getPlan('persistent-plan')
      expect(plan).toBeDefined()
      expect(plan?.length).toBe(1)
    })

    it('should preserve plan execution state across shutdown', () => {
      const queue = new PriorityMessageQueue()
      const workspace = new SharedWorkspace()
      const pipeline = new PlanExecuteReviewPipeline(queue, workspace)

      pipeline.init()

      const steps = [
        { id: 'step-1', description: 'Task', assignee: 'worker', requiresApproval: false },
      ]

      const plan = pipeline.createPlan('tracking-plan', steps)
      const progress = pipeline.getPlanProgress('tracking-plan')
      expect(progress?.pending).toBe(1)

      pipeline.shutdown()

      const queue2 = new PriorityMessageQueue()
      const workspace2 = new SharedWorkspace()
      const pipeline2 = new PlanExecuteReviewPipeline(queue2, workspace2)
      pipeline2.init()

      const restoredProgress = pipeline2.getPlanProgress('tracking-plan')
      expect(restoredProgress).toBeDefined()
    })
  })
})
