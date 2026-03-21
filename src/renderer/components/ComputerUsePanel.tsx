/**
 * ComputerUsePanel — Computer Use agent UI
 *
 * Shows live screenshot previews, action log, token meter,
 * approval prompts, and pause/resume/cancel controls.
 */
import React, { useState, useEffect, useRef } from 'react'
import {
  Monitor, Play, Pause, Square, Check, X, AlertTriangle,
  Loader2, Mouse, Keyboard, AppWindow, Clock, Zap, Eye,
  Shield, Globe, ChevronDown, Power,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────

interface ComputerUseAction {
  type: string
  x?: number; y?: number; toX?: number; toY?: number
  text?: string; key?: string; modifiers?: string[]
  app?: string; ms?: number; reason?: string
  direction?: string; amount?: number
}

interface ComputerUseStep {
  id: number
  timestamp: number
  screenshotBase64?: string
  screenshotWidth?: number
  screenshotHeight?: number
  analysis?: string
  action: ComputerUseAction
  result: string
  error?: string
  durationMs?: number
}

interface ComputerUseSession {
  id: string
  taskDescription: string
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  steps: ComputerUseStep[]
  tokensUsed: number
  tokenBudget: number
  maxIterations: number
  startedAt?: number
  completedAt?: number
  error?: string
}

interface PendingApproval {
  sessionId: string
  stepId: number
  approvalId: string
  action: ComputerUseAction
}

// ── Action Icon ──────────────────────────────────────────────────────────

const ActionIcon: React.FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case 'click':
    case 'double_click':
    case 'right_click':
    case 'scroll':
    case 'drag':
      return <Mouse size={12} className="text-terra-300" />
    case 'type':
    case 'key':
    case 'hotkey':
      return <Keyboard size={12} className="text-gold-300" />
    case 'launch':
    case 'focus':
      return <AppWindow size={12} className="text-sage-300" />
    case 'wait':
      return <Clock size={12} className="text-gold-300" />
    case 'screenshot':
      return <Eye size={12} className="text-terra-300" />
    case 'done':
      return <Check size={12} className="text-sage-300" />
    case 'fail':
      return <X size={12} className="text-blush-300" />
    default:
      return <Zap size={12} className="text-white/40" />
  }
}

// ── Action Description ───────────────────────────────────────────────────

function describeAction(action: ComputerUseAction): string {
  switch (action.type) {
    case 'click': return `Click at (${action.x}, ${action.y})`
    case 'double_click': return `Double-click at (${action.x}, ${action.y})`
    case 'right_click': return `Right-click at (${action.x}, ${action.y})`
    case 'scroll': return `Scroll ${action.direction} × ${action.amount} at (${action.x}, ${action.y})`
    case 'drag': return `Drag (${action.x},${action.y}) → (${action.toX},${action.toY})`
    case 'type': return `Type "${(action.text || '').slice(0, 40)}${(action.text || '').length > 40 ? '…' : ''}"`
    case 'key': return `Press ${action.key}`
    case 'hotkey': return `${(action.modifiers || []).join('+')}+${action.key}`
    case 'launch': return `Launch ${action.app}`
    case 'focus': return `Focus ${action.app}`
    case 'wait': return `Wait ${action.ms}ms`
    case 'screenshot': return 'Capture screenshot'
    case 'done': return action.reason || 'Task complete'
    case 'fail': return action.reason || 'Task failed'
    default: return action.type
  }
}

// ── Token Meter ──────────────────────────────────────────────────────────

const TokenMeter: React.FC<{ used: number; budget: number }> = ({ used, budget }) => {
  const pct = Math.min(100, Math.round((used / budget) * 100))
  const color = pct > 80 ? 'bg-blush-400' : pct > 50 ? 'bg-gold-400' : 'bg-sage-400'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-white/40 font-mono whitespace-nowrap">
        {(used / 1000).toFixed(1)}K / {(budget / 1000).toFixed(0)}K
      </span>
    </div>
  )
}

