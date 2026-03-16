import React, { useState, useEffect } from 'react';

type UserRole = 'viewer' | 'member' | 'admin' | 'owner' | 'super_admin';
type TabType = 'users' | 'policies' | 'audit' | 'billing';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive' | 'suspended';
  lastLogin?: number;
}

interface Policy {
  id: string;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  appliedCount: number;
}

interface AuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  target: string;
  details?: string;
}

interface BillingData {
  currentCost: number;
  monthlyLimit: number;
  usageMetrics: {
    apiCalls: number;
    tokens: number;
    storage: number;
  };
}

export default function EnterpriseDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [billingData, setBillingData] = useState<BillingData>({
    currentCost: 0,
    monthlyLimit: 0,
    usageMetrics: { apiCalls: 0, tokens: 0, storage: 0 },
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadEnterpriseData();
  }, [activeTab]);

  const loadEnterpriseData = async () => {
    try {
      setIsLoading(true);
      const data = await (window.nyra?.enterprise?.getData as any)?.(activeTab);
      if (data) {
        switch (activeTab) {
          case 'users':
            setUsers(data.users || []);
            break;
          case 'policies':
            setPolicies(data.policies || []);
            break;
          case 'audit':
            setAuditEntries(data.entries || []);
            break;
          case 'billing':
            setBillingData(data || billingData);
            break;
        }
      }
    } catch (err) {
      console.error('Failed to load enterprise data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await (window.nyra?.enterprise?.updateUserRole as any)?.(userId, newRole);
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      console.error('Failed to update user role:', err);
    }
  };

  const handlePolicyToggle = async (policyId: string, enabled: boolean) => {
    try {
      await (window.nyra?.enterprise?.setPolicyEnabled as any)?.(policyId, !enabled);
      setPolicies(policies.map(p => p.id === policyId ? { ...p, enabled: !enabled } : p));
    } catch (err) {
      console.error('Failed to toggle policy:', err);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-900 text-red-200';
      case 'high': return 'bg-orange-900 text-orange-200';
      case 'medium': return 'bg-yellow-900 text-yellow-200';
      case 'low': return 'bg-green-900 text-green-200';
      default: return 'bg-gray-700 text-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-sage';
      case 'inactive': return 'text-gray-500';
      case 'suspended': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6 p-6 bg-nyra-surface rounded-lg h-full flex flex-col">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-gray-100">Enterprise Dashboard</h2>
        <p className="text-sm text-gray-400">Organization administration & monitoring</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-700">
        {['users', 'policies', 'audit', 'billing'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as TabType)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === tab
                ? 'text-[#D4785C] border-[#D4785C]'
                : 'text-gray-400 border-transparent hover:text-gray-300'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-3 overflow-y-auto h-full pr-2">
            {isLoading ? (
              <p className="text-gray-500 text-sm">Loading users...</p>
            ) : users.length > 0 ? (
              <div className="bg-[#1a1816] border border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#0d0b09] border-b border-gray-700">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-500 font-semibold">Name</th>
                      <th className="text-left px-4 py-2 text-gray-500 font-semibold">Email</th>
                      <th className="text-left px-4 py-2 text-gray-500 font-semibold">Role</th>
                      <th className="text-left px-4 py-2 text-gray-500 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-[#251f1b]">
                        <td className="px-4 py-2 text-gray-200">{user.name}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs">{user.email}</td>
                        <td className="px-4 py-2">
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                            className="bg-[#0d0b09] border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-[#D4785C]"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="owner">Owner</option>
                            <option value="super_admin">Super Admin</option>
                          </select>
                        </td>
                        <td className={`px-4 py-2 text-xs font-semibold ${getStatusColor(user.status)} capitalize`}>
                          {user.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-sm italic">No users found</p>
            )}
          </div>
        )}

        {/* Policies Tab */}
        {activeTab === 'policies' && (
          <div className="space-y-2 overflow-y-auto h-full pr-2">
            {isLoading ? (
              <p className="text-gray-500 text-sm">Loading policies...</p>
            ) : policies.length > 0 ? (
              policies.map((policy) => (
                <div key={policy.id} className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-200">{policy.name}</h3>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${getSeverityColor(policy.severity)}`}>
                        {policy.severity.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Applied to {policy.appliedCount} targets</p>
                  </div>
                  <button
                    onClick={() => handlePolicyToggle(policy.id, policy.enabled)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                      policy.enabled
                        ? 'bg-sage text-[#0d0b09] hover:bg-[#6ca870]'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {policy.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm italic">No policies found</p>
            )}
          </div>
        )}

        {/* Audit Tab */}
        {activeTab === 'audit' && (
          <div className="overflow-y-auto h-full pr-2">
            {isLoading ? (
              <p className="text-gray-500 text-sm">Loading audit log...</p>
            ) : auditEntries.length > 0 ? (
              <div className="bg-[#1a1816] border border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-[#0d0b09] border-b border-gray-700">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold">Time</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold">Actor</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold">Action</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {auditEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-[#251f1b]">
                        <td className="px-3 py-2 text-gray-500">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-2 text-gray-300">{entry.actor}</td>
                        <td className="px-3 py-2 text-[#D4785C] font-semibold">{entry.action}</td>
                        <td className="px-3 py-2 text-gray-400">{entry.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-sm italic">No audit entries found</p>
            )}
          </div>
        )}

        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <div className="space-y-4 overflow-y-auto h-full pr-2">
            {isLoading ? (
              <p className="text-gray-500 text-sm">Loading billing data...</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase font-semibold">Current Cost</p>
                    <p className="text-2xl font-bold text-[#D4785C] mt-2">
                      ${billingData.currentCost.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">of ${billingData.monthlyLimit.toFixed(2)} limit</p>
                  </div>
                  <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase font-semibold">Usage %</p>
                    <p className="text-2xl font-bold text-sage mt-2">
                      {Math.round((billingData.currentCost / billingData.monthlyLimit) * 100)}%
                    </p>
                  </div>
                </div>

                <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase">Usage Metrics</p>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-400">API Calls</span>
                      <span className="text-sm font-semibold text-gray-200">
                        {billingData.usageMetrics.apiCalls.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-400">Tokens Used</span>
                      <span className="text-sm font-semibold text-gray-200">
                        {billingData.usageMetrics.tokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-400">Storage (GB)</span>
                      <span className="text-sm font-semibold text-gray-200">
                        {billingData.usageMetrics.storage.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
