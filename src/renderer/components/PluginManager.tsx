/**
 * Plugin Manager — Settings UI for plugin installation & management
 * Renders in the Settings panel with Nyra's terracotta UI theme
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Package,
  Puzzle,
  Trash2,
  ExternalLink,
  Download,
  Loader2,
  Shield,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PluginTool {
  name: string
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean }>
}

interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  icon?: string
  homepage?: string
  license?: string
  main?: string
  tools?: PluginTool[]
  permissions?: string[]
  mcpServers?: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>
}

interface InstalledPlugin {
  manifest: PluginManifest
  enabled: boolean
  loaded: boolean
  installedAt: number
}

interface PluginManagerProps {
  onClose?: () => void
}

// ── Plugin Manager Component ───────────────────────────────────────────────────

export const PluginManager: React.FC<PluginManagerProps> = ({ onClose: _onClose }) => {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])
  const [loading, setLoading] = useState(false)
  const [installUrl, setInstallUrl] = useState('')
  const [installing, setInstalling] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [uninstallingId, setUninstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Load plugins on mount ──────────────────────────────────────────────────

  const loadPlugins = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await (window as any).nyra?.plugins?.list?.()
      if (result) {
        setPlugins(result)
      }
    } catch (e) {
      console.error('Failed to load plugins:', e)
      setError('Failed to load plugins')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  // ── Install from URL ───────────────────────────────────────────────────────

  const handleInstall = useCallback(async () => {
    if (!installUrl.trim()) {
      setError('Please enter a URL or path')
      return
    }

    setInstalling(true)
    setError(null)
    try {
      const success = await (window as any).nyra?.plugins?.install?.(installUrl)
      if (success) {
        setInstallUrl('')
        await loadPlugins()
      } else {
        setError('Failed to install plugin')
      }
    } catch (e) {
      console.error('Installation error:', e)
      setError(`Installation error: ${String(e)}`)
    } finally {
      setInstalling(false)
    }
  }, [installUrl, loadPlugins])

  // ── Toggle enabled state ───────────────────────────────────────────────────

  const handleToggleEnabled = useCallback(
    async (pluginId: string, currentlyEnabled: boolean) => {
      try {
        if (currentlyEnabled) {
          await (window as any).nyra?.plugins?.disable?.(pluginId)
        } else {
          await (window as any).nyra?.plugins?.enable?.(pluginId)
        }
        await loadPlugins()
      } catch (e) {
        console.error('Failed to toggle plugin:', e)
        setError(`Failed to toggle plugin: ${String(e)}`)
      }
    },
    [loadPlugins]
  )

  // ── Uninstall plugin ───────────────────────────────────────────────────────

  const handleUninstall = useCallback(
    async (pluginId: string) => {
      setUninstallingId(pluginId)
      try {
        const success = await (window as any).nyra?.plugins?.remove?.(pluginId)
        if (success) {
          await loadPlugins()
        } else {
          setError('Failed to uninstall plugin')
        }
      } catch (e) {
        console.error('Uninstall error:', e)
        setError(`Uninstall error: ${String(e)}`)
      } finally {
        setUninstallingId(null)
      }
    },
    [loadPlugins]
  )

  // ── Render permission badge ────────────────────────────────────────────────

  const renderPermissionBadge = (permission: string) => {
    const icons: Record<string, React.ReactNode> = {
      filesystem: <Package className="w-3 h-3" />,
      network: <Download className="w-3 h-3" />,
      'desktop-control': <Puzzle className="w-3 h-3" />,
    }

    return (
      <span
        key={permission}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-sage-400/10 text-sage-300 rounded-full border border-sage-400/20"
      >
        {icons[permission] || <Shield className="w-3 h-3" />}
        {permission}
      </span>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#0b0a08]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <Puzzle className="w-5 h-5 text-terra-400" />
          <h2 className="text-lg font-semibold text-white">Plugins</h2>
          <span className="text-xs px-2 py-1 bg-terra-400/10 text-terra-300 rounded-full">
            {plugins.length}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-blush-400/10 border border-blush-400/20 rounded-lg flex items-start gap-2">
          <div className="text-blush-300 text-sm">{error}</div>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-blush-300/60 hover:text-blush-300 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Install from URL section */}
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-medium text-white/80 mb-3">Install from URL or Path</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={installUrl}
              onChange={e => setInstallUrl(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleInstall()}
              placeholder="https://example.com/plugin.zip or /path/to/plugin"
              className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-terra-400/50"
            />
            <button
              onClick={handleInstall}
              disabled={installing || !installUrl.trim()}
              className="px-4 py-2 bg-terra-400/20 hover:bg-terra-400/30 disabled:opacity-50 text-terra-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {installing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {installing ? 'Installing...' : 'Install'}
            </button>
          </div>
        </div>

        {/* Plugins list or empty state */}
        {loading ? (
          <div className="flex items-center justify-center h-32 text-white/40">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading plugins...
          </div>
        ) : plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/40">
            <Package className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No plugins installed yet</p>
          </div>
        ) : (
          <div className="px-6 py-4 space-y-3">
            {plugins.map(plugin => {
              const isExpanded = expandedId === plugin.manifest.id
              const isUninstalling = uninstallingId === plugin.manifest.id

              return (
                <div
                  key={plugin.manifest.id}
                  className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/[0.1] transition-colors"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 flex-1">
                      {plugin.manifest.icon ? (
                        <div className="text-2xl">{plugin.manifest.icon}</div>
                      ) : (
                        <Puzzle className="w-6 h-6 text-terra-400" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white truncate">
                            {plugin.manifest.name}
                          </h3>
                          <span className="text-xs text-white/50">{plugin.manifest.version}</span>
                        </div>
                        <p className="text-xs text-white/40 truncate">
                          by {plugin.manifest.author}
                        </p>
                      </div>
                    </div>

                    {/* Toggle button */}
                    <button
                      onClick={() => handleToggleEnabled(plugin.manifest.id, plugin.enabled)}
                      className="ml-2 p-2 hover:bg-white/[0.04] rounded-lg transition-colors"
                      title={plugin.enabled ? 'Disable' : 'Enable'}
                    >
                      {plugin.enabled ? (
                        <ToggleRight className="w-5 h-5 text-sage-400" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-white/30" />
                      )}
                    </button>

                    {/* Expand button */}
                    <button
                      onClick={() =>
                        setExpandedId(isExpanded ? null : plugin.manifest.id)
                      }
                      className="ml-1 p-2 hover:bg-white/[0.04] rounded-lg transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-white/40" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-white/40" />
                      )}
                    </button>
                  </div>

                  {/* Description (always shown) */}
                  <div className="px-4 pb-3">
                    <p className="text-xs text-white/60 line-clamp-2">
                      {plugin.manifest.description}
                    </p>
                  </div>

                  {/* Expanded section */}
                  {isExpanded && (
                    <div className="border-t border-white/[0.06] px-4 py-3 space-y-3 bg-white/[0.01]">
                      {/* Permissions */}
                      {plugin.manifest.permissions && plugin.manifest.permissions.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-white/70 mb-2">Permissions</p>
                          <div className="flex flex-wrap gap-2">
                            {plugin.manifest.permissions.map(p => renderPermissionBadge(p))}
                          </div>
                        </div>
                      )}

                      {/* Tools */}
                      {plugin.manifest.tools && plugin.manifest.tools.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-white/70 mb-2">
                            Tools ({plugin.manifest.tools.length})
                          </p>
                          <div className="space-y-1 text-xs text-white/50">
                            {plugin.manifest.tools.map(tool => (
                              <div key={tool.name} className="truncate">
                                • {tool.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Links and actions */}
                      <div className="flex items-center gap-2 pt-2">
                        {plugin.manifest.homepage && (
                          <a
                            href={plugin.manifest.homepage}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1 text-xs text-terra-300 hover:text-terra-200 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Homepage
                          </a>
                        )}

                        <button
                          onClick={() => handleUninstall(plugin.manifest.id)}
                          disabled={isUninstalling}
                          className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-blush-300/70 hover:text-blush-300 disabled:opacity-50 transition-colors"
                        >
                          {isUninstalling ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          {isUninstalling ? 'Removing...' : 'Uninstall'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Export as default as well
export default PluginManager
