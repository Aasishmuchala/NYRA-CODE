/**
 * Boot splash — shown while OpenClaw is installing/starting
 * Displays animated logo + live install log output
 */
import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { TitleBar } from './TitleBar';
const statusMessages = {
    idle: 'Initialising…',
    checking: 'Checking for OpenClaw…',
    installing: 'Installing OpenClaw (first run only)…',
    starting: 'Starting OpenClaw gateway…',
    ready: 'Connected!',
    running: 'Connected!',
    error: 'Something went wrong',
    stopped: 'OpenClaw stopped'
};
export const BootSplash = ({ status, log, onRetry }) => {
    const [logs, setLogs] = useState([]);
    useEffect(() => {
        window.nyra.openclaw.onInstallLog?.((line) => {
            setLogs(prev => [...prev.slice(-8), line.trim()]);
        });
        window.nyra.openclaw.onLog?.((line) => {
            setLogs(prev => [...prev.slice(-8), line.trim()]);
        });
    }, []);
    // Also show the single log line from hook state
    useEffect(() => {
        if (log)
            setLogs(prev => {
                if (prev[prev.length - 1] === log)
                    return prev;
                return [...prev.slice(-8), log];
            });
    }, [log]);
    const isError = status === 'error';
    return (<div className="h-screen w-screen flex flex-col bg-[#0c0c0c] text-white overflow-hidden">
      <TitleBar title="Nyra"/>
      <div className="flex flex-col items-center justify-center flex-1 gap-6 px-12 text-center">
        {/* Logo mark */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold-600 to-terra-700 flex items-center justify-center shadow-2xl shadow-terra-900/60">
          <span className="text-white text-3xl font-bold tracking-tight">N</span>
        </div>

        <div>
          <h1 className="text-white text-2xl font-semibold tracking-tight mb-1">Nyra</h1>
          <p className="text-white/40 text-sm">Your personal AI assistant</p>
        </div>

        {/* Status line */}
        <div className="flex items-center gap-2">
          {!isError && status !== 'ready' && status !== 'running' && (<Loader2 size={14} className="text-terra-400 animate-spin flex-shrink-0"/>)}
          <span className={`text-sm ${isError ? 'text-red-400' : 'text-white/50'}`}>
            {statusMessages[status] ?? status}
          </span>
        </div>

        {/* Live log output */}
        {logs.length > 0 && (<div className="w-full max-w-md bg-black/40 border border-white/5 rounded-xl p-3 font-mono text-[11px] text-left space-y-0.5">
            {logs.map((line, i) => (<p key={i} className={`truncate ${i === logs.length - 1 ? 'text-white/50' : 'text-white/25'}`}>
                {line}
              </p>))}
          </div>)}

        {isError && (<button onClick={onRetry ?? (() => window.nyra.openclaw.restart())} className="flex items-center gap-2 px-5 py-2 bg-terra-500 hover:bg-terra-400 text-white text-sm font-medium rounded-xl transition-colors">
            <RefreshCw size={13}/>
            Retry
          </button>)}
      </div>
    </div>);
};
