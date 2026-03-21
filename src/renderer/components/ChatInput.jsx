/**
 * ChatInput — Claude-inspired input bar with integrated model selector.
 *
 * Layout: Model selector pill (left) | Textarea (center) | Action buttons (right)
 * Bottom row: attachment chips, system prompt indicator, hint text.
 */
import React, { useRef, useState, useEffect, forwardRef, useCallback } from 'react';
import { Paperclip, X, Loader2, Moon, Mic, Brain, Monitor, ArrowUp, Zap } from 'lucide-react';
import { ModelSelector } from './ModelSelector';
import { SlashCommandPicker } from './SlashCommandPicker';
export const ChatInput = forwardRef(({ onSend, disabled = false, placeholder, incognito = false, systemPrompt, queuedCount = 0, onStartVoice, onInsertText, onScreenCapture, isDesktopControlActive = false, model = 'auto', onModelChange, connectedProviders, ollamaModels, gatewayCatalog, fastMode = false, onFastModeChange, onSlashCommand, }, forwardedRef) => {
    const [text, setText] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [sending, setSending] = useState(false);
    const [focused, setFocused] = useState(false);
    const internalRef = useRef(null);
    const textareaRef = forwardedRef ?? internalRef;
    // ── Slash command detection ────────────────────────────────────────────
    const slashActive = text.startsWith('/');
    const slashQuery = slashActive ? text.slice(1).split(/\s/)[0] : '';
    const handleSlashSelect = useCallback((skill) => {
        if (skill.id.startsWith('_')) {
            // Built-in command — execute directly
            onSlashCommand?.(skill.name);
            setText('');
        }
        else {
            // Skill — replace the slash command with a prefixed message
            setText(`/${skill.name} `);
            textareaRef.current?.focus();
        }
    }, [onSlashCommand, textareaRef]);
    const effectivePlaceholder = placeholder ?? (disabled ? 'Connecting…' :
        incognito ? 'Incognito — not stored…' :
            'Message Nyra…');
    // Auto-resize
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta)
            return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }, [text]);
    // Allow parent to insert text
    useEffect(() => {
        onInsertText?.((setter) => setter(prev => prev + (prev ? ' ' : '')));
    }, [onInsertText]);
    const handleSend = async () => {
        const trimmed = text.trim();
        if (!trimmed || sending)
            return;
        setSending(true);
        const atts = attachments && attachments.length > 0 ? attachments : undefined;
        setText('');
        setAttachments([]);
        try {
            await onSend(trimmed, atts);
        }
        finally {
            setSending(false);
        }
        textareaRef.current?.focus();
    };
    const handleKeyDown = (e) => {
        // When slash picker is open, let it handle Enter/ArrowUp/ArrowDown/Escape
        if (slashActive && ['Enter', 'ArrowDown', 'ArrowUp', 'Escape'].includes(e.key))
            return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    const handleFileAttach = async () => {
        const paths = await window.nyra.files.requestFile();
        for (const p of paths) {
            const result = await window.nyra.files.read(p);
            if (result && !('error' in result)) {
                setAttachments(prev => [...(prev ?? []), { name: result.name, mimeType: result.mimeType, content: result.content }]);
            }
        }
    };
    const removeAttachment = (idx) => setAttachments(prev => (prev ?? []).filter((_, i) => i !== idx));
    const canSend = text.trim().length > 0 && !disabled && !sending;
    return (<div className="max-w-[720px] mx-auto w-full">
      {/* System prompt indicator */}
      {systemPrompt && (<div className="flex items-center gap-1.5 mb-2 px-1">
          <Brain size={11} className="text-gold-400/60"/>
          <span className="text-[11px] text-gold-400/50 truncate max-w-[400px]">
            System: {systemPrompt.slice(0, 60)}{systemPrompt.length > 60 ? '…' : ''}
          </span>
        </div>)}

      {/* Offline queue badge */}
      {queuedCount > 0 && (<div className="flex items-center gap-1.5 mb-2 px-1">
          <span className="text-[11px] text-gold-400/60">
            {queuedCount} message{queuedCount > 1 ? 's' : ''} queued — will send on reconnect
          </span>
        </div>)}

      {/* Attachment chips */}
      {attachments && attachments.length > 0 && (<div className="flex flex-wrap gap-1.5 mb-2">
          {attachments.map((a, i) => (<div key={i} className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.07] rounded-lg px-2.5 py-1 text-[11px] text-white/60">
              <span className="text-white/30">📎</span>
              <span className="truncate max-w-[160px]">{a.name}</span>
              <button onClick={() => removeAttachment(i)} className="text-white/30 hover:text-white/70 flex-shrink-0 ml-0.5">
                <X size={11}/>
              </button>
            </div>))}
        </div>)}

      {/* ── Main input container ─────────────────────────────────────────── */}
      <div className={`relative rounded-2xl border transition-all duration-200 ${focused
            ? 'border-white/[0.15] bg-white/[0.04] shadow-lg shadow-black/20'
            : 'border-white/[0.08] bg-white/[0.025] hover:border-white/[0.1]'}`}>
        {/* Slash command picker — opens above the input */}
        <SlashCommandPicker query={slashQuery} onSelect={handleSlashSelect} onClose={() => setText('')} visible={slashActive && focused}/>
        {/* Textarea */}
        <div className="px-4 pt-3 pb-2">
          <textarea ref={textareaRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={effectivePlaceholder} disabled={disabled} rows={1} className="w-full bg-transparent text-[15px] text-white/90 placeholder-white/25 outline-none resize-none leading-[1.6] max-h-[200px] disabled:opacity-40"/>
        </div>

        {/* Bottom toolbar row */}
        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          {/* Model selector (left) */}
          {onModelChange && (<ModelSelector value={model} onChange={onModelChange} connectedProviders={connectedProviders} ollamaModels={ollamaModels} gatewayCatalog={gatewayCatalog} compact/>)}

          {/* Fast Mode toggle */}
          {onFastModeChange && (<button onClick={() => onFastModeChange(!fastMode)} title={fastMode ? 'Fast Mode ON — using fastest model' : 'Fast Mode OFF'} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${fastMode
                ? 'bg-sage-500/15 text-sage-300 border border-sage-500/25'
                : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'}`}>
              <Zap size={11} className={fastMode ? 'text-sage-400' : ''}/>
              {fastMode && <span>Fast</span>}
            </button>)}

          {/* Spacer */}
          <div className="flex-1"/>

          {/* Action buttons (right) */}
          <div className="flex items-center gap-0.5">
            <button onClick={handleFileAttach} disabled={disabled} title="Attach file" className="p-1.5 rounded-lg text-white/25 hover:text-white/60 hover:bg-white/[0.05] transition-colors disabled:opacity-30">
              <Paperclip size={15}/>
            </button>

            {onScreenCapture && (<button onClick={onScreenCapture} disabled={disabled} title="Capture screen" className="p-1.5 rounded-lg text-white/25 hover:text-white/60 hover:bg-white/[0.05] transition-colors disabled:opacity-30">
                <Monitor size={15}/>
              </button>)}

            {onStartVoice && (<button onClick={onStartVoice} disabled={disabled} title="Voice input" className="p-1.5 rounded-lg text-white/25 hover:text-white/60 hover:bg-white/[0.05] transition-colors disabled:opacity-30">
                <Mic size={15}/>
              </button>)}

            {isDesktopControlActive && (<div className="flex items-center gap-1 px-1.5 py-0.5 bg-gold-500/10 border border-gold-500/20 rounded-lg ml-1" title="Desktop control active">
                <span className="text-[9px] text-gold-400/80 font-medium">PC</span>
              </div>)}

            {/* Send button */}
            <button onClick={handleSend} disabled={!canSend} className={`ml-1 p-1.5 rounded-xl transition-all ${canSend
            ? 'bg-terra-400 hover:bg-terra-500 text-white shadow-md shadow-terra-400/20'
            : 'bg-white/[0.04] text-white/15 cursor-not-allowed'}`}>
              {sending ? <Loader2 size={15} className="animate-spin"/> : <ArrowUp size={15}/>}
            </button>
          </div>
        </div>
      </div>

      {/* Hint text */}
      <div className="flex items-center justify-center gap-3 mt-2">
        {incognito && (<span className="flex items-center gap-1 text-[10px] text-gold-400/60">
            <Moon size={9}/> Incognito
          </span>)}
        <p className="text-[10px] text-white/[0.12]">Enter to send · Shift+Enter for new line · / for commands</p>
      </div>
    </div>);
});
ChatInput.displayName = 'ChatInput';
