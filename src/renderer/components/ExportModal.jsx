/**
 * ExportModal — Export active chat in Markdown, JSON, or plain text
 */
import React, { useState } from 'react';
import { X, Download, FileText, Code, AlignLeft, Check } from 'lucide-react';
const FORMAT_OPTIONS = [
    { id: 'markdown', label: 'Markdown', desc: 'Formatted with headings and code blocks', icon: <FileText size={14}/> },
    { id: 'json', label: 'JSON', desc: 'Full structured data with metadata', icon: <Code size={14}/> },
    { id: 'text', label: 'Plain Text', desc: 'Simple readable transcript', icon: <AlignLeft size={14}/> },
];
export const ExportModal = ({ session, onClose }) => {
    const [format, setFormat] = useState('markdown');
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState(false);
    const buildContent = () => {
        const title = session.title || 'Untitled Chat';
        const date = new Date(session.updatedAt).toLocaleString();
        if (format === 'json') {
            return JSON.stringify({
                title,
                exportedAt: new Date().toISOString(),
                model: session.model,
                messages: session.messages.map(m => ({
                    role: m.role,
                    content: m.content,
                    timestamp: m.timestamp,
                })),
            }, null, 2);
        }
        if (format === 'markdown') {
            const lines = [
                `# ${title}`,
                `> Exported ${date}${session.model ? ` · Model: \`${session.model}\`` : ''}`,
                '',
            ];
            if (session.systemPrompt) {
                lines.push('## System Prompt', '', `> ${session.systemPrompt}`, '');
            }
            for (const m of session.messages) {
                const role = m.role === 'user' ? '**You**' : '**Nyra**';
                lines.push(`### ${role}`, '', m.content, '');
            }
            return lines.join('\n');
        }
        // plain text
        const lines = [
            `=== ${title} ===`,
            `Exported: ${date}`,
            '',
        ];
        if (session.systemPrompt) {
            lines.push('[System]', session.systemPrompt, '');
        }
        for (const m of session.messages) {
            const role = m.role === 'user' ? 'You' : 'Nyra';
            lines.push(`[${role}]`, m.content, '');
        }
        return lines.join('\n');
    };
    const handleSave = async () => {
        setSaving(true);
        const ext = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt';
        const safe = (session.title || 'chat').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const filename = `${safe}_${Date.now()}.${ext}`;
        try {
            const p = await window.nyra.files.saveDialog(filename);
            if (p) {
                await window.nyra.files.writeText(p, buildContent());
                setDone(true);
                setTimeout(onClose, 1200);
            }
        }
        finally {
            setSaving(false);
        }
    };
    const msgCount = session.messages.length;
    const wordCount = session.messages.reduce((n, m) => n + m.content.split(/\s+/).length, 0);
    return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[440px] bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <Download size={15} className="text-terra-400"/>
          <h2 className="text-sm font-semibold text-white/80 flex-1">Export Chat</h2>
          <button onClick={onClose} className="p-1.5 text-white/30 hover:text-white/70 rounded-lg hover:bg-white/[0.06] transition-colors">
            <X size={14}/>
          </button>
        </div>

        {/* Chat info */}
        <div className="bg-white/[0.04] rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-terra-400/20 flex items-center justify-center text-terra-400 flex-shrink-0">
            <FileText size={14}/>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white/80 truncate">{session.title || 'Untitled Chat'}</p>
            <p className="text-[11px] text-white/35 mt-0.5">{msgCount} messages · ~{wordCount.toLocaleString()} words</p>
          </div>
        </div>

        {/* Format selector */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-white/35 mb-2 block">Export Format</label>
          <div className="flex flex-col gap-2">
            {FORMAT_OPTIONS.map(opt => (<button key={opt.id} onClick={() => setFormat(opt.id)} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${format === opt.id
                ? 'border-terra-400/50 bg-terra-400/10'
                : 'border-white/[0.07] hover:border-white/15 hover:bg-white/[0.03]'}`}>
                <span className={format === opt.id ? 'text-terra-400' : 'text-white/30'}>
                  {opt.icon}
                </span>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${format === opt.id ? 'text-white/90' : 'text-white/60'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-white/30 mt-0.5">{opt.desc}</p>
                </div>
                {format === opt.id && <Check size={12} className="text-terra-400 flex-shrink-0"/>}
              </button>))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/40 hover:text-white/70 rounded-xl hover:bg-white/[0.06] transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || done} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-terra-500 hover:bg-terra-400 disabled:opacity-60 text-white rounded-xl transition-colors">
            {done
            ? <><Check size={13}/> Saved!</>
            : saving
                ? 'Saving…'
                : <><Download size={13}/> Save File</>}
          </button>
        </div>
      </div>
    </div>);
};
