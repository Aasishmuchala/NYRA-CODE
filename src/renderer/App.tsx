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
  Plus, Search, Settings, Cpu, X, Clock, Moon, Monitor,
  Loader2, AlertTriangle, RefreshCw, BookOpen,
  Download, GitBranch, Hash, Pin, MoreHorizontal,
  Trash2, Terminal, GitCommitHorizontal, Brain, Database, Layers, Users,
  MessageSquare, Activity, Wifi, Share2,
  GitFork, BarChart3, Bell, FolderSearch, Gauge,
  Package, BookMarked, LayoutGrid, PlayCircle, Timer,
  Mic, Paperclip, GitCompare, FlaskConical, Palette,
  SearchCode, Rss, FileArchive, FileText, Webhook, DatabaseBackup,
  Share, Bug, WifiOff, Zap, Accessibility, ShieldCheck, ChevronDown,
  Globe, Trophy,
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
import { NotificationBanner }  from './components/NotificationBanner'
import { ScheduledTasks }      from './components/ScheduledTasks'
import { CommandPalette }      from './components/CommandPalette'
import { CommandPaletteV2 }    from './components/CommandPaletteV2'
import { ProjectsRail, CreateProjectModal } from './components/ProjectsRail'
import { ArtifactPane, parseArtifacts }    from './components/ArtifactPane'
import { PromptLibrary }       from './components/PromptLibrary'
import { ExportModal }         from './components/ExportModal'
import { VoiceInput }          from './components/VoiceInput'
import TerminalPanel           from './components/Terminal'
import { GitPanel }            from './components/GitPanel'
import { ActionQueueProvider, ActionConfirmation, useActionQueue } from './components/ActionConfirmation'
import { Onboarding }          from './components/Onboarding'
import { ModelComparison }     from './components/ModelComparison'
import { MCPBrowser }          from './components/MCPBrowser'
import CoworkLayout            from './components/cowork/CoworkLayout'
import ComputerUsePanel        from './components/ComputerUsePanel'
import AgentPanel              from './components/AgentPanel'
import MemoryInspectorPanel    from './components/MemoryInspectorPanel'
import WorkflowRecipesPanel    from './components/WorkflowRecipesPanel'
import AgentStudioPanel        from './components/AgentStudioPanel'
import StreamChatPanel         from './components/StreamChatPanel'
import CollaborationTimeline   from './components/CollaborationTimeline'
import ProviderDashboard       from './components/ProviderDashboard'
import KnowledgeGraphPanel     from './components/KnowledgeGraphPanel'
import ConversationTreePanel   from './components/ConversationTreePanel'
import AgentAnalyticsPanel     from './components/AgentAnalyticsPanel'
import NotificationCenterPanel from './components/NotificationCenterPanel'
import CodebaseExplorerPanel   from './components/CodebaseExplorerPanel'
import ContextVisualizerPanel  from './components/ContextVisualizerPanel'
import PluginStudioPanel       from './components/PluginStudioPanel'
import PromptLibraryPanel2     from './components/PromptLibraryPanel2'
import TaskBoardPanel          from './components/TaskBoardPanel'
import ApiPlaygroundPanel      from './components/ApiPlaygroundPanel'
import PerformanceProfilerPanel from './components/PerformanceProfilerPanel'
import VoiceInterfacePanel     from './components/VoiceInterfacePanel'
import FileAttachmentPanel     from './components/FileAttachmentPanel'
import DiffViewerPanel         from './components/DiffViewerPanel'
import ABTestingPanel          from './components/ABTestingPanel'
import ThemeEditorPanel        from './components/ThemeEditorPanel'
import GlobalSearchPanel       from './components/GlobalSearchPanel'
import ActivityFeedPanel       from './components/ActivityFeedPanel'
import WorkspaceExportPanel    from './components/WorkspaceExportPanel'
import ReportGeneratorPanel    from './components/ReportGeneratorPanel'
import WebhookManagerPanel     from './components/WebhookManagerPanel'
import BackupManagerPanel      from './components/BackupManagerPanel'
import SessionSharingPanel     from './components/SessionSharingPanel'
import ErrorBoundaryPanel      from './components/ErrorBoundaryPanel'
import OfflineManagerPanel     from './components/OfflineManagerPanel'
import StartupProfilerPanel    from './components/StartupProfilerPanel'
import AccessibilityPanel      from './components/AccessibilityPanel'
import BuildValidatorPanel     from './components/BuildValidatorPanel'
import CodeBenchmarkPanel      from './components/CodeBenchmarkPanel'
import WebSearchPanel          from './components/WebSearchPanel'
import ModelRouterPanel        from './components/ModelRouterPanel'
import EnterpriseDashboard     from './components/EnterpriseDashboard'
import VoiceEnginePanel        from './components/VoiceEnginePanel'
import PluginSandboxPanel      from './components/PluginSandboxPanel'
import AgentNetworkPanel       from './components/AgentNetworkPanel'
import I18nSettingsPanel       from './components/I18nSettingsPanel'
import type { Project }        from '../preload/index'
import type { ChatMessage }    from './hooks/useOpenClaw'

