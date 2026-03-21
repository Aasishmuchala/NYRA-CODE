/**
 * Desktop Tools — registers desktop control capabilities as AI-invocable tools.
 *
 * These tool definitions follow the OpenAI function-calling schema format
 * used by OpenClaw. Each tool maps to a desktop action that goes through
 * the safety pipeline before execution.
 *
 * Tool categories:
 *   computer.screenshot  — capture screen
 *   computer.click       — click at coordinates
 *   computer.type        — type text
 *   computer.scroll      — scroll at position
 *   computer.hotkey      — press keyboard shortcut
 *   computer.drag        — drag between coordinates
 *   app.launch           — launch an application
 *   app.focus            — bring app to front
 *   app.list             — list running apps
 *   window.active        — get active window info
 */

import type { ToolDefinition } from './providers/provider-interface'
import { desktopAgent } from './desktop-agent'
import type { DesktopAction, DesktopActionResult } from './desktop-agent'
import { captureScreen, captureWindow, listSources } from './screen'
import { listRunningApps, getActiveWindow } from './desktop-control'

// ── Tool definitions (JSON Schema) ───────────────────────────────────────────

export const DESKTOP_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'computer.screenshot',
    description: 'Capture a screenshot of the current screen. Returns a base64-encoded PNG image.',
    parameters: {
      type: 'object',
      properties: {
        window_title: {
          type: 'string',
          description: 'Optional: capture a specific window by title instead of the full screen',
        },
      },
    },
  },
  {
    name: 'computer.click',
    description: 'Click at specific coordinates on the screen.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default: left)' },
        double: { type: 'boolean', description: 'Double-click instead of single click' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'computer.type',
    description: 'Type text using the keyboard. The text will be entered at the current cursor position.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to type' },
      },
      required: ['text'],
    },
  },
  {
    name: 'computer.key',
    description: 'Press a single key (e.g., Enter, Escape, Tab, ArrowUp).',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The key to press (e.g., "return", "escape", "tab", "backspace")' },
      },
      required: ['key'],
    },
  },
  {
    name: 'computer.hotkey',
    description: 'Press a keyboard shortcut (e.g., Cmd+C, Ctrl+S).',
    parameters: {
      type: 'object',
      properties: {
        modifiers: {
          type: 'array',
          items: { type: 'string', enum: ['shift', 'ctrl', 'alt', 'command', 'meta'] },
          description: 'Modifier keys to hold',
        },
        key: { type: 'string', description: 'The main key to press' },
      },
      required: ['modifiers', 'key'],
    },
  },
  {
    name: 'computer.scroll',
    description: 'Scroll at specific coordinates.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Scroll amount (default: 5)' },
      },
      required: ['x', 'y', 'direction'],
    },
  },
  {
    name: 'computer.drag',
    description: 'Drag from one position to another.',
    parameters: {
      type: 'object',
      properties: {
        from_x: { type: 'number', description: 'Start X coordinate' },
        from_y: { type: 'number', description: 'Start Y coordinate' },
        to_x: { type: 'number', description: 'End X coordinate' },
        to_y: { type: 'number', description: 'End Y coordinate' },
      },
      required: ['from_x', 'from_y', 'to_x', 'to_y'],
    },
  },
  {
    name: 'app.launch',
    description: 'Launch an application by name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The application name (e.g., "Chrome", "Terminal", "Finder")' },
      },
      required: ['name'],
    },
  },
  {
    name: 'app.focus',
    description: 'Bring an application to the front.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The application name to focus' },
      },
      required: ['name'],
    },
  },
  {
    name: 'app.list',
    description: 'List all running applications.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'window.active',
    description: 'Get information about the currently active window.',
    parameters: { type: 'object', properties: {} },
  },
]

// ── Tool execution dispatcher ────────────────────────────────────────────────

/**
 * Execute a desktop tool call. Maps tool names to desktop actions,
 * routes through the safety pipeline via desktopAgent.
 */
export async function executeDesktopTool(
  toolName: string,
  args: Record<string, unknown>,
  taskId: string = 'tool-call'
): Promise<string> {
  // Read-only tools (no safety check needed)
  switch (toolName) {
    case 'computer.screenshot': {
      const windowTitle = args.window_title as string | undefined
      const capture = windowTitle
        ? await captureWindow(windowTitle)
        : await captureScreen()
      if (!capture) return JSON.stringify({ error: 'Screenshot failed' })
      return JSON.stringify({
        type: 'image',
        format: 'png',
        width: capture.width,
        height: capture.height,
        base64: capture.base64,
      })
    }
    case 'app.list': {
      const apps = listRunningApps()
      return JSON.stringify(apps)
    }
    case 'window.active': {
      const win = getActiveWindow()
      return JSON.stringify(win)
    }
  }

  // Action tools (go through safety pipeline)
  const action = mapToolToAction(toolName, args)
  if (!action) {
    return JSON.stringify({ error: `Unknown tool: ${toolName}` })
  }

  const result = await desktopAgent.executeSingleAction(action, taskId)
  return JSON.stringify({
    success: result.success,
    result: result.result,
    action: result.action.type,
  })
}

/**
 * Map a tool call to a DesktopAction.
 */
function mapToolToAction(toolName: string, args: Record<string, unknown>): DesktopAction | null {
  switch (toolName) {
    case 'computer.click':
      return {
        type: args.double ? 'desktop:mouse-double-click' : 'desktop:mouse-click',
        params: { x: args.x, y: args.y, button: args.button ?? 'left' },
        description: `Click at (${args.x}, ${args.y})`,
      }
    case 'computer.type':
      return {
        type: 'desktop:type-text',
        params: { text: args.text },
        description: `Type: "${String(args.text).slice(0, 50)}"`,
      }
    case 'computer.key':
      return {
        type: 'desktop:press-key',
        params: { key: args.key },
        description: `Press key: ${args.key}`,
      }
    case 'computer.hotkey':
      return {
        type: 'desktop:hotkey',
        params: { modifiers: args.modifiers, key: args.key },
        description: `Hotkey: ${Array.isArray(args.modifiers) ? args.modifiers.join('+') : ''}+${args.key}`,
      }
    case 'computer.scroll':
      return {
        type: 'desktop:mouse-scroll',
        params: { x: args.x, y: args.y, direction: args.direction, amount: args.amount ?? 5 },
        description: `Scroll ${args.direction} at (${args.x}, ${args.y})`,
      }
    case 'computer.drag':
      return {
        type: 'desktop:mouse-drag',
        params: { fromX: args.from_x, fromY: args.from_y, toX: args.to_x, toY: args.to_y },
        description: `Drag from (${args.from_x}, ${args.from_y}) to (${args.to_x}, ${args.to_y})`,
      }
    case 'app.launch':
      return {
        type: 'desktop:launch-app',
        params: { appName: args.name },
        description: `Launch app: ${args.name}`,
      }
    case 'app.focus':
      return {
        type: 'desktop:focus-app',
        params: { appName: args.name },
        description: `Focus app: ${args.name}`,
      }
    default:
      return null
  }
}

/**
 * Get all desktop tool definitions for registration with OpenClaw or any provider.
 */
export function getDesktopToolDefinitions(): ToolDefinition[] {
  return DESKTOP_TOOL_DEFINITIONS
}
