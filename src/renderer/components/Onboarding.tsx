/**
 * Onboarding Wizard — Full OpenClaw-powered first-run flow
 *
 * 7-step premium experience:
 *  1. Welcome — animated intro
 *  2. AI Provider Setup — OAuth + API key for all providers
 *  3. Model Selection — pick a default model from live gateway catalog
 *  4. Channel Configuration — set up Telegram, Discord, Slack, etc.
 *  5. Local LLMs (Ollama) — detect + recommend
 *  6. Desktop Capabilities — screen capture + automation demo
 *  7. Ready — celebration + tips
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowRight, ArrowLeft, Check, Loader2, ExternalLink,
  Monitor, Cpu, Shield, Sparkles, Key, Zap,
  ChevronRight, HardDrive, Eye, MessageSquare, Settings,
  BookOpen, Rocket, Radio, Globe,
} from 'lucide-react'
import { ProviderSetup } from './ProviderSetup'
import { ChannelSetup } from './ChannelSetup'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Props {
  onComplete: () => void
}

interface ProviderDef {
  id: string; label: string; icon: string; oauthUrl?: string; apiKeyPrefix?: string
  models: Array<{ id: string; label: string; contextWindow?: number }>
}

interface ProviderState {
  id: string; enabled: boolean; hasKey: boolean; activeModel?: string
}

interface GatewayCatalogEntry {
  id: string; name: string; provider: string; contextWindow?: number; reasoning?: boolean
}

type Step = 'welcome' | 'provider' | 'model' | 'channels' | 'ollama' | 'capabilities' | 'ready'
const STEPS: Step[] = ['welcome', 'provider', 'model', 'channels', 'ollama', 'capabilities', 'ready']
const STEP_LABELS: Record<Step, string> = {
  welcome: 'Welcome', provider: 'AI Providers', model: 'Default Model',
  channels: 'Channels', ollama: 'Local Models', capabilities: 'Desktop', ready: 'All Set',
}
const STEP_SHORT: string[] = ['Hi', 'AI', 'Model', 'Chat', 'Local', 'Power', 'Go']

// ── Main Component ─────────────────────────────────────────────────────────────
export const Onboarding: React.FC<Props> = ({ onComplete }) => {
  const mountedRef = useRef(true)
  useEffect(() => { return () => { mountedRef.current = false } }, [])

  const [step, setStep] = useState<Step>('welcome')
  const [animating, setAnimating] = useState(false)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Provider state
  const [catalog, setCatalog] = useState<ProviderDef[]>([])
  const [states, setStates] = useState<ProviderState[]>([])
  const [oauthAvail, setOauthAvail] = useState<Record<string, boolean>>({})

  // Gateway model catalog
  const [gatewayCatalog, setGatewayCatalog] = useState<GatewayCatalogEntry[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('auto')
  const [modelSaving, setModelSaving] = useState(false)

  // Channel state
  const [channelStatus, setChannelStatus] = useState<Record<string, { enabled: boolean; connected: boolean; error?: string }> | null>(null)

  // Ollama state
  const [ollamaOnline, setOllamaOnline] = useState(false)
  const [ollamaChecking, setOllamaChecking] = useState(true)
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string }>>([])

  // Screen capture state
  const [screenTested, setScreenTested] = useState(false)
  const [screenWorking, setScreenWorking] = useState(false)

  // Confetti + error
  const [showConfetti, setShowConfetti] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Timer
  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // ── Load provider catalog + OAuth availability ──────────────────────────────
  useEffect(() => {
    window.nyra.providers.catalog().then(setCatalog).catch(() => {})
    window.nyra.providers.list().then(setStates).catch(() => {})
    window.nyra.providers.oauthAvailability?.().then(setOauthAvail).catch(() => {})

    const cleanups: Array<() => void> = []
    cleanups.push(window.nyra.providers.onOAuthComplete(async () => {
      setStates(await window.nyra.providers.list())
    }))
    return () => { cleanups.forEach(fn => fn?.()) }
  }, [])

  // ── Fetch gateway model catalog when reaching model step ────────────────────
  useEffect(() => {
    if (step === 'model') {
      window.nyra.openclaw.modelCatalog().then(models => {
        if (!mountedRef.current) return
        if (Array.isArray(models) && models.length > 0) setGatewayCatalog(models)
      }).catch(() => {
        // Gateway offline — fallback models from provider catalog will be shown
      })
    }
  }, [step])

  // ── Check Ollama when reaching that step ────────────────────────────────────
  useEffect(() => {
    if (step === 'ollama') {
      setOllamaChecking(true)
      window.nyra.ollama.status().then(online => {
        if (!mountedRef.current) return
        setOllamaOnline(online)
        if (online) window.nyra.ollama.models().then(m => { if (mountedRef.current) setOllamaModels(m) }).catch(() => {})
        setOllamaChecking(false)
      }).catch(() => { if (mountedRef.current) setOllamaChecking(false) })
    }
  }, [step])

  // Confetti on reaching ready step
  useEffect(() => {
    if (step === 'ready') {
      setShowConfetti(true)
      const t = setTimeout(() => setShowConfetti(false), 3000)
      return () => clearTimeout(t)
    }
  }, [step])

  const stepIndex = STEPS.indexOf(step)
  const hasConnectedProvider = states.some(s => s.hasKey && s.enabled)

  const goNext = useCallback(() => {
    if (stepIndex < STEPS.length - 1) {
      setDirection('forward')
      setAnimating(true)
      setError(null) // clear errors on step transition
      setTimeout(() => { setStep(STEPS[stepIndex + 1]); setAnimating(false) }, 200)
    }
  }, [stepIndex])

  const goBack = useCallback(() => {
    if (stepIndex > 0) {
      setDirection('backward')
      setAnimating(true)
      setError(null) // clear errors on step transition
      setTimeout(() => { setStep(STEPS[stepIndex - 1]); setAnimating(false) }, 200)
    }
  }, [stepIndex])

  // ── Provider handlers (for ProviderSetup) ───────────────────────────────────
  const handleSaveKey = useCallback(async (providerId: string, key: string) => {
    setError(null)
    try {
      await window.nyra.providers.saveKey(providerId, key)
      setStates(await window.nyra.providers.list())
    } catch (err) {
      setError(`Failed to save API key: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [])

  const handleStartOAuth = useCallback(async (providerId: string) => {
    setError(null)
    try {
      let result: { success: boolean; error?: string } | undefined
      if (providerId === 'copilot') result = await window.nyra.providers.githubDeviceFlow()
      else result = await window.nyra.providers.startOAuth(providerId)
      setStates(await window.nyra.providers.list())
      if (result && !result.success && result.error) setError(result.error)
      return result
    } catch (err) {
      setError(`Sign-in failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return { success: false, error: String(err) }
    }
  }, [])

  const handleGithubDeviceFlow = useCallback(async () => {
    setError(null)
    try {
      const result = await window.nyra.providers.githubDeviceFlow()
      setStates(await window.nyra.providers.list())
      return result
    } catch (err) {
      setError(`GitHub sign-in failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return { success: false, error: String(err) }
    }
  }, [])

  const handleDisconnect = useCallback(async (providerId: string) => {
    setError(null)
    try {
      await window.nyra.providers.removeKey(providerId)
      setStates(await window.nyra.providers.list())
    } catch (err) {
      setError(`Disconnect failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [])

  const handleRefreshStates = useCallback(async () => {
    setStates(await window.nyra.providers.list())
  }, [])

  // ── Model selection handler ─────────────────────────────────────────────────
  const handleModelSelect = useCallback(async (modelId: string) => {
    setSelectedModel(modelId)
    if (modelId === 'auto') return
    setModelSaving(true)
    try {
      await window.nyra.providers.switchModel(modelId)
    } catch { /* best effort */ }
    if (mountedRef.current) setModelSaving(false)
  }, [])

  // ── Channel handlers ────────────────────────────────────────────────────────
  const handleConfigureChannel = useCallback(async (channelId: string, config: Record<string, string>) => {
    try {
      await window.nyra.openclaw.configPatch(JSON.stringify({ channels: { [channelId]: config } }))
      const s = await window.nyra.openclaw.channelsStatus()
      if (mountedRef.current && s) setChannelStatus(s as any)
    } catch (err) {
      if (mountedRef.current) setError(`Failed to configure ${channelId}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [])

  const handleToggleChannel = useCallback(async (channelId: string, enabled: boolean) => {
    try {
      await window.nyra.openclaw.configPatch(JSON.stringify({ channels: { [channelId]: { enabled } } }))
      const s = await window.nyra.openclaw.channelsStatus()
      if (mountedRef.current && s) setChannelStatus(s as any)
    } catch (err) {
      if (mountedRef.current) setError(`Failed to toggle ${channelId}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [])

  // ── Screen test ─────────────────────────────────────────────────────────────
  const handleTestScreen = async () => {
    try {
      const result = await window.nyra.screen.capture()
      setScreenTested(true)
      setScreenWorking(result !== null)
    } catch { setScreenTested(true); setScreenWorking(false) }
  }

  // ── Group gateway models by provider ────────────────────────────────────────
  const modelsByProvider = gatewayCatalog.reduce<Record<string, GatewayCatalogEntry[]>>((acc, m) => {
    const prov = m.provider || 'other'
    if (!acc[prov]) acc[prov] = []
    acc[prov].push(m)
    return acc
  }, {})

  const slideInStyles = {
    transform: animating
      ? `translateX(${direction === 'forward' ? '32px' : '-32px'}) scale(0.95)`
      : 'translateX(0) scale(1)',
    opacity: animating ? 0 : 1,
    transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  }

  return (
    <div className="fixed inset-0 z-[100] bg-nyra-bg flex items-center justify-center overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-terra-900/30 via-transparent to-gold-900/20 pointer-events-none" />
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-terra-500/8 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-gold-500/5 rounded-full blur-[100px] pointer-events-none" />

      {showConfetti && <ConfettiAnimation />}

      <div style={slideInStyles} className="relative w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto scrollbar-thin">
        {/* Progress header */}
        <div className="mb-8 sticky top-0 z-10 bg-nyra-bg/80 backdrop-blur-md pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1">
              <p className="text-xs font-semibold text-terra-300 uppercase tracking-widest">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
              <h1 className="text-xl font-bold text-white mt-1">{STEP_LABELS[step]}</h1>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
              <span className="text-xs font-mono text-white/40">{elapsedSeconds}s</span>
            </div>
          </div>

          <div className="relative h-1.5 bg-white/[0.05] rounded-full overflow-hidden border border-white/[0.06]">
            <div
              className="h-full bg-gradient-to-r from-terra-500 to-terra-400 transition-all duration-500 rounded-full"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between mt-3 px-1">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === stepIndex ? 'w-2.5 h-2.5 bg-terra-400' : i < stepIndex ? 'bg-sage-500' : 'bg-white/10'
                }`} />
                <span className={`text-[9px] font-medium whitespace-nowrap transition-colors ${
                  i <= stepIndex ? 'text-white/50' : 'text-white/15'
                }`}>{STEP_SHORT[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Step 1: Welcome ──────────────────────────────────────────────── */}
        {step === 'welcome' && (
          <div className="text-center space-y-8">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-terra-400/25 to-terra-600/15 border border-terra-400/25 shadow-2xl shadow-terra-500/15">
              <Sparkles size={44} className="text-terra-300 animate-bounce" style={{ animationDuration: '3s' }} />
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-bold text-white">Welcome to Nyra</h1>
              <div className="h-16 flex items-center">
                <TypedText
                  text="The open AI desktop agent that can see your screen, control your computer, use any AI model, and connect to all your tools."
                  className="text-white/50 text-base leading-relaxed max-w-lg mx-auto"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto pt-4">
              {[
                { icon: Eye, label: 'Screen vision', desc: 'Sees what you see', color: 'from-terra-500/15 to-terra-600/10' },
                { icon: Monitor, label: 'Desktop control', desc: 'Click, type, automate', color: 'from-gold-500/15 to-gold-600/10' },
                { icon: Cpu, label: 'Any AI model', desc: 'Cloud or local', color: 'from-sage-500/15 to-sage-600/10' },
                { icon: Radio, label: 'Multi-channel', desc: 'Telegram, Discord, Slack…', color: 'from-terra-500/15 to-terra-600/10' },
              ].map(f => (
                <div
                  key={f.label}
                  className={`group flex items-start gap-3 bg-gradient-to-br ${f.color} border border-white/[0.08] rounded-xl px-4 py-3.5 text-left transition-all hover:border-white/[0.15]`}
                >
                  <f.icon size={18} className="text-terra-300 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <div>
                    <p className="text-xs text-white font-semibold">{f.label}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4">
              <button onClick={goNext} className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-terra-500 to-terra-400 hover:from-terra-400 hover:to-terra-300 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-terra-500/30 hover:scale-105">
                Get Started <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Provider Setup ──────────────────────────────────────── */}
        {step === 'provider' && (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold text-white">Connect AI Providers</h2>
              <p className="text-white/45 text-sm max-w-sm mx-auto">
                Sign in with OAuth or paste an API key. Connect multiple providers to switch between models.
              </p>
            </div>

            <ProviderSetup
              catalog={catalog}
              states={states}
              oauthAvail={oauthAvail}
              gatewayCatalog={gatewayCatalog}
              onSaveKey={handleSaveKey}
              onStartOAuth={handleStartOAuth}
              onGithubDeviceFlow={handleGithubDeviceFlow}
              onDisconnect={handleDisconnect}
              onRefreshStates={handleRefreshStates}
              compact
            />

            {error && (
              <div className="flex items-center gap-3 bg-blush-400/10 border border-blush-400/25 rounded-xl px-4 py-3 text-sm text-blush-300">
                <span className="flex-shrink-0">⚠</span>
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="text-blush-300/40 hover:text-blush-300">✕</button>
              </div>
            )}

            <NavButtons onBack={goBack} onNext={goNext}
              nextLabel={hasConnectedProvider ? 'Continue' : 'Skip for now'}
              nextHighlight={hasConnectedProvider}
            />
          </div>
        )}

        {/* ── Step 3: Model Selection ─────────────────────────────────────── */}
        {step === 'model' && (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold text-white">Choose Default Model</h2>
              <p className="text-white/45 text-sm max-w-sm mx-auto">
                Pick the AI model Nyra uses by default. You can switch anytime in the chat bar.
              </p>
            </div>

            {/* Auto option */}
            <button
              onClick={() => handleModelSelect('auto')}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border transition-all text-left ${
                selectedModel === 'auto'
                  ? 'border-terra-400/50 bg-terra-400/[0.08]'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14]'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-terra-500/20 to-gold-500/15 flex items-center justify-center">
                <Sparkles size={20} className="text-terra-300" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-white font-semibold">Auto (Recommended)</p>
                <p className="text-[11px] text-white/35 mt-0.5">Nyra picks the best available model for each task</p>
              </div>
              {selectedModel === 'auto' && <Check size={18} className="text-terra-400" />}
            </button>

            {/* Gateway models grouped by provider */}
            {Object.keys(modelsByProvider).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(modelsByProvider).map(([provider, models]) => (
                  <div key={provider} className="space-y-1.5">
                    <p className="text-[10px] text-white/30 font-semibold uppercase tracking-widest px-1">
                      {provider.replace(/-/g, ' ')}
                    </p>
                    <div className="space-y-1">
                      {models.slice(0, 6).map(m => {
                        const modelId = `${provider}/${m.id.includes('/') ? m.id.split('/').pop() : m.id}`
                        return (
                          <button
                            key={m.id}
                            onClick={() => handleModelSelect(modelId)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-left transition-all ${
                              selectedModel === modelId
                                ? 'border-terra-400/40 bg-terra-400/[0.06]'
                                : 'border-transparent hover:bg-white/[0.03]'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-white/80 font-medium truncate">{m.name || m.id}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {m.contextWindow && (
                                  <span className="text-[9px] text-white/25">{Math.round(m.contextWindow / 1000)}K ctx</span>
                                )}
                                {m.reasoning && (
                                  <span className="text-[9px] text-gold-400/60 font-medium">reasoning</span>
                                )}
                              </div>
                            </div>
                            {selectedModel === modelId && <Check size={14} className="text-terra-400 flex-shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Fallback: show models from provider catalog */
              <div className="space-y-4">
                {catalog.filter(def => states.some(s => s.id === def.id && s.hasKey)).map(def => (
                  <div key={def.id} className="space-y-1.5">
                    <p className="text-[10px] text-white/30 font-semibold uppercase tracking-widest px-1 flex items-center gap-2">
                      <span>{def.icon}</span> {def.label}
                    </p>
                    <div className="space-y-1">
                      {def.models.slice(0, 4).map(m => {
                        const modelId = `${def.id}/${m.id}`
                        return (
                          <button
                            key={m.id}
                            onClick={() => handleModelSelect(modelId)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-left transition-all ${
                              selectedModel === modelId
                                ? 'border-terra-400/40 bg-terra-400/[0.06]'
                                : 'border-transparent hover:bg-white/[0.03]'
                            }`}
                          >
                            <p className="text-xs text-white/80 font-medium flex-1 truncate">{m.label}</p>
                            {m.contextWindow && <span className="text-[9px] text-white/25">{Math.round(m.contextWindow / 1000)}K</span>}
                            {selectedModel === modelId && <Check size={14} className="text-terra-400" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {!hasConnectedProvider && (
                  <p className="text-xs text-white/25 text-center py-4">
                    Connect a provider first to see available models
                  </p>
                )}
              </div>
            )}

            {modelSaving && (
              <div className="flex items-center justify-center gap-2 text-xs text-white/40">
                <Loader2 size={12} className="animate-spin" /> Saving model preference…
              </div>
            )}

            <NavButtons onBack={goBack} onNext={goNext} nextLabel="Continue" nextHighlight />
          </div>
        )}

        {/* ── Step 4: Channel Configuration ───────────────────────────────── */}
        {step === 'channels' && (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold text-white">Connect Channels</h2>
              <p className="text-white/45 text-sm max-w-sm mx-auto">
                Talk to Nyra from Telegram, Discord, Slack, and more. Set up channels now or later in Settings.
              </p>
            </div>

            <ChannelSetup
              channelStatus={channelStatus}
              onConfigureChannel={handleConfigureChannel}
              onToggleChannel={handleToggleChannel}
              compact
            />

            <NavButtons onBack={goBack} onNext={goNext} nextLabel="Continue" nextHighlight />
          </div>
        )}

        {/* ── Step 5: Ollama / Local LLMs ─────────────────────────────────── */}
        {step === 'ollama' && (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold text-white">Local AI Models</h2>
              <p className="text-white/45 text-sm max-w-sm mx-auto">
                Run AI models privately on your machine with Ollama. No cloud, no API keys, zero latency.
              </p>
            </div>

            <div className={`flex items-center gap-4 border rounded-xl px-5 py-4 transition-all ${
              ollamaOnline ? 'border-sage-500/35 bg-sage-500/[0.08]' : 'border-white/[0.08] bg-white/[0.02]'
            }`}>
              <span className={`w-4 h-4 rounded-full flex-shrink-0 ${
                ollamaChecking ? 'bg-gold-400 animate-pulse' : ollamaOnline ? 'bg-sage-400' : 'bg-blush-400'
              }`} />
              <div className="flex-1">
                <p className="text-sm text-white font-semibold">
                  {ollamaChecking ? 'Checking for Ollama…' : ollamaOnline ? 'Ollama Detected' : 'Ollama Not Found'}
                </p>
                {ollamaOnline && ollamaModels.length > 0 && (
                  <p className="text-[11px] text-white/35 mt-1">
                    {ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''} ready: {ollamaModels.map(m => m.name).slice(0, 2).join(', ')}
                    {ollamaModels.length > 2 && ` +${ollamaModels.length - 2} more`}
                  </p>
                )}
                {!ollamaOnline && !ollamaChecking && (
                  <p className="text-[11px] text-white/35 mt-1">
                    Install Ollama to run models like Llama 3.2, Mistral, and Phi locally
                  </p>
                )}
              </div>
              {!ollamaOnline && !ollamaChecking && (
                <button onClick={() => window.nyra.app.openExternal('https://ollama.com')}
                  className="px-4 py-2.5 bg-terra-500 hover:bg-terra-400 text-white text-xs rounded-lg transition-all font-semibold flex items-center gap-2 flex-shrink-0">
                  <ExternalLink size={12} /> Get Ollama
                </button>
              )}
            </div>

            {/* Speed comparison */}
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 space-y-4">
              <p className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Performance Comparison</p>
              <div className="space-y-3">
                {[
                  { label: 'Local (Ollama)', latency: '0ms', width: 'w-1/12', color: 'from-sage-500 to-sage-400' },
                  { label: 'Cloud API', latency: '~200ms', width: 'w-4/12', color: 'from-gold-500 to-gold-400' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-white/60 font-medium">{item.label}</span>
                      <span className="text-[10px] text-terra-300 font-mono">{item.latency}</span>
                    </div>
                    <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${item.color} rounded-full transition-all duration-1000 animate-pulse`} style={{ width: item.width }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick-start models */}
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 space-y-4">
              <p className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Quick-Start Models</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: 'llama3.2:3b', desc: 'Fast & lightweight', size: '2GB', icon: Zap },
                  { name: 'mistral:7b', desc: 'Great all-rounder', size: '4GB', icon: Sparkles },
                  { name: 'neural-chat:7b', desc: 'Chat optimized', size: '4.5GB', icon: MessageSquare },
                  { name: 'orca-mini:3b', desc: 'Budget-friendly', size: '2GB', icon: Settings },
                ].map(m => {
                  const Icon = m.icon
                  return (
                    <div key={m.name} className="flex items-start gap-2.5 border border-white/[0.07] rounded-lg px-3.5 py-3 hover:border-white/[0.12] transition-colors">
                      <Icon size={14} className="text-terra-300 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/80 font-mono font-semibold truncate">{m.name}</p>
                        <p className="text-[9px] text-white/30 mt-0.5">{m.desc} · {m.size}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <NavButtons onBack={goBack} onNext={goNext} nextLabel="Continue" nextHighlight />
          </div>
        )}

        {/* ── Step 6: Capabilities ────────────────────────────────────────── */}
        {step === 'capabilities' && (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold text-white">Desktop Superpowers</h2>
              <p className="text-white/45 text-sm max-w-sm mx-auto">
                Nyra can see your screen and control your computer with your explicit approval.
              </p>
            </div>

            {/* Demo preview */}
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden">
              <div className="h-40 bg-gradient-to-br from-terra-900/30 to-gold-900/20 relative flex items-center justify-center">
                <AnimatedDemoPreview active={step === 'capabilities'} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="border border-white/[0.07] bg-white/[0.02] rounded-xl px-5 py-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-terra-500/15 flex items-center justify-center flex-shrink-0">
                    <Eye size={18} className="text-terra-300" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white font-semibold">Screen Vision</p>
                    <p className="text-[12px] text-white/35 mt-1 leading-relaxed">
                      Captures screenshots for visual AI understanding. On macOS, grant Screen Recording permission.
                    </p>
                    <button onClick={handleTestScreen}
                      className={`mt-3 flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg transition-all font-semibold ${
                        screenTested && screenWorking ? 'bg-sage-500/25 text-sage-300 border border-sage-500/30'
                          : screenTested ? 'bg-blush-500/15 text-blush-300 border border-blush-500/25'
                          : 'bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white/80 border border-white/[0.06]'
                      }`}>
                      {screenTested && screenWorking ? <><Check size={13} /> Working</>
                        : screenTested ? <><Monitor size={13} /> Permission needed</>
                        : <><Monitor size={13} /> Test screen capture</>}
                    </button>
                  </div>
                </div>
              </div>

              <div className="border border-white/[0.07] bg-white/[0.02] rounded-xl px-5 py-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gold-500/15 flex items-center justify-center flex-shrink-0">
                    <Zap size={18} className="text-gold-300" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white font-semibold">Desktop Automation</p>
                    <p className="text-[12px] text-white/35 mt-1">
                      Move the mouse, click, type, launch apps — every action requires your approval.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border border-terra-500/20 bg-terra-500/[0.04] rounded-xl px-5 py-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-terra-500/25 flex items-center justify-center flex-shrink-0">
                    <Shield size={18} className="text-terra-300" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white font-semibold">You're Always in Control</p>
                    <p className="text-[12px] text-white/35 mt-1">
                      Confirmation dialog with risk level and 30s auto-deny. Approve, always allow, or deny.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <NavButtons onBack={goBack} onNext={goNext} nextLabel="Continue" nextHighlight />
          </div>
        )}

        {/* ── Step 7: Ready ───────────────────────────────────────────────── */}
        {step === 'ready' && (
          <div className="text-center space-y-8">
            <div className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-sage-400/30 to-sage-600/20 border border-sage-400/30 shadow-2xl shadow-sage-500/20 animate-bounce">
              <Check size={56} className="text-sage-300" />
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-bold text-white">You're All Set!</h1>
              <p className="text-white/45 text-base leading-relaxed max-w-lg mx-auto">
                {hasConnectedProvider
                  ? 'Nyra is connected and ready. Start a conversation, capture your screen, or explore the power of AI on your desktop.'
                  : 'Nyra is ready to go. Connect a provider in Settings when you\'re ready to start chatting.'}
              </p>
            </div>

            {/* Summary of what was set up */}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {states.filter(s => s.hasKey && s.enabled).map(s => (
                <div key={s.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-sage-500/10 border border-sage-500/25 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-sage-400" />
                  <span className="text-[10px] text-sage-300 font-medium capitalize">{s.id}</span>
                </div>
              ))}
              {selectedModel !== 'auto' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-terra-500/10 border border-terra-500/25 rounded-full">
                  <Cpu size={10} className="text-terra-300" />
                  <span className="text-[10px] text-terra-300 font-medium">{selectedModel.split('/').pop()}</span>
                </div>
              )}
              {ollamaOnline && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-500/10 border border-gold-500/25 rounded-full">
                  <HardDrive size={10} className="text-gold-300" />
                  <span className="text-[10px] text-gold-300 font-medium">Ollama</span>
                </div>
              )}
            </div>

            {/* Tips */}
            <div className="space-y-3 max-w-sm mx-auto pt-2">
              <p className="text-[11px] text-white/25 uppercase tracking-widest font-semibold">Quick Tips</p>
              {[
                { icon: MessageSquare, title: 'Start a Chat', desc: 'Press Cmd+N for a new conversation', color: 'from-terra-500/15' },
                { icon: BookOpen, title: 'Explore Settings', desc: 'Customize providers, channels & more', color: 'from-gold-500/15' },
                { icon: Rocket, title: 'Desktop Control', desc: 'Grant permissions for maximum power', color: 'from-sage-500/15' },
              ].map(item => {
                const Icon = item.icon
                return (
                  <div key={item.title} className={`flex items-start gap-4 bg-gradient-to-r ${item.color} border border-white/[0.07] rounded-xl px-4 py-3.5 hover:border-white/[0.12] transition-colors`}>
                    <Icon size={16} className="text-white/60 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 text-left">
                      <p className="text-sm text-white font-semibold">{item.title}</p>
                      <p className="text-xs text-white/40 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Shortcuts */}
            <div className="space-y-2 max-w-xs mx-auto">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { keys: '⌘K', desc: 'Command Palette' },
                  { keys: '⌘N', desc: 'New Chat' },
                  { keys: '⌘⇧Space', desc: 'Toggle Nyra' },
                ].map(t => (
                  <div key={t.keys} className="flex flex-col items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-2">
                    <code className="text-[10px] text-terra-300 font-bold">{t.keys}</code>
                    <span className="text-[9px] text-white/35">{t.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={onComplete}
              className="inline-flex items-center gap-2 px-10 py-3.5 bg-gradient-to-r from-terra-500 to-terra-400 hover:from-terra-400 hover:to-terra-300 text-white rounded-xl font-semibold text-base transition-all shadow-xl shadow-terra-500/30 hover:scale-105">
              Start Using Nyra <Rocket size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Reusable Nav Buttons ────────────────────────────────────────────────────────
const NavButtons: React.FC<{
  onBack: () => void; onNext: () => void
  nextLabel: string; nextHighlight?: boolean
}> = ({ onBack, onNext, nextLabel, nextHighlight = false }) => (
  <div className="flex items-center justify-between pt-4">
    <button onClick={onBack} className="flex items-center gap-1.5 text-white/30 hover:text-white/70 text-sm transition-colors font-medium">
      <ArrowLeft size={14} /> Back
    </button>
    <button onClick={onNext} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
      nextHighlight
        ? 'bg-terra-500 hover:bg-terra-400 text-white shadow-lg shadow-terra-500/25'
        : 'bg-white/[0.08] text-white/40 hover:text-white/60'
    }`}>
      {nextLabel} <ArrowRight size={14} />
    </button>
  </div>
)

// ── Helper Components ──────────────────────────────────────────────────────────

interface TypedTextProps { text: string; className?: string }

const TypedText: React.FC<TypedTextProps> = ({ text, className = '' }) => {
  const [displayText, setDisplayText] = useState('')
  useEffect(() => {
    if (displayText.length < text.length) {
      const timer = setTimeout(() => setDisplayText(text.slice(0, displayText.length + 1)), 25)
      return () => clearTimeout(timer)
    }
  }, [displayText, text])
  return <p className={className}>{displayText}</p>
}

const AnimatedDemoPreview: React.FC<{ active: boolean }> = ({ active }) => {
  const [cursorPos, setCursorPos] = useState({ x: 20, y: 20 })
  useEffect(() => {
    if (!active) return
    const seq = [{ x: 20, y: 20 }, { x: 60, y: 50 }, { x: 90, y: 80 }, { x: 60, y: 50 }, { x: 20, y: 20 }]
    let i = 0
    const timer = setInterval(() => { i = (i + 1) % seq.length; setCursorPos(seq[i]) }, 600)
    return () => clearInterval(timer)
  }, [active])
  return (
    <div className="relative w-32 h-24 mx-auto bg-gradient-to-br from-terra-900/40 to-white/5 border border-terra-400/20 rounded-lg overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-[9px] text-white/30 pointer-events-none">Mock Screen</div>
      </div>
      <div className="absolute w-5 h-5 rounded-full border-2 border-terra-400 transition-all duration-500"
        style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%`, transform: 'translate(-50%, -50%)', boxShadow: '0 0 8px rgba(218, 104, 59, 0.6)' }}
      />
    </div>
  )
}

const ConfettiAnimation: React.FC = () => {
  const confetti = Array.from({ length: 12 }, (_, i) => ({
    id: i, left: Math.random() * 100, delay: Math.random() * 0.5, duration: 2 + Math.random() * 0.5,
  }))
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      <style>{`
        @keyframes confettiFall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(360deg); opacity: 0; } }
        .animate-confetti { animation: confettiFall linear forwards; }
      `}</style>
      {confetti.map(c => (
        <div key={c.id} className="absolute w-2 h-2 rounded-full animate-confetti"
          style={{ left: `${c.left}%`, top: '-10px', background: ['#da683b', '#f5d376', '#8ac471'][Math.floor(Math.random() * 3)], animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s` }}
        />
      ))}
    </div>
  )
}

export default Onboarding