// ── Panel state ────────────────────────────────────────────────────────────────
type AppMode = 'chat' | 'cowork'
type Panel = 'none' | 'settings' | 'scheduled' | 'computer-use' | 'agent-pipeline' | 'memory-inspector' | 'workflow-recipes' | 'agent-studio' | 'stream-chat' | 'collab-timeline' | 'provider-dashboard' | 'knowledge-graph' | 'conv-tree' | 'agent-analytics' | 'notification-center' | 'codebase-explorer' | 'context-visualizer' | 'plugin-studio' | 'prompt-library-v2' | 'task-board' | 'api-playground' | 'perf-profiler' | 'voice-interface' | 'file-attachment' | 'diff-viewer' | 'ab-testing' | 'theme-editor' | 'global-search' | 'activity-feed' | 'workspace-export' | 'report-gen' | 'webhook-mgr' | 'backup-mgr' | 'session-sharing' | 'error-boundary' | 'offline-mgr' | 'startup-profiler' | 'accessibility' | 'build-validator' | 'code-benchmark' | 'web-search' | 'model-router' | 'enterprise-dash' | 'voice-engine' | 'plugin-sandbox' | 'agent-network' | 'i18n-settings'
type Modal = 'none' | 'prompts' | 'export' | 'voice' | 'createProject' | 'commandPalette' | 'modelCompare' | 'mcpBrowser'

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
  const [appMode, setAppMode]             = useState<AppMode>('chat')
  const [panel, setPanel]                 = useState<Panel>('none')
  const [modal, setModal]                 = useState<Modal>('none')
  const [commandPaletteV2Open, setCommandPaletteV2Open] = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [incognito, setIncognito]         = useState(false)
  const [model, setModel]                 = useState('auto')
  const [fastMode, setFastMode]           = useState(false)
  const [ollamaModels, setOllamaModels]  = useState<Array<{ id: string; name: string; size: number; modifiedAt: string; parameterSize?: string; quantization?: string }>>([])
  const [gatewayCatalog, setGatewayCatalog] = useState<Array<{ id: string; name: string; provider: string; contextWindow?: number; reasoning?: boolean }>>([])
  const [connectedProviders, setConnectedProviders] = useState<string[]>([])
  const [wallpaper, setWallpaper]         = useState('herringbone')
  const [zoomLabel, setZoomLabel]         = useState<string | null>(null)
  const [artifactOpen, setArtifactOpen]   = useState(false)
  const [terminalOpen, setTerminalOpen]   = useState(false)
  const [gitPanelOpen, setGitPanelOpen]   = useState(false)
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null) // null = loading
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['core']))

  // ── Projects state ─────────────────────────────────────────────────────────
  const [projects, setProjects]           = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  // ── Refs ───────────────────────────────────────────────────────────────────
  const zoomTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLTextAreaElement>(null)

  // ── Helper functions ───────────────────────────────────────────────────────
  const toggleGroup = (groupName: string) => {
    const newSet = new Set(expandedGroups)
    if (newSet.has(groupName)) {
      newSet.delete(groupName)
    } else {
      newSet.add(groupName)
    }
    setExpandedGroups(newSet)
  }

  // ── Load projects ──────────────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    try { setProjects(await window.nyra.projects.list()) } catch {}
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  // ── Fetch local Ollama models ────────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    const fetch = () => window.nyra.ollama.models()
      .then(m => { if (mounted) setOllamaModels(m) })
      .catch(() => {})
    fetch()
    // Refresh every 30s in case models are added/removed
    const iv = setInterval(fetch, 30_000)
    return () => { mounted = false; clearInterval(iv) }
  }, [])

  // ── Fetch dynamic model catalog from OpenClaw gateway ──────────────────
  useEffect(() => {
    if (!oc.connected) return
    let mounted = true
    const fetchCatalog = async () => {
      try {
        const catalog = await oc.fetchModelCatalog()
        if (mounted && catalog.length > 0) setGatewayCatalog(catalog)
      } catch {}
    }
    fetchCatalog()
    // Refresh every 60s in case new models are added
    const iv = setInterval(fetchCatalog, 60_000)
    return () => { mounted = false; clearInterval(iv) }
  }, [oc.connected, oc.fetchModelCatalog])

  // ── Fetch connected provider states ──────────────────────────────────────
  useEffect(() => {
    let mounted = true
    const refresh = () => window.nyra.providers.list()
      .then((states: Array<{ id: string; hasKey: boolean; enabled: boolean }>) => {
        if (!mounted) return
        const connected = states
          .filter(s => s.hasKey && s.enabled)
          .map(s => s.id)
        // Also add 'ollama' if we have any local models
        setConnectedProviders(connected)
      })
      .catch(() => {})
    refresh()
    // Refresh every 10s (providers may be connected/disconnected)
    const iv = setInterval(refresh, 10_000)
    return () => { mounted = false; clearInterval(iv) }
  }, [])

  // ── Onboarding check ─────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    window.nyra.app.isOnboarded().then(done => {
      if (mounted) setShowOnboarding(!done)
    }).catch(() => {
      if (mounted) setShowOnboarding(false) // assume onboarded on error
    })
    return () => { mounted = false }
  }, [])

  const handleOnboardingComplete = useCallback(async () => {
    await window.nyra.app.setOnboarded()
    setShowOnboarding(false)
  }, [])

  // ── Theme apply on mount (with Auto mode resolution) ─────────────────────
  useEffect(() => {
    let mounted = true

    const applyResolved = async (t: { mode: string; fontSize: string; wallpaper?: string }) => {
      let effectiveMode = t.mode
      if (t.mode === 'auto') {
        try {
          const systemDark = await window.nyra.theme.systemDark()
          effectiveMode = resolveAutoMode(systemDark)
        } catch {
          effectiveMode = 'dark' // fallback
        }
      }
      if (mounted) {
        applyThemeClass(effectiveMode, t.fontSize)
        if (t.wallpaper) setWallpaper(t.wallpaper)
      }
    }

    // Initial apply
    window.nyra.theme.get().then(applyResolved).catch(() => {})

    // Listen for explicit theme changes (from SettingsPanel)
    const unsubTheme = window.nyra.theme.onChange(applyResolved)

    // Listen for system theme changes (only matters when mode is 'auto')
    let unsubSystem: (() => void) | undefined
    if (window.nyra.theme.onSystemChange) {
      unsubSystem = window.nyra.theme.onSystemChange(async (systemDark: boolean) => {
        try {
          const t = await window.nyra.theme.get()
          if (t.mode === 'auto' && mounted) {
            const effectiveMode = resolveAutoMode(systemDark)
            applyThemeClass(effectiveMode, t.fontSize)
          }
        } catch {}
      })
    }

    // Re-check time-of-day every 5 minutes for auto mode
    const timeCheck = setInterval(async () => {
      try {
        const t = await window.nyra.theme.get()
        if (t.mode === 'auto' && mounted) {
          const systemDark = await window.nyra.theme.systemDark()
          applyThemeClass(resolveAutoMode(systemDark), t.fontSize)
        }
      } catch {}
    }, 5 * 60 * 1000)

    return () => {
      mounted = false
      if (typeof unsubTheme === 'function') unsubTheme()
      if (typeof unsubSystem === 'function') unsubSystem()
      clearInterval(timeCheck)
    }
  }, [])

  // ── Scroll to bottom ───────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [oc.activeSession?.messages])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const u1 = window.nyra.shortcuts.onNewChat(() => { oc.createSession(); setPanel('none'); setModal('none') })
    const u2 = window.nyra.shortcuts.onSettings(() => setPanel(p => p === 'settings' ? 'none' : 'settings'))
    const u3 = window.nyra.shortcuts.onCommandPalette(() => setModal(m => m === 'commandPalette' ? 'none' : 'commandPalette'))
    
    // Cmd+K for panel launcher (CommandPaletteV2)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !commandPaletteV2Open) {
        e.preventDefault()
        setCommandPaletteV2Open(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    
    return () => {
      [u1, u2, u3].forEach(u => typeof u === 'function' && u())
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [commandPaletteV2Open])

  // ── Zoom indicator ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = window.nyra.zoom.onChange((f: number) => {
      setZoomLabel(`${Math.round(f * 100)}%`)
      if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
      zoomTimerRef.current = setTimeout(() => setZoomLabel(null), 1500)
    })
    return () => { if (typeof unsub === 'function') unsub() }
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

  // ── Screen capture ─────────────────────────────────────────────────────────
  const handleScreenCapture = useCallback(async () => {
    try {
      const capture = await window.nyra.screen.capture()
      if (capture) {
        const attachment = {
          name: `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
          mimeType: 'image/png',
          content: capture.base64,
        }
        let sessionId = oc.activeSession?.id
        if (!sessionId) {
          const s = await oc.createSession()
          sessionId = s?.id
        }
        await oc.sendMessage('Here is a screenshot of my screen. What do you see?', [attachment])
      }
    } catch (err) {
      console.error('Screen capture failed:', err)
    }
  }, [oc])

  // ── Handle send ────────────────────────────────────────────────────────────
  // v4: sendMessage handles session creation internally — no double-create race
  // When incognito is enabled, create an incognito session first if needed
  // Pass the currently selected model so the gateway knows which LLM to route to
  const handleSend = useCallback(async (text: string, attachments?: ChatMessage['attachments']) => {
    if (incognito && (!oc.activeSession || !oc.activeSession.incognito)) {
      await oc.createSession({ incognito: true })
    }
    await oc.sendMessage(text, attachments, model)
  }, [oc, incognito, model])

  // ── Model change handler — syncs to both local state and active session ────
  // The gateway re-reads auth-profiles.json on every LLM turn, so NO reconnect
  // is needed. Previously we called oc.reconnect() here which killed the WS
  // connection for 500ms and could lose in-flight streams — completely unnecessary.
  const handleModelChange = useCallback(async (newModel: string) => {
    setModel(newModel)
    // Also persist on the active session so the gateway knows which model to use
    if (oc.activeSession) {
      oc.setSessionModel(oc.activeSession.id, newModel)
    }
    // Write model to auth-profiles so the gateway picks it up on next message
    if (newModel !== 'auto') {
      try {
        // First, force-resync all stored API keys → auth-profiles.json
        // This ensures the file is fresh from the encrypted keychain, fixing
        // any corruption or stale entries that may have caused auth failures.
        await window.nyra.providers.resync()
        const ok = await window.nyra.providers.switchModel(newModel)
        if (!ok) {
          console.warn('[App] switchModel returned false for', newModel, '— provider may not have an API key configured')
        } else {
          console.log('[App] Model switched to', newModel, '— gateway will use it on next message')
        }
      } catch (err) {
        console.warn('[App] Failed to switch model in auth-profiles:', err)
      }
    }
  }, [oc])

  // ── Restore model from session when switching sessions ──────────────────
  useEffect(() => {
    if (oc.activeSession?.model) {
      setModel(oc.activeSession.model)
    }
  }, [oc.activeSession?.id])

  // ── Slash command handler ──────────────────────────────────────────────
  const handleSlashCommand = useCallback((command: string) => {
    switch (command) {
      case 'help':      setModal('commandPalette'); break
      case 'clear':     if (oc.activeSession) { oc.createSession(); } break
      case 'new':       oc.createSession(); setPanel('none'); break
      case 'export':    if (oc.activeSession) setModal('export'); break
      case 'incognito': setIncognito(i => !i); break
      case 'fast':      setFastMode(f => !f); break
      case 'settings':  setPanel(p => p === 'settings' ? 'none' : 'settings'); break
      case 'model':     /* model selector opens via ChatInput */ break
      default: break
    }
  }, [oc])

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

  // Wait for onboarding check before rendering anything
  if (showOnboarding === null) {
    return <div className="h-screen w-screen bg-[#0b0a08]" />
  }

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  const messages = oc.activeSession?.messages ?? []

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ActionQueueProvider>
    <div className={`h-screen w-screen flex bg-[#0b0a08] text-white overflow-hidden select-none wallpaper-${wallpaper}`}>

      <NotificationBanner />
      <ActionConfirmationOverlay />
      <DragDropOverlay onFiles={handleDrop} />

      {/* ── Left column: Projects Rail + Sidebar (full height) ────────── */}
      <div className="flex flex-shrink-0 h-screen">
        {/* ── Projects Rail (52px) ─────────────────────────────────────── */}
        <ProjectsRail
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={setActiveProjectId}
          onCreateProject={() => setModal('createProject')}
        />

        {/* ── Sidebar (220px) ──────────────────────────────────────────── */}
        <aside className="w-[220px] flex-shrink-0 flex flex-col bg-black/30 border-r border-white/[0.06]">
          {/* Drag region for macOS traffic lights — sits at top of sidebar */}
          <div className="h-11 flex items-center flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

          {/* Sidebar header */}
          <div className="flex flex-col border-b border-white/[0.05] flex-shrink-0">
            <div className="flex items-center gap-2 px-4 py-3">
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
            {/* ── Mode switcher: Chat / Cowork ────────────────────────── */}
            <div className="flex items-center gap-1 px-4 pb-2.5">
              <button
                onClick={() => setAppMode('chat')}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${
                  appMode === 'chat'
                    ? 'bg-terra-400/15 text-terra-300 border border-terra-400/25'
                    : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setAppMode('cowork')}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${
                  appMode === 'cowork'
                    ? 'bg-terra-400/15 text-terra-300 border border-terra-400/25'
                    : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                }`}
              >
                Cowork
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2 flex-shrink-0">
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

          {/* Sidebar footer - Collapsible groups */}
          <div className="border-t border-white/[0.05] flex-1 overflow-y-auto flex flex-col">
            {/* Core Group */}
            <div>
              <button
                onClick={() => toggleGroup('core')}
                className="w-full flex items-center gap-1 px-2 py-1.5 text-[9px] uppercase tracking-wider text-white/25 hover:text-white/40 transition-colors"
              >
                <ChevronDown size={9} style={{
                  transform: expandedGroups.has('core') ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease-out'
                }} />
                <span className="flex-1">Core</span>
                <span className="text-[8px] bg-white/10 px-1.5 rounded">
                  {Array.from(['terminal', 'git', 'scheduled', 'computer-use', 'settings', 'incognito', 'prompts']).filter(p => p === 'prompts' ? true : p === 'terminal' ? terminalOpen : p === 'git' ? gitPanelOpen : p === 'scheduled' ? panel === 'scheduled' : p === 'computer-use' ? panel === 'computer-use' : p === 'settings' ? panel === 'settings' : incognito).length}
                </span>
              </button>
              {expandedGroups.has('core') && (
                <div className="flex flex-wrap gap-1 px-2 py-1">
                  <button onClick={() => setTerminalOpen(v => !v)} title="Terminal  ⌘`"
                    className={`p-1.5 rounded-lg transition-colors ${terminalOpen ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Terminal size={13} />
                  </button>
                  <button onClick={() => setGitPanelOpen(v => !v)} title="Git"
                    className={`p-1.5 rounded-lg transition-colors ${gitPanelOpen ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <GitCommitHorizontal size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'scheduled' ? 'none' : 'scheduled')} title="Scheduled tasks"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'scheduled' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Clock size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'computer-use' ? 'none' : 'computer-use')} title="Computer Use"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'computer-use' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Monitor size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'settings' ? 'none' : 'settings')} title="Settings  ⌘,"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'settings' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Settings size={13} />
                  </button>
                  <button
                    onClick={() => setIncognito(i => !i)}
                    title={incognito ? 'Exit incognito' : 'Incognito mode'}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                      incognito ? 'bg-gold-500/15 text-gold-300 border border-gold-500/25' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'
                    }`}
                  >
                    <Moon size={11} />
                  </button>
                  <button onClick={() => setModal('prompts')} title="Prompt Library" className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-colors">
                    <BookOpen size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* AI & Agents Group */}
            <div>
              <button
                onClick={() => toggleGroup('ai-agents')}
                className="w-full flex items-center gap-1 px-2 py-1.5 text-[9px] uppercase tracking-wider text-white/25 hover:text-white/40 transition-colors"
              >
                <ChevronDown size={9} style={{
                  transform: expandedGroups.has('ai-agents') ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease-out'
                }} />
                <span className="flex-1">AI & Agents</span>
                <span className="text-[8px] bg-white/10 px-1.5 rounded">
                  {Array.from(['agent-pipeline', 'agent-studio', 'stream-chat', 'collab-timeline', 'workflow-recipes', 'agent-analytics']).filter(p => panel === p).length}
                </span>
              </button>
              {expandedGroups.has('ai-agents') && (
                <div className="flex flex-wrap gap-1 px-2 py-1">
                  <button onClick={() => setPanel(p => p === 'agent-pipeline' ? 'none' : 'agent-pipeline')} title="Agent Pipeline"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'agent-pipeline' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Brain size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'agent-studio' ? 'none' : 'agent-studio')} title="Agent Studio"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'agent-studio' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Users size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'stream-chat' ? 'none' : 'stream-chat')} title="Stream Chat"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'stream-chat' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <MessageSquare size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'collab-timeline' ? 'none' : 'collab-timeline')} title="Collaboration Timeline"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'collab-timeline' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Activity size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'workflow-recipes' ? 'none' : 'workflow-recipes')} title="Workflow Recipes"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'workflow-recipes' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Layers size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'agent-analytics' ? 'none' : 'agent-analytics')} title="Agent Analytics"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'agent-analytics' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <BarChart3 size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Knowledge Group */}
            <div>
              <button
                onClick={() => toggleGroup('knowledge')}
                className="w-full flex items-center gap-1 px-2 py-1.5 text-[9px] uppercase tracking-wider text-white/25 hover:text-white/40 transition-colors"
              >
                <ChevronDown size={9} style={{
                  transform: expandedGroups.has('knowledge') ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease-out'
                }} />
                <span className="flex-1">Knowledge</span>
                <span className="text-[8px] bg-white/10 px-1.5 rounded">
                  {Array.from(['memory-inspector', 'knowledge-graph', 'context-visualizer', 'codebase-explorer', 'conv-tree', 'prompt-library-v2']).filter(p => panel === p).length}
                </span>
              </button>
              {expandedGroups.has('knowledge') && (
                <div className="flex flex-wrap gap-1 px-2 py-1">
                  <button onClick={() => setPanel(p => p === 'memory-inspector' ? 'none' : 'memory-inspector')} title="Memory Inspector"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'memory-inspector' ? 'text-sage-300 bg-sage-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Database size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'knowledge-graph' ? 'none' : 'knowledge-graph')} title="Knowledge Graph"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'knowledge-graph' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Share2 size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'context-visualizer' ? 'none' : 'context-visualizer')} title="Context Window"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'context-visualizer' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Gauge size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'codebase-explorer' ? 'none' : 'codebase-explorer')} title="Codebase Explorer"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'codebase-explorer' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <FolderSearch size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'conv-tree' ? 'none' : 'conv-tree')} title="Conversation Branches"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'conv-tree' ? 'text-sage-300 bg-sage-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <GitFork size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'prompt-library-v2' ? 'none' : 'prompt-library-v2')} title="Prompt Library"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'prompt-library-v2' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <BookMarked size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Tools Group */}
            <div>
              <button
                onClick={() => toggleGroup('tools')}
                className="w-full flex items-center gap-1 px-2 py-1.5 text-[9px] uppercase tracking-wider text-white/25 hover:text-white/40 transition-colors"
              >
                <ChevronDown size={9} style={{
                  transform: expandedGroups.has('tools') ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease-out'
                }} />
                <span className="flex-1">Tools</span>
                <span className="text-[8px] bg-white/10 px-1.5 rounded">
                  {Array.from(['api-playground', 'diff-viewer', 'ab-testing', 'plugin-studio', 'task-board', 'voice-interface', 'file-attachment', 'theme-editor', 'code-benchmark']).filter(p => panel === p).length}
                </span>
              </button>
              {expandedGroups.has('tools') && (
                <div className="flex flex-wrap gap-1 px-2 py-1">
                  <button onClick={() => setPanel(p => p === 'api-playground' ? 'none' : 'api-playground')} title="API Playground"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'api-playground' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <PlayCircle size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'diff-viewer' ? 'none' : 'diff-viewer')} title="Diff Viewer"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'diff-viewer' ? 'text-sage-300 bg-sage-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <GitCompare size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'ab-testing' ? 'none' : 'ab-testing')} title="A/B Testing"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'ab-testing' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <FlaskConical size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'plugin-studio' ? 'none' : 'plugin-studio')} title="Plugin Studio"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'plugin-studio' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Package size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'task-board' ? 'none' : 'task-board')} title="Task Board"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'task-board' ? 'text-sage-300 bg-sage-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <LayoutGrid size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'voice-interface' ? 'none' : 'voice-interface')} title="Voice Interface"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'voice-interface' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Mic size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'file-attachment' ? 'none' : 'file-attachment')} title="File Attachments"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'file-attachment' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Paperclip size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'theme-editor' ? 'none' : 'theme-editor')} title="Theme Editor"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'theme-editor' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Palette size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'code-benchmark' ? 'none' : 'code-benchmark')} title="Code Benchmark"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'code-benchmark' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Trophy size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Search & Analytics Group */}
            <div>
              <button
                onClick={() => toggleGroup('search-analytics')}
                className="w-full flex items-center gap-1 px-2 py-1.5 text-[9px] uppercase tracking-wider text-white/25 hover:text-white/40 transition-colors"
              >
                <ChevronDown size={9} style={{
                  transform: expandedGroups.has('search-analytics') ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease-out'
                }} />
                <span className="flex-1">Search & Analytics</span>
                <span className="text-[8px] bg-white/10 px-1.5 rounded">
                  {Array.from(['provider-dashboard', 'perf-profiler', 'notification-center', 'global-search', 'activity-feed', 'report-gen', 'startup-profiler', 'web-search']).filter(p => panel === p).length}
                </span>
              </button>
              {expandedGroups.has('search-analytics') && (
                <div className="flex flex-wrap gap-1 px-2 py-1">
                  <button onClick={() => setPanel(p => p === 'provider-dashboard' ? 'none' : 'provider-dashboard')} title="Provider Dashboard"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'provider-dashboard' ? 'text-sage-300 bg-sage-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Wifi size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'perf-profiler' ? 'none' : 'perf-profiler')} title="Performance Profiler"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'perf-profiler' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Timer size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'notification-center' ? 'none' : 'notification-center')} title="Notifications"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'notification-center' ? 'text-blush-300 bg-blush-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Bell size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'global-search' ? 'none' : 'global-search')} title="Global Search"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'global-search' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <SearchCode size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'activity-feed' ? 'none' : 'activity-feed')} title="Activity Feed"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'activity-feed' ? 'text-sage-300 bg-sage-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Rss size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'report-gen' ? 'none' : 'report-gen')} title="Report Generator"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'report-gen' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <FileText size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'startup-profiler' ? 'none' : 'startup-profiler')} title="Startup Profiler"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'startup-profiler' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Zap size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'web-search' ? 'none' : 'web-search')} title="Web Search"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'web-search' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Globe size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* System Group */}
            <div>
              <button
                onClick={() => toggleGroup('system')}
                className="w-full flex items-center gap-1 px-2 py-1.5 text-[9px] uppercase tracking-wider text-white/25 hover:text-white/40 transition-colors"
              >
                <ChevronDown size={9} style={{
                  transform: expandedGroups.has('system') ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease-out'
                }} />
                <span className="flex-1">System</span>
                <span className="text-[8px] bg-white/10 px-1.5 rounded">
                  {Array.from(['workspace-export', 'backup-mgr', 'session-sharing', 'error-boundary', 'offline-mgr', 'accessibility', 'build-validator', 'webhook-mgr']).filter(p => panel === p).length}
                </span>
              </button>
              {expandedGroups.has('system') && (
                <div className="flex flex-wrap gap-1 px-2 py-1">
                  <button onClick={() => setPanel(p => p === 'workspace-export' ? 'none' : 'workspace-export')} title="Workspace Export"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'workspace-export' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <FileArchive size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'backup-mgr' ? 'none' : 'backup-mgr')} title="Backup Manager"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'backup-mgr' ? 'text-sage-300 bg-sage-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <DatabaseBackup size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'session-sharing' ? 'none' : 'session-sharing')} title="Session Sharing"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'session-sharing' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Share size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'error-boundary' ? 'none' : 'error-boundary')} title="Error Boundary"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'error-boundary' ? 'text-blush-300 bg-blush-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Bug size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'offline-mgr' ? 'none' : 'offline-mgr')} title="Offline Manager"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'offline-mgr' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <WifiOff size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'accessibility' ? 'none' : 'accessibility')} title="Accessibility"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'accessibility' ? 'text-sage-300 bg-sage-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Accessibility size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'build-validator' ? 'none' : 'build-validator')} title="Build Validator"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'build-validator' ? 'text-sage-300 bg-sage-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <ShieldCheck size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'webhook-mgr' ? 'none' : 'webhook-mgr')} title="Webhook Manager"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'webhook-mgr' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Webhook size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Platform Group (Year 1-5 Services) */}
            <div>
              <button
                onClick={() => toggleGroup('platform')}
                className="w-full flex items-center gap-1 px-2 py-1.5 text-[9px] uppercase tracking-wider text-white/25 hover:text-white/40 transition-colors"
              >
                <ChevronDown size={9} style={{
                  transform: expandedGroups.has('platform') ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease-out'
                }} />
                <span className="flex-1">Platform</span>
                <span className="text-[8px] bg-white/10 px-1.5 rounded">
                  {Array.from(['model-router', 'enterprise-dash', 'voice-engine', 'plugin-sandbox', 'agent-network', 'i18n-settings'] as const).filter(p => panel === p).length}
                </span>
              </button>
              {expandedGroups.has('platform') && (
                <div className="flex flex-wrap gap-1 px-2 py-1">
                  <button onClick={() => setPanel(p => p === 'model-router' ? 'none' : 'model-router')} title="Model Router"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'model-router' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Layers size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'enterprise-dash' ? 'none' : 'enterprise-dash')} title="Enterprise Dashboard"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'enterprise-dash' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Users size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'voice-engine' ? 'none' : 'voice-engine')} title="Voice Engine"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'voice-engine' ? 'text-sage-300 bg-sage-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Mic size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'plugin-sandbox' ? 'none' : 'plugin-sandbox')} title="Plugin Sandbox"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'plugin-sandbox' ? 'text-gold-300 bg-gold-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Package size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'agent-network' ? 'none' : 'agent-network')} title="Agent Network"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'agent-network' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Trophy size={13} />
                  </button>
                  <button onClick={() => setPanel(p => p === 'i18n-settings' ? 'none' : 'i18n-settings')} title="Language & i18n"
                    className={`p-1.5 rounded-lg transition-colors ${panel === 'i18n-settings' ? 'text-sage-300 bg-sage-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                    <Globe size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ── Right column: TitleBar + Content (flex-1) ──────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <TitleBar title={activeProject ? `${activeProject.emoji} ${activeProject.name}` : 'Nyra'} />

        {/* ── Executive layout (content row) ─────────────────────────── */}
        <div className="flex flex-1 min-h-0">

        {/* ── Main content area (flex-1) — Chat or Cowork ────────────── */}
        {appMode === 'cowork' ? (
          <main className="flex flex-col flex-1 min-w-0 relative">
            <CoworkLayout />
          </main>
        ) : (
        <main className="flex flex-col flex-1 min-w-0 relative">

          {/* Chat header — minimal, Claude-style */}
          <div className="flex items-center h-10 px-5 border-b border-white/[0.04] flex-shrink-0 gap-3">
            <div className="flex-1 min-w-0">
              {oc.activeSession && (
                <p className="text-[12px] text-white/40 truncate font-medium">
                  {oc.activeSession.title || 'New chat'}
                  {oc.activeSession.branchedFrom && (
                    <span className="ml-2 text-gold-400/40 text-[10px]"><GitBranch size={9} className="inline mr-0.5" />branched</span>
                  )}
                </p>
              )}
            </div>

            {zoomLabel && (
              <div className="bg-white/[0.05] rounded-md px-2 py-0.5 text-[10px] text-white/40 font-mono">
                {zoomLabel}
              </div>
            )}

            {/* Artifact toggle */}
            {activeArtifacts.length > 0 && (
              <button
                onClick={() => setArtifactOpen(a => !a)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-colors ${
                  artifactOpen ? 'bg-terra-400/15 text-terra-300 border border-terra-400/30' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.03]'
                }`}
              >
                <Hash size={11} />
                {activeArtifacts.length}
              </button>
            )}

            {/* Export */}
            {oc.activeSession && messages.length > 0 && (
              <button onClick={() => setModal('export')} title="Export chat" className="p-1.5 rounded-lg text-white/15 hover:text-white/50 hover:bg-white/[0.03] transition-colors">
                <Download size={12} />
              </button>
            )}
          </div>

          {/* Messages — Claude-like clean flow */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {!oc.activeSession || messages.length === 0 ? (
              <WelcomeScreen
                onSuggestion={async (text) => {
                  if (!oc.activeSession) await oc.createSession()
                  setTimeout(() => oc.sendMessage(text), 80)
                }}
              />
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {messages.map((m, i) => (
                  <ChatMessageBubble
                    key={m.id ?? `msg-${i}`}
                    message={m}
                    isStreaming={oc.streaming && i === messages.length - 1 && m.role === 'assistant'}
                    streamingPhase={oc.streaming && i === messages.length - 1 && m.role === 'assistant' ? oc.streamingPhase : undefined}
                    onBranch={m.role === 'assistant' ? () => oc.branchSession(oc.activeSession!.id, i) : undefined}
                  />
                ))}
                {/* Streaming indicator — subtle, inside the flow */}
                {oc.streaming && (
                  <div className="py-3 px-6">
                    <div className="max-w-[720px] mx-auto flex items-center gap-2">
                      <Loader2 size={12} className="animate-spin text-terra-300/60" />
                      <span className="text-[12px] text-white/20">
                        {oc.streamingPhase === 'thinking' ? 'Thinking…' :
                         oc.streamingPhase === 'tool-use' ? 'Using tools…' :
                         oc.streamingPhase === 'generating' ? 'Writing…' :
                         'Connecting…'}
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Error reconnect banner */}
          {oc.status === 'error' && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-blush-400/10 border-t border-blush-400/15 flex-shrink-0">
              <AlertTriangle size={12} className="text-blush-300 flex-shrink-0" />
              <p className="text-xs text-blush-300/80 flex-1">OpenClaw connection lost — messages are queued</p>
              <button onClick={oc.restart} className="flex items-center gap-1.5 text-xs text-blush-300 hover:text-blush-300/60 font-medium transition-colors">
                <RefreshCw size={11} /> Reconnect
              </button>
            </div>
          )}

          {/* Input — centered, Claude-style */}
          <div className="flex-shrink-0 px-5 pb-4 pt-3">
            <ChatInput
              ref={inputRef}
              onSend={handleSend}
              disabled={oc.streaming}
              incognito={incognito}
              systemPrompt={activeProject?.systemPrompt || oc.activeSession?.systemPrompt}
              onStartVoice={() => setModal('voice')}
              onScreenCapture={handleScreenCapture}
              model={model}
              onModelChange={handleModelChange}
              connectedProviders={[...connectedProviders, ...(ollamaModels.length > 0 ? ['ollama'] : [])]}
              ollamaModels={ollamaModels}
              gatewayCatalog={gatewayCatalog}
              fastMode={fastMode}
              onFastModeChange={setFastMode}
              onSlashCommand={handleSlashCommand}
            />
          </div>
        </main>
        )}

        {/* ── Artifact Pane (slides in) ─────────────────────────────────── */}
        {artifactOpen && activeArtifacts.length > 0 && (
          <ArtifactPane artifacts={activeArtifacts} onClose={() => setArtifactOpen(false)} />
        )}

        {/* ── Settings panel (fixed drawer) ─────────────────────────────── */}
        {panel === 'settings' && (
          <div className="w-[380px] flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-black/50 backdrop-blur-md">
            <SettingsPanel onClose={() => setPanel('none')} />
          </div>
        )}

        {/* ── Git panel (slide-in drawer) ─────────────────────────────────── */}
        <GitPanel visible={gitPanelOpen} onClose={() => setGitPanelOpen(false)} />
        </div>{/* end executive layout (content row) */}

        {/* ── Terminal panel (bottom) ─────────────────────────────────────── */}
        <TerminalPanel visible={terminalOpen} onToggle={() => setTerminalOpen(v => !v)} />

        {/* Status bar */}
        <StatusBar status={oc.status} wsStatus={oc.wsStatus} wsUrl={oc.wsUrl} log={oc.log} />
      </div>{/* end right column */}

      {/* ── Scheduled tasks modal ─────────────────────────────────────────── */}
      {panel === 'scheduled' && <ScheduledTasks onClose={() => setPanel('none')} />}

      {/* ── Computer Use panel ─────────────────────────────────────────────── */}
      {panel === 'computer-use' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[480px] h-[600px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white/80">Computer Use</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ComputerUsePanel />
            </div>
          </div>
        </div>
      )}

      {/* ── Agent Pipeline panel ────────────────────────────────────────────── */}
      {panel === 'agent-pipeline' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[420px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <AgentPanel />
          </div>
        </div>
      )}

      {/* ── Memory Inspector panel ──────────────────────────────────────────── */}
      {panel === 'memory-inspector' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[420px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <MemoryInspectorPanel />
          </div>
        </div>
      )}

      {/* ── Workflow Recipes panel ──────────────────────────────────────────── */}
      {panel === 'workflow-recipes' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[460px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <WorkflowRecipesPanel />
          </div>
        </div>
      )}

      {/* ── Agent Studio panel ──────────────────────────────────────────────── */}
      {panel === 'agent-studio' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[460px] h-[680px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <AgentStudioPanel />
          </div>
        </div>
      )}

      {/* ── Stream Chat panel ────────────────────────────────────────────── */}
      {panel === 'stream-chat' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[500px] h-[700px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <StreamChatPanel />
          </div>
        </div>
      )}

      {/* ── Collaboration Timeline panel ─────────────────────────────────── */}
      {panel === 'collab-timeline' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[480px] h-[660px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <CollaborationTimeline />
          </div>
        </div>
      )}

      {/* ── Provider Dashboard panel ─────────────────────────────────────── */}
      {panel === 'provider-dashboard' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[440px] h-[620px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <ProviderDashboard />
          </div>
        </div>
      )}

      {/* ── Knowledge Graph panel ────────────────────────────────────────── */}
      {panel === 'knowledge-graph' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[680px] h-[520px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <KnowledgeGraphPanel />
          </div>
        </div>
      )}

      {/* ── Conversation Tree panel ──────────────────────────────────────── */}
      {panel === 'conv-tree' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[440px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <ConversationTreePanel />
          </div>
        </div>
      )}

      {/* ── Agent Analytics panel ────────────────────────────────────────── */}
      {panel === 'agent-analytics' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[520px] h-[680px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <AgentAnalyticsPanel />
          </div>
        </div>
      )}

      {/* ── Notification Center panel ────────────────────────────────────── */}
      {panel === 'notification-center' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[440px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <NotificationCenterPanel />
          </div>
        </div>
      )}

      {/* ── Codebase Explorer panel ──────────────────────────────────────── */}
      {panel === 'codebase-explorer' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[720px] h-[600px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <CodebaseExplorerPanel />
          </div>
        </div>
      )}

      {/* ── Context Visualizer panel ─────────────────────────────────────── */}
      {panel === 'context-visualizer' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[480px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <ContextVisualizerPanel />
          </div>
        </div>
      )}

      {/* ── Plugin Studio panel ───────────────────────────────────────────── */}
      {panel === 'plugin-studio' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[520px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <PluginStudioPanel />
          </div>
        </div>
      )}

      {/* ── Prompt Library v2 panel ───────────────────────────────────────── */}
      {panel === 'prompt-library-v2' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[480px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <PromptLibraryPanel2 />
          </div>
        </div>
      )}

      {/* ── Task Board panel ──────────────────────────────────────────────── */}
      {panel === 'task-board' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[900px] h-[600px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <TaskBoardPanel />
          </div>
        </div>
      )}

      {/* ── API Playground panel ──────────────────────────────────────────── */}
      {panel === 'api-playground' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[560px] h-[680px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <ApiPlaygroundPanel />
          </div>
        </div>
      )}

      {/* ── Performance Profiler panel ────────────────────────────────────── */}
      {panel === 'perf-profiler' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[560px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <PerformanceProfilerPanel />
          </div>
        </div>
      )}

      {/* ── Voice Interface panel ─────────────────────────────────────────── */}
      {panel === 'voice-interface' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[480px] h-[600px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <VoiceInterfacePanel />
          </div>
        </div>
      )}

      {/* ── File Attachment panel ──────────────────────────────────────────── */}
      {panel === 'file-attachment' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[500px] h-[620px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <FileAttachmentPanel />
          </div>
        </div>
      )}

      {/* ── Diff Viewer panel ──────────────────────────────────────────────── */}
      {panel === 'diff-viewer' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[700px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <DiffViewerPanel />
          </div>
        </div>
      )}

      {/* ── A/B Testing panel ──────────────────────────────────────────────── */}
      {panel === 'ab-testing' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[580px] h-[660px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <ABTestingPanel />
          </div>
        </div>
      )}

      {/* ── Theme Editor panel ─────────────────────────────────────────────── */}
      {panel === 'theme-editor' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[520px] h-[680px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <ThemeEditorPanel />
          </div>
        </div>
      )}

      {/* ── Global Search panel ─────────────────────────────────────────────── */}
      {panel === 'global-search' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[560px] h-[620px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <GlobalSearchPanel />
          </div>
        </div>
      )}

      {/* ── Activity Feed panel ─────────────────────────────────────────────── */}
      {panel === 'activity-feed' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[520px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <ActivityFeedPanel />
          </div>
        </div>
      )}

      {/* ── Workspace Export panel ──────────────────────────────────────────── */}
      {panel === 'workspace-export' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[480px] h-[560px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <WorkspaceExportPanel />
          </div>
        </div>
      )}

      {/* ── Report Generator panel ─────────────────────────────────────────── */}
      {panel === 'report-gen' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[560px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <ReportGeneratorPanel />
          </div>
        </div>
      )}

      {/* ── Webhook Manager panel ──────────────────────────────────────────── */}
      {panel === 'webhook-mgr' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[560px] h-[660px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <WebhookManagerPanel />
          </div>
        </div>
      )}

      {/* ── Backup Manager panel ───────────────────────────────────────────── */}
      {panel === 'backup-mgr' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[480px] h-[580px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <BackupManagerPanel />
          </div>
        </div>
      )}

      {/* ── Session Sharing panel ──────────────────────────────────────────── */}
      {panel === 'session-sharing' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[480px] h-[560px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <SessionSharingPanel />
          </div>
        </div>
      )}

      {/* ── Error Boundary panel ───────────────────────────────────────────── */}
      {panel === 'error-boundary' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[560px] h-[640px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <ErrorBoundaryPanel />
          </div>
        </div>
      )}

      {/* ── Offline Manager panel ──────────────────────────────────────────── */}
      {panel === 'offline-mgr' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[480px] h-[560px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <OfflineManagerPanel />
          </div>
        </div>
      )}

      {/* ── Startup Profiler panel ─────────────────────────────────────────── */}
      {panel === 'startup-profiler' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[520px] h-[600px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <StartupProfilerPanel />
          </div>
        </div>
      )}

      {/* ── Accessibility panel ────────────────────────────────────────────── */}
      {panel === 'accessibility' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[480px] h-[580px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <AccessibilityPanel />
          </div>
        </div>
      )}

      {/* ── Build Validator panel ──────────────────────────────────────────── */}
      {panel === 'build-validator' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[520px] h-[620px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <BuildValidatorPanel />
          </div>
        </div>
      )}

      {/* ── Code Benchmark panel ──────────────────────────────────────────── */}
      {panel === 'code-benchmark' && (
        <CodeBenchmarkPanel onClose={() => setPanel('none')} />
      )}

      {/* ── Web Search panel ─────────────────────────────────────────────── */}
      {panel === 'web-search' && (
        <WebSearchPanel onClose={() => setPanel('none')} />
      )}

      {/* ── Year 1-5 Platform panels ─────────────────────────────────────── */}
      {panel === 'model-router' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[480px] h-[700px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white/80">Model Router</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ModelRouterPanel />
            </div>
          </div>
        </div>
      )}

      {panel === 'enterprise-dash' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[600px] h-[720px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white/80">Enterprise Dashboard</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-hidden">
              <EnterpriseDashboard />
            </div>
          </div>
        </div>
      )}

      {panel === 'voice-engine' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[440px] h-[660px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white/80">Voice Engine</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <VoiceEnginePanel />
            </div>
          </div>
        </div>
      )}

      {panel === 'plugin-sandbox' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[520px] h-[700px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white/80">Plugin Sandbox</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-hidden">
              <PluginSandboxPanel />
            </div>
          </div>
        </div>
      )}

      {panel === 'agent-network' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[500px] h-[720px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white/80">Agent Network</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AgentNetworkPanel />
            </div>
          </div>
        </div>
      )}

      {panel === 'i18n-settings' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setPanel('none') }}>
          <div className="w-[460px] h-[680px] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white/80">Language & i18n</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <I18nSettingsPanel />
            </div>
          </div>
        </div>
      )}

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

      {/* ── Panel launcher (CommandPaletteV2) ─────────────────────────────── */}
      <CommandPaletteV2
        open={commandPaletteV2Open}
        onClose={() => setCommandPaletteV2Open(false)}
        onSelectPanel={(panelId) => setPanel(panelId as Panel)}
        currentPanel={panel}
      />

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

      {/* ── Model comparison ────────────────────────────────────────────── */}
      {modal === 'modelCompare' && (
        <ModelComparison
          onClose={() => setModal('none')}
          onSelectResponse={(_modelId, content) => {
            handleSend(content)
            setModal('none')
          }}
        />
      )}

      {/* ── MCP Browser ─────────────────────────────────────────────────── */}
      {modal === 'mcpBrowser' && (
        <MCPBrowser onClose={() => setModal('none')} />
      )}
    </div>
    </ActionQueueProvider>
  )
}

// ── Action confirmation overlay (rendered inside ActionQueueProvider) ────────
const ActionConfirmationOverlay: React.FC = () => {
  const { pendingAction, approve, deny, alwaysAllow } = useActionQueue()
  if (!pendingAction) return null
  return (
    <ActionConfirmation
      action={pendingAction}
      onApprove={() => approve(pendingAction.id)}
      onDeny={() => deny(pendingAction.id)}
      onAlwaysAllow={() => {
        alwaysAllow(pendingAction.type)
        approve(pendingAction.id)
      }}
    />
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
          {session.pinned && <Pin size={9} className="text-gold-400/70 flex-shrink-0" />}
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

// ── Welcome screen — clean, Claude-inspired ──────────────────────────────────
const WelcomeScreen: React.FC<{ onSuggestion: (text: string) => void }> = ({ onSuggestion }) => (
  <div className="flex flex-col items-center justify-center h-full gap-10 px-6">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-terra-400/20 to-terra-600/15 border border-terra-400/15 flex items-center justify-center">
        <Cpu size={22} className="text-terra-300/80" />
      </div>
      <h2 className="text-lg font-medium text-white/70">What can I help with?</h2>
    </div>

    <div className="grid grid-cols-2 gap-2 max-w-[440px] w-full">
      {SUGGESTIONS.map(s => (
        <button
          key={s.text}
          onClick={() => onSuggestion(s.text)}
          className="flex items-center gap-2.5 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] hover:border-white/[0.08] rounded-xl px-4 py-3 text-[13px] text-white/35 hover:text-white/70 transition-all text-left"
        >
          <span className="text-sm leading-none flex-shrink-0 opacity-40">{s.icon}</span>
          <span>{s.text}</span>
        </button>
      ))}
    </div>

    <p className="text-[11px] text-white/[0.12]">Powered by OpenClaw · running locally</p>
  </div>
)

// ── Theme helper ───────────────────────────────────────────────────────────────
function resolveAutoMode(systemDark: boolean): 'dark' | 'light' {
  // Time-of-day heuristic: dark between 8pm and 7am
  const hour = new Date().getHours()
  const nightTime = hour >= 20 || hour < 7
  // Use dark if either the system says dark or it's nighttime
  return (systemDark || nightTime) ? 'dark' : 'light'
}

function applyThemeClass(mode: string, fontSize: string) {
  const root = document.documentElement
  root.classList.remove('theme-dark', 'theme-dim', 'theme-light', 'text-sm', 'text-base', 'text-lg')
  // 'auto' should never reach here directly — it's resolved upstream — but guard just in case
  const resolved = mode === 'auto' ? 'dark' : mode
  root.classList.add(`theme-${resolved}`)
  root.style.fontSize = fontSize === 'sm' ? '13px' : fontSize === 'lg' ? '16px' : '14px'
}

export default App
