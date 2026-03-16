/**
 * Bottom status bar — shows OpenClaw connection status + install progress
 */
import React from 'react'
import { WifiOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { GatewayStatus, WsStatus } from '../hooks/useOpenClaw'

interface Props {
  status: GatewayStatus
  wsStatus?: WsStatus
  wsUrl?: string
  log?: string
}

export const StatusBar: React.FC<Props> = ({ status, wsStatus, wsUrl, log }) => {
  const statusColor = {
    idle:       'text-white/30',
    checking:   'text-gold-300',
    installing: 'text-gold-300',
    starting:   'text-gold-300',
    ready:      'text-sage-300',
    error:      'text-blush-300',
  }[status] ?? 'text-white/30'

  // WS connection icon — show connected (green) only when WS is actually open
  const wsConnected = wsStatus === 'connected'
  const wsIcon =
    wsConnected            ? <CheckCircle2 size={11} className="text-sage-300" /> :
    status === 'error'     ? <AlertCircle size={11} className="text-blush-300" /> :
    status === 'idle'      ? <WifiOff size={11} className="text-white/25" /> :
    wsStatus === 'error'   ? <AlertCircle size={11} className="text-blush-300" /> :
                             <Loader2 size={11} className="text-gold-300 animate-spin" />

  const wsLabel = wsUrl ? wsUrl.replace('ws://', '') : '—'

  return (
    <div className="h-6 flex items-center px-3 gap-3 border-t border-white/[0.05] bg-black/20 flex-shrink-0">
      <div className="flex items-center gap-1.5">
        {wsIcon}
        <span className="text-[10px] text-white/25">
          {wsConnected ? wsLabel : wsStatus === 'connecting' ? 'connecting…' : status}
        </span>
      </div>
      <div className="w-px h-3 bg-white/[0.08]" />
      <span className={`text-[10px] font-mono ${statusColor}`}>
        openclaw: {status}
      </span>
      {status === 'ready' && !wsConnected && (
        <>
          <div className="w-px h-3 bg-white/[0.08]" />
          <span className="text-[10px] font-mono text-gold-300">
            ws: {wsStatus ?? 'disconnected'}
          </span>
        </>
      )}
      {log && (
        <>
          <div className="w-px h-3 bg-white/[0.08]" />
          <span className="text-[10px] text-white/20 font-mono truncate max-w-xs">{log}</span>
        </>
      )}
    </div>
  )
}
