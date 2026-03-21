import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Zap,
  DollarSign,
  Clock,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

// Sparkline component that renders SVG polyline chart
interface SparklineProps {
  data: number[];
  height?: number;
  width?: number;
  color?: string;
}

const Sparkline: React.FC<SparklineProps> = ({
  data,
  height = 40,
  width = 200,
  color = '#7c9070',
}) => {
  if (!data || data.length === 0) {
    return <svg width={width} height={height} />;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1 || 1)) * width;
      const y = height - ((value - min) / range) * (height * 0.8) - height * 0.1;
      return `${x},${y}`;
    })
    .join(' ');

  const gradientId = `gradient-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
};

interface OverallStats {
  totalTasks: number;
  totalTokens: number;
  totalCost: number;
  avgSuccessRate: number;
  avgLatency: number;
}

interface AgentInfo {
  agentId: string;
  successRate: number;
  totalTasks: number;
  avgLatency: number;
  totalTokens: number;
  totalCost: number;
  timeSeries?: Array<{ time: string; tasks: number; successRate: number; avgLatency: number; tokens: number }>;
}

interface ProviderInfo {
  providerId: string;
  totalTasks: number;
  successRate: number;
  avgLatency: number;
  totalTokens: number;
  totalCost: number;
  models: Record<string, { totalTasks: number; successRate: number; totalCost: number }>;
}

interface CostBreakdown {
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  byAgent: Record<string, number>;
  daily: Array<{ date: string; cost: number }>;
}

type TabType = 'overview' | 'agents' | 'providers' | 'cost';
type TimeRange = '24h' | '7d' | '30d';

export default function AgentAnalyticsPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Get overall stats
      const stats = await (window as any).nyra.analytics.getOverallStats?.();
      setOverallStats(stats);

      // Get agents
      const agentsList = await (window as any).nyra.analytics.getTopAgents?.(10);
      setAgents(agentsList || []);

      // Get providers
      const providersList = await (window as any).nyra.analytics.getProviders?.();
      setProviders(providersList || []);

      // Get cost breakdown
      const costs = await (window as any).nyra.analytics.getCostBreakdown?.(30);
      setCostBreakdown(costs);
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAgentTimeSeries = useCallback(async (agentId: string) => {
    try {
      const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : 30;
      const timeSeries = await (window as any).nyra.analytics.getTimeSeries?.(
        agentId,
        days
      );

      setAgents((prevAgents) =>
        prevAgents.map((agent) =>
          agent.agentId === agentId ? { ...agent, timeSeries } : agent
        )
      );
    } catch (error) {
      console.error('Error fetching agent time series:', error);
    }
  }, [timeRange]);

  // Initial fetch and polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Format functions
  const formatNumber = (num: number) => new Intl.NumberFormat().format(Math.floor(num));
  const formatCost = (cost: number) => `$${cost.toFixed(2)}`;
  const formatLatency = (ms: number) => `${Math.floor(ms)}ms`;

  // StatCard component
  const StatCard = ({
    icon: Icon,
    label,
    value,
    subtext,
  }: {
    icon: React.ComponentType<any>;
    label: string;
    value: string;
    subtext?: string;
  }) => (
    <div className="bg-nyra-surface border border-nyra-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm font-medium text-sage">{label}</span>
        <Icon className="w-4 h-4 text-gold" />
      </div>
      <div className="text-2xl font-bold text-terra">{value}</div>
      {subtext && <div className="text-xs text-sage mt-1">{subtext}</div>}
    </div>
  );

  // Overview Tab
  const OverviewTab = () => (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={Zap}
          label="Total Tasks"
          value={formatNumber(overallStats?.totalTasks || 0)}
        />
        <StatCard
          icon={TrendingUp}
          label="Success Rate"
          value={`${(overallStats?.avgSuccessRate || 0).toFixed(1)}%`}
        />
        <StatCard
          icon={Clock}
          label="Avg Latency"
          value={formatLatency(overallStats?.avgLatency || 0)}
        />
        <StatCard
          icon={DollarSign}
          label="Total Cost"
          value={formatCost(overallStats?.totalCost || 0)}
        />
        <StatCard
          icon={BarChart3}
          label="Total Tokens"
          value={formatNumber(overallStats?.totalTokens || 0)}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Success Rate Trend */}
        <div className="bg-nyra-surface border border-nyra-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-terra mb-3">Success Rate Trend</h3>
          <Sparkline
            data={[85, 88, 86, 90, 92, 89, 91]}
            width={280}
            height={60}
            color="#a0937d"
          />
        </div>

        {/* Cost Trend */}
        <div className="bg-nyra-surface border border-nyra-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-terra mb-3">Cost Trend</h3>
          <Sparkline
            data={[450, 480, 420, 510, 490, 520, 480]}
            width={280}
            height={60}
            color="#c4a574"
          />
        </div>
      </div>
    </div>
  );

  // Agents Tab
  const AgentsTab = () => (
    <div className="space-y-3">
      {agents.map((agent) => (
        <div key={agent.agentId}>
          <div
            className="bg-nyra-surface border border-nyra-border rounded-lg p-4 cursor-pointer hover:border-gold transition-colors"
            onClick={() => {
              const newId = expandedAgent === agent.agentId ? null : agent.agentId
              setExpandedAgent(newId)
              if (newId) fetchAgentTimeSeries(newId)
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1">
                <div className="font-semibold text-terra">{agent.agentId}</div>
                <div className="text-xs text-sage mt-1">
                  {formatNumber(agent.totalTasks)} tasks
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-gold transition-transform ${
                  expandedAgent === agent.agentId ? 'rotate-180' : ''
                }`}
              />
            </div>

            {/* Success Rate Bar */}
            <div className="mb-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-sage">Success Rate</span>
                <span className="text-xs font-semibold text-terra">
                  {agent.successRate.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-nyra-border rounded h-2 overflow-hidden">
                <div
                  className="bg-terra h-full transition-all"
                  style={{ width: `${Math.min(agent.successRate, 100)}%` }}
                />
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-sage">Avg Latency</span>
                <div className="font-semibold text-terra">
                  {formatLatency(agent.avgLatency)}
                </div>
              </div>
              <div>
                <span className="text-sage">Tokens</span>
                <div className="font-semibold text-terra">
                  {formatNumber(agent.totalTokens)}
                </div>
              </div>
              <div>
                <span className="text-sage">Cost</span>
                <div className="font-semibold text-terra">
                  {formatCost(agent.totalCost)}
                </div>
              </div>
            </div>
          </div>

          {/* Expanded Time Series */}
          {expandedAgent === agent.agentId && agent.timeSeries && (
            <div className="bg-nyra-surface border border-nyra-border border-t-0 rounded-b-lg p-4 -mt-2">
              <div className="text-xs text-sage mb-2">7-Day Trend</div>
              <Sparkline
                data={agent.timeSeries.map((p) => p.successRate)}
                width={400}
                height={50}
                color="#7c9070"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );

  // Providers Tab
  const ProvidersTab = () => (
    <div className="space-y-3">
      {providers.map((provider) => (
        <div
          key={provider.providerId}
          className="bg-nyra-surface border border-nyra-border rounded-lg p-4"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-semibold text-terra">{provider.providerId}</div>
              <div className="text-xs text-sage mt-1">
                {formatNumber(provider.totalTasks)} tasks
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="text-sage">Success Rate</div>
              <div className="font-semibold text-terra">
                {provider.successRate.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Health Bar */}
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-sage">Health</span>
              <span className="text-xs font-semibold text-terra">
                {Math.min(provider.successRate * 1.1, 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-nyra-border rounded h-2">
              <div
                className="bg-terra h-full"
                style={{
                  width: `${Math.min(provider.successRate * 1.1, 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Models breakdown */}
          <div className="text-xs space-y-1 pt-2 border-t border-nyra-border">
            {Object.entries(provider.models).map(([modelId, stats]) => (
              <div
                key={modelId}
                className="flex justify-between text-sage hover:text-terra"
              >
                <span>{modelId}</span>
                <span>{stats.totalTasks} tasks</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // Cost Tab
  const CostTab = () => {
    const totalCostByProvider = Object.values(
      costBreakdown?.byProvider || {}
    ).reduce((sum, cost) => sum + cost, 0) || 0;

    const totalCostByModel = Object.values(costBreakdown?.byModel || {}).reduce(
      (sum, cost) => sum + cost,
      0
    ) || 0;

    const dailyCosts = costBreakdown?.daily || [];
    const avgDailyCost =
      dailyCosts.length > 0
        ? dailyCosts.reduce((sum, d) => sum + d.cost, 0) / dailyCosts.length
        : 0;

    return (
      <div className="space-y-6">
        {/* Cost by Provider */}
        <div className="bg-nyra-surface border border-nyra-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-terra mb-4">Cost by Provider</h3>
          <div className="space-y-3">
            {Object.entries(costBreakdown?.byProvider || {}).map(
              ([provider, cost]) => (
                <div key={provider}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-sage">{provider}</span>
                    <span className="text-xs font-semibold text-terra">
                      {formatCost(cost as number)}
                    </span>
                  </div>
                  <div className="w-full bg-nyra-border rounded h-2">
                    <div
                      className="bg-gold h-full"
                      style={{
                        width: `${
                          totalCostByProvider > 0
                            ? ((cost as number) / totalCostByProvider) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Cost by Model */}
        <div className="bg-nyra-surface border border-nyra-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-terra mb-4">Cost by Model</h3>
          <div className="space-y-3">
            {Object.entries(costBreakdown?.byModel || {}).map(([model, cost]) => (
              <div key={model}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-sage">{model}</span>
                  <span className="text-xs font-semibold text-terra">
                    {formatCost(cost as number)}
                  </span>
                </div>
                <div className="w-full bg-nyra-border rounded h-2">
                  <div
                    className="bg-blush h-full"
                    style={{
                      width: `${
                        totalCostByModel > 0
                          ? ((cost as number) / totalCostByModel) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Daily Cost Trend */}
        <div className="bg-nyra-surface border border-nyra-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-terra mb-4">Daily Cost Trend</h3>
          <Sparkline
            data={dailyCosts.map((d) => d.cost)}
            width={400}
            height={60}
            color="#c4a574"
          />
        </div>

        {/* Projection */}
        <div className="bg-nyra-surface border border-nyra-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-terra mb-3">Monthly Projection</h3>
          <div className="text-3xl font-bold text-gold mb-1">
            {formatCost(avgDailyCost * 30)}
          </div>
          <div className="text-xs text-sage">
            Based on {formatCost(avgDailyCost)}/day average
          </div>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab />;
      case 'agents':
        return <AgentsTab />;
      case 'providers':
        return <ProvidersTab />;
      case 'cost':
        return <CostTab />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-nyra-surface to-slate-900">
      {/* Header */}
      <div className="border-b border-nyra-border bg-nyra-surface/50 backdrop-blur">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-terra flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gold" />
              Agent Analytics
            </h1>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 hover:bg-nyra-border rounded transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw
                className={`w-4 h-4 text-gold ${loading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          {/* Time Range Selector */}
          <div className="flex gap-2">
            {(['24h', '7d', '30d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  timeRange === range
                    ? 'bg-terra text-nyra-surface'
                    : 'bg-nyra-border text-sage hover:bg-nyra-border/70'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-nyra-border bg-nyra-surface/50 px-6 flex gap-1">
        {(['overview', 'agents', 'providers', 'cost'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-terra text-terra'
                : 'border-transparent text-sage hover:text-terra'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading && agents.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sage">
            Loading analytics...
          </div>
        ) : (
          renderTabContent()
        )}
      </div>
    </div>
  );
}
