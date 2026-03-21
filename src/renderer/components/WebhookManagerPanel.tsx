/**
 * Webhook Manager Panel — Create, manage, and monitor webhooks
 */
import React, { useState, useEffect } from 'react'
import { Webhook, Plus, Trash2, X, ToggleLeft, ToggleRight, Clock } from 'lucide-react'

interface WebhookEntry { id: string; name: string; url: string; events: string[]; enabled: boolean; failCount: number; lastStatus?: number; createdAt: number }
interface WebhookLog { id: string; event: string; status: number; responseTime: number; error?: string; timestamp: number }

type View = 'list' | 'create' | 'logs'

const WebhookManagerPanel: React.FC = () => {
  const [view, setView] = useState<View>('list')
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([])
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [stats, setStats] = useState<any>(null)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState('*')
  const [error, setError] = useState<string | null>(null)

  const fetch_ = async () => {
    try { const r = await window.nyra.webhookMgr.list(); if (r.success) setWebhooks(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
    try { const r = await window.nyra.webhookMgr.stats(); if (r.success) setStats(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }
  useEffect(() => { fetch_() }, [])

  const handleCreate = async () => {
    if (!newName || !newUrl) return
    try { await window.nyra.webhookMgr.create(newName, newUrl, newEvents.split(',').map(s => s.trim())); setNewName(''); setNewUrl(''); setNewEvents('*'); setView('list'); fetch_() } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }
  const handleToggle = async (id: string, enabled: boolean) => {
    try { enabled ? await window.nyra.webhookMgr.disable(id) : await window.nyra.webhookMgr.enable(id); fetch_() } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }
  const handleDelete = async (id: string) => { try { await window.nyra.webhookMgr.delete(id); fetch_() } catch (err: any) { setError(String(err?.message || 'Operation failed')) } }
  const handleShowLogs = async (webhookId?: string) => {
    try { const r = await window.nyra.webhookMgr.logs(webhookId, 30); if (r.success) { setLogs(r.result); setView('logs') } } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Webhook size={16} className="text-terra-300" />
        <h2 className="text-sm font-semibold text-white/80">Webhooks</h2>
        {stats && <span className="text-[9px] text-white/20 ml-1">{stats.totalFired} fired</span>}
        <div className="ml-auto flex gap-1">
          <button onClick={() => handleShowLogs()} className="px-2 py-1 text-[10px] text-white/25 hover:text-white/40 rounded-lg"><Clock size={10} className="inline mr-1" />Logs</button>
          <button onClick={() => setView('create')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-terra-400/15 text-terra-300 text-[10px] font-medium hover:bg-terra-400/25"><Plus size={10} /> Add</button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      {view === 'create' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div className="flex items-center justify-between"><h3 className="text-[12px] text-white/60">New Webhook</h3><button onClick={() => setView('list')} className="text-white/20 hover:text-white/40"><X size={14} /></button></div>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name..." className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[12px] text-white/60 placeholder:text-white/20 outline-none" />
          <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://..." className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white/50 placeholder:text-white/15 outline-none font-mono" />
          <input value={newEvents} onChange={e => setNewEvents(e.target.value)} placeholder="Events (* = all)" className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-white/50 placeholder:text-white/15 outline-none" />
          <button onClick={handleCreate} disabled={!newName || !newUrl} className="w-full py-2 rounded-lg bg-terra-400/20 text-terra-300 text-[11px] font-medium hover:bg-terra-400/30 disabled:opacity-30">Create Webhook</button>
        </div>
      )}

      {view === 'logs' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          <button onClick={() => setView('list')} className="text-[10px] text-white/30 hover:text-white/50">&larr; Back</button>
          {logs.map(l => (
            <div key={l.id} className={`bg-white/[0.02] border rounded-lg p-2.5 ${l.status >= 200 && l.status < 300 ? 'border-sage-400/10' : 'border-blush-400/10'}`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono ${l.status >= 200 && l.status < 300 ? 'text-sage-300/60' : 'text-blush-300/60'}`}>{l.status || 'ERR'}</span>
                <span className="text-[10px] text-white/30">{l.event}</span>
                <span className="text-[9px] text-white/15 ml-auto">{l.responseTime}ms</span>
              </div>
              {l.error && <p className="text-[9px] text-blush-300/40 mt-1">{l.error}</p>}
              <p className="text-[8px] text-white/10 mt-0.5">{new Date(l.timestamp).toLocaleString()}</p>
            </div>
          ))}
          {logs.length === 0 && <p className="text-center text-[11px] text-white/15 py-8">No webhook logs</p>}
        </div>
      )}

      {view === 'list' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {webhooks.map(w => (
            <div key={w.id} className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 hover:border-white/[0.08] group">
              <div className="flex items-center gap-2">
                <button onClick={() => handleToggle(w.id, w.enabled)} className={w.enabled ? 'text-sage-300/50' : 'text-white/15'}>
                  {w.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                </button>
                <h4 className="text-[11px] text-white/60 font-medium flex-1 truncate">{w.name}</h4>
                {w.failCount > 0 && <span className="text-[8px] px-1.5 py-0.5 rounded bg-blush-400/10 text-blush-300/50">{w.failCount} fails</span>}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => handleShowLogs(w.id)} className="p-1 text-white/20 hover:text-white/40"><Clock size={10} /></button>
                  <button onClick={() => handleDelete(w.id)} className="p-1 text-blush-400/20 hover:text-blush-400/60"><Trash2 size={10} /></button>
                </div>
              </div>
              <p className="text-[9px] text-white/20 font-mono truncate mt-0.5">{w.url}</p>
              <div className="flex gap-1 mt-1">{w.events.map(e => <span key={e} className="text-[8px] px-1.5 py-0.5 rounded bg-white/[0.03] text-white/20">{e}</span>)}</div>
            </div>
          ))}
          {webhooks.length === 0 && <p className="text-center text-[11px] text-white/15 py-8">No webhooks configured</p>}
        </div>
      )}
    </div>
  )
}
export default WebhookManagerPanel
