/**
 * Chat input bar — auto-resizing textarea, file attach, voice input button,
 * system-prompt indicator pill, offline queue badge, send on Enter.
 */
import React, { useRef, useState, useEffect, forwardRef } from 'react'
import { Send, Paperclip, X, Loader2, Moon, Mic, Brain, Monitor, Crosshair } from 'lucide-react'
import type { ChatMessage } from '../hooks/useOpenClaw'

interface Props {
  onSend: (text: string, attachments?: ChatMessage['attachments']) => void | Promise<void>
  disabled?: boolean
  placeholder?: string
  incognito?: boolean
  systemPrompt?: string
  queuedCount?: number
  onStartVoice?: () => void
  onInsertText?: (cb: (setter: React.Dispatch<React.SetStateAction<string>>) => void) => void
  onScreenCapture?: () => void
  isDesktopControlActive?: boolean
}

export const ChatInput = forwardRef<HTMLTextAreaElement, Props>(({
  onSend, disabled = false, placeholder, incognito = false,
  systemPrompt, queuedCount = 0, onStartVoice, onInsertText,
  onScreenCapture, isDesktopControlActive = false,
}, forwardedRef) => {
  const [text, setText]               = useState('')
  const [attachments, setAttachments] = useState<ChatMessage['attachments']>([])
  const [sending, setSending]         = useState(false)
  const internalRef                   = useRef<HTMLTextAreaElement>(null)
  const textareaRef                   = (forwardedRef as React.RefObject<HTMLTextAreaElement>) ?? internalRef

  const effectivePlaceholder = placeholder ?? (
    disabled    ? 'Connecting to OpenClaw…' :
    incognito   ? 'Incognito — not stored…' :
    'Message Nyra…'
  )

  // Auto-resize
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }, [text])

  // Allow parent to insert text (e.g. from voice / prompt library)
  useEffect(() => {
    onInsertText?.((setter) => setter(prev => prev + (prev ? ' ' : '')))
  }, [onInsertText])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    const atts = attachments && attachments.length > 0 ? attachments : undefined
    setText('')
    setAttachments([])
    try { await onSend(trimmed, atts) }
    finally { setSending(false) }
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleFileAttach = async () => {
    const paths = await window.nyra.files.requestFile()
    for (const p of paths) {
      const result = await window.nyra.files.read(p)
      if (result && !('error' in result)) {
        setAttachments(prev => [...(prev ?? []), { name: result.name, mimeType: result.mimeType, content: result.content }])
      }
    }
  }

  const removeAttachment = (idx: number) => setAttachments(prev => (prev ?? []).filter((_, i) => i !== idx))

  const canSend = text.trim().length > 0 && !disabled && !sending

  return (
    <div className="flex-shrink-0">
      {/* System prompt indicator */}
      {systemPrompt && (
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <Brain size={10} className="text-gold-400/70" />
          <span className="text-[10px] text-gold-400/60 truncate max-w-[300px]">
            System: {systemPrompt.slice(0, 60)}{systemPrompt.length > 60 ? '…' : ''}
          </span>
        </div>
      )}

      {/* Offline queue badge */}
      {queuedCount > 0 && (
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <span className="text-[10px] text-gold-400/70">
            ⚡ {queuedCount} message{queuedCount > 1 ? 's' : ''} queued — will send on reconnect
          </span>
        </div>
      )}

      {/* Attachment chips */}
      {attachments && attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-white/10 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white/70">
              <span className="truncate max-w-[140px]">📎 {a.name}</span>
              <button onClick={() => removeAttachment(i)} className="text-white/40 hover:text-white/80 flex-shrink-0">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 bg-white/[0.05] border border-white/10 rounded-2xl px-3 py-2.5 focus-within:border-white/20 transition-colors">
        <button onClick={handleFileAttach} disabled={disabled} className="flex-shrink-0 p-1 text-white/30 hover:text-white/70 transition-colors disabled:opacity-30">
          <Paperclip size={16} />
        </button>

        {onScreenCapture && (
          <button 
            onClick={onScreenCapture} 
            disabled={disabled} 
            title="Capture screen"
            className="flex-shrink-0 p-1 text-white/30 hover:text-terra-300 transition-colors disabled:opacity-30"
          >
            <Monitor size={16} />
          </button>
        )}

        {isDesktopControlActive && (
          <div className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-gold-500/10 border border-gold-500/20 rounded-lg" title="Desktop control active">
            <Crosshair size={11} className="text-gold-400" />
            <span className="text-[9px] text-gold-400/80 font-medium">PC</span>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={effectivePlaceholder}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/25 outline-none resize-none leading-relaxed max-h-[200px] disabled:opacity-40"
        />

        {onStartVoice && (
          <button onClick={onStartVoice} disabled={disabled} className="flex-shrink-0 p-1 text-white/30 hover:text-blush-400 transition-colors disabled:opacity-30">
            <Mic size={16} />
          </button>
        )}

        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`flex-shrink-0 p-1.5 rounded-xl transition-all ${
            canSend ? 'bg-terra-400 hover:bg-terra-500 text-white shadow-lg shadow-terra-400/20' : 'bg-white/5 text-white/20 cursor-not-allowed'
          }`}
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>

      <div className="flex items-center justify-center gap-3 mt-1.5">
        {incognito && (
          <span className="flex items-center gap-1 text-[10px] text-gold-400/70">
            <Moon size={9} /> Incognito · not saved
          </span>
        )}
        <p className="text-center text-[10px] text-white/15">Enter ↵ send · Shift+Enter newline</p>
      </div>
    </div>
  )
})

ChatInput.displayName = 'ChatInput'
