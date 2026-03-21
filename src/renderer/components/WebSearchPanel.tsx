import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Search,
  X,
  ExternalLink,
  Copy,
  Check,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  ZoomIn,
} from 'lucide-react'

// ============================================================================
// Types & Interfaces
// ============================================================================

interface SearchResult {
  id: string
  title: string
  url: string
  snippet: string
  source: SearchEngine
  relevance: number
  fullContent?: string
}

type SearchEngine = 'google' | 'bing' | 'stackoverflow' | 'github' | 'arxiv' | 'npm' | 'duckduckgo'
type SearchMode = 'web' | 'code' | 'docs' | 'academic'

interface SearchQuery {
  query: string
  engine: SearchEngine
  timestamp: number
  resultCount: number
}

interface WebSearchPanelProps {
  onClose: () => void
  onInjectContext?: (results: SearchResult[]) => void
}

// ============================================================================
// Engine Configuration
// ============================================================================

const ENGINE_CONFIG: Record<SearchEngine, { label: string; color: string; icon: string }> = {
  google: { label: 'Google', color: 'terra-500', icon: '🔍' },
  bing: { label: 'Bing', color: 'terra-400', icon: '🌐' },
  duckduckgo: { label: 'DuckDuckGo', color: 'sage-500', icon: '🦆' },
  stackoverflow: { label: 'StackOverflow', color: 'gold-500', icon: '📚' },
  github: { label: 'GitHub', color: 'sage-400', icon: '💻' },
  arxiv: { label: 'arXiv', color: 'terra-600', icon: '📄' },
  npm: { label: 'npm', color: 'blush-300', icon: '📦' },
}

// ============================================================================
// Mock Data Generator
// ============================================================================

const mockDatabaseResults: Record<string, SearchResult[]> = {
  react: [
    {
      id: '1',
      title: 'React Official Documentation',
      url: 'https://react.dev',
      snippet: 'Learn React with the official documentation. Covers hooks, components, state management, and best practices for modern React development.',
      source: 'google',
      relevance: 98,
      fullContent: '# React Documentation\n\nReact is a JavaScript library for building user interfaces with reusable components and efficient rendering. Learn hooks, state, effects, context API, and performance optimization.',
    },
    {
      id: '2',
      title: 'useCallback Hook Performance Optimization',
      url: 'https://react.dev/reference/react/useCallback',
      snippet: 'useCallback is a React Hook that memoizes a callback function. Prevent unnecessary re-renders and optimize performance in React applications.',
      source: 'google',
      relevance: 95,
      fullContent: '## useCallback Hook\n\nPrevent unnecessary re-renders by memoizing callback functions. Returns a memoized version of the callback that only changes if one of the dependencies has changed.',
    },
    {
      id: '3',
      title: 'React Hooks Best Practices - StackOverflow',
      url: 'https://stackoverflow.com/questions/54963248/how-to-use-react-hooks-properly',
      snippet: 'Best practices for using React Hooks including dependency arrays, cleanup functions, and custom hooks patterns. Common mistakes and solutions discussed.',
      source: 'stackoverflow',
      relevance: 89,
      fullContent: '### React Hooks Best Practices\n\n1. Always use the correct dependency array\n2. Clean up side effects in useEffect\n3. Create custom hooks for reusable logic\n4. Never call hooks conditionally',
    },
    {
      id: '4',
      title: 'facebook/react - GitHub Repository',
      url: 'https://github.com/facebook/react',
      snippet: 'Official React repository on GitHub. Source code, issues, discussions, and contribution guidelines for the React library.',
      source: 'github',
      relevance: 92,
      fullContent: '# React GitHub Repository\n\nThe official React source code repository. Contains the complete implementation, test suites, and documentation for React.',
    },
    {
      id: '5',
      title: 'React Performance: useCallback vs useMemo',
      url: 'https://dev.to/articles/react-performance-callbacks-memoization',
      snippet: 'Understanding the differences between useCallback and useMemo for performance optimization. When to use each hook and real-world examples.',
      source: 'google',
      relevance: 88,
      fullContent: '## Performance Hooks Comparison\n\nuseCallback memoizes functions, useMemo memoizes values. Both prevent unnecessary recalculations and re-renders.',
    },
    {
      id: '6',
      title: 'React Query Library - npm Package',
      url: 'https://www.npmjs.com/package/@tanstack/react-query',
      snippet: 'Powerful async state management for React. Handles data fetching, caching, and synchronization for your application.',
      source: 'npm',
      relevance: 85,
      fullContent: '# React Query (@tanstack/react-query)\n\nA library for managing server state in React. Provides automatic caching, background refetching, and synchronization.',
    },
  ],
  typescript: [
    {
      id: '7',
      title: 'TypeScript Handbook - Official',
      url: 'https://www.typescriptlang.org/docs/',
      snippet: 'Complete TypeScript documentation. Learn types, interfaces, generics, decorators, and advanced TypeScript features.',
      source: 'google',
      relevance: 99,
      fullContent: '# TypeScript Handbook\n\nThe official TypeScript documentation covering all language features, compiler options, and best practices.',
    },
    {
      id: '8',
      title: 'Advanced TypeScript Patterns - StackOverflow',
      url: 'https://stackoverflow.com/questions/39494689/advanced-typescript-patterns',
      snippet: 'Advanced TypeScript design patterns including utility types, generics, conditional types, and type guards.',
      source: 'stackoverflow',
      relevance: 91,
      fullContent: '## Advanced Patterns\n\nConditional types, mapped types, utility type composition, and advanced generic patterns for type-safe applications.',
    },
    {
      id: '9',
      title: 'TypeScript Deep Dive - Free eBook',
      url: 'https://basarat.gitbook.io/typescript/',
      snippet: 'Comprehensive TypeScript guide covering fundamentals to advanced concepts. Free, community-driven resource.',
      source: 'google',
      relevance: 87,
      fullContent: '# TypeScript Deep Dive\n\nA complete guide to TypeScript from basics to advanced patterns. Covers types, modules, namespaces, and ecosystem.',
    },
  ],
  'machine learning': [
    {
      id: '10',
      title: 'Machine Learning by Andrew Ng - Coursera',
      url: 'https://coursera.org/learn/machine-learning',
      snippet: 'Comprehensive machine learning course. Cover supervised learning, unsupervised learning, neural networks, and practical applications.',
      source: 'google',
      relevance: 94,
      fullContent: '# ML Course Overview\n\nLearn machine learning fundamentals, algorithms, implementation, and best practices from industry experts.',
    },
    {
      id: '11',
      title: 'Deep Learning Architectures - arXiv Paper',
      url: 'https://arxiv.org/abs/1512.03385',
      snippet: 'ResNet: Deep Residual Learning for Image Recognition. Revolutionary paper on deep neural network architectures.',
      source: 'arxiv',
      relevance: 93,
      fullContent: '## ResNet Architecture\n\nIntroduces residual connections enabling training of very deep networks. Fundamental work in deep learning.',
    },
  ],
}

