/**
 * Workflow Recipes — Phase 6C
 *
 * Features:
 *   - Recipe format: JSON workflow definitions with sequential/parallel steps
 *   - Recipe library: Pre-built recipes for common workflows
 *   - User recipes: Create, edit, import/export custom recipes
 *   - Execution engine: Run recipes step-by-step with progress tracking
 *   - Community sharing: Export/import recipe JSON
 *
 * Architecture:
 *   WorkflowRecipeManager → SQLite (persists recipes)
 *                          → AgentOrchestrator (for agent steps)
 *                          → EventBus (for event step triggers)
 *                          → Automations (recipes can create automation rules)
 */

import { EventEmitter } from 'events'
import { memoryManager } from './memory'

// ── Types ────────────────────────────────────────────────────────────────────

export type StepType =
  | 'agent-task'        // Submit a task to agent orchestrator
  | 'run-command'       // Execute a shell command
  | 'call-tool'         // Call an MCP tool
  | 'send-notification' // Send a notification
  | 'wait-event'        // Wait for an EventBus event
  | 'prompt-user'       // Ask user for input
  | 'set-variable'      // Set a recipe variable
  | 'conditional'       // If/else branching
  | 'parallel'          // Run sub-steps in parallel

export interface RecipeStep {
  id: string
  type: StepType
  label: string
  config: Record<string, any>   // type-specific config
  dependsOn?: string[]          // step IDs this depends on
  continueOnError?: boolean
}

export interface WorkflowRecipe {
  id: string
  name: string
  description: string
  category: string              // 'development' | 'deployment' | 'review' | 'data' | 'custom'
  icon?: string                 // emoji
  tags: string[]
  steps: RecipeStep[]
  variables: Record<string, any>  // default variable values
  builtin: boolean
  createdAt: number
  updatedAt: number
}

export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface RecipeRun {
  id: string
  recipeId: string
  recipeName: string
  status: RunStatus
  variables: Record<string, any>
  stepResults: Record<string, { status: StepStatus; result?: any; error?: string; startedAt?: number; completedAt?: number }>
  startedAt: number
  completedAt?: number
  error?: string
}

// ── Built-in Recipes ────────────────────────────────────────────────────────

