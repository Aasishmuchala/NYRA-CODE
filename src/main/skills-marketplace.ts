/**
 * Skills Marketplace Manager
 *
 * Manages the skills marketplace, installation, and registry.
 * Acts as the backend for the Skills Marketplace UI component.
 *
 * All skills are validated through a safety layer that checks for:
 * - Prompt injection patterns (LLM manipulation attempts)
 * - HTML/script injection
 * - Field length limits
 * - Category validation
 */

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

// ── Types ──────────────────────────────────────────────────────────────────
export interface MarketplaceSkill {
  id: string
  name: string
  description: string
  author: string
  version: string
  category: 'coding' | 'writing' | 'data' | 'automation' | 'productivity' | 'design' | 'devops' | 'security' | 'finance' | 'marketing' | 'legal' | 'education' | 'healthcare' | 'research' | 'communication' | 'other'
  downloads: number
  rating: number
  tags: string[]
  icon?: string
  installedLocally?: boolean
}

export interface SkillRegistry {
  installed: Record<string, { version: string; installedAt: number; enabled: boolean }>
}

export interface SkillSafetyStats {
  total: number
  passed: number
  rejected: number
  lastValidated: string
}

// ── Paths ──────────────────────────────────────────────────────────────────
export const SKILLS_DIR = path.join(app.getPath('userData'), 'openclaw-skills')
export const SKILLS_REGISTRY_PATH = path.join(app.getPath('userData'), 'nyra_skills_registry.json')

// ── Safety Validation Layer ────────────────────────────────────────────────
const INJECTION_PATTERNS = [
  // ── Prompt injection ──
  /ignore\s+previous\s+instructions/i,
  /ignore\s+the\s+system\s+prompt/i,
  /system\s*:/i,
  /assistant\s*:/i,
  /user\s*:/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /<\|system\|>/i,
  /you\s+are\s+now/i,
  /pretend\s+you\s+are/i,
  /act\s+as\s+if/i,
  /forget\s+all\s+previous/i,
  /bypass\s+security/i,
  /override\s+restrictions/i,
  /execute\s+command/i,
  // ── DAN / jailbreak patterns ──
  /\bDAN\b/,
  /do\s+anything\s+now/i,
  /jailbreak/i,
  /developer\s+mode/i,
  /god\s+mode/i,
  // ── HTML / script injection ──
  /eval\s*\(/i,
  /<script/i,
  /javascript\s*:/i,
  /onerror\s*=/i,
  /onclick\s*=/i,
  /onload\s*=/i,
  /onmouseover\s*=/i,
  /onfocus\s*=/i,
  /data\s*:\s*text\/html/i,
  /vbscript\s*:/i,
  // ── Encoding evasion ──
  /&#x?[0-9a-f]+;/i,
  /\\u[0-9a-f]{4}/i,
  /base64/i,
]

function sanitizeText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/[<>\"'`]/g, '')
    .replace(/\x00/g, '')
    .trim()
}

function sanitizeSkill(skill: Partial<MarketplaceSkill>): MarketplaceSkill | null {
  if (!skill.id || !skill.name || !skill.description || !skill.author || !skill.version || !skill.category) {
    return null
  }

  const validCategories = ['coding', 'writing', 'data', 'automation', 'productivity', 'design', 'devops', 'security', 'finance', 'marketing', 'legal', 'education', 'healthcare', 'research', 'communication', 'other']
  if (!validCategories.includes(skill.category)) {
    return null
  }

  const sanitizedId = sanitizeText(skill.id).substring(0, 40)
  const sanitizedName = sanitizeText(skill.name).substring(0, 60)
  const sanitizedDesc = sanitizeText(skill.description).substring(0, 180)
  const sanitizedAuthor = sanitizeText(skill.author).substring(0, 60)

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitizedName) || pattern.test(sanitizedDesc) || pattern.test(sanitizedAuthor)) {
      return null
    }
  }

  const sanitizedTags = (skill.tags || [])
    .map(tag => sanitizeText(tag).substring(0, 30))
    .filter(tag => tag.length > 0)

  for (const tag of sanitizedTags) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(tag)) {
        return null
      }
    }
  }

  // Sanitize icon — only allow single emoji or short text (no HTML/script)
  let sanitizedIcon: string | undefined
  if (skill.icon) {
    const rawIcon = sanitizeText(skill.icon).substring(0, 4)
    // Reject if any injection pattern matches the icon field
    const iconSafe = !INJECTION_PATTERNS.some(p => p.test(rawIcon))
    sanitizedIcon = iconSafe ? rawIcon : '📦'
  }

  return {
    id: sanitizedId,
    name: sanitizedName,
    description: sanitizedDesc,
    author: sanitizedAuthor,
    version: skill.version || '1.0.0',
    category: skill.category as MarketplaceSkill['category'],
    downloads: Math.max(500, Math.min(50000, skill.downloads || 1000)),
    rating: Math.max(3.8, Math.min(5.0, skill.rating || 4.5)),
    tags: sanitizedTags,
    icon: sanitizedIcon,
    installedLocally: skill.installedLocally,
  }
}

// ── Safety Stats ───────────────────────────────────────────────────────────
export let SKILL_SAFETY_STATS: SkillSafetyStats = {
  total: 0,
  passed: 0,
  rejected: 0,
  lastValidated: new Date().toISOString(),
}

// ── Marketplace Catalog Generator (1000+ skills) ───────────────────────────
// Uses a template-driven generator to produce a large, diverse catalog
// without maintaining 1000 individual entries manually.

type SkillCategory = MarketplaceSkill['category']

interface SkillTemplate {
  prefix: string
  name: string
  desc: string
  author: string
  cat: SkillCategory
  tags: string[]
  icon: string
}

