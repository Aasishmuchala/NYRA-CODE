import React, { useState, useEffect, useCallback } from 'react';
import { BookTemplate, Play, Trash2, ChevronRight, ChevronDown, Loader2, Check, X, Download, RefreshCw, AlertTriangle, } from 'lucide-react';
// ── Category Badge ────────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
    development: 'bg-blue-500/10 text-blue-300',
    deployment: 'bg-emerald-500/10 text-emerald-300',
    review: 'bg-amber-500/10 text-amber-300',
    data: 'bg-purple-500/10 text-purple-300',
    custom: 'bg-white/[0.06] text-white/50',
};
const CategoryBadge = ({ category }) => (<span className={`text-[9px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[category] || CATEGORY_COLORS.custom}`}>
    {category}
  </span>);
// ── Step Status Icon ──────────────────────────────────────────────────────────
const StepStatusIcon = ({ status }) => {
    switch (status) {
        case 'completed': return <Check size={10} className="text-emerald-400"/>;
        case 'running': return <Loader2 size={10} className="text-blue-400 animate-spin"/>;
        case 'failed': return <AlertTriangle size={10} className="text-red-400"/>;
        case 'skipped': return <X size={10} className="text-white/20"/>;
        default: return <span className="w-2.5 h-2.5 rounded-full border border-white/20"/>;
    }
};
// ── Recipe Card ───────────────────────────────────────────────────────────────
const RecipeCard = ({ recipe, expanded, activeRun, onToggle, onRun, onDelete, onExport }) => (<div className="border border-white/[0.06] rounded-lg overflow-hidden">
    <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition text-left">
      {expanded ? <ChevronDown size={12} className="text-white/30"/> : <ChevronRight size={12} className="text-white/30"/>}
      <span className="text-sm">{recipe.icon || '📋'}</span>
      <span className="text-[11px] text-white/80 flex-1 truncate">{recipe.name}</span>
      <CategoryBadge category={recipe.category}/>
      {recipe.builtin && <span className="text-[8px] px-1 py-0.5 rounded bg-white/[0.06] text-white/30">built-in</span>}
    </button>

    {expanded && (<div className="border-t border-white/[0.06] px-3 py-2 bg-black/20 space-y-2">
        <p className="text-[10px] text-white/50">{recipe.description}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {recipe.tags?.map((tag) => (<span key={tag} className="text-[8px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/30">#{tag}</span>))}
        </div>

        {/* Steps */}
        <div className="space-y-1">
          <span className="text-[9px] text-white/30 font-semibold">Steps ({recipe.steps?.length || 0}):</span>
          {recipe.steps?.map((step, i) => (<div key={step.id} className="flex items-center gap-2 px-2 py-1 rounded bg-white/[0.02]">
              <StepStatusIcon status={activeRun?.stepResults?.[step.id]?.status}/>
              <span className="text-[9px] text-white/40">{i + 1}.</span>
              <span className="text-[10px] text-white/60 flex-1 truncate">{step.label}</span>
              <span className="text-[8px] text-white/25">{step.type}</span>
            </div>))}
        </div>

        {/* Variables */}
        {recipe.variables && Object.keys(recipe.variables).length > 0 && (<div className="space-y-1">
            <span className="text-[9px] text-white/30 font-semibold">Variables:</span>
            {Object.entries(recipe.variables).map(([key, val]) => (<div key={key} className="flex items-center gap-2 text-[9px]">
                <span className="text-white/40 font-mono">{key}</span>
                <span className="text-white/20">=</span>
                <span className="text-white/50 font-mono truncate">{String(val)}</span>
              </div>))}
          </div>)}

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-1">
          <button onClick={onRun} className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 text-[9px] hover:bg-emerald-500/20">
            <Play size={10}/> Run
          </button>
          <button onClick={onExport} className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-300 text-[9px] hover:bg-blue-500/20">
            <Download size={10}/> Export
          </button>
          {!recipe.builtin && (<button onClick={onDelete} className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 text-red-300 text-[9px] hover:bg-red-500/20">
              <Trash2 size={10}/> Delete
            </button>)}
        </div>

        {/* Active run status */}
        {activeRun && (<div className="border-t border-white/[0.06] pt-2 mt-2">
            <p className="text-[9px] text-white/40">
              Run: <span className={activeRun.status === 'completed' ? 'text-emerald-400' : activeRun.status === 'failed' ? 'text-red-400' : 'text-blue-400'}>
                {activeRun.status}
              </span>
              {activeRun.error && <span className="text-red-400/60 ml-2">{activeRun.error}</span>}
            </p>
          </div>)}
      </div>)}
  </div>);
// ── Main RecipesPanel ─────────────────────────────────────────────────────────
const RecipesPanel = () => {
    const [recipes, setRecipes] = useState([]);
    const [runs, setRuns] = useState([]);
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [expanded, setExpanded] = useState(new Set());
    const [activeRuns, setActiveRuns] = useState(new Map());
    const [view, setView] = useState('recipes');
    const [loading, setLoading] = useState(false);
    const refresh = useCallback(async () => {
        setLoading(true);
        const [r, c, rns] = await Promise.all([
            window.nyra.recipes.list(selectedCategory || undefined),
            window.nyra.recipes.categories(),
            window.nyra.recipes.listRuns({ limit: 20 }),
        ]);
        setRecipes(r);
        setCategories(c);
        setRuns(rns);
        setLoading(false);
    }, [selectedCategory]);
    useEffect(() => { refresh(); }, [refresh]);
    useEffect(() => {
        const unsubs = [
            window.nyra.recipes.onRunStarted((data) => {
                setActiveRuns(prev => new Map(prev).set(data.recipeId, data));
                refresh();
            }),
            window.nyra.recipes.onRunCompleted((data) => {
                setActiveRuns(prev => new Map(prev).set(data.recipeId, data));
                refresh();
            }),
            window.nyra.recipes.onStepCompleted(() => refresh()),
            window.nyra.recipes.onStepFailed(() => refresh()),
        ];
        return () => unsubs.forEach((u) => u());
    }, [refresh]);
    const handleRun = async (recipeId) => {
        const run = await window.nyra.recipes.run(recipeId);
        setActiveRuns(prev => new Map(prev).set(recipeId, run));
        refresh();
    };
    const handleDelete = async (id) => {
        await window.nyra.recipes.delete(id);
        refresh();
    };
    const handleExport = async (id) => {
        const json = await window.nyra.recipes.export(id);
        if (json) {
            // Copy to clipboard
            navigator.clipboard.writeText(json).catch(() => { });
        }
    };
    const toggleExpand = (id) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };
    return (<div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06]">
        <button onClick={() => setView('recipes')} className={`px-2 py-1 rounded text-[10px] ${view === 'recipes' ? 'bg-terra-300/10 text-terra-300' : 'text-white/50 hover:text-white/70'}`}>
          Recipes
        </button>
        <button onClick={() => setView('runs')} className={`px-2 py-1 rounded text-[10px] ${view === 'runs' ? 'bg-terra-300/10 text-terra-300' : 'text-white/50 hover:text-white/70'}`}>
          Runs ({runs.length})
        </button>
        <div className="flex-1"/>
        <button onClick={refresh} className="p-1 hover:bg-white/[0.06] rounded text-white/30">
          {loading ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>}
        </button>
      </div>

      {/* Category filter */}
      {view === 'recipes' && categories.length > 1 && (<div className="flex items-center gap-1 px-4 py-1.5 border-b border-white/[0.03] overflow-x-auto scrollbar-thin">
          <button onClick={() => setSelectedCategory(null)} className={`px-2 py-0.5 rounded text-[9px] whitespace-nowrap ${!selectedCategory ? 'bg-terra-300/10 text-terra-300' : 'text-white/40'}`}>
            All
          </button>
          {categories.map(cat => (<button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-2 py-0.5 rounded text-[9px] whitespace-nowrap ${selectedCategory === cat ? 'bg-terra-300/10 text-terra-300' : 'text-white/40'}`}>
              {cat}
            </button>))}
        </div>)}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2">
        {view === 'recipes' && (<>
            {recipes.length === 0 && (<div className="flex flex-col items-center justify-center py-12 text-white/30 gap-2">
                <BookTemplate size={28} className="text-white/15"/>
                <p className="text-[11px]">Workflow Recipes</p>
                <p className="text-[9px] text-white/20">Pre-built and custom automation workflows</p>
              </div>)}

            {recipes.map(recipe => (<RecipeCard key={recipe.id} recipe={recipe} expanded={expanded.has(recipe.id)} activeRun={activeRuns.get(recipe.id)} onToggle={() => toggleExpand(recipe.id)} onRun={() => handleRun(recipe.id)} onDelete={() => handleDelete(recipe.id)} onExport={() => handleExport(recipe.id)}/>))}
          </>)}

        {view === 'runs' && (<>
            {runs.length === 0 && (<div className="flex flex-col items-center justify-center py-12 text-white/30 gap-2">
                <Play size={28} className="text-white/15"/>
                <p className="text-[11px]">No recipe runs yet</p>
                <p className="text-[9px] text-white/20">Run a recipe to see execution history</p>
              </div>)}

            {runs.map(run => (<div key={run.id} className="border border-white/[0.06] rounded-lg p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] ${run.status === 'completed' ? 'text-emerald-400' :
                    run.status === 'failed' ? 'text-red-400' :
                        run.status === 'running' ? 'text-blue-400' : 'text-white/40'}`}>{run.status}</span>
                  <span className="text-[10px] text-white/60 flex-1 truncate">{run.recipeName}</span>
                  <span className="text-[9px] text-white/20">{new Date(run.startedAt).toLocaleTimeString()}</span>
                </div>
                {run.error && <p className="text-[9px] text-red-400/60 truncate">{run.error}</p>}
              </div>))}
          </>)}
      </div>
    </div>);
};
export default RecipesPanel;
