/**
 * Individual chat message bubble — full markdown, code blocks with language labels,
 * streaming cursor, attachments, branch button, expand/collapse for long messages.
 */
import React, { useMemo, useState } from 'react'
import { Bot, User, Copy, Check, GitBranch, Code2, ChevronDown, ChevronUp } from 'lucide-react'
import type { ChatMessage as Msg } from '../hooks/useOpenClaw'

interface Props {
  message: Msg
  isStreaming?: boolean
  onBranch?: () => void
}

export const ChatMessageBubble: React.FC<Props> = ({ message, isStreaming, onBranch }) => {
  const [copied, setCopied]     = useState(false)
  const [expanded, setExpanded] = useState(true)
  const isUser = message.role === 'user'

  const copy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const codeBlockCount = useMemo(() => (message.content.match(/```[\s\S]*?```/g) ?? []).length, [message.content])
  const rendered       = useMemo(() => renderContent(message.content), [message.content])
  const isLong         = message.content.length > 1200

  return (
    <div className={`flex gap-3 group ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-gold-500 to-terra-400 flex items-center justify-center mt-1 shadow-lg shadow-terra-400/20">
          <Bot size={13} className="text-white" />
        </div>
      )}

      <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {message.attachments.map((a, i) => (
              <div key={i} className="text-xs px-2.5 py-1 rounded-lg bg-white/10 text-white/60 border border-white/10 flex items-center gap-1">
                📎 <span className="truncate max-w-[140px]">{a.name}</span>
              </div>
            ))}
          </div>
        )}

        <div
          className={`relative rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-terra-400 text-white rounded-tr-sm px-4 py-3'
              : 'bg-white/[0.06] text-white/90 border border-white/[0.08] rounded-tl-sm px-4 py-3'
          } ${isLong && !expanded ? 'max-h-[260px] overflow-hidden' : ''}`}
        >
          <div className="prose-sm whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: rendered }} />
          {isStreaming && (
            <span className="inline-block w-1.5 h-[1.1em] bg-white/50 ml-0.5 animate-pulse align-middle rounded-sm" />
          )}
          {isLong && !expanded && (
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#141414] to-transparent rounded-b-2xl pointer-events-none" />
          )}
        </div>

        {isLong && !isStreaming && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[10px] text-white/25 hover:text-white/50 transition-colors px-1 mt-0.5"
          >
            {expanded ? <><ChevronUp size={10} /> Show less</> : <><ChevronDown size={10} /> Show more</>}
          </button>
        )}

        {!isStreaming && message.content && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity px-1">
            <button onClick={copy} className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors">
              {copied ? <Check size={10} className="text-sage-400" /> : <Copy size={10} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {codeBlockCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-terra-300/60">
                <Code2 size={10} />
                {codeBlockCount} block{codeBlockCount > 1 ? 's' : ''}
              </span>
            )}
            {!isUser && onBranch && (
              <button onClick={onBranch} className="flex items-center gap-1 text-[10px] text-white/30 hover:text-gold-400 transition-colors" title="Branch chat from here">
                <GitBranch size={10} /> Branch
              </button>
            )}
          </div>
        )}

        <span className="text-[10px] text-white/15 px-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center mt-1">
          <User size={13} className="text-white/60" />
        </div>
      )}
    </div>
  )
}

// ── Full markdown renderer ────────────────────────────────────────────────────
function renderContent(text: string): string {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m: string, lang: string, code: string) => {
    const label = lang ? `<span class="block text-[9px] font-mono uppercase tracking-widest text-white/20 mb-1">${lang}</span>` : ''
    return `<div class="my-2">${label}<pre class="bg-black/50 rounded-xl p-3.5 overflow-x-auto text-xs font-mono border border-white/[0.08] leading-relaxed"><code class="text-sage-300/90">${code.trim()}</code></pre></div>`
  })

  html = html.replace(/`([^`]+)`/g, '<code class="bg-white/[0.08] px-1.5 py-0.5 rounded text-xs font-mono text-blush-300">$1</code>')
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-white mt-3 mb-1">$1</h3>')
  html = html.replace(/^## (.+)$/gm,  '<h2 class="text-base font-semibold text-white mt-4 mb-1.5">$1</h2>')
  html = html.replace(/^# (.+)$/gm,   '<h1 class="text-lg font-bold text-white mt-4 mb-2">$1</h1>')
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
  html = html.replace(/\*(.+?)\*/g,     '<em class="italic text-white/80">$1</em>')
  html = html.replace(/^---$/gm, '<hr class="border-white/10 my-3" />')
  html = html.replace(/^[-•]\s+(.+)$/gm, '<li class="ml-4 list-disc text-white/80 my-0.5">$1</li>')
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal text-white/80 my-0.5">$1</li>')
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="border-l-2 border-terra-400/40 pl-3 italic text-white/50 my-1.5">$1</blockquote>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-terra-300 hover:text-terra-400 underline underline-offset-2" target="_blank" rel="noopener">$1</a>')
  html = html.replace(/\n/g, '<br />')

  return html
}
