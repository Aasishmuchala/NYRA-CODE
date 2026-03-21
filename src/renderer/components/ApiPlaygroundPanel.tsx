/**
 * API Playground Panel — Test provider endpoints with custom payloads
 */
import React, { useEffect, useState } from 'react'
import { Play, Clock, Save, Trash2, AlertTriangle, Check, Loader2, BookOpen, ChevronDown } from 'lucide-react'

interface PlaygroundRequest {
  id: string; providerId: string; modelId: string; endpoint: string; payload: Record<string, unknown>
  response?: string; statusCode?: number; latencyMs?: number; error?: string; timestamp: number
  tokenUsage?: { input: number; output: number; total: number }
}
interface Preset { id: string; name: string; providerId: string; modelId: string; endpoint: string; payload: Record<string, unknown> }

type Tab = 'playground' | 'history' | 'presets'

const ApiPlaygroundPanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>('playground')
  const [providerId, setProviderId] = useState('anthropic')
  const [modelId, setModelId] = useState('claude-3.5-sonnet')
  const [endpoint, setEndpoint] = useState('/v1/messages')
  const [payload, setPayload] = useState('{\n  "messages": [{"role": "user", "content": "Hello!"}],\n  "max_tokens": 256,\n  "temperature": 0.7\n}')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PlaygroundRequest | null>(null)
  const [history, setHistory] = useState<PlaygroundRequest[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [showPresetDropdown, setShowPresetDropdown] = useState(false)

  const fetchHistory = async () => {
    try {
      const r = await window.nyra.apiPlayground.getHistory(20)
      if (r.success) setHistory(r.result)
    } catch {}
  }

  const fetchPresets = async () => {
    try {
      const r = await window.nyra.apiPlayground.listPresets()
      if (r.success) setPresets(r.result)
    } catch {}
  }

  useEffect(() => { fetchHistory(); fetchPresets() }, [])

  const handleExecute = async () => {
    setRunning(true)
    setResult(null)
    try {
      const parsed = JSON.parse(payload)
      const r = await window.nyra.apiPlayground.execute(providerId, modelId, endpoint, parsed)
      if (r.success) setResult(r.result)
      fetchHistory()
    } catch (err: any) {
      setResult({ id: '', providerId, modelId, endpoint, payload: {}, error: err.message || 'Invalid JSON', timestamp: Date.now() })
    }
    setRunning(false)
  }

  const loadPreset = (preset: Preset) => {
    setProviderId(preset.providerId)
    setModelId(preset.modelId)
    setEndpoint(preset.endpoint)
    setPayload(JSON.stringify(preset.payload, null, 2))
    setShowPresetDropdown(false)
    setTab('playground')
  }

  const handleSavePreset = async () => {
    const name = prompt('Preset name:')
    if (!name) return
    try {
      const parsed = JSON.parse(payload)
      await window.nyra.apiPlayground.savePreset(name, providerId, modelId, endpoint, parsed)
      fetchPresets()
    } catch {}
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Play size={16} className="text-gold-300" />
        <h2 className="text-sm font-semibold text-white/80">API Playground</h2>
        <div className="ml-auto flex gap-1">
          {(['playground', 'history', 'presets'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${tab === t ? 'bg-gold-400/15 text-gold-300' : 'text-white/30 hover:text-white/50'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'playground' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Config row */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <select value={providerId} onChange={e => setProviderId(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-white/60 outline-none appearance-none">
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>
            <input value={modelId} onChange={e => setModelId(e.target.value)} placeholder="Model ID"
              className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-white/60 placeholder:text-white/20 outline-none font-mono" />
          </div>

          <input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="Endpoint"
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-white/60 placeholder:text-white/20 outline-none font-mono" />

          {/* Presets dropdown */}
          <div className="relative">
            <button onClick={() => setShowPresetDropdown(d => !d)}
              className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/50">
              <BookOpen size={10} /> Load preset <ChevronDown size={8} />
            </button>
            {showPresetDropdown && presets.length > 0 && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowPresetDropdown(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 bg-[#161411] border border-white/10 rounded-lg shadow-xl py-1 min-w-[200px]">
                  {presets.map(p => (
                    <button key={p.id} onClick={() => loadPreset(p)} className="w-full text-left px-3 py-1.5 text-[11px] text-white/50 hover:text-white/80 hover:bg-white/[0.04]">
                      {p.name} <span className="text-white/15 text-[9px]">({p.providerId}/{p.modelId})</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Payload editor */}
          <textarea value={payload} onChange={e => setPayload(e.target.value)}
            className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2.5 text-[11px] text-white/60 font-mono outline-none focus:border-gold-400/30 h-28 resize-none leading-relaxed" />

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleExecute} disabled={running}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gold-400/20 text-gold-300 text-[11px] font-medium hover:bg-gold-400/30 transition-colors disabled:opacity-40">
              {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {running ? 'Running...' : 'Send Request'}
            </button>
            <button onClick={handleSavePreset} className="px-3 py-2 rounded-lg bg-white/[0.04] text-white/30 hover:text-white/50 text-[10px]">
              <Save size={12} />
            </button>
          </div>

          {/* Result */}
          {result && (
            <div className={`border rounded-lg p-3 ${result.error ? 'border-blush-400/20 bg-blush-400/5' : 'border-sage-400/20 bg-sage-400/5'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.error
                  ? <AlertTriangle size={12} className="text-blush-400/60" />
                  : <Check size={12} className="text-sage-400/60" />
                }
                <span className={`text-[11px] font-medium ${result.error ? 'text-blush-400/60' : 'text-sage-400/60'}`}>
                  {result.statusCode || 'Error'} {result.error ? 'Failed' : 'Success'}
                </span>
                {result.latencyMs && (
                  <span className="text-[9px] text-white/20 ml-auto flex items-center gap-1"><Clock size={8} />{result.latencyMs}ms</span>
                )}
                {result.tokenUsage && (
                  <span className="text-[9px] text-white/15">{result.tokenUsage.total} tokens</span>
                )}
              </div>
              <pre className="text-[10px] text-white/40 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                {result.error || result.response || 'No response body'}
              </pre>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {history.map(req => (
            <button key={req.id} onClick={() => { setResult(req); setTab('playground') }}
              className="w-full text-left bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 hover:border-white/[0.08] transition-colors">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${req.error ? 'bg-blush-400/60' : 'bg-sage-400/60'}`} />
                <span className="text-[10px] text-white/40 font-mono">{req.providerId}/{req.modelId}</span>
                <span className="text-[9px] text-white/15 ml-auto">{req.latencyMs}ms</span>
                <span className="text-[9px] text-white/10">{new Date(req.timestamp).toLocaleTimeString()}</span>
              </div>
            </button>
          ))}
          {history.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-white/15 text-[11px]">No request history yet</div>
          )}
        </div>
      )}

      {tab === 'presets' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {presets.map(p => (
            <div key={p.id} className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 hover:border-white/[0.08] transition-colors">
              <div className="flex-1 min-w-0">
                <h4 className="text-[12px] font-medium text-white/60">{p.name}</h4>
                <p className="text-[9px] text-white/20 font-mono">{p.providerId} / {p.modelId}</p>
              </div>
              <button onClick={() => loadPreset(p)} className="px-3 py-1 rounded-lg bg-gold-400/10 text-gold-300/50 text-[10px] hover:bg-gold-400/20">Load</button>
              <button onClick={async () => { await window.nyra.apiPlayground.deletePreset(p.id); fetchPresets() }}
                className="p-1.5 rounded-lg text-blush-400/20 hover:text-blush-400/60"><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ApiPlaygroundPanel
