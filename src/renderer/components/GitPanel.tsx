/**
 * Git Panel — Repository status, changes, commits, push/pull
 */
import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  X, GitBranch, GitCommit, Plus, Check, Upload, Download,
  FolderOpen, ChevronDown, File, FilePlus, FileMinus, FileX, Clock
} from 'lucide-react'

interface Props {
  visible: boolean
  onClose: () => void
}

interface RepoStatus {
  path: string
  branch: string
  modified: string[]
  added: string[]
  deleted: string[]
  untracked: string[]
  staged: string[]
}

interface CommitLog {
  hash: string
  message: string
  author: string
  date: string
}

interface Branch {
  name: string
  current: boolean
}

export const GitPanel: React.FC<Props> = ({ visible, onClose }) => {
  const [repoOpen, setRepoOpen] = useState(false)
  const [repoPath, setRepoPath] = useState('')
  const [currentBranch, setCurrentBranch] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [showBranchDropdown, setShowBranchDropdown] = useState(false)

  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [commits, setCommits] = useState<CommitLog[]>([])
  
  const [commitMessage, setCommitMessage] = useState('')
  const [commitLoading, setCommitLoading] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pullLoading, setPullLoading] = useState(false)
  
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<string | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [commitDiff, setCommitDiff] = useState<string | null>(null)
  const [loadingCommitDiff, setLoadingCommitDiff] = useState(false)

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // ── Load status and commits ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!repoOpen) return
    try {
      const s = await window.nyra.git.status() as unknown as RepoStatus
      setStatus(s)

      const logs = await window.nyra.git.log(10) as unknown as { all: CommitLog[] }
      setCommits(logs?.all || [])
    } catch (err) {
      console.error('Failed to load git data:', err)
    }
  }, [repoOpen])

  // ── Auto-refresh status every 3 seconds ────────────────────────────────────
  useEffect(() => {
    if (!visible || !repoOpen) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    loadData()
    pollIntervalRef.current = setInterval(loadData, 3000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [visible, repoOpen, loadData])

  // ── Open repository ────────────────────────────────────────────────────────
  const handleOpenRepo = async () => {
    try {
      const dirPath = await window.nyra.files.requestDir()
      if (!dirPath) return

      await window.nyra.git.open(dirPath)
      setRepoPath(dirPath)
      setRepoOpen(true)
      
      const s = await window.nyra.git.status() as unknown as RepoStatus
      setStatus(s)
      setCurrentBranch(s.branch)

      const br = await window.nyra.git.branches()
      setBranches(br?.all?.map(name => ({ name, current: name === br.current })) || [])

      const logs = await window.nyra.git.log(10) as unknown as { all: CommitLog[] }
      setCommits(logs?.all || [])
    } catch (err) {
      console.error('Failed to open repo:', err)
    }
  }

  // ── File operations ────────────────────────────────────────────────────────
  const handleStageFile = async (file: string) => {
    try {
      await window.nyra.git.stage([file])
      await loadData()
    } catch (err) {
      console.error('Failed to stage file:', err)
    }
  }

  const handleStageAll = async () => {
    try {
      await window.nyra.git.stageAll()
      await loadData()
    } catch (err) {
      console.error('Failed to stage all:', err)
    }
  }

  // ── File diff preview ──────────────────────────────────────────────────────
  const handleShowDiff = async (file: string) => {
    if (selectedFile === file) {
      setSelectedFile(null)
      setFileDiff(null)
      return
    }

    setSelectedFile(file)
    setLoadingDiff(true)
    try {
      const d = await window.nyra.git.diff()
      // Extract only this file's diff from the full diff
      setFileDiff(d || '')
    } catch (err) {
      console.error('Failed to get diff:', err)
      setFileDiff(null)
    } finally {
      setLoadingDiff(false)
    }
  }

  // ── Commit ─────────────────────────────────────────────────────────────────
  const handleCommit = async () => {
    if (!commitMessage.trim() || !status?.staged.length) return

    setCommitLoading(true)
    try {
      await window.nyra.git.commit(commitMessage.trim())
      setCommitMessage('')
      await loadData()
    } catch (err) {
      console.error('Failed to commit:', err)
    } finally {
      setCommitLoading(false)
    }
  }

  // ── Push/Pull ──────────────────────────────────────────────────────────────
  const handlePush = async () => {
    setPushLoading(true)
    try {
      await window.nyra.git.push()
      await loadData()
    } catch (err) {
      console.error('Failed to push:', err)
    } finally {
      setPushLoading(false)
    }
  }

  const handlePull = async () => {
    setPullLoading(true)
    try {
      await window.nyra.git.pull()
      await loadData()
    } catch (err) {
      console.error('Failed to pull:', err)
    } finally {
      setPullLoading(false)
    }
  }

  // ── Branch checkout ────────────────────────────────────────────────────────
  const handleCheckoutBranch = async (branchName: string) => {
    try {
      await window.nyra.git.checkout(branchName)
      setCurrentBranch(branchName)
      setShowBranchDropdown(false)
      await loadData()
    } catch (err) {
      console.error('Failed to checkout branch:', err)
    }
  }

  // ── Commit diff preview ────────────────────────────────────────────────────
  const handleShowCommitDiff = async (hash: string) => {
    if (selectedCommit === hash) {
      setSelectedCommit(null)
      setCommitDiff(null)
      return
    }

    setSelectedCommit(hash)
    setLoadingCommitDiff(true)
    try {
      const d = await window.nyra.git.showCommit(hash)
      setCommitDiff(d)
    } catch (err) {
      console.error('Failed to get commit diff:', err)
      setCommitDiff(null)
    } finally {
      setLoadingCommitDiff(false)
    }
  }

  // ── Relative time formatter ────────────────────────────────────────────────
  const formatRelativeTime = (dateStr: string): string => {
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

      if (seconds < 60) return 'now'
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
      if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
      return date.toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  // ── Get status badge ───────────────────────────────────────────────────────
  const getStatusBadge = (file: string): { type: 'M' | 'A' | 'D' | '?'; color: string } => {
    if (status?.staged.includes(file)) return { type: 'A', color: 'bg-green-500/20 text-green-400' }
    if (status?.modified.includes(file)) return { type: 'M', color: 'bg-yellow-500/20 text-yellow-400' }
    if (status?.added.includes(file)) return { type: 'A', color: 'bg-blue-500/20 text-blue-400' }
    if (status?.deleted.includes(file)) return { type: 'D', color: 'bg-red-500/20 text-red-400' }
    return { type: '?', color: 'bg-white/10 text-white/50' }
  }

  const allChanges = [
    ...(status?.modified || []),
    ...(status?.added || []),
    ...(status?.deleted || []),
    ...(status?.untracked || []),
  ]

  const stagedCount = status?.staged.length || 0
  const hasChanges = allChanges.length > 0

  return (
    <div
      className={`fixed right-0 top-0 h-screen w-[420px] bg-[#111] border-l border-white/10 flex flex-col transition-transform duration-300 ${
        visible ? 'translate-x-0' : 'translate-x-full'
      } z-40`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <h2 className="text-white font-semibold text-sm">Git</h2>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/[0.06]"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col">
        {!repoOpen ? (
          // ── No repository open ────────────────────────────────────────────────
          <div className="flex-1 flex items-center justify-center p-5">
            <div className="text-center">
              <GitBranch size={40} className="text-white/20 mx-auto mb-3" />
              <p className="text-white/50 text-sm mb-4">No repository open</p>
              <button
                onClick={handleOpenRepo}
                className="inline-flex items-center gap-2 px-4 py-2 bg-terra-400/10 hover:bg-terra-400/20 border border-terra-400/30 rounded-lg text-terra-400 text-sm font-medium transition-colors"
              >
                <FolderOpen size={14} />
                Open Repository
              </button>
            </div>
          </div>
        ) : (
          // ── Repository open ───────────────────────────────────────────────────
          <div className="flex flex-col">
            {/* ── Repository section ─────────────────────────────────────────── */}
            <div className="p-5 border-b border-white/10">
              <div className="mb-3">
                <p className="text-xs text-white/40 mb-1 uppercase tracking-wider">Repository</p>
                <p className="text-sm text-white/70 truncate font-mono">{repoPath.split('/').pop()}</p>
              </div>

              <div className="relative">
                <button
                  onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/70 text-sm transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <GitBranch size={14} />
                    {currentBranch}
                  </div>
                  <ChevronDown size={14} />
                </button>

                {showBranchDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto scrollbar-thin">
                    {branches.map(b => (
                      <button
                        key={b.name}
                        onClick={() => handleCheckoutBranch(b.name)}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                          b.current
                            ? 'bg-terra-400/20 text-terra-400'
                            : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                        }`}
                      >
                        {b.current && <Check size={12} className="inline mr-2" />}
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Changes section ────────────────────────────────────────────── */}
            {hasChanges && (
              <div className="p-5 border-b border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-white/40 uppercase tracking-wider">Changes</p>
                  <button
                    onClick={handleStageAll}
                    className="px-2 py-1 text-xs bg-terra-400/10 hover:bg-terra-400/20 text-terra-400 rounded font-medium transition-colors"
                  >
                    Stage All
                  </button>
                </div>

                <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
                  {allChanges.map(file => {
                    const badge = getStatusBadge(file)
                    const isStaged = status?.staged.includes(file)
                    return (
                      <div key={file}>
                        <div className="flex items-center gap-2 group">
                          <button
                            onClick={() => handleShowDiff(file)}
                            className="flex-1 flex items-center gap-2 px-2 py-1.5 hover:bg-white/[0.04] rounded text-sm text-white/70 transition-colors text-left"
                          >
                            {status?.modified.includes(file) && <FileMinus size={12} />}
                            {status?.added.includes(file) && <FilePlus size={12} />}
                            {status?.deleted.includes(file) && <FileX size={12} />}
                            {status?.untracked.includes(file) && <File size={12} />}
                            <span className="truncate">{file}</span>
                            <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded ${badge.color}`}>
                              {badge.type}
                            </span>
                          </button>
                          <button
                            onClick={() => handleStageFile(file)}
                            className={`p-1 rounded transition-colors ${
                              isStaged
                                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                            }`}
                            title={isStaged ? 'Unstage' : 'Stage'}
                          >
                            {isStaged ? <Check size={14} /> : <Plus size={14} />}
                          </button>
                        </div>

                        {/* Inline diff ──────────────────────────────────────── */}
                        {selectedFile === file && (
                          <div className="mt-2 ml-2 p-3 bg-white/[0.02] border border-white/5 rounded text-xs font-mono max-h-32 overflow-auto scrollbar-thin">
                            {loadingDiff ? (
                              <p className="text-white/40">Loading diff...</p>
                            ) : fileDiff ? (
                              <div className="space-y-0">
                                {fileDiff.split('\n').map((line, i) => (
                                  <div
                                    key={i}
                                    className={`${
                                      line.startsWith('+') && !line.startsWith('+++')
                                        ? 'text-green-400'
                                        : line.startsWith('-') && !line.startsWith('---')
                                        ? 'text-red-400'
                                        : 'text-white/50'
                                    }`}
                                  >
                                    {line}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-white/40">No diff available</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Commit section ─────────────────────────────────────────────── */}
            {stagedCount > 0 && (
              <div className="p-5 border-b border-white/10">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Commit</p>
                <textarea
                  value={commitMessage}
                  onChange={e => setCommitMessage(e.target.value)}
                  placeholder="Describe your changes..."
                  autoFocus
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-terra-400/50 focus:bg-white/[0.08] transition-colors placeholder-white/20 h-20"
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-white/30">
                    {commitMessage.length} / 72
                  </span>
                  <button
                    onClick={handleCommit}
                    disabled={!commitMessage.trim() || commitLoading}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                      commitMessage.trim() && !commitLoading
                        ? 'bg-terra-400/20 hover:bg-terra-400/30 text-terra-400'
                        : 'bg-white/5 text-white/30 cursor-not-allowed'
                    }`}
                  >
                    <GitCommit size={14} />
                    {commitLoading ? 'Committing...' : 'Commit'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Recent Commits section ─────────────────────────────────────── */}
            {commits.length > 0 && (
              <div className="p-5 border-b border-white/10">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Recent Commits</p>
                <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                  {commits.map(commit => (
                    <div key={commit.hash}>
                      <button
                        onClick={() => handleShowCommitDiff(commit.hash)}
                        className="w-full text-left p-2 hover:bg-white/[0.04] rounded transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <GitCommit size={12} className="text-terra-400/60 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-mono text-white/50 group-hover:text-white/70 transition-colors">
                              {commit.hash.substring(0, 7)}
                            </div>
                            <div className="text-sm text-white/70 truncate group-hover:text-white transition-colors">
                              {commit.message}
                            </div>
                            <div className="text-xs text-white/40 flex items-center gap-1 mt-1">
                              <Clock size={10} />
                              {formatRelativeTime(commit.date)}
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Commit diff ────────────────────────────────────────── */}
                      {selectedCommit === commit.hash && (
                        <div className="mt-2 ml-4 p-3 bg-white/[0.02] border border-white/5 rounded text-xs font-mono max-h-32 overflow-auto scrollbar-thin">
                          {loadingCommitDiff ? (
                            <p className="text-white/40">Loading diff...</p>
                          ) : commitDiff ? (
                            <div className="space-y-0">
                              {commitDiff.split('\n').map((line, i) => (
                                <div
                                  key={i}
                                  className={`${
                                    line.startsWith('+') && !line.startsWith('+++')
                                      ? 'text-green-400'
                                      : line.startsWith('-') && !line.startsWith('---')
                                      ? 'text-red-400'
                                      : 'text-white/50'
                                  }`}
                                >
                                  {line}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-white/40">No diff available</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Push/Pull section ──────────────────────────────────────────── */}
            <div className="p-5">
              <div className="flex gap-2">
                <button
                  onClick={handlePush}
                  disabled={pushLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-terra-400/10 hover:bg-terra-400/20 border border-terra-400/30 rounded-lg text-terra-400 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload size={14} />
                  {pushLoading ? 'Pushing...' : 'Push'}
                </button>
                <button
                  onClick={handlePull}
                  disabled={pullLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-terra-400/10 hover:bg-terra-400/20 border border-terra-400/30 rounded-lg text-terra-400 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={14} />
                  {pullLoading ? 'Pulling...' : 'Pull'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
