import React, { useState, useEffect } from 'react';

interface NetworkStats {
  totalNodes: number;
  activeAgents: number;
  popularSkills: string[];
}

interface TrendingTopic {
  id: string;
  name: string;
  mentions: number;
  trending: boolean;
}

interface Insight {
  id: string;
  topic: string;
  content: string;
  confidence: number;
  votes: number;
  userVoted?: boolean;
}

export default function AgentNetworkPanel() {
  const [isNetworkMember, setIsNetworkMember] = useState(false);
  const [stats, setStats] = useState<NetworkStats>({
    totalNodes: 0,
    activeAgents: 0,
    popularSkills: [],
  });
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [shareForm, setShareForm] = useState({
    topic: '',
    insight: '',
    confidence: 75,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadNetworkData();
  }, []);

  const loadNetworkData = async () => {
    try {
      setIsLoading(true);
      const data = await (window.nyra?.agentNetwork?.getStats as any)?.();
      if (data) {
        setStats(data.stats || stats);
        setTrendingTopics(data.trending || []);
        setInsights(data.insights || []);
        setIsNetworkMember(data.isMember || false);
      }
    } catch (err) {
      console.error('Failed to load network data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleNetwork = async () => {
    try {
      if (isNetworkMember) {
        await (window.nyra?.agentNetwork?.leave as any)?.();
      } else {
        await (window.nyra?.agentNetwork?.join as any)?.();
      }
      setIsNetworkMember(!isNetworkMember);
    } catch (err) {
      console.error('Failed to toggle network membership:', err);
    }
  };

  const handleShareInsight = async () => {
    if (!shareForm.topic.trim() || !shareForm.insight.trim()) {
      alert('Please fill in topic and insight text');
      return;
    }

    try {
      const newInsight = await (window.nyra?.agentNetwork?.shareInsight as any)?.(
        shareForm.topic,
        shareForm.insight,
        shareForm.confidence
      );

      if (newInsight) {
        setInsights([newInsight, ...insights]);
        setShareForm({ topic: '', insight: '', confidence: 75 });
      }
    } catch (err) {
      console.error('Failed to share insight:', err);
    }
  };

  const handleVoteInsight = async (insightId: string, currentVotes: number) => {
    try {
      const updated = await (window.nyra?.agentNetwork?.voteInsight as any)?.(insightId);
      setInsights(insights.map(i =>
        i.id === insightId
          ? { ...i, votes: updated.votes, userVoted: updated.userVoted }
          : i
      ));
    } catch (err) {
      console.error('Failed to vote on insight:', err);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-nyra-surface rounded-lg max-h-screen flex flex-col overflow-hidden">
      <div className="space-y-2">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold text-gray-100">Agent Network</h2>
            <p className="text-sm text-gray-400">Community insights & collaboration</p>
          </div>
          <button
            onClick={handleToggleNetwork}
            className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
              isNetworkMember
                ? 'bg-sage text-[#0d0b09] hover:bg-[#6ca870]'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {isNetworkMember ? 'Leave Network' : 'Join Network'}
          </button>
        </div>
      </div>

      {/* Network Stats Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase font-semibold">Total Nodes</p>
          <p className="text-2xl font-bold text-[#D4785C] mt-1">{stats.totalNodes}</p>
        </div>
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase font-semibold">Active Agents</p>
          <p className="text-2xl font-bold text-sage mt-1">{stats.activeAgents}</p>
        </div>
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase font-semibold">Skills Shared</p>
          <p className="text-2xl font-bold text-[#C9A87C] mt-1">{stats.popularSkills.length}</p>
        </div>
      </div>

      {/* Trending Topics */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase">Trending Topics</p>
        <div className="flex flex-wrap gap-2">
          {trendingTopics.map((topic) => (
            <div
              key={topic.id}
              className="inline-flex items-center gap-1 px-3 py-1 bg-[#1a1816] border border-gray-700 rounded-full text-xs text-gray-300 hover:border-gray-600"
            >
              {topic.trending && <span className="text-red-400">🔥</span>}
              <span>{topic.name}</span>
              <span className="text-gray-500">({topic.mentions})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Share Insight Form */}
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
            value={shareForm.insight}
            onChange={(e) => setShareForm({ ...shareForm, insight: e.target.value })}
            rows={3}
            className="w-full bg-[#0d0b09] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C] resize-none"
          />
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-xs text-gray-500">Confidence</label>
              <span className="text-xs font-semibold text-gray-300">{shareForm.confidence}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={shareForm.confidence}
              onChange={(e) => setShareForm({ ...shareForm, confidence: parseInt(e.target.value) })}
              className="w-full h-2 bg-[#0d0b09] rounded-full appearance-none cursor-pointer accent-[#D4785C]"
            />
          </div>
          <button
            onClick={handleShareInsight}
            className="w-full bg-[#D4785C] hover:bg-[#c8653a] text-white font-semibold py-2 rounded-lg transition-colors text-sm"
          >
            Share Insight
          </button>
        </div>
      )}

      {/* Insights Feed */}
      <div className="flex-1 overflow-hidden space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase">Insight Feed</p>
        <div className="overflow-y-auto space-y-2 pr-2" style={{ maxHeight: 'calc(100% - 24px)' }}>
          {isLoading ? (
            <p className="text-gray-500 text-sm">Loading insights...</p>
          ) : insights.length > 0 ? (
            insights.map((insight) => (
              <div key={insight.id} className="bg-[#1a1816] border border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="inline-block px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs font-semibold">
                      {insight.topic}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {Math.round(insight.confidence)}% confident
                  </span>
                </div>
                <p className="text-sm text-gray-200 leading-relaxed line-clamp-2">{insight.content}</p>
                <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                  <div className="w-full bg-[#0d0b09] rounded-full h-1.5 mr-2">
                    <div
                      className="h-full bg-sage rounded-full"
                      style={{ width: `${insight.confidence}%` }}
                    />
                  </div>
                  <button
                    onClick={() => handleVoteInsight(insight.id, insight.votes)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                      insight.userVoted
                        ? 'bg-[#D4785C] text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    👍 {insight.votes}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm italic">No insights yet</p>
          )}
        </div>
      </div>

      {/* Refresh Button */}
      <button
        onClick={loadNetworkData}
        disabled={isLoading}
        className="w-full bg-[#C9A87C] hover:bg-[#b89668] text-[#0d0b09] font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  );
}
