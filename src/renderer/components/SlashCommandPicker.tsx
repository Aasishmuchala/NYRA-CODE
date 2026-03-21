/**
 * SlashCommandPicker — "/" activated skill selector overlay.
 *
 * Appears above the ChatInput when the user types "/" at the start of their message.
 * Shows filtered skills from the marketplace catalog with keyboard navigation.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Zap, Code, PenTool, Database, Cog, Package, BookOpen } from 'lucide-react'

export interface SlashSkill {
  id: string
  name: string
  description: string
  category: string
  icon?: string
}

interface Props {
  query: string         // text after "/" — e.g. "code" if user typed "/code"
  onSelect: (skill: SlashSkill) => void
  onClose: () => void
  visible: boolean
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  coding: <Code size={12} />,
  writing: <PenTool size={12} />,
  data: <Database size={12} />,
  automation: <Cog size={12} />,
  productivity: <Zap size={12} />,
  other: <Package size={12} />,
}

// Built-in slash commands that work without marketplace
const BUILTIN_COMMANDS: SlashSkill[] = [
  { id: '_help',       name: 'help',       description: 'Show all available commands',           category: 'builtin', icon: '❓' },
  { id: '_clear',      name: 'clear',      description: 'Clear the current conversation',       category: 'builtin', icon: '🗑️' },
  { id: '_new',        name: 'new',        description: 'Start a new conversation',             category: 'builtin', icon: '✨' },
  { id: '_export',     name: 'export',     description: 'Export this conversation',              category: 'builtin', icon: '📤' },
  { id: '_model',      name: 'model',      description: 'Switch the active model',              category: 'builtin', icon: '🔄' },
  { id: '_incognito',  name: 'incognito',  description: 'Toggle incognito mode',                category: 'builtin', icon: '🌙' },
  { id: '_fast',       name: 'fast',       description: 'Toggle fast mode',                     category: 'builtin', icon: '⚡' },
  { id: '_settings',   name: 'settings',   description: 'Open settings panel',                  category: 'builtin', icon: '⚙️' },
]

export const SlashCommandPicker: React.FC<Props> = ({ query, onSelect, onClose, visible }) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [skills, setSkills] = useState<SlashSkill[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  // Load skills from marketplace
  useEffect(() => {
    if (!visible) return
    window.nyra.skills.browse().then(browsed => {
      const mapped: SlashSkill[] = browsed.map(s => ({
        id: s.id,
        name: s.name.toLowerCase().replace(/\s+/g, '-'),
        description: s.description,
        category: s.category,
        icon: s.icon,
      }))
      setSkills(mapped)
    }).catch(() => {})
  }, [visible])

  const allItems = useMemo(() => [...BUILTIN_COMMANDS, ...skills], [skills])

  const filtered = useMemo(() => {
    if (!query) return allItems.slice(0, 12) // show top 12 by default
    const q = query.toLowerCase()
    return allItems.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    ).slice(0, 12)
  }, [allItems, query])

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault()
        onSelect(filtered[selectedIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, filtered, selectedIndex, onSelect, onClose])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIndex] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!visible || filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
      <div className="max-w-[720px] mx-auto">
        <div className="bg-[#141210] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
          {/* Header */}
          <div className="px-3 pt-2.5 pb-1.5 border-b border-white/[0.06] flex items-center gap-2">
            <BookOpen size={11} className="text-terra-300/60" />
            <span className="text-[10px] text-white/30 font-medium uppercase tracking-widest">
              {query ? `Skills matching "/${query}"` : 'Slash Commands'}
            </span>
            <span className="text-[9px] text-white/15 ml-auto">↑↓ navigate · Enter select · Esc close</span>
          </div>

          {/* List */}
          <div ref={listRef} className="max-h-[280px] overflow-y-auto scrollbar-thin py-1">
            {filtered.map((skill, i) => (
              <button
                key={skill.id}
                onClick={() => onSelect(skill)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  i === selectedIndex ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                }`}
              >
                {/* Icon */}
                <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-white/[0.04] flex items-center justify-center text-[12px]">
                  {skill.icon || (CATEGORY_ICONS[skill.category] ?? <Package size={12} />)}
                </div>

                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-mono text-terra-300/80">/{skill.name}</span>
                    {skill.category !== 'builtin' && (
                      <span className="text-[9px] text-white/15 capitalize">{skill.category}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/25 truncate">{skill.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SlashCommandPicker
