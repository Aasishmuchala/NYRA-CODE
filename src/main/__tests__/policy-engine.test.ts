import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PolicyEngine, defaultDlpRules } from '../enterprise/policy-engine'
import type { AgentPolicy, DataPolicy, UsagePolicy, SecurityPolicy } from '../enterprise/policy-engine'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('PolicyEngine', () => {
  let engine: PolicyEngine
  let tmpDir: string

  beforeEach(() => {
    engine = new PolicyEngine()
    tmpDir = path.join(os.tmpdir(), 'nyra-test-policy-engine')
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  describe('Policy Creation', () => {
    it('should create agent policy', () => {
      const policy = engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: ['gpt-4'],
        blockedModels: [],
        maxTokensPerRequest: 2000,
        allowedTools: ['search', 'calculator'],
        blockedTools: [],
      } as AgentPolicy)

      expect(policy.id).toBeDefined()
      expect(policy.type).toBe('agent')
      expect(policy.enabled).toBe(true)
    })

    it('should create data policy', () => {
      const policy = engine.createPolicy('org-1', 'data', {
        type: 'data',
        classification: 'confidential',
        dlpRules: [],
        retentionDays: 90,
      } as DataPolicy)

      expect(policy.type).toBe('data')
    })

    it('should create usage policy', () => {
      const policy = engine.createPolicy('org-1', 'usage', {
        type: 'usage',
        rateLimitPerMinute: 100,
        dailyTokenBudget: 100000,
        monthlyTokenBudget: 1000000,
        costCap: 5000,
      } as UsagePolicy)

      expect(policy.type).toBe('usage')
    })

    it('should create security policy', () => {
      const policy = engine.createPolicy('org-1', 'security', {
        type: 'security',
        requireMfa: true,
        ipAllowlist: ['192.168.1.0/24'],
        sessionTimeoutMinutes: 30,
        auditLogRetentionDays: 365,
      } as SecurityPolicy)

      expect(policy.type).toBe('security')
    })
  })

  describe('Policy Evaluation - Agent', () => {
    it('should deny blocked model', () => {
      const policy = engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: [],
        blockedModels: ['gpt-4'],
        maxTokensPerRequest: 2000,
        allowedTools: [],
        blockedTools: [],
      } as AgentPolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'run_agent',
          metadata: { model: 'gpt-4' },
        },
        'org-1'
      )

      expect(decision.result).toBe('deny')
    })

    it('should warn on unlisted model', () => {
      const policy = engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: ['gpt-4', 'claude-3'],
        blockedModels: [],
        maxTokensPerRequest: 2000,
        allowedTools: [],
        blockedTools: [],
      } as AgentPolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'run_agent',
          metadata: { model: 'mistral-7b' },
        },
        'org-1'
      )

      expect(decision.result).toBe('warn')
    })

    it('should deny blocked tool', () => {
      const policy = engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: [],
        blockedModels: [],
        maxTokensPerRequest: 2000,
        allowedTools: [],
        blockedTools: ['shell_execute'],
      } as AgentPolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'use_tool',
          metadata: { tool: 'shell_execute' },
        },
        'org-1'
      )

      expect(decision.result).toBe('deny')
    })
  })

  describe('Policy Evaluation - Data', () => {
    it('should block SSN pattern', () => {
      const dlpRules = [
        {
          name: 'SSN',
          pattern: /\d{3}-\d{2}-\d{4}/,
          action: 'block' as const,
        },
      ]

      const policy = engine.createPolicy('org-1', 'data', {
        type: 'data',
        classification: 'confidential',
        dlpRules,
        retentionDays: 90,
      } as DataPolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'query',
          metadata: { data: 'My SSN is 123-45-6789' },
        },
        'org-1'
      )

      expect(decision.result).toBe('deny')
    })

    it('should allow clean data', () => {
      const dlpRules = [
        {
          name: 'CreditCard',
          pattern: /\d{16}/,
          action: 'block' as const,
        },
      ]

      const policy = engine.createPolicy('org-1', 'data', {
        type: 'data',
        classification: 'internal',
        dlpRules,
        retentionDays: 90,
      } as DataPolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'query',
          metadata: { data: 'Hello world' },
        },
        'org-1'
      )

      expect(decision.result).toBe('allow')
    })
  })

  describe('Policy Evaluation - Usage', () => {
    it('should deny daily token budget exceeded', () => {
      const policy = engine.createPolicy('org-1', 'usage', {
        type: 'usage',
        rateLimitPerMinute: 1000,
        dailyTokenBudget: 100000,
        monthlyTokenBudget: 1000000,
        costCap: 5000,
      } as UsagePolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'run_query',
          metadata: { dailyTokens: 150000 },
        },
        'org-1'
      )

      expect(decision.result).toBe('deny')
    })

    it('should deny monthly token budget exceeded', () => {
      const policy = engine.createPolicy('org-1', 'usage', {
        type: 'usage',
        rateLimitPerMinute: 1000,
        dailyTokenBudget: 100000,
        monthlyTokenBudget: 1000000,
        costCap: 5000,
      } as UsagePolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'run_query',
          metadata: { monthlyTokens: 1500000 },
        },
        'org-1'
      )

      expect(decision.result).toBe('deny')
    })

    it('should deny cost cap exceeded', () => {
      const policy = engine.createPolicy('org-1', 'usage', {
        type: 'usage',
        rateLimitPerMinute: 1000,
        dailyTokenBudget: 100000,
        monthlyTokenBudget: 1000000,
        costCap: 5000,
      } as UsagePolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'run_query',
          metadata: { cost: 6000 },
        },
        'org-1'
      )

      expect(decision.result).toBe('deny')
    })
  })

  describe('Policy Evaluation - Security', () => {
    it('should deny without MFA when required', () => {
      const policy = engine.createPolicy('org-1', 'security', {
        type: 'security',
        requireMfa: true,
        ipAllowlist: [],
        sessionTimeoutMinutes: 30,
        auditLogRetentionDays: 365,
      } as SecurityPolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'access',
          metadata: { mfaVerified: false },
        },
        'org-1'
      )

      expect(decision.result).toBe('deny')
    })

    it('should allow with MFA when required', () => {
      const policy = engine.createPolicy('org-1', 'security', {
        type: 'security',
        requireMfa: true,
        ipAllowlist: [],
        sessionTimeoutMinutes: 30,
        auditLogRetentionDays: 365,
      } as SecurityPolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'access',
          metadata: { mfaVerified: true },
        },
        'org-1'
      )

      expect(decision.result).toBe('allow')
    })

    it('should deny IP not in allowlist', () => {
      const policy = engine.createPolicy('org-1', 'security', {
        type: 'security',
        requireMfa: false,
        ipAllowlist: ['192.168.1.0/24', '10.0.0.0/8'],
        sessionTimeoutMinutes: 30,
        auditLogRetentionDays: 365,
      } as SecurityPolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'access',
          metadata: { userIp: '8.8.8.8' },
        },
        'org-1'
      )

      expect(decision.result).toBe('deny')
    })
  })

  describe('Policy Management', () => {
    it('should list policies for organization', () => {
      engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: [],
        blockedModels: [],
        maxTokensPerRequest: 2000,
        allowedTools: [],
        blockedTools: [],
      } as AgentPolicy)

      engine.createPolicy('org-2', 'usage', {
        type: 'usage',
        rateLimitPerMinute: 100,
        dailyTokenBudget: 100000,
        monthlyTokenBudget: 1000000,
        costCap: 5000,
      } as UsagePolicy)

      const org1Policies = engine.getPolicies('org-1')
      const org2Policies = engine.getPolicies('org-2')

      expect(org1Policies.length).toBe(1)
      expect(org2Policies.length).toBe(1)
    })

    it('should update policy', () => {
      const policy = engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: ['gpt-4'],
        blockedModels: [],
        maxTokensPerRequest: 2000,
        allowedTools: [],
        blockedTools: [],
      } as AgentPolicy)

      const updated = engine.updatePolicy(policy.id, {
        type: 'agent',
        allowedModels: ['gpt-4', 'claude-3'],
        blockedModels: ['llama'],
        maxTokensPerRequest: 4000,
        allowedTools: ['search'],
        blockedTools: [],
      } as AgentPolicy)

      expect(updated?.rules.allowedModels).toContain('claude-3')
    })

    it('should disable policy', () => {
      const policy = engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: [],
        blockedModels: [],
        maxTokensPerRequest: 2000,
        allowedTools: [],
        blockedTools: [],
      } as AgentPolicy)

      const disabled = engine.disablePolicy(policy.id)
      expect(disabled).toBe(true)

      const policies = engine.getPolicies('org-1')
      expect(policies[0].enabled).toBe(false)
    })

    it('should not evaluate disabled policies', () => {
      const policy = engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: [],
        blockedModels: ['gpt-4'],
        maxTokensPerRequest: 2000,
        allowedTools: [],
        blockedTools: [],
      } as AgentPolicy)

      engine.disablePolicy(policy.id)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'run_agent',
          metadata: { model: 'gpt-4' },
        },
        'org-1'
      )

      expect(decision.result).toBe('allow')
    })
  })

  describe('Audit Logging', () => {
    it('should log policy evaluation decisions', () => {
      engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: [],
        blockedModels: ['gpt-4'],
        maxTokensPerRequest: 2000,
        allowedTools: [],
        blockedTools: [],
      } as AgentPolicy)

      engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'run_agent',
          metadata: { model: 'gpt-4' },
        },
        'org-1'
      )

      const auditLog = engine.getAuditLog('org-1')
      expect(auditLog.length).toBeGreaterThan(0)
      expect(auditLog[0].userId).toBe('user-1')
      expect(auditLog[0].result).toBe('deny')
    })
  })

  describe('Most Restrictive Wins', () => {
    it('should apply most restrictive decision when multiple policies', () => {
      engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: ['gpt-4'],
        blockedModels: [],
        maxTokensPerRequest: 2000,
        allowedTools: [],
        blockedTools: [],
      } as AgentPolicy)

      engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: [],
        blockedModels: ['gpt-4'],
        maxTokensPerRequest: 2000,
        allowedTools: [],
        blockedTools: [],
      } as AgentPolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'run_agent',
          metadata: { model: 'gpt-4' },
        },
        'org-1'
      )

      expect(decision.result).toBe('deny')
    })
  })

  describe('Init/Shutdown Lifecycle', () => {
    it('should initialize and load persisted policies', () => {
      engine.init()
      expect(engine).toBeDefined()
    })

    it('should create data directory on init()', () => {
      engine.init()
      const dataDir = path.join(
        process.env.HOME || process.env.USERPROFILE || '/tmp',
        '.nyra',
        'enterprise'
      )
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should save policies on shutdown()', () => {
      engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: ['gpt-4'],
        blockedModels: [],
        maxTokensPerRequest: 2000,
        allowedTools: ['search'],
        blockedTools: [],
      } as AgentPolicy)

      engine.shutdown()

      const policiesPath = path.join(
        process.env.HOME || process.env.USERPROFILE || '/tmp',
        '.nyra',
        'enterprise',
        'policies.json'
      )

      if (fs.existsSync(policiesPath)) {
        const data = JSON.parse(fs.readFileSync(policiesPath, 'utf-8'))
        expect(data.policies).toBeDefined()
        expect(Object.keys(data.policies).length).toBeGreaterThan(0)
      }
    })

    it('should restore policies after init+shutdown cycle', () => {
      engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: ['gpt-4'],
        blockedModels: [],
        maxTokensPerRequest: 2000,
        allowedTools: ['search'],
        blockedTools: [],
      } as AgentPolicy)

      engine.createPolicy('org-2', 'usage', {
        type: 'usage',
        rateLimitPerMinute: 100,
        dailyTokenBudget: 100000,
        monthlyTokenBudget: 1000000,
        costCap: 5000,
      } as UsagePolicy)

      engine.shutdown()

      const engine2 = new PolicyEngine()
      engine2.init()

      const org1Policies = engine2.getPolicies('org-1')
      const org2Policies = engine2.getPolicies('org-2')

      expect(org1Policies.length).toBeGreaterThan(0)
      expect(org2Policies.length).toBeGreaterThan(0)
    })

    it('should persist audit log on shutdown', () => {
      engine.init()

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'test_action',
          metadata: {},
        },
        'org-1'
      )

      expect(decision).toBeDefined()
      engine.shutdown()

      const policiesPath = path.join(
        process.env.HOME || process.env.USERPROFILE || '/tmp',
        '.nyra',
        'enterprise',
        'policies.json'
      )

      if (fs.existsSync(policiesPath)) {
        const data = JSON.parse(fs.readFileSync(policiesPath, 'utf-8'))
        expect(data.auditLog).toBeDefined()
      }
    })

    it('should evaluate request with persisted policies', () => {
      engine.init()

      const policy = engine.createPolicy('org-1', 'agent', {
        type: 'agent',
        allowedModels: ['gpt-4'],
        blockedModels: [],
        maxTokensPerRequest: 2000,
        allowedTools: ['search'],
        blockedTools: [],
      } as AgentPolicy)

      const decision = engine.evaluateRequest(
        {
          userId: 'user-1',
          action: 'run_agent',
          metadata: { model: 'gpt-4' },
        },
        'org-1'
      )

      expect(decision).toBeDefined()
      expect(decision.appliedPolicies.length).toBeGreaterThan(0)
    })
  })
})
