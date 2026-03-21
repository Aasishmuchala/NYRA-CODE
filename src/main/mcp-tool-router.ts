/**
 * MCP Tool Router
 *
 * Aggregates tools from all running MCP servers into a unified registry.
 * Routes tool calls to the correct server, handles permissions via the
 * approval pipeline, and converts results for agent consumption.
 *
 * This is the bridge between the agent orchestrator and MCP servers.
 */

import { mcpRuntime, type McpToolResult } from './mcp-runtime'
import { needsApproval, requestApproval, respondToApproval, type ActionRisk } from './approval-pipeline'
import { logAction } from './audit-log'

// ── Types ────────────────────────────────────────────────────────────────────

export interface UnifiedTool {
  /** Globally unique: "serverName::toolName" */
  qualifiedName: string
  /** Original tool name from the MCP server */
  toolName: string
  /** Server that provides this tool */
  serverName: string
  serverId: string
  /** Tool metadata */
  description: string
  inputSchema: Record<string, unknown>
  /** Computed risk level for approval pipeline */
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical'
}

export interface ToolCallRequest {
  qualifiedName: string
  arguments: Record<string, unknown>
  taskId?: string
  agentId?: string
}

export interface ToolCallResponse {
  success: boolean
  content: string
  rawResult?: McpToolResult
  error?: string
  executionTimeMs: number
}

// ── Risk Classification ──────────────────────────────────────────────────────
// Map tool name patterns to risk levels.
// This ensures MCP tools go through the same approval pipeline as native actions.

const RISK_PATTERNS: Array<{ pattern: RegExp; risk: ActionRisk }> = [
  // Read-only operations are safe
  { pattern: /^(read|get|list|search|query|fetch|describe|show)/i, risk: 'safe' },
  // Write operations need more scrutiny
  { pattern: /^(create|add|insert|post|upload)/i, risk: 'medium' },
  { pattern: /^(update|edit|modify|patch|set)/i, risk: 'medium' },
  { pattern: /^(delete|remove|drop|destroy|purge)/i, risk: 'high' },
  // System/exec operations are high risk
  { pattern: /^(execute|run|exec|shell|command|eval)/i, risk: 'high' },
  // Send/publish operations are high risk (data exfiltration concern)
  { pattern: /^(send|publish|push|deploy|broadcast)/i, risk: 'high' },
]

function classifyToolRisk(toolName: string, _serverName: string): ActionRisk {
  for (const { pattern, risk } of RISK_PATTERNS) {
    if (pattern.test(toolName)) return risk
  }
  // Default: medium (unknown tools get human review)
  return 'medium'
}

// ── Tool Registry ────────────────────────────────────────────────────────────

/**
 * Get all available tools across all running MCP servers.
 * Returns a unified list with globally unique qualified names.
 */
export function getUnifiedToolRegistry(): UnifiedTool[] {
  const rawTools = mcpRuntime.getAllTools()

  return rawTools.map(tool => ({
    qualifiedName: `${tool.serverName}::${tool.name}`,
    toolName: tool.name,
    serverName: tool.serverName,
    serverId: tool.serverId,
    description: tool.description || `Tool: ${tool.name}`,
    inputSchema: (tool.inputSchema || {}) as Record<string, unknown>,
    riskLevel: classifyToolRisk(tool.name, tool.serverName),
  }))
}

/**
 * Find a tool by its qualified name ("serverName::toolName")
 */
export function findTool(qualifiedName: string): UnifiedTool | null {
  const registry = getUnifiedToolRegistry()
  return registry.find(t => t.qualifiedName === qualifiedName) || null
}

/**
 * Get tools for a specific server
 */
export function getServerTools(serverName: string): UnifiedTool[] {
  return getUnifiedToolRegistry().filter(t => t.serverName === serverName)
}

// ── Tool Execution ───────────────────────────────────────────────────────────

/**
 * Execute a tool call with approval pipeline integration.
 *
 * Flow:
 * 1. Resolve tool from qualified name
 * 2. Check risk level against approval pipeline
 * 3. If approved, call the tool on the MCP server
 * 4. Log the action to audit trail
 * 5. Return formatted result
 */
