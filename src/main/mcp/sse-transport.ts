/**
 * Server-Sent Events (SSE) Transport Implementation
 *
 * Connects to remote MCP servers via HTTP using the SSE protocol.
 * Receives messages as SSE events and sends messages via POST requests.
 *
 * Protocol: https://spec.modelcontextprotocol.io/latest/basic/transports/
 * SSE Format: https://html.spec.whatwg.org/multipage/server-sent-events.html
 */

import { McpTransport, McpTransportConfig, JsonRpcMessage, TransportState } from './transport-interface'

/**
 * Parser for SSE format events.
 * SSE format:
 *   event: message\n
 *   data: {"jsonrpc":"2.0",...}\n
 *   \n
 */
function parseSSEEvent(data: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const lines = data.split('\n')

  for (const line of lines) {
    if (line.startsWith(':')) continue // comment

    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue // malformed

    const field = line.substring(0, colonIndex)
    let value = line.substring(colonIndex + 1)

    // Remove leading space if present
    if (value.startsWith(' ')) {
      value = value.substring(1)
    }

    fields[field] = (fields[field] || '') + value
  }

  return fields
}

/**
 * SSE transport implementation.
 *
 * Connects to remote MCP servers via HTTP SSE protocol.
 */
export class SSETransport implements McpTransport {
  readonly type = 'sse' as const

  private messageHandlers: Array<(msg: JsonRpcMessage) => void> = []
  private errorHandlers: Array<(err: Error) => void> = []
  private closeHandlers: Array<() => void> = []
  private _state: TransportState = 'disconnected'

  private eventSource: EventSource | null = null
  private lastEventId = ''
  private reconnectCount = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private config: Required<Pick<McpTransportConfig, 'url' | 'timeout'>> &
    Partial<Pick<McpTransportConfig, 'headers' | 'authToken' | 'reconnect' | 'maxReconnectAttempts' | 'reconnectDelayMs' | 'exponentialBackoff'>>

  constructor(config: McpTransportConfig) {
    if (!config.url) {
      throw new Error('SSE transport requires a url')
    }

    this.config = {
      url: config.url,
      headers: config.headers || {},
      authToken: config.authToken,
      timeout: config.timeout || 30000,
      reconnect: config.reconnect !== false,
      maxReconnectAttempts: config.maxReconnectAttempts || 5,
      reconnectDelayMs: config.reconnectDelayMs || 1000,
      exponentialBackoff: config.exponentialBackoff !== false,
      ...config,
    }
  }

  get state(): TransportState {
    return this._state
  }

  /**
   * Open SSE connection to remote server.
   */
  async connect(): Promise<void> {
    if (this._state !== 'disconnected') {
      throw new Error(`Cannot connect: already in state ${this._state}`)
    }

    this._state = 'connecting'
    this.reconnectCount = 0

    return this.openSSEConnection()
  }

  /**
   * Close SSE connection.
   */
  async disconnect(): Promise<void> {
    this._state = 'disconnected'

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }

  /**
   * Send JSON-RPC message via POST request.
   */
  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Transport not connected')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    }

    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(this.config.timeout),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }

  /**
   * Register handler for incoming messages.
   */
  onMessage(handler: (msg: JsonRpcMessage) => void): void {
    this.messageHandlers.push(handler)
  }

  /**
   * Register handler for errors.
   */
  onError(handler: (err: Error) => void): void {
    this.errorHandlers.push(handler)
  }

  /**
   * Register handler for close/disconnect.
   */
  onClose(handler: () => void): void {
    this.closeHandlers.push(handler)
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this._state === 'connected' && this.eventSource !== null
  }

  /**
   * Internal: open SSE connection.
   */
  private openSSEConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const headers = {
          ...this.config.headers,
        }

        if (this.config.authToken) {
          headers['Authorization'] = `Bearer ${this.config.authToken}`
        }

        // Add Last-Event-ID if we're reconnecting
        if (this.lastEventId) {
          headers['Last-Event-ID'] = this.lastEventId
        }

        const url = new URL(this.config.url)
        this.eventSource = new EventSource(this.config.url)

        const timeout = setTimeout(() => {
          reject(new Error('SSE connection timeout'))
        }, this.config.timeout)

        this.eventSource.onopen = () => {
          clearTimeout(timeout)
          this._state = 'connected'
          this.reconnectCount = 0
          resolve()
        }

        this.eventSource.onmessage = (event: MessageEvent<string>) => {
          if (event.lastEventId) {
            this.lastEventId = event.lastEventId
          }

          try {
            const message = JSON.parse(event.data) as JsonRpcMessage
            this.messageHandlers.forEach(h => h(message))
          } catch (err) {
            const error = new Error(`Failed to parse SSE message: ${err}`)
            this.errorHandlers.forEach(h => h(error))
          }
        }

        this.eventSource.onerror = () => {
          clearTimeout(timeout)

          if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
            this._state = 'disconnected'
            this.eventSource = null

            if (this.config.reconnect && this.reconnectCount < (this.config.maxReconnectAttempts ?? 5)) {
              this.scheduleReconnect()
            } else {
              this.closeHandlers.forEach(h => h())
            }
          } else if (this.reconnectCount >= (this.config.maxReconnectAttempts ?? 5)) {
            // CONNECTING state, will retry
            const error = new Error('Max reconnection attempts reached')
            this._state = 'error'
            this.errorHandlers.forEach(h => h(error))
            reject(error)
          }
        }
      } catch (err) {
        this._state = 'error'
        reject(err)
      }
    })
  }

  /**
   * Internal: schedule reconnection with exponential backoff.
   */
  private scheduleReconnect(): void {
    let delay = this.config.reconnectDelayMs || 1000

    if (this.config.exponentialBackoff) {
      delay = delay * Math.pow(2, this.reconnectCount)
      // Cap at 60 seconds
      delay = Math.min(delay, 60000)
    }

    this.reconnectCount++
    this._state = 'connecting'

    this.reconnectTimer = setTimeout(() => {
      this.openSSEConnection().catch(err => {
        this.errorHandlers.forEach(h => h(err))
      })
    }, delay)
  }
}
