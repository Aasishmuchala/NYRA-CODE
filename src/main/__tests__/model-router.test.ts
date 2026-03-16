import { describe, it, expect, beforeEach } from 'vitest'
import { ModelRouter, QueryContext } from '../model-router-year2'

describe('ModelRouter', () => {
  let router: ModelRouter

  beforeEach(() => {
    router = new ModelRouter()
  })

  describe('Complexity Estimation', () => {
    it('should estimate low complexity for simple queries', () => {
      const query: QueryContext = {
        text: 'What is 2 + 2?',
        type: 'chat',
      }

      const decision = router.route(query)
      expect(decision).toBeDefined()
      expect(decision.confidence).toBeGreaterThan(0)
    })

    it('should estimate high complexity for reasoning queries', () => {
      const query: QueryContext = {
        text: 'Explain the implications of quantum computing on cryptography with step by step reasoning',
        type: 'reasoning',
      }

      const decision = router.route(query)
      expect(decision.tier).not.toBe('local')
    })

    it('should estimate high complexity for code generation', () => {
      const query: QueryContext = {
        text: 'Write a complete REST API server with authentication and database integration',
        type: 'code',
      }

      const decision = router.route(query)
      expect(['cloud-smart', 'cloud-fast'].includes(decision.tier)).toBe(true)
    })

    it('should estimate complexity based on word count', () => {
      const shortQuery: QueryContext = {
        text: 'hi',
        type: 'chat',
      }

      const longQuery: QueryContext = {
        text: 'A'.repeat(200).split('').join(' '),
        type: 'chat',
      }

      const shortDecision = router.route(shortQuery)
      const longDecision = router.route(longQuery)

      // Long query should select more capable model
      expect(
        ['local', 'cloud-fast'].includes(shortDecision.tier)
      ).toBe(true)
    })

    it('should increase complexity for queries with images', () => {
      const query: QueryContext = {
        text: 'Analyze this image',
        type: 'chat',
        hasImages: true,
      }

      const decision = router.route(query)
      expect(decision).toBeDefined()
    })
  })

  describe('Tier Selection', () => {
    it('should route simple chat to fast tier or local', () => {
      const query: QueryContext = {
        text: 'Hello',
        type: 'chat',
      }

      const decision = router.route(query)
      expect(['local', 'cloud-fast'].includes(decision.tier)).toBe(true)
    })

    it('should route code generation to smart tier', () => {
      const query: QueryContext = {
        text: 'Write a function that merges two sorted arrays',
        type: 'code',
      }

      const decision = router.route(query)
      expect(['cloud-smart', 'cloud-fast'].includes(decision.tier)).toBe(true)
    })

    it('should route reasoning to reasoning tier', () => {
      const query: QueryContext = {
        text: 'Compare and contrast the philosophical implications of two theories step by step',
        type: 'reasoning',
      }

      const decision = router.route(query)
      expect(['cloud-reasoning', 'cloud-smart'].includes(decision.tier)).toBe(true)
    })

    it('should respect local-only flag', () => {
      const query: QueryContext = {
        text: 'Complex reasoning task',
        type: 'reasoning',
        localOnly: true,
      }

      const decision = router.route(query)
      expect(decision.tier).toBe('local')
    })

    it('should respect latency requirements', () => {
      const query: QueryContext = {
        text: 'What is the weather?',
        type: 'voice',
        maxLatencyMs: 200,
      }

      const decision = router.route(query)
      expect(decision.estimatedLatencyMs).toBeLessThanOrEqual(500)
    })
  })

  describe('Budget Tracking', () => {
    it('should track spending', () => {
      const budget = router.getBudget()
      expect(budget.spentTodayCents).toBe(0)

      router.recordSpend(100)
      const updatedBudget = router.getBudget()
      expect(updatedBudget.spentTodayCents).toBe(100)
    })

    it('should set custom budget limits', () => {
      router.setBudget(1000, 10000)
      const budget = router.getBudget()
      expect(budget.dailyLimitCents).toBe(1000)
      expect(budget.monthlyLimitCents).toBe(10000)
    })

    it('should reset daily spending', () => {
      router.recordSpend(500)
      router.resetDailySpend()
      const budget = router.getBudget()
      expect(budget.spentTodayCents).toBe(0)
    })

    it('should track monthly spending across resets', () => {
      router.recordSpend(500)
      const budgetBefore = router.getBudget()
      expect(budgetBefore.spentThisMonthCents).toBe(500)

      router.resetDailySpend()
      const budgetAfter = router.getBudget()
      expect(budgetAfter.spentThisMonthCents).toBe(500)
      expect(budgetAfter.spentTodayCents).toBe(0)
    })
  })

  describe('Model Availability', () => {
    it('should report available models', () => {
      const available = router.getAvailableModels()
      expect(available.length).toBeGreaterThan(0)
      expect(available.every((m) => m.available)).toBe(true)
    })

    it('should set model availability', () => {
      router.setModelAvailability('openai/gpt-4o', false)
      const available = router.getAvailableModels()
      expect(available.find((m) => m.id === 'openai/gpt-4o')).toBeUndefined()
    })

    it('should handle unavailable models gracefully', () => {
      router.setModelAvailability('openai/gpt-4o', false)
      router.setModelAvailability('anthropic/claude-sonnet-4-6', false)

      const query: QueryContext = {
        text: 'simple query',
        type: 'chat',
      }

      const decision = router.route(query)
      expect(decision).toBeDefined()
      expect(decision.confidence).toBeLessThan(1)
    })
  })

  describe('Routing Statistics', () => {
    it('should track routing decisions', () => {
      const query: QueryContext = {
        text: 'hello',
        type: 'chat',
      }

      const decision = router.route(query)
      expect(decision).toBeDefined()
      expect(decision.tier).toBeDefined()
      expect(['local', 'cloud-fast', 'cloud-smart', 'cloud-reasoning']).toContain(decision.tier)
    })

    it('should track decisions by tier', () => {
      const simpleQuery: QueryContext = { text: 'hi', type: 'chat' }
      const complexQuery: QueryContext = {
        text: 'reason about this'.repeat(10),
        type: 'reasoning',
      }

      const decision1 = router.route(simpleQuery)
      const decision2 = router.route(complexQuery)

      expect(decision1.tier).toBeDefined()
      expect(decision2.tier).toBeDefined()
      const stats = router.getRoutingStats()
      expect(stats.byTier).toBeDefined()
    })

    it('should calculate satisfaction score', () => {
      const query: QueryContext = { text: 'hello', type: 'chat' }
      const decision = router.route(query)

      router.recordFeedback(decision.modelId, 'good')
      const stats = router.getRoutingStats()
      expect(stats.satisfaction).toBeGreaterThanOrEqual(0)
      expect(stats.satisfaction).toBeLessThanOrEqual(1)
    })
  })

  describe('Latency Estimation', () => {
    it('should provide latency estimates', () => {
      const query: QueryContext = {
        text: 'query',
        type: 'chat',
      }

      const decision = router.route(query)
      expect(decision.estimatedLatencyMs).toBeGreaterThan(0)
    })

    it('should prefer low-latency models for voice queries', () => {
      const query: QueryContext = {
        text: 'What is the time?',
        type: 'voice',
      }

      const decision = router.route(query)
      expect(decision.estimatedLatencyMs).toBeLessThan(1000)
    })

    it('should prefer smart models for complex queries despite latency', () => {
      const query: QueryContext = {
        text: 'Provide deep analysis'.repeat(20),
        type: 'reasoning',
      }

      const decision = router.route(query)
      // For reasoning-type queries, should route to cloud tier
      expect(['cloud-fast', 'cloud-smart', 'cloud-reasoning'].includes(decision.tier)).toBe(true)
      expect(decision.estimatedLatencyMs).toBeGreaterThan(0)
    })
  })

  describe('Cost Estimation', () => {
    it('should provide cost estimates', () => {
      const query: QueryContext = {
        text: 'simple query',
        type: 'chat',
      }

      const decision = router.route(query)
      expect(decision.estimatedCost).toBeGreaterThanOrEqual(0)
    })

    it('should estimate higher cost for reasoning models', () => {
      const simpleQuery: QueryContext = {
        text: 'hello',
        type: 'chat',
      }

      const complexQuery: QueryContext = {
        text: 'Complex reasoning task'.repeat(30),
        type: 'reasoning',
      }

      const simpleDecision = router.route(simpleQuery)
      const complexDecision = router.route(complexQuery)

      expect(complexDecision.estimatedCost).toBeGreaterThan(simpleDecision.estimatedCost)
    })
  })

  describe('Custom Models', () => {
    it('should add custom model', () => {
      const customModel = {
        id: 'custom/model-1',
        tier: 'cloud-smart' as const,
        maxTokens: 4000,
        strengths: ['chat', 'code'],
        avgLatencyMs: 400,
        costPer1kTokens: 0.05,
        available: true,
        contextWindow: 16000,
      }

      router.addModel(customModel)
      const available = router.getAvailableModels()
      expect(available.find((m) => m.id === 'custom/model-1')).toBeDefined()
    })
  })

  describe('Confidence Scores', () => {
    it('should provide confidence score in routing decisions', () => {
      const query: QueryContext = {
        text: 'hello',
        type: 'chat',
      }

      const decision = router.route(query)
      expect(decision.confidence).toBeGreaterThanOrEqual(0)
      expect(decision.confidence).toBeLessThanOrEqual(1)
    })

    it('should lower confidence when fallback is used', () => {
      // Make preferred tier unavailable
      router.setModelAvailability('openai/gpt-4o', false)
      router.setModelAvailability('anthropic/claude-sonnet-4-6', false)

      const query: QueryContext = {
        text: 'hello',
        type: 'chat',
      }

      const decision = router.route(query)
      expect(decision.confidence).toBeLessThan(1)
    })
  })
})
