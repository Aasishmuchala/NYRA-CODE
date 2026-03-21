/**
 * Computer Use Agent — autonomous vision-action loop
 *
 * Architecture:
 *   1. Capture screenshot → resize to ≤1280px
 *   2. Send to LLM (vision model) with task context
 *   3. Parse structured action from response
 *   4. Execute action via desktop-control primitives
 *   5. Wait + re-capture to verify
 *   6. Loop until task complete or budget exhausted
 *
 * Safety:
 *   - All actions go through approval pipeline (risk: high)
 *   - Hard token budget per session (default 50K)
 *   - Rate limit: min 2s between captures
 *   - User can cancel at any time via cancel()
 *   - Max iterations per session (default 30)
 */

import { EventEmitter } from 'events'
import { captureScreen, captureWindow } from './screen'
import {
  mouseClick, mouseDoubleClick, mouseScroll, mouseDrag,
  typeText, pressKey, hotkey, launchApp, focusApp, getActiveWindow,
  type ModifierKey,
} from './desktop-control'
import { callAgentLLM } from './agent-llm-client'
import { requestApproval, needsApproval } from './approval-pipeline'
import { logAction } from './audit-log'
import type { AgentDefinition } from './agent-registry'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ComputerUseAction {
  type: 'click' | 'double_click' | 'right_click' | 'scroll' | 'drag'
       | 'type' | 'key' | 'hotkey' | 'launch' | 'focus' | 'wait'
       | 'screenshot' | 'done' | 'fail'
  // Mouse actions
  x?: number
  y?: number
  toX?: number
  toY?: number
  button?: 'left' | 'right' | 'middle'
  direction?: 'up' | 'down'
  amount?: number
  // Keyboard actions
  text?: string
  key?: string
  modifiers?: string[]
  // App actions
  app?: string
  // Wait
  ms?: number
  // Terminal
  reason?: string
}

export interface ComputerUseStep {
  id: number
  timestamp: number
  screenshotBase64?: string
  screenshotWidth?: number
  screenshotHeight?: number
  analysis?: string
  action: ComputerUseAction
  result: 'pending' | 'executed' | 'approved' | 'denied' | 'failed' | 'skipped'
  error?: string
  durationMs?: number
  tokensUsed?: number
}

