import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Trash2, Upload, Search, FileText, Loader2, X, Check, FolderPlus, Database, } from 'lucide-react';
// ── Stack Card ────────────────────────────────────────────────────────────────
const StackCard = ({ stack, selected, onSelect, onDelete }) => (<button onClick={onSelect} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition text-left ${selected ? 'bg-terra-300/10 border border-terra-300/30' : 'border border-white/[0.06] hover:bg-white/[0.04]'}`}>
    <BookOpen size={14} className={selected ? 'text-terra-300' : 'text-white/40'}/>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-white/80 truncate">{stack.name}</p>
      <p className="text-[9px] text-white/30">{stack.documentCount} docs · {stack.chunkCount} chunks · ~{(stack.totalTokens / 1000).toFixed(1)}k tokens</p>
    </div>
    <button onClick={e => { e.stopPropagation(); onDelete(); }} className="p-0.5 hover:bg-red-500/20 rounded opacity-0 group-hover:opacity-100" title="Delete stack">
      <Trash2 size={10} className="text-red-400"/>
    </button>
  </button>);
// ── Document Row ──────────────────────────────────────────────────────────────
const DocRow = ({ doc, onRemove }) => (<div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.03]">
    <FileText size={12} className="text-white/30"/>
    <span className="text-[10px] text-white/60 flex-1 truncate">{doc.fileName}</span>
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">{doc.fileType}</span>
    <span className="text-[9px] text-white/25">{doc.chunkCount} chunks</span>
    <button onClick={onRemove} className="p-0.5 hover:bg-red-500/20 rounded" title="Remove">
      <Trash2 size={10} className="text-red-400/60"/>
    </button>
  </div>);
// ── Search Result ─────────────────────────────────────────────────────────────
const SearchResult = ({ result, index }) => (<div className="border border-white/[0.06] rounded-lg p-2 space-y-1">
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-white/25">#{index + 1}</span>
      <span className="text-[10px] text-white/60 flex-1 truncate">{result.documentName}</span>
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">
        {(result.relevanceScore * 100).toFixed(0)}%
      </span>
    </div>
    <pre className="text-[9px] text-white/50 bg-white/[0.03] rounded p-2 max-h-32 overflow-auto font-mono leading-relaxed whitespace-pre-wrap">
      {result.content.slice(0, 800)}
      {result.content.length > 800 && '\n... (truncated)'}
    </pre>
  </div>);
// ── Create Stack Form ─────────────────────────────────────────────────────────
const CreateStackForm = ({ onCreate, onCancel }) => {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const inputCls = 'w-full bg-white/[0.06] border border-white/[0.08] rounded px-2 py-1 text-[10px] text-white/70 outline-none';
    return (<div className="border border-white/[0.08] rounded-lg p-3 bg-white/[0.02] space-y-2">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Stack name..." className={inputCls} autoFocus/>
      <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)..." className={inputCls}/>
      <div className="flex gap-1.5">
        <button onClick={() => name.trim() && onCreate(name.trim(), desc.trim() || undefined)} className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 text-[9px] hover:bg-emerald-500/20">
          <Check size={10}/> Create
        </button>
        <button onClick={onCancel} className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.06] text-white/50 text-[9px] hover:bg-white/[0.1]">
          <X size={10}/> Cancel
        </button>
      </div>
    </div>);
};
// ── Ingest Form ───────────────────────────────────────────────────────────────
const IngestForm = ({ stackId, onDone }) => {
    const [mode, setMode] = useState('text');
    const [content, setContent] = useState('');
    const [fileName, setFileName] = useState('');
    const [filePath, setFilePath] = useState('');
    const [ingesting, setIngesting] = useState(false);
    const handleIngest = async () => {
        setIngesting(true);
        try {
            if (mode === 'text' && content.trim()) {
                await window.nyra.rag.ingest(stackId, { content, fileName: fileName || 'pasted-content.md', fileType: 'text' });
            }
            else if (mode === 'file' && filePath.trim()) {
                await window.nyra.rag.ingest(stackId, { filePath });
            }
            onDone();
        }
        catch (err) {
            console.error('Ingest failed:', err);
        }
        setIngesting(false);
    };
    const inputCls = 'w-full bg-white/[0.06] border border-white/[0.08] rounded px-2 py-1 text-[10px] text-white/70 outline-none';
    return (<div className="border border-white/[0.08] rounded-lg p-3 bg-white/[0.02] space-y-2">
      <div className="flex gap-2">
        <button onClick={() => setMode('text')} className={`px-2 py-1 rounded text-[9px] ${mode === 'text' ? 'bg-terra-300/10 text-terra-300' : 'text-white/40'}`}>
          Paste Text
        </button>
        <button onClick={() => setMode('file')} className={`px-2 py-1 rounded text-[9px] ${mode === 'file' ? 'bg-terra-300/10 text-terra-300' : 'text-white/40'}`}>
          File Path
        </button>
      </div>

      {mode === 'text' && (<>
          <input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="Document name..." className={inputCls}/>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Paste document content..." className={`${inputCls} resize-none h-24 font-mono`}/>
        </>)}
      {mode === 'file' && (<input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="/path/to/file..." className={`${inputCls} font-mono`}/>)}

      <button onClick={handleIngest} disabled={ingesting} className="flex items-center gap-1 px-2 py-1 rounded bg-terra-300/10 text-terra-300 text-[10px] hover:bg-terra-300/20 disabled:opacity-40">
        {ingesting ? <Loader2 size={10} className="animate-spin"/> : <Upload size={10}/>}
        {ingesting ? 'Ingesting...' : 'Ingest'}
      </button>
    </div>);
};
// ── Main KnowledgePanel ───────────────────────────────────────────────────────
const KnowledgePanel = () => {
    const [stacks, setStacks] = useState([]);
    const [selectedStackId, setSelectedStackId] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [showIngest, setShowIngest] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [_loading, setLoading] = useState(false);
    // Default project ID — for now use 'default'; in production, pull from active project context
    const projectId = 'default';
    const refreshStacks = useCallback(async () => {
        setLoading(true);
        const s = await window.nyra.rag.listStacks(projectId);
        setStacks(s);
        setLoading(false);
    }, [projectId]);
    const refreshDocs = useCallback(async () => {
        if (!selectedStackId) {
            setDocuments([]);
            return;
        }
        const d = await window.nyra.rag.listDocuments(selectedStackId);
        setDocuments(d);
    }, [selectedStackId]);
    useEffect(() => { refreshStacks(); }, [refreshStacks]);
    useEffect(() => { refreshDocs(); }, [refreshDocs]);
    useEffect(() => {
        const unsubs = [
            window.nyra.rag.onDocumentIngested(() => { refreshStacks(); refreshDocs(); }),
            window.nyra.rag.onStackCreated(() => refreshStacks()),
        ];
        return () => unsubs.forEach((u) => u());
    }, [refreshStacks, refreshDocs]);
    const handleCreateStack = async (name, desc) => {
        const stack = await window.nyra.rag.createStack(name, projectId, desc);
        setShowCreate(false);
        setSelectedStackId(stack.id);
        refreshStacks();
    };
    const handleDeleteStack = async (id) => {
        await window.nyra.rag.deleteStack(id);
        if (selectedStackId === id)
            setSelectedStackId(null);
        refreshStacks();
    };
    const handleRemoveDoc = async (docId) => {
        await window.nyra.rag.removeDocument(docId);
        refreshDocs();
        refreshStacks();
    };
    const handleSearch = async () => {
        if (!selectedStackId || !searchQuery.trim())
            return;
        setSearching(true);
        const results = await window.nyra.rag.query(selectedStackId, searchQuery.trim(), { limit: 6 });
        setSearchResults(results);
        setSearching(false);
    };
    const selectedStack = stacks.find(s => s.id === selectedStackId);
    return (<div className="flex flex-col h-full">
      {/* Stack List */}
      <div className="px-4 py-3 border-b border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold text-white/60">Knowledge Stacks</h3>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 px-2 py-1 rounded bg-terra-300/10 text-terra-300 text-[10px] hover:bg-terra-300/20">
            <FolderPlus size={10}/> New Stack
          </button>
        </div>

        {showCreate && <CreateStackForm onCreate={handleCreateStack} onCancel={() => setShowCreate(false)}/>}

        {stacks.length === 0 && !showCreate && (<p className="text-[9px] text-white/25 text-center py-2">No stacks yet. Create one to start building a knowledge base.</p>)}

        <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
          {stacks.map(stack => (<StackCard key={stack.id} stack={stack} selected={selectedStackId === stack.id} onSelect={() => setSelectedStackId(stack.id)} onDelete={() => handleDeleteStack(stack.id)}/>))}
        </div>
      </div>

      {/* Stack Detail */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {!selectedStack && (<div className="flex flex-col items-center justify-center py-12 text-white/30 gap-2">
            <Database size={28} className="text-white/15"/>
            <p className="text-[11px]">RAG Knowledge Base</p>
            <p className="text-[9px] text-white/20">Select or create a stack to manage documents and search</p>
          </div>)}

        {selectedStack && (<>
            {/* Search */}
            <div className="flex gap-1.5">
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Search this stack..." className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded px-2 py-1.5 text-[10px] text-white/70 outline-none"/>
              <button onClick={handleSearch} disabled={searching} className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-300 text-[10px] hover:bg-blue-500/20 disabled:opacity-40">
                {searching ? <Loader2 size={10} className="animate-spin"/> : <Search size={10}/>}
                Query
              </button>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (<div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40">{searchResults.length} results</span>
                  <button onClick={() => setSearchResults([])} className="text-[9px] text-white/30 hover:text-white/50">Clear</button>
                </div>
                {searchResults.map((r, i) => <SearchResult key={r.id} result={r} index={i}/>)}
              </div>)}

            {/* Documents */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-semibold text-white/50">Documents ({documents.length})</h4>
                <button onClick={() => setShowIngest(!showIngest)} className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 text-[9px] hover:bg-emerald-500/20">
                  <Upload size={10}/> Ingest
                </button>
              </div>

              {showIngest && <IngestForm stackId={selectedStackId} onDone={() => { setShowIngest(false); refreshDocs(); refreshStacks(); }}/>}

              {documents.length === 0 && !showIngest && (<p className="text-[9px] text-white/25 text-center py-4">No documents. Ingest files to build the knowledge base.</p>)}

              {documents.map(doc => (<DocRow key={doc.id} doc={doc} onRemove={() => handleRemoveDoc(doc.id)}/>))}
            </div>
          </>)}
      </div>
    </div>);
};
export default KnowledgePanel;
