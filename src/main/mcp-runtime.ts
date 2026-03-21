/**
 * MCP Server Runtime Engine
 *
 * Manages the full lifecycle of MCP (Model Context Protocol) servers:
 * - Spawns stdio-based servers as child processes
 * - Speaks JSON-RPC 2.0 over stdin/stdout with Content-Length framing
 * - Tracks health, auto-restarts on crash, cleans up on app exit
 * - Exposes tools/resources from running servers to agents
 *
 * Protocol: https://spec.modelcontextprotocol.io/
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { app } from 'electron'
import { McpServerConfig, readMcpConfig } from './mcp'

// ── JSON-RPC 2.0 Types ───────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

// ── MCP Protocol Types ───────────────────────────────────────────────────────

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>  // JSON Schema
}

export interface McpResource {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  isError?: boolean
}

export interface McpServerStatus {
  id: string
  name: string
  config: McpServerConfig
  state: 'starting' | 'ready' | 'error' | 'stopped'
  pid?: number
  tools: McpTool[]
  resources: McpResource[]
  error?: string
  startedAt?: number
  restartCount: number
}

// ── Content-Length Framed Reader ──────────────────────────────────────────────
// MCP uses HTTP-style Content-Length framing over stdio:
//   Content-Length: 42\r\n
//   \r\n
//   {"jsonrpc":"2.0",...}

class FrameReader {
  private buffer = ''
  private onMessage: (msg: unknown) => void

  constructor(onMessage: (msg: unknown) => void) {
    this.onMessage = onMessage
  }

  feed(chunk: string): void {
    this.buffer += chunk
    this.drain()
  }

  private drain(): void {
    while (true) {
      // Look for Content-Length header
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

      if (this.buffer.length < bodyEnd) return // incomplete body

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

// ── MCP Server Connection ────────────────────────────────────────────────────

const MAX_RESTART_ATTEMPTS = 3
const RESTART_DELAY_MS = 2000
const INIT_TIMEOUT_MS = 15000

class McpServerConnection extends EventEmitter {
  readonly id: string
  readonly name: string
  readonly config: McpServerConfig

  private process: ChildProcess | null = null
  private reader: FrameReader | null = null
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void
    reject: (reason: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  private nextId = 1
  private _state: McpServerStatus['state'] = 'stopped'
  private _tools: McpTool[] = []
  private _resources: McpResource[] = []
  private _error?: string
  private _startedAt?: number
  private _restartCount = 0

  constructor(id: string, name: string, config: McpServerConfig) {
    super()
    this.id = id
    this.name = name
    this.config = config
  }

  get status(): McpServerStatus {
    return {
      id: this.id,
      name: this.name,
      config: this.config,
      state: this._state,
      pid: this.process?.pid,
      tools: this._tools,
      resources: this._resources,
      error: this._error,
      startedAt: this._startedAt,
      restartCount: this._restartCount,
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this._state === 'ready' || this._state === 'starting') return

    this._state = 'starting'
    this._error = undefined
    this.emit('state-change', this.status)

    try {
      await this.spawnProcess()
      await this.initialize()
      await this.discoverCapabilities()

      this._state = 'ready'
      this._startedAt = Date.now()
      this.emit('state-change', this.status)
    } catch (err) {
      this._state = 'error'
      this._error = err instanceof Error ? err.message : String(err)
      this.emit('state-change', this.status)
      this.cleanup()
      throw err
    }
  }

  async stop(): Promise<void> {
    this._state = 'stopped'
    this.cleanup()
    this.emit('state-change', this.status)
  }

  async restart(): Promise<void> {
    await this.stop()
    this._restartCount++
    await this.start()
  }

  // ── MCP Protocol Methods ─────────────────────────────────────────────────

  async listTools(): Promise<McpTool[]> {
    const result = await this.sendRequest('tools/list', {}) as { tools: McpTool[] }
    this._tools = result.tools || []
    return this._tools
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    }) as McpToolResult
    return result
  }

  async listResources(): Promise<McpResource[]> {
    try {
      const result = await this.sendRequest('resources/list', {}) as { resources: McpResource[] }
      this._resources = result.resources || []
    } catch {
      // resources/list is optional — many servers don't implement it
      this._resources = []
    }
    return this._resources
  }

  // ── Internal: Process Spawning ───────────────────────────────────────────

  private async spawnProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ...(this.config.env || {}),
      }

      const proc = spawn(this.config.command, this.config.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
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
        // Log stderr but don't treat as fatal — many servers emit warnings
        console.warn(`[MCP:${this.name}] stderr: ${data.trim()}`)
      })

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn ${this.config.command}: ${err.message}`))
      })

      proc.on('exit', (code, signal) => {
        console.log(`[MCP:${this.name}] exited with code=${code} signal=${signal}`)
        this.handleProcessExit(code, signal)
      })

      // If process spawned successfully (has a pid), resolve
      if (proc.pid) {
        resolve()
      } else {
        // Wait briefly for the 'error' event
        setTimeout(() => reject(new Error(`Process failed to start: ${this.config.command}`)), 3000)
      }
    })
  }

  // ── Internal: MCP Initialize Handshake ───────────────────────────────────

  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: false },
      },
      clientInfo: {
        name: 'nyra-desktop',
        version: app.getVersion(),
      },
    }, INIT_TIMEOUT_MS)

    // Send initialized notification (no response expected)
    this.sendNotification('notifications/initialized', {})

    console.log(`[MCP:${this.name}] initialized:`, JSON.stringify(result).slice(0, 200))
  }

  // ── Internal: Discover Tools & Resources ─────────────────────────────────

  private async discoverCapabilities(): Promise<void> {
    await this.listTools()
    await this.listResources()
    console.log(`[MCP:${this.name}] discovered ${this._tools.length} tools, ${this._resources.length} resources`)
  }

  // ── Internal: JSON-RPC Transport ─────────────────────────────────────────

  private sendRequest(method: string, params: Record<string, unknown>, timeoutMs = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        return reject(new Error(`Server ${this.name} stdin not writable`))
      }

      const id = this.nextId++
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timer })
      this.writeMessage(request)
    })
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    }
    this.writeMessage(notification)
  }

  private writeMessage(msg: unknown): void {
    const json = JSON.stringify(msg)
    const frame = `Content-Length: ${Buffer.byteLength(json, 'utf-8')}\r\n\r\n${json}`
    this.process?.stdin?.write(frame)
  }

  private handleMessage(msg: unknown): void {
    const message = msg as JsonRpcResponse | JsonRpcNotification

    // Check if it's a response (has an id)
    if ('id' in message && typeof message.id === 'number') {
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingRequests.delete(message.id)
        const response = message as JsonRpcResponse
        if (response.error) {
          pending.reject(new Error(`${response.error.message} (code: ${response.error.code})`))
        } else {
          pending.resolve(response.result)
        }
      }
    }

    // Check if it's a notification (no id)
    if (!('id' in message) && 'method' in message) {
      this.emit('notification', message)
    }
  }

  // ── Internal: Process Exit & Auto-Restart ────────────────────────────────

  private handleProcessExit(_code: number | null, _signal: string | null): void {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`Server ${this.name} process exited`))
      this.pendingRequests.delete(id)
    }

    if (this._state === 'stopped') return // Intentional stop

    // Auto-restart if under limit
    if (this._restartCount < MAX_RESTART_ATTEMPTS) {
      console.log(`[MCP:${this.name}] auto-restarting (attempt ${this._restartCount + 1}/${MAX_RESTART_ATTEMPTS})...`)
      this._state = 'error'
      this._error = 'Process exited unexpectedly, restarting...'
      this.emit('state-change', this.status)

      setTimeout(() => {
        this._restartCount++
        this.start().catch(err => {
          console.error(`[MCP:${this.name}] auto-restart failed:`, err)
        })
      }, RESTART_DELAY_MS)
    } else {
      this._state = 'error'
      this._error = `Process exited after ${MAX_RESTART_ATTEMPTS} restart attempts`
      this.emit('state-change', this.status)
    }
  }

  // ── Internal: Cleanup ────────────────────────────────────────────────────

  private cleanup(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Server shutting down'))
      this.pendingRequests.delete(id)
    }

    if (this.process) {
      try {
        this.process.kill('SIGTERM')
        // Force kill after 5 seconds if still alive
        const proc = this.process
        setTimeout(() => {
          try { proc.kill('SIGKILL') } catch { /* already dead */ }
        }, 5000)
      } catch { /* already dead */ }
      this.process = null
    }

    this.reader = null
  }
}

