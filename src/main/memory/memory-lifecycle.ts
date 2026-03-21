import { randomUUID } from 'crypto'
import { memoryManager } from '../memory'
import { workingMemory } from './tiers/working-memory'
import { memoryArchitect } from './memory-architecture'
import type { MemoryEntry, WorkingMemoryState, WorkingMessage } from './memory-interfaces'

// ─── Types ───────────────────────────────────────────────────

export interface MemorySession {
  id: string
  startedAt: number
  endedAt: number | null
  memoriesCreated: number
  summary: string | null
  snapshotId: string | null
}

export interface WorkingMemorySnapshot {
  id: string
  sessionId: string
  state: WorkingMemoryState
  entries: MemoryEntry[]
  createdAt: number
}

export interface LifecycleStats {
  totalSessions: number
  currentSessionId: string | null
  currentSessionDuration: number
  lastSnapshotAt: number | null
  snapshotCount: number
}

// ─── MemoryLifecycleManager ──────────────────────────────────

/**
 * Manages cross-session memory persistence.
 *
 * Working memory is volatile by design — it lives in RAM and vanishes on quit.
 * This manager bridges that gap by snapshotting working memory to SQLite on
 * app quit and restoring the most recent snapshot on app startup.
 *
 * Also tracks session lifecycle: start/end timestamps, memories per session,
 * and optional session summaries for the archival tier.
 */
class MemoryLifecycleManager {
  private currentSessionId: string | null = null
  private sessionStartTime: number = 0
  private memoriesCreatedThisSession: number = 0
  private initialized = false

  // ── Initialization ────────────────────────────────────────

  /**
   * Create persistence tables and start a new session.
   * Called during app startup, after memoryManager.init().
   */
  async init(): Promise<void> {
    if (this.initialized) return

    this.createTables()
    this.startSession()
    this.initialized = true

    console.log(`[MemoryLifecycle] Initialized — session ${this.currentSessionId}`)
  }

