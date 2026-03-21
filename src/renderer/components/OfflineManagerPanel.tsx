/**
 * Offline Manager Panel — Connectivity status, queue, and history
 */
import React, { useState, useEffect } from 'react'
import { Wifi, WifiOff, RefreshCw, Trash2, Clock } from 'lucide-react'

interface QueuedRequest { id: string; channel: string; priority: number; status: string; retries: number; createdAt: number }

const OfflineManagerPanel: React.FC = () => {
  const [stats, setStats] = useState<any>(null)
  const [queue, setQueue] = useState<QueuedRequest[]>([])
  const [connLog, setConnLog] = useState<Array<{ online: boolean; timestamp: number }>>([])
  const [error, setError] = useState<string | null>(null)

  const fetch_ = async () => {
    try { const r = await window.nyra.offlineMgr.stats(); if (r.success) setStats(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
    try { const r = await window.nyra.offlineMgr.queue(); if (r.success) setQueue(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
    try { const r = await window.nyra.offlineMgr.connectivityLog(30); if (r.success) setConnLog(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }
  useEffect(() => { fetch_(); const id = setInterval(fetch_, 10000); return () => clearInterval(id) }, [])

  const handleClearCompleted = async () => { try { await window.nyra.offlineMgr.clearCompleted(); fetch_() } catch (err: any) { setError(String(err?.message || 'Operation failed')) } }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        {stats?.isOnline ? <Wifi size={16} className="text-sage-300" /> : <WifiOff size={16} className="text-blush-300" />}
        <h2 className="text-sm font-semibold text-white/80">Connectivity</h2>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${stats?.isOnline ? 'bg-sage-400/15 text-sage-300' : 'bg-blush-400/15 text-blush-300'}`}>
          {stats?.isOnline ? 'Online' : 'Offline'}
        </span>
        <button onClick={fetch_} className="ml-auto text-white/20 hover:text-white/40"><RefreshCw size={12} /></button>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-2 px-4 py-3">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 text-center">
            <p className="text-[16px] font-semibold text-white/60">{stats.uptimePercent}%</p>
            <p className="text-[9px] text-white/20">Uptime (24h)</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 text-center">
            <p className="text-[16px] font-semibold text-white/60">{stats.queuedCount}</p>
            <p className="text-[9px] text-white/20">Queued</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 text-center">
            <p className="text-[16px] font-semibold text-white/60">{stats.failedCount}</p>
            <p className="text-[9px] text-white/20">Failed</p>
          </div>
        </div>
      )}

      <div className="px-4 py-1">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] text-white/25">Request Queue</p>
          {queue.length > 0 && <button onClick={handleClearCompleted} className="text-[9px] text-white/20 hover:text-white/40"><Trash2 size={9} className="inline mr-0.5" />Clear done</button>}
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {queue.slice(0, 10).map(q => (
            <div key={q.id} className="flex items-center gap-2 text-[10px] px-2 py-1 bg-white/[0.02] rounded-lg">
              <span className={`w-1.5 h-1.5 rounded-full ${q.status === 'completed' ? 'bg-sage-300' : q.status === 'failed' ? 'bg-blush-300' : 'bg-gold-300'}`} />
              <span className="text-white/40 font-mono flex-1 truncate">{q.channel}</span>
              <span className="text-white/15">{q.retries}x</span>
            </div>
          ))}
          {queue.length === 0 && <p className="text-[10px] text-white/15 text-center py-2">Queue empty</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        <p className="text-[10px] text-white/25 mb-1.5 flex items-center gap-1"><Clock size={9} /> Connection History</p>
        <div className="space-y-0.5">
          {connLog.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-[9px] px-2 py-1">
              <span className={`w-1.5 h-1.5 rounded-full ${l.online ? 'bg-sage-300' : 'bg-blush-300'}`} />
              <span className={l.online ? 'text-sage-300/40' : 'text-blush-300/40'}>{l.online ? 'Connected' : 'Disconnected'}</span>
              <span className="text-white/10 ml-auto">{new Date(l.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
export default OfflineManagerPanel
