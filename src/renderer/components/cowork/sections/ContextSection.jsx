/**
 * ContextSection — Compact context budget view for sidebar.
 * Shows token budget bar and active sources list.
 * Uses real useContextEngine hook.
 */
import React from 'react';
import { File, Folder, Clipboard, Globe, Database, Pin, } from 'lucide-react';
import { useContextEngine } from '../../../hooks/useContextEngine';
const TYPE_ICONS = {
    file: File,
    folder: Folder,
    clipboard: Clipboard,
    web: Globe,
    memory: Database,
};
const ContextSection = () => {
    const { sources, budget } = useContextEngine();
    const usagePct = budget ? budget.percent : 0;
    const barColor = usagePct < 33 ? 'bg-emerald-500' : usagePct < 66 ? 'bg-amber-500' : 'bg-red-500';
    return (<div className="space-y-3">
      {/* Budget bar */}
      {budget && (<div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-white/50">
              {budget.used.toLocaleString()} / {budget.limit.toLocaleString()} tokens
            </span>
            <span className="text-[10px] text-white/35">{budget.percent.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div className={`h-full ${barColor} rounded-full transition-all duration-300`} style={{ width: `${Math.min(usagePct, 100)}%` }}/>
          </div>
        </div>)}

      {/* Sources list */}
      {sources.length > 0 ? (<div className="space-y-0.5">
          {sources.filter(s => s.active).map(source => {
                const Icon = TYPE_ICONS[source.type] || File;
                return (<div key={source.id} className="flex items-center gap-2 py-1">
                <Icon size={12} className="text-terra-300/60 flex-shrink-0"/>
                <span className="text-[10px] text-white/65 flex-1 truncate">{source.name}</span>
                {source.pinned && <Pin size={9} className="text-amber-400/60 flex-shrink-0"/>}
                <span className="text-[9px] text-white/30 tabular-nums flex-shrink-0">
                  {source.tokens.toLocaleString()}
                </span>
              </div>);
            })}
        </div>) : (<p className="text-[10px] text-white/30 py-1">No context sources</p>)}

      {/* Summary stats */}
      <div className="flex items-center gap-3 text-[9px] text-white/30">
        <span>{sources.filter(s => s.active).length} active</span>
        <span>{sources.filter(s => s.pinned).length} pinned</span>
      </div>
    </div>);
};
export default ContextSection;
