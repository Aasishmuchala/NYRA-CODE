/**
 * Git Integration Module — simple-git wrapper for Electron
 *
 * Provides core git operations for the Nyra Desktop app:
 * - Repository management (open, status, log, branches)
 * - File staging and commits
 * - Push/pull operations
 * - Branching and checkouts
 * - Diff and blame
 * - PR/review helpers (diff branches, merge base)
 *
 * All operations require a repo to be opened first via open().
 * Error messages are cleaned up and actionable.
 */

import { simpleGit, SimpleGit, StatusResult, LogResult } from 'simple-git'

// ── GitManager Class ──────────────────────────────────────────────────────────

class GitManager {
  private git: SimpleGit | null = null
  private repoPath: string | null = null

  /**
   * Initialize simple-git for a repository
   * @param repoPath Path to the git repository
   * @returns Current branch name and clean status
   */
  async open(repoPath: string): Promise<{ branch: string; isClean: boolean }> {
    try {
      this.repoPath = repoPath
      this.git = simpleGit(repoPath)

      // Verify it's a valid git repo
      await this.git.revparse(['--git-dir'])

      const status = await this.git.status()
      const branch = status.current || 'HEAD'
      const isClean = status.isClean()

      return { branch, isClean }
    } catch (err) {
      this.git = null
      this.repoPath = null
      throw new Error(
        `Failed to open repository at "${repoPath}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Check if a repository is currently open
   */
  isOpen(): boolean {
    return this.git !== null && this.repoPath !== null
  }

  /**
   * Get the current repository path
   */
  getRepoPath(): string | null {
    return this.repoPath
  }

  /**
   * Ensure a repo is open, throw if not
   */
  private ensureOpen(): void {
    if (!this.isOpen()) {
      throw new Error('No repository open. Call open(repoPath) first.')
    }
  }

  /**
   * Get git status
   */
  async status(): Promise<StatusResult> {
    this.ensureOpen()
    try {
      return await this.git!.status()
    } catch (err) {
      throw new Error(`Git status failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Get diff output
   * @param staged If true, shows staged changes (--staged); otherwise shows unstaged
   * @returns Diff as a string
   */
  async diff(staged: boolean = false): Promise<string> {
    this.ensureOpen()
    try {
      const args = staged ? ['--staged'] : []
      const result = await this.git!.diff(args)
      return result || ''
    } catch (err) {
      throw new Error(`Git diff failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Get commit log
   * @param maxCount Number of commits to return (default: 20)
   * @returns LogResult with commits
   */
  async log(maxCount: number = 20): Promise<LogResult> {
    this.ensureOpen()
    try {
      return await this.git!.log({ maxCount })
    } catch (err) {
      throw new Error(`Git log failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * List branches
   * @returns Object with current branch name and array of all branch names
   */
  async branches(): Promise<{ current: string; all: string[] }> {
    this.ensureOpen()
    try {
      const result = await this.git!.branch()
      const current = result.current
      const all = result.all || []
      return { current, all }
    } catch (err) {
      throw new Error(`Git branches failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Checkout a branch
   * @param branch Branch name to switch to
   */
  async checkout(branch: string): Promise<void> {
    this.ensureOpen()
    try {
      await this.git!.checkout(branch)
    } catch (err) {
      throw new Error(
        `Failed to checkout branch "${branch}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Create and checkout a new branch
   * @param name Name of the new branch
   * @param from Base branch/ref to create from (default: current HEAD)
   */
  async createBranch(name: string, from?: string): Promise<void> {
    this.ensureOpen()
    try {
      if (from) {
        await this.git!.checkout(['-b', name, from])
      } else {
        await this.git!.checkoutLocalBranch(name)
      }
    } catch (err) {
      throw new Error(
        `Failed to create branch "${name}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Stage specific files
   * @param files Array of file paths to stage
   */
  async stage(files: string[]): Promise<void> {
    this.ensureOpen()
    try {
      await this.git!.add(files)
    } catch (err) {
      throw new Error(
        `Failed to stage files: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Stage all changes (git add -A)
   */
  async stageAll(): Promise<void> {
    this.ensureOpen()
    try {
      await this.git!.add(['.'])
    } catch (err) {
      throw new Error(
        `Failed to stage all files: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Commit staged changes
   * @param message Commit message
   * @returns Commit hash
   */
  async commit(message: string): Promise<string> {
    this.ensureOpen()
    try {
      const result = await this.git!.commit(message)
      return result.commit || ''
    } catch (err) {
      throw new Error(
        `Failed to commit: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Push to remote
   * @param remote Remote name (default: origin)
   * @param branch Branch name (default: current branch)
   */
  async push(remote: string = 'origin', branch?: string): Promise<void> {
    this.ensureOpen()
    try {
      const args = branch ? [remote, branch] : [remote]
      await this.git!.push(args[0], args[1])
    } catch (err) {
      throw new Error(
        `Failed to push: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Pull from remote
   * @param remote Remote name (default: origin)
   * @param branch Branch name (default: current branch)
   */
  async pull(remote: string = 'origin', branch?: string): Promise<void> {
    this.ensureOpen()
    try {
      const args = branch ? [remote, branch] : [remote]
      await this.git!.pull(args[0], args[1])
    } catch (err) {
      throw new Error(
        `Failed to pull: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Stash changes
   * @param message Optional stash message
   */
  async stash(message?: string): Promise<void> {
    this.ensureOpen()
    try {
      const args = message ? ['push', '-m', message] : ['push']
      await this.git!.stash(args)
    } catch (err) {
      throw new Error(
        `Failed to stash changes: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Pop the most recent stash
   */
  async stashPop(): Promise<void> {
    this.ensureOpen()
    try {
      await this.git!.stash(['pop'])
    } catch (err) {
      throw new Error(
        `Failed to pop stash: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Get blame information for a file
   * @param file File path
   * @returns Blame output as string
   */
  async blame(file: string): Promise<string> {
    this.ensureOpen()
    try {
      const result = await this.git!.raw(['blame', file])
      return result || ''
    } catch (err) {
      throw new Error(
        `Failed to blame file "${file}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Show a specific commit
   * @param hash Commit hash
   * @returns Commit details as string
   */
  async showCommit(hash: string): Promise<string> {
    this.ensureOpen()
    try {
      const result = await this.git!.show(hash)
      return result || ''
    } catch (err) {
      throw new Error(
        `Failed to show commit "${hash}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Get log for a specific file
   * @param file File path
   * @param maxCount Number of commits to return (default: 20)
   * @returns LogResult with commits for the file
   */
  async fileHistory(file: string, maxCount: number = 20): Promise<LogResult> {
    this.ensureOpen()
    try {
      return await this.git!.log({ file, maxCount })
    } catch (err) {
      throw new Error(
        `Failed to get history for file "${file}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Get diff between branches (base...head)
   * @param base Base branch
   * @param head Head branch (default: current HEAD)
   * @returns Diff as string
   */
  async diffBranch(base: string, head?: string): Promise<string> {
    this.ensureOpen()
    try {
      const ref = head ? `${base}...${head}` : `${base}...HEAD`
      const result = await this.git!.diff([ref])
      return result || ''
    } catch (err) {
      throw new Error(
        `Failed to diff branches: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Find the merge base of two branches
   * @param branch1 First branch
   * @param branch2 Second branch
   * @returns Merge base commit hash
   */
  async mergeBase(branch1: string, branch2: string): Promise<string> {
    this.ensureOpen()
    try {
      const result = await this.git!.raw(['merge-base', branch1, branch2])
      return result.trim() || ''
    } catch (err) {
      throw new Error(
        `Failed to find merge base: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}

// ── Singleton Instance ────────────────────────────────────────────────────────

export const gitManager = new GitManager()
