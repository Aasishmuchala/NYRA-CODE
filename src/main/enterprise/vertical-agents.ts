/**
 * Vertical Agent Packs for Industry-Specific Automation
 * 
 * Provides pre-configured agent packs tailored to specific industries (Legal, Finance, Sales, Engineering).
 * Each pack contains specialized agents, tools, and prompts for domain-specific tasks.
 */

// Interfaces

/**
 * Tool definition for agent use
 */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: string;
}

/**
 * Agent definition within a pack
 */
export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  allowedTools: string[];
  maxTokens: number;
}

/**
 * Agent pack - a collection of agents, tools, and prompts for a specific industry
 */
export interface AgentPack {
  id: string;
  name: string;
  description: string;
  category: string;
  agents: AgentDefinition[];
  tools: ToolDefinition[];
  prompts: string[];
}

// Pre-built Agent Packs

const LEGAL_PACK: AgentPack = {
  id: 'pack-legal',
  name: 'Legal Pack',
  description: 'Industry-specific agents for legal document analysis and compliance',
  category: 'legal',
  agents: [
    {
      id: 'agent-contract-reviewer',
      name: 'Contract Reviewer',
      role: 'Legal Document Analyst',
      systemPrompt:
        'You are an expert contract reviewer specializing in identifying risk clauses and unfavorable terms. ' +
        'Analyze contracts thoroughly, flag potential legal and financial risks, suggest protective language, ' +
        'and provide recommendations for negotiation.',
      allowedTools: ['contract-extract', 'clause-analyze', 'risk-flag', 'recommendation-generate'],
      maxTokens: 4000,
    },
    {
      id: 'agent-compliance-checker',
      name: 'Compliance Checker',
      role: 'Regulatory Compliance Specialist',
      systemPrompt:
        'You are a compliance expert who ensures business operations meet regulatory requirements. ' +
        'Analyze policies, procedures, and documentation for regulatory compliance, identify gaps, ' +
        'and provide actionable compliance recommendations.',
      allowedTools: ['regulation-lookup', 'policy-analyze', 'gap-identify', 'compliance-report'],
      maxTokens: 3500,
    },
    {
      id: 'agent-legal-research',
      name: 'Legal Research Agent',
      role: 'Case Law & Statute Researcher',
      systemPrompt:
        'You are a legal research specialist with expertise in case law and statutory analysis. ' +
        'Research relevant precedents, statutes, and legal authorities, synthesize findings into coherent legal arguments, ' +
        'and provide citations and precedential value.',
      allowedTools: ['case-search', 'statute-lookup', 'precedent-analyze', 'citation-format'],
      maxTokens: 3500,
    },
  ],
  tools: [
    {
      id: 'contract-extract',
      name: 'Contract Extract',
      description: 'Extract key clauses and terms from contracts',
      parameters: { contractText: 'string', clauseTypes: 'string[]' },
      handler: 'extractContractClauses',
    },
    {
      id: 'clause-analyze',
      name: 'Clause Analyzer',
      description: 'Analyze specific contract clauses for legal implications',
      parameters: { clause: 'string', contractType: 'string' },
      handler: 'analyzeClause',
    },
    {
      id: 'risk-flag',
      name: 'Risk Flagging',
      description: 'Identify and flag high-risk clauses',
      parameters: { clause: 'string', riskLevel: 'string' },
      handler: 'flagRisk',
    },
    {
      id: 'recommendation-generate',
      name: 'Recommendation Generator',
      description: 'Generate recommendations for contract modifications',
      parameters: { issues: 'object[]', context: 'string' },
      handler: 'generateRecommendations',
    },
    {
      id: 'regulation-lookup',
      name: 'Regulation Lookup',
      description: 'Look up applicable regulations and requirements',
      parameters: { jurisdiction: 'string', topic: 'string' },
      handler: 'lookupRegulation',
    },
    {
      id: 'policy-analyze',
      name: 'Policy Analyzer',
      description: 'Analyze internal policies for compliance gaps',
      parameters: { policy: 'string', regulations: 'string[]' },
      handler: 'analyzePolicy',
    },
    {
      id: 'gap-identify',
      name: 'Gap Identifier',
      description: 'Identify compliance gaps and deficiencies',
      parameters: { policy: 'string', requirement: 'string' },
      handler: 'identifyGaps',
    },
    {
      id: 'compliance-report',
      name: 'Compliance Report Generator',
      description: 'Generate detailed compliance reports',
      parameters: { findings: 'object[]', recommendations: 'string[]' },
      handler: 'generateComplianceReport',
    },
    {
      id: 'case-search',
      name: 'Case Law Search',
      description: 'Search for relevant case law and precedents',
      parameters: { query: 'string', jurisdiction: 'string', yearsBack: 'number' },
      handler: 'searchCaseLaw',
    },
    {
      id: 'statute-lookup',
      name: 'Statute Lookup',
      description: 'Look up relevant statutes and legislation',
      parameters: { statute: 'string', jurisdiction: 'string' },
      handler: 'lookupStatute',
    },
    {
      id: 'precedent-analyze',
      name: 'Precedent Analyzer',
      description: 'Analyze precedential value and applicability',
      parameters: { caseInfo: 'object', currentIssue: 'string' },
      handler: 'analyzePrecedent',
    },
    {
      id: 'citation-format',
      name: 'Citation Formatter',
      description: 'Format legal citations according to standards',
      parameters: { caseInfo: 'object', format: 'string' },
      handler: 'formatCitation',
    },
  ],
  prompts: [
    'Review this contract and identify all risk clauses',
    'Ensure our policies comply with [REGULATION]',
    'Research precedents for [LEGAL_ISSUE]',
  ],
};

