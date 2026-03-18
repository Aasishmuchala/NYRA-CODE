import React, { useState, useEffect } from 'react';
import { FileCode, FilePlus, FileX, FileEdit, Check, X, RotateCcw, ChevronRight, ChevronDown, Loader2, Play, Send, } from 'lucide-react';
const CHANGE_ICONS = {
    create: FilePlus, modify: FileEdit, delete: FileX, rename: FileCode,
};
const CHANGE_COLORS = {
    create: 'text-emerald-400', modify: 'text-blue-400', delete: 'text-red-400', rename: 'text-amber-400',
};
// ── File Change Row ──────────────────────────────────────────────────────────
const ChangeRow = ({ change, sessionId, expanded, onToggle }) => {
    const Icon = CHANGE_ICONS[change.changeType] || FileCode;
    const color = CHANGE_COLORS[change.changeType] || 'text-white/60';
    const fileName = change.filePath.split('/').pop() || change.filePath;
    const handleAccept = (e) => {
        e.stopPropagation();
        window.nyra.composer.acceptChange(sessionId, change.id, true);
    };
    const handleReject = (e) => {
        e.stopPropagation();
        window.nyra.composer.acceptChange(sessionId, change.id, false);
    };
    return (<div className="border border-white/[0.06] rounded-lg overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition text-left">
        {expanded ? <ChevronDown size={12} className="text-white/30"/> : <ChevronRight size={12} className="text-white/30"/>}
        <Icon size={14} className={color}/>
        <span className="text-[11px] text-white/80 flex-1 truncate">{fileName}</span>
        <span className="text-[9px] text-white/30">{change.changeType}</span>
        {change.accepted === null && (<div className="flex gap-1">
            <button onClick={handleAccept} className="p-0.5 hover:bg-emerald-500/20 rounded" title="Accept">
              <Check size={12} className="text-emerald-400"/>
            </button>
            <button onClick={handleReject} className="p-0.5 hover:bg-red-500/20 rounded" title="Reject">
              <X size={12} className="text-red-400"/>
            </button>
          </div>)}
        {change.accepted === true && <Check size={12} className="text-emerald-400"/>}
        {change.accepted === false && <X size={12} className="text-red-400/50"/>}
      </button>

      {expanded && (<div className="border-t border-white/[0.06] px-3 py-2 bg-black/20 space-y-2">
          <p className="text-[10px] text-white/50">{change.description}</p>
          <p className="text-[9px] text-white/30 truncate">{change.filePath}</p>

          {change.changeType !== 'delete' && change.newContent && (<pre className="text-[9px] text-white/60 bg-white/[0.03] rounded p-2 max-h-48 overflow-auto font-mono leading-relaxed whitespace-pre-wrap">
              {change.newContent.slice(0, 3000)}
              {change.newContent.length > 3000 && '\n... (truncated)'}
            </pre>)}
        </div>)}
    </div>);
};
// ── Main ComposerPanel ───────────────────────────────────────────────────────
const ComposerPanel = () => {
    const [request, setRequest] = useState('');
    const [filePaths, setFilePaths] = useState('');
    const [session, setSession] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expandedChanges, setExpandedChanges] = useState(new Set());
    // Load sessions
    useEffect(() => {
        window.nyra.composer.listSessions().then(setSessions).catch(() => { });
    }, [session?.status]);
    // Subscribe to events
    useEffect(() => {
        const unsubs = [
            window.nyra.composer.onPreview((s) => setSession(s)),
            window.nyra.composer.onApplied(() => {
                if (session) {
                    window.nyra.composer.getSession(session.id).then(setSession);
                }
            }),
            window.nyra.composer.onFailed((data) => {
                if (session?.id === data.id) {
                    window.nyra.composer.getSession(session.id).then(setSession);
                }
            }),
        ];
        return () => unsubs.forEach((u) => u());
    }, [session?.id]);
    const handleCompose = async () => {
        if (!request.trim())
            return;
        setLoading(true);
        const files = filePaths.split('\n').map(f => f.trim()).filter(Boolean);
        const res = await window.nyra.composer.compose({ request: request.trim(), files });
        if (res.success) {
            setSession(res.session);
        }
        setLoading(false);
    };
    const handleApply = async () => {
        if (!session)
            return;
        setLoading(true);
        await window.nyra.composer.apply(session.id);
        const updated = await window.nyra.composer.getSession(session.id);
        setSession(updated);
        setLoading(false);
    };
    const handleRollback = async () => {
        if (!session)
            return;
        await window.nyra.composer.rollback(session.id);
        const updated = await window.nyra.composer.getSession(session.id);
        setSession(updated);
    };
    const handleAcceptAll = async () => {
        if (!session)
            return;
        await window.nyra.composer.acceptAll(session.id);
        const updated = await window.nyra.composer.getSession(session.id);
        setSession(updated);
    };
    const toggleExpand = (changeId) => {
        setExpandedChanges(prev => {
            const next = new Set(prev);
            next.has(changeId) ? next.delete(changeId) : next.add(changeId);
            return next;
        });
    };
    const pendingCount = session?.changes?.filter((c) => c.accepted === null).length ?? 0;
    const acceptedCount = session?.changes?.filter((c) => c.accepted === true).length ?? 0;
    return (<div className="flex flex-col h-full">
      {/* Input area */}
      <div className="px-4 py-3 border-b border-white/[0.06] space-y-2">
        <textarea value={request} onChange={e => setRequest(e.target.value)} placeholder="Describe the changes you want across multiple files..." className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-white/80 placeholder:text-white/30 outline-none resize-none h-16"/>
        <textarea value={filePaths} onChange={e => setFilePaths(e.target.value)} placeholder="File paths (one per line) to include as context..." className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-[10px] text-white/70 placeholder:text-white/25 outline-none resize-none h-12 font-mono"/>
        <button onClick={handleCompose} disabled={loading || !request.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-terra-300/10 text-terra-300 text-[10px] hover:bg-terra-300/20 transition disabled:opacity-40">
          {loading ? <Loader2 size={12} className="animate-spin"/> : <Send size={12}/>}
          {loading ? 'Generating...' : 'Compose Changes'}
        </button>
      </div>

      {/* Preview / Results */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {!session && sessions.length === 0 && (<div className="flex flex-col items-center justify-center py-12 text-white/30 gap-2">
            <FileCode size={28} className="text-white/15"/>
            <p className="text-[11px]">Multi-file composer</p>
            <p className="text-[9px] text-white/20">Describe changes and provide file paths to generate coordinated edits</p>
          </div>)}

        {session && (<>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-white/80">{session.changes?.length || 0} file changes</h3>
                <p className="text-[9px] text-white/40 mt-0.5">
                  {session.status === 'preview' && `${acceptedCount} accepted · ${pendingCount} pending`}
                  {session.status === 'applied' && 'Applied successfully'}
                  {session.status === 'failed' && session.error}
                  {session.status === 'rolled_back' && 'Rolled back'}
                </p>
              </div>
              <div className="flex gap-1.5">
                {session.status === 'preview' && (<>
                    <button onClick={handleAcceptAll} className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 text-[9px] hover:bg-emerald-500/20">
                      <Check size={10}/> Accept All
                    </button>
                    <button onClick={handleApply} disabled={acceptedCount === 0 || loading} className="flex items-center gap-1 px-2 py-1 rounded bg-terra-300/10 text-terra-300 text-[9px] hover:bg-terra-300/20 disabled:opacity-40">
                      <Play size={10}/> Apply
                    </button>
                  </>)}
                {session.status === 'applied' && (<button onClick={handleRollback} className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 text-amber-300 text-[9px] hover:bg-amber-500/20">
                    <RotateCcw size={10}/> Rollback
                  </button>)}
              </div>
            </div>

            {session.changes?.map((change) => (<ChangeRow key={change.id} change={change} sessionId={session.id} expanded={expandedChanges.has(change.id)} onToggle={() => toggleExpand(change.id)}/>))}
          </>)}
      </div>
    </div>);
};
export default ComposerPanel;
