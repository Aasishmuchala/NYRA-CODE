/**
 * Plugin Studio Panel — Browse registry, install/uninstall, enable/disable plugins
 */
import React, { useEffect, useState } from 'react'
import { Package, Download, Trash2, Power, PowerOff, Search, Star, Tag, Settings } from 'lucide-react'

interface RegistryEntry { id: string; name: string; version: string; author: string; description: string; category: string; rating: number; downloads: number; tags: string[] }
interface PluginMeta { id: string; name: string; version: string; author: string; description: string; category: string; enabled: boolean; installedAt: number; config: Record<string, unknown> }

type Tab = 'registry' | 'installed'

const CATEGORIES = ['all', 'provider', 'agent', 'tool', 'theme', 'integration', 'utility']

const PluginStudioPanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>('registry')
  const [registry, setRegistry] = useState<RegistryEntry[]>([])
  const [installed, setInstalled] = useState<PluginMeta[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [loading, setLoading] = useState(false)

  const fetchRegistry = async () => {
    try {
      const r = await window.nyra.pluginStudio.browseRegistry(search || undefined, category !== 'all' ? category : undefined)
      if (r.success) setRegistry(r.result)
    } catch {}
  }

  const fetchInstalled = async () => {
    try {
      const r = await window.nyra.pluginStudio.listInstalled()
      if (r.success) setInstalled(r.result)
    } catch {}
  }

  useEffect(() => { fetchRegistry(); fetchInstalled() }, [])
  useEffect(() => { fetchRegistry() }, [search, category])

  const handleInstall = async (entry: RegistryEntry) => {
    setLoading(true)
    try {
      await window.nyra.pluginStudio.install(entry)
      await fetchInstalled()
    } catch {}
    setLoading(false)
  }

  const handleUninstall = async (id: string) => {
    try {
      await window.nyra.pluginStudio.uninstall(id)
      await fetchInstalled()
    } catch {}
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      if (enabled) await window.nyra.pluginStudio.disable(id)
      else await window.nyra.pluginStudio.enable(id)
      await fetchInstalled()
    } catch {}
  }

  const installedIds = new Set(installed.map(p => p.id))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Package size={16} className="text-terra-300" />
        <h2 className="text-sm font-semibold text-white/80">Plugin Studio</h2>
        <div className="ml-auto flex gap-1">
          {(['registry', 'installed'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${tab === t ? 'bg-terra-400/15 text-terra-300' : 'text-white/30 hover:text-white/50'}`}>
              {t === 'registry' ? 'Browse' : `Installed (${installed.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Search + Category filter */}
      {tab === 'registry' && (
        <div className="px-4 py-2.5 border-b border-white/[0.04] space-y-2">
          <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-1.5">
            <Search size={12} className="text-white/20" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search plugins..." className="bg-transparent text-[12px] text-white/70 placeholder:text-white/20 outline-none flex-1" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${category === c ? 'bg-terra-400/15 text-terra-300' : 'text-white/25 hover:text-white/40 bg-white/[0.02]'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {tab === 'registry' && registry.map(entry => (
          <div key={entry.id} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 hover:border-white/[0.08] transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-terra-400/10 flex items-center justify-center flex-shrink-0">
                <Package size={14} className="text-terra-300/60" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[12px] font-medium text-white/75">{entry.name}</h3>
                  <span className="text-[9px] text-white/20 font-mono">v{entry.version}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/25">{entry.category}</span>
                </div>
                <p className="text-[10px] text-white/30 mt-0.5 line-clamp-2">{entry.description}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-[9px] text-gold-400/50"><Star size={8} />{entry.rating}</span>
                  <span className="flex items-center gap-1 text-[9px] text-white/20"><Download size={8} />{(entry.downloads / 1000).toFixed(1)}k</span>
                  <div className="flex gap-1 ml-auto">
                    {entry.tags.slice(0, 3).map(t => (
                      <span key={t} className="flex items-center gap-0.5 text-[8px] text-white/15"><Tag size={7} />{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleInstall(entry)}
                disabled={installedIds.has(entry.id) || loading}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors flex-shrink-0 ${
                  installedIds.has(entry.id) ? 'bg-sage-400/10 text-sage-400/50 cursor-default' : 'bg-terra-400/15 text-terra-300 hover:bg-terra-400/25'
                }`}>
                {installedIds.has(entry.id) ? 'Installed' : 'Install'}
              </button>
            </div>
          </div>
        ))}

        {tab === 'installed' && installed.map(plugin => (
          <div key={plugin.id} className={`bg-white/[0.02] border rounded-xl p-3 transition-colors ${plugin.enabled ? 'border-white/[0.06]' : 'border-white/[0.03] opacity-60'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${plugin.enabled ? 'bg-sage-400/10' : 'bg-white/[0.03]'}`}>
                <Package size={14} className={plugin.enabled ? 'text-sage-400/60' : 'text-white/20'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[12px] font-medium text-white/75">{plugin.name}</h3>
                  <span className="text-[9px] text-white/20 font-mono">v{plugin.version}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${plugin.enabled ? 'bg-sage-400/10 text-sage-400/60' : 'bg-white/[0.04] text-white/20'}`}>
                    {plugin.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <p className="text-[10px] text-white/30 mt-0.5">{plugin.description}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => handleToggle(plugin.id, plugin.enabled)} title={plugin.enabled ? 'Disable' : 'Enable'}
                  className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-colors">
                  {plugin.enabled ? <Power size={12} /> : <PowerOff size={12} />}
                </button>
                <button title="Configure" className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-colors">
                  <Settings size={12} />
                </button>
                <button onClick={() => handleUninstall(plugin.id)} title="Uninstall"
                  className="p-1.5 rounded-lg text-blush-400/30 hover:text-blush-400/70 hover:bg-blush-400/10 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {tab === 'installed' && installed.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-white/15 text-[11px]">
            <Package size={24} className="mb-2 opacity-30" />
            No plugins installed yet
          </div>
        )}
      </div>
    </div>
  )
}

export default PluginStudioPanel
