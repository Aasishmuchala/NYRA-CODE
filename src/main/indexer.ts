import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import type * as chokidarTypes from 'chokidar'

interface IndexEntry {
  path: string        // relative to project root
  absPath: string     // absolute path
  ext: string         // file extension
  size: number        // bytes
  hash: string        // md5 of content
  lines: number       // line count
  symbols: string[]   // extracted function/class/export names
  snippet: string     // first 500 chars of content
  updatedAt: number   // timestamp
}

interface SearchOptions {
  ext?: string
  limit?: number
}

interface ListOptions {
  ext?: string
  dir?: string
}

interface SymbolResult {
  path: string
  symbol: string
  line?: number
}

interface Stats {
  fileCount: number
  totalLines: number
  totalSize: number
  byExtension: Record<string, number>
}

// Allowed file extensions
const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.swift', '.kt',
  '.vue', '.svelte', '.html', '.css', '.scss', '.json', '.yaml', '.yml',
  '.toml', '.md', '.txt', '.sh', '.bash', '.sql', '.graphql', '.proto'
])

// Skip patterns
const SKIP_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/__pycache__/**'
]

class CodebaseIndexer extends EventEmitter {
  private entries: Map<string, IndexEntry> = new Map()
  private watcher: chokidarTypes.FSWatcher | null = null
  private projectRoot: string | null = null
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map()

  async open(projectRoot: string): Promise<{ fileCount: number; totalLines: number }> {
    if (this.watcher) {
      await this.close()
    }

    this.projectRoot = projectRoot

    // Initial scan
    await this.scanDirectory(projectRoot)

    // Setup watcher
    const chokidar = (await import('chokidar')).default
    this.watcher = chokidar.watch(projectRoot, {
      ignored: SKIP_PATTERNS,
      ignoreInitial: false,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100
      }
    })

    this.watcher.on('add', (filePath) => this.handleFileChange(filePath))
    this.watcher.on('change', (filePath) => this.handleFileChange(filePath))
    this.watcher.on('unlink', (filePath) => this.handleFileRemove(filePath))
    this.watcher.on('ready', () => {
      const stats = this.stats()
      this.emit('ready', stats)
    })

    const stats = this.stats()
    return { fileCount: stats.fileCount, totalLines: stats.totalLines }
  }

  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }

    // Clear debounce timers
    this.debounceTimers.forEach(timer => {
      clearTimeout(timer)
    })
    this.debounceTimers.clear()

    this.entries.clear()
    this.projectRoot = null
  }

  isOpen(): boolean {
    return this.watcher !== null && this.projectRoot !== null
  }

  private async scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { recursive: true, withFileTypes: true })

      for (const entry of entries) {
        if (entry.isFile()) {
          const fullPath = path.join(entry.parentPath, entry.name)
          const shouldSkip = SKIP_PATTERNS.some(pattern => {
            const normalizedPattern = pattern.replace(/\*\*\//g, '').replace(/\/\*\*/g, '').replace(/\*\*/g, '')
            return fullPath.includes(normalizedPattern)
          })

          if (!shouldSkip && this.shouldIndex(fullPath)) {
            try {
              const indexEntry = await this.indexFile(fullPath)
              if (indexEntry) {
                const relPath = path.relative(dirPath, fullPath)
                this.entries.set(relPath, indexEntry)
              }
            } catch (err) {
              // Skip files that can't be indexed
            }
          }
        }
      }
    } catch (err) {
      // Directory scan error
    }
  }

  private shouldIndex(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return ALLOWED_EXTENSIONS.has(ext)
  }

  private async indexFile(absPath: string): Promise<IndexEntry | null> {
    try {
      // Check file size
      const stats = await fs.stat(absPath)
      if (stats.size > 1024 * 1024) {
        // Skip files > 1MB
        return null
      }

      // Read file content
      const content = await fs.readFile(absPath, 'utf8')

      // Check for binary files (look for null bytes in first 512 bytes)
      const checkContent = content.substring(0, 512)
      if (checkContent.includes('\0')) {
        return null
      }

      // Extract metadata
      const ext = path.extname(absPath).toLowerCase()
      const lines = content.split('\n').length
      const hash = crypto.createHash('md5').update(content).digest('hex')
      const snippet = content.substring(0, 500)
      const symbols = this.extractSymbols(content, ext)

      const relPath = this.projectRoot
        ? path.relative(this.projectRoot, absPath)
        : absPath

      return {
        path: relPath,
        absPath,
        ext,
        size: stats.size,
        hash,
        lines,
        symbols,
        snippet,
        updatedAt: Date.now()
      }
    } catch (err) {
      return null
    }
  }

  private extractSymbols(content: string, ext: string): string[] {
    const symbols: string[] = []

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      // JS/TS patterns
      const jsPatterns = [
        /export\s+(?:default\s+)?(?:function|class|const|let|type|interface)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
        /(?:function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
        /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g
      ]

      for (const pattern of jsPatterns) {
        let match
        while ((match = pattern.exec(content)) !== null) {
          symbols.push(match[1])
        }
      }
    } else if (ext === '.py') {
      // Python patterns
      const pyPatterns = [
        /(?:^|\n)\s*(?:def|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g
      ]

      for (const pattern of pyPatterns) {
        let match
        while ((match = pattern.exec(content)) !== null) {
          symbols.push(match[1])
        }
      }
    } else if (ext === '.rs') {
      // Rust patterns
      const rsPatterns = [
        /(?:pub\s+)?(?:fn|struct|enum|trait|impl)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g
      ]

      for (const pattern of rsPatterns) {
        let match
        while ((match = pattern.exec(content)) !== null) {
          symbols.push(match[1])
        }
      }
    } else if (ext === '.go') {
      // Go patterns
      const goPatterns = [
        /(?:func|type)\s+([A-Z][a-zA-Z0-9_]*)/g
      ]

      for (const pattern of goPatterns) {
        let match
        while ((match = pattern.exec(content)) !== null) {
          symbols.push(match[1])
        }
      }
    }

    // Remove duplicates
    return Array.from(new Set(symbols))
  }

  private handleFileChange(filePath: string): void {
    // Debounce per file
    if (this.debounceTimers.has(filePath)) {
      const existing = this.debounceTimers.get(filePath)
      if (existing) {
        clearTimeout(existing)
      }
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath)

      if (!this.shouldIndex(filePath)) {
        return
      }

      try {
        const entry = await this.indexFile(filePath)
        if (entry && this.projectRoot) {
          const relPath = path.relative(this.projectRoot, filePath)
          this.entries.set(relPath, entry)
          this.emit('indexed', relPath, entry)
        }
      } catch (err) {
        // Handle indexing error
      }
    }, 500)

    this.debounceTimers.set(filePath, timer)
  }

  private handleFileRemove(filePath: string): void {
    if (this.projectRoot) {
      const relPath = path.relative(this.projectRoot, filePath)
      if (this.entries.has(relPath)) {
        this.entries.delete(relPath)
        this.emit('removed', relPath)
      }
    }
  }

  search(query: string, opts: SearchOptions = {}): IndexEntry[] {
    const { ext, limit = 20 } = opts
    const queryLower = query.toLowerCase()
    const results: Array<{ entry: IndexEntry; score: number }> = []

    this.entries.forEach(entry => {
      // Filter by extension if specified
      if (ext && entry.ext !== ext) {
        return
      }

      let score = 0

      // Exact symbol match: 10 points
      if (entry.symbols.some(s => s.toLowerCase() === queryLower)) {
        score += 10
      }

      // Symbol contains query: 5 points
      if (entry.symbols.some(s => s.toLowerCase().includes(queryLower))) {
        score += 5
      }

      // Filename contains query: 5 points
      if (path.basename(entry.path).toLowerCase().includes(queryLower)) {
        score += 5
      }

      // Snippet contains query: 1 point per occurrence (max 5)
      const snippetMatches = (entry.snippet.toLowerCase().match(new RegExp(queryLower, 'g')) || []).length
      score += Math.min(snippetMatches, 5)

      if (score > 0) {
        results.push({ entry, score })
      }
    })

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, limit).map(r => r.entry)
  }

  searchSymbols(name: string): SymbolResult[] {
    const nameLower = name.toLowerCase()
    const results: SymbolResult[] = []

    this.entries.forEach(entry => {
      for (const symbol of entry.symbols) {
        if (symbol.toLowerCase() === nameLower || symbol.toLowerCase().includes(nameLower)) {
          results.push({
            path: entry.path,
            symbol,
            line: undefined // Line number extraction would require additional parsing
          })
        }
      }
    })

    return results
  }

  getFile(relativePath: string): IndexEntry | null {
    return this.entries.get(relativePath) || null
  }

  stats(): Stats {
    let totalLines = 0
    let totalSize = 0
    const byExtension: Record<string, number> = {}

    this.entries.forEach(entry => {
      totalLines += entry.lines
      totalSize += entry.size

      const ext = entry.ext || 'unknown'
      byExtension[ext] = (byExtension[ext] || 0) + 1
    })

    return {
      fileCount: this.entries.size,
      totalLines,
      totalSize,
      byExtension
    }
  }

  list(opts: ListOptions = {}): IndexEntry[] {
    const { ext, dir } = opts
    let results: IndexEntry[] = []

    this.entries.forEach(entry => {
      results.push(entry)
    })

    if (ext) {
      results = results.filter(e => e.ext === ext)
    }

    if (dir) {
      const dirLower = dir.toLowerCase()
      results = results.filter(e => e.path.toLowerCase().startsWith(dirLower))
    }

    return results
  }
}

// Export singleton
export const codebaseIndexer = new CodebaseIndexer()

export type { IndexEntry, SearchOptions, ListOptions, SymbolResult, Stats }
