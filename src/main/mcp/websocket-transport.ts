/**
 * WebSocket Transport Implementation
 *
 * Connects to remote MCP servers via WebSocket (ws:// or wss://).
 * Sends and receives JSON-RPC messages as text frames.
 *
 * Protocol: https://spec.modelcontextprotocol.io/latest/basic/transports/
 */

import * as ws from 'ws'
import { McpTransport, McpTransportConfig, JsonRpcMessage, TransportState } from './transport-interface'

// Type alias for convenience
type WebSocket = ws.WebSocket

/**
 * WebSocket transport implementation.
 *
 * Connects to remote MCP servers via WebSocket.
 */
export class WebSocketTransport implements McpTransport {
  readonly type = 'websocket' as const

  private messageHandlers: Array<(msg: JsonRpcMessage) => void> = []
  private errorHandlers: Array<(err: Error) => void> = []
  private closeHandlers: Array<() => void> = []
  private _state: TransportState = 'disconnected'

  private wsInstance: ws.WebSocket | null = null
  private reconnectCount = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null

  private config: Required<Pick<McpTransportConfig, 'url' | 'timeout'>> &
    Partial<Pick<McpTransportConfig, 'headers' | 'authToken' | 'reconnect' | 'maxReconnectAttempts' | 'reconnectDelayMs' | 'exponentialBackoff'>>

  constructor(config: McpTransportConfig) {
    if (!config.url) {
      throw new Error('WebSocket transport requires a url')
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
   * Open WebSocket connection to remote server.
   */
  async connect(): Promise<void> {
    if (this._state !== 'disconnected') {
      throw new Error(`Cannot connect: already in state ${this._state}`)
    }

    this._state = 'connecting'
    this.reconnectCount = 0

    return this.openWebSocket()
  }

  /**
   * Close WebSocket connection.
   */
  async disconnect(): Promise<void> {
    this._state = 'disconnected'

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }

    if (this.wsInstance) {
      this.wsInstance.close(1000, 'Normal closure')
      this.wsInstance = null
    }
  }

  /**
   * Send JSON-RPC message via WebSocket.
   */
  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Transport not connected')
    }

    if (!this.wsInstance) {
      throw new Error('WebSocket not initialized')
    }

    return new Promise((resolve, reject) => {
      const json = JSON.stringify(message)
      this.wsInstance!.send(json, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
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
    return this._state === 'connected' && this.wsInstance?.readyState === ws.WebSocket.OPEN
  }

  /**
   * Internal: open WebSocket connection.
   */
  private openWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const headers: Record<string, string> = {
          ...this.config.headers,
        }

        if (this.config.authToken) {
          headers['Authorization'] = `Bearer ${this.config.authToken}`
        }

        const timeout = setTimeout(() => {
          if (this.wsInstance) {
            this.wsInstance.close(1002, 'Connection timeout')
          }
          reject(new Error('WebSocket connection timeout'))
        }, this.config.timeout)

        this.wsInstance = new ws.WebSocket(this.config.url, {
          headers,
          handshakeTimeout: this.config.timeout,
        })

        this.wsInstance.on('open', () => {
          clearTimeout(timeout)
          this._state = 'connected'
          this.reconnectCount = 0

          // Start ping interval for keepalive (every 30 seconds)
          this.pingInterval = setInterval(() => {
            if (this.wsInstance?.readyState === ws.WebSocket.OPEN) {
              this.wsInstance.ping()
            }
          }, 30000)

          resolve()
        })

        this.wsInstance.on('message', (data: ws.RawData) => {
          try {
            const text = data.toString('utf-8')
            const message = JSON.parse(text) as JsonRpcMessage
            this.messageHandlers.forEach(h => h(message))
          } catch (err) {
            const error = new Error(`Failed to parse WebSocket message: ${err}`)
            this.errorHandlers.forEach(h => h(error))
          }
        })

        this.wsInstance.on('error', (err: Error) => {
          clearTimeout(timeout)
          this._state = 'error'
          this.errorHandlers.forEach(h => h(err))
        })

        this.wsInstance.on('close', (code: number, reason: string) => {
          clearTimeout(timeout)

          if (this.pingInterval) {
            clearInterval(this.pingInterval)
            this.pingInterval = null
          }

          this._state = 'disconnected'

          // Don't reconnect if closed normally or due to server terminating connection
          if (code === 1000) {
            this.closeHandlers.forEach(h => h())
            return
          }

          // Try to reconnect on abnormal closure
          if (this.config.reconnect && this.reconnectCount < (this.config.maxReconnectAttempts ?? 5)) {
            this.scheduleReconnect()
          } else if (this.reconnectCount >= (this.config.maxReconnectAttempts ?? 5)) {
            const error = new Error('Max reconnection attempts reached')
            this.errorHandlers.forEach(h => h(error))
          } else {
            this.closeHandlers.forEach(h => h())
          }
        })

        this.wsInstance.on('pong', () => {
          // Pong received (keepalive acknowledged)
        })
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
      this.openWebSocket().catch(err => {
        this.errorHandlers.forEach(h => h(err))
      })
    }, delay)
  }
}