export async function executeToolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
  const startTime = Date.now()

  // 1. Resolve the tool
  const tool = findTool(request.qualifiedName)
  if (!tool) {
    return {
      success: false,
      content: '',
      error: `Tool not found: ${request.qualifiedName}`,
      executionTimeMs: Date.now() - startTime,
    }
  }

  // 2. Check approval pipeline
  const actionType = `mcp:${tool.riskLevel}`
  const requiresApproval = needsApproval(actionType, 'read_only')

  if (requiresApproval) {
    // Create an approval request via the existing pipeline
    const approval = requestApproval(
      request.taskId || 'manual',
      request.agentId || null,
      `mcp:tool:${tool.toolName}`,
      `MCP tool call: ${tool.qualifiedName}`,
      {
        serverName: tool.serverName,
        toolName: tool.toolName,
        arguments: request.arguments,
        riskLevel: tool.riskLevel,
      }
    )

    // Auto-approve safe/low risk. Medium+ waits for user.
    if (tool.riskLevel === 'safe' || tool.riskLevel === 'low') {
      respondToApproval(approval.id, 'approved')
    } else {
      return {
        success: false,
        content: '',
        error: `Tool call requires approval (risk: ${tool.riskLevel}). Approval ID: ${approval.id}`,
        executionTimeMs: Date.now() - startTime,
      }
    }
  }

  // 3. Execute the tool
  try {
    const result = await mcpRuntime.callTool(tool.serverName, tool.toolName, request.arguments)

    // 4. Log to audit trail
    logAction({
      taskId: request.taskId || null,
      agentId: request.agentId || null,
      action: `mcp:tool:${tool.toolName}`,
      target: `${tool.serverName}::${tool.toolName}`,
      details: {
        server: tool.serverName,
        tool: tool.toolName,
        args: request.arguments,
        isError: result.isError,
      },
      reversible: false,
      snapshotId: null,
    })

    // 5. Format result — extract text content
    const textContent = result.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text)
      .join('\n')

    return {
      success: !result.isError,
      content: textContent || JSON.stringify(result.content),
      rawResult: result,
      error: result.isError ? textContent : undefined,
      executionTimeMs: Date.now() - startTime,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)

    logAction({
      taskId: request.taskId || null,
      agentId: request.agentId || null,
      action: `mcp:tool:${tool.toolName}:error`,
      target: `${tool.serverName}::${tool.toolName}`,
      details: { server: tool.serverName, error: errMsg },
      reversible: false,
      snapshotId: null,
    })

    return {
      success: false,
      content: '',
      error: errMsg,
      executionTimeMs: Date.now() - startTime,
    }
  }
}

// ── Agent Integration Helpers ────────────────────────────────────────────────

/**
 * Convert unified tools into OpenAI-compatible function definitions
 * for injection into LLM function-calling arrays.
 */
export function toolsToFunctionDefs(): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}> {
  return getUnifiedToolRegistry().map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.qualifiedName.replace('::', '__'), // LLM-safe name
      description: `[MCP:${tool.serverName}] ${tool.description}`,
      parameters: tool.inputSchema,
    },
  }))
}

/**
 * Estimate token cost of including MCP tools in context.
 * ~50 tokens per tool (name + description + basic schema).
 */
export function estimateToolTokens(): number {
  return getUnifiedToolRegistry().length * 50
}

/**
 * Get all tool definitions (MCP + desktop) in OpenAI function-calling format.
 * This is the primary entry point for building the tool list sent to the LLM.
 */
export function getAllToolDefinitions(): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}> {
  const mcpTools = toolsToFunctionDefs()

  // Lazy-import desktop tools to avoid circular dependency
  let desktopTools: Array<{
    type: 'function'
    function: { name: string; description: string; parameters: Record<string, unknown> }
  }> = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dt = require('./desktop-tools') as typeof import('./desktop-tools')
    desktopTools = dt.getDesktopToolDefinitions().map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))
  } catch {
    // Desktop tools not available (e.g., test environment)
  }

  return [...mcpTools, ...desktopTools]
}

/**
 * Get a summary of available MCP capabilities for context injection.
 */
export function getCapabilitySummary(): string {
  const servers = mcpRuntime.listRunning().filter(s => s.state === 'ready')

  // Count desktop tools
  let desktopToolCount = 0
  try {
    const dt = require('./desktop-tools') as typeof import('./desktop-tools')
    desktopToolCount = dt.getDesktopToolDefinitions().length
  } catch { /* ignore */ }

  const lines: string[] = []

  if (desktopToolCount > 0) {
    lines.push(`- Desktop Agent: ${desktopToolCount} tools (screenshot, click, type, key, hotkey, scroll, drag, launch, focus, list-apps, active-window)`)
  }

  for (const s of servers) {
    const toolNames = s.tools.map(t => t.name).join(', ')
    lines.push(`- ${s.name}: ${s.tools.length} tools (${toolNames})`)
  }

  if (lines.length === 0) return 'No tools available.'
  return `Available tool capabilities:\n${lines.join('\n')}`
}
