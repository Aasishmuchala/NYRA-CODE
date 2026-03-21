/**
 * Performance Profiler Panel — Latency waterfall, percentile metrics, throughput
 */
import React, { useEffect, useState } from 'react'
import { Timer, Activity, Zap, AlertTriangle, TrendingUp } from 'lucide-react'

interface PercentileStats { p50: number; p75: number; p90: number; p95: number; p99: number; min: number; max: number; mean: number; count: number }
interface ProviderProfile { providerId: string; totalRequests: number; errorCount: number; errorRate: number; latency: PercentileStats; throughput: PercentileStats; avgInputTokens: number; avgOutputTokens: number }
interface ProfileEntry { id: string; providerId: string; modelId: string; operation: string; latencyMs: number; inputTokens: number; outputTokens: number; tokensPerSecond: number; statusCode: number; error?: string; timestamp: number }
interface OverallStats { totalRequests: number; avgLatency: number; p95Latency: number; avgThroughput: number; errorRate: number; topModels: Array<{ modelId: string; count: number; avgLatency: number }> }

type Tab = 'overview' | 'waterfall' | 'providers'

const PerformanceProfilerPanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>('overview')
  const [overall, setOverall] = useState<OverallStats | null>(null)
  const [providers, setProviders] = useState<ProviderProfile[]>([])
  const [waterfall, setWaterfall] = useState<ProfileEntry[]>([])
  const [hours, setHours] = useState(24)

  const fetchAll = async () => {
    try {
      const [o, p, w] = await Promise.all([
        window.nyra.perfProfiler.overall(hours),
        window.nyra.perfProfiler.allProviderProfiles(hours),
        window.nyra.perfProfiler.waterfall(30),
      ])
      if (o.success) setOverall(o.result)
      if (p.success) setProviders(p.result)
      if (w.success) setWaterfall(w.result)
    } catch {}
  }

  useEffect(() => { fetchAll() }, [hours])

  // Waterfall bar rendering
  const maxLatency = Math.max(...waterfall.map(e => e.latencyMs), 1)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Timer size={16} className="text-gold-300" />
        <h2 className="text-sm font-semibold text-white/80">Performance Profiler</h2>
        <div className="ml-auto flex gap-1">
          {([1, 6, 24, 72] as number[]).map(h => (
            <button key={h} onClick={() => setHours(h)}
              className={`px-2 py-0.5 rounded text-[9px] font-medium ${hours === h ? 'bg-gold-400/15 text-gold-300' : 'text-white/20 hover:text-white/40'}`}>
              {h}h
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-2">
          {(['overview', 'waterfall', 'providers'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-lg text-[10px] font-medium ${tab === t ? 'bg-gold-400/15 text-gold-300' : 'text-white/25 hover:text-white/40'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* ── Overview Tab ─────────────────────────────────────────── */}
        {tab === 'overview' && overall && (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-4 gap-2">
              <StatCard label="Requests" value={String(overall.totalRequests)} icon={<Activity size={12} />} color="text-terra-300" />
              <StatCard label="Avg Latency" value={`${overall.avgLatency}ms`} icon={<Timer size={12} />} color="text-gold-300" />
              <StatCard label="P95 Latency" value={`${overall.p95Latency}ms`} icon={<TrendingUp size={12} />} color="text-gold-300" />
              <StatCard label="Error Rate" value={`${(overall.errorRate * 100).toFixed(1)}%`} icon={<AlertTriangle size={12} />} color={overall.errorRate > 0.05 ? 'text-blush-300' : 'text-sage-300'} />
            </div>

            {/* Throughput */}
            {overall.avgThroughput > 0 && (
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={12} className="text-gold-300/50" />
                  <span className="text-[10px] text-white/40">Avg Throughput</span>
                  <span className="text-[14px] font-medium text-gold-300/70 ml-auto">{overall.avgThroughput} tok/s</span>
                </div>
              </div>
            )}

            {/* Top models */}
            {overall.topModels.length > 0 && (
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                <h3 className="text-[10px] text-white/30 mb-2">Top Models</h3>
                <div className="space-y-1.5">
                  {overall.topModels.map(m => (
                    <div key={m.modelId} className="flex items-center gap-2">
                      <span className="text-[10px] text-white/50 font-mono flex-1 truncate">{m.modelId}</span>
                      <span className="text-[9px] text-white/20">{m.count} reqs</span>
                      <span className="text-[9px] text-white/15">{m.avgLatency}ms avg</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {overall.totalRequests === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-white/15 text-[11px]">
                <Timer size={20} className="mb-2 opacity-30" />
                No profiling data yet — requests will appear here
              </div>
            )}
          </>
        )}

        {/* ── Waterfall Tab ────────────────────────────────────────── */}
        {tab === 'waterfall' && (
          <div className="space-y-1">
            <div className="flex items-center text-[9px] text-white/20 px-2 mb-2">
              <span className="w-24">Provider</span>
              <span className="w-28">Model</span>
              <span className="flex-1">Latency</span>
              <span className="w-16 text-right">Tokens</span>
            </div>
            {waterfall.map(entry => (
              <div key={entry.id} className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/[0.02] group">
                <span className="text-[9px] text-white/30 w-24 truncate font-mono">{entry.providerId}</span>
                <span className="text-[9px] text-white/20 w-28 truncate font-mono">{entry.modelId}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-4 bg-white/[0.02] rounded overflow-hidden">
                    <div
                      className={`h-full rounded ${entry.error ? 'bg-blush-400/30' : entry.latencyMs > 3000 ? 'bg-gold-400/30' : 'bg-terra-400/30'}`}
                      style={{ width: `${Math.max(2, (entry.latencyMs / maxLatency) * 100)}%` }}
                    />
                  </div>
                  <span className={`text-[9px] font-mono w-12 text-right ${entry.latencyMs > 3000 ? 'text-gold-400/50' : 'text-white/30'}`}>
                    {entry.latencyMs}ms
                  </span>
                </div>
                <span className="text-[9px] text-white/15 w-16 text-right">
                  {entry.inputTokens + entry.outputTokens > 0 ? `${entry.inputTokens}→${entry.outputTokens}` : '-'}
                </span>
              </div>
            ))}
            {waterfall.length === 0 && (
              <div className="text-center text-[11px] text-white/15 py-8">No requests recorded yet</div>
            )}
          </div>
        )}

        {/* ── Providers Tab ────────────────────────────────────────── */}
        {tab === 'providers' && (
          <div className="space-y-3">
            {providers.map(p => (
              <div key={p.providerId} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-white/60 capitalize">{p.providerId}</span>
                  <span className="text-[9px] text-white/15 ml-auto">{p.totalRequests} requests</span>
                  <span className={`text-[9px] ${p.errorRate > 0.05 ? 'text-blush-400/50' : 'text-sage-400/40'}`}>
                    {(p.errorRate * 100).toFixed(1)}% errors
                  </span>
                </div>
                {p.latency.count > 0 && (
                  <div className="grid grid-cols-5 gap-2">
                    {(['p50', 'p75', 'p90', 'p95', 'p99'] as const).map(key => (
                      <div key={key} className="text-center">
                        <span className="text-[8px] text-white/20 block">{key.toUpperCase()}</span>
                        <span className={`text-[11px] font-mono ${key === 'p95' || key === 'p99' ? 'text-gold-300/50' : 'text-white/40'}`}>
                          {p.latency[key]}ms
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-4 text-[9px] text-white/20">
                  <span>Avg input: {Math.round(p.avgInputTokens)} tok</span>
                  <span>Avg output: {Math.round(p.avgOutputTokens)} tok</span>
                  {p.throughput.mean > 0 && <span>Throughput: {p.throughput.mean} tok/s</span>}
                </div>
              </div>
            ))}
            {providers.length === 0 && (
              <div className="text-center text-[11px] text-white/15 py-8">No provider data yet</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => (
  <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2.5 text-center">
    <div className={`${color} opacity-50 flex justify-center mb-1`}>{icon}</div>
    <div className={`text-[14px] font-medium ${color}`}>{value}</div>
    <div className="text-[8px] text-white/20 mt-0.5">{label}</div>
  </div>
)

export default PerformanceProfilerPanel
