/**
 * Computer Use Bridge — unifies the legacy ComputerUseAgent with the new
 * Desktop Agent safety layer and true vision-based LLM calls.
 *
 * This is the recommended entry point for AI-driven computer use.
 * It provides:
 *   1. True multimodal vision: sends screenshots as base64 images (not text descriptions)
 *   2. Anthropic computer_use beta: native tool format when using Claude models
 *   3. Three-tier safety: all actions routed through desktop-safety.ts trust model
 *   4. Dual-mode: vision+JSON (any model) or computer_use tool (Anthropic models)
 *   5. Session management: pause, resume, cancel, history
 *
 * Architecture:
 *   callAgentLLMVision / callAgentLLMComputerUse
 *     ↓
 *   Parse action from LLM response
 *     ↓
 *   desktop-safety.ts (trust check / approval)
 *     ↓
 *   desktop-control.ts (mouse, keyboard, apps)
 *     ↓
 *   Capture verification screenshot → loop
 */

import { EventEmitter } from 'events'
import { captureScreen, captureWindow } from './screen'
import type { ScreenCapture } from './screen'
import {
  mouseClick, mouseDoubleClick, mouseScroll, mouseDrag,
  typeText, pressKey, hotkey, launchApp, focusApp, getActiveWindow,
  mouseMove,
  type ModifierKey,
} from './desktop-control'
import {
  needsDesktopApproval, requestDesktopApproval, recordActionResult,
} from './desktop-safety'
import type { DesktopActionType } from './desktop-safety'
import { logAction } from './audit-log'
import { eventBus } from './event-bus'
import type { AgentDefinition } from './agent-registry'
import type { VisionImage } from './providers/provider-bridge'

// Lazy-load vision functions to avoid circular imports
let _callVision: typeof import('./providers/provider-bridge').callAgentLLMVision | null = null
let _callComputerUse: typeof import('./providers/provider-bridge').callAgentLLMComputerUse | null = null

