import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { verticalAgentManager } from '../enterprise/vertical-agents'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('VerticalAgentManager', () => {
  beforeEach(() => {
    verticalAgentManager.init()
  })

  afterEach(() => {
    verticalAgentManager.shutdown()
  })

  describe('Initialization & Lifecycle', () => {
    it('should initialize without error', () => {
      expect(verticalAgentManager).toBeDefined()
    })

    it('should load pre-built packs on initialization', () => {
      const packs = verticalAgentManager.listPacks()
      expect(packs.length).toBeGreaterThanOrEqual(4)
    })

    it('should create data directory on init', () => {
      const dataDir = path.join(os.homedir(), '.nyra', 'enterprise')
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should persist and restore team activations', () => {
      verticalAgentManager.activatePack('pack-legal', 'team-1')
      verticalAgentManager.shutdown()

      verticalAgentManager.init()
      const activePacks = verticalAgentManager.getActivePacksForTeam('team-1')
      expect(activePacks.some(p => p.id === 'pack-legal')).toBe(true)
    })
  })

  describe('Pack Registration', () => {
    it('should have legal pack registered', () => {
      const pack = verticalAgentManager.getPack('pack-legal')
      expect(pack).toBeDefined()
      expect(pack?.name).toBe('Legal Pack')
      expect(pack?.category).toBe('legal')
    })

    it('should have finance pack registered', () => {
      const pack = verticalAgentManager.getPack('pack-finance')
      expect(pack).toBeDefined()
      expect(pack?.name).toBe('Finance Pack')
      expect(pack?.category).toBe('finance')
    })

    it('should have sales pack registered', () => {
      const pack = verticalAgentManager.getPack('pack-sales')
      expect(pack).toBeDefined()
      expect(pack?.name).toBe('Sales Pack')
      expect(pack?.category).toBe('sales')
    })

    it('should have engineering pack registered', () => {
      const pack = verticalAgentManager.getPack('pack-engineering')
      expect(pack).toBeDefined()
      expect(pack?.name).toBe('Engineering Pack')
      expect(pack?.category).toBe('engineering')
    })

    it('should throw when registering duplicate pack', () => {
      const pack = verticalAgentManager.getPack('pack-legal')!

      expect(() => {
        verticalAgentManager.registerPack(pack)
      }).toThrow('already registered')
    })

    it('should return undefined for nonexistent pack', () => {
      const pack = verticalAgentManager.getPack('pack-nonexistent')
      expect(pack).toBeUndefined()
    })
  })

  describe('Pack Listing', () => {
    it('should list all registered packs', () => {
      const packs = verticalAgentManager.listPacks()

      expect(packs.length).toBeGreaterThanOrEqual(4)
      expect(packs.some(p => p.id === 'pack-legal')).toBe(true)
      expect(packs.some(p => p.id === 'pack-finance')).toBe(true)
      expect(packs.some(p => p.id === 'pack-sales')).toBe(true)
      expect(packs.some(p => p.id === 'pack-engineering')).toBe(true)
    })

    it('should have agents in each pack', () => {
      const packs = verticalAgentManager.listPacks()

      packs.forEach(pack => {
        expect(pack.agents.length).toBeGreaterThan(0)
        expect(pack.tools.length).toBeGreaterThan(0)
        expect(pack.prompts.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Legal Pack', () => {
    it('should have contract reviewer agent', () => {
      const pack = verticalAgentManager.getPack('pack-legal')!
      const agent = pack.agents.find(a => a.id === 'agent-contract-reviewer')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Legal Document Analyst')
      expect(agent?.allowedTools).toContain('contract-extract')
    })

    it('should have compliance checker agent', () => {
      const pack = verticalAgentManager.getPack('pack-legal')!
      const agent = pack.agents.find(a => a.id === 'agent-compliance-checker')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Regulatory Compliance Specialist')
    })

    it('should have legal research agent', () => {
      const pack = verticalAgentManager.getPack('pack-legal')!
      const agent = pack.agents.find(a => a.id === 'agent-legal-research')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Case Law & Statute Researcher')
    })

    it('should have contract-related tools', () => {
      const pack = verticalAgentManager.getPack('pack-legal')!
      expect(pack.tools.some(t => t.id === 'contract-extract')).toBe(true)
      expect(pack.tools.some(t => t.id === 'risk-flag')).toBe(true)
    })
  })

  describe('Finance Pack', () => {
    it('should have bookkeeper agent', () => {
      const pack = verticalAgentManager.getPack('pack-finance')!
      const agent = pack.agents.find(a => a.id === 'agent-bookkeeper')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Financial Transaction Manager')
    })

    it('should have auditor agent', () => {
      const pack = verticalAgentManager.getPack('pack-finance')!
      const agent = pack.agents.find(a => a.id === 'agent-auditor')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Financial Compliance Auditor')
    })

    it('should have forecaster agent', () => {
      const pack = verticalAgentManager.getPack('pack-finance')!
      const agent = pack.agents.find(a => a.id === 'agent-forecaster')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Financial Trend & Forecasting Analyst')
    })

    it('should have transaction categorizer tool', () => {
      const pack = verticalAgentManager.getPack('pack-finance')!
      expect(pack.tools.some(t => t.id === 'transaction-categorize')).toBe(true)
    })
  })

  describe('Sales Pack', () => {
    it('should have prospector agent', () => {
      const pack = verticalAgentManager.getPack('pack-sales')!
      const agent = pack.agents.find(a => a.id === 'agent-prospector')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Lead Research & Outreach Specialist')
    })

    it('should have deal analyst agent', () => {
      const pack = verticalAgentManager.getPack('pack-sales')!
      const agent = pack.agents.find(a => a.id === 'agent-deal-analyst')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Sales Pipeline & Win Probability Analyst')
    })

    it('should have CRM sync agent', () => {
      const pack = verticalAgentManager.getPack('pack-sales')!
      const agent = pack.agents.find(a => a.id === 'agent-crm-sync')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Sales Data Automation Specialist')
    })

    it('should have lead research tool', () => {
      const pack = verticalAgentManager.getPack('pack-sales')!
      expect(pack.tools.some(t => t.id === 'lead-research')).toBe(true)
    })
  })

  describe('Engineering Pack', () => {
    it('should have code reviewer agent', () => {
      const pack = verticalAgentManager.getPack('pack-engineering')!
      const agent = pack.agents.find(a => a.id === 'agent-code-reviewer')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Pull Request & Code Quality Expert')
    })

    it('should have incident responder agent', () => {
      const pack = verticalAgentManager.getPack('pack-engineering')!
      const agent = pack.agents.find(a => a.id === 'agent-incident-responder')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Log Analysis & Root Cause Analysis Specialist')
    })

    it('should have docs writer agent', () => {
      const pack = verticalAgentManager.getPack('pack-engineering')!
      const agent = pack.agents.find(a => a.id === 'agent-docs-writer')

      expect(agent).toBeDefined()
      expect(agent?.role).toBe('Technical Documentation Specialist')
    })

    it('should have code analysis tool', () => {
      const pack = verticalAgentManager.getPack('pack-engineering')!
      expect(pack.tools.some(t => t.id === 'code-analyze')).toBe(true)
    })
  })

  describe('Pack Activation', () => {
    it('should activate a pack for a team', () => {
      verticalAgentManager.activatePack('pack-legal', 'team-1')

      const activePacks = verticalAgentManager.getActivePacksForTeam('team-1')
      expect(activePacks.some(p => p.id === 'pack-legal')).toBe(true)
    })

    it('should activate multiple packs for a team', () => {
      verticalAgentManager.activatePack('pack-legal', 'team-1')
      verticalAgentManager.activatePack('pack-finance', 'team-1')

      const activePacks = verticalAgentManager.getActivePacksForTeam('team-1')
      expect(activePacks.length).toBe(2)
      expect(activePacks.some(p => p.id === 'pack-legal')).toBe(true)
      expect(activePacks.some(p => p.id === 'pack-finance')).toBe(true)
    })

    it('should throw when activating nonexistent pack', () => {
      expect(() => {
        verticalAgentManager.activatePack('pack-nonexistent', 'team-1')
      }).toThrow('not found')
    })

    it('should return empty array for team with no active packs', () => {
      const activePacks = verticalAgentManager.getActivePacksForTeam('team-no-packs')
      expect(activePacks).toEqual([])
    })
  })

  describe('Pack Deactivation', () => {
    it('should deactivate a pack for a team', () => {
      verticalAgentManager.activatePack('pack-legal', 'team-1')
      verticalAgentManager.deactivatePack('pack-legal', 'team-1')

      const activePacks = verticalAgentManager.getActivePacksForTeam('team-1')
      expect(activePacks.some(p => p.id === 'pack-legal')).toBe(false)
    })

    it('should not throw when deactivating nonexistent pack', () => {
      expect(() => {
        verticalAgentManager.deactivatePack('pack-nonexistent', 'team-1')
      }).not.toThrow()
    })

    it('should allow multiple activation/deactivation cycles', () => {
      verticalAgentManager.activatePack('pack-legal', 'team-1')
      verticalAgentManager.deactivatePack('pack-legal', 'team-1')
      verticalAgentManager.activatePack('pack-legal', 'team-1')

      const activePacks = verticalAgentManager.getActivePacksForTeam('team-1')
      expect(activePacks.some(p => p.id === 'pack-legal')).toBe(true)
    })
  })

  describe('Agent Details', () => {
    it('should have maxTokens configuration for agents', () => {
      const pack = verticalAgentManager.getPack('pack-legal')!

      pack.agents.forEach(agent => {
        expect(agent.maxTokens).toBeGreaterThan(0)
        expect(agent.maxTokens).toBeLessThanOrEqual(8000)
      })
    })

    it('should have allowed tools for each agent', () => {
      const pack = verticalAgentManager.getPack('pack-legal')!

      pack.agents.forEach(agent => {
        expect(agent.allowedTools.length).toBeGreaterThan(0)
        // Verify tools are available in pack
        agent.allowedTools.forEach(toolId => {
          const toolExists = pack.tools.some(t => t.id === toolId)
          expect(toolExists).toBe(true)
        })
      })
    })

    it('should have system prompts for agents', () => {
      const pack = verticalAgentManager.getPack('pack-legal')!

      pack.agents.forEach(agent => {
        expect(agent.systemPrompt).toBeDefined()
        expect(agent.systemPrompt.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Tool Details', () => {
    it('should have parameters for each tool', () => {
      const pack = verticalAgentManager.getPack('pack-legal')!

      pack.tools.forEach(tool => {
        expect(tool.parameters).toBeDefined()
        expect(typeof tool.parameters).toBe('object')
      })
    })

    it('should have handler for each tool', () => {
      const pack = verticalAgentManager.getPack('pack-legal')!

      pack.tools.forEach(tool => {
        expect(tool.handler).toBeDefined()
        expect(typeof tool.handler).toBe('string')
      })
    })

    it('should have descriptions for each tool', () => {
      const pack = verticalAgentManager.getPack('pack-finance')!

      pack.tools.forEach(tool => {
        expect(tool.description).toBeDefined()
        expect(tool.description.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Prompts', () => {
    it('should have prompts in each pack', () => {
      const packs = verticalAgentManager.listPacks()

      packs.forEach(pack => {
        expect(pack.prompts.length).toBeGreaterThan(0)
        pack.prompts.forEach(prompt => {
          expect(typeof prompt).toBe('string')
          expect(prompt.length).toBeGreaterThan(0)
        })
      })
    })
  })

  describe('Persistence', () => {
    it('should save team activations on shutdown', () => {
      verticalAgentManager.activatePack('pack-legal', 'team-1')
      verticalAgentManager.activatePack('pack-finance', 'team-2')
      verticalAgentManager.shutdown()

      const packPath = path.join(os.homedir(), '.nyra', 'enterprise', 'vertical-agents.json')
      expect(fs.existsSync(packPath)).toBe(true)
    })

    it('should restore team activations on init', () => {
      verticalAgentManager.activatePack('pack-legal', 'team-1')
      verticalAgentManager.shutdown()

      verticalAgentManager.init()
      const activePacks = verticalAgentManager.getActivePacksForTeam('team-1')
      expect(activePacks.some(p => p.id === 'pack-legal')).toBe(true)
    })
  })
})