// Deterministic pseudo-random from seed string
function seedHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const SKILL_TEMPLATES: SkillTemplate[] = [
  // ── CODING (120+) ──
  { prefix: 'code-review', name: 'Code Review Pro', desc: 'Comprehensive code analysis, quality checks, and best practices review', author: 'CodeHub', cat: 'coding', tags: ['review','quality','analysis'], icon: '👁️' },
  { prefix: 'test-gen', name: 'Test Generator', desc: 'Automatically generate unit tests, integration tests, and test fixtures', author: 'TestLabs', cat: 'coding', tags: ['testing','automation','coverage'], icon: '✅' },
  { prefix: 'api-builder', name: 'API Builder', desc: 'Generate REST, GraphQL, and gRPC API definitions from specs', author: 'APIHub', cat: 'coding', tags: ['api','rest','graphql'], icon: '🔌' },
  { prefix: 'refactor', name: 'Refactoring Assistant', desc: 'Intelligent code refactoring suggestions and automated transformations', author: 'CodeCraft', cat: 'coding', tags: ['refactor','cleanup','patterns'], icon: '🔄' },
  { prefix: 'git-wizard', name: 'Git Wizard', desc: 'Advanced Git workflow automation, merge strategies, and history analysis', author: 'GitFlow', cat: 'coding', tags: ['git','vcs','workflow'], icon: '🧙' },
  { prefix: 'docker', name: 'Docker Compose Builder', desc: 'Generate and optimize Docker Compose configs for microservices', author: 'DockerHub', cat: 'coding', tags: ['docker','compose','containers'], icon: '🐳' },
  { prefix: 'cicd', name: 'CI/CD Pipeline Creator', desc: 'Build GitHub Actions, GitLab CI, and Jenkins pipelines', author: 'DevOpsHub', cat: 'coding', tags: ['cicd','automation','devops'], icon: '⚙️' },
  { prefix: 'db-schema', name: 'Database Schema Designer', desc: 'Design, normalize, and optimize database schemas', author: 'DatabasePro', cat: 'coding', tags: ['database','schema','sql'], icon: '🗄️' },
  { prefix: 'algo', name: 'Algorithm Optimizer', desc: 'Analyze and optimize algorithms for time and space complexity', author: 'AlgoMaster', cat: 'coding', tags: ['algorithms','performance','optimization'], icon: '⚡' },
  { prefix: 'regex', name: 'Regex Master', desc: 'Generate, validate, and explain regular expressions', author: 'PatternLab', cat: 'coding', tags: ['regex','patterns','parsing'], icon: '🔍' },
  { prefix: 'ts-convert', name: 'TypeScript Converter', desc: 'Convert JavaScript to TypeScript with type inference', author: 'TypeScriptPro', cat: 'coding', tags: ['typescript','javascript','types'], icon: '📘' },
  { prefix: 'py-debug', name: 'Python Debugger', desc: 'Advanced Python debugging, profiling, and performance analysis', author: 'PythonLabs', cat: 'coding', tags: ['python','debugging','profiling'], icon: '🐍' },
  { prefix: 'react-gen', name: 'React Component Generator', desc: 'Generate React components, hooks, and hierarchies', author: 'ReactStudio', cat: 'coding', tags: ['react','components','frontend'], icon: '⚛️' },
  { prefix: 'perf-profile', name: 'Performance Profiler', desc: 'Profile apps, identify bottlenecks, generate optimization reports', author: 'PerfLabs', cat: 'coding', tags: ['performance','profiling','optimization'], icon: '📊' },
  { prefix: 'sec-scan', name: 'Security Scanner', desc: 'Scan code for vulnerabilities and compliance violations', author: 'SecurityHub', cat: 'coding', tags: ['security','vulnerabilities','compliance'], icon: '🔒' },
  { prefix: 'graphql', name: 'GraphQL Schema Builder', desc: 'Design and validate GraphQL schemas with resolvers', author: 'GraphQLHub', cat: 'coding', tags: ['graphql','schema','api'], icon: '📡' },
  { prefix: 'microservices', name: 'Microservices Architect', desc: 'Design microservices architecture with communication patterns', author: 'ArchHub', cat: 'coding', tags: ['microservices','architecture','design'], icon: '🏗️' },
  { prefix: 'code-doc', name: 'Code Documentation Generator', desc: 'Generate API docs, README, and inline comments', author: 'DocHub', cat: 'coding', tags: ['documentation','comments','readme'], icon: '📝' },
  { prefix: 'dep-analyze', name: 'Dependency Analyzer', desc: 'Analyze dependencies for conflicts, updates, and security', author: 'DependencyPro', cat: 'coding', tags: ['dependencies','analysis','security'], icon: '🔗' },
  { prefix: 'err-handle', name: 'Error Handler Pro', desc: 'Generate error handling, custom classes, and recovery logic', author: 'ErrorHub', cat: 'coding', tags: ['errors','exceptions','handling'], icon: '⚠️' },
  { prefix: 'vue-gen', name: 'Vue.js Component Builder', desc: 'Generate Vue 3 components with Composition API and TypeScript', author: 'VueLabs', cat: 'coding', tags: ['vue','components','frontend'], icon: '💚' },
  { prefix: 'svelte-gen', name: 'Svelte Kit Builder', desc: 'Build SvelteKit pages, layouts, and server routes', author: 'SvelteLabs', cat: 'coding', tags: ['svelte','sveltekit','frontend'], icon: '🔥' },
  { prefix: 'next-gen', name: 'Next.js App Builder', desc: 'Generate Next.js app router pages, API routes, and middleware', author: 'NextHub', cat: 'coding', tags: ['nextjs','react','fullstack'], icon: '▲' },
  { prefix: 'rust-assist', name: 'Rust Assistant', desc: 'Rust ownership, lifetime, and borrow checker guidance', author: 'RustLabs', cat: 'coding', tags: ['rust','ownership','systems'], icon: '🦀' },
  { prefix: 'go-assist', name: 'Go Assistant', desc: 'Go concurrency patterns, goroutines, and channel design', author: 'GoLabs', cat: 'coding', tags: ['go','concurrency','goroutines'], icon: '🐹' },
  { prefix: 'swift-ui', name: 'SwiftUI Builder', desc: 'Build SwiftUI views, modifiers, and navigation flows', author: 'AppleDev', cat: 'coding', tags: ['swift','swiftui','ios'], icon: '🍎' },
  { prefix: 'kotlin-gen', name: 'Kotlin Multiplatform', desc: 'Kotlin multiplatform shared code and platform-specific implementations', author: 'KotlinHub', cat: 'coding', tags: ['kotlin','multiplatform','android'], icon: '🟣' },
  { prefix: 'flutter-gen', name: 'Flutter Widget Builder', desc: 'Generate Flutter widgets, state management, and navigation', author: 'FlutterLabs', cat: 'coding', tags: ['flutter','dart','mobile'], icon: '🦋' },
  { prefix: 'tailwind', name: 'Tailwind CSS Expert', desc: 'Generate responsive Tailwind layouts with custom themes', author: 'TailwindHub', cat: 'coding', tags: ['tailwind','css','responsive'], icon: '🎨' },
  { prefix: 'prisma-gen', name: 'Prisma Schema Builder', desc: 'Design Prisma schemas with relations and migrations', author: 'PrismaHub', cat: 'coding', tags: ['prisma','orm','database'], icon: '💎' },
  { prefix: 'electron-gen', name: 'Electron App Builder', desc: 'Build Electron desktop apps with IPC and native integration', author: 'ElectronHub', cat: 'coding', tags: ['electron','desktop','nodejs'], icon: '🖥️' },
  { prefix: 'wasm-gen', name: 'WebAssembly Builder', desc: 'Compile and optimize WebAssembly modules from Rust or C++', author: 'WasmLabs', cat: 'coding', tags: ['wasm','webassembly','performance'], icon: '🔧' },
  { prefix: 'terraform', name: 'Terraform Generator', desc: 'Generate Terraform HCL for AWS, GCP, and Azure infrastructure', author: 'InfraHub', cat: 'coding', tags: ['terraform','iac','cloud'], icon: '🏔️' },
  { prefix: 'k8s-gen', name: 'Kubernetes Manifests', desc: 'Generate K8s deployments, services, ingress, and Helm charts', author: 'K8sHub', cat: 'coding', tags: ['kubernetes','k8s','containers'], icon: '☸️' },

  // ── WRITING (80+) ──
  { prefix: 'blog', name: 'Blog Post Writer', desc: 'Generate engaging blog posts with SEO optimization', author: 'WriteHub', cat: 'writing', tags: ['blogging','content','seo'], icon: '✍️' },
  { prefix: 'tech-doc', name: 'Technical Documentation', desc: 'Create technical docs, API references, and developer guides', author: 'DocStudio', cat: 'writing', tags: ['documentation','technical','guides'], icon: '📚' },
  { prefix: 'email', name: 'Email Composer', desc: 'Compose professional emails with templates and tone adjustments', author: 'MailPro', cat: 'writing', tags: ['email','communication','professional'], icon: '📧' },
  { prefix: 'seo-opt', name: 'SEO Content Optimizer', desc: 'Optimize content for search engines with keyword analysis', author: 'SEOHub', cat: 'writing', tags: ['seo','content','keywords'], icon: '🔍' },
  { prefix: 'social', name: 'Social Media Content', desc: 'Generate social media posts optimized for each platform', author: 'SocialHub', cat: 'writing', tags: ['social','content','marketing'], icon: '📱' },
  { prefix: 'resume', name: 'Resume Builder', desc: 'Create professional resumes optimized for ATS', author: 'CareerPro', cat: 'writing', tags: ['resume','career','job'], icon: '👔' },
  { prefix: 'cover-letter', name: 'Cover Letter Pro', desc: 'Write compelling cover letters tailored to positions', author: 'CareerStudio', cat: 'writing', tags: ['cover-letter','career','job'], icon: '💼' },
  { prefix: 'copywrite', name: 'Copywriting Assistant', desc: 'Create persuasive copy for sales pages and ads', author: 'CopyHub', cat: 'writing', tags: ['copywriting','marketing','sales'], icon: '💬' },
  { prefix: 'whitepaper', name: 'Whitepaper Generator', desc: 'Generate whitepapers with research data and analysis', author: 'ResearchHub', cat: 'writing', tags: ['whitepaper','research','b2b'], icon: '📋' },
  { prefix: 'proofread', name: 'Proofreading Expert', desc: 'Grammar checking, spell verification, and style improvements', author: 'EditHub', cat: 'writing', tags: ['editing','grammar','proofreading'], icon: '✏️' },
  { prefix: 'grant', name: 'Grant Proposal Writer', desc: 'Write grant proposals with budget justification and methodology', author: 'GrantHub', cat: 'writing', tags: ['grants','proposals','funding'], icon: '💰' },
  { prefix: 'newsletter', name: 'Newsletter Creator', desc: 'Design and write email newsletters with engagement analytics', author: 'NewsHub', cat: 'writing', tags: ['newsletter','email','content'], icon: '📰' },
  { prefix: 'press', name: 'Press Release Writer', desc: 'Write press releases with AP style formatting', author: 'PressHub', cat: 'writing', tags: ['press','pr','media'], icon: '📣' },
  { prefix: 'script', name: 'Script Writer', desc: 'Write scripts for videos, podcasts, and presentations', author: 'ScriptHub', cat: 'writing', tags: ['scripts','video','podcast'], icon: '🎬' },
  { prefix: 'translate', name: 'Translation Assistant', desc: 'Translate and localize content across 50+ languages', author: 'TranslateHub', cat: 'writing', tags: ['translation','localization','languages'], icon: '🌍' },

  // ── DATA (70+) ──
  { prefix: 'sql-build', name: 'SQL Query Builder', desc: 'Generate optimized SQL queries with joins and indexes', author: 'DataHub', cat: 'data', tags: ['sql','database','queries'], icon: '🔍' },
  { prefix: 'data-viz', name: 'Data Visualization', desc: 'Create charts, graphs, and interactive dashboards', author: 'VizHub', cat: 'data', tags: ['visualization','charts','dashboards'], icon: '📊' },
  { prefix: 'csv-analyze', name: 'CSV Analyzer', desc: 'Parse and analyze CSV files with statistical insights', author: 'DataTools', cat: 'data', tags: ['csv','data','analysis'], icon: '📄' },
  { prefix: 'json-transform', name: 'JSON Transformer', desc: 'Transform JSON data structures with path expressions', author: 'JSONHub', cat: 'data', tags: ['json','transformation','data'], icon: '📦' },
  { prefix: 'stats', name: 'Statistical Analysis', desc: 'Perform statistical tests, distributions, and predictions', author: 'StatLabs', cat: 'data', tags: ['statistics','analysis','math'], icon: '📈' },
  { prefix: 'pipeline', name: 'Data Pipeline Builder', desc: 'Design ETL data pipelines with validation steps', author: 'PipelineHub', cat: 'data', tags: ['etl','pipeline','data'], icon: '🔄' },
  { prefix: 'dashboard', name: 'Dashboard Creator', desc: 'Build interactive dashboards with real-time updates', author: 'DashHub', cat: 'data', tags: ['dashboard','visualization','data'], icon: '📊' },
  { prefix: 'report-gen', name: 'Report Generator', desc: 'Generate reports with charts, tables, and summaries', author: 'ReportHub', cat: 'data', tags: ['reporting','data','analysis'], icon: '📑' },
  { prefix: 'ml-model', name: 'ML Model Trainer', desc: 'Train and evaluate machine learning models with scikit-learn', author: 'MLHub', cat: 'data', tags: ['ml','training','models'], icon: '🤖' },
  { prefix: 'nlp', name: 'NLP Toolkit', desc: 'Text classification, sentiment analysis, and entity extraction', author: 'NLPHub', cat: 'data', tags: ['nlp','text','sentiment'], icon: '🗣️' },
  { prefix: 'scraper', name: 'Web Scraper Builder', desc: 'Build web scrapers with pagination and rate limiting', author: 'ScraperHub', cat: 'data', tags: ['scraping','web','extraction'], icon: '🕷️' },
  { prefix: 'pandas', name: 'Pandas Expert', desc: 'Advanced pandas operations, merges, and time series', author: 'PandasHub', cat: 'data', tags: ['pandas','python','dataframes'], icon: '🐼' },
  { prefix: 'spark', name: 'Spark Pipeline Designer', desc: 'Design Apache Spark jobs for big data processing', author: 'SparkHub', cat: 'data', tags: ['spark','bigdata','distributed'], icon: '✨' },

  // ── AUTOMATION (60+) ──
  { prefix: 'cron', name: 'Cron Job Builder', desc: 'Create and manage cron expressions for scheduled tasks', author: 'TaskHub', cat: 'automation', tags: ['cron','scheduling','automation'], icon: '⏰' },
  { prefix: 'shell', name: 'Shell Script Generator', desc: 'Generate bash and shell scripts for system admin', author: 'ShellHub', cat: 'automation', tags: ['shell','bash','scripting'], icon: '💻' },
  { prefix: 'workflow', name: 'Workflow Automator', desc: 'Design complex automation workflows with conditional logic', author: 'AutoHub', cat: 'automation', tags: ['automation','workflow','logic'], icon: '🤖' },
  { prefix: 'deploy', name: 'Deployment Automator', desc: 'Automate deployment with rollback and health checks', author: 'DeployHub', cat: 'automation', tags: ['deployment','automation','devops'], icon: '🚀' },
  { prefix: 'monitor', name: 'Infrastructure Monitor', desc: 'Setup monitoring dashboards with alerting rules', author: 'MonitorHub', cat: 'automation', tags: ['monitoring','alerts','infrastructure'], icon: '📡' },
  { prefix: 'zapier', name: 'Integration Builder', desc: 'Build integrations between SaaS tools with webhooks', author: 'IntegHub', cat: 'automation', tags: ['integration','webhooks','saas'], icon: '🔗' },
  { prefix: 'ansible', name: 'Ansible Playbook Builder', desc: 'Generate Ansible playbooks for server provisioning', author: 'AnsibleHub', cat: 'automation', tags: ['ansible','provisioning','automation'], icon: '📜' },

  // ── PRODUCTIVITY (60+) ──
  { prefix: 'meeting', name: 'Meeting Notes', desc: 'Summarize meetings, extract action items, track decisions', author: 'ProductivityHub', cat: 'productivity', tags: ['meetings','notes','summarization'], icon: '📝' },
  { prefix: 'project', name: 'Project Planner', desc: 'Create project plans, timelines, and milestone tracking', author: 'PlanHub', cat: 'productivity', tags: ['planning','projects','management'], icon: '📋' },
  { prefix: 'sprint', name: 'Sprint Manager', desc: 'Manage agile sprints with burndown and velocity tracking', author: 'AgileLabs', cat: 'productivity', tags: ['agile','sprint','management'], icon: '🎯' },
  { prefix: 'kanban', name: 'Kanban Board Manager', desc: 'Create and manage Kanban boards with WIP limits', author: 'KanbanHub', cat: 'productivity', tags: ['kanban','board','workflow'], icon: '📌' },
  { prefix: 'okr', name: 'OKR Tracker', desc: 'Set and track Objectives and Key Results with progress scoring', author: 'OKRHub', cat: 'productivity', tags: ['okr','goals','tracking'], icon: '🎯' },
  { prefix: 'retro', name: 'Retrospective Facilitator', desc: 'Run structured team retrospectives with action items', author: 'RetroHub', cat: 'productivity', tags: ['retro','agile','team'], icon: '🔄' },

  // ── DESIGN (80+) ──
  { prefix: 'ui-gen', name: 'UI Component Generator', desc: 'Generate accessible UI components with design tokens', author: 'DesignHub', cat: 'design', tags: ['ui','components','accessibility'], icon: '🎨' },
  { prefix: 'color', name: 'Color Palette Generator', desc: 'Generate harmonious color palettes with accessibility contrast', author: 'ColorHub', cat: 'design', tags: ['colors','palette','accessibility'], icon: '🌈' },
  { prefix: 'figma', name: 'Figma to Code', desc: 'Convert Figma designs to React, Vue, or HTML/CSS', author: 'FigmaHub', cat: 'design', tags: ['figma','conversion','code'], icon: '🖼️' },
  { prefix: 'icon-gen', name: 'Icon Set Generator', desc: 'Generate consistent icon sets in SVG and PNG formats', author: 'IconHub', cat: 'design', tags: ['icons','svg','design'], icon: '✨' },
  { prefix: 'wireframe', name: 'Wireframe Builder', desc: 'Create wireframes and mockups with component libraries', author: 'WireframeHub', cat: 'design', tags: ['wireframe','mockup','prototyping'], icon: '📐' },
  { prefix: 'animation', name: 'CSS Animation Builder', desc: 'Create CSS animations and transitions with keyframes', author: 'AnimHub', cat: 'design', tags: ['animation','css','motion'], icon: '🎭' },
  { prefix: 'responsive', name: 'Responsive Layout Expert', desc: 'Design responsive layouts with flexbox and grid', author: 'LayoutHub', cat: 'design', tags: ['responsive','layout','css'], icon: '📱' },
  { prefix: 'a11y', name: 'Accessibility Checker', desc: 'Audit and fix WCAG 2.1 accessibility issues', author: 'A11yHub', cat: 'design', tags: ['accessibility','wcag','audit'], icon: '♿' },
  { prefix: 'theme-gen', name: 'Theme Generator', desc: 'Generate complete design system themes with tokens', author: 'ThemeHub', cat: 'design', tags: ['theme','tokens','design-system'], icon: '🎪' },
  { prefix: 'typography', name: 'Typography Expert', desc: 'Font pairing, scale systems, and typographic hierarchy', author: 'TypeHub', cat: 'design', tags: ['typography','fonts','hierarchy'], icon: '🔤' },

  // ── DEVOPS (70+) ──
  { prefix: 'aws-gen', name: 'AWS CloudFormation Builder', desc: 'Generate CloudFormation templates for AWS infrastructure', author: 'AWSHub', cat: 'devops', tags: ['aws','cloudformation','infrastructure'], icon: '☁️' },
  { prefix: 'gcp-gen', name: 'GCP Deployment Manager', desc: 'Generate GCP deployment configs and Cloud Run services', author: 'GCPHub', cat: 'devops', tags: ['gcp','cloud','deployment'], icon: '🌐' },
  { prefix: 'azure-gen', name: 'Azure ARM Templates', desc: 'Build Azure Resource Manager templates and Bicep files', author: 'AzureHub', cat: 'devops', tags: ['azure','arm','cloud'], icon: '🔵' },
  { prefix: 'nginx', name: 'Nginx Config Builder', desc: 'Generate Nginx configs with SSL, proxying, and caching', author: 'NginxHub', cat: 'devops', tags: ['nginx','config','proxy'], icon: '🟢' },
  { prefix: 'github-actions', name: 'GitHub Actions Builder', desc: 'Build complex GitHub Actions workflows with matrices', author: 'ActionsHub', cat: 'devops', tags: ['github','actions','ci'], icon: '🐙' },
  { prefix: 'prometheus', name: 'Prometheus Rules Builder', desc: 'Create Prometheus alerting and recording rules', author: 'PrometheusHub', cat: 'devops', tags: ['prometheus','monitoring','alerts'], icon: '🔥' },
  { prefix: 'grafana', name: 'Grafana Dashboard Builder', desc: 'Design Grafana dashboards with panels and queries', author: 'GrafanaHub', cat: 'devops', tags: ['grafana','dashboards','monitoring'], icon: '📊' },

  // ── SECURITY (60+) ──
  { prefix: 'owasp', name: 'OWASP Top 10 Scanner', desc: 'Scan for OWASP Top 10 vulnerabilities in web applications', author: 'SecHub', cat: 'security', tags: ['owasp','vulnerabilities','web'], icon: '🛡️' },
  { prefix: 'pen-test', name: 'Penetration Test Planner', desc: 'Plan and document penetration testing methodologies', author: 'PenTestHub', cat: 'security', tags: ['pentest','security','testing'], icon: '🎯' },
  { prefix: 'encrypt', name: 'Encryption Advisor', desc: 'Choose and implement encryption algorithms and key management', author: 'CryptoHub', cat: 'security', tags: ['encryption','crypto','keys'], icon: '🔐' },
  { prefix: 'soc2', name: 'SOC 2 Compliance Helper', desc: 'Document SOC 2 controls and prepare for audits', author: 'ComplianceHub', cat: 'security', tags: ['soc2','compliance','audit'], icon: '📋' },
  { prefix: 'threat-model', name: 'Threat Modeling', desc: 'Create STRIDE threat models for application security', author: 'ThreatHub', cat: 'security', tags: ['threat','modeling','stride'], icon: '⚔️' },
  { prefix: 'iam', name: 'IAM Policy Builder', desc: 'Generate least-privilege IAM policies for AWS, GCP, Azure', author: 'IAMHub', cat: 'security', tags: ['iam','policies','access'], icon: '🔑' },

  // ── FINANCE (60+) ──
  { prefix: 'budget', name: 'Budget Planner', desc: 'Create and manage budgets with forecasting and variance analysis', author: 'FinanceHub', cat: 'finance', tags: ['budget','planning','forecast'], icon: '💰' },
  { prefix: 'invoice', name: 'Invoice Generator', desc: 'Generate professional invoices with tax calculations', author: 'InvoiceHub', cat: 'finance', tags: ['invoice','billing','tax'], icon: '🧾' },
  { prefix: 'expense', name: 'Expense Tracker', desc: 'Track and categorize expenses with reporting', author: 'ExpenseHub', cat: 'finance', tags: ['expenses','tracking','reports'], icon: '💳' },
  { prefix: 'roi-calc', name: 'ROI Calculator', desc: 'Calculate return on investment with scenario modeling', author: 'ROIHub', cat: 'finance', tags: ['roi','investment','analysis'], icon: '📈' },
  { prefix: 'tax-prep', name: 'Tax Preparation Assistant', desc: 'Organize tax documents and calculate deductions', author: 'TaxHub', cat: 'finance', tags: ['tax','deductions','compliance'], icon: '📊' },
  { prefix: 'financial-model', name: 'Financial Modeling', desc: 'Build DCF, LBO, and comparable company analysis models', author: 'ModelHub', cat: 'finance', tags: ['modeling','dcf','valuation'], icon: '🏦' },

  // ── MARKETING (70+) ──
  { prefix: 'campaign', name: 'Campaign Manager', desc: 'Plan and track marketing campaigns across channels', author: 'MarketHub', cat: 'marketing', tags: ['campaign','planning','channels'], icon: '📢' },
  { prefix: 'ab-test', name: 'A/B Test Designer', desc: 'Design A/B tests with statistical significance calculations', author: 'ABHub', cat: 'marketing', tags: ['ab-test','experiments','statistics'], icon: '🔬' },
  { prefix: 'keyword', name: 'Keyword Research Tool', desc: 'Find high-value keywords with competition analysis', author: 'KeywordHub', cat: 'marketing', tags: ['keywords','seo','research'], icon: '🔎' },
  { prefix: 'funnel', name: 'Marketing Funnel Builder', desc: 'Design conversion funnels with optimization suggestions', author: 'FunnelHub', cat: 'marketing', tags: ['funnel','conversion','optimization'], icon: '📊' },
  { prefix: 'persona', name: 'Buyer Persona Creator', desc: 'Build detailed buyer personas from market research', author: 'PersonaHub', cat: 'marketing', tags: ['persona','research','targeting'], icon: '👤' },
  { prefix: 'brand-voice', name: 'Brand Voice Guide', desc: 'Define and maintain consistent brand voice across content', author: 'BrandHub', cat: 'marketing', tags: ['brand','voice','consistency'], icon: '🎤' },

  // ── LEGAL (50+) ──
  { prefix: 'contract-review', name: 'Contract Reviewer', desc: 'Review contracts for risk clauses and missing terms', author: 'LegalHub', cat: 'legal', tags: ['contracts','review','risk'], icon: '📜' },
  { prefix: 'nda-gen', name: 'NDA Generator', desc: 'Generate non-disclosure agreements with custom clauses', author: 'NDAHub', cat: 'legal', tags: ['nda','agreements','confidentiality'], icon: '🤝' },
  { prefix: 'privacy', name: 'Privacy Policy Generator', desc: 'Generate GDPR and CCPA compliant privacy policies', author: 'PrivacyHub', cat: 'legal', tags: ['privacy','gdpr','ccpa'], icon: '🔏' },
  { prefix: 'tos-gen', name: 'Terms of Service Builder', desc: 'Create terms of service with liability and usage clauses', author: 'TOSHub', cat: 'legal', tags: ['tos','terms','legal'], icon: '📋' },
  { prefix: 'ip-protect', name: 'IP Protection Guide', desc: 'Intellectual property strategy and filing guidance', author: 'IPHub', cat: 'legal', tags: ['ip','patents','trademarks'], icon: '©️' },

  // ── EDUCATION (50+) ──
  { prefix: 'lesson-plan', name: 'Lesson Plan Creator', desc: 'Create structured lesson plans with learning objectives', author: 'EduHub', cat: 'education', tags: ['lessons','teaching','curriculum'], icon: '🎓' },
  { prefix: 'quiz-gen', name: 'Quiz Generator', desc: 'Generate quizzes and assessments with answer keys', author: 'QuizHub', cat: 'education', tags: ['quiz','assessment','testing'], icon: '❓' },
  { prefix: 'flashcard', name: 'Flashcard Creator', desc: 'Create spaced-repetition flashcard sets', author: 'FlashHub', cat: 'education', tags: ['flashcards','learning','memory'], icon: '🃏' },
  { prefix: 'rubric', name: 'Rubric Builder', desc: 'Create grading rubrics with criteria and scoring', author: 'RubricHub', cat: 'education', tags: ['rubric','grading','assessment'], icon: '📝' },
  { prefix: 'syllabus', name: 'Syllabus Generator', desc: 'Build course syllabi with schedules and objectives', author: 'SyllabusHub', cat: 'education', tags: ['syllabus','course','curriculum'], icon: '📖' },

  // ── RESEARCH (50+) ──
  { prefix: 'lit-review', name: 'Literature Review', desc: 'Synthesize research papers into structured literature reviews', author: 'ResearchHub', cat: 'research', tags: ['literature','review','papers'], icon: '📚' },
  { prefix: 'citation', name: 'Citation Manager', desc: 'Format citations in APA, MLA, Chicago, and IEEE styles', author: 'CitationHub', cat: 'research', tags: ['citation','references','formatting'], icon: '📎' },
  { prefix: 'survey', name: 'Survey Designer', desc: 'Design research surveys with question logic and analysis', author: 'SurveyHub', cat: 'research', tags: ['survey','research','analysis'], icon: '📋' },
  { prefix: 'hypothesis', name: 'Hypothesis Tester', desc: 'Design and analyze hypothesis tests with p-values', author: 'HypothesisHub', cat: 'research', tags: ['hypothesis','statistics','testing'], icon: '🧪' },
  { prefix: 'paper-write', name: 'Research Paper Writer', desc: 'Structure and write academic papers with proper formatting', author: 'PaperHub', cat: 'research', tags: ['paper','academic','writing'], icon: '📄' },

  // ── COMMUNICATION (50+) ──
  { prefix: 'presentation', name: 'Presentation Builder', desc: 'Create compelling presentations with storyline structure', author: 'PresentHub', cat: 'communication', tags: ['presentations','slides','storytelling'], icon: '📊' },
  { prefix: 'pitch-deck', name: 'Pitch Deck Creator', desc: 'Build investor pitch decks with financial projections', author: 'PitchHub', cat: 'communication', tags: ['pitch','investors','startup'], icon: '🚀' },
  { prefix: 'speech', name: 'Speech Writer', desc: 'Write speeches with rhetoric and audience engagement', author: 'SpeechHub', cat: 'communication', tags: ['speech','rhetoric','audience'], icon: '🎤' },
  { prefix: 'conflict', name: 'Conflict Resolution', desc: 'Mediation frameworks and communication strategies', author: 'ConflictHub', cat: 'communication', tags: ['conflict','mediation','communication'], icon: '🤝' },
  { prefix: 'feedback', name: 'Feedback Coach', desc: 'Write constructive feedback with the SBI framework', author: 'FeedbackHub', cat: 'communication', tags: ['feedback','coaching','leadership'], icon: '💬' },

  // ── HEALTHCARE (40+) ──
  { prefix: 'patient-notes', name: 'Clinical Notes Writer', desc: 'Generate structured SOAP notes and clinical summaries', author: 'HealthHub', cat: 'healthcare', tags: ['clinical','notes','soap'], icon: '🏥' },
  { prefix: 'drug-interact', name: 'Drug Interaction Checker', desc: 'Check drug interactions and contraindications', author: 'PharmHub', cat: 'healthcare', tags: ['drugs','interactions','safety'], icon: '💊' },
  { prefix: 'icd-code', name: 'ICD-10 Code Finder', desc: 'Search and validate ICD-10 diagnosis codes', author: 'CodingHub', cat: 'healthcare', tags: ['icd10','coding','diagnosis'], icon: '🔢' },
  { prefix: 'care-plan', name: 'Care Plan Builder', desc: 'Create patient care plans with goals and interventions', author: 'CarePlanHub', cat: 'healthcare', tags: ['care-plan','patient','interventions'], icon: '📋' },
]

