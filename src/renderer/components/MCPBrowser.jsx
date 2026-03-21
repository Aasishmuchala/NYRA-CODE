/**
 * MCP Server Browser — Discover, manage, and monitor MCP servers
 *
 * Now includes:
 * - Live server status (starting/ready/error/stopped)
 * - Start/Stop controls for running servers
 * - Tool count and tool list per server
 * - Real-time state updates via IPC events
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Server, Search, Plus, X, Loader2, ExternalLink, Slack, Github, Database, FileText, Terminal, Zap, Play, Square, RotateCcw, Wrench, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Circle, } from 'lucide-react';
// ── Hardcoded Popular MCP Servers ──────────────────────────────────────────
const MCP_SERVERS = [
    {
        id: 'slack',
        name: 'Slack',
        description: 'Send and read Slack messages, manage channels and threads',
        icon: <Slack className="w-5 h-5 text-blue-400"/>,
        command: 'npx',
        args: ['@anthropic-ai/mcp-server-slack'],
        category: 'communication',
        popular: true,
        docs: 'https://github.com/anthropics/mcp-server-slack',
    },
    {
        id: 'github',
        name: 'GitHub',
        description: 'Create issues, manage repos, search code and pull requests',
        icon: <Github className="w-5 h-5 text-white/80"/>,
        command: 'npx',
        args: ['@anthropic-ai/mcp-server-github'],
        category: 'development',
        popular: true,
        docs: 'https://github.com/anthropics/mcp-server-github',
    },
    {
        id: 'postgres',
        name: 'PostgreSQL',
        description: 'Query and manage PostgreSQL databases',
        icon: <Database className="w-5 h-5 text-blue-300"/>,
        command: 'npx',
        args: ['@anthropic-ai/mcp-server-postgres'],
        category: 'data',
        popular: true,
        env: { PG_CONNECTION_STRING: 'postgresql://user:pass@localhost/dbname' },
    },
    {
        id: 'filesystem',
        name: 'Filesystem',
        description: 'Read, write, and manage files on your system',
        icon: <FileText className="w-5 h-5 text-amber-400"/>,
        command: 'npx',
        args: ['@anthropic-ai/mcp-server-filesystem'],
        category: 'system',
        popular: true,
    },
    {
        id: 'brave-search',
        name: 'Brave Search',
        description: 'Search the web with privacy-focused Brave Search',
        icon: <Zap className="w-5 h-5 text-orange-400"/>,
        command: 'npx',
        args: ['@anthropic-ai/mcp-server-brave-search'],
        category: 'productivity',
        popular: true,
        env: { BRAVE_SEARCH_API_KEY: 'your-api-key' },
    },
    {
        id: 'docker',
        name: 'Docker',
        description: 'Manage Docker containers and images',
        icon: <Terminal className="w-5 h-5 text-blue-500"/>,
        command: 'npx',
        args: ['@anthropic-ai/mcp-server-docker'],
        category: 'system',
        popular: true,
    },
    {
        id: 'google-drive',
        name: 'Google Drive',
        description: 'Access files, folders, and collaborate on Google Drive',
        icon: <FileText className="w-5 h-5 text-blue-400"/>,
        command: 'npx',
        args: ['@anthropic-ai/mcp-server-google-drive'],
        category: 'productivity',
        popular: true,
    },
    {
        id: 'notion',
        name: 'Notion',
        description: 'Read and write to your Notion workspace',
        icon: <Database className="w-5 h-5 text-white/60"/>,
        command: 'npx',
        args: ['@anthropic-ai/mcp-server-notion'],
        category: 'productivity',
        popular: true,
        env: { NOTION_API_KEY: 'your-api-key' },
    },
    {
        id: 'memory',
        name: 'Memory',
        description: 'Store and retrieve persistent conversation memory',
        icon: <Zap className="w-5 h-5 text-purple-400"/>,
        command: 'npx',
        args: ['@anthropic-ai/mcp-server-memory'],
        category: 'development',
        popular: true,
    },
    {
        id: 'puppeteer',
        name: 'Browser Control (Puppeteer)',
        description: 'Automate browser tasks and web scraping',
        icon: <Terminal className="w-5 h-5 text-green-400"/>,
        command: 'npx',
        args: ['@anthropic-ai/mcp-server-puppeteer'],
        category: 'development',
        popular: true,
    },
];
const CATEGORIES = ['communication', 'development', 'productivity', 'data', 'system'];
// ── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ state }) => {
    const config = {
        starting: { icon: Loader2, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Starting', spin: true },
        ready: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Running', spin: false },
        error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Error', spin: false },
        stopped: { icon: Circle, color: 'text-white/30', bg: 'bg-white/[0.04]', label: 'Stopped', spin: false },
    }[state];
    const Icon = config.icon;
    return (<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${config.bg} ${config.color}`}>
      <Icon className={`w-3 h-3 ${config.spin ? 'animate-spin' : ''}`}/>
      {config.label}
    </span>);
};
// ── Main Component ───────────────────────────────────────────────────────────
export const MCPBrowser = ({ onClose }) => {
    const [servers, setServers] = useState({});
    const [runtimeStatus, setRuntimeStatus] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [installing, setInstalling] = useState(null);
    const [removing, setRemoving] = useState(null);
    const [starting, setStarting] = useState(null);
    const [stopping, setStopping] = useState(null);
    const [expandedServer, setExpandedServer] = useState(null);
    const [error, setError] = useState(null);
    // Load config + runtime status
    useEffect(() => {
        const load = async () => {
            try {
                const [configList, running] = await Promise.all([
                    window.nyra.mcp.list(),
                    window.nyra.mcp.listRunning(),
                ]);
                setServers(configList);
                setRuntimeStatus(running);
            }
            catch (err) {
                console.error('Failed to load MCP servers:', err);
                setError('Failed to load servers');
            }
        };
        load();
        // Listen for real-time status updates
        const cleanup = window.nyra.mcp.onServerStateChange((status) => {
            setRuntimeStatus(prev => {
                const idx = prev.findIndex(s => s.name === status.name);
                if (idx >= 0) {
                    const updated = [...prev];
                    updated[idx] = status;
                    return updated;
                }
                return [...prev, status];
            });
        });
        return cleanup;
    }, []);
    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleInstall = useCallback(async (serverDef) => {
        setInstalling(serverDef.id);
        setError(null);
        try {
            const config = {
                command: serverDef.command,
                args: serverDef.args,
                env: serverDef.env,
            };
            await window.nyra.mcp.add(serverDef.name, config);
            setServers(prev => ({ ...prev, [serverDef.name]: config }));
        }
        catch (err) {
            setError(`Failed to install ${serverDef.name}: ${err}`);
        }
        finally {
            setInstalling(null);
        }
    }, []);
    const handleRemove = useCallback(async (name) => {
        setRemoving(name);
        setError(null);
        try {
            // Stop the server first if running
            const running = runtimeStatus.find(s => s.name === name && s.state !== 'stopped');
            if (running) {
                await window.nyra.mcp.stopServer(name);
            }
            await window.nyra.mcp.remove(name);
            setServers(prev => {
                const next = { ...prev };
                delete next[name];
                return next;
            });
            setRuntimeStatus(prev => prev.filter(s => s.name !== name));
        }
        catch (err) {
            setError(`Failed to remove ${name}: ${err}`);
        }
        finally {
            setRemoving(null);
        }
    }, [runtimeStatus]);
    const handleStart = useCallback(async (name) => {
        setStarting(name);
        setError(null);
        try {
            const config = servers[name];
            if (!config)
                throw new Error('Server config not found');
            const result = await window.nyra.mcp.startServer(name, config);
            if (!result.success) {
                setError(`Failed to start ${name}: ${result.error}`);
            }
        }
        catch (err) {
            setError(`Failed to start ${name}: ${err.message || err}`);
        }
        finally {
            setStarting(null);
        }
    }, [servers]);
    const handleStop = useCallback(async (name) => {
        setStopping(name);
        try {
            await window.nyra.mcp.stopServer(name);
        }
        catch (err) {
            setError(`Failed to stop ${name}: ${err.message || err}`);
        }
        finally {
            setStopping(null);
        }
    }, []);
    // ── Derived state ────────────────────────────────────────────────────────
    const getRuntimeState = (name) => {
        return runtimeStatus.find(s => s.name === name) || null;
    };
    const isInstalled = (name) => !!servers[name];
    const filtered = useMemo(() => MCP_SERVERS.filter(server => {
        const matchSearch = !search ||
            server.name.toLowerCase().includes(search.toLowerCase()) ||
            server.description.toLowerCase().includes(search.toLowerCase());
        const matchCategory = !selectedCategory || server.category === selectedCategory;
        return matchSearch && matchCategory;
    }), [search, selectedCategory]);
    const runningCount = runtimeStatus.filter(s => s.state === 'ready').length;
    const totalToolCount = runtimeStatus
        .filter(s => s.state === 'ready')
        .reduce((sum, s) => sum + s.tools.length, 0);
    return (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#0b0a08] border border-white/[0.06] rounded-2xl w-[90vw] max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-terra-400"/>
            <h2 className="text-lg font-semibold text-white">MCP Servers</h2>
            {runningCount > 0 && (<span className="text-xs text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                {runningCount} running &middot; {totalToolCount} tools
              </span>)}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.04] rounded-lg transition-colors text-white/40 hover:text-white/80">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="px-5 py-4 border-b border-white/[0.06] space-y-3">
          <div className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.06] rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-white/40"/>
            <input type="text" placeholder="Search servers..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none text-white placeholder-white/40 text-sm"/>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSelectedCategory(null)} className={`px-3 py-1 rounded-lg text-xs transition-colors ${selectedCategory === null
            ? 'bg-terra-500/30 text-terra-200 border border-terra-500/50'
            : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'}`}>
              All
            </button>
            {CATEGORIES.map(cat => (<button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3 py-1 rounded-lg text-xs transition-colors capitalize ${selectedCategory === cat
                ? 'bg-terra-500/30 text-terra-200 border border-terra-500/50'
                : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'}`}>
                {cat}
              </button>))}
          </div>
        </div>

        {/* Error Banner */}
        {error && (<div className="mx-5 mt-3 px-4 py-2 text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400">
              <X className="w-4 h-4"/>
            </button>
          </div>)}

        {/* Server List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {filtered.map(server => {
            const installed = isInstalled(server.name);
            const runtime = getRuntimeState(server.name);
            const isExpanded = expandedServer === server.name;
            const isLoading = installing === server.id || removing === server.name;
            const isStarting = starting === server.name;
            const isStopping = stopping === server.name;
            const isRunning = runtime?.state === 'ready';
            const hasError = runtime?.state === 'error';
            return (<div key={server.id} className={`border rounded-xl transition-colors ${isRunning
                    ? 'bg-emerald-500/[0.03] border-emerald-500/20'
                    : hasError
                        ? 'bg-red-500/[0.03] border-red-500/20'
                        : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.03]'}`}>
                {/* Main Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-shrink-0">{server.icon}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white text-sm truncate">{server.name}</h3>
                      {runtime && <StatusBadge state={runtime.state}/>}
                      {runtime?.state === 'ready' && runtime.tools.length > 0 && (<span className="text-[10px] text-white/40 flex items-center gap-1">
                          <Wrench className="w-3 h-3"/>
                          {runtime.tools.length}
                        </span>)}
                    </div>
                    <p className="text-white/40 text-xs mt-0.5 truncate">{server.description}</p>
                    {hasError && runtime?.error && (<p className="text-red-400/80 text-xs mt-1 truncate">{runtime.error}</p>)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {installed && (<>
                        {isRunning ? (<button onClick={() => handleStop(server.name)} disabled={isStopping} className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/80 transition-colors" title="Stop server">
                            {isStopping ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Square className="w-3.5 h-3.5"/>}
                          </button>) : (<button onClick={() => handleStart(server.name)} disabled={isStarting || runtime?.state === 'starting'} className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-colors" title="Start server">
                            {(isStarting || runtime?.state === 'starting')
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin"/>
                            : <Play className="w-3.5 h-3.5"/>}
                          </button>)}
                        {hasError && (<button onClick={() => handleStart(server.name)} className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors" title="Restart server">
                            <RotateCcw className="w-3.5 h-3.5"/>
                          </button>)}
                        {/* Expand tools */}
                        {isRunning && runtime.tools.length > 0 && (<button onClick={() => setExpandedServer(isExpanded ? null : server.name)} className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors" title="View tools">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
                          </button>)}
                      </>)}

                    {server.docs && (<a href={server.docs} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors" title="Documentation">
                        <ExternalLink className="w-3.5 h-3.5"/>
                      </a>)}

                    {installed ? (<button onClick={() => handleRemove(server.name)} disabled={isLoading} className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50">
                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Remove'}
                      </button>) : (<button onClick={() => handleInstall(server)} disabled={isLoading} className="px-3 py-1.5 text-xs rounded-lg bg-terra-500/30 hover:bg-terra-500/40 text-terra-200 transition-colors disabled:opacity-50 flex items-center gap-1">
                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Plus className="w-3 h-3"/>}
                        Install
                      </button>)}
                  </div>
                </div>

                {/* Expanded Tools List */}
                {isExpanded && runtime && runtime.tools.length > 0 && (<div className="px-4 pb-3 pt-1 border-t border-white/[0.04]">
                    <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Wrench className="w-3 h-3"/>
                      Available Tools ({runtime.tools.length})
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {runtime.tools.map(tool => (<div key={tool.name} className="px-2 py-1 bg-white/[0.02] rounded text-xs">
                          <span className="text-white/70 font-mono">{tool.name}</span>
                          {tool.description && (<span className="text-white/30 ml-1 truncate">— {tool.description}</span>)}
                        </div>))}
                    </div>
                  </div>)}
              </div>);
        })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-xs text-white/30">
            {Object.keys(servers).length} configured &middot; {runningCount} running
          </span>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-terra-500/30 hover:bg-terra-500/40 text-terra-200 text-sm transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>);
};
export default MCPBrowser;
