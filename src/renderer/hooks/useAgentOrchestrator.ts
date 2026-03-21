import { useState, useEffect, useCallback } from 'react'

// Types
export type AgentRole =
  | 'planner' | 'research' | 'file_ops' | 'writer' | 'spreadsheet'
  | 'browser' | 'code' | 'qa' | 'security' | 'context_curator' | 'review'

export type AgentStatus = 'idle' | 'active' | 'busy' | 'error' | 'disabled'
export type ExecutionMode = 'solo' | 'subagent' | 'team'

export interface AgentDefinition {
  id: string
  name: string
  emoji: string
  role: AgentRole
  status: AgentStatus
}

export interface AgentState {
  agentId: string
  status: AgentStatus
  currentTaskId?: string
  tokensUsed: number
  tokenBudget: number
}

export interface OrchestratorState {
  mode: ExecutionMode
  activeTasks: string[]
  queuedTasks: string[]
}

export interface UseAgentOrchestrator {
  agents: AgentDefinition[]
  agentStates: AgentState[]
  mode: ExecutionMode
  orchestratorState: OrchestratorState | null
  loading: boolean
  setMode: (mode: ExecutionMode) => Promise<void>
  resetAllAgents: () => Promise<void>
  refreshAgents: () => Promise<void>
}

/**
 * Hook that wraps the Cowork agent and orchestrator preload API.
 * Uses window.nyra.agents.* channels.
 */
export const useAgentOrchestrator = (): UseAgentOrchestrator => {
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [agentStates, setAgentStates] = useState<AgentState[]>([])
  const [mode, setModeState] = useState<ExecutionMode>('solo')
  const [orchestratorState, setOrchestratorState] = useState<OrchestratorState | null>(null)
  const [loading, setLoading] = useState(true)

  // Load agents and states via preload API
  const loadData = useCallback(async () => {
    try {
      const [agentsData, statesData, orchState] = await Promise.all([
        window.nyra.agents.list(),
        window.nyra.agents.states(),
        window.nyra.agents.getOrchestratorState(),
      ])

      if (agentsData) setAgents(agentsData as unknown as AgentDefinition[])
      if (statesData) setAgentStates(statesData as unknown as AgentState[])
      if (orchState) {
        setOrchestratorState(orchState as unknown as OrchestratorState)
        setModeState((orchState as unknown as OrchestratorState).mode)
      }
    } catch (error) {
      console.error('Failed to load agent orchestrator data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Set execution mode
  const setMode = useCallback(async (newMode: ExecutionMode) => {
    try {
      await window.nyra.agents.setMode(newMode)
      setModeState(newMode)
      const orchState = await window.nyra.agents.getOrchestratorState()
      if (orchState) setOrchestratorState(orchState as unknown as OrchestratorState)
    } catch (error) {
      console.error('Failed to set execution mode:', error)
      throw error
    }
  }, [])

  // Reset all agents
  const resetAllAgents = useCallback(async () => {
    try {
      await window.nyra.agents.resetAll()
      await loadData()
    } catch (error) {
      console.error('Failed to reset agents:', error)
      throw error
    }
  }, [loadData])

  // Load data on mount
  useEffect(() => { loadData() }, [loadData])

  // Refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [loadData])

  // Subscribe to real-time agent status events
  useEffect(() => {
    const unsub = window.nyra.agents.onStatusChanged(() => {
      loadData()
    })
    return unsub as (() => void) | undefined
  }, [loadData])

  return {
    agents,
    agentStates,
    mode,
    orchestratorState,
    loading,
    setMode,
    resetAllAgents,
    refreshAgents: loadData,
  }
}
