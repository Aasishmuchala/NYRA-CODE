/**
 * Plan Engine — LLM-Powered Plan Generator
 *
 * Generates structured, editable execution plans from user requests.
 * Uses the active LLM provider to decompose complex tasks into
 * step-by-step plans with file references, tool calls, and dependencies.
 *
 * This replaces the keyword-based routing in agent-orchestrator.ts
 * with transparent, user-editable plans (matching Cursor's Plan Mode UX).
 *
 * Architecture:
 *   User Request → Plan Engine (LLM) → ExecutionPlan → Plan Executor → Agent Orchestrator
 */

import { EventEmitter } from 'events'
import { callAgentLLM } from './agent-llm-client'
import { getAgent } from './agent-registry'
import * as contextEngine from './context-engine'
import { getCapabilitySummary } from './mcp-tool-router'

// ── Plan Types ───────────────────────────────────────────────────────────────

export type PlanStepAction =
  | 'read'        // Read files for understanding
  | 'write'       // Create new files
  | 'edit'        // Modify existing files
  | 'terminal'    // Run a shell command
  | 'mcp_tool'    // Call an MCP tool
  | 'search'      // Search files or web
  | 'review'      // Review/verify results
  | 'test'        // Run tests
  | 'git'         // Git operations

export interface PlanStep {
  id: number
  action: PlanStepAction
  description: string
  /** Files to read or modify */
  files?: string[]
  /** MCP tool qualified name (serverName::toolName) */
  tool?: string
  /** Terminal command to execute */
  command?: string
  /** Which agent role should handle this step */
  agentRole?: string
  /** Step IDs this step depends on */
  dependsOn?: number[]
  /** Current execution status */
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  /** Result after execution */
  result?: string
  /** Error message if failed */
  error?: string
  /** Execution time in ms */
  durationMs?: number
}

export interface ExecutionPlan {
  id: string
  goal: string
  steps: PlanStep[]
  /** Estimated total token cost */
  estimatedTokens: number
  /** Overall risk assessment */
  riskLevel: 'safe' | 'moderate' | 'high'
  /** Current plan status */
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled'
  /** Project context used for generation */
  projectId?: string
  /** Timestamp of plan creation */
  createdAt: number
  /** Timestamp of last status change */
  updatedAt: number
}

// ── Plan Generation System Prompt ────────────────────────────────────────────

const PLAN_SYSTEM_PROMPT = `You are a planning agent for Nyra Desktop, an AI workspace.
Your job is to break down user requests into a structured execution plan.

RULES:
1. Each step should be small and focused (one action per step)
2. Steps should be ordered by dependencies (later steps can depend on earlier ones)
3. Include file paths when known (use relative paths from project root)
4. For code changes, prefer 'edit' over 'write' for existing files
5. Always include a 'review' step at the end to verify the work
6. Estimate risk: 'safe' for read-only, 'moderate' for code changes, 'high' for destructive ops
7. Assign agent roles: 'code' for implementation, 'research' for investigation, 'writer' for docs, 'qa' for testing, 'review' for verification

OUTPUT FORMAT — respond with ONLY a JSON object, no markdown:
{
  "goal": "Brief description of the overall goal",
  "riskLevel": "safe" | "moderate" | "high",
  "steps": [
    {
      "id": 1,
      "action": "read" | "write" | "edit" | "terminal" | "mcp_tool" | "search" | "review" | "test" | "git",
      "description": "What this step does",
      "files": ["path/to/file.ts"],
      "command": "npm test",
      "tool": "serverName::toolName",
      "agentRole": "code" | "research" | "writer" | "qa" | "review",
      "dependsOn": [1, 2]
    }
  ]
}`

// ── Plan Engine ──────────────────────────────────────────────────────────────

class PlanEngine extends EventEmitter {
  private plans = new Map<string, ExecutionPlan>()

