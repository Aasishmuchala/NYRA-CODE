import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { adminConsole } from '../enterprise/admin-console'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('AdminConsole', () => {
  beforeEach(() => {
    adminConsole.init()
  })

  afterEach(() => {
    adminConsole.shutdown()
  })

  describe('Initialization & Lifecycle', () => {
    it('should initialize without error', () => {
      expect(adminConsole).toBeDefined()
    })

    it('should create data directory on init', () => {
      const dataDir = path.join(os.homedir(), '.nyra', 'enterprise')
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should persist and restore admin data', () => {
      adminConsole.getDashboard('org-1')
      adminConsole.shutdown()

      adminConsole.init()
      const stats = adminConsole.getOrgStats('org-1')
      expect(stats).toBeDefined()
    })
  })

  describe('Organization Statistics', () => {
    it('should get dashboard stats for organization', () => {
      const stats = adminConsole.getDashboard('org-1')

      expect(stats.orgId).toBe('org-1')
      expect(stats.activeUsers).toBeGreaterThan(0)
      expect(stats.totalSessions).toBeGreaterThan(0)
      expect(stats.totalTokensUsed).toBeGreaterThan(0)
      expect(stats.totalCostUsd).toBeGreaterThan(0)
    })

    it('should get organization stats', () => {
      const stats = adminConsole.getOrgStats('org-2')

      expect(stats.orgId).toBe('org-2')
      expect(typeof stats.activeUsers).toBe('number')
      expect(typeof stats.peakUsageTime).toBe('string')
    })

    it('should update organization stats', () => {
      adminConsole.updateOrgStats('org-1', {
        activeUsers: 100,
        totalCostUsd: 5000
      })

      const stats = adminConsole.getOrgStats('org-1')
      expect(stats.activeUsers).toBe(100)
      expect(stats.totalCostUsd).toBe(5000)
    })

    it('should create stats on first access', () => {
      const stats1 = adminConsole.getOrgStats('new-org')
      const stats2 = adminConsole.getOrgStats('new-org')

      expect(stats1.orgId).toBe(stats2.orgId)
    })
  })

  describe('User Management', () => {
    it('should create demo user', () => {
      const user = adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')

      expect(user.userId).toBeDefined()
      expect(user.email).toBe('alice@example.com')
      expect(user.name).toBe('Alice')
      expect(user.role).toBe('admin')
      expect(user.status).toBe('active')
    })

    it('should list all users', () => {
      adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
      adminConsole.createDemoUser('bob@example.com', 'Bob', 'user')

      const users = adminConsole.listUsers('org-1')
      expect(users.length).toBeGreaterThanOrEqual(2)
    })

    it('should filter users by role', () => {
      adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
      adminConsole.createDemoUser('bob@example.com', 'Bob', 'user')

      const admins = adminConsole.listUsers('org-1', { role: 'admin' })
      expect(admins.some(u => u.role === 'admin')).toBe(true)
    })

    it('should filter users by status', () => {
      const user = adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
      adminConsole.suspendUser(user.userId)

      const suspended = adminConsole.listUsers('org-1', { status: 'suspended' })
      expect(suspended.some(u => u.status === 'suspended')).toBe(true)
    })

    it('should filter users by search term', () => {
      adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
      adminConsole.createDemoUser('bob@example.com', 'Bob', 'user')

      const results = adminConsole.listUsers('org-1', { searchTerm: 'alice' })
      expect(results.some(u => u.email.includes('alice'))).toBe(true)
    })

    it('should suspend a user', () => {
      const user = adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
      const suspended = adminConsole.suspendUser(user.userId)

      expect(suspended).toBe(true)

      const suspended_user = adminConsole.listUsers('org-1', { status: 'suspended' })
      expect(suspended_user.some(u => u.userId === user.userId)).toBe(true)
    })

    it('should activate a user', () => {
      const user = adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
      adminConsole.suspendUser(user.userId)

      const activated = adminConsole.activateUser(user.userId)
      expect(activated).toBe(true)

      const active = adminConsole.listUsers('org-1', { status: 'active' })
      expect(active.some(u => u.userId === user.userId)).toBe(true)
    })

    it('should return false when suspending nonexistent user', () => {
      const result = adminConsole.suspendUser('nonexistent')
      expect(result).toBe(false)
    })

    it('should audit user activities', () => {
      const user = adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
      adminConsole.suspendUser(user.userId)

      const activities = adminConsole.auditUser(user.userId)
      expect(Array.isArray(activities)).toBe(true)
    })
  })

  describe('Billing', () => {
    it('should get billing overview', () => {
      const billing = adminConsole.getBillingOverview('org-1')

      expect(billing.orgId).toBe('org-1')
      expect(billing.currentMonthCost).toBeGreaterThan(0)
      expect(billing.monthlyBudget).toBeGreaterThan(0)
      expect(billing.costPercentageOfBudget).toBeGreaterThan(0)
      expect(billing.pendingInvoices).toBeGreaterThanOrEqual(0)
    })

    it('should get usage breakdown by period', () => {
      const daily = adminConsole.getUsageBreakdown('org-1', 'daily')
      expect(daily.period).toBe('daily')
      expect(Array.isArray(daily.byUser)).toBe(true)
      expect(Array.isArray(daily.byAgent)).toBe(true)
      expect(Array.isArray(daily.byModel)).toBe(true)
    })

    it('should get weekly usage breakdown', () => {
      const weekly = adminConsole.getUsageBreakdown('org-1', 'weekly')
      expect(weekly.period).toBe('weekly')
      expect(weekly.byUser.length).toBeGreaterThan(0)
    })

    it('should get monthly usage breakdown', () => {
      const monthly = adminConsole.getUsageBreakdown('org-1', 'monthly')
      expect(monthly.period).toBe('monthly')
      expect(monthly.byUser.length).toBeGreaterThan(0)
    })

    it('should set spending limit', () => {
      const result = adminConsole.setSpendingLimit('org-1', 10000)
      expect(result).toBe(true)

      const billing = adminConsole.getBillingOverview('org-1')
      expect(billing.monthlyBudget).toBe(10000)
    })
  })

  describe('Audit Logs', () => {
    it('should get audit log', () => {
      adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')

      const logs = adminConsole.getAuditLog('org-1')
      expect(Array.isArray(logs)).toBe(true)
    })

    it('should filter audit log by user ID', () => {
      const user = adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
      adminConsole.suspendUser(user.userId)

      const logs = adminConsole.getAuditLog('org-1', { userId: user.userId })
      expect(Array.isArray(logs)).toBe(true)
    })

    it('should filter audit log by action type', () => {
      const user = adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
      adminConsole.suspendUser(user.userId)

      const logs = adminConsole.getAuditLog('org-1', { actionType: 'user_suspended' })
      expect(logs.some(l => l.actionType === 'user_suspended')).toBe(true)
    })

    it('should filter audit log by date range', () => {
      adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')

      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const endDate = new Date()

      const logs = adminConsole.getAuditLog('org-1', {
        startDate,
        endDate
      })
      expect(Array.isArray(logs)).toBe(true)
    })
  })

  describe('Compliance Reports', () => {
    it('should generate SOC2 compliance report', () => {
      const report = adminConsole.generateComplianceReport('org-1', 'SOC2')

      expect(report.framework).toBe('SOC2')
      expect(report.orgId).toBe('org-1')
      expect(report.sections.length).toBeGreaterThan(0)
    })

    it('should generate HIPAA compliance report', () => {
      const report = adminConsole.generateComplianceReport('org-1', 'HIPAA')

      expect(report.framework).toBe('HIPAA')
      expect(report.sections.length).toBeGreaterThan(0)
      expect(report.sections[0].name).toBeDefined()
    })

    it('should generate GDPR compliance report', () => {
      const report = adminConsole.generateComplianceReport('org-1', 'GDPR')

      expect(report.framework).toBe('GDPR')
      expect(report.sections.length).toBeGreaterThan(0)
    })

    it('should include compliance sections', () => {
      const report = adminConsole.generateComplianceReport('org-1', 'SOC2')

      expect(report.sections.length).toBeGreaterThan(0)
      report.sections.forEach(section => {
        expect(section.name).toBeDefined()
        expect(['compliant', 'partial', 'non-compliant']).toContain(section.status)
        expect(Array.isArray(section.findings)).toBe(true)
        expect(Array.isArray(section.recommendations)).toBe(true)
      })
    })

    it('should include findings and recommendations', () => {
      const report = adminConsole.generateComplianceReport('org-1', 'SOC2')

      report.sections.forEach(section => {
        if (section.status === 'partial') {
          expect(section.recommendations.length).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('Persistence', () => {
    it('should save admin data on shutdown', () => {
      adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
      adminConsole.getDashboard('org-1')
      adminConsole.shutdown()

      const configPath = path.join(os.homedir(), '.nyra', 'enterprise', 'admin-config.json')
      expect(fs.existsSync(configPath)).toBe(true)
    })

    it('should restore admin data on init', () => {
      const user1 = adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
      adminConsole.shutdown()

      adminConsole.init()
      const users = adminConsole.listUsers('org-1')
      expect(users.length).toBeGreaterThan(0)
    })
  })

  describe('Event Emitters', () => {
    it('should emit user-suspended event', () => {
      return new Promise<void>((resolve) => {
        adminConsole.on('user-suspended', (userId) => {
          expect(userId).toBeDefined()
          resolve()
        })

        const user = adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
        adminConsole.suspendUser(user.userId)
      })
    })

    it('should emit user-activated event', () => {
      return new Promise<void>((resolve) => {
        adminConsole.on('user-activated', (userId) => {
          expect(userId).toBeDefined()
          resolve()
        })

        const user = adminConsole.createDemoUser('alice@example.com', 'Alice', 'admin')
        adminConsole.suspendUser(user.userId)
        adminConsole.activateUser(user.userId)
      })
    })
  })
})
