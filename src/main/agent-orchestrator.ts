import { emitEvent } from './event-bus'
import { memory as _memory } from './memory'
import * as taskManager from './task-manager'
import * as agentRegistry from './agent-registry'
import type { AgentDefinition } from './agent-registry'
import * as contextEngine from './context-engine'
import * as _approvalPipeline from './approval-pipeline'
import * as auditLog from './audit-log'
import { callAgentLLM } from './agent-llm-client'

// ── Phase 2: Intelligence Modules ────────────────────────────────────────────
import { memoryArchitect } from './memory/memory-architecture'
import { reasoningEngine } from './reasoning/reasoning-engine'
import type { LLMCallFn } from './reasoning/reasoning-engine'
import { DEFAULT_REASONING_CONFIG } from './reasoning/reasoning-interfaces'
import { ensembleEngine } from './ensemble/ensemble-engine'
import type { EnsembleModelSpec } from './ensemble/ensemble-interfaces'
import { providerRegistry } from './providers/provider-registry'
import type { ChatRequest } from './providers/provider-interface'
import { semanticMemory } from './semantic-memory'
import { agentMessageBus } from './agent-message-bus'
import type { AgentBusMessage } from './agent-message-bus'
import { modelRouter } from './model-router'
import type { RoutingContext } from './model-router'

/**
 * Agent Orchestrator for Nyra Desktop
 * Lead Agent orchestration layer that runs in the Electron main process
 * Decomposes tasks and routes to specialists using deterministic logic
 */

// ─────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────

export type ExecutionMode = 'solo' | 'subagent' | 'team'

export interface TaskDecomposition {
  subtasks: SubtaskPlan[]
  executionMode: 'sequential' | 'parallel' | 'mixed'
  requiresApproval: boolean
  estimatedDuration: number  // seconds
}

export interface SubtaskPlan {
  id: string
  title: string
  description: string
  agentRole: string  // AgentRole from agent-registry
  folderScope: string[]
  tools: string[]
  dependencies: string[]  // subtask IDs this depends on
  estimatedDuration: number
}

export interface AgentMessage {
  from: string
  to: string
  type: 'assignment' | 'result' | 'handoff' | 'approval_request' | 'status_update' | 'error'
  taskId: string
  payload: {
    summary: string
    artifacts?: Array<{ name: string; type: string; content: string }>
    filesAccessed?: string[]
    filesModified?: string[]
    nextSteps?: string[]
    confidence?: number
    needsReview?: boolean
  }
  timestamp: number
}

export interface OrchestratorState {
  mode: ExecutionMode
  activeTaskCount: number
  queuedTaskCount: number
  activeAgents: string[]
}

// ─────────────────────────────────────────────────────────────────────────
// STATE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────

let currentMode: ExecutionMode = 'solo'
const taskQueue: string[] = []
const activeAgentSessions: Map<string, { taskId: string; agentId: string; startedAt: number }> = new Map()

// ── Phase 2: Agent Message Bus Observer ──────────────────────────────────────
// The orchestrator observes ALL inter-agent messages for audit logging
// and can intercept/modify routing if needed.
agentMessageBus.observe((message: AgentBusMessage) => {
  console.log(`[MessageBus] ${message.from} → ${message.to}: [${message.type}] ${message.payload.summary}`)
  auditLog.logAction({
    taskId: message.taskId || 'none',
    agentId: message.from,
    action: `bus:${message.type}`,
    target: message.to,
    reversible: false,
    snapshotId: null,
    details: {
      messageId: message.id,
      correlationId: message.correlationId,
      summary: message.payload.summary.slice(0, 200),
    },
  })
})

/**
 * Set the orchestration mode
 */
export function setMode(mode: ExecutionMode): void {
  const previousMode = currentMode
  currentMode = mode
  console.log(`[Orchestrator] Mode changed: ${previousMode} → ${mode}`)
  emitEvent('agent:mode-changed', { from: previousMode, to: mode })
}

/**
 * Get the current orchestration mode
 */
export function getMode(): ExecutionMode {
  return currentMode
}

/**
 * Get current orchestrator state
 */
