/**
 * Theme Editor Panel — Browse, preview, create and customize themes
 */
import React, { useEffect, useState } from 'react'
import { Palette, Plus, Check, Trash2, Download, Upload, X } from 'lucide-react'

interface ThemePalette {
  primary: string; secondary: string; accent: string; success: string
  warning: string; danger: string; surface: string; surfaceAlt: string
  border: string; text: string; textMuted: string; textDim: string
}

interface ThemeConfig {
  id: string; name: string; description: string; palette: ThemePalette
  fontFamily: string; fontSize: number; borderRadius: number
  isBuiltin: boolean; isActive: boolean; createdAt: number; updatedAt: number
}

type View = 'gallery' | 'create' | 'edit'

const PALETTE_KEYS: Array<{ key: keyof ThemePalette; label: string }> = [
  { key: 'primary', label: 'Primary' }, { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' }, { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' }, { key: 'danger', label: 'Danger' },
  { key: 'surface', label: 'Surface' }, { key: 'surfaceAlt', label: 'Surface Alt' },
  { key: 'border', label: 'Border' }, { key: 'text', label: 'Text' },
  { key: 'textMuted', label: 'Text Muted' }, { key: 'textDim', label: 'Text Dim' },
]

const DEFAULT_PALETTE: ThemePalette = {
  primary: '#C4956A', secondary: '#D4A574', accent: '#A8C5A0', success: '#8FB88A',
  warning: '#D4A574', danger: '#C97B7B', surface: '#0D0B09', surfaceAlt: '#161411',
  border: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.85)',
  textMuted: 'rgba(255,255,255,0.50)', textDim: 'rgba(255,255,255,0.20)',
}

