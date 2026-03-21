import type {
  MemoryTierProvider,
  MemoryTier,
  MemoryEntry,
  CompactionConfig,
  CompactionResult,
} from '../memory-interfaces'
import { DEFAULT_COMPACTION_CONFIG } from '../memory-interfaces'
import { importanceScorer } from './importance-scorer'

const TIER_ORDER: MemoryTier[] = ['working', 'episodic', 'semantic', 'procedural']

/** Demotion routing: where does a memory go when it's demoted from each tier? */
const DEMOTION_MAP: Partial<Record<MemoryTier, MemoryTier>> = {
  working: 'episodic',
  episodic: 'semantic',
  semantic: 'archival',
  procedural: 'archival',
}

/** Promotion routing: where does a memory go when it's promoted from each tier? */
const PROMOTION_MAP: Partial<Record<MemoryTier, MemoryTier>> = {
  episodic: 'working',
  semantic: 'episodic',
  procedural: 'semantic',
  archival: 'semantic',
}

export class MemoryCompactor {
  private tiers: Map<MemoryTier, MemoryTierProvider>
  private config: CompactionConfig
  private autoCompactionInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    tiers: Map<MemoryTier, MemoryTierProvider>,
    config: CompactionConfig = DEFAULT_COMPACTION_CONFIG
  ) {
    this.tiers = tiers
    this.config = config
  }

  /**
   * Run a full compaction cycle across all tiers.
   * - Checks each tier against its capacity limit
   * - Scores entries with importance + Ebbinghaus decay
   * - Demotes low-value entries, promotes high-value ones
   * - Discards entries that can't be demoted further
   */
  async runCompaction(): Promise<CompactionResult> {
    const startTime = Date.now()
    const result: CompactionResult = {
      memoriesCompacted: 0,
      memoriesPromoted: 0,
      memoriesDemoted: 0,
      memoriesDiscarded: 0,
      tokensFreed: 0,
      durationMs: 0,
    }

    for (const tierName of TIER_ORDER) {
      const tierProvider = this.tiers.get(tierName)
      if (!tierProvider) continue

      const tierLimit = this.config.tierLimits[tierName]
      const count = await tierProvider.count()

      if (count <= tierLimit) continue

      // Over capacity — get candidates for demotion
      const excess = count - tierLimit
      const candidates = await tierProvider.getDemotionCandidates(excess + 10) // Get extras for scoring

      for (const entry of candidates) {
        // Update decay factor
        const decay = importanceScorer.computeDecay(entry, this.config.decayHalfLifeDays)
        const updatedEntry: MemoryEntry = { ...entry, decayFactor: decay }

        if (importanceScorer.shouldCompact(updatedEntry, this.config.importanceThreshold)) {
          const targetTier = this.demoteTier(updatedEntry, tierName)
          if (targetTier) {
            await this.moveMemory(updatedEntry, tierName, targetTier)
            result.memoriesDemoted++
          } else {
            // Can't demote further — discard
            await tierProvider.remove(entry.id)
            result.memoriesDiscarded++
            result.tokensFreed += Math.ceil(entry.content.length / 4)
          }
          result.memoriesCompacted++
        }

        // Stop if we're back under the limit
        const newCount = await tierProvider.count()
        if (newCount <= tierLimit) break
      }

      // Also check for promotions (entries that have become valuable)
      const promotionCandidates = await tierProvider.getPromotionCandidates(10)
      for (const entry of promotionCandidates) {
        if (importanceScorer.shouldPromote(entry)) {
          const targetTier = this.promoteTier(entry, tierName)
          if (targetTier) {
            await this.moveMemory(entry, tierName, targetTier)
            result.memoriesPromoted++
          }
        }
      }
    }

    result.durationMs = Date.now() - startTime
    return result
  }

  /** Get the target tier for promotion (one level up) */
  promoteTier(_entry: MemoryEntry, fromTier: MemoryTier): MemoryTier | null {
    return PROMOTION_MAP[fromTier] ?? null
  }

  /** Get the target tier for demotion (one level down, toward archival) */
  demoteTier(_entry: MemoryEntry, fromTier: MemoryTier): MemoryTier | null {
    return DEMOTION_MAP[fromTier] ?? null
  }

  /** Move a memory entry from one tier to another */
  private async moveMemory(
    entry: MemoryEntry,
    fromTier: MemoryTier,
    toTier: MemoryTier
  ): Promise<void> {
    const fromProvider = this.tiers.get(fromTier)
    const toProvider = this.tiers.get(toTier)
    if (!fromProvider || !toProvider) return

    // Update metadata to reflect new tier
    const movedEntry: MemoryEntry = {
      ...entry,
      metadata: { ...entry.metadata, tier: toTier },
      updatedAt: Date.now(),
    }

    await fromProvider.remove(entry.id)
    await toProvider.add(movedEntry)
  }

  /** Start auto-compaction on an interval */
  startAutoCompaction(): void {
    if (this.autoCompactionInterval) return

    this.autoCompactionInterval = setInterval(async () => {
      try {
        await this.runCompaction()
      } catch (error) {
        console.error('[MemoryCompactor] Auto-compaction error:', error)
      }
    }, this.config.intervalMs)
  }

  /** Stop auto-compaction */
  stopAutoCompaction(): void {
    if (this.autoCompactionInterval) {
      clearInterval(this.autoCompactionInterval)
      this.autoCompactionInterval = null
    }
  }

  /** Update the tiers map (used by MemoryArchitect after initialization) */
  setTiers(tiers: Map<MemoryTier, MemoryTierProvider>): void {
    this.tiers = tiers
  }
}

export const memoryCompactor = new MemoryCompactor(new Map())