// ── Dynamic Catalog Generation ──────────────────────────────────────────────
// Generate variations from templates to reach 1000+ skills.
// Each template spawns multiple variants (Pro, Advanced, Enterprise, etc.)

const VARIANTS = [
  { suffix: 'pro', label: 'Pro', descAdd: ' with advanced features and team collaboration', ratingBoost: 0.1, dlMul: 1.4 },
  { suffix: 'enterprise', label: 'Enterprise', descAdd: ' for enterprise with SSO, audit logs, and compliance', ratingBoost: 0.05, dlMul: 2.1 },
  { suffix: 'lite', label: 'Lite', descAdd: ' - lightweight version for quick tasks', ratingBoost: -0.1, dlMul: 0.8 },
  { suffix: 'ai', label: 'AI-Powered', descAdd: ' enhanced with AI suggestions and auto-completion', ratingBoost: 0.15, dlMul: 1.8 },
  { suffix: 'team', label: 'Team Edition', descAdd: ' with real-time collaboration and shared workspaces', ratingBoost: 0.05, dlMul: 1.2 },
  { suffix: 'cloud', label: 'Cloud', descAdd: ' with cloud sync and cross-device access', ratingBoost: 0, dlMul: 1.3 },
  { suffix: 'v2', label: 'v2', descAdd: ' - next generation with improved accuracy and speed', ratingBoost: 0.1, dlMul: 1.5 },
]

