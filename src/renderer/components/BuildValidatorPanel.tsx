/**
 * Build Validator Panel — Run system health checks
 */
import React, { useState, useEffect } from 'react'
import { ShieldCheck, Play, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react'

interface ValidationCheck { name: string; category: string; status: string; message: string; detail?: string }
interface ValidationResult { id: string; checks: ValidationCheck[]; passed: number; failed: number; warnings: number; score: number; timestamp: number }

const STATUS_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircle size={11} className="text-sage-300" />,
  fail: <XCircle size={11} className="text-blush-300" />,
  warn: <AlertTriangle size={11} className="text-gold-300" />,
}

const BuildValidatorPanel: React.FC = () => {
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [history, setHistory] = useState<Array<{ id: string; score: number; passed: number; failed: number; timestamp: number }>>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = async () => { try { const r = await window.nyra.buildValidator.history(10); if (r.success) setHistory(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) } }
  useEffect(() => { fetchHistory() }, [])

  const handleRun = async () => {
    setRunning(true)
    try { const r = await window.nyra.buildValidator.run(); if (r.success) { setResult(r.result); fetchHistory() } } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
    setRunning(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <ShieldCheck size={16} className="text-sage-300" />
        <h2 className="text-sm font-semibold text-white/80">Build Validator</h2>
        <button onClick={handleRun} disabled={running}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sage-400/15 text-sage-300 text-[10px] font-medium hover:bg-sage-400/25 disabled:opacity-40">
          <Play size={10} /> {running ? 'Running...' : 'Run Validation'}
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      {result && (
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-[20px] font-bold ${result.score >= 80 ? 'bg-sage-400/15 text-sage-300' : result.score >= 50 ? 'bg-gold-400/15 text-gold-300' : 'bg-blush-400/15 text-blush-300'}`}>
              {result.score}
            </div>
            <div>
              <p className="text-[12px] text-white/60 font-medium">Health Score</p>
              <div className="flex gap-3 mt-0.5 text-[10px]">
                <span className="text-sage-300/60">{result.passed} passed</span>
                <span className="text-blush-300/60">{result.failed} failed</span>
                <span className="text-gold-300/60">{result.warnings} warnings</span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            {result.checks?.map((c, i) => (
              <div key={i} className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5">
                {STATUS_ICON[c.status]}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-white/50 font-medium">{c.name}</span>
                    <span className="text-[8px] px-1 py-0.5 rounded bg-white/[0.03] text-white/15">{c.category}</span>
                  </div>
                  <p className="text-[9px] text-white/25">{c.message}</p>
                  {c.detail && <p className="text-[8px] text-white/15 font-mono">{c.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-2">
        <p className="text-[10px] text-white/20 mb-1.5 flex items-center gap-1"><Clock size={9} /> History</p>
        <div className="space-y-1">
          {history.map(h => (
            <div key={h.id} className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.05] rounded-lg p-2">
              <span className={`text-[14px] font-bold w-8 text-center ${h.score >= 80 ? 'text-sage-300/60' : h.score >= 50 ? 'text-gold-300/60' : 'text-blush-300/60'}`}>{h.score}</span>
              <div className="flex-1 text-[9px] text-white/20">
                {h.passed}P / {h.failed}F
              </div>
              <span className="text-[8px] text-white/10">{new Date(h.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
export default BuildValidatorPanel
