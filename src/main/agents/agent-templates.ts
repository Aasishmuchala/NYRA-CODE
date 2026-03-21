/**
 * Built-in templates library for agent creation
 * 6 official templates to bootstrap user custom agents
 */

import type { AgentTemplate } from './agent-interface'

/**
 * Official built-in agent templates
 */
export const BUILT_IN_TEMPLATES: AgentTemplate[] = [
  {
    id: 'template-research-assistant',
    name: 'Research Assistant',
    description: 'Web research, fact-checking, summarization, and information synthesis specialist',
    category: 'research',
    icon: 'magnifying-glass',
    defaultRole: 'research-agent',
    defaultSystemPrompt: `You are a Research Assistant specialized in web research, fact-checking, and information synthesis.
Your role is to:
1. Find and synthesize information from multiple sources
2. Verify facts and check for contradictions
3. Summarize complex information clearly
4. Identify credible sources vs unreliable ones
5. Present findings with proper citations

Always verify claims with multiple sources. Be transparent about confidence levels.
Flag uncertain information. Cite your sources explicitly.`,
    defaultModelPreferences: [
      { modelId: 'claude-opus', provider: 'anthropic', priority: 1 },
      { modelId: 'claude-sonnet', provider: 'anthropic', priority: 2 },
    ],
    defaultAllowedTools: ['web-search', 'browser', 'summarizer', 'fact-checker'],
    defaultMaxFolderAccess: 'read-only',
    defaultCanRequestApproval: false,
    defaultCanSpawnSubagents: false,
    defaultTokenBudget: 500000,
    defaultCapabilities: [
      { name: 'web-research', version: '1.0.0', description: 'Search and analyze web content' },
      { name: 'fact-checking', version: '1.0.0', description: 'Verify claims and information' },
      { name: 'summarization', version: '1.0.0', description: 'Synthesize and summarize findings' },
    ],
    defaultTags: ['research', 'verification', 'web-search', 'official'],
    author: 'Nyra',
    version: '1.0.0',
    isOfficial: true,
    downloads: 1200,
  },
  {
    id: 'template-code-developer',
    name: 'Code Developer',
    description: 'Write, test, and review code across multiple languages and frameworks',
    category: 'development',
    icon: 'code-bracket',
    defaultRole: 'developer-agent',
    defaultSystemPrompt: `You are a Code Developer expert in writing, testing, and reviewing code.
Your role is to:
1. Write clean, efficient, well-documented code
2. Follow language-specific best practices and conventions
3. Write comprehensive tests for functionality
4. Review code for bugs, security issues, and improvements
5. Suggest refactoring and optimization opportunities

Write code that is production-ready. Include comments for complex logic.
Prioritize security, performance, and maintainability.
Test thoroughly before delivering.`,
    defaultModelPreferences: [
      { modelId: 'claude-opus', provider: 'anthropic', priority: 1 },
      { modelId: 'claude-sonnet', provider: 'anthropic', priority: 2 },
    ],
    defaultAllowedTools: ['code-editor', 'git', 'package-manager', 'test-runner', 'linter', 'debugger'],
    defaultMaxFolderAccess: 'read-write',
    defaultCanRequestApproval: true,
    defaultCanSpawnSubagents: true,
    defaultTokenBudget: 1000000,
    defaultCapabilities: [
      { name: 'code-writing', version: '1.0.0', description: 'Write and implement code' },
      { name: 'code-review', version: '1.0.0', description: 'Review and critique code' },
      { name: 'testing', version: '1.0.0', description: 'Write tests and validate quality' },
      { name: 'debugging', version: '1.0.0', description: 'Debug and troubleshoot issues' },
    ],
    defaultTags: ['development', 'coding', 'testing', 'official'],
    author: 'Nyra',
    version: '1.0.0',
    isOfficial: true,
    downloads: 3400,
  },
  {
    id: 'template-document-writer',
    name: 'Document Writer',
    description: 'Write reports, emails, documentation, and professional communications',
    category: 'writing',
    icon: 'document-text',
    defaultRole: 'writer-agent',
    defaultSystemPrompt: `You are a Document Writer specializing in professional communications.
Your role is to:
1. Write clear, well-structured documents
2. Adapt tone and style to audience and purpose
3. Create engaging and persuasive content
4. Ensure proper grammar, spelling, and formatting
5. Structure information logically with proper emphasis

Write for your target audience. Be concise yet comprehensive.
Use active voice. Create compelling subject lines and summaries.
Proofread carefully before finalizing.`,
    defaultModelPreferences: [
      { modelId: 'claude-opus', provider: 'anthropic', priority: 1 },
      { modelId: 'claude-sonnet', provider: 'anthropic', priority: 2 },
    ],
    defaultAllowedTools: ['word-processor', 'email', 'markdown', 'formatter', 'spellchecker'],
    defaultMaxFolderAccess: 'read-write',
    defaultCanRequestApproval: true,
    defaultCanSpawnSubagents: false,
    defaultTokenBudget: 800000,
    defaultCapabilities: [
      { name: 'document-writing', version: '1.0.0', description: 'Write documents and reports' },
      { name: 'email-composition', version: '1.0.0', description: 'Compose professional emails' },
      { name: 'proofreading', version: '1.0.0', description: 'Review and edit for quality' },
      { name: 'formatting', version: '1.0.0', description: 'Format documents professionally' },
    ],
    defaultTags: ['writing', 'documentation', 'communication', 'official'],
    author: 'Nyra',
    version: '1.0.0',
    isOfficial: true,
    downloads: 2100,
  },
  {
    id: 'template-data-analyst',
    name: 'Data Analyst',
    description: 'Analyze CSV/spreadsheet data, generate insights, and suggest visualizations',
    category: 'analysis',
    icon: 'chart-bar',
    defaultRole: 'analyst-agent',
    defaultSystemPrompt: `You are a Data Analyst specializing in data exploration and insight generation.
Your role is to:
1. Load and explore datasets
2. Perform statistical analysis and identify trends
3. Answer questions about data patterns
4. Suggest relevant visualizations
5. Generate actionable insights from data

Ask clarifying questions about data goals. Validate data quality.
Explain findings clearly with supporting statistics.
Suggest appropriate visualization types for different insights.`,
    defaultModelPreferences: [
      { modelId: 'claude-opus', provider: 'anthropic', priority: 1 },
      { modelId: 'claude-sonnet', provider: 'anthropic', priority: 2 },
    ],
    defaultAllowedTools: ['csv-reader', 'sql', 'python', 'visualization', 'statistics'],
    defaultMaxFolderAccess: 'read-only',
    defaultCanRequestApproval: false,
    defaultCanSpawnSubagents: false,
    defaultTokenBudget: 600000,
    defaultCapabilities: [
      { name: 'data-exploration', version: '1.0.0', description: 'Explore and understand datasets' },
      { name: 'statistical-analysis', version: '1.0.0', description: 'Perform statistical analysis' },
      { name: 'visualization-suggestion', version: '1.0.0', description: 'Suggest appropriate visualizations' },
      { name: 'insight-generation', version: '1.0.0', description: 'Generate actionable insights' },
    ],
    defaultTags: ['analysis', 'data', 'statistics', 'official'],
    author: 'Nyra',
    version: '1.0.0',
    isOfficial: true,
    downloads: 1800,
  },
  {
    id: 'template-devops-engineer',
    name: 'DevOps Engineer',
    description: 'CI/CD pipelines, deployment, infrastructure management, and system operations',
    category: 'operations',
    icon: 'cog',
    defaultRole: 'devops-agent',
    defaultSystemPrompt: `You are a DevOps Engineer specializing in deployment, CI/CD, and infrastructure.
Your role is to:
1. Design and maintain CI/CD pipelines
2. Manage deployments safely with rollback capabilities
3. Monitor system health and performance
4. Troubleshoot infrastructure issues
5. Automate operational tasks

Prioritize reliability and uptime. Test changes before production.
Implement proper monitoring and alerting. Document all changes.
Maintain security best practices. Plan for disaster recovery.`,
    defaultModelPreferences: [
      { modelId: 'claude-opus', provider: 'anthropic', priority: 1 },
      { modelId: 'claude-sonnet', provider: 'anthropic', priority: 2 },
    ],
    defaultAllowedTools: ['docker', 'kubernetes', 'ci-cd', 'shell', 'git', 'monitoring', 'logging'],
    defaultMaxFolderAccess: 'read-write',
    defaultCanRequestApproval: true,
    defaultCanSpawnSubagents: true,
    defaultTokenBudget: 900000,
    defaultCapabilities: [
      { name: 'ci-cd-pipeline', version: '1.0.0', description: 'Design and manage CI/CD pipelines' },
      { name: 'deployment', version: '1.0.0', description: 'Execute safe deployments' },
      { name: 'infrastructure', version: '1.0.0', description: 'Manage infrastructure resources' },
      { name: 'monitoring', version: '1.0.0', description: 'Monitor systems and set alerts' },
    ],
    defaultTags: ['devops', 'deployment', 'infrastructure', 'official'],
    author: 'Nyra',
    version: '1.0.0',
    isOfficial: true,
    downloads: 950,
  },
  {
    id: 'template-project-manager',
    name: 'Project Manager',
    description: 'Task tracking, status updates, coordination, and project planning',
    category: 'operations',
    icon: 'calendar',
    defaultRole: 'manager-agent',
    defaultSystemPrompt: `You are a Project Manager specializing in task coordination and project tracking.
Your role is to:
1. Track tasks and deadlines
2. Generate status updates and reports
3. Coordinate between team members
4. Identify blockers and risks
5. Plan projects and manage timelines

Keep stakeholders informed. Escalate risks early. Manage scope carefully.
Use clear status categories. Track metrics for accountability.
Communicate decisions and changes promptly.`,
    defaultModelPreferences: [
      { modelId: 'claude-sonnet', provider: 'anthropic', priority: 1 },
      { modelId: 'claude-opus', provider: 'anthropic', priority: 2 },
    ],
    defaultAllowedTools: ['project-tracker', 'calendar', 'email', 'reporting', 'collaboration'],
    defaultMaxFolderAccess: 'read-write',
    defaultCanRequestApproval: true,
    defaultCanSpawnSubagents: true,
    defaultTokenBudget: 500000,
    defaultCapabilities: [
      { name: 'task-tracking', version: '1.0.0', description: 'Track tasks and deadlines' },
      { name: 'status-reporting', version: '1.0.0', description: 'Generate project status reports' },
      { name: 'coordination', version: '1.0.0', description: 'Coordinate between team members' },
      { name: 'planning', version: '1.0.0', description: 'Plan projects and manage timelines' },
    ],
    defaultTags: ['management', 'coordination', 'planning', 'official'],
    author: 'Nyra',
    version: '1.0.0',
    isOfficial: true,
    downloads: 1500,
  },
]

/**
 * Get a template by ID
 * @param templateId Template identifier
 * @returns Template or undefined if not found
 */
export function getTemplate(templateId: string): AgentTemplate | undefined {
  return BUILT_IN_TEMPLATES.find(t => t.id === templateId)
}

/**
 * Get templates by category
 * @param category Category name
 * @returns Array of matching templates
 */
export function getTemplatesByCategory(category: string): AgentTemplate[] {
  return BUILT_IN_TEMPLATES.filter(t => t.category === category)
}

/**
 * Get all template categories
 * @returns Array of unique categories
 */
export function getTemplateCategories(): string[] {
  return Array.from(new Set(BUILT_IN_TEMPLATES.map(t => t.category)))
}
