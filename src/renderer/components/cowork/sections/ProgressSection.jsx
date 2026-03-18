/**
 * ProgressSection — Compact task progress for sidebar.
 * Shows active tasks with status indicators inline.
 * Uses the real useTaskManager hook for live data.
 */
import React, { useState } from 'react';
import { CheckCircle, XCircle, Clock, Loader2, Zap, Play, Pause, StopCircle, RotateCcw, ChevronDown, ChevronRight, } from 'lucide-react';
import { useTaskManager } from '../../../hooks/useTaskManager';
const STATUS_ICON = {
    intake: { icon: Clock, color: 'text-white/40' },
    planning: { icon: Loader2, color: 'text-blue-400' },
    gathering_context: { icon: Loader2, color: 'text-blue-400' },
    delegation: { icon: Loader2, color: 'text-blue-400' },
    execution: { icon: Zap, color: 'text-amber-400' },
    verification: { icon: CheckCircle, color: 'text-emerald-400' },
    awaiting_approval: { icon: Clock, color: 'text-yellow-400' },
    finalizing: { icon: Loader2, color: 'text-emerald-400' },
    completed: { icon: CheckCircle, color: 'text-emerald-400' },
    failed: { icon: XCircle, color: 'text-red-400' },
    paused: { icon: Pause, color: 'text-yellow-400' },
    cancelled: { icon: XCircle, color: 'text-red-400' },
};
const getRelativeTime = (timestamp) => {
    const diff = Date.now() - timestamp;
    const s = Math.floor(diff / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (s < 60)
        return `${s}s ago`;
    if (m < 60)
        return `${m}m ago`;
    if (h < 24)
        return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};
const TaskRow = ({ task, onCancel, onPause, onResume, onRetry }) => {
    const cfg = STATUS_ICON[task.status];
    const Icon = cfg.icon;
    const isActive = !['completed', 'failed', 'cancelled', 'paused'].includes(task.status);
    const isSpinning = ['planning', 'gathering_context', 'delegation', 'finalizing'].includes(task.status);
    return (<div className="flex items-start gap-2.5 py-2 group">
      <div className={`mt-0.5 flex-shrink-0 ${cfg.color}`}>
        <Icon size={14} className={isSpinning ? 'animate-spin' : ''}/>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-white/80 leading-snug truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-white/35">{getRelativeTime(task.createdAt)}</span>
          <span className={`text-[9px] ${cfg.color}`}>
            {task.status.replace('_', ' ')}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {task.status === 'paused' && onResume && (<button onClick={() => onResume(task.id)} className="p-0.5 hover:bg-white/10 rounded cursor-pointer">
            <Play size={11} className="text-emerald-400"/>
          </button>)}
        {isActive && onPause && (<button onClick={() => onPause(task.id)} className="p-0.5 hover:bg-white/10 rounded cursor-pointer">
            <Pause size={11} className="text-yellow-400"/>
          </button>)}
        {task.status === 'failed' && onRetry && (<button onClick={() => onRetry(task.id)} className="p-0.5 hover:bg-white/10 rounded cursor-pointer">
            <RotateCcw size={11} className="text-blue-400"/>
          </button>)}
        {(isActive || task.status === 'paused') && onCancel && (<button onClick={() => onCancel(task.id)} className="p-0.5 hover:bg-white/10 rounded cursor-pointer">
            <StopCircle size={11} className="text-red-400"/>
          </button>)}
      </div>
    </div>);
};
const ProgressSection = () => {
    const { tasks, createTask, cancelTask, pauseTask, resumeTask, retryTask } = useTaskManager();
    const [showComposer, setShowComposer] = useState(false);
    const [desc, setDesc] = useState('');
    const [mode, setMode] = useState('solo');
    const [creating, setCreating] = useState(false);
    const [showCompleted, setShowCompleted] = useState(false);
    const activeTasks = tasks.filter(t => !['completed', 'failed', 'cancelled'].includes(t.status));
    const completedTasks = tasks.filter(t => ['completed', 'failed', 'cancelled'].includes(t.status));
    const handleCreate = async () => {
        if (!desc.trim() || creating)
            return;
        setCreating(true);
        try {
            await createTask(desc.split('\n')[0].slice(0, 60), desc, mode);
            setDesc('');
            setShowComposer(false);
        }
        catch { /* */ }
        setCreating(false);
    };
    return (<div className="space-y-1">
      {/* Active tasks */}
      {activeTasks.length > 0 ? (<div className="divide-y divide-white/[0.04]">
          {activeTasks.map(task => (<TaskRow key={task.id} task={task} onCancel={cancelTask} onPause={pauseTask} onResume={resumeTask} onRetry={retryTask}/>))}
        </div>) : (<p className="text-[10px] text-white/30 py-2">No active tasks</p>)}

      {/* Completed toggle */}
      {completedTasks.length > 0 && (<div>
          <button onClick={() => setShowCompleted(!showCompleted)} className="flex items-center gap-1.5 text-[10px] text-white/35 hover:text-white/50 transition-colors cursor-pointer py-1">
            {showCompleted ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
            Completed ({completedTasks.length})
          </button>
          {showCompleted && (<div className="divide-y divide-white/[0.03]">
              {completedTasks.slice(0, 10).map(task => (<TaskRow key={task.id} task={task}/>))}
            </div>)}
        </div>)}

      {/* Quick task composer */}
      {showComposer ? (<div className="mt-2 space-y-2">
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe what you'd like to accomplish..." className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-terra-300/40 resize-none" rows={3} autoFocus/>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {['solo', 'subagent', 'team'].map(m => (<button key={m} onClick={() => setMode(m)} className={`px-2 py-0.5 rounded text-[9px] font-medium cursor-pointer transition-colors ${mode === m
                    ? 'bg-terra-300/15 text-terra-300 border border-terra-300/30'
                    : 'text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'}`}>
                  {m}
                </button>))}
            </div>
            <div className="flex-1"/>
            <button onClick={() => setShowComposer(false)} className="text-[10px] text-white/35 hover:text-white/50 cursor-pointer">
              Cancel
            </button>
            <button onClick={handleCreate} disabled={!desc.trim() || creating} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-terra-300/15 text-terra-300 text-[10px] font-medium hover:bg-terra-300/25 disabled:opacity-40 cursor-pointer transition-colors">
              {creating ? <Loader2 size={10} className="animate-spin"/> : <Play size={10}/>}
              Start
            </button>
          </div>
        </div>) : (<button onClick={() => setShowComposer(true)} className="w-full mt-1 py-1.5 rounded-md border border-dashed border-white/[0.08] text-[10px] text-white/35 hover:text-white/50 hover:border-white/[0.12] hover:bg-white/[0.02] transition-all cursor-pointer">
          + New task
        </button>)}
    </div>);
};
export default ProgressSection;
