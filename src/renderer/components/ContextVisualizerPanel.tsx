'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Gauge,
  AlertTriangle,
  Info,
  RefreshCw,
  X,
} from 'lucide-react';

interface ContextSegment {
  name: string;
  tokens: number;
  percentage: number;
  color: string;
  details?: string;
}

interface ContextBreakdown {
  totalLimit: number;
  segments: ContextSegment[];
  totalUsed: number;
  availableTokens: number;
  utilizationPercent: number;
  warningLevel: 'safe' | 'moderate' | 'high' | 'critical';
}

interface UsageSnapshot {
  timestamp: number;
  utilization: number;
}

const getWarningColor = (level: string): string => {
  switch (level) {
    case 'safe':
      return 'border-sage-400 shadow-lg shadow-sage-400/20';
    case 'moderate':
      return 'border-gold-400 shadow-lg shadow-gold-400/20';
    case 'high':
      return 'border-gold-400 shadow-lg shadow-gold-400/20';
    case 'critical':
      return 'border-blush-400 shadow-lg shadow-blush-400/30 animate-pulse';
    default:
      return 'border-nyra-border';
  }
};

const getWarningBgColor = (level: string): string => {
  switch (level) {
    case 'safe':
      return 'bg-sage-400/10';
    case 'moderate':
      return 'bg-gold-400/10';
    case 'high':
      return 'bg-gold-400/10';
    case 'critical':
      return 'bg-blush-400/10';
    default:
      return 'bg-nyra-surface';
  }
};

const getTipByLevel = (level: string): { icon: React.ReactNode; text: string } => {
  switch (level) {
    case 'safe':
      return {
        icon: <Info className="w-4 h-4 text-sage-400" />,
        text: 'Context is healthy. Plenty of room for more interactions.',
      };
    case 'moderate':
      return {
        icon: <AlertTriangle className="w-4 h-4 text-gold-400" />,
        text: 'Consider summarizing older messages to free up space.',
      };
    case 'high':
      return {
        icon: <AlertTriangle className="w-4 h-4 text-gold-400" />,
        text: 'Memory compaction recommended. Response quality may begin to degrade.',
      };
    case 'critical':
      return {
        icon: <AlertTriangle className="w-4 h-4 text-blush-300" />,
        text: 'Context nearly full. Response quality will degrade. Summarize or clear old data immediately.',
      };
    default:
      return { icon: <Info className="w-4 h-4" />, text: '' };
  }
};

