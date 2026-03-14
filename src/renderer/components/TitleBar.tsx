/**
 * Custom frameless titlebar — works on macOS (traffic lights) and Windows
 */
import React from 'react'
import { Minus, Square, X } from 'lucide-react'

interface Props {
  title?: string
}

export const TitleBar: React.FC<Props> = ({ title = 'Nyra' }) => {
  const isMac = navigator.userAgent.includes('Macintosh')

  return (
    <div
      className="h-10 flex items-center justify-between px-4 select-none flex-shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* macOS: leave space for native traffic lights (16px left) */}
      {isMac && <div className="w-16" />}

      <span className="text-xs font-medium text-white/40 tracking-widest uppercase mx-auto">
        {title}
      </span>

      {/* Windows custom controls */}
      {!isMac && (
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => window.nyra.window.minimize()}
            className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={() => window.nyra.window.maximize()}
            className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <Square size={12} />
          </button>
          <button
            onClick={() => window.nyra.window.close()}
            className="p-1.5 rounded hover:bg-red-500/80 text-white/50 hover:text-white transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
