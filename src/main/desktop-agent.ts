/**
 * Desktop Agent Facade — the unified intelligence layer for desktop automation.
 *
 * This is the single entry point for AI-driven desktop control. It orchestrates:
 *   1. Screen capture → vision analysis (what does the AI see?)
 *   2. Action planning → determine what to do next
 *   3. Safety check → confirm with user via approval pipeline
 *   4. Execution → mouse/keyboard/app control
 *   5. Verification → capture screen again to verify result
 *
 * The agent operates in a perceive → plan → act → verify loop,
 * which is the same OODA (Observe-Orient-Decide-Act) pattern used
 * by computer-use agents like Claude's computer_use and OpenAI's CUA.
 */

import { captureScreen, captureWindow, listSources, startContinuousCapture, stopContinuousCapture } from './screen'
import type { ScreenCapture, ScreenSource } from './screen'
import {
  mouseMove, mouseClick, mouseDoubleClick, mouseScroll, mouseDrag,
  typeText, pressKey, hotkey, launchApp, listRunningApps, focusApp, getActiveWindow,
} from './desktop-control'
import type { Button, ScrollDirection, ModifierKey, AppInfo, WindowInfo } from './desktop-control'
import {
  needsDesktopApproval, requestDesktopApproval, classifyDesktopRisk,
  recordActionResult, getActionHistory,
} from './desktop-safety'
import type { DesktopActionType, DesktopActionRecord } from './desktop-safety'
import { eventBus } from './event-bus'
import { callAgentLLM } from './agent-llm-client'
import type { AgentDefinition } from './agent-registry'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DesktopAction {
  type: DesktopActionType
  params: Record<string, unknown>
  description: string
}

export interface DesktopObservation {
  screenshot: ScreenCapture | null
  activeWindow: WindowInfo | null
  runningApps: AppInfo[]
  timestamp: number
}

export interface DesktopActionResult {
  action: DesktopAction
  success: boolean
  result: string
  observation?: DesktopObservation
}

export interface DesktopAgentStep {
  observation: DesktopObservation
  action: DesktopAction | null
  result: DesktopActionResult | null
  reasoning: string
}

export interface DesktopTaskResult {
  taskId: string
  instruction: string
  steps: DesktopAgentStep[]
  success: boolean
  summary: string
  totalActions: number
  totalDurationMs: number
}

// ── Vision Agent Definition ──────────────────────────────────────────────────
// Minimal agent definition for the desktop vision agent
const VISION_AGENT: AgentDefinition = {
  id: 'desktop-vision-agent',
  name: 'Desktop Vision Agent',
  role: 'generalist',
  description: 'Analyzes screenshots and plans desktop actions',
  systemPrompt: `You are a desktop automation agent. You can see the user's screen and control their computer.
When given a task, analyze the screenshot and respond with a JSON action plan.

Available actions:
- mouse-click: { x, y, button? }
- mouse-double-click: { x, y }
- mouse-scroll: { x, y, direction, amount? }
- mouse-drag: { fromX, fromY, toX, toY }
- type-text: { text }
- press-key: { key }
- hotkey: { modifiers, key }
- launch-app: { appName }
- focus-app: { appName }
- done: task is complete

Respond in this exact JSON format:
{ "reasoning": "why this action", "action": "action-type", "params": { ... } }
Or if the task is complete:
{ "reasoning": "task is done because...", "action": "done" }`,
  preferredModel: 'anthropic/claude-3.5-sonnet',
  fallbackModel: 'openai/gpt-4o',
  allowedTools: ['computer.screenshot', 'computer.click', 'computer.type', 'computer.key', 'computer.hotkey', 'computer.scroll', 'computer.drag', 'app.launch', 'app.focus', 'app.list', 'window.active'],
  maxFolderAccess: 'read_only',
  canRequestApproval: true,
  canSpawnSubagents: false,
  tokenBudget: 8000,
  icon: '🖥️',
}

// ── Desktop Agent Class ──────────────────────────────────────────────────────

class DesktopAgent {
  private running = false
  private maxSteps = 20
  private verifyAfterAction = true

