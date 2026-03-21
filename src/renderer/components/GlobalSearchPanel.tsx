/**
 * Global Search Panel — Cross-module search with type filters
 */
import React, { useState, useEffect, useRef } from 'react'
import { Search, Clock, FileText, CheckSquare, BookOpen, Paperclip, Palette, FlaskConical, Package } from 'lucide-react'

interface SearchResult {
  id: string; type: string; title: string; snippet: string; score: number; metadata: Record<string, any>; timestamp: number
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  message: <FileText size={10} />, task: <CheckSquare size={10} />, prompt: <BookOpen size={10} />,
  file: <Paperclip size={10} />, theme: <Palette size={10} />, 'ab-test': <FlaskConical size={10} />,
  plugin: <Package size={10} />,
}
const ALL_TYPES = ['message', 'task', 'prompt', 'file', 'theme', 'ab-test', 'plugin']

const GlobalSearchPanel: React.FC = () => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [activeTypes, setActiveTypes] = useState<string[]>(ALL_TYPES)
  const [history, setHistory] = useState<Array<{ query: string; resultCount: number; timestamp: number }>>([])
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus(); fetchHistory() }, [])

  const fetchHistory = async () => {
    try { const r = await window.nyra.globalSearch.history(10); if (r.success) setHistory(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }

  const handleSearch = async () => {
    if (!query.trim()) return
    try {
      const r = await window.nyra.globalSearch.search({ query, types: activeTypes, limit: 50 })
      if (r.success) { setResults(r.result.results); setTotal(r.result.total); setShowHistory(false); fetchHistory() }
    } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }

  const toggleType = (t: string) => setActiveTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Search size={16} className="text-terra-300" />
        <h2 className="text-sm font-semibold text-white/80">Global Search</h2>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      <div className="px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search everything..."
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            onFocus={() => !query && setShowHistory(true)}
            className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-2.5 text-[13px] text-white/70 placeholder:text-white/20 outline-none focus:border-terra-400/30" />
          <button onClick={handleSearch} className="px-4 py-2 rounded-lg bg-terra-400/20 text-terra-300 text-[11px] font-medium hover:bg-terra-400/30">Search</button>
        </div>
        <div className="flex gap-1 flex-wrap">
          {ALL_TYPES.map(t => (
            <button key={t} onClick={() => toggleType(t)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-medium transition-colors ${activeTypes.includes(t) ? 'bg-terra-400/15 text-terra-300' : 'bg-white/[0.03] text-white/20'}`}>
              {TYPE_ICONS[t]} {t}
            </button>
          ))}
        </div>
      </div>

      {showHistory && history.length > 0 && !query && (
        <div className="px-4 pb-2 space-y-1">
          <p className="text-[9px] text-white/20 uppercase tracking-wider flex items-center gap-1"><Clock size={8} /> Recent</p>
          {history.map((h, i) => (
            <button key={i} onClick={() => { setQuery(h.query); setShowHistory(false) }}
              className="w-full text-left text-[11px] text-white/40 hover:text-white/60 px-2 py-1 rounded-lg hover:bg-white/[0.03]">
              {h.query} <span className="text-white/15">({h.resultCount})</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        {total > 0 && <p className="text-[10px] text-white/20 mb-1">{total} results</p>}
        {results.map(r => (
          <div key={r.id} className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 hover:border-white/[0.08] transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white/30">{TYPE_ICONS[r.type]}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/25">{r.type}</span>
              <h4 className="text-[12px] text-white/60 font-medium truncate flex-1">{r.title}</h4>
              <span className="text-[8px] text-white/10">{new Date(r.timestamp).toLocaleDateString()}</span>
            </div>
            <p className="text-[10px] text-white/30 line-clamp-2">{r.snippet}</p>
          </div>
        ))}
        {results.length === 0 && query && total === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-white/15 text-[11px]">
            <Search size={20} className="mb-2 opacity-30" />No results found
          </div>
        )}
      </div>
    </div>
  )
}
export default GlobalSearchPanel
