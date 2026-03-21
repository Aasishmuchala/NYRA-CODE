/**
 * Agent Store — Persistent SQLite storage for custom agents
 * Handles CRUD operations and performance tracking
 */

import path from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import type {
  CustomAgentDefinition,
  AgentLearningProfile,
  AgentPerformanceMetrics,
} from './agent-interface'

/**
 * Agent Store for persistent custom agent storage
 */
export class AgentStore {
  private db: Database.Database
  private dbPath: string

  /**
   * Initialize the store and create tables if needed
   */
  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'nyra_agents.db')
    this.db = new Database(this.dbPath)
    this.initializeTables()
  }

  /**
   * Create tables if they don't exist
   */
  private initializeTables(): void {
    // Custom agents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS custom_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        description TEXT NOT NULL,
        systemPrompt TEXT NOT NULL,
        preferredModel TEXT NOT NULL,
        fallbackModel TEXT NOT NULL,
        isBuiltIn INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        createdBy TEXT NOT NULL,
        templateId TEXT,
        templateVersion TEXT,
        icon TEXT,
        definition TEXT NOT NULL
      )
    `)

    // Agent templates user saved
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        isOfficial INTEGER NOT NULL DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        savedAt INTEGER NOT NULL
      )
    `)

    // Agent performance metrics
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agentId TEXT NOT NULL,
        period TEXT NOT NULL,
        tasksCompleted INTEGER DEFAULT 0,
        tasksFailed INTEGER DEFAULT 0,
        avgResponseTime INTEGER DEFAULT 0,
        avgTokensUsed INTEGER DEFAULT 0,
        userSatisfaction REAL DEFAULT 0,
        costEstimate REAL DEFAULT 0,
        recordedAt INTEGER NOT NULL,
        FOREIGN KEY (agentId) REFERENCES custom_agents(id)
      )
    `)

    // Agent runs history
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agentId TEXT NOT NULL,
        success INTEGER NOT NULL,
        tokensUsed INTEGER,
        latencyMs INTEGER,
        executedAt INTEGER NOT NULL,
        FOREIGN KEY (agentId) REFERENCES custom_agents(id)
      )
    `)

    // Create indices for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agents_role ON custom_agents(role);
      CREATE INDEX IF NOT EXISTS idx_agents_isBuiltIn ON custom_agents(isBuiltIn);
      CREATE INDEX IF NOT EXISTS idx_performance_agent ON agent_performance(agentId);
      CREATE INDEX IF NOT EXISTS idx_runs_agent ON agent_runs(agentId);
    `)
  }

  /**
   * Save a custom agent to the store
   * @param agent Agent to save
   */
  saveAgent(agent: CustomAgentDefinition): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO custom_agents (
        id, name, role, description, systemPrompt, preferredModel,
        fallbackModel, isBuiltIn, createdAt, updatedAt, createdBy,
        templateId, templateVersion, icon, definition
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      agent.id,
      agent.name,
      agent.role,
      agent.description,
      agent.systemPrompt,
      agent.preferredModel,
      agent.fallbackModel,
      agent.isBuiltIn ? 1 : 0,
      agent.createdAt,
      agent.updatedAt,
      agent.createdBy,
      agent.templateId || null,
      agent.templateVersion || null,
      agent.icon || null,
      JSON.stringify(agent),
    )
  }

  /**
   * Get an agent by ID
   * @param agentId Agent ID
   * @returns Agent or undefined if not found
   */
  getAgent(agentId: string): CustomAgentDefinition | undefined {
    const stmt = this.db.prepare('SELECT definition FROM custom_agents WHERE id = ?')
    const row = stmt.get(agentId) as any
    if (!row) return undefined
    return JSON.parse(row.definition) as CustomAgentDefinition
  }

  /**
   * List all custom agents with optional filters
   * @param filters Optional filter criteria
   * @returns Array of agents
   */
  listAgents(filters?: {
    isBuiltIn?: boolean
    role?: string
    tags?: string[]
    search?: string
  }): CustomAgentDefinition[] {
    let query = 'SELECT definition FROM custom_agents WHERE 1=1'
    const params: any[] = []

    if (filters?.isBuiltIn !== undefined) {
      query += ' AND isBuiltIn = ?'
      params.push(filters.isBuiltIn ? 1 : 0)
    }

    if (filters?.role) {
      query += ' AND role = ?'
      params.push(filters.role)
    }

    if (filters?.search) {
      query += ' AND (name LIKE ? OR description LIKE ?)'
      const searchTerm = `%${filters.search}%`
      params.push(searchTerm, searchTerm)
    }

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as any[]

    let agents = rows.map(r => JSON.parse(r.definition) as CustomAgentDefinition)

    // Filter by tags if provided
    if (filters?.tags && filters.tags.length > 0) {
      agents = agents.filter(agent =>
        filters.tags!.some(tag => agent.tags.includes(tag)),
      )
    }

    return agents
  }

  /**
   * Update an agent
   * @param agentId Agent ID
   * @param updates Fields to update
   */
  updateAgent(agentId: string, updates: Partial<CustomAgentDefinition>): void {
    const agent = this.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    const updated: CustomAgentDefinition = {
      ...agent,
      ...updates,
      updatedAt: Date.now(),
    }

    this.saveAgent(updated)
  }

  /**
   * Delete an agent
   * @param agentId Agent ID
   */
  deleteAgent(agentId: string): void {
    const agent = this.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }
    if (agent.isBuiltIn) {
      throw new Error(`Cannot delete built-in agent: ${agentId}`)
    }

    const stmt = this.db.prepare('DELETE FROM custom_agents WHERE id = ?')
    stmt.run(agentId)

    // Clean up runs
    const cleanStmt = this.db.prepare('DELETE FROM agent_runs WHERE agentId = ?')
    cleanStmt.run(agentId)
  }

  /**
   * Record task completion for an agent
   * @param agentId Agent ID
   * @param success Whether the task succeeded
   * @param tokensUsed Tokens consumed
   * @param latencyMs Latency in milliseconds
   */
  recordTaskCompletion(
    agentId: string,
    success: boolean,
    tokensUsed?: number,
    latencyMs?: number,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO agent_runs (agentId, success, tokensUsed, latencyMs, executedAt)
      VALUES (?, ?, ?, ?, ?)
    `)

    stmt.run(agentId, success ? 1 : 0, tokensUsed || 0, latencyMs || 0, Date.now())

    // Update learning profile
    this.updateLearningProfile(agentId)
  }

  /**
   * Update learning profile based on recent runs
   * @param agentId Agent ID
   */
  private updateLearningProfile(agentId: string): void {
    const agent = this.getAgent(agentId)
    if (!agent) return

    const runsStmt = this.db.prepare(`
      SELECT success, tokensUsed, latencyMs FROM agent_runs 
      WHERE agentId = ? 
      ORDER BY executedAt DESC 
      LIMIT 100
    `)
    const runs = runsStmt.all(agentId) as any[]

    if (runs.length === 0) return

    const successCount = runs.filter(r => r.success).length
    const totalTokens = runs.reduce((sum, r) => sum + (r.tokensUsed || 0), 0)
    const totalLatency = runs.reduce((sum, r) => sum + (r.latencyMs || 0), 0)

    const profile: AgentLearningProfile = {
      totalTasksCompleted: runs.length,
      successRate: successCount / runs.length,
      avgTokensPerTask: totalTokens / runs.length,
      avgLatencyMs: totalLatency / runs.length,
      strengthAreas: agent.learningProfile?.strengthAreas || [],
      weaknessAreas: agent.learningProfile?.weaknessAreas || [],
      userRating: agent.learningProfile?.userRating || 0,
      lastUpdatedAt: Date.now(),
    }

    agent.learningProfile = profile
    this.saveAgent(agent)
  }

  /**
   * Get performance metrics for an agent
   * @param agentId Agent ID
   * @param period Time period
   * @returns Performance metrics
   */
  getPerformanceMetrics(
    agentId: string,
    period: 'hour' | 'day' | 'week' | 'month' = 'day',
  ): AgentPerformanceMetrics | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_performance 
      WHERE agentId = ? AND period = ? 
      ORDER BY recordedAt DESC 
      LIMIT 1
    `)
    const row = stmt.get(agentId, period) as any
    if (!row) return undefined

    return {
      agentId: row.agentId,
      period: row.period,
      tasksCompleted: row.tasksCompleted,
      tasksFailed: row.tasksFailed,
      avgResponseTime: row.avgResponseTime,
      avgTokensUsed: row.avgTokensUsed,
      userSatisfaction: row.userSatisfaction,
      costEstimate: row.costEstimate,
    }
  }

  /**
   * Record performance metrics
   * @param agentId Agent ID
   * @param metrics Metrics to record
   */
  recordPerformanceMetrics(agentId: string, metrics: AgentPerformanceMetrics): void {
    const stmt = this.db.prepare(`
      INSERT INTO agent_performance (
        agentId, period, tasksCompleted, tasksFailed, avgResponseTime,
        avgTokensUsed, userSatisfaction, costEstimate, recordedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      agentId,
      metrics.period,
      metrics.tasksCompleted,
      metrics.tasksFailed,
      metrics.avgResponseTime,
      metrics.avgTokensUsed,
      metrics.userSatisfaction,
      metrics.costEstimate,
      Date.now(),
    )
  }

  /**
   * Get all agents count
   * @returns Number of agents
   */
  getAgentCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM custom_agents')
    const row = stmt.get() as any
    return row.count
  }

  /**
   * Get count of built-in agents
   * @returns Number of built-in agents
   */
  getBuiltInAgentCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM custom_agents WHERE isBuiltIn = 1')
    const row = stmt.get() as any
    return row.count
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close()
  }
}
