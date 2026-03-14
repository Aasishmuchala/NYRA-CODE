/**
 * Model Selector — dropdown to pick OpenClaw model per session
 */
import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Zap, Brain, Cpu } from 'lucide-react'

export interface Model {
  id: string
  name: string
  description: string
  speed: 'fast' | 'balanced' | 'powerful'
}

const DEFAULT_MODELS: Model[] = [
  { id: 'auto',     name: 'Auto',          description: 'OpenClaw chooses best model', speed: 'balanced' },
  { id: 'fast',     name: 'Fast',          description: 'Quick responses, lower cost',  speed: 'fast'     },
  { id: 'balanced', name: 'Balanced',      description: 'Best quality/speed ratio',     speed: 'balanced' },
  { id: 'powerful', name: 'Powerful',      description: 'Max capability, complex tasks',speed: 'powerful' },
]

const speedIcon = { fast: Zap, balanced: Cpu, powerful: Brain }
const speedColor = {
  fast:     'text-yellow-400',
  balanced: 'text-gold-400',
  powerful: 'text-gold-400',
}

interface Props {
  value: string
  onChange: (id: string) => void
  models?: Model[]
}

export const ModelSelector: React.FC<Props> = ({
  value, onChange, models = DEFAULT_MODELS
}) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = models.find(m => m.id === value) ?? models[0]
  const Icon = speedIcon[current.speed]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 text-xs text-white/70 hover:text-white transition-all"
      >
        <Icon size={12} className={speedColor[current.speed]} />
        <span className="font-medium">{current.name}</span>
        <ChevronDown size={11} className={`text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-56 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50">
          {models.map(m => {
            const MIcon = speedIcon[m.speed]
            return (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false) }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5 ${
                  m.id === value ? 'bg-white/8' : ''
                }`}
              >
                <MIcon size={14} className={speedColor[m.speed]} />
                <div>
                  <p className={`text-sm font-medium ${m.id === value ? 'text-white' : 'text-white/70'}`}>{m.name}</p>
                  <p className="text-xs text-white/30">{m.description}</p>
                </div>
                {m.id === value && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-terra-400" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