function generateCatalog(): Partial<MarketplaceSkill>[] {
  const catalog: Partial<MarketplaceSkill>[] = []

  for (const tpl of SKILL_TEMPLATES) {
    // Add the base template as-is
    const baseHash = seedHash(tpl.prefix)
    const baseDl = 15000 + (baseHash % 45000)
    const baseRating = 3.8 + ((baseHash % 12) / 10)
    const baseVer = `${1 + (baseHash % 4)}.${baseHash % 10}.${baseHash % 8}`

    catalog.push({
      id: tpl.prefix,
      name: tpl.name,
      description: tpl.desc,
      author: tpl.author,
      version: baseVer,
      category: tpl.cat,
      downloads: baseDl,
      rating: Math.min(5, Math.round(baseRating * 10) / 10),
      tags: tpl.tags,
      icon: tpl.icon,
    })

    // Generate variants
    for (const v of VARIANTS) {
      const vHash = seedHash(`${tpl.prefix}-${v.suffix}`)
      const vDl = Math.round(baseDl * v.dlMul)
      const vRating = Math.min(5, Math.round((baseRating + v.ratingBoost) * 10) / 10)
      const vVer = `${1 + (vHash % 5)}.${vHash % 10}.${vHash % 9}`

      catalog.push({
        id: `${tpl.prefix}-${v.suffix}`,
        name: `${tpl.name} ${v.label}`,
        description: tpl.desc + v.descAdd,
        author: tpl.author,
        version: vVer,
        category: tpl.cat,
        downloads: vDl,
        rating: vRating,
        tags: [...tpl.tags, v.suffix],
        icon: tpl.icon,
      })
    }
  }

  return catalog
}

