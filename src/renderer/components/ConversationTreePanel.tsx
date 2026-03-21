/**
 * ConversationTreePanel — Visual Session Tree with Branching Controls
 *
 * Features:
 *   - Tree visualization of conversation branches
 *   - Fork/merge/switch/rename/delete operations
 *   - Preview messages on branch hover
 *   - Active branch highlight
 *   - Stats and metadata display
 */

import React, { useState, useEffect } from 'react'
import {
  GitBranch, GitMerge, Trash2, Edit3, ChevronRight, ChevronDown, Plus, X, Check
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface BranchNode {
  id: string
  name: string
  parentId: string | null
  messageCount: number
  forkPoint: number
  createdAt: number
  isActive: boolean
  children: BranchNode[]
}

interface PreviewMessage {
  role: string
  content: string
}

interface TreeState {
  expandedBranches: Set<string>
  renamingBranchId: string | null
  renamingValue: string
  forking: { branchId: string; messageIndex: number } | null
  forkAtIndex: number
  merging: { sourceBranchId: string; targetBranchId: string } | null
}

// ── Main Component ───────────────────────────────────────────────────────────

const ConversationTreePanel: React.FC = () => {
  const [tree, setTree] = useState<BranchNode[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [stats, setStats] = useState({ total: 0, activeName: 'Main' })
  const [hoverPreview, setHoverPreview] = useState<{ branchId: string; messages: PreviewMessage[] } | null>(null)
  const [treeState, setTreeState] = useState<TreeState>({
    expandedBranches: new Set(),
    renamingBranchId: null,
    renamingValue: '',
    forking: null,
    forkAtIndex: 0,
    merging: null,
  })

  // Get current session ID
  useEffect(() => {
    const getCurrentSessionId = async () => {
      if (typeof window !== 'undefined' && (window as any).nyra?.branching?.getCurrentSessionId) {
        const id = (window as any).nyra.branching.getCurrentSessionId()
        setSessionId(id)
      }
    }

    getCurrentSessionId()
  }, [])

  // Fetch branch tree periodically
  useEffect(() => {
    if (!sessionId) return

    const fetchTree = async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).nyra?.branching?.getTree) {
          const tree = (window as any).nyra.branching.getTree(sessionId)
          setTree(tree || [])

          // Count branches and get active branch name
          let totalBranches = 0
          let activeName = 'Main'
          const countBranches = (nodes: BranchNode[]) => {
            for (const node of nodes) {
              totalBranches++
              if (node.isActive) activeName = node.name
              countBranches(node.children)
            }
          }
          countBranches(tree || [])

          setStats({ total: totalBranches, activeName })
        }
      } catch (err) {
        console.error('[ConversationTreePanel] Error fetching tree:', err)
      }
    }

    fetchTree()
    const interval = setInterval(fetchTree, 3000)
    return () => clearInterval(interval)
  }, [sessionId])

  // Format timestamp
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Toggle branch expansion
  const toggleExpanded = (branchId: string) => {
    const newExpanded = new Set(treeState.expandedBranches)
    if (newExpanded.has(branchId)) {
      newExpanded.delete(branchId)
    } else {
      newExpanded.add(branchId)
    }
    setTreeState({ ...treeState, expandedBranches: newExpanded })
  }

  // Handle rename
  const startRename = (branchId: string, currentName: string) => {
    setTreeState({
      ...treeState,
      renamingBranchId: branchId,
      renamingValue: currentName,
    })
  }

  const confirmRename = async (branchId: string) => {
    if (typeof window !== 'undefined' && (window as any).nyra?.branching?.renameBranch) {
      await (window as any).nyra.branching.renameBranch(branchId, treeState.renamingValue)
    }
    setTreeState({
      ...treeState,
      renamingBranchId: null,
      renamingValue: '',
    })
  }

  // Handle switch
  const switchBranch = async (branchId: string) => {
    if (typeof window !== 'undefined' && (window as any).nyra?.branching?.switchBranch) {
      await (window as any).nyra.branching.switchBranch(branchId)
    }
  }

  // Handle delete
  const deleteBranch = async (branchId: string) => {
    if (typeof window !== 'undefined' && (window as any).nyra?.branching?.deleteBranch) {
      await (window as any).nyra.branching.deleteBranch(branchId)
    }
  }

  // Handle fork
  const forkBranch = async (branchId: string) => {
    if (typeof window !== 'undefined' && (window as any).nyra?.branching?.fork) {
      await (window as any).nyra.branching.fork(branchId, treeState.forkAtIndex)
    }
    setTreeState({
      ...treeState,
      forking: null,
      forkAtIndex: 0,
    })
  }

  // Handle merge
  const mergeBranch = async (sourceBranchId: string, targetBranchId: string) => {
    if (typeof window !== 'undefined' && (window as any).nyra?.branching?.merge) {
      await (window as any).nyra.branching.merge(sourceBranchId, targetBranchId)
    }
    setTreeState({
      ...treeState,
      merging: null,
    })
  }

  // Load preview messages
  const loadPreview = async (branchId: string) => {
    if (typeof window !== 'undefined' && (window as any).nyra?.branching?.getMessages) {
      const messages = (window as any).nyra.branching.getMessages(branchId)
      const lastThree = (messages || []).slice(-3).map((m: any) => ({
        role: m.role,
        content: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : ''),
      }))
      setHoverPreview({ branchId, messages: lastThree })
    }
  }

  // Render tree recursively
  const renderNode = (node: BranchNode, depth: number): React.ReactNode => {
    const isExpanded = treeState.expandedBranches.has(node.id)
    const isRenaming = treeState.renamingBranchId === node.id

    return (
      <div key={node.id} className="select-none">
        {/* Tree branch line effect */}
        {depth > 0 && (
          <div
            className="absolute left-0 top-0 w-px h-full border-l border-white/[0.06]"
            style={{ left: `${depth * 20 - 10}px` }}
          />
        )}

        {/* Branch node */}
        <div
          className={`relative py-1.5 px-2 ml-[${depth * 20}px] hover:bg-white/[0.03] transition-colors ${
            node.isActive ? 'bg-terra-500/10 border-l-2 border-terra-500' : ''
          }`}
          onMouseEnter={() => loadPreview(node.id)}
          onMouseLeave={() => setHoverPreview(null)}
        >
          <div className="flex items-center gap-2 text-xs">
            {/* Expand toggle */}
            {node.children.length > 0 && (
              <button
                onClick={() => toggleExpanded(node.id)}
                className="p-0.5 hover:bg-white/[0.06] rounded"
              >
                {isExpanded ? (
                  <ChevronDown size={12} className="text-warm-400" />
                ) : (
                  <ChevronRight size={12} className="text-warm-400" />
                )}
              </button>
            )}
            {node.children.length === 0 && <div className="w-4" />}

            {/* Branch icon */}
            <GitBranch size={12} className="text-terra-400 flex-shrink-0" />

            {/* Branch name (editable) */}
            {isRenaming ? (
              <input
                type="text"
                value={treeState.renamingValue}
                onChange={(e) => setTreeState({ ...treeState, renamingValue: e.target.value })}
                className="flex-1 px-1.5 py-0.5 bg-white/[0.08] border border-terra-500/50 rounded text-white text-xs focus:outline-none focus:border-terra-500"
                autoFocus
              />
            ) : (
              <span className={`flex-1 font-medium ${node.isActive ? 'text-terra-300' : 'text-white/70'}`}>
                {node.name}
              </span>
            )}

            {/* Message count badge */}
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/[0.06] text-white/50">
              {node.messageCount}
            </span>

            {/* Timestamp */}
            <span className="text-[9px] text-white/40">{formatTime(node.createdAt)}</span>

            {/* Action buttons */}
            <div className="flex gap-1 ml-auto">
              {isRenaming ? (
                <>
                  <button
                    onClick={() => confirmRename(node.id)}
                    className="p-0.5 hover:bg-sage-500/20 rounded text-sage-400"
                    title="Confirm rename"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => setTreeState({ ...treeState, renamingBranchId: null })}
                    className="p-0.5 hover:bg-white/[0.06] rounded text-white/50"
                    title="Cancel"
                  >
                    <X size={12} />
                  </button>
                </>
              ) : (
                <>
                  {!node.isActive && (
                    <button
                      onClick={() => switchBranch(node.id)}
                      className="p-0.5 hover:bg-terra-500/20 rounded text-terra-400"
                      title="Switch to branch"
                    >
                      <GitBranch size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => startRename(node.id, node.name)}
                    className="p-0.5 hover:bg-gold-500/20 rounded text-gold-400"
                    title="Rename"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    onClick={() => setTreeState({ ...treeState, forking: { branchId: node.id, messageIndex: node.forkPoint } })}
                    className="p-0.5 hover:bg-sage-500/20 rounded text-sage-400"
                    title="Fork from here"
                  >
                    <Plus size={12} />
                  </button>
                  {node.parentId && (
                    <button
                      onClick={() => setTreeState({ ...treeState, merging: { sourceBranchId: node.id, targetBranchId: node.parentId! } })}
                      className="p-0.5 hover:bg-blush-500/20 rounded text-blush-400"
                      title="Merge into parent"
                    >
                      <GitMerge size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => deleteBranch(node.id)}
                    className="p-0.5 hover:bg-blush-500/20 rounded text-blush-400"
                    title="Delete branch"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Fork input */}
          {treeState.forking?.branchId === node.id && (
            <div className="mt-2 flex gap-2 items-center text-[11px]">
              <span className="text-white/50">Fork at message:</span>
              <input
                type="number"
                min="0"
                value={treeState.forkAtIndex}
                onChange={(e) => setTreeState({ ...treeState, forkAtIndex: parseInt(e.target.value) })}
                className="w-16 px-1.5 py-0.5 bg-white/[0.08] border border-terra-500/50 rounded text-white text-xs focus:outline-none focus:border-terra-500"
              />
              <button
                onClick={() => forkBranch(node.id)}
                className="px-2 py-0.5 rounded bg-terra-500/20 hover:bg-terra-500/30 text-terra-300 text-[11px] font-medium"
              >
                Create
              </button>
              <button
                onClick={() => setTreeState({ ...treeState, forking: null })}
                className="p-0.5 text-white/50 hover:text-white/70"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Merge confirmation */}
          {treeState.merging?.sourceBranchId === node.id && (
            <div className="mt-2 flex gap-2 items-center text-[11px]">
              <span className="text-white/50">Merge into parent?</span>
              <button
                onClick={() => mergeBranch(node.id, treeState.merging!.targetBranchId)}
                className="px-2 py-0.5 rounded bg-sage-500/20 hover:bg-sage-500/30 text-sage-300 text-[11px] font-medium"
              >
                Yes
              </button>
              <button
                onClick={() => setTreeState({ ...treeState, merging: null })}
                className="p-0.5 text-white/50 hover:text-white/70"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Preview tooltip */}
        {hoverPreview?.branchId === node.id && hoverPreview.messages.length > 0 && (
          <div className="absolute z-50 bottom-full left-0 mb-2 p-2 bg-warm-900/95 border border-white/[0.06] rounded text-[10px] w-60 pointer-events-none">
            <div className="text-white/70 font-medium mb-1">Last messages:</div>
            {hoverPreview.messages.map((msg, i) => (
              <div key={i} className="text-white/50 text-[9px] mb-1 last:mb-0">
                <span className="text-terra-400 font-mono">{msg.role}:</span> {msg.content}
              </div>
            ))}
          </div>
        )}

        {/* Render children */}
        {isExpanded && node.children.length > 0 && (
          <div className="relative">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-nyra-surface text-white/70 border-l border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-terra-400" />
          <span className="font-medium text-sm">Session Tree</span>
        </div>
        <button className="p-1 hover:bg-white/[0.06] rounded text-white/50 hover:text-white/70">
          <X size={14} />
        </button>
      </div>

      {/* Stats bar */}
      <div className="px-4 py-2 border-b border-white/[0.06] text-[11px] space-y-1">
        <div className="flex justify-between">
          <span className="text-white/40">Total branches:</span>
          <span className="text-terra-300 font-mono">{stats.total}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Active:</span>
          <span className="text-terra-300 font-medium">{stats.activeName}</span>
        </div>
      </div>

      {/* Tree view */}
      <div className="flex-1 overflow-y-auto">
        {tree.length === 0 ? (
          <div className="p-4 text-center text-white/40 text-sm">
            No branches yet. Fork a conversation to start branching.
          </div>
        ) : (
          <div className="p-2">
            {tree.map((node) => renderNode(node, 0))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ConversationTreePanel
