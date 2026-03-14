/**
 * Skills Marketplace — Browse and install skills
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Search, Plus, X, Loader2, Star, Download, Zap, BookOpen, Code, PenTool, Database, Cog, Package,
} from 'lucide-react'

interface MarketplaceSkill {
  id: string
  name: string
  description: string
  author: string
  version: string
  category: 'coding' | 'writing' | 'data' | 'automation' | 'productivity' | 'other'
  downloads: number
  rating: number
  tags: string[]
  icon?: string
  installedLocally?: boolean
  enabled?: boolean
}

interface Props {
  onClose: () => void
}

const CATEGORY_ICONS: Record<MarketplaceSkill['category'], React.ReactNode> = {
  coding: <Code className="w-4 h-4" />,
  writing: <PenTool className="w-4 h-4" />,
  data: <Database className="w-4 h-4" />,
  automation: <Cog className="w-4 h-4" />,
  productivity: <Zap className="w-4 h-4" />,
  other: <Package className="w-4 h-4" />,
}

export const SkillsMarketplace: React.FC<Props> = ({ onClose }) => {
  const [skills, setSkills] = useState<MarketplaceSkill[]>([])
  const [installed, setInstalled] = useState<MarketplaceSkill[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [tab, setTab] = useState<'browse' | 'installed'>('browse')
  const [installing, setInstalling] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load skills
  useEffect(() => {
    const loadSkills = async () => {
      try {
        const browsed = await window.nyra.skills.browse()
        setSkills(browsed)
        const inst = await window.nyra.skills.installed()
        setInstalled(inst)
      } catch (err) {
        console.error('Failed to load skills:', err)
        setError('Failed to load skills')
      }
    }
    loadSkills()
  }, [])

  const handleInstall = useCallback(async (skillId: string) => {
    setInstalling(skillId)
    setError(null)
    try {
      await window.nyra.skills.install(skillId)
      const browsed = await window.nyra.skills.browse()
      setSkills(browsed)
      const inst = await window.nyra.skills.installed()
      setInstalled(inst)
    } catch (err) {
      setError(`Failed to install skill: ${err}`)
    } finally {
      setInstalling(null)
    }
  }, [])

  const handleRemove = useCallback(async (skillId: string) => {
    setRemoving(skillId)
    setError(null)
    try {
      await window.nyra.skills.remove(skillId)
      const inst = await window.nyra.skills.installed()
      setInstalled(inst)
      const browsed = await window.nyra.skills.browse()
      setSkills(browsed)
    } catch (err) {
      setError(`Failed to remove skill: ${err}`)
    } finally {
      setRemoving(null)
    }
  }, [])

  const handleToggle = useCallback(async (skillId: string, enabled: boolean) => {
    setToggling(skillId)
    setError(null)
    try {
      if (enabled) {
        await window.nyra.skills.disable(skillId)
      } else {
        await window.nyra.skills.enable(skillId)
      }
      const inst = await window.nyra.skills.installed()
      setInstalled(inst)
    } catch (err) {
      setError(`Failed to toggle skill: ${err}`)
    } finally {
      setToggling(null)
    }
  }, [])

  const categories = Array.from(new Set(skills.map(s => s.category)))

  // Filter skills for browse tab
  const filtered = skills.filter(skill => {
    const matchSearch = !search ||
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase()) ||
      skill.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
    const matchCategory = !selectedCategory || skill.category === selectedCategory
    return matchSearch && matchCategory
  })

  const renderStars = (rating: number) => {
    const stars = []
    const filled = Math.floor(rating)
    const hasHalf = rating % 1 !== 0

    for (let i = 0; i < 5; i++) {
      if (i < filled) {
        stars.push(
          <Star key={i} className="w-3.5 h-3.5 fill-gold-400 text-gold-400" />
        )
      } else if (i === filled && hasHalf) {
        stars.push(
          <div key={i} className="relative w-3.5 h-3.5">
            <Star className="w-3.5 h-3.5 text-gold-400/30" />
            <div className="absolute inset-0 overflow-hidden w-1/2">
              <Star className="w-3.5 h-3.5 fill-gold-400 text-gold-400" />
            </div>
          </div>
        )
      } else {
        stars.push(
          <Star key={i} className="w-3.5 h-3.5 text-gold-400/30" />
        )
      }
    }
    return stars
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#0b0a08] border border-white/[0.06] rounded-2xl w-[90vw] max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-terra-400" />
            <h2 className="text-xl font-semibold text-white">Skills Marketplace</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/[0.04] rounded-lg transition-colors text-white/40 hover:text-white/80"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] px-6">
          <button
            onClick={() => setTab('browse')}
            className={`px-4 py-3 border-b-2 transition-colors ${
              tab === 'browse'
                ? 'border-terra-400 text-terra-200'
                : 'border-transparent text-white/40 hover:text-white/60'
            }`}
          >
            Browse
          </button>
          <button
            onClick={() => setTab('installed')}
            className={`px-4 py-3 border-b-2 transition-colors ${
              tab === 'installed'
                ? 'border-terra-400 text-terra-200'
                : 'border-transparent text-white/40 hover:text-white/60'
            }`}
          >
            Installed ({installed.length})
          </button>
        </div>

        {/* Browse Tab */}
        {tab === 'browse' && (
          <>
            {/* Search & Filters */}
            <div className="p-6 border-b border-white/[0.06] space-y-3">
              <div className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.06] rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search skills..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-white placeholder-white/40"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1 ${
                    selectedCategory === null
                      ? 'bg-terra-500/30 text-terra-200 border border-terra-500/50'
                      : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'
                  }`}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1 capitalize ${
                      selectedCategory === cat
                        ? 'bg-terra-500/30 text-terra-200 border border-terra-500/50'
                        : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'
                    }`}
                  >
                    {CATEGORY_ICONS[cat as MarketplaceSkill['category']]}
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

            {/* Skills Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4">
                {filtered.map(skill => (
                  <div
                    key={skill.id}
                    className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 hover:bg-white/[0.04] transition-colors flex flex-col"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="text-2xl">{skill.icon || '💡'}</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm">{skill.name}</h3>
                        <p className="text-white/50 text-xs mt-0.5">by {skill.author}</p>
                      </div>
                    </div>

                    <p className="text-white/60 text-xs mb-3 line-clamp-2">{skill.description}</p>

                    <div className="flex items-center gap-2 mb-3 text-xs text-white/50">
                      <div className="flex items-center gap-1">
                        <div className="flex gap-0.5">{renderStars(skill.rating)}</div>
                        <span>{skill.rating.toFixed(1)}</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-0.5">
                        <Download className="w-3 h-3" />
                        <span>{(skill.downloads / 1000).toFixed(1)}k</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-4">
                      {skill.tags.slice(0, 2).map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 text-xs bg-white/[0.06] text-white/60 rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {skill.installedLocally ? (
                      <button
                        onClick={() => handleRemove(skill.id)}
                        disabled={removing === skill.id}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {removing === skill.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                        Uninstall
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInstall(skill.id)}
                        disabled={installing === skill.id}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-terra-500/30 hover:bg-terra-500/40 text-terra-200 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {installing === skill.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3" />
                        )}
                        Install
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Installed Tab */}
        {tab === 'installed' && (
          <div className="flex-1 overflow-y-auto p-6">
            {installed.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-white/40">
                No skills installed yet
              </div>
            ) : (
              <div className="space-y-3">
                {installed.map(skill => (
                  <div
                    key={skill.id}
                    className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="text-2xl">{skill.icon || '💡'}</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white">{skill.name}</h3>
                        <p className="text-white/50 text-sm mt-1">{skill.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                      <button
                        onClick={() => handleToggle(skill.id, skill.enabled || false)}
                        disabled={toggling === skill.id}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1 ${
                          skill.enabled
                            ? 'bg-green-500/10 hover:bg-green-500/20 text-green-400'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/60'
                        } disabled:opacity-50`}
                      >
                        {toggling === skill.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : skill.enabled ? (
                          'Enabled'
                        ) : (
                          'Disabled'
                        )}
                      </button>

                      <button
                        onClick={() => handleRemove(skill.id)}
                        disabled={removing === skill.id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        {removing === skill.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

export default SkillsMarketplace
