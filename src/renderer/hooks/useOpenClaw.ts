/**
 * useOpenClaw — WebSocket client hook for the OpenClaw Gateway  (v3)
 *
 * v3 improvements over v2:
 *  • Dual event format: handles both JSON-RPC notifications AND gateway native events
 *    (the proxy translates responses but passes events through as-is)
 *  • Streaming token field name flexibility (token, content, text, delta)
 *  • 60s streaming safety timeout
 *  • Pending promise cleanup on WS close
 *  • Fixed premature setStreaming(false) in sendMessage finally block
 *  • RPC result fallback for chat.send response
 *
 * v2 features retained:
 *  • Token batching via requestAnimationFrame
 *  • Fast reconnect: 500 ms
 *  • WebSocket keepalive ping every 15 s
 *  • Offline message queue
 *  • Pin / unpin, color label, system prompt, branch, export, search
 */

import { useEffect, useRef, useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
export type GatewayStatus = 'idle' | 'checking' | 'installing' | 'starting' | 'ready' | 'error'
export type WsStatus      = 'connecting' | 'connected' | 'disconnected' | 'error'
export type SessionColor  = 'indigo' | 'violet' | 'rose' | 'amber' | 'emerald' | 'cyan' | 'none'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  attachments?: Array<{ name: string; mimeType: string; content: string }>
}

export interface Session {
  id: string
  title: string
  model?: string
  systemPrompt?: string
  updatedAt: number
  messages: ChatMessage[]
  incognito?: boolean
  pinned?: boolean
  color?: SessionColor
  projectId?: string
  branchedFrom?: string
  tags?: string[]
}

interface RpcRequest {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: unknown
}

// v3: Accept both JSON-RPC responses and gateway native frames
interface IncomingMessage {
  // JSON-RPC style (proxy-translated responses)
  jsonrpc?: '2.0'
  id?: string
  result?: unknown
  error?: { code: number; message: string }
  method?: string
  params?: unknown
  // Gateway native style (events pass through as-is)
  type?: 'event' | 'res'
  event?: string
  payload?: unknown
  ok?: boolean
}

type PendingResolver = {
  resolve: (v: unknown) => void
  reject:  (e: Error)   => void
}

interface QueuedMessage {
  content: string
  sessionId: string
  attachments?: ChatMessage['attachments']
}

