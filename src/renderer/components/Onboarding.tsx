/**
 * Onboarding Wizard — first-run flow for new users
 *
 * Steps:
 *  1. Welcome + value proposition
 *  2. Provider setup (API key or OAuth sign-in)
 *  3. Local LLMs (Ollama detection + optional pull)
 *  4. Screen capture permission + desktop control intro
 *  5. Ready to go
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowRight, ArrowLeft, Check, Loader2, ExternalLink,
  Monitor, Cpu, Shield, Sparkles, Key, Zap,
  ChevronRight, HardDrive, Eye,
} from 'lucide-react'

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

type Step = 'welcome' | 'provider' | 'ollama' | 'capabilities' | 'ready'
const STEPS: Step[] = ['welcome', 'provider', 'ollama', 'capabilities', 'ready']

// ── Main Component ─────────────────────────────────────────────────────────────
export const Onboarding: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>('welcome')
  const [animating, setAnimating] = useState(false)

  // Provider state
  const [catalog, setCatalog] = useState<ProviderDef[]>([])
  const [states, setStates] = useState<ProviderState[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)

  // Ollama state
  const [ollamaOnline, setOllamaOnline] = useState(false)
  const [ollamaChecking, setOllamaChecking] = useState(true)
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string }>>([])

  // Screen capture state
  const [screenTested, setScreenTested] = useState(false)
  const [screenWorking, setScreenWorking] = useState(false)

  // Error state
  const [error, setError] = useState<string | null>(null)

  // Load provider catalog
  useEffect(() => {
    window.nyra.providers.catalog().then(setCatalog).catch(() => {})
    window.nyra.providers.list().then(setStates).catch(() => {})

    // OAuth completion listener
    window.nyra.providers.onOAuthComplete(async () => {
      setOauthLoading(false)
      setStates(await window.nyra.providers.list())
    })
    return () => { window.nyra.providers.removeOAuthListeners() }
  }, [])

  // Check Ollama when reaching that step
  useEffect(() => {
    if (step === 'ollama') {
      setOllamaChecking(true)
      window.nyra.ollama.status().then(online => {
        setOllamaOnline(online)
        if (online) {
          window.nyra.ollama.models().then(models => setOllamaModels(models)).catch(() => {})
        }
        setOllamaChecking(false)
      }).catch(() => setOllamaChecking(false))
    }
  }, [step])

  const stepIndex = STEPS.indexOf(step)
  const hasConnectedProvider = states.some(s => s.hasKey && s.enabled)

  const goNext = useCallback(() => {
    if (stepIndex < STEPS.length - 1) {
      setAnimating(true)
      setTimeout(() => {
        setStep(STEPS[stepIndex + 1])
        setAnimating(false)
      }, 150)
    }
  }, [stepIndex])

  const goBack = useCallback(() => {
    if (stepIndex > 0) {
      setAnimating(true)
      setTimeout(() => {
        setStep(STEPS[stepIndex - 1])
        setAnimating(false)
      }, 150)
    }
  }, [stepIndex])

  const handleSaveKey = async () => {
    if (!selectedProvider || !apiKey.trim()) return
    setSavingKey(true)
    setError(null)
    try {
      await window.nyra.providers.saveKey(selectedProvider, apiKey.trim())
      setStates(await window.nyra.providers.list())
      setApiKey('')
    } catch (err) {
      setError(`Failed to save API key: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSavingKey(false)
    }
  }

  const handleOAuth = async (providerId: string) => {
    setOauthLoading(true)
    setError(null)
    try {
      if (providerId === 'copilot') {
        await window.nyra.providers.githubDeviceFlow()
      } else {
        await window.nyra.providers.startOAuth(providerId)
      }
    } catch (err) {
      setError(`Sign-in failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setOauthLoading(false)
    }
  }

  const handleTestScreen = async () => {
    try {
      const result = await window.nyra.screen.capture()
      setScreenTested(true)
      setScreenWorking(result !== null)
    } catch {
      setScreenTested(true)
      setScreenWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0b0a08] flex items-center justify-center">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-terra-900/20 via-transparent to-gold-900/10 pointer-events-none" />
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-terra-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className={`relative w-full max-w-lg mx-4 transition-opacity duration-150 ${animating ? 'opacity-0' : 'opacity-100'}`}>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`transition-all duration-300 rounded-full ${
                i === stepIndex
                  ? 'w-8 h-2 bg-terra-400'
                  : i < stepIndex
                  ? 'w-2 h-2 bg-terra-400/50'
                  : 'w-2 h-2 bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* ── Step 1: Welcome ──────────────────────────────────────────────── */}
        {step === 'welcome' && (
          <div className="text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-terra-400/20 to-terra-600/20 border border-terra-400/20 shadow-2xl shadow-terra-500/10">
              <Sparkles size={36} className="text-terra-300" />
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-bold text-white">Welcome to Nyra</h1>
              <p className="text-white/40 text-sm leading-relaxed max-w-md mx-auto">
                The open AI desktop agent that can see your screen, control your computer,
                use any AI model, and connect to all your tools.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto pt-2">
              {[
                { icon: Eye, label: 'Screen vision', desc: 'Sees what you see' },
                { icon: Monitor, label: 'Desktop control', desc: 'Click, type, automate' },
                { icon: Cpu, label: 'Any AI model', desc: 'Cloud or local' },
                { icon: Shield, label: 'You\'re in control', desc: 'Approve every action' },
              ].map(f => (
                <div key={f.label} className="flex items-start gap-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-left">
                  <f.icon size={16} className="text-terra-300/70 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-white/70 font-medium">{f.label}</p>
                    <p className="text-[10px] text-white/30">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={goNext}
              className="inline-flex items-center gap-2 px-6 py-3 bg-terra-400 hover:bg-terra-500 text-white rounded-xl font-medium text-sm transition-colors shadow-lg shadow-terra-500/20 mt-2"
            >
              Get Started <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step 2: Provider Setup ──────────────────────────────────────── */}
        {step === 'provider' && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-white">Connect an AI Provider</h2>
              <p className="text-white/35 text-sm">
                Choose a provider to power Nyra. You can add more later in Settings.
              </p>
            </div>

            <div className="space-y-2">
              {catalog.map(def => {
                const state = states.find(s => s.id === def.id)
                const isConnected = state?.hasKey && state?.enabled
                const isSelected = selectedProvider === def.id

                return (
                  <button
                    key={def.id}
                    onClick={() => setSelectedProvider(isSelected ? null : def.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                      isConnected
                        ? 'border-sage-500/30 bg-sage-500/[0.05]'
                        : isSelected
                        ? 'border-terra-400/40 bg-terra-400/[0.05]'
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'
                    }`}
                  >
                    <span className="text-xl">{def.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm text-white/80 font-medium">{def.label}</p>
                      <p className="text-[10px] text-white/30">
                        {isConnected ? '✓ Connected' : `${def.models.length} models available`}
                      </p>
                    </div>
                    {isConnected ? (
                      <Check size={16} className="text-sage-400" />
                    ) : (
                      <ChevronRight size={14} className={`text-white/20 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Expanded auth for selected provider */}
            {selectedProvider && !states.find(s => s.id === selectedProvider)?.hasKey && (
              <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-4 space-y-3">
                {/* OAuth buttons for supported providers */}
                {(selectedProvider === 'openai' || selectedProvider === 'anthropic' || selectedProvider === 'copilot') && (
                  <>
                    <button
                      onClick={() => handleOAuth(selectedProvider)}
                      disabled={oauthLoading}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-terra-500/80 hover:bg-terra-400 disabled:bg-terra-500/40 text-white text-xs rounded-xl transition-colors font-medium"
                    >
                      {oauthLoading
                        ? <><Loader2 size={12} className="animate-spin" /> Waiting for sign-in...</>
                        : <><ExternalLink size={12} /> Sign in with {catalog.find(c => c.id === selectedProvider)?.label}</>
                      }
                    </button>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-white/[0.06]" />
                      <span className="text-[10px] text-white/20">or paste API key</span>
                      <div className="flex-1 h-px bg-white/[0.06]" />
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                    placeholder={catalog.find(c => c.id === selectedProvider)?.apiKeyPrefix
                      ? `${catalog.find(c => c.id === selectedProvider)!.apiKeyPrefix}...`
                      : 'Paste your API key'}
                    className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 placeholder-white/20 outline-none focus:border-terra-400/50 font-mono"
                  />
                  <button
                    onClick={handleSaveKey}
                    disabled={!apiKey.trim() || savingKey}
                    className="px-3 py-2 bg-sage-600/80 hover:bg-sage-500 disabled:bg-white/[0.05] disabled:text-white/20 text-white text-xs rounded-lg transition-colors font-medium flex items-center gap-1.5"
                  >
                    {savingKey ? <Loader2 size={11} className="animate-spin" /> : <Key size={11} />}
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-300">
                <span className="flex-shrink-0">⚠</span>
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="text-red-300/50 hover:text-red-300 flex-shrink-0">✕</button>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button onClick={goBack} className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <button
                onClick={goNext}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  hasConnectedProvider
                    ? 'bg-terra-400 hover:bg-terra-500 text-white'
                    : 'bg-white/[0.06] text-white/40 hover:text-white/60'
                }`}
              >
                {hasConnectedProvider ? 'Continue' : 'Skip for now'} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Ollama / Local LLMs ─────────────────────────────────── */}
        {step === 'ollama' && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-white">Local AI Models</h2>
              <p className="text-white/35 text-sm">
                Run AI models privately on your machine with Ollama. No cloud, no API keys.
              </p>
            </div>

            <div className={`flex items-center gap-3 border rounded-xl px-4 py-3 ${
              ollamaOnline ? 'border-sage-500/25 bg-sage-500/[0.03]' : 'border-white/[0.07] bg-white/[0.02]'
            }`}>
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                ollamaChecking ? 'bg-gold-400 animate-pulse' : ollamaOnline ? 'bg-sage-400' : 'bg-red-500'
              }`} />
              <div className="flex-1">
                <p className="text-sm text-white font-medium">
                  {ollamaChecking ? 'Checking for Ollama…' : ollamaOnline ? 'Ollama Detected' : 'Ollama Not Found'}
                </p>
                {ollamaOnline && ollamaModels.length > 0 && (
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''} installed: {ollamaModels.map(m => m.name).slice(0, 3).join(', ')}
                    {ollamaModels.length > 3 && ` +${ollamaModels.length - 3} more`}
                  </p>
                )}
                {!ollamaOnline && !ollamaChecking && (
                  <p className="text-[10px] text-white/30 mt-0.5">
                    Install Ollama to run models like Llama 3, Mistral, and Phi-4 locally
                  </p>
                )}
              </div>
              {!ollamaOnline && !ollamaChecking && (
                <button
                  onClick={() => window.nyra.app.openExternal('https://ollama.com')}
                  className="px-3 py-2 bg-terra-400 hover:bg-terra-500 text-white text-xs rounded-lg transition-colors font-medium flex items-center gap-1.5 flex-shrink-0"
                >
                  <ExternalLink size={11} /> Get Ollama
                </button>
              )}
            </div>

            {ollamaOnline && (
              <div className="bg-white/[0.02] border border-white/[0.07] rounded-xl p-4 space-y-2">
                <p className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">Recommended Models</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: 'llama3.2:3b', desc: 'Fast & lightweight', size: '2GB' },
                    { name: 'mistral:7b', desc: 'Great all-rounder', size: '4GB' },
                    { name: 'codestral:22b', desc: 'Code specialist', size: '12GB' },
                    { name: 'phi4:14b', desc: 'Reasoning model', size: '8GB' },
                  ].map(m => (
                    <div key={m.name} className="flex items-center gap-2 border border-white/[0.06] rounded-lg px-3 py-2">
                      <HardDrive size={12} className="text-white/20 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/70 font-mono truncate">{m.name}</p>
                        <p className="text-[9px] text-white/25">{m.desc} · {m.size}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-white/20 pt-1">
                  Pull models from Settings → Local LLMs after setup.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button onClick={goBack} className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <button
                onClick={goNext}
                className="flex items-center gap-2 px-5 py-2.5 bg-terra-400 hover:bg-terra-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Capabilities ────────────────────────────────────────── */}
        {step === 'capabilities' && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-white">Desktop Superpowers</h2>
              <p className="text-white/35 text-sm">
                Nyra can see your screen and control your computer — with your permission.
              </p>
            </div>

            <div className="space-y-3">
              {/* Screen capture */}
              <div className="border border-white/[0.07] bg-white/[0.02] rounded-xl px-4 py-3">
                <div className="flex items-start gap-3">
                  <Eye size={18} className="text-terra-300 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium">Screen Vision</p>
                    <p className="text-[11px] text-white/30 mt-0.5 leading-relaxed">
                      Nyra captures screenshots and sends them to your AI model for visual understanding.
                      On macOS, you may need to grant Screen Recording permission.
                    </p>
                    <button
                      onClick={handleTestScreen}
                      className={`mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors font-medium ${
                        screenTested && screenWorking
                          ? 'bg-sage-500/15 text-sage-400 border border-sage-500/20'
                          : 'bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white/80'
                      }`}
                    >
                      {screenTested && screenWorking ? (
                        <><Check size={12} /> Screen capture working</>
                      ) : screenTested ? (
                        <><Monitor size={12} /> Permission needed — check System Settings</>
                      ) : (
                        <><Monitor size={12} /> Test screen capture</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Desktop control */}
              <div className="border border-white/[0.07] bg-white/[0.02] rounded-xl px-4 py-3">
                <div className="flex items-start gap-3">
                  <Zap size={18} className="text-gold-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium">Desktop Automation</p>
                    <p className="text-[11px] text-white/30 mt-0.5 leading-relaxed">
                      Nyra can move the mouse, click, type, and launch apps. Every action requires
                      your explicit approval via a confirmation overlay.
                    </p>
                  </div>
                </div>
              </div>

              {/* Safety */}
              <div className="border border-terra-400/15 bg-terra-400/[0.02] rounded-xl px-4 py-3">
                <div className="flex items-start gap-3">
                  <Shield size={18} className="text-terra-300 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium">You're Always in Control</p>
                    <p className="text-[11px] text-white/30 mt-0.5 leading-relaxed">
                      Desktop actions show a confirmation dialog with risk level, parameters, and a 30-second
                      auto-deny timer. You can choose "Allow Once", "Always Allow", or "Deny".
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={goBack} className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              <button
                onClick={goNext}
                className="flex items-center gap-2 px-5 py-2.5 bg-terra-400 hover:bg-terra-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Ready ───────────────────────────────────────────────── */}
        {step === 'ready' && (
          <div className="text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-sage-400/20 to-sage-600/20 border border-sage-400/20 shadow-2xl shadow-sage-500/10">
              <Check size={36} className="text-sage-300" />
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-bold text-white">You're All Set</h1>
              <p className="text-white/40 text-sm leading-relaxed max-w-md mx-auto">
                {hasConnectedProvider
                  ? 'Nyra is connected and ready. Start a conversation, capture your screen, or explore what AI can do on your desktop.'
                  : 'Nyra is ready to go. Connect a provider in Settings when you\'re ready to start chatting.'}
              </p>
            </div>

            <div className="space-y-2 max-w-xs mx-auto text-left">
              <p className="text-[10px] text-white/25 uppercase tracking-widest font-semibold text-center mb-2">Quick tips</p>
              {[
                { keys: '⌘K', desc: 'Open command palette' },
                { keys: '⌘N', desc: 'New chat' },
                { keys: '⌘⇧Space', desc: 'Show / hide Nyra' },
              ].map(t => (
                <div key={t.keys} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                  <code className="text-[11px] text-terra-300 font-mono bg-terra-400/10 px-1.5 py-0.5 rounded">{t.keys}</code>
                  <span className="text-xs text-white/40">{t.desc}</span>
                </div>
              ))}
            </div>

            <button
              onClick={onComplete}
              className="inline-flex items-center gap-2 px-8 py-3 bg-terra-400 hover:bg-terra-500 text-white rounded-xl font-medium text-sm transition-colors shadow-lg shadow-terra-500/20 mt-2"
            >
              Start Using Nyra <Sparkles size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Onboarding
