/**
 * Task Board Panel — Kanban-style task management with drag between columns
 */
import React, { useEffect, useState } from 'react'
import { LayoutGrid, Plus, Trash2, ChevronRight, Clock, CheckCircle2, Eye, Circle } from 'lucide-react'

interface TaskItem {
  id: string; title: string; description: string; status: string; priority: string
  assignedAgent?: string; tags: string[]; position: number; createdAt: number; completedAt?: number
}

type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  backlog: { label: 'Backlog', color: 'text-white/30', icon: <Circle size={10} /> },
  todo: { label: 'Todo', color: 'text-terra-300', icon: <Clock size={10} /> },
  in_progress: { label: 'In Progress', color: 'text-gold-300', icon: <ChevronRight size={10} /> },
  review: { label: 'Review', color: 'text-gold-300', icon: <Eye size={10} /> },
  done: { label: 'Done', color: 'text-sage-300', icon: <CheckCircle2 size={10} /> },
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-white/[0.04] text-white/25',
  medium: 'bg-terra-400/10 text-terra-300/50',
  high: 'bg-gold-400/10 text-gold-300/50',
  critical: 'bg-blush-400/10 text-blush-300/50',
}

const STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done']

const TaskBoardPanel: React.FC = () => {
  const [board, setBoard] = useState<Record<TaskStatus, TaskItem[]>>({ backlog: [], todo: [], in_progress: [], review: [], done: [] })
  const [stats, setStats] = useState<any>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [newStatus, setNewStatus] = useState<TaskStatus>('todo')

  const fetchBoard = async () => {
    try {
      const r = await window.nyra.taskBoard.getBoard()
      if (r.success) setBoard(r.result)
    } catch {}
  }

  const fetchStats = async () => {
    try {
      const r = await window.nyra.taskBoard.getStats()
      if (r.success) setStats(r.result)
    } catch {}
  }

  useEffect(() => { fetchBoard(); fetchStats() }, [])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    try {
      await window.nyra.taskBoard.create(newTitle, { description: newDesc, priority: newPriority, status: newStatus })
      setNewTitle(''); setNewDesc(''); setShowCreate(false)
      fetchBoard(); fetchStats()
    } catch {}
  }

  const handleMoveRight = async (task: TaskItem) => {
    const currentIdx = STATUSES.indexOf(task.status as TaskStatus)
    if (currentIdx >= STATUSES.length - 1) return
    const nextStatus = STATUSES[currentIdx + 1]
    try {
      await window.nyra.taskBoard.moveToStatus(task.id, nextStatus)
      fetchBoard(); fetchStats()
    } catch {}
  }

  const handleDelete = async (id: string) => {
    try {
      await window.nyra.taskBoard.delete(id)
      fetchBoard(); fetchStats()
    } catch {}
  }

  const totalActive = (board.todo?.length || 0) + (board.in_progress?.length || 0) + (board.review?.length || 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <LayoutGrid size={16} className="text-sage-300" />
        <h2 className="text-sm font-semibold text-white/80">Task Board</h2>
        <span className="text-[10px] text-white/20 ml-1">{totalActive} active</span>
        {stats && (
          <span className="text-[9px] text-sage-400/40 ml-auto">{stats.completedToday} done today</span>
        )}
        <button onClick={() => setShowCreate(s => !s)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-terra-400/15 text-terra-300 text-[10px] font-medium hover:bg-terra-400/25 transition-colors">
          <Plus size={10} /> Add
        </button>
      </div>

      {/* Quick create */}
      {showCreate && (
        <div className="px-4 py-2.5 border-b border-white/[0.04] space-y-2">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Task title..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[12px] text-white/70 placeholder:text-white/20 outline-none" />
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-white/50 placeholder:text-white/15 outline-none" />
          <div className="flex gap-2">
            <select value={newPriority} onChange={e => setNewPriority(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1 text-[10px] text-white/50 outline-none">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value as TaskStatus)}
              className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1 text-[10px] text-white/50 outline-none">
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
            </select>
            <button onClick={handleCreate} disabled={!newTitle.trim()}
              className="ml-auto px-4 py-1 rounded-lg bg-terra-400/20 text-terra-300 text-[10px] font-medium hover:bg-terra-400/30 disabled:opacity-30">Create</button>
          </div>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-w-[800px]">
          {STATUSES.map(status => {
            const config = STATUS_CONFIG[status]
            const tasks = board[status] || []
            return (
              <div key={status} className="flex-1 flex flex-col border-r border-white/[0.03] last:border-r-0 min-w-[160px]">
                {/* Column header */}
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.04]">
                  <span className={config.color}>{config.icon}</span>
                  <span className={`text-[10px] font-medium ${config.color}`}>{config.label}</span>
                  <span className="text-[9px] text-white/15 ml-auto">{tasks.length}</span>
                </div>

                {/* Tasks */}
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
                  {tasks.map(task => (
                    <div key={task.id} className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 hover:border-white/[0.08] transition-colors group">
                      <div className="flex items-start gap-1.5">
                        <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}`}>
                          {task.priority[0].toUpperCase()}
                        </span>
                        <h4 className="text-[11px] text-white/65 font-medium flex-1 leading-tight">{task.title}</h4>
                      </div>
                      {task.description && (
                        <p className="text-[9px] text-white/20 mt-1 line-clamp-2">{task.description}</p>
                      )}
                      {task.assignedAgent && (
                        <span className="inline-block mt-1 text-[8px] px-1.5 py-0.5 rounded bg-gold-400/10 text-gold-300/40">{task.assignedAgent}</span>
                      )}
                      <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {status !== 'done' && (
                          <button onClick={() => handleMoveRight(task)} title="Move right"
                            className="p-0.5 rounded text-white/20 hover:text-white/50 hover:bg-white/[0.04]">
                            <ChevronRight size={10} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(task.id)} title="Delete"
                          className="p-0.5 rounded text-blush-400/20 hover:text-blush-400/60 hover:bg-blush-400/10 ml-auto">
                          <Trash2 size={9} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default TaskBoardPanel