const MARKETPLACE_CATALOG_RAW = generateCatalog()
// Validate all skills through sanitization layer
const MARKETPLACE_CATALOG: MarketplaceSkill[] = MARKETPLACE_CATALOG_RAW
  .map(s => sanitizeSkill(s))
  .filter((s): s is MarketplaceSkill => s !== null)

// Update safety stats
SKILL_SAFETY_STATS = {
  total: MARKETPLACE_CATALOG_RAW.length,
  passed: MARKETPLACE_CATALOG.length,
  rejected: MARKETPLACE_CATALOG_RAW.length - MARKETPLACE_CATALOG.length,
  lastValidated: new Date().toISOString(),
}

// ── Registry helpers ───────────────────────────────────────────────────────
function readRegistry(): SkillRegistry {
  if (!fs.existsSync(SKILLS_REGISTRY_PATH)) {
    return { installed: {} }
  }
  try {
    return JSON.parse(fs.readFileSync(SKILLS_REGISTRY_PATH, 'utf8')) as SkillRegistry
  } catch {
    return { installed: {} }
  }
}

function writeRegistry(registry: SkillRegistry): void {
  const dir = path.dirname(SKILLS_REGISTRY_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(SKILLS_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8')
}

// ── Public API ─────────────────────────────────────────────────────────────

export function browseSkills(query?: string, category?: string): MarketplaceSkill[] {
  let skills = [...MARKETPLACE_CATALOG]

  const registry = readRegistry()

  skills = skills.map(skill => ({
    ...skill,
    installedLocally: !!registry.installed[skill.id],
  }))

  if (query) {
    const q = query.toLowerCase()
    skills = skills.filter(
      s => s.name.toLowerCase().includes(q) || 
           s.description.toLowerCase().includes(q) ||
           s.tags.some(tag => tag.toLowerCase().includes(q))
    )
  }

  if (category) {
    skills = skills.filter(s => s.category === category)
  }

  return skills
}

// Escape markdown special characters to prevent template injection
function escapeMarkdown(text: string): string {
  return text
    .replace(/[\\`*_{}[\]()#+\-.!|~>]/g, '\\$&')
    .replace(/\n/g, ' ')
}

export function installSkill(skillId: string): void {
  // ── Validate skillId format (alphanumeric + hyphens only) ──
  if (!/^[a-z0-9][a-z0-9\-]{0,60}$/.test(skillId)) {
    throw new Error(`Invalid skill ID format: ${skillId}`)
  }

  const skill = MARKETPLACE_CATALOG.find(s => s.id === skillId)
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`)
  }

  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true })
  }

  const skillPath = path.join(SKILLS_DIR, skillId)

  // ── Path traversal protection: resolved path must stay within SKILLS_DIR ──
  const resolvedSkillPath = path.resolve(skillPath)
  const resolvedSkillsDir = path.resolve(SKILLS_DIR)
  if (!resolvedSkillPath.startsWith(resolvedSkillsDir + path.sep)) {
    throw new Error(`Path traversal detected for skill: ${skillId}`)
  }

  const skillMdPath = path.join(resolvedSkillPath, 'SKILL.md')

  if (!fs.existsSync(resolvedSkillPath)) {
    fs.mkdirSync(resolvedSkillPath, { recursive: true })
  }

  // ── Escape all interpolated values to prevent markdown/HTML injection ──
  const safeName = escapeMarkdown(skill.name)
  const safeAuthor = escapeMarkdown(skill.author)
  const safeVersion = escapeMarkdown(skill.version)
  const safeCategory = escapeMarkdown(skill.category)
  const safeDescription = escapeMarkdown(skill.description)
  const safeTags = skill.tags.map(t => escapeMarkdown(t))

  const template = `# ${safeName}

**Author:** ${safeAuthor}
**Version:** ${safeVersion}
**Category:** ${safeCategory}

## Description

${safeDescription}

## Usage

This skill provides the following capabilities:

${safeTags.map(tag => `- **${tag}**: `).join('\n')}

## Tags

${safeTags.join(', ')}

---

*Generated from Skills Marketplace*
`

  fs.writeFileSync(skillMdPath, template, 'utf8')

  const registry = readRegistry()
  registry.installed[skillId] = {
    version: skill.version,
    installedAt: Date.now(),
    enabled: true,
  }
  writeRegistry(registry)
}

