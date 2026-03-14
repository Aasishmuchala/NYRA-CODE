/**
 * useDesktopTools — Hook that registers Nyra's built-in desktop tools
 * (screen capture, desktop control, ollama) with the OpenClaw gateway
 * and handles tool-call execution through the ActionConfirmation flow.
 *
 * Flow:  Gateway WS → tool.call event → approval check → IPC execute → tool.result WS
 */

import { useCallback, useRef, useState } from 'react'

// ── Tool definitions (sent to gateway so the AI knows what tools exist) ───────
export const NYRA_TOOLS = [
  {
    name: 'nyra_screenshot',
    description: 'Capture a screenshot of the entire screen. Returns a base64-encoded PNG image.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'nyra_screenshot_window',
    description: 'Capture a screenshot of a specific window by its title.',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string', description: 'Window title to capture' } },
      required: ['title'],
    },
  },
  {
    name: 'nyra_mouse_click',
    description: 'Click the mouse at screen coordinates (x, y).',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default: left)' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'nyra_mouse_move',
    description: 'Move the mouse cursor to screen coordinates (x, y).',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'nyra_type_text',
    description: 'Type text using the keyboard.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to type' } },
      required: ['text'],
    },
  },
  {
    name: 'nyra_press_key',
    description: 'Press a single key (e.g. "Return", "Escape", "Tab", "Delete").',
    parameters: {
      type: 'object',
      properties: { key: { type: 'string', description: 'Key name' } },
      required: ['key'],
    },
  },
  {
    name: 'nyra_hotkey',
    description: 'Press a keyboard shortcut (e.g. Command+C, Control+Shift+T).',
    parameters: {
      type: 'object',
      properties: {
        modifiers: { type: 'array', items: { type: 'string' }, description: 'Modifier keys (e.g. ["command","shift"])' },
        key: { type: 'string', description: 'Main key' },
      },
      required: ['modifiers', 'key'],
    },
  },
  {
    name: 'nyra_launch_app',
    description: 'Launch an application by name.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Application name' } },
      required: ['name'],
    },
  },
  {
    name: 'nyra_focus_app',
    description: 'Bring an application window to the front.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Application name' } },
      required: ['name'],
    },
  },
  {
    name: 'nyra_list_apps',
    description: 'List all currently running applications.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'nyra_active_window',
    description: 'Get info about the currently focused window (title, app, bounds).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'nyra_list_screens',
    description: 'List available screen and window capture sources.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
] as const

// ── Risk classification ──────────────────────────────────────────────────────
type Risk = 'low' | 'medium' | 'high'
const TOOL_RISK: Record<string, Risk> = {
  nyra_screenshot: 'low',
  nyra_screenshot_window: 'low',
  nyra_list_screens: 'low',
  nyra_list_apps: 'low',
  nyra_active_window: 'low',
  nyra_mouse_move: 'low',
  nyra_mouse_click: 'medium',
  nyra_type_text: 'medium',
  nyra_press_key: 'medium',
  nyra_hotkey: 'medium',
  nyra_focus_app: 'medium',
  nyra_launch_app: 'high',
}

export interface ToolCallRequest {
  callId: string
  toolName: string
  params: Record<string, unknown>
  risk: Risk
  description: string
}

export interface ToolCallResult {
  callId: string
  result?: unknown
  error?: string
}

