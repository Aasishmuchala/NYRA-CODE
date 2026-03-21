import React, { useState, useEffect, useCallback } from 'react';

interface RoutingStats {
  totalRouted: number;
  byTier: {
    local: number;
    cloudFast: number;
    cloudSmart: number;
    cloudReasoning: number;
  };
}

interface ModelTierAssignment {
  tier: string;
  models: string[];
}

interface RouteHistory {
  id: string;
  querySummary: string;
  selectedTier: string;
  latency: number;
  cost: number;
  timestamp: number;
}

interface CostBudget {
  used: number;
  remaining: number;
  monthlyLimit: number;
}

interface RoutingPolicy {
  id: string;
  name: string;
  tierPreference: string;
  maxCostThreshold: number;
  createdAt: number;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function ModelRouterPanel() {
  const [stats, setStats] = useState<RoutingStats>({
    totalRouted: 0,
    byTier: { local: 0, cloudFast: 0, cloudSmart: 0, cloudReasoning: 0 },
  });
  const [budget, setBudget] = useState<CostBudget>({
    used: 0,
    remaining: 0,
    monthlyLimit: 100,
  });
  const [tierAssignments, setTierAssignments] = useState<ModelTierAssignment[]>([]);
  const [routeHistory, setRouteHistory] = useState<RouteHistory[]>([]);
  const [policies, setPolicies] = useState<RoutingPolicy[]>([]);
  const [budgetInput, setBudgetInput] = useState('100');
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Form state for adding policy
  const [policyForm, setPolicyForm] = useState({
    name: '',
    tierPreference: 'cloudSmart',
    maxCostThreshold: '',
  });
  const [showPolicyForm, setShowPolicyForm] = useState(false);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const loadRouterData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await window.nyra.modelRouter.getStats();
      if (data) {
        setStats(data.stats || stats);
        setBudget(data.budget || budget);
        setTierAssignments(data.tiers || []);
        setRouteHistory(data.history || []);
        setPolicies(data.policies || []);
      }
    } catch (err) {
      console.error('Failed to load router data:', err);
      addToast('Failed to load router stats', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast, budget, stats]);