const FINANCE_PACK: AgentPack = {
  id: 'pack-finance',
  name: 'Finance Pack',
  description: 'Industry-specific agents for financial management and analysis',
  category: 'finance',
  agents: [
    {
      id: 'agent-bookkeeper',
      name: 'Bookkeeper Agent',
      role: 'Financial Transaction Manager',
      systemPrompt:
        'You are a meticulous bookkeeper responsible for accurate financial record-keeping. ' +
        'Categorize transactions, reconcile accounts, detect discrepancies, and maintain accurate financial records ' +
        'following accounting principles.',
      allowedTools: ['transaction-categorize', 'account-reconcile', 'discrepancy-detect', 'ledger-update'],
      maxTokens: 3000,
    },
    {
      id: 'agent-auditor',
      name: 'Auditor Agent',
      role: 'Financial Compliance Auditor',
      systemPrompt:
        'You are an experienced auditor specializing in anomaly detection and compliance verification. ' +
        'Review financial statements for irregularities, ensure compliance with accounting standards, ' +
        'and provide detailed audit findings and recommendations.',
      allowedTools: ['anomaly-detect', 'compliance-verify', 'statement-analyze', 'audit-report-generate'],
      maxTokens: 4000,
    },
    {
      id: 'agent-forecaster',
      name: 'Forecaster Agent',
      role: 'Financial Trend & Forecasting Analyst',
      systemPrompt:
        'You are a financial analyst skilled in trend analysis and forecasting. ' +
        'Analyze historical financial data, identify trends, project future performance, ' +
        'and provide data-driven forecasts and strategic recommendations.',
      allowedTools: ['trend-analyze', 'forecast-generate', 'scenario-model', 'insight-extract'],
      maxTokens: 3500,
    },
  ],
  tools: [
    {
      id: 'transaction-categorize',
      name: 'Transaction Categorizer',
      description: 'Categorize financial transactions automatically',
      parameters: { transaction: 'object', accounts: 'string[]' },
      handler: 'categorizeTransaction',
    },
    {
      id: 'account-reconcile',
      name: 'Account Reconciler',
      description: 'Reconcile accounts and identify discrepancies',
      parameters: { account: 'string', transactions: 'object[]', bankStatement: 'object[]' },
      handler: 'reconcileAccount',
    },
    {
      id: 'discrepancy-detect',
      name: 'Discrepancy Detector',
      description: 'Detect and flag accounting discrepancies',
      parameters: { records: 'object[]', threshold: 'number' },
      handler: 'detectDiscrepancy',
    },
    {
      id: 'ledger-update',
      name: 'Ledger Updater',
      description: 'Update general ledger with verified transactions',
      parameters: { transactions: 'object[]', period: 'string' },
      handler: 'updateLedger',
    },
    {
      id: 'anomaly-detect',
      name: 'Anomaly Detector',
      description: 'Detect financial anomalies and irregularities',
      parameters: { data: 'object[]', baseline: 'object' },
      handler: 'detectAnomalies',
    },
    {
      id: 'compliance-verify',
      name: 'Compliance Verifier',
      description: 'Verify compliance with accounting standards',
      parameters: { statements: 'object[]', standards: 'string[]' },
      handler: 'verifyCompliance',
    },
    {
      id: 'statement-analyze',
      name: 'Statement Analyzer',
      description: 'Analyze financial statements comprehensively',
      parameters: { statements: 'object[]', period: 'string' },
      handler: 'analyzeStatements',
    },
    {
      id: 'audit-report-generate',
      name: 'Audit Report Generator',
      description: 'Generate detailed audit reports',
      parameters: { findings: 'object[]', recommendations: 'string[]' },
      handler: 'generateAuditReport',
    },
    {
      id: 'trend-analyze',
      name: 'Trend Analyzer',
      description: 'Analyze financial trends over time',
      parameters: { data: 'object[]', period: 'string', metrics: 'string[]' },
      handler: 'analyzeTrends',
    },
    {
      id: 'forecast-generate',
      name: 'Forecast Generator',
      description: 'Generate financial forecasts',
      parameters: { historicalData: 'object[]', forecastPeriod: 'number', confidence: 'number' },
      handler: 'generateForecast',
    },
    {
      id: 'scenario-model',
      name: 'Scenario Modeler',
      description: 'Model different financial scenarios',
      parameters: { baselineData: 'object[]', scenarios: 'object[]' },
      handler: 'modelScenarios',
    },
    {
      id: 'insight-extract',
      name: 'Insight Extractor',
      description: 'Extract actionable insights from financial data',
      parameters: { data: 'object[]', context: 'string' },
      handler: 'extractInsights',
    },
  ],
  prompts: [
    'Categorize these transactions and reconcile the account',
    'Audit our financial statements for Q[QUARTER]',
    'Forecast revenue for the next [PERIOD]',
  ],
};

