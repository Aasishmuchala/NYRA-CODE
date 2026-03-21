import React, { useState, useEffect, useCallback } from 'react';

interface Sandbox {
  id: string;
  name: string;
  status: 'running' | 'idle' | 'error';
  createdAt: number;
}

interface SandboxInfo {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  resourceUsage?: { cpu: number; memory: number };
}

interface CreateSandboxForm {
  name: string;
  memoryMB: number;
  cpuPercent: number;
  timeoutMs: number;
}

interface ExecuteForm {
  sandboxId: string;
  code: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AuditLogEntry {
  timestamp: number;
  action: string;
  sandboxId?: string;
  details?: string;
}

declare global {
  interface Window {
    nyra?: {
      pluginSandbox: {
        init: () => Promise<any>;
        createSandbox: (...args: any[]) => Promise<any>;
        execute: (...args: any[]) => Promise<any>;
        destroy: (...args: any[]) => Promise<any>;
        getAuditLog: (...args: any[]) => Promise<any>;
        listSandboxes: () => Promise<any>;
        getSandboxInfo: (...args: any[]) => Promise<any>;
        shutdown: () => Promise<any>;
      };
      nyraGuard: {
        init: () => Promise<any>;
        scanCode: (...args: any[]) => Promise<any>;
        scanDependencies: (...args: any[]) => Promise<any>;
        scanPlugin: (...args: any[]) => Promise<any>;
        generateReport: (...args: any[]) => Promise<any>;
        getHistory: () => Promise<any>;
        shutdown: () => Promise<any>;
      };
    };
  }
}

export default function PluginSandboxPanel() {
  const [activeTab, setActiveTab] = useState<'sandboxes' | 'execute' | 'audit' | 'security'>('sandboxes');
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Create Sandbox Form
  const [createForm, setCreateForm] = useState<CreateSandboxForm>({
    name: '',
    memoryMB: 512,
    cpuPercent: 50,
    timeoutMs: 30000,
  });
  const [isCreating, setIsCreating] = useState(false);

  // Execute in Sandbox Form
  const [executeForm, setExecuteForm] = useState<ExecuteForm>({
    sandboxId: '',
    code: '',
  });
  const [executionResult, setExecutionResult] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);

