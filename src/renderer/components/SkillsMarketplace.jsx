/**
 * Skills Marketplace — Browse and install curated skills
 *
 * Only shows base templates (no auto-generated variants like "Pro", "Enterprise", etc.)
 * to avoid the duplicate-looking catalog. Includes pagination for performance.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus, X, Loader2, Star, Download, Zap, BookOpen, Code, PenTool, Database, Cog, Package, Palette, Server, Shield, DollarSign, Megaphone, Scale, GraduationCap, HeartPulse, FlaskConical, MessageSquare, ChevronLeft, ChevronRight, } from 'lucide-react';
const CATEGORY_ICONS = {
    coding: <Code className="w-3.5 h-3.5"/>,
    writing: <PenTool className="w-3.5 h-3.5"/>,
    data: <Database className="w-3.5 h-3.5"/>,
    automation: <Cog className="w-3.5 h-3.5"/>,
    productivity: <Zap className="w-3.5 h-3.5"/>,
    design: <Palette className="w-3.5 h-3.5"/>,
    devops: <Server className="w-3.5 h-3.5"/>,
    security: <Shield className="w-3.5 h-3.5"/>,
    finance: <DollarSign className="w-3.5 h-3.5"/>,
    marketing: <Megaphone className="w-3.5 h-3.5"/>,
    legal: <Scale className="w-3.5 h-3.5"/>,
    education: <GraduationCap className="w-3.5 h-3.5"/>,
    healthcare: <HeartPulse className="w-3.5 h-3.5"/>,
    research: <FlaskConical className="w-3.5 h-3.5"/>,
    communication: <MessageSquare className="w-3.5 h-3.5"/>,
    other: <Package className="w-3.5 h-3.5"/>,
};
/** Variant suffixes we want to filter out from the browse view */
const VARIANT_SUFFIXES = ['-pro', '-enterprise', '-lite', '-ai', '-team', '-cloud', '-v2'];
const PAGE_SIZE = 20;
export const SkillsMarketplace = ({ onClose: _onClose }) => {
    const [allSkills, setAllSkills] = useState([]);
    const [installed, setInstalled] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [tab, setTab] = useState('browse');
    const [installing, setInstalling] = useState(null);
    const [removing, setRemoving] = useState(null);
    const [toggling, setToggling] = useState(null);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(0);
    // Load skills
    useEffect(() => {
        const loadSkills = async () => {
            try {
                const browsed = await window.nyra.skills.browse();
                setAllSkills(browsed);
                const inst = await window.nyra.skills.installed();
                setInstalled(inst);
            }
            catch (err) {
                console.error('Failed to load skills:', err);
                setError('Failed to load skills');
            }
        };
        loadSkills();
    }, []);
    // Deduplicate: only show base skills (filter out variant suffixes)
    const baseSkills = useMemo(() => {
        return allSkills.filter(skill => {
            return !VARIANT_SUFFIXES.some(suffix => skill.id.endsWith(suffix));
        });
    }, [allSkills]);
    const handleInstall = useCallback(async (skillId) => {
        setInstalling(skillId);
        setError(null);
        try {
            await window.nyra.skills.install(skillId);
            const browsed = await window.nyra.skills.browse();
            setAllSkills(browsed);
            const inst = await window.nyra.skills.installed();
            setInstalled(inst);
        }
        catch (err) {
            setError(`Failed to install skill: ${err}`);
        }
        finally {
            setInstalling(null);
        }
    }, []);
    const handleRemove = useCallback(async (skillId) => {
        setRemoving(skillId);
        setError(null);
        try {
            await window.nyra.skills.remove(skillId);
            const inst = await window.nyra.skills.installed();
            setInstalled(inst);
            const browsed = await window.nyra.skills.browse();
            setAllSkills(browsed);
        }
        catch (err) {
            setError(`Failed to remove skill: ${err}`);
        }
        finally {
            setRemoving(null);
        }
    }, []);
    const handleToggle = useCallback(async (skillId, enabled) => {
        setToggling(skillId);
        setError(null);
        try {
            if (enabled) {
                await window.nyra.skills.disable(skillId);
            }
            else {
                await window.nyra.skills.enable(skillId);
            }
            const inst = await window.nyra.skills.installed();
            setInstalled(inst);
        }
        catch (err) {
            setError(`Failed to toggle skill: ${err}`);
        }
        finally {
            setToggling(null);
        }
    }, []);
    const categories = useMemo(() => Array.from(new Set(baseSkills.map(s => s.category))), [baseSkills]);
    // Filter skills for browse tab
    const filtered = useMemo(() => {
        return baseSkills.filter(skill => {
            const matchSearch = !search ||
                skill.name.toLowerCase().includes(search.toLowerCase()) ||
                skill.description.toLowerCase().includes(search.toLowerCase()) ||
                skill.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
            const matchCategory = !selectedCategory || skill.category === selectedCategory;
            return matchSearch && matchCategory;
        });
    }, [baseSkills, search, selectedCategory]);
    // Paginate
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
    // Reset page when filters change
    useEffect(() => { setPage(0); }, [search, selectedCategory]);
    const renderStars = (rating) => {
        const stars = [];
        const filled = Math.floor(rating);
        for (let i = 0; i < 5; i++) {
            if (i < filled) {
                stars.push(<Star key={i} className="w-3 h-3 fill-amber-500 text-amber-500"/>);
            }
            else {
                stars.push(<Star key={i} className="w-3 h-3 text-amber-500/25"/>);
            }
        }
        return stars;
    };
    return (<div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 flex-shrink-0">
        <BookOpen className="w-5 h-5 text-terra-400"/>
        <h3 className="text-sm font-semibold text-white">Skills Marketplace</h3>
        <span className="text-[10px] text-white/30 ml-auto">{baseSkills.length} skills</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 flex-shrink-0">
        <button onClick={() => setTab('browse')} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${tab === 'browse'
            ? 'bg-terra-500/20 text-terra-200 border border-terra-500/40'
            : 'text-white/40 hover:text-white/60'}`}>
          Browse
        </button>
        <button onClick={() => setTab('installed')} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${tab === 'installed'
            ? 'bg-terra-500/20 text-terra-200 border border-terra-500/40'
            : 'text-white/40 hover:text-white/60'}`}>
          Installed ({installed.length})
        </button>
      </div>

      {/* Browse Tab */}
      {tab === 'browse' && (<div className="flex flex-col flex-1 min-h-0">
          {/* Search */}
          <div className="flex-shrink-0 mb-3">
            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
              <Search className="w-3.5 h-3.5 text-white/40 flex-shrink-0"/>
              <input type="text" placeholder="Search skills..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none text-white text-xs placeholder-white/40"/>
              {search && (<button onClick={() => setSearch('')} className="text-white/30 hover:text-white/60">
                  <X className="w-3 h-3"/>
                </button>)}
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex flex-wrap gap-1.5 mb-3 flex-shrink-0">
            <button onClick={() => setSelectedCategory(null)} className={`px-2 py-1 rounded-md text-[11px] transition-colors ${selectedCategory === null
                ? 'bg-terra-500/25 text-terra-200 border border-terra-500/40'
                : 'bg-white/[0.04] text-white/50 hover:bg-white/[0.08]'}`}>
              All
            </button>
            {categories.map(cat => (<button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-2 py-1 rounded-md text-[11px] transition-colors flex items-center gap-1 capitalize ${selectedCategory === cat
                    ? 'bg-terra-500/25 text-terra-200 border border-terra-500/40'
                    : 'bg-white/[0.04] text-white/50 hover:bg-white/[0.08]'}`}>
                {CATEGORY_ICONS[cat]}
                {cat}
              </button>))}
          </div>

          {/* Error */}
          {error && (<div className="flex-shrink-0 text-xs text-red-400 bg-red-500/5 rounded-lg px-3 py-2 mb-2">
              {error}
            </div>)}

          {/* Skills List (scrollable) */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="space-y-2">
              {paged.map(skill => (<div key={skill.id} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 hover:bg-white/[0.04] transition-colors flex items-start gap-3">
                  <div className="text-xl flex-shrink-0 mt-0.5">{skill.icon || '💡'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-white text-xs truncate">{skill.name}</h4>
                      <span className="text-[10px] text-white/25 flex-shrink-0 capitalize">{skill.category}</span>
                    </div>
                    <p className="text-white/50 text-[11px] mt-0.5 line-clamp-1">{skill.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex items-center gap-0.5">
                        <div className="flex">{renderStars(skill.rating)}</div>
                        <span className="text-[10px] text-white/40 ml-0.5">{skill.rating.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-[10px] text-white/30">
                        <Download className="w-2.5 h-2.5"/>
                        {(skill.downloads / 1000).toFixed(1)}k
                      </div>
                      <span className="text-[10px] text-white/25">by {skill.author}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {skill.installedLocally ? (<button onClick={() => handleRemove(skill.id)} disabled={removing === skill.id} className="px-2.5 py-1.5 text-[11px] rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors flex items-center gap-1 disabled:opacity-50">
                        {removing === skill.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <X className="w-3 h-3"/>}
                        Remove
                      </button>) : (<button onClick={() => handleInstall(skill.id)} disabled={installing === skill.id} className="px-2.5 py-1.5 text-[11px] rounded-lg bg-terra-500/25 hover:bg-terra-500/35 text-terra-200 transition-colors flex items-center gap-1 disabled:opacity-50">
                        {installing === skill.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Plus className="w-3 h-3"/>}
                        Install
                      </button>)}
                  </div>
                </div>))}
              {filtered.length === 0 && (<div className="text-center py-12 text-white/30 text-xs">No skills match your search.</div>)}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (<div className="flex items-center justify-between pt-3 flex-shrink-0 border-t border-white/[0.06] mt-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="flex items-center gap-1 px-2 py-1 text-[11px] text-white/40 hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-3 h-3"/> Prev
              </button>
              <span className="text-[10px] text-white/30">
                {page + 1} of {totalPages} ({filtered.length} skills)
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="flex items-center gap-1 px-2 py-1 text-[11px] text-white/40 hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Next <ChevronRight className="w-3 h-3"/>
              </button>
            </div>)}
        </div>)}

      {/* Installed Tab */}
      {tab === 'installed' && (<div className="flex-1 overflow-y-auto min-h-0">
          {installed.length === 0 ? (<div className="flex flex-col items-center justify-center h-48 text-white/30 text-xs gap-2">
              <Package className="w-8 h-8 text-white/15"/>
              No skills installed yet
            </div>) : (<div className="space-y-2">
              {installed.map(skill => (<div key={skill.id} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors">
                  <div className="text-xl flex-shrink-0">{skill.icon || '💡'}</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-white text-xs truncate">{skill.name}</h4>
                    <p className="text-white/40 text-[11px] mt-0.5 line-clamp-1">{skill.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => handleToggle(skill.id, skill.enabled || false)} disabled={toggling === skill.id} className={`px-2.5 py-1.5 text-[11px] rounded-lg transition-colors flex items-center gap-1 ${skill.enabled
                        ? 'bg-green-500/10 hover:bg-green-500/20 text-green-400'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/50'} disabled:opacity-50`}>
                      {toggling === skill.id ? (<Loader2 className="w-3 h-3 animate-spin"/>) : skill.enabled ? 'On' : 'Off'}
                    </button>
                    <button onClick={() => handleRemove(skill.id)} disabled={removing === skill.id} className="px-2 py-1.5 text-[11px] rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50">
                      {removing === skill.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <X className="w-3 h-3"/>}
                    </button>
                  </div>
                </div>))}
            </div>)}
        </div>)}
    </div>);
};
export default SkillsMarketplace;