const SALES_PACK: AgentPack = {
  id: 'pack-sales',
  name: 'Sales Pack',
  description: 'Industry-specific agents for sales operations and deal management',
  category: 'sales',
  agents: [
    {
      id: 'agent-prospector',
      name: 'Prospector Agent',
      role: 'Lead Research & Outreach Specialist',
      systemPrompt:
        'You are a skilled prospector who identifies high-quality leads and drafts compelling outreach. ' +
        'Research potential customers, analyze their fit, develop personalized outreach strategies, ' +
        'and draft engaging initial contact messages.',
      allowedTools: ['lead-research', 'fit-analyze', 'outreach-draft', 'email-personalize'],
      maxTokens: 3500,
    },
    {
      id: 'agent-deal-analyst',
      name: 'Deal Analyst',
      role: 'Sales Pipeline & Win Probability Analyst',
      systemPrompt:
        'You are a deal analyst with expertise in pipeline management and forecasting. ' +
        'Analyze sales opportunities, assess deal health, calculate win probability, ' +
        'and provide insights for deal acceleration and risk mitigation.',
      allowedTools: ['pipeline-analyze', 'deal-health-assess', 'win-probability-calc', 'deal-insight-generate'],
      maxTokens: 3500,
    },
    {
      id: 'agent-crm-sync',
      name: 'CRM Sync Agent',
      role: 'Sales Data Automation Specialist',
      systemPrompt:
        'You are a CRM automation specialist focused on data accuracy and operational efficiency. ' +
        'Automate data entry, ensure consistency across systems, update customer records, ' +
        'and synchronize sales information across platforms.',
      allowedTools: ['crm-record-create', 'crm-record-update', 'data-validate', 'sync-verify'],
      maxTokens: 2500,
    },
  ],
  tools: [
    {
      id: 'lead-research',
      name: 'Lead Research',
      description: 'Research potential leads and gather intelligence',
      parameters: { company: 'string', industry: 'string', size: 'string' },
      handler: 'researchLead',
    },
    {
      id: 'fit-analyze',
      name: 'Fit Analyzer',
      description: 'Analyze lead fit for product/service',
      parameters: { leadProfile: 'object', productProfile: 'object' },
      handler: 'analyzeFit',
    },
    {
      id: 'outreach-draft',
      name: 'Outreach Drafter',
      description: 'Draft outreach messages and sales collateral',
      parameters: { leadInfo: 'object', productInfo: 'object', style: 'string' },
      handler: 'draftOutreach',
    },
    {
      id: 'email-personalize',
      name: 'Email Personalizer',
      description: 'Personalize outreach emails',
      parameters: { template: 'string', leadData: 'object' },
      handler: 'personalizeEmail',
    },
    {
      id: 'pipeline-analyze',
      name: 'Pipeline Analyzer',
      description: 'Analyze sales pipeline and stages',
      parameters: { opportunities: 'object[]', period: 'string' },
      handler: 'analyzePipeline',
    },
    {
      id: 'deal-health-assess',
      name: 'Deal Health Assessor',
      description: 'Assess health and momentum of deals',
      parameters: { deal: 'object', context: 'object' },
      handler: 'assessDealHealth',
    },
    {
      id: 'win-probability-calc',
      name: 'Win Probability Calculator',
      description: 'Calculate win probability for opportunities',
      parameters: { deal: 'object', historicalData: 'object[]' },
      handler: 'calculateWinProbability',
    },
    {
      id: 'deal-insight-generate',
      name: 'Deal Insight Generator',
      description: 'Generate insights and recommendations for deals',
      parameters: { deals: 'object[]', metrics: 'object' },
      handler: 'generateDealInsights',
    },
    {
      id: 'crm-record-create',
      name: 'CRM Record Creator',
      description: 'Create CRM records automatically',
      parameters: { recordType: 'string', data: 'object' },
      handler: 'createCRMRecord',
    },
    {
      id: 'crm-record-update',
      name: 'CRM Record Updater',
      description: 'Update existing CRM records',
      parameters: { recordId: 'string', updates: 'object' },
      handler: 'updateCRMRecord',
    },
    {
      id: 'data-validate',
      name: 'Data Validator',
      description: 'Validate and clean sales data',
      parameters: { records: 'object[]', schema: 'object' },
      handler: 'validateData',
    },
    {
      id: 'sync-verify',
      name: 'Sync Verifier',
      description: 'Verify data synchronization across systems',
      parameters: { sourceSystem: 'string', targetSystem: 'string', records: 'object[]' },
      handler: 'verifySyncStatus',
    },
  ],
  prompts: [
    'Research leads in [INDUSTRY] and draft outreach',
    'Analyze our pipeline and identify at-risk deals',
    'Update CRM with new customer data',
  ],
};

