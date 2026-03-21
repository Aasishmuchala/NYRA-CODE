/**
 * Transport Factory
 *
 * Creates the appropriate McpTransport instance based on configuration.
 * This is the entry point for creating transports in the Nyra system.
 */

import { McpTransport, McpTransportConfig } from './transport-interface'
import { StdioTransport } from './stdio-transport'
import { SSETransport } from './sse-transport'
import { WebSocketTransport } from './websocket-transport'
import { HttpTransport } from './http-transport'

/**
 * Create a transport instance from configuration.
 *
 * Routes to the appropriate implementation based on config.type.
 *
 * @example
 * // Local stdio server
 * const transport = createTransport({
 *   type: 'stdio',
 *   command: 'node',
 *   args: ['/path/to/server.js']
 * })
 *
 * @example
 * // Remote WebSocket server
 * const transport = createTransport({
 *   type: 'websocket',
 *   url: 'ws://localhost:3000/mcp',
 *   authToken: 'token-123'
 * })
 */
export function createTransport(config: McpTransportConfig): McpTransport {
  switch (config.type) {
    case 'stdio':
      return new StdioTransport(config)
    case 'sse':
      return new SSETransport(config)
    case 'websocket':
      return new WebSocketTransport(config)
    case 'http':
      return new HttpTransport(config)
    default:
      // TypeScript exhaustiveness check
      const exhaustive: never = config.type
      throw new Error(`Unknown transport type: ${exhaustive}`)
  }
}

/**
 * Validate a transport configuration.
 *
 * Checks that all required fields for the given transport type are present.
 */
export function validateTransportConfig(config: McpTransportConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config.type) {
    errors.push('Missing required field: type')
    return { valid: false, errors }
  }

  switch (config.type) {
    case 'stdio':
      if (!config.command) {
        errors.push('Stdio transport requires: command')
      }
      break

    case 'sse':
    case 'websocket':
    case 'http':
      if (!config.url) {
        errors.push(`${config.type.toUpperCase()} transport requires: url`)
      }
      break

    default:
      errors.push(`Unknown transport type: ${config.type}`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Helper to create a stdio transport with defaults.
 */
export function createStdioTransport(command: string, args?: string[], config?: Partial<McpTransportConfig>): McpTransport {
  return createTransport({
    type: 'stdio',
    command,
    args,
    ...config,
  })
}

/**
 * Helper to create a WebSocket transport with defaults.
 */
export function createWebSocketTransport(url: string, config?: Partial<McpTransportConfig>): McpTransport {
  return createTransport({
    type: 'websocket',
    url,
    ...config,
  })
}

/**
 * Helper to create an SSE transport with defaults.
 */
export function createSSETransport(url: string, config?: Partial<McpTransportConfig>): McpTransport {
  return createTransport({
    type: 'sse',
    url,
    ...config,
  })
}

/**
 * Helper to create an HTTP transport with defaults.
 */
export function createHttpTransport(url: string, config?: Partial<McpTransportConfig>): McpTransport {
  return createTransport({
    type: 'http',
    url,
    ...config,
  })
}