const ThemeEditorPanel: React.FC = () => {
  const [view, setView] = useState<View>('gallery')
  const [themes, setThemes] = useState<ThemeConfig[]>([])
  // Create form
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPalette, setNewPalette] = useState<ThemePalette>({ ...DEFAULT_PALETTE })
  const [newFont, setNewFont] = useState('Inter')
  const [newFontSize, setNewFontSize] = useState(13)
  const [newRadius, setNewRadius] = useState(8)

  const fetchThemes = async () => {
    try {
      const r = await window.nyra.themeEngine.listThemes()
      if (r.success) setThemes(r.result)
    } catch {}
  }

  useEffect(() => { fetchThemes() }, [])

  const handleActivate = async (id: string) => {
    try {
      await window.nyra.themeEngine.activate(id)
      fetchThemes()
    } catch {}
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      await window.nyra.themeEngine.create(newName, newPalette, { description: newDesc, fontFamily: newFont, fontSize: newFontSize, borderRadius: newRadius })
      setNewName(''); setNewDesc(''); setNewPalette({ ...DEFAULT_PALETTE })
      setView('gallery'); fetchThemes()
    } catch {}
  }

  const handleDelete = async (id: string) => {
    try {
      await window.nyra.themeEngine.delete(id)
      fetchThemes()
    } catch {}
  }

  const handleExport = async (id: string) => {
    try {
      const r = await window.nyra.themeEngine.export(id)
      if (r.success && r.result) navigator.clipboard.writeText(r.result)
    } catch {}
  }

  const handleImport = async () => {
    try {
      const json = await navigator.clipboard.readText()
      await window.nyra.themeEngine.import(json)
      fetchThemes()
    } catch {}
  }

  const updatePaletteColor = (key: keyof ThemePalette, value: string) => {
    setNewPalette(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Palette size={16} className="text-gold-300" />
        <h2 className="text-sm font-semibold text-white/80">Theme Editor</h2>
        <div className="ml-auto flex gap-1.5">
          <button onClick={handleImport} className="text-[10px] text-white/20 hover:text-white/40 px-2 py-1 rounded-lg">
            <Upload size={10} className="inline mr-1" />Import
          </button>
          <button onClick={() => { setView('create'); setNewPalette({ ...DEFAULT_PALETTE }) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-400/15 text-gold-300 text-[10px] font-medium hover:bg-gold-400/25 transition-colors">
            <Plus size={10} /> New Theme
          </button>
        </div>
      </div>

      {view === 'gallery' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {themes.map(theme => (
            <div key={theme.id} className={`border rounded-xl p-4 transition-colors ${theme.isActive ? 'border-gold-400/30 bg-gold-400/5' : 'border-white/[0.05] bg-white/[0.02] hover:border-white/[0.08]'}`}>
              <div className="flex items-center gap-2 mb-2">
                {theme.isActive && <Check size={12} className="text-gold-400" />}
                <h3 className="text-[13px] font-medium text-white/70">{theme.name}</h3>
                {theme.isBuiltin && <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/20">Built-in</span>}
              </div>
              {theme.description && <p className="text-[10px] text-white/25 mb-2">{theme.description}</p>}

              {/* Palette preview */}
              <div className="flex gap-1 mb-3">
                {(['primary', 'secondary', 'accent', 'success', 'warning', 'danger'] as Array<keyof ThemePalette>).map(key => (
                  <div key={key} className="w-6 h-6 rounded-md border border-white/10" style={{ backgroundColor: theme.palette[key] }}
                    title={`${key}: ${theme.palette[key]}`} />
                ))}
                <div className="w-6 h-6 rounded-md border border-white/10" style={{ backgroundColor: theme.palette.surface }} title="Surface" />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5">
                {!theme.isActive && (
                  <button onClick={() => handleActivate(theme.id)}
                    className="px-3 py-1 rounded-lg bg-gold-400/10 text-gold-300/60 text-[10px] hover:bg-gold-400/20">
                    Activate
                  </button>
                )}
                <button onClick={() => handleExport(theme.id)} className="px-2 py-1 rounded-lg text-white/20 hover:text-white/40 text-[10px]">
                  <Download size={10} className="inline mr-0.5" /> Export
                </button>
                {!theme.isBuiltin && (
                  <button onClick={() => handleDelete(theme.id)} className="p-1 rounded-lg text-blush-400/20 hover:text-blush-400/60 ml-auto">
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'create' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-medium text-white/60">Create Theme</h3>
            <button onClick={() => setView('gallery')} className="text-white/20 hover:text-white/40"><X size={14} /></button>
          </div>

          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Theme name..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[12px] text-white/70 placeholder:text-white/20 outline-none" />
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-white/50 placeholder:text-white/15 outline-none" />

          {/* Typography */}
          <div className="flex gap-2">
            <select value={newFont} onChange={e => setNewFont(e.target.value)}
              className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1.5 text-[11px] text-white/50 outline-none">
              <option value="Inter">Inter</option>
              <option value="JetBrains Mono">JetBrains Mono</option>
              <option value="Fira Code">Fira Code</option>
              <option value="SF Pro">SF Pro</option>
              <option value="system-ui">System UI</option>
            </select>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-white/25">Size</span>
              <input type="number" value={newFontSize} onChange={e => setNewFontSize(parseInt(e.target.value) || 13)} min={10} max={20}
                className="w-14 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1.5 text-[11px] text-white/50 outline-none text-center" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-white/25">Radius</span>
              <input type="number" value={newRadius} onChange={e => setNewRadius(parseInt(e.target.value) || 8)} min={0} max={24}
                className="w-14 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1.5 text-[11px] text-white/50 outline-none text-center" />
            </div>
          </div>

          {/* Color palette editor */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-white/30 uppercase tracking-wider">Color Palette</label>
            <div className="grid grid-cols-2 gap-2">
              {PALETTE_KEYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.04] rounded-lg px-2.5 py-1.5">
                  <input type="color" value={newPalette[key].startsWith('rgba') ? '#ffffff' : newPalette[key]}
                    onChange={e => updatePaletteColor(key, e.target.value)}
                    className="w-5 h-5 rounded border-0 cursor-pointer bg-transparent" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-white/40">{label}</span>
                    <input value={newPalette[key]} onChange={e => updatePaletteColor(key, e.target.value)}
                      className="w-full bg-transparent text-[9px] text-white/25 outline-none font-mono" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview strip */}
          <div className="rounded-xl p-3 border border-white/[0.06]" style={{ backgroundColor: newPalette.surface }}>
            <p className="text-[10px] mb-2" style={{ color: newPalette.textMuted }}>Preview</p>
            <div className="flex gap-1.5">
              {(['primary', 'secondary', 'accent', 'success', 'warning', 'danger'] as Array<keyof ThemePalette>).map(k => (
                <div key={k} className="px-2 py-1 rounded text-[9px] font-medium" style={{ backgroundColor: newPalette[k] + '30', color: newPalette[k] }}>{k}</div>
              ))}
            </div>
          </div>

          <button onClick={handleCreate} disabled={!newName.trim()}
            className="w-full py-2 rounded-lg bg-gold-400/20 text-gold-300 text-[11px] font-medium hover:bg-gold-400/30 transition-colors disabled:opacity-30">
            <Palette size={12} className="inline mr-1" />Create Theme
          </button>
        </div>
      )}
    </div>
  )
}

export default ThemeEditorPanel
