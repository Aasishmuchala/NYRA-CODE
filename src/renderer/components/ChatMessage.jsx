/**
 * ChatMessage — Claude-inspired clean message rendering
 *
 * Design philosophy:
 *  • NO bubbles — messages are clean text blocks, document-like reading flow
 *  • Thinking blocks: collapsible accordion with elapsed timer
 *  • Code blocks: syntax-highlighted with copy button + language labels + line numbers
 *  • Tool-use indicators: inline status chips
 *  • Rich markdown rendering
 *  • Streaming cursor integrated into text flow
 *  • Hover actions: copy, branch
 */
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Copy, Check, GitBranch, Code2, ChevronDown, ChevronUp, ChevronRight, Brain, Pencil, Search, Terminal, Loader2, FileCode, Play, Eye, } from 'lucide-react';
// ── Component ────────────────────────────────────────────────────────────────
export const ChatMessageBubble = ({ message, isStreaming, streamingPhase, onBranch }) => {
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(true);
    const isUser = message.role === 'user';
    const copy = useCallback(() => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [message.content]);
    const blocks = useMemo(() => parseContent(message.content), [message.content]);
    const codeBlockCount = useMemo(() => blocks.filter(b => b.type === 'code').length, [blocks]);
    const isLong = message.content.length > 2000;
    // ── User message ──────────────────────────────────────────────────────────
    if (isUser) {
        return (<div className="group relative py-4 px-6">
        <div className="max-w-[720px] mx-auto">
          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (<div className="flex flex-wrap gap-1.5 mb-2">
              {message.attachments.map((a, i) => (<div key={i} className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/50 border border-white/[0.06] flex items-center gap-1.5">
                  <span className="text-white/30">📎</span>
                  <span className="truncate max-w-[180px]">{a.name}</span>
                </div>))}
            </div>)}

          {/* User message text — clean, slightly brighter */}
          <div className="text-[15px] leading-[1.7] text-white/90 whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}/>

          {/* Hover actions */}
          <div className="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={copy} className="flex items-center gap-1 text-[11px] text-white/20 hover:text-white/50 transition-colors">
              {copied ? <Check size={11} className="text-sage-400"/> : <Copy size={11}/>}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>);
    }
    // ── Assistant message ─────────────────────────────────────────────────────
    return (<div className="group relative py-4 px-6 bg-white/[0.015]">
      <div className={`max-w-[720px] mx-auto ${isLong && !expanded ? 'max-h-[400px] overflow-hidden relative' : ''}`}>
        {/* Block-based rendering */}
        <div className="flex flex-col">
          {blocks.map((block, i) => (<BlockRenderer key={i} block={block} isStreaming={isStreaming && i === blocks.length - 1}/>))}

          {/* Streaming cursor */}
          {isStreaming && streamingPhase === 'generating' && (<span className="inline-block w-[2px] h-[1.15em] bg-terra-400/80 ml-1 animate-pulse align-middle rounded-full"/>)}
        </div>

        {/* Fade-out for collapsed long messages */}
        {isLong && !expanded && (<div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#0d0c0a] to-transparent pointer-events-none"/>)}
      </div>

      {/* Expand/collapse */}
      {isLong && !isStreaming && (<div className="max-w-[720px] mx-auto mt-2">
          <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-1 text-[11px] text-white/25 hover:text-white/50 transition-colors">
            {expanded ? <><ChevronUp size={11}/> Show less</> : <><ChevronDown size={11}/> Show more</>}
          </button>
        </div>)}

      {/* Action bar (hover) */}
      {!isStreaming && message.content && (<div className="max-w-[720px] mx-auto flex items-center gap-3 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={copy} className="flex items-center gap-1 text-[11px] text-white/20 hover:text-white/50 transition-colors">
            {copied ? <Check size={11} className="text-sage-400"/> : <Copy size={11}/>}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {codeBlockCount > 0 && (<span className="flex items-center gap-1 text-[11px] text-terra-300/40">
              <Code2 size={11}/> {codeBlockCount} block{codeBlockCount > 1 ? 's' : ''}
            </span>)}
          {onBranch && (<button onClick={onBranch} className="flex items-center gap-1 text-[11px] text-white/20 hover:text-gold-400 transition-colors">
              <GitBranch size={11}/> Branch
            </button>)}
        </div>)}
    </div>);
};
// ── Block Renderer ───────────────────────────────────────────────────────────
const BlockRenderer = ({ block, isStreaming }) => {
    switch (block.type) {
        case 'thinking': return <ThinkingBlockView block={block} isStreaming={isStreaming}/>;
        case 'code': return <CodeBlockView block={block}/>;
        case 'tool-use': return <ToolUseBlockView block={block}/>;
        case 'text': return <TextBlockView block={block} isStreaming={isStreaming}/>;
        default: return null;
    }
};
// ── Thinking Block ───────────────────────────────────────────────────────────
const ThinkingBlockView = ({ block, isStreaming }) => {
    const [open, setOpen] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const startRef = useRef(Date.now());
    useEffect(() => {
        if (!isStreaming)
            return;
        const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 100);
        return () => clearInterval(timer);
    }, [isStreaming]);
    const formatTime = (s) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
    return (<div className="my-2 rounded-xl border border-white/[0.05] bg-white/[0.015] overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors">
        {isStreaming ? (<Loader2 size={13} className="animate-spin text-gold-400 flex-shrink-0"/>) : (<ChevronRight size={13} className={`text-white/25 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}/>)}
        <Brain size={13} className="text-gold-400/70 flex-shrink-0"/>
        <span className="text-[13px] text-white/40 font-medium">
          {isStreaming ? 'Thinking' : 'Thought process'}
        </span>
        {isStreaming && (<span className="text-[11px] text-white/20 font-mono tabular-nums ml-1">{formatTime(elapsed)}</span>)}
        {!isStreaming && block.content.length > 0 && (<span className="text-[11px] text-white/15 ml-1">({Math.ceil(block.content.length / 4)} tokens)</span>)}
      </button>
      {open && (<div className="px-4 pb-3.5 border-t border-white/[0.04]">
          <div className="text-[13px] text-white/30 leading-[1.7] whitespace-pre-wrap mt-2.5 font-mono max-h-[320px] overflow-y-auto scrollbar-thin" dangerouslySetInnerHTML={{ __html: renderMarkdown(block.content) }}/>
        </div>)}
    </div>);
};
// ── Code Block ───────────────────────────────────────────────────────────────
const CodeBlockView = ({ block }) => {
    const [copied, setCopied] = useState(false);
    const lines = block.content.split('\n');
    const copyCode = useCallback(() => {
        navigator.clipboard.writeText(block.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [block.content]);
    return (<div className="my-2.5 rounded-xl border border-white/[0.06] overflow-hidden bg-[#0a0908]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.025] border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <FileCode size={12} className="text-white/20"/>
          {block.lang && (<span className="text-[11px] font-mono text-white/30">{block.lang}</span>)}
          {block.filename && (<span className="text-[11px] font-mono text-terra-300/50">{block.filename}</span>)}
        </div>
        <button onClick={copyCode} className="flex items-center gap-1.5 text-[11px] text-white/25 hover:text-white/60 transition-colors px-2 py-0.5 rounded-md hover:bg-white/[0.05]">
          {copied ? <><Check size={11} className="text-sage-400"/> Copied</> : <><Copy size={11}/> Copy</>}
        </button>
      </div>

      {/* Code body with line numbers */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] font-mono leading-[1.65]" cellPadding={0} cellSpacing={0}>
          <tbody>
            {lines.map((line, i) => (<tr key={i} className="hover:bg-white/[0.02]">
                <td className="select-none text-right pr-4 pl-4 py-0 text-white/[0.12] w-[1%] whitespace-nowrap align-top">
                  {i + 1}
                </td>
                <td className="pr-4 py-0 whitespace-pre text-white/75">
                  <span dangerouslySetInnerHTML={{ __html: highlightLine(line, block.lang) }}/>
                </td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>);
};
// ── Tool Use Block ───────────────────────────────────────────────────────────
const ToolUseBlockView = ({ block }) => {
    const icon = block.tool.includes('edit') || block.tool.includes('write')
        ? <Pencil size={12} className="text-gold-400/70"/>
        : block.tool.includes('search') || block.tool.includes('grep') || block.tool.includes('find')
            ? <Search size={12} className="text-gold-400/70"/>
            : block.tool.includes('bash') || block.tool.includes('run')
                ? <Terminal size={12} className="text-gold-400/70"/>
                : block.tool.includes('read') || block.tool.includes('view')
                    ? <Eye size={12} className="text-gold-400/70"/>
                    : <Play size={12} className="text-gold-400/70"/>;
    const isActive = block.status === 'running' || block.status === 'pending';
    return (<div className="flex items-center gap-2.5 my-1.5 py-2 px-3.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      {isActive ? (<Loader2 size={12} className="animate-spin text-gold-400"/>) : icon}
      <span className="text-[13px] text-white/40 font-medium">{block.tool}</span>
      {block.detail && (<span className="text-[12px] text-white/20 font-mono truncate max-w-[400px]">{block.detail}</span>)}
      {isActive && <span className="text-[11px] text-gold-400/50 animate-pulse ml-auto">Running…</span>}
    </div>);
};
// ── Text Block ───────────────────────────────────────────────────────────────
const TextBlockView = ({ block, isStreaming }) => {
    if (!block.content.trim())
        return null;
    return (<div className="py-1">
      <div className="text-[15px] whitespace-pre-wrap break-words leading-[1.7] text-white/85 [&_h1]:text-[17px] [&_h1]:font-semibold [&_h1]:text-white/95 [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-white/90 [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-white/90 [&_h3]:mt-2 [&_h3]:mb-1" dangerouslySetInnerHTML={{ __html: renderMarkdown(block.content) }}/>
      {isStreaming && (<span className="inline-block w-[2px] h-[1.15em] bg-terra-400/80 ml-0.5 animate-pulse align-middle rounded-full"/>)}
    </div>);
};
// ── Content Parser ───────────────────────────────────────────────────────────
function parseContent(raw) {
    if (!raw)
        return [{ type: 'text', content: '' }];
    const blocks = [];
    const PATTERN = /(<thinking>[\s\S]*?(?:<\/thinking>|$))|(```(\w*)(?:\s+([^\n]*))?\n([\s\S]*?)(?:```|$))/g;
    let lastIndex = 0;
    let match;
    while ((match = PATTERN.exec(raw)) !== null) {
        if (match.index > lastIndex) {
            const text = raw.slice(lastIndex, match.index);
            if (text.trim())
                pushTextWithToolParsing(blocks, text);
        }
        if (match[1]) {
            const content = match[1].replace(/<thinking>/g, '').replace(/<\/thinking>/g, '').trim();
            blocks.push({ type: 'thinking', content, collapsed: true });
        }
        else if (match[2]) {
            blocks.push({ type: 'code', lang: match[3] || '', filename: match[4] || undefined, content: (match[5] || '').trimEnd() });
        }
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < raw.length) {
        const text = raw.slice(lastIndex);
        if (text.trim())
            pushTextWithToolParsing(blocks, text);
    }
    if (blocks.length === 0)
        blocks.push({ type: 'text', content: raw });
    return blocks;
}
function pushTextWithToolParsing(blocks, text) {
    const TOOL_RE = /^🔧\s*(?:Tool:\s*)?(\S+)\s*(?:—\s*(.*))?$/gm;
    let lastIdx = 0;
    let m;
    while ((m = TOOL_RE.exec(text)) !== null) {
        if (m.index > lastIdx) {
            const pre = text.slice(lastIdx, m.index).trim();
            if (pre)
                blocks.push({ type: 'text', content: pre });
        }
        blocks.push({ type: 'tool-use', tool: m[1], status: 'done', detail: m[2] });
        lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) {
        const remaining = text.slice(lastIdx).trim();
        if (remaining)
            blocks.push({ type: 'text', content: remaining });
    }
}
// ── Markdown Renderer ────────────────────────────────────────────────────────
function renderMarkdown(text) {
    if (!text)
        return '';
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code style="background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px;font-size:0.88em;font-family:\'JetBrains Mono\',monospace;color:#E5A88A">$1</code>');
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong style="font-weight:600;color:rgba(255,255,255,0.95)"><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:rgba(255,255,255,0.95)">$1</strong>');
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em style="font-style:italic;color:rgba(255,255,255,0.75)">$1</em>');
    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del style="color:rgba(255,255,255,0.35);text-decoration:line-through">$1</del>');
    // HR
    html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:12px 0" />');
    // Blockquotes
    html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote style="border-left:2px solid rgba(212,120,92,0.3);padding-left:12px;font-style:italic;color:rgba(255,255,255,0.45);margin:6px 0">$1</blockquote>');
    // Unordered lists
    html = html.replace(/^[-*]\s+(.+)$/gm, '<li style="margin-left:20px;list-style:disc;color:rgba(255,255,255,0.8);margin:2px 0">$1</li>');
    // Ordered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li style="margin-left:20px;list-style:decimal;color:rgba(255,255,255,0.8);margin:2px 0">$1</li>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#D4785C;text-decoration:underline;text-underline-offset:2px" target="_blank" rel="noopener">$1</a>');
    // Line breaks
    html = html.replace(/\n/g, '<br />');
    return html;
}
// ── Syntax Highlighter ───────────────────────────────────────────────────────
const KW_PATTERN = {
    js: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|typeof|interface|type|extends|implements|default|throw|try|catch|finally|switch|case|break|continue|yield|of|in|do|void|null|undefined|true|false)\b/g,
    ts: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|typeof|interface|type|extends|implements|default|throw|try|catch|finally|switch|case|break|continue|yield|of|in|do|void|null|undefined|true|false|string|number|boolean|any|unknown|never|enum|as|is|keyof|readonly|infer|declare|namespace|module)\b/g,
    python: /\b(def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|yield|lambda|pass|break|continue|and|or|not|in|is|None|True|False|self|global|nonlocal|async|await|print)\b/g,
    rust: /\b(fn|let|mut|const|if|else|for|while|loop|match|struct|enum|impl|trait|pub|use|mod|crate|self|super|return|break|continue|where|async|await|move|ref|type|dyn|unsafe|extern|static|true|false|Some|None|Ok|Err)\b/g,
    go: /\b(func|var|const|if|else|for|range|switch|case|default|return|type|struct|interface|package|import|defer|go|chan|select|map|make|nil|true|false|err|string|int|bool|byte|error|fmt)\b/g,
    bash: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|local|export|source|echo|exit|cd|ls|grep|sed|awk|cat|rm|mkdir|chmod|sudo|apt|npm|npx|git|curl|wget)\b/g,
    sql: /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|NULL|IS|IN|LIKE|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|AS|UNION|INTO|VALUES|SET|COUNT|SUM|AVG|MAX|MIN|DISTINCT|EXISTS|BETWEEN|CASE|WHEN|THEN|ELSE|END)\b/gi,
};
const LANG_MAP = {
    javascript: 'js', jsx: 'js', tsx: 'ts', typescript: 'ts',
    py: 'python', rb: 'python', rs: 'rust', golang: 'go',
    sh: 'bash', shell: 'bash', zsh: 'bash',
    css: 'js', json: 'js', yaml: 'bash', yml: 'bash',
    html: 'js', xml: 'js', md: 'js', markdown: 'js',
    c: 'rust', cpp: 'rust', java: 'rust', kotlin: 'rust', swift: 'rust',
    sql: 'sql', mysql: 'sql', postgres: 'sql', postgresql: 'sql',
};
function highlightLine(line, lang) {
    let html = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    // Comments
    html = html.replace(/(\/\/.*)$/, '<span style="color:rgba(255,255,255,0.18);font-style:italic">$1</span>');
    html = html.replace(/^(\s*#.*)$/, '<span style="color:rgba(255,255,255,0.18);font-style:italic">$1</span>');
    // Strings
    html = html.replace(/(")((?:[^"\\]|\\.)*)(")/g, '<span style="color:#C9A87C">$1$2$3</span>');
    html = html.replace(/('(?:[^'\\]|\\.)*')/g, '<span style="color:#C9A87C">$1</span>');
    html = html.replace(/(`(?:[^`\\]|\\.)*`)/g, '<span style="color:#C9A87C">$1</span>');
    // Numbers
    html = html.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#CF6D6D">$1</span>');
    // Keywords
    const resolved = LANG_MAP[lang.toLowerCase()] ?? lang.toLowerCase();
    const kwRegex = KW_PATTERN[resolved];
    if (kwRegex) {
        kwRegex.lastIndex = 0;
        html = html.replace(kwRegex, '<span style="color:#D4785C;font-weight:500">$1</span>');
    }
    return html;
}
