import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Plus, Trash2, Play, Pause, ChevronRight, ChevronDown, AlertTriangle, Check, X, RefreshCw, Loader2, Activity, } from 'lucide-react';
const EVENT_OPTIONS = [
    'file:created', 'file:modified', 'file:deleted',
    'git:commit', 'git:push', 'git:branch-changed',
    'task:completed', 'task:failed',
    'agent:completed', 'agent:error',
    'manual',
];
const OPERATOR_OPTIONS = ['equals', 'contains', 'matches', 'startsWith', 'endsWith', 'exists'];
const ACTION_LABELS = {
    'run-agent': 'Run Agent', 'send-notification': 'Notify',
    'execute-command': 'Command', 'call-tool': 'MCP Tool', 'run-script': 'Script',
};
// ── Stats Bar ─────────────────────────────────────────────────────────────────
const StatsBar = ({ stats }) => (<div className="flex items-center gap-4 px-4 py-2 border-b border-white/[0.06] text-[9px] text-white/40">
    <span>{stats.totalRules} rule{stats.totalRules !== 1 ? 's' : ''}</span>
    <span>{stats.enabledRules} active</span>
    <span>{stats.totalTriggers} triggers</span>
    <span>{stats.recentLogs} today</span>
  </div>);
// ── Rule Row ──────────────────────────────────────────────────────────────────
const RuleRow = ({ rule, expanded, onToggle, onDelete, onToggleEnabled, onTest }) => (<div className="border border-white/[0.06] rounded-lg overflow-hidden">
    <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition text-left">
      {expanded ? <ChevronDown size={12} className="text-white/30"/> : <ChevronRight size={12} className="text-white/30"/>}
      <Zap size={14} className={rule.enabled ? 'text-amber-400' : 'text-white/20'}/>
      <span className="text-[11px] text-white/80 flex-1 truncate">{rule.name}</span>
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">{rule.event}</span>
      <span className="text-[9px] text-white/30">{rule.triggerCount}×</span>
    </button>

    {expanded && (<div className="border-t border-white/[0.06] px-3 py-2 bg-black/20 space-y-2">
        {rule.description && <p className="text-[10px] text-white/50">{rule.description}</p>}

        <div className="flex flex-wrap gap-1">
          {rule.conditions?.map((c, i) => (<span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300">
              {c.field} {c.operator} {c.value || ''}
            </span>))}
        </div>

        <div className="flex flex-wrap gap-1">
          {rule.actions?.map((a, i) => (<span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">
              {ACTION_LABELS[a.type] || a.type}
            </span>))}
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          <button onClick={onToggleEnabled} className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] ${rule.enabled ? 'bg-amber-500/10 text-amber-300' : 'bg-white/[0.06] text-white/40'} hover:opacity-80`}>
            {rule.enabled ? <><Pause size={10}/> Disable</> : <><Play size={10}/> Enable</>}
          </button>
          <button onClick={onTest} className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-300 text-[9px] hover:bg-blue-500/20">
            <Play size={10}/> Test
          </button>
          <button onClick={onDelete} className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 text-red-300 text-[9px] hover:bg-red-500/20">
            <Trash2 size={10}/> Delete
          </button>
        </div>

        {rule.lastTriggeredAt && (<p className="text-[9px] text-white/25">
            Last triggered: {new Date(rule.lastTriggeredAt).toLocaleString()}
          </p>)}
      </div>)}
  </div>);
// ── Log Row ───────────────────────────────────────────────────────────────────
const LogRow = ({ log }) => (<div className="flex items-center gap-2 px-3 py-1.5 text-[10px] border-b border-white/[0.03]">
    {log.actionsFailed > 0
        ? <AlertTriangle size={10} className="text-red-400"/>
        : <Check size={10} className="text-emerald-400"/>}
    <span className="text-white/60 flex-1 truncate">{log.ruleName}</span>
    <span className="text-white/30">{log.actionsExecuted}/{log.actionsExecuted + log.actionsFailed}</span>
    <span className="text-white/20">{log.durationMs}ms</span>
    <span className="text-white/20">{new Date(log.timestamp).toLocaleTimeString()}</span>
  </div>);
// ── Add Rule Form ─────────────────────────────────────────────────────────────
const AddRuleForm = ({ onAdd, onCancel }) => {
    const [name, setName] = useState('');
    const [event, setEvent] = useState(EVENT_OPTIONS[0]);
    const [condField, setCondField] = useState('');
    const [condOp, setCondOp] = useState('contains');
    const [condValue, setCondValue] = useState('');
    const [actionType, setActionType] = useState('send-notification');
    const [actionTitle, setActionTitle] = useState('');
    const [actionBody, setActionBody] = useState('');
    const handleSubmit = () => {
        if (!name.trim())
            return;
        const conditions = condField.trim() ? [{ field: condField, operator: condOp, value: condValue }] : [];
        const config = {};
        if (actionType === 'send-notification') {
            config.title = actionTitle || name;
            config.body = actionBody || 'Automation triggered';
        }
        else if (actionType === 'run-agent') {
            config.taskTitle = actionTitle || name;
            config.taskDescription = actionBody;
        }
        else if (actionType === 'execute-command') {
            config.command = actionTitle;
        }
        onAdd({
            name, event, conditions,
            actions: [{ type: actionType, config }],
            cooldownMs: 5000,
        });
    };
    const inputCls = 'w-full bg-white/[0.06] border border-white/[0.08] rounded px-2 py-1 text-[10px] text-white/70 outline-none';
    const selectCls = 'bg-white/[0.06] border border-white/[0.08] rounded px-2 py-1 text-[10px] text-white/70 outline-none';
    return (<div className="border border-white/[0.08] rounded-lg p-3 bg-white/[0.02] space-y-2">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Rule name..." className={inputCls}/>

      <div className="flex gap-2">
        <label className="text-[9px] text-white/40 pt-1">WHEN</label>
        <select value={event} onChange={e => setEvent(e.target.value)} className={selectCls}>
          {EVENT_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <div className="flex gap-1.5 items-center">
        <label className="text-[9px] text-white/40">IF</label>
        <input value={condField} onChange={e => setCondField(e.target.value)} placeholder="field" className={`${inputCls} w-20`}/>
        <select value={condOp} onChange={e => setCondOp(e.target.value)} className={selectCls}>
          {OPERATOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <input value={condValue} onChange={e => setCondValue(e.target.value)} placeholder="value" className={`${inputCls} flex-1`}/>
      </div>

      <div className="flex gap-2 items-center">
        <label className="text-[9px] text-white/40">THEN</label>
        <select value={actionType} onChange={e => setActionType(e.target.value)} className={selectCls}>
          {Object.keys(ACTION_LABELS).map(k => (<option key={k} value={k}>{ACTION_LABELS[k]}</option>))}
        </select>
      </div>

      <input value={actionTitle} onChange={e => setActionTitle(e.target.value)} placeholder={actionType === 'execute-command' ? 'Command...' : 'Title / Task name...'} className={inputCls}/>
      <input value={actionBody} onChange={e => setActionBody(e.target.value)} placeholder="Body / Description..." className={inputCls}/>

      <div className="flex gap-1.5 pt-1">
        <button onClick={handleSubmit} className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 text-[9px] hover:bg-emerald-500/20">
          <Check size={10}/> Create
        </button>
        <button onClick={onCancel} className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.06] text-white/50 text-[9px] hover:bg-white/[0.1]">
          <X size={10}/> Cancel
        </button>
      </div>
    </div>);
};
// ── Main AutomationsPanel ─────────────────────────────────────────────────────
const AutomationsPanel = () => {
    const [view, setView] = useState('rules');
    const [rules, setRules] = useState([]);
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState({ totalRules: 0, enabledRules: 0, totalTriggers: 0, recentLogs: 0 });
    const [expanded, setExpanded] = useState(new Set());
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const refresh = useCallback(async () => {
        setLoading(true);
        const [r, s, l] = await Promise.all([
            window.nyra.automations.listRules(),
            window.nyra.automations.getStats(),
            window.nyra.automations.getLogs({ limit: 50 }),
        ]);
        setRules(r);
        setStats(s);
        setLogs(l);
        setLoading(false);
    }, []);
    useEffect(() => { refresh(); }, [refresh]);
    useEffect(() => {
        const unsubs = [
            window.nyra.automations.onTriggered(() => refresh()),
            window.nyra.automations.onExecuted(() => refresh()),
            window.nyra.automations.onRuleAdded(() => refresh()),
        ];
        return () => unsubs.forEach((u) => u());
    }, [refresh]);
    const handleAdd = async (opts) => {
        await window.nyra.automations.addRule(opts);
        setShowForm(false);
        refresh();
    };
    const handleDelete = async (id) => {
        await window.nyra.automations.deleteRule(id);
        refresh();
    };
    const handleToggle = async (rule) => {
        await window.nyra.automations.updateRule(rule.id, { enabled: !rule.enabled });
        refresh();
    };
    const handleTest = async (ruleId) => {
        await window.nyra.automations.trigger(ruleId, { test: true });
        refresh();
    };
    const toggleExpand = (id) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };
    return (<div className="flex flex-col h-full">
      <StatsBar stats={stats}/>

      {/* View Toggle + Actions */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06]">
        <button onClick={() => setView('rules')} className={`px-2 py-1 rounded text-[10px] ${view === 'rules' ? 'bg-terra-300/10 text-terra-300' : 'text-white/50 hover:text-white/70'}`}>
          Rules
        </button>
        <button onClick={() => setView('logs')} className={`px-2 py-1 rounded text-[10px] ${view === 'logs' ? 'bg-terra-300/10 text-terra-300' : 'text-white/50 hover:text-white/70'}`}>
          Logs
        </button>
        <div className="flex-1"/>
        <button onClick={() => refresh()} className="p-1 hover:bg-white/[0.06] rounded text-white/30">
          {loading ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>}
        </button>
        {view === 'rules' && (<button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-2 py-1 rounded bg-terra-300/10 text-terra-300 text-[10px] hover:bg-terra-300/20">
            <Plus size={10}/> New Rule
          </button>)}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2">
        {view === 'rules' && (<>
            {showForm && <AddRuleForm onAdd={handleAdd} onCancel={() => setShowForm(false)}/>}

            {rules.length === 0 && !showForm && (<div className="flex flex-col items-center justify-center py-12 text-white/30 gap-2">
                <Zap size={28} className="text-white/15"/>
                <p className="text-[11px]">No automation rules yet</p>
                <p className="text-[9px] text-white/20">Create rules to automate agent tasks on events</p>
              </div>)}

            {rules.map(rule => (<RuleRow key={rule.id} rule={rule} expanded={expanded.has(rule.id)} onToggle={() => toggleExpand(rule.id)} onDelete={() => handleDelete(rule.id)} onToggleEnabled={() => handleToggle(rule)} onTest={() => handleTest(rule.id)}/>))}
          </>)}

        {view === 'logs' && (<>
            {logs.length === 0 && (<div className="flex flex-col items-center justify-center py-12 text-white/30 gap-2">
                <Activity size={28} className="text-white/15"/>
                <p className="text-[11px]">No automation logs yet</p>
                <p className="text-[9px] text-white/20">Logs will appear here when rules trigger</p>
              </div>)}
            {logs.map(log => <LogRow key={log.id} log={log}/>)}
          </>)}
      </div>
    </div>);
};
export default AutomationsPanel;
