/**
 * PlanSection — Compact plan status for sidebar.
 * Shows current plan steps with progress.
 * Uses real plan IPC via window.nyra.plan.
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  Check, X, Clock, Loader2, Zap, SkipForward,
} from 'lucide-react'

interface PlanStep {
  id: number
  action: string
  description: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
}

interface Plan {
  id: string
  goal: string
  steps: PlanStep[]
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled'
  riskLevel: 'safe' | 'moderate' | 'high'
}

const STEP_ICONS: Record<string, { icon: React.ComponentType<any>; color: string }> = {
  pending:  { icon: Clock,       color: 'text-white/30' },
  running:  { icon: Loader2,     color: 'text-terra-400' },
  done:     { icon: Check,       color: 'text-sage-400' },
  failed:   { icon: X,           color: 'text-blush-400' },
  skipped:  { icon: SkipForward, color: 'text-white/20' },
}

const PlanSection: React.FC = () => {
  const [plan, setPlan] = useState<Plan | null>(null)

  const loadPlan = useCallback(async () => {
    try {
      const plans = await window.nyra.plan.list()
      if (plans && plans.length > 0) {
        setPlan(plans[0])
      }
    } catch { /* */ }
  }, [])

  useEffect(() => {
    loadPlan()
    const cleanups = [
      window.nyra.plan.onGenerated((p: Plan) => setPlan(p)),
      window.nyra.plan.onUpdated((p: Plan) => setPlan(prev => prev?.id === p.id ? p : prev)),
      window.nyra.plan.onCompleted((p: Plan) => setPlan(prev => prev?.id === p.id ? p : prev)),
      window.nyra.plan.onFailed((p: Plan) => setPlan(prev => prev?.id === p.id ? p : prev)),
    ]
    return () => cleanups.forEach(fn => fn())
  }, [loadPlan])

  if (!plan) {
    return <p className="text-[10px] text-white/30 py-2">No active plan</p>
  }

  const done = plan.steps.filter(s => s.status === 'done').length
  const total = plan.steps.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="space-y-2">
      {/* Plan header */}
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-white/70 flex-1 truncate">{plan.goal}</p>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
          plan.riskLevel === 'safe' ? 'text-sage-400/70 bg-sage-500/10' :
          plan.riskLevel === 'moderate' ? 'text-gold-400/70 bg-gold-500/10' :
          'text-blush-400/70 bg-blush-500/10'
        }`}>
          {plan.riskLevel}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-[9px] text-white/35">{done}/{total} steps</span>
          <span className="text-[9px] text-white/35">{pct}%</span>
        </div>
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div className="h-full bg-terra-300 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Compact step list */}
      <div className="space-y-0.5">
        {plan.steps.slice(0, 8).map(step => {
          const cfg = STEP_ICONS[step.status] || STEP_ICONS.pending
          const Icon = cfg.icon
          return (
            <div key={step.id} className="flex items-center gap-2 py-0.5">
              <Icon size={11} className={`${cfg.color} flex-shrink-0 ${step.status === 'running' ? 'animate-spin' : ''}`} />
              <span className={`text-[10px] flex-1 truncate ${
                step.status === 'skipped' ? 'text-white/20 line-through' : 'text-white/55'
              }`}>
                {step.description}
              </span>
            </div>
          )
        })}
        {plan.steps.length > 8 && (
          <span className="text-[9px] text-white/25">+{plan.steps.length - 8} more</span>
        )}
      </div>

      {/* Action buttons for draft plans */}
      {plan.status === 'draft' && (
        <div className="flex items-center gap-1.5 pt-1">
          <button
            onClick={() => window.nyra.plan.approve(plan.id).then(() => window.nyra.plan.execute(plan.id))}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-sage-500/15 text-sage-400 text-[9px] font-medium hover:bg-sage-500/25 cursor-pointer transition-colors"
          >
            <Zap size={10} /> Approve & Run
          </button>
          <button
            onClick={() => window.nyra.plan.cancel(plan.id)}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] text-white/40 text-[9px] hover:bg-white/[0.08] cursor-pointer transition-colors"
          >
            <X size={10} /> Reject
          </button>
        </div>
      )}
    </div>
  )
}

export default PlanSection
