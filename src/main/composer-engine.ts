/**
 * Composer Engine — Multi-file coordinated change generation and atomic apply
 *
 * Features:
 *   - LLM generates coordinated changes across multiple files
 *   - Dependency-aware ordering (create before import)
 *   - Atomic apply with snapshot rollback
 *   - Diff preview before applying
 *   - Accept/reject per file
 *
 * Architecture:
 *   ComposerEngine → callAgentLLM() for diff generation
 *                  → SnapshotManager for atomic rollback
 *                  → FolderManager for access control
 */

import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import { callAgentLLM } from './agent-llm-client'
import { createSnapshotBatch, rollbackBatch } from './snapshot-manager'
import type { AgentDefinition } from './agent-registry'

// ── Types ────────────────────────────────────────────────────────────────────

export type ChangeType = 'create' | 'modify' | 'delete' | 'rename'

export interface FileChange {
  id: string
  filePath: string
  changeType: ChangeType
  originalContent?: string     // current file content (for modify/delete)
  newContent?: string          // proposed new content (for create/modify)
  renameTo?: string            // new path (for rename)
  description: string          // human-readable explanation
  language?: string            // file language for syntax highlighting
  accepted: boolean | null     // null = pending, true = accepted, false = rejected
  dependsOn?: string[]         // IDs of changes this depends on
}

export interface ComposerSession {
  id: string
  request: string              // original user request
  projectId?: string
  folderScope?: string         // base directory for changes
  status: 'generating' | 'preview' | 'applying' | 'applied' | 'rolled_back' | 'failed'
  changes: FileChange[]
  snapshotIds: string[]        // for rollback
  createdAt: number
  appliedAt?: number
  error?: string
  tokenEstimate: number
}

// ── Virtual Agent ────────────────────────────────────────────────────────────

const COMPOSER_AGENT: AgentDefinition = {
  id: 'composer',
  name: 'Composer',
  role: 'code',
  description: 'Generates coordinated multi-file changes',
  icon: '🎵',
  preferredModel: 'default',
  fallbackModel: 'default',
  tokenBudget: 8000,
  systemPrompt: `You are a multi-file code composer. Given a user request and the contents of relevant files, generate a set of coordinated file changes.

Output a JSON object with this structure:
{
  "changes": [
    {
      "filePath": "relative/path/to/file.ts",
      "changeType": "create" | "modify" | "delete" | "rename",
      "newContent": "full new file content (for create/modify)",
      "renameTo": "new/path (for rename only)",
      "description": "Brief description of this change",
      "dependsOn": ["id-of-dependency"] // optional, for ordering
    }
  ],
  "summary": "Overall description of all changes",
  "tokenEstimate": 1500
}

Rules:
- For "modify", always include the FULL new file content, not a partial diff
- For "create", ensure parent directories are implied
- Order changes so dependencies come first (e.g., create a file before importing it)
- Each change gets an auto-generated id based on its index (change-0, change-1, etc.)
- Include only files that actually need to change
- Preserve existing code style, indentation, and conventions

Output ONLY valid JSON. No other text.`,
  allowedTools: ['files:read', 'files:write'],
  maxFolderAccess: 'trusted',
  canRequestApproval: true,
  canSpawnSubagents: false,
}

// ── Composer Engine Class ────────────────────────────────────────────────────

class ComposerEngine extends EventEmitter {
  private sessions: Map<string, ComposerSession> = new Map()

  /**
   * Generate a set of multi-file changes from a user request.
   * Reads relevant files, sends to LLM, returns a preview session.
   */
  async compose(opts: {
    request: string
    files: string[]          // file paths to include as context
    projectId?: string
    folderScope?: string
    modelId?: string
  }): Promise<ComposerSession> {
    const id = `comp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    const session: ComposerSession = {
      id,
      request: opts.request,
      projectId: opts.projectId,
      folderScope: opts.folderScope,
      status: 'generating',
      changes: [],
      snapshotIds: [],
      createdAt: Date.now(),
      tokenEstimate: 0,
    }

    this.sessions.set(id, session)
    this.emit('composer:generating', { id, request: opts.request })

    try {
      // Read file contents for context
      const fileContexts = await this.readFileContexts(opts.files)

      // Build prompt with file context
      const prompt = this.buildPrompt(opts.request, fileContexts, opts.folderScope)

      // Call LLM
      const response = await callAgentLLM(COMPOSER_AGENT, prompt)

      // Parse response
      const parsed = this.parseResponse(response)

      // Build changes with original content
      session.changes = await this.buildChanges(parsed.changes, opts.folderScope)
      session.tokenEstimate = parsed.tokenEstimate || 0
      session.status = 'preview'

      this.emit('composer:preview', session)
      return session
    } catch (err: any) {
      session.status = 'failed'
      session.error = err.message
      this.emit('composer:failed', { id, error: err.message })
      throw err
    }
  }

  /**
   * Apply accepted changes from a session.
   * Creates snapshots first, then applies atomically.
   */
  async apply(sessionId: string): Promise<{ applied: number; skipped: number }> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Composer session not found: ${sessionId}`)
    if (session.status !== 'preview') throw new Error(`Session not in preview state: ${session.status}`)

