/**
 * Prompt Library Panel (v2) — Save, organize, tag, and quick-insert reusable prompts
 * Named Panel2 to avoid conflict with existing PromptLibrary modal component
 */
import React, { useEffect, useState } from 'react'
import { BookOpen, Plus, Star, Search, Trash2, Copy, Tag, Check, X } from 'lucide-react'

interface PromptEntry {
  id: string; title: string; content: string; category: string; tags: string[]
  variables: string[]; favorite: boolean; useCount: number; createdAt: number; updatedAt: number
}

type View = 'list' | 'create' | 'detail'

const PromptLibraryPanel2: React.FC = () => {
  const [prompts, setPrompts] = useState<PromptEntry[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [view, setView] = useState<View>('list')
  const [selectedPrompt, setSelectedPrompt] = useState<PromptEntry | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [showFavs, setShowFavs] = useState(false)

  // Create form
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [newTags, setNewTags] = useState('')

  const fetchPrompts = async () => {
    try {
      const r = await window.nyra.promptLib.list({ category: activeCategory !== 'all' ? activeCategory : undefined, favorite: showFavs || undefined, search: search || undefined })
      if (r.success) setPrompts(r.result)
    } catch {}
  }

  const fetchCategories = async () => {
    try {
      const r = await window.nyra.promptLib.getCategories()
      if (r.success) setCategories(r.result)
    } catch {}
  }

  useEffect(() => { fetchPrompts(); fetchCategories() }, [])
  useEffect(() => { fetchPrompts() }, [search, activeCategory, showFavs])

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    try {
      await window.nyra.promptLib.create(newTitle, newContent, newCategory, newTags.split(',').map(t => t.trim()).filter(Boolean))
      setNewTitle(''); setNewContent(''); setNewTags('')
      setView('list')
      fetchPrompts(); fetchCategories()
    } catch {}
  }

  const handleDelete = async (id: string) => {
    try {
      await window.nyra.promptLib.delete(id)
      if (selectedPrompt?.id === id) { setSelectedPrompt(null); setView('list') }
      fetchPrompts()
    } catch {}
  }

  const handleToggleFav = async (id: string) => {
    try {
      await window.nyra.promptLib.toggleFavorite(id)
      fetchPrompts()
    } catch {}
  }

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {})
  }

  const handleUse = async (prompt: PromptEntry) => {
    try { await window.nyra.promptLib.recordUse(prompt.id) } catch {}
    handleCopy(prompt.content)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <BookOpen size={16} className="text-gold-300" />
        <h2 className="text-sm font-semibold text-white/80">Prompt Library</h2>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowFavs(f => !f)}
            className={`p-1.5 rounded-lg transition-colors ${showFavs ? 'text-gold-400 bg-gold-400/10' : 'text-white/20 hover:text-white/40'}`}>
            <Star size={12} />
          </button>
          <button onClick={() => setView('create')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-terra-400/15 text-terra-300 text-[10px] font-medium hover:bg-terra-400/25 transition-colors">
            <Plus size={10} /> New
          </button>
        </div>
      </div>

      {view === 'create' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-medium text-white/60">Create Prompt</h3>
            <button onClick={() => setView('list')} className="text-white/20 hover:text-white/40"><X size={14} /></button>
          </div>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Title..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[12px] text-white/70 placeholder:text-white/20 outline-none focus:border-terra-400/30" />
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Prompt content... Use {{variable}} for placeholders"
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[12px] text-white/70 placeholder:text-white/20 outline-none focus:border-terra-400/30 h-32 resize-none font-mono" />
          <div className="flex gap-2">
            <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-white/50 outline-none">
              <option value="general">General</option>
              <option value="development">Development</option>
              <option value="writing">Writing</option>
              <option value="learning">Learning</option>
              <option value="productivity">Productivity</option>
            </select>
            <input value={newTags} onChange={e => setNewTags(e.target.value)} placeholder="Tags (comma separated)"
              className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-white/50 placeholder:text-white/20 outline-none" />
          </div>
          <button onClick={handleCreate} disabled={!newTitle.trim() || !newContent.trim()}
            className="w-full py-2 rounded-lg bg-terra-400/20 text-terra-300 text-[11px] font-medium hover:bg-terra-400/30 transition-colors disabled:opacity-30">
            <Check size={12} className="inline mr-1" />Save Prompt
          </button>
        </div>
      )}

      {view === 'detail' && selectedPrompt && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={() => { setView('list'); setSelectedPrompt(null) }} className="text-[10px] text-white/30 hover:text-white/50">&larr; Back</button>
            <div className="flex items-center gap-1.5">
              <button onClick={() => handleToggleFav(selectedPrompt.id)} className={`p-1.5 rounded-lg ${selectedPrompt.favorite ? 'text-gold-400' : 'text-white/20 hover:text-white/40'}`}><Star size={12} /></button>
              <button onClick={() => handleUse(selectedPrompt)} className="px-3 py-1 rounded-lg bg-terra-400/15 text-terra-300 text-[10px] font-medium hover:bg-terra-400/25"><Copy size={10} className="inline mr-1" />Copy</button>
              <button onClick={() => handleDelete(selectedPrompt.id)} className="p-1.5 rounded-lg text-blush-400/30 hover:text-blush-400/70"><Trash2 size={12} /></button>
            </div>
          </div>
          <h3 className="text-[14px] font-medium text-white/80">{selectedPrompt.title}</h3>
          <div className="flex items-center gap-2">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/30">{selectedPrompt.category}</span>
            {selectedPrompt.tags.map(t => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-terra-400/10 text-terra-300/50">{t}</span>)}
            <span className="text-[9px] text-white/15 ml-auto">Used {selectedPrompt.useCount}x</span>
          </div>
          {selectedPrompt.variables.length > 0 && (
            <div className="bg-gold-400/5 border border-gold-400/10 rounded-lg p-2">
              <p className="text-[9px] text-gold-400/50 mb-1">Variables:</p>
              <div className="flex gap-1.5 flex-wrap">
                {selectedPrompt.variables.map(v => <span key={v} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gold-400/10 text-gold-300/60">{`{{${v}}}`}</span>)}
              </div>
            </div>
          )}
          <pre className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 text-[11px] text-white/50 font-mono whitespace-pre-wrap leading-relaxed">{selectedPrompt.content}</pre>
        </div>
      )}

      {view === 'list' && (
        <>
          {/* Search + categories */}
          <div className="px-4 py-2.5 border-b border-white/[0.04] space-y-2">
            <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-1.5">
              <Search size={12} className="text-white/20" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search prompts..."
                className="bg-transparent text-[12px] text-white/70 placeholder:text-white/20 outline-none flex-1" />
            </div>
            <div className="flex gap-1 flex-wrap">
              <button onClick={() => setActiveCategory('all')} className={`px-2 py-0.5 rounded text-[10px] font-medium ${activeCategory === 'all' ? 'bg-terra-400/15 text-terra-300' : 'text-white/25 hover:text-white/40'}`}>All</button>
              {categories.map(c => (
                <button key={c} onClick={() => setActiveCategory(c)} className={`px-2 py-0.5 rounded text-[10px] font-medium ${activeCategory === c ? 'bg-terra-400/15 text-terra-300' : 'text-white/25 hover:text-white/40'}`}>{c}</button>
              ))}
            </div>
          </div>

          {/* Prompt list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
            {prompts.map(p => (
              <button key={p.id} onClick={() => { setSelectedPrompt(p); setView('detail') }}
                className="w-full text-left bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 hover:border-white/[0.08] transition-colors group">
                <div className="flex items-center gap-2">
                  {p.favorite && <Star size={9} className="text-gold-400/60 fill-gold-400/40" />}
                  <h3 className="text-[12px] font-medium text-white/70 group-hover:text-white/90 truncate">{p.title}</h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/25 ml-auto flex-shrink-0">{p.category}</span>
                </div>
                <p className="text-[10px] text-white/25 mt-1 truncate">{p.content.slice(0, 80)}...</p>
                {p.tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {p.tags.slice(0, 3).map(t => <span key={t} className="flex items-center gap-0.5 text-[8px] text-white/15"><Tag size={7} />{t}</span>)}
                  </div>
                )}
              </button>
            ))}
            {prompts.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-white/15 text-[11px]">
                <BookOpen size={20} className="mb-2 opacity-30" />
                No prompts found
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default PromptLibraryPanel2
