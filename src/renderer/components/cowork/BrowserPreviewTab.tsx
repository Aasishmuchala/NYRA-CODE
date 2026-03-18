import React, { useState, useEffect, useCallback } from 'react'
import {
  Globe, ArrowLeft, ArrowRight, RefreshCw, Monitor, Tablet, Smartphone,
  Eye, EyeOff, Camera, Terminal, Loader2, X, Maximize2,
} from 'lucide-react'

type ViewportPreset = 'desktop' | 'tablet' | 'mobile' | 'custom'

const VIEWPORT_ICONS: Record<ViewportPreset, typeof Monitor> = {
  desktop: Monitor, tablet: Tablet, mobile: Smartphone, custom: Maximize2,
}

// ── Console Entry ─────────────────────────────────────────────────────────────

const ConsoleEntry: React.FC<{ entry: any }> = ({ entry }) => {
  const levelColors: Record<string, string> = {
    info: 'text-terra-300', warning: 'text-gold-300', error: 'text-blush-300', verbose: 'text-white/30',
  }
  return (
    <div className="flex gap-2 px-2 py-0.5 text-[9px] font-mono border-b border-white/[0.03]">
      <span className={levelColors[entry.level] || 'text-white/40'}>{entry.level}</span>
      <span className="text-white/50 flex-1 truncate">{entry.message}</span>
      <span className="text-white/20">{new Date(entry.timestamp).toLocaleTimeString()}</span>
    </div>
  )
}

// ── Main BrowserPreviewTab ────────────────────────────────────────────────────

