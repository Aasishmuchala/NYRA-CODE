/**
 * Bottom status bar — shows OpenClaw connection status + install progress
 */
import React from 'react'
import { WifiOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { GatewayStatus } from '../hooks/useOpenClaw'

interface Props {
  status: GatewayStatus
  wsUrl?: string
  log?: string
}

export const StatusBar: React.FC<Props> = ({ status, wsUrl, log }) => {
  const statusColor = {
    idle:       'text-white/30',
    checking:   'text-yellow-400',
    installing: 'text-gold-400',
    starting:   'text-yellow-400',
    ready:      'text-green-400',
    error:      'text-red-400',
  }[status] ?? 'text-white/30'

  const wsIcon =
    status === 'ready'      ? <CheckCircle2 size={11} className="text-green-400" /> :
    status === 'error'      ? <AlertCircle size={11} className="text-red-400" /> :
    status === 'idle'       ? <WifiOff size={11} className="text-white/25" /> :
                              <Loader2 size={11} className="text-yellow-400 animate-spin" />

  const wsLabel = wsUrl ? wsUrl.replace('ws://', '') : '—'

  return (
    <div className="h-6 flex items-center px-3 gap-3 border-t border-white/[0.05] bg-black/20 flex-shrink-0">
      <div className="flex items-center gap-1.5">
        {wsIcon}
        <span className="text-[10px] text-white/25">
          {status === 'ready' ? wsLabel : status}
        </span>
      </div>
      <div className="w-px h-3 bg-white/[0.08]" />
      <span className={`text-[10px] font-mono ${statusColor}`}>
        openclaw: {status}
      </span>
      {log && (
        <>
          <div className="w-px h-3 bg-white/[0.08]" />
          <span className="text-[10px] text-white/20 font-mono truncate max-w-xs">{log}</span>
        </>
      )}
    </div>
  )
}