// ── Step Row ─────────────────────────────────────────────────────────────

const StepRow: React.FC<{ step: ComputerUseStep; onPreview?: () => void }> = ({ step, onPreview }) => {
  const resultColors: Record<string, string> = {
    executed: 'text-sage-300',
    approved: 'text-terra-300',
    pending: 'text-gold-300',
    denied: 'text-orange-400',
    failed: 'text-blush-300',
    skipped: 'text-white/30',
  }

  return (
    <div className={`
      flex items-start gap-2 px-3 py-2 border-b border-white/[0.04] last:border-0
      ${step.result === 'pending' ? 'bg-gold-400/5' : ''}
    `}>
      <span className="text-[9px] text-white/25 font-mono w-4 pt-1 text-right flex-shrink-0">
        {step.id}
      </span>
      <div className="pt-1 flex-shrink-0">
        <ActionIcon type={step.action.type} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-white/70">{describeAction(step.action)}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[9px] ${resultColors[step.result] || 'text-white/30'}`}>
            {step.result}
          </span>
          {step.durationMs != null && step.durationMs > 0 && (
            <span className="text-[9px] text-white/20">{(step.durationMs / 1000).toFixed(1)}s</span>
          )}
        </div>
        {step.error && (
          <div className="text-[9px] text-blush-300/70 mt-0.5">{step.error}</div>
        )}
      </div>
      {step.screenshotBase64 && (
        <button
          onClick={onPreview}
          className="p-1 text-white/20 hover:text-white/50 transition-colors flex-shrink-0"
          title="View screenshot"
        >
          <Eye size={12} />
        </button>
      )}
    </div>
  )
}

// ── Approval Prompt ──────────────────────────────────────────────────────

const ApprovalPrompt: React.FC<{
  approval: PendingApproval
  onApprove: () => void
  onDeny: () => void
}> = ({ approval, onApprove, onDeny }) => (
  <div className="mx-3 my-2 p-3 rounded-lg border border-gold-400/30 bg-gold-400/5">
    <div className="flex items-center gap-2 mb-2">
      <Shield size={14} className="text-gold-300" />
      <span className="text-[11px] font-medium text-gold-300">Action Approval Required</span>
    </div>
    <div className="text-[11px] text-white/70 mb-2">
      <ActionIcon type={approval.action.type} />
      <span className="ml-1.5">{describeAction(approval.action)}</span>
    </div>
    <div className="flex items-center gap-2">
      <button
        onClick={onApprove}
        className="flex items-center gap-1 px-2.5 py-1 rounded bg-sage-400 hover:bg-sage-400/80 text-white text-[10px] font-medium transition-colors"
      >
        <Check size={10} /> Allow
      </button>
      <button
        onClick={onDeny}
        className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/60 text-[10px] transition-colors"
      >
        <X size={10} /> Deny
      </button>
    </div>
  </div>
)

// ── Screenshot Preview Modal ─────────────────────────────────────────────

const ScreenshotPreview: React.FC<{ base64: string; onClose: () => void }> = ({ base64, onClose }) => (
  <div
    className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 cursor-pointer"
    onClick={onClose}
  >
    <div className="max-w-[80vw] max-h-[80vh] rounded-lg overflow-hidden shadow-2xl">
      <img
        src={`data:image/png;base64,${base64}`}
        alt="Screenshot"
        className="max-w-full max-h-[80vh] object-contain"
      />
    </div>
  </div>
)

// ── Browser Agent Section ────────────────────────────────────────────────

interface BrowserAgentState {
  enabled: boolean
  launched: boolean
  currentUrl: string
  currentTitle: string
  pageCount: number
  loading: boolean
  screenshotCount: number
  actionsPerformed: number
  lastError: string | null
}

