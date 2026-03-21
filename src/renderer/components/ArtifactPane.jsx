/**
 * ArtifactPane — Right slide-in panel for code / preview artifacts
 * Detects code blocks in the active message and renders them with
 * syntax highlighting + live HTML/React preview capability.
 */
import React, { useState, useMemo } from 'react';
import { X, Copy, Check, Code2, Globe, Download } from 'lucide-react';
export const ArtifactPane = ({ artifacts, onClose }) => {
    const [activeIdx, setActiveIdx] = useState(0);
    const [tab, setTab] = useState('code');
    const [copied, setCopied] = useState(false);
    const artifact = artifacts[activeIdx];
    if (!artifact)
        return null;
    const canPreview = ['html', 'svg'].includes(artifact.lang.toLowerCase());
    const handleCopy = () => {
        navigator.clipboard.writeText(artifact.code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    const handleDownload = () => {
        const ext = artifact.lang === 'typescript' ? 'ts' : artifact.lang === 'javascript' ? 'js' : artifact.lang;
        const filename = artifact.filename ?? `artifact.${ext}`;
        const blob = new Blob([artifact.code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };
    return (<div className="w-[400px] flex-shrink-0 h-full bg-[#0e0e0e] border-l border-white/[0.07] flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
        <Code2 size={13} className="text-terra-400 flex-shrink-0"/>
        <span className="text-xs font-semibold text-white/60 flex-1 truncate">
          {artifact.filename ?? artifact.lang.toUpperCase()}
        </span>

        {/* Multi-artifact tabs */}
        {artifacts.length > 1 && (<div className="flex gap-1 mr-2">
            {artifacts.map((a, i) => (<button key={a.id} onClick={() => { setActiveIdx(i); setTab('code'); }} className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${i === activeIdx ? 'bg-terra-400/20 text-terra-300' : 'text-white/30 hover:text-white/60'}`}>
                {i + 1}
              </button>))}
          </div>)}

        <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/70 transition-colors">
          {copied ? <Check size={13} className="text-sage-400"/> : <Copy size={13}/>}
        </button>
        <button onClick={handleDownload} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/70 transition-colors">
          <Download size={13}/>
        </button>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/70 transition-colors">
          <X size={13}/>
        </button>
      </div>

      {/* Code / Preview tabs */}
      {canPreview && (<div className="flex border-b border-white/[0.06] flex-shrink-0">
          {['code', 'preview'].map(t => (<button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium transition-colors capitalize ${tab === t
                    ? 'text-white border-b-2 border-terra-400'
                    : 'text-white/35 hover:text-white/60 border-b-2 border-transparent'}`}>
              {t === 'code' ? <Code2 size={11}/> : <Globe size={11}/>}
              {t}
            </button>))}
        </div>)}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'code' ? (<CodeView code={artifact.code} lang={artifact.lang}/>) : (<PreviewView code={artifact.code} lang={artifact.lang}/>)}
      </div>

      {/* Language badge */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-white/[0.06] flex-shrink-0">
        <span className="text-[10px] font-mono text-white/20 bg-white/[0.04] px-2 py-0.5 rounded">
          {artifact.lang}
        </span>
        <span className="text-[10px] text-white/15 ml-auto">
          {artifact.code.split('\n').length} lines
        </span>
      </div>
    </div>);
};
// ── Code view with basic token coloring ───────────────────────────────────────
const CodeView = ({ code, lang: _lang }) => {
    const lines = code.split('\n');
    return (<div className="h-full overflow-auto scrollbar-thin font-mono text-[12px] leading-relaxed p-4">
      {lines.map((line, i) => (<div key={i} className="flex gap-4 group">
          <span className="text-white/15 select-none w-8 text-right flex-shrink-0 group-hover:text-white/25">
            {i + 1}
          </span>
          <span className="text-white/75 whitespace-pre">{line || ' '}</span>
        </div>))}
    </div>);
};
// ── HTML / SVG sandbox preview ────────────────────────────────────────────────
const PreviewView = ({ code, lang }) => {
    const srcDoc = useMemo(() => {
        if (lang === 'svg') {
            return `<!DOCTYPE html><html><body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh">${code}</body></html>`;
        }
        return code;
    }, [code, lang]);
    return (<iframe srcDoc={srcDoc} sandbox="allow-scripts" className="w-full h-full border-0 bg-white" title="preview"/>);
};
// ── Utility: parse artifact blocks from markdown ───────────────────────────────
export function parseArtifacts(markdown) {
    const artifacts = [];
    const fence = /```(\w+)(?:\s+([^\n]+))?\n([\s\S]*?)```/g;
    let match;
    let idx = 0;
    while ((match = fence.exec(markdown)) !== null) {
        const lang = match[1] ?? 'text';
        const meta = match[2];
        const code = match[3].trimEnd();
        if (code.length > 30) {
            artifacts.push({ id: `artifact-${idx++}`, lang, filename: meta, code });
        }
    }
    return artifacts;
}
