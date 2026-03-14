/**
 * Nyra Desktop — Executive Layout (v3)
 *
 * Layout: ProjectsRail (52px) | Sidebar (220px) | ChatArea (flex-1) | [ArtifactPane (400px)]
 *
 * Features: Projects, CommandPalette, PromptLibrary, VoiceInput, ArtifactPane,
 *           ExportModal, BranchSession, Theme, Offline queue, Token batching.
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  Plus, Search, Settings, Cpu, X, Clock, Moon,
  Loader2, AlertTriangle, RefreshCw, BookOpen,
  Download, GitBranch, Hash, Pin, MoreHorizontal,
  Trash2,
} from 'lucide-react'

import { useOpenClaw } from './hooks/useOpenClaw'
import type { Session, SessionColor } from './hooks/useOpenClaw'
import { TitleBar }            from './components/TitleBar'
import { BootSplash }          from './components/BootSplash'
import { ChatMessageBubble }   from './components/ChatMessage'
import { ChatInput }           from './components/ChatInput'
import { SettingsPanel }       from './components/SettingsPanel'
import { StatusBar }           from './components/StatusBar'
import { DragDropOverlay }     from './components/DragDropOverlay'
import { ModelSelector }       from './components/ModelSelector'
import { NotificationBanner }  from './components/NotificationBanner'
import { ScheduledTasks }      from './components/ScheduledTasks'
import { CommandPalette }      from './components/CommandPalette'
import { ProjectsRail, CreateProjectModal } from './components/ProjectsRail'
import { ArtifactPane, parseArtifacts }    from './components/ArtifactPane'
import { PromptLibrary }       from './components/PromptLibrary'
import { ExportModal }         from './components/ExportModal'
import { VoiceInput }          from './components/VoiceInput'
import type { Project }        from '../preload/index'
import type { ChatMessage }    from './hooks/useOpenClaw'

// ── Panel state ────────────────────────────────────────────────────────────────
type Panel = 'none' | 'settings' | 'scheduled'
type Modal = 'none' | 'prompts' | 'export' | 'voice' | 'createProject' | 'commandPalette'

// ── Session color map ──────────────────────────────────────────────────────────
const COLOR_DOT: Record<SessionColor, string> = {
  indigo: 'bg-terra-300', violet: 'bg-gold-400', rose: 'bg-blush-400',
  amber: 'bg-gold-400', emerald: 'bg-sage-400', cyan: 'bg-terra-300', none: '',
}

// ── Welcome suggestions ────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { icon: '✦', text: 'Summarise my day' },
  { icon: '⌘', text: 'Write a bash script' },
  { icon: '◈', text: 'Explain this code' },
  { icon: '◉', text: 'Draft an email' },
  { icon: '⊕', text: 'Create a todo list' },
  { icon: '⊗', text: 'Debug an error' },
]

// ─────────────────────────────────────────────────────────────────────────────
export const App: React.FC = () => {
  const oc = useOpenClaw()

  // ── UI state ──────────────────────────────────────────────────────────────
  const [panel, setPanel]                 = useState<Panel>('none')
  const [modal, setModal]                 = useState<Modal>('none')
  const [searchQuery, setSearchQuery]     = useState('')
  const [incognito, setIncognito]         = useState(false)
  const [model, setModel]                 = useState('auto')
  const [zoomLabel, setZoomLabel]         = useState<string | null>(null)
  const [artifactOpen, setArtifactOpen]   = useState(false)

  // ── Projects state ─────────────────────────────────────────────────────────
  const [projects, setProjects]           = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  // ── Refs ───────────────────────────────────────────────────────────────────
  const zoomTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLTextAreaElement>(null)

  // ── Load projects ──────────────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    try { setProjects(await window.nyra.projects.list()) } catch {}
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  // ── Theme apply on mount ───────────────────────────────────────────────────
  useEffect(() => {
    window.nyra.theme.get().then(t => applyThemeClass(t.mode, t.fontSize)).catch(() => {})
    window.nyra.theme.onChange(t => applyThemeClass(t.mode, t.fontSize))
  }, [])

  // ── Scroll to bottom ───────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [oc.activeSession?.messages])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    window.nyra.shortcuts.onNewChat(() => { oc.createSession(); setPanel('none'); setModal('none') })
    window.nyra.shortcuts.onSettings(() => setPanel(p => p === 'settings' ? 'none' : 'settings'))
    window.nyra.shortcuts.onCommandPalette(() => setModal(m => m === 'commandPalette' ? 'none' : 'commandPalette'))
  }, [])

  // ── Zoom indicator ─────────────────────────────────────────────────────────
  useEffect(() => {
    window.nyra.zoom.onChange((f: number) => {
      setZoomLabel(`${Math.round(f * 100)}%`)
      if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
      zoomTimerRef.current = setTimeout(() => setZoomLabel(null), 1500)
    })
  }, [])

  // ── Drag-drop ──────────────────────────────────────────────────────────────
  const handleDrop = useCallback((attachments: { name: string; content: string; mimeType: string }[]) => {
    window.nyra.notify.send('Files attached', `${attachments.length} file(s) ready to send`)
  }, [])

  // ── Projects ───────────────────────────────────────────────────────────────
  const handleCreateProject = async (data: { name: string; emoji: string; color: string; systemPrompt: string }) => {
    const p: Project = {
      id: `project-${Date.now()}`,
      name: data.name, emoji: data.emoji, color: data.color,
      systemPrompt: data.systemPrompt, sessionIds: [], pinnedSessionIds: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    }
    await window.nyra.projects.create(p)
    await loadProjects()
    setActiveProjectId(p.id)
    setModal('none')
  }

  // ── Session helpers ────────────────────────────────────────────────────────
  const activeProject = projects.find(p => p.id === activeProjectId) ?? null

  const filteredSessions = useMemo(() => {
    let list = oc.sessions
    if (activeProjectId) list = list.filter(s => s.projectId === activeProjectId)
    if (!searchQuery) return null // null = use grouped
    const q = searchQuery.toLowerCase()
    return list.filter(s =>
      s.title?.toLowerCase().includes(q) ||
      s.messages.some(m => m.content.toLowerCase().includes(q))
    )
  }, [oc.sessions, searchQuery, activeProjectId])

  const groupedSessions = useMemo(() => {
    let list = oc.sessions
    if (activeProjectId) list = list.filter(s => s.projectId === activeProjectId)
    const now = Date.now()
    const today = new Date().setHours(0,0,0,0)
    const yesterday = today - 86400000
    const groups: { label: string; sessions: Session[] }[] = []
    const pinned = list.filter(s => s.pinned)
    const unpinned = list.filter(s => !s.pinned)
    if (pinned.length) groups.push({ label: 'Pinned', sessions: pinned })
    const buckets: [string, Session[]][] = [['Today', []], ['Yesterday', []], ['This week', []], ['Older', []]]
    for (const s of unpinned) {
      const t = s.updatedAt
      if (t >= today) buckets[0][1].push(s)
      else if (t >= yesterday) buckets[1][1].push(s)
      else if (now - t < 7 * 86400000) buckets[2][1].push(s)
      else buckets[3][1].push(s)
    }
    for (const [label, sessions] of buckets) {
      if (sessions.length) groups.push({ label, sessions })
    }
    return groups
  }, [oc.sessions, activeProjectId])

  // ── Active artifacts ───────────────────────────────────────────────────────
  const activeArtifacts = useMemo(() => {
    const msgs = oc.activeSession?.messages ?? []
    // Collect from last assistant message that has code
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') {
        const arts = parseArtifacts(msgs[i].content)
        if (arts.length > 0) return arts
      }
    }
    return []
  }, [oc.activeSession?.messages])

  // ── Handle send ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (text: string, attachments?: ChatMessage['attachments']) => {
    let sessionId = oc.activeSession?.id
    if (!sessionId) {
      const s = await oc.createSession()
      sessionId = s?.id
      // Assign to active project if one is selected
      if (sessionId && activeProjectId) {
        if (model !== 'auto') oc.setSessionModel?.(sessionId, model)
      }
    }
    await oc.sendMessage(text, attachments)
  }, [oc, activeProjectId, model])

  // ── Insert text from prompt/voice ──────────────────────────────────────────
  const handleInsertText = useCallback((text: string) => {
    if (inputRef.current) {
      const ta = inputRef.current
      const start = ta.selectionStart ?? ta.value.length
      const end   = ta.selectionEnd   ?? ta.value.length
      const before = ta.value.slice(0, start)
      const after  = ta.value.slice(end)
      const next = before + text + after
      // Trigger React synthetic event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      nativeInputValueSetter?.call(ta, next)
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      ta.focus()
    }
  }, [])

  // ── Boot splash — only for genuinely slow operations ────────────────────
  // 'checking' resolves in <1s when gateway is already running — don't block.
  // Only block on 'installing' (npm install) which takes 10-30s.
  if (oc.status === 'installing') {
    return <BootSplash status={oc.status} log={oc.log} />
  }

  const messages = oc.activeSession?.messages ?? []

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b0a08] text-white overflow-hidden select-none">

      <NotificationBanner />
      <DragDropOverlay onFiles={handleDrop} />
      <TitleBar title={activeProject ? `${activeProject.emoji} ${activeProject.name}` : 'Nyra'} />

      {/* ── Executive layout ─────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Projects Rail (52px) ─────────────────────────────────────── */}
        <ProjectsRail
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={setActiveProjectId}
          onCreateProject={() => setModal('createProject')}
        />

        {/* ── Sidebar (220px) ──────────────────────────────────────────── */}
        <aside className="w-[220px] flex-shrink-0 flex flex-col bg-[#0d0b09] border-r border-white/[0.06]">

          {/* Sidebar header */}
          <div className="flex items-center gap-2 px-3 py-3 border-b border-white/[0.05] flex-shrink-0">
            <div className="flex-1 min-w-0">
              {activeProject
                ? <p className="text-[11px] font-semibold text-white/70 truncate">{activeProject.emoji} {activeProject.name}</p>
                : <p className="text-[11px] font-bold text-white/50 tracking-widest uppercase">Nyra</p>
              }
            </div>
            <button
              onClick={() => { oc.createSession(); setPanel('none') }}
              className="p-1.5 rounded-xl bg-terra-400/80 hover:bg-terra-500 text-white transition-colors flex-shrink-0"
              title="New chat  ⌘N"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Search */}
          <div className="px-2 py-2 flex-shrink-0">
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.05] rounded-xl px-2.5 py-1.5">
              <Search size={10} className="text-white/20 flex-shrink-0" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search chats…"
                className="flex-1 bg-transparent text-[11px] text-white/60 placeholder-white/20 outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-white/20 hover:text-white/50 flex-shrink-0">
                  <X size={9} />
                </button>
              )}
            </div>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-1.5 pb-2">
            {filteredSessions
              ? filteredSessions.length === 0
                ? <p className="text-white/20 text-[11px] text-center py-6">No results</p>
                : filteredSessions.map(s => (
                    <SessionItem
                      key={s.id} session={s}
                      active={oc.activeSession?.id === s.id}
                      onSelect={() => { oc.selectSession(s.id); setPanel('none') }}
                      onPin={() => oc.pinSession(s.id)}
                      onDelete={() => oc.deleteSession(s.id)}
                      onBranch={() => {}} // handled in chat area
                    />
                  ))
              : groupedSessions.map(g => (
                  <React.Fragment key={g.label}>
                    <p className="px-2 pt-3 pb-1 text-[9px] text-white/20 font-semibold uppercase tracking-widest">{g.label}</p>
                    {g.sessions.map(s => (
                      <SessionItem
                        key={s.id} session={s}
                        active={oc.activeSession?.id === s.id}
                        onSelect={() => { oc.selectSession(s.id); setPanel('none') }}
                        onPin={() => oc.pinSession(s.id)}
                        onDelete={() => oc.deleteSession(s.id)}
                        onBranch={() => {}}
                      />
                    ))}
                  </React.Fragment>
                ))
            }
            {oc.sessions.length === 0 && !searchQuery && (
              <div className="flex flex-col items-center py-8 gap-2">
                <p className="text-white/20 text-[11px] text-center">No conversations yet</p>
                <button
                  onClick={() => oc.createSession()}
                  className="text-[10px] text-terra-300/70 hover:text-terra-300 transition-colors"
                >
                  Start one →
                </button>
              </div>
            )}
          </div>

          {/* Sidebar footer */}
          <div className="border-t border-white/[0.05] px-2 py-2 flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setIncognito(i => !i)}
              title={incognito ? 'Exit incognito' : 'Incognito mode'}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                incognito ? 'bg-gold-500/15 text-gold-300 border border-gold-500/25' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'
              }`}
            >
              <Moon size={11} />
              {incognito && 'Incog'}
            </button>
            <div className="flex-1" />
            <button onClick={() => setModal('prompts')} title="Prompt Library" className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-colors">
              <BookOpen size={13} />
            </button>
            <button onClick={() => setPanel(p => p === 'scheduled' ? 'none' : 'scheduled')} title="Scheduled tasks"
              className={`p-1.5 rounded-lg transition-colors ${panel === 'scheduled' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
              <Clock size={13} />
            </button>
            <button onClick={() => setPanel(p => p === 'settings' ? 'none' : 'settings')} title="Settings  ⌘,"
              className={`p-1.5 rounded-lg transition-colors ${panel === 'settings' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
              <Settings size={13} />
            </button>
          </div>
        </aside>

        {/* ── Chat area (flex-1) ────────────────────────────────────────── */}
        <main className="flex flex-col flex-1 min-w-0 relative">

          {/* Chat header */}
          <div className="flex items-center h-11 px-4 border-b border-white/[0.05] flex-shrink-0 gap-3">
            <div className="flex-1 min-w-0">
              {oc.activeSession && (
                <p className="text-xs text-white/60 truncate font-medium">
                  {oc.activeSession.title || 'New chat'}
                  {oc.activeSession.branchedFrom && (
                    <span className="ml-2 text-gold-400/60 text-[10px]"><GitBranch size={9} className="inline mr-0.5" />branched</span>
                  )}
                </p>
              )}
            </div>

            {zoomLabel && (
              <div className="bg-white/[0.07] rounded-md px-2 py-0.5 text-[10px] text-white/50 font-mono">
                {zoomLabel}
              </div>
            )}

            {/* Artifact toggle */}
            {activeArtifacts.length > 0 && (
              <button
                onClick={() => setArtifactOpen(a => !a)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-colors ${
                  artifactOpen ? 'bg-terra-400/15 text-terra-300 border border-terra-400/30' : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
                }`}
              >
                <Hash size={11} />
                {activeArtifacts.length} artifact{activeArtifacts.length > 1 ? 's' : ''}
              </button>
            )}

            {/* Export */}
            {oc.activeSession && messages.length > 0 && (
              <button onClick={() => setModal('export')} title="Export chat" className="p-1.5 rounded-lg text-white/20 hover:text-white/60 hover:bg-white/[0.04] transition-colors">
                <Download size={13} />
              </button>
            )}

            <ModelSelector value={model} onChange={setModel} />

            {/* Status dot */}
            <div
              title={`Gateway: ${oc.status}`}
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                oc.status === 'ready' ? 'bg-green-400' :
                oc.status === 'error' ? 'bg-red-400' :
                'bg-amber-400 animate-pulse'
              }`}
            />
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 scrollbar-thin">
            {!oc.activeSession || messages.length === 0 ? (
              <WelcomeScreen
                onSuggestion={async (text) => {
                  if (!oc.activeSession) await oc.createSession()
                  setTimeout(() => oc.sendMessage(text), 80)
                }}
              />
            ) : (
              <>
                {messages.map((m, i) => (
                  <ChatMessageBubble
                    key={m.id ?? `msg-${i}`}
                    message={m}
                    isStreaming={oc.streaming && i === messages.length - 1 && m.role === 'assistant'}
                    onBranch={m.role === 'assistant' ? () => oc.branchSession(oc.activeSession!.id, i) : undefined}
                  />
                ))}
                {oc.streaming && (
                  <div className="flex items-center gap-2 pl-10">
                    <Loader2 size={12} className="animate-spin text-terra-300" />
                    <span className="text-xs text-white/25">Thinking…</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Error reconnect banner */}
          {oc.status === 'error' && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-red-900/20 border-t border-red-500/15 flex-shrink-0">
              <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-300/80 flex-1">OpenClaw connection lost — messages are queued</p>
              <button onClick={oc.restart} className="flex items-center gap-1.5 text-xs text-red-300 hover:text-red-100 font-medium transition-colors">
                <RefreshCw size={11} /> Reconnect
              </button>
            </div>
          )}

          {/* Input */}
          <div className="flex-shrink-0 px-5 pb-5 pt-3">
            <ChatInput
              ref={inputRef}
              onSend={handleSend}
              disabled={oc.streaming}
              incognito={incognito}
              systemPrompt={activeProject?.systemPrompt || oc.activeSession?.systemPrompt}
              onStartVoice={() => setModal('voice')}
            />
          </div>
        </main>

        {/* ── Artifact Pane (slides in) ─────────────────────────────────── */}
        {artifactOpen && activeArtifacts.length > 0 && (
          <ArtifactPane artifacts={activeArtifacts} onClose={() => setArtifactOpen(false)} />
        )}

        {/* ── Settings panel (fixed drawer) ─────────────────────────────── */}
        {panel === 'settings' && (
          <div className="w-[380px] flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-[#141210]">
            <SettingsPanel onClose={() => setPanel('none')} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <StatusBar status={oc.status} wsUrl={oc.wsUrl} log={oc.log} />

      {/* ── Scheduled tasks modal ─────────────────────────────────────────── */}
      {panel === 'scheduled' && <ScheduledTasks onClose={() => setPanel('none')} />}

      {/* ── Command palette ───────────────────────────────────────────────── */}
      {modal === 'commandPalette' && (
        <CommandPalette
          sessions={oc.sessions}
          searchSessions={oc.searchSessions}
          onClose={() => setModal('none')}
          onSelectSession={(id) => { oc.selectSession(id); setModal('none') }}
          onNewChat={() => { oc.createSession(); setModal('none') }}
          onOpenSettings={() => { setPanel('settings'); setModal('none') }}
          onOpenScheduled={() => { setPanel('scheduled'); setModal('none') }}
          onOpenPrompts={() => setModal('prompts')}
          onOpenExport={() => setModal('export')}
          onStartVoice={() => setModal('voice')}
        />
      )}

      {/* ── Prompt library ───────────────────────────────────────────────── */}
      {modal === 'prompts' && (
        <PromptLibrary
          onClose={() => setModal('none')}
          onInsert={(text) => { handleInsertText(text) }}
        />
      )}

      {/* ── Export modal ─────────────────────────────────────────────────── */}
      {modal === 'export' && oc.activeSession && (
        <ExportModal session={oc.activeSession} onClose={() => setModal('none')} />
      )}

      {/* ── Voice input ──────────────────────────────────────────────────── */}
      {modal === 'voice' && (
        <VoiceInput
          onTranscript={(text) => { handleInsertText(text) }}
          onClose={() => setModal('none')}
        />
      )}

      {/* ── Create project modal ─────────────────────────────────────────── */}
      {modal === 'createProject' && (
        <CreateProjectModal
          onClose={() => setModal('none')}
          onCreate={handleCreateProject}
        />
      )}
    </div>
  )
}

// ── Session item ───────────────────────────────────────────────────────────────
const SessionItem: React.FC<{
  session: Session
  active: boolean
  onSelect: () => void
  onPin: () => void
  onDelete: () => void
  onBranch: () => void
}> = ({ session, active, onSelect, onPin, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const preview = session.messages[session.messages.length - 1]?.content?.slice(0, 45) ?? ''

  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className={`w-full text-left px-2.5 py-2 rounded-xl transition-all ${
          active ? 'bg-white/[0.09] text-white' : 'hover:bg-white/[0.04] text-white/50 hover:text-white/75'
        }`}
      >
        <div className="flex items-center gap-1.5">
          {session.color && session.color !== 'none' && (
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${COLOR_DOT[session.color]}`} />
          )}
          {session.pinned && <Pin size={9} className="text-amber-400/70 flex-shrink-0" />}
          {session.incognito && <Moon size={9} className="text-gold-400 flex-shrink-0" />}
          <p className="text-[11px] font-medium truncate flex-1">{session.title || 'New chat'}</p>
        </div>
        {preview && <p className="text-[10px] text-white/25 truncate mt-0.5 pl-0.5">{preview}</p>}
      </button>

      {/* Context menu button */}
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen(m => !m) }}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-lg opacity-0 group-hover:opacity-100 text-white/25 hover:text-white/60 hover:bg-white/[0.07] transition-all"
      >
        <MoreHorizontal size={11} />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 bg-[#161411] border border-white/10 rounded-xl shadow-xl py-1 min-w-[140px]">
            <ContextMenuItem icon={<Pin size={11} />} label={session.pinned ? 'Unpin' : 'Pin'} onClick={() => { onPin(); setMenuOpen(false) }} />
            <ContextMenuItem icon={<GitBranch size={11} />} label="Branch here" onClick={() => { setMenuOpen(false) }} />
            <div className="h-px bg-white/[0.06] my-1" />
            <ContextMenuItem icon={<Trash2 size={11} />} label="Delete" onClick={() => { onDelete(); setMenuOpen(false) }} danger />
          </div>
        </>
      )}
    </div>
  )
}

