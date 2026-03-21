/**
 * CommandPaletteV2 — Panel Launcher (Cmd+K)
 * Fuzzy-search palette for all 38 panels with grouped display.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Settings, Clock, Monitor, Brain, Lightbulb, Workflow, Zap, MessageSquare,
  Share2, Network, BookMarked, GitBranch, BarChart3, Bell, FolderSearch,
  Gauge, Package, Mic, Paperclip, GitCompare, FlaskConical, Palette,
  SearchCode, Rss, FileArchive, FileText, Webhook, DatabaseBackup,
  Share, Bug, WifiOff, Accessibility, ShieldCheck, Cpu, Activity,
  ArrowRight, X, Database, Layers,
} from 'lucide-react'

interface PaletteItem {
  id: string
  label: string
  group: string
  icon: React.ReactNode
  keywords?: string[]
}

interface CommandPaletteV2Props {
  open: boolean
  onClose: () => void
  onSelectPanel: (panelId: string) => void
  currentPanel: string
}

// ── Icon map ───────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ReactNode> = {
  settings: <Settings size={14} />,
  scheduled: <Clock size={14} />,
  'computer-use': <Monitor size={14} />,
  'agent-pipeline': <Workflow size={14} />,
  'memory-inspector': <Brain size={14} />,
  'workflow-recipes': <Lightbulb size={14} />,
  'agent-studio': <Zap size={14} />,
  'stream-chat': <MessageSquare size={14} />,
  'collab-timeline': <Share2 size={14} />,
  'provider-dashboard': <Network size={14} />,
  'knowledge-graph': <BookMarked size={14} />,
  'conv-tree': <GitBranch size={14} />,
  'agent-analytics': <BarChart3 size={14} />,
  'notification-center': <Bell size={14} />,
  'codebase-explorer': <FolderSearch size={14} />,
  'context-visualizer': <Gauge size={14} />,
  'plugin-studio': <Package size={14} />,
  'prompt-library-v2': <BookMarked size={14} />,
  'task-board': <Activity size={14} />,
  'api-playground': <Zap size={14} />,
  'perf-profiler': <Gauge size={14} />,
  'voice-interface': <Mic size={14} />,
  'file-attachment': <Paperclip size={14} />,
  'diff-viewer': <GitCompare size={14} />,
  'ab-testing': <FlaskConical size={14} />,
  'theme-editor': <Palette size={14} />,
  'global-search': <SearchCode size={14} />,
  'activity-feed': <Rss size={14} />,
  'workspace-export': <FileArchive size={14} />,
  'report-gen': <FileText size={14} />,
  'webhook-mgr': <Webhook size={14} />,
  'backup-mgr': <DatabaseBackup size={14} />,
  'session-sharing': <Share size={14} />,
  'error-boundary': <Bug size={14} />,
  'offline-mgr': <WifiOff size={14} />,
  'startup-profiler': <Cpu size={14} />,
  accessibility: <Accessibility size={14} />,
  'build-validator': <ShieldCheck size={14} />,
}

// ── Panel registry with all 38 panels ───────────────────────────────────────────
const PALETTE_ITEMS: PaletteItem[] = [
  // Core
  { id: 'settings', label: 'Settings', group: 'Core', icon: ICON_MAP['settings'], keywords: ['preferences', 'config', 'theme', 'appearance'] },
  { id: 'scheduled', label: 'Scheduled Tasks', group: 'Core', icon: ICON_MAP['scheduled'], keywords: ['tasks', 'calendar', 'automation'] },
  { id: 'notification-center', label: 'Notification Center', group: 'Core', icon: ICON_MAP['notification-center'], keywords: ['alerts', 'messages', 'notify'] },
  { id: 'activity-feed', label: 'Activity Feed', group: 'Core', icon: ICON_MAP['activity-feed'], keywords: ['recent', 'history', 'log'] },

  // AI & Agents
  { id: 'agent-pipeline', label: 'Agent Pipeline', group: 'AI & Agents', icon: ICON_MAP['agent-pipeline'], keywords: ['workflow', 'automation', 'agents'] },
  { id: 'agent-studio', label: 'Agent Studio', group: 'AI & Agents', icon: ICON_MAP['agent-studio'], keywords: ['create', 'build', 'agent', 'design'] },
  { id: 'stream-chat', label: 'Stream Chat', group: 'AI & Agents', icon: ICON_MAP['stream-chat'], keywords: ['chat', 'messaging', 'collaboration'] },
  { id: 'memory-inspector', label: 'Memory Inspector', group: 'AI & Agents', icon: ICON_MAP['memory-inspector'], keywords: ['brain', 'context', 'recall', 'storage'] },
  { id: 'computer-use', label: 'Computer Use', group: 'AI & Agents', icon: ICON_MAP['computer-use'], keywords: ['desktop', 'screen', 'monitor', 'ui'] },
  { id: 'voice-interface', label: 'Voice Interface', group: 'AI & Agents', icon: ICON_MAP['voice-interface'], keywords: ['audio', 'speech', 'talk', 'voice'] },

  // Knowledge & Context
  { id: 'knowledge-graph', label: 'Knowledge Graph', group: 'Knowledge', icon: ICON_MAP['knowledge-graph'], keywords: ['graph', 'entities', 'relationships', 'data'] },
  { id: 'context-visualizer', label: 'Context Visualizer', group: 'Knowledge', icon: ICON_MAP['context-visualizer'], keywords: ['visualize', 'display', 'context', 'view'] },
  { id: 'conv-tree', label: 'Conversation Tree', group: 'Knowledge', icon: ICON_MAP['conv-tree'], keywords: ['chat', 'history', 'branches', 'tree'] },
  { id: 'codebase-explorer', label: 'Codebase Explorer', group: 'Knowledge', icon: ICON_MAP['codebase-explorer'], keywords: ['code', 'source', 'search', 'files'] },
  { id: 'global-search', label: 'Global Search', group: 'Knowledge', icon: ICON_MAP['global-search'], keywords: ['search', 'find', 'query'] },

  // Tools & Development
  { id: 'workflow-recipes', label: 'Workflow Recipes', group: 'Tools', icon: ICON_MAP['workflow-recipes'], keywords: ['templates', 'recipes', 'automation'] },
  { id: 'api-playground', label: 'API Playground', group: 'Tools', icon: ICON_MAP['api-playground'], keywords: ['api', 'rest', 'test', 'request'] },
  { id: 'plugin-studio', label: 'Plugin Studio', group: 'Tools', icon: ICON_MAP['plugin-studio'], keywords: ['plugin', 'extension', 'module'] },
  { id: 'task-board', label: 'Task Board', group: 'Tools', icon: ICON_MAP['task-board'], keywords: ['tasks', 'board', 'kanban', 'todo'] },
  { id: 'file-attachment', label: 'File Attachment', group: 'Tools', icon: ICON_MAP['file-attachment'], keywords: ['files', 'upload', 'attach', 'import'] },
  { id: 'diff-viewer', label: 'Diff Viewer', group: 'Tools', icon: ICON_MAP['diff-viewer'], keywords: ['diff', 'compare', 'changes', 'git'] },
  { id: 'prompt-library-v2', label: 'Prompt Library', group: 'Tools', icon: ICON_MAP['prompt-library-v2'], keywords: ['prompts', 'templates', 'saved', 'library'] },
  { id: 'theme-editor', label: 'Theme Editor', group: 'Tools', icon: ICON_MAP['theme-editor'], keywords: ['theme', 'colors', 'design', 'appearance'] },
  { id: 'workspace-export', label: 'Workspace Export', group: 'Tools', icon: ICON_MAP['workspace-export'], keywords: ['export', 'backup', 'save', 'archive'] },

  // Analytics & Monitoring
  { id: 'agent-analytics', label: 'Agent Analytics', group: 'Analytics', icon: ICON_MAP['agent-analytics'], keywords: ['analytics', 'stats', 'metrics', 'data'] },
  { id: 'perf-profiler', label: 'Performance Profiler', group: 'Analytics', icon: ICON_MAP['perf-profiler'], keywords: ['performance', 'profile', 'speed', 'optimization'] },
  { id: 'ab-testing', label: 'A/B Testing', group: 'Analytics', icon: ICON_MAP['ab-testing'], keywords: ['test', 'experiment', 'variant', 'compare'] },
  { id: 'report-gen', label: 'Report Generator', group: 'Analytics', icon: ICON_MAP['report-gen'], keywords: ['report', 'generate', 'export', 'document'] },

  // Collaboration & System
  { id: 'collab-timeline', label: 'Collaboration Timeline', group: 'System', icon: ICON_MAP['collab-timeline'], keywords: ['collaboration', 'timeline', 'shared', 'team'] },
  { id: 'provider-dashboard', label: 'Provider Dashboard', group: 'System', icon: ICON_MAP['provider-dashboard'], keywords: ['provider', 'api', 'service', 'integration'] },
  { id: 'webhook-mgr', label: 'Webhook Manager', group: 'System', icon: ICON_MAP['webhook-mgr'], keywords: ['webhook', 'integration', 'event', 'hook'] },
  { id: 'session-sharing', label: 'Session Sharing', group: 'System', icon: ICON_MAP['session-sharing'], keywords: ['share', 'session', 'collaborate', 'invite'] },
  { id: 'backup-mgr', label: 'Backup Manager', group: 'System', icon: ICON_MAP['backup-mgr'], keywords: ['backup', 'restore', 'save', 'storage'] },
  { id: 'offline-mgr', label: 'Offline Manager', group: 'System', icon: ICON_MAP['offline-mgr'], keywords: ['offline', 'sync', 'connection'] },
  { id: 'error-boundary', label: 'Error Boundary', group: 'System', icon: ICON_MAP['error-boundary'], keywords: ['error', 'debug', 'log', 'crash'] },
  { id: 'startup-profiler', label: 'Startup Profiler', group: 'System', icon: ICON_MAP['startup-profiler'], keywords: ['startup', 'boot', 'load', 'init'] },
  { id: 'accessibility', label: 'Accessibility', group: 'System', icon: ICON_MAP['accessibility'], keywords: ['a11y', 'wcag', 'screen reader', 'accessibility'] },
  { id: 'build-validator', label: 'Build Validator', group: 'System', icon: ICON_MAP['build-validator'], keywords: ['build', 'validation', 'check', 'verify'] },
]

// ── Fuzzy search ───────────────────────────────────────────────────────────────
const fuzzyMatch = (query: string, item: PaletteItem): boolean => {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  return (
    item.label.toLowerCase().includes(q) ||
    item.group.toLowerCase().includes(q) ||
    (item.keywords ?? []).some(kw => kw.toLowerCase().includes(q))
  )
}

const filterAndGroupItems = (query: string): Record<string, PaletteItem[]> => {
  const filtered = PALETTE_ITEMS.filter(item => fuzzyMatch(query, item))
  const grouped: Record<string, PaletteItem[]> = {}
  filtered.forEach(item => {
    if (!grouped[item.group]) grouped[item.group] = []
    grouped[item.group].push(item)
  })
  return grouped
}

export const CommandPaletteV2: React.FC<CommandPaletteV2Props> = ({
  open, onClose, onSelectPanel, currentPanel,
}) => {
  const [query, setQuery] = useState('')
  const [cursorIndex, setCursorIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const grouped = filterAndGroupItems(query)
  const flatItems = Object.values(grouped).flat()

  // ── Focus input when opened ────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery('')
      setCursorIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // ── Keyboard navigation ────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursorIndex(i => (i + 1) % flatItems.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursorIndex(i => (i === 0 ? flatItems.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatItems[cursorIndex]) {
        onSelectPanel(flatItems[cursorIndex].id)
        onClose()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const handleSelect = (panelId: string) => {
    onSelectPanel(panelId)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-nyra-surface border border-white/[0.08] rounded-2xl shadow-2xl max-w-lg w-full mx-4 flex flex-col max-h-[70vh]">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setCursorIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search 38 panels…"
            className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/25 outline-none"
          />
          <kbd className="text-[10px] text-white/20 bg-white/5 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1 py-1.5 scrollbar-thin">
          {flatItems.length === 0 ? (
            <p className="text-white/25 text-xs text-center py-8">No panels found for "{query}"</p>
          ) : (
            Object.entries(grouped).map(([groupName, items]) => (
              <Section key={groupName} label={groupName}>
                {items.map((item, idx) => {
                  const globalIdx = flatItems.findIndex(i => i.id === item.id)
                  return (
                    <PaletteItemRow
                      key={item.id}
                      item={item}
                      active={globalIdx === cursorIndex}
                      isCurrent={item.id === currentPanel}
                      onClick={() => handleSelect(item.id)}
                    />
                  )
                })}
              </Section>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.06] text-[10px] text-white/20">
          <span className="flex items-center gap-1"><kbd className="font-mono bg-white/5 px-1 rounded">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="font-mono bg-white/5 px-1 rounded">↵</kbd> select</span>
          <span className="flex items-center gap-1"><kbd className="font-mono bg-white/5 px-1 rounded">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}

// ── Section component ──────────────────────────────────────────────────────────
const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="mb-1">
    <p className="px-4 py-1.5 text-[9px] font-semibold text-white/20 uppercase tracking-widest">{label}</p>
    {children}
  </div>
)

// ── Palette item row ───────────────────────────────────────────────────────────
interface PaletteItemRowProps {
  item: PaletteItem
  active: boolean
  isCurrent: boolean
  onClick: () => void
}
const PaletteItemRow: React.FC<PaletteItemRowProps> = ({ item, active, isCurrent, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
      active
        ? 'bg-terra-400/10 text-terra-300'
        : isCurrent
          ? 'bg-terra-400/5 text-white/80'
          : 'text-white/60 hover:bg-white/[0.04] hover:text-white/90'
    }`}
  >
    <span className={`flex-shrink-0 ${active ? 'text-terra-400' : isCurrent ? 'text-terra-300' : 'text-white/30'}`}>
      {item.icon}
    </span>
    <div className="flex-1 min-w-0">
      <div className="text-sm truncate">{item.label}</div>
    </div>
    <span className="text-[9px] text-white/20 uppercase tracking-wider flex-shrink-0 ml-2">{item.group}</span>
    {active && <ArrowRight size={12} className="text-terra-400 flex-shrink-0" />}
  </button>
)
