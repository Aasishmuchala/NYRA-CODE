/**
 * Diff Viewer Panel — Side-by-side code diffs with hunk navigation
 */
import React, { useEffect, useState } from 'react'
import { GitCompare, Plus, Minus, ChevronDown, ChevronUp, Trash2, Clock } from 'lucide-react'

interface DiffLine { type: 'add' | 'remove' | 'context'; content: string; oldLine?: number; newLine?: number }
interface DiffHunk { oldStart: number; oldCount: number; newStart: number; newCount: number; lines: DiffLine[] }
interface DiffResult { added: number; removed: number; hunks: DiffHunk[] }
interface DiffHistoryEntry { id: string; label: string; added: number; removed: number; timestamp: number }

type Tab = 'compare' | 'history'

const DiffViewerPanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>('compare')
  const [oldText, setOldText] = useState('')
  const [newText, setNewText] = useState('')
  const [label, setLabel] = useState('')
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [history, setHistory] = useState<DiffHistoryEntry[]>([])
  const [expandedHunks, setExpandedHunks] = useState<Set<number>>(new Set())

  const fetchHistory = async () => {
    try {
      const r = await window.nyra.diffViewer.getHistory(20)
      if (r.success) setHistory(r.result)
    } catch {}
  }

  useEffect(() => { fetchHistory() }, [])

  const handleCompare = async () => {
    if (!oldText && !newText) return
    try {
      const r = await window.nyra.diffViewer.compare(oldText, newText, label || 'Untitled diff')
      if (r.success) {
        setDiffResult(r.result)
        setExpandedHunks(new Set(r.result.hunks.map((_: any, i: number) => i)))
        fetchHistory()
      }
    } catch {}
  }

  const toggleHunk = (idx: number) => {
    setExpandedHunks(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  const handleClearHistory = async () => {
    try {
      await window.nyra.diffViewer.clearHistory()
      setHistory([])
    } catch {}
  }

  const LINE_COLORS: Record<string, string> = {
    add: 'bg-sage-400/8 text-sage-300/70',
    remove: 'bg-blush-400/8 text-blush-300/70',
    context: 'text-white/30',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <GitCompare size={16} className="text-sage-300" />
        <h2 className="text-sm font-semibold text-white/80">Diff Viewer</h2>
        <div className="ml-auto flex gap-1">
          {(['compare', 'history'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${tab === t ? 'bg-sage-400/15 text-sage-300' : 'text-white/30 hover:text-white/50'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'compare' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Diff label (optional)"
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-white/60 placeholder:text-white/20 outline-none" />

          {/* Side by side text inputs */}
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-[9px] text-white/25 uppercase tracking-wider">Original</label>
              <textarea value={oldText} onChange={e => setOldText(e.target.value)} placeholder="Paste original text..."
                className="w-full h-24 bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white/50 font-mono outline-none resize-none focus:border-sage-400/30" />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[9px] text-white/25 uppercase tracking-wider">Modified</label>
              <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Paste modified text..."
                className="w-full h-24 bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white/50 font-mono outline-none resize-none focus:border-sage-400/30" />
            </div>
          </div>

          <button onClick={handleCompare}
            className="w-full py-2 rounded-lg bg-sage-400/20 text-sage-300 text-[11px] font-medium hover:bg-sage-400/30 transition-colors">
            <GitCompare size={12} className="inline mr-1.5" />Compare
          </button>

          {/* Diff result */}
          {diffResult && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1 text-sage-300/60"><Plus size={10} /> {diffResult.added} added</span>
                <span className="flex items-center gap-1 text-blush-300/60"><Minus size={10} /> {diffResult.removed} removed</span>
                <span className="text-white/15">{diffResult.hunks.length} hunk{diffResult.hunks.length !== 1 ? 's' : ''}</span>
              </div>

              {diffResult.hunks.map((hunk, hIdx) => (
                <div key={hIdx} className="border border-white/[0.05] rounded-lg overflow-hidden">
                  <button onClick={() => toggleHunk(hIdx)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] text-[10px] text-white/30 hover:text-white/50">
                    {expandedHunks.has(hIdx) ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    <span className="font-mono">@@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@</span>
                  </button>
                  {expandedHunks.has(hIdx) && (
                    <div className="font-mono text-[10px] leading-[18px]">
                      {hunk.lines.map((line, lIdx) => (
                        <div key={lIdx} className={`flex px-2 ${LINE_COLORS[line.type]}`}>
                          <span className="w-8 text-right pr-2 text-white/10 select-none flex-shrink-0">
                            {line.oldLine || ''}
                          </span>
                          <span className="w-8 text-right pr-2 text-white/10 select-none flex-shrink-0">
                            {line.newLine || ''}
                          </span>
                          <span className="w-3 text-center flex-shrink-0 select-none">
                            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                          </span>
                          <span className="flex-1 whitespace-pre">{line.content}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {history.length > 0 && (
            <button onClick={handleClearHistory} className="text-[10px] text-blush-400/30 hover:text-blush-400/60 mb-2">
              <Trash2 size={10} className="inline mr-1" />Clear history
            </button>
          )}
          {history.map(h => (
            <div key={h.id} className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 hover:border-white/[0.08] transition-colors">
              <div className="flex items-center gap-2">
                <GitCompare size={10} className="text-sage-300/40" />
                <h4 className="text-[11px] text-white/50 font-medium flex-1 truncate">{h.label}</h4>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[9px]">
                <span className="text-sage-300/40">+{h.added}</span>
                <span className="text-blush-300/40">-{h.removed}</span>
                <span className="text-white/15 ml-auto flex items-center gap-1"><Clock size={8} />{new Date(h.timestamp).toLocaleString()}</span>
              </div>
            </div>
          ))}
          {history.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-white/15 text-[11px]">
              <GitCompare size={20} className="mb-2 opacity-30" />No diff history
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DiffViewerPanel
