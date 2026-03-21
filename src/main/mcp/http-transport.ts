/**
 * HTTP Request/Response Transport Implementation
 *
 * Simple stateless HTTP transport for MCP servers that support
 * request/response semantics without persistent connections.
 *
 * Each JSON-RPC request is sent as a POST and receives a response.
 * Useful for simple remote tools or gateway patterns.
 *
 * Protocol: https://spec.modelcontextprotocol.io/latest/basic/transports/
 */

import { McpTransport, McpTransportConfig, JsonRpcMessage, TransportState } from './transport-interface'

/**
 * HTTP transport implementation.
 *
 * Stateless HTTP request/response transport.
 * Each send() makes a POST request and awaits the response.
 */
export class HttpTransport implements McpTransport {
  readonly type = 'http' as const

  private messageHandlers: Array<(msg: JsonRpcMessage) => void> = []
  private errorHandlers: Array<(err: Error) => void> = []
  private closeHandlers: Array<() => void> = []
  private _state: TransportState = 'connected'

  private sessionId = this.generateSessionId()

  private config: Required<Pick<McpTransportConfig, 'url' | 'timeout'>> &
    Partial<Pick<McpTransportConfig, 'headers' | 'authToken'>>

  constructor(config: McpTransportConfig) {
    if (!config.url) {
      throw new Error('HTTP transport requires a url')
    }

    this.config = {
      url: config.url,
      headers: config.headers || {},
      authToken: config.authToken,
      timeout: config.timeout || 30000,
      ...config,
    }
  }

  get state(): TransportState {
    return this._state
  }

  /**
   * HTTP is stateless, so connect is a no-op.
   * It just validates that we can reach the endpoint.
   */
  async connect(): Promise<void> {
    // For HTTP, we could do a HEAD request to verify endpoint is reachable
    // For now, we just mark as connected since HTTP is stateless
    this._state = 'connected'
  }

  /**
   * HTTP is stateless, so disconnect is a no-op.
   */
  async disconnect(): Promise<void> {
    this._state = 'disconnected'
  }

  /**
   * Send JSON-RPC message via POST request and handle response.
   */
  async send(message: JsonRpcMessage): Promise<void> {
    if (this._state !== 'connected') {
      throw new Error('Transport not connected')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Session-ID': this.sessionId,
      ...this.config.headers,
    }

    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`
    }

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(this.config.timeout),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const responseText = await response.text()
      if (responseText) {
        try {
          const responseMessage = JSON.parse(responseText) as JsonRpcMessage
          this.messageHandlers.forEach(h => h(responseMessage))
        } catch (err) {
          const error = new Error(`Failed to parse HTTP response: ${err}`)
          this.errorHandlers.forEach(h => h(error))
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.errorHandlers.forEach(h => h(error))
      throw error
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
   * HTTP is always "connected" since it's stateless.
   */
  isConnected(): boolean {
    return this._state === 'connected'
  }

  /**
   * Internal: generate a session ID for tracking.
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}
