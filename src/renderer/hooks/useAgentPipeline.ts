/**
 * useAgentPipeline — React hook for the Phase 2 agent execution pipeline.
 *
 * Consumes three preload namespaces:
 *   window.nyra.desktopAgent  — request/response (execute, trust, tools)
 *   window.nyra.agentPipeline — push events (status, output, errors)
 *   window.nyra.computerUse   — computer-use session state
 *
 * Provides unified state for the AgentPanel UI:
 *   - Current execution status + running agent info
 *   - Live event log (reasoning steps, ensemble results, tool calls)
 *   - Trust mode controls
 *   - Action history
 *   - Computer-use session state with lazy screenshot loading
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type PipelineStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
export type TrustMode = 'always-ask' | 'smart' | 'autopilot'

export interface PipelineEvent {
  id: string
  timestamp: number
  type:
    | 'agent:started'
    | 'agent:output'
    | 'agent:error'
    | 'task:started'
    | 'task:completed'
    | 'task:failed'
    | 'cu:session-started'
    | 'cu:step-completed'
  agentId?: string
  taskId?: string
  summary?: string
  data?: unknown
}

export interface ActionHistoryEntry {
  timestamp: number
  action: string
  target: string | null
  approved: boolean
  agentId?: string
  taskId?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ComputerUseStep {
  id: number
  action: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  screenshot?: { base64: string; width: number; height: number } | null
}

export interface ComputerUseSession {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  task: string
  steps: ComputerUseStep[]
  tokensUsed: number
  tokenBudget: number
}

export interface UseAgentPipeline {
  // State
  status: PipelineStatus
  events: PipelineEvent[]
  actionHistory: ActionHistoryEntry[]
  trustMode: TrustMode
  tools: ToolDefinition[]
  computerUseSession: ComputerUseSession | null

  // Actions
  executeTask: (instruction: string, taskId?: string) => Promise<{ success: boolean; result?: unknown; error?: string }>
  stopAgent: () => Promise<void>
  setTrustMode: (mode: TrustMode) => Promise<void>
  resetTrustRules: () => Promise<void>
  executeTool: (toolName: string, args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>
  loadScreenshot: (stepId: number) => Promise<{ base64: string; width: number; height: number } | null>
  clearEvents: () => void
  refreshHistory: () => Promise<void>

  // Derived
  latestAgent: string | null
  latestTask: string | null
  eventCount: number
}

// ── Hook Implementation ──────────────────────────────────────────────────────

const MAX_EVENTS = 200

export const useAgentPipeline = (): UseAgentPipeline => {
  const [status, setStatus] = useState<PipelineStatus>('idle')
  const [events, setEvents] = useState<PipelineEvent[]>([])
  const [actionHistory, setActionHistory] = useState<ActionHistoryEntry[]>([])
  const [trustMode, setTrustModeState] = useState<TrustMode>('smart')
  const [tools, setTools] = useState<ToolDefinition[]>([])
  const [computerUseSession, setComputerUseSession] = useState<ComputerUseSession | null>(null)

  const latestAgentRef = useRef<string | null>(null)
  const latestTaskRef = useRef<string | null>(null)

  // ── Event helpers ────────────────────────────────────────────────────────

  const pushEvent = useCallback((evt: Omit<PipelineEvent, 'id' | 'timestamp'>) => {
    const newEvent: PipelineEvent = {
      ...evt,
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    }
    setEvents(prev => {
      const next = [newEvent, ...prev]
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next
    })
  }, [])

  // ── Initial data load ───────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const [mode, history, toolDefs, cuSession] = await Promise.all([
          window.nyra.desktopAgent.getTrustMode(),
          window.nyra.desktopAgent.getActionHistory(50),
          window.nyra.desktopAgent.getToolDefinitions(),
          window.nyra.computerUse.getSession(),
        ])

        if (!mounted) return
        if (mode) setTrustModeState(mode as TrustMode)
        if (history) setActionHistory(history)
        if (toolDefs) setTools(toolDefs)
        if (cuSession) setComputerUseSession(cuSession)
      } catch (err) {
        console.warn('[useAgentPipeline] Initial load failed:', err)
      }
    }

    load()
    return () => { mounted = false }
  }, [])

  // ── Event subscriptions ─────────────────────────────────────────────────

  useEffect(() => {
    const cleanups: Array<() => void> = []

    // Agent status (running/idle)
    cleanups.push(
      window.nyra.agentPipeline.onTaskStarted((data) => {
        latestAgentRef.current = data.agentId
        latestTaskRef.current = data.taskId
        setStatus('running')
        pushEvent({
          type: 'agent:started',
          agentId: data.agentId,
          taskId: data.taskId,
          summary: `Agent ${data.agentId} started`,
        })
      })
    )

    // Agent output (successful result)
    cleanups.push(
      window.nyra.agentPipeline.onAgentOutput((data) => {
        pushEvent({
          type: 'agent:output',
          agentId: data.agentId,
          taskId: data.taskId,
          summary: data.message?.payload?.summary || 'Agent produced output',
          data: data.message,
        })
      })
    )

    // Agent error
    cleanups.push(
      window.nyra.agentPipeline.onAgentError((data) => {
        pushEvent({
          type: 'agent:error',
          agentId: data.agentId,
          taskId: data.taskId,
          summary: data.error,
        })
      })
    )

    // Task execution lifecycle
    cleanups.push(
      window.nyra.agentPipeline.onTaskExecutionStarted((data) => {
        setStatus('running')
        pushEvent({
          type: 'task:started',
          taskId: data.taskId,
          summary: `Task started: ${data.taskId}`,
          data,
        })
      })
    )

    cleanups.push(
      window.nyra.agentPipeline.onTaskExecutionCompleted((data) => {
        setStatus('completed')
        pushEvent({
          type: 'task:completed',
          taskId: data.taskId,
          summary: data.summary || 'Task completed',
          data,
        })
        // Auto-refresh action history on task completion
        window.nyra.desktopAgent.getActionHistory(50)
          .then(h => setActionHistory(h))
          .catch(() => {})
      })
    )

    cleanups.push(
      window.nyra.agentPipeline.onTaskExecutionFailed((data) => {
        setStatus('failed')
        pushEvent({
          type: 'task:failed',
          taskId: data.taskId,
          summary: data.error || 'Task failed',
          data,
        })
      })
    )

    // Computer use events
    cleanups.push(
      window.nyra.agentPipeline.onComputerUseSessionStarted((data) => {
        pushEvent({
          type: 'cu:session-started',
          summary: `Computer use session started: ${data.task || 'task'}`,
          data,
        })
        // Refresh session state
        window.nyra.computerUse.getSession()
          .then(s => { if (s) setComputerUseSession(s) })
          .catch(() => {})
      })
    )

    cleanups.push(
      window.nyra.agentPipeline.onComputerUseStepCompleted((data) => {
        pushEvent({
          type: 'cu:step-completed',
          summary: `Step ${data.stepId}: ${data.action || 'action'}`,
          data,
        })
        // Refresh session state
        window.nyra.computerUse.getSession()
          .then(s => { if (s) setComputerUseSession(s) })
          .catch(() => {})
      })
    )

    return () => { cleanups.forEach(fn => fn()) }
  }, [pushEvent])

  // ── Actions ─────────────────────────────────────────────────────────────

  const executeTask = useCallback(async (instruction: string, taskId?: string) => {
    setStatus('running')
    try {
      const result = await window.nyra.desktopAgent.execute(instruction, taskId)
      if (result.success) {
        setStatus('completed')
      } else {
        setStatus('failed')
      }
      return result
    } catch (err: any) {
      setStatus('failed')
      return { success: false, error: err.message }
    }
  }, [])

  const stopAgent = useCallback(async () => {
    await window.nyra.desktopAgent.stop()
    setStatus('idle')
  }, [])

  const setTrustMode = useCallback(async (mode: TrustMode) => {
    await window.nyra.desktopAgent.setTrustMode(mode)
    setTrustModeState(mode)
  }, [])

  const resetTrustRules = useCallback(async () => {
    await window.nyra.desktopAgent.resetTrustRules()
  }, [])

  const executeTool = useCallback(async (toolName: string, args: Record<string, unknown>) => {
    return window.nyra.desktopAgent.executeTool(toolName, args)
  }, [])

  const loadScreenshot = useCallback(async (stepId: number) => {
    return window.nyra.desktopAgent.getStepScreenshot(stepId)
  }, [])

  const clearEvents = useCallback(() => {
    setEvents([])
  }, [])

  const refreshHistory = useCallback(async () => {
    const history = await window.nyra.desktopAgent.getActionHistory(50)
    if (history) setActionHistory(history)
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────

  const eventCount = useMemo(() => events.length, [events])

  return {
    status,
    events,
    actionHistory,
    trustMode,
    tools,
    computerUseSession,

    executeTask,
    stopAgent,
    setTrustMode,
    resetTrustRules,
    executeTool,
    loadScreenshot,
    clearEvents,
    refreshHistory,

    latestAgent: latestAgentRef.current,
    latestTask: latestTaskRef.current,
    eventCount,
  }
}
