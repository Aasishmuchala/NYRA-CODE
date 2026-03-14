/**
 * Settings Panel — Providers · MCP servers · Appearance · About
 */
import React, { useEffect, useState } from 'react'
import { X, Plus, Trash2, RefreshCw, ExternalLink, Palette, Check, Key, Loader2, Shield, ChevronDown, HardDrive, Download, Server } from 'lucide-react'
import type { McpServerConfig, ThemeConfig } from '../../preload/index'

interface Props {
  onClose: () => void
}

type Tab = 'providers' | 'mcp' | 'ollama' | 'appearance' | 'about'

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
  const [theme, setThemeState]    = useState<ThemeConfig>({ mode: 'dark', accent: 'indigo', fontSize: 'md' })

  // ── Provider state ────────────────────────────────────────────────────────
  const [providerStates, setProviderStates]  = useState<ProviderState[]>([])
  const [providerCatalog, setProviderCatalog] = useState<ProviderDef[]>([])
  const [keyInputs, setKeyInputs]            = useState<Record<string, string>>({})
  const [savingKey, setSavingKey]             = useState<string | null>(null)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [oauthLoading, setOauthLoading]         = useState<string | null>(null)
  const [deviceCode, setDeviceCode]             = useState<{ code: string; uri: string } | null>(null)

  // ── Ollama state ──────────────────────────────────────────────────────────
  const [ollamaOnline, setOllamaOnline] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<Array<{ id: string; name: string; size: number; modifiedAt: string; parameterSize?: string; quantization?: string }>>([])
  const [pullingModel, setPullingModel] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null)
  const [pullModelName, setPullModelName] = useState('')

  useEffect(() => {
    window.nyra.mcp.list().then(setServers)
    window.nyra.app.version().then(setAppVersion)
    window.nyra.theme.get().then(setThemeState)
    // Load providers
    window.nyra.providers.list().then(setProviderStates)
    window.nyra.providers.catalog().then(setProviderCatalog)

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
    window.nyra.providers.onOAuthComplete(async () => {
      setOauthLoading(null)
      setDeviceCode(null)
      setProviderStates(await window.nyra.providers.list())
    })
    window.nyra.providers.onDeviceCode((d) => {
      setDeviceCode({ code: d.userCode, uri: d.verificationUri })
    })
    return () => {
      window.nyra.providers.removeOAuthListeners()
      window.nyra.ollama.removePullListener()
    }
  }, [])

  const applyTheme = async (patch: Partial<ThemeConfig>) => {
    const next = { ...theme, ...patch }
    setThemeState(next)
    await window.nyra.theme.set(next)
  }

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
    <div className="flex flex-col h-full bg-[#141210] border-l border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <h2 className="text-white font-semibold text-sm">Settings</h2>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/[0.06]">
          <X size={15} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 pt-3 flex-wrap">
        {(['providers', 'mcp', 'ollama', 'appearance', 'about'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors capitalize ${
              tab === t ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/70'
            }`}
          >
            {t === 'providers' ? 'Providers' : t === 'mcp' ? 'MCP Servers' : t === 'ollama' ? 'Local LLMs' : t === 'appearance' ? 'Appearance' : 'About'}
          </button>
        ))}
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
                      {/* OAuth Sign-In buttons */}
                      {(def.id === 'openai' || def.id === 'anthropic' || def.id === 'copilot') && !isConnected && (
                        <div className="space-y-2">
                          <button
                            onClick={async () => {
                              setOauthLoading(def.id)
                              if (def.id === 'copilot') {
                                await window.nyra.providers.githubDeviceFlow()
                              } else {
                                await window.nyra.providers.startOAuth(def.id)
                              }
                              setOauthLoading(null)
                              setProviderStates(await window.nyra.providers.list())
                            }}
                            disabled={oauthLoading === def.id}
                            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-white text-xs rounded-xl transition-colors font-medium ${
                              def.id === 'openai'
                                ? 'bg-sage-600/80 hover:bg-sage-500 disabled:bg-sage-600/40'
                                : def.id === 'anthropic'
                                ? 'bg-terra-600/80 hover:bg-terra-500 disabled:bg-terra-600/40'
                                : 'bg-warm-800/80 hover:bg-warm-200 disabled:bg-warm-800/40'
                            }`}
                          >
                            {oauthLoading === def.id
                              ? <><Loader2 size={12} className="animate-spin" /> Waiting for sign-in...</>
                              : <><ExternalLink size={12} /> {
                                  def.id === 'openai' ? 'Sign in with ChatGPT' :
                                  def.id === 'anthropic' ? 'Sign in with Claude' :
                                  'Sign in with GitHub'
                                }</>}
                          </button>
                          {/* GitHub device code display */}
                          {def.id === 'copilot' && deviceCode && oauthLoading === 'copilot' && (
                            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-center space-y-1">
                              <p className="text-[10px] text-white/40">Enter this code on GitHub:</p>
                              <p className="text-lg font-mono font-bold text-white tracking-widest">{deviceCode.code}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-px bg-white/[0.06]" />
                            <span className="text-[10px] text-white/20">or paste API key</span>
                            <div className="flex-1 h-px bg-white/[0.06]" />
                          </div>
                        </div>
                      )}
                      {/* External link for providers without OAuth (Gemini only) */}
                      {def.id === 'gemini' && !isConnected && (
                        <button
                          onClick={() => window.nyra.providers.openOauth(def.oauthUrl!)}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gold-600/80 hover:bg-gold-500 text-white text-xs rounded-xl transition-colors font-medium"
                        >
                          <ExternalLink size={12} /> Get API key from Google AI Studio
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

            <button onClick={() => window.nyra.openclaw.restart()} className="flex items-center gap-2 text-white/35 hover:text-white/60 text-xs transition-colors">
              <RefreshCw size={11} /> Restart OpenClaw Gateway
            </button>
          </div>
        )}

        {/* ── Ollama Tab ──────────────────────────────────────────────────── */}
        {tab === 'ollama' && (
          <div className="space-y-4">
            {/* Status indicator */}
            <div className="flex items-center gap-3 border border-white/[0.07] bg-white/[0.02] rounded-xl px-4 py-3">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ollamaOnline ? 'bg-sage-400' : 'bg-red-500'}`} />
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
                      onClick={() => window.nyra.ollama.sync()}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-terra-400 hover:bg-terra-500 text-white text-xs rounded-lg transition-colors font-medium mt-2"
                    >
                      <Download size={12} /> Sync to OpenClaw
                    </button>
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
              <div className="grid grid-cols-3 gap-2">
                {(['dark', 'dim', 'light'] as ThemeConfig['mode'][]).map(m => (
                  <button
                    key={m}
                    onClick={() => applyTheme({ mode: m })}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs border capitalize transition-all ${
                      theme.mode === m
                        ? 'border-terra-400/50 bg-terra-400/10 text-white'
                        : 'border-white/[0.07] text-white/40 hover:border-white/15 hover:text-white/60'
                    }`}
                  >
                    {m}
                    {theme.mode === m && <Check size={10} className="text-terra-300" />}
                  </button>
                ))}
              </div>
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

            <div className="pt-2 border-t border-white/[0.06]">
              <p className="text-[10px] text-white/20">Theme changes apply immediately across all windows.</p>
            </div>
          </div>
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