// ── The hook ─────────────────────────────────────────────────────────────────
export function useDesktopTools() {
  const [pendingAction, setPendingAction] = useState<ToolCallRequest | null>(null)
  const [isDesktopControlActive, setIsDesktopControlActive] = useState(false)
  const alwaysAllowRef = useRef(new Set<string>())
  const resolverRef = useRef<{ resolve: (approved: boolean) => void } | null>(null)

  // Format a human-readable description of the tool call
  const describeToolCall = useCallback((toolName: string, params: Record<string, unknown>): string => {
    switch (toolName) {
      case 'nyra_screenshot': return 'Take a screenshot of the entire screen'
      case 'nyra_screenshot_window': return `Capture window "${params.title}"`
      case 'nyra_mouse_click': return `Click at (${params.x}, ${params.y})${params.button && params.button !== 'left' ? ` [${params.button}]` : ''}`
      case 'nyra_mouse_move': return `Move mouse to (${params.x}, ${params.y})`
      case 'nyra_type_text': return `Type: "${String(params.text).slice(0, 50)}${String(params.text).length > 50 ? '…' : ''}"`
      case 'nyra_press_key': return `Press key: ${params.key}`
      case 'nyra_hotkey': return `Hotkey: ${(params.modifiers as string[]).join('+')}+${params.key}`
      case 'nyra_launch_app': return `Launch app: ${params.name}`
      case 'nyra_focus_app': return `Focus app: ${params.name}`
      case 'nyra_list_apps': return 'List running applications'
      case 'nyra_active_window': return 'Get active window info'
      case 'nyra_list_screens': return 'List screen sources'
      default: return `Execute: ${toolName}`
    }
  }, [])

  // Request user approval (returns a promise that resolves when user decides)
  const requestApproval = useCallback((request: ToolCallRequest): Promise<boolean> => {
    // Auto-approve if always-allowed or low-risk
    if (alwaysAllowRef.current.has(request.toolName) || request.risk === 'low') {
      return Promise.resolve(true)
    }

    return new Promise((resolve) => {
      resolverRef.current = { resolve }
      setPendingAction(request)
    })
  }, [])

  const approve = useCallback(() => {
    resolverRef.current?.resolve(true)
    resolverRef.current = null
    setPendingAction(null)
  }, [])

  const deny = useCallback(() => {
    resolverRef.current?.resolve(false)
    resolverRef.current = null
    setPendingAction(null)
  }, [])

  const alwaysAllow = useCallback(() => {
    if (pendingAction) {
      alwaysAllowRef.current.add(pendingAction.toolName)
    }
    approve()
  }, [pendingAction, approve])

  // Execute a tool call via IPC
  const executeTool = useCallback(async (toolName: string, params: Record<string, unknown>): Promise<unknown> => {
    setIsDesktopControlActive(true)
    try {
      switch (toolName) {
        case 'nyra_screenshot': return await window.nyra.screen.capture()
        case 'nyra_screenshot_window': return await window.nyra.screen.captureWindow(params.title as string)
        case 'nyra_list_screens': return await window.nyra.screen.listSources()
        case 'nyra_mouse_click': return await window.nyra.desktop.mouseClick(params.x as number, params.y as number, params.button as string | undefined)
        case 'nyra_mouse_move': return await window.nyra.desktop.mouseMove(params.x as number, params.y as number)
        case 'nyra_type_text': return await window.nyra.desktop.typeText(params.text as string)
        case 'nyra_press_key': return await window.nyra.desktop.pressKey(params.key as string)
        case 'nyra_hotkey': return await window.nyra.desktop.hotkey(params.modifiers as string[], params.key as string)
        case 'nyra_launch_app': return await window.nyra.desktop.launchApp(params.name as string)
        case 'nyra_focus_app': return await window.nyra.desktop.focusApp(params.name as string)
        case 'nyra_list_apps': return await window.nyra.desktop.listApps()
        case 'nyra_active_window': return await window.nyra.desktop.activeWindow()
        default: throw new Error(`Unknown tool: ${toolName}`)
      }
    } finally {
      setTimeout(() => setIsDesktopControlActive(false), 1000)
    }
  }, [])

  // Main handler — called from the WS onmessage when a tool.call arrives
  const handleToolCall = useCallback(async (
    callId: string,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolCallResult> => {
    // Check if this is one of our tools
    if (!NYRA_TOOLS.some(t => t.name === toolName)) {
      return { callId, error: `Unknown tool: ${toolName}` }
    }

    const risk = TOOL_RISK[toolName] ?? 'medium'
    const description = describeToolCall(toolName, params)
    const request: ToolCallRequest = { callId, toolName, params, risk, description }

    // Request approval
    const approved = await requestApproval(request)
    if (!approved) {
      return { callId, error: 'User denied the action' }
    }

    // Execute
    try {
      const result = await executeTool(toolName, params)
      return { callId, result }
    } catch (err) {
      return { callId, error: err instanceof Error ? err.message : String(err) }
    }
  }, [describeToolCall, requestApproval, executeTool])

  // Quick screen capture (for the ChatInput button — no approval needed)
  const quickScreenCapture = useCallback(async (): Promise<{ base64: string; width: number; height: number } | null> => {
    return window.nyra.screen.capture()
  }, [])

  return {
    // Tool handling
    handleToolCall,
    isNyraTool: (name: string) => NYRA_TOOLS.some(t => t.name === name),
    NYRA_TOOLS,

    // Approval UI
    pendingAction,
    approve,
    deny,
    alwaysAllow,

    // State
    isDesktopControlActive,
    quickScreenCapture,
  }
}
