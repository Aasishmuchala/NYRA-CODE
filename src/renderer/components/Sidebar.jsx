/**
 * Left Sidebar — session list, new chat button, settings link
 */
import React, { useState } from 'react';
import { Plus, MessageSquare, Settings, Plug, Search } from 'lucide-react';
export const Sidebar = ({ sessions, activeSession, onSelectSession, onNewChat, onOpenSettings }) => {
    const [search, setSearch] = useState('');
    const filtered = sessions.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()));
    const grouped = groupByDate(filtered);
    return (<div className="w-60 flex flex-col h-full bg-black/30 border-r border-white/5 flex-shrink-0">
      {/* New chat */}
      <div className="p-3">
        <button onClick={onNewChat} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm transition-colors">
          <Plus size={15}/>
          <span>New chat</span>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/5 border border-white/5">
          <Search size={12} className="text-white/30 flex-shrink-0"/>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats..." className="bg-transparent text-xs text-white/70 placeholder-white/25 outline-none w-full"/>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-4 pb-2">
        {Object.entries(grouped).map(([label, items]) => (<div key={label}>
            <p className="text-[10px] uppercase font-semibold text-white/20 px-2 mb-1 tracking-wider">
              {label}
            </p>
            {items.map((s) => (<button key={s.id} onClick={() => onSelectSession(s.id)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs truncate transition-colors ${activeSession?.id === s.id
                    ? 'bg-white/10 text-white'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}>
                <MessageSquare size={12} className="flex-shrink-0"/>
                <span className="truncate">{s.title}</span>
              </button>))}
          </div>))}
        {filtered.length === 0 && (<p className="text-white/20 text-xs text-center pt-8">No chats yet</p>)}
      </div>

      {/* Bottom actions */}
      <div className="border-t border-white/5 p-2 flex items-center gap-1">
        <button onClick={onOpenSettings} className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/5 text-xs transition-colors">
          <Settings size={13}/>
          <span>Settings</span>
        </button>
        <button onClick={onOpenSettings} className="ml-auto flex items-center gap-1.5 px-2 py-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/5 text-xs transition-colors">
          <Plug size={13}/>
          <span>MCP</span>
        </button>
      </div>
    </div>);
};
// ── Helpers ────────────────────────────────────────────────────────────────────
function groupByDate(sessions) {
    const now = Date.now();
    const groups = {
        Today: [],
        Yesterday: [],
        'This Week': [],
        Older: []
    };
    for (const s of sessions) {
        const diff = now - s.updatedAt;
        const days = diff / (1000 * 60 * 60 * 24);
        if (days < 1)
            groups.Today.push(s);
        else if (days < 2)
            groups.Yesterday.push(s);
        else if (days < 7)
            groups['This Week'].push(s);
        else
            groups.Older.push(s);
    }
    return Object.fromEntries(Object.entries(groups).filter(([, v]) => v.length > 0));
}