const ContextMenuItem: React.FC<{
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean
}> = ({ icon, label, onClick, danger }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] transition-colors ${
      danger ? 'text-blush-400/80 hover:bg-blush-500/10 hover:text-blush-400' : 'text-white/55 hover:bg-white/[0.06] hover:text-white/80'
    }`}
  >
    <span className="flex-shrink-0">{icon}</span>
    {label}
  </button>
)

// ── Welcome screen ─────────────────────────────────────────────────────────────
const WelcomeScreen: React.FC<{ onSuggestion: (text: string) => void }> = ({ onSuggestion }) => (
  <div className="flex flex-col items-center justify-center h-full gap-8">
    <div className="flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-terra-400/25 to-terra-600/25 border border-terra-400/20 flex items-center justify-center shadow-xl shadow-terra-400/10">
        <Cpu size={24} className="text-terra-300" />
      </div>
      <h2 className="text-xl font-semibold text-white/80">What can I help with?</h2>
      <p className="text-xs text-white/25">Powered by OpenClaw · running locally · ⌘K to search</p>
    </div>

    <div className="grid grid-cols-3 gap-2 max-w-md w-full">
      {SUGGESTIONS.map(s => (
        <button
          key={s.text}
          onClick={() => onSuggestion(s.text)}
          className="flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-white/45 hover:text-white/80 transition-all text-left"
        >
          <span className="text-base leading-none flex-shrink-0 opacity-60">{s.icon}</span>
          <span>{s.text}</span>
        </button>
      ))}
    </div>
  </div>
)

// ── Theme helper ───────────────────────────────────────────────────────────────
function applyThemeClass(mode: string, fontSize: string) {
  const root = document.documentElement
  root.classList.remove('theme-dark', 'theme-dim', 'theme-light', 'text-sm', 'text-base', 'text-lg')
  root.classList.add(`theme-${mode}`)
  root.style.fontSize = fontSize === 'sm' ? '13px' : fontSize === 'lg' ? '16px' : '14px'
}

export default App
