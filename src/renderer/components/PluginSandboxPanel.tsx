import React, { useState, useEffect } from 'react';

interface Sandbox {
  id: string;
  pluginName: string;
  status: 'running' | 'idle' | 'error';
  resourceUsage: {
    cpu: number;
    memory: number;
  };
  securityGrade: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  securityIssues?: number;
}

interface ResourceLimits {
  cpuPercent: number;
  memoryMB: number;
  networkAllowed: boolean;
  fsPaths: string[];
}

export default function PluginSandboxPanel() {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [resourceLimits, setResourceLimits] = useState<ResourceLimits>({
    cpuPercent: 50,
    memoryMB: 512,
    networkAllowed: false,
    fsPaths: ['/tmp', '/var/tmp'],
  });
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSandboxData();
  }, []);

  const loadSandboxData = async () => {
    try {
      setIsLoading(true);
      const data = await (window.nyra?.pluginSandbox?.list as any)?.();
      if (data?.sandboxes) {
        setSandboxes(data.sandboxes);
      }
      if (data?.limits) {
        setResourceLimits(data.limits);
      }
    } catch (err) {
      console.error('Failed to load sandbox data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKillSandbox = async (sandboxId: string) => {
    try {
      await (window.nyra?.pluginSandbox?.kill as any)?.(sandboxId);
      setSandboxes(sandboxes.filter(s => s.id !== sandboxId));
    } catch (err) {
      console.error('Failed to kill sandbox:', err);
    }
  };

  const handleScanPlugin = async (sandboxId: string, pluginName: string) => {
    try {
      setIsScanning(true);
      const result = await (window.nyra?.securityScanner?.scan as any)?.(pluginName);
      setScanResults(prev => ({ ...prev, [sandboxId]: result }));

      // Update sandbox with new grade
      if (result?.grade) {
        setSandboxes(sandboxes.map(s =>
          s.id === sandboxId ? { ...s, securityGrade: result.grade, securityIssues: result.issues?.length } : s
        ));
      }
    } catch (err) {
      console.error('Failed to scan plugin:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'bg-green-900 text-green-200';
      case 'B': return 'bg-lime-900 text-lime-200';
      case 'C': return 'bg-yellow-900 text-yellow-200';
      case 'D': return 'bg-orange-900 text-orange-200';
      case 'E': return 'bg-red-900 text-red-200';
      case 'F': return 'bg-red-950 text-red-300';
      default: return 'bg-gray-700 text-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-sage';
      case 'idle': return 'text-gray-500';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6 p-6 bg-nyra-surface rounded-lg">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-gray-100">Plugin Sandbox Manager</h2>
        <p className="text-sm text-gray-400">Sandboxed plugin execution & security</p>
      </div>

      {/* Resource Limits Card */}
      <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase">Resource Limits</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">CPU Limit</p>
            <p className="text-lg font-bold text-[#D4785C]">{resourceLimits.cpuPercent}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Memory Limit</p>
            <p className="text-lg font-bold text-sage">{resourceLimits.memoryMB}MB</p>
          </div>
        </div>
        <div className="pt-2 border-t border-gray-700">
          <p className="text-xs text-gray-500 mb-2">Network Access</p>
          <div className={`inline-block px-3 py-1 rounded text-xs font-semibold ${
            resourceLimits.networkAllowed ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'
          }`}>
            {resourceLimits.networkAllowed ? 'Allowed' : 'Blocked'}
          </div>
        </div>
        <div className="pt-2 border-t border-gray-700">
          <p className="text-xs text-gray-500 mb-2">Allowed FS Paths</p>
          <div className="text-xs text-gray-400 space-y-1">
            {resourceLimits.fsPaths.map((path, idx) => (
              <div key={idx} className="font-mono text-gray-500">{path}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Sandboxes */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase">Active Sandboxes</p>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {isLoading ? (
            <p className="text-gray-500 text-sm">Loading sandboxes...</p>
          ) : sandboxes.length > 0 ? (
            sandboxes.map((sandbox) => (
              <div key={sandbox.id} className="bg-[#1a1816] border border-gray-700 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-200">{sandbox.pluginName}</h3>
                      <span className={`w-2 h-2 rounded-full ${
                        sandbox.status === 'running' ? 'bg-sage' : 'bg-gray-500'
                      }`} />
                      <span className={`text-xs font-semibold capitalize ${getStatusColor(sandbox.status)}`}>
                        {sandbox.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">ID: {sandbox.id.slice(0, 8)}...</p>
                  </div>
                  <div className={`text-center px-3 py-1 rounded font-bold text-sm ${getGradeColor(sandbox.securityGrade)}`}>
                    {sandbox.securityGrade}
                  </div>
                </div>

                {/* Resource Usage Bars */}
                <div className="grid grid-cols-2 gap-2 my-3 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-500">CPU</span>
                      <span className="text-gray-400">{sandbox.resourceUsage.cpu}%</span>
                    </div>
                    <div className="w-full bg-[#0d0b09] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-[#D4785C]"
                        style={{ width: `${sandbox.resourceUsage.cpu}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-500">Memory</span>
                      <span className="text-gray-400">{sandbox.resourceUsage.memory}MB</span>
                    </div>
                    <div className="w-full bg-[#0d0b09] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-sage"
                        style={{ width: `${Math.min((sandbox.resourceUsage.memory / resourceLimits.memoryMB) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Security Issues */}
                {sandbox.securityIssues && sandbox.securityIssues > 0 && (
                  <div className="text-xs text-orange-400 font-semibold mb-3">
                    ⚠ {sandbox.securityIssues} security issue{sandbox.securityIssues > 1 ? 's' : ''}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleScanPlugin(sandbox.id, sandbox.pluginName)}
                    disabled={isScanning}
                    className="flex-1 text-xs bg-[#C9A87C] hover:bg-[#b89668] text-[#0d0b09] font-semibold py-1.5 rounded transition-colors disabled:opacity-50"
                  >
                    {isScanning ? 'Scanning...' : 'Scan'}
                  </button>
                  <button
                    onClick={() => handleKillSandbox(sandbox.id)}
                    className="flex-1 text-xs bg-red-900 hover:bg-red-800 text-red-200 font-semibold py-1.5 rounded transition-colors"
                  >
                    Kill
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm italic">No active sandboxes</p>
          )}
        </div>
      </div>

      {/* Security Grade Legend */}
      <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-3">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Security Grades</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-900"></div>
            <span className="text-gray-400">A - Safe</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-900"></div>
            <span className="text-gray-400">C - Caution</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-950"></div>
            <span className="text-gray-400">F - Unsafe</span>
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <button
        onClick={loadSandboxData}
        disabled={isLoading}
        className="w-full bg-[#C9A87C] hover:bg-[#b89668] text-[#0d0b09] font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  );
}
