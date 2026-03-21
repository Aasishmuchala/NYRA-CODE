/**
 * Plan Executor — Step-by-Step Execution with Checkpoints
 *
 * Executes approved plans step-by-step, respecting dependencies.
 * Each step is delegated to the appropriate agent via the existing
 * agent orchestrator, or executed directly (terminal, MCP tools).
 *
 * Key features:
 * - Dependency resolution: steps run in correct order
 * - Checkpoint after each step: emits events for UI to show progress
 * - Error recovery: on step failure, can skip or re-plan remaining steps
 * - Cancellation: user can halt execution at any checkpoint
 *
 * Architecture:
 *   Plan Executor → Plan Engine (step status updates)
 *                 → Agent LLM Client (step execution)
 *                 → MCP Tool Router (MCP tool calls)
 *                 → PTY Manager (terminal commands)
 */

import { EventEmitter } from 'events'
import { planEngine, type ExecutionPlan, type PlanStep } from './plan-engine'
import { callAgentLLM } from './agent-llm-client'
import { getAgentForRole } from './agent-registry'
import { executeToolCall } from './mcp-tool-router'
import { logAction } from './audit-log'

// ── Types ────────────────────────────────────────────────────────────────────

export interface StepExecutionResult {
  stepId: number
  success: boolean
  result: string
  durationMs: number
  error?: string
}

export interface PlanExecutionState {
  planId: string
  isRunning: boolean
  currentStepId: number | null
  completedSteps: number
  totalSteps: number
  isPaused: boolean
  isCancelled: boolean
}

// ── Agent Prompt for Step Execution ──────────────────────────────────────────

function buildStepPrompt(step: PlanStep, planGoal: string, previousResults: string[]): string {
  const parts = [
    `OVERALL GOAL: ${planGoal}`,
    '',
    `CURRENT STEP (${step.id}): ${step.description}`,
    `ACTION TYPE: ${step.action}`,
  ]

  if (step.files?.length) {
    parts.push(`FILES: ${step.files.join(', ')}`)
  }
  if (step.command) {
    parts.push(`COMMAND: ${step.command}`)
  }

  if (previousResults.length > 0) {
    parts.push('')
    parts.push('PREVIOUS STEP RESULTS:')
    previousResults.forEach((r, i) => {
      parts.push(`  Step ${i + 1}: ${r.slice(0, 300)}`)
    })
  }

  parts.push('')
  parts.push('Execute this step. Respond with a clear summary of what was done and any important findings.')

  return parts.join('\n')
}

// ── Plan Executor ────────────────────────────────────────────────────────────

class PlanExecutor extends EventEmitter {
  private runningPlanId: string | null = null
  private isPaused = false
  private isCancelled = false
  private currentStepId: number | null = null

