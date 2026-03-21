import React, { useState, useEffect, useCallback } from 'react';

interface Insight {
  id: string;
  topic: string;
  content: string;
  votes: number;
  confidence?: number;
  userVoted?: boolean;
}

interface TrendingTopic {
  name: string;
  count: number;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

declare global {
  interface Window {
    nyra?: {
      agentNetwork: {
        init: () => Promise<any>;
        join: (...args: any[]) => Promise<any>;
        leave: () => Promise<any>;
        shareInsight: (...args: any[]) => Promise<any>;
        queryInsights: (...args: any[]) => Promise<any>;
        voteInsight: (...args: any[]) => Promise<any>;
        reportTaskOutcome: (...args: any[]) => Promise<any>;
        getBestApproach: (...args: any[]) => Promise<any>;
        getTrendingTopics: () => Promise<any>;
        getPeerCount: () => Promise<any>;
        shutdown: () => Promise<any>;
      };
    };
  }
}

export default function AgentNetworkPanel() {
  const [isNetworkMember, setIsNetworkMember] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Share Insight Form
  const [shareForm, setShareForm] = useState({
    topic: '',
    content: '',
    tags: '',
  });
  const [isSharing, setIsSharing] = useState(false);

  // Best Approach Lookup
  const [lookupTopic, setLookupTopic] = useState('');
  const [bestApproach, setBestApproach] = useState<any>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Task Outcome Reporter
  const [taskOutcome, setTaskOutcome] = useState({
    description: '',
    outcome: 'success' as 'success' | 'failure' | 'partial',
  });
  const [isReporting, setIsReporting] = useState(false);

  // Auto-refresh peer count
  useEffect(() => {
    refreshPeerCount();
    const interval = setInterval(refreshPeerCount, 10000);
    return () => clearInterval(interval);
  }, []);

  // Initial load
  useEffect(() => {
    loadNetworkData();
  }, []);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const refreshPeerCount = async () => {
    try {
      const count = await window.nyra?.agentNetwork?.getPeerCount();
      if (typeof count === 'number') {
        setPeerCount(count);
      }
    } catch (err) {
      console.error('Failed to refresh peer count:', err);
    }
  };

  const loadNetworkData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        loadInsights(),
        loadTrendingTopics(),
        refreshPeerCount(),
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadInsights = async () => {
    try {
      const result = await window.nyra?.agentNetwork?.queryInsights();
      if (Array.isArray(result)) {
        setInsights(result);
      }
    } catch (err) {
      addToast(`Failed to load insights: ${err}`, 'error');
    }
  };

  const loadTrendingTopics = async () => {
    try {
      const result = await window.nyra?.agentNetwork?.getTrendingTopics();
      if (Array.isArray(result)) {
        setTrendingTopics(result);
      }
    } catch (err) {
      addToast(`Failed to load trending topics: ${err}`, 'error');
    }
  };

  const handleToggleNetwork = async () => {
    try {
      if (isNetworkMember) {
        await window.nyra?.agentNetwork?.leave();
        setIsNetworkMember(false);
        addToast('Left network', 'success');
      } else {
        await window.nyra?.agentNetwork?.join();
        setIsNetworkMember(true);
        addToast('Joined network', 'success');
      }
    } catch (err) {
      addToast(`Failed to toggle network: ${err}`, 'error');
    }
  };

  const handleShareInsight = async () => {
    if (!shareForm.topic.trim() || !shareForm.content.trim()) {
      addToast('Please fill in topic and content', 'error');
      return;
    }

    try {
      setIsSharing(true);
      const tags = shareForm.tags.split(',').map(t => t.trim()).filter(Boolean);
      const result = await window.nyra?.agentNetwork?.shareInsight({
        topic: shareForm.topic,
        content: shareForm.content,
        tags,
      });

      if (result?.id) {
        setInsights([result, ...insights]);
        setShareForm({ topic: '', content: '', tags: '' });
        addToast('Insight shared successfully', 'success');
      }
    } catch (err) {
      addToast(`Failed to share insight: ${err}`, 'error');
    } finally {
      setIsSharing(false);
    }
  };

  const handleVoteInsight = async (insightId: string) => {
    try {
      const result = await window.nyra?.agentNetwork?.voteInsight(insightId);
      if (result?.votes !== undefined) {
        setInsights(insights.map(i =>
          i.id === insightId ? { ...i, votes: result.votes, userVoted: result.userVoted } : i
        ));
        addToast('Vote recorded', 'success');
      }
    } catch (err) {
      addToast(`Failed to vote: ${err}`, 'error');
    }
  };

  const handleGetBestApproach = async () => {
    if (!lookupTopic.trim()) {
      addToast('Please enter a topic', 'error');
      return;
    }

    try {
      setIsLookingUp(true);
      const result = await window.nyra?.agentNetwork?.getBestApproach(lookupTopic);
      setBestApproach(result);
      addToast('Approach retrieved', 'success');
    } catch (err) {
      addToast(`Failed to get approach: ${err}`, 'error');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleReportTaskOutcome = async () => {
    if (!taskOutcome.description.trim()) {
      addToast('Please describe the task', 'error');
      return;
    }

    try {
      setIsReporting(true);
      await window.nyra?.agentNetwork?.reportTaskOutcome({
        description: taskOutcome.description,
        outcome: taskOutcome.outcome,
      });
      setTaskOutcome({ description: '', outcome: 'success' });
      addToast('Task outcome reported', 'success');
    } catch (err) {
      addToast(`Failed to report outcome: ${err}`, 'error');
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-nyra-surface rounded-lg h-full flex flex-col overflow-hidden">
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
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold text-gray-100">Agent Network</h2>
            <p className="text-sm text-gray-400">Collaborative insights & best practices</p>
          </div>
          <button
            onClick={handleToggleNetwork}
            className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
              isNetworkMember
                ? 'bg-sage text-[#0d0b09] hover:bg-[#6ca870]'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {isNetworkMember ? 'Leave' : 'Join'}
          </button>
        </div>
      </div>

      {/* Network Status */}
      <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-3 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-500 uppercase font-semibold">Network Status</p>
          <p className="text-sm text-gray-200 mt-1">
            <span className={`w-2 h-2 rounded-full inline-block mr-2 ${
              isNetworkMember ? 'bg-sage' : 'bg-gray-500'
            }`} />
            {isNetworkMember ? 'Connected' : 'Disconnected'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase font-semibold">Peers</p>
          <p className="text-2xl font-bold text-[#D4785C]">{peerCount}</p>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {/* Share Insight Section */}
        {isNetworkMember && (
          <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase">Share Insight</p>
            <input
              type="text"
              placeholder="Topic"
              value={shareForm.topic}
              onChange={(e) => setShareForm({ ...shareForm, topic: e.target.value })}
              className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C]"
            />
            <textarea
              placeholder="Your insight..."
              value={shareForm.content}
              onChange={(e) => setShareForm({ ...shareForm, content: e.target.value })}
              rows={3}
              className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C] resize-none"
            />
            <input
              type="text"
              placeholder="Tags (comma-separated)"
              value={shareForm.tags}
              onChange={(e) => setShareForm({ ...shareForm, tags: e.target.value })}
              className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C]"
            />
            <button
              onClick={handleShareInsight}
              disabled={isSharing}
              className="w-full bg-[#D4785C] hover:bg-[#c8653a] text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              {isSharing ? 'Sharing...' : 'Share'}
            </button>
          </div>
        )}

        {/* Trending Topics */}
        {trendingTopics.length > 0 && (
          <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase">Trending Topics</p>
            <div className="flex flex-wrap gap-2">
              {trendingTopics.map((topic, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1 bg-gray-700 text-gray-200 rounded-full text-xs font-semibold hover:bg-gray-600 cursor-pointer transition-colors"
                >
                  {topic.name} <span className="text-gray-400 ml-1">({topic.count})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Best Approach Lookup */}
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">Find Best Approach</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Topic to research..."
              value={lookupTopic}
              onChange={(e) => setLookupTopic(e.target.value)}
              className="flex-1 bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C]"
            />
            <button
              onClick={handleGetBestApproach}
              disabled={isLookingUp}
              className="bg-[#C9A87C] hover:bg-[#b89668] text-[#0d0b09] font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
            >
              {isLookingUp ? 'Looking...' : 'Search'}
            </button>
          </div>
          {bestApproach && (
            <div className="bg-[#0d0b09] rounded p-3 space-y-2">
              {bestApproach.approach && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Recommended Approach</p>
                  <p className="text-sm text-gray-200 mt-1">{bestApproach.approach}</p>
                </div>
              )}
              {bestApproach.confidence && (
                <div className="text-xs text-gray-400">
                  Confidence: {Math.round(bestApproach.confidence * 100)}%
                </div>
              )}
            </div>
          )}
        </div>

        {/* Task Outcome Reporter */}
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">Report Task Outcome</p>
          <textarea
            placeholder="Describe the task..."
            value={taskOutcome.description}
            onChange={(e) => setTaskOutcome({ ...taskOutcome, description: e.target.value })}
            rows={2}
            className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C] resize-none"
          />
          <select
            value={taskOutcome.outcome}
            onChange={(e) => setTaskOutcome({ ...taskOutcome, outcome: e.target.value as any })}
            className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#D4785C]"
          >
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="partial">Partial Success</option>
          </select>
          <button
            onClick={handleReportTaskOutcome}
            disabled={isReporting}
            className="w-full bg-[#D4785C] hover:bg-[#c8653a] text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
          >
            {isReporting ? 'Reporting...' : 'Report'}
          </button>
        </div>

        {/* Insights Feed */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-xs font-semibold text-gray-400 uppercase">Insight Feed</p>
            <button
              onClick={loadNetworkData}
              disabled={isLoading}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-200 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-2">
            {isLoading ? (
              <p className="text-gray-500 text-sm">Loading insights...</p>
            ) : insights.length > 0 ? (
              insights.map(insight => (
                <div key={insight.id} className="bg-[#1a1816] border border-gray-700 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <span className="inline-block px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs font-semibold">
                        {insight.topic}
                      </span>
                    </div>
                    <button
                      onClick={() => handleVoteInsight(insight.id)}
                      className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors ${
                        insight.userVoted
                          ? 'bg-[#D4785C] text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      + {insight.votes}
                    </button>
                  </div>
                  <p className="text-sm text-gray-200 line-clamp-2">{insight.content}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm italic">No insights yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
