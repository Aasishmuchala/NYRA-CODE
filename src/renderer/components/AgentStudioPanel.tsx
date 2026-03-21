/**
 * AgentStudioPanel — Visual Agent Definition Editor & Team Composer
 *
 * Features:
 *   - Browse all registered agents with live status
 *   - Create new custom agents with full field editor
 *   - Edit agent properties (model, prompt, tools, permissions)
 *   - Duplicate, export, import agents
 *   - Team composer: group agents into teams with role assignment
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, ChevronDown, ChevronRight, Settings2,
  Loader2, Copy, Download, Trash2, RefreshCw,
  Save, X, Shield,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentDefinition {
  id: string
  role: string
  name: string
  description: string
  systemPrompt: string
  preferredModel: string
  fallbackModel: string
  allowedTools: string[]
  maxFolderAccess: string
  canRequestApproval: boolean
  canSpawnSubagents: boolean
  tokenBudget: number
  icon: string
}

interface AgentState {
  id: string
  status: string
  currentTaskId: string | null
  currentAssignment: string | null
  lastActiveAt: number | null
}

type EditorMode = 'browse' | 'create' | 'edit'

const ROLES = ['planner', 'research', 'writer', 'reviewer', 'executor', 'general'] as const
const FOLDER_ACCESS_LEVELS = ['read_only', 'trusted', 'full'] as const
const AGENT_ICONS = ['🧠', '🔍', '✍️', '📋', '⚡', '🤖', '🎨', '📊', '🔒', '🛠️', '📚', '🎯'] as const

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

// ── Status badge ─────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    idle: 'bg-warm-700/50 text-warm-400',
    running: 'bg-terra-500/20 text-terra-300',
    blocked: 'bg-gold-400/20 text-gold-300',
    done: 'bg-sage-400/20 text-sage-300',
    error: 'bg-blush-400/20 text-blush-300',
  }
  return (
    <span className={`px-1 py-0.5 text-[9px] rounded capitalize ${colors[status] || colors.idle}`}>
      {status}
    </span>
  )
}

// ── Form Field ───────────────────────────────────────────────────────────

const Field: React.FC<{
  label: string
  children: React.ReactNode
  hint?: string
}> = ({ label, children, hint }) => (
  <div className="space-y-1">
    <label className="text-[10px] text-warm-500 font-medium uppercase tracking-wider">{label}</label>
    {children}
    {hint && <p className="text-[9px] text-warm-600">{hint}</p>}
  </div>
)

// ── Main Panel ───────────────────────────────────────────────────────────

export const AgentStudioPanel: React.FC = () => {
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [states, setStates] = useState<AgentState[]>([])
  const [mode, setMode] = useState<EditorMode>('browse')
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<AgentDefinition>>({})
  const [saving, setSaving] = useState(false)

  // ── Load data ──────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const [agentList, stateList] = await Promise.all([
        window.nyra.agents.list(),
        window.nyra.agents.states(),
      ])
      setAgents(agentList || [])
      setStates(stateList || [])
    } catch (err) {
      console.warn('[AgentStudio] Load failed:', err)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // ── Actions ────────────────────────────────────────────────────────────

  const startCreate = useCallback(() => {
    setEditDraft({
      role: 'general',
      name: '',
      description: '',
      systemPrompt: '',
      preferredModel: 'openai/gpt-4o-mini',
      fallbackModel: 'openai/gpt-4o',
      allowedTools: [],
      maxFolderAccess: 'read_only',
      canRequestApproval: false,
      canSpawnSubagents: false,
      tokenBudget: 4000,
      icon: '🤖',
    })
    setMode('create')
    setSelectedAgent(null)
  }, [])

  const startEdit = useCallback((agent: AgentDefinition) => {
    setEditDraft({ ...agent })
    setSelectedAgent(agent)
    setMode('edit')
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      if (mode === 'create') {
        const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const def = { id, ...editDraft } as AgentDefinition
        await window.nyra.agentStudio.create(def)
      } else if (mode === 'edit' && selectedAgent) {
        const { id, ...updates } = editDraft as AgentDefinition
        await window.nyra.agentStudio.update(selectedAgent.id, updates)
      }
      setMode('browse')
      setSelectedAgent(null)
      refresh()
    } catch (err) {
      console.warn('[AgentStudio] Save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [mode, editDraft, selectedAgent, refresh])

  const handleDuplicate = useCallback(async (id: string) => {
    await window.nyra.agentStudio.duplicate(id)
    refresh()
  }, [refresh])

  const handleDelete = useCallback(async (id: string) => {
    await window.nyra.agentStudio.delete(id)
    if (selectedAgent?.id === id) { setMode('browse'); setSelectedAgent(null) }
    refresh()
  }, [selectedAgent, refresh])

  const handleExport = useCallback(async (id: string) => {
    const json = await window.nyra.agentStudio.export(id)
    if (json) navigator.clipboard.writeText(json)
  }, [])

  const getState = (agentId: string) => states.find(s => s.id === agentId)

  const inputCls = "w-full bg-nyra-bg border border-nyra-border rounded px-2 py-1 text-[11px] text-warm-100 placeholder:text-warm-600 focus:outline-none focus:ring-1 focus:ring-terra-500/40"

  return (
    <div className="h-full flex flex-col bg-nyra-surface text-warm-200 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-nyra-border">
        <Users size={16} className="text-terra-400" />
        <span className="text-sm font-semibold text-warm-100">Agent Studio</span>
        <div className="flex-1" />
        {mode !== 'browse' && (
          <button onClick={() => { setMode('browse'); setSelectedAgent(null) }} className="p-1 text-warm-500 hover:text-warm-300">
            <X size={14} />
          </button>
        )}
        <button onClick={startCreate} className="p-1 text-warm-500 hover:text-terra-300" title="New agent">
          <Plus size={14} />
        </button>
        <button onClick={refresh} className="p-1 text-warm-500 hover:text-warm-300" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Browse Mode ──────────────────────────────────────────── */}
        {mode === 'browse' && (
          <Section title="Agents" icon={<Users size={14} />} badge={agents.length} defaultOpen={true}>
            <div className="space-y-1">
              {agents.map(agent => {
                const state = getState(agent.id)
                return (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/[0.03] transition-colors group"
                  >
                    <span className="text-lg shrink-0">{agent.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-warm-200 truncate">{agent.name}</span>
                        {state && <StatusBadge status={state.status} />}
                      </div>
                      <p className="text-[10px] text-warm-500 truncate">{agent.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-warm-600 font-mono">{agent.preferredModel}</span>
                        <span className="text-[9px] text-warm-700 capitalize">{agent.role}</span>
                      </div>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(agent)} className="p-1 text-warm-600 hover:text-warm-300" title="Edit">
                        <Settings2 size={11} />
                      </button>
                      <button onClick={() => handleDuplicate(agent.id)} className="p-1 text-warm-600 hover:text-warm-300" title="Duplicate">
                        <Copy size={11} />
                      </button>
                      <button onClick={() => handleExport(agent.id)} className="p-1 text-warm-600 hover:text-warm-300" title="Copy JSON">
                        <Download size={11} />
                      </button>
                      <button onClick={() => handleDelete(agent.id)} className="p-1 text-warm-600 hover:text-blush-400" title="Delete">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* ── Create / Edit Mode ──────────────────────────────────── */}
        {(mode === 'create' || mode === 'edit') && (
          <div className="px-3 py-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-warm-200">
                {mode === 'create' ? 'New Agent' : `Edit: ${selectedAgent?.name}`}
              </span>
            </div>

            {/* Icon + Name */}
            <div className="flex gap-2">
              <div className="shrink-0">
                <Field label="Icon">
                  <div className="flex flex-wrap gap-1 w-24">
                    {AGENT_ICONS.map(icon => (
                      <button
                        key={icon}
                        onClick={() => setEditDraft(d => ({ ...d, icon }))}
                        className={`w-6 h-6 text-sm rounded flex items-center justify-center transition-all ${
                          editDraft.icon === icon ? 'bg-terra-500/20 ring-1 ring-terra-500/40' : 'hover:bg-white/[0.05]'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="flex-1 space-y-2">
                <Field label="Name">
                  <input
                    value={editDraft.name || ''}
                    onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                    placeholder="My Agent"
                    className={inputCls}
                  />
                </Field>
                <Field label="Description">
                  <input
                    value={editDraft.description || ''}
                    onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                    placeholder="What this agent does..."
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>

            {/* Role */}
            <Field label="Role">
              <div className="flex gap-1 flex-wrap">
                {ROLES.map(role => (
                  <button
                    key={role}
                    onClick={() => setEditDraft(d => ({ ...d, role }))}
                    className={`px-1.5 py-0.5 text-[10px] rounded capitalize transition-all ${
                      editDraft.role === role
                        ? 'bg-terra-500/20 text-terra-300 ring-1 ring-terra-500/30'
                        : 'text-warm-500 hover:text-warm-300'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </Field>

            {/* Models */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Preferred Model" hint="provider/model-id">
                <input
                  value={editDraft.preferredModel || ''}
                  onChange={e => setEditDraft(d => ({ ...d, preferredModel: e.target.value }))}
                  placeholder="openai/gpt-4o"
                  className={inputCls}
                />
              </Field>
              <Field label="Fallback Model">
                <input
                  value={editDraft.fallbackModel || ''}
                  onChange={e => setEditDraft(d => ({ ...d, fallbackModel: e.target.value }))}
                  placeholder="openai/gpt-4o-mini"
                  className={inputCls}
                />
              </Field>
            </div>

            {/* System Prompt */}
            <Field label="System Prompt">
              <textarea
                value={editDraft.systemPrompt || ''}
                onChange={e => setEditDraft(d => ({ ...d, systemPrompt: e.target.value }))}
                placeholder="You are a specialist agent that..."
                rows={4}
                className={`${inputCls} resize-y min-h-[60px]`}
              />
            </Field>

            {/* Token Budget */}
            <Field label={`Token Budget: ${editDraft.tokenBudget || 4000}`}>
              <input
                type="range"
                min={1000}
                max={32000}
                step={1000}
                value={editDraft.tokenBudget || 4000}
                onChange={e => setEditDraft(d => ({ ...d, tokenBudget: Number(e.target.value) }))}
                className="w-full accent-terra-400"
              />
            </Field>

            {/* Permissions */}
            <Field label="Permissions">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Shield size={11} className="text-warm-500" />
                  <span className="text-[10px] text-warm-400 w-24">Folder Access</span>
                  <div className="flex gap-1">
                    {FOLDER_ACCESS_LEVELS.map(level => (
                      <button
                        key={level}
                        onClick={() => setEditDraft(d => ({ ...d, maxFolderAccess: level }))}
                        className={`px-1.5 py-0.5 text-[10px] rounded transition-all ${
                          editDraft.maxFolderAccess === level
                            ? 'bg-sage-400/20 text-sage-300 ring-1 ring-sage-400/30'
                            : 'text-warm-600 hover:text-warm-400'
                        }`}
                      >
                        {level.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[10px] text-warm-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editDraft.canRequestApproval || false}
                    onChange={e => setEditDraft(d => ({ ...d, canRequestApproval: e.target.checked }))}
                    className="accent-terra-400 w-3 h-3"
                  />
                  Can request approval from user
                </label>
                <label className="flex items-center gap-2 text-[10px] text-warm-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editDraft.canSpawnSubagents || false}
                    onChange={e => setEditDraft(d => ({ ...d, canSpawnSubagents: e.target.checked }))}
                    className="accent-terra-400 w-3 h-3"
                  />
                  Can spawn sub-agents
                </label>
              </div>
            </Field>

            {/* Allowed Tools */}
            <Field label="Allowed Tools" hint="Comma-separated, supports wildcards like files:*">
              <input
                value={(editDraft.allowedTools || []).join(', ')}
                onChange={e => setEditDraft(d => ({
                  ...d,
                  allowedTools: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                }))}
                placeholder="memory:query, files:read, indexer:*"
                className={inputCls}
              />
            </Field>

            {/* Save / Cancel */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !editDraft.name?.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-terra-500/20 text-terra-300 hover:bg-terra-500/30 disabled:opacity-30 transition-colors"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {mode === 'create' ? 'Create Agent' : 'Save Changes'}
              </button>
              <button
                onClick={() => { setMode('browse'); setSelectedAgent(null) }}
                className="px-3 py-1.5 text-[11px] rounded-lg text-warm-500 hover:text-warm-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default AgentStudioPanel