const ENGINEERING_PACK: AgentPack = {
  id: 'pack-engineering',
  name: 'Engineering Pack',
  description: 'Industry-specific agents for software development and operations',
  category: 'engineering',
  agents: [
    {
      id: 'agent-code-reviewer',
      name: 'Code Reviewer',
      role: 'Pull Request & Code Quality Expert',
      systemPrompt:
        'You are an expert code reviewer with deep knowledge of software best practices and design patterns. ' +
        'Review pull requests for functionality, security, performance, and maintainability, identify issues, ' +
        'suggest improvements, and ensure alignment with coding standards.',
      allowedTools: ['code-analyze', 'security-check', 'performance-analyze', 'suggestion-generate'],
      maxTokens: 4000,
    },
    {
      id: 'agent-incident-responder',
      name: 'Incident Responder',
      role: 'Log Analysis & Root Cause Analysis Specialist',
      systemPrompt:
        'You are an incident response specialist skilled in log analysis and root cause analysis. ' +
        'Analyze system logs and metrics, identify failure patterns, perform RCA, ' +
        'and provide actionable remediation steps.',
      allowedTools: ['log-analyze', 'metric-analyze', 'pattern-identify', 'rca-generate'],
      maxTokens: 3500,
    },
    {
      id: 'agent-docs-writer',
      name: 'Documentation Writer',
      role: 'Technical Documentation Specialist',
      systemPrompt:
        'You are a technical writer skilled in creating clear, comprehensive documentation. ' +
        'Write technical documentation, API docs, architecture guides, and runbooks, ' +
        'ensure clarity and accuracy, and maintain documentation standards.',
      allowedTools: ['doc-draft', 'code-example-generate', 'doc-structure-organize', 'doc-validate'],
      maxTokens: 3500,
    },
  ],
  tools: [
    {
      id: 'code-analyze',
      name: 'Code Analyzer',
      description: 'Analyze code for functionality and quality',
      parameters: { code: 'string', language: 'string', standards: 'string[]' },
      handler: 'analyzeCode',
    },
    {
      id: 'security-check',
      name: 'Security Checker',
      description: 'Check code for security vulnerabilities',
      parameters: { code: 'string', type: 'string' },
      handler: 'checkSecurity',
    },
    {
      id: 'performance-analyze',
      name: 'Performance Analyzer',
      description: 'Analyze code for performance issues',
      parameters: { code: 'string', context: 'string' },
      handler: 'analyzePerformance',
    },
    {
      id: 'suggestion-generate',
      name: 'Suggestion Generator',
      description: 'Generate code improvement suggestions',
      parameters: { issues: 'object[]', codeContext: 'string' },
      handler: 'generateSuggestions',
    },
    {
      id: 'log-analyze',
      name: 'Log Analyzer',
      description: 'Analyze logs for errors and patterns',
      parameters: { logs: 'string[]', timeRange: 'object' },
      handler: 'analyzeLogs',
    },
    {
      id: 'metric-analyze',
      name: 'Metric Analyzer',
      description: 'Analyze system metrics during incidents',
      parameters: { metrics: 'object[]', baseline: 'object' },
      handler: 'analyzeMetrics',
    },
    {
      id: 'pattern-identify',
      name: 'Pattern Identifier',
      description: 'Identify patterns and anomalies in logs/metrics',
      parameters: { data: 'object[]', anomalyType: 'string' },
      handler: 'identifyPatterns',
    },
    {
      id: 'rca-generate',
      name: 'RCA Generator',
      description: 'Generate root cause analysis reports',
      parameters: { incident: 'object', findings: 'object[]' },
      handler: 'generateRCA',
    },
    {
      id: 'doc-draft',
      name: 'Documentation Drafter',
      description: 'Draft technical documentation',
      parameters: { topic: 'string', audience: 'string', format: 'string' },
      handler: 'draftDocumentation',
    },
    {
      id: 'code-example-generate',
      name: 'Code Example Generator',
      description: 'Generate code examples for documentation',
      parameters: { concept: 'string', language: 'string' },
      handler: 'generateCodeExamples',
    },
    {
      id: 'doc-structure-organize',
      name: 'Doc Structure Organizer',
      description: 'Organize and structure documentation',
      parameters: { content: 'string', docType: 'string' },
      handler: 'organizeDocStructure',
    },
    {
      id: 'doc-validate',
      name: 'Documentation Validator',
      description: 'Validate documentation for completeness and accuracy',
      parameters: { documentation: 'string', standards: 'string[]' },
      handler: 'validateDocumentation',
    },
  ],
  prompts: [
    'Review this pull request for code quality and security',
    'Analyze these logs from the incident and perform RCA',
    'Write technical documentation for [FEATURE]',
  ],
};

