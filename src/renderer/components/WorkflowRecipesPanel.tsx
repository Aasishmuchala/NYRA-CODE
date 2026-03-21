/**
 * WorkflowRecipesPanel — Multi-Agent Workflow Recipe Browser & Runner
 *
 * Features:
 *   - Browse built-in and custom recipes by category
 *   - Configure variables before running
 *   - Run recipes with live step-by-step progress
 *   - View run history
 *   - Import/export recipes as JSON
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  Play, Square, ChevronDown, ChevronRight, Search,
  Loader2, CheckCircle2, XCircle, AlertTriangle, Clock,
  Download, Trash2, RefreshCw, Layers,
  ArrowRight, Zap, Terminal, MessageSquare, Bell,
  GitBranch, Settings2,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface RecipeStep {
  id: string
  type: string
  label: string
  config: Record<string, any>
  dependsOn?: string[]
  continueOnError?: boolean
}

interface WorkflowRecipe {
  id: string
  name: string
  description: string
  category: string
  icon?: string
  tags: string[]
  steps: RecipeStep[]
  variables: Record<string, any>
  builtin: boolean
  createdAt: number
  updatedAt: number
}

interface RecipeRun {
  id: string
  recipeId: string
  recipeName: string
  status: string
  variables: Record<string, any>
  stepResults: Record<string, { status: string; result?: any; error?: string; startedAt?: number; completedAt?: number }>
  startedAt: number
  completedAt?: number
  error?: string
}

// ── Section Toggle ───────────────────────────────────────────────────────

const Section: React.FC<{
  title: string
  icon: React.ReactNode
  badge?: string | number
  defaultOpen?: boolean
  children: React.ReactNode
}> = ({ title, icon, badge, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-nyra-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-warm-200 hover:bg-white/[0.03] transition-colors"
      >
        {open ? <ChevronDown size={14} className="text-warm-400" /> : <ChevronRight size={14} className="text-warm-400" />}
        <span className="text-warm-400">{icon}</span>
        <span className="flex-1 text-left">{title}</span>
        {badge !== undefined && badge !== 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-terra-500/20 text-terra-300">{badge}</span>
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

// ── Step type icon ───────────────────────────────────────────────────────

const StepIcon: React.FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case 'agent-task':        return <Zap size={11} className="text-terra-400" />
    case 'run-command':       return <Terminal size={11} className="text-sage-400" />
    case 'call-tool':         return <Settings2 size={11} className="text-terra-300" />
    case 'send-notification': return <Bell size={11} className="text-gold-400" />
    case 'prompt-user':       return <MessageSquare size={11} className="text-terra-300" />
    case 'conditional':       return <GitBranch size={11} className="text-warm-400" />
    case 'parallel':          return <Layers size={11} className="text-terra-300" />
    default:                  return <ArrowRight size={11} className="text-warm-500" />
  }
}

// ── Step status badge ────────────────────────────────────────────────────

const StepStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'completed': return <CheckCircle2 size={11} className="text-sage-400" />
    case 'running':   return <Loader2 size={11} className="text-terra-400 animate-spin" />
    case 'failed':    return <XCircle size={11} className="text-blush-400" />
    case 'skipped':   return <Clock size={11} className="text-warm-600" />
    default:          return <Clock size={11} className="text-warm-600" />
  }
}

// ── Category colors ──────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  development: 'bg-sage-400/20 text-sage-300',
  deployment: 'bg-terra-500/20 text-terra-300',
  review: 'bg-gold-400/20 text-gold-300',
  data: 'bg-terra-400/20 text-terra-300',
  custom: 'bg-warm-500/20 text-warm-300',
}

// ── Main Panel ───────────────────────────────────────────────────────────

export const WorkflowRecipesPanel: React.FC = () => {
  const [recipes, setRecipes] = useState<WorkflowRecipe[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<WorkflowRecipe | null>(null)
  const [editingVars, setEditingVars] = useState<Record<string, string>>({})
  const [activeRun, setActiveRun] = useState<RecipeRun | null>(null)
  const [runHistory, setRunHistory] = useState<RecipeRun[]>([])
  const [loading, setLoading] = useState(false)

  // ── Load data ──────────────────────────────────────────────────────────

  const refreshRecipes = useCallback(async () => {
    try {
      const [recipeList, cats, runs] = await Promise.all([
        window.nyra.recipes.list(selectedCategory || undefined),
        window.nyra.recipes.categories(),
        window.nyra.recipes.listRuns({ limit: 10 }),
      ])
      setRecipes(recipeList || [])
      setCategories(cats || [])
      setRunHistory(runs || [])
    } catch (err) {
      console.warn('[WorkflowRecipes] Load failed:', err)
    }
  }, [selectedCategory])

  useEffect(() => { refreshRecipes() }, [refreshRecipes])

  // ── Event subscriptions ────────────────────────────────────────────────

  useEffect(() => {
    const cleanups: Array<() => void> = []

    cleanups.push(
      window.nyra.recipes.onRunStarted((data: any) => {
        setActiveRun(prev => prev?.id === data.id ? { ...prev, ...data } : data)
      })
    )
    cleanups.push(
      window.nyra.recipes.onRunCompleted((data: any) => {
        setActiveRun(prev => prev?.id === data.id ? { ...prev, ...data, status: data.status } : prev)
        refreshRecipes()
      })
    )
    cleanups.push(
      window.nyra.recipes.onStepCompleted((data: any) => {
        setActiveRun(prev => {
          if (!prev || prev.id !== data.runId) return prev
          return {
            ...prev,
            stepResults: {
              ...prev.stepResults,
              [data.stepId]: { status: 'completed', result: data.result },
            },
          }
        })
      })
    )
    cleanups.push(
      window.nyra.recipes.onStepFailed((data: any) => {
        setActiveRun(prev => {
          if (!prev || prev.id !== data.runId) return prev
          return {
            ...prev,
            stepResults: {
              ...prev.stepResults,
              [data.stepId]: { status: 'failed', error: data.error },
            },
          }
        })
      })
    )

    return () => { cleanups.forEach(fn => fn()) }
  }, [refreshRecipes])

  // ── Actions ────────────────────────────────────────────────────────────

  const handleSelectRecipe = useCallback((recipe: WorkflowRecipe) => {
    setSelectedRecipe(recipe)
    setEditingVars({ ...Object.fromEntries(Object.entries(recipe.variables).map(([k, v]) => [k, String(v)])) })
  }, [])

  const handleRun = useCallback(async () => {
    if (!selectedRecipe) return
    setLoading(true)
    try {
      const vars = Object.fromEntries(Object.entries(editingVars).map(([k, v]) => [k, v]))
      const run = await window.nyra.recipes.run(selectedRecipe.id, vars)
      setActiveRun(run)
    } catch (err) {
      console.warn('[WorkflowRecipes] Run failed:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedRecipe, editingVars])

  const handleCancel = useCallback(async () => {
    if (!activeRun) return
    await window.nyra.recipes.cancelRun(activeRun.id)
    setActiveRun(prev => prev ? { ...prev, status: 'cancelled' } : null)
  }, [activeRun])

  const handleDelete = useCallback(async (id: string) => {
    await window.nyra.recipes.delete(id)
    if (selectedRecipe?.id === id) setSelectedRecipe(null)
    refreshRecipes()
  }, [selectedRecipe, refreshRecipes])

  const handleExport = useCallback(async (id: string) => {
    const json = await window.nyra.recipes.export(id)
    if (json) {
      navigator.clipboard.writeText(json)
    }
  }, [])

  // ── Filter ─────────────────────────────────────────────────────────────

  const filteredRecipes = recipes.filter(r => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return r.name.toLowerCase().includes(q) ||
             r.description.toLowerCase().includes(q) ||
             r.tags.some(t => t.toLowerCase().includes(q))
    }
    return true
  })

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="h-full flex flex-col bg-nyra-surface text-warm-200 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-nyra-border">
        <Layers size={16} className="text-gold-400" />
        <span className="text-sm font-semibold text-warm-100">Workflow Recipes</span>
        <div className="flex-1" />
        <button
          onClick={refreshRecipes}
          className="p-1 text-warm-500 hover:text-warm-300 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── Search & Category Filter ──────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-nyra-border space-y-2">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-warm-600" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search recipes..."
            className="w-full bg-nyra-bg border border-nyra-border rounded pl-7 pr-2 py-1 text-[11px] text-warm-100 placeholder:text-warm-600 focus:outline-none focus:ring-1 focus:ring-gold-400/40"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-1.5 py-0.5 text-[10px] rounded transition-all ${
              !selectedCategory ? 'bg-terra-500/20 text-terra-300 ring-1 ring-terra-500/30' : 'text-warm-500 hover:text-warm-300'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
              className={`px-1.5 py-0.5 text-[10px] rounded capitalize transition-all ${
                selectedCategory === cat
                  ? `${CATEGORY_COLORS[cat] || CATEGORY_COLORS.custom} ring-1 ring-current/30`
                  : 'text-warm-500 hover:text-warm-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable Content ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Recipe List */}
        <Section title="Recipes" icon={<Layers size={14} />} badge={filteredRecipes.length} defaultOpen={true}>
          {filteredRecipes.length === 0 ? (
            <p className="text-[11px] text-warm-600 italic">No recipes found.</p>
          ) : (
            <div className="space-y-1">
              {filteredRecipes.map(recipe => (
                <button
                  key={recipe.id}
                  onClick={() => handleSelectRecipe(recipe)}
                  className={`w-full text-left p-2 rounded-lg transition-all ${
                    selectedRecipe?.id === recipe.id
                      ? 'bg-terra-500/10 ring-1 ring-terra-500/20'
                      : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{recipe.icon || '⚡'}</span>
                    <span className="text-[11px] font-medium text-warm-200 flex-1">{recipe.name}</span>
                    <span className={`px-1 py-0.5 text-[9px] rounded capitalize ${CATEGORY_COLORS[recipe.category] || CATEGORY_COLORS.custom}`}>
                      {recipe.category}
                    </span>
                  </div>
                  <p className="text-[10px] text-warm-500 mt-0.5 ml-6">{recipe.description}</p>
                  <div className="flex gap-1 mt-1 ml-6">
                    {recipe.tags.slice(0, 4).map((tag, i) => (
                      <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-warm-700/50 text-warm-500">{tag}</span>
                    ))}
                    <span className="text-[9px] text-warm-600 ml-auto">{recipe.steps.length} steps</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Selected Recipe Detail */}
        {selectedRecipe && (
          <Section
            title={selectedRecipe.name}
            icon={<span className="text-sm">{selectedRecipe.icon || '⚡'}</span>}
            defaultOpen={true}
          >
            <div className="space-y-3">
              {/* Steps */}
              <div>
                <span className="text-[10px] text-warm-500 font-medium uppercase tracking-wider">Steps</span>
                <div className="mt-1 space-y-1">
                  {selectedRecipe.steps.map((step, i) => {
                    const stepResult = activeRun?.stepResults?.[step.id]
                    return (
                      <div key={step.id} className="flex items-center gap-2 py-0.5 text-[11px]">
                        <span className="text-warm-600 font-mono w-4 text-right">{i + 1}</span>
                        <StepIcon type={step.type} />
                        <span className="text-warm-300 flex-1 truncate">{step.label}</span>
                        {stepResult && <StepStatusBadge status={stepResult.status} />}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Variables */}
              {Object.keys(selectedRecipe.variables).length > 0 && (
                <div>
                  <span className="text-[10px] text-warm-500 font-medium uppercase tracking-wider">Variables</span>
                  <div className="mt-1 space-y-1.5">
                    {Object.entries(editingVars).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[10px] text-warm-400 font-mono w-24 truncate">{key}</span>
                        <input
                          value={val}
                          onChange={e => setEditingVars(v => ({ ...v, [key]: e.target.value }))}
                          className="flex-1 bg-nyra-bg border border-nyra-border rounded px-1.5 py-0.5 text-[10px] text-warm-200 font-mono focus:outline-none focus:ring-1 focus:ring-terra-500/40"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                {activeRun?.status === 'running' ? (
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-blush-400/20 text-blush-300 hover:bg-blush-400/30 transition-colors"
                  >
                    <Square size={12} /> Stop
                  </button>
                ) : (
                  <button
                    onClick={handleRun}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-terra-500/20 text-terra-300 hover:bg-terra-500/30 disabled:opacity-30 transition-colors"
                  >
                    {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    Run Recipe
                  </button>
                )}
                <button
                  onClick={() => handleExport(selectedRecipe.id)}
                  className="p-1.5 text-warm-500 hover:text-warm-300 transition-colors"
                  title="Copy recipe JSON to clipboard"
                >
                  <Download size={12} />
                </button>
                {!selectedRecipe.builtin && (
                  <button
                    onClick={() => handleDelete(selectedRecipe.id)}
                    className="p-1.5 text-warm-600 hover:text-blush-400 transition-colors"
                    title="Delete recipe"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              {/* Active Run Error */}
              {activeRun?.error && (
                <div className="flex items-start gap-2 p-2 rounded bg-blush-400/10 border border-blush-400/20">
                  <AlertTriangle size={12} className="text-blush-400 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-blush-300 break-words">{activeRun.error}</p>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Run History */}
        <Section title="Run History" icon={<Clock size={14} />} badge={runHistory.length}>
          {runHistory.length === 0 ? (
            <p className="text-[11px] text-warm-600 italic">No runs yet.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {runHistory.map(run => (
                <div key={run.id} className="flex items-center gap-2 py-1 text-[11px]">
                  {run.status === 'completed' ? (
                    <CheckCircle2 size={11} className="text-sage-400 shrink-0" />
                  ) : run.status === 'failed' ? (
                    <XCircle size={11} className="text-blush-400 shrink-0" />
                  ) : run.status === 'running' ? (
                    <Loader2 size={11} className="text-terra-400 animate-spin shrink-0" />
                  ) : (
                    <Clock size={11} className="text-warm-600 shrink-0" />
                  )}
                  <span className="text-warm-500 font-mono shrink-0">{formatTime(run.startedAt)}</span>
                  <span className="text-warm-300 truncate flex-1">{run.recipeName}</span>
                  <span className={`text-[9px] px-1 py-0.5 rounded capitalize ${
                    run.status === 'completed' ? 'bg-sage-400/20 text-sage-300' :
                    run.status === 'failed' ? 'bg-blush-400/20 text-blush-300' :
                    'bg-warm-700/50 text-warm-400'
                  }`}>{run.status}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

      </div>
    </div>
  )
}

export default WorkflowRecipesPanel
