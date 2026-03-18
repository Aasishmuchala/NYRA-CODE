/**
 * MemorySection — Compact memory view for sidebar.
 * Shows recent memories with type badges and search.
 * Uses real memory IPC via window.nyra.memory.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Search, Pin, Database, } from 'lucide-react';
const TYPE_COLORS = {
    fact: 'text-blue-400/70',
    preference: 'text-purple-400/70',
    decision: 'text-amber-400/70',
    code_pattern: 'text-emerald-400/70',
    context: 'text-cyan-400/70',
    summary: 'text-pink-400/70',
};
const MemorySection = () => {
    const [memories, setMemories] = useState([]);
    const [stats, setStats] = useState(null);
    const [query, setQuery] = useState('');
    const refresh = useCallback(async () => {
        try {
            const [mems, s] = await Promise.all([
                window.nyra.memory.list({ limit: 10 }),
                window.nyra.memory.getStats(),
            ]);
            setMemories(mems);
            setStats(s);
        }
        catch { /* */ }
    }, []);
    useEffect(() => { refresh(); }, [refresh]);
    useEffect(() => {
        const unsubs = [
            window.nyra.memory.onMemoryAdded(() => refresh()),
            window.nyra.memory.onMemoryUpdated(() => refresh()),
            window.nyra.memory.onMemoryDeleted(() => refresh()),
        ];
        return () => unsubs.forEach((u) => u());
    }, [refresh]);
    const handleSearch = async () => {
        if (!query.trim())
            return;
        const results = await window.nyra.memory.search(query);
        setMemories(results);
    };
    return (<div className="space-y-2">
      {/* Stats */}
      {stats && (<div className="flex items-center gap-3 text-[9px] text-white/30">
          <span className="flex items-center gap-1"><Database size={9}/> {stats.totalMemories} memories</span>
          <span className={stats.embeddingModelAvailable ? 'text-emerald-400/50' : 'text-amber-400/50'}>
            {stats.embeddingModelAvailable ? 'semantic' : 'keyword'}
          </span>
        </div>)}

      {/* Search */}
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/25"/>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Search memories..." className="w-full bg-white/[0.04] border border-white/[0.07] rounded-md pl-6 pr-2 py-1.5 text-[10px] text-white/70 placeholder:text-white/25 outline-none focus:border-terra-300/30"/>
      </div>

      {/* Memory list */}
      {memories.length > 0 ? (<div className="space-y-1">
          {memories.map(entry => (<div key={entry.id} className="flex items-start gap-2 py-1 group">
              <span className={`text-[9px] mt-0.5 font-medium flex-shrink-0 ${TYPE_COLORS[entry.type] || 'text-white/40'}`}>
                {entry.type.replace('_', ' ').charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white/60 leading-snug line-clamp-2">{entry.content}</p>
                {entry.topic && (<span className="text-[8px] text-white/25 mt-0.5 block">{entry.topic}</span>)}
              </div>
              {entry.pinned && <Pin size={9} className="text-amber-400/50 flex-shrink-0 mt-0.5"/>}
            </div>))}
        </div>) : (<p className="text-[10px] text-white/30 py-1">
          {query ? 'No matching memories' : 'No memories yet'}
        </p>)}
    </div>);
};
export default MemorySection;
