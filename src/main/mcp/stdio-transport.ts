/**
 * Stdio Transport Implementation
 *
 * Spawns local MCP servers as child processes and communicates via
 * stdin/stdout using JSON-RPC 2.0 with HTTP Content-Length framing.
 *
 * This is the original transport model from mcp-runtime.ts, extracted
 * into the transport abstraction layer.
 */

import { spawn, ChildProcess } from 'child_process'
import { McpTransport, McpTransportConfig, JsonRpcMessage, TransportState } from './transport-interface'

/**
 * Content-Length frame reader for stdio streams.
 *
 * MCP uses HTTP-style Content-Length framing:
 *   Content-Length: 42\r\n
 *   \r\n
 *   {"jsonrpc":"2.0",...}
 */
class FrameReader {
  private buffer = ''
  private onMessage: (msg: unknown) => void

  constructor(onMessage: (msg: unknown) => void) {
    this.onMessage = onMessage
  }

  /**
   * Feed incoming chunk data into the reader.
   */
  feed(chunk: string): void {
    this.buffer += chunk
    this.drain()
  }

  /**
   * Attempt to parse and emit complete frames from buffer.
   */
  private drain(): void {
    while (true) {
      // Look for Content-Length header (ends with \r\n\r\n)
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return

      const header = this.buffer.slice(0, headerEnd)
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        // Skip malformed header — advance past the double CRLF
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }

      const contentLength = parseInt(match[1], 10)
      const bodyStart = headerEnd + 4
      const bodyEnd = bodyStart + contentLength

      if (this.buffer.length < bodyEnd) return // incomplete body, wait for more data

      const body = this.buffer.slice(bodyStart, bodyEnd)
      this.buffer = this.buffer.slice(bodyEnd)

      try {
        const parsed = JSON.parse(body)
        this.onMessage(parsed)
      } catch {
        // Skip malformed JSON
      }
    }
  }
}

/**
 * Stdio transport implementation.
 *
 * Spawns a child process and communicates with it via stdin/stdout.
 */
export class StdioTransport implements McpTransport {
  readonly type = 'stdio' as const

  private process: ChildProcess | null = null
  private reader: FrameReader | null = null
  private messageHandlers: Array<(msg: JsonRpcMessage) => void> = []
  private errorHandlers: Array<(err: Error) => void> = []
  private closeHandlers: Array<() => void> = []
  private _state: TransportState = 'disconnected'

  private config: Required<
    Pick<McpTransportConfig, 'command' | 'args' | 'env' | 'cwd' | 'timeout'>
  > & Partial<McpTransportConfig>

  constructor(config: McpTransportConfig) {
    this.config = {
      command: config.command || '',
      args: config.args || [],
      env: config.env || {},
      cwd: config.cwd || process.cwd(),
      timeout: config.timeout || 30000,
      ...config,
    }
  }

  get state(): TransportState {
    return this._state
  }

  /**
   * Spawn the child process and set up piping.
   */
  async connect(): Promise<void> {
    if (this._state !== 'disconnected') {
      throw new Error(`Cannot connect: already in state ${this._state}`)
    }

    this._state = 'connecting'

    return new Promise((resolve, reject) => {
      try {
        const env = {
          ...process.env,
          ...this.config.env,
        }

        const proc = spawn(this.config.command, this.config.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env,
          cwd: this.config.cwd,
          shell: process.platform === 'win32',
        })

        this.process = proc

        // Set up stdout reader with Content-Length framing
        this.reader = new FrameReader((msg) => this.handleMessage(msg))

        proc.stdout?.setEncoding('utf-8')
        proc.stdout?.on('data', (chunk: string) => {
          this.reader?.feed(chunk)
        })

        proc.stderr?.setEncoding('utf-8')
        proc.stderr?.on('data', (data: string) => {
          // Log stderr but don't treat as fatal
          console.warn(`[StdioTransport] stderr: ${data.trim()}`)
        })

        proc.on('error', (err) => {
          this._state = 'error'
          const error = new Error(`Failed to spawn ${this.config.command}: ${err.message}`)
          this.errorHandlers.forEach(h => h(error))
          reject(error)
        })

        proc.on('exit', (code, signal) => {
          this._state = 'disconnected'
          this.closeHandlers.forEach(h => h())
        })

        // If process spawned successfully (has a pid), resolve
        if (proc.pid) {
          this._state = 'connected'
          resolve()
        } else {
          // Wait briefly for the 'error' event
          setTimeout(() => {
            reject(new Error(`Process failed to start: ${this.config.command}`))
          }, 1000)
        }
      } catch (err) {
        this._state = 'error'
        reject(err)
      }
    })
  }

  /**
   * Terminate the child process.
   */
  async disconnect(): Promise<void> {
    if (this._state === 'disconnected') return

    this._state = 'disconnected'

    if (this.process) {
      try {
        this.process.kill('SIGTERM')
        // Force kill after 5 seconds if still alive
        const proc = this.process
        setTimeout(() => {
          try {
            proc.kill('SIGKILL')
          } catch {
            /* already dead */
          }
        }, 5000)
      } catch {
        /* already dead */
      }
      this.process = null
    }

    this.reader = null
  }

  /**
   * Send a JSON-RPC message to the process stdin.
   */
  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Transport not connected')
    }

    if (!this.process?.stdin?.writable) {
      throw new Error('Process stdin not writable')
    }

    const json = JSON.stringify(message)
    const frame = `Content-Length: ${Buffer.byteLength(json, 'utf-8')}\r\n\r\n${json}`

    return new Promise((resolve, reject) => {
      this.process?.stdin?.write(frame, (err) => {
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
    return this._state === 'connected' && this.process?.pid !== undefined
  }

  /**
   * Internal: route incoming message to handlers.
   */
  private handleMessage(msg: unknown): void {
    const message = msg as JsonRpcMessage
    this.messageHandlers.forEach(h => h(message))
  }
}
