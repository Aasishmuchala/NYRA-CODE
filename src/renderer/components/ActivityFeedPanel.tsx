/**
 * Activity Feed Panel — Unified activity stream from all modules
 */
import React, { useState, useEffect } from 'react'
import { Activity, RefreshCw } from 'lucide-react'

interface ActivityEvent {
  id: string; type: string; action: string; title: string; detail?: string; timestamp: number
}

const TYPE_COLORS: Record<string, string> = {
  chat: 'text-terra-300/60', task: 'text-sage-300/60', agent: 'text-gold-300/60',
  file: 'text-gold-300/60', plugin: 'text-terra-300/60', search: 'text-white/30',
  system: 'text-white/20', 'ab-test': 'text-gold-300/60', theme: 'text-gold-300/60', diff: 'text-sage-300/60',
}

const ActivityFeedPanel: React.FC = () => {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [stats, setStats] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = async () => {
    try {
      const r = filter === 'all'
        ? await window.nyra.activityFeed.recent(80)
        : await window.nyra.activityFeed.byType(filter, 50)
      if (r.success) setEvents(r.result)
    } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }

  const fetchStats = async () => {
    try { const r = await window.nyra.activityFeed.stats(24); if (r.success) setStats(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }

  useEffect(() => { fetchEvents(); fetchStats() }, [filter])

  const types = ['all', 'chat', 'task', 'agent', 'file', 'plugin', 'system']

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Activity size={16} className="text-sage-300" />
        <h2 className="text-sm font-semibold text-white/80">Activity Feed</h2>
        {stats && <span className="text-[9px] text-white/20 ml-1">{stats.total} events (24h)</span>}
        <button onClick={() => { fetchEvents(); fetchStats() }} className="ml-auto text-white/20 hover:text-white/40"><RefreshCw size={12} /></button>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      <div className="flex gap-1 px-4 py-2 overflow-x-auto">
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition-colors ${filter === t ? 'bg-sage-400/15 text-sage-300' : 'text-white/25 hover:text-white/40'}`}>
            {t === 'all' ? 'All' : t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[7px] top-0 bottom-0 w-[1px] bg-white/[0.04]" />

          <div className="space-y-0.5">
            {events.map(e => (
              <div key={e.id} className="flex gap-3 pl-1 py-1.5 group">
                <div className="w-3.5 h-3.5 rounded-full bg-nyra-surface border-2 border-white/[0.08] flex-shrink-0 mt-0.5 z-10" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-medium ${TYPE_COLORS[e.type] || 'text-white/20'}`}>{e.type}</span>
                    <span className="text-[9px] text-white/15">{e.action}</span>
                    <span className="text-[8px] text-white/10 ml-auto">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-[11px] text-white/50 truncate">{e.title}</p>
                  {e.detail && <p className="text-[9px] text-white/20 truncate">{e.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {events.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-white/15 text-[11px]">
            <Activity size={20} className="mb-2 opacity-30" />No activity yet
          </div>
        )}
      </div>
    </div>
  )
}
export default ActivityFeedPanel
