import * as fs from 'fs'
import * as path from 'path'
import { eventBus } from './event-bus'

// In-memory stores (the SQLite tables exist for persistence, but this module
// was written using in-memory storage for MVP simplicity)
const foldersStore: Map<string, ManagedFolder> = new Map()
const instructionsStore: Map<string, FolderInstruction> = new Map()

export type FolderAccessLevel = 'read_only' | 'read_draft' | 'read_edit_approve' | 'trusted' | 'full'

export type FolderLabel = 'Code' | 'Docs' | 'Finance' | 'Design' | 'Research' | 'Marketing' | 'Data' | 'Legal' | 'Personal' | 'Archive' | string

export interface ManagedFolder {
  id: string
  projectId: string | null
  path: string
  label: FolderLabel
  accessLevel: FolderAccessLevel
  isActive: boolean
  addedAt: number
  lastAiAccess: number | null
  instructions: FolderInstruction[]
  stats: FolderStats
}

export interface FolderInstruction {
  id: string
  folderId: string
  instruction: string
  priority: number
  createdAt: number
}

export interface FolderStats {
  fileCount: number
  totalSize: number
  lastModified: number
}

export interface FolderTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: number
  aiModified?: boolean
  children?: FolderTreeNode[]
}

export interface AttachFolderInput {
  path: string
  projectId?: string
  label?: FolderLabel
  accessLevel?: FolderAccessLevel
}

// Default access levels for different actions
const ACCESS_LEVEL_PERMISSIONS: Record<FolderAccessLevel, Record<string, boolean>> = {
  read_only: {
    read: true,
    write: false,
    delete: false,
    move: false,
  },
  read_draft: {
    read: true,
    write: true,
    delete: false,
    move: false,
  },
  read_edit_approve: {
    read: true,
    write: true,
    delete: true,
    move: false,
  },
  trusted: {
    read: true,
    write: true,
    delete: true,
    move: true,
  },
  full: {
    read: true,
    write: true,
    delete: true,
    move: true,
  },
}

// Folders to ignore when traversing directory trees
const IGNORE_PATTERNS = ['node_modules', '.git', '.DS_Store', '.next', 'dist', 'build', 'coverage']
const IGNORE_FILE_PATTERNS = ['*.swp', '*~', '.DS_Store', '*.tmp']

/**
 * Generate a unique folder ID
 */
