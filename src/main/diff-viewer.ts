/**
 * Diff Viewer — Compute and display side-by-side code diffs
 *
 * Implements a minimal Myers diff algorithm in pure TypeScript.
 * No external dependencies. Stores diff history for review.
 */

import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

type DiffLineType = 'equal' | 'add' | 'remove'

interface DiffLine {
  type: DiffLineType
  content: string
  oldLineNum?: number
  newLineNum?: number
}

interface DiffHunk {
  oldStart: number
  oldLength: number
  newStart: number
  newLength: number
  lines: DiffLine[]
}

interface DiffResult {
  id: string
  fileName: string
  oldContent: string
  newContent: string
  hunks: DiffHunk[]
  additions: number
  deletions: number
  timestamp: number
}

// ── Myers Diff ───────────────────────────────────────────────────────────────

function myersDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const N = oldLines.length
  const M = newLines.length
  const MAX = N + M

  if (MAX === 0) return []
  if (N === 0) return newLines.map((line, i) => ({ type: 'add' as DiffLineType, content: line, newLineNum: i + 1 }))
  if (M === 0) return oldLines.map((line, i) => ({ type: 'remove' as DiffLineType, content: line, oldLineNum: i + 1 }))

  // For large files, fall back to a simpler LCS approach
  if (MAX > 10000) return simpleDiff(oldLines, newLines)

  const V: number[] = new Array(2 * MAX + 1).fill(0)
  const trace: number[][] = []

  for (let d = 0; d <= MAX; d++) {
    trace.push([...V])
    for (let k = -d; k <= d; k += 2) {
      let x: number
      if (k === -d || (k !== d && V[k - 1 + MAX] < V[k + 1 + MAX])) {
        x = V[k + 1 + MAX]
      } else {
        x = V[k - 1 + MAX] + 1
      }
      let y = x - k
      while (x < N && y < M && oldLines[x] === newLines[y]) { x++; y++ }
      V[k + MAX] = x
      if (x >= N && y >= M) {
        return buildResult(trace, oldLines, newLines, d, MAX)
      }
    }
  }

  return simpleDiff(oldLines, newLines)
}

function buildResult(trace: number[][], oldLines: string[], newLines: string[], dFinal: number, MAX: number): DiffLine[] {
  const result: DiffLine[] = []
  let x = oldLines.length
  let y = newLines.length

  const moves: Array<{ prevX: number; prevY: number; x: number; y: number }> = []

  for (let d = dFinal; d > 0; d--) {
    const V = trace[d - 1]
    const k = x - y
    let prevK: number
    if (k === -d || (k !== d && V[k - 1 + MAX] < V[k + 1 + MAX])) {
      prevK = k + 1
    } else {
      prevK = k - 1
    }
    const prevX = V[prevK + MAX]
    const prevY = prevX - prevK

    // Diagonal (equal lines)
    while (x > prevX + (prevK < k ? 1 : 0) && y > prevY + (prevK < k ? 0 : 1)) {
      x--; y--
      moves.push({ prevX: x, prevY: y, x: x + 1, y: y + 1 })
    }

    if (d > 0) {
      if (prevK < k) {
        // Delete
        moves.push({ prevX: prevX, prevY: prevY, x: prevX + 1, y: prevY })
      } else {
        // Insert
        moves.push({ prevX: prevX, prevY: prevY, x: prevX, y: prevY + 1 })
      }
    }
    x = prevX
    y = prevY
  }

  // Remaining diagonal at start
  while (x > 0 && y > 0) {
    x--; y--
    moves.push({ prevX: x, prevY: y, x: x + 1, y: y + 1 })
  }

  moves.reverse()

  let oldIdx = 0, newIdx = 0
  for (const move of moves) {
    const dx = move.x - move.prevX
    const dy = move.y - move.prevY
    if (dx === 1 && dy === 1) {
      result.push({ type: 'equal', content: oldLines[oldIdx], oldLineNum: oldIdx + 1, newLineNum: newIdx + 1 })
      oldIdx++; newIdx++
    } else if (dx === 1 && dy === 0) {
      result.push({ type: 'remove', content: oldLines[oldIdx], oldLineNum: oldIdx + 1 })
      oldIdx++
    } else if (dx === 0 && dy === 1) {
      result.push({ type: 'add', content: newLines[newIdx], newLineNum: newIdx + 1 })
      newIdx++
    }
  }

  return result
}

function simpleDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  // Line-by-line comparison fallback for large files
  const result: DiffLine[] = []
  const maxLen = Math.max(oldLines.length, newLines.length)
  let oldIdx = 0, newIdx = 0

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx < oldLines.length && newIdx < newLines.length && oldLines[oldIdx] === newLines[newIdx]) {
      result.push({ type: 'equal', content: oldLines[oldIdx], oldLineNum: oldIdx + 1, newLineNum: newIdx + 1 })
      oldIdx++; newIdx++
    } else if (oldIdx < oldLines.length) {
      result.push({ type: 'remove', content: oldLines[oldIdx], oldLineNum: oldIdx + 1 })
      oldIdx++
    } else {
      result.push({ type: 'add', content: newLines[newIdx], newLineNum: newIdx + 1 })
      newIdx++
    }
  }
  return result
}

