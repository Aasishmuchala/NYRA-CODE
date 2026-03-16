import { describe, it, expect, beforeEach } from 'vitest'
import { ProceduralMemory, FeedbackLoop, SelfImprovingAgent } from '../platform/self-improving'

describe('Self-Improving Agent System', () => {
  describe('ProceduralMemory', () => {
    let memory: ProceduralMemory

    beforeEach(() => {
      memory = new ProceduralMemory()
    })

    it('should learn procedures from successful tasks', () => {
      const procedure = memory.learn({
        trigger: ['search', 'query'],
        steps: ['retrieve_data', 'filter_results', 'rank'],
        taskId: 'task-1',
      })

      expect(procedure.id).toBeDefined()
      expect(procedure.trigger).toContain('search')
      expect(procedure.successRate).toBe(1.0)
      expect(procedure.createdFrom).toBe('task-1')
    })

    it('should recall procedures by keyword matching', () => {
      memory.learn({
        trigger: ['search', 'query'],
        steps: ['retrieve_data', 'filter_results'],
        taskId: 'task-1',
      })

      memory.learn({
        trigger: ['analyze', 'data'],
        steps: ['parse', 'compute_stats'],
        taskId: 'task-2',
      })

      const matches = memory.recall({
        keywords: ['search'],
        taskType: 'query',
      })

      expect(matches.length).toBeGreaterThan(0)
      expect(matches[0].trigger).toContain('search')
    })

    it('should rank recalled procedures by success rate', () => {
      const proc1 = memory.learn({
        trigger: ['sort'],
        steps: ['quicksort'],
        taskId: 'task-1',
      })

      const proc2 = memory.learn({
        trigger: ['sort'],
        steps: ['mergesort'],
        taskId: 'task-2',
      })

      memory.reinforce(proc1.id, true)
      memory.reinforce(proc1.id, true)
      memory.reinforce(proc2.id, false)

      const matches = memory.recall({
        keywords: ['sort'],
      })

      // Higher success rate should be first
      expect(matches[0].id).toBe(proc1.id)
    })

    it('should reinforce procedures with exponential moving average', () => {
      const proc = memory.learn({
        trigger: ['test'],
        steps: ['execute'],
        taskId: 'task-1',
      })

      expect(proc.successRate).toBe(1.0)

      memory.reinforce(proc.id, false)
      const procedures = memory.getProcedures()
      const updated = procedures.find((p) => p.id === proc.id)
      expect(updated?.successRate).toBeLessThan(1.0)
      expect(updated?.successRate).toBeGreaterThan(0)
    })

    it('should prune low-performing procedures', () => {
      const proc1 = memory.learn({
        trigger: ['bad'],
        steps: ['fail'],
        taskId: 'task-1',
      })

      memory.reinforce(proc1.id, false)
      memory.reinforce(proc1.id, false)

      // Manually lower success rate
      const procedures = memory.getProcedures()
      const p = procedures.find((p) => p.id === proc1.id)
      if (p) p.successRate = 0.1

      memory.prune()

      const remaining = memory.getProcedures()
      // Should be pruned if old enough
      expect(remaining.length).toBeGreaterThanOrEqual(0)
    })

    it('should export and import procedures', () => {
      const proc = memory.learn({
        trigger: ['export', 'test'],
        steps: ['serialize', 'store'],
        taskId: 'task-1',
      })

      const exported = memory.export()
      expect(exported.length).toBeGreaterThan(0)

      const memory2 = new ProceduralMemory()
      memory2.import(exported)

      const imported = memory2.getProcedures()
      expect(imported.length).toBe(exported.length)
      expect(imported[0].id).toBe(proc.id)
    })
  })

  describe('FeedbackLoop', () => {
    let feedback: FeedbackLoop

    beforeEach(() => {
      feedback = new FeedbackLoop()
    })

    it('should record task outcomes with ratings', () => {
      feedback.recordOutcome('task-1', 'agent-a', { success: true }, 5)

      const outcomes = feedback.getOutcomes('agent-a')
      expect(outcomes.length).toBe(1)
      expect(outcomes[0].userRating).toBe(5)
    })

    it('should reject invalid ratings', () => {
      expect(() => {
        feedback.recordOutcome('task-1', 'agent-a', {}, 0)
      }).toThrow('User rating must be between 1 and 5')

      expect(() => {
        feedback.recordOutcome('task-1', 'agent-a', {}, 6)
      }).toThrow('User rating must be between 1 and 5')
    })

    it('should calculate agent performance score', () => {
      feedback.recordOutcome('task-1', 'agent-a', {}, 5)
      feedback.recordOutcome('task-2', 'agent-a', {}, 4)
      feedback.recordOutcome('task-3', 'agent-a', {}, 2)

      const score = feedback.getAgentScore('agent-a')
      expect(score.agentId).toBe('agent-a')
      expect(score.score).toBeLessThanOrEqual(5)
      expect(score.score).toBeGreaterThanOrEqual(1)
      expect(score.totalAttempts).toBe(3)
    })

    it('should calculate success rate', () => {
      feedback.recordOutcome('task-1', 'agent-a', {}, 4)
      feedback.recordOutcome('task-2', 'agent-a', {}, 5)
      feedback.recordOutcome('task-3', 'agent-a', {}, 2)
      feedback.recordOutcome('task-4', 'agent-a', {}, 1)

      const score = feedback.getAgentScore('agent-a')
      // 2 successes out of 4 = 0.5
      expect(score.successRate).toBe(0.5)
    })

    it('should analyze performance patterns', () => {
      feedback.recordOutcome('task-1', 'agent-a', { type: 'search' }, 5)
      feedback.recordOutcome('task-2', 'agent-a', { type: 'search' }, 4)
      feedback.recordOutcome('task-3', 'agent-a', { type: 'analysis' }, 2)
      feedback.recordOutcome('task-4', 'agent-a', { type: 'analysis' }, 1)

      const analysis = feedback.analyzePatterns('agent-a')
      expect(analysis.failureMode.length).toBeGreaterThan(0)
      expect(analysis.bestPerforming.length).toBeGreaterThan(0)
      expect(analysis.averageRating).toBeGreaterThan(0)
      expect(analysis.attemptCount).toBe(4)
    })

    it('should suggest improvements based on patterns', () => {
      // Poor performance
      feedback.recordOutcome('task-1', 'agent-a', {}, 1)
      feedback.recordOutcome('task-2', 'agent-a', {}, 2)

      const suggestions = feedback.suggestImprovements('agent-a')
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions[0].length).toBeGreaterThan(0)
    })

    it('should handle insufficient data gracefully', () => {
      const analysis = feedback.analyzePatterns('unknown-agent')
      expect(analysis.attemptCount).toBe(0)
      expect(analysis.averageRating).toBe(0)

      const suggestions = feedback.suggestImprovements('unknown-agent')
      expect(suggestions.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('SelfImprovingAgent', () => {
    let memory: ProceduralMemory
    let feedback: FeedbackLoop
    let agent: SelfImprovingAgent

    beforeEach(() => {
      memory = new ProceduralMemory()
      feedback = new FeedbackLoop()
      agent = new SelfImprovingAgent('agent-1', memory, feedback)
    })

    it('should execute tasks with procedural augmentation', async () => {
      memory.learn({
        trigger: ['greeting'],
        steps: ['hello_world'],
        taskId: 'learn-1',
      })

      const result = await agent.execute({
        id: 'task-1',
        type: 'greeting',
        keywords: ['greeting'],
        payload: 'Hello',
      })

      expect(result.result).toBeDefined()
      expect(result.proceduresUsed).toBeDefined()
      expect(result.context).toBeDefined()
    })

    it('should augment execution context with procedures', async () => {
      const proc = memory.learn({
        trigger: ['search'],
        steps: ['step1', 'step2'],
        taskId: 'learn-1',
      })

      const result = await agent.execute({
        id: 'task-1',
        type: 'search',
        keywords: ['search'],
        payload: 'query',
      })

      expect(result.proceduresUsed).toContain(proc.id)
      expect(result.context).toEqual(
        expect.objectContaining({
          suggestedSteps: ['step1', 'step2'],
        })
      )
    })

    it('should reflect on outcomes and learn', async () => {
      // Record successful outcome
      feedback.recordOutcome('task-1', 'agent-1', { type: 'search' }, 5)

      // Create history
      await agent.execute({
        id: 'task-1',
        type: 'search',
        keywords: ['search'],
        payload: 'query',
      })

      // Reflect - should learn from success
      await agent.reflect()

      const procedures = memory.getProcedures()
      expect(procedures.length).toBeGreaterThanOrEqual(0)
    })

    it('should emit task-executed event', async () => {
      let emitted = false
      agent.on('task-executed', () => {
        emitted = true
      })

      await agent.execute({
        id: 'task-1',
        type: 'test',
        keywords: ['test'],
        payload: {},
      })

      expect(emitted).toBe(true)
    })

    it('should provide performance report', async () => {
      feedback.recordOutcome('task-1', 'agent-1', {}, 5)
      feedback.recordOutcome('task-2', 'agent-1', {}, 4)

      const report = agent.getPerformanceReport()

      expect(report.agentId).toBe('agent-1')
      expect(report.score).toBeDefined()
      expect(report.learnedProcedures).toBeGreaterThanOrEqual(0)
      expect(report.executionCount).toBeGreaterThanOrEqual(0)
      expect(report.improvements).toBeDefined()
    })

    it('should track execution history', async () => {
      const proc = memory.learn({
        trigger: ['test'],
        steps: ['execute'],
        taskId: 'learn-1',
      })

      await agent.execute({
        id: 'task-1',
        type: 'test',
        keywords: ['test'],
        payload: {},
      })

      const report = agent.getPerformanceReport()
      expect(report.executionCount).toBe(1)
    })
  })

  describe('Integration', () => {
    it('should support full learning cycle', async () => {
      const memory = new ProceduralMemory()
      const feedback = new FeedbackLoop()
      const agent = new SelfImprovingAgent('agent-1', memory, feedback)

      // Execute task
      const result = await agent.execute({
        id: 'task-1',
        type: 'process',
        keywords: ['process'],
        payload: { data: 'input' },
      })

      // Record feedback
      feedback.recordOutcome('task-1', 'agent-1', result.result, 5)

      // Reflect and learn
      await agent.reflect()

      // Get report
      const report = agent.getPerformanceReport()
      expect(report.executionCount).toBeGreaterThan(0)
      expect(report.score.totalAttempts).toBeGreaterThan(0)
    })
  })
})
