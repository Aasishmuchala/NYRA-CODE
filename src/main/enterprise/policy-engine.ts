import { randomBytes } from 'crypto';

// ============================================================================
// Policy Types
// ============================================================================

type PolicyType = 'agent' | 'data' | 'usage' | 'security';
type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted';
type EvaluationResult = 'allow' | 'deny' | 'warn';

interface AgentPolicy {
  type: 'agent';
  allowedModels: string[];
  blockedModels: string[];
  maxTokensPerRequest: number;
  allowedTools: string[];
  blockedTools: string[];
}

interface DataPolicy {
  type: 'data';
  classification: DataClassification;
  dlpRules: DlpRule[];
  retentionDays: number;
}

interface DlpRule {
  name: string;
  pattern: RegExp;
  action: 'block' | 'redact' | 'alert';
}

interface UsagePolicy {
  type: 'usage';
  rateLimitPerMinute: number;
  dailyTokenBudget: number;
  monthlyTokenBudget: number;
  costCap: number;
}

interface SecurityPolicy {
  type: 'security';
  requireMfa: boolean;
  ipAllowlist: string[];
  sessionTimeoutMinutes: number;
  auditLogRetentionDays: number;
}

type PolicyRule = AgentPolicy | DataPolicy | UsagePolicy | SecurityPolicy;

interface Policy {
  id: string;
  orgId: string;
  type: PolicyType;
  rules: PolicyRule;
  createdAt: Date;
  updatedAt: Date;
  enabled: boolean;
}

interface EvaluationContext {
  userId: string;
  action: string;
  resource?: string;
  metadata?: Record<string, unknown>;
}

interface EvaluationDecision {
  result: EvaluationResult;
  reason: string;
  appliedPolicies: string[];
}

interface AuditEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  result: EvaluationResult;
  reason: string;
}

// ============================================================================
// Policy Engine
// ============================================================================

class PolicyEngine {
  private policies: Map<string, Policy> = new Map();
  private auditLog: AuditEntry[] = [];
  private policyCounter = 0;
  private auditCounter = 0;

  createPolicy(orgId: string, type: PolicyType, rules: PolicyRule): Policy {
    const policyId = `policy_${++this.policyCounter}_${Date.now()}`;
    const policy: Policy = {
      id: policyId,
      orgId,
      type,
      rules,
      createdAt: new Date(),
      updatedAt: new Date(),
      enabled: true,
    };

    this.policies.set(policyId, policy);
    return policy;
  }

  evaluateRequest(context: EvaluationContext, orgId: string): EvaluationDecision {
    const applicablePolicies = Array.from(this.policies.values()).filter(
      (p) => p.orgId === orgId && p.enabled
    );

    const decisions: EvaluationDecision[] = [];

    for (const policy of applicablePolicies) {
      const decision = this.evaluateSinglePolicy(context, policy);
      decisions.push(decision);
    }

    // Most restrictive wins
    let finalDecision: EvaluationDecision = decisions.length > 0
      ? decisions[0]
      : { result: 'allow', reason: 'No policies', appliedPolicies: [] };

    const denyDecision = decisions.find((d) => d.result === 'deny');
    if (denyDecision) {
      finalDecision = denyDecision;
    } else {
      const warnDecision = decisions.find((d) => d.result === 'warn');
      if (warnDecision) {
        finalDecision = warnDecision;
      }
    }

    // Log audit entry
    this.logAudit(context.userId, context.action, finalDecision.result, finalDecision.reason);

    return finalDecision;
  }

  private evaluateSinglePolicy(
    context: EvaluationContext,
    policy: Policy
  ): EvaluationDecision {
    const appliedPolicies = [policy.id];

    switch (policy.type) {
      case 'agent': {
        const agentPolicy = policy.rules as AgentPolicy;
        return this.evaluateAgentPolicy(context, agentPolicy, appliedPolicies);
      }
      case 'data': {
        const dataPolicy = policy.rules as DataPolicy;
        return this.evaluateDataPolicy(context, dataPolicy, appliedPolicies);
      }
      case 'usage': {
        const usagePolicy = policy.rules as UsagePolicy;
        return this.evaluateUsagePolicy(context, usagePolicy, appliedPolicies);
      }
      case 'security': {
        const securityPolicy = policy.rules as SecurityPolicy;
        return this.evaluateSecurityPolicy(context, securityPolicy, appliedPolicies);
      }
      default:
        return { result: 'allow', reason: 'Unknown policy type', appliedPolicies };
    }
  }

  private evaluateAgentPolicy(
    context: EvaluationContext,
    policy: AgentPolicy,
    appliedPolicies: string[]
  ): EvaluationDecision {
    const model = (context.metadata?.model as string) || '';
    const tool = (context.metadata?.tool as string) || '';

    if (policy.blockedModels.includes(model)) {
      return {
        result: 'deny',
        reason: `Model "${model}" is blocked by agent policy`,
        appliedPolicies,
      };
    }

    if (policy.allowedModels.length > 0 && !policy.allowedModels.includes(model)) {
      return {
        result: 'warn',
        reason: `Model "${model}" is not in allowed list`,
        appliedPolicies,
      };
    }

    if (policy.blockedTools.includes(tool)) {
      return {
        result: 'deny',
        reason: `Tool "${tool}" is blocked by agent policy`,
        appliedPolicies,
      };
    }

    const tokens = (context.metadata?.tokens as number) || 0;
    if (tokens > policy.maxTokensPerRequest) {
      return {
        result: 'warn',
        reason: `Request exceeds max tokens (${tokens} > ${policy.maxTokensPerRequest})`,
        appliedPolicies,
      };
    }

    return { result: 'allow', reason: 'Agent policy allows request', appliedPolicies };
  }