  /**
   * Execute a desktop task through the full perceive → plan → act → verify loop.
   */
  async executeTask(
    instruction: string,
    taskId: string = `dtask-${Date.now()}`
  ): Promise<DesktopTaskResult> {
    if (this.running) {
      throw new Error('Desktop agent is already running a task')
    }

    this.running = true
    const startTime = Date.now()
    const steps: DesktopAgentStep[] = []
    let totalActions = 0

    console.log(`[DesktopAgent] Starting task: ${instruction}`)
    eventBus.emit('desktop:task-started', { taskId, instruction })

    try {
      for (let i = 0; i < this.maxSteps; i++) {
        // Step 1: Observe
        const observation = await this.observe()

        // Step 2: Plan (send screenshot + context to LLM)
        const { action, reasoning } = await this.plan(instruction, observation, steps)

        // If the agent says "done", we're finished
        if (!action || action.type === ('done' as DesktopActionType)) {
          steps.push({ observation, action: null, result: null, reasoning })
          break
        }

        // Step 3: Safety check
        const approved = await this.checkSafety(action, taskId)
        if (!approved) {
          steps.push({
            observation,
            action,
            result: { action, success: false, result: 'Denied by user' },
            reasoning,
          })
          eventBus.emit('desktop:action-denied', { taskId, action })
          continue
        }

        // Step 4: Execute
        const result = await this.execute(action)
        totalActions++

        // Step 5: Verify (optional post-action screenshot)
        if (this.verifyAfterAction) {
          result.observation = await this.observe()
        }

        steps.push({ observation, action, result, reasoning })

        eventBus.emit('desktop:step-completed', {
          taskId,
          step: i + 1,
          action: action.type,
          success: result.success,
        })

        if (!result.success) {
          console.warn(`[DesktopAgent] Action failed: ${result.result}`)
        }
      }

      const success = steps.length > 0 && steps[steps.length - 1].result?.success !== false
      const summary = this.buildSummary(steps)

      const taskResult: DesktopTaskResult = {
        taskId,
        instruction,
        steps,
        success,
        summary,
        totalActions,
        totalDurationMs: Date.now() - startTime,
      }

      eventBus.emit('desktop:task-completed', { taskId, success, summary, totalActions })
      return taskResult
    } finally {
      this.running = false
    }
  }

  /**
   * Execute a single desktop action (no planning loop, just safety + execution).
   * Used for direct tool calls from the AI.
   */
  async executeSingleAction(
    action: DesktopAction,
    taskId: string = 'direct'
  ): Promise<DesktopActionResult> {
    const approved = await this.checkSafety(action, taskId)
    if (!approved) {
      return { action, success: false, result: 'Denied by user' }
    }
    return this.execute(action)
  }

  // ── Observation ──────────────────────────────────────────────────────────

  private async observe(): Promise<DesktopObservation> {
    const [screenshot, activeWindow, runningApps] = await Promise.all([
      captureScreen().catch(() => null),
      Promise.resolve(getActiveWindow()),
      Promise.resolve(listRunningApps()),
    ])

    return { screenshot, activeWindow, runningApps, timestamp: Date.now() }
  }

  // ── Planning ─────────────────────────────────────────────────────────────

  private async plan(
    instruction: string,
    observation: DesktopObservation,
    previousSteps: DesktopAgentStep[]
  ): Promise<{ action: DesktopAction | null; reasoning: string }> {
    // Build context for the LLM
    const historyContext = previousSteps.slice(-5).map((s, i) => {
      const actionDesc = s.action ? `${s.action.type}: ${s.action.description}` : 'observation only'
      const resultDesc = s.result ? (s.result.success ? 'succeeded' : `failed: ${s.result.result}`) : 'no action'
      return `Step ${i + 1}: ${actionDesc} → ${resultDesc}`
    }).join('\n')

    const windowContext = observation.activeWindow
      ? `Active window: ${observation.activeWindow.app} - "${observation.activeWindow.title}"`
      : 'No active window detected'

    const prompt = `Task: ${instruction}

Current state:
${windowContext}
Running apps: ${observation.runningApps.slice(0, 10).map((a) => a.name).join(', ')}
Screen: ${observation.screenshot ? `${observation.screenshot.width}x${observation.screenshot.height}` : 'unavailable'}

${historyContext ? `Previous steps:\n${historyContext}\n` : ''}
What action should I take next? Respond in JSON format.`

    try {
      const response = await callAgentLLM(VISION_AGENT, prompt)
      return this.parseActionPlan(response)
    } catch (err) {
      console.error('[DesktopAgent] Planning failed:', err)
      return { action: null, reasoning: 'Planning failed — stopping' }
    }
  }