export interface ComputerUseSession {
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

export interface ComputerUseConfig {
  tokenBudget?: number      // Default 50_000
  maxIterations?: number    // Default 30
  captureDelayMs?: number   // Min delay between captures, default 2000
  requireApproval?: boolean // Whether each action needs approval, default true
  targetWindow?: string     // Capture specific window instead of full screen
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TOKEN_BUDGET = 50_000
const DEFAULT_MAX_ITERATIONS = 30
const DEFAULT_CAPTURE_DELAY = 2000
const TOKENS_PER_SCREENSHOT = 1200  // Approximate token cost for a 1024px screenshot
const TOKENS_PER_LLM_CALL = 800     // Approximate overhead per LLM call

// ── Vision Agent System Prompt ─────────────────────────────────────────────

const COMPUTER_USE_SYSTEM_PROMPT = `You are a computer use agent that can see and interact with a desktop computer.

You receive screenshots of the user's screen and must determine what action to take next to accomplish the given task.

IMPORTANT: Respond with a JSON object describing the next action. Do NOT include any text outside the JSON.

Available actions:
- {"type":"click","x":123,"y":456} — Left-click at coordinates
- {"type":"double_click","x":123,"y":456} — Double-click at coordinates
- {"type":"right_click","x":123,"y":456} — Right-click at coordinates
- {"type":"scroll","x":123,"y":456,"direction":"up"|"down","amount":3} — Scroll at position
- {"type":"drag","x":100,"y":100,"toX":200,"toY":200} — Drag from point to point
- {"type":"type","text":"hello"} — Type text at current cursor position
- {"type":"key","key":"return"} — Press a key (return, escape, tab, backspace, arrowup, arrowdown, etc.)
- {"type":"hotkey","modifiers":["command"],"key":"c"} — Press a keyboard shortcut
- {"type":"launch","app":"Safari"} — Launch an application
- {"type":"focus","app":"Safari"} — Focus/activate an application
- {"type":"wait","ms":1000} — Wait before next action
- {"type":"screenshot"} — Take another screenshot to see current state
- {"type":"done","reason":"Task completed successfully"} — Task is finished
- {"type":"fail","reason":"Cannot complete because..."} — Task cannot be completed

Coordinates are relative to the screenshot dimensions provided.

Rules:
1. Always analyze the screenshot before acting
2. Click on UI elements you can see — don't guess coordinates
3. Wait after actions that trigger loading (use {"type":"wait","ms":2000})
4. If you can't find what you need, try scrolling or navigating
5. Report "done" when the task is clearly completed
6. Report "fail" if stuck after 3+ attempts at the same action`

// ── Agent Definition (virtual — for callAgentLLM compatibility) ────────────

const computerUseAgentDef: AgentDefinition = {
  id: 'computer_use',
  role: 'browser' as any,
  name: 'Computer Use Agent',
  description: 'Autonomous desktop interaction agent using vision and control',
  systemPrompt: COMPUTER_USE_SYSTEM_PROMPT,
  preferredModel: 'claude-3-5-sonnet',
  fallbackModel: 'gpt-4o',
  allowedTools: ['screen:capture', 'desktop:*'],
  maxFolderAccess: 'read_only',
  canRequestApproval: true,
  canSpawnSubagents: false,
  tokenBudget: DEFAULT_TOKEN_BUDGET,
  icon: '🖥️',
}

// ── Main Class ─────────────────────────────────────────────────────────────

export class ComputerUseAgent extends EventEmitter {
  private session: ComputerUseSession | null = null
  private isCancelled = false
  private isPaused = false
  private pausePromise: Promise<void> | null = null
  private pauseResolve: (() => void) | null = null
  private lastCaptureAt = 0

