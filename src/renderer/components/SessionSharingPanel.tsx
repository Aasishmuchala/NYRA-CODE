/**
 * Session Sharing Panel — Export/import individual sessions
 */
import React, { useState, useEffect } from 'react'
import { Share2, Download, Trash2, FileJson, FileText } from 'lucide-react'

interface SharedSession { id: string; sessionId: string; title: string; messageCount: number; format: string; sizeBytes: number; createdAt: number }
const fmt = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`

const SessionSharingPanel: React.FC = () => {
  const [shared, setShared] = useState<SharedSession[]>([])
  const [sessionId, setSessionId] = useState('')
  const [format, setFormat] = useState<'json' | 'markdown'>('json')
  const [exportResult, setExportResult] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const fetch_ = async () => { try { const r = await window.nyra.sessionSharing.list(20); if (r.success) setShared(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) } }
  useEffect(() => { fetch_() }, [])

  const handleExport = async () => {
    if (!sessionId) return
    try {
      const r = await window.nyra.sessionSharing.export(sessionId, format)
      if (r.success && r.result) { setExportResult(`Exported: ${r.result.title} (${r.result.messageCount} msgs)`); fetch_() }
    } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }
  const handleDelete = async (id: string) => { try { await window.nyra.sessionSharing.delete(id); fetch_() } catch (err: any) { setError(String(err?.message || 'Operation failed')) } }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Share2 size={16} className="text-gold-300" />
        <h2 className="text-sm font-semibold text-white/80">Session Sharing</h2>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      <div className="px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <input value={sessionId} onChange={e => setSessionId(e.target.value)} placeholder="Session ID to export..."
            className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white/50 placeholder:text-white/15 outline-none font-mono" />
          <select value={format} onChange={e => setFormat(e.target.value as any)}
            className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1 text-[11px] text-white/50 outline-none">
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
          </select>
        </div>
        <button onClick={handleExport} disabled={!sessionId}
          className="w-full py-2 rounded-lg bg-gold-400/15 text-gold-300 text-[11px] font-medium hover:bg-gold-400/25 disabled:opacity-30">
          <Download size={11} className="inline mr-1" />Export Session
        </button>
        {exportResult && <p className="text-[10px] text-sage-300/60">{exportResult}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        <p className="text-[10px] text-white/20 mb-1">Exported Sessions</p>
        {shared.map(s => (
          <div key={s.id} className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 hover:border-white/[0.08] group">
            <div className="flex items-center gap-2">
              {s.format === 'json' ? <FileJson size={10} className="text-gold-300/40" /> : <FileText size={10} className="text-gold-300/40" />}
              <h4 className="text-[11px] text-white/50 font-medium flex-1 truncate">{s.title}</h4>
              <button onClick={() => handleDelete(s.id)} className="p-1 text-blush-400/20 hover:text-blush-400/60 opacity-0 group-hover:opacity-100"><Trash2 size={10} /></button>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[9px] text-white/20">
              <span>{s.messageCount} messages</span>
              <span>{s.format}</span>
              <span>{fmt(s.sizeBytes)}</span>
              <span className="ml-auto">{new Date(s.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {shared.length === 0 && <p className="text-center text-[11px] text-white/15 py-8">No shared sessions</p>}
      </div>
    </div>
  )
}
export default SessionSharingPanel
