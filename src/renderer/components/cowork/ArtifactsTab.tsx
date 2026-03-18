import React, { useState, useMemo, useEffect } from 'react';
import {
  FileCode,
  FileText,
  Table,
  Image,
  Database,
  ExternalLink,
  RotateCcw,
  Filter,
  ArrowUpDown,
  Loader,
} from 'lucide-react';

type ArtifactType = 'code' | 'document' | 'spreadsheet' | 'image' | 'data';
type SortBy = 'date' | 'name' | 'size';
type SortOrder = 'asc' | 'desc';

interface Artifact {
  id: string;
  filename: string;
  type: ArtifactType;
  agent: string;
  task: string;
  timestamp: Date;
  size: number;
  path: string;
}

const typeIcons: Record<ArtifactType, React.ReactNode> = {
  code: <FileCode size={20} className="text-terra-400" />,
  document: <FileText size={20} className="text-white/40" />,
  spreadsheet: <Table size={20} className="text-sage-400" />,
  image: <Image size={20} className="text-gold-400" />,
  data: <Database size={20} className="text-gold-400" />,
};

const typeLabels: Record<ArtifactType, string> = {
  code: 'Code',
  document: 'Document',
  spreadsheet: 'Spreadsheet',
  image: 'Image',
  data: 'Data',
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
};

export const ArtifactsTab: React.FC = () => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<ArtifactType | ''>('');
  const [filterAgent, setFilterAgent] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Fetch artifacts from all tasks on mount
  useEffect(() => {
    const fetchArtifacts = async () => {
      try {
        setLoading(true);
        // @ts-ignore - window.nyra is injected by Electron preload
        const tasks = await window.nyra?.tasks?.list?.() || [];

        const allArtifacts: Artifact[] = [];
        for (const task of tasks) {
          try {
            // @ts-ignore
            const taskArtifacts = await window.nyra?.tasks?.getArtifacts?.(task.id) || [];
            allArtifacts.push(
              ...taskArtifacts.map((artifact: any) => ({
                id: artifact.id,
                filename: artifact.name || artifact.filename || 'Unnamed Artifact',
                type: artifact.type || 'data',
                agent: task.assignedAgent || 'Unknown',
                task: task.title || 'Unknown Task',
                timestamp: new Date(artifact.createdAt || artifact.timestamp || Date.now()),
                size: artifact.size || 0,
                path: artifact.path || '',
              }))
            );
          } catch (error) {
            console.error(`Failed to fetch artifacts for task ${task.id}:`, error);
          }
        }

        setArtifacts(allArtifacts);
      } catch (error) {
        console.error('Failed to fetch artifacts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArtifacts();
  }, []);

  const uniqueAgents = useMemo(
    () => Array.from(new Set(artifacts.map((artifact) => artifact.agent))),
    [artifacts]
  );

  const uniqueTypes = useMemo(
    () => Array.from(new Set(artifacts.map((artifact) => artifact.type))),
    [artifacts]
  );

  const filteredAndSorted = useMemo(() => {
    let filtered = artifacts.filter((artifact) => {
      if (filterType && artifact.type !== filterType) return false;
      if (filterAgent && artifact.agent !== filterAgent) return false;
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let compareValue = 0;
      switch (sortBy) {
        case 'date':
          compareValue = a.timestamp.getTime() - b.timestamp.getTime();
          break;
        case 'name':
          compareValue = a.filename.localeCompare(b.filename);
          break;
        case 'size':
          compareValue = a.size - b.size;
          break;
      }
      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return filtered;
  }, [artifacts, filterType, filterAgent, sortBy, sortOrder]);

  const toggleSort = (newSortBy: SortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-white/[0.02] p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database size={20} className="text-white/40" />
            <h2 className="text-sm font-semibold text-white/80">Artifacts</h2>
            {loading ? (
              <Loader size={14} className="text-terra-300 animate-spin" />
            ) : (
              <span className="text-xs text-white/30">({filteredAndSorted.length} items)</span>
            )}
          </div>
        </div>

        {/* Filter and Sort Bar */}
        <div className="flex gap-3 flex-wrap items-center">
          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-white/30" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as ArtifactType | '')}
              className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg text-xs text-white/80 focus:outline-none focus:border-white/15 cursor-pointer"
            >
              <option value="">All Types</option>
              {uniqueTypes.map((type) => (
                <option key={type} value={type}>
                  {typeLabels[type]}
                </option>
              ))}
            </select>
          </div>

          {/* Agent Filter */}
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg text-xs text-white/80 focus:outline-none focus:border-white/15 cursor-pointer"
          >
            <option value="">All Agents</option>
            {uniqueAgents.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>

          <div className="flex-1" />

          {/* Sort Controls */}
          <div className="flex items-center gap-1 bg-white/[0.05] border border-white/[0.08] rounded-lg p-1">
            <button
              onClick={() => toggleSort('date')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                sortBy === 'date'
                  ? 'bg-white/10 text-white/80'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Date
              {sortBy === 'date' && (
                <ArrowUpDown size={12} className={sortOrder === 'asc' ? 'rotate-180' : ''} />
              )}
            </button>
            <button
              onClick={() => toggleSort('name')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                sortBy === 'name'
                  ? 'bg-white/10 text-white/80'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Name
              {sortBy === 'name' && (
                <ArrowUpDown size={12} className={sortOrder === 'asc' ? 'rotate-180' : ''} />
              )}
            </button>
            <button
              onClick={() => toggleSort('size')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                sortBy === 'size'
                  ? 'bg-white/10 text-white/80'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Size
              {sortBy === 'size' && (
                <ArrowUpDown size={12} className={sortOrder === 'asc' ? 'rotate-180' : ''} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader size={32} className="text-terra-300 animate-spin" />
              <p className="text-xs text-white/40">Loading artifacts...</p>
            </div>
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/30">
            <p className="text-xs">No artifacts match the current filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredAndSorted.map((artifact) => (
              <div
                key={artifact.id}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.12] transition-colors flex flex-col"
              >
                {/* Icon and Type */}
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 rounded-lg bg-white/[0.05] border border-white/[0.06]">
                    {typeIcons[artifact.type]}
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-white/40">
                    {typeLabels[artifact.type]}
                  </span>
                </div>

                {/* Filename */}
                <p className="text-xs font-semibold text-white/80 truncate mb-1 flex-1">
                  {artifact.filename}
                </p>

                {/* Agent and Task */}
                <div className="space-y-1 mb-3 text-xs">
                  <p className="text-white/40">
                    <span className="text-white/25">Agent:</span> {artifact.agent}
                  </p>
                  <p className="text-white/40 line-clamp-1">
                    <span className="text-white/25">Task:</span> {artifact.task}
                  </p>
                </div>

                {/* Timestamp and Size */}
                <div className="flex items-center justify-between text-xs text-white/30 mb-3 pb-3 border-t border-white/[0.06] pt-3">
                  <span>{artifact.timestamp.toLocaleDateString()}</span>
                  <span>{formatFileSize(artifact.size)}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button className="flex-1 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-white/60 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
                    <ExternalLink size={12} />
                    Open
                  </button>
                  <button className="flex-1 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-white/60 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
                    <RotateCcw size={12} />
                    Rollback
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtifactsTab;
