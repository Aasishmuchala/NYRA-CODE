import React, { useState, useEffect } from 'react';

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
  const [budgetInput, setBudgetInput] = useState('100');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadRouterData();
  }, []);

  const loadRouterData = async () => {
    try {
      setIsLoading(true);
      const data = await (window.nyra?.modelRouter?.getStats as any)?.();
      if (data) {
        setStats(data.stats || stats);
        setBudget(data.budget || budget);
        setTierAssignments(data.tiers || []);
        setRouteHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to load router data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetBudget = async () => {
    try {
      const newLimit = parseFloat(budgetInput);
      if (isNaN(newLimit) || newLimit < 0) {
        alert('Please enter a valid budget amount');
        return;
      }
      await (window.nyra?.modelRouter?.setBudgetLimit as any)?.(newLimit);
      setBudget(prev => ({ ...prev, monthlyLimit: newLimit }));
    } catch (err) {
      console.error('Failed to set budget:', err);
    }
  };

  const budgetPercentage = Math.round((budget.used / budget.monthlyLimit) * 100);
  const tierPercentages = {
    local: Math.round((stats.byTier.local / stats.totalRouted) * 100) || 0,
    cloudFast: Math.round((stats.byTier.cloudFast / stats.totalRouted) * 100) || 0,
    cloudSmart: Math.round((stats.byTier.cloudSmart / stats.totalRouted) * 100) || 0,
    cloudReasoning: Math.round((stats.byTier.cloudReasoning / stats.totalRouted) * 100) || 0,
  };

  return (
    <div className="space-y-6 p-6 bg-nyra-surface rounded-lg">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-gray-100">Model Router</h2>
        <p className="text-sm text-gray-400">Smart routing & cost management</p>
      </div>

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

      {/* Model Tier Cards */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase">Model Assignments</p>
        <div className="space-y-2 max-h-32 overflow-y-auto">
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
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#0d0b09] border-b border-gray-700">
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

      {/* Refresh Button */}
      <button
        onClick={loadRouterData}
        disabled={isLoading}
        className="w-full bg-[#C9A87C] hover:bg-[#b89668] text-[#0d0b09] font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Refreshing...' : 'Refresh Stats'}
      </button>
    </div>
  );
}
