import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  X,
  Zap,
  Play,
  Copy,
  Check,
  Star,
  TrendingUp,
  BarChart3,
  Clock,
} from 'lucide-react'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface BenchmarkModel {
  id: string
  label: string
  provider: 'openai' | 'anthropic' | 'google' | 'ollama'
  icon: string
}

interface BenchmarkResult {
  modelId: string
  ttft: number // Time to first token in ms
  tps: number // Tokens per second
  totalLatency: number // Total latency in ms
  qualityScore: number // 1-10
  inputTokens: number
  outputTokens: number
  outputSample: string
}

interface BenchmarkRun {
  id: string
  timestamp: Date
  category: string
  prompt: string
  results: BenchmarkResult[]
  isRunning?: boolean
}

type BenchmarkCategory = 'generation' | 'explanation' | 'bugdetection' | 'refactoring' | 'custom'

// ============================================================================
// CONSTANTS
// ============================================================================

const BENCHMARK_MODELS: BenchmarkModel[] = [
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', icon: '🟢' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet', provider: 'anthropic', icon: '🟠' },
  { id: 'gemini-2.0-flash', label: 'Gemini Flash', provider: 'google', icon: '🔵' },
  { id: 'llama3.2:3b', label: 'Llama 3.2 3B', provider: 'ollama', icon: '🏠' },
  { id: 'mistral:7b', label: 'Mistral 7B', provider: 'ollama', icon: '🏠' },
  { id: 'codestral:22b', label: 'Codestral 22B', provider: 'ollama', icon: '🏠' },
  { id: 'deepseek-coder:6.7b', label: 'DeepSeek Coder', provider: 'ollama', icon: '🏠' },
  { id: 'phi4:14b', label: 'Phi-4 14B', provider: 'ollama', icon: '🏠' },
]

const BENCHMARK_CATEGORIES: Record<BenchmarkCategory, { label: string; prompt: string }> = {
  generation: {
    label: 'Code Generation',
    prompt: 'Write a function that calculates the factorial of a number with memoization and error handling for invalid inputs.',
  },
  explanation: {
    label: 'Code Explanation',
    prompt: 'Explain this code: const memoize = (fn) => { const cache = {}; return (...args) => { const key = JSON.stringify(args); return cache[key] ?? (cache[key] = fn(...args)); }; };',
  },
  bugdetection: {
    label: 'Bug Detection',
    prompt: 'Find all bugs in this code: function processArray(arr) { for (let i = 1; i <= arr.length; i++) { console.log(arr[i]); } }',
  },
  refactoring: {
    label: 'Refactoring',
    prompt: 'Optimize and refactor this code: let result = []; for (let i = 0; i < arr.length; i++) { if (arr[i] > 5) { result.push(arr[i] * 2); } }',
  },
  custom: {
    label: 'Custom Prompt',
    prompt: '',
  },
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const generateBenchmarkResult = (modelId: string, category: BenchmarkCategory): BenchmarkResult => {
  const baselineLatency: Record<string, number> = {
    'gpt-4o': 450,
    'claude-sonnet-4-20250514': 520,
    'gemini-2.0-flash': 380,
    'llama3.2:3b': 200,
    'mistral:7b': 250,
    'codestral:22b': 300,
    'deepseek-coder:6.7b': 280,
    'phi4:14b': 220,
  }

  const baseLatency = baselineLatency[modelId] || 300
  const variance = Math.random() * 200 - 100
  const ttft = Math.max(50, baseLatency + variance)
  const tps = 15 + Math.random() * 20
  const totalLatency = ttft + (1500 + Math.random() * 1000)
  const qualityScore = 6 + Math.random() * 4
  const inputTokens = 45 + Math.random() * 15
  const outputTokens = 120 + Math.random() * 80

  const sampleOutputs: Record<BenchmarkCategory, string> = {
    generation:
      'function factorial(n) {\n  if (n < 0) throw new Error("Invalid input");\n  const cache = {};\n  const compute = (x) => {\n    if (x <= 1) return 1;\n    if (cache[x]) return cache[x];\n    cache[x] = x * compute(x - 1);\n    return cache[x];\n  };\n  return compute(n);\n}',
    explanation:
      'This is a memoization function that caches results of function calls based on their arguments. It stores computed values in a cache object using JSON-stringified arguments as keys, returning cached results on subsequent calls with identical arguments.',
    bugdetection:
      'Bug 1: Loop starts at i=1, causing arr[0] to be skipped. Bug 2: Loop condition is i<=arr.length, causing arr[arr.length] (undefined) to be accessed. Fix: Use i=0 and i<arr.length.',
    refactoring: 'const result = arr.filter(x => x > 5).map(x => x * 2);',
    custom: 'Model-generated response based on custom prompt.',
  }

  return {
    modelId,
    ttft,
    tps,
    totalLatency,
    qualityScore,
    inputTokens: Math.round(inputTokens),
    outputTokens: Math.round(outputTokens),
    outputSample: sampleOutputs[category],
  }
}

const getLatencyColor = (latency: number): string => {
  if (latency < 2000) return 'sage' // green - fast
  if (latency < 5000) return 'gold' // champagne - moderate
  return 'blush' // red - slow
}

// ============================================================================
// ANIMATED COUNTER COMPONENT
// ============================================================================

const AnimatedCounter: React.FC<{ value: number; decimals?: number; duration?: number }> = ({
  value,
  decimals = 0,
  duration = 800,
}) => {
  const [displayValue, setDisplayValue] = useState(0)
  const countRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (countRef.current) clearInterval(countRef.current)

    const startValue = 0
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const current = startValue + (value - startValue) * progress

      setDisplayValue(current)

      if (progress < 1) {
        countRef.current = setTimeout(animate, 16)
      }
    }

    animate()

    return () => {
      if (countRef.current) clearInterval(countRef.current)
    }
  }, [value, duration, decimals])

  return <span>{displayValue.toFixed(decimals)}</span>
}

