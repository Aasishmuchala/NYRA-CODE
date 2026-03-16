import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

interface OrgStats {
  orgId: string;
  activeUsers: number;
  totalSessions: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  peakUsageTime: string;
}

interface User {
  userId: string;
  email: string;
  name: string;
  role: string;
  status: 'active' | 'suspended' | 'inactive';
  lastLoginAt: Date;
}

interface ActivityLog {
  timestamp: Date;
  action: string;
  resource: string;
  result: 'success' | 'failure';
}

interface BillingOverview {
  orgId: string;
  currentMonthCost: number;
  monthlyBudget: number;
  costPercentageOfBudget: number;
  nextBillingDate: Date;
  pendingInvoices: number;
}

interface UsageBreakdown {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  byUser: Array<{ email: string; tokens: number; cost: number }>;
  byAgent: Array<{ agentId: string; tokens: number; cost: number }>;
  byModel: Array<{ model: string; tokens: number; cost: number }>;
}

interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  actionType: string;
  resource: string;
  result: 'success' | 'failure';
  details: Record<string, unknown>;
}

interface ComplianceReport {
  framework: string;
  generatedAt: Date;
  orgId: string;
  sections: ComplianceSection[];
}

interface ComplianceSection {
  name: string;
  status: 'compliant' | 'partial' | 'non-compliant';
  findings: string[];
  recommendations: string[];
}

interface UserFilter {
  role?: string;
  status?: 'active' | 'suspended' | 'inactive';
  searchTerm?: string;
}

interface AuditLogFilter {
  userId?: string;
  actionType?: string;
  startDate?: Date;
  endDate?: Date;
}

// ============================================================================
// Admin Console
// ============================================================================

class AdminConsole extends EventEmitter {
  private orgStats: Map<string, OrgStats> = new Map();
  private users: Map<string, User> = new Map();
  private auditLogs: AuditLogEntry[] = [];
  private billingData: Map<string, BillingOverview> = new Map();
  private usageData: Map<string, UsageBreakdown[]> = new Map();
  private auditCounter = 0;
  private userCounter = 0;

  // ========================================================================
  // Dashboard / Organization Stats
  // ========================================================================

  getOrgStats(orgId: string): OrgStats {
    if (!this.orgStats.has(orgId)) {
      const stats: OrgStats = {
        orgId,
        activeUsers: Math.floor(Math.random() * 50) + 5,
        totalSessions: Math.floor(Math.random() * 500) + 50,
        totalTokensUsed: Math.floor(Math.random() * 10000000) + 1000000,
        totalCostUsd: Math.random() * 5000 + 100,
        peakUsageTime: '14:30 UTC',
      };
      this.orgStats.set(orgId, stats);
    }
    return this.orgStats.get(orgId)!;
  }

  updateOrgStats(orgId: string, stats: Partial<OrgStats>): void {
    const existing = this.getOrgStats(orgId);
    Object.assign(existing, stats);
  }

  // ========================================================================
  // User Management
  // ========================================================================

  listUsers(orgId: string, filters?: UserFilter): User[] {
    let result = Array.from(this.users.values());

    if (filters) {
      if (filters.role) {
        result = result.filter((u) => u.role === filters.role);
      }
      if (filters.status) {
        result = result.filter((u) => u.status === filters.status);
      }
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        result = result.filter(
          (u) =>
            u.email.toLowerCase().includes(term) ||
            u.name.toLowerCase().includes(term)
        );
      }
    }

