/**
 * CollaborationTimeline — Real-time agent collaboration visualization
 *
 * A mission-control-style timeline that shows:
 *   - Task decomposition: lead agent breaks work into subtasks
 *   - Agent assignments: which specialist handles each subtask
 *   - Message bus activity: direct messages, help requests, artifact sharing
 *   - Handoffs: ownership transfers between agents
 *   - Completion: results flowing back to the lead
 *
 * Polls orchestrator state and task events at 2s intervals.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────

interface TimelineEvent {
  id: string
  timestamp: number
  type: 'decompose' | 'assign' | 'message' | 'handoff' | 'result' | 'error' | 'status'
  from: string
  to: string
  taskId: string
  summary: string
  confidence?: number
  artifacts?: Array<{ name: string; type: string }>
}

interface ActiveAgent {
  id: string
  role: string
  status: 'idle' | 'working' | 'waiting' | 'done' | 'error'
  currentTask?: string
  startedAt?: number
}

interface OrchestratorSnapshot {
  mode: string
  activeTaskCount: number
  queuedTaskCount: number
  activeAgents: string[]
}

// ── Agent color palette ────────────────────────────────────────

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  lead:       { bg: 'bg-terra-400/10', text: 'text-terra-300', border: 'border-terra-400/20', dot: 'bg-terra-400' },
  coder:      { bg: 'bg-sage-400/10',  text: 'text-sage-300',  border: 'border-sage-400/20',  dot: 'bg-sage-400' },
  reviewer:   { bg: 'bg-gold-400/10',  text: 'text-gold-300',  border: 'border-gold-400/20',  dot: 'bg-gold-400' },
  researcher: { bg: 'bg-terra-400/10',  text: 'text-terra-300',  border: 'border-terra-400/20',  dot: 'bg-terra-400' },
  writer:     { bg: 'bg-gold-400/10', text: 'text-gold-300', border: 'border-gold-400/20', dot: 'bg-gold-400' },
  ops:        { bg: 'bg-warm-400/10', text: 'text-warm-300', border: 'border-warm-400/20', dot: 'bg-warm-400' },
  default:    { bg: 'bg-white/[0.04]',  text: 'text-white/60',  border: 'border-white/[0.06]',  dot: 'bg-white/40' },
}

function getAgentColor(agentId: string) {
  const role = agentId.split('-')[0]?.toLowerCase() || ''
  return AGENT_COLORS[role] || AGENT_COLORS.default
}

// ── Event type config ──────────────────────────────────────────

const EVENT_CONFIG: Record<TimelineEvent['type'], { icon: string; label: string; color: string }> = {
  decompose: { icon: '◈', label: 'Decomposed', color: 'text-terra-300' },
  assign:    { icon: '→', label: 'Assigned',    color: 'text-gold-300' },
  message:   { icon: '◇', label: 'Message',     color: 'text-white/50' },
  handoff:   { icon: '⇄', label: 'Handoff',     color: 'text-gold-300' },
  result:    { icon: '✓', label: 'Result',       color: 'text-sage-300' },
  error:     { icon: '✗', label: 'Error',        color: 'text-blush-300' },
  status:    { icon: '●', label: 'Status',       color: 'text-white/30' },
}

// ── Agent Badge ────────────────────────────────────────────────

const AgentBadge: React.FC<{ agentId: string; size?: 'sm' | 'md' }> = ({ agentId, size = 'sm' }) => {
  const color = getAgentColor(agentId)
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-[11px]'
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5'

  return (
    <span className={`${color.bg} ${color.text} ${padding} ${textSize} rounded-full font-medium border ${color.border} inline-flex items-center gap-1`}>
      <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
      {agentId}
    </span>
  )
}

// ── Timeline Event Row ─────────────────────────────────────────

const TimelineEventRow: React.FC<{ event: TimelineEvent; isLast: boolean }> = ({ event, isLast }) => {
  const config = EVENT_CONFIG[event.type]
  const [expanded, setExpanded] = useState(false)

  const timeStr = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="flex gap-3 group">
      {/* Timeline spine */}
      <div className="flex flex-col items-center w-5 flex-shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full border-2 ${
          event.type === 'error' ? 'border-blush-400 bg-blush-400/30' :
          event.type === 'result' ? 'border-sage-400 bg-sage-400/30' :
          'border-white/20 bg-white/[0.06]'
        }`} />
        {!isLast && <div className="w-px flex-1 bg-white/[0.06] min-h-[20px]" />}
      </div>

      {/* Event content */}
      <div className="flex-1 pb-3 min-w-0">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => setExpanded(e => !e)}
        >
          <span className={`${config.color} text-[11px]`}>{config.icon}</span>
          <AgentBadge agentId={event.from} />
          {event.to && event.to !== event.from && (
            <>
              <span className="text-white/15 text-[10px]">→</span>
              <AgentBadge agentId={event.to} />
            </>
          )}
          <span className="text-[10px] text-white/20 font-mono ml-auto flex-shrink-0">{timeStr}</span>
        </div>

        <p className="text-[12px] text-white/50 mt-1 leading-relaxed line-clamp-2">
          {event.summary}
        </p>

        {expanded && (
          <div className="mt-2 space-y-1">
            {event.confidence != null && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/20">Confidence</span>
                <div className="w-20 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-terra-400/50 rounded-full"
                    style={{ width: `${(event.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-white/30 font-mono">{(event.confidence * 100).toFixed(0)}%</span>
              </div>
            )}
            {event.artifacts && event.artifacts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {event.artifacts.map((a, i) => (
                  <span key={i} className="text-[9px] bg-white/[0.04] text-white/30 px-1.5 py-0.5 rounded border border-white/[0.04]">
                    {a.name}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[9px] text-white/15 font-mono">
              task:{event.taskId}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Active Agents Bar ──────────────────────────────────────────

const ActiveAgentsBar: React.FC<{ agents: ActiveAgent[] }> = ({ agents }) => {
  if (agents.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-white/[0.04] bg-white/[0.01]">
      {agents.map(a => {
        const color = getAgentColor(a.id)
        const statusDot = a.status === 'working' ? 'animate-pulse bg-sage-400' :
                          a.status === 'error' ? 'bg-blush-400' :
                          a.status === 'waiting' ? 'bg-gold-400' :
                          'bg-white/20'

        return (
          <div key={a.id} className={`flex items-center gap-1.5 ${color.bg} ${color.border} border rounded-lg px-2 py-1`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
            <span className={`${color.text} text-[10px] font-medium`}>{a.id}</span>
            {a.currentTask && (
              <span className="text-[9px] text-white/20 max-w-[100px] truncate">
                {a.currentTask}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────

const CollaborationTimeline: React.FC = () => {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [agents, setAgents] = useState<ActiveAgent[]>([])
  const [orchState, setOrchState] = useState<OrchestratorSnapshot | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState<TimelineEvent['type'] | 'all'>('all')

  const scrollRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll orchestrator state
  const pollState = useCallback(async () => {
    try {
      const state = await window.nyra.agents.getOrchestratorState()
      setOrchState(state)

      // Update active agents list
      if (state.activeAgents) {
        setAgents(prev => {
          const updated = new Map(prev.map(a => [a.id, a]))
          for (const id of state.activeAgents) {
            if (!updated.has(id)) {
              updated.set(id, { id, role: id.split('-')[0] || 'agent', status: 'working' })
            } else {
              const existing = updated.get(id)!
              updated.set(id, { ...existing, status: 'working' })
            }
          }
          // Mark agents no longer active
          for (const [id, agent] of updated) {
            if (!state.activeAgents.includes(id) && agent.status === 'working') {
              updated.set(id, { ...agent, status: 'idle' })
            }
          }
          return Array.from(updated.values())
        })
      }
    } catch {
      // Orchestrator may not be initialized yet
    }
  }, [])

  useEffect(() => {
    pollState()
    pollRef.current = setInterval(pollState, 2000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pollState])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events, autoScroll])

  // Simulated event injection (in production, these come from IPC event subscriptions)
  const _addEvent = useCallback((event: Omit<TimelineEvent, 'id' | 'timestamp'>) => {
    setEvents(prev => [...prev, {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    }])
  }, [])

  // Filter events
  const filteredEvents = filter === 'all' ? events : events.filter(e => e.type === filter)

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        <span className="text-[14px]">⊙</span>
        <span className="text-[12px] font-medium text-white/60">Collaboration Timeline</span>

        <div className="flex-1" />

        {/* Orchestrator status */}
        {orchState && (
          <div className="flex items-center gap-2 text-[10px] text-white/20 font-mono">
            <span className={`w-1.5 h-1.5 rounded-full ${orchState.activeTaskCount > 0 ? 'bg-sage-400 animate-pulse' : 'bg-white/20'}`} />
            <span>{orchState.mode}</span>
            <span>•</span>
            <span>{orchState.activeTaskCount} active</span>
            {orchState.queuedTaskCount > 0 && <span>• {orchState.queuedTaskCount} queued</span>}
          </div>
        )}
      </div>

      {/* Active agents bar */}
      <ActiveAgentsBar agents={agents.filter(a => a.status === 'working')} />

      {/* Filter bar */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-white/[0.04]">
        {(['all', 'decompose', 'assign', 'message', 'handoff', 'result', 'error'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              filter === f
                ? 'bg-terra-400/15 text-terra-300'
                : 'text-white/20 hover:text-white/40'
            }`}
          >
            {f === 'all' ? 'All' : EVENT_CONFIG[f].icon + ' ' + EVENT_CONFIG[f].label}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={() => setAutoScroll(s => !s)}
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
            autoScroll ? 'text-sage-300' : 'text-white/20'
          }`}
        >
          {autoScroll ? '↓ Auto' : '↓ Paused'}
        </button>
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-white/15">
            <div className="text-3xl">⊙</div>
            <p className="text-[13px]">No agent activity yet</p>
            <p className="text-[11px] text-white/10">Events appear here when agents collaborate on tasks</p>

            {/* Quick-start hint */}
            <div className="mt-4 space-y-2 text-[11px] text-white/15 text-center">
              <p>Submit a task in Cowork mode to see agents in action</p>
              <div className="flex items-center gap-2 justify-center">
                <span className="text-terra-300">◈</span>
                <span>Decompose → Assign → Execute → Handoff → Complete</span>
              </div>
            </div>
          </div>
        ) : (
          filteredEvents.map((event, i) => (
            <TimelineEventRow
              key={event.id}
              event={event}
              isLast={i === filteredEvents.length - 1}
            />
          ))
        )}
      </div>

      {/* Footer stats */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-t border-white/[0.04] text-[10px] text-white/15 font-mono">
        <span>{events.length} events</span>
        <span>•</span>
        <span>{agents.length} agents tracked</span>
        {agents.filter(a => a.status === 'working').length > 0 && (
          <>
            <span>•</span>
            <span className="text-sage-300">{agents.filter(a => a.status === 'working').length} active</span>
          </>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setEvents([])}
          className="text-white/15 hover:text-blush-400 transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

export default CollaborationTimeline
