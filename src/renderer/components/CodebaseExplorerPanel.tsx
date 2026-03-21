'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FolderOpen,
  File,
  Search,
  Code,
  ChevronRight,
  ChevronDown,
  X,
  Folder,
  Hash,
  FileCode,
  Plus,
  MoreVertical,
  Split2,
  Copy,
  MessageSquare,
  Save,
  RotateCcw,
  Zap,
  Command,
  ChevronUp,
  ChevronLeft,
} from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  ext?: string;
  size?: number;
  lines?: number;
  symbols?: SymbolInfo[];
  snippet?: string;
  children?: FileNode[];
  gitStatus?: 'modified' | 'new' | 'deleted';
}

interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'type';
  line?: number;
}

interface SearchResult {
  path: string;
  ext: string;
  size: number;
  lines: number;
  symbols: string[];
  snippet: string;
}

interface SymbolResult {
  path: string;
  symbol: string;
}

interface Stats {
  fileCount: number;
  totalLines: number;
  totalSize: number;
  byExtension: Record<string, number>;
}

interface OpenTab {
  id: string;
  path: string;
  name: string;
  ext?: string;
  modified: boolean;
  content?: string;
}

const getExtensionColor = (ext: string): string => {
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'text-terra-300';
    case 'js':
    case 'jsx':
      return 'text-gold-300';
    case 'py':
      return 'text-sage-300';
    case 'go':
      return 'text-terra-400';
    case 'java':
    case 'kt':
      return 'text-blush-300';
    case 'cpp':
    case 'c':
    case 'h':
      return 'text-gold-400';
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return 'text-gold-400';
    case 'md':
      return 'text-sage-300';
    default:
      return 'text-white/40';
  }
};

const getGitStatusColor = (status?: string): string => {
  switch (status) {
    case 'modified':
      return 'text-gold-400';
    case 'new':
      return 'text-sage-400';
    case 'deleted':
      return 'text-blush-400';
    default:
      return '';
  }
};

const getFileIcon = (ext?: string) => {
  if (!ext) return <File size={16} className={getExtensionColor(undefined)} />;
  if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml') {
    return <FileCode size={16} className={getExtensionColor(ext)} />;
  }
  return <File size={16} className={getExtensionColor(ext)} />;
};

const getSymbolIcon = (kind: string) => {
  switch (kind) {
    case 'function':
      return '()';
    case 'class':
      return '◆';
    case 'type':
      return 'T';
    case 'variable':
      return 'x';
    default:
      return '•';
  }
};

