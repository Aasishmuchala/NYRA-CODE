import { emitEvent } from './event-bus'

// Lazy load chokidar to match project pattern (like better-sqlite3 in memory.ts)
let chokidar: any = null

interface WatchedFolder {
  id: string
  path: string
  watcher: any
}

interface DebounceEntry {
  timeout: NodeJS.Timeout
  changeType: string
}

// Internal state
const watchedFolders = new Map<string, WatchedFolder>()
const debounceMap = new Map<string, DebounceEntry>()
const DEBOUNCE_DELAY = 500 // ms

/**
 * Lazy load chokidar module
 */
function initChokidar(): boolean {
  if (chokidar !== null) {
    return true
  }

  try {
    chokidar = require('chokidar')
    return true
  } catch (err) {
    console.warn('[FileWatcher] chokidar not available:', err)
    return false
  }
}

/**
 * Start watching a folder for file changes
 */
export function watchFolder(folderId: string, folderPath: string): void {
  // Check if already watching
  if (watchedFolders.has(folderId)) {
    console.warn(`[FileWatcher] Folder ${folderId} already being watched`)
    return
  }

  // Initialize chokidar if not already done
  if (!initChokidar()) {
    console.error('[FileWatcher] Cannot watch folder: chokidar not available')
    return
  }

  try {
    const watcher = chokidar.watch(folderPath, {
      ignored: /(^|[\/\\])\../,  // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      depth: 5,
    })

    // Handle events with debouncing
    const handleChange = (changeType: string, filePath: string) => {
      const key = `${folderId}:${filePath}`

      // Clear existing debounce timeout for this file
      if (debounceMap.has(key)) {
        clearTimeout(debounceMap.get(key)!.timeout)
      }

      // Set new debounce timeout
      const timeout = setTimeout(() => {
        emitEvent('folder:file-changed', {
          folderId,
          filePath,
          changeType,
        })
        debounceMap.delete(key)
      }, DEBOUNCE_DELAY)

      debounceMap.set(key, { timeout, changeType })
    }

    watcher.on('add', (filePath: string) => handleChange('add', filePath))
    watcher.on('change', (filePath: string) => handleChange('change', filePath))
    watcher.on('unlink', (filePath: string) => handleChange('unlink', filePath))
    watcher.on('addDir', (dirPath: string) => handleChange('addDir', dirPath))
    watcher.on('unlinkDir', (dirPath: string) => handleChange('unlinkDir', dirPath))

    watcher.on('error', (error: Error) => {
      console.error(`[FileWatcher] Error watching ${folderId}:`, error)
    })

    watchedFolders.set(folderId, {
      id: folderId,
      path: folderPath,
      watcher,
    })

    console.log(`[FileWatcher] Started watching folder: ${folderId} (${folderPath})`)
  } catch (err) {
    console.error(`[FileWatcher] Failed to watch folder ${folderId}:`, err)
  }
}

/**
 * Stop watching a folder
 */
export function unwatchFolder(folderId: string): void {
  const watched = watchedFolders.get(folderId)
  if (!watched) {
    console.warn(`[FileWatcher] Folder ${folderId} not being watched`)
    return
  }

  try {
    watched.watcher.close()
    watchedFolders.delete(folderId)

    // Clean up any pending debounce timers for this folder
    const keysToDelete: string[] = []
    for (const [key, entry] of debounceMap.entries()) {
      if (key.startsWith(`${folderId}:`)) {
        clearTimeout(entry.timeout)
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach((key) => debounceMap.delete(key))

    console.log(`[FileWatcher] Stopped watching folder: ${folderId}`)
  } catch (err) {
    console.error(`[FileWatcher] Error unwatching folder ${folderId}:`, err)
  }
}

/**
 * Check if a folder is being watched
 */
export function isWatching(folderId: string): boolean {
  return watchedFolders.has(folderId)
}

/**
 * Get list of folder IDs currently being watched
 */
export function getWatchedFolders(): string[] {
  return Array.from(watchedFolders.keys())
}

/**
 * Stop watching all folders
 */
export function unwatchAll(): void {
  // Clear all debounce timers
  for (const entry of debounceMap.values()) {
    clearTimeout(entry.timeout)
  }
  debounceMap.clear()

  // Close all watchers
  for (const [folderId, watched] of watchedFolders.entries()) {
    try {
      watched.watcher.close()
      console.log(`[FileWatcher] Stopped watching folder: ${folderId}`)
    } catch (err) {
      console.error(`[FileWatcher] Error closing watcher for ${folderId}:`, err)
    }
  }

  watchedFolders.clear()
}