    return result;
  }

  suspendUser(userId: string): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    user.status = 'suspended';
    this.logAudit(userId, 'user_suspended', 'user', 'success', { userId });
    this.emit('user-suspended', userId);
    return true;
  }

  activateUser(userId: string): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    user.status = 'active';
    this.logAudit(userId, 'user_activated', 'user', 'success', { userId });
    this.emit('user-activated', userId);
    return true;
  }

  auditUser(userId: string): ActivityLog[] {
    return this.auditLogs
      .filter((log) => log.userId === userId)
      .map((log) => ({
        timestamp: log.timestamp,
        action: log.action,
        resource: log.resource,
        result: log.result,
      }));
  }

  // Internal user creation for demo purposes
  createDemoUser(email: string, name: string, role: string): User {
    const userId = `user_${++this.userCounter}_${Date.now()}`;
    const user: User = {
      userId,
      email,
      name,
      role,
      status: 'active',
      lastLoginAt: new Date(),
    };
    this.users.set(userId, user);
    return user;
  }

  // ========================================================================
  // Billing
  // ========================================================================

  getBillingOverview(orgId: string): BillingOverview {
    if (!this.billingData.has(orgId)) {
      const currentCost = Math.random() * 3000 + 500;
      const overview: BillingOverview = {
        orgId,
        currentMonthCost: currentCost,
        monthlyBudget: 5000,
        costPercentageOfBudget: (currentCost / 5000) * 100,
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pendingInvoices: Math.floor(Math.random() * 3),
      };
      this.billingData.set(orgId, overview);
    }
    return this.billingData.get(orgId)!;
  }

  getUsageBreakdown(orgId: string, period: 'daily' | 'weekly' | 'monthly'): UsageBreakdown {
    const key = `${orgId}_${period}`;

    if (!this.usageData.has(key)) {
      this.usageData.set(key, []);
    }

    const now = new Date();
    let startDate = new Date();

    if (period === 'daily') {
      startDate.setDate(now.getDate() - 1);
    } else if (period === 'weekly') {
      startDate.setDate(now.getDate() - 7);
    } else {
      startDate.setMonth(now.getMonth() - 1);
    }

    const breakdown: UsageBreakdown = {
      period,
      startDate,
      endDate: now,
      byUser: [
        { email: 'alice@example.com', tokens: 250000, cost: 2.50 },
        { email: 'bob@example.com', tokens: 180000, cost: 1.80 },
        { email: 'charlie@example.com', tokens: 120000, cost: 1.20 },
      ],
      byAgent: [
        { agentId: 'agent_research', tokens: 300000, cost: 3.00 },
        { agentId: 'agent_analysis', tokens: 200000, cost: 2.00 },
        { agentId: 'agent_support', tokens: 50000, cost: 0.50 },
      ],
      byModel: [
        { model: 'claude-3.5-sonnet', tokens: 400000, cost: 4.00 },
        { model: 'claude-3-opus', tokens: 150000, cost: 1.50 },
      ],
    };

    return breakdown;
  }

  setSpendingLimit(orgId: string, limit: number): boolean {
    const overview = this.getBillingOverview(orgId);
    overview.monthlyBudget = limit;
    overview.costPercentageOfBudget = (overview.currentMonthCost / limit) * 100;
    this.logAudit(
      'admin',
      'spending_limit_set',
      'billing',
      'success',
      { orgId, limit }
    );
    return true;
  }

  // ========================================================================
  // Audit Logs
  // ========================================================================

  getAuditLog(orgId: string, filters?: AuditLogFilter): AuditLogEntry[] {
    let result = this.auditLogs;

    if (filters) {
      if (filters.userId) {
        result = result.filter((log) => log.userId === filters.userId);
      }
      if (filters.actionType) {
        result = result.filter((log) => log.actionType === filters.actionType);
      }
      if (filters.startDate) {
        result = result.filter((log) => log.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        result = result.filter((log) => log.timestamp <= filters.endDate!);
      }
    }

    return result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private logAudit(
    userId: string,
    action: string,
    resource: string,
    result: 'success' | 'failure',
    details: Record<string, unknown>
  ): void {
    const entry: AuditLogEntry = {
      id: `audit_${++this.auditCounter}_${Date.now()}`,
      timestamp: new Date(),
      userId,
      action,
      actionType: action,
      resource,
      result,
      details,
    };

    this.auditLogs.push(entry);

    // Keep last 50000 entries
    if (this.auditLogs.length > 50000) {
      this.auditLogs = this.auditLogs.slice(-50000);
    }
  }

  // ========================================================================
  // Compliance Reports
  // ========================================================================

  generateComplianceReport(orgId: string, framework: 'SOC2' | 'HIPAA' | 'GDPR'): ComplianceReport {
    const sections = this.generateComplianceSections(framework);

    const report: ComplianceReport = {
      framework,
      generatedAt: new Date(),
      orgId,
      sections,
    };

    return report;
  }

  private generateComplianceSections(framework: string): ComplianceSection[] {
    const sections: Record<string, ComplianceSection[]> = {
      SOC2: [
        {
          name: 'Security Controls',
          status: 'compliant',
          findings: ['All systems have encryption enabled', 'MFA enforced for all users'],
          recommendations: [],
        },
        {
          name: 'Access Controls',
          status: 'partial',
          findings: ['Role-based access implemented', '3 users need updated permissions'],
          recommendations: ['Review and update permissions for flagged users'],
        },
        {
          name: 'Monitoring & Logging',
          status: 'compliant',
          findings: ['Audit logs retained for 90 days', 'Real-time monitoring enabled'],
          recommendations: [],
        },
      ],
      HIPAA: [
        {
          name: 'Privacy Controls',
          status: 'compliant',
          findings: ['PHI data classified and protected', 'Patient consent tracking enabled'],
          recommendations: [],
        },
        {
          name: 'Data Breach Procedures',
          status: 'partial',
          findings: ['Incident response plan documented', 'Notification procedures need review'],
          recommendations: ['Review and update breach notification procedures'],
        },
        {
          name: 'Audit & Accountability',
          status: 'compliant',
          findings: ['All access logged', 'Audit reviews conducted monthly'],
          recommendations: [],
        },
      ],
      GDPR: [
        {
          name: 'Data Subject Rights',
          status: 'compliant',
          findings: ['Right to access implemented', 'Right to be forgotten processes in place'],
          recommendations: [],
        },
        {
          name: 'Data Protection',
          status: 'compliant',
          findings: [
            'Data processing agreements executed',
            'Data minimization principles followed',
          ],
          recommendations: [],
        },
        {
          name: 'Reporting & Documentation',
          status: 'partial',
          findings: ['Privacy impact assessments updated', 'Data retention policy needs revision'],
          recommendations: [
            'Schedule DPIA update for new systems',
            'Clarify data retention periods',
          ],
        },
      ],
    };

    return sections[framework] || [];
  }
}

// ============================================================================
// Singleton
// ============================================================================

const adminConsole = new AdminConsole();

export {
  AdminConsole,
  adminConsole,
  type OrgStats,
  type User,
  type ActivityLog,
  type BillingOverview,
  type UsageBreakdown,
  type AuditLogEntry,
  type ComplianceReport,
  type ComplianceSection,
  type UserFilter,
  type AuditLogFilter,
};