  private evaluateDataPolicy(
    context: EvaluationContext,
    policy: DataPolicy,
    appliedPolicies: string[]
  ): EvaluationDecision {
    const data = (context.metadata?.data as string) || '';

    for (const rule of policy.dlpRules) {
      if (rule.pattern.test(data)) {
        if (rule.action === 'block') {
          return {
            result: 'deny',
            reason: `DLP rule "${rule.name}" blocked request`,
            appliedPolicies,
          };
        } else if (rule.action === 'alert') {
          return {
            result: 'warn',
            reason: `DLP rule "${rule.name}" detected sensitive data`,
            appliedPolicies,
          };
        }
      }
    }

    return { result: 'allow', reason: 'Data policy allows request', appliedPolicies };
  }

  private evaluateUsagePolicy(
    context: EvaluationContext,
    policy: UsagePolicy,
    appliedPolicies: string[]
  ): EvaluationDecision {
    const tokensUsed = (context.metadata?.tokens as number) || 0;
    const dailyUsage = (context.metadata?.dailyTokens as number) || 0;
    const monthlyUsage = (context.metadata?.monthlyTokens as number) || 0;
    const costAccrued = (context.metadata?.cost as number) || 0;

    if (tokensUsed > policy.rateLimitPerMinute) {
      return {
        result: 'warn',
        reason: `Rate limit exceeded (${tokensUsed} > ${policy.rateLimitPerMinute} per minute)`,
        appliedPolicies,
      };
    }

    if (dailyUsage > policy.dailyTokenBudget) {
      return {
        result: 'deny',
        reason: `Daily token budget exceeded (${dailyUsage} > ${policy.dailyTokenBudget})`,
        appliedPolicies,
      };
    }

    if (monthlyUsage > policy.monthlyTokenBudget) {
      return {
        result: 'deny',
        reason: `Monthly token budget exceeded (${monthlyUsage} > ${policy.monthlyTokenBudget})`,
        appliedPolicies,
      };
    }

    if (costAccrued > policy.costCap) {
      return {
        result: 'deny',
        reason: `Cost cap exceeded (${costAccrued} > ${policy.costCap})`,
        appliedPolicies,
      };
    }

    return { result: 'allow', reason: 'Usage policy allows request', appliedPolicies };
  }

  private evaluateSecurityPolicy(
    context: EvaluationContext,
    policy: SecurityPolicy,
    appliedPolicies: string[]
  ): EvaluationDecision {
    const userIp = (context.metadata?.userIp as string) || '';
    const hasMfa = (context.metadata?.mfaVerified as boolean) || false;

    if (policy.requireMfa && !hasMfa) {
      return {
        result: 'deny',
        reason: 'MFA is required but not verified',
        appliedPolicies,
      };
    }

    if (policy.ipAllowlist.length > 0 && userIp && !this.isIpAllowed(userIp, policy.ipAllowlist)) {
      return {
        result: 'deny',
        reason: `IP address "${userIp}" is not in allowlist`,
        appliedPolicies,
      };
    }

    return { result: 'allow', reason: 'Security policy allows request', appliedPolicies };
  }

  private isIpAllowed(ip: string, allowlist: string[]): boolean {
    return allowlist.some((allowed) => {
      if (allowed === ip) return true;
      // Simple CIDR check (simplified - not full CIDR validation)
      if (allowed.includes('/')) {
        const [network] = allowed.split('/');
        return ip.startsWith(network.slice(0, network.lastIndexOf('.')));
      }
      return false;
    });
  }

  getPolicies(orgId: string): Policy[] {
    return Array.from(this.policies.values()).filter((p) => p.orgId === orgId);
  }

  updatePolicy(id: string, rules: PolicyRule): Policy | null {
    const policy = this.policies.get(id);
    if (!policy) return null;

    policy.rules = rules;
    policy.updatedAt = new Date();
    return policy;
  }

  disablePolicy(id: string): boolean {
    const policy = this.policies.get(id);
    if (!policy) return false;

    policy.enabled = false;
    return true;
  }

  private logAudit(userId: string, action: string, result: EvaluationResult, reason: string): void {
    const entry: AuditEntry = {
      id: `audit_${++this.auditCounter}_${Date.now()}`,
      timestamp: new Date(),
      userId,
      action,
      result,
      reason,
    };

    this.auditLog.push(entry);

    // Keep last 10000 entries
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }
  }

  getAuditLog(orgId: string): AuditEntry[] {
    return this.auditLog;
  }
}

// ============================================================================
// Default DLP Rules
// ============================================================================

const defaultDlpRules: DlpRule[] = [
  {
    name: 'SSN Pattern',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    action: 'block',
  },
  {
    name: 'Credit Card Pattern',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    action: 'block',
  },
  {
    name: 'API Key Pattern',
    pattern: /api[_-]?key[\s:=]+[a-zA-Z0-9_\-]{32,}/gi,
    action: 'alert',
  },
];

// ============================================================================
// Singleton
// ============================================================================

const policyEngine = new PolicyEngine();

export {
  PolicyEngine,
  policyEngine,
  defaultDlpRules,
  type PolicyType,
  type DataClassification,
  type EvaluationResult,
  type AgentPolicy,
  type DataPolicy,
  type UsagePolicy,
  type SecurityPolicy,
  type DlpRule,
  type PolicyRule,
  type Policy,
  type EvaluationContext,
  type EvaluationDecision,
  type AuditEntry,
};
