/**
 * useStreamChat — React hook for streaming chat via direct provider IPC
 *
 * This hook provides a streaming chat interface that bypasses the OpenClaw
 * WebSocket gateway and calls providers directly via Electron IPC.
 *
 * Usage:
 *   const { streamingText, isStreaming, startStream, cancelStream } = useStreamChat()
 *
 *   // Start a stream
 *   startStream({
 *     providerId: 'openai',
 *     model: 'gpt-4o',
 *     messages: [{ role: 'user', content: 'Hello' }],
 *   })
 *
 *   // Display streaming text
 *   <p>{streamingText}</p>
 *
 * Architecture:
 *   1. Renderer calls `stream:start` IPC with provider/model/messages
 *   2. Main process creates an AsyncGenerator from provider.chatStream()
 *   3. Each yielded chunk is pushed as `stream:chunk` event to renderer
 *   4. This hook accumulates chunks into streamingText via requestAnimationFrame
 *   5. `stream:done` signals completion; `stream:error` signals failure
 */
import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface StreamRequest {
  providerId: string
  model: string
  messages: Array<{ role: string; content: any }>
  maxTokens?: number
  temperature?: number
}

export interface StreamState {
  streamId: string | null
  streamingText: string
  isStreaming: boolean
  error: string | null
  totalTokens: number
  model: string | null
}

export interface UseStreamChat {
  /** Current accumulated streaming text */
  streamingText: string
  /** Whether a stream is currently active */
  isStreaming: boolean
  /** Error message if stream failed */
  error: string | null
  /** Total tokens received */
  totalTokens: number
  /** Start a new stream */
  startStream: (request: StreamRequest) => Promise<string>
  /** Cancel the active stream */
  cancelStream: () => void
  /** Reset state for a new conversation */
  reset: () => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useStreamChat(): UseStreamChat {
  const [state, setState] = useState<StreamState>({
    streamId: null,
    streamingText: '',
    isStreaming: false,
    error: null,
    totalTokens: 0,
    model: null,
  })

  // Buffer for batching RAF updates
  const bufferRef = useRef<string>('')
  const rafRef = useRef<number | null>(null)
  const activeStreamRef = useRef<string | null>(null)

  // Flush buffer to state via requestAnimationFrame
  const flushBuffer = useCallback(() => {
    if (bufferRef.current) {
      const chunk = bufferRef.current
      bufferRef.current = ''
      setState(prev => ({
        ...prev,
        streamingText: prev.streamingText + chunk,
      }))
    }
    rafRef.current = null
  }, [])

  // Subscribe to stream events
  useEffect(() => {
    const cleanups: Array<() => void> = []

    cleanups.push(
      window.nyra.streaming.onChunk((data) => {
        if (data.streamId !== activeStreamRef.current) return

        // Buffer chunks and flush via RAF for performance
        bufferRef.current += data.content
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(flushBuffer)
        }

        if (data.usage) {
          setState(prev => ({ ...prev, totalTokens: data.usage.totalTokens || prev.totalTokens }))
        }
      })
    )

    cleanups.push(
      window.nyra.streaming.onDone((data) => {
        if (data.streamId !== activeStreamRef.current) return

        // Final flush
        if (bufferRef.current) {
          const finalChunk = bufferRef.current
          bufferRef.current = ''
          setState(prev => ({
            ...prev,
            streamingText: prev.streamingText + finalChunk,
            isStreaming: false,
            totalTokens: data.totalTokens || prev.totalTokens,
          }))
        } else {
          setState(prev => ({ ...prev, isStreaming: false, totalTokens: data.totalTokens || prev.totalTokens }))
        }
        activeStreamRef.current = null
      })
    )

    cleanups.push(
      window.nyra.streaming.onError((data) => {
        if (data.streamId !== activeStreamRef.current) return
        setState(prev => ({ ...prev, isStreaming: false, error: data.error }))
        activeStreamRef.current = null
      })
    )

    cleanups.push(
      window.nyra.streaming.onCancelled((data) => {
        if (data.streamId !== activeStreamRef.current) return
        setState(prev => ({ ...prev, isStreaming: false }))
        activeStreamRef.current = null
      })
    )

    return () => {
      cleanups.forEach(fn => fn())
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [flushBuffer])

  // Start a new stream
  const startStream = useCallback(async (request: StreamRequest): Promise<string> => {
    // Cancel any existing stream
    if (activeStreamRef.current) {
      await window.nyra.streaming.cancel(activeStreamRef.current)
    }

    const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    activeStreamRef.current = streamId
    bufferRef.current = ''

    setState({
      streamId,
      streamingText: '',
      isStreaming: true,
      error: null,
      totalTokens: 0,
      model: request.model,
    })

    const result = await window.nyra.streaming.start({
      streamId,
      ...request,
    })

    if (!result.success) {
      setState(prev => ({ ...prev, isStreaming: false, error: result.error }))
      activeStreamRef.current = null
    }

    return streamId
  }, [])

  // Cancel active stream
  const cancelStream = useCallback(() => {
    if (activeStreamRef.current) {
      window.nyra.streaming.cancel(activeStreamRef.current)
      activeStreamRef.current = null
    }
  }, [])

  // Reset all state
  const reset = useCallback(() => {
    cancelStream()
    bufferRef.current = ''
    setState({
      streamId: null,
      streamingText: '',
      isStreaming: false,
      error: null,
      totalTokens: 0,
      model: null,
    })
  }, [cancelStream])

  return {
    streamingText: state.streamingText,
    isStreaming: state.isStreaming,
    error: state.error,
    totalTokens: state.totalTokens,
    startStream,
    cancelStream,
    reset,
  }
}

export default useStreamChat
