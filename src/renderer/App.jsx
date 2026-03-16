/**
 * Nyra Desktop — Executive Layout (v3)
 *
 * Layout: ProjectsRail (52px) | Sidebar (220px) | ChatArea (flex-1) | [ArtifactPane (400px)]
 *
 * Features: Projects, CommandPalette, PromptLibrary, VoiceInput, ArtifactPane,
 *           ExportModal, BranchSession, Theme, Offline queue, Token batching.
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Settings, Cpu, X, Clock, Moon, Monitor, Loader2, AlertTriangle, RefreshCw, BookOpen, Download, GitBranch, Hash, Pin, MoreHorizontal, Trash2, Terminal, GitCommitHorizontal, Mic, Router, Building2, Shield, Network, Globe } from 'lucide-react';
import { useOpenClaw } from './hooks/useOpenClaw';
import { TitleBar } from './components/TitleBar';
import { BootSplash } from './components/BootSplash';
import { ChatMessageBubble } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { SettingsPanel } from './components/SettingsPanel';
import { StatusBar } from './components/StatusBar';
import { DragDropOverlay } from './components/DragDropOverlay';
import { NotificationBanner } from './components/NotificationBanner';
import { ScheduledTasks } from './components/ScheduledTasks';
import { CommandPalette } from './components/CommandPalette';
import { ProjectsRail, CreateProjectModal } from './components/ProjectsRail';
import { ArtifactPane, parseArtifacts } from './components/ArtifactPane';
import { PromptLibrary } from './components/PromptLibrary';
import { ExportModal } from './components/ExportModal';
import { VoiceInput } from './components/VoiceInput';
import TerminalPanel from './components/Terminal';
import { GitPanel } from './components/GitPanel';
import { ActionQueueProvider, ActionConfirmation, useActionQueue } from './components/ActionConfirmation';
import { Onboarding } from './components/Onboarding';
import { ModelComparison } from './components/ModelComparison';
import { MCPBrowser } from './components/MCPBrowser';
import CoworkLayout from './components/cowork/CoworkLayout';
import ComputerUsePanel from './components/ComputerUsePanel';
import VoiceEnginePanel from './components/VoiceEnginePanel';
import ModelRouterPanel from './components/ModelRouterPanel';
import EnterpriseDashboard from './components/EnterpriseDashboard';
import PluginSandboxPanel from './components/PluginSandboxPanel';
import AgentNetworkPanel from './components/AgentNetworkPanel';
import I18nSettingsPanel from './components/I18nSettingsPanel';
// ── Session color map ──────────────────────────────────────────────────────────
const COLOR_DOT = {
    indigo: 'bg-terra-300', violet: 'bg-gold-400', rose: 'bg-blush-400',
    amber: 'bg-gold-400', emerald: 'bg-sage-400', cyan: 'bg-terra-300', none: '',
};
// ── Welcome suggestions ────────────────────────────────────────────────────────
const SUGGESTIONS = [
    { icon: '✦', text: 'Summarise my day' },
    { icon: '⌘', text: 'Write a bash script' },
    { icon: '◈', text: 'Explain this code' },
    { icon: '◉', text: 'Draft an email' },
    { icon: '⊕', text: 'Create a todo list' },
    { icon: '⊗', text: 'Debug an error' },
];
// ─────────────────────────────────────────────────────────────────────────────
export const App = () => {
    const oc = useOpenClaw();
    // ── UI state ──────────────────────────────────────────────────────────────
    const [appMode, setAppMode] = useState('chat');
    const [panel, setPanel] = useState('none');
    const [modal, setModal] = useState('none');
    const [searchQuery, setSearchQuery] = useState('');
    const [incognito, setIncognito] = useState(false);
    const [model, setModel] = useState('auto');
    const [fastMode, setFastMode] = useState(false);
    const [ollamaModels, setOllamaModels] = useState([]);
    const [connectedProviders, setConnectedProviders] = useState([]);
    const [wallpaper, setWallpaper] = useState('herringbone');
    const [zoomLabel, setZoomLabel] = useState(null);
    const [artifactOpen, setArtifactOpen] = useState(false);
    const [terminalOpen, setTerminalOpen] = useState(false);
    const [gitPanelOpen, setGitPanelOpen] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(null); // null = loading
    // ── Projects state ─────────────────────────────────────────────────────────
    const [projects, setProjects] = useState([]);
    const [activeProjectId, setActiveProjectId] = useState(null);
    // ── Refs ───────────────────────────────────────────────────────────────────
    const zoomTimerRef = useRef(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    // ── Load projects ──────────────────────────────────────────────────────────
    const loadProjects = useCallback(async () => {
        try {
            setProjects(await window.nyra.projects.list());
        }
        catch { }
    }, []);
    useEffect(() => { loadProjects(); }, [loadProjects]);
    // ── Fetch local Ollama models ────────────────────────────────────────────
    useEffect(() => {
        let mounted = true;
        const fetch = () => window.nyra.ollama.models()
            .then(m => { if (mounted)
            setOllamaModels(m); })
            .catch(() => { });
        fetch();
        // Refresh every 30s in case models are added/removed
        const iv = setInterval(fetch, 30_000);
        return () => { mounted = false; clearInterval(iv); };
    }, []);
    // ── Fetch connected provider states ──────────────────────────────────────
    useEffect(() => {
        let mounted = true;
        const refresh = () => window.nyra.providers.list()
            .then((states) => {
            if (!mounted)
                return;
            const connected = states
                .filter(s => s.hasKey && s.enabled)
                .map(s => s.id);
            // Also add 'ollama' if we have any local models
            setConnectedProviders(connected);
        })
            .catch(() => { });
        refresh();
        // Refresh every 10s (providers may be connected/disconnected)
        const iv = setInterval(refresh, 10_000);
        return () => { mounted = false; clearInterval(iv); };
    }, []);
    // ── Onboarding check ─────────────────────────────────────────────────────
    useEffect(() => {
        let mounted = true;
        window.nyra.app.isOnboarded().then(done => {
            if (mounted)
                setShowOnboarding(!done);
        }).catch(() => {
            if (mounted)
                setShowOnboarding(false); // assume onboarded on error
        });
        return () => { mounted = false; };
    }, []);
    const handleOnboardingComplete = useCallback(async () => {
        await window.nyra.app.setOnboarded();
        setShowOnboarding(false);
    }, []);
    // ── Theme apply on mount (with Auto mode resolution) ─────────────────────
    useEffect(() => {
        let mounted = true;
        const applyResolved = async (t) => {
            let effectiveMode = t.mode;
            if (t.mode === 'auto') {
                try {
                    const systemDark = await window.nyra.theme.systemDark();
                    effectiveMode = resolveAutoMode(systemDark);
                }
                catch {
                    effectiveMode = 'dark'; // fallback
                }
            }
            if (mounted) {
                applyThemeClass(effectiveMode, t.fontSize);
                if (t.wallpaper)
                    setWallpaper(t.wallpaper);
            }
        };
        // Initial apply
        window.nyra.theme.get().then(applyResolved).catch(() => { });
        // Listen for explicit theme changes (from SettingsPanel)
        const unsubTheme = window.nyra.theme.onChange(applyResolved);
        // Listen for system theme changes (only matters when mode is 'auto')
        let unsubSystem;
        if (window.nyra.theme.onSystemChange) {
            unsubSystem = window.nyra.theme.onSystemChange(async (systemDark) => {
                try {
                    const t = await window.nyra.theme.get();
                    if (t.mode === 'auto' && mounted) {
                        const effectiveMode = resolveAutoMode(systemDark);
                        applyThemeClass(effectiveMode, t.fontSize);
                    }
                }
                catch { }
            });
        }
        // Re-check time-of-day every 5 minutes for auto mode
        const timeCheck = setInterval(async () => {
            try {
                const t = await window.nyra.theme.get();
                if (t.mode === 'auto' && mounted) {
                    const systemDark = await window.nyra.theme.systemDark();
                    applyThemeClass(resolveAutoMode(systemDark), t.fontSize);
                }
            }
            catch { }
        }, 5 * 60 * 1000);
        return () => {
            mounted = false;
            if (typeof unsubTheme === 'function')
                unsubTheme();
            if (typeof unsubSystem === 'function')
                unsubSystem();
            clearInterval(timeCheck);
        };
    }, []);
    // ── Scroll to bottom ───────────────────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [oc.activeSession?.messages]);
    // ── Keyboard shortcuts ─────────────────────────────────────────────────────
    useEffect(() => {
        const u1 = window.nyra.shortcuts.onNewChat(() => { oc.createSession(); setPanel('none'); setModal('none'); });
        const u2 = window.nyra.shortcuts.onSettings(() => setPanel(p => p === 'settings' ? 'none' : 'settings'));
        const u3 = window.nyra.shortcuts.onCommandPalette(() => setModal(m => m === 'commandPalette' ? 'none' : 'commandPalette'));
        return () => { [u1, u2, u3].forEach(u => typeof u === 'function' && u()); };
    }, []);
    // ── Zoom indicator ─────────────────────────────────────────────────────────
    useEffect(() => {
        const unsub = window.nyra.zoom.onChange((f) => {
            setZoomLabel(`${Math.round(f * 100)}%`);
            if (zoomTimerRef.current)
                clearTimeout(zoomTimerRef.current);
            zoomTimerRef.current = setTimeout(() => setZoomLabel(null), 1500);
        });
        return () => { if (typeof unsub === 'function')
            unsub(); };
    }, []);
    // ── Drag-drop ──────────────────────────────────────────────────────────────
    const handleDrop = useCallback((attachments) => {
        window.nyra.notify.send('Files attached', `${attachments.length} file(s) ready to send`);
    }, []);
    // ── Projects ───────────────────────────────────────────────────────────────
    const handleCreateProject = async (data) => {
        const p = {
            id: `project-${Date.now()}`,
            name: data.name, emoji: data.emoji, color: data.color,
            systemPrompt: data.systemPrompt, sessionIds: [], pinnedSessionIds: [],
            createdAt: Date.now(), updatedAt: Date.now(),
        };
        await window.nyra.projects.create(p);
        await loadProjects();
        setActiveProjectId(p.id);
        setModal('none');
    };
    // ── Session helpers ────────────────────────────────────────────────────────
    const activeProject = projects.find(p => p.id === activeProjectId) ?? null;
    const filteredSessions = useMemo(() => {
        let list = oc.sessions;
        if (activeProjectId)
            list = list.filter(s => s.projectId === activeProjectId);
        if (!searchQuery)
            return null; // null = use grouped
        const q = searchQuery.toLowerCase();
        return list.filter(s => s.title?.toLowerCase().includes(q) ||
            s.messages.some(m => m.content.toLowerCase().includes(q)));
    }, [oc.sessions, searchQuery, activeProjectId]);
    const groupedSessions = useMemo(() => {
        let list = oc.sessions;
        if (activeProjectId)
            list = list.filter(s => s.projectId === activeProjectId);
        const now = Date.now();
        const today = new Date().setHours(0, 0, 0, 0);
        const yesterday = today - 86400000;
        const groups = [];
        const pinned = list.filter(s => s.pinned);
        const unpinned = list.filter(s => !s.pinned);
        if (pinned.length)
            groups.push({ label: 'Pinned', sessions: pinned });
        const buckets = [['Today', []], ['Yesterday', []], ['This week', []], ['Older', []]];
        for (const s of unpinned) {
            const t = s.updatedAt;
            if (t >= today)
                buckets[0][1].push(s);
            else if (t >= yesterday)
                buckets[1][1].push(s);
            else if (now - t < 7 * 86400000)
                buckets[2][1].push(s);
            else
                buckets[3][1].push(s);
        }
        for (const [label, sessions] of buckets) {
            if (sessions.length)
                groups.push({ label, sessions });
        }
        return groups;
    }, [oc.sessions, activeProjectId]);
    // ── Active artifacts ───────────────────────────────────────────────────────
    const activeArtifacts = useMemo(() => {
        const msgs = oc.activeSession?.messages ?? [];
        // Collect from last assistant message that has code
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'assistant') {
                const arts = parseArtifacts(msgs[i].content);
                if (arts.length > 0)
                    return arts;
            }
        }
        return [];
    }, [oc.activeSession?.messages]);
    // ── Screen capture ─────────────────────────────────────────────────────────
    const handleScreenCapture = useCallback(async () => {
        try {
            const capture = await window.nyra.screen.capture();
            if (capture) {
                const attachment = {
                    name: `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
                    mimeType: 'image/png',
                    content: capture.base64,
                };
                let sessionId = oc.activeSession?.id;
                if (!sessionId) {
                    const s = await oc.createSession();
                    sessionId = s?.id;
                }
                await oc.sendMessage('Here is a screenshot of my screen. What do you see?', [attachment]);
            }
        }
        catch (err) {
            console.error('Screen capture failed:', err);
        }
    }, [oc]);
    // ── Handle send ────────────────────────────────────────────────────────────
    // v4: sendMessage handles session creation internally — no double-create race
    // When incognito is enabled, create an incognito session first if needed
    // Pass the currently selected model so the gateway knows which LLM to route to
    const handleSend = useCallback(async (text, attachments) => {
        if (incognito && (!oc.activeSession || !oc.activeSession.incognito)) {
            await oc.createSession({ incognito: true });
        }
        await oc.sendMessage(text, attachments, model);
    }, [oc, incognito, model]);
    // ── Model change handler — syncs to both local state and active session ────
    const handleModelChange = useCallback(async (newModel) => {
        setModel(newModel);
        // Also persist on the active session so the gateway knows which model to use
        if (oc.activeSession) {
            oc.setSessionModel(oc.activeSession.id, newModel);
        }
        // Write model to auth-profiles so the gateway picks it up
        try {
            const ok = await window.nyra.providers.switchModel(newModel);
            if (ok) {
                // Force WebSocket reconnect so the gateway re-reads auth-profiles
                // with the new default provider and model
                oc.reconnect();
            }
        }
        catch (err) {
            console.warn('[App] Failed to switch model in auth-profiles:', err);
        }
    }, [oc]);
    // ── Restore model from session when switching sessions ──────────────────
    useEffect(() => {
        if (oc.activeSession?.model) {
            setModel(oc.activeSession.model);
        }
    }, [oc.activeSession?.id]);
    // ── Slash command handler ──────────────────────────────────────────────
    const handleSlashCommand = useCallback((command) => {
        switch (command) {
            case 'help':
                setModal('commandPalette');
                break;
            case 'clear':
                if (oc.activeSession) {
                    oc.createSession();
                }
                break;
            case 'new':
                oc.createSession();
                setPanel('none');
                break;
            case 'export':
                if (oc.activeSession)
                    setModal('export');
                break;
            case 'incognito':
                setIncognito(i => !i);
                break;
            case 'fast':
                setFastMode(f => !f);
                break;
            case 'settings':
                setPanel(p => p === 'settings' ? 'none' : 'settings');
                break;
            case 'model': /* model selector opens via ChatInput */ break;
            default: break;
        }
    }, [oc]);
    // ── Insert text from prompt/voice ──────────────────────────────────────────
    const handleInsertText = useCallback((text) => {
        if (inputRef.current) {
            const ta = inputRef.current;
            const start = ta.selectionStart ?? ta.value.length;
            const end = ta.selectionEnd ?? ta.value.length;
            const before = ta.value.slice(0, start);
            const after = ta.value.slice(end);
            const next = before + text + after;
            // Trigger React synthetic event
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
            nativeInputValueSetter?.call(ta, next);
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.focus();
        }
    }, []);
    // ── Boot splash — only for genuinely slow operations ────────────────────
    // 'checking' resolves in <1s when gateway is already running — don't block.
    // Only block on 'installing' (npm install) which takes 10-30s.
    if (oc.status === 'installing') {
        return <BootSplash status={oc.status} log={oc.log}/>;
    }
    // Wait for onboarding check before rendering anything
    if (showOnboarding === null) {
        return <div className="h-screen w-screen bg-[#0b0a08]"/>;
    }
    if (showOnboarding) {
        return <Onboarding onComplete={handleOnboardingComplete}/>;
    }
    const messages = oc.activeSession?.messages ?? [];
    // ── Render ─────────────────────────────────────────────────────────────────
    return (<ActionQueueProvider>
    <div className={`h-screen w-screen flex bg-[#0b0a08] text-white overflow-hidden select-none wallpaper-${wallpaper}`}>

      <NotificationBanner />
      <ActionConfirmationOverlay />
      <DragDropOverlay onFiles={handleDrop}/>

      {/* ── Left column: Projects Rail + Sidebar (full height) ────────── */}
      <div className="flex flex-shrink-0 h-screen">
        {/* ── Projects Rail (52px) ─────────────────────────────────────── */}
        <ProjectsRail projects={projects} activeProjectId={activeProjectId} onSelectProject={setActiveProjectId} onCreateProject={() => setModal('createProject')}/>

        {/* ── Sidebar (220px) ──────────────────────────────────────────── */}
        <aside className="w-[220px] flex-shrink-0 flex flex-col bg-black/30 border-r border-white/[0.06]">
          {/* Drag region for macOS traffic lights — sits at top of sidebar */}
          <div className="h-11 flex items-center flex-shrink-0" style={{ WebkitAppRegion: 'drag' }}/>

          {/* Sidebar header */}
          <div className="flex flex-col border-b border-white/[0.05] flex-shrink-0">
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="flex-1 min-w-0">
                {activeProject
            ? <p className="text-[11px] font-semibold text-white/70 truncate">{activeProject.emoji} {activeProject.name}</p>
            : <p className="text-[11px] font-bold text-white/50 tracking-widest uppercase">Nyra</p>}
              </div>
              <button onClick={() => { oc.createSession(); setPanel('none'); }} className="p-1.5 rounded-xl bg-terra-400/80 hover:bg-terra-500 text-white transition-colors flex-shrink-0" title="New chat  ⌘N">
                <Plus size={12}/>
              </button>
            </div>
            {/* ── Mode switcher: Chat / Cowork ────────────────────────── */}
            <div className="flex items-center gap-1 px-4 pb-2.5">
              <button onClick={() => setAppMode('chat')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${appMode === 'chat'
            ? 'bg-terra-400/15 text-terra-300 border border-terra-400/25'
            : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                Chat
              </button>
              <button onClick={() => setAppMode('cowork')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${appMode === 'cowork'
            ? 'bg-terra-400/15 text-terra-300 border border-terra-400/25'
            : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                Cowork
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2 flex-shrink-0">
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.05] rounded-xl px-2.5 py-1.5">
              <Search size={10} className="text-white/20 flex-shrink-0"/>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search chats…" className="flex-1 bg-transparent text-[11px] text-white/60 placeholder-white/20 outline-none"/>
              {searchQuery && (<button onClick={() => setSearchQuery('')} className="text-white/20 hover:text-white/50 flex-shrink-0">
                  <X size={9}/>
                </button>)}
            </div>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-1.5 pb-2">
            {filteredSessions
            ? filteredSessions.length === 0
                ? <p className="text-white/20 text-[11px] text-center py-6">No results</p>
                : filteredSessions.map(s => (<SessionItem key={s.id} session={s} active={oc.activeSession?.id === s.id} onSelect={() => { oc.selectSession(s.id); setPanel('none'); }} onPin={() => oc.pinSession(s.id)} onDelete={() => oc.deleteSession(s.id)} onBranch={() => { }} // handled in chat area
                />))
            : groupedSessions.map(g => (<React.Fragment key={g.label}>
                    <p className="px-2 pt-3 pb-1 text-[9px] text-white/20 font-semibold uppercase tracking-widest">{g.label}</p>
                    {g.sessions.map(s => (<SessionItem key={s.id} session={s} active={oc.activeSession?.id === s.id} onSelect={() => { oc.selectSession(s.id); setPanel('none'); }} onPin={() => oc.pinSession(s.id)} onDelete={() => oc.deleteSession(s.id)} onBranch={() => { }}/>))}
                  </React.Fragment>))}
            {oc.sessions.length === 0 && !searchQuery && (<div className="flex flex-col items-center py-8 gap-2">
                <p className="text-white/20 text-[11px] text-center">No conversations yet</p>
                <button onClick={() => oc.createSession()} className="text-[10px] text-terra-300/70 hover:text-terra-300 transition-colors">
                  Start one →
                </button>
              </div>)}
          </div>

          {/* Sidebar footer */}
          <div className="border-t border-white/[0.05] px-2 py-2 space-y-1.5 flex-shrink-0">
            {/* Incognito */}
            <button onClick={() => setIncognito(i => !i)} title={incognito ? 'Exit incognito' : 'Incognito mode'} className={`w-full flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${incognito ? 'bg-gold-500/15 text-gold-300 border border-gold-500/25' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
              <Moon size={11}/>
              {incognito && 'Incog'}
            </button>

            {/* AI Group */}
            <div className="px-2 py-1 text-[9px] font-semibold text-white/30 uppercase tracking-widest">AI</div>
            <button onClick={() => setPanel(p => p === 'voice-engine' ? 'none' : 'voice-engine')} title="Voice Engine" className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] transition-colors ${panel === 'voice-engine' ? 'bg-terra-400/15 text-terra-300 border border-terra-400/25' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
              <Mic size={11}/>
              <span>Voice Engine</span>
            </button>
            <button onClick={() => setPanel(p => p === 'model-router' ? 'none' : 'model-router')} title="Model Router" className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] transition-colors ${panel === 'model-router' ? 'bg-terra-400/15 text-terra-300 border border-terra-400/25' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
              <Router size={11}/>
              <span>Model Router</span>
            </button>

            {/* Admin Group */}
            <div className="px-2 py-1 text-[9px] font-semibold text-white/30 uppercase tracking-widest">Admin</div>
            <button onClick={() => setPanel(p => p === 'enterprise' ? 'none' : 'enterprise')} title="Enterprise Dashboard" className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] transition-colors ${panel === 'enterprise' ? 'bg-terra-400/15 text-terra-300 border border-terra-400/25' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
              <Building2 size={11}/>
              <span>Enterprise</span>
            </button>
            <button onClick={() => setPanel(p => p === 'plugin-sandbox' ? 'none' : 'plugin-sandbox')} title="Plugin Sandbox" className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] transition-colors ${panel === 'plugin-sandbox' ? 'bg-terra-400/15 text-terra-300 border border-terra-400/25' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
              <Shield size={11}/>
              <span>Plugin Sandbox</span>
            </button>

            {/* System Group */}
            <div className="px-2 py-1 text-[9px] font-semibold text-white/30 uppercase tracking-widest">System</div>
            <button onClick={() => setPanel(p => p === 'agent-network' ? 'none' : 'agent-network')} title="Agent Network" className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] transition-colors ${panel === 'agent-network' ? 'bg-terra-400/15 text-terra-300 border border-terra-400/25' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
              <Network size={11}/>
              <span>Agent Network</span>
            </button>
            <button onClick={() => setPanel(p => p === 'i18n' ? 'none' : 'i18n')} title="Language Settings" className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] transition-colors ${panel === 'i18n' ? 'bg-terra-400/15 text-terra-300 border border-terra-400/25' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
              <Globe size={11}/>
              <span>Languages</span>
            </button>

            {/* Tools Group */}
            <div className="px-2 py-1 text-[9px] font-semibold text-white/30 uppercase tracking-widest">Tools</div>
            <div className="flex items-center gap-1">
              <button onClick={() => setModal('prompts')} title="Prompt Library" className="flex-1 p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-colors">
                <BookOpen size={13}/>
              </button>
              <button onClick={() => setTerminalOpen(v => !v)} title="Terminal  ⌘`" className={`flex-1 p-1.5 rounded-lg transition-colors ${terminalOpen ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                <Terminal size={13}/>
              </button>
              <button onClick={() => setGitPanelOpen(v => !v)} title="Git" className={`flex-1 p-1.5 rounded-lg transition-colors ${gitPanelOpen ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                <GitCommitHorizontal size={13}/>
              </button>
              <button onClick={() => setPanel(p => p === 'scheduled' ? 'none' : 'scheduled')} title="Scheduled tasks" className={`flex-1 p-1.5 rounded-lg transition-colors ${panel === 'scheduled' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                <Clock size={13}/>
              </button>
              <button onClick={() => setPanel(p => p === 'computer-use' ? 'none' : 'computer-use')} title="Computer Use" className={`flex-1 p-1.5 rounded-lg transition-colors ${panel === 'computer-use' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                <Monitor size={13}/>
              </button>
              <button onClick={() => setPanel(p => p === 'settings' ? 'none' : 'settings')} title="Settings  ⌘," className={`flex-1 p-1.5 rounded-lg transition-colors ${panel === 'settings' ? 'text-terra-300 bg-terra-400/10' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
                <Settings size={13}/>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Right column: TitleBar + Content (flex-1) ──────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <TitleBar title={activeProject ? `${activeProject.emoji} ${activeProject.name}` : 'Nyra'}/>

        {/* ── Executive layout (content row) ─────────────────────────── */}
        <div className="flex flex-1 min-h-0">

        {/* ── Main content area (flex-1) — Chat or Cowork ────────────── */}
        {appMode === 'cowork' ? (<main className="flex flex-col flex-1 min-w-0 relative">
            <CoworkLayout />
          </main>) : (<main className="flex flex-col flex-1 min-w-0 relative">

          {/* Chat header — minimal, Claude-style */}
          <div className="flex items-center h-10 px-5 border-b border-white/[0.04] flex-shrink-0 gap-3">
            <div className="flex-1 min-w-0">
              {oc.activeSession && (<p className="text-[12px] text-white/40 truncate font-medium">
                  {oc.activeSession.title || 'New chat'}
                  {oc.activeSession.branchedFrom && (<span className="ml-2 text-gold-400/40 text-[10px]"><GitBranch size={9} className="inline mr-0.5"/>branched</span>)}
                </p>)}
            </div>

            {zoomLabel && (<div className="bg-white/[0.05] rounded-md px-2 py-0.5 text-[10px] text-white/40 font-mono">
                {zoomLabel}
              </div>)}

            {/* Artifact toggle */}
            {activeArtifacts.length > 0 && (<button onClick={() => setArtifactOpen(a => !a)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-colors ${artifactOpen ? 'bg-terra-400/15 text-terra-300 border border-terra-400/30' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.03]'}`}>
                <Hash size={11}/>
                {activeArtifacts.length}
              </button>)}

            {/* Export */}
            {oc.activeSession && messages.length > 0 && (<button onClick={() => setModal('export')} title="Export chat" className="p-1.5 rounded-lg text-white/15 hover:text-white/50 hover:bg-white/[0.03] transition-colors">
                <Download size={12}/>
              </button>)}
          </div>

          {/* Messages — Claude-like clean flow */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {!oc.activeSession || messages.length === 0 ? (<WelcomeScreen onSuggestion={async (text) => {
                    if (!oc.activeSession)
                        await oc.createSession();
                    setTimeout(() => oc.sendMessage(text), 80);
                }}/>) : (<div className="divide-y divide-white/[0.03]">
                {messages.map((m, i) => (<ChatMessageBubble key={m.id ?? `msg-${i}`} message={m} isStreaming={oc.streaming && i === messages.length - 1 && m.role === 'assistant'} streamingPhase={oc.streaming && i === messages.length - 1 && m.role === 'assistant' ? oc.streamingPhase : undefined} onBranch={m.role === 'assistant' ? () => oc.branchSession(oc.activeSession.id, i) : undefined}/>))}
                {/* Streaming indicator — subtle, inside the flow */}
                {oc.streaming && (<div className="py-3 px-6">
                    <div className="max-w-[720px] mx-auto flex items-center gap-2">
                      <Loader2 size={12} className="animate-spin text-terra-300/60"/>
                      <span className="text-[12px] text-white/20">
                        {oc.streamingPhase === 'thinking' ? 'Thinking…' :
                        oc.streamingPhase === 'tool-use' ? 'Using tools…' :
                            oc.streamingPhase === 'generating' ? 'Writing…' :
                                'Connecting…'}
                      </span>
                    </div>
                  </div>)}
                <div ref={messagesEndRef}/>
              </div>)}
          </div>

          {/* Error reconnect banner */}
          {oc.status === 'error' && (<div className="flex items-center gap-3 px-4 py-2.5 bg-red-900/20 border-t border-red-500/15 flex-shrink-0">
              <AlertTriangle size={12} className="text-red-400 flex-shrink-0"/>
              <p className="text-xs text-red-300/80 flex-1">OpenClaw connection lost — messages are queued</p>
              <button onClick={oc.restart} className="flex items-center gap-1.5 text-xs text-red-300 hover:text-red-100 font-medium transition-colors">
                <RefreshCw size={11}/> Reconnect
              </button>
            </div>)}

          {/* Input — centered, Claude-style */}
          <div className="flex-shrink-0 px-5 pb-4 pt-3">
            <ChatInput ref={inputRef} onSend={handleSend} disabled={oc.streaming} incognito={incognito} systemPrompt={activeProject?.systemPrompt || oc.activeSession?.systemPrompt} onStartVoice={() => setModal('voice')} onScreenCapture={handleScreenCapture} model={model} onModelChange={handleModelChange} connectedProviders={[...connectedProviders, ...(ollamaModels.length > 0 ? ['ollama'] : [])]} ollamaModels={ollamaModels} fastMode={fastMode} onFastModeChange={setFastMode} onSlashCommand={handleSlashCommand}/>
          </div>
        </main>)}

        {/* ── Artifact Pane (slides in) ─────────────────────────────────── */}
        {artifactOpen && activeArtifacts.length > 0 && (<ArtifactPane artifacts={activeArtifacts} onClose={() => setArtifactOpen(false)}/>)}

        {/* ── Settings panel (fixed drawer) ─────────────────────────────── */}
        {panel === 'settings' && (<div className="w-[380px] flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-black/50 backdrop-blur-md">
            <SettingsPanel onClose={() => setPanel('none')}/>
          </div>)}

        {/* ── Voice Engine panel (fixed drawer) ───────────────────────────── */}
        {panel === 'voice-engine' && (<div className="w-[380px] flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-black/50 backdrop-blur-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-white/80">Voice Engine</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <VoiceEnginePanel />
            </div>
          </div>)}

        {/* ── Model Router panel (fixed drawer) ───────────────────────────── */}
        {panel === 'model-router' && (<div className="w-[380px] flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-black/50 backdrop-blur-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-white/80">Model Router</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ModelRouterPanel />
            </div>
          </div>)}

        {/* ── Enterprise Dashboard panel (fixed drawer) ──────────────────────── */}
        {panel === 'enterprise' && (<div className="w-[480px] flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-black/50 backdrop-blur-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-white/80">Enterprise Dashboard</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <EnterpriseDashboard />
            </div>
          </div>)}

        {/* ── Plugin Sandbox panel (fixed drawer) ────────────────────────────── */}
        {panel === 'plugin-sandbox' && (<div className="w-[400px] flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-black/50 backdrop-blur-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-white/80">Plugin Sandbox</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <PluginSandboxPanel />
            </div>
          </div>)}

        {/* ── Agent Network panel (fixed drawer) ────────────────────────────── */}
        {panel === 'agent-network' && (<div className="w-[400px] flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-black/50 backdrop-blur-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-white/80">Agent Network</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AgentNetworkPanel />
            </div>
          </div>)}

        {/* ── I18n Settings panel (fixed drawer) ────────────────────────────── */}
        {panel === 'i18n' && (<div className="w-[400px] flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-black/50 backdrop-blur-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-white/80">Language Settings</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <I18nSettingsPanel />
            </div>
          </div>)}

        {/* ── Git panel (slide-in drawer) ─────────────────────────────────── */}
        <GitPanel visible={gitPanelOpen} onClose={() => setGitPanelOpen(false)}/>
        </div>{/* end executive layout (content row) */}

        {/* ── Terminal panel (bottom) ─────────────────────────────────────── */}
        <TerminalPanel visible={terminalOpen} onToggle={() => setTerminalOpen(v => !v)}/>

        {/* Status bar */}
        <StatusBar status={oc.status} wsStatus={oc.wsStatus} wsUrl={oc.wsUrl} log={oc.log}/>
      </div>{/* end right column */}

      {/* ── Scheduled tasks modal ─────────────────────────────────────────── */}
      {panel === 'scheduled' && <ScheduledTasks onClose={() => setPanel('none')}/>}

      {/* ── Computer Use panel ─────────────────────────────────────────────── */}
      {panel === 'computer-use' && (<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[480px] h-[600px] bg-[#1a1a2e] rounded-2xl border border-white/[0.06] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-white/80">Computer Use</span>
              <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white/60 text-lg leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ComputerUsePanel />
            </div>
          </div>
        </div>)}

      {/* ── Command palette ───────────────────────────────────────────────── */}
      {modal === 'commandPalette' && (<CommandPalette sessions={oc.sessions} searchSessions={oc.searchSessions} onClose={() => setModal('none')} onSelectSession={(id) => { oc.selectSession(id); setModal('none'); }} onNewChat={() => { oc.createSession(); setModal('none'); }} onOpenSettings={() => { setPanel('settings'); setModal('none'); }} onOpenScheduled={() => { setPanel('scheduled'); setModal('none'); }} onOpenPrompts={() => setModal('prompts')} onOpenExport={() => setModal('export')} onStartVoice={() => setModal('voice')}/>)}

      {/* ── Prompt library ───────────────────────────────────────────────── */}
      {modal === 'prompts' && (<PromptLibrary onClose={() => setModal('none')} onInsert={(text) => { handleInsertText(text); }}/>)}

      {/* ── Export modal ─────────────────────────────────────────────────── */}
      {modal === 'export' && oc.activeSession && (<ExportModal session={oc.activeSession} onClose={() => setModal('none')}/>)}

      {/* ── Voice input ──────────────────────────────────────────────────── */}
      {modal === 'voice' && (<VoiceInput onTranscript={(text) => { handleInsertText(text); }} onClose={() => setModal('none')}/>)}

      {/* ── Create project modal ─────────────────────────────────────────── */}
      {modal === 'createProject' && (<CreateProjectModal onClose={() => setModal('none')} onCreate={handleCreateProject}/>)}

      {/* ── Model comparison ────────────────────────────────────────────── */}
      {modal === 'modelCompare' && (<ModelComparison onClose={() => setModal('none')} onSelectResponse={(_modelId, content) => {
                handleSend(content);
                setModal('none');
            }}/>)}

      {/* ── MCP Browser ─────────────────────────────────────────────────── */}
      {modal === 'mcpBrowser' && (<MCPBrowser onClose={() => setModal('none')}/>)}
    </div>
    </ActionQueueProvider>);
};
// ── Action confirmation overlay (rendered inside ActionQueueProvider) ────────
const ActionConfirmationOverlay = () => {
    const { pendingAction, approve, deny, alwaysAllow } = useActionQueue();
    if (!pendingAction)
        return null;
    return (<ActionConfirmation action={pendingAction} onApprove={() => approve(pendingAction.id)} onDeny={() => deny(pendingAction.id)} onAlwaysAllow={() => {
            alwaysAllow(pendingAction.type);
            approve(pendingAction.id);
        }}/>);
};
// ── Session item ───────────────────────────────────────────────────────────────
const SessionItem = ({ session, active, onSelect, onPin, onDelete }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const preview = session.messages[session.messages.length - 1]?.content?.slice(0, 45) ?? '';
    return (<div className="relative group">
      <button onClick={onSelect} className={`w-full text-left px-2.5 py-2 rounded-xl transition-all ${active ? 'bg-white/[0.09] text-white' : 'hover:bg-white/[0.04] text-white/50 hover:text-white/75'}`}>
        <div className="flex items-center gap-1.5">
          {session.color && session.color !== 'none' && (<span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${COLOR_DOT[session.color]}`}/>)}
          {session.pinned && <Pin size={9} className="text-amber-400/70 flex-shrink-0"/>}
          {session.incognito && <Moon size={9} className="text-gold-400 flex-shrink-0"/>}
          <p className="text-[11px] font-medium truncate flex-1">{session.title || 'New chat'}</p>
        </div>
        {preview && <p className="text-[10px] text-white/25 truncate mt-0.5 pl-0.5">{preview}</p>}
      </button>

      {/* Context menu button */}
      <button onClick={(e) => { e.stopPropagation(); setMenuOpen(m => !m); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-lg opacity-0 group-hover:opacity-100 text-white/25 hover:text-white/60 hover:bg-white/[0.07] transition-all">
        <MoreHorizontal size={11}/>
      </button>

      {menuOpen && (<>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)}/>
          <div className="absolute right-0 top-full mt-1 z-40 bg-[#161411] border border-white/10 rounded-xl shadow-xl py-1 min-w-[140px]">
            <ContextMenuItem icon={<Pin size={11}/>} label={session.pinned ? 'Unpin' : 'Pin'} onClick={() => { onPin(); setMenuOpen(false); }}/>
            <ContextMenuItem icon={<GitBranch size={11}/>} label="Branch here" onClick={() => { setMenuOpen(false); }}/>
            <div className="h-px bg-white/[0.06] my-1"/>
            <ContextMenuItem icon={<Trash2 size={11}/>} label="Delete" onClick={() => { onDelete(); setMenuOpen(false); }} danger/>
          </div>
        </>)}
    </div>);
};
const ContextMenuItem = ({ icon, label, onClick, danger }) => (<button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] transition-colors ${danger ? 'text-blush-400/80 hover:bg-blush-500/10 hover:text-blush-400' : 'text-white/55 hover:bg-white/[0.06] hover:text-white/80'}`}>
    <span className="flex-shrink-0">{icon}</span>
    {label}
  </button>);
// ── Welcome screen — clean, Claude-inspired ──────────────────────────────────
const WelcomeScreen = ({ onSuggestion }) => (<div className="flex flex-col items-center justify-center h-full gap-10 px-6">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-terra-400/20 to-terra-600/15 border border-terra-400/15 flex items-center justify-center">
        <Cpu size={22} className="text-terra-300/80"/>
      </div>
      <h2 className="text-lg font-medium text-white/70">What can I help with?</h2>
    </div>

    <div className="grid grid-cols-2 gap-2 max-w-[440px] w-full">
      {SUGGESTIONS.map(s => (<button key={s.text} onClick={() => onSuggestion(s.text)} className="flex items-center gap-2.5 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] hover:border-white/[0.08] rounded-xl px-4 py-3 text-[13px] text-white/35 hover:text-white/70 transition-all text-left">
          <span className="text-sm leading-none flex-shrink-0 opacity-40">{s.icon}</span>
          <span>{s.text}</span>
        </button>))}
    </div>

    <p className="text-[11px] text-white/[0.12]">Powered by OpenClaw · running locally</p>
  </div>);
// ── Theme helper ───────────────────────────────────────────────────────────────
function resolveAutoMode(systemDark) {
    // Time-of-day heuristic: dark between 8pm and 7am
    const hour = new Date().getHours();
    const nightTime = hour >= 20 || hour < 7;
    // Use dark if either the system says dark or it's nighttime
    return (systemDark || nightTime) ? 'dark' : 'light';
}
function applyThemeClass(mode, fontSize) {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-dim', 'theme-light', 'text-sm', 'text-base', 'text-lg');
    // 'auto' should never reach here directly — it's resolved upstream — but guard just in case
    const resolved = mode === 'auto' ? 'dark' : mode;
    root.classList.add(`theme-${resolved}`);
    root.style.fontSize = fontSize === 'sm' ? '13px' : fontSize === 'lg' ? '16px' : '14px';
}
export default App;
