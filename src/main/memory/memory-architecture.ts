import { randomUUID } from 'crypto'
import type {
  MemoryTier,
  MemoryEntry,
  MemoryQuery,
  MemorySearchResult,
  MemoryCascadeResult,
  MemoryTierProvider,
  ProceduralStep,
} from './memory-interfaces'
import { DEFAULT_COMPACTION_CONFIG } from './memory-interfaces'
import { workingMemory } from './tiers/working-memory'
import { episodicMemory } from './tiers/episodic-memory'
import { proceduralMemory } from './tiers/procedural-memory'
import { archivalMemory } from './tiers/archival-memory'
import { MemoryCompactor } from './compaction/memory-compactor'
import { importanceScorer } from './compaction/importance-scorer'
import { hybridSearch } from './embedding/hybrid-search'

/**
 * MemoryArchitect: Central orchestrator for the MemGPT-class 5-tier memory system.
 *
 * Coordinates all tiers (working → episodic → semantic → procedural → archival),
 * handles cascade search, manages lifecycle, and provides the public API.
 */
export class MemoryArchitect {
  private tiers: Map<MemoryTier, MemoryTierProvider> = new Map()
  private compactor: MemoryCompactor
  private initialized = false
  private readonly tierOrder: MemoryTier[] = [
    'working', 'episodic', 'semantic', 'procedural', 'archival',
  ]
  private compactionInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.compactor = new MemoryCompactor(this.tiers, DEFAULT_COMPACTION_CONFIG)
  }

  // ── Initialization ────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.initialized) return

    // Register 4 built-in tiers (semantic is registered separately to avoid circular deps)
    this.tiers.set('working', workingMemory as unknown as MemoryTierProvider)
    this.tiers.set('episodic', episodicMemory as unknown as MemoryTierProvider)
    this.tiers.set('procedural', proceduralMemory as unknown as MemoryTierProvider)
    this.tiers.set('archival', archivalMemory as unknown as MemoryTierProvider)

    // Initialize each tier
    for (const tier of this.tierOrder) {
      const provider = this.tiers.get(tier)
      if (provider) {
        await provider.init()
      }
    }

    // Wire the compactor to our tiers
    this.compactor.setTiers(this.tiers)
    this.initialized = true
  }

  /** Register the semantic tier (called from semanticMemory adapter to avoid circular deps) */
  registerSemanticTier(provider: MemoryTierProvider): void {
    this.tiers.set('semantic', provider)
    provider.init().catch((err: unknown) => {
      console.error('[MemoryArchitect] Failed to initialize semantic tier:', err)
    })
  }

  // ── Cascade Search ────────────────────────────────────────────

  /**
   * Search across tiers in priority order with re-ranking and token budgeting.
   * The key innovation: working memory is checked first (instant), then episodic
   * (recent experience), then deeper tiers. Results are re-ranked using hybrid
   * BM25+importance scoring and trimmed to fit the token budget.
   */
  async cascadeSearch(
    query: MemoryQuery,
    tokenBudget = 4000
  ): Promise<MemoryCascadeResult> {
    if (!this.initialized) await this.init()

    const startTime = Date.now()
    const allResults: MemorySearchResult[] = []
    const tiersSearched: MemoryTier[] = []

    // Search each tier in order
    const searchTiers = query.tiers ?? this.tierOrder
    for (const tierName of searchTiers) {
      const provider = this.tiers.get(tierName)
      if (!provider) continue

      const tierResults = await provider.search(query)
      tiersSearched.push(tierName)
      allResults.push(...tierResults)
    }

    // Collect all underlying entries for hybrid re-ranking
    const entries = allResults.map((r) => r.entry)
    let finalResults: MemorySearchResult[]

    if (entries.length > 0) {
      // Re-rank using hybrid BM25 + importance search
      finalResults = hybridSearch.search(query.text, entries, undefined, query.limit ?? 20)
    } else {
      finalResults = []
    }

    // Trim to token budget
    const trimmed: MemorySearchResult[] = []
    let tokenUsed = 0
    for (const result of finalResults) {
      const tokens = Math.ceil(result.entry.content.length / 4)
      if (tokenUsed + tokens > tokenBudget) break
      trimmed.push(result)
      tokenUsed += tokens
    }

    return {
      results: trimmed,
      tiersSearched,
      totalSearchTimeMs: Date.now() - startTime,
      tokenBudgetUsed: tokenUsed,
      tokenBudgetTotal: tokenBudget,
    }
  }

  // ── Memory Addition (Smart Tier Routing) ──────────────────────

  /**
   * Store content in memory with automatic tier selection based on content type.
   * workflow → procedural, fact/preference → semantic, everything else → episodic
   */
  async remember(
    content: string,
    metadata: Partial<MemoryEntry['metadata']> = {},
    tier?: MemoryTier
  ): Promise<string> {
    if (!this.initialized) await this.init()

    // Auto-route if tier not specified
    let targetTier = tier
    if (!targetTier) {
      const ct = metadata.contentType
      if (ct === 'workflow') targetTier = 'procedural'
      else if (ct === 'fact' || ct === 'preference') targetTier = 'semantic'
      else targetTier = 'episodic'
    }

    const id = randomUUID()
    const now = Date.now()

    // Build a full MemoryEntry
    const entry: MemoryEntry = {
      id,
      content,
      metadata: {
        source: metadata.source ?? 'extraction',
        tier: targetTier,
        tags: metadata.tags ?? [],
        associations: metadata.associations ?? [],
        contentType: metadata.contentType ?? 'text',
        confidence: metadata.confidence ?? 0.7,
        pinned: metadata.pinned ?? false,
        agentId: metadata.agentId,
        sessionId: metadata.sessionId,
        projectId: metadata.projectId,
      },
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
      importance: importanceScorer.scoreImportance({
        id, content, metadata: {
          source: 'extraction', tier: targetTier, tags: [], associations: [],
          contentType: 'text', confidence: 0.7, pinned: false,
        },
        createdAt: now, updatedAt: now, accessCount: 0, lastAccessedAt: now,
        importance: 0.5, decayFactor: 1.0,
      }),
      decayFactor: 1.0,
    }

    const provider = this.tiers.get(targetTier)
    if (!provider) throw new Error(`Unknown memory tier: ${targetTier}`)

    await provider.add(entry)
    return id
  }

  // ── Context Building (for LLM Injection) ──────────────────────

  /**
   * Build a formatted memory context string for LLM injection.
   * Groups results by tier into labeled sections.
   */
  async buildMemoryContext(query: string, tokenBudget = 4000): Promise<string> {
    const cascade = await this.cascadeSearch({ text: query }, tokenBudget)
    const sections: string[] = []

    // Group results by tier
    const byTier = new Map<MemoryTier, MemorySearchResult[]>()
    for (const r of cascade.results) {
      const t = r.tier
      if (!byTier.has(t)) byTier.set(t, [])
      byTier.get(t)!.push(r)
    }

    const tierLabels: Record<MemoryTier, string> = {
      working: '[Working Memory]',
      episodic: '[Relevant Past Experiences]',
      semantic: '[Known Facts]',
      procedural: '[Learned Procedures]',
      archival: '[Archival Records]',
    }

    for (const tier of this.tierOrder) {
      const items = byTier.get(tier)
      if (!items || items.length === 0) continue
      sections.push(tierLabels[tier])
      for (const item of items) {
        sections.push(`- ${item.entry.content}`)
      }
    }

    return sections.join('\n')
  }

  // ── Working Memory Helpers ────────────────────────────────────

  getWorkingMemory(): typeof workingMemory {
    return workingMemory
  }

  async addToWorkingMemory(content: string): Promise<string> {
    const id = randomUUID()
    const entry: MemoryEntry = {
      id,
      content,
      metadata: {
        source: 'user_input', tier: 'working', tags: [], associations: [],
        contentType: 'text', confidence: 1.0, pinned: false,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: Date.now(),
      importance: 0.8,
      decayFactor: 1.0,
    }
    await workingMemory.add(entry)
    return id
  }

  // ── Procedural Memory Helpers ─────────────────────────────────

  async findProcedure(trigger: string): Promise<ProceduralStep[] | null> {
    if (!this.initialized) await this.init()
    const match = await proceduralMemory.findMatchingProcedure(trigger)
    if (!match) return null
    // Parse steps from the stored procedural entry
    return (match as unknown as { steps: ProceduralStep[] }).steps ?? null
  }

  async learnWorkflow(trigger: string, steps: ProceduralStep[]): Promise<string> {
    if (!this.initialized) await this.init()
    return proceduralMemory.learnProcedure(trigger, steps)
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  startCompaction(): void {
    if (this.compactionInterval) return
    this.compactor.startAutoCompaction()
  }

  stopCompaction(): void {
    this.compactor.stopAutoCompaction()
    if (this.compactionInterval) {
      clearInterval(this.compactionInterval)
      this.compactionInterval = null
    }
  }

  async getStats(): Promise<Record<MemoryTier, { count: number; tokens: number }>> {
    if (!this.initialized) await this.init()

    const stats: Record<MemoryTier, { count: number; tokens: number }> = {
      working: { count: 0, tokens: 0 },
      episodic: { count: 0, tokens: 0 },
      semantic: { count: 0, tokens: 0 },
      procedural: { count: 0, tokens: 0 },
      archival: { count: 0, tokens: 0 },
    }

    for (const tier of this.tierOrder) {
      const provider = this.tiers.get(tier)
      if (!provider) continue
      stats[tier] = {
        count: await provider.count(),
        tokens: await provider.estimateTokens(),
      }
    }

    return stats
  }
}

export const memoryArchitect = new MemoryArchitect()