  /**
   * Generate an execution plan from a user request.
   * Uses the active LLM provider via the existing agent-llm-client.
   */
  async generatePlan(
    userRequest: string,
    projectId?: string,
    modelId?: string
  ): Promise<ExecutionPlan> {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    this.emit('plan:generating', { planId, request: userRequest })

    // Gather project context for the LLM
    let contextStr = ''
    if (projectId) {
      try {
        const assembly = contextEngine.assembleContext(projectId, undefined, modelId)
        contextStr = assembly.sources
          .map(s => `[${s.type}] ${s.label}:\n${s.content}`)
          .join('\n\n')
      } catch {
        // Context assembly failure is non-fatal
      }
    }

    // Get MCP capabilities summary
    const mcpSummary = getCapabilitySummary()

    // Build the prompt
    const userPrompt = [
      `USER REQUEST: ${userRequest}`,
      contextStr ? `\nPROJECT CONTEXT:\n${contextStr}` : '',
      mcpSummary !== 'No MCP servers running.' ? `\nAVAILABLE MCP TOOLS:\n${mcpSummary}` : '',
    ].filter(Boolean).join('\n')

    // Call LLM using the Planner agent definition
    const plannerAgent = getAgent('agent-planner')
    if (!plannerAgent) {
      throw new Error('Planner agent not found in registry')
    }

    // Override the system prompt with our plan-specific prompt
    const plannerWithPrompt = {
      ...plannerAgent,
      systemPrompt: PLAN_SYSTEM_PROMPT,
      tokenBudget: 4000, // Plans should be concise
    }

    let llmResponse: string
    try {
      llmResponse = await callAgentLLM(plannerWithPrompt, userPrompt)
    } catch (err) {
      throw new Error(`Plan generation failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Parse the LLM response into a structured plan
    const plan = this.parsePlanResponse(planId, userRequest, llmResponse)

    // Store the plan
    this.plans.set(planId, plan)
    this.emit('plan:generated', plan)

    return plan
  }

  /**
   * Parse LLM response into a structured ExecutionPlan.
   * Handles JSON extraction from potentially messy LLM output.
   */
  private parsePlanResponse(planId: string, goal: string, response: string): ExecutionPlan {
    let parsed: any

    try {
      // Try direct JSON parse first
      parsed = JSON.parse(response)
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1])
        } catch {
          // Fall through to fallback
        }
      }

      // Try finding JSON object in response
      if (!parsed) {
        const braceMatch = response.match(/\{[\s\S]*\}/)
        if (braceMatch) {
          try {
            parsed = JSON.parse(braceMatch[0])
          } catch {
            // Fall through to fallback
          }
        }
      }
    }

    // If parsing completely failed, create a single-step fallback plan
    if (!parsed || !parsed.steps || !Array.isArray(parsed.steps)) {
      return this.createFallbackPlan(planId, goal, response)
    }

    // Validate and normalize steps
    const steps: PlanStep[] = parsed.steps.map((step: any, index: number) => ({
      id: step.id || index + 1,
      action: this.validateAction(step.action) || 'read',
      description: String(step.description || `Step ${index + 1}`),
      files: Array.isArray(step.files) ? step.files.map(String) : undefined,
      tool: step.tool ? String(step.tool) : undefined,
      command: step.command ? String(step.command) : undefined,
      agentRole: step.agentRole ? String(step.agentRole) : undefined,
      dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(Number) : undefined,
      status: 'pending' as const,
    }))

    // Estimate token cost (~200 tokens per step average)
    const estimatedTokens = steps.length * 200

    return {
      id: planId,
      goal: parsed.goal || goal,
      steps,
      estimatedTokens,
      riskLevel: this.validateRisk(parsed.riskLevel) || 'moderate',
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }

  /**
   * Create a simple fallback plan when LLM response can't be parsed.
   * This gracefully degrades to a single-step execution.
   */
  private createFallbackPlan(planId: string, goal: string, _rawResponse: string): ExecutionPlan {
    return {
      id: planId,
      goal,
      steps: [
        {
          id: 1,
          action: 'read',
          description: `Analyze request: ${goal}`,
          agentRole: 'research',
          status: 'pending',
        },
        {
          id: 2,
          action: 'edit',
          description: `Execute: ${goal}`,
          agentRole: 'code',
          dependsOn: [1],
          status: 'pending',
        },
        {
          id: 3,
          action: 'review',
          description: 'Verify changes and check for issues',
          agentRole: 'review',
          dependsOn: [2],
          status: 'pending',
        },
      ],
      estimatedTokens: 600,
      riskLevel: 'moderate',
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }

  private validateAction(action: string): PlanStepAction | null {
    const valid: PlanStepAction[] = ['read', 'write', 'edit', 'terminal', 'mcp_tool', 'search', 'review', 'test', 'git']
    return valid.includes(action as PlanStepAction) ? (action as PlanStepAction) : null
  }

  private validateRisk(risk: string): ExecutionPlan['riskLevel'] | null {
    const valid = ['safe', 'moderate', 'high'] as const
    return valid.includes(risk as any) ? (risk as ExecutionPlan['riskLevel']) : null
  }

  // ── Plan CRUD ────────────────────────────────────────────────────────────

  getPlan(planId: string): ExecutionPlan | null {
    return this.plans.get(planId) || null
  }

  listPlans(): ExecutionPlan[] {
    return Array.from(this.plans.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Update a plan step (user can edit before execution).
   */
  updateStep(planId: string, stepId: number, updates: Partial<PlanStep>): ExecutionPlan | null {
    const plan = this.plans.get(planId)
    if (!plan || plan.status !== 'draft') return null

    const step = plan.steps.find(s => s.id === stepId)
    if (!step) return null

    // Only allow editing pending steps
    if (step.status !== 'pending') return null

    if (updates.description !== undefined) step.description = updates.description
    if (updates.action !== undefined) step.action = updates.action
    if (updates.files !== undefined) step.files = updates.files
    if (updates.command !== undefined) step.command = updates.command
    if (updates.tool !== undefined) step.tool = updates.tool
    if (updates.agentRole !== undefined) step.agentRole = updates.agentRole
    if (updates.dependsOn !== undefined) step.dependsOn = updates.dependsOn

    plan.updatedAt = Date.now()
    this.emit('plan:updated', plan)
    return plan
  }

  /**
   * Add a new step to a draft plan.
   */
  addStep(planId: string, step: Omit<PlanStep, 'id' | 'status'>): ExecutionPlan | null {
    const plan = this.plans.get(planId)
    if (!plan || plan.status !== 'draft') return null

    const maxId = Math.max(...plan.steps.map(s => s.id), 0)
    plan.steps.push({
      ...step,
      id: maxId + 1,
      status: 'pending',
    })
    plan.updatedAt = Date.now()
    this.emit('plan:updated', plan)
    return plan
  }

  /**
   * Remove a step from a draft plan.
   */
  removeStep(planId: string, stepId: number): ExecutionPlan | null {
    const plan = this.plans.get(planId)
    if (!plan || plan.status !== 'draft') return null

    plan.steps = plan.steps.filter(s => s.id !== stepId)
    // Remove dependencies on the deleted step
    for (const step of plan.steps) {
      if (step.dependsOn) {
        step.dependsOn = step.dependsOn.filter(d => d !== stepId)
      }
    }

    plan.updatedAt = Date.now()
    this.emit('plan:updated', plan)
    return plan
  }

  /**
   * Approve a plan for execution.
   */
  approvePlan(planId: string): ExecutionPlan | null {
    const plan = this.plans.get(planId)
    if (!plan || plan.status !== 'draft') return null

    plan.status = 'approved'
    plan.updatedAt = Date.now()
    this.emit('plan:approved', plan)
    return plan
  }

  /**
   * Cancel a plan.
   */
  cancelPlan(planId: string): ExecutionPlan | null {
    const plan = this.plans.get(planId)
    if (!plan) return null
    if (plan.status === 'completed' || plan.status === 'cancelled') return null

    plan.status = 'cancelled'
    plan.updatedAt = Date.now()

    // Mark all pending steps as skipped
    for (const step of plan.steps) {
      if (step.status === 'pending') step.status = 'skipped'
    }

    this.emit('plan:cancelled', plan)
    return plan
  }

  /**
   * Mark a step's execution status (called by plan-executor).
   */
  updateStepStatus(
    planId: string,
    stepId: number,
    status: PlanStep['status'],
    result?: string,
    error?: string,
    durationMs?: number
  ): void {
    const plan = this.plans.get(planId)
    if (!plan) return

    const step = plan.steps.find(s => s.id === stepId)
    if (!step) return

    step.status = status
    if (result !== undefined) step.result = result
    if (error !== undefined) step.error = error
    if (durationMs !== undefined) step.durationMs = durationMs

    plan.updatedAt = Date.now()

    // Update overall plan status based on steps
    const allDone = plan.steps.every(s => s.status === 'done' || s.status === 'skipped')
    const anyFailed = plan.steps.some(s => s.status === 'failed')

    if (allDone && !anyFailed) {
      plan.status = 'completed'
      this.emit('plan:completed', plan)
    } else if (anyFailed) {
      plan.status = 'failed'
      this.emit('plan:failed', plan)
    }

    this.emit('plan:step-update', { planId, stepId, status, result, error })
  }

  /**
   * Set plan status to executing (called by plan-executor).
   */
  markExecuting(planId: string): void {
    const plan = this.plans.get(planId)
    if (plan) {
      plan.status = 'executing'
      plan.updatedAt = Date.now()
      this.emit('plan:executing', plan)
    }
  }

  /**
   * Delete a plan from memory.
   */
  deletePlan(planId: string): boolean {
    return this.plans.delete(planId)
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const planEngine = new PlanEngine()
