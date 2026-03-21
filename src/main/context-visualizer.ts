/**
 * Context Window Visualizer — Real-time token budget analyzer for Nyra Desktop
 *
 * Tracks how memory tiers, system prompt, conversation history, and tool results
 * consume the model's context window. Helps users understand response quality degradation.
 */

import { memoryArchitect } from './memory/memory-architecture'
import { memoryManager } from './memory'

// ── Types ────────────────────────────────────────────────────────────────────

interface ContextSegment {
  name: string
  tokens: number
  percentage: number
  color: string
  details?: string
}

interface ContextBreakdown {
  totalLimit: number
  segments: ContextSegment[]
  totalUsed: number
  availableTokens: number
  utilizationPercent: number
  warningLevel: 'safe' | 'moderate' | 'high' | 'critical'
}

interface UsageSnapshot {
  timestamp: number
  utilization: number
}

// ── Context Visualizer ──────────────────────────────────────────────────────

export class ContextVisualizer {
  private modelLimits: Record<string, number> = {
    'claude-3.5-sonnet': 200000,
    'claude-3.5-haiku': 200000,
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'claude-opus-4': 200000,
    'claude-sonnet-4': 200000,
    'gpt-4-turbo': 128000,
    'gpt-4o': 128000,
    'gpt-4': 8192,
    'gpt-3.5-turbo': 16384,
    'gemini-pro': 1000000,
    'gemini-1.5-pro': 2000000,
  }

  private segmentColors: Record<string, string> = {
    'System Prompt': '#6366f1',
    'Working Memory': '#f59e0b',
    'Episodic Memory': '#10b981',
    'Semantic Memory': '#8b5cf6',
    'Procedural Memory': '#ec4899',
    'Conversation History': '#3b82f6',
    'Tool Results': '#f97316',
    'Available Budget': '#1e293b',
  }

  private db: any = null