// ── Hunk Builder ─────────────────────────────────────────────────────────────

function buildHunks(diffLines: DiffLine[], contextLines: number = 3): DiffHunk[] {
  const hunks: DiffHunk[] = []
  const changeIndices: number[] = []

  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type !== 'equal') changeIndices.push(i)
  }

  if (changeIndices.length === 0) return []

  let hunkStart = Math.max(0, changeIndices[0] - contextLines)
  let hunkEnd = Math.min(diffLines.length - 1, changeIndices[0] + contextLines)

  const hunkGroups: Array<{ start: number; end: number }> = [{ start: hunkStart, end: hunkEnd }]

  for (let i = 1; i < changeIndices.length; i++) {
    const newStart = Math.max(0, changeIndices[i] - contextLines)
    const newEnd = Math.min(diffLines.length - 1, changeIndices[i] + contextLines)

    if (newStart <= hunkGroups[hunkGroups.length - 1].end + 1) {
      hunkGroups[hunkGroups.length - 1].end = newEnd
    } else {
      hunkGroups.push({ start: newStart, end: newEnd })
    }
  }

  for (const group of hunkGroups) {
    const lines = diffLines.slice(group.start, group.end + 1)
    const oldStart = lines.find(l => l.oldLineNum)?.oldLineNum || 1
    const newStart = lines.find(l => l.newLineNum)?.newLineNum || 1
    const oldLength = lines.filter(l => l.type === 'equal' || l.type === 'remove').length
    const newLength = lines.filter(l => l.type === 'equal' || l.type === 'add').length
    hunks.push({ oldStart, oldLength, newStart, newLength, lines })
  }

  return hunks
}

// ── Diff Viewer ──────────────────────────────────────────────────────────────

export class DiffViewer {
  private db: any = null

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS diff_history (
            id TEXT PRIMARY KEY, fileName TEXT NOT NULL, oldContent TEXT NOT NULL,
            newContent TEXT NOT NULL, additions INTEGER DEFAULT 0,
            deletions INTEGER DEFAULT 0, timestamp INTEGER NOT NULL)`)
        run(`CREATE INDEX IF NOT EXISTS idx_diff_ts ON diff_history(timestamp)`)
        console.log('[DiffViewer] Initialized')
      }
    } catch (error) {
      console.warn('[DiffViewer] Init error (non-fatal):', error)
    }
  }

  computeDiff(oldContent: string, newContent: string, fileName: string = 'untitled'): DiffResult {
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')
    const diffLines = myersDiff(oldLines, newLines)
    const hunks = buildHunks(diffLines)
    const additions = diffLines.filter(l => l.type === 'add').length
    const deletions = diffLines.filter(l => l.type === 'remove').length
    const id = randomUUID()
    const timestamp = Date.now()

    const result: DiffResult = { id, fileName, oldContent, newContent, hunks, additions, deletions, timestamp }

    // Persist
    if (this.db) {
      try {
        this.db.prepare(`INSERT INTO diff_history (id, fileName, oldContent, newContent, additions, deletions, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(id, fileName, oldContent, newContent, additions, deletions, timestamp)
        // Prune (keep last 50)
        this.db.prepare(`DELETE FROM diff_history WHERE id NOT IN (SELECT id FROM diff_history ORDER BY timestamp DESC LIMIT 50)`).run()
      } catch { /* non-fatal */ }
    }

    return result
  }

  getDiff(id: string): DiffResult | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM diff_history WHERE id = ?`).get(id) as any
    if (!row) return null
    // Recompute hunks from stored content
    return this.computeDiffFromRow(row)
  }

  listHistory(limit: number = 20): Array<{ id: string; fileName: string; additions: number; deletions: number; timestamp: number }> {
    if (!this.db) return []
    return (this.db.prepare(`SELECT id, fileName, additions, deletions, timestamp FROM diff_history ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[])
  }

  clearHistory(): void {
    if (!this.db) return
    this.db.prepare(`DELETE FROM diff_history`).run()
  }

  private computeDiffFromRow(row: any): DiffResult {
    const oldLines = row.oldContent.split('\n')
    const newLines = row.newContent.split('\n')
    const diffLines = myersDiff(oldLines, newLines)
    const hunks = buildHunks(diffLines)
    return {
      id: row.id, fileName: row.fileName, oldContent: row.oldContent, newContent: row.newContent,
      hunks, additions: row.additions, deletions: row.deletions, timestamp: row.timestamp,
    }
  }
}

export const diffViewer = new DiffViewer()
