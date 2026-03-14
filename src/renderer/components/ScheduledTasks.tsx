/**
 * Scheduled Tasks panel — create, list, toggle, delete recurring prompts
 */
import React, { useEffect, useState } from 'react'
import { X, Plus, Clock, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Play } from 'lucide-react'

interface ScheduledTask {
  id: string
  prompt: string
  cron?: string          // e.g. "0 9 * * 1-5"
  name: string           // human-readable label (maps to preload ScheduledTask.name)
  enabled: boolean
  lastRun?: number       // epoch ms
  nextRun?: number       // epoch ms
}

const CRON_PRESETS = [
  { label: 'Every morning (9 AM)',        cron: '0 9 * * *' },
  { label: 'Weekday mornings',            cron: '0 9 * * 1-5' },
  { label: 'Every hour',                  cron: '0 * * * *' },
  { label: 'Twice daily (9 AM & 5 PM)',   cron: '0 9,17 * * *' },
  { label: 'Every Sunday midnight',       cron: '0 0 * * 0' },
  { label: 'First day of month',          cron: '0 9 1 * *' },
  { label: 'Custom…',                     cron: 'custom' },
]

function formatRelative(epoch?: number): string {
  if (!epoch) return '—'
  const diff = epoch - Date.now()
  const abs = Math.abs(diff)
  if (abs < 60_000) return diff < 0 ? 'just now' : 'in <1 min'
  if (abs < 3_600_000) {
    const m = Math.round(abs / 60_000)
    return diff < 0 ? `${m}m ago` : `in ${m}m`
  }
  if (abs < 86_400_000) {
    const h = Math.round(abs / 3_600_000)
    return diff < 0 ? `${h}h ago` : `in ${h}h`
  }
  return new Date(epoch).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface Props {
  onClose: () => void
}

export const ScheduledTasks: React.FC<Props> = ({ onClose }) => {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // New task form state
  const [newPrompt, setNewPrompt] = useState('')
  const [newName, setNewName] = useState('')
  const [selectedPreset, setSelectedPreset] = useState(CRON_PRESETS[0].cron)
  const [customCron, setCustomCron] = useState('')
  const [saving, setSaving] = useState(false)

  const effectiveCron = selectedPreset === 'custom' ? customCron : selectedPreset

  const load = async () => {
    try {
      const list = await window.nyra.scheduled.list()
      setTasks(list)
    } catch { /* ignore */ }
  }

  useEffect(() => { load() }, [])

  const add = async () => {
    if (!newPrompt.trim() || !effectiveCron.trim()) return
    setSaving(true)
    try {
      await window.nyra.scheduled.add({
        id: `task-${Date.now()}`,
        prompt: newPrompt.trim(),
        cron: effectiveCron.trim(),
        name: newName.trim() || newPrompt.trim().slice(0, 60),
        enabled: true,
      })
      setNewPrompt('')
      setNewName('')
      setSelectedPreset(CRON_PRESETS[0].cron)
      setCustomCron('')
      setCreating(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (task: ScheduledTask) => {
    await window.nyra.scheduled.update(task.id, { enabled: !task.enabled })
    await load()
  }

  const remove = async (id: string) => {
    await window.nyra.scheduled.remove(id)
    await load()
  }

  const runNow = async (task: ScheduledTask) => {
    // Send the scheduled prompt as a new chat message via IPC
    await window.nyra.notify.send('Scheduled task', `Running: ${task.name}`)
    // The main process or hook would handle this — here we just notify
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[560px] max-h-[80vh] flex flex-col bg-[#111111] border border-white/10 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <Clock size={16} className="text-terra-400" />
            <span className="text-white/90 text-sm font-semibold">Scheduled Tasks</span>
            {tasks.length > 0 && (
              <span className="bg-white/10 text-white/50 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                {tasks.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-white/20 hover:text-white/60 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {tasks.length === 0 && !creating && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Clock size={28} className="text-white/10" />
              <p className="text-white/30 text-sm">No scheduled tasks yet</p>
              <p className="text-white/20 text-xs">Automate recurring prompts on a schedule</p>
            </div>
          )}

          {tasks.map(task => (
            <div key={task.id} className="border-b border-white/[0.06] last:border-0">
              {/* Row */}
              <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.03] transition-colors">
                {/* Toggle */}
                <button
                  onClick={() => toggle(task)}
                  className={`flex-shrink-0 transition-colors ${task.enabled ? 'text-terra-400' : 'text-white/20'}`}
                >
                  {task.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${task.enabled ? 'text-white/80' : 'text-white/30'}`}>
                    {task.name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-white/25 text-[10px] font-mono">{task.cron}</span>
                    <span className="text-white/25 text-[10px]">next: {formatRelative(task.nextRun)}</span>
                    {task.lastRun && (
                      <span className="text-white/20 text-[10px]">last: {formatRelative(task.lastRun)}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => runNow(task)}
                    title="Run now"
                    className="p-1.5 text-white/20 hover:text-green-400 transition-colors"
                  >
                    <Play size={13} />
                  </button>
                  <button
                    onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
                    className="p-1.5 text-white/20 hover:text-white/50 transition-colors"
                  >
                    {expandedId === task.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <button
                    onClick={() => remove(task.id)}
                    className="p-1.5 text-white/20 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Expanded prompt preview */}
              {expandedId === task.id && (
                <div className="px-5 pb-3">
                  <div className="bg-white/[0.04] rounded-lg px-3 py-2.5 border border-white/[0.06]">
                    <p className="text-white/40 text-[11px] leading-relaxed whitespace-pre-wrap">{task.prompt}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Create form */}
        {creating && (
          <div className="border-t border-white/[0.07] px-5 py-4 space-y-3 bg-white/[0.02]">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">New Task</p>

            {/* Label */}
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Task name (optional)"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 placeholder-white/20 outline-none focus:border-terra-400/50"
            />

            {/* Prompt */}
            <textarea
              value={newPrompt}
              onChange={e => setNewPrompt(e.target.value)}
              placeholder="Prompt to run automatically…"
              rows={3}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 placeholder-white/20 outline-none focus:border-terra-400/50 resize-none"
            />

            {/* Schedule */}
            <div className="space-y-2">
              <label className="text-white/40 text-[11px]">Schedule</label>
              <div className="grid grid-cols-2 gap-1.5">
                {CRON_PRESETS.map(p => (
                  <button
                    key={p.cron}
                    onClick={() => setSelectedPreset(p.cron)}
                    className={`text-left px-3 py-2 rounded-lg text-[11px] border transition-all ${
                      selectedPreset === p.cron
                        ? 'border-terra-400/50 bg-terra-400/10 text-terra-300'
                        : 'border-white/[0.07] bg-white/[0.03] text-white/40 hover:text-white/60'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {selectedPreset === 'custom' && (
                <input
                  value={customCron}
                  onChange={e => setCustomCron(e.target.value)}
                  placeholder="cron expression  e.g. 0 9 * * 1-5"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 placeholder-white/20 font-mono outline-none focus:border-terra-400/50"
                />
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setCreating(false); setNewPrompt(''); setNewName('') }}
                className="flex-1 py-2 rounded-lg border border-white/10 text-white/40 text-xs hover:text-white/60 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={add}
                disabled={!newPrompt.trim() || saving}
                className="flex-1 py-2 rounded-lg bg-terra-500 hover:bg-terra-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
              >
                {saving ? 'Saving…' : 'Create Task'}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {!creating && (
          <div className="border-t border-white/[0.07] px-5 py-3">
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 text-terra-400 hover:text-terra-300 text-xs font-medium transition-colors"
            >
              <Plus size={14} />
              New scheduled task
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