export function getState(): OrchestratorState {
  return {
    mode: currentMode,
    activeTaskCount: activeAgentSessions.size,
    queuedTaskCount: taskQueue.length,
    activeAgents: Array.from(activeAgentSessions.keys()),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TASK COMPLEXITY ANALYSIS (Deterministic, No LLM)
// ─────────────────────────────────────────────────────────────────────────

const SOLO_KEYWORDS = [
  'review', 'check', 'read', 'summarize', 'search', 'find',
  'list', 'count', 'analyze', 'audit', 'verify', 'validate',
  'scan', 'inspect', 'explore',
]

const SUBAGENT_KEYWORDS = [
  'create and review', 'build and test', 'write and check',
  'implement and verify', 'draft and refine', 'organize and sort',
]

const TEAM_KEYWORDS = [
  'prepare', 'organize multiple', 'across all', 'coordinate',
  'consolidate', 'integrate', 'merge', 'batch', 'migrate',
]

/**
 * Analyze task complexity deterministically (no LLM call)
 * Returns recommended execution mode and reasoning
 */
export function analyzeComplexity(
  taskTitle: string,
  taskDescription: string
): { mode: ExecutionMode; reason: string } {
  const combined = `${taskTitle} ${taskDescription}`.toLowerCase()

  // Check for team-level indicators first (highest complexity)
  for (const keyword of TEAM_KEYWORDS) {
    if (combined.includes(keyword)) {
      return {
        mode: 'team',
        reason: `Multiple agents needed: detected keyword "${keyword}"`,
      }
    }
  }

  // Check for subagent indicators (medium complexity)
  for (const keyword of SUBAGENT_KEYWORDS) {
    if (combined.includes(keyword)) {
      return {
        mode: 'subagent',
        reason: `Sequential specialists needed: detected pattern "${keyword}"`,
      }
    }
  }

  // Check heuristics for complexity
  const descriptionLength = taskDescription?.length ?? 0
  if (descriptionLength > 200) {
    return {
      mode: 'subagent',
      reason: 'Detailed description suggests complexity',
    }
  }

  // Check for solo indicators (lowest complexity)
  for (const keyword of SOLO_KEYWORDS) {
    if (combined.includes(keyword)) {
      return {
        mode: 'solo',
        reason: `Single specialist sufficient: detected keyword "${keyword}"`,
      }
    }
  }

  // Default to solo for simple tasks
  return {
    mode: 'solo',
    reason: 'Simple task suitable for single specialist',
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TASK DECOMPOSITION
// ─────────────────────────────────────────────────────────────────────────

/**
 * Generate unique subtask ID
 */
function generateSubtaskId(): string {
  return `subtask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Map task keywords to agent roles
 */
function mapKeywordToAgent(text: string): string {
  const lower = text.toLowerCase()

  if (lower.includes('code') || lower.includes('implement') || lower.includes('fix bug')) {
    return 'code'
  }
  if (lower.includes('review') || lower.includes('check') || lower.includes('audit')) {
    return 'review'
  }
  if (lower.includes('organize') || lower.includes('move') || lower.includes('rename')) {
    return 'fileops'
  }
  if (lower.includes('research') || lower.includes('find') || lower.includes('search')) {
    return 'research'
  }
  if (lower.includes('analyze') || lower.includes('spreadsheet') || lower.includes('data')) {
    return 'spreadsheet'
  }
  if (lower.includes('write') || lower.includes('create') || lower.includes('draft')) {
    return 'writer'
  }

  return 'generalist'
}

/**
 * Decompose a task into subtasks deterministically
 */
export function decomposeTask(
  _taskId: string,
  title: string,
  description: string,
  folderScope: string[]
): TaskDecomposition {
  const subtasks: SubtaskPlan[] = []
  const combined = `${title} ${description}`.toLowerCase()

  // Detect if task has review/refinement pattern
  const hasReview = combined.includes('review') || combined.includes('check')
  const hasMultipleSteps = combined.includes('and') || combined.includes(',')

  // Single-step decomposition
  if (!hasMultipleSteps) {
    const subtaskId = generateSubtaskId()
    const agentRole = mapKeywordToAgent(combined)

    subtasks.push({
      id: subtaskId,
      title: title,
      description: description || '',
      agentRole,
      folderScope,
      tools: getToolsForAgent(agentRole),
      dependencies: [],
      estimatedDuration: 300,
    })

    return {
      subtasks,
      executionMode: 'sequential',
      requiresApproval: hasReview,
      estimatedDuration: 300,
    }
  }

  // Multi-step decomposition (e.g., "create and review")
  // Step 1: Primary action
  const step1Id = generateSubtaskId()
  const primaryAgent = mapKeywordToAgent(title)

  subtasks.push({
    id: step1Id,
    title: `Execute: ${title}`,
    description: description || '',
    agentRole: primaryAgent,
    folderScope,
    tools: getToolsForAgent(primaryAgent),
    dependencies: [],
    estimatedDuration: 300,
  })

  // Step 2: Review/refinement (if detected)
  if (hasReview) {
    const step2Id = generateSubtaskId()
    subtasks.push({
      id: step2Id,
      title: `Review: ${title}`,
      description: 'Verify completion and quality of work',
      agentRole: 'review',
      folderScope,
      tools: getToolsForAgent('review'),
      dependencies: [step1Id],
      estimatedDuration: 180,
    })
  }

  const executionMode = subtasks.length > 1 ? 'sequential' : 'parallel'
  const totalDuration = subtasks.reduce((sum, s) => sum + s.estimatedDuration, 0)

  return {
    subtasks,
    executionMode,
    requiresApproval: hasReview,
    estimatedDuration: totalDuration,
  }
}

/**
 * Get recommended tools for an agent role
 */
function getToolsForAgent(agentRole: string): string[] {
  const toolMap: Record<string, string[]> = {
    code: ['file_read', 'file_write', 'file_search', 'execute_command', 'git_operations'],
    review: ['file_read', 'file_search', 'notes_create'],
    fileops: ['file_move', 'file_delete', 'file_create', 'directory_operations'],
    research: ['web_search', 'file_read', 'note_create'],
    spreadsheet: ['spreadsheet_read', 'spreadsheet_write', 'data_analysis'],
    writer: ['file_write', 'file_read', 'notes_create'],
    generalist: ['file_read', 'file_write', 'file_search'],
  }

  return toolMap[agentRole] || toolMap.generalist
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN EXECUTION ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────

/**
 * Execute a task through the full orchestration pipeline
 */
export async function executeTask(taskId: string): Promise<void> {
  const task = taskManager.getTask(taskId)
  if (!task) {
    console.error(`[Orchestrator] Task not found: ${taskId}`)
    return
  }

  try {
    console.log(`[Orchestrator] Starting task execution: ${taskId}`)
    emitEvent('task:execution-started', { taskId, task })

    // Step 1: Transition to planning
    taskManager.transitionTask(taskId, 'planning')

    // Step 2: Analyze complexity
    const { mode, reason } = analyzeComplexity(task.title, task.description || '')
    console.log(`[Orchestrator] Complexity analysis: ${mode} (${reason})`)

    // Step 3: Decompose task if needed
    let decomposition: TaskDecomposition | null = null
    if (mode !== 'solo') {
      decomposition = decomposeTask(taskId, task.title, task.description || '', task.folderScope)
      console.log(`[Orchestrator] Decomposed into ${decomposition.subtasks.length} subtasks`)
    }

    // Step 4: Gather context
    taskManager.transitionTask(taskId, 'gathering_context')
    const context = contextEngine.assembleContext(task.projectId || 'default', taskId)
    console.log(`[Orchestrator] Context assembled`)

    // Step 5: Route to appropriate execution mode
    if (mode === 'solo') {
      await executeSolo(taskId, context)
    } else if (mode === 'subagent' && decomposition) {
      await executeSubagent(taskId, decomposition, context)
    } else if (mode === 'team' && decomposition) {
      await executeTeam(taskId, decomposition, context)
    }

    // Step 6: Verify
    taskManager.transitionTask(taskId, 'verification')
    const artifacts = taskManager.getTaskArtifacts(taskId)
    console.log(`[Orchestrator] Verification: ${artifacts.length} artifacts generated`)

    // Step 7: Finalize
    taskManager.transitionTask(taskId, 'finalizing')
    const events = taskManager.getTaskEvents(taskId)
    const summary = `Task completed with ${artifacts.length} artifacts across ${events.length} events`

    taskManager.updateTask(taskId, { summary })
    taskManager.transitionTask(taskId, 'completed')

    console.log(`[Orchestrator] Task completed: ${taskId}`)
    emitEvent('task:execution-completed', { taskId, task, summary })

    // Process next task in queue if solo mode
    if (currentMode === 'solo' && taskQueue.length > 0) {
      await processQueue()
    }
  } catch (error) {
    console.error(`[Orchestrator] Task execution failed: ${taskId}`, error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    taskManager.updateTask(taskId, { error: errorMsg })
    taskManager.transitionTask(taskId, 'failed')
    emitEvent('task:execution-failed', { taskId, error: errorMsg })
  }
}

// ─────────────────────────────────────────────────────────────────────────
// EXECUTION MODES: SOLO
// ─────────────────────────────────────────────────────────────────────────

/**
 * Execute task with single agent (solo mode)
 */
async function executeSolo(taskId: string, context: any): Promise<{ summary: string; artifacts: any[] }> {
  const task = taskManager.getTask(taskId)!
  console.log(`[Orchestrator] Executing solo: ${taskId}`)

  taskManager.transitionTask(taskId, 'delegation')

  // Determine best agent for this task
  const { mode: _mode, reason: _reason } = analyzeComplexity(task.title, task.description || '')
  const agentRole = mapKeywordToAgent(`${task.title} ${task.description}`)

  const agent = agentRegistry.getAgentForRole(agentRole as any)
  if (!agent) throw new Error(`No agent found for role: ${agentRole}`)
  const agentId = agent.id
  console.log(`[Orchestrator] Assigned agent: ${agentId} (${agentRole})`)

  // Execute main agent
  taskManager.transitionTask(taskId, 'execution')

  // Phase 2: Inject tiered memory context
  let memoryContext = ''
  try {
    memoryContext = await memoryArchitect.buildMemoryContext(
      `${task.title} ${task.description || ''}`,
      2000  // 2K token budget for memory injection
    )
  } catch (err) {
    console.warn('[Orchestrator] Memory context injection skipped:', err)
  }

  const input = `
Task: ${task.title}
Description: ${task.description || 'No description provided'}
Folder Scope: ${task.folderScope.join(', ')}
${memoryContext ? `\nRelevant Memory:\n${memoryContext}\n` : ''}
Context: ${JSON.stringify(context, null, 2)}
  `.trim()

  const result = await runAgent(agentId, taskId, input, context)
  console.log(`[Orchestrator] Agent result: ${result.payload.summary}`)

  // Phase 2: Extract memories from agent output for future recall
  try {
    await semanticMemory.extractFromText(
      result.payload.summary,
      `task:${taskId}`
    )
  } catch (err) {
    console.warn('[Orchestrator] Memory extraction skipped:', err)
  }

  // Save artifact if any
  if (result.payload.artifacts && result.payload.artifacts.length > 0) {
    for (const artifact of result.payload.artifacts) {
      taskManager.addTaskArtifact(taskId, {
        name: artifact.name,
        type: artifact.type,
        content: artifact.content,
        path: null,
      })
    }
  }

  return {
    summary: result.payload.summary,
    artifacts: result.payload.artifacts || [],
  }
}

// ─────────────────────────────────────────────────────────────────────────
// EXECUTION MODES: SUBAGENT
// ─────────────────────────────────────────────────────────────────────────

/**
 * Execute task with sequential specialist agents (subagent mode)
 */
async function executeSubagent(
  taskId: string,
  decomposition: TaskDecomposition,
  context: any
): Promise<{ summary: string; artifacts: any[] }> {
  console.log(`[Orchestrator] Executing subagent (${decomposition.subtasks.length} subtasks): ${taskId}`)

  taskManager.transitionTask(taskId, 'delegation')

  const results: AgentMessage[] = []
  const completedSubtasks = new Set<string>()

  // Execute subtasks sequentially, respecting dependencies
  for (const subtask of decomposition.subtasks) {
    // Wait for dependencies
    if (subtask.dependencies.length > 0) {
      const allReady = subtask.dependencies.every(depId => completedSubtasks.has(depId))
      if (!allReady) {
        console.log(`[Orchestrator] Subtask ${subtask.id} waiting for dependencies`)
        continue
      }
    }

    taskManager.transitionTask(taskId, 'execution')

    // Select agent for subtask
    const agent = agentRegistry.getAgentForRole(subtask.agentRole as any)
    if (!agent) throw new Error(`No agent found for role: ${subtask.agentRole}`)
    const agentId = agent.id
    console.log(`[Orchestrator] Executing subtask ${subtask.id} with agent ${agentId}`)

    // Phase 2: Inject tiered memory context per subtask
    let subtaskMemory = ''
    try {
      subtaskMemory = await memoryArchitect.buildMemoryContext(
        `${subtask.title} ${subtask.description}`,
        1500  // 1.5K token budget per subtask (lighter than solo)
      )
    } catch (err) {
      console.warn('[Orchestrator] Subtask memory injection skipped:', err)
    }

    const input = `
Subtask: ${subtask.title}
Description: ${subtask.description}
Folder Scope: ${subtask.folderScope.join(', ')}
Tools: ${subtask.tools.join(', ')}
${subtaskMemory ? `\nRelevant Memory:\n${subtaskMemory}\n` : ''}
Context: ${JSON.stringify(context, null, 2)}
    `.trim()

    const result = await runAgent(agentId, taskId, input, context)
    results.push(result)
    completedSubtasks.add(subtask.id)

    // Phase 2: Update working memory with subtask result for subsequent subtasks
    try {
      await memoryArchitect.addToWorkingMemory(
        `[Subtask ${subtask.id}] ${result.payload.summary}`
      )
    } catch (err) {
      console.warn('[Orchestrator] Working memory update skipped:', err)
    }

    recordHandoff(agentId, 'lead', taskId, result.payload.summary)

    // Store artifacts
    if (result.payload.artifacts && result.payload.artifacts.length > 0) {
      for (const artifact of result.payload.artifacts) {
        taskManager.addTaskArtifact(taskId, {
          name: `${subtask.title}_${artifact.name}`,
          type: artifact.type,
          content: artifact.content,
          path: null,
        })
      }
    }
  }

  // Phase 2: Extract memories from the combined subagent output
  const summary = results.map(r => r.payload.summary).join(' → ')
  try {
    await semanticMemory.extractFromText(summary, `task:${taskId}:subagent`)
  } catch (err) {
    console.warn('[Orchestrator] Subagent memory extraction skipped:', err)
  }

  console.log(`[Orchestrator] Subagent execution complete: ${summary}`)

  return {
    summary,
    artifacts: results.flatMap(r => r.payload.artifacts || []),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// EXECUTION MODES: TEAM
// ─────────────────────────────────────────────────────────────────────────

/**
 * Execute task with parallel team agents (team mode)
 */
async function executeTeam(
  taskId: string,
  decomposition: TaskDecomposition,
  context: any
): Promise<{ summary: string; artifacts: any[] }> {
  console.log(`[Orchestrator] Executing team (${decomposition.subtasks.length} subtasks): ${taskId}`)

  taskManager.transitionTask(taskId, 'delegation')

  const results: AgentMessage[] = []
  const subtaskMap = new Map<string, SubtaskPlan>(decomposition.subtasks.map(s => [s.id, s]))
  const completedSubtasks = new Set<string>()

  // Execute subtasks with dependency-aware parallelization
  const pendingSubtasks = new Set(decomposition.subtasks.map(s => s.id))

  while (pendingSubtasks.size > 0) {
    const readySubtasks = decomposition.subtasks.filter(
      s =>
        pendingSubtasks.has(s.id) &&
        (s.dependencies.length === 0 || s.dependencies.every(depId => completedSubtasks.has(depId)))
    )

    if (readySubtasks.length === 0) {
      console.warn('[Orchestrator] Circular dependency detected or no ready subtasks')
      break
    }

    // Execute ready subtasks in parallel
    taskManager.transitionTask(taskId, 'execution')
    const parallelResults = await Promise.all(
      readySubtasks.map(async subtask => {
        const agent = agentRegistry.getAgentForRole(subtask.agentRole as any)
        if (!agent) throw new Error(`No agent found for role: ${subtask.agentRole}`)
        const agentId = agent.id
        console.log(`[Orchestrator] Executing subtask ${subtask.id} in parallel with agent ${agentId}`)

        // Phase 2: Inject tiered memory context per parallel subtask
        let subtaskMemory = ''
        try {
          subtaskMemory = await memoryArchitect.buildMemoryContext(
            `${subtask.title} ${subtask.description}`,
            1500
          )
        } catch (err) {
          console.warn('[Orchestrator] Team subtask memory injection skipped:', err)
        }

        const input = `
Subtask: ${subtask.title}
Description: ${subtask.description}
Folder Scope: ${subtask.folderScope.join(', ')}
Tools: ${subtask.tools.join(', ')}
${subtaskMemory ? `\nRelevant Memory:\n${subtaskMemory}\n` : ''}
Context: ${JSON.stringify(context, null, 2)}
        `.trim()

        const result = await runAgent(agentId, taskId, input, context)
        return { subtaskId: subtask.id, result, agentId }
      })
    )

    // Process results
    for (const { subtaskId, result, agentId } of parallelResults) {
      results.push(result)
      completedSubtasks.add(subtaskId)
      pendingSubtasks.delete(subtaskId)

      // Phase 2: Update working memory with each completed parallel subtask
      try {
        await memoryArchitect.addToWorkingMemory(
          `[Team ${subtaskId}] ${result.payload.summary}`
        )
      } catch (err) {
        console.warn('[Orchestrator] Team working memory update skipped:', err)
      }

      recordHandoff(agentId, 'lead', taskId, result.payload.summary)

      // Store artifacts
      if (result.payload.artifacts && result.payload.artifacts.length > 0) {
        const subtask = subtaskMap.get(subtaskId)!
        for (const artifact of result.payload.artifacts) {
          taskManager.addTaskArtifact(taskId, {
            name: `${subtask.title}_${artifact.name}`,
            type: artifact.type,
            content: artifact.content,
            path: null,
          })
        }
      }
    }
  }

  // Phase 2: Extract memories from the combined team output
  const summary = results.map(r => r.payload.summary).join(' | ')
  try {
    await semanticMemory.extractFromText(summary, `task:${taskId}:team`)
  } catch (err) {
    console.warn('[Orchestrator] Team memory extraction skipped:', err)
  }

  console.log(`[Orchestrator] Team execution complete: ${summary}`)

  return {
    summary,
    artifacts: results.flatMap(r => r.payload.artifacts || []),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// AGENT EXECUTION
// ─────────────────────────────────────────────────────────────────────────

/**
 * Run an agent for a given task.
 *
 * Pipeline (Phase 2 — layered enrichment):
 *   1. Reasoning analysis  — analyze task complexity, decide strategy
 *   2. Reasoning execution — (complex tasks only) structured reasoning pre-pass
 *   3. Ensemble execution  — (multi-model agents only) consensus across providers
 *   4. Standard LLM call   — fallback / simple tasks
 *
 * Each layer is optional and wrapped in try/catch for graceful degradation.
 */
async function runAgent(
  agentId: string,
  taskId: string,
  input: string,
  _context: any
): Promise<AgentMessage> {
  const agent = agentRegistry.getAgent(agentId)
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`)
  }

  console.log(`[Orchestrator] Running agent: ${agentId}`)

  try {
    // Update agent status
    agentRegistry.updateAgentStatus(agentId, 'running')

    // Log agent run start
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    auditLog.logAction({ taskId, agentId, action: 'agent_run_started', target: null, reversible: false, snapshotId: null, details: { runId, input: input.slice(0, 200) } })

    // Track active session
    activeAgentSessions.set(agentId, { taskId, agentId, startedAt: Date.now() })

    // Emit status event so UI shows agent is working
    emitEvent('agent:status', { agentId, taskId, status: 'running' })

    // ── Phase 2: Inject pending bus messages into agent context ────────
    // If other agents have sent messages to this agent, include them
    // so the LLM can act on inter-agent communication.
    const pendingMessages = agentMessageBus.getInbox(agentId)
    let busContext = ''
    if (pendingMessages.length > 0) {
      const formatted = pendingMessages.map(m =>
        `[${m.type}] from ${m.from}: ${m.payload.summary}`
      ).join('\n')
      busContext = `\n[Messages from other agents]\n${formatted}\n`
      // Mark all as read
      for (const m of pendingMessages) agentMessageBus.markRead(m.id)
    }

    // ── Phase 2: Reasoning Engine Pre-Processing ──────────────────────
    // Analyze the task to determine if structured reasoning would help.
    // For complex tasks, run CoT/ToT/GoT before the standard LLM call
    // to produce a richer, more structured prompt.
    let enrichedInput = busContext ? `${input}\n${busContext}` : input
    let reasoningUsed = false

    try {
      const analysis = reasoningEngine.analyzeTask(input)
      console.log(`[Orchestrator] Reasoning analysis: complexity=${analysis.complexity}, strategy=${analysis.suggestedStrategy}, confidence=${analysis.confidence}`)

      // Only apply structured reasoning for moderate+ complexity tasks
      if (analysis.complexity !== 'simple') {
        const llmCall: LLMCallFn = async (prompt: string) => {
          return callAgentLLM(agent, prompt)
        }

        const reasoningResult = await reasoningEngine.execute(input, llmCall, {
          ...DEFAULT_REASONING_CONFIG,
          enableReflection: analysis.complexity === 'complex',
        })

        // Prepend reasoning conclusion to the input for a richer final LLM call
        if (reasoningResult.conclusion) {
          enrichedInput = `
[Structured Reasoning — ${analysis.suggestedStrategy}]
${reasoningResult.conclusion}
Confidence: ${reasoningResult.confidence.toFixed(2)}

[Original Task]
${input}
          `.trim()
          reasoningUsed = true
          console.log(`[Orchestrator] Reasoning engine enriched input (strategy=${analysis.suggestedStrategy}, confidence=${reasoningResult.confidence.toFixed(2)})`)
        }
      }
    } catch (err) {
      console.warn('[Orchestrator] Reasoning engine skipped:', (err as Error).message)
      // Fall through to standard LLM call with original input
    }

    // ── Phase 2b: Smart Model Router ──────────────────────────────────
    // Use task analysis to auto-select the cheapest capable model.
    // This replaces hardcoded preferred→fallback logic.
    let routedProviderId: string | undefined
    let routedModelId: string | undefined

    try {
      const analysis = reasoningEngine.analyzeTask(input)
      const routingCtx: RoutingContext = {
        preferredProvider: agent.preferredModel ? inferProvider(agent.preferredModel) : undefined,
        preferredModel: agent.preferredModel,
        hasVision: false,
        needsTools: false,
        estimatedInputTokens: enrichedInput.length / 4,
        estimatedOutputTokens: Math.min(agent.tokenBudget, 2000),
      }

      const routingDecision = await modelRouter.route(analysis, routingCtx)
      routedProviderId = routingDecision.providerId
      routedModelId = routingDecision.modelId
      console.log(`[Orchestrator] Model router: ${routedModelId} (${routedProviderId}), score=${routingDecision.score.toFixed(3)}, cost=$${routingDecision.estimatedCost.toFixed(6)}, reason="${routingDecision.reason}"`)
    } catch (err) {
      console.warn('[Orchestrator] Model router skipped:', (err as Error).message)
      // Fall through to existing model selection
    }

    // ── Phase 2c: Ensemble Engine (Multi-Model Consensus) ──────────────
    // If the agent has multiple model preferences, use ensemble for consensus.
    // Otherwise, use the routed model or fall back to callAgentLLM.
    let llmResponse: string

    const ensembleModels = buildEnsembleModels(agent)

    if (ensembleModels.length >= 2) {
      try {
        const chatRequest: ChatRequest = {
          messages: [
            { role: 'system', content: agent.systemPrompt },
            { role: 'user', content: enrichedInput },
          ],
          maxTokens: agent.tokenBudget,
          temperature: 0.7,
        }

        const lookupProvider = (providerId: string) => providerRegistry.get(providerId)

        const ensembleResult = await ensembleEngine.execute(
          chatRequest,
          { models: ensembleModels, maxBudgetTokens: agent.tokenBudget * ensembleModels.length },
          lookupProvider,
        )

        llmResponse = ensembleResult.selectedCandidate.response.content
        console.log(`[Orchestrator] Ensemble completed: strategy=${ensembleResult.strategy}, consensus=${ensembleResult.consensus.toFixed(2)}, models=${ensembleResult.allCandidates.length}`)
      } catch (err) {
        console.warn('[Orchestrator] Ensemble engine failed, falling back to routed model:', (err as Error).message)
        llmResponse = await callWithRoutedModel(agent, enrichedInput, routedProviderId, routedModelId)
      }
    } else {
      // Single-model path — use routed model if available
      llmResponse = await callWithRoutedModel(agent, enrichedInput, routedProviderId, routedModelId)
    }

    if (reasoningUsed) {
      auditLog.logAction({ taskId, agentId, action: 'reasoning_applied', target: null, reversible: false, snapshotId: null, details: { runId } })
    }

    // Parse the LLM response into our AgentMessage format
    const agentMessage = parseAgentResponse(agent, taskId, llmResponse)

    // Update agent status
    agentRegistry.updateAgentStatus(agentId, 'idle')

    // Log agent run completion
    auditLog.logAction({ taskId, agentId, action: 'agent_run_completed', target: null, reversible: false, snapshotId: null, details: { runId, summary: agentMessage.payload.summary?.slice(0, 200) } })

    // Remove from active sessions
    activeAgentSessions.delete(agentId)

    // Emit event
    emitEvent('agent:output', {
      agentId,
      taskId,
      message: agentMessage,
    })

    return agentMessage
  } catch (error) {
    console.error(`[Orchestrator] Agent execution failed: ${agentId}`, error)
    agentRegistry.updateAgentStatus(agentId, 'error')
    activeAgentSessions.delete(agentId)

    // Return error message instead of throwing — allows task to fail gracefully
    const errorMessage: AgentMessage = {
      from: agentId,
      to: 'lead',
      type: 'error',
      taskId,
      payload: {
        summary: `Agent ${agent.name} failed: ${(error as Error).message}`,
        confidence: 0,
        needsReview: true,
      },
      timestamp: Date.now(),
    }
    emitEvent('agent:error', { agentId, taskId, error: (error as Error).message })
    return errorMessage
  }
}

/**
 * Build ensemble model specs from an agent's preferred + fallback models.
 * Returns 2+ specs if both models resolve to different providers, otherwise empty
 * (which signals the caller to use the standard single-model path).
 */
function buildEnsembleModels(agent: AgentDefinition): EnsembleModelSpec[] {
  const models: EnsembleModelSpec[] = []

  const parseModel = (modelId: string, role: 'primary' | 'secondary'): EnsembleModelSpec | null => {
    const [providerId, model] = modelId.includes('/')
      ? modelId.split('/')
      : [inferProvider(modelId), modelId]

    // Verify provider exists
    const provider = providerRegistry.get(providerId)
    if (!provider || !provider.isAvailable()) return null

    return {
      providerId,
      model,
      role,
      weight: role === 'primary' ? 1.0 : 0.8,
      costTier: inferCostTier(modelId),
    }
  }

  const primary = parseModel(agent.preferredModel, 'primary')
  if (primary) models.push(primary)

  if (agent.fallbackModel && agent.fallbackModel !== agent.preferredModel) {
    const secondary = parseModel(agent.fallbackModel, 'secondary')
    if (secondary) models.push(secondary)
  }

  return models
}

/**
 * Infer provider from model name (same heuristic as provider-bridge).
 */
function inferProvider(modelId: string): string {
  const lower = modelId.toLowerCase()
  if (lower.includes('gpt') || lower.includes('o4') || lower.includes('o3')) return 'openai'
  if (lower.includes('claude')) return 'anthropic'
  if (lower.includes('gemini')) return 'gemini'
  return 'ollama'
}

/**
 * Infer cost tier from model name for ensemble weighting.
 */
function inferCostTier(modelId: string): 'cheap' | 'medium' | 'expensive' {
  const lower = modelId.toLowerCase()
  if (lower.includes('haiku') || lower.includes('mini') || lower.includes('flash')) return 'cheap'
  if (lower.includes('opus') || lower.includes('gpt-4') || lower.includes('o3')) return 'expensive'
  return 'medium'
}

/**
 * Call LLM using the smart-routed model, falling back to default callAgentLLM.
 */
async function callWithRoutedModel(
  agent: AgentDefinition,
  input: string,
  routedProviderId?: string,
  routedModelId?: string,
): Promise<string> {
  // If router provided a model, try to call it directly via the provider
  if (routedProviderId && routedModelId) {
    try {
      const provider = providerRegistry.get(routedProviderId)
      if (provider) {
        const response = await provider.chat({
          model: routedModelId,
          messages: [
            { role: 'system', content: agent.systemPrompt },
            { role: 'user', content: input },
          ],
          maxTokens: agent.tokenBudget,
          temperature: 0.7,
        })
        return response.content
      }
    } catch (err) {
      console.warn(`[Orchestrator] Routed model ${routedModelId} failed, falling back:`, (err as Error).message)
    }
  }

  // Fallback to original callAgentLLM
  return callAgentLLM(agent, input)
}

/**
 * Parse raw LLM text response into structured AgentMessage
 */
function parseAgentResponse(agent: any, taskId: string, rawResponse: string): AgentMessage {
  // Try to extract structured data if the LLM returned JSON
  let summary = rawResponse
  let artifacts: Array<{ name: string; type: string; content: string }> = []
  let nextSteps: string[] = []
  let confidence = 0.8

  try {
    // Check if the response contains a JSON block
    const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1])
      summary = parsed.summary || parsed.result || rawResponse
      artifacts = parsed.artifacts || []
      nextSteps = parsed.nextSteps || parsed.next_steps || []
      confidence = parsed.confidence || 0.8
    } else {
      // Plain text response — use first line as summary, rest as artifact
      const lines = rawResponse.split('\n')
      summary = lines[0].slice(0, 200)
      if (rawResponse.length > 200) {
        artifacts = [{
          name: 'response.md',
          type: 'text',
          content: rawResponse,
        }]
      }
    }
  } catch {
    // JSON parse failed — use raw response as-is
    summary = rawResponse.slice(0, 200)
    if (rawResponse.length > 200) {
      artifacts = [{
        name: 'response.md',
        type: 'text',
        content: rawResponse,
      }]
    }
  }

  return {
    from: agent.id,
    to: 'lead',
    type: 'result',
    taskId,
    payload: {
      summary: `[${agent.name}] ${summary}`,
      artifacts,
      filesAccessed: [],
      filesModified: [],
      nextSteps,
      confidence,
      needsReview: confidence < 0.7,
    },
    timestamp: Date.now(),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MESSAGE HANDLING & HANDOFFS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Record an agent handoff
 */
export function recordHandoff(from: string, to: string, taskId: string, summary: string): void {
  const handoffId = `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Log handoff in audit log
  auditLog.logAction({ taskId, agentId: from, action: 'agent_handoff', target: null, reversible: false, snapshotId: null, details: { handoffId, from, to, summary } })

  // Add task event
  taskManager.addTaskEvent(taskId, 'agent_handoff', from, {
    from,
    to,
    summary,
  })

  console.log(`[Orchestrator] Handoff: ${from} → ${to} (${summary.slice(0, 50)}...)`)
  emitEvent('agent:handoff', { from, to, taskId, summary })
}

/**
 * Get all messages for a task
 */
export function getTaskMessages(taskId: string): AgentMessage[] {
  const events = taskManager.getTaskEvents(taskId)
  return events
    .filter(e => e.eventType === 'agent_run' || e.eventType === 'agent_handoff')
    .map(e => ({
      from: e.agentId || 'system',
      to: 'lead',
      type: 'result' as const,
      taskId,
      payload: e.data || {},
      timestamp: e.timestamp,
    }))
}

// ─────────────────────────────────────────────────────────────────────────
// QUEUE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────

/**
 * Queue a task for later execution
 */
export function queueTask(taskId: string): void {
  const task = taskManager.getTask(taskId)
  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  taskQueue.push(taskId)
  console.log(`[Orchestrator] Task queued: ${taskId} (queue size: ${taskQueue.length})`)
  emitEvent('task:queued', { taskId, queueSize: taskQueue.length })
}

/**
 * Get the current task queue
 */
export function getQueue(): string[] {
  return [...taskQueue]
}

/**
 * Process the next task in queue
 */
export async function processQueue(): Promise<void> {
  // For solo mode: process sequentially
  if (currentMode === 'solo') {
    if (activeAgentSessions.size > 0) {
      console.log('[Orchestrator] Active agents exist, deferring queue processing')
      return
    }

    if (taskQueue.length === 0) {
      console.log('[Orchestrator] Task queue is empty')
      return
    }

    const nextTaskId = taskQueue.shift()!
    console.log(`[Orchestrator] Processing next task from queue: ${nextTaskId}`)
    await executeTask(nextTaskId)
    return
  }

  // For team mode: process up to 3 concurrent tasks
  if (currentMode === 'team') {
    const maxConcurrent = 3
    const concurrentCount = activeAgentSessions.size

    if (concurrentCount >= maxConcurrent) {
      console.log(`[Orchestrator] Max concurrent tasks (${maxConcurrent}) reached`)
      return
    }

    const tasksToStart = Math.min(maxConcurrent - concurrentCount, taskQueue.length)
    for (let i = 0; i < tasksToStart; i++) {
      const nextTaskId = taskQueue.shift()!
      console.log(`[Orchestrator] Starting task from queue: ${nextTaskId}`)
      executeTask(nextTaskId).catch(err => console.error('[Orchestrator] Queue task failed:', err))
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// TASK CONTROL
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cancel a task
 */
export function cancelTask(taskId: string): void {
  const task = taskManager.getTask(taskId)
  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  taskManager.cancelTask(taskId)
  console.log(`[Orchestrator] Task cancelled: ${taskId}`)
  emitEvent('task:cancelled-by-orchestrator', { taskId })
}

/**
 * Pause a task
 */
export function pauseTask(taskId: string): void {
  const task = taskManager.getTask(taskId)
  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  taskManager.pauseTask(taskId)
  console.log(`[Orchestrator] Task paused: ${taskId}`)
  emitEvent('task:paused-by-orchestrator', { taskId })
}

/**
 * Resume a paused task
 */
export async function resumeTask(taskId: string): Promise<void> {
  const task = taskManager.getTask(taskId)
  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  if (task.status !== 'paused') {
    throw new Error(`Task is not paused: ${taskId}`)
  }

  taskManager.resumeTask(taskId)
  console.log(`[Orchestrator] Task resumed: ${taskId}`)

  // Re-execute the task
  await executeTask(taskId)
}

/**
 * Submit a task for orchestration
 */
export function submitTask(config: { title: string; description: string; projectId?: string; mode: ExecutionMode }): any {
  const task = taskManager.createTask({
    title: config.title,
    description: config.description,
    projectId: config.projectId,
    folderScope: [],
  })
  return task
}

// ─────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────

export default {
  setMode,
  getMode,
  getState,
  analyzeComplexity,
  decomposeTask,
  executeTask,
  queueTask,
  getQueue,
  processQueue,
  cancelTask,
  pauseTask,
  resumeTask,
  recordHandoff,
  getTaskMessages,
  submitTask,
  messageBus: agentMessageBus,
}