// Vertical Agent Manager

/**
 * Manages vertical agent packs - their registration, activation, and team association
 */
export class VerticalAgentManager {
  private packs: Map<string, AgentPack> = new Map();
  private teamActivations: Map<string, Set<string>> = new Map(); // teamId => Set<packId>

  constructor() {
    // Initialize with pre-built packs
    this.registerPack(LEGAL_PACK);
    this.registerPack(FINANCE_PACK);
    this.registerPack(SALES_PACK);
    this.registerPack(ENGINEERING_PACK);
  }

  /**
   * Register an agent pack
   */
  registerPack(pack: AgentPack): void {
    if (this.packs.has(pack.id)) {
      throw new Error(`Pack with id '${pack.id}' is already registered`);
    }
    this.packs.set(pack.id, pack);
  }

  /**
   * List all registered packs
   */
  listPacks(): AgentPack[] {
    return Array.from(this.packs.values());
  }

  /**
   * Get a specific pack by ID
   */
  getPack(packId: string): AgentPack | undefined {
    return this.packs.get(packId);
  }

  /**
   * Activate a pack for a team
   */
  activatePack(packId: string, teamId: string): void {
    if (!this.packs.has(packId)) {
      throw new Error(`Pack with id '${packId}' not found`);
    }

    if (!this.teamActivations.has(teamId)) {
      this.teamActivations.set(teamId, new Set());
    }

    this.teamActivations.get(teamId)!.add(packId);
  }

  /**
   * Deactivate a pack for a team
   */
  deactivatePack(packId: string, teamId: string): void {
    const activePacks = this.teamActivations.get(teamId);
    if (activePacks) {
      activePacks.delete(packId);
    }
  }

  /**
   * Get all active packs for a team
   */
  getActivePacksForTeam(teamId: string): AgentPack[] {
    const activePackIds = this.teamActivations.get(teamId);
    if (!activePackIds) {
      return [];
    }

    return Array.from(activePackIds)
      .map((packId) => this.packs.get(packId))
      .filter((pack): pack is AgentPack => pack !== undefined);
  }
}

// Singleton instance
export const verticalAgentManager = new VerticalAgentManager();