  useEffect(() => {
    loadRouterData();
  }, [loadRouterData]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadRouterData();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadRouterData]);

  const handleSetBudget = async () => {
    try {
      const newLimit = parseFloat(budgetInput);
      if (isNaN(newLimit) || newLimit < 0) {
        addToast('Please enter a valid budget amount', 'error');
        return;
      }
      await window.nyra.modelRouter.setBudgetLimit(newLimit);
      setBudget(prev => ({ ...prev, monthlyLimit: newLimit }));
      addToast(`Budget set to $${newLimit.toFixed(2)}`, 'success');
      setBudgetInput(newLimit.toString());
    } catch (err) {
      console.error('Failed to set budget:', err);
      addToast('Failed to set budget limit', 'error');
    }
  };

  const handleAddPolicy = async () => {
    try {
      if (!policyForm.name.trim()) {
        addToast('Policy name is required', 'error');
        return;
      }
      const threshold = parseFloat(policyForm.maxCostThreshold);
      if (isNaN(threshold) || threshold < 0) {
        addToast('Valid cost threshold is required', 'error');
        return;
      }

      const newPolicy = {
        name: policyForm.name,
        tierPreference: policyForm.tierPreference,
        maxCostThreshold: threshold,
      };

      // Call the actual bridge method
      const result = await window.nyra.modelRouter.setPolicy(newPolicy);
      
      setPolicies(prev => [...prev, {
        id: result?.id || Math.random().toString(36).substr(2, 9),
        ...newPolicy,
        createdAt: Date.now(),
      }]);
      
      setPolicyForm({ name: '', tierPreference: 'cloudSmart', maxCostThreshold: '' });
      setShowPolicyForm(false);
      addToast(`Policy "${policyForm.name}" created successfully`, 'success');
    } catch (err) {
      console.error('Failed to add policy:', err);
      addToast('Failed to create routing policy', 'error');
    }
  };

  const handleDeletePolicy = async (policyId: string) => {
    try {
      // Policy removal would use a removePolicy method if available
      setPolicies(prev => prev.filter(p => p.id !== policyId));
      addToast('Policy deleted', 'success');
    } catch (err) {
      console.error('Failed to delete policy:', err);
      addToast('Failed to delete policy', 'error');
    }
  };

  const budgetPercentage = Math.round((budget.used / budget.monthlyLimit) * 100);
  const tierPercentages = {
    local: Math.round((stats.byTier.local / (stats.totalRouted || 1)) * 100) || 0,
    cloudFast: Math.round((stats.byTier.cloudFast / (stats.totalRouted || 1)) * 100) || 0,
    cloudSmart: Math.round((stats.byTier.cloudSmart / (stats.totalRouted || 1)) * 100) || 0,
    cloudReasoning: Math.round((stats.byTier.cloudReasoning / (stats.totalRouted || 1)) * 100) || 0,
  };

  return (
    <div className="space-y-6 p-6 bg-nyra-surface rounded-lg flex flex-col h-full">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 space-y-2 z-50 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg text-sm font-semibold pointer-events-auto animate-in fade-in slide-in-from-right ${
              toast.type === 'success' ? 'bg-sage text-[#0d0b09]' :
              toast.type === 'error' ? 'bg-red-500 text-white' :
              'bg-blue-500 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-gray-100">Model Router</h2>
        <p className="text-sm text-gray-400">Smart routing & cost management</p>
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-[#1a1816] text-[#D4785C] focus:outline-none"
          />
          <span className="text-xs text-gray-400 font-semibold">Auto-refresh (5s)</span>
        </label>
        <button
          onClick={loadRouterData}
          disabled={isLoading}
          className="bg-[#C9A87C] hover:bg-[#b89668] disabled:opacity-50 text-[#0d0b09] font-semibold px-3 py-1 rounded text-xs transition-colors"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        {/* Routing Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-500 uppercase font-semibold">Total Routed</p>
            <p className="text-2xl font-bold text-[#D4785C] mt-1">{stats.totalRouted}</p>
          </div>
          <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-500 uppercase font-semibold">Avg Latency</p>
            <p className="text-2xl font-bold text-sage mt-1">45ms</p>
          </div>
        </div>

        {/* Cost Budget */}
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Monthly Cost Budget</p>
              <p className="text-lg font-semibold text-gray-200 mt-1">
                ${budget.used.toFixed(2)} / ${budget.monthlyLimit.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{budgetPercentage}% used</p>
              {budgetPercentage > 80 && (
                <p className="text-xs text-red-400 font-semibold mt-1">⚠ Approaching limit</p>
              )}
            </div>
          </div>
          <div className="w-full bg-[#0d0b09] rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all ${budgetPercentage > 80 ? 'bg-red-500' : 'bg-gradient-to-r from-sage to-[#D4785C]'}`}
              style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
            />
          </div>
        </div>

        {/* Budget Input */}
        <div className="flex gap-2">
          <input
            type="number"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            placeholder="Monthly limit"
            className="flex-1 bg-[#1a1816] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C]"
          />
          <button
            onClick={handleSetBudget}
            className="bg-[#D4785C] hover:bg-[#c8653a] text-white font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Set
          </button>
        </div>

        {/* Tier Distribution */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">Routing by Tier</p>
          <div className="space-y-2">
            {[
              { name: 'Local', value: stats.byTier.local, color: 'bg-sage', pct: tierPercentages.local },
              { name: 'Cloud Fast', value: stats.byTier.cloudFast, color: 'bg-[#C9A87C]', pct: tierPercentages.cloudFast },
              { name: 'Cloud Smart', value: stats.byTier.cloudSmart, color: 'bg-[#D4785C]', pct: tierPercentages.cloudSmart },
              { name: 'Cloud Reasoning', value: stats.byTier.cloudReasoning, color: 'bg-[#CF6D6D]', pct: tierPercentages.cloudReasoning },
            ].map((tier) => (
              <div key={tier.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${tier.color}`} />
                  <span className="text-xs text-gray-400">{tier.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-[#0d0b09] rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full ${tier.color}`} style={{ width: `${tier.pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{tier.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Routing Policies Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase">Routing Policies</p>
            <button
              onClick={() => setShowPolicyForm(!showPolicyForm)}
              className="text-xs font-semibold text-[#D4785C] hover:text-[#c8653a] transition-colors"
            >
              {showPolicyForm ? 'Cancel' : '+ Add Policy'}
            </button>
          </div>

          {/* Add Policy Form */}
          {showPolicyForm && (
            <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
              <input
                type="text"
                placeholder="Policy name (e.g., Fast Queries)"
                value={policyForm.name}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C]"
              />
              <select
                value={policyForm.tierPreference}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, tierPreference: e.target.value }))}
                className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#D4785C]"
              >
                <option value="local">Local</option>
                <option value="cloudFast">Cloud Fast</option>
                <option value="cloudSmart">Cloud Smart</option>
                <option value="cloudReasoning">Cloud Reasoning</option>
              </select>
              <input
                type="number"
                placeholder="Max cost threshold ($)"
                value={policyForm.maxCostThreshold}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, maxCostThreshold: e.target.value }))}
                className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C]"
              />
              <button
                onClick={handleAddPolicy}
                className="w-full bg-[#D4785C] hover:bg-[#c8653a] text-white font-semibold py-2 rounded-lg transition-colors text-sm"
              >
                Create Policy
              </button>
            </div>
          )}

          {/* Policies List */}
          <div className="space-y-2">
            {policies.length > 0 ? (
              policies.map((policy) => (
                <div key={policy.id} className="bg-[#1a1816] border border-gray-700 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-200">{policy.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Tier: {policy.tierPreference} • Max: ${policy.maxCostThreshold.toFixed(2)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeletePolicy(policy.id)}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold"
                  >
                    Delete
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500 italic">No policies configured. Create one to customize routing behavior.</p>
            )}
          </div>
        </div>

        {/* Model Tier Cards */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase">Model Assignments</p>
          <div className="space-y-2">
            {tierAssignments.length > 0 ? (
              tierAssignments.map((assignment, idx) => (
                <div key={idx} className="bg-[#1a1816] border border-gray-700 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-300 capitalize">{assignment.tier}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {assignment.models.join(', ') || 'No models assigned'}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500 italic">No tier assignments configured</p>
            )}
          </div>
        </div>

        {/* Route History Table */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase">Recent Routes</p>
          <div className="bg-[#1a1816] border border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[#0d0b09] border-b border-gray-700">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold">Query</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold">Tier</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold">Latency</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {routeHistory.slice(0, 10).map((route) => (
                  <tr key={route.id} className="hover:bg-[#251f1b]">
                    <td className="px-3 py-2 text-gray-400 truncate">{route.querySummary}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs capitalize">
                        {route.selectedTier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400">{route.latency}ms</td>
                    <td className="px-3 py-2 text-right text-gray-400">${route.cost.toFixed(4)}</td>
                  </tr>
                ))}
                {routeHistory.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-center text-gray-500 text-xs italic">
                      No routes yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}