/**
 * PromptLibrary — Saved prompts panel
 * Create, search, edit, delete, and insert prompts.
 */
import React, { useEffect, useState, useCallback } from 'react'
import { X, Plus, Search, BookOpen, Trash2, Edit3, Check, Tag, Copy } from 'lucide-react'
import type { SavedPrompt } from '../../preload/index'

interface Props {
  onClose: () => void
  onInsert: (content: string) => void
}

export const PromptLibrary: React.FC<Props> = ({ onClose, onInsert }) => {
  const [prompts, setPrompts]   = useState<SavedPrompt[]>([])
  const [query, setQuery]       = useState('')
  const [editing, setEditing]   = useState<SavedPrompt | null>(null)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied]     = useState<string | null>(null)

  const load = useCallback(() => {
    window.nyra.prompts.list().then(setPrompts).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = prompts.filter(p =>
    !query || p.title.toLowerCase().includes(query.toLowerCase()) ||
    p.content.toLowerCase().includes(query.toLowerCase()) ||
    p.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
  )

  const handleDelete = async (id: string) => {
    await window.nyra.prompts.remove(id)
    load()
  }

  const handleInsert = (p: SavedPrompt) => {
    onInsert(p.content)
    onClose()
  }

  const handleCopy = (p: SavedPrompt) => {
    navigator.clipboard.writeText(p.content).then(() => {
      setCopied(p.id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[620px] max-h-[75vh] bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07]">
          <BookOpen size={15} className="text-terra-400" />
          <span className="text-sm font-semibold text-white/80 flex-1">Prompt Library</span>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-terra-500/80 hover:bg-terra-400/80 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Plus size={12} /> New Prompt
          </button>
          <button onClick={onClose} className="p-1.5 text-white/30 hover:text-white/70 rounded-lg hover:bg-white/[0.06] transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06]">
          <Search size={13} className="text-white/25 flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search prompts…"
            className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/25 outline-none"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-white/25">
              <BookOpen size={28} />
              <p className="text-sm">
                {query ? 'No prompts match your search' : 'No saved prompts yet'}
              </p>
              {!query && (
                <button
                  onClick={() => setCreating(true)}
                  className="text-xs text-terra-400 hover:text-terra-300 transition-colors"
                >
                  Create your first prompt →
                </button>
              )}
            </div>
          )}

          {filtered.map(p => (
            <div
              key={p.id}
              className="group flex items-start gap-3 px-5 py-3.5 hover:bg-white/[0.03] transition-colors cursor-pointer"
              onClick={() => handleInsert(p)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/80 truncate">{p.title}</p>
                <p className="text-xs text-white/35 mt-0.5 line-clamp-2 leading-relaxed">{p.content}</p>
                {p.tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {p.tags.map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/40 rounded-md font-mono">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                <button
                  onClick={e => { e.stopPropagation(); handleCopy(p) }}
                  className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/30 hover:text-white/70 transition-colors"
                  title="Copy to clipboard"
                >
                  {copied === p.id ? <Check size={12} className="text-sage-400" /> : <Copy size={12} />}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setEditing(p) }}
                  className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/30 hover:text-white/70 transition-colors"
                  title="Edit"
                >
                  <Edit3 size={12} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                  className="p-1.5 rounded-lg hover:bg-blush-500/20 text-white/30 hover:text-blush-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-white/[0.06] text-[10px] text-white/20">
          {prompts.length} prompt{prompts.length !== 1 ? 's' : ''} saved · Click to insert into chat
        </div>
      </div>

      {/* Create / Edit form */}
      {(creating || editing) && (
        <PromptForm
          initial={editing ?? undefined}
          onSave={async (data) => {
            if (editing) {
              await window.nyra.prompts.update(editing.id, data)
            } else {
              await window.nyra.prompts.add({
                id: `prompt-${Date.now()}`,
                createdAt: Date.now(),
                ...data,
              })
            }
            setEditing(null)
            setCreating(false)
            load()
          }}
          onClose={() => { setEditing(null); setCreating(false) }}
        />
      )}
    </div>
  )
}

// ── PromptForm ─────────────────────────────────────────────────────────────────
interface FormData { title: string; content: string; tags: string[] }

const PromptForm: React.FC<{
  initial?: SavedPrompt
  onSave: (d: FormData) => void
  onClose: () => void
}> = ({ initial, onSave, onClose }) => {
  const [title, setTitle]     = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [tagInput, setTagInput] = useState(initial?.tags.join(', ') ?? '')

  const canSave = title.trim().length > 0 && content.trim().length > 0

  const handleSave = () => {
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean)
    onSave({ title: title.trim(), content: content.trim(), tags })
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[500px] bg-[#141414] border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white/80">
          {initial ? 'Edit Prompt' : 'New Prompt'}
        </h3>

        <div>
          <label className="text-[10px] uppercase tracking-widest text-white/35 mb-1.5 block">Title</label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Code Review Expert"
            className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-terra-400/50"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest text-white/35 mb-1.5 block">Content</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={6}
            placeholder="You are an expert…"
            className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/80 placeholder-white/25 outline-none focus:border-terra-400/50 resize-none leading-relaxed"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest text-white/35 mb-1.5 flex items-center gap-1 block">
            <Tag size={10} /> Tags <span className="normal-case text-white/20">(comma separated)</span>
          </label>
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            placeholder="code, review, expert"
            className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/80 placeholder-white/25 outline-none focus:border-terra-400/50"
          />
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/40 hover:text-white/70 rounded-xl hover:bg-white/[0.06] transition-colors">
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={handleSave}
            className="px-5 py-2 text-sm font-medium bg-terra-500 hover:bg-terra-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
          >
            {initial ? 'Save Changes' : 'Save Prompt'}
          </button>
        </div>
      </div>
    </div>
  )
}
