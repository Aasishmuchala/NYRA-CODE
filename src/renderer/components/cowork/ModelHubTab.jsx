import React, { useState, useEffect, useCallback } from 'react';
import { Download, Trash2, Search, Cpu, HardDrive, Play, Pause, X, ChevronRight, Zap, RefreshCw, CheckCircle, AlertTriangle, Loader2, } from 'lucide-react';
// ── Sub-components ──────────────────────────────────────────────────────────
const VramBar = ({ usedMb, totalMb }) => {
    const pct = totalMb > 0 ? Math.min(100, (usedMb / totalMb) * 100) : 0;
    const color = pct > 90 ? 'bg-red-400' : pct > 70 ? 'bg-amber-400' : 'bg-emerald-400';
    return (<div className="flex items-center gap-2 text-[10px] text-white/50">
      <HardDrive size={12}/>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }}/>
      </div>
      <span>{(usedMb / 1024).toFixed(1)} / {(totalMb / 1024).toFixed(1)} GB</span>
    </div>);
};
const CapBadge = ({ cap }) => {
    const colors = {
        chat: 'bg-blue-500/20 text-blue-300',
        code: 'bg-emerald-500/20 text-emerald-300',
        vision: 'bg-purple-500/20 text-purple-300',
        tools: 'bg-amber-500/20 text-amber-300',
        embeddings: 'bg-cyan-500/20 text-cyan-300',
    };
    return (<span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${colors[cap] || 'bg-white/10 text-white/50'}`}>
      {cap}
    </span>);
};
const DownloadProgress = ({ job }) => {
    const isActive = job.status === 'downloading';
    return (<div className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] rounded-lg border border-white/[0.06]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/80 truncate">{job.modelName}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${job.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
            job.status === 'failed' ? 'bg-red-500/20 text-red-300' :
                job.status === 'paused' ? 'bg-amber-500/20 text-amber-300' :
                    'bg-blue-500/20 text-blue-300'}`}>{job.status}</span>
        </div>
        {isActive && (<div className="mt-1 flex items-center gap-2">
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-terra-300 rounded-full transition-all" style={{ width: `${job.progress}%` }}/>
            </div>
            <span className="text-[9px] text-white/40">{job.progress}% · {job.speed} · {job.eta}</span>
          </div>)}
      </div>
      <div className="flex items-center gap-1">
        {isActive && (<button onClick={() => window.nyra.modelHub.pauseDownload(job.id)} className="p-1 hover:bg-white/10 rounded" title="Pause">
            <Pause size={12} className="text-white/50"/>
          </button>)}
        {job.status === 'paused' && (<button onClick={() => window.nyra.modelHub.resumeDownload(job.id)} className="p-1 hover:bg-white/10 rounded" title="Resume">
            <Play size={12} className="text-white/50"/>
          </button>)}
        {(isActive || job.status === 'paused' || job.status === 'queued') && (<button onClick={() => window.nyra.modelHub.cancelDownload(job.id)} className="p-1 hover:bg-white/10 rounded" title="Cancel">
            <X size={12} className="text-white/50"/>
          </button>)}
      </div>
    </div>);
};
// ── Model Card (expanded detail view) ────────────────────────────────────────
const ModelCardView = ({ card, onClose }) => {
    const [fitCheck, setFitCheck] = useState(null);
    useEffect(() => {
        window.nyra.modelHub.canFit(card.name).then(setFitCheck).catch(() => { });
    }, [card.name]);
    return (<div className="p-4 bg-white/[0.03] rounded-xl border border-white/[0.08] space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/90">{card.displayName}</h3>
          <p className="text-[10px] text-white/40 mt-0.5">{card.family} · {card.parameterSize} · {card.quantization}</p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><X size={14} className="text-white/50"/></button>
      </div>

      <p className="text-[11px] text-white/60 leading-relaxed line-clamp-3">{card.description}</p>

      <div className="flex flex-wrap gap-1.5">
        {card.capabilities?.map((c) => <CapBadge key={c} cap={c}/>)}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-white/[0.04] rounded-lg px-3 py-2">
          <span className="text-white/40">Context</span>
          <span className="block text-white/80 font-medium">{(card.contextLength / 1024).toFixed(0)}K tokens</span>
        </div>
        <div className="bg-white/[0.04] rounded-lg px-3 py-2">
          <span className="text-white/40">VRAM Est.</span>
          <span className="block text-white/80 font-medium">{(card.estimatedVramMb / 1024).toFixed(1)} GB</span>
        </div>
        <div className="bg-white/[0.04] rounded-lg px-3 py-2">
          <span className="text-white/40">Size</span>
          <span className="block text-white/80 font-medium">{card.sizeBytes > 0 ? (card.sizeBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : '—'}</span>
        </div>
        <div className="bg-white/[0.04] rounded-lg px-3 py-2">
          <span className="text-white/40">License</span>
          <span className="block text-white/80 font-medium truncate">{card.license}</span>
        </div>
      </div>

      {fitCheck && (<div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] ${fitCheck.fits ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
          {fitCheck.fits ? <CheckCircle size={12}/> : <AlertTriangle size={12}/>}
          <span>{fitCheck.fits ? 'Fits in your GPU memory' : `Needs ${(fitCheck.requiredMb / 1024).toFixed(1)} GB — you have ${(fitCheck.availableMb / 1024).toFixed(1)} GB`}</span>
        </div>)}

      <div className="flex gap-2">
        {card.installed ? (<button onClick={() => window.nyra.modelHub.removeModel(card.name)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-300 text-[10px] hover:bg-red-500/20 transition">
            <Trash2 size={12}/> Remove
          </button>) : (<button onClick={() => window.nyra.modelHub.startDownload(card.name)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-terra-300/10 text-terra-300 text-[10px] hover:bg-terra-300/20 transition">
            <Download size={12}/> Download
          </button>)}
      </div>
    </div>);
};
// ── Compare Panel ────────────────────────────────────────────────────────────
const ComparePanel = ({ models, onClose }) => {
    const [prompt, setPrompt] = useState('');
    const [result, setResult] = useState(null);
    const [modelA, setModelA] = useState(models[0] || '');
    const [modelB, setModelB] = useState(models[1] || '');
    const [loading, setLoading] = useState(false);
    const runComparison = async () => {
        if (!modelA || !modelB || !prompt.trim())
            return;
        setLoading(true);
        setResult(null);
        const res = await window.nyra.modelHub.compare(modelA, modelB, prompt);
        if (res.success)
            setResult(res.result);
        setLoading(false);
    };
    return (<div className="p-4 bg-white/[0.03] rounded-xl border border-white/[0.08] space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/80">Side-by-Side Comparison</h3>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><X size={14} className="text-white/50"/></button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select value={modelA} onChange={e => setModelA(e.target.value)} className="bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1.5 text-[10px] text-white/80 outline-none">
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={modelB} onChange={e => setModelB(e.target.value)} className="bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1.5 text-[10px] text-white/80 outline-none">
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter a prompt to send to both models..." className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-white/80 placeholder:text-white/30 outline-none resize-none h-16"/>

      <button onClick={runComparison} disabled={loading || !prompt.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-terra-300/10 text-terra-300 text-[10px] hover:bg-terra-300/20 transition disabled:opacity-40">
        {loading ? <Loader2 size={12} className="animate-spin"/> : <Zap size={12}/>}
        {loading ? 'Running...' : 'Compare'}
      </button>

      {result && (<div className="grid grid-cols-2 gap-2">
          {[result.modelA, result.modelB].map((r) => (<div key={r.name} className="bg-white/[0.04] rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-medium text-white/70">{r.name}</span>
                <span className="text-white/40">{r.tokensPerSec} tok/s · {(r.latencyMs / 1000).toFixed(1)}s</span>
              </div>
              <p className="text-[10px] text-white/60 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">{r.response}</p>
            </div>))}
        </div>)}
    </div>);
};
const ModelHubTab = () => {
    const [mode, setMode] = useState('installed');
    const [ollamaOnline, setOllamaOnline] = useState(false);
    const [installed, setInstalled] = useState([]);
    const [library, setLibrary] = useState([]);
    const [downloads, setDownloads] = useState([]);
    const [gpuInfo, setGpuInfo] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [familyFilter, setFamilyFilter] = useState('');
    const [families, setFamilies] = useState([]);
    const [selectedCard, setSelectedCard] = useState(null);
    const [loading, setLoading] = useState(true);
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [online, models, gpu, fams, dls] = await Promise.all([
                window.nyra.modelHub.isOnline(),
                window.nyra.modelHub.getInstalled(),
                window.nyra.modelHub.getGpuInfo(),
                window.nyra.modelHub.getFamilies(),
                window.nyra.modelHub.getDownloads(),
            ]);
            setOllamaOnline(online);
            setInstalled(models);
            setGpuInfo(gpu);
            setFamilies(fams);
            setDownloads(dls);
        }
        catch { /* ignore */ }
        setLoading(false);
    }, []);
    useEffect(() => { refresh(); }, [refresh]);
    // Search library when query/filter changes
    useEffect(() => {
        window.nyra.modelHub.searchLibrary({ query: searchQuery || undefined, family: familyFilter || undefined })
            .then(setLibrary)
            .catch(() => { });
    }, [searchQuery, familyFilter]);
    // Subscribe to download events
    useEffect(() => {
        const unsubs = [
            window.nyra.modelHub.onDownloadProgress((d) => {
                setDownloads(prev => prev.map(j => j.id === d.id ? d : j));
            }),
            window.nyra.modelHub.onDownloadCompleted((d) => {
                setDownloads(prev => prev.map(j => j.id === d.id ? d : j));
                refresh(); // Refresh installed list
            }),
            window.nyra.modelHub.onDownloadFailed((d) => {
                setDownloads(prev => prev.map(j => j.id === d.id ? d : j));
            }),
            window.nyra.modelHub.onModelRemoved(() => {
                refresh();
            }),
        ];
        return () => unsubs.forEach(u => u());
    }, [refresh]);
    const openCard = async (name) => {
        const card = await window.nyra.modelHub.getModelCard(name);
        setSelectedCard(card);
    };
    if (!ollamaOnline && !loading) {
        return (<div className="flex flex-col items-center justify-center h-full gap-3 text-white/40 text-center p-8">
        <Cpu size={32} className="text-white/20"/>
        <p className="text-xs">Ollama is not running</p>
        <p className="text-[10px] text-white/30 max-w-xs">Start Ollama to browse and manage local AI models. Download it from <span className="text-terra-300">ollama.com</span></p>
        <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 mt-2 rounded-lg bg-white/[0.06] text-white/60 text-[10px] hover:bg-white/10 transition">
          <RefreshCw size={12}/> Retry
        </button>
      </div>);
    }
    const activeDownloads = downloads.filter(d => d.status === 'downloading' || d.status === 'queued');
    return (<div className="flex flex-col h-full">
      {/* Header with GPU info */}
      <div className="px-4 py-3 border-b border-white/[0.06] space-y-2">
        {gpuInfo && <VramBar usedMb={gpuInfo.totalVramMb - gpuInfo.availableVramMb} totalMb={gpuInfo.totalVramMb}/>}

        <div className="flex items-center gap-1.5">
          {['installed', 'library', 'downloads', 'compare'].map(m => (<button key={m} onClick={() => setMode(m)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition ${mode === m ? 'bg-terra-300/20 text-terra-300' : 'text-white/50 hover:text-white/70 hover:bg-white/5'}`}>
              {m === 'installed' ? `Installed (${installed.length})` :
                m === 'downloads' ? `Downloads${activeDownloads.length ? ` (${activeDownloads.length})` : ''}` :
                    m === 'library' ? 'Browse' :
                        'Compare'}
            </button>))}
          <button onClick={refresh} className="ml-auto p-1 hover:bg-white/10 rounded" title="Refresh">
            <RefreshCw size={12} className={`text-white/40 ${loading ? 'animate-spin' : ''}`}/>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">

        {/* ── Selected Model Card ──────────────────────────────────────── */}
        {selectedCard && (<ModelCardView card={selectedCard} onClose={() => setSelectedCard(null)}/>)}

        {/* ── Installed View ───────────────────────────────────────────── */}
        {mode === 'installed' && !selectedCard && (<>
            {installed.length === 0 ? (<div className="text-center py-8 text-white/30 text-[11px]">
                <p>No models installed yet.</p>
                <button onClick={() => setMode('library')} className="mt-2 text-terra-300 hover:underline">Browse available models</button>
              </div>) : (installed.map(m => (<button key={m.id} onClick={() => openCard(m.name)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition text-left">
                  <Cpu size={16} className="text-terra-300/60 flex-shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] text-white/80 truncate block">{m.name}</span>
                    <span className="text-[9px] text-white/40">{m.parameterSize || '—'} · {m.quantization || '—'} · {(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB</span>
                  </div>
                  <ChevronRight size={12} className="text-white/20 flex-shrink-0"/>
                </button>)))}
          </>)}

        {/* ── Library Browse ───────────────────────────────────────────── */}
        {mode === 'library' && !selectedCard && (<>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30"/>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search models..." className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg pl-7 pr-3 py-1.5 text-[10px] text-white/80 placeholder:text-white/30 outline-none"/>
              </div>
              <select value={familyFilter} onChange={e => setFamilyFilter(e.target.value)} className="bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1.5 text-[10px] text-white/80 outline-none">
                <option value="">All families</option>
                {families.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            {library.map(m => (<div key={m.name} className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-white/80">{m.name}</span>
                  <span className="text-[9px] text-white/30">{(m.pulls / 1000).toFixed(0)}K pulls</span>
                </div>
                <p className="text-[10px] text-white/50">{m.description}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {m.tags.slice(0, 6).map((t) => (<button key={t} onClick={() => openCard(`${m.name}:${t}`)} className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[9px] text-white/50 hover:text-white/70 hover:bg-white/10 transition">
                      {t}
                    </button>))}
                </div>
              </div>))}
          </>)}

        {/* ── Downloads ────────────────────────────────────────────────── */}
        {mode === 'downloads' && (<>
            {downloads.length === 0 ? (<p className="text-center py-8 text-white/30 text-[11px]">No downloads yet</p>) : (downloads.map(d => <DownloadProgress key={d.id} job={d}/>))}
          </>)}

        {/* ── Compare ──────────────────────────────────────────────────── */}
        {mode === 'compare' && (<>
            {installed.length < 2 ? (<p className="text-center py-8 text-white/30 text-[11px]">Install at least 2 models to compare</p>) : (<ComparePanel models={installed.map((m) => m.name)} onClose={() => setMode('installed')}/>)}
          </>)}
      </div>
    </div>);
};
export default ModelHubTab;
