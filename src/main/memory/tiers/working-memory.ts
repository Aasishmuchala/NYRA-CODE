import { randomUUID } from 'crypto'
import type {
  MemoryTierProvider,
  MemoryEntry,
  MemoryQuery,
  MemorySearchResult,
  WorkingMemoryState,
  WorkingMessage,
} from '../memory-interfaces'

/**
 * Working Memory Tier
 *
 * The "RAM" of the memory system — always in LLM context (< 4K tokens).
 * Volatile, in-memory storage only. No persistence by design.
 */
class WorkingMemory implements MemoryTierProvider {
  readonly tier = 'working' as const
  readonly name = 'Working Memory'
  private readonly tierLimit = 50

  private entries: Map<string, MemoryEntry> = new Map()
  private state: WorkingMemoryState = {
    currentTask: null,
    recentMessages: [],
    activeAgentId: null,
    scratchpad: {},
    tokenCount: 0,
    maxTokens: 4096,
  }

  async init(): Promise<void> {
    // No-op: working memory is in-memory only
  }

  async add(entry: MemoryEntry): Promise<string> {
    const id = entry.id || randomUUID()
    const enriched: MemoryEntry = {
      ...entry,
      id,
      createdAt: entry.createdAt || Date.now(),
      updatedAt: Date.now(),
      accessCount: entry.accessCount || 0,
      lastAccessedAt: entry.lastAccessedAt || Date.now(),
      importance: entry.importance ?? 0.5,
      decayFactor: entry.decayFactor ?? 1.0,
    }

    this.entries.set(id, enriched)
    this.state.tokenCount = this.calculateTotalTokens()

    // Evict lowest-importance if over capacity
    if (this.entries.size > this.tierLimit) {
      this.evictLowestImportance()
    }

    return id
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    const existing = this.entries.get(id)
    if (!existing) return
    this.entries.set(id, { ...existing, ...updates, updatedAt: Date.now() })
  }

  async remove(id: string): Promise<void> {
    this.entries.delete(id)
    this.state.tokenCount = this.calculateTotalTokens()
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const searchText = (query.text ?? '').toLowerCase()
    const results: MemorySearchResult[] = []

    for (const entry of this.entries.values()) {
      if (!searchText) {
        // No search text: return all entries
        results.push({
          entry,
          relevance: 0.5,
          matchType: 'keyword',
          tier: 'working',
        })
        continue
      }

      const contentLower = entry.content.toLowerCase()
      if (contentLower.includes(searchText)) {
        // Simple relevance: ratio of match length to content length
        const relevance = Math.min(1.0, searchText.length / contentLower.length + 0.3)
        results.push({
          entry,
          relevance,
          matchType: 'keyword',
          tier: 'working',
        })
      }
    }

    results.sort((a, b) => b.relevance - a.relevance)
    return results.slice(0, query.limit ?? 20)
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const entry = this.entries.get(id)
    if (entry) {
      entry.accessCount = (entry.accessCount || 0) + 1
      entry.lastAccessedAt = Date.now()
    }
    return entry || null
  }

  async list(offset: number, limit: number): Promise<MemoryEntry[]> {
    return Array.from(this.entries.values()).slice(offset, offset + limit)
  }

  async count(): Promise<number> {
    return this.entries.size
  }

  async estimateTokens(): Promise<number> {
    return this.calculateTotalTokens()
  }

  async getPromotionCandidates(limit: number): Promise<MemoryEntry[]> {
    return Array.from(this.entries.values())
      .filter((e) => e.accessCount > 3 && e.importance > 0.5)
      .slice(0, limit)
  }

  async getDemotionCandidates(limit: number): Promise<MemoryEntry[]> {
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
    return Array.from(this.entries.values())
      .filter((e) => e.createdAt < thirtyMinutesAgo && e.importance < 0.3)
      .slice(0, limit)
  }

  // ── Working-Memory-Specific Helpers ────────────────────────

  addMessage(msg: WorkingMessage): void {
    this.state.recentMessages.push(msg)
    if (this.state.recentMessages.length > 20) {
      this.state.recentMessages.shift()
    }
    this.state.tokenCount = this.calculateTotalTokens()
  }

  setCurrentTask(task: string | null): void {
    this.state.currentTask = task
  }

  getScratchpad<T>(key: string): T | undefined {
    return this.state.scratchpad[key] as T | undefined
  }

  setScratchpad(key: string, value: unknown): void {
    this.state.scratchpad[key] = value
  }

  getState(): WorkingMemoryState {
    return { ...this.state }
  }

  buildContextString(): string {
    const lines: string[] = ['=== WORKING MEMORY ===']
    if (this.state.currentTask) lines.push(`Task: ${this.state.currentTask}`)
    if (this.state.activeAgentId) lines.push(`Agent: ${this.state.activeAgentId}`)
    if (this.state.recentMessages.length > 0) {
      lines.push('Recent:')
      for (const msg of this.state.recentMessages) {
        lines.push(`  [${msg.role}]: ${msg.content}`)
      }
    }
    for (const entry of this.entries.values()) {
      lines.push(`- ${entry.content}`)
    }
    lines.push(`Tokens: ${this.state.tokenCount}/${this.state.maxTokens}`)
    return lines.join('\n')
  }

  clear(): void {
    this.entries.clear()
    this.state = {
      currentTask: null,
      recentMessages: [],
      activeAgentId: null,
      scratchpad: {},
      tokenCount: 0,
      maxTokens: 4096,
    }
  }

  // ── Private ────────────────────────────────────────────────

  private calculateTotalTokens(): number {
    let total = 0
    for (const entry of this.entries.values()) {
      total += Math.ceil(entry.content.length / 4)
    }
    for (const msg of this.state.recentMessages) {
      total += Math.ceil(msg.content.length / 4)
    }
    total += Math.ceil(JSON.stringify(this.state.scratchpad).length / 4)
    return total
  }

  private evictLowestImportance(): void {
    let lowestKey: string | null = null
    let lowestScore = Infinity
    for (const [key, entry] of this.entries.entries()) {
      if (entry.importance < lowestScore) {
        lowestScore = entry.importance
        lowestKey = key
      }
    }
    if (lowestKey) this.entries.delete(lowestKey)
  }
}

export const workingMemory = new WorkingMemory()
export type { WorkingMemoryState, WorkingMessage } from '../memory-interfaces'