const queryContext: Record<string, string[]> = {
  react: ['react hooks', 'react performance', 'react context api', 'react state management'],
  typescript: ['typescript generics', 'typescript types', 'typescript utility types', 'typescript decorators'],
  'machine learning': ['machine learning algorithms', 'neural networks', 'deep learning', 'computer vision'],
}

function generateSuggestions(query: string): string[] {
  const lower = query.toLowerCase()
  const baseKey = Object.keys(queryContext).find((key) => lower.includes(key.split(' ')[0])) || query

  if (queryContext[baseKey]) {
    return queryContext[baseKey]
      .filter((s) => !s.includes(lower) && lower.length > 0)
      .slice(0, 3)
  }

  return [
    `${query} best practices`,
    `${query} tutorial`,
    `${query} examples`,
  ].filter((s) => s.length > 0)
}

function simulateSearch(
  query: string,
  engine: SearchEngine,
  mode: SearchMode
): Promise<SearchResult[]> {
  return new Promise((resolve) => {
    const delay = Math.random() * 1000 + 500
    const timer = setTimeout(() => {
      const baseKey = Object.keys(mockDatabaseResults).find((key) =>
        query.toLowerCase().includes(key)
      )
      const results = baseKey ? mockDatabaseResults[baseKey] : mockDatabaseResults.react

      const filtered = results.filter((r) => {
        if (engine !== 'google' && r.source !== engine) return false
        if (mode === 'code' && !['github', 'stackoverflow'].includes(r.source)) return false
        if (mode === 'academic' && r.source !== 'arxiv') return false
        return true
      })

      resolve(
        filtered.map((r) => ({
          ...r,
          relevance: Math.max(50, r.relevance - Math.random() * 20),
        }))
      )
    }, delay)
    return () => clearTimeout(timer)
  })
}

// ============================================================================
// Component
// ============================================================================

