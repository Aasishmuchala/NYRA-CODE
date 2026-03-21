/**
 * Semantic Memory Adapter — bridges the existing SemanticMemory singleton
 * with the new 5-tier MemoryArchitect system.
 *
 * Registers the existing semantic memory as the "semantic" tier in the
 * MemoryArchitect, so cascade search includes semantic results.
 */

import type {
  MemoryTier,
  MemoryTierProvider,
  MemoryEntry,
  MemoryQuery,
  MemorySearchResult,
} from './memory-interfaces'
import { memoryArchitect } from './memory-architecture'
import { semanticMemory } from '../semantic-memory'
import type { MemoryType, MemoryEntry as SemanticEntry } from '../semantic-memory'

/**
 * Adapts the existing SemanticMemory to the MemoryTierProvider interface.
 */
class SemanticTierAdapter implements MemoryTierProvider {
  readonly tier: MemoryTier = 'semantic'
  readonly name = 'Semantic Memory (existing)'
  private _initialized = false

  async init(): Promise<void> {
    if (this._initialized) return
    this._initialized = true
  }

  async add(entry: MemoryEntry): Promise<string> {
    const result = await semanticMemory.addMemory({
      type: this.mapContentType(entry.metadata.contentType),
      content: entry.content,
      source: entry.metadata.sessionId ?? 'memory-architect',
      projectId: entry.metadata.projectId,
      tags: entry.metadata.tags,
      confidence: entry.metadata.confidence,
      pinned: entry.metadata.pinned,
    })
    return String(result.id)
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    semanticMemory.updateMemory(Number(id), {
      content: updates.content,
      confidence: updates.metadata?.confidence,
      pinned: updates.metadata?.pinned,
      tags: updates.metadata?.tags,
    })
  }

  async remove(id: string): Promise<void> {
    semanticMemory.deleteMemory(Number(id))
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const results = await semanticMemory.search(query.text, {
      limit: query.limit ?? 10,
      projectId: query.projectId,
    })

    return results.map((r) => this.toSearchResult(r))
  }

  async get(id: string): Promise<MemoryEntry | null> {
    // semanticMemory doesn't have a getById, use search as fallback
    return null
  }

  async list(offset: number, limit: number): Promise<MemoryEntry[]> {
    const all = semanticMemory.listMemories({ limit, offset })
    return all.map((r) => this.toMemoryEntry(r))
  }

  async count(): Promise<number> {
    const stats = semanticMemory.getStats()
    return stats.totalMemories
  }

  async estimateTokens(): Promise<number> {
    const stats = semanticMemory.getStats()
    return stats.totalMemories * 50
  }

  async getPromotionCandidates(_limit: number): Promise<MemoryEntry[]> {
    // Semantic tier doesn't promote up (it's already high-value)
    return []
  }

  async getDemotionCandidates(limit: number): Promise<MemoryEntry[]> {
    // Find low-confidence, low-access memories that could be archived
    const all = semanticMemory.listMemories({ limit: limit * 3 })
    return all
      .filter((m) => m.confidence < 0.3 && m.accessCount <= 1)
      .slice(0, limit)
      .map((m) => this.toMemoryEntry(m))
  }

  // ── Helpers ────────────────────────────────────────────────

  private toSearchResult(r: SemanticEntry & { relevanceScore?: number }): MemorySearchResult {
    return {
      entry: this.toMemoryEntry(r),
      relevance: (r as any).relevanceScore ?? 0.5,
      tier: 'semantic',
      matchType: 'semantic',
    }
  }

  private toMemoryEntry(r: SemanticEntry): MemoryEntry {
    return {
      id: String(r.id),
      content: r.content,
      metadata: {
        source: 'extraction',
        tier: 'semantic',
        tags: r.tags ?? [],
        associations: [],
        contentType: 'text',
        confidence: r.confidence ?? 0.7,
        pinned: r.pinned ?? false,
      },
      createdAt: r.createdAt ?? Date.now(),
      updatedAt: r.updatedAt ?? Date.now(),
      accessCount: r.accessCount ?? 0,
      lastAccessedAt: r.lastAccessedAt ?? Date.now(),
      importance: 0.5,
      decayFactor: 1.0,
    }
  }

  private mapContentType(ct: string): MemoryType {
    switch (ct) {
      case 'fact': return 'fact'
      case 'preference': return 'preference'
      case 'workflow': return 'context'
      default: return 'fact'
    }
  }
}

/**
 * Initialize and register the semantic tier adapter.
 * Call this after both semanticMemory and memoryArchitect are ready.
 */
export function registerSemanticTier(): void {
  const adapter = new SemanticTierAdapter()
  memoryArchitect.registerSemanticTier(adapter)
  console.log('[SemanticAdapter] Registered semantic tier in MemoryArchitect')
}
