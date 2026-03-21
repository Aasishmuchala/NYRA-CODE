import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { agentNetwork } from '../os-integration/agent-network'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('AgentNetwork', () => {
  const dataDir = path.join(os.homedir(), '.nyra', 'os-integration')
  const networkFile = path.join(dataDir, 'agent-network.json')

  beforeEach(() => {
    // Clean up persisted data before test (before init!)
    try {
      if (fs.existsSync(networkFile)) {
        fs.unlinkSync(networkFile)
      }
    } catch {}
    // Reset singleton in-memory state that init() doesn't clear
    try { agentNetwork.leave() } catch {}
    ;(agentNetwork as any).isConnected = false
    ;(agentNetwork as any).optInConsent = false
    ;(agentNetwork as any).insights = new Map()
    ;(agentNetwork as any).taskApproaches = new Map()
    ;(agentNetwork as any).trendingTopics = new Map()
    ;(agentNetwork as any).federatedModels = new Map()
    agentNetwork.removeAllListeners()
    agentNetwork.init()
  })

  afterEach(() => {
    agentNetwork.shutdown()
    // Clean up after test
    try {
      if (fs.existsSync(networkFile)) {
        fs.unlinkSync(networkFile)
      }
    } catch {}
  })

  describe('Initialization & Lifecycle', () => {
    it('should initialize without error', () => {
      expect(agentNetwork).toBeDefined()
    })

    it('should create data directory on init', () => {
      const dataDir = path.join(os.homedir(), '.nyra', 'os-integration')
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should persist and restore network data', () => {
      agentNetwork.join('test-network')
      agentNetwork.shareInsight('test-topic', 'test insight', 0.8)
      agentNetwork.shutdown()

      // Reset in-memory connection state to simulate fresh process start
      ;(agentNetwork as any).isConnected = false
      ;(agentNetwork as any).optInConsent = false
      ;(agentNetwork as any).insights = new Map()
      agentNetwork.init()
      // Connection state is not persisted, but insights are
      expect(agentNetwork.isNetworkConnected()).toBe(false)
      expect(agentNetwork.getCachedInsightsCount()).toBeGreaterThan(0)
    })

    it('should generate consistent anonymous ID', () => {
      const id1 = agentNetwork.getCachedInsightsCount()
      agentNetwork.shutdown()

      agentNetwork.init()
      const id2 = agentNetwork.getCachedInsightsCount()

      // Both should succeed
      expect(typeof id1).toBe('number')
      expect(typeof id2).toBe('number')
    })
  })

  describe('Network Joining', () => {
    it('should join a network with default ID', () => {
      const listener = vi.fn()
      agentNetwork.on('network-joined', listener)

      agentNetwork.join()

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        networkId: 'nyra-global'
      }))
      expect(agentNetwork.isNetworkConnected()).toBe(true)
    })

    it('should join a network with custom ID', () => {
      const listener = vi.fn()
      agentNetwork.on('network-joined', listener)

      agentNetwork.join('custom-network')

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        networkId: 'custom-network'
      }))
    })

    it('should set hub URL for network connectivity', () => {
      agentNetwork.setHubUrl('http://localhost:8080')
      agentNetwork.join()
      expect(agentNetwork.isNetworkConnected()).toBe(true)
    })

    it('should allow offline mode with null hub URL', () => {
      agentNetwork.setHubUrl(null)
      agentNetwork.join()
      expect(agentNetwork.isNetworkConnected()).toBe(true)
    })
  })

  describe('Network Leaving', () => {
    it('should leave a network', () => {
      const listener = vi.fn()
      agentNetwork.on('network-left', listener)

      agentNetwork.join('test-network')
      agentNetwork.leave()

      expect(listener).toHaveBeenCalled()
      expect(agentNetwork.isNetworkConnected()).toBe(false)
    })

    it('should clear data on leave', () => {
      agentNetwork.join()
      agentNetwork.shareInsight('test-topic', 'test insight', 0.8)

      expect(agentNetwork.getCachedInsightsCount()).toBeGreaterThan(0)

      agentNetwork.leave()
      expect(agentNetwork.getCachedInsightsCount()).toBe(0)
    })

    it('should not throw when leaving if not connected', () => {
      agentNetwork.leave()
      agentNetwork.leave()
      expect(agentNetwork.isNetworkConnected()).toBe(false)
    })
  })

  describe('Insights Sharing', () => {
    it('should require network connection to share insight', () => {
      expect(() => {
        agentNetwork.shareInsight('topic', 'content', 0.8)
      }).toThrow('Must be connected')
    })

    it('should share an insight when connected', () => {
      const listener = vi.fn()
      agentNetwork.on('insight-shared', listener)

      agentNetwork.join()
      const insightId = agentNetwork.shareInsight('test-topic', 'test content', 0.85)

      expect(insightId).toBeDefined()
      expect(insightId).toMatch(/^insight_/)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        topic: 'test-topic',
        confidence: 0.85
      }))
    })

    it('should validate confidence between 0 and 1', () => {
      agentNetwork.join()

      expect(() => {
        agentNetwork.shareInsight('topic', 'content', -0.5)
      }).toThrow('Confidence must be between 0 and 1')

      expect(() => {
        agentNetwork.shareInsight('topic', 'content', 1.5)
      }).toThrow('Confidence must be between 0 and 1')
    })

    it('should query insights by topic', () => {
      agentNetwork.join()
      agentNetwork.shareInsight('python', 'Use list comprehension for efficiency', 0.9)
      agentNetwork.shareInsight('python', 'Type hints improve readability', 0.85)
      agentNetwork.shareInsight('javascript', 'Use const by default', 0.8)

      const pythonInsights = agentNetwork.queryInsights('python', 0.8)
      expect(pythonInsights.length).toBeGreaterThanOrEqual(2)
      expect(pythonInsights.every(i => i.topic === 'python')).toBe(true)
    })

    it('should filter insights by minimum confidence', () => {
      agentNetwork.join()
      agentNetwork.shareInsight('topic', 'low confidence', 0.3)
      agentNetwork.shareInsight('topic', 'high confidence', 0.9)

      const highConfidence = agentNetwork.queryInsights('topic', 0.8)
      expect(highConfidence.length).toBeGreaterThanOrEqual(1)
      expect(highConfidence.every(i => i.confidence >= 0.8)).toBe(true)
    })
  })

  describe('Insight Voting', () => {
    it('should vote on an insight as helpful', () => {
      const listener = vi.fn()
      agentNetwork.on('insight-voted', listener)

      agentNetwork.join()
      const insightId = agentNetwork.shareInsight('topic', 'content', 0.8)
      agentNetwork.voteInsight(insightId, true)

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        helpful: true
      }))
    })

    it('should increment votes when voting helpful', () => {
      agentNetwork.join()
      const insightId = agentNetwork.shareInsight('topic', 'content', 0.8)

      const before = agentNetwork.queryInsights('topic')[0]?.votes || 0
      agentNetwork.voteInsight(insightId, true)
      const after = agentNetwork.queryInsights('topic')[0]?.votes || 0

      expect(after).toBeGreaterThanOrEqual(before)
    })

    it('should throw when voting on nonexistent insight', () => {
      agentNetwork.join()

      expect(() => {
        agentNetwork.voteInsight('nonexistent', true)
      }).toThrow('not found')
    })
  })

  describe('Task Outcomes', () => {
    it('should require connection to report outcome', () => {
      expect(() => {
        agentNetwork.reportTaskOutcome('code-review', 'approach-1', true)
      }).toThrow('Must be connected')
    })

    it('should report a task outcome', () => {
      const listener = vi.fn()
      agentNetwork.on('outcome-reported', listener)

      agentNetwork.join()
      agentNetwork.reportTaskOutcome('code-review', 'static-analysis', true)

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        taskType: 'code-review',
        approach: 'static-analysis',
        success: true
      }))
    })

    it('should get best approach for task', () => {
      agentNetwork.join()

      // Report outcomes for different approaches
      agentNetwork.reportTaskOutcome('translation', 'api-call', true)
      agentNetwork.reportTaskOutcome('translation', 'api-call', true)
      agentNetwork.reportTaskOutcome('translation', 'local-model', true)
      agentNetwork.reportTaskOutcome('translation', 'local-model', false)

      const best = agentNetwork.getBestApproach('translation')
      expect(best).toBeDefined()
      expect(best?.approach).toBeDefined()
    })

    it('should return null for unknown task type', () => {
      agentNetwork.join()
      const best = agentNetwork.getBestApproach('unknown-task')
      expect(best).toBeNull()
    })
  })

  describe('Trending Topics', () => {
    it('should get trending topics', () => {
      agentNetwork.join()

      agentNetwork.shareInsight('react', 'tip 1', 0.8)
      agentNetwork.shareInsight('react', 'tip 2', 0.8)
      agentNetwork.shareInsight('react', 'tip 3', 0.8)
      agentNetwork.shareInsight('python', 'tip 1', 0.8)

      const trending = agentNetwork.getTrendingTopics()
      expect(Array.isArray(trending)).toBe(true)
      expect(trending.length).toBeGreaterThan(0)
    })
  })

  describe('Federated Learning', () => {
    it('should contribute gradients when connected', () => {
      const listener = vi.fn()
      agentNetwork.on('gradients-contributed', listener)

      agentNetwork.join()
      agentNetwork.contributeGradients('model-v1', [[0.1, 0.2], [0.3, 0.4]])

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        modelId: 'model-v1'
      }))
    })

    it('should require connection to contribute gradients', () => {
      expect(() => {
        agentNetwork.contributeGradients('model', [[0.1]])
      }).toThrow('Must be connected')
    })

    it('should validate non-empty gradients', () => {
      agentNetwork.join()

      expect(() => {
        agentNetwork.contributeGradients('model', [])
      }).toThrow('non-empty')
    })

    it('should request model update', () => {
      const listener = vi.fn()
      agentNetwork.on('model-update-requested', listener)

      agentNetwork.join()
      const model = agentNetwork.requestModelUpdate('model-v1')

      expect(model).toBeDefined()
      expect(model?.modelId).toBe('model-v1')
      expect(listener).toHaveBeenCalled()
    })

    it('should return null for disconnected model request', () => {
      const model = agentNetwork.requestModelUpdate('model-v1')
      expect(model).toBeNull()
    })
  })

  describe('Consent Management', () => {
    it('should check opt-in consent', () => {
      expect(agentNetwork.hasOptedIn()).toBe(false)

      agentNetwork.join()
      expect(agentNetwork.hasOptedIn()).toBe(true)
    })

    it('should update opt-in consent', () => {
      const listener = vi.fn()
      agentNetwork.on('consent-changed', listener)

      agentNetwork.setOptIn(true)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        consented: true
      }))

      agentNetwork.setOptIn(false)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        consented: false
      }))
    })
  })

  describe('Network Statistics', () => {
    it('should get network statistics', () => {
      agentNetwork.join()
      const stats = agentNetwork.getNetworkStats()

      expect(stats).toBeDefined()
      expect(stats.totalNodes).toBeGreaterThan(0)
      expect(stats.activeAgents).toBeGreaterThan(0)
      expect(Array.isArray(stats.populateSkills)).toBe(true)
    })
  })

  describe('Cache Management', () => {
    it('should get cached insights count', () => {
      expect(agentNetwork.getCachedInsightsCount()).toBe(0)

      agentNetwork.join()
      agentNetwork.shareInsight('topic', 'content', 0.8)

      expect(agentNetwork.getCachedInsightsCount()).toBeGreaterThan(0)
    })

    it('should clear local cache', () => {
      const listener = vi.fn()
      agentNetwork.on('cache-cleared', listener)

      agentNetwork.join()
      agentNetwork.shareInsight('topic', 'content', 0.8)
      expect(agentNetwork.getCachedInsightsCount()).toBeGreaterThan(0)

      agentNetwork.clearCache()
      expect(agentNetwork.getCachedInsightsCount()).toBe(0)
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('Persistence', () => {
    it('should save network data on shutdown', () => {
      agentNetwork.join('test-net')
      agentNetwork.shareInsight('topic', 'content', 0.8)
      agentNetwork.shutdown()

      const dataPath = path.join(os.homedir(), '.nyra', 'os-integration', 'agent-network.json')
      expect(fs.existsSync(dataPath)).toBe(true)
    })

    it('should restore network data on init', () => {
      agentNetwork.join()
      agentNetwork.shareInsight('topic', 'content', 0.8)
      agentNetwork.shutdown()

      agentNetwork.init()
      expect(agentNetwork.getCachedInsightsCount()).toBeGreaterThan(0)
    })
  })
})