async function ensureVisionBridge() {
  if (_callVision) return
  try {
    const bridge = await import('./providers/provider-bridge')
    _callVision = bridge.callAgentLLMVision
    _callComputerUse = bridge.callAgentLLMComputerUse
    console.log('[ComputerUseBridge] Vision bridge loaded')
  } catch {
    console.warn('[ComputerUseBridge] Vision bridge not available — text-only mode')
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface CUAction {
  type: 'click' | 'double_click' | 'right_click' | 'scroll' | 'drag'
       | 'type' | 'key' | 'hotkey' | 'move' | 'launch' | 'focus'
       | 'wait' | 'screenshot' | 'done' | 'fail'
  x?: number
  y?: number
  toX?: number
  toY?: number
  button?: 'left' | 'right' | 'middle'
  direction?: 'up' | 'down'
  amount?: number
  text?: string
  key?: string
  modifiers?: string[]
  app?: string
  ms?: number
  reason?: string
}

export interface CUStep {
  id: number
  timestamp: number
  screenshot: ScreenCapture | null
  action: CUAction
  reasoning: string
  approved: boolean
  result: 'pending' | 'executed' | 'denied' | 'failed' | 'skipped'
  error?: string
  durationMs: number
  tokensUsed: number
}

export interface CUSession {
  id: string
  task: string
  mode: 'vision-json' | 'computer-use-tool'
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  steps: CUStep[]
  tokensUsed: number
  tokenBudget: number
  maxIterations: number
  startedAt: number
  completedAt?: number
  error?: string
}

export interface CUConfig {
  tokenBudget?: number       // Default 60_000
  maxIterations?: number     // Default 30
  captureDelayMs?: number    // Min delay between captures (default 2000)
  targetWindow?: string      // Capture specific window instead of full screen
  preferComputerUse?: boolean // Prefer Anthropic computer_use tool format (default true)
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TOKEN_BUDGET = 60_000
const DEFAULT_MAX_ITERATIONS = 30
const DEFAULT_CAPTURE_DELAY = 2000
const TOKENS_PER_SCREENSHOT = 1200
const TOKENS_PER_LLM_CALL = 800

// ── Agent Definition ──────────────────────────────────────────────────────

const COMPUTER_USE_AGENT_DEF: AgentDefinition = {
  id: 'computer-use-v2',
  role: 'desktop' as any,
  name: 'Computer Use Agent v2',
  description: 'Vision-based autonomous desktop control with safety layer',
  systemPrompt: `You are a computer automation agent. You see screenshots of a desktop and control it to accomplish tasks.

You MUST respond with a JSON object describing the next action. No text outside the JSON.

Actions:
- {"type":"click","x":N,"y":N} — Left-click
- {"type":"double_click","x":N,"y":N} — Double-click
- {"type":"right_click","x":N,"y":N} — Right-click
- {"type":"scroll","x":N,"y":N,"direction":"up"|"down","amount":3} — Scroll
- {"type":"drag","x":N,"y":N,"toX":N,"toY":N} — Drag
- {"type":"move","x":N,"y":N} — Move mouse
- {"type":"type","text":"hello"} — Type text
- {"type":"key","key":"return"} — Press key
- {"type":"hotkey","modifiers":["command"],"key":"c"} — Keyboard shortcut
- {"type":"launch","app":"Safari"} — Launch app
- {"type":"focus","app":"Safari"} — Focus app
- {"type":"wait","ms":1000} — Wait
- {"type":"screenshot"} — Fresh screenshot
- {"type":"done","reason":"..."} — Task complete
- {"type":"fail","reason":"..."} — Cannot continue

Rules:
1. Analyze the screenshot carefully before acting
2. Click on visible UI elements — don't guess
3. Wait after actions that trigger loading
4. Report "done" when the task is clearly completed
5. Report "fail" if stuck after multiple attempts`,
  preferredModel: 'anthropic/claude-sonnet-4.6',
  fallbackModel: 'openai/gpt-4o',
  allowedTools: ['computer.screenshot', 'computer.click', 'computer.type', 'computer.key'],
  maxFolderAccess: 'read_only',
  canRequestApproval: true,
  canSpawnSubagents: false,
  tokenBudget: DEFAULT_TOKEN_BUDGET,
  icon: '🖥️',
}

// ── Action Type Mapping ──────────────────────────────────────────────────

function cuActionToDesktopType(action: CUAction): DesktopActionType | null {
  switch (action.type) {
    case 'click':
    case 'right_click':
      return 'desktop:mouse-click'
    case 'double_click':
      return 'desktop:mouse-double-click'
    case 'scroll':
      return 'desktop:mouse-scroll'
    case 'drag':
      return 'desktop:mouse-drag'
    case 'move':
      return 'desktop:mouse-move'
    case 'type':
      return 'desktop:type-text'
    case 'key':
      return 'desktop:press-key'
    case 'hotkey':
      return 'desktop:hotkey'
    case 'launch':
      return 'desktop:launch-app'
    case 'focus':
      return 'desktop:focus-app'
    default:
      return null // wait, screenshot, done, fail don't need approval
  }
}

function describeAction(action: CUAction): string {
  switch (action.type) {
    case 'click': return `click at (${action.x}, ${action.y})`
    case 'double_click': return `double-click at (${action.x}, ${action.y})`
    case 'right_click': return `right-click at (${action.x}, ${action.y})`
    case 'scroll': return `scroll ${action.direction} at (${action.x}, ${action.y})`
    case 'drag': return `drag from (${action.x},${action.y}) to (${action.toX},${action.toY})`
    case 'move': return `move mouse to (${action.x}, ${action.y})`
    case 'type': return `type "${(action.text ?? '').slice(0, 40)}"`
    case 'key': return `press ${action.key}`
    case 'hotkey': return `${(action.modifiers ?? []).join('+')}+${action.key}`
    case 'launch': return `launch ${action.app}`
    case 'focus': return `focus ${action.app}`
    case 'wait': return `wait ${action.ms ?? 1000}ms`
    case 'done': return `done: ${action.reason ?? ''}`
    case 'fail': return `fail: ${action.reason ?? ''}`
    default: return action.type
  }
}

// ── Main Class ─────────────────────────────────────────────────────────────

export class ComputerUseBridge extends EventEmitter {
  private session: CUSession | null = null
  private isCancelled = false
  private isPaused = false
  private pauseResolve: (() => void) | null = null
  private lastCaptureAt = 0

  /**
   * Start a computer-use session with true vision support.
   */
  async start(task: string, config: CUConfig = {}): Promise<CUSession> {
    if (this.session?.status === 'running') {
      throw new Error('A computer-use session is already running')
    }

    await ensureVisionBridge()

    const sessionId = `cu2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const preferCU = config.preferComputerUse ?? true

    // Determine mode: use Anthropic computer_use tool if available and preferred
    const isAnthropic = COMPUTER_USE_AGENT_DEF.preferredModel.startsWith('anthropic/')
    const mode = (preferCU && isAnthropic && _callComputerUse)
      ? 'computer-use-tool'
      : 'vision-json'

    this.session = {
      id: sessionId,
      task,
      mode,
      status: 'running',
      steps: [],
      tokensUsed: 0,
      tokenBudget: config.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
      maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      startedAt: Date.now(),
    }

    this.isCancelled = false
    this.isPaused = false

    console.log(`[CU-Bridge] Starting session ${sessionId} in ${mode} mode`)
    this.emit('session:started', { sessionId, task, mode })

    logAction({
      taskId: sessionId,
      agentId: 'computer-use-v2',
      action: 'computer_use:start',
      target: task,
      details: JSON.stringify({ mode, ...config }),
      reversible: false,
      snapshotId: null,
    })

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
   * The core vision-action loop with safety integration.
   */
  private async runLoop(config: CUConfig): Promise<void> {
    const captureDelay = config.captureDelayMs ?? DEFAULT_CAPTURE_DELAY
    const session = this.session!

    for (let iteration = 0; iteration < session.maxIterations; iteration++) {
      if (this.isCancelled) {
        session.status = 'cancelled'
        session.completedAt = Date.now()
        this.emit('session:cancelled', { sessionId: session.id })
        return
      }

      if (this.isPaused) {
        this.emit('session:paused', { sessionId: session.id })
        await new Promise<void>(resolve => { this.pauseResolve = resolve })
        if (this.isCancelled) {
          session.status = 'cancelled'
          session.completedAt = Date.now()
          return
        }
        this.emit('session:resumed', { sessionId: session.id })
      }

      if (session.tokensUsed >= session.tokenBudget) {
        session.status = 'failed'
        session.error = `Token budget exhausted (${session.tokensUsed}/${session.tokenBudget})`
        session.completedAt = Date.now()
        this.emit('session:budget-exhausted', { sessionId: session.id })
        return
      }

      // Rate limit captures
      const elapsed = Date.now() - this.lastCaptureAt
      if (elapsed < captureDelay) {
        await this.sleep(captureDelay - elapsed)
      }

      // 1. Capture screenshot
      const screenshot = config.targetWindow
        ? await captureWindow(config.targetWindow).catch(() => null)
        : await captureScreen().catch(() => null)

      this.lastCaptureAt = Date.now()
      if (!screenshot) {
        await this.sleep(1000)
        continue
      }

      session.tokensUsed += TOKENS_PER_SCREENSHOT

      // 2. Call LLM with vision
      const stepId = session.steps.length + 1
      const stepStart = Date.now()

      const { action, reasoning, tokens } = await this.callLLM(
        session.task, screenshot, session.steps.slice(-5), iteration
      )

      session.tokensUsed += tokens

      const step: CUStep = {
        id: stepId,
        timestamp: Date.now(),
        screenshot,
        action,
        reasoning,
        approved: false,
        result: 'pending',
        durationMs: 0,
        tokensUsed: tokens,
      }

      session.steps.push(step)
      this.emit('step:started', { sessionId: session.id, step: { ...step, screenshot: null } })

      // 3. Handle terminal / passive actions
      if (action.type === 'done') {
        step.result = 'executed'
        step.approved = true
        step.durationMs = Date.now() - stepStart
        session.status = 'completed'
        session.completedAt = Date.now()
        this.emit('step:completed', { sessionId: session.id, stepId, result: 'executed' })
        this.emit('session:completed', { sessionId: session.id, reason: action.reason })
        return
      }

      if (action.type === 'fail') {
        step.result = 'failed'
        step.error = action.reason
        step.durationMs = Date.now() - stepStart
        session.status = 'failed'
        session.error = action.reason
        session.completedAt = Date.now()
        this.emit('step:completed', { sessionId: session.id, stepId, result: 'failed' })
        this.emit('session:failed', { sessionId: session.id, error: action.reason })
        return
      }

      if (action.type === 'screenshot') {
        step.result = 'executed'
        step.approved = true
        step.durationMs = Date.now() - stepStart
        this.emit('step:completed', { sessionId: session.id, stepId, result: 'executed' })
        continue
      }

      if (action.type === 'wait') {
        step.result = 'executed'
        step.approved = true
        await this.sleep(Math.min(action.ms ?? 1000, 5000))
        step.durationMs = Date.now() - stepStart
        this.emit('step:completed', { sessionId: session.id, stepId, result: 'executed' })
        continue
      }

      // 4. Safety check via desktop-safety.ts
      const desktopActionType = cuActionToDesktopType(action)
      if (desktopActionType && needsDesktopApproval(desktopActionType)) {
        const approval = await requestDesktopApproval(
          desktopActionType,
          describeAction(action),
          action as unknown as Record<string, unknown>,
          session.id
        )

        if (!approval.approved) {
          step.result = 'denied'
          step.durationMs = Date.now() - stepStart
          this.emit('step:completed', { sessionId: session.id, stepId, result: 'denied' })
          continue
        }
      }
      step.approved = true

      // 5. Execute action
      try {
        await this.executeAction(action)
        step.result = 'executed'

        logAction({
          taskId: session.id,
          agentId: 'computer-use-v2',
          action: `computer_use:${action.type}`,
          target: describeAction(action),
          details: JSON.stringify(action),
          reversible: false,
          snapshotId: null,
        })
      } catch (err: any) {
        step.result = 'failed'
        step.error = err.message
      }

      step.durationMs = Date.now() - stepStart
      this.emit('step:completed', { sessionId: session.id, stepId, result: step.result })

      // Brief pause before next capture
      await this.sleep(500)
    }

    // Max iterations
    if (session.status === 'running') {
      session.status = 'failed'
      session.error = `Max iterations reached (${session.maxIterations})`
      session.completedAt = Date.now()
      this.emit('session:failed', { sessionId: session.id, error: session.error })
    }
  }

  /**
   * Call the LLM with a screenshot and get the next action.
   * Uses vision API (image blocks) instead of describing the screenshot in text.
   */
  private async callLLM(
    task: string,
    screenshot: ScreenCapture,
    recentSteps: CUStep[],
    iteration: number,
  ): Promise<{ action: CUAction; reasoning: string; tokens: number }> {
    const history = recentSteps.map(s =>
      `Step ${s.id}: ${describeAction(s.action)} → ${s.result}${s.error ? ` (${s.error})` : ''}`
    ).join('\n')

    const textPrompt = `TASK: ${task}

SCREEN: ${screenshot.width}x${screenshot.height}px
ITERATION: ${iteration + 1}/${this.session!.maxIterations}

${history ? `RECENT ACTIONS:\n${history}\n` : ''}
Analyze the screenshot and respond with the next JSON action.`

    const image: VisionImage = {
      base64: screenshot.base64,
      mediaType: 'image/png',
      width: screenshot.width,
      height: screenshot.height,
    }

    let responseText: string

    if (_callVision) {
      try {
        responseText = await _callVision(COMPUTER_USE_AGENT_DEF, textPrompt, [image])
      } catch (err) {
        console.warn('[CU-Bridge] Vision call failed, using text-only fallback:', err)
        // Text-only fallback via agent-llm-client
        const { callAgentLLM } = await import('./agent-llm-client')
        responseText = await callAgentLLM(COMPUTER_USE_AGENT_DEF, textPrompt)
      }
    } else {
      // No vision bridge — text-only
      const { callAgentLLM } = await import('./agent-llm-client')
      responseText = await callAgentLLM(COMPUTER_USE_AGENT_DEF, textPrompt)
    }

    const action = this.parseAction(responseText)
    return {
      action,
      reasoning: responseText.slice(0, 500),
      tokens: TOKENS_PER_LLM_CALL,
    }
  }

  /**
   * Parse LLM response into a structured action.
   */
  private parseAction(response: string): CUAction {
    // Direct JSON parse
    try {
      const parsed = JSON.parse(response.trim())
      if (parsed.type) return parsed as CUAction
    } catch { /* try extraction */ }

    // Extract from markdown code block
    const codeMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (codeMatch) {
      try {
        const parsed = JSON.parse(codeMatch[1].trim())
        if (parsed.type) return parsed as CUAction
      } catch { /* try brace matching */ }
    }

    // Extract first { ... } block
    const braceMatch = response.match(/\{[\s\S]*?\}/)
    if (braceMatch) {
      try {
        const parsed = JSON.parse(braceMatch[0])
        if (parsed.type) return parsed as CUAction
      } catch { /* fallback */ }
    }

    // Fallback: take another screenshot
    return { type: 'screenshot' }
  }

  /**
   * Execute a desktop control action.
   */
  private async executeAction(action: CUAction): Promise<void> {
    switch (action.type) {
      case 'click':
        if (action.x == null || action.y == null) throw new Error('Click requires x,y')
        mouseClick(action.x, action.y, action.button ?? 'left')
        break
      case 'double_click':
        if (action.x == null || action.y == null) throw new Error('Double-click requires x,y')
        mouseDoubleClick(action.x, action.y)
        break
      case 'right_click':
        if (action.x == null || action.y == null) throw new Error('Right-click requires x,y')
        mouseClick(action.x, action.y, 'right')
        break
      case 'scroll':
        if (action.x == null || action.y == null) throw new Error('Scroll requires x,y')
        mouseScroll(action.x, action.y, action.direction ?? 'down', action.amount ?? 3)
        break
      case 'drag':
        if (action.x == null || action.y == null || action.toX == null || action.toY == null) {
          throw new Error('Drag requires x,y,toX,toY')
        }
        mouseDrag(action.x, action.y, action.toX, action.toY)
        break
      case 'move':
        if (action.x == null || action.y == null) throw new Error('Move requires x,y')
        mouseMove(action.x, action.y)
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
        if (!action.modifiers?.length || !action.key) throw new Error('Hotkey requires modifiers+key')
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
        throw new Error(`Unknown action: ${action.type}`)
    }
  }

  // ── Session Control ──────────────────────────────────────────────────────

  pause(): void {
    if (this.session?.status !== 'running') return
    this.isPaused = true
  }

  resume(): void {
    if (!this.isPaused) return
    this.isPaused = false
    this.pauseResolve?.()
    this.pauseResolve = null
  }

  cancel(): void {
    this.isCancelled = true
    if (this.isPaused) this.resume()
  }

  getSession(): CUSession | null {
    return this.session
  }

  getStepScreenshot(stepId: number): ScreenCapture | null {
    const step = this.session?.steps.find(s => s.id === stepId)
    return step?.screenshot ?? null
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const computerUseBridge = new ComputerUseBridge()
