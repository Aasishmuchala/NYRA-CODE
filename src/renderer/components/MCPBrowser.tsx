/**
 * MCP Server Browser — Discover and manage MCP servers
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Server, Search, Check, Plus, X, Loader2, ExternalLink,
  Slack, Github, Database, FileText, Shield, Terminal, Zap,
} from 'lucide-react'
import type { McpServerConfig } from '../../preload/index'

interface MCPServerDef {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  command: string
  args: string[]
  env?: Record<string, string>
  category: 'communication' | 'development' | 'productivity' | 'data' | 'system'
  popular: boolean
  docs?: string
}

interface Props {
  onClose: () => void
}

// ── Hardcoded Popular MCP Servers ──────────────────────────────────────────
const MCP_SERVERS: MCPServerDef[] = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send and read Slack messages, manage channels and threads',
    icon: <Slack className="w-6 h-6 text-blue-400" />,
    command: 'npx',
    args: ['@anthropic-ai/mcp-server-slack'],
    category: 'communication',
    popular: true,
    docs: 'https://github.com/anthropics/mcp-server-slack',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Create issues, manage repos, search code and pull requests',
    icon: <Github className="w-6 h-6 text-white/80" />,
    command: 'npx',
    args: ['@anthropic-ai/mcp-server-github'],
    category: 'development',
    popular: true,
    docs: 'https://github.com/anthropics/mcp-server-github',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    icon: <Database className="w-6 h-6 text-blue-300" />,
    command: 'npx',
    args: ['@anthropic-ai/mcp-server-postgres'],
    category: 'data',
    popular: true,
    env: { PG_CONNECTION_STRING: 'postgresql://user:pass@localhost/dbname' },
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read, write, and manage files on your system',
    icon: <FileText className="w-6 h-6 text-amber-400" />,
    command: 'npx',
    args: ['@anthropic-ai/mcp-server-filesystem'],
    category: 'system',
    popular: true,
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Search the web with privacy-focused Brave Search',
    icon: <Zap className="w-6 h-6 text-orange-400" />,
    command: 'npx',
    args: ['@anthropic-ai/mcp-server-brave-search'],
    category: 'productivity',
    popular: true,
    env: { BRAVE_SEARCH_API_KEY: 'your-api-key' },
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Manage Docker containers and images',
    icon: <Terminal className="w-6 h-6 text-blue-500" />,
    command: 'npx',
    args: ['@anthropic-ai/mcp-server-docker'],
    category: 'system',
    popular: true,
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Access files, folders, and collaborate on Google Drive',
    icon: <FileText className="w-6 h-6 text-blue-400" />,
    command: 'npx',
    args: ['@anthropic-ai/mcp-server-google-drive'],
    category: 'productivity',
    popular: true,
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Read and write to your Notion workspace',
    icon: <Database className="w-6 h-6 text-white/60" />,
    command: 'npx',
    args: ['@anthropic-ai/mcp-server-notion'],
    category: 'productivity',
    popular: true,
    env: { NOTION_API_KEY: 'your-api-key' },
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Store and retrieve persistent conversation memory',
    icon: <Zap className="w-6 h-6 text-purple-400" />,
    command: 'npx',
    args: ['@anthropic-ai/mcp-server-memory'],
    category: 'development',
    popular: true,
  },
  {
    id: 'puppeteer',
    name: 'Browser Control (Puppeteer)',
    description: 'Automate browser tasks and web scraping',
    icon: <Terminal className="w-6 h-6 text-green-400" />,
    command: 'npx',
    args: ['@anthropic-ai/mcp-server-puppeteer'],
    category: 'development',
    popular: true,
  },
]

const CATEGORIES = ['communication', 'development', 'productivity', 'data', 'system'] as const

export const MCPBrowser: React.FC<Props> = ({ onClose }) => {
  const [servers, setServers] = useState<Record<string, McpServerConfig>>({})
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load installed servers
  useEffect(() => {
    const loadServers = async () => {
      try {
        const list = await window.nyra.mcp.list()
        setServers(list)
      } catch (err) {
        console.error('Failed to load MCP servers:', err)
        setError('Failed to load servers')
      }
    }
    loadServers()
  }, [])

  const handleInstall = useCallback(async (serverDef: MCPServerDef) => {
    setInstalling(serverDef.id)
    setError(null)
    try {
      const config: McpServerConfig = {
        command: serverDef.command,
        args: serverDef.args,
        env: serverDef.env,
      }
      await window.nyra.mcp.add(serverDef.name, config)
      setServers(prev => ({ ...prev, [serverDef.name]: config }))
    } catch (err) {
      setError(`Failed to install ${serverDef.name}: ${err}`)
    } finally {
      setInstalling(null)
    }
  }, [])

  const handleRemove = useCallback(async (name: string) => {
    setRemoving(name)
    setError(null)
    try {
      await window.nyra.mcp.remove(name)
      setServers(prev => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    } catch (err) {
      setError(`Failed to remove ${name}: ${err}`)
    } finally {
      setRemoving(null)
    }
  }, [])

  // Filter servers
  const filtered = MCP_SERVERS.filter(server => {
    const matchSearch = !search || 
      server.name.toLowerCase().includes(search.toLowerCase()) ||
      server.description.toLowerCase().includes(search.toLowerCase())
    const matchCategory = !selectedCategory || server.category === selectedCategory
    return matchSearch && matchCategory
  })

  const isInstalled = (name: string) => !!servers[name]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#0b0a08] border border-white/[0.06] rounded-2xl w-[90vw] max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-terra-400" />
            <h2 className="text-xl font-semibold text-white">MCP Servers</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/[0.04] rounded-lg transition-colors text-white/40 hover:text-white/80"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filters */}
        <div className="p-6 border-b border-white/[0.06] space-y-3">
          <div className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.06] rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="Search servers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none text-white placeholder-white/40"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                selectedCategory === null
                  ? 'bg-terra-500/30 text-terra-200 border border-terra-500/50'
                  : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'
              }`}
            >
              All
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors capitalize ${
                  selectedCategory === cat
                    ? 'bg-terra-500/30 text-terra-200 border border-terra-500/50'
                    : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-6 pt-4 text-sm text-red-400 bg-red-500/5 rounded-lg">
            {error}
          </div>
        )}

        {/* Available Servers Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            {filtered.map(server => {
              const installed = isInstalled(server.name)
              const isLoading = installing === server.id || removing === server.name
              return (
                <div
                  key={server.id}
                  className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex-shrink-0">{server.icon}</div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-white text-sm">{server.name}</h3>
                        <p className="text-white/50 text-xs mt-1 line-clamp-2">{server.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4">
                    {server.docs && (
                      <a
                        href={server.docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors flex items-center gap-1 justify-center"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Docs
                      </a>
                    )}
                    {installed ? (
                      <button
                        onClick={() => handleRemove(server.name)}
                        disabled={isLoading}
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 justify-center disabled:opacity-50"
                      >
                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        Remove
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInstall(server)}
                        disabled={isLoading}
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-terra-500/30 hover:bg-terra-500/40 text-terra-200 transition-colors flex items-center gap-1 justify-center disabled:opacity-50"
                      >
                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Install
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/[0.06] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-terra-500/30 hover:bg-terra-500/40 text-terra-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default MCPBrowser
