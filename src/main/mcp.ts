/**
 * MCP Server Configuration Manager
 *
 * Reads/writes the claude_desktop_config.json-compatible config file.
 * Manages which local MCP servers are active and passes them to OpenClaw.
 */

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>
}

const CONFIG_PATH = path.join(app.getPath('userData'), 'nyra_mcp_config.json')

export function readMcpConfig(): McpConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { mcpServers: {} }
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as McpConfig
  } catch {
    return { mcpServers: {} }
  }
}

export function writeMcpConfig(config: McpConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

export function addMcpServer(name: string, server: McpServerConfig): void {
  const config = readMcpConfig()
  config.mcpServers[name] = server
  writeMcpConfig(config)
}

export function removeMcpServer(name: string): void {
  const config = readMcpConfig()
  delete config.mcpServers[name]
  writeMcpConfig(config)
}

export function listMcpServers(): Record<string, McpServerConfig> {
  return readMcpConfig().mcpServers
}
