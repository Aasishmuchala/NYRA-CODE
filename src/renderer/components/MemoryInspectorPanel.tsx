/**
 * MemoryInspectorPanel — 5-Tier Memory Hierarchy Inspector
 *
 * Visualizes the MemGPT-class memory architecture:
 *   1. Working Memory   — volatile, current task context
 *   2. Episodic Memory  — session-based experiences
 *   3. Semantic Memory  — core knowledge & facts
 *   4. Procedural Memory — learned workflows & patterns
 *   5. Archival Memory  — compressed long-term storage
 *
 * Features:
 *   - Tier-by-tier stats (count, tokens, fill bar)
 *   - Browse entries within each tier
 *   - Cascade search across all tiers
 *   - Add new memories with smart tier routing
 *   - Delete individual entries
 *   - Working memory live state viewer
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Database, Brain, BookOpen, Cog, Archive, Zap,
  ChevronDown, ChevronRight, Search, Plus, Trash2,
  RefreshCw, Loader2, X, BarChart3,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface TierStats {
  count: number
  tokens: number
}

interface MemoryEntry {
  id: string
  content: string
  metadata?: {
    source?: string
    tier?: string
    tags?: string[]
    contentType?: string
    confidence?: number
    pinned?: boolean
  }
  importance?: number
  createdAt?: number
  accessCount?: number
}

interface CascadeResult {
  entry: MemoryEntry
  tier: string
  relevance: number
}

type TierName = 'working' | 'episodic' | 'semantic' | 'procedural' | 'archival'

const TIER_CONFIG: Record<TierName, {
  label: string
  icon: React.ReactNode
  color: string
  bgColor: string
  desc: string
}> = {
  working:    { label: 'Working',    icon: <Zap size={14} />,      color: 'text-terra-400', bgColor: 'bg-terra-500/20', desc: 'Current task context (volatile)' },
  episodic:   { label: 'Episodic',   icon: <BookOpen size={14} />,  color: 'text-gold-400',  bgColor: 'bg-gold-400/20',  desc: 'Session-based experiences' },
  semantic:   { label: 'Semantic',   icon: <Brain size={14} />,     color: 'text-sage-400',  bgColor: 'bg-sage-400/20',  desc: 'Core knowledge & facts' },
  procedural: { label: 'Procedural', icon: <Cog size={14} />,       color: 'text-terra-300',  bgColor: 'bg-terra-400/20',  desc: 'Learned workflows' },
  archival:   { label: 'Archival',   icon: <Archive size={14} />,   color: 'text-warm-400',  bgColor: 'bg-warm-500/20',  desc: 'Compressed long-term storage' },
}

const TIER_ORDER: TierName[] = ['working', 'episodic', 'semantic', 'procedural', 'archival']

// ── Section Toggle ───────────────────────────────────────────────────────

const Section: React.FC<{
  title: string
  icon: React.ReactNode
  badge?: string | number
  defaultOpen?: boolean
  children: React.ReactNode
}> = ({ title, icon, badge, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-nyra-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-warm-200 hover:bg-white/[0.03] transition-colors"
      >
        {open ? <ChevronDown size={14} className="text-warm-400" /> : <ChevronRight size={14} className="text-warm-400" />}
        <span className="text-warm-400">{icon}</span>
        <span className="flex-1 text-left">{title}</span>
        {badge !== undefined && badge !== 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-terra-500/20 text-terra-300">{badge}</span>
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

// ── Fill Bar ─────────────────────────────────────────────────────────────

const FillBar: React.FC<{ used: number; capacity: number; color: string }> = ({ used, capacity, color }) => {
  const pct = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0
  return (
    <div className="w-full h-1.5 rounded-full bg-warm-800/50 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Entry Card ───────────────────────────────────────────────────────────

const EntryCard: React.FC<{
  entry: MemoryEntry
  tier: TierName
  relevance?: number
  onDelete?: (tier: TierName, id: string) => void
}> = ({ entry, tier, relevance, onDelete }) => {
  const [expanded, setExpanded] = useState(false)
  const config = TIER_CONFIG[tier]

  return (
    <div className="py-1.5 border-l-2 pl-2" style={{ borderColor: 'var(--tw-border-opacity, 1)' }}>
      <div
        className={`border-l-2 pl-2 py-1 cursor-pointer ${config.color.replace('text-', 'border-')}`}
      >
        <div className="flex items-start gap-1.5">
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-0.5 shrink-0 text-warm-500 hover:text-warm-300"
          >
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] px-1 py-0.5 rounded font-mono ${config.bgColor} ${config.color}`}>
                {config.label}
              </span>
              {relevance !== undefined && (
                <span className="text-[10px] text-warm-500 font-mono">
                  {(relevance * 100).toFixed(0)}%
                </span>
              )}
              {entry.metadata?.pinned && (
                <span className="text-[10px] text-gold-400">📌</span>
              )}
              {entry.importance !== undefined && (
                <span className="text-[10px] text-warm-600 font-mono">
                  imp:{entry.importance.toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-warm-300 mt-0.5 break-words line-clamp-2">
              {entry.content?.slice(0, 200)}
            </p>
          </div>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(tier, entry.id) }}
              className="shrink-0 p-0.5 text-warm-600 hover:text-blush-400 transition-colors"
              title="Delete entry"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
        {expanded && (
          <div className="mt-2 ml-4 space-y-1 text-[10px]">
            <p className="text-warm-300 whitespace-pre-wrap break-words">{entry.content}</p>
            {entry.metadata?.tags && entry.metadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {entry.metadata.tags.map((tag, i) => (
                  <span key={i} className="px-1 py-0.5 rounded bg-warm-700/50 text-warm-400">{tag}</span>
                ))}
              </div>
            )}
            <div className="flex gap-3 text-warm-600">
              {entry.metadata?.source && <span>source: {entry.metadata.source}</span>}
              {entry.metadata?.contentType && <span>type: {entry.metadata.contentType}</span>}
              {entry.accessCount !== undefined && <span>accessed: {entry.accessCount}x</span>}
              {entry.createdAt && <span>{new Date(entry.createdAt).toLocaleDateString()}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────────────

export const MemoryInspectorPanel: React.FC = () => {
  const [stats, setStats] = useState<Record<TierName, TierStats> | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CascadeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [activeTier, setActiveTier] = useState<TierName | null>(null)
  const [tierEntries, setTierEntries] = useState<MemoryEntry[]>([])
  const [tierLoading, setTierLoading] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [addContent, setAddContent] = useState('')
  const [addTier, setAddTier] = useState<TierName>('semantic')
  const [workingState, setWorkingState] = useState<any>(null)

  const searchRef = useRef<HTMLInputElement>(null)

  // ── Load stats ─────────────────────────────────────────────────────────

  const refreshStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.nyra.tieredMemory.getStats()
      if (res.success) setStats(res.stats)
    } catch (err) {
      console.warn('[MemoryInspector] Failed to load stats:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshStats() }, [refreshStats])

  // ── Cascade search ─────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await window.nyra.tieredMemory.cascadeSearch(q, 8000)
      if (res.success) {
        setSearchResults(res.result.results || [])
      }
    } catch (err) {
      console.warn('[MemoryInspector] Search failed:', err)
    } finally {
      setSearching(false)
    }
  }, [searchQuery])

  // ── Browse tier ────────────────────────────────────────────────────────

  const browseTier = useCallback(async (tier: TierName) => {
    if (activeTier === tier) { setActiveTier(null); return }
    setActiveTier(tier)
    setTierLoading(true)
    try {
      if (tier === 'working') {
        const res = await window.nyra.tieredMemory.getWorkingState()
        if (res.success) setWorkingState(res.state)
        setTierEntries([])
      } else {
        const res = await window.nyra.tieredMemory.tierList(tier, 0, 50)
        if (res.success) setTierEntries(res.entries || [])
      }
    } catch (err) {
      console.warn(`[MemoryInspector] Browse ${tier} failed:`, err)
    } finally {
      setTierLoading(false)
    }
  }, [activeTier])

  // ── Add memory ─────────────────────────────────────────────────────────

  const handleAdd = useCallback(async () => {
    const content = addContent.trim()
    if (!content) return
    try {
      await window.nyra.tieredMemory.remember(content, {}, addTier)
      setAddContent('')
      setAddMode(false)
      refreshStats()
      if (activeTier) browseTier(activeTier) // Refresh current view
    } catch (err) {
      console.warn('[MemoryInspector] Add failed:', err)
    }
  }, [addContent, addTier, refreshStats, activeTier, browseTier])

  // ── Delete entry ───────────────────────────────────────────────────────

  const handleDelete = useCallback(async (tier: TierName, id: string) => {
    try {
      await window.nyra.tieredMemory.remove(tier, id)
      refreshStats()
      if (activeTier === tier) browseTier(tier)
    } catch (err) {
      console.warn('[MemoryInspector] Delete failed:', err)
    }
  }, [refreshStats, activeTier, browseTier])

  // ── Tier capacity limits (mirroring default config) ────────────────────

  const TIER_CAPACITIES: Record<TierName, number> = {
    working: 50,
    episodic: 500,
    semantic: 5000,
    procedural: 200,
    archival: 50000,
  }

  const formatTokens = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return String(n)
  }

  return (
    <div className="h-full flex flex-col bg-nyra-surface text-warm-200 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-nyra-border">
        <Database size={16} className="text-sage-400" />
        <span className="text-sm font-semibold text-warm-100">Memory Inspector</span>
        <div className="flex-1" />
        <button
          onClick={() => setAddMode(m => !m)}
          className="p-1 text-warm-500 hover:text-terra-300 transition-colors"
          title="Add memory"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={refreshStats}
          disabled={loading}
          className="p-1 text-warm-500 hover:text-warm-300 transition-colors disabled:opacity-30"
          title="Refresh stats"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {/* ── Add Memory Form ──────────────────────────────────────────── */}
      {addMode && (
        <div className="px-3 py-2 border-b border-nyra-border space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-warm-400">Add to:</span>
            <div className="flex gap-1">
              {TIER_ORDER.filter(t => t !== 'working').map(t => (
                <button
                  key={t}
                  onClick={() => setAddTier(t)}
                  className={`px-1.5 py-0.5 text-[10px] rounded transition-all ${
                    addTier === t
                      ? `${TIER_CONFIG[t].bgColor} ${TIER_CONFIG[t].color} ring-1 ring-current/30`
                      : 'text-warm-500 hover:text-warm-300'
                  }`}
                >
                  {TIER_CONFIG[t].label}
                </button>
              ))}
            </div>
            <button onClick={() => setAddMode(false)} className="ml-auto p-0.5 text-warm-600 hover:text-warm-300">
              <X size={12} />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={addContent}
              onChange={e => setAddContent(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              placeholder="Memory content..."
              className="flex-1 bg-nyra-bg border border-nyra-border rounded px-2 py-1 text-[11px] text-warm-100 placeholder:text-warm-600 focus:outline-none focus:ring-1 focus:ring-terra-500/40"
            />
            <button
              onClick={handleAdd}
              disabled={!addContent.trim()}
              className="px-2 py-1 text-[11px] rounded bg-terra-500/20 text-terra-300 hover:bg-terra-500/30 disabled:opacity-30 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* ── Search ──────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-nyra-border">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-warm-600" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
              placeholder="Cascade search across all tiers..."
              className="w-full bg-nyra-bg border border-nyra-border rounded pl-7 pr-2 py-1 text-[11px] text-warm-100 placeholder:text-warm-600 focus:outline-none focus:ring-1 focus:ring-sage-400/40"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!searchQuery.trim() || searching}
            className="px-2 py-1 text-[11px] rounded bg-sage-400/20 text-sage-300 hover:bg-sage-400/30 disabled:opacity-30 transition-colors"
          >
            {searching ? <Loader2 size={12} className="animate-spin" /> : 'Search'}
          </button>
        </div>
      </div>

      {/* ── Scrollable Content ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Search Results */}
        {searchResults.length > 0 && (
          <Section title="Search Results" icon={<Search size={14} />} badge={searchResults.length} defaultOpen={true}>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {searchResults.map((r, i) => (
                <EntryCard
                  key={r.entry?.id || i}
                  entry={r.entry}
                  tier={(r.tier || 'semantic') as TierName}
                  relevance={r.relevance}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Tier Overview */}
        <Section title="Tier Overview" icon={<BarChart3 size={14} />} defaultOpen={true}>
          {!stats ? (
            <p className="text-[11px] text-warm-600 italic">Loading stats...</p>
          ) : (
            <div className="space-y-2">
              {TIER_ORDER.map(tier => {
                const config = TIER_CONFIG[tier]
                const tierStats = stats[tier] || { count: 0, tokens: 0 }
                const capacity = TIER_CAPACITIES[tier]
                const isActive = activeTier === tier
                const barColor = config.color.replace('text-', 'bg-')

                return (
                  <button
                    key={tier}
                    onClick={() => browseTier(tier)}
                    className={`w-full text-left p-2 rounded-lg transition-all ${
                      isActive
                        ? `${config.bgColor} ring-1 ring-current/20`
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={config.color}>{config.icon}</span>
                      <span className="text-[11px] font-medium text-warm-200">{config.label}</span>
                      <span className="text-[10px] text-warm-600 ml-auto font-mono">
                        {tierStats.count}/{capacity}
                      </span>
                      <span className="text-[10px] text-warm-600 font-mono">
                        {formatTokens(tierStats.tokens)} tok
                      </span>
                    </div>
                    <div className="mt-1">
                      <FillBar used={tierStats.count} capacity={capacity} color={barColor} />
                    </div>
                    <p className="text-[10px] text-warm-600 mt-0.5">{config.desc}</p>
                  </button>
                )
              })}
            </div>
          )}
        </Section>

        {/* Tier Browser */}
        {activeTier && (
          <Section
            title={`${TIER_CONFIG[activeTier].label} Memory`}
            icon={TIER_CONFIG[activeTier].icon}
            badge={activeTier === 'working' ? undefined : tierEntries.length}
            defaultOpen={true}
          >
            {tierLoading ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 size={14} className="animate-spin text-warm-500" />
                <span className="text-[11px] text-warm-500">Loading...</span>
              </div>
            ) : activeTier === 'working' ? (
              /* Working memory live state */
              workingState ? (
                <div className="space-y-2 text-[11px]">
                  {workingState.currentTask && (
                    <div>
                      <span className="text-warm-500 font-medium">Current Task:</span>
                      <p className="text-warm-300 mt-0.5">{workingState.currentTask}</p>
                    </div>
                  )}
                  {workingState.scratchpad && (
                    <div>
                      <span className="text-warm-500 font-medium">Scratchpad:</span>
                      <pre className="text-warm-300 mt-0.5 whitespace-pre-wrap text-[10px] bg-nyra-bg p-1.5 rounded max-h-32 overflow-y-auto">
                        {workingState.scratchpad}
                      </pre>
                    </div>
                  )}
                  {workingState.recentMessages && workingState.recentMessages.length > 0 && (
                    <div>
                      <span className="text-warm-500 font-medium">Recent Messages ({workingState.recentMessages.length}):</span>
                      <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                        {workingState.recentMessages.slice(0, 10).map((msg: any, i: number) => (
                          <div key={i} className="text-[10px] text-warm-400 truncate">
                            <span className="text-warm-600">{msg.role}:</span> {msg.content?.slice(0, 100)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!workingState.currentTask && !workingState.scratchpad && (
                    <p className="text-warm-600 italic">Working memory is empty.</p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-warm-600 italic">No working memory state available.</p>
              )
            ) : tierEntries.length === 0 ? (
              <p className="text-[11px] text-warm-600 italic">No entries in {TIER_CONFIG[activeTier].label} memory.</p>
            ) : (
              <div className="space-y-0.5 max-h-64 overflow-y-auto">
                {tierEntries.map((entry, i) => (
                  <EntryCard
                    key={entry.id || i}
                    entry={entry}
                    tier={activeTier}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

      </div>
    </div>
  )
}

export default MemoryInspectorPanel