// ============================================================================
// STAR RATING COMPONENT
// ============================================================================

const StarRating: React.FC<{ score: number }> = ({ score }) => {
  const fullStars = Math.floor(score)
  const hasHalf = score % 1 >= 0.5

  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={14}
          className={
            i < fullStars
              ? 'fill-gold-500 text-gold-500'
              : i === fullStars && hasHalf
                ? 'text-gold-500'
                : 'text-white/[0.15]'
          }
        />
      ))}
    </div>
  )
}

// ============================================================================
// PROGRESS BAR COMPONENT
// ============================================================================

const ProgressBar: React.FC<{ progress: number; modelLabel: string }> = ({ progress, modelLabel }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between items-center">
      <span className="text-xs font-medium text-white/60">{modelLabel}</span>
      <span className="text-xs text-white/40">{Math.round(progress)}%</span>
    </div>
    <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-terra-500 to-gold-500 transition-all duration-300"
        style={{ width: `${progress}%` }}
      />
    </div>
  </div>
)

// ============================================================================
// METRICS CARD COMPONENT
// ============================================================================

const MetricCard: React.FC<{ label: string; value: string | number; unit?: string; highlight?: boolean }> = ({
  label,
  value,
  unit,
  highlight,
}) => (
  <div className={`space-y-2 p-3 rounded-lg ${highlight ? 'bg-sage-500/[0.15] border border-sage-500/30' : 'bg-white/[0.04] border border-white/[0.08]'}`}>
    <span className="text-xs font-medium text-white/50 uppercase tracking-wider">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className="text-lg font-bold text-white">{value}</span>
      {unit && <span className="text-xs text-white/40">{unit}</span>}
    </div>
  </div>
)

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface CodeBenchmarkPanelProps {
  onClose: () => void
}