  // ── Initialization ────────────────────────────────────────────

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS context_usage_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modelId TEXT NOT NULL,
            totalUsed INTEGER NOT NULL,
            totalLimit INTEGER NOT NULL,
            utilizationPercent REAL NOT NULL,
            timestamp INTEGER NOT NULL
          )
        `)
        this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_context_usage_timestamp
            ON context_usage_history(timestamp)
        `)
        console.log('[ContextVisualizer] Initialized')
      }
    } catch (error) {
      console.warn('[ContextVisualizer] Init error (non-fatal):', error)
    }
  }

  // ── Core Analysis ─────────────────────────────────────────────

  async getContextBreakdown(modelId?: string): Promise<ContextBreakdown> {
    const model = modelId || 'claude-3.5-sonnet'
    const totalLimit = this.modelLimits[model] || 128000

    // Query each memory tier for entry counts to estimate token usage
    // We use cascadeSearch with a dummy query to estimate sizes,
    // or directly count entries per tier from DB
    let workingTokens = 0
    let episodicTokens = 0
    let semanticTokens = 0
    let proceduralTokens = 0
    let conversationTokens = 0
    let systemPromptTokens = 0
    let toolResultsTokens = 0

    try {
      // Estimate working memory from tier
      const workingEntries = await this.getTierSize('working')
      workingTokens = workingEntries * 150 // ~150 tokens per working memory entry

      const episodicEntries = await this.getTierSize('episodic')
      episodicTokens = episodicEntries * 200

      const semanticEntries = await this.getTierSize('semantic')
      semanticTokens = semanticEntries * 100

      const proceduralEntries = await this.getTierSize('procedural')
      proceduralTokens = proceduralEntries * 250

      // Estimate system prompt as ~500 tokens (typical)
      systemPromptTokens = 500

      // Estimate conversation from session messages
      conversationTokens = await this.getConversationTokenEstimate()

      // Tool results estimated from recent activity
      toolResultsTokens = Math.floor(conversationTokens * 0.1)
    } catch (err) {
      console.warn('[ContextVisualizer] Error estimating context:', err)
    }

    const totalUsed =
      systemPromptTokens + workingTokens + episodicTokens +
      semanticTokens + proceduralTokens + conversationTokens + toolResultsTokens

    const availableTokens = Math.max(0, totalLimit - totalUsed)
    const utilizationPercent = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0

    let warningLevel: ContextBreakdown['warningLevel']
    if (utilizationPercent < 50) warningLevel = 'safe'
    else if (utilizationPercent < 75) warningLevel = 'moderate'
    else if (utilizationPercent < 90) warningLevel = 'high'
    else warningLevel = 'critical'

    const segments: ContextSegment[] = [
      { name: 'System Prompt', tokens: systemPromptTokens, percentage: (systemPromptTokens / totalLimit) * 100, color: this.segmentColors['System Prompt'], details: 'Core system instructions' },
      { name: 'Working Memory', tokens: workingTokens, percentage: (workingTokens / totalLimit) * 100, color: this.segmentColors['Working Memory'], details: 'Current context and scratchpad' },
      { name: 'Episodic Memory', tokens: episodicTokens, percentage: (episodicTokens / totalLimit) * 100, color: this.segmentColors['Episodic Memory'], details: 'Session events and interactions' },
      { name: 'Semantic Memory', tokens: semanticTokens, percentage: (semanticTokens / totalLimit) * 100, color: this.segmentColors['Semantic Memory'], details: 'Knowledge base and facts' },
      { name: 'Procedural Memory', tokens: proceduralTokens, percentage: (proceduralTokens / totalLimit) * 100, color: this.segmentColors['Procedural Memory'], details: 'Skills and learned behaviors' },
      { name: 'Conversation History', tokens: conversationTokens, percentage: (conversationTokens / totalLimit) * 100, color: this.segmentColors['Conversation History'], details: 'Chat messages in session' },
      { name: 'Tool Results', tokens: toolResultsTokens, percentage: (toolResultsTokens / totalLimit) * 100, color: this.segmentColors['Tool Results'], details: 'MCP and tool outputs' },
      { name: 'Available Budget', tokens: availableTokens, percentage: (availableTokens / totalLimit) * 100, color: this.segmentColors['Available Budget'], details: 'Free space remaining' },
    ]

    return { totalLimit, segments, totalUsed, availableTokens, utilizationPercent, warningLevel }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private async getTierSize(tier: string): Promise<number> {
    if (!this.db) return 0
    try {
      // Try to count entries in the tier's table
      const tableMap: Record<string, string> = {
        working: 'working_memory_snapshots',
        episodic: 'episodic_memories',
        semantic: 'semantic_memories',
        procedural: 'procedural_memories',
        archival: 'archival_memories',
      }
      const table = tableMap[tier]
      if (!table) return 0
      const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any
      return row?.count || 0
    } catch {
      return 0
    }
  }

  private async getConversationTokenEstimate(): Promise<number> {
    if (!this.db) return 0
    try {
      // Count recent conversation branch messages as proxy
      const row = this.db.prepare(
        `SELECT COUNT(*) as count FROM conversation_branch_messages WHERE createdAt > ?`
      ).get(Date.now() - 3600000) as any
      return (row?.count || 0) * 120 // ~120 tokens per message
    } catch {
      return 0
    }
  }

  estimateTokens(text: string): number {
    if (!text) return 0
    return Math.ceil(text.length / 3.5)
  }

  getModelLimits(): Record<string, number> {
    return { ...this.modelLimits }
  }

  // ── Historical Usage ──────────────────────────────────────────

  getHistoricalUsage(hours: number = 24): UsageSnapshot[] {
    if (!this.db) return []
    try {
      const cutoff = Date.now() - hours * 60 * 60 * 1000
      const rows = this.db.prepare(
        `SELECT timestamp, utilizationPercent FROM context_usage_history WHERE timestamp > ? ORDER BY timestamp ASC`
      ).all(cutoff) as any[]
      return rows.map((r: any) => ({ timestamp: r.timestamp, utilization: r.utilizationPercent }))
    } catch {
      return []
    }
  }

  recordSnapshot(): void {
    if (!this.db) return
    try {
      // Quick estimate without full async breakdown
      const totalLimit = 200000
      let totalUsed = 0
      for (const tier of ['working', 'episodic', 'semantic', 'procedural']) {
        try {
          const tableMap: Record<string, string> = {
            working: 'working_memory_snapshots',
            episodic: 'episodic_memories',
            semantic: 'semantic_memories',
            procedural: 'procedural_memories',
          }
          const t = tableMap[tier]
          if (t) {
            const row = this.db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as any
            totalUsed += (row?.c || 0) * 150
          }
        } catch { /* table may not exist */ }
      }
      const utilization = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0
      this.db.prepare(
        `INSERT INTO context_usage_history (modelId, totalUsed, totalLimit, utilizationPercent, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run('claude-3.5-sonnet', totalUsed, totalLimit, utilization, Date.now())

      // Prune old (>7 days)
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      this.db.prepare(`DELETE FROM context_usage_history WHERE timestamp < ?`).run(cutoff)
    } catch (err) {
      console.warn('[ContextVisualizer] Snapshot error:', err)
    }
  }
}

export const contextVisualizer = new ContextVisualizer()
