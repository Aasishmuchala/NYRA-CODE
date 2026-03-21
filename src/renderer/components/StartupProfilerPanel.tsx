/**
 * Startup Profiler Panel — View startup performance history and bottlenecks
 */
import React, { useState, useEffect } from 'react'
import { Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StartupSummary { id: string; totalMs: number; bottlenecks: Array<{ module: string; durationMs: number }>; timestamp: number }

const StartupProfilerPanel: React.FC = () => {
  const [history, setHistory] = useState<StartupSummary[]>([])
  const [avg, setAvg] = useState<any>(null)
  const [selected, setSelected] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = async () => {
    try { const r = await window.nyra.startupProfiler.history(20); if (r.success) setHistory(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
    try { const r = await window.nyra.startupProfiler.average(10); if (r.success) setAvg(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }
  useEffect(() => { fetch_() }, [])

  const handleViewDetail = async (id: string) => {
    try { const r = await window.nyra.startupProfiler.get(id); if (r.success) setSelected(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }

  const TrendIcon = avg?.trend === 'improving' ? TrendingDown : avg?.trend === 'degrading' ? TrendingUp : Minus
  const trendColor = avg?.trend === 'improving' ? 'text-sage-300' : avg?.trend === 'degrading' ? 'text-blush-300' : 'text-white/30'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Zap size={16} className="text-gold-300" />
        <h2 className="text-sm font-semibold text-white/80">Startup Profiler</h2>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      {avg && (
        <div className="grid grid-cols-4 gap-2 px-4 py-3">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 text-center">
            <p className="text-[16px] font-semibold text-white/60">{avg.avgMs}ms</p>
            <p className="text-[9px] text-white/20">Avg Startup</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 text-center">
            <p className="text-[16px] font-semibold text-white/60">{avg.minMs}ms</p>
            <p className="text-[9px] text-white/20">Best</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 text-center">
            <p className="text-[16px] font-semibold text-white/60">{avg.maxMs}ms</p>
            <p className="text-[9px] text-white/20">Worst</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 text-center">
            <TrendIcon size={16} className={`mx-auto ${trendColor}`} />
            <p className="text-[9px] text-white/20 mt-0.5">{avg.trend}</p>
          </div>
        </div>
      )}

      {selected && (
        <div className="mx-4 mb-2 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[12px] text-white/60">Startup #{selected.id.slice(0, 8)} — {selected.totalMs}ms</h3>
            <button onClick={() => setSelected(null)} className="text-[10px] text-white/20 hover:text-white/40">close</button>
          </div>
          <div className="space-y-1">
            {selected.metrics?.map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[9px] text-white/30 w-20 truncate">{m.module}</span>
                <div className="flex-1 h-2 bg-white/[0.03] rounded-full overflow-hidden">
                  <div className="h-full bg-gold-400/30 rounded-full" style={{ width: `${Math.min(100, (m.durationMs / selected.totalMs) * 100)}%` }} />
                </div>
                <span className="text-[9px] text-white/20 w-12 text-right">{m.durationMs}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {history.map(h => (
          <button key={h.id} onClick={() => handleViewDetail(h.id)}
            className="w-full text-left bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 hover:border-white/[0.08] transition-colors">
            <div className="flex items-center gap-2">
              <Zap size={10} className="text-gold-300/40" />
              <span className="text-[12px] text-white/60 font-medium">{h.totalMs}ms</span>
              <span className="text-[8px] text-white/10 ml-auto">{new Date(h.timestamp).toLocaleString()}</span>
            </div>
            {h.bottlenecks.length > 0 && (
              <div className="flex gap-1.5 mt-1">
                {h.bottlenecks.slice(0, 3).map((b, i) => (
                  <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-white/[0.03] text-white/20">{b.module}: {b.durationMs}ms</span>
                ))}
              </div>
            )}
          </button>
        ))}
        {history.length === 0 && <p className="text-center text-[11px] text-white/15 py-8">No startup profiles yet</p>}
      </div>
    </div>
  )
}
export default StartupProfilerPanel