let rpcIdCounter = 1
function newId() { return String(rpcIdCounter++) }

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useOpenClaw() {
  const [status,       setStatus]       = useState<GatewayStatus>('idle')
  const [log,          setLog]          = useState<string>('')
  const [wsUrl,        setWsUrl]        = useState<string>('ws://127.0.0.1:18789')
  const [wsStatus,     setWsStatus]     = useState<WsStatus>('disconnected')
  const [sessions,     setSessions]     = useState<Session[]>([])
  const [activeSession,setActiveSession]= useState<Session | null>(null)
  const [streaming,    setStreaming]     = useState(false)
  const [offlineQueue, setOfflineQueue] = useState<QueuedMessage[]>([])

  const wsRef              = useRef<WebSocket | null>(null)
  const connectingRef      = useRef<boolean>(false)
  const pendingRef         = useRef<Map<string, PendingResolver>>(new Map())
  const streamingSessionRef= useRef<string | null>(null)
  const reconnectTimer     = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const pingTimer          = useRef<ReturnType<typeof setInterval> | null>(null)
  const tokenBufferRef     = useRef<Map<string, string>>(new Map())
  const rafRef             = useRef<number | null>(null)
  const offlineQueueRef    = useRef<QueuedMessage[]>([])
  const streamTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null) // v3: safety timeout
  const toolCallHandlerRef = useRef<((callId: string, toolName: string, params: Record<string, unknown>) => Promise<{ callId: string; result?: unknown; error?: string }>) | null>(null)

  // ── Flush batched tokens (rAF — one React update per frame) ─────────────────
  const flushTokens = useCallback(() => {
    rafRef.current = null
    if (tokenBufferRef.current.size === 0) return
    const updates = new Map(tokenBufferRef.current)
    tokenBufferRef.current.clear()

    setSessions(prev => prev.map(s => {
      const tok = updates.get(s.id)
      if (!tok) return s
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + tok }
      return { ...s, messages: msgs }
    }))
    setActiveSession(prev => {
      if (!prev) return prev
      const tok = updates.get(prev.id)
      if (!tok) return prev
      const msgs = [...prev.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + tok }
      return { ...prev, messages: msgs }
    })
  }, [])

  // v3: Helper to handle streaming token from either event format
  const handleStreamToken = useCallback((sessionId: string, token: string) => {
    tokenBufferRef.current.set(sessionId, (tokenBufferRef.current.get(sessionId) ?? '') + token)
    if (!rafRef.current) rafRef.current = requestAnimationFrame(flushTokens)
  }, [flushTokens])

  // v3: Helper to handle stream done from either event format
  const handleStreamDone = useCallback((sessionId: string) => {
    // Flush remaining buffer immediately
    const remaining = tokenBufferRef.current.get(sessionId)
    if (remaining) {
      tokenBufferRef.current.delete(sessionId)
      setSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s
        const msgs = [...s.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + remaining }
        return { ...s, messages: msgs }
      }))
      setActiveSession(prev => {
        if (!prev || prev.id !== sessionId) return prev
        const msgs = [...prev.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + remaining }
        return { ...prev, messages: msgs }
      })
    }
    if (streamingSessionRef.current === sessionId) {
      setStreaming(false)
      streamingSessionRef.current = null
    }
    if (streamTimeoutRef.current) { clearTimeout(streamTimeoutRef.current); streamTimeoutRef.current = null }
  }, [])

  // ── WebSocket connect ────────────────────────────────────────────────────────
  const connect = useCallback(async (source = 'unknown') => {
    if (connectingRef.current) {
      console.log(`[OpenClaw] connect() from "${source}" skipped — already connecting (lock)`)
      return
    }
    const rs = wsRef.current?.readyState
    if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING || rs === WebSocket.CLOSING) {
      console.log(`[OpenClaw] connect() from "${source}" skipped — ws readyState=${rs}`)
      return
    }
    console.log(`[OpenClaw] connect() from "${source}" — proceeding`)
    connectingRef.current = true

    try {
      const url = await window.nyra.openclaw.getWsUrl()
      setWsUrl(url)

      setWsStatus('connecting')
      const ws = new WebSocket(url)
      wsRef.current = ws
      connectingRef.current = false

      ws.onopen = () => {
        setWsStatus('connected')
        fetchSessions()

        // Keepalive ping every 15 s
        if (pingTimer.current) clearInterval(pingTimer.current)
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ jsonrpc: '2.0', id: newId(), method: 'ping' }))
          }
        }, 15_000)

        // Drain offline queue
        if (offlineQueueRef.current.length > 0) {
          const queue = [...offlineQueueRef.current]
          offlineQueueRef.current = []
          setOfflineQueue([])
          for (const msg of queue) {
            const id = newId()
            ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: 'chat.send', params: { sessionKey: msg.sessionId, message: msg.content, attachments: msg.attachments, idempotencyKey: `queue-${id}` } }))
          }
        }
      }

      ws.onclose = () => {
        setWsStatus('disconnected')
        if (pingTimer.current) clearInterval(pingTimer.current)
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
        // v3: Clean up pending promises on close
        for (const [, p] of pendingRef.current) {
          p.reject(new Error('WebSocket disconnected'))
        }
        pendingRef.current.clear()
        reconnectTimer.current = setTimeout(() => connect('ws.onclose-reconnect'), 500)
      }

      ws.onerror = () => setWsStatus('error')

      ws.onmessage = (event) => {
        try {
          const msg: IncomingMessage = JSON.parse(event.data as string)

          // v3: Derive effective method — works for both JSON-RPC notifications
          // and gateway native events that pass through the proxy untranslated
          const effectiveMethod = msg.method ?? (msg.type === 'event' ? msg.event : undefined)

          // ── Streaming token — batch via rAF ────────────────────────────────
          if (effectiveMethod === 'session.token') {
            // v3: Accept multiple field names for the payload
            const p = (msg.params ?? msg.payload ?? {}) as Record<string, unknown>
            const sessionId = (p.sessionId ?? p.sessionKey ?? p.session_id) as string | undefined
            const token = (p.token ?? p.content ?? p.text ?? p.delta) as string | undefined
            if (sessionId && token) handleStreamToken(sessionId, token)
            return
          }

          // ── Stream done ────────────────────────────────────────────────────
          if (effectiveMethod === 'session.done') {
            const p = (msg.params ?? msg.payload ?? {}) as Record<string, unknown>
            const sessionId = (p.sessionId ?? p.sessionKey ?? p.session_id) as string | undefined
            if (sessionId) handleStreamDone(sessionId)
            return
          }

          // ── Tool call from AI — route to desktop tools handler ──────────
          if (effectiveMethod === 'tool.call' || effectiveMethod === 'tool_call') {
            const p = (msg.params ?? msg.payload ?? {}) as Record<string, unknown>
            const callId   = (p.callId ?? p.call_id ?? p.id) as string
            const toolName = (p.name ?? p.tool ?? p.toolName ?? p.tool_name) as string
            const params   = (p.parameters ?? p.params ?? p.arguments ?? {}) as Record<string, unknown>

            if (callId && toolName && toolCallHandlerRef.current) {
              toolCallHandlerRef.current(callId, toolName, params).then((result) => {
                // Send tool result back to gateway
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  const rpcId = newId()
                  wsRef.current.send(JSON.stringify({
                    jsonrpc: '2.0', id: rpcId,
                    method: 'tool.result',
                    params: { callId: result.callId, result: result.result, error: result.error }
                  }))
                }
              })
            }
            return
          }

          // Ping pong — ignore
          if (msg.result === 'pong') return

          // ── RPC response (proxy-translated: { id, result/error }) ──────────
          if (msg.id) {
            const pending = pendingRef.current.get(msg.id)
            if (!pending) return
            pendingRef.current.delete(msg.id)
            if (msg.error) pending.reject(new Error(msg.error.message))
            else pending.resolve(msg.result)
          }
        } catch (e) {
          console.warn('[OpenClaw WS] Parse error:', e)
        }
      }
    } catch (err) {
      connectingRef.current = false
      console.error('[OpenClaw] connect error:', err)
    }
  }, [flushTokens, handleStreamToken, handleStreamDone])

  // ── JSON-RPC helper ──────────────────────────────────────────────────────────
  const rpc = useCallback(<T>(method: string, params?: unknown): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }
      const id = newId()
      pendingRef.current.set(id, { resolve: resolve as (v: unknown) => void, reject })
      wsRef.current.send(JSON.stringify({ jsonrpc: '2.0', id, method, params } satisfies RpcRequest))
    })
  }, [])

  // ── Fetch sessions ────────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    try {
      const result = await rpc<{ sessions: Array<{ sessionKey?: string; sessionId?: string; id?: string; title: string; updatedAt: number; model?: string }> }>('sessions.list')
      const mapped: Session[] = (result?.sessions ?? []).map(s => ({
        id: s.sessionKey ?? s.sessionId ?? s.id ?? '', title: s.title || 'New chat', model: s.model,
        updatedAt: s.updatedAt, messages: []
      }))
      setSessions(prev => mapped.map(newS => {
        const ex = prev.find(e => e.id === newS.id)
        return ex ? { ...newS, pinned: ex.pinned, color: ex.color, tags: ex.tags, systemPrompt: ex.systemPrompt, messages: ex.messages } : newS
      }))
      return mapped
    } catch { return [] }
  }, [rpc])

  // ── Load session history ──────────────────────────────────────────────────────
  const loadSessionHistory = useCallback(async (sessionId: string) => {
    try {
      const result = await rpc<{ messages: Array<{ role: string; content: string; id: string; timestamp: number }> }>('sessions.history', { sessionKey: sessionId })
      const messages: ChatMessage[] = (result?.messages ?? []).map(m => ({
        id: m.id ?? String(Date.now()), role: m.role as 'user' | 'assistant',
        content: m.content, timestamp: m.timestamp ?? Date.now()
      }))
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages } : s))
      setActiveSession(prev => prev?.id === sessionId ? { ...prev, messages } : prev)
      return messages
    } catch { return [] }
  }, [rpc])

  // ── Create session ────────────────────────────────────────────────────────────
  const createSession = useCallback(async (opts?: {
    model?: string; incognito?: boolean; systemPrompt?: string
    projectId?: string; branchedFrom?: string
  }): Promise<Session> => {
    const result = await rpc<{ sessionKey?: string; sessionId: string }>('sessions.create', { model: opts?.model })
    const session: Session = {
      id: result.sessionKey ?? result.sessionId, title: 'New chat', updatedAt: Date.now(), messages: [],
      model: opts?.model, incognito: opts?.incognito, systemPrompt: opts?.systemPrompt,
      projectId: opts?.projectId, branchedFrom: opts?.branchedFrom, pinned: false
    }
    setSessions(prev => [session, ...prev])
    setActiveSession(session)
    return session
  }, [rpc])

  // ── Select session ────────────────────────────────────────────────────────────
  const selectSession = useCallback(async (sessionId: string) => {
    const found = sessions.find(s => s.id === sessionId)
    if (found) {
      setActiveSession(found)
      if (found.messages.length === 0) await loadSessionHistory(sessionId)
    }
  }, [sessions, loadSessionHistory])

  // ── Send message (with offline queue + local fallback) ─────────────────────
  const sendMessage = useCallback(async (
    content: string,
    attachments?: ChatMessage['attachments']
  ): Promise<void> => {
    let session = activeSession
    if (!session) {
      try {
        session = await createSession()
      } catch {
        // WS not connected — create local session so the user can still type
        // Messages will be queued and sent when WS reconnects
        const localId = `agent:main:main` // Default OpenClaw session
        session = {
          id: localId, title: content.slice(0, 45), updatedAt: Date.now(), messages: [],
          pinned: false
        }
        setSessions(prev => [session!, ...prev])
        setActiveSession(session)
      }
    }

    const userMsg: ChatMessage      = { id: `user-${Date.now()}`, role: 'user', content, timestamp: Date.now(), attachments }
    const assistantMsg: ChatMessage = { id: `asst-${Date.now()}`, role: 'assistant', content: '', timestamp: Date.now() }

    const updated: Session = {
      ...session,
      messages: [...session.messages, userMsg, assistantMsg],
      title: session.messages.length === 0 ? content.slice(0, 45) : session.title,
      updatedAt: Date.now()
    }
    setActiveSession(updated)
    setSessions(prev => prev.map(s => s.id === session!.id ? updated : s))
    setStreaming(true)
    streamingSessionRef.current = session.id

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      // Queue message for delivery when WS reconnects
      console.log('[OpenClaw] WS not connected — queuing message')
      offlineQueueRef.current.push({ content, sessionId: session.id, attachments })
      setOfflineQueue([...offlineQueueRef.current])
      handleStreamToken(session.id, '⏳ Gateway not connected. Message queued — it will be sent automatically when the connection is restored.')
      handleStreamDone(session.id)
      return
    }

    // v3: Safety timeout — auto-clear streaming after 60s
    if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current)
    streamTimeoutRef.current = setTimeout(() => {
      if (streamingSessionRef.current) {
        console.warn('[OpenClaw] Streaming safety timeout — clearing')
        setStreaming(false)
        streamingSessionRef.current = null
      }
    }, 60_000)

    try {
      // v3: Don't set streaming false in finally — let session.done handle it
      const result = await rpc<unknown>('chat.send', {
        sessionKey: session.id,
        message: content,
        attachments,
        idempotencyKey: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      })
      // v3: RPC resolves when gateway acknowledges the send, not when streaming is done.
      // Streaming tokens arrive via session.token events and end with session.done.
      // If result includes the response directly (non-streaming mode), handle it:
      if (result && typeof result === 'object' && 'content' in (result as Record<string, unknown>)) {
        const r = result as { content?: string; sessionId?: string }
        if (r.content) {
          handleStreamDone(session.id)
        }
      }
    } catch (err) {
      // On error, clear streaming state
      console.error('[OpenClaw] chat.send error:', err)
      setStreaming(false)
      streamingSessionRef.current = null
      if (streamTimeoutRef.current) { clearTimeout(streamTimeoutRef.current); streamTimeoutRef.current = null }
    }
  }, [activeSession, createSession, rpc, handleStreamDone])

  // ── Pin / unpin ────────────────────────────────────────────────────────────────
  const pinSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, pinned: !s.pinned } : s))
    setActiveSession(prev => prev?.id === sessionId ? { ...prev, pinned: !prev.pinned } : prev)
  }, [])

  // ── Color label ───────────────────────────────────────────────────────────────
  const setSessionColor = useCallback((sessionId: string, color: SessionColor) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, color } : s))
    setActiveSession(prev => prev?.id === sessionId ? { ...prev, color } : prev)
  }, [])

  // ── System prompt ─────────────────────────────────────────────────────────────
  const setSessionSystemPrompt = useCallback((sessionId: string, prompt: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, systemPrompt: prompt } : s))
    setActiveSession(prev => prev?.id === sessionId ? { ...prev, systemPrompt: prompt } : prev)
  }, [])

  // ── Per-session model override ────────────────────────────────────────────────
  const setSessionModel = useCallback((sessionId: string, model: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, model } : s))
    setActiveSession(prev => prev?.id === sessionId ? { ...prev, model } : prev)
  }, [])

  // ── Rename ────────────────────────────────────────────────────────────────────
  const renameSession = useCallback((sessionId: string, title: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s))
    setActiveSession(prev => prev?.id === sessionId ? { ...prev, title } : prev)
  }, [])

  // ── Delete ────────────────────────────────────────────────────────────────────
  const deleteSession = useCallback(async (sessionId: string) => {
    try { await rpc('sessions.delete', { sessionKey: sessionId }) } catch { /* gateway may not support */ }
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    setActiveSession(prev => prev?.id === sessionId ? null : prev)
  }, [rpc])

  // ── Branch (fork) session ─────────────────────────────────────────────────────
  const branchSession = useCallback(async (fromSessionId: string, fromMsgIndex: number): Promise<Session> => {
    const source = sessions.find(s => s.id === fromSessionId)
    if (!source) throw new Error('Session not found')
    const result = await rpc<{ sessionKey?: string; sessionId: string }>('sessions.create', { model: source.model })
    const session: Session = {
      id: result.sessionKey ?? result.sessionId,
      title: `↗ ${source.title.slice(0, 35)}`,
      updatedAt: Date.now(),
      messages: source.messages.slice(0, fromMsgIndex + 1),
      model: source.model,
      systemPrompt: source.systemPrompt,
      branchedFrom: fromSessionId,
      projectId: source.projectId,
      pinned: false
    }
    setSessions(prev => [session, ...prev])
    setActiveSession(session)
    return session
  }, [sessions, rpc])

  // ── Export to Markdown ────────────────────────────────────────────────────────
  const exportSessionMarkdown = useCallback((session: Session): string => {
    const lines = [
      `# ${session.title}`,
      `> Exported from Nyra Desktop · ${new Date(session.updatedAt).toLocaleString()}`,
      session.systemPrompt ? `\n**System Prompt:** ${session.systemPrompt}\n` : '',
      ''
    ]
    for (const msg of session.messages) {
      const role = msg.role === 'user' ? '**You**' : '**Nyra**'
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      lines.push(`### ${role} · ${time}`, msg.content, '')
    }
    return lines.join('\n')
  }, [])

  // ── Global search ─────────────────────────────────────────────────────────────
  const searchSessions = useCallback((query: string): Array<{ session: Session; matchedMsg?: ChatMessage; score: number }> => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const results: Array<{ session: Session; matchedMsg?: ChatMessage; score: number }> = []
    for (const s of sessions) {
      const titleMatch = (s.title || '').toLowerCase().includes(q)
      if (titleMatch) results.push({ session: s, score: 2 })
      for (const m of s.messages) {
        if (m.content.toLowerCase().includes(q)) {
          results.push({ session: s, matchedMsg: m, score: 1 })
          break
        }
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 20)
  }, [sessions])

  // ── Tool call handler registration ────────────────────────────────────────────
  const setToolCallHandler = useCallback((handler: ((callId: string, toolName: string, params: Record<string, unknown>) => Promise<{ callId: string; result?: unknown; error?: string }>) | null) => {
    toolCallHandlerRef.current = handler
  }, [])

  // Register tools with gateway (tells the AI what tools are available)
  const registerTools = useCallback(async (tools: ReadonlyArray<{ name: string; description: string; parameters: unknown }>) => {
    try {
      await rpc('tools.register', { tools })
      console.log('[OpenClaw] Registered', tools.length, 'desktop tools')
    } catch (err) {
      // Gateway may not support tools.register yet — that's fine, tools will
      // still work if the gateway sends tool.call events based on system prompt
      console.warn('[OpenClaw] tools.register not supported:', err)
    }
  }, [rpc])

  // ── Gateway restart ───────────────────────────────────────────────────────────
  const restart = useCallback(() => {
    wsRef.current?.close()
    window.nyra.openclaw.restart()
  }, [])

  // ── Main process status listeners ─────────────────────────────────────────────
  useEffect(() => {
    window.nyra.openclaw.getStatus().then((s: string) => {
      const mapped: GatewayStatus =
        s === 'running'    ? 'ready' :
        s === 'checking'   ? 'checking' :
        s === 'installing' ? 'installing' :
        s === 'starting'   ? 'starting' :
        s === 'error'      ? 'error' : 'idle'
      setStatus(mapped)
      if (s === 'running') connect('getStatus.then')
    }).catch(() => {})

    window.nyra.openclaw.onStatusChange((s: string) => {
      const mapped: GatewayStatus =
        s === 'running'    ? 'ready' :
        s === 'checking'   ? 'checking' :
        s === 'installing' ? 'installing' :
        s === 'starting'   ? 'starting' :
        s === 'error'      ? 'error' : 'idle'
      setStatus(mapped)
      if (s === 'running') connect('onStatusChange')
    })

    window.nyra.openclaw.onLog?.((line: string)        => setLog(line))
    window.nyra.openclaw.onInstallLog?.((line: string) => setLog(line))
    window.nyra.openclaw.onReady(() => { setStatus('ready'); connect('onReady') })
    window.nyra.openclaw.onError?.((msg: string) => { setStatus('error'); setLog(msg) })

    // Always try WS connection immediately — the proxy may be up even if
    // the OpenClawManager hasn't emitted 'running' yet
    connect('useEffect-direct')

    // Safety net: if status is still not 'ready' after 3s but WS isn't connected,
    // force another connection attempt (covers cases where status events are missed)
    const safetyTimer = setTimeout(() => {
      connect('safety-fallback-3s')
    }, 3_000)

    // Second safety net at 8s — covers slow gateway startups
    const safetyTimer2 = setTimeout(() => {
      connect('safety-fallback-8s')
    }, 8_000)

    return () => {
      clearTimeout(safetyTimer)
      clearTimeout(safetyTimer2)
      wsRef.current?.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pingTimer.current) clearInterval(pingTimer.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current)
      window.nyra.openclaw.removeAllListeners()
    }
  }, [connect])

  return {
    // State
    status, log, wsUrl, wsStatus, streaming, sessions, activeSession, offlineQueue,
    // Core
    sendMessage, selectSession, createSession, fetchSessions, setActiveSession,
    // Session management
    pinSession, setSessionColor, setSessionSystemPrompt, setSessionModel,
    renameSession, deleteSession, branchSession,
    // Export / search
    exportSessionMarkdown, searchSessions,
    // Gateway
    restart,
    // Desktop tools
    setToolCallHandler, registerTools,
  }
}
