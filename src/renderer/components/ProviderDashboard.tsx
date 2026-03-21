/**
 * ProviderDashboard — Health, latency, and cost monitoring for all LLM providers
 *
 * Displays:
 *   - Provider cards with live health status (healthy/degraded/down)
 *   - Latency gauges with color coding (green < 500ms, yellow < 2s, red > 2s)
 *   - Model catalog per provider with cost breakdown
 *   - Manual health check trigger
 *   - Session cost estimator based on token usage
 *
 * Polls health data every 10s for non-intrusive monitoring.
 */
import React, { useState, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────

interface ProviderInfo {
  id: string
  name: string
  isLocal: boolean
  isAvailable: boolean
  models: Array<{
    id: string
    name: string
    costPer1kInput: number
    costPer1kOutput: number
  }>
  health: {
    status: 'healthy' | 'degraded' | 'down'
    latencyMs: number
    lastCheckedAt: number
    error?: string
  } | null
}

// ── Status helpers ─────────────────────────────────────────────

const STATUS_CONFIG = {
  healthy:  { color: 'bg-sage-400', text: 'text-sage-300', border: 'border-sage-400/20', label: 'Healthy', glow: 'shadow-sage-400/20' },
  degraded: { color: 'bg-gold-400', text: 'text-gold-300', border: 'border-gold-400/20', label: 'Degraded', glow: 'shadow-gold-400/20' },
  down:     { color: 'bg-blush-400', text: 'text-blush-400', border: 'border-blush-400/20', label: 'Down', glow: 'shadow-blush-400/20' },
  unknown:  { color: 'bg-white/20', text: 'text-white/30', border: 'border-white/[0.06]', label: 'Unknown', glow: '' },
}

function getLatencyColor(ms: number): string {
  if (ms < 500) return 'text-sage-300'
  if (ms < 2000) return 'text-gold-300'
  return 'text-blush-400'
}

function getLatencyBarWidth(ms: number): number {
  return Math.min(100, (ms / 5000) * 100)
}

function getLatencyBarColor(ms: number): string {
  if (ms < 500) return 'bg-sage-400'
  if (ms < 2000) return 'bg-gold-400'
  return 'bg-blush-400'
}

function formatCost(cost: number): string {
  if (cost === 0) return 'Free'
  if (cost < 0.001) return `$${(cost * 1000).toFixed(2)}/M`
  return `$${cost.toFixed(4)}/1K`
}

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

// ── Provider Card ──────────────────────────────────────────────

const ProviderCard: React.FC<{
  provider: ProviderInfo
  onCheck: (id: string) => void
  checking: boolean
}> = ({ provider, onCheck, checking }) => {
  const [expanded, setExpanded] = useState(false)
  const status = provider.health?.status ?? 'unknown'
  const config = STATUS_CONFIG[status]

  return (
    <div className={`rounded-xl border ${config.border} bg-white/[0.02] overflow-hidden transition-all hover:bg-white/[0.03]`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full ${config.color} ${status === 'healthy' ? 'animate-pulse' : ''}`} />

        {/* Provider info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-white/80">{provider.name}</span>
            {provider.isLocal && (
              <span className="text-[8px] bg-sage-400/10 text-sage-300 px-1.5 py-0.5 rounded-full font-medium border border-sage-400/20">
                LOCAL
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] ${config.text} font-medium`}>{config.label}</span>
            {provider.health && (
              <span className="text-[9px] text-white/15 font-mono">
                checked {timeAgo(provider.health.lastCheckedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Latency gauge */}
        {provider.health && provider.health.latencyMs > 0 && (
          <div className="flex flex-col items-end gap-1">
            <span className={`text-[14px] font-mono font-semibold ${getLatencyColor(provider.health.latencyMs)}`}>
              {provider.health.latencyMs}ms
            </span>
            <div className="w-16 h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getLatencyBarColor(provider.health.latencyMs)} transition-all`}
                style={{ width: `${getLatencyBarWidth(provider.health.latencyMs)}%` }}
              />
            </div>
          </div>
        )}

        {/* Check button */}
        <button
          onClick={(e) => { e.stopPropagation(); onCheck(provider.id) }}
          disabled={checking}
          className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
            checking
              ? 'border-white/[0.04] text-white/15 animate-pulse'
              : 'border-white/[0.06] text-white/30 hover:text-terra-300 hover:border-terra-400/20'
          }`}
        >
          {checking ? '...' : '↻'}
        </button>

        {/* Expand indicator */}
        <span className={`text-white/15 text-[10px] transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </div>

      {/* Error banner */}
      {provider.health?.error && (
        <div className="mx-4 mb-2 px-3 py-1.5 bg-blush-400/5 border border-blush-400/10 rounded-lg text-[11px] text-blush-400/80">
          {provider.health.error}
        </div>
      )}

      {/* Expanded: model catalog */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-white/[0.03]">
          <div className="text-[10px] text-white/20 font-medium mb-2">
            {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-1">
            {provider.models.map(m => (
              <div key={m.id} className="flex items-center gap-2 text-[11px] py-1 px-2 rounded-md hover:bg-white/[0.02]">
                <span className="text-white/50 flex-1 truncate font-mono">{m.id}</span>
                <span className="text-sage-300/60 font-mono text-[10px]">
                  {formatCost(m.costPer1kInput)}
                </span>
                <span className="text-white/10">/</span>
                <span className="text-gold-300/60 font-mono text-[10px]">
                  {formatCost(m.costPer1kOutput)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2 text-[9px] text-white/15">
            <span className="text-sage-300/40">●</span> Input
            <span className="text-gold-300/40">●</span> Output
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────

const ProviderDashboard: React.FC = () => {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const [lastRefresh, setLastRefresh] = useState<number>(0)

  // Load providers
  const loadProviders = useCallback(async () => {
    try {
      const result = await window.nyra.providerHealth.getAll()
      if (result.success) {
        setProviders(result.result)
        setLastRefresh(Date.now())
      }
    } catch {
      // Provider health endpoint may not be ready
    }
  }, [])

  useEffect(() => {
    loadProviders()
    const interval = setInterval(loadProviders, 10_000)
    return () => clearInterval(interval)
  }, [loadProviders])

  // Check single provider
  const handleCheck = useCallback(async (id: string) => {
    setChecking(prev => new Set([...prev, id]))
    try {
      await window.nyra.providerHealth.check(id)
      await loadProviders()
    } finally {
      setChecking(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }, [loadProviders])

  // Check all providers
  const handleCheckAll = useCallback(async () => {
    const allIds = providers.map(p => p.id)
    setChecking(new Set(allIds))
    try {
      await window.nyra.providerHealth.checkAll()
      await loadProviders()
    } finally {
      setChecking(new Set())
    }
  }, [providers, loadProviders])

  // Stats
  const healthyCount = providers.filter(p => p.health?.status === 'healthy').length
  const totalModels = providers.reduce((acc, p) => acc + p.models.length, 0)
  const avgLatency = providers.filter(p => p.health?.latencyMs).length > 0
    ? Math.round(providers.reduce((acc, p) => acc + (p.health?.latencyMs ?? 0), 0) / providers.filter(p => p.health?.latencyMs).length)
    : 0

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        <span className="text-[14px]">◉</span>
        <span className="text-[12px] font-medium text-white/60">Provider Dashboard</span>

        <div className="flex-1" />

        <button
          onClick={handleCheckAll}
          disabled={checking.size > 0}
          className="text-[10px] px-2.5 py-1 rounded-md border border-white/[0.06] text-white/30 hover:text-terra-300 hover:border-terra-400/20 transition-colors disabled:opacity-30"
        >
          {checking.size > 0 ? 'Checking...' : 'Check All'}
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-white/[0.04] bg-white/[0.01]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sage-400" />
          <span className="text-[10px] text-white/30">
            <span className="text-sage-300 font-medium">{healthyCount}</span>/{providers.length} healthy
          </span>
        </div>
        <div className="text-[10px] text-white/20">
          <span className="text-white/40 font-mono">{totalModels}</span> models
        </div>
        {avgLatency > 0 && (
          <div className={`text-[10px] font-mono ${getLatencyColor(avgLatency)}`}>
            avg {avgLatency}ms
          </div>
        )}
        <div className="flex-1" />
        {lastRefresh > 0 && (
          <span className="text-[9px] text-white/10 font-mono">
            refreshed {timeAgo(lastRefresh)}
          </span>
        )}
      </div>

      {/* Provider cards */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scrollbar-thin">
        {providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-white/15">
            <div className="text-3xl">◉</div>
            <p className="text-[13px]">No providers registered</p>
            <p className="text-[11px] text-white/10">Add API keys in Settings to connect providers</p>
          </div>
        ) : (
          providers.map(p => (
            <ProviderCard
              key={p.id}
              provider={p}
              onCheck={handleCheck}
              checking={checking.has(p.id)}
            />
          ))
        )}
      </div>

      {/* Footer legend */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-t border-white/[0.04] text-[9px] text-white/15">
        <span><span className="text-sage-300">●</span> &lt;500ms</span>
        <span><span className="text-gold-300">●</span> &lt;2s</span>
        <span><span className="text-blush-400">●</span> &gt;2s</span>
        <div className="flex-1" />
        <span className="font-mono">Auto-refresh 10s</span>
      </div>
    </div>
  )
}

export default ProviderDashboard