  /**
   * Execute an approved plan step-by-step.
   */
  async execute(planId: string): Promise<void> {
    const plan = planEngine.getPlan(planId)
    if (!plan) throw new Error(`Plan not found: ${planId}`)
    if (plan.status !== 'approved') throw new Error(`Plan must be approved before execution (status: ${plan.status})`)
    if (this.runningPlanId) throw new Error(`Already executing plan: ${this.runningPlanId}`)

    this.runningPlanId = planId
    this.isPaused = false
    this.isCancelled = false

    planEngine.markExecuting(planId)
    this.emitState()

    logAction({
      taskId: planId,
      agentId: null,
      action: 'plan:execution-started',
      target: null,
      details: { goal: plan.goal, stepCount: plan.steps.length },
      reversible: false,
      snapshotId: null,
    })

    const completedResults: string[] = []
    const completedStepIds = new Set<number>()

    try {
      // Execute steps in dependency order
      while (this.hasRemainingSteps(plan, completedStepIds)) {
        // Check for cancellation
        if (this.isCancelled) {
          this.skipRemainingSteps(plan, completedStepIds)
          planEngine.cancelPlan(planId)
          break
        }

        // Check for pause
        if (this.isPaused) {
          this.emit('plan:paused', { planId })
          await this.waitForResume()
          if (this.isCancelled) continue // Re-check after resume
        }

        // Find next executable steps (dependencies satisfied)
        const readySteps = this.getReadySteps(plan, completedStepIds)

        if (readySteps.length === 0) {
          // Deadlock — circular dependencies or all remaining steps blocked
          throw new Error('No executable steps found — possible circular dependency')
        }

        // Execute ready steps (sequentially for now — parallel is Phase 5)
        for (const step of readySteps) {
          if (this.isCancelled) break

          this.currentStepId = step.id
          this.emitState()

          const result = await this.executeStep(step, plan.goal, completedResults)

          planEngine.updateStepStatus(
            planId,
            step.id,
            result.success ? 'done' : 'failed',
            result.result,
            result.error,
            result.durationMs
          )

          this.emit('plan:step-completed', {
            planId,
            stepId: step.id,
            success: result.success,
            result: result.result,
            error: result.error,
          })

          if (result.success) {
            completedStepIds.add(step.id)
            completedResults.push(result.result)
          } else {
            // On failure: skip dependent steps
            this.skipDependentSteps(plan, step.id, completedStepIds)
            completedStepIds.add(step.id) // Mark as processed (even though failed)
          }
        }
      }

      this.currentStepId = null
      this.emitState()

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)

      logAction({
        taskId: planId,
        agentId: null,
        action: 'plan:execution-error',
        target: null,
        details: { error: errMsg },
        reversible: false,
        snapshotId: null,
      })

      this.emit('plan:error', { planId, error: errMsg })
    } finally {
      this.runningPlanId = null
      this.currentStepId = null
      this.isPaused = false
      this.isCancelled = false
      this.emitState()

      logAction({
        taskId: planId,
        agentId: null,
        action: 'plan:execution-finished',
        target: null,
        details: { finalStatus: planEngine.getPlan(planId)?.status },
        reversible: false,
        snapshotId: null,
      })
    }
  }

  /**
   * Execute a single plan step.
   */
  private async executeStep(
    step: PlanStep,
    planGoal: string,
    previousResults: string[]
  ): Promise<StepExecutionResult> {
    const startTime = Date.now()

    planEngine.updateStepStatus(this.runningPlanId!, step.id, 'running')
    this.emit('plan:step-started', { planId: this.runningPlanId, stepId: step.id })

    try {
      let result: string

      switch (step.action) {
        case 'mcp_tool':
          result = await this.executeMcpToolStep(step)
          break

        default:
          // All other step types go through the agent LLM
          result = await this.executeAgentStep(step, planGoal, previousResults)
          break
      }

      return {
        stepId: step.id,
        success: true,
        result,
        durationMs: Date.now() - startTime,
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      return {
        stepId: step.id,
        success: false,
        result: '',
        error: errMsg,
        durationMs: Date.now() - startTime,
      }
    }
  }

  /**
   * Execute a step via the agent LLM.
   */
  private async executeAgentStep(
    step: PlanStep,
    planGoal: string,
    previousResults: string[]
  ): Promise<string> {
    // Determine which agent to use
    const agentRole = step.agentRole || 'code'
    const agent = getAgentForRole(agentRole as any)

    if (!agent) {
      // Fallback to code agent
      const codeAgent = getAgentForRole('code')
      if (!codeAgent) throw new Error(`No agent available for role: ${agentRole}`)
      const prompt = buildStepPrompt(step, planGoal, previousResults)
      return await callAgentLLM(codeAgent, prompt)
    }

    const prompt = buildStepPrompt(step, planGoal, previousResults)
    return await callAgentLLM(agent, prompt)
  }

  /**
   * Execute an MCP tool step directly.
   */
  private async executeMcpToolStep(step: PlanStep): Promise<string> {
    if (!step.tool) {
      throw new Error('MCP tool step missing tool qualified name')
    }

    const result = await executeToolCall({
      qualifiedName: step.tool,
      arguments: {}, // TODO: Parse args from step description in future
      taskId: this.runningPlanId || undefined,
    })

    if (!result.success) {
      throw new Error(result.error || 'MCP tool call failed')
    }

    return result.content
  }

  // ── Dependency Resolution ────────────────────────────────────────────────

  private hasRemainingSteps(plan: ExecutionPlan, completed: Set<number>): boolean {
    return plan.steps.some(s => !completed.has(s.id) && s.status !== 'skipped')
  }

  private getReadySteps(plan: ExecutionPlan, completed: Set<number>): PlanStep[] {
    return plan.steps.filter(step => {
      if (completed.has(step.id)) return false
      if (step.status === 'skipped' || step.status === 'done') return false
      // Check all dependencies are satisfied
      if (step.dependsOn?.length) {
        return step.dependsOn.every(depId => completed.has(depId))
      }
      return true
    })
  }

  private skipDependentSteps(plan: ExecutionPlan, failedStepId: number, completed: Set<number>): void {
    for (const step of plan.steps) {
      if (completed.has(step.id)) continue
      if (step.dependsOn?.includes(failedStepId)) {
        planEngine.updateStepStatus(this.runningPlanId!, step.id, 'skipped', undefined, `Skipped: dependency step ${failedStepId} failed`)
        completed.add(step.id)
        // Recursively skip steps that depend on this one
        this.skipDependentSteps(plan, step.id, completed)
      }
    }
  }

  private skipRemainingSteps(plan: ExecutionPlan, completed: Set<number>): void {
    for (const step of plan.steps) {
      if (!completed.has(step.id) && step.status === 'pending') {
        planEngine.updateStepStatus(this.runningPlanId!, step.id, 'skipped', undefined, 'Plan cancelled')
      }
    }
  }

  // ── Pause / Resume / Cancel ──────────────────────────────────────────────

  private resumeResolve: (() => void) | null = null

  pause(): void {
    if (this.runningPlanId) {
      this.isPaused = true
      this.emitState()
    }
  }

  resume(): void {
    if (this.runningPlanId && this.isPaused) {
      this.isPaused = false
      if (this.resumeResolve) {
        this.resumeResolve()
        this.resumeResolve = null
      }
      this.emitState()
      this.emit('plan:resumed', { planId: this.runningPlanId })
    }
  }

  cancel(): void {
    if (this.runningPlanId) {
      this.isCancelled = true
      // If paused, also resume to unblock the wait
      if (this.isPaused) {
        this.resume()
      }
      this.emitState()
    }
  }

  private waitForResume(): Promise<void> {
    return new Promise(resolve => {
      this.resumeResolve = resolve
    })
  }

  // ── State ────────────────────────────────────────────────────────────────

  getState(): PlanExecutionState {
    const plan = this.runningPlanId ? planEngine.getPlan(this.runningPlanId) : null

    return {
      planId: this.runningPlanId || '',
      isRunning: !!this.runningPlanId,
      currentStepId: this.currentStepId,
      completedSteps: plan ? plan.steps.filter(s => s.status === 'done').length : 0,
      totalSteps: plan ? plan.steps.length : 0,
      isPaused: this.isPaused,
      isCancelled: this.isCancelled,
    }
  }

  private emitState(): void {
    this.emit('plan:state', this.getState())
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const planExecutor = new PlanExecutor()
