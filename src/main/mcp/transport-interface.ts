/**
 * MCP Transport Abstraction — Phase 1.2 of the Nyra 5-Year Plan
 *
 * Abstracts the transport layer so MCP servers can be connected via
 * stdio (local), SSE (cloud), WebSocket (real-time), or HTTP (RESTful).
 *
 * This file defines the core interfaces that all transport implementations
 * must satisfy, enabling seamless switching between different connection types.
 */

/**
 * JSON-RPC 2.0 message format union type.
 * Can represent requests, responses, or notifications.
 */
export interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/**
 * Transport connection state enumeration.
 */
export type TransportState = 'disconnected' | 'connecting' | 'connected' | 'error'

/**
 * Core transport abstraction interface.
 * All transport implementations (stdio, SSE, WebSocket, HTTP) must implement this.
 */
export interface McpTransport {
  /**
   * Type of transport (for identification and logging).
   */
  readonly type: 'stdio' | 'sse' | 'websocket' | 'http'

  /**
   * Current connection state.
   */
  readonly state: TransportState

  /**
   * Establish connection to the MCP server.
   * For stdio: spawns child process.
   * For remote: opens HTTP/WebSocket/SSE connection.
   */
  connect(): Promise<void>

  /**
   * Close connection and clean up resources.
   */
  disconnect(): Promise<void>

  /**
   * Send a JSON-RPC message to the MCP server.
   */
  send(message: JsonRpcMessage): Promise<void>

  /**
   * Register handler for incoming messages.
   * Handler should be called whenever a complete JSON-RPC message arrives.
   */
  onMessage(handler: (msg: JsonRpcMessage) => void): void

  /**
   * Register handler for transport errors.
   */
  onError(handler: (err: Error) => void): void

  /**
   * Register handler for connection close/disconnect.
   */
  onClose(handler: () => void): void

  /**
   * Check if transport is currently connected.
   */
  isConnected(): boolean
}

/**
 * Configuration object for creating transports.
 * Different transports use different subset of fields.
 */
export interface McpTransportConfig {
  /**
   * Transport type determines which implementation to use.
   */
  type: 'stdio' | 'sse' | 'websocket' | 'http'

  // ── Stdio-specific config ─────────────────────────────────────────
  /** Command to spawn (e.g., "node", "/usr/local/bin/python3") */
  command?: string

  /** Arguments to pass to command */
  args?: string[]

  /** Environment variables for spawned process */
  env?: Record<string, string>

  /** Working directory for spawned process */
  cwd?: string

  // ── Remote (SSE/WebSocket/HTTP) config ───────────────────────────
  /** URL to connect to (e.g., "http://localhost:3000/mcp", "ws://server.com/mcp") */
  url?: string

  /** Additional HTTP headers (useful for Authorization, User-Agent, etc.) */
  headers?: Record<string, string>

  /** Auth token for Bearer authentication (sets Authorization header) */
  authToken?: string

  // ── Common config for all transports ──────────────────────────────
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number

  /** Auto-reconnect on disconnect (default: true for remote transports) */
  reconnect?: boolean

  /** Maximum reconnection attempts (default: 5) */
  maxReconnectAttempts?: number

  /** Delay between reconnection attempts in ms (default: 1000) */
  reconnectDelayMs?: number

  /** Enable exponential backoff for reconnection delays (default: true) */
  exponentialBackoff?: boolean
}

/**
 * Helper to check if a config is for a local (stdio) transport.
 */
export function isLocalTransport(config: McpTransportConfig): boolean {
  return config.type === 'stdio'
}

/**
 * Helper to check if a config is for a remote transport.
 */
export function isRemoteTransport(config: McpTransportConfig): boolean {
  return config.type === 'sse' || config.type === 'websocket' || config.type === 'http'
}
