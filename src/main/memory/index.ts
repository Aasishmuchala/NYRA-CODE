/**
 * Memory Module — MemGPT-Class 5-Tier Memory System
 *
 * Tiers (fastest → largest):
 *   Working  → Episodic → Semantic → Procedural → Archival
 *
 * Usage:
 *   import { memoryArchitect } from './memory'
 *   await memoryArchitect.init()
 *   const context = await memoryArchitect.buildMemoryContext('user query')
 */

// ── Types ─────────────────────────────────────────────────────
export type {
  MemoryEntry,
  MemoryMetadata,
  MemoryTier,
  MemorySource,
  WorkingMemoryState,
  WorkingMessage,
  EpisodicEntry,
  ProceduralEntry,
  ProceduralStep,
  ArchivalEntry,
  MemoryQuery,
  MemorySearchResult,
  MemoryCascadeResult,
  MemoryTierProvider,
  CompactionConfig,
  CompactionResult,
  ImportanceFactors,
  ImportanceWeights,
  MemoryEvent,
} from './memory-interfaces'

export {
  DEFAULT_COMPACTION_CONFIG,
  DEFAULT_IMPORTANCE_WEIGHTS,
} from './memory-interfaces'

// ── Tier Implementations ──────────────────────────────────────
export { workingMemory } from './tiers/working-memory'
export { episodicMemory } from './tiers/episodic-memory'
export { proceduralMemory } from './tiers/procedural-memory'
export { archivalMemory } from './tiers/archival-memory'

// ── Compaction ────────────────────────────────────────────────
export { importanceScorer } from './compaction/importance-scorer'
export { memoryCompactor } from './compaction/memory-compactor'

// ── Search ────────────────────────────────────────────────────
export { hybridSearch } from './embedding/hybrid-search'
export type { ScoredEntry, HybridWeights } from './embedding/hybrid-search'

// ── Orchestrator ──────────────────────────────────────────────
export { memoryArchitect } from './memory-architecture'
