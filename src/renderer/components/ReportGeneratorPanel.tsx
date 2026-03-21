/**
 * Report Generator Panel — Generate and view reports
 */
import React, { useState, useEffect } from 'react'
import { FileBarChart, Plus, Trash2, Eye, X } from 'lucide-react'

interface ReportEntry { id: string; title: string; type: string; format: string; createdAt: number }
type View = 'list' | 'generate' | 'view'

const ReportGeneratorPanel: React.FC = () => {
  const [view, setView] = useState<View>('list')
  const [reports, setReports] = useState<ReportEntry[]>([])
  const [viewContent, setViewContent] = useState('')
  const [viewTitle, setViewTitle] = useState('')
  const [genType, setGenType] = useState<'session' | 'analytics' | 'custom'>('analytics')
  const [customTitle, setCustomTitle] = useState('')
  const [customContent, setCustomContent] = useState('')
  const [hours, setHours] = useState(24)
  const [error, setError] = useState<string | null>(null)

  const fetchReports = async () => { try { const r = await window.nyra.reportGen.list(20); if (r.success) setReports(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) } }
  useEffect(() => { fetchReports() }, [])

  const handleGenerate = async () => {
    try {
      let r
      if (genType === 'analytics') r = await window.nyra.reportGen.analytics(hours)
      else if (genType === 'session') r = await window.nyra.reportGen.session()
      else r = await window.nyra.reportGen.custom(customTitle, [{ heading: 'Content', content: customContent }])
      if (r?.success) { fetchReports(); setView('list') }
    } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }

  const handleView = async (id: string) => {
    try {
      const r = await window.nyra.reportGen.get(id)
      if (r.success && r.result) { setViewTitle(r.result.title); setViewContent(r.result.content); setView('view') }
    } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }

  const handleDelete = async (id: string) => {
    try { await window.nyra.reportGen.delete(id); fetchReports() } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <FileBarChart size={16} className="text-gold-300" />
        <h2 className="text-sm font-semibold text-white/80">Reports</h2>
        <button onClick={() => setView('generate')} className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gold-400/15 text-gold-300 text-[10px] font-medium hover:bg-gold-400/25">
          <Plus size={10} /> Generate
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      {view === 'generate' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] text-white/60">Generate Report</h3>
            <button onClick={() => setView('list')} className="text-white/20 hover:text-white/40"><X size={14} /></button>
          </div>
          <div className="flex gap-1.5">
            {(['analytics', 'session', 'custom'] as const).map(t => (
              <button key={t} onClick={() => setGenType(t)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium ${genType === t ? 'bg-gold-400/15 text-gold-300' : 'text-white/25 hover:text-white/40'}`}>
                {t}
              </button>
            ))}
          </div>
          {genType === 'analytics' && (
            <label className="flex items-center gap-2 text-[11px] text-white/40">
              Time range:
              <select value={hours} onChange={e => setHours(Number(e.target.value))}
                className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1 text-[11px] text-white/50 outline-none">
                {[1, 6, 24, 72, 168].map(h => <option key={h} value={h}>{h}h</option>)}
              </select>
            </label>
          )}
          {genType === 'custom' && (
            <>
              <input value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="Report title..."
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[12px] text-white/60 placeholder:text-white/20 outline-none" />
              <textarea value={customContent} onChange={e => setCustomContent(e.target.value)} placeholder="Report content (markdown)..."
                className="w-full h-24 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white/50 font-mono placeholder:text-white/15 outline-none resize-none" />
            </>
          )}
          <button onClick={handleGenerate} className="w-full py-2 rounded-lg bg-gold-400/20 text-gold-300 text-[11px] font-medium hover:bg-gold-400/30">Generate</button>
        </div>
      )}

      {view === 'view' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <button onClick={() => setView('list')} className="text-[10px] text-white/30 hover:text-white/50">&larr; Back</button>
          </div>
          <h3 className="text-[14px] font-medium text-white/70">{viewTitle}</h3>
          <pre className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 text-[10px] text-white/40 font-mono whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">{viewContent}</pre>
        </div>
      )}

      {view === 'list' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {reports.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 hover:border-white/[0.08] group">
              <FileBarChart size={11} className="text-gold-300/40 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h4 className="text-[11px] text-white/60 font-medium truncate">{r.title}</h4>
                <p className="text-[9px] text-white/20">{r.type} • {r.format} • {new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={() => handleView(r.id)} className="p-1 text-white/20 hover:text-white/50"><Eye size={11} /></button>
                <button onClick={() => handleDelete(r.id)} className="p-1 text-blush-400/20 hover:text-blush-400/60"><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
          {reports.length === 0 && <p className="text-center text-[11px] text-white/15 py-8">No reports generated yet</p>}
        </div>
      )}
    </div>
  )
}
export default ReportGeneratorPanel
