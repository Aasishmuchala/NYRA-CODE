'use client';
import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Mouse, Keyboard, Monitor, X, Check, Clock, AlertTriangle, } from 'lucide-react';
const ActionQueueContext = createContext(undefined);
// Hook for managing action queue
export function useActionQueue() {
    const context = useContext(ActionQueueContext);
    if (!context) {
        throw new Error('useActionQueue must be used within ActionQueueProvider');
    }
    return context;
}
// Provider component
export function ActionQueueProvider({ children }) {
    const [queue, setQueue] = useState([]);
    const [alwaysAllowList, setAlwaysAllowList] = useState(new Set());
    const pendingCallbacks = useRef(new Map());
    const enqueue = useCallback((action) => {
        // If this action type is in the always-allow list, auto-approve immediately
        setQueue((prev) => [...prev, action]);
    }, []);
    // Sweep stale pendingCallbacks entries that no longer have a matching queue item
    useEffect(() => {
        const queueIds = new Set(queue.map(a => a.id));
        for (const id of pendingCallbacks.current.keys()) {
            if (!queueIds.has(id)) {
                const cb = pendingCallbacks.current.get(id);
                if (cb)
                    cb.resolve('denied'); // resolve as denied for cleanup
                pendingCallbacks.current.delete(id);
            }
        }
    }, [queue]);
    const approve = useCallback((actionId) => {
        const callback = pendingCallbacks.current.get(actionId);
        if (callback) {
            callback.resolve('approved');
            pendingCallbacks.current.delete(actionId);
        }
        setQueue((prev) => prev.filter((a) => a.id !== actionId));
    }, []);
    const deny = useCallback((actionId) => {
        const callback = pendingCallbacks.current.get(actionId);
        if (callback) {
            callback.resolve('denied');
            pendingCallbacks.current.delete(actionId);
        }
        setQueue((prev) => prev.filter((a) => a.id !== actionId));
    }, []);
    const alwaysAllow = useCallback((actionType) => {
        setAlwaysAllowList((prev) => new Set([...prev, actionType]));
    }, []);
    const value = {
        pendingAction: queue[0] || null,
        enqueue,
        approve,
        deny,
        alwaysAllow,
        alwaysAllowList,
    };
    return (<ActionQueueContext.Provider value={value}>
      {children}
    </ActionQueueContext.Provider>);
}
// Risk level configuration
const RISK_CONFIG = {
    low: {
        icon: Shield,
        color: 'text-sage-400',
        bg: 'bg-sage-500/10',
        border: 'border-sage-500/30',
        label: 'Low Risk',
    },
    medium: {
        icon: ShieldAlert,
        color: 'text-gold-400',
        bg: 'bg-gold-500/10',
        border: 'border-gold-500/30',
        label: 'Medium Risk',
    },
    high: {
        icon: AlertTriangle,
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        label: 'High Risk',
    },
};
// Action icon mapping
const ACTION_ICONS = {
    'mouse-click': Mouse,
    'mouse-move': Mouse,
    'mouse-double-click': Mouse,
    'mouse-scroll': Mouse,
    'mouse-drag': Mouse,
    'type-text': Keyboard,
    'press-key': Keyboard,
    hotkey: Keyboard,
    'launch-app': Monitor,
    'focus-app': Monitor,
    screenshot: Monitor,
};
// Action type labels
const ACTION_LABELS = {
    'mouse-click': 'Mouse Click',
    'mouse-move': 'Mouse Move',
    'mouse-double-click': 'Double Click',
    'mouse-scroll': 'Mouse Scroll',
    'mouse-drag': 'Drag',
    'type-text': 'Type Text',
    'press-key': 'Press Key',
    hotkey: 'Hotkey',
    'launch-app': 'Launch App',
    'focus-app': 'Focus App',
    screenshot: 'Screenshot',
};
// Action details renderer
function renderActionDetails(action) {
    const { type, params } = action;
    // Cast unknown values to string for safe rendering
    const str = (key) => String(params[key] ?? '');
    switch (type) {
        case 'mouse-click':
        case 'mouse-double-click':
        case 'mouse-scroll':
            return (<div className="text-sm text-gray-300 space-y-1">
          {params.x != null && params.y != null && (<p>
              Position: <span className="text-white font-mono">{str('x')}, {str('y')}</span>
            </p>)}
          {params.button != null && (<p>
              Button: <span className="text-white font-mono">{str('button')}</span>
            </p>)}
        </div>);
        case 'mouse-move':
            return (<div className="text-sm text-gray-300">
          {params.x != null && params.y != null && (<p>
              Position: <span className="text-white font-mono">{str('x')}, {str('y')}</span>
            </p>)}
        </div>);
        case 'mouse-drag':
            return (<div className="text-sm text-gray-300 space-y-1">
          {params.fromX != null && params.fromY != null && (<p>
              From: <span className="text-white font-mono">{str('fromX')}, {str('fromY')}</span>
            </p>)}
          {params.toX != null && params.toY != null && (<p>
              To: <span className="text-white font-mono">{str('toX')}, {str('toY')}</span>
            </p>)}
        </div>);
        case 'type-text':
            return (<div className="text-sm text-gray-300">
          Text: <span className="text-white font-mono break-words">{str('text')}</span>
        </div>);
        case 'press-key':
            return (<div className="text-sm text-gray-300">
          Key: <span className="text-white font-mono">{str('key')}</span>
        </div>);
        case 'hotkey':
            return (<div className="text-sm text-gray-300">
          Combination:{' '}
          <span className="text-white font-mono">{params.keys?.join(' + ') ?? ''}</span>
        </div>);
        case 'launch-app':
            return (<div className="text-sm text-gray-300">
          App: <span className="text-white font-mono">{str('appPath') || str('appName')}</span>
        </div>);
        case 'focus-app':
            return (<div className="text-sm text-gray-300">
          App: <span className="text-white font-mono">{str('appName')}</span>
        </div>);
        case 'screenshot':
            return (<div className="text-sm text-gray-300">
          {params.region ? (<p>
              Region: <span className="text-white font-mono">{str('region')}</span>
            </p>) : (<p>Full screen capture</p>)}
        </div>);
        default:
            return null;
    }
}
export function ActionConfirmation({ action, onApprove, onDeny, onAlwaysAllow, }) {
    const [timeoutSeconds, setTimeoutSeconds] = useState(30);
    const timeoutIntervalRef = useRef(null);
    const riskConfig = RISK_CONFIG[action.risk];
    const RiskIcon = riskConfig.icon;
    const ActionIcon = ACTION_ICONS[action.type];
    useEffect(() => {
        timeoutIntervalRef.current = setInterval(() => {
            setTimeoutSeconds((prev) => {
                if (prev <= 1) {
                    onDeny();
                    if (timeoutIntervalRef.current) {
                        clearInterval(timeoutIntervalRef.current);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (timeoutIntervalRef.current) {
                clearInterval(timeoutIntervalRef.current);
            }
        };
    }, [onDeny]);
    const handleApprove = () => {
        if (timeoutIntervalRef.current) {
            clearInterval(timeoutIntervalRef.current);
        }
        onApprove();
    };
    const handleDeny = () => {
        if (timeoutIntervalRef.current) {
            clearInterval(timeoutIntervalRef.current);
        }
        onDeny();
    };
    const handleAlwaysAllow = () => {
        if (timeoutIntervalRef.current) {
            clearInterval(timeoutIntervalRef.current);
        }
        onAlwaysAllow();
    };
    return (<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div className="animate-in scale-in-95 fade-in duration-300 w-full max-w-md mx-4">
        {/* Card */}
        <div className="bg-gradient-to-b from-[#131313] to-[#0c0c0c] border border-white/10 rounded-lg shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#1a1a1a] to-[#131313] border-b border-white/5 px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className="flex-shrink-0 mt-1">
                  <ActionIcon className="w-5 h-5 text-white"/>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-white">
                    {ACTION_LABELS[action.type]}
                  </h2>
                  <p className="text-sm text-gray-400 mt-1 break-words">{action.description}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Risk badge and timeout */}
          <div className="px-6 py-4 border-b border-white/5 space-y-3">
            {/* Risk indicator */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-md ${riskConfig.bg} border ${riskConfig.border}`}>
              <RiskIcon className={`w-4 h-4 flex-shrink-0 ${riskConfig.color}`}/>
              <span className={`text-sm font-medium ${riskConfig.color}`}>{riskConfig.label}</span>
            </div>

            {/* Timeout indicator */}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5 flex-shrink-0"/>
              <span>Auto-deny in {timeoutSeconds}s</span>
            </div>
          </div>

          {/* Details */}
          <div className="px-6 py-4 border-b border-white/5 bg-black/20">
            {renderActionDetails(action)}
          </div>

          {/* Footer with buttons */}
          <div className="px-6 py-4 bg-gradient-to-b from-[#0c0c0c] to-[#050505] space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Deny button */}
              <button onClick={handleDeny} className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 rounded-md text-red-400 hover:text-red-300 font-medium text-sm transition-colors duration-150">
                <X className="w-4 h-4"/>
                <span>Deny</span>
              </button>

              {/* Allow Once button */}
              <button onClick={handleApprove} className="flex items-center justify-center gap-2 px-4 py-2 bg-terra-400/10 hover:bg-terra-400/20 border border-terra-400/30 hover:border-terra-400/50 rounded-md text-terra-400 hover:text-terra-300 font-medium text-sm transition-colors duration-150">
                <Check className="w-4 h-4"/>
                <span>Allow Once</span>
              </button>
            </div>

            {/* Always Allow button */}
            <button onClick={handleAlwaysAllow} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sage-500/10 hover:bg-sage-500/20 border border-sage-500/50 hover:border-sage-500/70 rounded-md text-sage-400 hover:text-sage-400 font-medium text-sm transition-colors duration-150">
              <ShieldCheck className="w-4 h-4"/>
              <span>Always Allow {ACTION_LABELS[action.type]}</span>
            </button>
          </div>
        </div>
      </div>
    </div>);
}
export default ActionConfirmation;
