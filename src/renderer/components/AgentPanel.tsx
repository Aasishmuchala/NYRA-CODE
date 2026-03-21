/**
 * AgentPanel — Phase 2 Agent Pipeline UI
 *
 * Shows the full reasoning → ensemble → execution → memory pipeline.
 * Collapsible sections for:
 *   1. Status bar + task input
 *   2. Live event feed (reasoning steps, ensemble results, tool calls)
 *   3. Trust mode controls
 *   4. Action history
 *   5. Available tools
 */
import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Brain, Zap, Shield, History, Wrench, ChevronDown, ChevronRight,
  Play, Square, RotateCcw, Send, AlertTriangle, CheckCircle2,
  XCircle, Loader2, Eye, Sparkles, Clock, Trash2, MessageSquare,
  ArrowRight,
} from 'lucide-react'
import { useAgentPipeline, type PipelineEvent, type TrustMode } from '../hooks/useAgentPipeline'

// ── Section Toggle ───────────────────────────────────────────────────────

const Section: React.FC<{
  title: string
  icon: React.ReactNode
  badge?: string | number
  defaultOpen?: boolean
  children: React.ReactNode
}> = ({ title, icon, badge, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-nyra-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-warm-200 hover:bg-white/[0.03] transition-colors"
      >
        {open ? <ChevronDown size={14} className="text-warm-400" /> : <ChevronRight size={14} className="text-warm-400" />}
        <span className="text-warm-400">{icon}</span>
        <span className="flex-1 text-left">{title}</span>
        {badge !== undefined && badge !== 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-terra-500/20 text-terra-300">{badge}</span>
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

// ── Status Indicator ──────────────────────────────────────────────────────

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const color = {
    idle: 'bg-warm-500',
    running: 'bg-terra-400 animate-pulse',
    completed: 'bg-sage-400',
    failed: 'bg-blush-400',
    cancelled: 'bg-warm-400',
  }[status] || 'bg-warm-500'

  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

// ── Event type icon ───────────────────────────────────────────────────────

const EventIcon: React.FC<{ type: PipelineEvent['type'] }> = ({ type }) => {
  switch (type) {
    case 'agent:started':  return <Zap size={12} className="text-terra-400" />
    case 'agent:output':   return <CheckCircle2 size={12} className="text-sage-400" />
    case 'agent:error':    return <XCircle size={12} className="text-blush-400" />
    case 'task:started':   return <Play size={12} className="text-terra-400" />
    case 'task:completed': return <CheckCircle2 size={12} className="text-sage-400" />
    case 'task:failed':    return <AlertTriangle size={12} className="text-blush-400" />
    case 'cu:session-started': return <Eye size={12} className="text-gold-400" />
    case 'cu:step-completed':  return <Sparkles size={12} className="text-gold-400" />
    default: return <Clock size={12} className="text-warm-400" />
  }
}

// ── Trust Mode Selector ──────────────────────────────────────────────────

const TrustModeSelector: React.FC<{
  mode: TrustMode
  onChange: (mode: TrustMode) => void
  onReset: () => void
}> = ({ mode, onChange, onReset }) => {
  const modes: Array<{ value: TrustMode; label: string; desc: string; icon: React.ReactNode }> = [
    { value: 'always-ask', label: 'Always Ask', desc: 'Approve every action', icon: <Shield size={14} /> },
    { value: 'smart', label: 'Smart', desc: 'Ask for risky actions only', icon: <Brain size={14} /> },
    { value: 'autopilot', label: 'Autopilot', desc: 'Fully autonomous', icon: <Zap size={14} /> },
  ]

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {modes.map(m => (
          <button
            key={m.value}
            onClick={() => onChange(m.value)}
            className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-all ${
              mode === m.value
                ? 'bg-terra-500/20 text-terra-300 ring-1 ring-terra-500/30'
                : 'text-warm-400 hover:bg-white/[0.03] hover:text-warm-300'
            }`}
          >
            {m.icon}
            <span className="font-medium">{m.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-warm-500">
        {modes.find(m => m.value === mode)?.desc}
      </p>
      <button
        onClick={onReset}
        className="flex items-center gap-1 text-[11px] text-warm-500 hover:text-warm-300 transition-colors"
      >
        <RotateCcw size={10} /> Reset learned trust rules
      </button>
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────────────

export const AgentPanel: React.FC = () => {
  const {
    status,
    events,
    actionHistory,
    trustMode,
    tools,
    executeTask,
    stopAgent,
    setTrustMode,
    resetTrustRules,
    clearEvents,
    eventCount,
  } = useAgentPipeline()

  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const eventListRef = useRef<HTMLDivElement>(null)

  // ── Agent Bus Messages ──────────────────────────────────────────────
  const [busMessages, setBusMessages] = useState<Array<{
    id: string; from: string; to: string; type: string
    summary: string; timestamp: number; priority?: number
  }>>([])

  useEffect(() => {
    // Load initial history
    window.nyra.agentBus.history(30)
      .then(msgs => setBusMessages(msgs))
      .catch(() => {})

    // Subscribe to live messages
    const unsub = window.nyra.agentBus.onMessage((msg) => {
      setBusMessages(prev => {
        const next = [msg, ...prev]
        return next.length > 100 ? next.slice(0, 100) : next
      })
    })

    return () => { unsub() }
  }, [])

  // Auto-scroll event feed
  useEffect(() => {
    if (eventListRef.current) {
      eventListRef.current.scrollTop = 0 // Newest events are at top
    }
  }, [eventCount])

  const handleSubmit = useCallback(async () => {
    const instruction = input.trim()
    if (!instruction || submitting) return
    setSubmitting(true)
    setInput('')
    try {
      await executeTask(instruction)
    } finally {
      setSubmitting(false)
      inputRef.current?.focus()
    }
  }, [input, submitting, executeTask])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="h-full flex flex-col bg-nyra-surface text-warm-200 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-nyra-border">
        <Brain size={16} className="text-terra-400" />
        <span className="text-sm font-semibold text-warm-100">Agent Pipeline</span>
        <div className="flex-1" />
        <StatusDot status={status} />
        <span className="text-[11px] text-warm-500 capitalize">{status}</span>
      </div>

      {/* ── Task Input ──────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-nyra-border">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Give the agent a task..."
            className="flex-1 bg-nyra-bg border border-nyra-border rounded-lg px-3 py-1.5 text-sm text-warm-100 placeholder:text-warm-600 focus:outline-none focus:ring-1 focus:ring-terra-500/40"
            disabled={submitting}
          />
          {status === 'running' ? (
            <button
              onClick={stopAgent}
              className="p-1.5 rounded-lg bg-blush-400/20 text-blush-300 hover:bg-blush-400/30 transition-colors"
              title="Stop agent"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || submitting}
              className="p-1.5 rounded-lg bg-terra-500/20 text-terra-300 hover:bg-terra-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Execute task"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable Sections ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Event Feed */}
        <Section title="Event Feed" icon={<Zap size={14} />} badge={eventCount} defaultOpen={true}>
          {events.length === 0 ? (
            <p className="text-[11px] text-warm-600 italic">No events yet. Execute a task to see the pipeline in action.</p>
          ) : (
            <div ref={eventListRef} className="space-y-1 max-h-64 overflow-y-auto">
              {events.map(evt => (
                <div key={evt.id} className="flex items-start gap-2 py-1 text-[11px]">
                  <span className="mt-0.5 shrink-0"><EventIcon type={evt.type} /></span>
                  <span className="text-warm-500 font-mono shrink-0">{formatTime(evt.timestamp)}</span>
                  <span className="text-warm-300 break-words min-w-0">
                    {evt.summary || evt.type}
                    {evt.agentId && <span className="text-warm-500"> ({evt.agentId})</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {events.length > 0 && (
            <button
              onClick={clearEvents}
              className="mt-2 flex items-center gap-1 text-[10px] text-warm-600 hover:text-warm-400 transition-colors"
            >
              <Trash2 size={10} /> Clear
            </button>
          )}
        </Section>

        {/* Agent Messages (Inter-Agent Communication) */}
        <Section title="Agent Messages" icon={<MessageSquare size={14} />} badge={busMessages.length}>
          {busMessages.length === 0 ? (
            <p className="text-[11px] text-warm-600 italic">No inter-agent messages yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {busMessages.slice(0, 25).map(msg => (
                <div key={msg.id} className="py-1 text-[11px] border-l-2 border-gold-400/30 pl-2">
                  <div className="flex items-center gap-1.5 text-warm-400">
                    <span className="font-mono text-warm-500">{formatTime(msg.timestamp)}</span>
                    <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                      msg.type === 'help_request' ? 'bg-terra-500/20 text-terra-300' :
                      msg.type === 'help_response' ? 'bg-sage-400/20 text-sage-300' :
                      msg.type === 'artifact_share' ? 'bg-gold-400/20 text-gold-300' :
                      msg.type === 'handoff' ? 'bg-terra-500/20 text-terra-300' :
                      'bg-warm-700/50 text-warm-400'
                    }`}>{msg.type.replace('_', ' ')}</span>
                    {msg.priority === 2 && <AlertTriangle size={10} className="text-terra-400" />}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-warm-300">
                    <span className="font-medium text-warm-200">{msg.from}</span>
                    <ArrowRight size={10} className="text-warm-600" />
                    <span className="font-medium text-warm-200">{msg.to === '*' ? 'all' : msg.to}</span>
                  </div>
                  <p className="text-warm-400 mt-0.5 break-words">{msg.summary}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Trust Mode */}
        <Section title="Trust Mode" icon={<Shield size={14} />}>
          <TrustModeSelector mode={trustMode} onChange={setTrustMode} onReset={resetTrustRules} />
        </Section>

        {/* Action History */}
        <Section title="Action History" icon={<History size={14} />} badge={actionHistory.length}>
          {actionHistory.length === 0 ? (
            <p className="text-[11px] text-warm-600 italic">No actions recorded yet.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {actionHistory.slice(0, 20).map((entry, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5 text-[11px]">
                  {entry.approved ? (
                    <CheckCircle2 size={10} className="text-sage-400 shrink-0" />
                  ) : (
                    <XCircle size={10} className="text-blush-400 shrink-0" />
                  )}
                  <span className="text-warm-500 font-mono shrink-0">{formatTime(entry.timestamp)}</span>
                  <span className="text-warm-300 truncate">{entry.action}</span>
                  {entry.target && <span className="text-warm-600 truncate">→ {entry.target}</span>}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Available Tools */}
        <Section title="Tools" icon={<Wrench size={14} />} badge={tools.length}>
          {tools.length === 0 ? (
            <p className="text-[11px] text-warm-600 italic">No tools loaded.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {tools.map((tool, i) => (
                <div key={i} className="py-1">
                  <div className="text-[11px] font-medium text-warm-200 font-mono">{tool.name}</div>
                  <div className="text-[10px] text-warm-500 leading-tight">{tool.description?.slice(0, 100)}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

      </div>
    </div>
  )
}

export default AgentPanel