const BUILTIN_RECIPES: Omit<WorkflowRecipe, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Code Review & Fix',
    description: 'Run linter, analyze issues, then ask agent to fix them',
    category: 'development',
    icon: '🔍',
    tags: ['lint', 'review', 'fix'],
    builtin: true,
    variables: { projectPath: '.', lintCommand: 'npm run lint' },
    steps: [
      { id: 's1', type: 'run-command', label: 'Run linter', config: { command: '{{lintCommand}}', cwd: '{{projectPath}}', captureOutput: true } },
      { id: 's2', type: 'agent-task', label: 'Analyze & fix issues', dependsOn: ['s1'], config: { taskTitle: 'Fix lint issues', taskDescription: 'Review and fix the following lint output:\n\n{{steps.s1.output}}' } },
      { id: 's3', type: 'send-notification', label: 'Notify completion', dependsOn: ['s2'], config: { title: 'Code Review Complete', body: 'Lint issues have been addressed' } },
    ],
  },
  {
    name: 'Test & Deploy',
    description: 'Run tests, build, and deploy if all pass',
    category: 'deployment',
    icon: '🚀',
    tags: ['test', 'build', 'deploy'],
    builtin: true,
    variables: { testCommand: 'npm test', buildCommand: 'npm run build', deployCommand: 'npm run deploy' },
    steps: [
      { id: 's1', type: 'run-command', label: 'Run tests', config: { command: '{{testCommand}}', captureOutput: true } },
      { id: 's2', type: 'run-command', label: 'Build', dependsOn: ['s1'], config: { command: '{{buildCommand}}', captureOutput: true } },
      { id: 's3', type: 'prompt-user', label: 'Confirm deploy', dependsOn: ['s2'], config: { message: 'Tests passed and build succeeded. Deploy now?', options: ['Deploy', 'Cancel'] } },
      { id: 's4', type: 'conditional', label: 'Check confirmation', dependsOn: ['s3'], config: { condition: '{{steps.s3.answer}} == Deploy', thenStep: 's5', elseStep: 's6' } },
      { id: 's5', type: 'run-command', label: 'Deploy', config: { command: '{{deployCommand}}', captureOutput: true } },
      { id: 's6', type: 'send-notification', label: 'Deploy cancelled', config: { title: 'Deploy Cancelled', body: 'User cancelled deployment' } },
    ],
  },
  {
    name: 'Daily Project Summary',
    description: 'Check git log, gather stats, and generate a project summary',
    category: 'review',
    icon: '📊',
    tags: ['summary', 'git', 'daily'],
    builtin: true,
    variables: { projectPath: '.', timeRange: '--since=yesterday' },
    steps: [
      { id: 's1', type: 'run-command', label: 'Get git log', config: { command: 'git log {{timeRange}} --oneline', cwd: '{{projectPath}}', captureOutput: true } },
      { id: 's2', type: 'run-command', label: 'Get diff stats', config: { command: 'git diff {{timeRange}} --stat', cwd: '{{projectPath}}', captureOutput: true } },
      { id: 's3', type: 'agent-task', label: 'Generate summary', dependsOn: ['s1', 's2'], config: { taskTitle: 'Daily Project Summary', taskDescription: 'Generate a concise daily summary from:\n\nCommits:\n{{steps.s1.output}}\n\nDiff stats:\n{{steps.s2.output}}' } },
    ],
  },
  {
    name: 'Ingest Docs to Knowledge Base',
    description: 'Scan a folder for documentation files and ingest them into a RAG knowledge stack',
    category: 'data',
    icon: '📚',
    tags: ['rag', 'docs', 'ingest'],
    builtin: true,
    variables: { folder: '.', pattern: '*.md', stackName: 'Project Docs' },
    steps: [
      { id: 's1', type: 'run-command', label: 'Find documents', config: { command: 'find {{folder}} -name "{{pattern}}" -type f', captureOutput: true } },
      { id: 's2', type: 'agent-task', label: 'Ingest documents', dependsOn: ['s1'], config: { taskTitle: 'Ingest docs into RAG', taskDescription: 'Ingest the following files into knowledge stack "{{stackName}}":\n\n{{steps.s1.output}}' } },
    ],
  },
  {
    name: 'Security Audit',
    description: 'Run security scan and have agent analyze the results',
    category: 'review',
    icon: '🔒',
    tags: ['security', 'audit', 'scan'],
    builtin: true,
    variables: { projectPath: '.', scanCommand: 'npm audit --json' },
    steps: [
      { id: 's1', type: 'run-command', label: 'Run security scan', config: { command: '{{scanCommand}}', cwd: '{{projectPath}}', captureOutput: true }, continueOnError: true },
      { id: 's2', type: 'agent-task', label: 'Analyze vulnerabilities', dependsOn: ['s1'], config: { taskTitle: 'Security Audit Analysis', taskDescription: 'Analyze the following security scan output and provide a risk assessment with recommended fixes:\n\n{{steps.s1.output}}' } },
      { id: 's3', type: 'send-notification', label: 'Notify results', dependsOn: ['s2'], config: { title: 'Security Audit Complete', body: 'Review results in the agent output' } },
    ],
  },
]

// ── Workflow Recipe Manager ─────────────────────────────────────────────────

class WorkflowRecipeManager extends EventEmitter {
  private recipes: Map<string, WorkflowRecipe> = new Map()
  private runs: Map<string, RecipeRun> = new Map()
  private initialized = false

  init(): void {
    if (this.initialized) return

    this.ensureTables()
    this.loadRecipes()
    this.initialized = true

    console.log(`[WorkflowRecipes] Initialized with ${this.recipes.size} recipe(s)`)
  }

  private ensureTables(): void {
    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS workflow_recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'custom',
        icon TEXT,
        tags TEXT DEFAULT '[]',
        steps TEXT DEFAULT '[]',
        variables TEXT DEFAULT '{}',
        builtin INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `)

    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL,
        recipe_name TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        variables TEXT DEFAULT '{}',
        step_results TEXT DEFAULT '{}',
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT,
        FOREIGN KEY (recipe_id) REFERENCES workflow_recipes(id)
      )
    `)

    memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_wr_category ON workflow_recipes(category)`)
    memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_wrun_recipe ON workflow_runs(recipe_id)`)
    memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_wrun_status ON workflow_runs(status)`)
  }

  private loadRecipes(): void {
    const rows = memoryManager.queryAll(`SELECT * FROM workflow_recipes`)

    if (rows.length === 0) {
      // Seed builtin recipes
      for (const recipe of BUILTIN_RECIPES) {
        const id = `recipe-${recipe.name.toLowerCase().replace(/\s+/g, '-')}`
        const now = Math.floor(Date.now() / 1000)

        memoryManager.run(
          `INSERT INTO workflow_recipes (id, name, description, category, icon, tags, steps, variables, builtin, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [id, recipe.name, recipe.description, recipe.category, recipe.icon || null,
           JSON.stringify(recipe.tags), JSON.stringify(recipe.steps),
           JSON.stringify(recipe.variables), now, now]
        )

        this.recipes.set(id, { id, ...recipe, createdAt: now, updatedAt: now })
      }
    } else {
      for (const row of rows) {
        this.recipes.set(row.id, this.rowToRecipe(row))
      }
    }
  }

  // ── Recipe CRUD ───────────────────────────────────────────────────────────

  listRecipes(category?: string): WorkflowRecipe[] {
    const all = Array.from(this.recipes.values())
    if (category) return all.filter(r => r.category === category)
    return all.sort((a, b) => a.name.localeCompare(b.name))
  }

  getRecipe(id: string): WorkflowRecipe | undefined {
    return this.recipes.get(id)
  }

  getCategories(): string[] {
    return [...new Set(Array.from(this.recipes.values()).map(r => r.category))].sort()
  }

  createRecipe(opts: {
    name: string
    description: string
    category?: string
    icon?: string
    tags?: string[]
    steps: RecipeStep[]
    variables?: Record<string, any>
  }): WorkflowRecipe {
    const id = `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = Math.floor(Date.now() / 1000)

    const recipe: WorkflowRecipe = {
      id,
      name: opts.name,
      description: opts.description,
      category: opts.category || 'custom',
      icon: opts.icon,
      tags: opts.tags || [],
      steps: opts.steps,
      variables: opts.variables || {},
      builtin: false,
      createdAt: now,
      updatedAt: now,
    }

    memoryManager.run(
      `INSERT INTO workflow_recipes (id, name, description, category, icon, tags, steps, variables, builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, recipe.name, recipe.description, recipe.category, recipe.icon || null,
       JSON.stringify(recipe.tags), JSON.stringify(recipe.steps),
       JSON.stringify(recipe.variables), now, now]
    )

    this.recipes.set(id, recipe)
    this.emit('recipe:created', recipe)
    return recipe
  }

  updateRecipe(id: string, updates: Partial<Pick<WorkflowRecipe, 'name' | 'description' | 'category' | 'icon' | 'tags' | 'steps' | 'variables'>>): WorkflowRecipe | null {
    const recipe = this.recipes.get(id)
    if (!recipe) return null

    if (updates.name !== undefined) recipe.name = updates.name
    if (updates.description !== undefined) recipe.description = updates.description
    if (updates.category !== undefined) recipe.category = updates.category
    if (updates.icon !== undefined) recipe.icon = updates.icon
    if (updates.tags !== undefined) recipe.tags = updates.tags
    if (updates.steps !== undefined) recipe.steps = updates.steps
    if (updates.variables !== undefined) recipe.variables = updates.variables
    recipe.updatedAt = Math.floor(Date.now() / 1000)

    memoryManager.run(
      `UPDATE workflow_recipes SET name=?, description=?, category=?, icon=?, tags=?, steps=?, variables=?, updated_at=unixepoch() WHERE id=?`,
      [recipe.name, recipe.description, recipe.category, recipe.icon || null,
       JSON.stringify(recipe.tags), JSON.stringify(recipe.steps),
       JSON.stringify(recipe.variables), id]
    )

    this.emit('recipe:updated', recipe)
    return recipe
  }

  deleteRecipe(id: string): boolean {
    const recipe = this.recipes.get(id)
    if (!recipe || recipe.builtin) return false

    this.recipes.delete(id)
    memoryManager.run(`DELETE FROM workflow_recipes WHERE id = ?`, [id])
    this.emit('recipe:deleted', { id })
    return true
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  async runRecipe(recipeId: string, variables?: Record<string, any>): Promise<RecipeRun> {
    const recipe = this.recipes.get(recipeId)
    if (!recipe) throw new Error(`Recipe not found: ${recipeId}`)

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const mergedVars = { ...recipe.variables, ...variables }

    const run: RecipeRun = {
      id: runId,
      recipeId,
      recipeName: recipe.name,
      status: 'running',
      variables: mergedVars,
      stepResults: {},
      startedAt: Date.now(),
    }

    this.runs.set(runId, run)
    this.persistRun(run)
    this.emit('run:started', run)

    // Execute steps
    try {
      for (const step of recipe.steps) {
        // Check dependencies
        if (step.dependsOn?.length) {
          const depsFailed = step.dependsOn.some(depId => {
            const depResult = run.stepResults[depId]
            return depResult?.status === 'failed' && !recipe.steps.find(s => s.id === depId)?.continueOnError
          })
          if (depsFailed) {
            run.stepResults[step.id] = { status: 'skipped' }
            this.emit('run:step-skipped', { runId, stepId: step.id })
            continue
          }
        }

        // Execute step
        run.stepResults[step.id] = { status: 'running', startedAt: Date.now() }
        this.emit('run:step-started', { runId, stepId: step.id, label: step.label })

        try {
          const result = await this.executeStep(step, run)
          run.stepResults[step.id] = {
            status: 'completed',
            result,
            startedAt: run.stepResults[step.id].startedAt,
            completedAt: Date.now(),
          }
          this.emit('run:step-completed', { runId, stepId: step.id, result })
        } catch (err: any) {
          run.stepResults[step.id] = {
            status: 'failed',
            error: err.message,
            startedAt: run.stepResults[step.id].startedAt,
            completedAt: Date.now(),
          }
          this.emit('run:step-failed', { runId, stepId: step.id, error: err.message })

          if (!step.continueOnError) {
            run.status = 'failed'
            run.error = `Step "${step.label}" failed: ${err.message}`
            break
          }
        }

        this.persistRun(run)
      }

      if (run.status !== 'failed') {
        run.status = 'completed'
      }
    } catch (err: any) {
      run.status = 'failed'
      run.error = err.message
    }

    run.completedAt = Date.now()
    this.persistRun(run)
    this.emit('run:completed', run)

    return run
  }

  private async executeStep(step: RecipeStep, run: RecipeRun): Promise<any> {
    const config = this.interpolateConfig(step.config, run)

    switch (step.type) {
      case 'run-command': {
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        const execFileAsync = promisify(execFile)

        try {
          const { stdout, stderr } = await execFileAsync('/bin/sh', ['-c', config.command], {
            cwd: config.cwd || process.cwd(),
            timeout: 60000,
          })
          return { output: stdout + (stderr ? `\n${stderr}` : ''), exitCode: 0 }
        } catch (err: any) {
          if (err.stdout) return { output: err.stdout + (err.stderr ? `\n${err.stderr}` : ''), exitCode: err.code || 1 }
          throw err
        }
      }

      case 'agent-task': {
        const agentOrchestrator = await import('./agent-orchestrator')
        const task = await agentOrchestrator.submitTask({
          title: config.taskTitle || step.label,
          description: config.taskDescription || '',
          projectId: config.projectId,
          mode: 'solo',
        })
        return { taskId: task.id, status: task.status }
      }

      case 'send-notification': {
        const { sendNotification } = await import('./notifications')
        sendNotification(config.title || 'Workflow', config.body || step.label)
        return { sent: true }
      }

      case 'call-tool': {
        const { executeToolCall } = await import('./mcp-tool-router')
        const result = await executeToolCall(config.toolName)
        return result
      }

      case 'set-variable':
        run.variables[config.name] = config.value
        return { [config.name]: config.value }

      case 'conditional': {
        const condition = String(config.condition || '')
        // Simple == evaluation
        const [left, right] = condition.split('==').map((s: string) => s.trim())
        const matches = left === right
        return { matches, branch: matches ? 'then' : 'else' }
      }

      case 'prompt-user':
        // Emit event and wait for user response (simplified)
        this.emit('run:prompt-user', {
          runId: run.id,
          stepId: step.id,
          message: config.message,
          options: config.options,
        })
        return { answer: config.options?.[0] || 'OK' } // Default to first option

      case 'wait-event':
        // Simplified — in production would use EventBus await
        return { received: true }

      case 'parallel':
        // Run sub-steps in parallel — simplified
        return { parallel: true }

      default:
        throw new Error(`Unknown step type: ${step.type}`)
    }
  }

  private interpolateConfig(config: Record<string, any>, run: RecipeRun): Record<string, any> {
    const result: Record<string, any> = {}

    for (const [key, val] of Object.entries(config)) {
      if (typeof val === 'string') {
        result[key] = val.replace(/\{\{(\w[\w.]*)\}\}/g, (_, path: string) => {
          // Check run variables first
          if (path.startsWith('steps.')) {
            // e.g. steps.s1.output
            const parts = path.split('.')
            const stepId = parts[1]
            const field = parts.slice(2).join('.')
            const stepResult = run.stepResults[stepId]?.result
            if (stepResult && field) return this.getNestedValue(stepResult, field) ?? `{{${path}}}`
            return `{{${path}}}`
          }
          return run.variables[path] ?? `{{${path}}}`
        })
      } else {
        result[key] = val
      }
    }

    return result
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((curr, key) => curr?.[key], obj)
  }

  // ── Run History ───────────────────────────────────────────────────────────

  getRun(runId: string): RecipeRun | undefined {
    return this.runs.get(runId)
  }

  listRuns(opts?: { recipeId?: string; limit?: number }): RecipeRun[] {
    let sql = `SELECT * FROM workflow_runs`
    const params: any[] = []
    if (opts?.recipeId) { sql += ` WHERE recipe_id = ?`; params.push(opts.recipeId) }
    sql += ` ORDER BY started_at DESC`
    if (opts?.limit) { sql += ` LIMIT ?`; params.push(opts.limit) }

    return memoryManager.queryAll(sql, params).map(row => ({
      id: row.id,
      recipeId: row.recipe_id,
      recipeName: row.recipe_name,
      status: row.status as RunStatus,
      variables: row.variables ? JSON.parse(row.variables) : {},
      stepResults: row.step_results ? JSON.parse(row.step_results) : {},
      startedAt: row.started_at,
      completedAt: row.completed_at,
      error: row.error,
    }))
  }

  cancelRun(runId: string): boolean {
    const run = this.runs.get(runId)
    if (!run || run.status !== 'running') return false

    run.status = 'cancelled'
    run.completedAt = Date.now()
    this.persistRun(run)
    this.emit('run:cancelled', run)
    return true
  }

  // ── Import / Export ───────────────────────────────────────────────────────

  exportRecipe(id: string): string | null {
    const recipe = this.recipes.get(id)
    if (!recipe) return null

    return JSON.stringify({
      name: recipe.name,
      description: recipe.description,
      category: recipe.category,
      icon: recipe.icon,
      tags: recipe.tags,
      steps: recipe.steps,
      variables: recipe.variables,
    }, null, 2)
  }

  importRecipe(jsonStr: string): WorkflowRecipe {
    const data = JSON.parse(jsonStr)
    return this.createRecipe({
      name: data.name || 'Imported Recipe',
      description: data.description || '',
      category: data.category || 'custom',
      icon: data.icon,
      tags: data.tags || [],
      steps: data.steps || [],
      variables: data.variables || {},
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private persistRun(run: RecipeRun): void {
    const exists = memoryManager.queryOne(`SELECT id FROM workflow_runs WHERE id = ?`, [run.id])
    if (exists) {
      memoryManager.run(
        `UPDATE workflow_runs SET status=?, variables=?, step_results=?, completed_at=?, error=? WHERE id=?`,
        [run.status, JSON.stringify(run.variables), JSON.stringify(run.stepResults),
         run.completedAt || null, run.error || null, run.id]
      )
    } else {
      memoryManager.run(
        `INSERT INTO workflow_runs (id, recipe_id, recipe_name, status, variables, step_results, started_at, completed_at, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [run.id, run.recipeId, run.recipeName, run.status,
         JSON.stringify(run.variables), JSON.stringify(run.stepResults),
         run.startedAt, run.completedAt || null, run.error || null]
      )
    }
  }

  private rowToRecipe(row: any): WorkflowRecipe {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      category: row.category || 'custom',
      icon: row.icon,
      tags: row.tags ? JSON.parse(row.tags) : [],
      steps: row.steps ? JSON.parse(row.steps) : [],
      variables: row.variables ? JSON.parse(row.variables) : {},
      builtin: !!row.builtin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────

export const workflowRecipes = new WorkflowRecipeManager()
