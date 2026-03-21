/**
 * MCP Transport Abstraction Layer — Public API
 *
 * Phase 1.2 of the Nyra 5-Year Domination Plan
 *
 * This module provides a unified interface for connecting to MCP servers
 * via different transport mechanisms: local stdio, SSE, WebSocket, or HTTP.
 */

// Core interfaces
export type { McpTransport, JsonRpcMessage, TransportState, McpTransportConfig } from './transport-interface'
export { isLocalTransport, isRemoteTransport } from './transport-interface'

// Transport implementations
export { StdioTransport } from './stdio-transport'
export { SSETransport } from './sse-transport'
export { WebSocketTransport } from './websocket-transport'
export { HttpTransport } from './http-transport'

// Factory
export {
  createTransport,
  validateTransportConfig,
  createStdioTransport,
  createWebSocketTransport,
  createSSETransport,
  createHttpTransport,
} from './transport-factory'