function generateFolderId(): string {
  return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Validate that a path exists and is a directory
 */
function validateFolderPath(folderPath: string): boolean {
  try {
    const stat = fs.statSync(folderPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

/**
 * Check if a path should be ignored
 */
function shouldIgnorePath(itemPath: string): boolean {
  const basename = path.basename(itemPath)
  return IGNORE_PATTERNS.includes(basename)
}

/**
 * Check if a file should be ignored based on patterns
 */
function shouldIgnoreFile(filePath: string): boolean {
  const basename = path.basename(filePath)
  return IGNORE_FILE_PATTERNS.some((pattern) => {
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`)
      return regex.test(basename)
    }
    return basename === pattern
  })
}

/**
 * Attach a folder to a project
 */
export function attachFolder(input: AttachFolderInput): ManagedFolder {
  // Validate path exists
  if (!validateFolderPath(input.path)) {
    throw new Error(`Folder path does not exist or is not a directory: ${input.path}`)
  }

  const folderId = generateFolderId()
  const now = Date.now()

  const managedFolder: ManagedFolder = {
    id: folderId,
    projectId: input.projectId || null,
    path: input.path,
    label: input.label || 'Code',
    accessLevel: input.accessLevel || 'read_only',
    isActive: true,
    addedAt: now,
    lastAiAccess: null,
    instructions: [],
    stats: getFolderStats(input.path),
  }

  // Store in memory
  foldersStore.set(folderId, managedFolder)

  // Emit event
  eventBus.emit('folder:attached', {
    folderId,
    path: input.path,
    projectId: input.projectId || null,
    timestamp: now,
  })

  return managedFolder
}

/**
 * Detach a folder from a project
 */
export function detachFolder(folderId: string): void {
  const folder = foldersStore.get(folderId)

  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`)
  }

  foldersStore.delete(folderId)

  // Remove associated instructions
  for (const [id, instr] of instructionsStore) {
    if (instr.folderId === folderId) {
      instructionsStore.delete(id)
    }
  }

  eventBus.emit('folder:detached', {
    folderId,
    path: folder.path,
    timestamp: Date.now(),
  })
}

/**
 * List all managed folders, optionally filtered by project
 */
export function listFolders(projectId?: string): ManagedFolder[] {
  let folders = Array.from(foldersStore.values())

  if (projectId) {
    folders = folders.filter((f: ManagedFolder) => f.projectId === projectId)
  }

  // Enrich with instructions
  return folders.map((f: ManagedFolder) => ({
    ...f,
    instructions: Array.from(instructionsStore.values()).filter((i: FolderInstruction) => i.folderId === f.id),
  }))
}

/**
 * Get a single folder by ID
 */
export function getFolder(folderId: string): ManagedFolder | null {
  const folder = foldersStore.get(folderId)

  if (!folder) {
    return null
  }

  // Enrich with instructions
  return {
    ...folder,
    instructions: Array.from(instructionsStore.values()).filter((i: FolderInstruction) => i.folderId === folderId),
  }
}

/**
 * Update folder properties
 */
export function updateFolder(
  folderId: string,
  patch: { label?: FolderLabel; accessLevel?: FolderAccessLevel; isActive?: boolean }
): ManagedFolder {
  const folder = foldersStore.get(folderId)

  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`)
  }

  const updated = {
    ...folder,
    ...patch,
  }

  foldersStore.set(folderId, updated)

  eventBus.emit('folder:updated', {
    folderId,
    changes: patch,
    timestamp: Date.now(),
  })

  // Return with instructions
  return {
    ...updated,
    instructions: Array.from(instructionsStore.values()).filter((i: FolderInstruction) => i.folderId === folderId),
  }
}

/**
 * Add an instruction to a folder
 */
export function addInstruction(folderId: string, instruction: string, priority: number = 0): FolderInstruction {
  const folder = getFolder(folderId)
  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`)
  }

  const instructionId = `instr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()

  const folderInstruction: FolderInstruction = {
    id: instructionId,
    folderId,
    instruction,
    priority,
    createdAt: now,
  }

  instructionsStore.set(instructionId, folderInstruction)

  eventBus.emit('folder:instruction-added', {
    instructionId,
    folderId,
    timestamp: now,
  })

  return folderInstruction
}

/**
 * Remove an instruction from a folder
 */
export function removeInstruction(instructionId: string): void {
  const instruction = instructionsStore.get(instructionId)

  if (!instruction) {
    throw new Error(`Instruction not found: ${instructionId}`)
  }

  instructionsStore.delete(instructionId)

  eventBus.emit('folder:instruction-removed', {
    instructionId,
    folderId: instruction.folderId,
    timestamp: Date.now(),
  })
}

/**
 * Get all instructions for a folder
 */
export function getInstructions(folderId: string): FolderInstruction[] {
  return Array.from(instructionsStore.values())
    .filter((i: FolderInstruction) => i.folderId === folderId)
    .sort((a: FolderInstruction, b: FolderInstruction) => b.priority - a.priority)
}

/**
 * Get the directory tree for a folder
 */
export function getFolderTree(folderId: string, depth: number = 3): FolderTreeNode {
  const folder = getFolder(folderId)
  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`)
  }

  function buildTree(folderPath: string, currentDepth: number): FolderTreeNode {
    const stat = fs.statSync(folderPath)
    const node: FolderTreeNode = {
      name: path.basename(folderPath),
      path: folderPath,
      type: 'directory',
      modifiedAt: stat.mtimeMs,
      children: [],
    }

    if (currentDepth >= depth) {
      return node
    }

    try {
      const entries = fs.readdirSync(folderPath)
      for (const entry of entries) {
        const entryPath = path.join(folderPath, entry)

        if (shouldIgnorePath(entryPath)) {
          continue
        }

        try {
          const entryStat = fs.statSync(entryPath)

          if (entryStat.isDirectory()) {
            node.children!.push(buildTree(entryPath, currentDepth + 1))
          } else if (!shouldIgnoreFile(entryPath)) {
            node.children!.push({
              name: entry,
              path: entryPath,
              type: 'file',
              size: entryStat.size,
              modifiedAt: entryStat.mtimeMs,
            })
          }
        } catch {
          // Skip files that can't be accessed
        }
      }
    } catch {
      // If directory can't be read, return node without children
    }

    return node
  }

  return buildTree(folder.path, 0)
}

/**
 * Get statistics for a folder (non-recursive)
 */
export function getFolderStats(folderPath: string): FolderStats {
  try {
    const stat = fs.statSync(folderPath)

    let fileCount = 0
    let totalSize = 0
    let lastModified = stat.mtimeMs

    try {
      const entries = fs.readdirSync(folderPath)
      for (const entry of entries) {
        const entryPath = path.join(folderPath, entry)

        if (shouldIgnorePath(entryPath)) {
          continue
        }

        try {
          const entryStat = fs.statSync(entryPath)
          if (entryStat.isFile()) {
            fileCount += 1
            totalSize += entryStat.size
            lastModified = Math.max(lastModified, entryStat.mtimeMs)
          }
        } catch {
          // Skip inaccessible entries
        }
      }
    } catch {
      // Directory couldn't be read
    }

    return {
      fileCount,
      totalSize,
      lastModified,
    }
  } catch {
    throw new Error(`Could not get stats for folder: ${folderPath}`)
  }
}

/**
 * Record that the AI accessed a folder
 */
export function recordAiAccess(folderId: string): void {
  const folder = foldersStore.get(folderId)

  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`)
  }

  const updated = {
    ...folder,
    lastAiAccess: Date.now(),
  }
  foldersStore.set(folderId, updated)

  eventBus.emit('folder:ai-accessed', {
    folderId,
    timestamp: updated.lastAiAccess,
  })
}

/**
 * Check if an agent can perform an action on a folder
 */
export function canAgentAccess(folderId: string, action: 'read' | 'write' | 'delete' | 'move'): boolean {
  const folder = getFolder(folderId)
  if (!folder) {
    return false
  }

  if (!folder.isActive) {
    return false
  }

  const permissions = ACCESS_LEVEL_PERMISSIONS[folder.accessLevel]
  return permissions?.[action] || false
}

/**
 * Get all folders that the agent can access with a specific permission level
 */
export function getAccessibleFolders(accessNeeded: 'read' | 'write' | 'delete'): ManagedFolder[] {
  const folders = listFolders()
  return folders.filter((folder) => canAgentAccess(folder.id, accessNeeded))
}