  private parseActionPlan(response: string): { action: DesktopAction | null; reasoning: string } {
    try {
      // Extract JSON from response (might be wrapped in markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return { action: null, reasoning: response }
      }

      const parsed = JSON.parse(jsonMatch[0])
      const reasoning = parsed.reasoning || 'No reasoning provided'

      if (parsed.action === 'done' || !parsed.action) {
        return { action: null, reasoning }
      }

      const actionType = `desktop:${parsed.action}` as DesktopActionType
      return {
        action: {
          type: actionType,
          params: parsed.params || {},
          description: reasoning,
        },
        reasoning,
      }
    } catch {
      return { action: null, reasoning: 'Failed to parse action plan' }
    }
  }

  // ── Safety ───────────────────────────────────────────────────────────────

  private async checkSafety(action: DesktopAction, taskId: string): Promise<boolean> {
    if (!needsDesktopApproval(action.type)) {
      return true
    }

    const result = await requestDesktopApproval(
      action.type,
      action.description,
      action.params,
      taskId
    )

    return result.approved
  }

  // ── Execution ────────────────────────────────────────────────────────────

  private async execute(action: DesktopAction): Promise<DesktopActionResult> {
    const p = action.params
    try {
      let result: string

      switch (action.type) {
        case 'desktop:mouse-move':
          result = mouseMove(p.x as number, p.y as number)
          break
        case 'desktop:mouse-click':
          result = mouseClick(p.x as number, p.y as number, (p.button as Button) ?? 'left')
          break
        case 'desktop:mouse-double-click':
          result = mouseDoubleClick(p.x as number, p.y as number)
          break
        case 'desktop:mouse-scroll':
          result = mouseScroll(p.x as number, p.y as number, p.direction as ScrollDirection, p.amount as number)
          break
        case 'desktop:mouse-drag':
          result = mouseDrag(p.fromX as number, p.fromY as number, p.toX as number, p.toY as number)
          break
        case 'desktop:type-text':
          result = typeText(p.text as string)
          break
        case 'desktop:press-key':
          result = pressKey(p.key as string)
          break
        case 'desktop:hotkey':
          result = hotkey(p.modifiers as ModifierKey[], p.key as string)
          break
        case 'desktop:launch-app':
          result = launchApp(p.appName as string)
          break
        case 'desktop:focus-app':
          result = focusApp(p.appName as string)
          break
        default:
          return { action, success: false, result: `Unknown action type: ${action.type}` }
      }

      recordActionResult(action.description, 'executed', result)
      return { action, success: true, result }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      recordActionResult(action.description, 'failed', errMsg)
      return { action, success: false, result: errMsg }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private buildSummary(steps: DesktopAgentStep[]): string {
    const actionSteps = steps.filter((s) => s.action)
    const succeeded = actionSteps.filter((s) => s.result?.success).length
    const failed = actionSteps.filter((s) => s.result && !s.result.success).length

    return `Completed ${actionSteps.length} actions (${succeeded} succeeded, ${failed} failed) in ${steps.length} steps`
  }

  /**
   * Stop the currently running task.
   */
  stop(): void {
    this.running = false
    console.log('[DesktopAgent] Task stopped by user')
    eventBus.emit('desktop:task-stopped', {})
  }

  /**
   * Check if the agent is currently running.
   */
  isRunning(): boolean {
    return this.running
  }

  /**
   * Configure the agent.
   */
  configure(opts: { maxSteps?: number; verifyAfterAction?: boolean }): void {
    if (opts.maxSteps !== undefined) this.maxSteps = opts.maxSteps
    if (opts.verifyAfterAction !== undefined) this.verifyAfterAction = opts.verifyAfterAction
  }
}

export const desktopAgent = new DesktopAgent()