interface BrowserAgentAction {
  id: number
  timestamp: number
  type: string
  target?: string
  value?: string
  result: 'success' | 'error' | 'pending'
  error?: string
  durationMs?: number
  screenshotBase64?: string
}

const BrowserAgentSection: React.FC = () => {
  const [expanded, setExpanded] = useState(false)
  const [agentState, setAgentState] = useState<BrowserAgentState | null>(null)
  const [recentActions, setRecentActions] = useState<BrowserAgentAction[]>([])
  const [enabling, setEnabling] = useState(false)
  const [enableError, setEnableError] = useState<string | null>(null)

  useEffect(() => {
    // Check initial state
    window.nyra.browserAgent.getState().then(setAgentState).catch(() => {})

    const cleanups = [
      window.nyra.browserAgent.onStateChanged(setAgentState),
      window.nyra.browserAgent.onAction((action: BrowserAgentAction) => {
        setRecentActions(prev => [...prev.slice(-19), action])
      }),
      window.nyra.browserAgent.onActionComplete((action: BrowserAgentAction) => {
        setRecentActions(prev => prev.map(a => a.id === action.id ? action : a))
      }),
      window.nyra.browserAgent.onActionError((action: BrowserAgentAction) => {
        setRecentActions(prev => prev.map(a => a.id === action.id ? action : a))
      }),
    ]

    return () => cleanups.forEach(fn => fn())
  }, [])

  const handleToggle = async () => {
    setEnableError(null)
    if (agentState?.enabled) {
      await window.nyra.browserAgent.disable()
    } else {
      setEnabling(true)
      const result = await window.nyra.browserAgent.enable()
      if (!result.success) {
        setEnableError(result.error || 'Failed to enable')
      }
      setEnabling(false)
    }
  }

  const isEnabled = agentState?.enabled ?? false

  return (
    <div className="border-t border-white/[0.06]">
      {/* Section header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        <Globe size={14} className={isEnabled ? 'text-terra-300' : 'text-white/25'} />
        <span className="text-[11px] font-medium text-white/70 flex-1 text-left">Browser Agent</span>
        {isEnabled && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sage-400/20 text-sage-300 border border-sage-400/30">
            Active
          </span>
        )}
        <ChevronDown
          size={12}
          className="text-white/30 transition-transform"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {/* Enable/Disable toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggle}
              disabled={enabling}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                isEnabled
                  ? 'bg-blush-400/20 hover:bg-blush-400/30 text-blush-300'
                  : 'bg-sage-400/20 hover:bg-sage-400/30 text-sage-300'
              } disabled:opacity-40`}
            >
              {enabling ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Power size={12} />
              )}
              {isEnabled ? 'Disable' : 'Enable'}
            </button>
            {agentState && isEnabled && (
              <span className="text-[9px] text-white/30">
                {agentState.actionsPerformed} actions · {agentState.screenshotCount} screenshots
              </span>
            )}
          </div>

          {/* Error message */}
          {enableError && (
            <div className="text-[10px] text-blush-300 bg-blush-400/10 border border-blush-400/20 rounded px-2.5 py-2">
              <AlertTriangle size={10} className="inline mr-1 -mt-px" />
              {enableError}
            </div>
          )}

          {/* Current URL */}
          {isEnabled && agentState?.currentUrl && (
            <div className="text-[10px] text-white/40 font-mono truncate bg-white/[0.03] rounded px-2 py-1.5">
              {agentState.currentUrl}
            </div>
          )}

          {/* Recent actions log */}
          {isEnabled && recentActions.length > 0 && (
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {recentActions.slice(-8).map(action => (
                <div key={action.id} className="flex items-center gap-2 text-[10px]">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    action.result === 'success' ? 'bg-sage-400' :
                    action.result === 'error' ? 'bg-blush-400' :
                    'bg-gold-400 animate-pulse'
                  }`} />
                  <span className="text-white/50 truncate flex-1">
                    {action.type}{action.target ? ` → ${action.target}` : ''}
                  </span>
                  {action.durationMs != null && (
                    <span className="text-white/20 flex-shrink-0">{action.durationMs}ms</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Setup hint when not enabled */}
          {!isEnabled && !enableError && (
            <p className="text-[10px] text-white/25 leading-relaxed">
              Launches a Playwright-controlled Chromium browser for autonomous web browsing.
              Requires <span className="font-mono text-white/35">playwright</span> package.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────────────

const ComputerUsePanel: React.FC = () => {
  const [session, setSession] = useState<ComputerUseSession | null>(null)
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null)
  const [previewBase64, setPreviewBase64] = useState<string | null>(null)
  const [taskInput, setTaskInput] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const stepsEndRef = useRef<HTMLDivElement>(null)

  // Scroll to latest step
  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.steps.length])

  // Load session and subscribe to events
  useEffect(() => {
    // Load existing session
    window.nyra.computerUse.getSession().then(s => { if (s) setSession(s) })

    const cleanups = [
      window.nyra.computerUse.onSessionStarted(() => {
        window.nyra.computerUse.getSession().then(s => setSession(s))
      }),
      window.nyra.computerUse.onStepStarted(() => {
        window.nyra.computerUse.getSession().then(s => setSession(s))
      }),
      window.nyra.computerUse.onStepCompleted(() => {
        window.nyra.computerUse.getSession().then(s => setSession(s))
      }),
      window.nyra.computerUse.onSessionCompleted(() => {
        window.nyra.computerUse.getSession().then(s => setSession(s))
        setPendingApproval(null)
      }),
      window.nyra.computerUse.onSessionFailed(() => {
        window.nyra.computerUse.getSession().then(s => setSession(s))
        setPendingApproval(null)
      }),
      window.nyra.computerUse.onSessionPaused(() => {
        window.nyra.computerUse.getSession().then(s => setSession(s))
      }),
      window.nyra.computerUse.onApprovalNeeded((data: PendingApproval) => {
        setPendingApproval(data)
      }),
      window.nyra.computerUse.onBudgetExhausted(() => {
        window.nyra.computerUse.getSession().then(s => setSession(s))
      }),
    ]

    return () => cleanups.forEach(fn => fn())
  }, [])

  const handleStart = async () => {
    if (!taskInput.trim()) return
    setIsStarting(true)
    await window.nyra.computerUse.start(taskInput.trim())
    setTaskInput('')
    setIsStarting(false)
  }

  const handleApprove = async () => {
    if (!pendingApproval) return
    await window.nyra.computerUse.approveAction(pendingApproval.approvalId, true)
    setPendingApproval(null)
  }

  const handleDeny = async () => {
    if (!pendingApproval) return
    await window.nyra.computerUse.approveAction(pendingApproval.approvalId, false)
    setPendingApproval(null)
  }

  const isRunning = session?.status === 'running'
  const isPaused = session?.status === 'paused'
  const isActive = isRunning || isPaused
  const isFinished = session?.status === 'completed' || session?.status === 'failed' || session?.status === 'cancelled'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-2">
          <Monitor size={16} className="text-terra-300" />
          <h3 className="text-xs font-medium text-white/90">Computer Use</h3>
          {isRunning && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-terra-400/20 text-terra-300 border border-terra-400/30">
              <Loader2 size={8} className="inline animate-spin mr-1" />Active
            </span>
          )}
          {isPaused && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-gold-400/20 text-gold-300 border border-gold-400/30">
              Paused
            </span>
          )}
        </div>

        {/* Task input (when no active session) */}
        {!isActive && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStart() }}
              placeholder="Describe what to do on the desktop..."
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-1.5
                         text-xs text-white/80 placeholder-white/25
                         focus:outline-none focus:border-terra-300/40 transition-colors"
            />
            <button
              onClick={handleStart}
              disabled={isStarting || !taskInput.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-terra-300/20 hover:bg-terra-300/30
                         text-terra-300 text-[11px] font-medium transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isStarting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              Start
            </button>
          </div>
        )}

        {/* Session info (when active) */}
        {session && (isActive || isFinished) && (
          <div>
            <p className="text-[11px] text-white/60 truncate">{session.taskDescription}</p>
            <div className="mt-2">
              <TokenMeter used={session.tokensUsed} budget={session.tokenBudget} />
            </div>
          </div>
        )}
      </div>

      {/* Approval prompt */}
      {pendingApproval && (
        <ApprovalPrompt
          approval={pendingApproval}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
      )}

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {session?.steps.map(step => (
          <StepRow
            key={step.id}
            step={step}
            onPreview={step.screenshotBase64 ? () => setPreviewBase64(step.screenshotBase64!) : undefined}
          />
        ))}
        <div ref={stepsEndRef} />

        {/* Empty state */}
        {!session && !isStarting && (
          <div className="flex flex-col items-center justify-center h-full text-white/30 gap-3 px-6">
            <Monitor size={32} className="text-white/15" />
            <p className="text-xs text-center">
              Computer Use lets Nyra see your screen and interact with desktop applications autonomously.
            </p>
            <p className="text-[10px] text-white/20">
              Describe a task above and Nyra will capture, analyze, and act step by step.
            </p>
          </div>
        )}
      </div>

      {/* Control bar */}
      {isActive && (
        <div className="px-4 py-3 border-t border-white/[0.06] bg-black/20 flex items-center gap-2">
          {isRunning && (
            <>
              <button
                onClick={() => window.nyra.computerUse.pause()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gold-400 hover:bg-gold-400/80 text-white text-[11px] font-medium transition-colors"
              >
                <Pause size={12} /> Pause
              </button>
              <button
                onClick={() => window.nyra.computerUse.cancel()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blush-400 hover:bg-blush-400/80 text-white text-[11px] font-medium transition-colors"
              >
                <Square size={12} /> Stop
              </button>
              <span className="text-[10px] text-white/30 ml-auto">
                Step {session?.steps.length || 0} / {session?.maxIterations}
              </span>
            </>
          )}
          {isPaused && (
            <>
              <button
                onClick={() => window.nyra.computerUse.resume()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sage-400 hover:bg-sage-400/80 text-white text-[11px] font-medium transition-colors"
              >
                <Play size={12} /> Resume
              </button>
              <button
                onClick={() => window.nyra.computerUse.cancel()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blush-400 hover:bg-blush-400/80 text-white text-[11px] font-medium transition-colors"
              >
                <Square size={12} /> Stop
              </button>
            </>
          )}
        </div>
      )}

      {/* Finished status */}
      {isFinished && session && (
        <div className="px-4 py-3 border-t border-white/[0.06] bg-black/20">
          <span className={`text-[11px] font-medium ${
            session.status === 'completed' ? 'text-sage-300' :
            session.status === 'failed' ? 'text-blush-300' : 'text-white/30'
          }`}>
            {session.status === 'completed' && <><Check size={12} className="inline mr-1 -mt-px" />Task completed</>}
            {session.status === 'failed' && <><AlertTriangle size={12} className="inline mr-1 -mt-px" />{session.error || 'Task failed'}</>}
            {session.status === 'cancelled' && 'Session cancelled'}
          </span>
          <span className="text-[9px] text-white/25 ml-3">
            {session.steps.length} steps · {(session.tokensUsed / 1000).toFixed(1)}K tokens
          </span>
        </div>
      )}

      {/* Browser Agent Section */}
      <BrowserAgentSection />

      {/* Screenshot preview modal */}
      {previewBase64 && (
        <ScreenshotPreview base64={previewBase64} onClose={() => setPreviewBase64(null)} />
      )}
    </div>
  )
}

export default ComputerUsePanel
