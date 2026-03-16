/**
 * Settings Panel — Providers · MCP servers · Appearance · About
 */
import React, { useEffect, useState, useCallback } from 'react'
import { X, Plus, Trash2, ExternalLink, Palette, Check, Key, Loader2, Shield, ChevronDown, HardDrive, Download, Server, Sparkles, Wifi, WifiOff, Radio, RotateCw, ShieldCheck, AlertTriangle, Activity, Eye, Zap, Clock, Sun, Moon, Monitor, Cpu } from 'lucide-react'
import { PluginManager } from './PluginManager'
import { SkillsMarketplace } from './SkillsMarketplace'
import { ChannelSetup } from './ChannelSetup'
import type { McpServerConfig, ThemeConfig } from '../../preload/index'

// ── Wallpaper assets (Vite resolves these as URL strings) ───────────────────
import wpHerringbone from '../assets/wallpaper-herringbone.png'
import wpChevron     from '../assets/wallpaper-chevron.png'
import wpDiamond     from '../assets/wallpaper-diamond.png'
import wpMarble      from '../assets/wallpaper-marble.png'
import wpSilk        from '../assets/wallpaper-silk.png'
import wpLeather     from '../assets/wallpaper-leather.png'
import wpLinen       from '../assets/wallpaper-linen.png'
import wpConcrete    from '../assets/wallpaper-concrete.png'
import wpHexagon     from '../assets/wallpaper-hexagon.png'
import wpWaves       from '../assets/wallpaper-waves.png'
import wpCircuit     from '../assets/wallpaper-circuit.png'
import wpScales      from '../assets/wallpaper-scales.png'

const WALLPAPER_OPTIONS: Array<{ id: ThemeConfig['wallpaper']; label: string; thumb: string | null }> = [
  { id: 'none',        label: 'None',        thumb: null },
  { id: 'herringbone', label: 'Herringbone',  thumb: wpHerringbone },
  { id: 'chevron',     label: 'Chevron',      thumb: wpChevron },
  { id: 'diamond',     label: 'Diamond',      thumb: wpDiamond },
  { id: 'marble',      label: 'Marble',       thumb: wpMarble },
  { id: 'silk',        label: 'Silk',         thumb: wpSilk },
  { id: 'leather',     label: 'Leather',      thumb: wpLeather },
  { id: 'linen',       label: 'Linen',        thumb: wpLinen },
  { id: 'concrete',    label: 'Concrete',     thumb: wpConcrete },
  { id: 'hexagon',     label: 'Hexagon',      thumb: wpHexagon },
  { id: 'waves',       label: 'Waves',        thumb: wpWaves },
  { id: 'circuit',     label: 'Circuit',      thumb: wpCircuit },
  { id: 'scales',      label: 'Scales',       thumb: wpScales },
]

interface Props {
  onClose: () => void
}

type Tab = 'providers' | 'channels' | 'gateway' | 'mcp' | 'ollama' | 'plugins' | 'skills' | 'appearance' | 'guard' | 'router' | 'memory' | 'about'

// ── Provider types (mirroring preload) ──────────────────────────────────────
interface ProviderState {
  id: string; enabled: boolean; hasKey: boolean; activeModel?: string
}
interface ProviderDef {
  id: string; label: string; icon: string; oauthUrl?: string; apiKeyPrefix?: string
  models: Array<{ id: string; label: string; contextWindow?: number }>
}

const ACCENT_COLORS: Array<{ id: ThemeConfig['accent']; label: string; tw: string }> = [
  { id: 'indigo',  label: 'Terracotta', tw: 'bg-terra-400' },
  { id: 'violet',  label: 'Gold',       tw: 'bg-gold-400' },
  { id: 'blue',    label: 'Sage',       tw: 'bg-sage-400' },
  { id: 'emerald', label: 'Copper',     tw: 'bg-terra-700' },
  { id: 'rose',    label: 'Blush',      tw: 'bg-blush-400' },
]