export const WebSearchPanel: React.FC<WebSearchPanelProps> = ({ onClose, onInjectContext }) => {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('web')
  const [selectedEngines, setSelectedEngines] = useState<SearchEngine[]>([
    'google',
    'stackoverflow',
    'github',
  ])
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [searchHistory, setSearchHistory] = useState<SearchQuery[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = useMemo(() => generateSuggestions(query), [query])

  const selectedResult = useMemo(
    () => results.find((r) => r.id === selectedResultId),
    [results, selectedResultId]
  )

  const selectedResultsList = useMemo(
    () => results.filter((r) => selectedResults.has(r.id)),
    [results, selectedResults]
  )

  const tokenEstimate = useMemo(() => {
    return Math.round(selectedResultsList.length * 800)
  }, [selectedResultsList.length])

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return

    setIsLoading(true)
    setResults([])
    setSelectedResults(new Set())
    setSelectedResultId(null)

    const engineToUse = selectedEngines.length > 0 ? selectedEngines[0] : 'google'

    try {
      const newResults = await simulateSearch(searchQuery, engineToUse, mode)
      setResults(newResults)

      setSearchHistory((prev) => [
        {
          query: searchQuery,
          engine: engineToUse,
          timestamp: Date.now(),
          resultCount: newResults.length,
        },
        ...prev.slice(0, 4),
      ])
    } finally {
      setIsLoading(false)
    }
  }, [selectedEngines, mode])

  const handleToggleEngine = useCallback((engine: SearchEngine) => {
    setSelectedEngines((prev) =>
      prev.includes(engine)
        ? prev.filter((e) => e !== engine)
        : [...prev, engine]
    )
  }, [])

  const handleToggleResult = useCallback((resultId: string) => {
    setSelectedResults((prev) => {
      const next = new Set(prev)
      if (next.has(resultId)) {
        next.delete(resultId)
      } else {
        next.add(resultId)
      }
      return next
    })
  }, [])

  const handleCopyToClipboard = useCallback(async (text: string, resultId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(resultId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [])

  const handleInjectContext = useCallback(() => {
    if (onInjectContext && selectedResultsList.length > 0) {
      onInjectContext(selectedResultsList)
      onClose()
    }
  }, [selectedResultsList, onInjectContext, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSearch(query)
      }
    },
    [query, handleSearch]
  )

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[900px] max-h-[85vh] bg-nyra-surface rounded-2xl border border-nyra-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-terra-400" />
            <h2 className="text-lg font-semibold text-white">Web Search</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Input Section */}
          <div className="flex-none border-b border-white/[0.06] p-5 space-y-4">
            {/* Mode Tabs */}
            <div className="flex gap-2">
              {(['web', 'code', 'docs', 'academic'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    mode === m
                      ? 'bg-terra-500 text-white'
                      : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'
                  }`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search across web, code, docs..."
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.06] rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-terra-400/30 focus:border-terra-400 transition-all"
              />
              <div className="absolute right-3 top-3 text-white/40 text-xs">{query.length}/200</div>
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && query.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => setQuery(suggestion)}
                    className="px-3 py-2 text-sm text-left text-white/70 bg-white/[0.04] rounded-lg border border-white/[0.06] hover:bg-white/[0.08] hover:border-terra-400/30 transition-all truncate"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Engine Pills */}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ENGINE_CONFIG) as SearchEngine[]).map((engine) => (
                <button
                  key={engine}
                  onClick={() => handleToggleEngine(engine)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                    selectedEngines.includes(engine)
                      ? `bg-${ENGINE_CONFIG[engine].color} text-white`
                      : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'
                  }`}
                >
                  <span>{ENGINE_CONFIG[engine].icon}</span>
                  {ENGINE_CONFIG[engine].label}
                </button>
              ))}
            </div>

            {/* Search Button & History Toggle */}
            <div className="flex gap-3">
              <button
                onClick={() => handleSearch(query)}
                disabled={isLoading || !query.trim()}
                className="flex-1 px-4 py-2.5 bg-terra-500 hover:bg-terra-600 disabled:bg-white/[0.04] disabled:text-white/40 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Search (⌘↵)
                  </>
                )}
              </button>
              {searchHistory.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-white rounded-lg transition-all flex items-center gap-2"
                >
                  <Clock className="w-4 h-4" />
                  {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              )}
            </div>

            {/* Search History */}
            {showHistory && searchHistory.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                {searchHistory.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setQuery(item.query)
                      handleSearch(item.query)
                      setShowHistory(false)
                    }}
                    className="w-full px-3 py-2 text-left text-sm bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.06] transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white/80 truncate group-hover:text-white transition-colors">
                        {item.query}
                      </span>
                      <span className="text-white/40 text-xs ml-2 flex-shrink-0">
                        {item.resultCount} results
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="flex-1 flex gap-5 overflow-hidden p-5">
            {/* Results List */}
            <div
              className={`flex-1 overflow-y-auto space-y-3 ${
                selectedResult ? 'w-1/2' : 'w-full'
              }`}
            >
              {isLoading ? (
                // Skeleton Loaders
                Array.from({ length: 5 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-lg border border-white/[0.06] bg-white/[0.02] space-y-3"
                  >
                    <div className="h-4 bg-white/[0.04] rounded animate-pulse" />
                    <div className="h-3 bg-white/[0.04] rounded w-4/5 animate-pulse" />
                    <div className="h-3 bg-white/[0.04] rounded w-3/4 animate-pulse" />
                  </div>
                ))
              ) : results.length === 0 ? (
                // Empty State
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <ZoomIn className="w-12 h-12 text-white/20 mb-3" />
                  <p className="text-white/60">
                    {query ? 'No results found. Try a different query.' : 'Enter a search query to get started.'}
                  </p>
                </div>
              ) : (
                // Results Cards
                results.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => setSelectedResultId(result.id)}
                    className={`group p-4 rounded-lg border-2 transition-all cursor-pointer ${
                      selectedResults.has(result.id)
                        ? 'border-terra-500 bg-white/[0.06]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.08]'
                    } ${selectedResult?.id === result.id ? 'ring-2 ring-terra-400/30' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleResult(result.id)
                        }}
                        className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border border-white/[0.2] bg-white/[0.04] flex items-center justify-center hover:bg-white/[0.08] transition-all"
                      >
                        {selectedResults.has(result.id) && (
                          <Check className="w-3 h-3 text-terra-400" />
                        )}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-semibold text-white group-hover:text-terra-300 transition-colors line-clamp-2">
                            {result.title}
                          </h3>
                          <span className="text-xs px-2 py-1 rounded-full bg-white/[0.08] text-white/60 flex-shrink-0">
                            {result.relevance.toFixed(0)}%
                          </span>
                        </div>

                        <p className="text-xs text-white/50 mb-2 truncate">
                          {result.url.replace(/^https?:\/\/(www\.)?/, '')}
                        </p>

                        <p className="text-sm text-white/70 line-clamp-2">{result.snippet}</p>

                        <div className="mt-2 flex items-center justify-between">
                          <span
                            className={`text-xs px-2 py-1 rounded-full bg-${
                              ENGINE_CONFIG[result.source].color
                            }/20 text-white/70`}
                          >
                            {ENGINE_CONFIG[result.source].label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Preview Panel */}
            {selectedResult && !isLoading && (
              <div className="w-1/2 flex-none flex flex-col border-l border-white/[0.06] pl-5 overflow-hidden">
                <div className="space-y-4 overflow-y-auto flex-1">
                  <div>
                    <h2 className="text-lg font-semibold text-white mb-2">{selectedResult.title}</h2>
                    <a
                      href={selectedResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-terra-400 hover:text-terra-300 flex items-center gap-1.5 transition-colors"
                    >
                      {selectedResult.url.replace(/^https?:\/\/(www\.)?/, '')}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="border-t border-white/[0.06] pt-4">
                    <h3 className="text-xs font-semibold text-white/60 uppercase mb-2">Snippet</h3>
                    <p className="text-sm text-white/70 leading-relaxed">{selectedResult.snippet}</p>
                  </div>

                  <div className="border-t border-white/[0.06] pt-4">
                    <h3 className="text-xs font-semibold text-white/60 uppercase mb-2">Content Preview</h3>
                    <div className="text-sm text-white/70 bg-white/[0.02] rounded p-3 border border-white/[0.06]">
                      {selectedResult.fullContent || selectedResult.snippet}
                    </div>
                  </div>

                  <div className="border-t border-white/[0.06] pt-4 space-y-2">
                    <button
                      onClick={() =>
                        handleCopyToClipboard(
                          `${selectedResult.title}\n${selectedResult.url}\n\n${selectedResult.snippet}`,
                          selectedResult.id
                        )
                      }
                      className="w-full px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-white rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      {copiedId === selectedResult.id ? (
                        <>
                          <Check className="w-4 h-4 text-sage-400" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy to Clipboard
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        handleToggleResult(selectedResult.id)
                      }}
                      className={`w-full px-3 py-2 rounded-lg transition-all text-sm font-medium ${
                        selectedResults.has(selectedResult.id)
                          ? 'bg-terra-500 text-white hover:bg-terra-600'
                          : 'bg-white/[0.04] text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      {selectedResults.has(selectedResult.id)
                        ? 'Added to Context'
                        : 'Add to Context'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Context Injection Bar */}
          {selectedResultsList.length > 0 && (
            <div className="flex-none border-t border-white/[0.06] bg-white/[0.02] p-4 flex items-center justify-between">
              <div className="text-sm text-white/70">
                <span className="font-semibold text-white">{selectedResultsList.length}</span> sources
                selected · <span className="font-semibold text-white">~{tokenEstimate}</span> tokens
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedResults(new Set())
                    setSelectedResultId(null)
                  }}
                  className="px-4 py-2 text-white/60 hover:text-white text-sm transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={handleInjectContext}
                  className="px-4 py-2 bg-terra-500 hover:bg-terra-600 text-white rounded-lg font-medium text-sm transition-all"
                >
                  Inject into Chat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WebSearchPanel