// ── MCP Runtime Manager (Singleton) ──────────────────────────────────────────

class McpRuntime extends EventEmitter {
  private servers = new Map<string, McpServerConnection>()

  /**
   * Start an MCP server from config
   */
  async startServer(name: string, config: McpServerConfig): Promise<McpServerStatus> {
    // Stop existing server with same name if running
    if (this.servers.has(name)) {
      await this.stopServer(name)
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const conn = new McpServerConnection(id, name, config)

    conn.on('state-change', (status: McpServerStatus) => {
      this.emit('server-state-change', status)
    })

    conn.on('notification', (notification: JsonRpcNotification) => {
      this.emit('server-notification', { serverId: id, notification })
    })

    this.servers.set(name, conn)
    await conn.start()
    return conn.status
  }

  /**
   * Stop a running MCP server
   */
  async stopServer(name: string): Promise<void> {
    const conn = this.servers.get(name)
    if (conn) {
      await conn.stop()
      this.servers.delete(name)
    }
  }

  /**
   * Get status of all servers
   */
  listRunning(): McpServerStatus[] {
    return Array.from(this.servers.values()).map(s => s.status)
  }

  /**
   * Get a specific server status
   */
  getServerStatus(name: string): McpServerStatus | null {
    return this.servers.get(name)?.status || null
  }

  /**
   * List all tools across all running servers
   */
  getAllTools(): Array<McpTool & { serverId: string; serverName: string }> {
    const allTools: Array<McpTool & { serverId: string; serverName: string }> = []
    for (const [, conn] of this.servers) {
      if (conn.status.state !== 'ready') continue
      for (const tool of conn.status.tools) {
        allTools.push({
          ...tool,
          serverId: conn.status.id,
          serverName: conn.status.name,
        })
      }
    }
    return allTools
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const conn = this.servers.get(serverName)
    if (!conn) throw new Error(`Server not found: ${serverName}`)
    if (conn.status.state !== 'ready') throw new Error(`Server ${serverName} is not ready (state: ${conn.status.state})`)
    return conn.callTool(toolName, args)
  }

  /**
   * Refresh tool list for a server
   */
  async refreshTools(serverName: string): Promise<McpTool[]> {
    const conn = this.servers.get(serverName)
    if (!conn) throw new Error(`Server not found: ${serverName}`)
    return conn.listTools()
  }

  /**
   * Start all servers from saved config
   */
  async startAllFromConfig(): Promise<void> {
    const config = readMcpConfig()
    const results: Array<{ name: string; success: boolean; error?: string }> = []

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        await this.startServer(name, serverConfig)
        results.push({ name, success: true })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[McpRuntime] Failed to start ${name}:`, errMsg)
        results.push({ name, success: false, error: errMsg })
      }
    }

    console.log(`[McpRuntime] Started ${results.filter(r => r.success).length}/${results.length} servers`)
  }

  /**
   * Stop all running servers — call on app quit
   */
  async shutdownAll(): Promise<void> {
    const names = Array.from(this.servers.keys())
    await Promise.all(names.map(name => this.stopServer(name)))
    console.log(`[McpRuntime] All ${names.length} servers stopped`)
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const mcpRuntime = new McpRuntime()