export const SettingsPanel: React.FC<Props> = ({ onClose }) => {
  const [servers, setServers]     = useState<Record<string, McpServerConfig>>({})
  const [appVersion, setAppVersion] = useState('')
  const [tab, setTab]             = useState<Tab>('providers')
  const [newName, setNewName]     = useState('')
  const [newCmd, setNewCmd]       = useState('')
  const [newArgs, setNewArgs]     = useState('')
  const [theme, setThemeState]    = useState<ThemeConfig>({ mode: 'dark', accent: 'indigo', fontSize: 'md', wallpaper: 'herringbone' })

  // ── Provider state ────────────────────────────────────────────────────────
  const [providerStates, setProviderStates]  = useState<ProviderState[]>([])
  const [providerCatalog, setProviderCatalog] = useState<ProviderDef[]>([])
  const [keyInputs, setKeyInputs]            = useState<Record<string, string>>({})
  const [savingKey, setSavingKey]             = useState<string | null>(null)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [oauthLoading, setOauthLoading]         = useState<string | null>(null)
  const [deviceCode, setDeviceCode]             = useState<{ code: string; uri: string } | null>(null)
  const [oauthAvail, setOauthAvail]             = useState<Record<string, boolean>>({})
  const [providerErrors, setProviderErrors]     = useState<Record<string, string>>({})

  // ── Channel state ────────────────────────────────────────────────────────
  const [channelStatus, setChannelStatus] = useState<Record<string, { enabled: boolean; connected: boolean; error?: string }> | null>(null)

  // ── Gateway state ─────────────────────────────────────────────────────────
  const [gwStatus, setGwStatus]     = useState<string>('idle')
  const [gwLogs, setGwLogs]         = useState<string[]>([])
  const [gwRestarting, setGwRestarting] = useState(false)
  const [gwPing, setGwPing]         = useState<{ wsProxy: boolean; gateway: string; providers: Array<{ id: string; ready: boolean }> } | null>(null)
  const [gwPinging, setGwPinging]   = useState(false)

  // ── Ollama state ──────────────────────────────────────────────────────────
  const [ollamaOnline, setOllamaOnline] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<Array<{ id: string; name: string; size: number; modifiedAt: string; parameterSize?: string; quantization?: string }>>([])
  const [pullingModel, setPullingModel] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null)
  const [pullModelName, setPullModelName] = useState('')
  const [syncing, setSyncing]             = useState(false)
  const [syncResult, setSyncResult]       = useState<{ success: boolean; modelCount: number; error?: string } | null>(null)

  // ── NyraGuard state ───────────────────────────────────────────────────────
  const [guardEnabled, setGuardEnabled]       = useState(false)
  const [guardApiKey, setGuardApiKey]         = useState('')
  const [guardHasKey, setGuardHasKey]         = useState(false)
  const [guardSavingKey, setGuardSavingKey]   = useState(false)
  const [guardModel, setGuardModel]           = useState('anthropic/claude-3.5-sonnet')
  const [guardAutoScan, setGuardAutoScan]     = useState(false)
  const [guardInterval, setGuardInterval]     = useState(30)
  const [guardScanning, setGuardScanning]     = useState<string | null>(null) // 'security' | 'stability' | 'threat' | 'full'
  const [guardResults, setGuardResults]       = useState<Array<{ type: string; severity: string; message: string; details?: string }>>([])
  const [guardLogs, setGuardLogs]             = useState<Array<{ ts: number; level: string; message: string }>>([])
  const [guardStatus, setGuardStatus]         = useState<{ enabled: boolean; scanning: boolean; lastScan: number | null; issueCount: number }>({ enabled: false, scanning: false, lastScan: null, issueCount: 0 })
  const [guardDiagnosing, setGuardDiagnosing] = useState(false)
  const [guardDiagnosis, setGuardDiagnosis]   = useState<string | null>(null)

  useEffect(() => {
    window.nyra.mcp.list().then(setServers)
    window.nyra.app.version().then(setAppVersion)
    window.nyra.theme.get().then(setThemeState)
    // Load providers
    window.nyra.providers.list().then(setProviderStates)
    window.nyra.providers.catalog().then(setProviderCatalog)
    window.nyra.providers.oauthAvailability?.().then(setOauthAvail).catch(() => {})
    // Load channel status
    window.nyra.openclaw?.channelsStatus?.().then((s: any) => setChannelStatus(s)).catch(() => {})

    // Gateway status — collect scoped cleanup functions
    const cleanups: Array<() => void> = []

    window.nyra.openclaw.getStatus().then((s: string) => setGwStatus(s))
    cleanups.push(window.nyra.openclaw.onStatusChange((s: string) => {
      setGwStatus(s)
      if (s === 'running') setGwRestarting(false)
    }))
    cleanups.push(window.nyra.openclaw.onLog?.((line: string) => {
      setGwLogs(prev => [...prev.slice(-80), line])
    }))
    cleanups.push(window.nyra.openclaw.onError?.((msg: string) => {
      setGwLogs(prev => [...prev.slice(-80), `[ERROR] ${msg}`])
      setGwRestarting(false)
    }))
    cleanups.push(window.nyra.openclaw.onReady(() => {
      setGwStatus('running')
      setGwRestarting(false)
    }))
    cleanups.push(window.nyra.openclaw.onRestarting?.((info: { attempt: number; delay: number }) => {
      setGwLogs(prev => [...prev.slice(-80), `[RESTART] Attempt ${info.attempt} in ${info.delay}ms`])
    }))

    // Load Ollama status
    window.nyra.ollama.status().then(setOllamaOnline)
    window.nyra.ollama.models().then(setOllamaModels).catch(() => {})

    // Listen for pull progress
    window.nyra.ollama.onPullProgress((d) => {
      setPullProgress({ status: d.status, completed: d.completed, total: d.total })
      if (d.status === 'success') {
        setPullingModel(null)
        setPullProgress(null)
        window.nyra.ollama.models().then(setOllamaModels).catch(() => {})
      }
    })

    // Listen for OAuth completion (from callback server)
    cleanups.push(window.nyra.providers.onOAuthComplete(async () => {
      setOauthLoading(null)
      setDeviceCode(null)
      setProviderStates(await window.nyra.providers.list())
    }))
    cleanups.push(window.nyra.providers.onDeviceCode((d) => {
      setDeviceCode({ code: d.userCode, uri: d.verificationUri })
    }))
    // ── NyraGuard init ──────────────────────────────────────────────────
    window.nyra.guard?.getConfig?.().then((cfg: any) => {
      if (cfg) {
        setGuardEnabled(cfg.enabled ?? false)
        setGuardModel(cfg.model ?? 'anthropic/claude-3.5-sonnet')
        setGuardAutoScan(cfg.autoScanEnabled ?? false)
        setGuardInterval(cfg.autoScanIntervalMinutes ?? 30)
      }
    }).catch(() => {})
    window.nyra.guard?.status?.().then((s: any) => { if (s?.hasApiKey) setGuardHasKey(s.hasApiKey); if (s) setGuardStatus(s) }).catch(() => {})
    window.nyra.guard?.getLog?.().then((logs: any[]) => { if (logs) setGuardLogs(logs.slice(-50)) }).catch(() => {})

    // Guard event listeners
    const guardCleanups: Array<() => void> = []
    if (window.nyra.guard?.onScanComplete) {
      guardCleanups.push(window.nyra.guard.onScanComplete((result: any) => {
        setGuardScanning(null)
        setGuardResults(result.issues ?? [])
        setGuardStatus(prev => ({ ...prev, lastScan: Date.now(), issueCount: result.issues?.length ?? 0 }))
      }))
    }
    if (window.nyra.guard?.onIssueDetected) {
      guardCleanups.push(window.nyra.guard.onIssueDetected((issue: any) => {
        setGuardResults(prev => [...prev, issue])
      }))
    }
    if (window.nyra.guard?.onLog) {
      guardCleanups.push(window.nyra.guard.onLog((log: any) => {
        setGuardLogs(prev => [...prev.slice(-49), log])
      }))
    }

    return () => {
      // Scoped cleanup — only removes THIS component's listeners, not other components'
      cleanups.forEach(fn => fn?.())
      guardCleanups.forEach(fn => fn?.())
      window.nyra.ollama.removePullListener()
    }
  }, [])

  const applyTheme = async (patch: Partial<ThemeConfig>) => {
    const next = { ...theme, ...patch }
    setThemeState(next)
    await window.nyra.theme.set(next)
  }

  // ── NyraGuard handlers ──────────────────────────────────────────────────
  const guardSaveApiKey = useCallback(async () => {
    if (!guardApiKey.trim()) return
    setGuardSavingKey(true)
    try {
      await window.nyra.guard?.saveKey?.(guardApiKey.trim())
      setGuardHasKey(true)
      setGuardApiKey('')
    } catch (e) { console.error('Guard API key save failed:', e) }
    setGuardSavingKey(false)
  }, [guardApiKey])

  const guardRunScan = useCallback(async (type: 'security' | 'stability' | 'threat' | 'full') => {
    setGuardScanning(type)
    setGuardResults([])
    try {
      let result: any = []
      if (type === 'security') result = await window.nyra.guard?.scanSecurity?.()
      else if (type === 'stability') result = await window.nyra.guard?.scanStability?.()
      else if (type === 'threat') result = await window.nyra.guard?.scanThreat?.()
      else if (type === 'full') result = await window.nyra.guard?.scanAll?.()
      if (result) {
        setGuardResults(result)
        setGuardStatus(prev => ({ ...prev, lastScan: Date.now(), activeIssues: result?.length ?? 0 }))
      }
    } catch (e) { console.error('Guard scan failed:', e) }
    setGuardScanning(null)
  }, [])

  const guardToggleEnabled = useCallback(async (enabled: boolean) => {
    setGuardEnabled(enabled)
    await window.nyra.guard?.setConfig?.({ enabled })
  }, [])

  const guardToggleAutoScan = useCallback(async (enabled: boolean) => {
    setGuardAutoScan(enabled)
    if (enabled) {
      await window.nyra.guard?.startAuto?.()
    } else {
      await window.nyra.guard?.stopAuto?.()
    }
    await window.nyra.guard?.setConfig?.({ autoScan: enabled, scanInterval: guardInterval })
  }, [guardInterval])

  const guardRunDiagnosis = useCallback(async () => {
    setGuardDiagnosing(true)
    setGuardDiagnosis(null)
    try {
      const result = await window.nyra.guard?.diagnose?.('Analyze the current state of the app for any errors, performance issues, or security concerns. Provide actionable recommendations.')
      setGuardDiagnosis(result?.diagnosis ?? 'No diagnosis available — check that the API key is set.')
    } catch (e) {
      setGuardDiagnosis('Diagnosis failed — ensure your OpenRouter API key is valid.')
    }
    setGuardDiagnosing(false)
  }, [])

  // ── Gateway ping (conversation readiness) ─────────────────────────────────
  const runGwPing = useCallback(async () => {
    setGwPinging(true)
    try {
      const result = await window.nyra.openclaw.ping()
      setGwPing(result)
    } catch {
      setGwPing({ wsProxy: false, gateway: 'error', providers: [] })
    }
    setGwPinging(false)
  }, [])

  // Auto-ping when switching to gateway tab
  useEffect(() => {
    if (tab === 'gateway') { runGwPing() }
  }, [tab, runGwPing])

  const addServer = async () => {
    if (!newName.trim() || !newCmd.trim()) return
    const server: McpServerConfig = { command: newCmd.trim(), args: newArgs.trim() ? newArgs.split(' ') : [] }
    await window.nyra.mcp.add(newName.trim(), server)
    setServers(await window.nyra.mcp.list())
    setNewName(''); setNewCmd(''); setNewArgs('')
  }

  const removeServer = async (name: string) => {
    await window.nyra.mcp.remove(name)
    setServers(await window.nyra.mcp.list())
  }

  return (
    <div className="flex flex-col h-full bg-black/50 backdrop-blur-md border-l border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <h2 className="text-white font-semibold text-sm">Settings</h2>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/[0.06]">
          <X size={15} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 pt-3 flex-wrap">
        {(['providers', 'channels', 'gateway', 'mcp', 'ollama', 'plugins', 'skills', 'router', 'memory', 'appearance', 'guard', 'about'] as Tab[]).map(t => {
          const labels: Record<Tab, string> = {
            providers: 'Providers', channels: 'Channels', gateway: 'Gateway', mcp: 'MCP Servers', ollama: 'Local LLMs',
            plugins: 'Plugins', skills: 'Skills', router: 'Router', memory: 'Memory',
            appearance: 'Appearance', guard: 'NyraGuard', about: 'About',
          }
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                tab === t ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/70'
              }`}
            >
              {labels[t]}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">

        {/* ── Providers Tab ─────────────────────────────────────────────────── */}
        {tab === 'providers' && (
          <div className="space-y-4">
            <p className="text-xs text-white/35 leading-relaxed">
              Connect AI providers so OpenClaw can route your messages. Add an API key or sign in via OAuth.
            </p>

            {providerCatalog.map(def => {
              const state = providerStates.find(s => s.id === def.id)
              const isExpanded = expandedProvider === def.id
              const isConnected = state?.hasKey && state?.enabled

              return (
                <div key={def.id} className={`border rounded-xl overflow-hidden transition-all ${
                  isConnected
                    ? 'border-sage-500/25 bg-sage-500/[0.03]'
                    : 'border-white/[0.07] bg-white/[0.02]'
                }`}>
                  {/* Provider header */}
                  <button
                    onClick={() => setExpandedProvider(isExpanded ? null : def.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="text-lg">{def.icon}</span>
                    <div className="flex-1 text-left">
                      <p className="text-sm text-white/80 font-medium">{def.label}</p>
                      <p className="text-[10px] text-white/30">
                        {isConnected
                          ? `✓ Connected · ${state?.activeModel ?? def.models[0]?.label}`
                          : 'Not configured'}
                      </p>
                    </div>
                    {isConnected && (
                      <span className="w-2 h-2 rounded-full bg-sage-400 flex-shrink-0" />
                    )}
                    <ChevronDown size={13} className={`text-white/25 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expanded section */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/[0.05]">
                      {/* OAuth sign-in button — shown for providers with OAuth support */}
                      {oauthAvail[def.id] && !isConnected && (
                        <div className="space-y-2">
                          <button
                            onClick={async () => {
                              setOauthLoading(def.id)
                              setProviderErrors(prev => { const n = { ...prev }; delete n[def.id]; return n })
                              try {
                                let result: { success: boolean; error?: string } | undefined
                                if (def.id === 'copilot') {
                                  result = await window.nyra.providers.githubDeviceFlow()
                                } else {
                                  result = await window.nyra.providers.startOAuth(def.id)
                                }
                                setOauthLoading(null)
                                setProviderStates(await window.nyra.providers.list())
                                if (result && !result.success && result.error) {
                                  setProviderErrors(prev => ({ ...prev, [def.id]: result!.error! }))
                                }
                              } catch (err) {
                                setOauthLoading(null)
                                setProviderErrors(prev => ({ ...prev, [def.id]: String(err) }))
                              }
                            }}
                            disabled={oauthLoading === def.id}
                            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-white text-xs rounded-xl transition-colors font-medium ${
                              oauthLoading === def.id ? 'bg-warm-800/40' :
                              def.id === 'openai' ? 'bg-sage-600/80 hover:bg-sage-500' :
                              def.id === 'gemini' ? 'bg-gold-600/80 hover:bg-gold-500' :
                              'bg-warm-800/80 hover:bg-warm-700'
                            }`}
                          >
                            {oauthLoading === def.id
                              ? <><Loader2 size={12} className="animate-spin" /> Waiting for sign-in...</>
                              : <><ExternalLink size={12} /> {
                                def.id === 'openai' ? 'Sign in with ChatGPT' :
                                def.id === 'gemini' ? 'Sign in with Google' :
                                def.id === 'copilot' ? 'Sign in with GitHub' :
                                `Sign in with ${def.label}`
                              }</>}
                          </button>
                          {/* GitHub device code display */}
                          {deviceCode && oauthLoading === 'copilot' && (
                            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-center space-y-1">
                              <p className="text-[10px] text-white/40">Enter this code on GitHub:</p>
                              <p className="text-lg font-mono font-bold text-white tracking-widest">{deviceCode.code}</p>
                            </div>
                          )}
                          {/* OAuth error display */}
                          {providerErrors[def.id] && (
                            <div className="bg-blush-400/10 border border-blush-400/20 rounded-xl px-3 py-2 text-[11px] text-blush-300">
                              <span className="font-medium">Sign-in failed:</span> {providerErrors[def.id]}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-px bg-white/[0.06]" />
                            <span className="text-[10px] text-white/20">or paste API key</span>
                            <div className="flex-1 h-px bg-white/[0.06]" />
                          </div>
                        </div>
                      )}
                      {/* "Get API key" link for providers without OAuth (Anthropic) */}
                      {!oauthAvail[def.id] && def.oauthUrl && !isConnected && (
                        <button
                          onClick={() => window.nyra.providers.openOauth(def.oauthUrl!)}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-white text-xs rounded-xl transition-colors font-medium bg-terra-600/80 hover:bg-terra-500"
                        >
                          <ExternalLink size={12} /> Get API key from {def.label.split(' / ')[1] ?? def.label}
                        </button>
                      )}

                      {/* API key input */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-white/35 uppercase tracking-widest flex items-center gap-1.5">
                          <Key size={9} /> API Key
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={keyInputs[def.id] ?? ''}
                            onChange={e => setKeyInputs(prev => ({ ...prev, [def.id]: e.target.value }))}
                            placeholder={def.apiKeyPrefix ? `${def.apiKeyPrefix}...` : 'Paste your API key'}
                            className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 placeholder-white/20 outline-none focus:border-terra-400/50 font-mono"
                          />
                          <button
                            onClick={async () => {
                              const key = keyInputs[def.id]?.trim()
                              if (!key) return
                              setSavingKey(def.id)
                              setProviderErrors(prev => { const n = { ...prev }; delete n[def.id]; return n })
                              const ok = await window.nyra.providers.saveKey(def.id, key)
                              if (ok) {
                                setKeyInputs(prev => ({ ...prev, [def.id]: '' }))
                                setProviderStates(await window.nyra.providers.list())
                              }
                              setSavingKey(null)
                            }}
                            disabled={!keyInputs[def.id]?.trim() || savingKey === def.id}
                            className="px-3 py-2 bg-sage-600/80 hover:bg-sage-500 disabled:bg-white/[0.05] disabled:text-white/20 text-white text-xs rounded-lg transition-colors font-medium flex items-center gap-1.5"
                          >
                            {savingKey === def.id ? <Loader2 size={11} className="animate-spin" /> : <Shield size={11} />}
                            Save
                          </button>
                        </div>
                        {isConnected && (
                          <p className="text-[10px] text-sage-400/60 flex items-center gap-1">
                            <Check size={9} /> Key saved (encrypted via macOS Keychain)
                          </p>
                        )}
                      </div>

                      {/* Model selector */}
                      {def.models.length > 1 && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-white/35 uppercase tracking-widest">Model</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {def.models.map(m => (
                              <button
                                key={m.id}
                                onClick={async () => {
                                  await window.nyra.providers.setModel(def.id, m.id)
                                  setProviderStates(await window.nyra.providers.list())
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] border transition-all text-left ${
                                  (state?.activeModel ?? def.models[0]?.id) === m.id
                                    ? 'border-terra-400/50 bg-terra-400/10 text-white'
                                    : 'border-white/[0.06] text-white/40 hover:border-white/15 hover:text-white/60'
                                }`}
                              >
                                {m.label}
                                {m.contextWindow && (
                                  <span className="text-[9px] text-white/20 ml-1">{Math.round(m.contextWindow / 1000)}K</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Disconnect */}
                      {isConnected && (
                        <button
                          onClick={async () => {
                            await window.nyra.providers.removeKey(def.id)
                            setProviderStates(await window.nyra.providers.list())
                          }}
                          className="flex items-center gap-1.5 text-blush-400/60 hover:text-blush-400 text-[11px] transition-colors pt-1"
                        >
                          <Trash2 size={10} /> Remove API key
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            <div className="pt-2 border-t border-white/[0.06]">
              <p className="text-[10px] text-white/20 leading-relaxed">
                Credentials are encrypted via macOS Keychain and synced to OpenClaw's auth-profiles for native AI routing. Changes apply instantly — no restart needed.
              </p>
            </div>
          </div>
        )}

        {/* ── Channels Tab ───────────────────────────────────────────────── */}
        {tab === 'channels' && (
          <div className="space-y-4">
            <p className="text-xs text-white/35 leading-relaxed">
              Connect messaging platforms so Nyra can send and receive messages across Telegram, Discord, Slack, WhatsApp, and more.
            </p>
            <ChannelSetup
              channelStatus={channelStatus}
              onConfigureChannel={async (channelId, config) => {
                try {
                  await window.nyra.openclaw?.configPatch?.(JSON.stringify({ channels: { [channelId]: config } }))
                  const s = await window.nyra.openclaw?.channelsStatus?.()
                  if (s) setChannelStatus(s as any)
                } catch (err) {
                  console.error(`[Settings] Channel configure failed for ${channelId}:`, err)
                }
              }}
              onToggleChannel={async (channelId, enabled) => {
                try {
                  await window.nyra.openclaw?.configPatch?.(JSON.stringify({ channels: { [channelId]: { enabled } } }))
                  const s = await window.nyra.openclaw?.channelsStatus?.()
                  if (s) setChannelStatus(s as any)
                } catch (err) {
                  console.error(`[Settings] Channel toggle failed for ${channelId}:`, err)
                }
              }}
            />
          </div>
        )}

        {/* ── Gateway Tab ──────────────────────────────────────────────────── */}
        {tab === 'gateway' && (
          <div className="space-y-4">

            {/* ── Conversation Readiness Card ──────────────────────────────── */}
            {(() => {
              const proxyOk = gwPing?.wsProxy ?? false
              const gwRunning = gwStatus === 'running'
              const readyProviders = gwPing?.providers.filter(p => p.ready) ?? []
              const mt = gwPing?.modelTest
              const modelOk = mt?.tested ? mt.ok : true // assume ok if not tested
              const canConverse = proxyOk && gwRunning && readyProviders.length > 0 && modelOk
              return (
                <div className={`border rounded-xl px-4 py-3.5 transition-all ${
                  canConverse
                    ? 'border-sage-500/30 bg-sage-500/[0.06]'
                    : gwPinging
                      ? 'border-gold-400/20 bg-gold-400/[0.04]'
                      : 'border-blush-400/20 bg-blush-400/[0.04]'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      gwPinging ? 'bg-gold-400 animate-pulse' :
                      canConverse ? 'bg-sage-400 shadow-[0_0_8px_rgba(125,184,134,0.4)]' :
                      'bg-blush-400'
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm text-white font-semibold">
                        {gwPinging ? 'Testing connection...' :
                         canConverse ? 'Ready to Converse' :
                         'Not Ready'}
                      </p>
                      <p className="text-[10px] text-white/40 mt-0.5">
                        {gwPinging ? 'Checking gateway, proxy, providers, and model...' :
                         canConverse
                           ? `Gateway connected · ${readyProviders.length} provider${readyProviders.length > 1 ? 's' : ''} · model verified`
                           : !gwRunning ? 'Gateway is not running' :
                             !proxyOk ? 'WebSocket proxy unreachable' :
                             readyProviders.length === 0 ? 'No providers have API keys configured' :
                             mt?.tested && !mt.ok ? `Model validation failed` :
                             'Not ready'}
                      </p>
                    </div>
                    <button
                      onClick={runGwPing}
                      disabled={gwPinging}
                      className="px-3 py-1.5 text-[10px] font-medium rounded-lg transition-colors bg-white/[0.06] hover:bg-white/[0.12] text-white/60 hover:text-white disabled:text-white/20"
                    >
                      {gwPinging ? <Loader2 size={11} className="animate-spin" /> : <Activity size={11} />}
                    </button>
                  </div>
                  {/* Readiness checklist */}
                  {gwPing && !gwPinging && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          {gwRunning
                            ? <Check size={10} className="text-sage-400" />
                            : <AlertTriangle size={10} className="text-blush-400" />}
                          <span className={gwRunning ? 'text-white/60' : 'text-blush-300/70'}>Gateway Process</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {proxyOk
                            ? <Check size={10} className="text-sage-400" />
                            : <AlertTriangle size={10} className="text-blush-400" />}
                          <span className={proxyOk ? 'text-white/60' : 'text-blush-300/70'}>WebSocket Proxy</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {readyProviders.length > 0
                            ? <Check size={10} className="text-sage-400" />
                            : <AlertTriangle size={10} className="text-blush-400" />}
                          <span className={readyProviders.length > 0 ? 'text-white/60' : 'text-blush-300/70'}>
                            {readyProviders.length > 0 ? `${readyProviders.length} Provider${readyProviders.length > 1 ? 's' : ''}` : 'No Providers'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {mt?.tested
                            ? mt.ok
                              ? <Check size={10} className="text-sage-400" />
                              : <AlertTriangle size={10} className="text-blush-400" />
                            : <span className="w-2.5 h-2.5 rounded-full bg-white/15 inline-block" />}
                          <span className={mt?.tested ? (mt.ok ? 'text-white/60' : 'text-blush-300/70') : 'text-white/30'}>
                            {mt?.tested ? (mt.ok ? 'Model Verified' : 'Model Failed') : 'Model (skip)'}
                          </span>
                        </div>
                      </div>
                      {/* Model error detail */}
                      {mt?.tested && !mt.ok && mt.error && (
                        <div className="bg-blush-400/10 border border-blush-400/20 rounded-lg px-3 py-2 text-[10px] text-blush-300 leading-relaxed">
                          <span className="font-semibold">Model error:</span>{' '}
                          {mt.error}
                          {mt.model && (
                            <span className="block mt-1 text-white/30 font-mono">{mt.model}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Process status card */}
            <div className="flex items-center gap-3 border border-white/[0.07] bg-white/[0.02] rounded-xl px-4 py-3">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                gwStatus === 'running' ? 'bg-sage-400 animate-pulse' :
                gwStatus === 'starting' || gwStatus === 'checking' || gwStatus === 'installing' ? 'bg-gold-400 animate-pulse' :
                gwStatus === 'error' ? 'bg-blush-400' :
                'bg-white/20'
              }`} />
              <div className="flex-1">
                <p className="text-sm text-white font-medium flex items-center gap-2">
                  {gwStatus === 'running' && <><Wifi size={13} className="text-sage-400" /> Gateway Running</>}
                  {gwStatus === 'starting' && <><Radio size={13} className="text-gold-400" /> Starting Gateway...</>}
                  {gwStatus === 'checking' && <><Radio size={13} className="text-gold-400" /> Checking...</>}
                  {gwStatus === 'installing' && <><Download size={13} className="text-gold-400" /> Installing OpenClaw...</>}
                  {gwStatus === 'error' && <><WifiOff size={13} className="text-blush-300" /> Gateway Error</>}
                  {gwStatus === 'stopped' && <><WifiOff size={13} className="text-white/40" /> Gateway Stopped</>}
                  {gwStatus === 'idle' && <><WifiOff size={13} className="text-white/40" /> Not Started</>}
                </p>
                <p className="text-[10px] text-white/30 mt-0.5 font-mono">
                  ws://127.0.0.1:18789 → proxy :18790
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setGwRestarting(true)
                  setGwLogs(prev => [...prev.slice(-80), '[UI] Restarting gateway...'])
                  try {
                    await window.nyra.openclaw.restart()
                  } catch {
                    setGwRestarting(false)
                  }
                }}
                disabled={gwRestarting}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-white text-xs rounded-xl transition-colors font-medium bg-terra-600/80 hover:bg-terra-500 disabled:bg-white/[0.05] disabled:text-white/20"
              >
                {gwRestarting
                  ? <><Loader2 size={12} className="animate-spin" /> Restarting...</>
                  : <><RotateCw size={12} /> Restart Gateway</>}
              </button>
            </div>

            {/* Log viewer */}
            {gwLogs.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest">Gateway Log</p>
                  <button
                    onClick={() => setGwLogs([])}
                    className="text-[10px] text-white/25 hover:text-white/50 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="bg-black/40 border border-white/[0.06] rounded-xl p-3 max-h-48 overflow-y-auto scrollbar-thin font-mono text-[10px] leading-relaxed text-white/40 space-y-0.5">
                  {gwLogs.map((line, i) => (
                    <div key={i} className={
                      line.startsWith('[ERROR]')   ? 'text-blush-300/70' :
                      line.startsWith('[RESTART]') ? 'text-gold-400/70' :
                      line.startsWith('[UI]')      ? 'text-terra-300/70' :
                      ''
                    }>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="pt-2 border-t border-white/[0.06]">
              <p className="text-[10px] text-white/20 leading-relaxed">
                The OpenClaw gateway routes your messages to AI providers. It auto-starts when Nyra launches and auto-restarts on crash (up to 5 times).
              </p>
            </div>
          </div>
        )}

        {/* ── MCP Tab ─────────────────────────────────────────────────────── */}
        {tab === 'mcp' && (
          <div className="space-y-4">
            <p className="text-xs text-white/35 leading-relaxed">
              Connect external MCP servers to extend Nyra with filesystem, GitHub, Slack, Notion, and more.
            </p>

            <div className="space-y-2">
              {Object.entries(servers).map(([name, cfg]) => (
                <div key={name} className="flex items-center justify-between bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5">
                  <div>
                    <p className="text-white/80 text-sm font-medium">{name}</p>
                    <p className="text-white/25 text-xs font-mono">{cfg.command} {(cfg.args ?? []).join(' ')}</p>
                  </div>
                  <button onClick={() => removeServer(name)} className="text-white/20 hover:text-blush-400 transition-colors ml-3 p-1 rounded-lg hover:bg-blush-500/10">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {Object.keys(servers).length === 0 && (
                <p className="text-white/20 text-xs text-center py-4">No MCP servers configured</p>
              )}
            </div>

            <div className="border border-white/[0.08] rounded-xl p-4 space-y-3">
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest">Add Server</p>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (e.g. filesystem)"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/80 placeholder-white/20 outline-none focus:border-terra-400/50" />
              <input value={newCmd} onChange={e => setNewCmd(e.target.value)} placeholder="Command (e.g. npx)"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/80 placeholder-white/20 outline-none focus:border-terra-400/50 font-mono" />
              <input value={newArgs} onChange={e => setNewArgs(e.target.value)} placeholder="Args (space-separated)"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/80 placeholder-white/20 outline-none focus:border-terra-400/50 font-mono" />
              <button onClick={addServer} className="flex items-center gap-2 px-3 py-2 bg-terra-400 hover:bg-terra-500 text-white text-sm rounded-xl transition-colors">
                <Plus size={13} /> Add Server
              </button>
            </div>

            <p className="text-[10px] text-white/20 leading-relaxed">
              Gateway issues? Check the <button onClick={() => setTab('gateway')} className="text-terra-300/60 hover:text-terra-300 underline underline-offset-2">Gateway tab</button> for status and logs.
            </p>
          </div>
        )}

        {/* ── Ollama Tab ──────────────────────────────────────────────────── */}
        {tab === 'ollama' && (
          <div className="space-y-4">
            {/* Status indicator */}
            <div className="flex items-center gap-3 border border-white/[0.07] bg-white/[0.02] rounded-xl px-4 py-3">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ollamaOnline ? 'bg-sage-400' : 'bg-blush-400'}`} />
              <div className="flex-1">
                <p className="text-sm text-white font-medium">{ollamaOnline ? 'Ollama Running' : 'Ollama Not Detected'}</p>
                {!ollamaOnline && (
                  <p className="text-xs text-white/30 mt-0.5">Install Ollama from ollama.com to run models locally</p>
                )}
              </div>
              {!ollamaOnline && (
                <button
                  onClick={() => window.nyra.app.openExternal('https://ollama.com')}
                  className="px-3 py-2 bg-terra-400 hover:bg-terra-500 text-white text-xs rounded-lg transition-colors font-medium flex items-center gap-1.5"
                >
                  <ExternalLink size={11} /> Get Ollama
                </button>
              )}
            </div>

            {/* Online content */}
            {ollamaOnline && (
              <>
                {/* Installed models section */}
                {ollamaModels.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest">Installed Models</p>
                    <div className="space-y-2">
                      {ollamaModels.map(model => (
                        <div key={model.id} className="flex items-center justify-between border border-white/[0.07] bg-white/[0.02] rounded-lg px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-white/80 text-sm font-medium truncate">{model.name}</p>
                            <div className="flex gap-3 mt-0.5 text-[10px] text-white/30">
                              {model.size && (
                                <span className="flex items-center gap-1">
                                  <HardDrive size={9} /> {(model.size / 1e9).toFixed(1)} GB
                                </span>
                              )}
                              {model.parameterSize && (
                                <span className="flex items-center gap-1">
                                  <Server size={9} /> {model.parameterSize}
                                </span>
                              )}
                              {model.quantization && (
                                <span>{model.quantization}</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              await window.nyra.ollama.delete(model.id)
                              setOllamaModels(await window.nyra.ollama.models())
                            }}
                            className="text-white/20 hover:text-blush-400 transition-colors ml-3 p-1 rounded-lg hover:bg-blush-500/10 flex-shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        setSyncing(true)
                        setSyncResult(null)
                        const result = await window.nyra.ollama.sync()
                        setSyncResult(result)
                        setSyncing(false)
                        // Auto-clear success after 4s
                        if (result.success) setTimeout(() => setSyncResult(null), 4000)
                      }}
                      disabled={syncing}
                      className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-white text-xs rounded-lg transition-colors font-medium mt-2 ${
                        syncing ? 'bg-warm-800/40' : 'bg-terra-400 hover:bg-terra-500'
                      }`}
                    >
                      {syncing
                        ? <><Loader2 size={12} className="animate-spin" /> Syncing...</>
                        : <><Download size={12} /> Sync to OpenClaw</>}
                    </button>
                    {syncResult && (
                      <div className={`mt-2 px-3 py-2 rounded-lg text-[11px] ${
                        syncResult.success
                          ? 'bg-sage-400/10 border border-sage-400/20 text-sage-300'
                          : 'bg-blush-400/10 border border-blush-400/20 text-blush-300'
                      }`}>
                        {syncResult.success
                          ? <><Check size={11} className="inline mr-1" />Synced {syncResult.modelCount} model{syncResult.modelCount !== 1 ? 's' : ''} to OpenClaw</>
                          : <>{syncResult.error || 'Sync failed'}</>}
                      </div>
                    )}
                  </div>
                )}

                {/* Pull model section */}
                <div className="border border-white/[0.08] rounded-xl p-4 space-y-3">
                  <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest">Pull Model</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pullModelName}
                      onChange={e => setPullModelName(e.target.value)}
                      onKeyPress={e => {
                        if (e.key === 'Enter' && pullModelName.trim() && !pullingModel) {
                          setPullingModel(pullModelName.trim())
                          window.nyra.ollama.pull(pullModelName.trim())
                          setPullModelName('')
                        }
                      }}
                      placeholder="e.g. llama2, mistral:7b"
                      className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 placeholder-white/20 outline-none focus:border-terra-400/50"
                    />
                    <button
                      onClick={() => {
                        if (pullModelName.trim() && !pullingModel) {
                          setPullingModel(pullModelName.trim())
                          window.nyra.ollama.pull(pullModelName.trim())
                          setPullModelName('')
                        }
                      }}
                      disabled={!pullModelName.trim() || !!pullingModel}
                      className="px-3 py-2 bg-terra-400 hover:bg-terra-500 disabled:bg-white/[0.05] disabled:text-white/20 text-white text-xs rounded-lg transition-colors font-medium flex items-center gap-1.5"
                    >
                      {pullingModel ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                      Pull
                    </button>
                  </div>

                  {/* Pull progress */}
                  {pullingModel && pullProgress && (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <p className="text-xs text-white/60">{pullProgress.status}</p>
                        {pullProgress.total && pullProgress.completed !== undefined && (
                          <div className="w-full bg-white/[0.05] rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-terra-500 transition-all"
                              style={{ width: `${(pullProgress.completed / pullProgress.total) * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Recommended models */}
                <div className="space-y-2">
                  <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest">Recommended Models</p>
                  <div className="grid grid-cols-2 gap-2">
                    {['llama3.1:8b', 'mistral:7b', 'codellama:13b', 'deepseek-coder:6.7b', 'phi3:mini', 'gemma2:9b'].map(modelName => (
                      <button
                        key={modelName}
                        onClick={() => {
                          setPullingModel(modelName)
                          window.nyra.ollama.pull(modelName)
                        }}
                        disabled={pullingModel === modelName || !!pullingModel}
                        className="px-3 py-2 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors text-left truncate"
                      >
                        {modelName}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Appearance Tab ───────────────────────────────────────────────── */}
        {tab === 'appearance' && (
          <div className="space-y-6">
            {/* Mode */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2 flex items-center gap-1.5">
                <Palette size={10} /> Theme Mode
              </p>
              <div className="grid grid-cols-4 gap-2">
                {([
                  { id: 'dark' as const, label: 'Dark', icon: Moon },
                  { id: 'dim' as const, label: 'Dim', icon: Eye },
                  { id: 'light' as const, label: 'Light', icon: Sun },
                  { id: 'auto' as const, label: 'Auto', icon: Monitor },
                ]).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => applyTheme({ mode: id })}
                    className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl text-xs border transition-all ${
                      theme.mode === id
                        ? 'border-terra-400/50 bg-terra-400/10 text-white'
                        : 'border-white/[0.07] text-white/40 hover:border-white/15 hover:text-white/60'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                    {theme.mode === id && <Check size={9} className="text-terra-300" />}
                  </button>
                ))}
              </div>
              {theme.mode === 'auto' && (
                <p className="text-[10px] text-white/25 mt-1.5 leading-relaxed">
                  Follows your system theme. Dark after sunset, light during the day.
                </p>
              )}
            </div>

            {/* Accent */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">Accent Color</p>
              <div className="flex gap-2">
                {ACCENT_COLORS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => applyTheme({ accent: c.id })}
                    title={c.label}
                    className={`w-7 h-7 rounded-full ${c.tw} transition-all flex items-center justify-center ${
                      theme.accent === c.id
                        ? 'scale-125 ring-2 ring-white/50 ring-offset-1 ring-offset-[#101010]'
                        : 'hover:scale-110 opacity-70 hover:opacity-100'
                    }`}
                  >
                    {theme.accent === c.id && <Check size={11} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">Font Size</p>
              <div className="flex gap-2">
                {(['sm', 'md', 'lg'] as ThemeConfig['fontSize'][]).map(s => (
                  <button
                    key={s}
                    onClick={() => applyTheme({ fontSize: s })}
                    className={`px-4 py-2 rounded-xl text-xs border transition-all ${
                      theme.fontSize === s
                        ? 'border-terra-400/50 bg-terra-400/10 text-white font-medium'
                        : 'border-white/[0.07] text-white/40 hover:border-white/15 hover:text-white/60'
                    }`}
                  >
                    {s === 'sm' ? 'Small' : s === 'md' ? 'Medium' : 'Large'}
                  </button>
                ))}
              </div>
            </div>

            {/* Wallpaper */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2 flex items-center gap-1.5">
                <Palette size={10} /> Wallpaper
              </p>
              <div className="grid grid-cols-4 gap-2">
                {WALLPAPER_OPTIONS.map(wp => (
                  <button
                    key={wp.id}
                    onClick={() => applyTheme({ wallpaper: wp.id })}
                    title={wp.label}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-square ${
                      theme.wallpaper === wp.id
                        ? 'border-terra-400 ring-1 ring-terra-400/30 scale-[1.02]'
                        : 'border-white/[0.08] hover:border-white/20 hover:scale-[1.01]'
                    }`}
                  >
                    {wp.thumb ? (
                      <img
                        src={wp.thumb}
                        alt={wp.label}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#131110] flex items-center justify-center">
                        <span className="text-white/20 text-[10px]">None</span>
                      </div>
                    )}
                    {theme.wallpaper === wp.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Check size={14} className="text-terra-300" />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5">
                      <span className="text-[8px] text-white/70 font-medium">{wp.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.06]">
              <p className="text-[10px] text-white/20">Theme changes apply immediately across all windows.</p>
            </div>
          </div>
        )}

        {/* ── Plugins Tab ──────────────────────────────────────────────────── */}
        {tab === 'plugins' && <PluginManager />}

        {/* ── Skills Tab ────────────────────────────────────────────────────── */}
        {tab === 'skills' && <SkillsMarketplace onClose={() => setTab('providers')} />}

        {/* ── NyraGuard Tab ──────────────────────────────────────────────── */}
        {tab === 'guard' && (
          <div className="space-y-5">
            {/* Status header */}
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${guardEnabled ? 'bg-sage-500/20 border border-sage-500/30' : 'bg-white/[0.05] border border-white/[0.08]'}`}>
                <ShieldCheck size={20} className={guardEnabled ? 'text-sage-400' : 'text-white/30'} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white/90">NyraGuard</p>
                <p className="text-[10px] text-white/35">Security · Stability · Threat Monitoring</p>
              </div>
              <button
                onClick={() => guardToggleEnabled(!guardEnabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${guardEnabled ? 'bg-sage-500' : 'bg-white/10'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${guardEnabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>

            {/* Quick status cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-white/30 mb-1">API Key</p>
                <p className={`text-xs font-medium ${guardHasKey ? 'text-sage-400' : 'text-blush-400'}`}>
                  {guardHasKey ? 'Set' : 'Missing'}
                </p>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-white/30 mb-1">Last Scan</p>
                <p className="text-xs font-medium text-white/60">
                  {guardStatus.lastScan ? new Date(guardStatus.lastScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                </p>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-white/30 mb-1">Issues</p>
                <p className={`text-xs font-medium ${guardStatus.issueCount > 0 ? 'text-gold-400' : 'text-sage-400'}`}>
                  {guardStatus.issueCount}
                </p>
              </div>
            </div>

            {/* OpenRouter API Key */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2 flex items-center gap-1.5">
                <Key size={10} /> OpenRouter API Key (Guard-only)
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={guardApiKey}
                  onChange={e => setGuardApiKey(e.target.value)}
                  placeholder={guardHasKey ? '••••••••••• (key saved)' : 'sk-or-v1-...'}
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white/80 placeholder-white/20 outline-none focus:border-terra-400/40"
                  onKeyDown={e => e.key === 'Enter' && guardSaveApiKey()}
                />
                <button
                  onClick={guardSaveApiKey}
                  disabled={!guardApiKey.trim() || guardSavingKey}
                  className="px-3 py-2 bg-terra-400/15 hover:bg-terra-400/25 border border-terra-400/25 rounded-xl text-xs text-terra-300 font-medium transition-colors disabled:opacity-30"
                >
                  {guardSavingKey ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                </button>
              </div>
              <p className="text-[9px] text-white/20 mt-1.5">Encrypted via system keychain. Used exclusively by NyraGuard for AI diagnostics.</p>
            </div>

            {/* Model selector */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2 flex items-center gap-1.5">
                <Cpu size={10} /> Preferred Model
              </p>
              <select
                value={guardModel}
                onChange={e => {
                  setGuardModel(e.target.value)
                  window.nyra.guard?.setConfig?.({ preferredModel: e.target.value })
                }}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white/70 outline-none focus:border-terra-400/40 appearance-none"
              >
                <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                <option value="openai/gpt-4o">GPT-4o</option>
                <option value="google/gemini-pro-1.5">Gemini Pro 1.5</option>
                <option value="deepseek/deepseek-r1">DeepSeek R1</option>
                <option value="meta-llama/llama-3.1-405b-instruct">Llama 3.1 405B</option>
                <option value="qwen/qwen-2.5-72b-instruct">Qwen 2.5 72B</option>
              </select>
            </div>

            {/* Scan buttons */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2 flex items-center gap-1.5">
                <Activity size={10} /> Run Scan
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { type: 'security' as const, icon: <Shield size={12} />, label: 'Security', color: 'terra' },
                  { type: 'stability' as const, icon: <Activity size={12} />, label: 'Stability', color: 'sage' },
                  { type: 'threat' as const, icon: <AlertTriangle size={12} />, label: 'Threat', color: 'gold' },
                  { type: 'full' as const, icon: <Zap size={12} />, label: 'Full Scan', color: 'blush' },
                ]).map(s => (
                  <button
                    key={s.type}
                    onClick={() => guardRunScan(s.type)}
                    disabled={!!guardScanning}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                      guardScanning === s.type
                        ? `bg-${s.color}-400/20 border-${s.color}-400/40 text-${s.color}-300`
                        : `bg-white/[0.03] border-white/[0.07] text-white/50 hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-30`
                    }`}
                  >
                    {guardScanning === s.type ? <Loader2 size={12} className="animate-spin" /> : s.icon}
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scan results */}
            {guardResults.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">Scan Results ({guardResults.length})</p>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto scrollbar-thin">
                  {guardResults.map((r, i) => (
                    <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs ${
                      r.severity === 'critical' ? 'bg-blush-400/10 border-blush-400/20 text-blush-300' :
                      r.severity === 'high' ? 'bg-blush-500/10 border-blush-500/20 text-blush-300' :
                      r.severity === 'medium' ? 'bg-gold-500/10 border-gold-500/20 text-gold-300' :
                      'bg-sage-500/10 border-sage-500/20 text-sage-300'
                    }`}>
                      <span className="flex-shrink-0 mt-0.5">
                        {r.severity === 'critical' || r.severity === 'high' ? <AlertTriangle size={11} /> : <Shield size={11} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{r.message}</p>
                        {r.details && <p className="text-[10px] opacity-60 mt-0.5">{r.details}</p>}
                        <span className="text-[9px] opacity-40 uppercase">{r.type} · {r.severity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-scan */}
            <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
              <div>
                <p className="text-xs text-white/70 font-medium flex items-center gap-1.5">
                  <Clock size={11} /> Auto-Scan
                </p>
                <p className="text-[10px] text-white/25 mt-0.5">Run security scans every {guardInterval} minutes</p>
              </div>
              <button
                onClick={() => guardToggleAutoScan(!guardAutoScan)}
                className={`relative w-10 h-5 rounded-full transition-colors ${guardAutoScan ? 'bg-terra-500' : 'bg-white/10'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${guardAutoScan ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>

            {guardAutoScan && (
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-white/35">Interval (min):</p>
                {[15, 30, 60].map(m => (
                  <button
                    key={m}
                    onClick={() => {
                      setGuardInterval(m)
                      window.nyra.guard?.setConfig?.({ scanInterval: m })
                      if (guardAutoScan) window.nyra.guard?.startAuto?.()
                    }}
                    className={`px-3 py-1 rounded-lg text-[10px] border transition-all ${
                      guardInterval === m
                        ? 'border-terra-400/50 bg-terra-400/10 text-white/80'
                        : 'border-white/[0.07] text-white/30 hover:text-white/50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {/* AI Diagnostics */}
            <div className="border-t border-white/[0.06] pt-4">
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2 flex items-center gap-1.5">
                <Sparkles size={10} /> AI Diagnostics
              </p>
              <button
                onClick={guardRunDiagnosis}
                disabled={guardDiagnosing || !guardHasKey}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-terra-500/15 to-gold-500/15 hover:from-terra-500/25 hover:to-gold-500/25 border border-terra-400/20 rounded-xl text-xs text-white/70 font-medium transition-all disabled:opacity-30"
              >
                {guardDiagnosing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {guardDiagnosing ? 'Analyzing…' : 'Run AI Diagnosis'}
              </button>
              {!guardHasKey && (
                <p className="text-[9px] text-blush-400/60 mt-1.5">Set your OpenRouter API key above to enable AI diagnostics.</p>
              )}
              {guardDiagnosis && (
                <div className="mt-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 max-h-[180px] overflow-y-auto scrollbar-thin">
                  <pre className="text-[10px] text-white/60 whitespace-pre-wrap font-mono leading-relaxed">{guardDiagnosis}</pre>
                </div>
              )}
            </div>

            {/* Recent logs */}
            {guardLogs.length > 0 && (
              <div className="border-t border-white/[0.06] pt-4">
                <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">Recent Activity</p>
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2 max-h-[120px] overflow-y-auto scrollbar-thin space-y-0.5">
                  {guardLogs.slice(-20).reverse().map((log, i) => (
                    <div key={i} className="flex items-start gap-2 text-[9px]">
                      <span className="text-white/15 font-mono flex-shrink-0">
                        {new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className={`flex-shrink-0 uppercase font-bold ${
                        log.level === 'error' ? 'text-blush-300/60' :
                        log.level === 'warn' ? 'text-gold-400/60' :
                        'text-white/20'
                      }`}>{log.level}</span>
                      <span className="text-white/40">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Router Tab (Smart Model Router Policy) ────────────────────── */}
        {tab === 'router' && (
          <RouterSettings />
        )}

        {/* ── Memory Tab (Session History + Snapshots) ───────────────────── */}
        {tab === 'memory' && (
          <MemorySettings />
        )}

        {/* ── About Tab ────────────────────────────────────────────────────── */}
        {tab === 'about' && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-terra-500 to-terra-700 flex items-center justify-center shadow-lg shadow-terra-500/20">
                <span className="text-white text-xl font-bold">N</span>
              </div>
              <div>
                <p className="text-white font-semibold">Nyra Desktop</p>
                <p className="text-white/35 text-xs">Version {appVersion}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-white/35 leading-relaxed">
              <p>Built on <strong className="text-white/60">Electron</strong> + <strong className="text-white/60">React</strong> + <strong className="text-white/60">TypeScript</strong></p>
              <p>AI powered by <strong className="text-white/60">OpenClaw</strong> gateway <code className="font-mono text-white/40">ws://127.0.0.1:18789</code></p>
              <p>Tool integrations via <strong className="text-white/60">Model Context Protocol (MCP)</strong></p>
            </div>

            <div className="space-y-2">
              <button onClick={() => window.nyra.app.openExternal('https://openclaw.ai')}
                className="flex items-center gap-2 text-terra-300 hover:text-terra-300 text-xs transition-colors">
                <ExternalLink size={11} /> OpenClaw Documentation
              </button>
              <button onClick={() => window.nyra.app.openExternal('https://github.com')}
                className="flex items-center gap-2 text-white/30 hover:text-white/60 text-xs transition-colors">
                <ExternalLink size={11} /> View on GitHub
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Router Settings (Smart Model Router Policy) ──────────────────────────

const WEIGHT_LABELS: Record<string, { label: string; description: string; color: string }> = {
  costWeight:       { label: 'Cost',       description: 'Prefer cheaper models',             color: 'bg-sage-400' },
  capabilityWeight: { label: 'Capability', description: 'Prefer more capable models',        color: 'bg-terra-400' },
  healthWeight:     { label: 'Health',     description: 'Prefer healthy/low-latency providers', color: 'bg-gold-400' },
  specialtyWeight:  { label: 'Specialty',  description: 'Prefer models specialized for task', color: 'bg-gold-400' },
}

function RouterSettings() {
  const [policy, setPolicy] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.nyra.modelRouter.getPolicy().then((res: any) => {
      if (res.policy) setPolicy(res.policy)
    }).catch(() => {})
  }, [])

  const handleWeightChange = (key: string, value: number) => {
    setPolicy(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.nyra.modelRouter.setPolicy(policy)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-white/35 leading-relaxed">
        The Smart Model Router automatically selects the best model for each task based on weighted scoring.
        Adjust the weights below to customize routing behavior.
      </p>

      <div className="space-y-4">
        {Object.entries(WEIGHT_LABELS).map(([key, cfg]) => {
          const value = policy[key] ?? 0.25

          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-white/70 font-medium">{cfg.label}</span>
                  <p className="text-[10px] text-white/25">{cfg.description}</p>
                </div>
                <span className="text-xs text-white/40 font-mono w-12 text-right">
                  {(value * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={value * 100}
                  onChange={e => handleWeightChange(key, parseInt(e.target.value) / 100)}
                  className="flex-1 h-1 bg-white/[0.06] rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-terra-400
                    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-terra-300"
                />
                <div className={`w-2 h-2 rounded-full ${cfg.color}`} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Routing formula preview */}
      <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
        <div className="text-[10px] text-white/20 font-mono mb-1">Scoring Formula</div>
        <div className="text-[11px] text-white/40 font-mono leading-relaxed">
          score = (cost × {((policy.costWeight ?? 0.30) * 100).toFixed(0)}%) +
          (cap × {((policy.capabilityWeight ?? 0.25) * 100).toFixed(0)}%) +
          (health × {((policy.healthWeight ?? 0.15) * 100).toFixed(0)}%) +
          (spec × {((policy.specialtyWeight ?? 0.20) * 100).toFixed(0)}%) + bonuses
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
          saved
            ? 'bg-sage-400/20 text-sage-300 border border-sage-400/20'
            : 'bg-terra-400/20 text-terra-300 hover:bg-terra-400/30 border border-terra-400/20'
        }`}
      >
        {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Policy'}
      </button>
    </div>
  )
}

// ── Memory Settings (Session History + Snapshots) ────────────────────────

function MemorySettings() {
  const [lifecycleStats, setLifecycleStats] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [snapshotSaving, setSnapshotSaving] = useState(false)

  useEffect(() => {
    window.nyra.memoryLifecycle.getStats().then((r: any) => {
      if (r.success) setLifecycleStats(r.result)
    }).catch(() => {})

    window.nyra.memoryLifecycle.getSessions(10).then((r: any) => {
      if (r.success) setSessions(r.result)
    }).catch(() => {})
  }, [])

  const handleSaveSnapshot = async () => {
    setSnapshotSaving(true)
    try {
      await window.nyra.memoryLifecycle.saveSnapshot()
      // Refresh stats
      const r = await window.nyra.memoryLifecycle.getStats()
      if (r.success) setLifecycleStats(r.result)
    } finally {
      setSnapshotSaving(false)
    }
  }

  const formatDuration = (ms: number) => {
    const mins = Math.floor(ms / 60_000)
    const hours = Math.floor(mins / 60)
    if (hours > 0) return `${hours}h ${mins % 60}m`
    return `${mins}m`
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-white/35 leading-relaxed">
        Cross-session memory persistence. Working memory snapshots are saved on quit and restored on startup.
      </p>

      {/* Lifecycle stats */}
      {lifecycleStats && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
            <div className="text-[10px] text-white/20 mb-1">Total Sessions</div>
            <div className="text-lg font-mono text-white/60">{lifecycleStats.totalSessions}</div>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
            <div className="text-[10px] text-white/20 mb-1">Snapshots</div>
            <div className="text-lg font-mono text-white/60">{lifecycleStats.snapshotCount}</div>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
            <div className="text-[10px] text-white/20 mb-1">Current Session</div>
            <div className="text-sm font-mono text-terra-300">{formatDuration(lifecycleStats.currentSessionDuration)}</div>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3">
            <div className="text-[10px] text-white/20 mb-1">Last Snapshot</div>
            <div className="text-sm font-mono text-white/40">
              {lifecycleStats.lastSnapshotAt
                ? new Date(lifecycleStats.lastSnapshotAt).toLocaleTimeString()
                : 'Never'}
            </div>
          </div>
        </div>
      )}

      {/* Manual snapshot */}
      <button
        onClick={handleSaveSnapshot}
        disabled={snapshotSaving}
        className="px-4 py-2 rounded-lg text-xs font-medium bg-sage-400/15 text-sage-300 hover:bg-sage-400/25 border border-sage-400/20 transition-colors disabled:opacity-30"
      >
        {snapshotSaving ? 'Saving...' : 'Save Snapshot Now'}
      </button>

      {/* Session history */}
      {sessions.length > 0 && (
        <div>
          <div className="text-xs text-white/30 font-medium mb-2">Recent Sessions</div>
          <div className="space-y-1 max-h-[240px] overflow-y-auto scrollbar-thin">
            {sessions.map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-white/[0.02] text-[11px]">
                <span className={`w-1.5 h-1.5 rounded-full ${s.endedAt ? 'bg-white/15' : 'bg-sage-400 animate-pulse'}`} />
                <span className="text-white/30 font-mono text-[10px]">
                  {new Date(s.startedAt).toLocaleDateString()} {new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {s.endedAt && (
                  <span className="text-white/15 font-mono text-[10px]">
                    → {new Date(s.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <span className="text-white/20">{s.memoriesCreated} memories</span>
                {s.snapshotId && (
                  <span className="text-[9px] bg-sage-400/10 text-sage-300/60 px-1 py-0.5 rounded">
                    snapshot
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