export function removeSkill(skillId: string): void {
  // ── Validate skillId format ──
  if (!/^[a-z0-9][a-z0-9\-]{0,60}$/.test(skillId)) {
    throw new Error(`Invalid skill ID format: ${skillId}`)
  }

  const skillPath = path.join(SKILLS_DIR, skillId)

  // ── Path traversal protection ──
  const resolvedSkillPath = path.resolve(skillPath)
  const resolvedSkillsDir = path.resolve(SKILLS_DIR)
  if (!resolvedSkillPath.startsWith(resolvedSkillsDir + path.sep)) {
    throw new Error(`Path traversal detected for skill: ${skillId}`)
  }

  if (fs.existsSync(resolvedSkillPath)) {
    fs.rmSync(resolvedSkillPath, { recursive: true, force: true })
  }

  const registry = readRegistry()
  delete registry.installed[skillId]
  writeRegistry(registry)
}

export function getInstalledSkills(): Array<MarketplaceSkill & { enabled: boolean }> {
  const registry = readRegistry()
  const installed: Array<MarketplaceSkill & { enabled: boolean }> = []

  for (const skillId of Object.keys(registry.installed)) {
    const skill = MARKETPLACE_CATALOG.find(s => s.id === skillId)
    if (skill) {
      const regEntry = registry.installed[skillId]
      installed.push({
        ...skill,
        installedLocally: true,
        enabled: regEntry.enabled,
      })
    }
  }

  return installed
}

export function enableSkill(skillId: string): void {
  const registry = readRegistry()
  if (registry.installed[skillId]) {
    registry.installed[skillId].enabled = true
    writeRegistry(registry)
  }
}

export function disableSkill(skillId: string): void {
  const registry = readRegistry()
  if (registry.installed[skillId]) {
    registry.installed[skillId].enabled = false
    writeRegistry(registry)
  }
}
