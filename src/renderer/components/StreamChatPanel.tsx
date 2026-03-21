/**
 * StreamChatPanel — Direct-provider chat with live token streaming
 *
 * Consumes useStreamChat() to bypass the OpenClaw gateway and talk to
 * providers directly via IPC. Features:
 *   - Message history with role-based bubbles
 *   - Live streaming cursor with blinking caret
 *   - Markdown rendering for code blocks and inline formatting
 *   - Model/provider selector integrated with Smart Model Router
 *   - Agent attribution badges when agents are involved
 *   - Token counter and cost estimate per message
 *   - Cancel mid-stream, retry failed messages
 */
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useStreamChat, type StreamRequest } from '../hooks/useStreamChat'

// ── Types ──────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  providerId?: string
  tokens?: number
  timestamp: number
  agentId?: string
  error?: string
}

interface ProviderOption {
  id: string
  name: string
  models: string[]
}

// ── Markdown-lite renderer ─────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let inCodeBlock = false
  let codeLang = ''
  let codeLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // Close code block
        nodes.push(
          <div key={`code-${i}`} className="my-2 rounded-lg overflow-hidden">
            {codeLang && (
              <div className="bg-white/[0.08] px-3 py-1 text-[10px] text-white/30 font-mono uppercase tracking-wider">
                {codeLang}
              </div>
            )}
            <pre className="bg-white/[0.04] px-3 py-2 overflow-x-auto text-[12px] font-mono text-white/80 leading-relaxed">
              <code>{codeLines.join('\n')}</code>
            </pre>
          </div>
        )
        inCodeBlock = false
        codeLines = []
        codeLang = ''
      } else {
        inCodeBlock = true
        codeLang = line.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // Inline code
    const parts = line.split(/(`[^`]+`)/)
    const formatted = parts.map((part, j) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={j} className="bg-white/[0.08] text-terra-300 px-1 py-0.5 rounded text-[11px] font-mono">
            {part.slice(1, -1)}
          </code>
        )
      }
      // Bold
      const boldParts = part.split(/(\*\*[^*]+\*\*)/)
      return boldParts.map((bp, k) => {
        if (bp.startsWith('**') && bp.endsWith('**')) {
          return <strong key={`${j}-${k}`} className="font-semibold text-white/90">{bp.slice(2, -2)}</strong>
        }
        return bp
      })
    })

    if (line.trim() === '') {
      nodes.push(<div key={i} className="h-2" />)
    } else {
      nodes.push(<p key={i} className="leading-relaxed">{formatted}</p>)
    }
  }

  // Unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    nodes.push(
      <div key="code-unclosed" className="my-2 rounded-lg overflow-hidden">
        <pre className="bg-white/[0.04] px-3 py-2 overflow-x-auto text-[12px] font-mono text-white/80 leading-relaxed">
          <code>{codeLines.join('\n')}</code>
        </pre>
      </div>
    )
  }

  return nodes
}

// ── Streaming cursor ───────────────────────────────────────────

const StreamingCursor: React.FC = () => (
  <span className="inline-block w-[2px] h-[14px] bg-terra-300 ml-0.5 animate-pulse" />
)

// ── Message bubble ─────────────────────────────────────────────

const MessageBubble: React.FC<{
  message: ChatMessage
  isStreaming?: boolean
  streamingText?: string
}> = ({ message, isStreaming, streamingText }) => {
  const isUser = message.role === 'user'
  const content = isStreaming ? (streamingText || '') : message.content

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 group`}>
      <div className={`max-w-[85%] ${isUser ? 'order-1' : 'order-1'}`}>
        {/* Agent/model badge */}
        {!isUser && (message.model || message.agentId) && (
          <div className="flex items-center gap-1.5 mb-1 ml-1">
            {message.agentId && (
              <span className="text-[9px] bg-terra-400/15 text-terra-300 px-1.5 py-0.5 rounded-full font-medium">
                {message.agentId}
              </span>
            )}
            {message.model && (
              <span className="text-[9px] text-white/20 font-mono">{message.model}</span>
            )}
          </div>
        )}

        {/* Bubble */}
        <div className={`rounded-2xl px-4 py-2.5 text-[13px] ${
          isUser
            ? 'bg-terra-400/20 text-white/90 rounded-br-md'
            : 'bg-white/[0.04] text-white/75 rounded-bl-md border border-white/[0.04]'
        }`}>
          {message.error ? (
            <div className="flex items-center gap-2 text-blush-400">
              <span className="text-[11px]">⚠</span>
              <span className="text-[12px]">{message.error}</span>
            </div>
          ) : (
            <div className="space-y-1">
              {renderMarkdown(content)}
              {isStreaming && <StreamingCursor />}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className={`flex items-center gap-2 mt-0.5 mx-1 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[9px] text-white/15">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {message.tokens && message.tokens > 0 && (
            <span className="text-[9px] text-white/15 font-mono">{message.tokens}tok</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────

const StreamChatPanel: React.FC = () => {
  const { streamingText, isStreaming, error, totalTokens, startStream, cancelStream, reset } = useStreamChat()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [providerId, setProviderId] = useState('auto')
  const [model, setModel] = useState('auto')
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamingMsgId = useRef<string | null>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // Load available providers
  useEffect(() => {
    const loadProviders = async () => {
      try {
        const catalog = await window.nyra.providers.catalog()
        if (Array.isArray(catalog)) {
          const opts: ProviderOption[] = catalog
            .filter((p: any) => p.hasKey || p.id === 'ollama' || p.id === 'npu')
            .map((p: any) => ({
              id: p.id,
              name: p.id.charAt(0).toUpperCase() + p.id.slice(1),
              models: p.models?.map((m: any) => m.id || m) || [],
            }))
          setProviders(opts)
        }
      } catch {
        // Fallback
        setProviders([
          { id: 'auto', name: 'Auto (Smart Router)', models: ['auto'] },
        ])
      }
    }
    loadProviders()
  }, [])

  // When streaming finishes, commit the assistant message
  useEffect(() => {
    if (!isStreaming && streamingMsgId.current && streamingText) {
      setMessages(prev => prev.map(m =>
        m.id === streamingMsgId.current
          ? { ...m, content: streamingText, tokens: totalTokens }
          : m
      ))
      streamingMsgId.current = null
    }
  }, [isStreaming, streamingText, totalTokens])

  // Handle stream errors
  useEffect(() => {
    if (error && streamingMsgId.current) {
      setMessages(prev => prev.map(m =>
        m.id === streamingMsgId.current
          ? { ...m, error, content: streamingText || '' }
          : m
      ))
      streamingMsgId.current = null
    }
  }, [error, streamingText])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    // Add user message
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    // Build message history for API
    const apiMessages: Array<{ role: string; content: any }> = []
    if (systemPrompt.trim()) {
      apiMessages.push({ role: 'system', content: systemPrompt.trim() })
    }
    for (const m of [...messages, userMsg]) {
      if (m.role !== 'system') {
        apiMessages.push({ role: m.role, content: m.content })
      }
    }

    // Placeholder for assistant reply
    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      model: model === 'auto' ? undefined : model,
      providerId: providerId === 'auto' ? undefined : providerId,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    streamingMsgId.current = assistantMsg.id

    // Resolve provider and model
    let resolvedProvider = providerId
    let resolvedModel = model
    if (providerId === 'auto' || model === 'auto') {
      try {
        const routed = await window.nyra.modelRouter.route('general', 'moderate')
        if (routed?.success !== false) {
          resolvedProvider = routed.providerId || 'openai'
          resolvedModel = routed.modelId || 'gpt-4o'
          // Update placeholder message with resolved model
          setMessages(prev => prev.map(m =>
            m.id === assistantMsg.id
              ? { ...m, model: resolvedModel, providerId: resolvedProvider }
              : m
          ))
        }
      } catch {
        resolvedProvider = 'openai'
        resolvedModel = 'gpt-4o'
      }
    }

    const request: StreamRequest = {
      providerId: resolvedProvider,
      model: resolvedModel,
      messages: apiMessages,
      temperature: 0.7,
    }

    await startStream(request)
  }, [input, isStreaming, messages, providerId, model, systemPrompt, startStream])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const _handleRetry = useCallback(async (messageId: string) => {
    // Find the failed assistant message and the user message before it
    const idx = messages.findIndex(m => m.id === messageId)
    if (idx < 1) return

    // Remove failed message and re-send
    const trimmed = messages.slice(0, idx)
    setMessages(trimmed)

    // Re-trigger with last user message
    const lastUserMsg = trimmed[trimmed.length - 1]
    if (lastUserMsg?.role === 'user') {
      setInput(lastUserMsg.content)
    }
  }, [messages])

  const handleClearChat = () => {
    setMessages([])
    reset()
  }

  // ── Auto-resize textarea ───────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-terra-400 animate-pulse" />
        <span className="text-[12px] font-medium text-white/60">Stream Chat</span>
        <span className="text-[10px] text-white/20 font-mono">Direct Provider</span>

        <div className="flex-1" />

        {/* Provider selector */}
        <select
          value={providerId}
          onChange={e => setProviderId(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.06] rounded-md text-[11px] text-white/60 px-2 py-1 outline-none focus:border-terra-400/30"
        >
          <option value="auto">Auto Route</option>
          {providers.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Model selector */}
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.06] rounded-md text-[11px] text-white/60 px-2 py-1 outline-none focus:border-terra-400/30"
        >
          <option value="auto">Auto</option>
          {providers
            .filter(p => providerId === 'auto' || p.id === providerId)
            .flatMap(p => p.models)
            .map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
        </select>

        {/* System prompt toggle */}
        <button
          onClick={() => setShowSystemPrompt(s => !s)}
          className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
            showSystemPrompt ? 'bg-terra-400/15 text-terra-300' : 'text-white/20 hover:text-white/40'
          }`}
        >
          SYS
        </button>

        {/* Clear */}
        <button
          onClick={handleClearChat}
          className="text-[10px] text-white/20 hover:text-blush-400 px-1.5 py-1 rounded transition-colors"
        >
          Clear
        </button>
      </div>

      {/* System prompt editor */}
      {showSystemPrompt && (
        <div className="px-4 py-2 border-b border-white/[0.04] bg-white/[0.02]">
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="System prompt (optional)..."
            className="w-full bg-transparent text-[12px] text-white/60 placeholder-white/20 resize-none outline-none leading-relaxed"
            rows={2}
          />
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-white/15">
            <div className="text-3xl">◈</div>
            <p className="text-[13px]">Start a conversation</p>
            <p className="text-[11px] text-white/10">Messages stream directly from the provider</p>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && msg.id === streamingMsgId.current}
            streamingText={msg.id === streamingMsgId.current ? streamingText : undefined}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Token counter */}
      {(isStreaming || totalTokens > 0) && (
        <div className="flex items-center gap-3 px-4 py-1 border-t border-white/[0.02] text-[10px] text-white/15 font-mono">
          {isStreaming && (
            <span className="text-terra-300 animate-pulse">streaming...</span>
          )}
          {totalTokens > 0 && <span>{totalTokens} tokens</span>}
          {isStreaming && (
            <button
              onClick={cancelStream}
              className="ml-auto text-blush-400/60 hover:text-blush-400 transition-colors"
            >
              Cancel ⌘.
            </button>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="px-4 py-3 border-t border-white/[0.04]">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-2.5 text-[13px] text-white/80 placeholder-white/20 resize-none outline-none focus:border-terra-400/20 transition-colors disabled:opacity-40 leading-relaxed"
            style={{ maxHeight: 200 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="px-4 py-2.5 rounded-xl bg-terra-400/20 text-terra-300 text-[12px] font-medium hover:bg-terra-400/30 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          >
            {isStreaming ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default StreamChatPanel
