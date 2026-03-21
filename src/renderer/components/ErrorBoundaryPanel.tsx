/**
 * Error Boundary Panel — View and manage captured errors
 */
import React, { useState, useEffect } from 'react'
import { AlertTriangle, Shield, RefreshCw } from 'lucide-react'

interface ErrorEntry { id: string; module: string; severity: string; message: string; stack?: string; recovered: boolean; timestamp: number }

const SEV_COLORS: Record<string, string> = { low: 'text-white/30', medium: 'text-gold-300/60', high: 'text-blush-300/60', critical: 'text-blush-300/80' }
const SEV_BG: Record<string, string> = { low: 'bg-white/[0.03]', medium: 'bg-gold-400/5', high: 'bg-blush-400/5', critical: 'bg-blush-400/8' }

const ErrorBoundaryPanel: React.FC = () => {
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [stats, setStats] = useState<any>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)

  const fetch_ = async () => {
    try {
      const r = filter === 'all' ? await window.nyra.errorBoundary.recent(60) : await window.nyra.errorBoundary.bySeverity(filter, 40)
      if (r.success) setErrors(r.result)
    } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
    try { const r = await window.nyra.errorBoundary.stats(24); if (r.success) setStats(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }
  useEffect(() => { fetch_() }, [filter])

  const handleMarkRecovered = async (id: string) => { try { await window.nyra.errorBoundary.markRecovered(id); fetch_() } catch (err: any) { setError(String(err?.message || 'Operation failed')) } }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <AlertTriangle size={16} className="text-blush-300" />
        <h2 className="text-sm font-semibold text-white/80">Error Monitor</h2>
        {stats && <span className="text-[9px] text-white/20 ml-1">{stats.total} errors (24h) • {stats.unrecovered} unresolved</span>}
        <button onClick={fetch_} className="ml-auto text-white/20 hover:text-white/40"><RefreshCw size={12} /></button>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      {stats && (
        <div className="flex gap-2 px-4 py-2.5">
          {(['low', 'medium', 'high', 'critical'] as const).map(s => (
            <span key={s} className={`text-[9px] ${SEV_COLORS[s]}`}>{s}: {stats.bySeverity?.[s] || 0}</span>
          ))}
        </div>
      )}

      <div className="flex gap-1 px-4 pb-2">
        {['all', 'critical', 'high', 'medium', 'low'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2 py-0.5 rounded-lg text-[9px] font-medium ${filter === f ? 'bg-blush-400/15 text-blush-300' : 'text-white/20 hover:text-white/40'}`}>{f}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {errors.map(e => (
          <div key={e.id} className={`border border-white/[0.05] rounded-lg p-2.5 ${SEV_BG[e.severity] || ''}`}>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
              <span className={`text-[9px] font-bold uppercase ${SEV_COLORS[e.severity]}`}>{e.severity}</span>
              <span className="text-[9px] text-white/20 px-1 py-0.5 rounded bg-white/[0.03]">{e.module}</span>
              <span className="text-[10px] text-white/40 flex-1 truncate">{e.message}</span>
              {e.recovered ? <Shield size={9} className="text-sage-300/40" /> : (
                <button onClick={(ev) => { ev.stopPropagation(); handleMarkRecovered(e.id) }} className="text-[8px] text-gold-300/40 hover:text-gold-300/70">resolve</button>
              )}
            </div>
            {expandedId === e.id && e.stack && (
              <pre className="mt-2 text-[9px] text-white/20 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto bg-white/[0.01] rounded p-2">{e.stack}</pre>
            )}
            <p className="text-[8px] text-white/10 mt-1">{new Date(e.timestamp).toLocaleString()}</p>
          </div>
        ))}
        {errors.length === 0 && <p className="text-center text-[11px] text-white/15 py-8">No errors captured</p>}
      </div>
    </div>
  )
}
export default ErrorBoundaryPanel
