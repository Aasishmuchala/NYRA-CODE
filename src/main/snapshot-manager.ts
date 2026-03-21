import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { memory } from './memory'
import { eventBus } from './event-bus'

export interface FileSnapshot {
  id: string
  filePath: string
  contentHash: string
  taskId: string | null
  createdAt: number
}

interface StoredSnapshot extends FileSnapshot {
  content: Buffer
}

/**
 * Create a snapshot of a file's current state.
 * Reads the file, computes its hash, and stores the content for rollback.
 */
export function createSnapshot(filePath: string, taskId?: string): FileSnapshot {
  try {
    // Read file content
    const content = fs.readFileSync(filePath)

    // Compute SHA256 hash
    const contentHash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')

    // Generate snapshot ID
    const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const createdAt = Date.now()

    const snapshot: FileSnapshot = {
      id,
      filePath,
      contentHash,
      taskId: taskId || null,
      createdAt,
    }

    // Store the snapshot with its content
    const storedSnapshot: StoredSnapshot = {
      ...snapshot,
      content,
    }

    memory.fileSnapshots.set(id, storedSnapshot)

    // Emit event
    eventBus.emit('audit:snapshot-created', {
      snapshotId: id,
      filePath,
      taskId: taskId || null,
      contentHash,
    })

    return snapshot
  } catch (error) {
    throw new Error(
      `Failed to create snapshot for ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

/**
 * Get snapshot metadata by ID.
 */
export function getSnapshot(snapshotId: string): FileSnapshot | null {
  const stored = memory.fileSnapshots.get(snapshotId)
  if (!stored) return null

  return {
    id: stored.id,
    filePath: stored.filePath,
    contentHash: stored.contentHash,
    taskId: stored.taskId,
    createdAt: stored.createdAt,
  }
}

/**
 * Get all snapshots for a specific file.
 */
export function getSnapshotsForFile(filePath: string): FileSnapshot[] {
  const results: FileSnapshot[] = []

  memory.fileSnapshots.forEach((stored) => {
    if (stored.filePath === filePath) {
      results.push({
        id: stored.id,
        filePath: stored.filePath,
        contentHash: stored.contentHash,
        taskId: stored.taskId,
        createdAt: stored.createdAt,
      })
    }
  })

  return results.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Rollback a file to a previous snapshot.
 * Restores the file content from the snapshot.
 */
export function rollback(snapshotId: string): boolean {
  try {
    const stored = memory.fileSnapshots.get(snapshotId)

    if (!stored) {
      throw new Error(`Snapshot not found: ${snapshotId}`)
    }

    const { filePath, content } = stored

    // Ensure directory exists
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Write content back to file
    fs.writeFileSync(filePath, content)

    eventBus.emit('audit:rollback-executed', {
      snapshotId,
      filePath,
    })

    return true
  } catch (error) {
    console.error(
      `Rollback failed for snapshot ${snapshotId}:`,
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}

/**
 * Get the content of a snapshot.
 */
export function getSnapshotContent(snapshotId: string): Buffer | null {
  const stored = memory.fileSnapshots.get(snapshotId)
  return stored ? stored.content : null
}

/**
 * Remove snapshots older than a specified age.
 * Returns the number of snapshots deleted.
 */
export function pruneOldSnapshots(maxAge: number): number {
  const cutoffTime = Date.now() - maxAge
  let pruned = 0

  const idsToDelete: string[] = []

  memory.fileSnapshots.forEach((stored, id) => {
    if (stored.createdAt < cutoffTime) {
      idsToDelete.push(id)
      pruned++
    }
  })

  idsToDelete.forEach((id) => {
    memory.fileSnapshots.delete(id)
  })

  if (pruned > 0) {
    eventBus.emit('audit:snapshots-pruned', {
      count: pruned,
      cutoffTime,
    })
  }

  return pruned
}

/**
 * Get snapshots for a specific task.
 */
export function getSnapshotsByTask(taskId: string): FileSnapshot[] {
  const results: FileSnapshot[] = []

  memory.fileSnapshots.forEach((stored) => {
    if (stored.taskId === taskId) {
      results.push({
        id: stored.id,
        filePath: stored.filePath,
        contentHash: stored.contentHash,
        taskId: stored.taskId,
        createdAt: stored.createdAt,
      })
    }
  })

  return results.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Get all snapshots in the system.
 */
export function getAllSnapshots(
  limit?: number,
  offset: number = 0
): FileSnapshot[] {
  const results: FileSnapshot[] = []

  memory.fileSnapshots.forEach((stored) => {
    results.push({
      id: stored.id,
      filePath: stored.filePath,
      contentHash: stored.contentHash,
      taskId: stored.taskId,
      createdAt: stored.createdAt,
    })
  })

  results.sort((a, b) => b.createdAt - a.createdAt)

  if (limit) {
    return results.slice(offset, offset + limit)
  }

  return results.slice(offset)
}

/**
 * Get snapshot count with optional filtering.
 */
export function getSnapshotCount(filePath?: string, taskId?: string): number {
  let count = 0

  memory.fileSnapshots.forEach((stored) => {
    if (filePath && stored.filePath !== filePath) return
    if (taskId && stored.taskId !== taskId) return
    count++
  })

  return count
}

/**
 * Delete a specific snapshot.
 */
export function deleteSnapshot(snapshotId: string): boolean {
  const existed = memory.fileSnapshots.has(snapshotId)

  if (existed) {
    memory.fileSnapshots.delete(snapshotId)
    eventBus.emit('audit:snapshot-deleted', { snapshotId })
  }

  return existed
}

/**
 * Delete all snapshots for a specific file.
 */
export function deleteSnapshotsForFile(filePath: string): number {
  let deleted = 0
  const idsToDelete: string[] = []

  memory.fileSnapshots.forEach((stored, id) => {
    if (stored.filePath === filePath) {
      idsToDelete.push(id)
      deleted++
    }
  })

  idsToDelete.forEach((id) => {
    memory.fileSnapshots.delete(id)
  })

  if (deleted > 0) {
    eventBus.emit('audit:file-snapshots-deleted', {
      filePath,
      count: deleted,
    })
  }

  return deleted
}

/**
 * Delete all snapshots for a specific task.
 */
export function deleteSnapshotsByTask(taskId: string): number {
  let deleted = 0
  const idsToDelete: string[] = []

  memory.fileSnapshots.forEach((stored, id) => {
    if (stored.taskId === taskId) {
      idsToDelete.push(id)
      deleted++
    }
  })

  idsToDelete.forEach((id) => {
    memory.fileSnapshots.delete(id)
  })

  if (deleted > 0) {
    eventBus.emit('audit:task-snapshots-deleted', {
      taskId,
      count: deleted,
    })
  }

  return deleted
}

/**
 * Compare current file state with a snapshot.
 * Returns true if the file content is identical to the snapshot.
 */
export function isFileUnchangedSinceSnapshot(snapshotId: string): boolean {
  try {
    const stored = memory.fileSnapshots.get(snapshotId)

    if (!stored) {
      throw new Error(`Snapshot not found: ${snapshotId}`)
    }

    if (!fs.existsSync(stored.filePath)) {
      return false // File no longer exists
    }

    const currentContent = fs.readFileSync(stored.filePath)
    const currentHash = crypto
      .createHash('sha256')
      .update(currentContent)
      .digest('hex')

    return currentHash === stored.contentHash
  } catch (error) {
    console.error(
      `Error checking file snapshot state:`,
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}

/**
 * Get snapshot statistics.
 */
export function getSnapshotStats(): {
  total: number
  byFile: Record<string, number>
  byTask: Record<string, number>
  totalSize: number
  oldestSnapshot: number | null
  newestSnapshot: number | null
} {
  const byFile: Record<string, number> = {}
  const byTask: Record<string, number> = {}
  let totalSize = 0
  let oldestSnapshot: number | null = null
  let newestSnapshot: number | null = null

  memory.fileSnapshots.forEach((stored) => {
    // Count by file
    byFile[stored.filePath] = (byFile[stored.filePath] || 0) + 1

    // Count by task
    if (stored.taskId) {
      byTask[stored.taskId] = (byTask[stored.taskId] || 0) + 1
    }

    // Total size
    totalSize += stored.content.length

    // Track oldest and newest
    if (oldestSnapshot === null || stored.createdAt < oldestSnapshot) {
      oldestSnapshot = stored.createdAt
    }

    if (newestSnapshot === null || stored.createdAt > newestSnapshot) {
      newestSnapshot = stored.createdAt
    }
  })

  return {
    total: memory.fileSnapshots.size,
    byFile,
    byTask,
    totalSize,
    oldestSnapshot,
    newestSnapshot,
  }
}

/**
 * Verify snapshot integrity by checking hash.
 * Returns true if the stored content matches the computed hash.
 */
export function verifySnapshotIntegrity(snapshotId: string): boolean {
  try {
    const stored = memory.fileSnapshots.get(snapshotId)

    if (!stored) {
      throw new Error(`Snapshot not found: ${snapshotId}`)
    }

    const computedHash = crypto
      .createHash('sha256')
      .update(stored.content)
      .digest('hex')

    return computedHash === stored.contentHash
  } catch (error) {
    console.error(
      `Error verifying snapshot integrity:`,
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}

/**
 * Create multiple snapshots at once (e.g., before a batch operation).
 */
export function createSnapshotBatch(
  filePaths: string[],
  taskId?: string
): FileSnapshot[] {
  const snapshots: FileSnapshot[] = []

  for (const filePath of filePaths) {
    try {
      const snapshot = createSnapshot(filePath, taskId)
      snapshots.push(snapshot)
    } catch (error) {
      console.warn(
        `Failed to snapshot ${filePath}:`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  return snapshots
}

/**
 * Rollback multiple files using their snapshots.
 */
export function rollbackBatch(snapshotIds: string[]): { success: string[]; failed: string[] } {
  const success: string[] = []
  const failed: string[] = []

  for (const snapshotId of snapshotIds) {
    if (rollback(snapshotId)) {
      success.push(snapshotId)
    } else {
      failed.push(snapshotId)
    }
  }

  return { success, failed }
}