  /**
   * Start a new computer use session
   */
  async start(taskDescription: string, config: ComputerUseConfig = {}): Promise<ComputerUseSession> {
    if (this.session?.status === 'running') {
      throw new Error('A computer use session is already running')
    }

    const sessionId = `cu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    this.session = {
      id: sessionId,
      taskDescription,
      status: 'running',
      steps: [],
      tokensUsed: 0,
      tokenBudget: config.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
      maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      startedAt: Date.now(),
    }

    this.isCancelled = false
    this.isPaused = false

    this.emit('session:started', { sessionId, taskDescription })

    logAction({
      taskId: sessionId,
      agentId: 'computer_use',
      action: 'computer_use:start',
      target: taskDescription,
      details: JSON.stringify(config),
      reversible: false,
      snapshotId: null,
    })

    // Run the loop
    try {
      await this.runLoop(config)
    } catch (err: any) {
      if (this.session) {
        this.session.status = 'failed'
        this.session.error = err.message
        this.session.completedAt = Date.now()
      }
      this.emit('session:failed', { sessionId, error: err.message })
    }

    return this.session!
  }

  /**
   * The core vision-action loop
   */
  private async runLoop(config: ComputerUseConfig): Promise<void> {
    const captureDelay = config.captureDelayMs ?? DEFAULT_CAPTURE_DELAY
    const requireApproval = config.requireApproval ?? true

    for (let iteration = 0; iteration < this.session!.maxIterations; iteration++) {
      // Check cancellation
      if (this.isCancelled) {
        this.session!.status = 'cancelled'
        this.session!.completedAt = Date.now()
        this.emit('session:cancelled', { sessionId: this.session!.id })
        return
      }

      // Check pause
      if (this.isPaused) {
        this.emit('session:paused', { sessionId: this.session!.id })
        await this.waitForResume()
        if (this.isCancelled) {
          this.session!.status = 'cancelled'
          this.session!.completedAt = Date.now()
          return
        }
        this.emit('session:resumed', { sessionId: this.session!.id })
      }

      // Check token budget
      if (this.session!.tokensUsed >= this.session!.tokenBudget) {
        this.session!.status = 'failed'
        this.session!.error = `Token budget exhausted (${this.session!.tokensUsed}/${this.session!.tokenBudget})`
        this.session!.completedAt = Date.now()
        this.emit('session:budget-exhausted', { sessionId: this.session!.id })
        return
      }

      // Rate limit captures
      const timeSinceLastCapture = Date.now() - this.lastCaptureAt
      if (timeSinceLastCapture < captureDelay) {
        await this.sleep(captureDelay - timeSinceLastCapture)
      }

      // 1. Capture screenshot
      const screenshot = config.targetWindow
        ? await captureWindow(config.targetWindow)
        : await captureScreen()

      this.lastCaptureAt = Date.now()

      if (!screenshot) {
        // Retry once after a short delay
        await this.sleep(1000)
        continue
      }

      this.session!.tokensUsed += TOKENS_PER_SCREENSHOT

      // 2. Send to LLM for analysis
      const stepId = this.session!.steps.length + 1
      const stepStart = Date.now()

      const userMessage = this.buildPrompt(
        this.session!.taskDescription,
        screenshot.base64,
        screenshot.width,
        screenshot.height,
        iteration,
        this.session!.steps.slice(-5) // Last 5 steps for context
      )

      let llmResponse: string
      try {
        llmResponse = await callAgentLLM(computerUseAgentDef, userMessage)
        this.session!.tokensUsed += TOKENS_PER_LLM_CALL
      } catch (err: any) {
        // LLM call failed — record and continue
        const failStep: ComputerUseStep = {
          id: stepId,
          timestamp: Date.now(),
          screenshotBase64: screenshot.base64,
          screenshotWidth: screenshot.width,
          screenshotHeight: screenshot.height,
          action: { type: 'fail', reason: `LLM error: ${err.message}` },
          result: 'failed',
          error: err.message,
          durationMs: Date.now() - stepStart,
        }
        this.session!.steps.push(failStep)
        this.emit('step:completed', failStep)
        continue
      }

      // 3. Parse the action
      const action = this.parseAction(llmResponse)

      const step: ComputerUseStep = {
        id: stepId,
        timestamp: Date.now(),
        screenshotBase64: screenshot.base64,
        screenshotWidth: screenshot.width,
        screenshotHeight: screenshot.height,
        analysis: llmResponse.slice(0, 500),
        action,
        result: 'pending',
        durationMs: 0,
      }

      this.session!.steps.push(step)
      this.emit('step:started', { sessionId: this.session!.id, step })

      // 4. Handle terminal actions
      if (action.type === 'done') {
        step.result = 'executed'
        step.durationMs = Date.now() - stepStart
        this.session!.status = 'completed'
        this.session!.completedAt = Date.now()
        this.emit('step:completed', step)
        this.emit('session:completed', { sessionId: this.session!.id, reason: action.reason })

        logAction({
          taskId: this.session!.id,
          agentId: 'computer_use',
          action: 'computer_use:complete',
          target: action.reason || 'Task completed',
          details: null,
          reversible: false,
          snapshotId: null,
        })
        return
      }

      if (action.type === 'fail') {
        step.result = 'failed'
        step.error = action.reason
        step.durationMs = Date.now() - stepStart
        this.session!.status = 'failed'
        this.session!.error = action.reason
        this.session!.completedAt = Date.now()
        this.emit('step:completed', step)
        this.emit('session:failed', { sessionId: this.session!.id, error: action.reason })
        return
      }

      if (action.type === 'screenshot') {
        step.result = 'executed'
        step.durationMs = Date.now() - stepStart
        this.emit('step:completed', step)
        continue // Next iteration will capture fresh
      }

      if (action.type === 'wait') {
        step.result = 'executed'
        await this.sleep(Math.min(action.ms ?? 1000, 5000)) // Cap at 5s
        step.durationMs = Date.now() - stepStart
        this.emit('step:completed', step)
        continue
      }

      // 5. Request approval if needed
      if (requireApproval && needsApproval('computer_use_action', 'full')) {
        const approvalId = requestApproval(
          this.session!.id,
          'computer_use',
          'computer_use_action',
          `Computer Use: ${action.type} ${this.describeAction(action)}`,
          JSON.stringify(action)
        )

        this.emit('step:approval-needed', { sessionId: this.session!.id, stepId, approvalId: approvalId.id, action })

        // Wait for approval (with timeout)
        const approved = await this.waitForApproval(approvalId.id)

        if (!approved) {
          step.result = 'denied'
          step.durationMs = Date.now() - stepStart
          this.emit('step:completed', step)
          continue // Skip this action, re-analyze
        }
        step.result = 'approved'
      }

      // 6. Execute the action
      try {
        await this.executeAction(action)
        step.result = 'executed'

        logAction({
          taskId: this.session!.id,
          agentId: 'computer_use',
          action: `computer_use:${action.type}`,
          target: this.describeAction(action),
          details: JSON.stringify(action),
          reversible: false,
          snapshotId: null,
        })
      } catch (err: any) {
        step.result = 'failed'
        step.error = err.message
      }

      step.durationMs = Date.now() - stepStart
      this.emit('step:completed', step)

      // Brief pause after action before next capture
      await this.sleep(500)
    }

    // Max iterations reached
    if (this.session!.status === 'running') {
      this.session!.status = 'failed'
      this.session!.error = `Max iterations reached (${this.session!.maxIterations})`
      this.session!.completedAt = Date.now()
      this.emit('session:failed', { sessionId: this.session!.id, error: this.session!.error })
    }
  }

  /**
   * Build the prompt for the LLM including screenshot context
   */
  private buildPrompt(
    task: string,
    _screenshotBase64: string,
    width: number,
    height: number,
    iteration: number,
    recentSteps: ComputerUseStep[],
  ): string {
    // Build context from recent actions
    const history = recentSteps.map(s =>
      `Step ${s.id}: ${s.action.type}${s.action.type === 'click' ? ` at (${s.action.x},${s.action.y})` : ''}${s.action.text ? ` "${s.action.text}"` : ''} → ${s.result}`
    ).join('\n')

    // Since callAgentLLM currently only handles text, we describe the screenshot
    // context. When vision support is added to the proxy, we'll send the actual image.
    // TODO: Pass screenshot as image content when OpenClaw supports multimodal input
    return `TASK: ${task}

SCREEN INFO: ${width}x${height} pixels
ITERATION: ${iteration + 1}

${history ? `RECENT ACTIONS:\n${history}\n` : ''}
[A screenshot of the current screen state has been captured at ${width}x${height}px]

Based on the current screen state, what is the next action to accomplish the task?
Respond with a single JSON object describing the action.`
  }

  /**
   * Parse LLM response into a structured action
   */
  private parseAction(response: string): ComputerUseAction {
    // Try direct JSON parse
    try {
      const parsed = JSON.parse(response.trim())
      if (parsed.type) return parsed as ComputerUseAction
    } catch { /* try extraction */ }

    // Try extracting JSON from markdown code block
    const codeMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (codeMatch) {
      try {
        const parsed = JSON.parse(codeMatch[1].trim())
        if (parsed.type) return parsed as ComputerUseAction
      } catch { /* try brace matching */ }
    }

    // Try finding first { ... } block
    const braceMatch = response.match(/\{[\s\S]*?\}/)
    if (braceMatch) {
      try {
        const parsed = JSON.parse(braceMatch[0])
        if (parsed.type) return parsed as ComputerUseAction
      } catch { /* fallback */ }
    }

    // Fallback: treat as screenshot request (get fresh view)
    return { type: 'screenshot' }
  }

  /**
   * Execute a desktop control action
   */
  private async executeAction(action: ComputerUseAction): Promise<void> {
    switch (action.type) {
      case 'click':
        if (action.x == null || action.y == null) throw new Error('Click requires x,y coordinates')
        mouseClick(action.x, action.y, action.button || 'left')
        break

      case 'double_click':
        if (action.x == null || action.y == null) throw new Error('Double-click requires x,y coordinates')
        mouseDoubleClick(action.x, action.y)
        break

      case 'right_click':
        if (action.x == null || action.y == null) throw new Error('Right-click requires x,y coordinates')
        mouseClick(action.x, action.y, 'right')
        break

      case 'scroll':
        if (action.x == null || action.y == null) throw new Error('Scroll requires x,y coordinates')
        mouseScroll(action.x, action.y, action.direction || 'down', action.amount || 3)
        break

      case 'drag':
        if (action.x == null || action.y == null || action.toX == null || action.toY == null) {
          throw new Error('Drag requires x,y,toX,toY coordinates')
        }
        mouseDrag(action.x, action.y, action.toX, action.toY)
        break

      case 'type':
        if (!action.text) throw new Error('Type requires text')
        typeText(action.text)
        break

      case 'key':
        if (!action.key) throw new Error('Key requires key name')
        pressKey(action.key)
        break

      case 'hotkey':
        if (!action.modifiers?.length || !action.key) throw new Error('Hotkey requires modifiers and key')
        hotkey(action.modifiers as ModifierKey[], action.key)
        break

      case 'launch':
        if (!action.app) throw new Error('Launch requires app name')
        launchApp(action.app)
        break

      case 'focus':
        if (!action.app) throw new Error('Focus requires app name')
        focusApp(action.app)
        break

      default:
        throw new Error(`Unknown action type: ${action.type}`)
    }
  }

  /**
   * Human-readable description of an action
   */
  private describeAction(action: ComputerUseAction): string {
    switch (action.type) {
      case 'click': return `at (${action.x}, ${action.y})`
      case 'double_click': return `at (${action.x}, ${action.y})`
      case 'right_click': return `at (${action.x}, ${action.y})`
      case 'scroll': return `${action.direction} by ${action.amount} at (${action.x}, ${action.y})`
      case 'drag': return `from (${action.x},${action.y}) to (${action.toX},${action.toY})`
      case 'type': return `"${(action.text || '').slice(0, 30)}"`
      case 'key': return action.key || ''
      case 'hotkey': return `${(action.modifiers || []).join('+')}+${action.key}`
      case 'launch': return action.app || ''
      case 'focus': return action.app || ''
      case 'wait': return `${action.ms || 1000}ms`
      default: return ''
    }
  }

  /**
   * Wait for approval response (with 60s timeout)
   */
  private waitForApproval(approvalId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false) // Deny on timeout
      }, 60_000)

      // Poll for approval response
      const poll = setInterval(() => {
        try {
          // respondToApproval returns the updated request. We check status via polling.
          // In a real implementation, we'd listen for events.
          // For now, use a simple poll.
          // TODO: Replace with event-based approval once event bus supports it
        } catch { /* ignore */ }
      }, 500)

      // Store for external resolution
      this._pendingApproval = { resolve, timeout, poll, approvalId }
    })
  }

  private _pendingApproval: {
    resolve: (approved: boolean) => void
    timeout: ReturnType<typeof setTimeout>
    poll: ReturnType<typeof setInterval>
    approvalId: string
  } | null = null

  /**
   * Resolve a pending approval externally
   */
  resolveApproval(approvalId: string, approved: boolean): void {
    if (this._pendingApproval?.approvalId === approvalId) {
      clearTimeout(this._pendingApproval.timeout)
      clearInterval(this._pendingApproval.poll)
      this._pendingApproval.resolve(approved)
      this._pendingApproval = null
    }
  }

  // ── Session Control ──────────────────────────────────────────────────────

  pause(): void {
    if (this.session?.status !== 'running') return
    this.isPaused = true
    this.pausePromise = new Promise(resolve => { this.pauseResolve = resolve })
  }

  resume(): void {
    if (!this.isPaused) return
    this.isPaused = false
    this.pauseResolve?.()
    this.pausePromise = null
    this.pauseResolve = null
  }

  cancel(): void {
    this.isCancelled = true
    // Also resume if paused so the loop can exit
    if (this.isPaused) this.resume()
  }

  getSession(): ComputerUseSession | null {
    return this.session
  }

  getActiveWindow() {
    return getActiveWindow()
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private waitForResume(): Promise<void> {
    return this.pausePromise ?? Promise.resolve()
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const computerUseAgent = new ComputerUseAgent()
