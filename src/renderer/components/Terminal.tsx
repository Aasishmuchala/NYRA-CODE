import 'xterm/css/xterm.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ChevronDown, Plus, X } from 'lucide-react';

interface TerminalSession {
  id: string;
  cwd: string;
  pid: number;
  terminal?: XTerminal;
  fitAddon?: FitAddon;
}

interface TerminalPanelProps {
  visible: boolean;
  onToggle: () => void;
  defaultCwd?: string;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({
  visible,
  onToggle,
  defaultCwd,
}) => {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const unsubscribeDataRef = useRef<(() => void) | null>(null);
  const unsubscribeExitRef = useRef<(() => void) | null>(null);

  const ptyApi = typeof window !== 'undefined' ? window.nyra?.pty : null;

  // Create a new terminal session
  const createSession = useCallback(async () => {
    if (!ptyApi) {
      console.error('PTY API not available');
      return;
    }

    try {
      const sessionId = await ptyApi.create(defaultCwd);
      const sessionList = await ptyApi.list();
      const sessionInfo = sessionList.find((s) => s.id === sessionId);

      if (sessionInfo) {
        const newSession: TerminalSession = {
          id: sessionId,
          cwd: sessionInfo.cwd,
          pid: sessionInfo.pid,
        };

        setSessions((prev) => [...prev, newSession]);
        setActiveSessionId(sessionId);
      }
    } catch (error) {
      console.error('Failed to create terminal session:', error);
    }
  }, [ptyApi, defaultCwd]);

  // Initialize PTY event listeners
  useEffect(() => {
    if (!ptyApi) return;

    // Handle data from PTY
    const unsubscribeData = ptyApi.onData((id: string, data: string) => {
      setSessions((prev) => {
        const session = prev.find((s) => s.id === id);
        if (session?.terminal) {
          session.terminal.write(data);
        }
        return prev;
      });
    });

    // Handle PTY exit
    const unsubscribeExit = ptyApi.onExit(
      (id: string, _exitCode?: number, _signal?: number) => {
        setSessions((prev) => {
          const session = prev.find((s) => s.id === id);
          if (session?.terminal) {
            session.terminal.dispose();
          }
          const filtered = prev.filter((s) => s.id !== id);

          // Switch to another session if the active one closed
          if (id === activeSessionId && filtered.length > 0) {
            setActiveSessionId(filtered[0].id);
          } else if (filtered.length === 0) {
            setActiveSessionId(null);
          }

          return filtered;
        });
      }
    );

    unsubscribeDataRef.current = unsubscribeData;
    unsubscribeExitRef.current = unsubscribeExit;

    return () => {
      unsubscribeData();
      unsubscribeExit();
    };
  }, [ptyApi, activeSessionId]);

  // Initialize and cleanup xterm instances for active session
  useEffect(() => {
    if (!visible || !activeSessionId || !ptyApi) return;

    setSessions((prev) => {
      const session = prev.find((s) => s.id === activeSessionId);
      if (!session || session.terminal) return prev;

      const terminalDiv = terminalRefs.current.get(activeSessionId);
      if (!terminalDiv) return prev;

      // Create and configure xterm terminal
      const term = new XTerminal({
        theme: {
          background: '#0d0d0d',
          foreground: '#e0e0e0',
          cursor: '#c4704b',
          selectionBackground: 'rgba(196,112,75,0.3)',
        },
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 13,
        scrollback: 1000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      // Attach terminal to DOM
      term.open(terminalDiv);

      // Load and display history
      (async () => {
        try {
          const history = await ptyApi.history(activeSessionId);
          if (history) {
            term.write(history);
          }
        } catch (error) {
          console.error('Failed to load terminal history:', error);
        }
      })();

      // Fit to container
      setTimeout(() => {
        try {
          fitAddon.fit();
        } catch (error) {
          console.error('Failed to fit terminal:', error);
        }
      }, 0);

      // Handle terminal input
      term.onData((data) => {
        ptyApi.write(activeSessionId, data).catch((error) => {
          console.error('Failed to write to PTY:', error);
        });
      });

      // Setup resize observer for container changes
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }

      resizeObserverRef.current = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          const { cols, rows } = term;
          ptyApi.resize(activeSessionId, cols, rows).catch((error) => {
            console.error('Failed to resize PTY:', error);
          });
        } catch (error) {
          console.error('Failed to fit terminal on resize:', error);
        }
      });

      if (terminalDiv.parentElement) {
        resizeObserverRef.current.observe(terminalDiv.parentElement);
      }

      // Update session with terminal instance
      return prev.map((s) =>
        s.id === activeSessionId ? { ...s, terminal: term, fitAddon } : s
      );
    });

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [visible, activeSessionId, ptyApi]);

  // Close a session
  const closeSession = useCallback(
    async (sessionId: string) => {
      if (!ptyApi) return;

      const session = sessions.find((s) => s.id === sessionId);
      if (session?.terminal) {
        session.terminal.dispose();
      }

      try {
        await ptyApi.kill(sessionId);
      } catch (error) {
        console.error('Failed to kill PTY session:', error);
      }

      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== sessionId);
        if (sessionId === activeSessionId && filtered.length > 0) {
          setActiveSessionId(filtered[0].id);
        } else if (filtered.length === 0) {
          setActiveSessionId(null);
        }
        return filtered;
      });
    },
    [ptyApi, sessions, activeSessionId]
  );

  // Get tab display name from CWD
  const getTabName = (cwd: string): string => {
    const parts = cwd.split('/');
    return parts[parts.length - 1] || cwd;
  };

  // Create initial session when panel becomes visible
  useEffect(() => {
    if (visible && sessions.length === 0) {
      createSession();
    }
  }, [visible, sessions.length, createSession]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-80 bg-neutral-950 border-t border-neutral-800 overflow-hidden"
    >
      {/* Header with tab bar */}
      <div className="flex items-center bg-neutral-900 border-b border-neutral-800">
        {/* Tab buttons */}
        <div className="flex items-center gap-0 overflow-x-auto flex-1 min-w-0">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap border-r border-neutral-800 transition-colors ${
                activeSessionId === session.id
                  ? 'bg-neutral-800 text-terra-400 border-b-2 border-b-terra-400'
                  : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              <span>{getTabName(session.cwd)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(session.id);
                }}
                className="hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 px-2 py-2 border-l border-neutral-800">
          <button
            onClick={createSession}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="New terminal"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="Toggle terminal panel"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {/* Terminal container */}
      <div className="flex-1 overflow-hidden">
        {sessions.map((session) => (
          <div
            key={session.id}
            ref={(el) => {
              if (el) {
                terminalRefs.current.set(session.id, el);
              }
            }}
            className={`w-full h-full bg-neutral-950 ${
              activeSessionId === session.id ? 'block' : 'hidden'
            }`}
          />
        ))}
        {sessions.length === 0 && (
          <div className="w-full h-full flex items-center justify-center text-neutral-500">
            <button
              onClick={createSession}
              className="px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
            >
              + New Terminal
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalPanel;
