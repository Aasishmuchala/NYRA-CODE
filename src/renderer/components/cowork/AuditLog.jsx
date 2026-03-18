import React, { useState, useMemo } from 'react';
import { Shield, RotateCcw, Download, Search, FileEdit, FilePlus, FileX, Terminal, CheckCircle, Loader, } from 'lucide-react';
import { useAuditLog } from '../../hooks/useAuditLog';
// Map action field to action type display
const getActionType = (action) => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes('create'))
        return 'file_create';
    if (actionLower.includes('edit') || actionLower.includes('update'))
        return 'file_edit';
    if (actionLower.includes('delete'))
        return 'file_delete';
    if (actionLower.includes('command') || actionLower.includes('run'))
        return 'command_run';
    if (actionLower.includes('approval'))
        return 'approval_request';
    if (actionLower.includes('transition'))
        return 'task_transition';
    return 'file_edit';
};
const actionTypeColors = {
    file_create: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    file_edit: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    file_delete: 'bg-red-500/20 text-red-400 border-red-500/30',
    command_run: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    approval_request: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    task_transition: 'bg-white/[0.06] text-white/40 border-white/[0.08]',
};
const actionTypeIcons = {
    file_create: <FilePlus size={16}/>,
    file_edit: <FileEdit size={16}/>,
    file_delete: <FileX size={16}/>,
    command_run: <Terminal size={16}/>,
    approval_request: <CheckCircle size={16}/>,
    task_transition: <Shield size={16}/>,
};
export const AuditLog = () => {
    const { entries, loading, exportAudit, refreshEntries } = useAuditLog();
    const [filterAgent, setFilterAgent] = useState('');
    const [searchText, setSearchText] = useState('');
    const uniqueAgents = useMemo(() => Array.from(new Set(entries.map((entry) => entry.agentId))), [entries]);
    const filteredEntries = useMemo(() => {
        return entries.filter((entry) => {
            if (filterAgent && entry.agentId !== filterAgent)
                return false;
            if (searchText) {
                const text = searchText.toLowerCase();
                return (entry.description.toLowerCase().includes(text) ||
                    entry.filePath?.toLowerCase().includes(text) ||
                    entry.agentId.toLowerCase().includes(text));
            }
            return true;
        });
    }, [entries, filterAgent, searchText]);
    const handleExport = async (format) => {
        try {
            const content = await exportAudit(format);
            const filename = `audit-log-${new Date().toISOString().split('T')[0]}.${format}`;
            const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        catch (error) {
            console.error('Failed to export audit log:', error);
        }
    };
    const handleFilterChange = async (agentId, action) => {
        try {
            const filters = {};
            if (agentId)
                filters.agentId = agentId;
            if (action)
                filters.action = action;
            await refreshEntries(filters);
        }
        catch (error) {
            console.error('Failed to filter entries:', error);
        }
    };
    return (<div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-white/[0.02] p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-white/40"/>
            <h2 className="text-sm font-semibold text-white/80">Audit Log</h2>
            {loading ? (<Loader size={14} className="text-terra-300 animate-spin"/>) : (<span className="text-xs text-white/30">({filteredEntries.length} entries)</span>)}
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleExport('json')} disabled={loading} className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white/60 text-xs font-medium flex items-center gap-1.5 transition-colors">
              <Download size={14}/>
              JSON
            </button>
            <button onClick={() => handleExport('csv')} disabled={loading} className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white/60 text-xs font-medium flex items-center gap-1.5 transition-colors">
              <Download size={14}/>
              CSV
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25"/>
            <input type="text" placeholder="Search entries..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg text-xs text-white/80 placeholder-white/25 focus:outline-none focus:border-white/15"/>
          </div>

          {/* Agent Filter */}
          <select value={filterAgent} onChange={(e) => {
            setFilterAgent(e.target.value);
            handleFilterChange(e.target.value || undefined);
        }} className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg text-xs text-white/80 focus:outline-none focus:border-white/15 cursor-pointer">
            <option value="">All Agents</option>
            {uniqueAgents.map((agent) => (<option key={agent} value={agent}>
                {agent}
              </option>))}
          </select>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading ? (<div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader size={32} className="text-terra-300 animate-spin"/>
              <p className="text-xs text-white/40">Loading audit entries...</p>
            </div>
          </div>) : filteredEntries.length === 0 ? (<div className="flex items-center justify-center h-full text-white/30">
            <p className="text-xs">No entries match the current filters</p>
          </div>) : (<div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-white/[0.08] to-white/[0.03]"/>

            {/* Entries */}
            <div className="space-y-4">
              {filteredEntries.map((entry) => {
                const actionType = getActionType(entry.action);
                return (<div key={entry.id} className="relative pl-16">
                    {/* Timeline dot */}
                    <div className="absolute left-1 top-2 w-3 h-3 rounded-full bg-white/[0.08] border-2 border-white/[0.04] ring-2 ring-white/[0.06]"/>

                    {/* Entry Card */}
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 hover:border-white/[0.12] transition-colors">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <div className={`p-1.5 rounded border ${actionTypeColors[actionType] || actionTypeColors.file_edit}`}>
                            {actionTypeIcons[actionType] || actionTypeIcons.file_edit}
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-medium text-white/80 leading-tight">
                              {entry.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-white/30">
                                {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                    })}
                              </span>
                              <span className="text-xs text-white/15">•</span>
                              <span className="text-xs text-white/40">{entry.agentId}</span>
                              {entry.filePath && (<>
                                  <span className="text-xs text-white/15">•</span>
                                  <span className="text-xs text-white/30 truncate">
                                    {entry.filePath}
                                  </span>
                                </>)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pl-10">
                        {entry.reversible && (<button className="px-2.5 py-1 rounded border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-white/60 text-xs font-medium flex items-center gap-1.5 transition-colors">
                            <RotateCcw size={12}/>
                            Rollback
                          </button>)}
                      </div>
                    </div>
                  </div>);
            })}
            </div>
          </div>)}
      </div>
    </div>);
};
export default AuditLog;
