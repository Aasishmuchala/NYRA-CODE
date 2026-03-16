/**
 * ProjectsRail — Left 52px vertical rail for project switching
 * Shows project emoji buttons + create button. Executive minimal style.
 */
import React, { useState } from 'react'
import { Plus, Layers } from 'lucide-react'
import type { Project } from '../../preload/index'

interface Props {
  projects: Project[]
  activeProjectId: string | null
  onSelectProject: (id: string | null) => void
  onCreateProject: () => void
}

const COLOR_MAP: Record<string, string> = {
  indigo:  'bg-terra-400/20 border-terra-400/40 text-terra-300',
  violet:  'bg-gold-500/20 border-gold-500/40 text-gold-300',
  blue:    'bg-gold-500/20   border-gold-500/40   text-gold-300',
  emerald: 'bg-sage-500/20 border-sage-500/40 text-sage-300',
  rose:    'bg-blush-500/20   border-blush-500/40   text-blush-300',
  amber:   'bg-gold-500/20  border-gold-500/40  text-gold-300',
  cyan:    'bg-terra-300/20   border-terra-300/40   text-terra-300',
}

const ACTIVE_RING: Record<string, string> = {
  indigo:  'ring-terra-400',
  violet:  'ring-gold-500',
  blue:    'ring-gold-500',
  emerald: 'ring-sage-500',
  rose:    'ring-blush-500',
  amber:   'ring-gold-500',
  cyan:    'ring-terra-300',
}

export const ProjectsRail: React.FC<Props> = ({
  projects, activeProjectId, onSelectProject, onCreateProject
}) => {
  const [, setHovered] = useState<string | null>(null)

  return (
    <div className="w-[52px] h-full bg-black/40 border-r border-white/[0.06] flex flex-col items-center gap-1.5 flex-shrink-0">
      {/* macOS traffic lights region — draggable, reserves space */}
      <div className="h-11 w-full flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* All chats button */}
      <Tooltip label="All Chats">
        <button
          onClick={() => onSelectProject(null)}
          onMouseEnter={() => setHovered('__all')}
          onMouseLeave={() => setHovered(null)}
          className={`
            w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150
            ${activeProjectId === null
              ? 'bg-white/10 ring-1 ring-white/30 text-white'
              : 'text-white/30 hover:bg-white/[0.06] hover:text-white/60'
            }
          `}
        >
          <Layers size={15} />
        </button>
      </Tooltip>

      {/* Divider */}
      <div className="w-5 h-px bg-white/[0.08] my-0.5" />

      {/* Project buttons */}
      {projects.map((p) => {
        const isActive = activeProjectId === p.id
        const colorCls = COLOR_MAP[p.color] ?? COLOR_MAP['indigo']
        const ringCls  = ACTIVE_RING[p.color] ?? ACTIVE_RING['indigo']
        return (
          <Tooltip key={p.id} label={p.name}>
            <button
              onClick={() => onSelectProject(p.id)}
              onMouseEnter={() => setHovered(p.id)}
              onMouseLeave={() => setHovered(null)}
              className={`
                w-8 h-8 rounded-xl flex items-center justify-center text-base
                transition-all duration-150 border
                ${colorCls}
                ${isActive ? `ring-2 ${ringCls} ring-offset-1 ring-offset-[#0a0a0a] scale-105` : 'hover:scale-105 hover:opacity-90'}
              `}
            >
              {p.emoji}
            </button>
          </Tooltip>
        )
      })}

      {/* Create project */}
      <Tooltip label="New Project">
        <button
          onClick={onCreateProject}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all duration-150 border border-dashed border-white/10 hover:border-white/20"
        >
          <Plus size={14} />
        </button>
      </Tooltip>

    </div>
  )
}

// ── Minimal tooltip ────────────────────────────────────────────────────────────
const Tooltip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="relative group">
    {children}
    <div className="
      pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2
      bg-[#1e1e1e] border border-white/10 text-white/80 text-[11px] font-medium
      px-2 py-1 rounded-lg whitespace-nowrap z-50 shadow-xl
      opacity-0 group-hover:opacity-100 transition-opacity duration-150
    ">
      {label}
    </div>
  </div>
)

// ── Create Project Modal ───────────────────────────────────────────────────────
const EMOJIS = ['🚀','💡','🎯','🛠️','📊','🎨','🔬','📝','💼','🌐','⚡','🔮','🏗️','🎭','🧩']
const COLORS = ['indigo','violet','blue','emerald','rose','amber','cyan'] as const

interface CreateProjectModalProps {
  onClose: () => void
  onCreate: (p: { name: string; emoji: string; color: string; systemPrompt: string }) => void
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ onClose, onCreate }) => {
  const [name, setName]           = useState('')
  const [emoji, setEmoji]         = useState('🚀')
  const [color, setColor]         = useState<typeof COLORS[number]>('indigo')
  const [systemPrompt, setSP]     = useState('')
  const [model, setModel]         = useState('claude-opus-4-5')

  const canCreate = name.trim().length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[460px] bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-white font-semibold text-base">New Project</h2>

        {/* Emoji picker */}
        <div>
          <label className="text-[11px] text-white/40 uppercase tracking-widest mb-2 block">Icon</label>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${
                  emoji === e ? 'bg-white/15 ring-1 ring-white/30 scale-110' : 'hover:bg-white/[0.07]'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="text-[11px] text-white/40 uppercase tracking-widest mb-2 block">Color</label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full transition-all ${
                  color === c ? 'scale-125 ring-2 ring-white/40 ring-offset-1 ring-offset-[#111]' : 'hover:scale-110'
                }`}
                style={{ background: `var(--color-${c})` }}
              />
            ))}
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="text-[11px] text-white/40 uppercase tracking-widest mb-1.5 block">Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Product Roadmap"
            className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-terra-400/50"
            onKeyDown={e => e.key === 'Enter' && canCreate && onCreate({ name: name.trim(), emoji, color, systemPrompt })}
          />
        </div>

        {/* Model */}
        <div>
          <label className="text-[11px] text-white/40 uppercase tracking-widest mb-1.5 block">Default Model</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/80 outline-none focus:border-terra-400/50"
          >
            <option value="claude-opus-4-5">Claude Opus 4.5</option>
            <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
            <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
          </select>
        </div>

        {/* System prompt */}
        <div>
          <label className="text-[11px] text-white/40 uppercase tracking-widest mb-1.5 block">System Prompt <span className="normal-case text-white/20">(optional)</span></label>
          <textarea
            value={systemPrompt}
            onChange={e => setSP(e.target.value)}
            rows={3}
            placeholder="Instructions applied to all chats in this project…"
            className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/80 placeholder-white/25 outline-none focus:border-terra-400/50 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/40 hover:text-white/70 rounded-xl hover:bg-white/[0.06] transition-colors">
            Cancel
          </button>
          <button
            disabled={!canCreate}
            onClick={() => onCreate({ name: name.trim(), emoji, color, systemPrompt })}
            className="px-5 py-2 text-sm font-medium bg-terra-500 hover:bg-terra-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  )
}