    session.status = 'applying'
    this.emit('composer:applying', { id: sessionId })

    const acceptedChanges = session.changes.filter(c => c.accepted === true)
    const skipped = session.changes.length - acceptedChanges.length

    if (acceptedChanges.length === 0) {
      session.status = 'applied'
      session.appliedAt = Date.now()
      return { applied: 0, skipped }
    }

    // Sort by dependencies
    const ordered = this.topologicalSort(acceptedChanges)

    // Create snapshots for files that exist (modify/delete)
    const existingFiles = ordered
      .filter(c => c.changeType === 'modify' || c.changeType === 'delete' || c.changeType === 'rename')
      .map(c => c.filePath)
      .filter(f => fs.existsSync(f))

    if (existingFiles.length > 0) {
      const snapshots = createSnapshotBatch(existingFiles, `composer-${sessionId}`)
      session.snapshotIds = snapshots.map(s => s.id)
    }

    try {
      for (const change of ordered) {
        await this.applyChange(change)
        this.emit('composer:change-applied', { sessionId, changeId: change.id, filePath: change.filePath })
      }

      session.status = 'applied'
      session.appliedAt = Date.now()
      this.emit('composer:applied', { id: sessionId, applied: acceptedChanges.length, skipped })

      return { applied: acceptedChanges.length, skipped }
    } catch (err: any) {
      // Rollback all snapshots
      if (session.snapshotIds.length > 0) {
        rollbackBatch(session.snapshotIds)
      }
      session.status = 'failed'
      session.error = `Apply failed, rolled back: ${err.message}`
      this.emit('composer:failed', { id: sessionId, error: session.error })
      throw err
    }
  }

  /**
   * Rollback a previously applied session using its snapshots.
   */
  rollback(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'applied') return false

    if (session.snapshotIds.length > 0) {
      const result = rollbackBatch(session.snapshotIds)
      if (result.failed.length > 0) {
        console.warn(`[Composer] Partial rollback — failed: ${result.failed.join(', ')}`)
      }
    }

    // Also delete any created files
    for (const change of session.changes) {
      if (change.changeType === 'create' && change.accepted && fs.existsSync(change.filePath)) {
        try {
          fs.unlinkSync(change.filePath)
        } catch { /* ignore */ }
      }
    }

    session.status = 'rolled_back'
    this.emit('composer:rolled-back', { id: sessionId })
    return true
  }

  /**
   * Accept or reject a specific file change
   */
  setChangeAcceptance(sessionId: string, changeId: string, accepted: boolean): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'preview') return false

    const change = session.changes.find(c => c.id === changeId)
    if (!change) return false

    change.accepted = accepted
    this.emit('composer:change-decision', { sessionId, changeId, accepted })
    return true
  }

  /**
   * Accept all changes in a session
   */
  acceptAll(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'preview') return false

    for (const c of session.changes) c.accepted = true
    return true
  }

  /**
   * Reject all changes
   */
  rejectAll(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'preview') return false

    for (const c of session.changes) c.accepted = false
    session.status = 'applied' // effectively discarded
    return true
  }

  getSession(id: string): ComposerSession | undefined {
    return this.sessions.get(id)
  }

  listSessions(): ComposerSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  // ── Private: Prompt Building ────────────────────────────────────────────

  private async readFileContexts(filePaths: string[]): Promise<Array<{ path: string; content: string; exists: boolean }>> {
    const results: Array<{ path: string; content: string; exists: boolean }> = []

    for (const fp of filePaths) {
      try {
        if (fs.existsSync(fp)) {
          const content = fs.readFileSync(fp, 'utf-8')
          results.push({ path: fp, content, exists: true })
        } else {
          results.push({ path: fp, content: '', exists: false })
        }
      } catch {
        results.push({ path: fp, content: '', exists: false })
      }
    }

    return results
  }

  private buildPrompt(request: string, files: Array<{ path: string; content: string; exists: boolean }>, folderScope?: string): string {
    const parts: string[] = [
      `User request: ${request}`,
      '',
      `Working directory: ${folderScope || 'unknown'}`,
      '',
      '=== Current Files ===',
    ]

    for (const f of files) {
      if (f.exists) {
        // Truncate very large files
        const content = f.content.length > 10000 ? f.content.slice(0, 10000) + '\n... (truncated)' : f.content
        parts.push(`\n--- ${f.path} ---\n${content}`)
      } else {
        parts.push(`\n--- ${f.path} --- (does not exist yet)`)
      }
    }

    parts.push('\n=== End Files ===')
    parts.push('\nGenerate the coordinated multi-file changes as JSON.')

    return parts.join('\n')
  }

  // ── Private: Response Parsing ───────────────────────────────────────────

  private parseResponse(response: string): { changes: any[]; tokenEstimate: number } {
    // 3-tier JSON parsing (consistent with plan-engine, computer-use-agent)
    try {
      const parsed = JSON.parse(response)
      return { changes: parsed.changes || [], tokenEstimate: parsed.tokenEstimate || 0 }
    } catch { /* fallthrough */ }

    try {
      const match = response.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (match) {
        const parsed = JSON.parse(match[1])
        return { changes: parsed.changes || [], tokenEstimate: parsed.tokenEstimate || 0 }
      }
    } catch { /* fallthrough */ }

    try {
      const match = response.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        return { changes: parsed.changes || [], tokenEstimate: parsed.tokenEstimate || 0 }
      }
    } catch { /* fallthrough */ }

    throw new Error('Failed to parse composer response as JSON')
  }

  private async buildChanges(rawChanges: any[], folderScope?: string): Promise<FileChange[]> {
    return rawChanges.map((raw, i) => {
      const filePath = folderScope ? path.resolve(folderScope, raw.filePath) : raw.filePath

      let originalContent: string | undefined
      if ((raw.changeType === 'modify' || raw.changeType === 'delete') && fs.existsSync(filePath)) {
        originalContent = fs.readFileSync(filePath, 'utf-8')
      }

      const ext = path.extname(filePath).slice(1)
      const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        py: 'python', rs: 'rust', go: 'go', css: 'css', html: 'html',
        json: 'json', md: 'markdown', yaml: 'yaml', yml: 'yaml',
      }

      return {
        id: `change-${i}`,
        filePath,
        changeType: raw.changeType || 'modify',
        originalContent,
        newContent: raw.newContent,
        renameTo: raw.renameTo ? (folderScope ? path.resolve(folderScope, raw.renameTo) : raw.renameTo) : undefined,
        description: raw.description || `Change ${filePath}`,
        language: langMap[ext] || ext,
        accepted: null,
        dependsOn: raw.dependsOn,
      }
    })
  }

  // ── Private: Apply ──────────────────────────────────────────────────────

  private async applyChange(change: FileChange): Promise<void> {
    const dir = path.dirname(change.filePath)

    switch (change.changeType) {
      case 'create':
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(change.filePath, change.newContent || '', 'utf-8')
        break

      case 'modify':
        if (!change.newContent) throw new Error(`No new content for modify: ${change.filePath}`)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(change.filePath, change.newContent, 'utf-8')
        break

      case 'delete':
        if (fs.existsSync(change.filePath)) {
          fs.unlinkSync(change.filePath)
        }
        break

      case 'rename':
        if (!change.renameTo) throw new Error(`No renameTo for rename: ${change.filePath}`)
        const renameDir = path.dirname(change.renameTo)
        fs.mkdirSync(renameDir, { recursive: true })
        fs.renameSync(change.filePath, change.renameTo)
        break
    }
  }

  // ── Private: Topological Sort ───────────────────────────────────────────

  private topologicalSort(changes: FileChange[]): FileChange[] {
    const idMap = new Map(changes.map(c => [c.id, c]))
    const visited = new Set<string>()
    const result: FileChange[] = []

    const visit = (c: FileChange) => {
      if (visited.has(c.id)) return
      visited.add(c.id)

      // Visit dependencies first
      for (const depId of (c.dependsOn || [])) {
        const dep = idMap.get(depId)
        if (dep) visit(dep)
      }

      result.push(c)
    }

    // Prioritize creates before modifies
    const sorted = [...changes].sort((a, b) => {
      const order: Record<ChangeType, number> = { create: 0, rename: 1, modify: 2, delete: 3 }
      return (order[a.changeType] ?? 2) - (order[b.changeType] ?? 2)
    })

    for (const c of sorted) visit(c)
    return result
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────

export const composerEngine = new ComposerEngine()
