/**
 * AgentsSection — Compact agent status for sidebar.
 * Shows agent grid with status dots.
 * Uses real useAgentOrchestrator hook.
 */
import React from 'react'
import { useAgentOrchestrator } from '../../../hooks/useAgentOrchestrator'

const STATUS_DOT: Record<string, string> = {
  idle:     'bg-white/25',
  active:   'bg-sage-400',
  busy:     'bg-gold-400',
  error:    'bg-blush-400',
  disabled: 'bg-white/15',
}

const AgentsSection: React.FC = () => {
  const { agents, agentStates, mode, setMode } = useAgentOrchestrator()

  const displayAgents = agents.map(agent => {
    const state = agentStates.find(s => s.agentId === agent.id)
    return {
      id: agent.id,
      name: agent.name,
      emoji: agent.emoji,
      role: agent.role,
      status: state?.status || agent.status,
    }
  })

  const activeCount = displayAgents.filter(a => a.status === 'active').length
  const busyCount = displayAgents.filter(a => a.status === 'busy').length

  return (
    <div className="space-y-2">
      {/* Mode selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-white/50">Mode:</span>
        {(['solo', 'subagent', 'team'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-2 py-0.5 rounded text-[9px] font-medium cursor-pointer transition-colors border ${
              mode === m
                ? 'bg-terra-300/15 text-terra-300 border-terra-300/30'
                : 'text-white/45 border-white/[0.06] hover:text-white/60 hover:bg-white/[0.04]'
            }`}
          >
            {m}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[9px] text-white/45">
          {activeCount > 0 && <span className="text-sage-400">{activeCount} active</span>}
          {busyCount > 0 && <span className="text-gold-400 ml-1.5">{busyCount} busy</span>}
        </span>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {displayAgents.map(agent => (
          <div
            key={agent.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-colors"
          >
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[agent.status] || STATUS_DOT.idle} ${
              agent.status === 'active' ? 'animate-pulse' : ''
            }`} />
            <span className="text-sm flex-shrink-0">{agent.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-white/65 truncate leading-tight">{agent.name}</p>
              <p className="text-[8px] text-white/45 capitalize">{agent.status}</p>
            </div>
          </div>
        ))}
      </div>

      {displayAgents.length === 0 && (
        <p className="text-[10px] text-white/30 py-2">No agents configured</p>
      )}
    </div>
  )
}

export default AgentsSection