  private createTables(): void {
    // Session tracking table
    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS memory_sessions (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        memories_created INTEGER DEFAULT 0,
        summary TEXT,
        snapshot_id TEXT
      )
    `)

    // Working memory snapshots table
    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS working_memory_snapshots (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        state_json TEXT NOT NULL,
        entries_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)

    // Index for fast latest-snapshot lookup
    memoryManager.run(`
      CREATE INDEX IF NOT EXISTS idx_wm_snapshots_created
      ON working_memory_snapshots(created_at DESC)
    `)

    memoryManager.run(`
      CREATE INDEX IF NOT EXISTS idx_sessions_started
      ON memory_sessions(started_at DESC)
    `)
  }

  // ── Session Lifecycle ─────────────────────────────────────

  private startSession(): void {
    this.currentSessionId = randomUUID()
    this.sessionStartTime = Date.now()
    this.memoriesCreatedThisSession = 0

    try {
      memoryManager.run(
        `INSERT INTO memory_sessions (id, started_at, memories_created) VALUES (?, ?, 0)`,
        [this.currentSessionId, this.sessionStartTime]
      )
    } catch (err) {
      console.error('[MemoryLifecycle] Failed to insert session row:', err)
    }
  }

  /**
   * End the current session. Called on app quit (before-quit event).
   * Records end time and final memory count.
   */
  endSession(summary?: string): void {
    if (!this.currentSessionId) return

    try {
      memoryManager.run(
        `UPDATE memory_sessions SET ended_at = ?, memories_created = ?, summary = ? WHERE id = ?`,
        [Date.now(), this.memoriesCreatedThisSession, summary ?? null, this.currentSessionId]
      )
      console.log(`[MemoryLifecycle] Session ${this.currentSessionId} ended — ${this.memoriesCreatedThisSession} memories created`)
    } catch (err) {
      console.error('[MemoryLifecycle] Failed to end session:', err)
    }
  }

  /** Track that a memory was created during this session */
  trackMemoryCreated(): void {
    this.memoriesCreatedThisSession++
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId
  }

  // ── Snapshot: Save ────────────────────────────────────────

  /**
   * Snapshot current working memory state + entries to SQLite.
   * Called on app quit so the next launch can restore context.
   */
  async saveSnapshot(): Promise<string | null> {
    if (!this.currentSessionId) return null

    try {
      const state = workingMemory.getState()
      const entries = await workingMemory.list(0, 100) // Get all working memory entries

      const snapshotId = randomUUID()
      const now = Date.now()

      // Serialize state — convert to plain objects for JSON
      const stateJson = JSON.stringify(state)
      const entriesJson = JSON.stringify(entries.map(e => ({
        ...e,
        // Float32Array isn't JSON-serializable, strip embeddings
        embedding: undefined,
      })))

      memoryManager.run(
        `INSERT INTO working_memory_snapshots (id, session_id, state_json, entries_json, created_at) VALUES (?, ?, ?, ?, ?)`,
        [snapshotId, this.currentSessionId, stateJson, entriesJson, now]
      )

      // Link snapshot to session
      memoryManager.run(
        `UPDATE memory_sessions SET snapshot_id = ? WHERE id = ?`,
        [snapshotId, this.currentSessionId]
      )

      console.log(`[MemoryLifecycle] Snapshot saved: ${snapshotId} (${entries.length} entries, state: ${stateJson.length} bytes)`)

      // Prune old snapshots — keep only last 10
      this.pruneOldSnapshots(10)

      return snapshotId
    } catch (err) {
      console.error('[MemoryLifecycle] Failed to save snapshot:', err)
      return null
    }
  }

  // ── Snapshot: Restore ─────────────────────────────────────

  /**
   * Restore the most recent working memory snapshot.
   * Called on app startup, after workingMemory.init().
   * Returns true if a snapshot was restored, false otherwise.
   */
  async restoreSnapshot(): Promise<boolean> {
    try {
      const snapshot = this.getLatestSnapshot()
      if (!snapshot) {
        console.log('[MemoryLifecycle] No previous snapshot found — starting fresh')
        return false
      }

      const state: WorkingMemoryState = JSON.parse(snapshot.state_json)
      const entries: MemoryEntry[] = JSON.parse(snapshot.entries_json)

      // Restore state fields
      if (state.currentTask) {
        workingMemory.setCurrentTask(state.currentTask)
      }

      // Restore recent messages
      for (const msg of state.recentMessages ?? []) {
        workingMemory.addMessage(msg as WorkingMessage)
      }

      // Restore scratchpad values
      for (const [key, value] of Object.entries(state.scratchpad ?? {})) {
        workingMemory.setScratchpad(key, value)
      }

      // Restore memory entries
      let restoredCount = 0
      for (const entry of entries) {
        await workingMemory.add(entry)
        restoredCount++
      }

      console.log(`[MemoryLifecycle] Restored snapshot ${snapshot.id}: ${restoredCount} entries, task="${state.currentTask ?? 'none'}"`)
      return true
    } catch (err) {
      console.error('[MemoryLifecycle] Failed to restore snapshot:', err)
      return false
    }
  }

  // ── Query Helpers ─────────────────────────────────────────

  private getLatestSnapshot(): { id: string; session_id: string; state_json: string; entries_json: string; created_at: number } | null {
    try {
      const db = (memoryManager as any).db
      if (!db) return null

      const stmt = db.prepare(
        `SELECT id, session_id, state_json, entries_json, created_at
         FROM working_memory_snapshots
         ORDER BY created_at DESC
         LIMIT 1`
      )
      return stmt.get() as any ?? null
    } catch (err) {
      console.error('[MemoryLifecycle] Failed to get latest snapshot:', err)
      return null
    }
  }

  /**
   * Get recent sessions for the session history UI.
   */
  getRecentSessions(limit = 20): MemorySession[] {
    try {
      const db = (memoryManager as any).db
      if (!db) return []

      const stmt = db.prepare(
        `SELECT id, started_at, ended_at, memories_created, summary, snapshot_id
         FROM memory_sessions
         ORDER BY started_at DESC
         LIMIT ?`
      )
      const rows = stmt.all(limit) as any[]

      return rows.map(row => ({
        id: row.id,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        memoriesCreated: row.memories_created,
        summary: row.summary,
        snapshotId: row.snapshot_id,
      }))
    } catch (err) {
      console.error('[MemoryLifecycle] Failed to get recent sessions:', err)
      return []
    }
  }

  /**
   * Load a specific snapshot (for restoring to a previous session's state).
   */
  getSnapshot(snapshotId: string): WorkingMemorySnapshot | null {
    try {
      const db = (memoryManager as any).db
      if (!db) return null

      const stmt = db.prepare(
        `SELECT id, session_id, state_json, entries_json, created_at
         FROM working_memory_snapshots
         WHERE id = ?`
      )
      const row = stmt.get(snapshotId) as any
      if (!row) return null

      return {
        id: row.id,
        sessionId: row.session_id,
        state: JSON.parse(row.state_json),
        entries: JSON.parse(row.entries_json),
        createdAt: row.created_at,
      }
    } catch (err) {
      console.error('[MemoryLifecycle] Failed to get snapshot:', err)
      return null
    }
  }

  /**
   * Restore a specific historical snapshot into working memory.
   * Clears current working memory first.
   */
  async restoreFromSnapshot(snapshotId: string): Promise<boolean> {
    const snapshot = this.getSnapshot(snapshotId)
    if (!snapshot) return false

    // Clear current working memory
    workingMemory.clear()

    // Restore state
    if (snapshot.state.currentTask) {
      workingMemory.setCurrentTask(snapshot.state.currentTask)
    }
    for (const msg of snapshot.state.recentMessages ?? []) {
      workingMemory.addMessage(msg)
    }
    for (const [key, value] of Object.entries(snapshot.state.scratchpad ?? {})) {
      workingMemory.setScratchpad(key, value)
    }

    // Restore entries
    for (const entry of snapshot.entries) {
      await workingMemory.add(entry)
    }

    console.log(`[MemoryLifecycle] Restored historical snapshot ${snapshotId}`)
    return true
  }

  // ── Lifecycle Stats ───────────────────────────────────────

  getStats(): LifecycleStats {
    const db = (memoryManager as any).db

    let totalSessions = 0
    let snapshotCount = 0
    let lastSnapshotAt: number | null = null

    try {
      if (db) {
        const sessionRow = db.prepare('SELECT COUNT(*) as count FROM memory_sessions').get() as any
        totalSessions = sessionRow?.count ?? 0

        const snapshotRow = db.prepare('SELECT COUNT(*) as count FROM working_memory_snapshots').get() as any
        snapshotCount = snapshotRow?.count ?? 0

        const latestRow = db.prepare('SELECT MAX(created_at) as latest FROM working_memory_snapshots').get() as any
        lastSnapshotAt = latestRow?.latest ?? null
      }
    } catch {
      // Tables might not exist yet
    }

    return {
      totalSessions,
      currentSessionId: this.currentSessionId,
      currentSessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      lastSnapshotAt,
      snapshotCount,
    }
  }

  // ── Cleanup ───────────────────────────────────────────────

  private pruneOldSnapshots(keepCount: number): void {
    try {
      const db = (memoryManager as any).db
      if (!db) return

      // Delete all but the N most recent snapshots
      db.prepare(`
        DELETE FROM working_memory_snapshots
        WHERE id NOT IN (
          SELECT id FROM working_memory_snapshots
          ORDER BY created_at DESC
          LIMIT ?
        )
      `).run(keepCount)
    } catch (err) {
      console.error('[MemoryLifecycle] Failed to prune snapshots:', err)
    }
  }

  /**
   * Full shutdown sequence: end session, save snapshot, close.
   * This is the single call for Electron's before-quit handler.
   */
  async shutdown(sessionSummary?: string): Promise<void> {
    console.log('[MemoryLifecycle] Shutdown sequence starting...')

    // 1. Save working memory snapshot
    await this.saveSnapshot()

    // 2. End the current session
    this.endSession(sessionSummary)

    // 3. Stop compaction timer
    memoryArchitect.stopCompaction()

    console.log('[MemoryLifecycle] Shutdown complete')
  }
}

export const memoryLifecycle = new MemoryLifecycleManager()
