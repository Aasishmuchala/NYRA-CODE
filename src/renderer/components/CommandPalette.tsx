/**
 * CommandPalette — ⌘K overlay
 * Searches sessions, commands, and saved prompts with keyboard navigation.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Search, Plus, Settings, Clock, BookOpen, Download,
  Hash, ArrowRight, Mic, FileText
} from 'lucide-react'
import type { Session } from '../hooks/useOpenClaw'
import type { SavedPrompt } from '../../preload/index'

interface Command {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
  shortcut?: string
}

interface Props {
  onClose: () => void
  sessions: Session[]
  onSelectSession: (id: string) => void
  onNewChat: () => void
  onOpenSettings: () => void
  onOpenScheduled: () => void
  onOpenPrompts: () => void
  onOpenExport: () => void
  onStartVoice: () => void
  searchSessions: (q: string) => Array<{ session: Session; matchedMsg?: { content: string }; score: number }>
}

export const CommandPalette: React.FC<Props> = ({
  onClose, sessions, onSelectSession,
  onNewChat, onOpenSettings, onOpenScheduled, onOpenPrompts, onOpenExport, onStartVoice,
  searchSessions,
}) => {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [prompts, setPrompts] = useState<SavedPrompt[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    window.nyra.prompts.list().then(setPrompts).catch(() => {})
  }, [])

  // ── Static commands ──────────────────────────────────────────────────────────
  const COMMANDS: Command[] = [
    { id: 'new-chat',  label: 'New Chat',        icon: <Plus size={14} />,     action: () => { onNewChat(); onClose() },      shortcut: '⌘N' },
    { id: 'settings',  label: 'Settings',         icon: <Settings size={14} />, action: () => { onOpenSettings(); onClose() }, shortcut: '⌘,' },
    { id: 'scheduled', label: 'Scheduled Tasks',  icon: <Clock size={14} />,    action: () => { onOpenScheduled(); onClose() } },
    { id: 'prompts',   label: 'Prompt Library',   icon: <BookOpen size={14} />, action: () => { onOpenPrompts(); onClose() } },
    { id: 'export',    label: 'Export Chat',       icon: <Download size={14} />, action: () => { onOpenExport(); onClose() } },
    { id: 'voice',     label: 'Voice Input',       icon: <Mic size={14} />,      action: () => { onStartVoice(); onClose() } },
  ]

  // ── Filtered results ─────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase()

  const matchedCommands = q
    ? COMMANDS.filter(c => c.label.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q))
    : COMMANDS

  const matchedSessions = q
    ? searchSessions(q).slice(0, 6)
    : sessions.slice(0, 5).map(s => ({ session: s, score: 1, matchedMsg: undefined as { content: string } | undefined }))

  const matchedPrompts = q
    ? prompts.filter(p => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)).slice(0, 4)
    : prompts.slice(0, 3)

  type Item =
    | { kind: 'cmd';     data: Command }
    | { kind: 'session'; data: { session: Session; matchedMsg?: { content: string }; score: number } }
    | { kind: 'prompt';  data: SavedPrompt }

  const allItems: Item[] = [
    ...matchedCommands.map(c => ({ kind: 'cmd' as const, data: c })),
    ...matchedSessions.map(r => ({ kind: 'session' as const, data: r })),
    ...matchedPrompts.map(p => ({ kind: 'prompt' as const, data: p })),
  ]

  const clampedCursor = Math.min(cursor, allItems.length - 1)

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${clampedCursor}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [clampedCursor])

  const executeItem = useCallback((item: Item) => {
    if (item.kind === 'cmd') {
      item.data.action()
    } else if (item.kind === 'session') {
      onSelectSession(item.data.session.id)
      onClose()
    } else if (item.kind === 'prompt') {
      // Insert prompt text into input (via clipboard)
      navigator.clipboard.writeText(item.data.content).catch(() => {})
      onClose()
    }
  }, [onSelectSession, onClose])

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, allItems.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && allItems[clampedCursor]) { executeItem(allItems[clampedCursor]) }
    if (e.key === 'Escape') onClose()
  }, [allItems, clampedCursor, executeItem, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[580px] max-h-[480px] bg-[#141414] border border-white/10 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.07]">
          <Search size={15} className="text-white/30 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={handleKey}
            placeholder="Search sessions, commands, prompts…"
            className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/25 outline-none"
          />
          <kbd className="text-[10px] text-white/20 bg-white/5 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1 py-1.5 scrollbar-thin">

          {/* Commands */}
          {matchedCommands.length > 0 && (
            <Section label="Commands">
              {matchedCommands.map((cmd, i) => {
                const idx = i
                return (
                  <ResultRow
                    key={cmd.id}
                    idx={idx}
                    active={idx === clampedCursor}
                    icon={cmd.icon}
                    label={cmd.label}
                    meta={cmd.shortcut}
                    onClick={() => executeItem({ kind: 'cmd', data: cmd })}
                  />
                )
              })}
            </Section>
          )}

          {/* Sessions */}
          {matchedSessions.length > 0 && (
            <Section label="Chats">
              {matchedSessions.map((r, i) => {
                const idx = matchedCommands.length + i
                const preview = r.matchedMsg?.content.slice(0, 60) ?? r.session.messages?.[r.session.messages.length - 1]?.content?.slice(0, 60) ?? ''
                return (
                  <ResultRow
                    key={r.session.id}
                    idx={idx}
                    active={idx === clampedCursor}
                    icon={<Hash size={13} />}
                    label={r.session.title || 'New chat'}
                    meta={preview || undefined}
                    onClick={() => executeItem({ kind: 'session', data: r })}
                  />
                )
              })}
            </Section>
          )}

          {/* Prompts */}
          {matchedPrompts.length > 0 && (
            <Section label="Saved Prompts">
              {matchedPrompts.map((p, i) => {
                const idx = matchedCommands.length + matchedSessions.length + i
                return (
                  <ResultRow
                    key={p.id}
                    idx={idx}
                    active={idx === clampedCursor}
                    icon={<FileText size={13} />}
                    label={p.title}
                    meta="Click to copy"
                    onClick={() => executeItem({ kind: 'prompt', data: p })}
                  />
                )
              })}
            </Section>
          )}

          {allItems.length === 0 && (
            <p className="text-white/25 text-xs text-center py-8">No results for "{query}"</p>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.06] text-[10px] text-white/20">
          <span className="flex items-center gap-1"><kbd className="font-mono bg-white/5 px-1 rounded">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="font-mono bg-white/5 px-1 rounded">↵</kbd> select</span>
          <span className="flex items-center gap-1"><kbd className="font-mono bg-white/5 px-1 rounded">⌘K</kbd> close</span>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="mb-1">
    <p className="px-4 py-1.5 text-[9px] font-semibold text-white/25 uppercase tracking-widest">{label}</p>
    {children}
  </div>
)

interface RowProps {
  idx: number
  active: boolean
  icon: React.ReactNode
  label: string
  meta?: string
  onClick: () => void
}
const ResultRow: React.FC<RowProps> = ({ idx, active, icon, label, meta, onClick }) => (
  <button
    data-idx={idx}
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
      active ? 'bg-terra-400/15 text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white/90'
    }`}
  >
    <span className={`flex-shrink-0 ${active ? 'text-terra-400' : 'text-white/30'}`}>{icon}</span>
    <span className="flex-1 text-sm truncate">{label}</span>
    {meta && <span className="text-[10px] text-white/25 truncate max-w-[150px]">{meta}</span>}
    {active && <ArrowRight size={12} className="text-terra-400 flex-shrink-0" />}
  </button>
)