const getSymbolColor = (kind: string): string => {
  switch (kind) {
    case 'function':
      return 'text-terra-300';
    case 'class':
      return 'text-gold-400';
    case 'type':
      return 'text-sage-400';
    default:
      return 'text-white/40';
  }
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const buildFileTree = (
  files: Array<{ path: string; ext: string; size: number; lines: number; symbols?: string[]; snippet?: string }>
): FileNode => {
  const root: FileNode = { name: 'root', path: '', type: 'folder', children: [] };
  const gitStatuses = ['modified', 'new', 'deleted'] as const;

  files.forEach((file) => {
    const parts = file.path.split('/');
    let current = root;

    parts.forEach((part, idx) => {
      const isFile = idx === parts.length - 1;
      let child = current.children?.find((c) => c.name === part);

      if (!child) {
        const fullPath = parts.slice(0, idx + 1).join('/');
        const gitStatus = isFile ? gitStatuses[Math.floor(Math.random() * gitStatuses.length)] : undefined;
        
        child = isFile
          ? {
              name: part,
              path: fullPath,
              type: 'file',
              ext: file.ext,
              size: file.size,
              lines: file.lines,
              symbols: (file.symbols || []).map((s, i) => ({
                name: s,
                kind: (['function', 'class', 'type'] as const)[i % 3],
                line: i + 1,
              })),
              snippet: file.snippet,
              gitStatus,
            }
          : {
              name: part,
              path: fullPath,
              type: 'folder',
              children: [],
            };
        current.children!.push(child);
      }

      current = child;
    });
  });

  return root;
};

interface TreeItemProps {
  node: FileNode;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelectFile: (node: FileNode) => void;
  selectedPath?: string;
  searchQuery: string;
  onContextMenu?: (node: FileNode, e: React.MouseEvent) => void;
}

const TreeItem: React.FC<TreeItemProps> = ({
  node,
  expanded,
  onToggle,
  onSelectFile,
  selectedPath,
  searchQuery,
  onContextMenu,
}) => {
  const isExpanded = expanded.has(node.path);

  if (node.type === 'file') {
    const isSelected = selectedPath === node.path;
    return (
      <div
        onClick={() => onSelectFile(node)}
        onContextMenu={(e) => onContextMenu?.(node, e)}
        className={`
          flex items-center gap-2 px-3 py-2 cursor-pointer text-sm group
          ${isSelected ? 'bg-terra-300/10 border-l-2 border-terra-400' : 'hover:bg-white/[0.03]'}
        `}
      >
        <div className="relative">
          {getFileIcon(node.ext)}
          {node.gitStatus && (
            <div className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${getGitStatusColor(node.gitStatus)}`} />
          )}
        </div>
        <span className="flex-1 truncate text-white/70">{node.name}</span>
        {node.size !== undefined && <span className="text-xs text-white/40 opacity-0 group-hover:opacity-100">{formatSize(node.size)}</span>}
      </div>
    );
  }

  const fileCount = node.children?.filter((c) => c.type === 'file').length || 0;

  return (
    <div>
      <div
        onClick={() => onToggle(node.path)}
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.03] group"
      >
        {isExpanded ? (
          <ChevronDown size={16} className="text-white/40" />
        ) : (
          <ChevronRight size={16} className="text-white/40" />
        )}
        <Folder size={16} className="text-gold-400" />
        <span className="text-sm font-medium text-white/80 flex-1">{node.name}</span>
        {fileCount > 0 && <span className="text-xs text-white/30 opacity-0 group-hover:opacity-100">{fileCount}</span>}
      </div>
      {isExpanded &&
        node.children?.map((child) => (
          <div key={child.path} className="ml-2 border-l border-white/[0.06]">
            <TreeItem
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              onSelectFile={onSelectFile}
              selectedPath={selectedPath}
              searchQuery={searchQuery}
              onContextMenu={onContextMenu}
            />
          </div>
        ))}
    </div>
  );
};

interface CodebaseExplorerPanelProps {
  onClose?: () => void;
}

const CodebaseExplorerPanel: React.FC<CodebaseExplorerPanelProps> = ({ onClose }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<Array<{ path: string; ext: string; size: number; lines: number; symbols?: string[]; snippet?: string }>>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [openPath, setOpenPath] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'lines'>('name');
  const [isSymbolSearch, setIsSymbolSearch] = useState(false);
  const [loading, setLoading] = useState(false);

  // IDE features
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [showSymbolPanel, setShowSymbolPanel] = useState(true);
  const [showSplitPane, setShowSplitPane] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);
  const [commandMode, setCommandMode] = useState(false);
  const [goToSymbolMode, setGoToSymbolMode] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const activeTab = useMemo(() => openTabs.find((t) => t.id === activeTabId) || null, [openTabs, activeTabId]);
  const fileTree = useMemo(() => buildFileTree(sortedFiles), [sortedFiles]);

  const sortedFiles = useMemo(() => {
    const filesToSort = searchResults.length > 0 ? searchResults : files;
    const sorted = [...filesToSort];

    switch (sortBy) {
      case 'size':
        sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
        break;
      case 'lines':
        sorted.sort((a, b) => (b.lines || 0) - (a.lines || 0));
        break;
      case 'name':
      default:
        sorted.sort((a, b) => a.path.localeCompare(b.path));
    }

    return sorted;
  }, [files, searchResults, sortBy]);

  useEffect(() => {
    const checkIndexer = async () => {
      try {
        const open = await window.nyra.indexer.isOpen();
        setIsOpen(open);
        if (open) {
          await loadInitialData();
        }
      } catch (err) {
        console.error('Failed to check indexer status:', err);
      }
    };

    checkIndexer();

    const unsubIndexed = window.nyra.indexer.onIndexed(() => {
      loadInitialData();
    });

    const unsubReady = window.nyra.indexer.onReady(() => {
      loadInitialData();
    });

    return () => {
      unsubIndexed();
      unsubReady();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p' && !goToSymbolMode) {
        e.preventDefault();
        setCommandMode(!commandMode);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'o') {
        e.preventDefault();
        setGoToSymbolMode(!goToSymbolMode);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandMode, goToSymbolMode]);

  const loadInitialData = async () => {
    try {
      const [fileList, statsData] = await Promise.all([
        window.nyra.indexer.list(),
        window.nyra.indexer.stats(),
      ]);
      setFiles(fileList);
      setStats(statsData);
      setExpandedFolders(new Set());
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const handleOpenCodebase = async () => {
    if (!openPath.trim()) return;

    try {
      setLoading(true);
      await window.nyra.indexer.open(openPath);
      setIsOpen(true);
      setOpenPath('');
      await loadInitialData();
    } catch (err) {
      console.error('Failed to open codebase:', err);
      alert(`Failed to open codebase: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseCodebase = async () => {
    try {
      await window.nyra.indexer.close();
      setIsOpen(false);
      setFiles([]);
      setSearchQuery('');
      setSearchResults([]);
      setStats(null);
      setOpenTabs([]);
      setActiveTabId(null);
    } catch (err) {
      console.error('Failed to close codebase:', err);
    }
  };

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);

      if (!query.trim()) {
        setSearchResults([]);
        return;
      }

      try {
        if (isSymbolSearch) {
          // Symbol search is handled separately in symbol panel
          return;
        } else {
          const results = await window.nyra.indexer.search(query, { limit: 50 });
          setSearchResults(results);
        }
      } catch (err) {
        console.error('Search failed:', err);
      }
    },
    [isSymbolSearch]
  );

  const openFileInTab = async (node: FileNode) => {
    try {
      const fileData = await window.nyra.indexer.getFile(node.path);
      const tabId = `tab-${Date.now()}`;

      setOpenTabs((prev) => [
        ...prev,
        {
          id: tabId,
          path: node.path,
          name: node.name,
          ext: node.ext,
          modified: false,
          content: fileData?.snippet || '',
        },
      ]);

      setActiveTabId(tabId);
      setSelectedFileContent(fileData?.snippet || '');
      setBreadcrumb(node.path.split('/'));
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  const closeTab = (tabId: string) => {
    setOpenTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabId === tabId) {
      const remaining = openTabs.filter((t) => t.id !== tabId);
      setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  };

  const handleToggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const handleSelectFile = (node: FileNode) => {
    if (node.type === 'file') {
      openFileInTab(node);
    }
  };

  const handleContextMenu = (node: FileNode, e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const contextMenuOptions = [
    { label: 'Open in New Tab', action: 'open' },
    { label: 'Copy Path', action: 'copy' },
    { label: 'Send to Chat', action: 'chat' },
  ];

  const handleContextMenuAction = (action: string) => {
    if (!contextMenu) return;

    switch (action) {
      case 'open':
        openFileInTab(contextMenu.node);
        break;
      case 'copy':
        navigator.clipboard.writeText(contextMenu.node.path);
        break;
      case 'chat':
        // Simulated: in real app, would send to chat panel
        console.log('Sending to chat:', contextMenu.node.path);
        break;
    }

    setContextMenu(null);
  };

  const handleEditorChange = (content: string) => {
    setSelectedFileContent(content);
    if (activeTab) {
      setOpenTabs((prev) =>
        prev.map((t) => (t.id === activeTab.id ? { ...t, modified: true, content } : t))
      );
    }
  };

  const handleSave = () => {
    // Simulated save
    if (activeTab) {
      setOpenTabs((prev) =>
        prev.map((t) => (t.id === activeTab.id ? { ...t, modified: false } : t))
      );
    }
  };

  const handleRevert = () => {
    if (activeTab) {
      setSelectedFileContent(activeTab.content || '');
      setOpenTabs((prev) =>
        prev.map((t) => (t.id === activeTab.id ? { ...t, modified: false } : t))
      );
    }
  };

  const topExtensions = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.byExtension)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([ext, count]) => `${ext}: ${count}`);
  }, [stats]);

  if (!isOpen) {
    return (
      <div className="flex flex-col h-full bg-nyra-bg">
        <div className="flex items-center justify-between p-4 border-b border-nyra-border">
          <div className="flex items-center gap-2">
            <Code size={20} className="text-gold-400" />
            <h2 className="text-lg font-semibold text-white">Codebase Explorer</h2>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition">
              <X size={18} className="text-white/60" />
            </button>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <FolderOpen size={48} className="mx-auto mb-4 text-gold-400/40" />
            <h3 className="text-xl font-semibold text-white/80 mb-4">Open a codebase to explore</h3>
            <p className="text-white/50 mb-6">Point to a directory to start indexing files and exploring symbols.</p>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="/path/to/codebase"
                value={openPath}
                onChange={(e) => setOpenPath(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleOpenCodebase();
                  }
                }}
                className="
                  w-full px-4 py-2 bg-nyra-surface border border-nyra-border
                  rounded text-white placeholder-white/30
                  focus:outline-none focus:border-sage-400
                "
              />
              <button
                onClick={handleOpenCodebase}
                disabled={loading}
                className="
                  w-full px-4 py-2 bg-sage-400/20 border border-sage-400 text-sage-400
                  rounded font-medium hover:bg-sage-400/30 disabled:opacity-50
                  transition
                "
              >
                {loading ? 'Opening...' : 'Open Codebase'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-nyra-bg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-nyra-border bg-nyra-surface">
        <div className="flex items-center gap-3">
          <Code size={20} className="text-gold-400" />
          <h2 className="text-lg font-semibold text-white">Codebase Explorer</h2>
          {stats && <span className="text-xs text-white/40 ml-4">{stats.fileCount} files • {stats.totalLines.toLocaleString()} lines</span>}
        </div>
        <button onClick={handleCloseCodebase} className="p-1 hover:bg-white/10 rounded transition" title="Close codebase">
          <X size={18} className="text-white/60" />
        </button>
      </div>

      {/* Command Bar */}
      {commandMode && (
        <div className="px-4 py-2 border-b border-nyra-border bg-nyra-surface">
          <div className="flex items-center gap-2">
            <Command size={16} className="text-gold-400" />
            <input
              type="text"
              placeholder="Go to file..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="
                flex-1 bg-transparent text-white placeholder-white/30
                focus:outline-none text-sm
              "
              autoFocus
              onBlur={() => setCommandMode(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setCommandMode(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      {openTabs.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-nyra-border bg-nyra-bg overflow-x-auto">
          {openTabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-t border-b-2 cursor-pointer group text-sm
                ${
                  activeTabId === tab.id
                    ? 'bg-terra-400/10 border-b-terra-400 text-white'
                    : 'bg-transparent border-b-transparent text-white/60 hover:bg-white/[0.03]'
                }
              `}
            >
              {getFileIcon(tab.ext)}
              <span className="truncate max-w-xs">{tab.name}</span>
              {tab.modified && <div className="w-2 h-2 rounded-full bg-gold-400" />}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="p-0 hover:bg-white/20 rounded opacity-0 group-hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setShowSplitPane(!showSplitPane)}
            className="ml-auto p-2 hover:bg-white/[0.03] rounded text-white/60 transition"
            title="Split editor"
          >
            <Split2 size={16} />
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: File tree */}
        <div className="w-64 border-r border-nyra-border overflow-y-auto bg-nyra-surface flex flex-col">
          {/* Search bar */}
          <div className="p-3 border-b border-nyra-border space-y-2 flex-shrink-0">
            <div className="flex items-center gap-2 bg-nyra-bg rounded px-2">
              <Search size={14} className="text-white/40" />
              <input
                type="text"
                placeholder={commandMode ? '' : 'Search...'}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="flex-1 bg-transparent text-xs text-white placeholder-white/30 focus:outline-none py-1"
              />
            </div>
            <div className="flex gap-1">
              {['name', 'size', 'lines'].map((option) => (
                <button
                  key={option}
                  onClick={() => setSortBy(option as typeof sortBy)}
                  className={`
                    px-2 py-1 rounded text-xs font-medium transition
                    ${
                      sortBy === option
                        ? 'bg-gold-400/20 border border-gold-400 text-gold-400'
                        : 'bg-white/[0.03] border border-nyra-border text-white/60 hover:bg-white/[0.06]'
                    }
                  `}
                >
                  {option === 'name' ? 'Name' : option === 'size' ? 'Size' : 'Lines'}
                </button>
              ))}
            </div>
          </div>

          {/* File tree */}
          <div className="flex-1 overflow-y-auto">
            {files.length > 0 ? (
              <TreeItem
                node={fileTree}
                expanded={expandedFolders}
                onToggle={handleToggleFolder}
                onSelectFile={handleSelectFile}
                selectedPath={activeTab?.path}
                searchQuery={searchQuery}
                onContextMenu={handleContextMenu}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-white/40 text-sm">No files</div>
            )}
          </div>
        </div>

        {/* Center panel: Editor */}
        <div className="flex-1 flex flex-col bg-nyra-bg overflow-hidden">
          {activeTab ? (
            <>
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 px-4 py-2 border-b border-nyra-border bg-nyra-surface text-xs text-white/60 overflow-x-auto flex-shrink-0">
                {breadcrumb.map((part, idx) => (
                  <div key={idx} className="flex items-center gap-1 whitespace-nowrap">
                    {idx > 0 && <ChevronRight size={12} />}
                    <span className="hover:text-white/80 cursor-pointer">{part}</span>
                  </div>
                ))}
              </div>

              {/* Editor toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-nyra-border bg-nyra-surface flex-shrink-0">
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <span>{activeTab.lines || 0} lines</span>
                  <span>•</span>
                  <span>{activeTab.ext}</span>
                </div>
                <div className="flex items-center gap-2">
                  {activeTab.modified && (
                    <span className="text-xs text-gold-400 font-medium">Modified</span>
                  )}
                  <button
                    onClick={handleSave}
                    className="p-1 hover:bg-white/[0.06] rounded text-white/60 transition"
                    title="Save (Ctrl+S)"
                  >
                    <Save size={16} />
                  </button>
                  <button
                    onClick={handleRevert}
                    className="p-1 hover:bg-white/[0.06] rounded text-white/60 transition"
                    title="Revert changes"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>

              {/* Code editor */}
              <div className="flex-1 overflow-hidden flex">
                {/* Line numbers gutter */}
                <div className="w-12 bg-nyra-surface border-r border-nyra-border text-right text-xs text-white/20 font-mono select-none overflow-hidden flex-shrink-0">
                  {selectedFileContent.split('\n').map((_, idx) => (
                    <div key={idx} className="h-6 pr-3 py-1 leading-6">
                      {idx + 1}
                    </div>
                  ))}
                </div>

                {/* Editor content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  <textarea
                    ref={editorRef}
                    value={selectedFileContent}
                    onChange={(e) => handleEditorChange(e.target.value)}
                    className="
                      flex-1 bg-nyra-bg text-white font-mono text-sm p-4
                      focus:outline-none resize-none
                    "
                    spellCheck="false"
                  />
                </div>

                {/* Minimap */}
                <div className="w-10 bg-nyra-surface border-l border-nyra-border flex-shrink-0 overflow-hidden">
                  <div className="space-y-px p-1">
                    {selectedFileContent.split('\n').map((line, idx) => (
                      <div
                        key={idx}
                        className={`h-0.5 ${line.length > 0 ? 'bg-terra-400/30' : 'bg-transparent'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-white/40">
              <div className="text-center">
                <Zap size={48} className="mx-auto mb-4 opacity-20" />
                <p>Select a file to edit</p>
              </div>
            </div>
          )}
        </div>

        {/* Right panel: Symbol outline */}
        {showSymbolPanel && activeTab && (
          <div className="w-48 border-l border-nyra-border overflow-y-auto bg-nyra-surface flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-nyra-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white/80">Symbols</span>
                <button
                  onClick={() => setShowSymbolPanel(false)}
                  className="p-0.5 hover:bg-white/[0.06] rounded"
                >
                  <ChevronLeft size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto text-xs">
              {activeTab && (
                <div className="space-y-1 p-2">
                  {/* Mock symbols from file */}
                  {['function', 'class', 'type'].map((kind, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className={`px-2 py-1 ${getSymbolColor(kind)} font-medium`}>
                        {getSymbolIcon(kind)} {kind}
                      </div>
                      {[1, 2].map((i) => (
                        <div
                          key={`${kind}-${i}`}
                          className="px-4 py-1 text-white/60 hover:text-white/80 hover:bg-white/[0.05] rounded cursor-pointer transition"
                        >
                          {kind}_{i}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-nyra-surface border border-nyra-border rounded shadow-lg text-xs z-50"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onMouseLeave={() => setContextMenu(null)}
        >
          {contextMenuOptions.map((option) => (
            <button
              key={option.action}
              onClick={() => handleContextMenuAction(option.action)}
              className="w-full text-left px-3 py-2 text-white/70 hover:bg-terra-400/20 hover:text-terra-400 transition"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* Stats footer */}
      {stats && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-nyra-border bg-nyra-surface text-xs text-white/50">
          <div className="flex justify-between items-center">
            <div className="flex gap-4">
              <span>Files: {stats.fileCount}</span>
              <span>Lines: {stats.totalLines.toLocaleString()}</span>
              <span>Size: {formatSize(stats.totalSize)}</span>
            </div>
            {topExtensions.length > 0 && (
              <div className="flex gap-4">
                <span className="text-white/40">Top:</span>
                <span>{topExtensions.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CodebaseExplorerPanel;