const BrowserPreviewTab: React.FC = () => {
  const [url, setUrl] = useState('http://localhost:3000')
  const [state, setState] = useState<any>({
    url: '', title: '', loading: false,
    canGoBack: false, canGoForward: false,
    viewport: 'desktop', autoReload: false,
    devToolsOpen: false, attached: false,
  })
  const [consoleLogs, setConsoleLogs] = useState<any[]>([])
  const [showConsole, setShowConsole] = useState(false)

  const refresh = useCallback(async () => {
    const s = await window.nyra.preview.getState()
    setState(s)
  }, [])

  useEffect(() => {
    refresh()
    const unsubs = [
      window.nyra.preview.onStateChanged((s: any) => setState(s)),
      window.nyra.preview.onConsole((entry: any) => {
        setConsoleLogs(prev => [...prev.slice(-199), entry])
      }),
    ]
    return () => unsubs.forEach((u: () => void) => u())
  }, [refresh])

  const handleNavigate = async () => {
    if (!url.trim()) return
    await window.nyra.preview.navigate(url.trim())
  }

  const handleAttachToggle = async () => {
    if (state.attached) await window.nyra.preview.detach()
    else await window.nyra.preview.attach()
    refresh()
  }

  const handleViewport = async (preset: ViewportPreset) => {
    await window.nyra.preview.setViewport(preset)
    refresh()
  }

  const handleAutoReloadToggle = async () => {
    if (state.autoReload) await window.nyra.preview.stopAutoReload()
    else await window.nyra.preview.startAutoReload()
    refresh()
  }

  const handleCapture = async () => {
    const base64 = await window.nyra.preview.capture()
    if (base64) {
      // Open in a new tab or display — for now just log
      console.log('[Preview] Captured screenshot', base64.length, 'bytes')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* URL bar */}
      <div className="px-4 py-2 border-b border-white/[0.06] space-y-2">
        <div className="flex items-center gap-1.5">
          <button onClick={() => window.nyra.preview.goBack()} disabled={!state.canGoBack}
            className="p-1 hover:bg-white/[0.06] rounded disabled:opacity-30">
            <ArrowLeft size={14} className="text-white/50" />
          </button>
          <button onClick={() => window.nyra.preview.goForward()} disabled={!state.canGoForward}
            className="p-1 hover:bg-white/[0.06] rounded disabled:opacity-30">
            <ArrowRight size={14} className="text-white/50" />
          </button>
          <button onClick={() => window.nyra.preview.reload()}
            className="p-1 hover:bg-white/[0.06] rounded">
            {state.loading ? <Loader2 size={14} className="text-white/50 animate-spin" /> : <RefreshCw size={14} className="text-white/50" />}
          </button>

          <div className="flex-1">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNavigate()}
              placeholder="Enter URL..."
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded px-2 py-1 text-[10px] text-white/70 outline-none font-mono"
            />
          </div>

          <button onClick={handleNavigate}
            className="flex items-center gap-1 px-2 py-1 rounded bg-terra-500/10 text-terra-300 text-[10px] hover:bg-terra-500/20">
            <Globe size={10} /> Go
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Viewport presets */}
          {(['desktop', 'tablet', 'mobile'] as ViewportPreset[]).map(preset => {
            const Icon = VIEWPORT_ICONS[preset]
            return (
              <button key={preset} onClick={() => handleViewport(preset)}
                className={`p-1 rounded ${state.viewport === preset ? 'bg-terra-500/20 text-terra-300' : 'text-white/30 hover:text-white/50'}`}
                title={preset}>
                <Icon size={12} />
              </button>
            )
          })}

          <div className="w-px h-4 bg-white/10" />

          {/* Attach/Detach */}
          <button onClick={handleAttachToggle}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] ${
              state.attached ? 'bg-sage-500/10 text-sage-300' : 'bg-white/[0.06] text-white/40'
            }`}>
            {state.attached ? <><Eye size={10} /> Attached</> : <><EyeOff size={10} /> Detached</>}
          </button>

          {/* Auto-reload */}
          <button onClick={handleAutoReloadToggle}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] ${
              state.autoReload ? 'bg-gold-500/10 text-gold-300' : 'bg-white/[0.06] text-white/40'
            }`}>
            <RefreshCw size={10} /> {state.autoReload ? 'Auto' : 'Manual'}
          </button>

          {/* Capture */}
          <button onClick={handleCapture}
            className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.06] text-white/40 text-[9px] hover:bg-white/[0.1]">
            <Camera size={10} /> Capture
          </button>

          {/* DevTools */}
          <button onClick={() => window.nyra.preview.toggleDevTools()}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] ${
              state.devToolsOpen ? 'bg-terra-500/10 text-terra-300' : 'bg-white/[0.06] text-white/40'
            }`}>
            <Terminal size={10} /> DevTools
          </button>
        </div>
      </div>

      {/* Status / Info */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {!state.attached && (
          <div className="flex flex-col items-center justify-center py-12 text-white/30 gap-2">
            <Globe size={28} className="text-white/15" />
            <p className="text-[11px]">Browser Preview</p>
            <p className="text-[9px] text-white/20">Enter a URL and click "Attached" to embed a live web preview</p>
            <p className="text-[9px] text-white/15">Supports auto-reload on file save and screenshot capture</p>
          </div>
        )}

        {state.attached && (
          <div className="space-y-3">
            <div className="border border-white/[0.06] rounded-lg p-3 bg-white/[0.02]">
              <p className="text-[11px] text-white/60 font-semibold">{state.title || 'Loading...'}</p>
              <p className="text-[9px] text-white/30 font-mono truncate mt-1">{state.url}</p>
              <p className="text-[9px] text-white/20 mt-1">Viewport: {state.viewport} · {state.autoReload ? 'Auto-reload ON' : 'Manual reload'}</p>
            </div>

            {/* Console toggle */}
            <button onClick={() => setShowConsole(!showConsole)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.06] text-white/40 text-[10px] hover:bg-white/[0.1]">
              <Terminal size={10} />
              Console ({consoleLogs.length})
              {showConsole && <X size={10} className="ml-auto" />}
            </button>

            {showConsole && (
              <div className="border border-white/[0.06] rounded-lg bg-black/30 max-h-60 overflow-y-auto scrollbar-thin">
                {consoleLogs.length === 0 && (
                  <p className="text-[9px] text-white/20 p-3 text-center">No console output yet</p>
                )}
                {consoleLogs.map((entry, i) => <ConsoleEntry key={i} entry={entry} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default BrowserPreviewTab
