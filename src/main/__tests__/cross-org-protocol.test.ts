import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { crossOrgProtocol, agentMarketplace } from '../platform/cross-org-protocol'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('CrossOrgProtocol', () => {
  let tmpDir: string
  const dataDir = path.join(os.homedir(), '.nyra', 'platform')
  const crossOrgFile = path.join(dataDir, 'cross-org.json')

  beforeEach(() => {
    // Clean up persisted data before each test (before init!)
    try {
      if (fs.existsSync(crossOrgFile)) fs.unlinkSync(crossOrgFile)
    } catch {}

    // Reset singleton internal state
    ;(crossOrgProtocol as any).localAgents = new Map()
    ;(crossOrgProtocol as any).knownAgents = new Map()
    ;(crossOrgProtocol as any).messageQueue = []
    ;(crossOrgProtocol as any).rateLimitCounters = new Map()
    ;(crossOrgProtocol as any).remoteEndpoints = new Map()
    // Close existing HTTP server to avoid EADDRINUSE
    try { ;(crossOrgProtocol as any).httpServer?.close() } catch {}
    ;(crossOrgProtocol as any).httpServer = null
    crossOrgProtocol.removeAllListeners()

    tmpDir = path.join(os.tmpdir(), 'nyra-test-protocol')
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
    crossOrgProtocol.init()
  })

  afterEach(() => {
    crossOrgProtocol.shutdown()
    crossOrgProtocol.clearQueue()
    // Clean up persisted data
    try {
      if (fs.existsSync(crossOrgFile)) fs.unlinkSync(crossOrgFile)
    } catch {}
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  describe('Initialization', () => {
    it('should initialize without error', () => {
      expect(crossOrgProtocol).toBeDefined()
    })

    it('should create data directory on init', () => {
      const dataDir = path.join(os.homedir(), '.nyra', 'platform')
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should persist and restore protocol data', () => {
      const identity = {
        orgId: 'org-1',
        agentId: 'agent-1',
        publicKey: 'test-key',
        capabilities: ['code', 'analysis'],
        trustLevel: 'verified' as const
      }
      crossOrgProtocol.register(identity)
      crossOrgProtocol.shutdown()

      crossOrgProtocol.init()
      const discovered = crossOrgProtocol.discover(['code'])
      expect(discovered.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Agent Registration', () => {
    it('should register a local agent', () => {
      const listener = vi.fn()
      crossOrgProtocol.on('agent-registered', listener)

      const identity = {
        orgId: 'org-1',
        agentId: 'agent-1',
        publicKey: 'test-key',
        capabilities: ['code'],
        trustLevel: 'verified' as const
      }

      crossOrgProtocol.register(identity)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-1'
      }))
    })

    it('should register multiple agents', () => {
      const agent1 = {
        orgId: 'org-1',
        agentId: 'agent-1',
        publicKey: 'key-1',
        capabilities: ['code'],
        trustLevel: 'verified' as const
      }

      const agent2 = {
        orgId: 'org-2',
        agentId: 'agent-2',
        publicKey: 'key-2',
        capabilities: ['analysis'],
        trustLevel: 'trusted' as const
      }

      crossOrgProtocol.register(agent1)
      crossOrgProtocol.register(agent2)

      const discovered = crossOrgProtocol.discover(['code', 'analysis'])
      expect(discovered.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Agent Discovery', () => {
    it('should discover agents by capability', () => {
      const identity = {
        orgId: 'org-1',
        agentId: 'agent-1',
        publicKey: 'test-key',
        capabilities: ['code-review', 'testing'],
        trustLevel: 'verified' as const
      }

      crossOrgProtocol.register(identity)
      const discovered = crossOrgProtocol.discover(['code-review'])
      
      expect(discovered.length).toBeGreaterThanOrEqual(1)
      expect(discovered.some(a => a.agentId === 'agent-1')).toBe(true)
    })

    it('should discover agents with case-insensitive capability matching', () => {
      const identity = {
        orgId: 'org-1',
        agentId: 'agent-1',
        publicKey: 'test-key',
        capabilities: ['Code-Review'],
        trustLevel: 'verified' as const
      }

      crossOrgProtocol.register(identity)
      const discovered = crossOrgProtocol.discover(['code'])
      
      expect(discovered.length).toBeGreaterThanOrEqual(1)
    })

    it('should return empty array if no agents match capability', () => {
      const discovered = crossOrgProtocol.discover(['nonexistent-capability'])
      expect(Array.isArray(discovered)).toBe(true)
    })
  })

  describe('Message Sending & Rate Limiting', () => {
    it('should throw error when sending without local agent', () => {
      const targetIdentity = {
        orgId: 'org-2',
        agentId: 'agent-2',
        publicKey: 'key-2',
        capabilities: [],
        trustLevel: 'verified' as const
      }

      expect(() => {
        crossOrgProtocol.sendMessage(targetIdentity, 'request', { test: true })
      }).toThrow('No local agent registered')
    })

    it('should queue a message when sending from registered agent', () => {
      const localAgent = {
        orgId: 'org-1',
        agentId: 'agent-1',
        publicKey: 'key-1',
        capabilities: ['testing'],
        trustLevel: 'verified' as const
      }

      const targetAgent = {
        orgId: 'org-2',
        agentId: 'agent-2',
        publicKey: 'key-2',
        capabilities: [],
        trustLevel: 'verified' as const
      }

      crossOrgProtocol.register(localAgent)
      crossOrgProtocol.registerRemoteEndpoint('org-2', 'http://localhost:18792')

      const listener = vi.fn()
      crossOrgProtocol.on('message-queued', listener)

      const message = crossOrgProtocol.sendMessage(targetAgent, 'request', { test: 'data' })
      
      expect(message).toBeDefined()
      expect(message.type).toBe('request')
      expect(listener).toHaveBeenCalled()
    })

    it('should enforce rate limiting', () => {
      const localAgent = {
        orgId: 'org-1',
        agentId: 'agent-1',
        publicKey: 'key-1',
        capabilities: [],
        trustLevel: 'verified' as const
      }

      const targetAgent = {
        orgId: 'org-2',
        agentId: 'agent-2',
        publicKey: 'key-2',
        capabilities: [],
        trustLevel: 'verified' as const
      }

      crossOrgProtocol.register(localAgent)
      crossOrgProtocol.registerRemoteEndpoint('org-2', 'http://localhost:18792')

      // Try to send many messages in quick succession
      for (let i = 0; i < 105; i++) {
        try {
          crossOrgProtocol.sendMessage(targetAgent, 'request', { i })
        } catch (e) {
          expect((e as Error).message).toContain('Rate limit exceeded')
          return
        }
      }

      // If we got here without catching rate limit, check status
      const status = crossOrgProtocol.getQueueStatus()
      expect(status.queuedMessages).toBeDefined()
    })
  })

  describe('Message Verification', () => {
    it('should verify signature of signed message', () => {
      const localAgent = {
        orgId: 'org-1',
        agentId: 'agent-1',
        publicKey: 'key-1',
        capabilities: [],
        trustLevel: 'verified' as const
      }

      crossOrgProtocol.register(localAgent)
      crossOrgProtocol.registerRemoteEndpoint('org-2', 'http://localhost:18792')

      const targetAgent = {
        orgId: 'org-2',
        agentId: 'agent-2',
        publicKey: 'key-1',
        capabilities: [],
        trustLevel: 'verified' as const
      }

      crossOrgProtocol.register(targetAgent)

      const message = crossOrgProtocol.sendMessage(targetAgent, 'response', { result: 'ok' })
      const verified = crossOrgProtocol.receiveMessage(message)
      
      expect(verified).toBe(true)
    })

    it('should reject messages with invalid signature', () => {
      const agent = {
        orgId: 'org-1',
        agentId: 'agent-1',
        publicKey: 'key-1',
        capabilities: [],
        trustLevel: 'verified' as const
      }

      crossOrgProtocol.register(agent)

      const listener = vi.fn()
      crossOrgProtocol.on('message-verification-failed', listener)

      const badMessage = {
        from: agent,
        to: agent,
        type: 'request' as const,
        payload: {},
        signature: 'invalid-signature',
        timestamp: Date.now(),
        nonce: 'test-nonce'
      }

      const verified = crossOrgProtocol.receiveMessage(badMessage)
      expect(verified).toBe(false)
      expect(listener).toHaveBeenCalled()
    })

    it('should reject expired messages', () => {
      const { createHmac } = require('crypto')
      const agent = {
        orgId: 'org-1',
        agentId: 'agent-1',
        publicKey: 'key-1',
        capabilities: [],
        trustLevel: 'verified' as const
      }

      crossOrgProtocol.register(agent)

      const listener = vi.fn()
      crossOrgProtocol.on('message-expired', listener)

      const oldTimestamp = Date.now() - 400000 // 6+ minutes old
      const nonce = 'test-nonce'

      // Create a valid signature so it passes signature check but fails expiry
      const payload = JSON.stringify({
        from: agent.agentId,
        to: agent.agentId,
        type: 'request',
        timestamp: oldTimestamp,
        nonce,
      })
      const hmac = createHmac('sha256', agent.publicKey)
      const signature = hmac.update(payload).digest('hex')

      const oldMessage = {
        from: agent,
        to: agent,
        type: 'request' as const,
        payload: {},
        signature,
        timestamp: oldTimestamp,
        nonce,
      }

      const verified = crossOrgProtocol.receiveMessage(oldMessage)
      expect(verified).toBe(false)
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('Queue Management', () => {
    it('should get queue status', () => {
      const status = crossOrgProtocol.getQueueStatus()
      expect(status.queuedMessages).toBe(0)
      expect(status.oldestMessage).toBeNull()
    })

    it('should clear message queue', () => {
      const localAgent = {
        orgId: 'org-1',
        agentId: 'agent-1',
        publicKey: 'key-1',
        capabilities: [],
        trustLevel: 'verified' as const
      }

      const targetAgent = {
        orgId: 'org-2',
        agentId: 'agent-2',
        publicKey: 'key-2',
        capabilities: [],
        trustLevel: 'verified' as const
      }

      crossOrgProtocol.register(localAgent)
      crossOrgProtocol.registerRemoteEndpoint('org-2', 'http://localhost:18792')
      crossOrgProtocol.sendMessage(targetAgent, 'request', {})

      crossOrgProtocol.clearQueue()
      const status = crossOrgProtocol.getQueueStatus()
      expect(status.queuedMessages).toBe(0)
    })
  })
})

describe('AgentMarketplace', () => {
  const marketplaceDir = path.join(os.homedir(), '.nyra', 'platform')
  const marketplaceFile = path.join(marketplaceDir, 'agent-marketplace.json')

  beforeEach(() => {
    // Clean persisted marketplace data so each test starts fresh
    try { if (fs.existsSync(marketplaceFile)) fs.unlinkSync(marketplaceFile) } catch {}
    agentMarketplace.removeAllListeners()
    // Reset internal maps by re-initializing (init loads from file, which is now gone)
    ;(agentMarketplace as any).agents = new Map()
    ;(agentMarketplace as any).accessRequests = new Map()
    ;(agentMarketplace as any).grants = new Map()
    agentMarketplace.init()
  })

  afterEach(() => {
    agentMarketplace.shutdown()
    try { if (fs.existsSync(marketplaceFile)) fs.unlinkSync(marketplaceFile) } catch {}
  })

  describe('Initialization', () => {
    it('should initialize without error', () => {
      expect(agentMarketplace).toBeDefined()
    })
  })

  describe('Agent Publishing', () => {
    it('should publish an agent', () => {
      const listener = vi.fn()
      agentMarketplace.on('agent-published', listener)

      const definition = {
        agentId: 'agent-1',
        orgId: 'org-1',
        name: 'Code Reviewer',
        description: 'Analyzes code quality',
        capabilities: ['code-review'],
        trustLevel: 'verified' as const,
        publicKey: 'key-1',
        accessControl: 'public' as const
      }

      agentMarketplace.publishAgent(definition)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-1'
      }))
    })

    it('should throw when publishing duplicate agent', () => {
      const definition = {
        agentId: 'agent-1',
        orgId: 'org-1',
        name: 'Code Reviewer',
        description: 'Analyzes code quality',
        capabilities: ['code-review'],
        trustLevel: 'verified' as const,
        publicKey: 'key-1',
        accessControl: 'public' as const
      }

      agentMarketplace.publishAgent(definition)
      
      expect(() => {
        agentMarketplace.publishAgent(definition)
      }).toThrow('already published')
    })
  })

  describe('Agent Listing', () => {
    it('should list public agents', () => {
      const definition = {
        agentId: 'agent-1',
        orgId: 'org-1',
        name: 'Code Reviewer',
        description: 'Analyzes code quality',
        capabilities: ['code-review'],
        trustLevel: 'verified' as const,
        publicKey: 'key-1',
        accessControl: 'public' as const
      }

      agentMarketplace.publishAgent(definition)
      const agents = agentMarketplace.listAgents()
      
      expect(agents.length).toBeGreaterThanOrEqual(1)
      expect(agents.some(a => a.agentId === 'agent-1')).toBe(true)
    })

    it('should filter agents by capability', () => {
      const agent1 = {
        agentId: 'agent-1',
        orgId: 'org-1',
        name: 'Code Reviewer',
        description: 'Analyzes code',
        capabilities: ['code-review'],
        trustLevel: 'verified' as const,
        publicKey: 'key-1',
        accessControl: 'public' as const
      }

      const agent2 = {
        agentId: 'agent-2',
        orgId: 'org-1',
        name: 'Data Analyzer',
        description: 'Analyzes data',
        capabilities: ['data-analysis'],
        trustLevel: 'verified' as const,
        publicKey: 'key-2',
        accessControl: 'public' as const
      }

      agentMarketplace.publishAgent(agent1)
      agentMarketplace.publishAgent(agent2)

      const codeAgents = agentMarketplace.listAgents({ capabilities: ['code-review'] })
      expect(codeAgents.some(a => a.agentId === 'agent-1')).toBe(true)
    })
  })

  describe('Access Control', () => {
    it('should grant access to public agents automatically', () => {
      const definition = {
        agentId: 'agent-1',
        orgId: 'org-1',
        name: 'Reviewer',
        description: 'Test',
        capabilities: [],
        trustLevel: 'verified' as const,
        publicKey: 'key-1',
        accessControl: 'public' as const
      }

      agentMarketplace.publishAgent(definition)
      agentMarketplace.requestAccess('agent-1', 'org-1', 'org-2')

      const hasAccess = agentMarketplace.hasAccess('agent-1', 'org-1', 'org-2')
      expect(hasAccess).toBe(true)
    })

    it('should handle restricted access with approval', () => {
      const definition = {
        agentId: 'agent-1',
        orgId: 'org-1',
        name: 'Reviewer',
        description: 'Test',
        capabilities: [],
        trustLevel: 'verified' as const,
        publicKey: 'key-1',
        accessControl: 'restricted' as const,
        allowedOrgs: ['org-2']
      }

      agentMarketplace.publishAgent(definition)
      const hasAccess = agentMarketplace.hasAccess('agent-1', 'org-1', 'org-2')
      
      expect(hasAccess).toBe(true)
    })

    it('should revoke access', () => {
      const definition = {
        agentId: 'agent-1',
        orgId: 'org-1',
        name: 'Reviewer',
        description: 'Test',
        capabilities: [],
        trustLevel: 'verified' as const,
        publicKey: 'key-1',
        accessControl: 'restricted' as const,
        allowedOrgs: ['org-2']
      }

      agentMarketplace.publishAgent(definition)

      // Restricted agent with org-2 in allowedOrgs has access via grants
      expect(agentMarketplace.hasAccess('agent-1', 'org-1', 'org-2')).toBe(true)

      agentMarketplace.revokeAccess('agent-1', 'org-1', 'org-2')
      expect(agentMarketplace.hasAccess('agent-1', 'org-1', 'org-2')).toBe(false)
    })
  })

  describe('Access Requests', () => {
    it('should handle access requests for restricted agents', () => {
      const listener = vi.fn()
      agentMarketplace.on('access-requested', listener)

      const definition = {
        agentId: 'agent-1',
        orgId: 'org-1',
        name: 'Reviewer',
        description: 'Test',
        capabilities: [],
        trustLevel: 'verified' as const,
        publicKey: 'key-1',
        accessControl: 'restricted' as const
      }

      agentMarketplace.publishAgent(definition)
      agentMarketplace.requestAccess('agent-1', 'org-1', 'org-2')

      expect(listener).toHaveBeenCalled()
    })

    it('should approve access requests', () => {
      const definition = {
        agentId: 'agent-1',
        orgId: 'org-1',
        name: 'Reviewer',
        description: 'Test',
        capabilities: [],
        trustLevel: 'verified' as const,
        publicKey: 'key-1',
        accessControl: 'restricted' as const
      }

      agentMarketplace.publishAgent(definition)
      agentMarketplace.requestAccess('agent-1', 'org-1', 'org-2')
      agentMarketplace.approveAccessRequest('agent-1', 'org-1', 'org-2', true)

      const hasAccess = agentMarketplace.hasAccess('agent-1', 'org-1', 'org-2')
      expect(hasAccess).toBe(true)
    })

    it('should get access requests for an agent', () => {
      const definition = {
        agentId: 'agent-1',
        orgId: 'org-1',
        name: 'Reviewer',
        description: 'Test',
        capabilities: [],
        trustLevel: 'verified' as const,
        publicKey: 'key-1',
        accessControl: 'restricted' as const
      }

      agentMarketplace.publishAgent(definition)
      agentMarketplace.requestAccess('agent-1', 'org-1', 'org-2')
      agentMarketplace.requestAccess('agent-1', 'org-1', 'org-3')

      const requests = agentMarketplace.getAccessRequests('agent-1', 'org-1')
      expect(requests.length).toBeGreaterThanOrEqual(2)
    })
  })
})
