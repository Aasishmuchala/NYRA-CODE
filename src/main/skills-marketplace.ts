/**
 * Skills Marketplace Manager
 *
 * Manages the skills marketplace, installation, and registry.
 * Acts as the backend for the Skills Marketplace UI component.
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
  category: 'coding' | 'writing' | 'data' | 'automation' | 'productivity' | 'other'
  downloads: number
  rating: number  // 0-5
  tags: string[]
  icon?: string   // emoji
  installedLocally?: boolean
}

export interface SkillRegistry {
  installed: Record<string, { version: string; installedAt: number; enabled: boolean }>
}

// ── Paths ──────────────────────────────────────────────────────────────────
export const SKILLS_DIR = path.join(app.getPath('userData'), 'openclaw-skills')
export const SKILLS_REGISTRY_PATH = path.join(app.getPath('userData'), 'nyra_skills_registry.json')

// ── Hardcoded Marketplace Catalog ──────────────────────────────────────────
const MARKETPLACE_CATALOG: MarketplaceSkill[] = [
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Advanced code analysis with performance and security insights',
    author: 'ClawHub',
    version: '1.2.0',
    category: 'coding',
    downloads: 12450,
    rating: 4.8,
    tags: ['review', 'quality', 'security'],
    icon: '🔍',
  },
  {
    id: 'sql-query-builder',
    name: 'SQL Query Builder',
    description: 'Generate optimized SQL queries with explainers',
    author: 'DataWorks',
    version: '2.1.0',
    category: 'data',
    downloads: 8920,
    rating: 4.6,
    tags: ['sql', 'database', 'queries'],
    icon: '🗄️',
  },
  {
    id: 'git-commits',
    name: 'Git Commit Messages',
    description: 'Generate conventional commit messages automatically',
    author: 'DevTools Inc',
    version: '1.5.0',
    category: 'coding',
    downloads: 15670,
    rating: 4.9,
    tags: ['git', 'commits', 'automation'],
    icon: '📝',
  },
  {
    id: 'api-docs',
    name: 'API Documentation',
    description: 'Generate and maintain API documentation with examples',
    author: 'DocGen',
    version: '2.0.0',
    category: 'productivity',
    downloads: 7340,
    rating: 4.7,
    tags: ['documentation', 'api', 'openapi'],
    icon: '📚',
  },
  {
    id: 'data-visualization',
    name: 'Data Visualization',
    description: 'Create charts, graphs, and interactive visualizations',
    author: 'VisualHub',
    version: '3.2.1',
    category: 'data',
    downloads: 9870,
    rating: 4.5,
    tags: ['charts', 'viz', 'analysis'],
    icon: '📊',
  },
  {
    id: 'email-drafter',
    name: 'Email Drafter',
    description: 'Draft professional emails with tone adjustments',
    author: 'WriteAssist',
    version: '1.8.0',
    category: 'writing',
    downloads: 11230,
    rating: 4.4,
    tags: ['email', 'writing', 'communication'],
    icon: '✉️',
  },
  {
    id: 'bug-analyzer',
    name: 'Bug Report Analyzer',
    description: 'Analyze and categorize bug reports intelligently',
    author: 'QATools',
    version: '1.3.0',
    category: 'coding',
    downloads: 6540,
    rating: 4.6,
    tags: ['bugs', 'qa', 'testing'],
    icon: '🐛',
  },
  {
    id: 'regex-helper',
    name: 'Regex Helper',
    description: 'Build and test regex patterns with explanations',
    author: 'DevTools Inc',
    version: '2.4.0',
    category: 'coding',
    downloads: 13420,
    rating: 4.7,
    tags: ['regex', 'patterns', 'validation'],
    icon: '🔢',
  },
  {
    id: 'docker-compose-gen',
    name: 'Docker Compose Generator',
    description: 'Generate docker-compose files for common stacks',
    author: 'ContainerLab',
    version: '1.9.0',
    category: 'automation',
    downloads: 8760,
    rating: 4.5,
    tags: ['docker', 'compose', 'devops'],
    icon: '🐳',
  },
  {
    id: 'python-debugger',
    name: 'Python Debugger',
    description: 'Debug Python code with step-through analysis',
    author: 'PyTools',
    version: '2.2.0',
    category: 'coding',
    downloads: 9340,
    rating: 4.6,
    tags: ['python', 'debugging', 'testing'],
    icon: '🐍',
  },
  {
    id: 'react-builder',
    name: 'React Component Builder',
    description: 'Generate React components with hooks and state',
    author: 'ReactHub',
    version: '3.1.0',
    category: 'coding',
    downloads: 14560,
    rating: 4.8,
    tags: ['react', 'components', 'frontend'],
    icon: '⚛️',
  },
  {
    id: 'test-writer',
    name: 'Test Writer',
    description: 'Auto-generate unit tests for your code',
    author: 'TestGen',
    version: '1.6.0',
    category: 'coding',
    downloads: 10230,
    rating: 4.7,
    tags: ['testing', 'jest', 'unit-tests'],
    icon: '✅',
  },
  {
    id: 'perf-profiler',
    name: 'Performance Profiler',
    description: 'Identify and optimize performance bottlenecks',
    author: 'PerfTools',
    version: '2.3.0',
    category: 'coding',
    downloads: 7890,
    rating: 4.5,
    tags: ['performance', 'optimization', 'profiling'],
    icon: '⚡',
  },
  {
    id: 'security-auditor',
    name: 'Security Auditor',
    description: 'Scan code for security vulnerabilities and best practices',
    author: 'SecureHub',
    version: '2.0.0',
    category: 'coding',
    downloads: 12340,
    rating: 4.9,
    tags: ['security', 'audit', 'vulnerability'],
    icon: '🔒',
  },
  {
    id: 'markdown-formatter',
    name: 'Markdown Formatter',
    description: 'Format and validate Markdown documents',
    author: 'MarkdownLab',
    version: '1.4.0',
    category: 'writing',
    downloads: 8560,
    rating: 4.6,
    tags: ['markdown', 'formatting', 'documentation'],
    icon: '📄',
  },
]

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
  // Ensure directory exists
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

  // Add installedLocally flag
  skills = skills.map(skill => ({
    ...skill,
    installedLocally: !!registry.installed[skill.id],
  }))

  // Filter by query
  if (query) {
    const q = query.toLowerCase()
    skills = skills.filter(
      s => s.name.toLowerCase().includes(q) || 
           s.description.toLowerCase().includes(q) ||
           s.tags.some(tag => tag.toLowerCase().includes(q))
    )
  }

  // Filter by category
  if (category) {
    skills = skills.filter(s => s.category === category)
  }

  return skills
}

export function installSkill(skillId: string): void {
  const skill = MARKETPLACE_CATALOG.find(s => s.id === skillId)
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`)
  }

  // Ensure SKILLS_DIR exists
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true })
  }

  const skillPath = path.join(SKILLS_DIR, skillId)
  const skillMdPath = path.join(skillPath, 'SKILL.md')

  // Create skill directory
  if (!fs.existsSync(skillPath)) {
    fs.mkdirSync(skillPath, { recursive: true })
  }

  // Generate template SKILL.md
  const template = `# ${skill.name}

**Author:** ${skill.author}  
**Version:** ${skill.version}  
**Category:** ${skill.category}

## Description

${skill.description}

## Usage

This skill provides the following capabilities:

${skill.tags.map(tag => `- **${tag}**: `).join('\n')}

## Tags

${skill.tags.join(', ')}

---

*Generated from Skills Marketplace*
`

  fs.writeFileSync(skillMdPath, template, 'utf8')

  // Update registry
  const registry = readRegistry()
  registry.installed[skillId] = {
    version: skill.version,
    installedAt: Date.now(),
    enabled: true,
  }
  writeRegistry(registry)
}

export function removeSkill(skillId: string): void {
  const skillPath = path.join(SKILLS_DIR, skillId)

  // Remove directory
  if (fs.existsSync(skillPath)) {
    fs.rmSync(skillPath, { recursive: true, force: true })
  }

  // Update registry
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
