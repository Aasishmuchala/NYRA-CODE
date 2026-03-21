/**
 * A/B Testing Panel — Run same prompt against multiple models, compare & score
 */
import React, { useEffect, useState } from 'react'
import { FlaskConical, Plus, Play, Star, Trash2, Loader2, BarChart3, X } from 'lucide-react'

interface ABVariant {
  id: string; testId: string; providerId: string; modelId: string
  response?: string; latencyMs?: number; tokenUsage?: { input: number; output: number }
  score?: number; notes?: string; status: string; error?: string; timestamp: number
}
interface ABTest {
  id: string; name: string; prompt: string; systemPrompt?: string
  variants: ABVariant[]; status: string; createdAt: number; completedAt?: number
}
interface ABStats {
  totalTests: number; totalVariants: number; avgScore: number
  modelRankings: Array<{ modelId: string; avgScore: number; count: number }>
}

type View = 'list' | 'create' | 'detail' | 'stats'

const ABTestingPanel: React.FC = () => {
  const [view, setView] = useState<View>('list')
  const [tests, setTests] = useState<ABTest[]>([])
  const [selectedTest, setSelectedTest] = useState<ABTest | null>(null)
  const [stats, setStats] = useState<ABStats | null>(null)
  const [running, setRunning] = useState(false)

  // Create form
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [newSystemPrompt, setNewSystemPrompt] = useState('')
  const [newModels, setNewModels] = useState([
    { providerId: 'anthropic', modelId: 'claude-3.5-sonnet' },
    { providerId: 'openai', modelId: 'gpt-4o' },
  ])

  const fetchTests = async () => {
    try {
      const r = await window.nyra.abTesting.listTests(20)
      if (r.success) setTests(r.result)
    } catch {}
  }

  const fetchStats = async () => {
    try {
      const r = await window.nyra.abTesting.getStats()
      if (r.success) setStats(r.result)
    } catch {}
  }

  useEffect(() => { fetchTests(); fetchStats() }, [])

  const handleCreate = async () => {
    if (!newName.trim() || !newPrompt.trim()) return
    try {
      const r = await window.nyra.abTesting.createTest(newName, newPrompt, newModels, newSystemPrompt || undefined)
      if (r.success) {
        setSelectedTest(r.result)
        setView('detail')
        setNewName(''); setNewPrompt(''); setNewSystemPrompt('')
        fetchTests()
      }
    } catch {}
  }

  const handleRunTest = async (testId: string) => {
    setRunning(true)
    try {
      const r = await window.nyra.abTesting.runTest(testId)
      if (r.success) { setSelectedTest(r.result); fetchTests(); fetchStats() }
    } catch {}
    setRunning(false)
  }

  const handleScore = async (variantId: string, score: number) => {
    try {
      await window.nyra.abTesting.scoreVariant(variantId, score)
      if (selectedTest) {
        const r = await window.nyra.abTesting.getTest(selectedTest.id)
        if (r.success) setSelectedTest(r.result)
      }
      fetchStats()
    } catch {}
  }

  const handleDelete = async (testId: string) => {
    try {
      await window.nyra.abTesting.deleteTest(testId)
      if (selectedTest?.id === testId) { setSelectedTest(null); setView('list') }
      fetchTests(); fetchStats()
    } catch {}
  }

  const addModelRow = () => setNewModels(prev => [...prev, { providerId: 'anthropic', modelId: '' }])
  const removeModelRow = (idx: number) => setNewModels(prev => prev.filter((_, i) => i !== idx))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <FlaskConical size={16} className="text-gold-300" />
        <h2 className="text-sm font-semibold text-white/80">A/B Testing</h2>
        <div className="ml-auto flex gap-1">
          <button onClick={() => { setView('stats'); fetchStats() }}
            className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${view === 'stats' ? 'bg-gold-400/15 text-gold-300' : 'text-white/30 hover:text-white/50'}`}>
            <BarChart3 size={10} className="inline mr-1" />Stats
          </button>
          <button onClick={() => setView('create')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-400/15 text-gold-300 text-[10px] font-medium hover:bg-gold-400/25 transition-colors">
            <Plus size={10} /> New Test
          </button>
        </div>
      </div>

      {view === 'create' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-medium text-white/60">Create A/B Test</h3>
            <button onClick={() => setView('list')} className="text-white/20 hover:text-white/40"><X size={14} /></button>
          </div>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Test name..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[12px] text-white/70 placeholder:text-white/20 outline-none" />
          <textarea value={newPrompt} onChange={e => setNewPrompt(e.target.value)} placeholder="Test prompt..."
            className="w-full h-20 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[12px] text-white/70 placeholder:text-white/20 outline-none resize-none font-mono" />
          <input value={newSystemPrompt} onChange={e => setNewSystemPrompt(e.target.value)} placeholder="System prompt (optional)..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-white/50 placeholder:text-white/15 outline-none" />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-white/30 uppercase tracking-wider">Models to compare</label>
              <button onClick={addModelRow} className="text-[10px] text-gold-300/60 hover:text-gold-300"><Plus size={10} className="inline" /> Add</button>
            </div>
            {newModels.map((m, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <select value={m.providerId} onChange={e => { const copy = [...newModels]; copy[idx].providerId = e.target.value; setNewModels(copy) }}
                  className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1 text-[11px] text-white/50 outline-none">
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama</option>
                </select>
                <input value={m.modelId} onChange={e => { const copy = [...newModels]; copy[idx].modelId = e.target.value; setNewModels(copy) }}
                  placeholder="Model ID" className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1 text-[11px] text-white/50 placeholder:text-white/15 outline-none font-mono" />
                {newModels.length > 1 && (
                  <button onClick={() => removeModelRow(idx)} className="text-blush-400/20 hover:text-blush-400/60"><Trash2 size={11} /></button>
                )}
              </div>
            ))}
          </div>

          <button onClick={handleCreate} disabled={!newName.trim() || !newPrompt.trim() || newModels.some(m => !m.modelId)}
            className="w-full py-2 rounded-lg bg-gold-400/20 text-gold-300 text-[11px] font-medium hover:bg-gold-400/30 transition-colors disabled:opacity-30">
            Create Test
          </button>
        </div>
      )}

      {view === 'detail' && selectedTest && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={() => { setView('list'); setSelectedTest(null) }} className="text-[10px] text-white/30 hover:text-white/50">&larr; Back</button>
            <div className="flex items-center gap-1.5">
              {selectedTest.status === 'pending' && (
                <button onClick={() => handleRunTest(selectedTest.id)} disabled={running}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gold-400/15 text-gold-300 text-[10px] font-medium hover:bg-gold-400/25 disabled:opacity-40">
                  {running ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                  {running ? 'Running...' : 'Run Test'}
                </button>
              )}
              <button onClick={() => handleDelete(selectedTest.id)} className="p-1.5 rounded-lg text-blush-400/30 hover:text-blush-400/70"><Trash2 size={12} /></button>
            </div>
          </div>

          <h3 className="text-[14px] font-medium text-white/80">{selectedTest.name}</h3>
          <pre className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 text-[10px] text-white/40 font-mono whitespace-pre-wrap">{selectedTest.prompt}</pre>

          <div className="space-y-2">
            {selectedTest.variants.map(v => (
              <div key={v.id} className={`border rounded-lg p-3 ${v.status === 'error' ? 'border-blush-400/20 bg-blush-400/5' : v.status === 'completed' ? 'border-white/[0.06] bg-white/[0.02]' : 'border-white/[0.04] bg-white/[0.01]'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] text-white/50 font-mono">{v.providerId}/{v.modelId}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    v.status === 'completed' ? 'bg-sage-400/10 text-sage-300/50' :
                    v.status === 'error' ? 'bg-blush-400/10 text-blush-300/50' :
                    v.status === 'running' ? 'bg-gold-400/10 text-gold-300/50' :
                    'bg-white/[0.04] text-white/20'
                  }`}>{v.status}</span>
                  {v.latencyMs && <span className="text-[9px] text-white/15 ml-auto">{v.latencyMs}ms</span>}
                </div>

                {v.response && (
                  <pre className="text-[10px] text-white/40 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto mb-2 leading-relaxed">{v.response.slice(0, 500)}{v.response.length > 500 ? '...' : ''}</pre>
                )}
                {v.error && <p className="text-[10px] text-blush-300/50 mb-2">{v.error}</p>}

                {v.status === 'completed' && (
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-white/20 mr-1">Score:</span>
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} onClick={() => handleScore(v.id, s)}
                        className={`p-0.5 ${(v.score || 0) >= s ? 'text-gold-400' : 'text-white/10 hover:text-white/30'}`}>
                        <Star size={12} fill={(v.score || 0) >= s ? 'currentColor' : 'none'} />
                      </button>
                    ))}
                    {v.score && <span className="text-[10px] text-gold-400/60 ml-2">{v.score}/5</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {tests.map(t => (
            <button key={t.id} onClick={() => { setSelectedTest(t); setView('detail') }}
              className="w-full text-left bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 hover:border-white/[0.08] transition-colors">
              <div className="flex items-center gap-2">
                <FlaskConical size={10} className="text-gold-300/50" />
                <h3 className="text-[12px] font-medium text-white/70 truncate flex-1">{t.name}</h3>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                  t.status === 'completed' ? 'bg-sage-400/10 text-sage-300/50' :
                  t.status === 'running' ? 'bg-gold-400/10 text-gold-300/50' :
                  'bg-white/[0.04] text-white/20'
                }`}>{t.status}</span>
              </div>
              <p className="text-[10px] text-white/25 mt-1 truncate">{t.prompt.slice(0, 60)}...</p>
              <div className="flex items-center gap-2 mt-1 text-[9px] text-white/15">
                <span>{t.variants.length} variants</span>
                <span>{new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
          {tests.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-white/15 text-[11px]">
              <FlaskConical size={20} className="mb-2 opacity-30" />No A/B tests yet
            </div>
          )}
        </div>
      )}

      {view === 'stats' && stats && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <button onClick={() => setView('list')} className="text-[10px] text-white/30 hover:text-white/50">&larr; Back</button>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total Tests', value: stats.totalTests },
              { label: 'Total Variants', value: stats.totalVariants },
              { label: 'Avg Score', value: stats.avgScore ? `${stats.avgScore}/5` : '—' },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 text-center">
                <p className="text-[18px] font-semibold text-white/70">{s.value}</p>
                <p className="text-[9px] text-white/25 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {stats.modelRankings.length > 0 && (
            <div>
              <h3 className="text-[11px] font-medium text-white/40 mb-2">Model Rankings</h3>
              <div className="space-y-1.5">
                {stats.modelRankings.map((m, idx) => (
                  <div key={m.modelId} className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5">
                    <span className="text-[14px] font-bold text-white/20 w-6 text-center">#{idx + 1}</span>
                    <span className="text-[11px] text-white/50 font-mono flex-1">{m.modelId}</span>
                    <div className="flex items-center gap-1">
                      <Star size={10} className="text-gold-400" fill="currentColor" />
                      <span className="text-[11px] text-gold-400/70">{m.avgScore}</span>
                    </div>
                    <span className="text-[9px] text-white/15">{m.count} tests</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ABTestingPanel