const SparklineChart: React.FC<{ data: UsageSnapshot[] }> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="w-full h-12 flex items-center justify-center text-xs text-white/40">
        No historical data yet
      </div>
    );
  }

  const width = 200;
  const height = 40;
  const padding = 4;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const minUtil = Math.min(...data.map(d => d.utilization), 0);
  const maxUtil = Math.max(...data.map(d => d.utilization), 100);
  const range = maxUtil - minUtil || 1;

  const points = data
    .map((d, i) => {
      const x = padding + (i / (data.length - 1 || 1)) * innerWidth;
      const y = padding + innerHeight - ((d.utilization - minUtil) / range) * innerHeight;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full">
      <polyline
        points={points}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={points}
        fill="url(#gradient)"
        fillOpacity="0.2"
        stroke="none"
      />
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};

const ModelSelector: React.FC<{
  selectedModel: string;
  onModelChange: (model: string) => void;
  models: string[];
}> = ({ selectedModel, onModelChange, models }) => {
  return (
    <select
      value={selectedModel}
      onChange={e => onModelChange(e.target.value)}
      className="px-2 py-1 text-xs bg-nyra-surface border border-nyra-border rounded text-white/70 hover:text-white hover:border-terra-400 transition-colors cursor-pointer"
    >
      {models.map(model => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </select>
  );
};

const WhatFitsCalculator: React.FC<{ availableTokens: number; estimateTokens: (text: string) => number }> = ({
  availableTokens,
  estimateTokens,
}) => {
  const [inputText, setInputText] = useState('');
  const estimatedTokens = estimateTokens(inputText);
  const fitsRemaining = Math.floor(availableTokens - estimatedTokens);
  const canFit = fitsRemaining >= 0;

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-white/60">What Fits?</label>
      <textarea
        value={inputText}
        onChange={e => setInputText(e.target.value)}
        placeholder="Type or paste text to see if it fits..."
        className="w-full h-20 px-2 py-1 text-xs bg-[#1a1a2e] border border-nyra-border rounded text-white/70 placeholder-white/30 focus:outline-none focus:border-terra-400 focus:ring-1 focus:ring-terra-400/20 resize-none"
      />
      <div className={`text-xs ${canFit ? 'text-sage-400' : 'text-blush-300'}`}>
        {estimatedTokens} tokens • {canFit ? `${fitsRemaining} tokens remaining` : `${Math.abs(fitsRemaining)} tokens over limit`}
      </div>
    </div>
  );
};

export default function ContextVisualizerPanel({
  onClose,
}: {
  onClose?: () => void;
}) {
  const [breakdown, setBreakdown] = useState<ContextBreakdown | null>(null);
  const [history, setHistory] = useState<UsageSnapshot[]>([]);
  const [selectedModel, setSelectedModel] = useState('claude-3.5-sonnet');
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const models = [
    'claude-3.5-sonnet',
    'claude-3.5-haiku',
    'claude-3-opus',
    'claude-3-sonnet',
    'gpt-4-turbo',
    'gpt-4',
  ];

  const estimateTokens = useCallback((text: string): number => {
    if (!text) return 0;
    return Math.ceil(text.length / 3.5);
  }, []);

  const fetchContextData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Call IPC to get context breakdown
      const breakdownData = await (window as any).nyra.contextViz?.getContextBreakdown?.(
        selectedModel
      );
      if (breakdownData) {
        setBreakdown(breakdownData);
      }

      // Call IPC to get historical usage
      const historyData = await (window as any).nyra.contextViz?.getHistoricalUsage?.(24);
      if (historyData) {
        setHistory(historyData);
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch context data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedModel]);

  // Fetch data on mount and when model changes
  useEffect(() => {
    fetchContextData();
  }, [fetchContextData]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchContextData();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchContextData]);

  if (!breakdown) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white/50">Loading context data...</div>
      </div>
    );
  }

  const tip = getTipByLevel(breakdown.warningLevel);
  const sortedSegments = [...breakdown.segments].sort((a, b) => b.tokens - a.tokens);

  return (
    <div className={`bg-[#0d0d1a] text-white/70 rounded-lg border-2 ${getWarningColor(breakdown.warningLevel)} overflow-hidden flex flex-col h-full`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-nyra-border">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-terra-400" />
          <div>
            <h2 className="text-sm font-semibold text-white">Context Window</h2>
            <p className="text-xs text-white/40">Token budget consumption across memory tiers</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 bg-nyra-surface rounded text-xs font-mono text-white">
            {breakdown.utilizationPercent.toFixed(1)}%
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Main stacked bar visualization */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/60">Memory Distribution</label>
          <div className="flex h-8 rounded overflow-hidden border border-nyra-border/50 bg-[#1a1a2e]">
            {breakdown.segments.map(segment => (
              segment.tokens > 0 && (
                <div
                  key={segment.name}
                  style={{
                    width: `${segment.percentage}%`,
                    backgroundColor: segment.color,
                    opacity: segment.name === 'Available Budget' ? 0.3 : 0.8,
                  }}
                  title={`${segment.name}: ${segment.tokens.toLocaleString()} tokens (${segment.percentage.toFixed(1)}%)`}
                  className="hover:opacity-100 transition-opacity"
                />
              )
            ))}
          </div>
        </div>

        {/* Token counter */}
        <div className={`p-3 rounded border ${getWarningBgColor(breakdown.warningLevel)} border-white/10`}>
          <div className="flex justify-between items-start mb-1">
            <span className="text-xs text-white/50">Total Budget Used</span>
            <span className="text-xl font-mono font-bold text-white">
              {breakdown.totalUsed.toLocaleString()} / {breakdown.totalLimit.toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-white/40">
            {breakdown.availableTokens.toLocaleString()} tokens available ({(100 - breakdown.utilizationPercent).toFixed(1)}%)
          </div>
        </div>

        {/* Model selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/60">Model</label>
          <ModelSelector
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            models={models}
          />
        </div>

        {/* Segment breakdown */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/60">Segment Breakdown</label>
          <div className="space-y-1">
            {sortedSegments.map(segment => {
              return (
                <div
                  key={segment.name}
                  className="flex items-center gap-2 p-2 rounded bg-[#1a1a2e]/50 hover:bg-[#1a1a2e] transition-colors text-xs"
                >
                  <div
                    style={{ backgroundColor: segment.color }}
                    className="w-3 h-3 rounded-full flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2 mb-0.5">
                      <span className="text-white/70 font-medium">{segment.name}</span>
                      <span className="text-white/50 font-mono">{segment.tokens.toLocaleString()}</span>
                    </div>
                    {segment.details && (
                      <div className="text-white/40 text-xs">{segment.details}</div>
                    )}
                    <div className="w-full h-1 bg-[#0d0d1a] rounded mt-1 overflow-hidden">
                      <div
                        style={{
                          width: `${Math.max(segment.percentage, 2)}%`,
                          backgroundColor: segment.color,
                        }}
                        className="h-full"
                      />
                    </div>
                  </div>
                  <span className="text-white/40 font-mono text-xs flex-shrink-0">
                    {segment.percentage.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* What fits calculator */}
        <WhatFitsCalculator
          availableTokens={breakdown.availableTokens}
          estimateTokens={estimateTokens}
        />

        {/* Historical trend */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/60">24-Hour Trend</label>
          <div className="bg-[#1a1a2e] rounded border border-nyra-border/50 p-2">
            <SparklineChart data={history} />
          </div>
        </div>

        {/* Tips section */}
        <div className={`flex gap-2 p-3 rounded border ${getWarningBgColor(breakdown.warningLevel)} border-white/10`}>
          {tip.icon}
          <div className="text-xs text-white/60">{tip.text}</div>
        </div>

        {/* Last refresh */}
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
          <button
            onClick={fetchContextData}
            disabled={isLoading}
            className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
