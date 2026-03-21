import React, { useState, useEffect, useCallback } from 'react';

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

interface Role {
  id: string;
  name: string;
  permissions: string[];
  memberCount: number;
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

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function EnterpriseDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [billingData, setBillingData] = useState<BillingData>({
    currentCost: 0,
    monthlyLimit: 0,
    usageMetrics: { apiCalls: 0, tokens: 0, storage: 0 },
  });
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Policy form state
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    name: '',
    severity: 'medium' as const,
  });

  // Audit filter state
  const [auditDateRange, setAuditDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  // Billing limit input
  const [spendingLimitInput, setSpendingLimitInput] = useState('');

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const loadUsersData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await window.nyra.adminConsole.listUsers();
      if (data) {
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
      addToast('Failed to load users', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  const loadRolesData = useCallback(async () => {
    try {
      const data = await window.nyra.rbacManager.listRoles?.();
      if (data) {
        setRoles(data.roles || []);
      }
    } catch (err) {
      console.error('Failed to load roles:', err);
    }
  }, []);

  const loadPoliciesData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await window.nyra.policyEngine.getPolicies?.();
      if (data) {
        setPolicies(data.policies || []);
      }
    } catch (err) {
      console.error('Failed to load policies:', err);
      addToast('Failed to load policies', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  const loadAuditData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await window.nyra.adminConsole.getAuditLog({
        startDate: auditDateRange.startDate,
        endDate: auditDateRange.endDate,
      });
      if (data) {
        setAuditEntries(data.entries || []);
      }
    } catch (err) {
      console.error('Failed to load audit log:', err);
      addToast('Failed to load audit log', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [auditDateRange, addToast]);

  const loadBillingData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await window.nyra.adminConsole.getBillingOverview();
      if (data) {
        setBillingData(data);
        setSpendingLimitInput(data.monthlyLimit.toString());
      }
    } catch (err) {
      console.error('Failed to load billing data:', err);
      addToast('Failed to load billing data', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  // Load data based on active tab
  useEffect(() => {
    switch (activeTab) {
      case 'users':
        loadUsersData();
        loadRolesData();
        break;
      case 'policies':
        loadPoliciesData();
        break;
      case 'audit':
        loadAuditData();
        break;
      case 'billing':
        loadBillingData();
        break;
    }
  }, [activeTab, loadUsersData, loadRolesData, loadPoliciesData, loadAuditData, loadBillingData]);

  const handleUserStatusToggle = async (userId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
      if (newStatus === 'suspended') {
        await window.nyra.adminConsole.suspendUser(userId);
      } else {
        await window.nyra.adminConsole.activateUser(userId);
      }
      setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus as any } : u));
      addToast(`User ${newStatus === 'suspended' ? 'suspended' : 'activated'} successfully`, 'success');
    } catch (err) {
      console.error('Failed to update user status:', err);
      addToast('Failed to update user status', 'error');
    }
  };

  const handleAddPolicy = async () => {
    try {
      if (!policyForm.name.trim()) {
        addToast('Policy name is required', 'error');
        return;
      }

      const result = await window.nyra.policyEngine.createPolicy?.(policyForm);
      
      setPolicies(prev => [...prev, {
        id: result?.id || Math.random().toString(36).substr(2, 9),
        name: policyForm.name,
        severity: policyForm.severity,
        enabled: true,
        appliedCount: 0,
      }]);

      setPolicyForm({ name: '', severity: 'medium' });
      setShowPolicyForm(false);
      addToast(`Policy "${policyForm.name}" created successfully`, 'success');
    } catch (err) {
      console.error('Failed to create policy:', err);
      addToast('Failed to create policy', 'error');
    }
  };

  const handleSetSpendingLimit = async () => {
    try {
      const newLimit = parseFloat(spendingLimitInput);
      if (isNaN(newLimit) || newLimit < 0) {
        addToast('Please enter a valid spending limit', 'error');
        return;
      }
      await window.nyra.adminConsole.setSpendingLimit(newLimit);
      setBillingData(prev => ({ ...prev, monthlyLimit: newLimit }));
      addToast(`Spending limit set to $${newLimit.toFixed(2)}`, 'success');
    } catch (err) {
      console.error('Failed to set spending limit:', err);
      addToast('Failed to set spending limit', 'error');
    }
  };

  const handleGenerateComplianceReport = async () => {
    try {
      setIsLoading(true);
      const report = await window.nyra.adminConsole.generateComplianceReport?.();
      if (report) {
        addToast('Compliance report generated successfully', 'success');
        // Could open/download the report here
      }
    } catch (err) {
      console.error('Failed to generate compliance report:', err);
      addToast('Failed to generate compliance report', 'error');
    } finally {
      setIsLoading(false);
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
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            {/* Roles Subsection */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase">User Roles</p>
              {roles.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {roles.map((role) => (
                    <div key={role.id} className="bg-[#1a1816] border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-200">{role.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{role.memberCount} members</p>
                        </div>
                        <span className="text-xs text-[#D4785C]">{role.permissions.length} perms</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">No roles configured</p>
              )}
            </div>

            {/* Users List */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase">Users</p>
              {isLoading ? (
                <p className="text-gray-500 text-sm">Loading users...</p>
              ) : users.length > 0 ? (
                <div className="bg-[#1a1816] border border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0d0b09] border-b border-gray-700 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 text-gray-500 font-semibold">Name</th>
                        <th className="text-left px-4 py-2 text-gray-500 font-semibold">Email</th>
                        <th className="text-left px-4 py-2 text-gray-500 font-semibold">Status</th>
                        <th className="text-left px-4 py-2 text-gray-500 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-[#251f1b]">
                          <td className="px-4 py-2 text-gray-200">{user.name}</td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{user.email}</td>
                          <td className={`px-4 py-2 text-xs font-semibold ${getStatusColor(user.status)} capitalize`}>
                            {user.status}
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => handleUserStatusToggle(user.id, user.status)}
                              className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                                user.status === 'suspended'
                                  ? 'bg-sage text-[#0d0b09] hover:bg-[#6ca870]'
                                  : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                              }`}
                            >
                              {user.status === 'suspended' ? 'Activate' : 'Suspend'}
                            </button>
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
          </div>
        )}

        {/* Policies Tab */}
        {activeTab === 'policies' && (
          <div className="space-y-3 overflow-y-auto flex-1 pr-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase">Security Policies</p>
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
                  placeholder="Policy name (e.g., Data Encryption)"
                  value={policyForm.name}
                  onChange={(e) => setPolicyForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C]"
                />
                <select
                  value={policyForm.severity}
                  onChange={(e) => setPolicyForm(prev => ({ ...prev, severity: e.target.value as any }))}
                  className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#D4785C]"
                >
                  <option value="low">Low Severity</option>
                  <option value="medium">Medium Severity</option>
                  <option value="high">High Severity</option>
                  <option value="critical">Critical Severity</option>
                </select>
                <button
                  onClick={handleAddPolicy}
                  className="w-full bg-[#D4785C] hover:bg-[#c8653a] text-white font-semibold py-2 rounded-lg transition-colors text-sm"
                >
                  Create Policy
                </button>
              </div>
            )}

            {/* Policies List */}
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
          <div className="space-y-3 overflow-y-auto flex-1 pr-2">
            {/* Date Range Filter */}
            <div className="flex gap-2">
              <input
                type="date"
                value={auditDateRange.startDate}
                onChange={(e) => setAuditDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="flex-1 bg-[#1a1816] border border-gray-700 rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-[#D4785C]"
              />
              <input
                type="date"
                value={auditDateRange.endDate}
                onChange={(e) => setAuditDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="flex-1 bg-[#1a1816] border border-gray-700 rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-[#D4785C]"
              />
              <button
                onClick={loadAuditData}
                className="bg-[#C9A87C] hover:bg-[#b89668] text-[#0d0b09] font-semibold px-3 py-2 rounded text-xs transition-colors"
              >
                Filter
              </button>
            </div>

            {/* Audit Log Table */}
            {isLoading ? (
              <p className="text-gray-500 text-sm">Loading audit log...</p>
            ) : auditEntries.length > 0 ? (
              <div className="bg-[#1a1816] border border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-[#0d0b09] border-b border-gray-700 sticky top-0">
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
              <p className="text-gray-500 text-sm italic">No audit entries found for the selected date range</p>
            )}
          </div>
        )}

        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            {isLoading ? (
              <p className="text-gray-500 text-sm">Loading billing data...</p>
            ) : (
              <>
                {/* Cost Cards */}
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

                {/* Spending Limit */}
                <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase">Monthly Spending Limit</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={spendingLimitInput}
                      onChange={(e) => setSpendingLimitInput(e.target.value)}
                      placeholder="Monthly limit"
                      className="flex-1 bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C]"
                    />
                    <button
                      onClick={handleSetSpendingLimit}
                      className="bg-[#D4785C] hover:bg-[#c8653a] text-white font-semibold px-4 py-2 rounded text-sm transition-colors"
                    >
                      Set
                    </button>
                  </div>
                </div>

                {/* Usage Metrics */}
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

                {/* Compliance Report */}
                <button
                  onClick={handleGenerateComplianceReport}
                  disabled={isLoading}
                  className="w-full bg-[#C9A87C] hover:bg-[#b89668] disabled:opacity-50 text-[#0d0b09] font-semibold py-2 rounded-lg transition-colors"
                >
                  {isLoading ? 'Generating...' : 'Generate Compliance Report'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}