  // Audit Log
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Security Scan
  const [scanCode, setScanCode] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    loadSandboxes();
  }, []);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const loadSandboxes = async () => {
    try {
      setIsLoading(true);
      const result = await window.nyra?.pluginSandbox?.listSandboxes();
      if (Array.isArray(result)) {
        setSandboxes(result);
        addToast('Sandboxes loaded', 'success');
      }
    } catch (err) {
      addToast(`Failed to load sandboxes: ${err}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSandbox = async () => {
    if (!createForm.name.trim()) {
      addToast('Sandbox name is required', 'error');
      return;
    }

    try {
      setIsCreating(true);
      const result = await window.nyra?.pluginSandbox?.createSandbox({
        name: createForm.name,
        memoryMB: createForm.memoryMB,
        cpuPercent: createForm.cpuPercent,
        timeoutMs: createForm.timeoutMs,
      });

      if (result?.id) {
        setSandboxes([...sandboxes, result]);
        setCreateForm({ name: '', memoryMB: 512, cpuPercent: 50, timeoutMs: 30000 });
        addToast('Sandbox created successfully', 'success');
      }
    } catch (err) {
      addToast(`Failed to create sandbox: ${err}`, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDestroySandbox = async (sandboxId: string) => {
    try {
      await window.nyra?.pluginSandbox?.destroy(sandboxId);
      setSandboxes(sandboxes.filter(s => s.id !== sandboxId));
      addToast('Sandbox destroyed', 'success');
    } catch (err) {
      addToast(`Failed to destroy sandbox: ${err}`, 'error');
    }
  };

  const handleGetSandboxInfo = async (sandboxId: string) => {
    try {
      const info = await window.nyra?.pluginSandbox?.getSandboxInfo(sandboxId);
      addToast(`Sandbox: ${info?.name || sandboxId}`, 'info');
    } catch (err) {
      addToast(`Failed to get sandbox info: ${err}`, 'error');
    }
  };

  const handleExecute = async () => {
    if (!executeForm.sandboxId) {
      addToast('Please select a sandbox', 'error');
      return;
    }
    if (!executeForm.code.trim()) {
      addToast('Please enter code to execute', 'error');
      return;
    }

    try {
      setIsExecuting(true);
      const result = await window.nyra?.pluginSandbox?.execute(executeForm.sandboxId, executeForm.code);
      setExecutionResult(result?.output || JSON.stringify(result));
      addToast('Code executed successfully', 'success');
    } catch (err) {
      setExecutionResult(`Error: ${err}`);
      addToast(`Execution failed: ${err}`, 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleLoadAuditLog = async () => {
    try {
      setIsLoadingAudit(true);
      const result = await window.nyra?.pluginSandbox?.getAuditLog();
      if (Array.isArray(result)) {
        setAuditLog(result);
        addToast('Audit log loaded', 'success');
      }
    } catch (err) {
      addToast(`Failed to load audit log: ${err}`, 'error');
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleScanCode = async () => {
    if (!scanCode.trim()) {
      addToast('Please enter code to scan', 'error');
      return;
    }

    try {
      setIsScanning(true);
      const result = await window.nyra?.nyraGuard?.scanCode(scanCode);
      setScanResult(result);
      addToast('Code scan completed', 'success');
    } catch (err) {
      addToast(`Scan failed: ${err}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6 p-6 bg-nyra-surface rounded-lg h-full flex flex-col">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${
              toast.type === 'success' ? 'bg-green-700' :
              toast.type === 'error' ? 'bg-red-700' :
              'bg-blue-700'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-gray-100">Plugin Sandbox Manager</h2>
        <p className="text-sm text-gray-400">Sandboxed code execution with security scanning</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-700">
        {(['sandboxes', 'execute', 'audit', 'security'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold capitalize transition-colors ${
              activeTab === tab
                ? 'text-[#D4785C] border-b-2 border-[#D4785C]'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Sandboxes Tab */}
        {activeTab === 'sandboxes' && (
          <div className="space-y-4">
            {/* Create Sandbox Form */}
            <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase">Create Sandbox</p>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Sandbox name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C]"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Memory (MB)</label>
                    <input
                      type="number"
                      value={createForm.memoryMB}
                      onChange={(e) => setCreateForm({ ...createForm, memoryMB: parseInt(e.target.value) })}
                      className="w-full bg-[#0d0b09] border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-[#D4785C]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">CPU (%)</label>
                    <input
                      type="number"
                      value={createForm.cpuPercent}
                      onChange={(e) => setCreateForm({ ...createForm, cpuPercent: parseInt(e.target.value) })}
                      className="w-full bg-[#0d0b09] border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-[#D4785C]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Timeout (ms)</label>
                    <input
                      type="number"
                      value={createForm.timeoutMs}
                      onChange={(e) => setCreateForm({ ...createForm, timeoutMs: parseInt(e.target.value) })}
                      className="w-full bg-[#0d0b09] border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-[#D4785C]"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreateSandbox}
                  disabled={isCreating}
                  className="w-full bg-[#D4785C] hover:bg-[#c8653a] text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
                >
                  {isCreating ? 'Creating...' : 'Create Sandbox'}
                </button>
              </div>
            </div>

            {/* Active Sandboxes List */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-xs font-semibold text-gray-400 uppercase">Active Sandboxes</p>
                <button
                  onClick={loadSandboxes}
                  disabled={isLoading}
                  className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-200 disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {isLoading ? (
                  <p className="text-gray-500 text-sm">Loading sandboxes...</p>
                ) : sandboxes.length > 0 ? (
                  sandboxes.map(sandbox => (
                    <div key={sandbox.id} className="bg-[#1a1816] border border-gray-700 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-200">{sandbox.name}</h3>
                          <p className="text-xs text-gray-500">ID: {sandbox.id.slice(0, 12)}...</p>
                          <p className="text-xs text-gray-600 mt-1">Created: {formatDate(sandbox.createdAt)}</p>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${
                          sandbox.status === 'running' ? 'bg-sage' : 'bg-gray-500'
                        }`} />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleGetSandboxInfo(sandbox.id)}
                          className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1.5 rounded transition-colors"
                        >
                          Info
                        </button>
                        <button
                          onClick={() => handleDestroySandbox(sandbox.id)}
                          className="flex-1 text-xs bg-red-900 hover:bg-red-800 text-red-200 font-semibold py-1.5 rounded transition-colors"
                        >
                          Destroy
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm italic">No active sandboxes</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Execute Tab */}
        {activeTab === 'execute' && (
          <div className="space-y-4">
            <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase">Execute Code</p>
              <div className="space-y-2">
                <label className="text-xs text-gray-500">Select Sandbox</label>
                <select
                  value={executeForm.sandboxId}
                  onChange={(e) => setExecuteForm({ ...executeForm, sandboxId: e.target.value })}
                  className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#D4785C]"
                >
                  <option value="">-- Select a sandbox --</option>
                  {sandboxes.map(sb => (
                    <option key={sb.id} value={sb.id}>{sb.name}</option>
                  ))}
                </select>
                <label className="text-xs text-gray-500">Code</label>
                <textarea
                  value={executeForm.code}
                  onChange={(e) => setExecuteForm({ ...executeForm, code: e.target.value })}
                  placeholder="Enter code to execute..."
                  rows={6}
                  className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-[#D4785C] resize-none"
                />
                <button
                  onClick={handleExecute}
                  disabled={isExecuting}
                  className="w-full bg-[#D4785C] hover:bg-[#c8653a] text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
                >
                  {isExecuting ? 'Executing...' : 'Execute'}
                </button>
              </div>
            </div>

            {/* Execution Result */}
            {executionResult && (
              <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase">Result</p>
                <div className="bg-[#0d0b09] rounded p-3 text-sm text-gray-200 font-mono max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                  {executionResult}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <button
              onClick={handleLoadAuditLog}
              disabled={isLoadingAudit}
              className="w-full bg-[#C9A87C] hover:bg-[#b89668] text-[#0d0b09] font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              {isLoadingAudit ? 'Loading...' : 'Load Audit Log'}
            </button>
            <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 max-h-96 overflow-y-auto space-y-2">
              {auditLog.length > 0 ? (
                auditLog.map((entry, idx) => (
                  <div key={idx} className="text-xs text-gray-300 border-b border-gray-700 pb-2 last:border-0">
                    <p className="font-mono text-gray-500">{formatDate(entry.timestamp)}</p>
                    <p className="text-[#D4785C] font-semibold">{entry.action}</p>
                    {entry.details && <p className="text-gray-500">{entry.details}</p>}
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm italic">No audit log entries</p>
              )}
            </div>
          </div>
        )}

        {/* Security Scan Tab */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase">Security Scan</p>
              <label className="text-xs text-gray-500">Code to Scan</label>
              <textarea
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                placeholder="Enter code for security analysis..."
                rows={6}
                className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-[#D4785C] resize-none"
              />
              <button
                onClick={handleScanCode}
                disabled={isScanning}
                className="w-full bg-[#D4785C] hover:bg-[#c8653a] text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {isScanning ? 'Scanning...' : 'Scan Code'}
              </button>
            </div>

            {/* Scan Result */}
            {scanResult && (
              <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase">Scan Result</p>
                <div className="space-y-2">
                  {scanResult.severity && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Severity:</span>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        scanResult.severity === 'critical' ? 'bg-red-900 text-red-200' :
                        scanResult.severity === 'high' ? 'bg-orange-900 text-orange-200' :
                        scanResult.severity === 'medium' ? 'bg-yellow-900 text-yellow-200' :
                        'bg-green-900 text-green-200'
                      }`}>
                        {scanResult.severity}
                      </span>
                    </div>
                  )}
                  {scanResult.message && (
                    <div>
                      <span className="text-sm text-gray-400">Message:</span>
                      <p className="text-sm text-gray-200 mt-1">{scanResult.message}</p>
                    </div>
                  )}
                  {scanResult.details && (
                    <div className="bg-[#0d0b09] rounded p-3 text-xs text-gray-300 max-h-48 overflow-y-auto">
                      {JSON.stringify(scanResult.details, null, 2)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