export const CodeBenchmarkPanel: React.FC<CodeBenchmarkPanelProps> = ({ onClose }) => {
  const [selectedCategory, setSelectedCategory] = useState<BenchmarkCategory>('generation')
  const [customPrompt, setCustomPrompt] = useState('')
  const [selectedModels, setSelectedModels] = useState<string[]>(['gpt-4o', 'claude-sonnet-4-20250514'])
  const [isRunning, setIsRunning] = useState(false)
  const [currentRun, setCurrentRun] = useState<BenchmarkRun | null>(null)
  const [benchmarkHistory, setBenchmarkHistory] = useState<BenchmarkRun[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [copiedRunId, setCopiedRunId] = useState<string | null>(null)

  const modelProgress = useRef<Record<string, number>>({})

  // Handle model selection
  const toggleModelSelection = useCallback((modelId: string) => {
    setSelectedModels((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId)
      }
      if (prev.length < 4) {
        return [...prev, modelId]
      }
      return prev
    })
  }, [])

  // Simulate benchmark execution
  const runBenchmark = useCallback(async () => {
    if (selectedModels.length === 0) return

    const category = selectedCategory
    const prompt =
      selectedCategory === 'custom' && customPrompt ? customPrompt : BENCHMARK_CATEGORIES[category].prompt

    const runId = Date.now().toString()
    const newRun: BenchmarkRun = {
      id: runId,
      timestamp: new Date(),
      category: BENCHMARK_CATEGORIES[category].label,
      prompt,
      results: [],
      isRunning: true,
    }

    setCurrentRun(newRun)
    setIsRunning(true)
    modelProgress.current = selectedModels.reduce((acc, id) => ({ ...acc, [id]: 0 }), {})

    // Simulate progressive results
    const results: BenchmarkResult[] = []
    let completedCount = 0

    for (const modelId of selectedModels) {
      const delay = Math.random() * 2000 + 1000 // 1-3 second delay per model

      setTimeout(() => {
        if (modelProgress.current[modelId] < 100) {
          // Simulate progress
          const progressInterval = setInterval(() => {
            modelProgress.current[modelId] = Math.min(modelProgress.current[modelId] + Math.random() * 40, 95)
            setCurrentRun((prev) => (prev ? { ...prev } : null))
          }, 150)

          setTimeout(() => {
            clearInterval(progressInterval)
            modelProgress.current[modelId] = 100

            const result = generateBenchmarkResult(modelId, category)
            results.push(result)
            completedCount++

            if (completedCount === selectedModels.length) {
              setIsRunning(false)
              const finalRun: BenchmarkRun = {
                ...newRun,
                results,
                isRunning: false,
              }
              setCurrentRun(finalRun)
              setBenchmarkHistory((prev) => [finalRun, ...prev.slice(0, 4)])
            }

            setCurrentRun((prev) =>
              prev ? { ...prev, results: [...prev.results, result].sort((a, b) => a.ttft - b.ttft) } : null,
            )
          }, 1500)
        }
      }, delay)
    }
  }, [selectedModels, selectedCategory, customPrompt])

  // Export results as markdown
  const exportResults = useCallback(() => {
    if (!currentRun || currentRun.results.length === 0) return

    const lines = [
      `# Code Benchmark Results`,
      `**Category:** ${currentRun.category}`,
      `**Timestamp:** ${currentRun.timestamp.toLocaleString()}`,
      `**Prompt:** ${currentRun.prompt}`,
      ``,
      `## Performance Metrics`,
      ``,
      `| Model | TTFT (ms) | TPS | Latency (ms) | Quality | Tokens |`,
      `|-------|-----------|-----|--------------|---------|--------|`,
      ...currentRun.results.map(
        (r) =>
          `| ${BENCHMARK_MODELS.find((m) => m.id === r.modelId)?.label || r.modelId} | ${r.ttft.toFixed(0)} | ${r.tps.toFixed(1)} | ${r.totalLatency.toFixed(0)} | ${r.qualityScore.toFixed(1)}/10 | ${r.inputTokens}/${r.outputTokens} |`,
      ),
    ].join('\n')

    navigator.clipboard.writeText(lines)
    setCopiedRunId(currentRun.id)
    setTimeout(() => setCopiedRunId(null), 2000)
  }, [currentRun])

  // Get current prompt
  const currentPrompt =
    selectedCategory === 'custom' && customPrompt ? customPrompt : BENCHMARK_CATEGORIES[selectedCategory].prompt

  // Calculate winners per metric
  const winners = useMemo(() => {
    if (!currentRun || currentRun.results.length === 0) return {}

    const metrics = {
      ttft: 'min' as const,
      tps: 'max' as const,
      totalLatency: 'min' as const,
      qualityScore: 'max' as const,
    }

    return Object.entries(metrics).reduce(
      (acc, [metric, type]) => {
        const sorted = [...currentRun.results].sort((a, b) => {
          const aVal = a[metric as keyof BenchmarkResult] as number
          const bVal = b[metric as keyof BenchmarkResult] as number
          return type === 'min' ? aVal - bVal : bVal - aVal
        })
        acc[metric] = sorted[0]?.modelId
        return acc
      },
      {} as Record<string, string | undefined>,
    )
  }, [currentRun])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[900px] max-h-[85vh] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
        {/* HEADER */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <Zap size={18} className="text-terra-500" />
            <h2 className="text-sm font-semibold text-white/80">Code Benchmark Panel</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/[0.08] transition-colors text-white/60 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-6">
            {/* CATEGORY SELECTION */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Benchmark Category</label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(BENCHMARK_CATEGORIES).map(([key, cat]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedCategory(key as BenchmarkCategory)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      selectedCategory === key
                        ? 'bg-terra-500/20 border border-terra-500/50 text-terra-300'
                        : 'bg-white/[0.04] border border-white/[0.08] text-white/60 hover:bg-white/[0.08]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* CUSTOM PROMPT INPUT */}
            {selectedCategory === 'custom' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Custom Prompt</label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Enter your custom benchmark prompt..."
                  className="w-full h-24 px-3 py-2 bg-black/40 border border-white/[0.06] rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-terra-500/50 resize-none"
                />
              </div>
            )}

            {/* PROMPT DISPLAY */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Active Prompt</label>
              <pre className="p-3 bg-black/40 border border-white/[0.06] rounded-lg text-xs text-white/80 font-mono overflow-x-auto max-h-20">
                {currentPrompt}
              </pre>
            </div>

            {/* MODEL SELECTION */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Select Models ({selectedModels.length}/4)
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BENCHMARK_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => toggleModelSelection(model.id)}
                    className={`p-2.5 rounded-lg border transition-all text-left ${
                      selectedModels.includes(model.id)
                        ? 'bg-terra-500/15 border-terra-500/40'
                        : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(model.id)}
                        onChange={() => {}}
                        className="w-4 h-4 rounded accent-terra-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{model.icon}</span>
                          <span className="text-xs font-medium text-white/80 truncate">{model.label}</span>
                        </div>
                        <span className="text-xs text-white/40 capitalize">{model.provider}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* RUN BUTTON */}
            <button
              onClick={runBenchmark}
              disabled={isRunning || selectedModels.length === 0}
              className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                isRunning || selectedModels.length === 0
                  ? 'bg-white/[0.08] text-white/40 cursor-not-allowed'
                  : 'bg-gradient-to-r from-terra-500 to-gold-500 text-white hover:shadow-lg hover:shadow-terra-500/20'
              }`}
            >
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Running Benchmark...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Run Benchmark
                </>
              )}
            </button>

            {/* PROGRESS BARS */}
            {isRunning && currentRun && (
              <div className="space-y-3 p-4 bg-white/[0.04] rounded-lg border border-white/[0.08]">
                <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Running Models</p>
                <div className="space-y-3">
                  {selectedModels.map((modelId) => (
                    <ProgressBar
                      key={modelId}
                      progress={modelProgress.current[modelId] || 0}
                      modelLabel={BENCHMARK_MODELS.find((m) => m.id === modelId)?.label || modelId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* RESULTS */}
            {currentRun && currentRun.results.length > 0 && !isRunning && (
              <div className="space-y-4">
                {/* METRICS GRID */}
                <div className="grid grid-cols-2 gap-2">
                  {currentRun.results.map((result) => {
                    const model = BENCHMARK_MODELS.find((m) => m.id === result.modelId)
                    const colorClass = getLatencyColor(result.totalLatency)
                    const isWinnerTTFT = winners.ttft === result.modelId
                    const isWinnerTPS = winners.tps === result.modelId
                    const isWinnerLatency = winners.totalLatency === result.modelId
                    const isWinnerQuality = winners.qualityScore === result.modelId

                    return (
                      <div key={result.modelId} className="space-y-2 p-3 bg-white/[0.04] rounded-lg border border-white/[0.08]">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg">{model?.icon}</span>
                          <span className="text-xs font-bold text-white">{model?.label}</span>
                        </div>

                        <MetricCard
                          label="TTFT"
                          value={<AnimatedCounter value={result.ttft} decimals={0} />}
                          unit="ms"
                          highlight={isWinnerTTFT}
                        />

                        <MetricCard
                          label="TPS"
                          value={<AnimatedCounter value={result.tps} decimals={1} />}
                          unit="tok/s"
                          highlight={isWinnerTPS}
                        />

                        <MetricCard
                          label={`Latency (${colorClass})`}
                          value={<AnimatedCounter value={result.totalLatency} decimals={0} />}
                          unit="ms"
                          highlight={isWinnerLatency}
                        />

                        <div className="space-y-2 p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                          <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Quality</span>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-bold text-white">
                                <AnimatedCounter value={result.qualityScore} decimals={1} />
                                /10
                              </span>
                              {isWinnerQuality && <Star size={14} className="fill-sage-500 text-sage-500" />}
                            </div>
                            <StarRating score={result.qualityScore} />
                          </div>
                        </div>

                        <MetricCard
                          label="Tokens"
                          value={`${result.inputTokens}/${result.outputTokens}`}
                          unit="in/out"
                        />
                      </div>
                    )
                  })}
                </div>

                {/* CODE OUTPUT COMPARISON */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Output Sample</p>
                  <div className="grid grid-cols-2 gap-2">
                    {currentRun.results.map((result) => {
                      const model = BENCHMARK_MODELS.find((m) => m.id === result.modelId)
                      return (
                        <div key={result.modelId} className="space-y-1.5">
                          <div className="text-xs font-medium text-white/60">{model?.label}</div>
                          <pre className="p-2.5 bg-black/40 border border-white/[0.06] rounded-lg text-xs text-white/70 font-mono overflow-x-auto max-h-32">
                            {result.outputSample}
                          </pre>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* EXPORT BUTTON */}
                <button
                  onClick={exportResults}
                  className="w-full py-2 px-4 rounded-lg bg-white/[0.08] border border-white/[0.08] text-white/60 hover:bg-white/[0.12] text-xs font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {copiedRunId === currentRun.id ? (
                    <>
                      <Check size={14} className="text-sage-400" />
                      Copied to Clipboard
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Export as Markdown
                    </>
                  )}
                </button>
              </div>
            )}

            {/* HISTORY */}
            {benchmarkHistory.length > 0 && (
              <div className="space-y-2 border-t border-white/[0.06] pt-4">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-white/[0.04] rounded-lg transition-colors text-xs font-semibold text-white/60"
                >
                  <span className="flex items-center gap-2 uppercase tracking-wider">
                    <TrendingUp size={14} />
                    Benchmark History ({benchmarkHistory.length})
                  </span>
                  <span className={`transition-transform ${showHistory ? 'rotate-180' : ''}`}>▼</span>
                </button>

                {showHistory && (
                  <div className="space-y-2 mt-2">
                    {benchmarkHistory.map((run) => (
                      <div key={run.id} className="p-2.5 bg-white/[0.04] rounded-lg border border-white/[0.08] text-xs">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white/80 truncate">{run.category}</p>
                            <p className="text-white/40 text-xs">{run.timestamp.toLocaleTimeString()}</p>
                          </div>
                          <span className="text-white/50 font-medium">{run.results.length} models</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* EMPTY STATE */}
            {(!currentRun || currentRun.results.length === 0) && !isRunning && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 size={32} className="text-white/20 mb-3" />
                <p className="text-sm text-white/50">Run a benchmark to see results and metrics</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CodeBenchmarkPanel
