/**
 * Full IPC Handler Registry — all renderer <-> main channels
 * v2 — adds Projects, Prompts, Theme, text-write, ⌘K shortcut channel
 */
import { ipcMain, shell, dialog, BrowserWindow, app, nativeTheme } from 'electron'

// ── Year 1-5 Services ──────────────────────────────────────────────────────────
import { channelRouter } from './channels/channel-router'
import { pluginSandbox } from './marketplace/plugin-sandbox'
import { nyraGuard } from './marketplace/nyra-guard'
import { telemetryService } from './telemetry'
import { priorityQueue, sharedWorkspace, pipeline } from './agents/collaboration'
import { voiceEngine } from './voice-engine'
import { modelRouter } from './model-router-year2'
import { securityScanner } from './marketplace/security-scanner'
import { rbacManager, ssoProvider, teamManager } from './enterprise/sso-rbac'
import { policyEngine } from './enterprise/policy-engine'
import { adminConsole } from './enterprise/admin-console'
import { verticalAgentManager } from './enterprise/vertical-agents'
import { proceduralMemory, feedbackLoop } from './platform/self-improving'
import { crossOrgProtocol, agentMarketplace } from './platform/cross-org-protocol'
import { mobileBridge } from './platform/mobile-bridge'
import { systemOverlay } from './os-integration/system-overlay'
import { i18n } from './os-integration/i18n'
import { agentNetwork } from './os-integration/agent-network'
import { openClawManager } from './openclaw'
import { PROXY_WS_URL } from './wsproxy'
import { listMcpServers, addMcpServer, removeMcpServer, McpServerConfig } from './mcp'
import { mcpRuntime } from './mcp-runtime'
import { getUnifiedToolRegistry, executeToolCall, getCapabilitySummary } from './mcp-tool-router'
import {
  listProviders, getCatalog, saveApiKey, removeApiKey,
  setActiveModel, resolveProvider, syncProvidersToOpenClaw
} from './providers'
import { switchActiveModel, readAuthProfiles, getDefaultProvider } from './auth-profiles'
import { startOAuthFlow, startGitHubDeviceFlow, getOAuthAvailability } from './oauth'
import { sendNotification } from './notifications'
import { captureScreen, captureWindow, listSources } from './screen'
import {
  mouseMove, mouseClick, mouseDoubleClick, mouseScroll, mouseDrag,
  typeText, pressKey, hotkey,
  launchApp, listRunningApps, focusApp, getActiveWindow,
} from './desktop-control'
import { isOllamaRunning, getOllamaModels, getOllamaProviderDef, syncOllamaToOpenClaw, pullModel, deleteModel, getModelInfo } from './ollama'
import { modelHub } from './model-hub'
import { semanticMemory } from './semantic-memory'
import { desktopAgent } from './desktop-agent'
import { setTrustMode, getTrustMode, getTrustRules, resetTrustRules, getActionHistory } from './desktop-safety'
import { executeDesktopTool, getDesktopToolDefinitions } from './desktop-tools'
import { computerUseBridge } from './computer-use-bridge'
import { composerEngine } from './composer-engine'
import { automationEngine } from './automations'
import { knowledgeStacks } from './knowledge-stacks'
import { globalShortcutsManager } from './global-shortcuts'
import { browserPreview } from './browser-preview'
import { browserAgent } from './browser-agent'
import { workflowRecipes } from './workflow-recipes'
import {
  discoverPlugins, loadPlugin, unloadPlugin, installPlugin, removePlugin,
  enablePlugin, disablePlugin, getInstalledPlugins, getPluginTools
} from './plugins'
import {
  browseSkills, installSkill, removeSkill, getInstalledSkills,
  enableSkill, disableSkill
} from './skills-marketplace'
import {
  getGuardConfig, setGuardConfig, saveGuardApiKey, loadGuardApiKey, removeGuardApiKey,
  runSecurityScan, runStabilityScan, runThreatScan,
  getErrorLog, clearErrorLog,
  diagnoseError, getSecurityRecommendations,
  startAutoScan, stopAutoScan, getGuardStatus,
  initializeGuard, guardEvents
} from './nyra-guard'
import { planEngine } from './plan-engine'
import { planExecutor } from './plan-executor'
import { computerUseAgent } from './computer-use-agent'
import { ptyManager } from './pty'
import { gitManager } from './git'
import { memoryManager } from './memory'
import { codebaseIndexer } from './indexer'
// ── Cowork modules ──────────────────────────────────────────────────────────
import { setupEventForwarding } from './event-bus'
import * as taskManager from './task-manager'
import * as jobQueue from './job-queue'
import * as folderManager from './folder-manager'
import * as contextEngine from './context-engine'
import * as approvalPipeline from './approval-pipeline'
import * as auditLog from './audit-log'
import * as snapshotManager from './snapshot-manager'
import * as agentRegistry from './agent-registry'
import * as agentOrchestrator from './agent-orchestrator'
import { memoryArchitect } from './memory/memory-architecture'
import { memoryLifecycle } from './memory/memory-lifecycle'
import { providerRegistry } from './providers/provider-registry'
import { branchManager } from './conversation-branching'
import { agentAnalytics } from './agent-analytics'
import { notificationCenter } from './notification-center'
import { contextVisualizer } from './context-visualizer'
import { pluginStudio } from './plugin-studio'
import { promptLibraryStore } from './prompt-library-store'
import { taskBoard } from './task-board'
import { apiPlayground } from './api-playground'
import { performanceProfiler } from './performance-profiler'
import { voiceInterface } from './voice-interface'
import { fileAttachment } from './file-attachment'
import { diffViewer } from './diff-viewer'
import { abPromptTesting } from './ab-prompt-testing'
import { themeEngine } from './theme-engine'
// Session 8
import { globalSearch } from './global-search'
import { activityFeed } from './activity-feed'
// Session 9
import { workspaceExport } from './workspace-export'
import { reportGenerator } from './report-generator'
import { webhookManager } from './webhook-manager'
import { backupManager } from './backup-manager'
import { sessionSharing } from './session-sharing'
// Session 10
import { errorBoundaryManager } from './error-boundary-manager'
import { offlineManager } from './offline-manager'
import { startupProfiler } from './startup-profiler'
import { accessibilityManager } from './accessibility-manager'
import { buildValidator } from './build-validator'
import * as fileWatcher from './file-watcher'
import * as fs from 'fs'
import * as path from 'path'

// ── Filesystem sandbox ─────────────────────────────────────────────────────────
// Only allow file read/write operations within the user's home directory.
// This prevents a compromised renderer from accessing system files.
const HOME_DIR = require('os').homedir()

function assertSafePath(p: string): void {
  const resolved = path.resolve(p)
  // Allow paths inside user home, app userData, and temp dir
  const allowedRoots = [HOME_DIR, app.getPath('userData'), app.getPath('temp')]
  const isSafe = allowedRoots.some(root => resolved.startsWith(root + path.sep) || resolved === root)
  if (!isSafe) {
    throw new Error(`Path access denied (outside allowed directories): ${resolved}`)
  }
}

// ── Paths ──────────────────────────────────────────────────────────────────────
const TASKS_PATH      = path.join(app.getPath('userData'), 'nyra_scheduled_tasks.json')
const PROJECTS_PATH   = path.join(app.getPath('userData'), 'nyra_projects.json')
const PROMPTS_PATH    = path.join(app.getPath('userData'), 'nyra_prompts.json')
const THEME_PATH      = path.join(app.getPath('userData'), 'nyra_theme.json')
const ONBOARDED_PATH  = path.join(app.getPath('userData'), 'nyra_onboarded.json')

// ── Types ──────────────────────────────────────────────────────────────────────
interface ScheduledTask {
  id: string; name: string; prompt: string
  cron?: string; fireAt?: string; enabled: boolean
  lastRun?: number; nextRun?: number
}

export interface Project {
  id: string; name: string; emoji: string; color: string
  systemPrompt?: string; model?: string
  sessionIds: string[]; pinnedSessionIds: string[]
  createdAt: number; updatedAt: number
}

export interface SavedPrompt {
  id: string; title: string; content: string
  tags: string[]; createdAt: number
}

export interface ThemeConfig {
  mode: 'dark' | 'dim' | 'light' | 'auto'
  accent: 'indigo' | 'violet' | 'blue' | 'emerald' | 'rose'
  fontSize: 'sm' | 'md' | 'lg'
  wallpaper: 'none' | 'herringbone' | 'chevron' | 'diamond' | 'marble' | 'silk' | 'leather' | 'linen' | 'concrete' | 'hexagon' | 'waves' | 'circuit' | 'scales'
}

// ── JSON helpers (async — avoids blocking main process event loop) ─────────────
async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch { return fallback }
}
async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

const readTasks    = (): Promise<ScheduledTask[]> => readJson(TASKS_PATH, [])
const writeTasks   = (t: ScheduledTask[]) => writeJson(TASKS_PATH, t)
const readProjects = (): Promise<Project[]>       => readJson(PROJECTS_PATH, [])
const writeProjects= (p: Project[])      => writeJson(PROJECTS_PATH, p)
const readPrompts  = (): Promise<SavedPrompt[]>   => readJson(PROMPTS_PATH, [])
const writePrompts = (p: SavedPrompt[])  => writeJson(PROMPTS_PATH, p)
const defaultTheme: ThemeConfig = { mode: 'dark', accent: 'indigo', fontSize: 'md', wallpaper: 'herringbone' }

// ── Persistence lock (prevents race conditions in read-modify-write) ──────────
let persistenceLock = Promise.resolve()
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const p = persistenceLock.then(fn, fn) // always runs, even if prior failed
  persistenceLock = p.then(() => {}, () => {})
  return p
}

// ── Cleanup functions for event listeners (imported from ipc-cleanup.ts) ──────
import { cleanupFns, cleanupIpcListeners } from './ipc-cleanup'
export { cleanupIpcListeners }

// ── Registration ───────────────────────────────────────────────────────────────
export function registerIpcHandlers(mainWindow: BrowserWindow): void {

  // ── OpenClaw ─────────────────────────────────────────────────────────────────
  ipcMain.handle('openclaw:status', () => openClawManager.getStatus())
  ipcMain.handle('openclaw:ws-url', () => PROXY_WS_URL)
  ipcMain.handle('openclaw:restart', async () => {
    openClawManager.shutdown()
    await openClawManager.initialize()
    return true
  })

  // ── Gateway conversation-readiness ping ─────────────────────────────────────
  // Three-layer health check:
  //   1. WS Proxy reachable? (open + close a test WebSocket)
  //   2. Any providers configured? (have API keys / OAuth tokens)
  //   3. Active model actually works? (lightweight API call to the provider)
  ipcMain.handle('openclaw:ping', async () => {
    const result: {
      wsProxy: boolean
      gateway: string
      providers: Array<{ id: string; ready: boolean }>
      modelTest: { tested: boolean; ok: boolean; model: string; error: string }
    } = {
      wsProxy: false,
      gateway: openClawManager.getStatus() as string,
      providers: [],
      modelTest: { tested: false, ok: false, model: '', error: '' },
    }

    // ── 1. Check providers ────────────────────────────────────────────────────
    try {
      const states = listProviders() as Array<{ id: string; enabled: boolean; hasKey: boolean }>
      result.providers = states.map(s => ({ id: s.id, ready: s.hasKey && s.enabled }))
    } catch { /* ignore */ }

    // ── 2. Test WebSocket proxy connectivity ──────────────────────────────────
    const WebSocket = require('ws')
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => { try { ws.close() } catch {} ; resolve() }, 3000)
      let ws: InstanceType<typeof WebSocket>
      try {
        ws = new WebSocket(PROXY_WS_URL)
        ws.on('open', () => { result.wsProxy = true; clearTimeout(timeout); ws.close(); resolve() })
        ws.on('error', () => { clearTimeout(timeout); resolve() })
      } catch { clearTimeout(timeout); resolve() }
    })

    // ── 3. Validate active model against provider ─────────────────────────────
    // Read auth-profiles to find the active provider + model + credential type
    try {
      const profiles = readAuthProfiles()
      // Find the default provider from gateway config
      const defaultProvider = getDefaultProvider()
      const profileEntry = defaultProvider ? profiles[defaultProvider] : null

      if (profileEntry) {
        // Extract the model from the profile
        const currentModel = (profileEntry as Record<string, unknown>).model as string ?? ''
        result.modelTest.model = currentModel

        // Determine credential for validation
        const token = profileEntry.type === 'api-key'
          ? (profileEntry as { key: string }).key
          : profileEntry.type === 'oauth-token'
            ? (profileEntry as { accessToken: string }).accessToken
            : null

        if (token && currentModel) {
          result.modelTest.tested = true
          // Choose validation endpoint based on provider
          if (defaultProvider?.startsWith('openai-codex')) {
            // OpenAI: check if the model exists via /v1/models/{id}
            const modelSlug = currentModel.includes('/') ? currentModel.split('/').pop()! : currentModel
            try {
              const resp = await fetch(`https://api.openai.com/v1/models/${modelSlug}`, {
                headers: { 'Authorization': `Bearer ${token}` },
              })
              if (resp.ok) {
                result.modelTest.ok = true
              } else {
                const body = await resp.json().catch(() => ({})) as Record<string, unknown>
                const errMsg = ((body.error as Record<string, unknown>)?.message as string) ?? `HTTP ${resp.status}`
                result.modelTest.error = errMsg
              }
            } catch (err) {
              result.modelTest.error = `Network error: ${(err as Error).message}`
            }
          } else if (defaultProvider?.startsWith('anthropic')) {
            // Anthropic: /v1/messages with max_tokens:1 and a dry system prompt
            try {
              const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'x-api-key': token,
                  'anthropic-version': '2023-06-01',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: currentModel.includes('/') ? currentModel.split('/').pop() : currentModel,
                  max_tokens: 1,
                  messages: [{ role: 'user', content: 'hi' }],
                }),
              })
              if (resp.ok || resp.status === 200) {
                result.modelTest.ok = true
              } else {
                const body = await resp.json().catch(() => ({})) as Record<string, unknown>
                const errMsg = ((body.error as Record<string, unknown>)?.message as string) ?? `HTTP ${resp.status}`
                result.modelTest.error = errMsg
              }
            } catch (err) {
              result.modelTest.error = `Network error: ${(err as Error).message}`
            }
          } else if (defaultProvider?.startsWith('google-gemini')) {
            // Gemini: lightweight model info check
            const modelSlug = currentModel.includes('/') ? currentModel.split('/').pop()! : currentModel
            try {
              const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelSlug}?key=${token}`)
              if (resp.ok) {
                result.modelTest.ok = true
              } else {
                const body = await resp.json().catch(() => ({})) as Record<string, unknown>
                const errMsg = ((body.error as Record<string, unknown>)?.message as string) ?? `HTTP ${resp.status}`
                result.modelTest.error = errMsg
              }
            } catch (err) {
              result.modelTest.error = `Network error: ${(err as Error).message}`
            }
          } else {
            // Other providers — skip deep model validation, just mark as OK if token exists
            result.modelTest.ok = true
          }
        }
      }
    } catch (err) {
      console.warn('[Ping] Model test error:', err)
    }

    return result
  })
  const fwd = (ev: string, ch: string) =>
    openClawManager.on(ev, (...a) => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send(ch, ...a) })
  fwd('status', 'openclaw:status-change')
  fwd('gateway-log', 'openclaw:log')
  fwd('install-log', 'openclaw:install-log')
  fwd('restarting',  'openclaw:restarting')
  fwd('ready',       'openclaw:ready')
  openClawManager.on('error', (err: Error) => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('openclaw:error', err.message) })

  // ── Dynamic model catalog from gateway ─────────────────────────────────────
  // Uses a short-lived WebSocket to call models.list on the gateway.
  // Falls back to the static PROVIDER_CATALOG if the gateway is unreachable.
  ipcMain.handle('openclaw:models', async () => {
    const WebSocket = require('ws')
    return new Promise<unknown[]>((resolve) => {
      const timeout = setTimeout(() => {
        try { ws?.close() } catch {}
        resolve([]) // empty = use fallback
      }, 5000)

      let ws: InstanceType<typeof WebSocket>
      try {
        ws = new WebSocket(PROXY_WS_URL)
        const rpcId = `models-${Date.now()}`

        ws.on('open', () => {
          // Send models.list as JSON-RPC (proxy translates to gateway native format)
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: rpcId, method: 'models.list', params: {} }))
        })

        ws.on('message', (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString())
            // Handle translated response from WsProxy: { id, result } or { id, error }
            if (msg.id === rpcId) {
              clearTimeout(timeout)
              ws.close()
              if (msg.result) {
                resolve(Array.isArray(msg.result) ? msg.result : [])
              } else if (msg.error) {
                console.warn('[IPC] models.list error:', msg.error)
                resolve([])
              } else {
                resolve([])
              }
            }
            // Also handle gateway native format: { type: "res", id, ok, payload }
            if (msg.type === 'res' && msg.id === rpcId) {
              clearTimeout(timeout)
              ws.close()
              if (msg.ok && msg.payload) {
                resolve(Array.isArray(msg.payload) ? msg.payload : [])
              } else {
                console.warn('[IPC] models.list gateway error:', msg.error)
                resolve([])
              }
            }
          } catch { /* ignore parse errors */ }
        })

        ws.on('error', () => { clearTimeout(timeout); resolve([]) })
      } catch { clearTimeout(timeout); resolve([]) }
    })
  })

  // ── Gateway RPC helper ──────────────────────────────────────────────────────
  // Mirrors the openclaw:models pattern: short-lived WebSocket via WsProxy,
  // JSON-RPC format, unique request IDs, handles both JSON-RPC and native responses.
  function gatewayRpc(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const WebSocket = require('ws')
    return new Promise<unknown>((resolve) => {
      let resolved = false
      const rpcId = `${method.replace(/\./g, '-')}-${Date.now()}`
      const finish = (value: unknown) => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        try { ws?.close() } catch {}
        resolve(value)
      }

      const timeout = setTimeout(() => finish(null), 5000)
      let ws: InstanceType<typeof WebSocket>
      try {
        ws = new WebSocket(PROXY_WS_URL)
        ws.on('open', () => {
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: rpcId, method, params }))
        })
        ws.on('message', (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString())
            // JSON-RPC response from WsProxy
            if (msg.id === rpcId) {
              if (msg.result !== undefined) {
                finish(msg.result)
              } else if (msg.error) {
                console.warn(`[IPC] ${method} error:`, msg.error)
                finish(null)
              } else {
                finish(null)
              }
            }
            // Native gateway format fallback
            if (msg.type === 'res' && msg.id === rpcId) {
              if (msg.ok && msg.payload !== undefined) {
                finish(msg.payload)
              } else {
                console.warn(`[IPC] ${method} gateway error:`, msg.error)
                finish(null)
              }
            }
          } catch { /* ignore parse errors */ }
        })
        ws.on('error', () => finish(null))
      } catch { finish(null) }
    })
  }

  // ── Gateway config RPC ──────────────────────────────────────────────────────
  ipcMain.handle('openclaw:config-get', () => gatewayRpc('config.get'))

  ipcMain.handle('openclaw:config-patch', (_e, raw: string, options?: { sessionKey?: string; note?: string }) =>
    gatewayRpc('config.patch', { raw, ...options })
  )

  // ── Gateway channels status RPC ─────────────────────────────────────────────
  ipcMain.handle('openclaw:channels-status', () => gatewayRpc('channels.status'))

  // ── Channel Management RPCs ────────────────────────────────────────────────
  // Enable/disable channels and test connections
  
  ipcMain.handle('openclaw:channel-enable', async (_e, channelId: string, config: Record<string, string>) => {
    const { CHANNEL_REGISTRY } = require('./channels')
    const channel = CHANNEL_REGISTRY[channelId]
    if (channel) {
      const result = await channel.start(config)
      if (result.success) {
        await gatewayRpc('config.patch', { raw: JSON.stringify({ channels: { [channelId]: { enabled: true, ...config } } }) })
      }
      return result
    }
    // Fallback for channels without local runtime (Matrix, IRC, etc.)
    await gatewayRpc('config.patch', { raw: JSON.stringify({ channels: { [channelId]: { enabled: true, ...config } } }) })
    return { success: true }
  })

  ipcMain.handle('openclaw:channel-disable', async (_e, channelId: string) => {
    const { CHANNEL_REGISTRY } = require('./channels')
    const channel = CHANNEL_REGISTRY[channelId]
    if (channel) await channel.stop()
    await gatewayRpc('config.patch', { raw: JSON.stringify({ channels: { [channelId]: { enabled: false } } }) })
    return { success: true }
  })

  ipcMain.handle('openclaw:channel-test', async (_e, channelId: string, config: Record<string, string>) => {
    const { CHANNEL_REGISTRY } = require('./channels')
    const channel = CHANNEL_REGISTRY[channelId]
    if (channel) return await channel.testConnection(config.botToken || config.appToken || '')
    return { success: false, error: `Test not implemented for ${channelId}` }
  })

  // ── Providers ───────────────────────────────────────────────────────────────
  ipcMain.handle('providers:list',         () => listProviders())
  ipcMain.handle('providers:catalog',      () => getCatalog())
  ipcMain.handle('providers:save-key',     (_e, id: string, key: string) => saveApiKey(id, key))
  ipcMain.handle('providers:remove-key',   (_e, id: string)              => removeApiKey(id))
  ipcMain.handle('providers:set-model',    (_e, id: string, modelId: string) => setActiveModel(id, modelId))
  ipcMain.handle('providers:resolve',      () => resolveProvider())
  ipcMain.handle('providers:open-oauth',   (_e, url: string) => {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http/https URLs are allowed')
    return shell.openExternal(url)
  })
  ipcMain.handle('providers:switch-model', (_e, modelId: string) => switchActiveModel(modelId))
  ipcMain.handle('providers:resync',       () => { syncProvidersToOpenClaw(); return true })

  // ── OAuth flows (EasyClaw-parity: OpenAI PKCE, Gemini CLI, GitHub device)
  ipcMain.handle('providers:start-oauth',  (_e, providerId: string) => startOAuthFlow(providerId, mainWindow))
  ipcMain.handle('providers:github-device-flow', () => startGitHubDeviceFlow(mainWindow))
  ipcMain.handle('providers:oauth-availability', () => getOAuthAvailability())

  // ── MCP Config ──────────────────────────────────────────────────────────────
  ipcMain.handle('mcp:list',   () => listMcpServers())
  ipcMain.handle('mcp:add',    (_e, n: string, s: McpServerConfig) => { addMcpServer(n, s); return true })
  ipcMain.handle('mcp:remove', (_e, n: string) => { removeMcpServer(n); return true })

  // ── MCP Runtime ────────────────────────────────────────────────────────────
  ipcMain.handle('mcp:start-server', async (_e, name: string, config: McpServerConfig) => {
    try {
      const status = await mcpRuntime.startServer(name, config)
      return { success: true, status }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('mcp:stop-server', async (_e, name: string) => {
    await mcpRuntime.stopServer(name)
    return true
  })
  ipcMain.handle('mcp:restart-server', async (_e, name: string) => {
    const config = listMcpServers()[name]
    if (!config) throw new Error(`Server config not found: ${name}`)
    const status = await mcpRuntime.startServer(name, config)
    return { success: true, status }
  })
  ipcMain.handle('mcp:list-running', () => mcpRuntime.listRunning())
  ipcMain.handle('mcp:server-status', (_e, name: string) => mcpRuntime.getServerStatus(name))
  ipcMain.handle('mcp:list-tools', () => getUnifiedToolRegistry())
  ipcMain.handle('mcp:call-tool', async (_e, qualifiedName: string, args: Record<string, unknown>, taskId?: string) => {
    return executeToolCall({ qualifiedName, arguments: args, taskId })
  })
  ipcMain.handle('mcp:capabilities-summary', () => getCapabilitySummary())
  ipcMain.handle('mcp:start-all', async () => {
    await mcpRuntime.startAllFromConfig()
    return mcpRuntime.listRunning()
  })

  // Forward MCP runtime events to renderer
  mcpRuntime.on('server-state-change', (status) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mcp:server-state-change', status)
    }
  })

  // ── Plan Mode ─────────────────────────────────────────────────────────────────
  ipcMain.handle('plan:generate', async (_e, userRequest: string, projectId?: string, modelId?: string) => {
    try {
      const plan = await planEngine.generatePlan(userRequest, projectId, modelId)
      return { success: true, plan }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('plan:get',           (_e, planId: string) => planEngine.getPlan(planId))
  ipcMain.handle('plan:list',          () => planEngine.listPlans())
  ipcMain.handle('plan:approve',       (_e, planId: string) => planEngine.approvePlan(planId))
  ipcMain.handle('plan:cancel',        (_e, planId: string) => planEngine.cancelPlan(planId))
  ipcMain.handle('plan:delete',        (_e, planId: string) => planEngine.deletePlan(planId))
  ipcMain.handle('plan:update-step',   (_e, planId: string, stepId: number, updates: any) => planEngine.updateStep(planId, stepId, updates))
  ipcMain.handle('plan:add-step',      (_e, planId: string, step: any) => planEngine.addStep(planId, step))
  ipcMain.handle('plan:remove-step',   (_e, planId: string, stepId: number) => planEngine.removeStep(planId, stepId))
  ipcMain.handle('plan:execute', async (_e, planId: string) => {
    try {
      // Fire-and-forget — execution progress comes via events
      planExecutor.execute(planId).catch(() => {})
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('plan:pause',         () => { planExecutor.pause(); return true })
  ipcMain.handle('plan:resume',        () => { planExecutor.resume(); return true })
  ipcMain.handle('plan:cancel-exec',   () => { planExecutor.cancel(); return true })
  ipcMain.handle('plan:exec-state',    () => planExecutor.getState())

  // Forward plan engine events to renderer
  const planEvents = ['plan:generating', 'plan:generated', 'plan:updated', 'plan:approved',
    'plan:cancelled', 'plan:executing', 'plan:completed', 'plan:failed', 'plan:step-update'] as const
  for (const evt of planEvents) {
    const listener = (data: unknown) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send(evt, data)
    }
    planEngine.on(evt, listener)
    cleanupFns.push(() => planEngine.off(evt, listener))
  }
  // Forward plan executor events to renderer
  const execEvents = ['plan:state', 'plan:step-started', 'plan:step-completed',
    'plan:paused', 'plan:resumed', 'plan:error'] as const
  for (const evt of execEvents) {
    const listener = (data: unknown) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send(evt, data)
    }
    planExecutor.on(evt, listener)
    cleanupFns.push(() => planExecutor.off(evt, listener))
  }

  // ── Computer Use ──────────────────────────────────────────────────────────────
  ipcMain.handle('computer-use:start', async (_e, task: string, config?: any) => {
    try {
      // Fire-and-forget — progress comes via events
      computerUseAgent.start(task, config).catch(() => {})
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('computer-use:pause',           () => { computerUseAgent.pause(); return true })
  ipcMain.handle('computer-use:resume',          () => { computerUseAgent.resume(); return true })
  ipcMain.handle('computer-use:cancel',          () => { computerUseAgent.cancel(); return true })
  ipcMain.handle('computer-use:session',         () => computerUseAgent.getSession())
  ipcMain.handle('computer-use:approve-action',  (_e, approvalId: string, approved: boolean) => {
    computerUseAgent.resolveApproval(approvalId, approved)
    return true
  })

  // Forward computer use events to renderer
  const cuEvents = ['session:started', 'session:paused', 'session:resumed', 'session:cancelled',
    'session:completed', 'session:failed', 'session:budget-exhausted',
    'step:started', 'step:completed', 'step:approval-needed'] as const
  for (const evt of cuEvents) {
    const listener = (data: unknown) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send(`computer-use:${evt}`, data)
    }
    computerUseAgent.on(evt, listener)
    cleanupFns.push(() => computerUseAgent.off(evt, listener))
  }

  // ── Files ─────────────────────────────────────────────────────────────────────
  ipcMain.handle('files:request-dir', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('files:request-file', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('files:read', (_e, p: string) => {
    try {
      assertSafePath(p)
      const s = fs.statSync(p)
      if (s.size > 50 * 1024 * 1024) return { error: 'File too large' }
      return { name: path.basename(p), size: s.size, content: fs.readFileSync(p).toString('base64'), mimeType: guessMime(p) }
    } catch (err: any) {
      if (err.message?.includes('Path access denied')) return { error: err.message }
      let errorMsg = err.message
      if (err.code === 'ENOENT') errorMsg = 'File not found'
      else if (err.code === 'EACCES') errorMsg = 'Permission denied'
      return { error: errorMsg }
    }
  })
  ipcMain.handle('files:save-dialog', async (_e, name: string) => {
    const r = await dialog.showSaveDialog(mainWindow, { defaultPath: name })
    return r.canceled ? null : r.filePath
  })
  ipcMain.handle('files:write', (_e, p: string, c: string) => {
    try {
      assertSafePath(p)
      fs.writeFileSync(p, Buffer.from(c, 'base64'))
      return true
    } catch (err: any) {
      console.error('[IPC] files:write failed:', err.message)
      return false
    }
  })
  ipcMain.handle('files:write-text', (_e, p: string, content: string) => {
    try {
      assertSafePath(p)
      fs.writeFileSync(p, content, 'utf8')
      return true
    } catch (err: any) {
      console.error('[IPC] files:write-text failed:', err.message)
      return false
    }
  })

  // ── Notifications ─────────────────────────────────────────────────────────────
  ipcMain.handle('notify:send', (_e, title: string, body: string) => sendNotification(title, body, mainWindow))

  // ── Scheduled Tasks ───────────────────────────────────────────────────────────
  ipcMain.handle('scheduled:list',   () => readTasks())
  ipcMain.handle('scheduled:add', async (_e, t: ScheduledTask) => {
    return withLock(async () => {
      const ts = await readTasks()
      ts.push(t)
      await writeTasks(ts)
      return true
    })
  })
  ipcMain.handle('scheduled:update', async (_e, id: string, p: Partial<ScheduledTask>) => {
    return withLock(async () => {
      await writeTasks((await readTasks()).map(t => t.id === id ? { ...t, ...p } : t))
      return true
    })
  })
  ipcMain.handle('scheduled:remove', async (_e, id: string) => {
    return withLock(async () => {
      await writeTasks((await readTasks()).filter(t => t.id !== id))
      return true
    })
  })

  // ── Projects ──────────────────────────────────────────────────────────────────
  ipcMain.handle('projects:list',   () => readProjects())
  ipcMain.handle('projects:create', async (_e, p: Project) => {
    const ps = await readProjects(); ps.push(p); await writeProjects(ps); return true
  })
  ipcMain.handle('projects:update', async (_e, id: string, patch: Partial<Project>) => {
    await writeProjects((await readProjects()).map(p => p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p))
    return true
  })
  ipcMain.handle('projects:delete', async (_e, id: string) => {
    await writeProjects((await readProjects()).filter(p => p.id !== id)); return true
  })

  // ── Saved Prompts ─────────────────────────────────────────────────────────────
  ipcMain.handle('prompts:list',   () => readPrompts())
  ipcMain.handle('prompts:add',    async (_e, p: SavedPrompt) => {
    const ps = await readPrompts(); ps.push(p); await writePrompts(ps); return true
  })
  ipcMain.handle('prompts:update', async (_e, id: string, patch: Partial<SavedPrompt>) => {
    await writePrompts((await readPrompts()).map(p => p.id === id ? { ...p, ...patch } : p)); return true
  })
  ipcMain.handle('prompts:remove', async (_e, id: string) => {
    await writePrompts((await readPrompts()).filter(p => p.id !== id)); return true
  })

  // ── Theme ─────────────────────────────────────────────────────────────────────
  ipcMain.handle('theme:get', () => readJson(THEME_PATH, defaultTheme))
  ipcMain.handle('theme:set', async (_e, theme: unknown) => {
    await writeJson(THEME_PATH, theme)
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('theme:changed', theme)
    return true
  })

  // ── Screen Capture ──────────────────────────────────────────────────────────
  ipcMain.handle('screen:capture',        ()                       => captureScreen())
  ipcMain.handle('screen:capture-window', (_e, title: string)      => captureWindow(title))
  ipcMain.handle('screen:list-sources',   ()                       => listSources())

  // ── Desktop Control ────────────────────────────────────────────────────────
  ipcMain.handle('desktop:mouse-move',          (_e, x: number, y: number)                                 => mouseMove(x, y))
  ipcMain.handle('desktop:mouse-click',         (_e, x: number, y: number, button?: string)                => mouseClick(x, y, button as 'left' | 'right' | 'middle'))
  ipcMain.handle('desktop:mouse-double-click',  (_e, x: number, y: number)                                 => mouseDoubleClick(x, y))
  ipcMain.handle('desktop:mouse-scroll',        (_e, x: number, y: number, dir: string, amount?: number)   => mouseScroll(x, y, dir as 'up' | 'down', amount))
  ipcMain.handle('desktop:mouse-drag',          (_e, fx: number, fy: number, tx: number, ty: number)       => mouseDrag(fx, fy, tx, ty))
  ipcMain.handle('desktop:type-text',           (_e, text: string)                                          => typeText(text))
  ipcMain.handle('desktop:press-key',           (_e, key: string)                                           => pressKey(key))
  ipcMain.handle('desktop:hotkey',              (_e, mods: string[], key: string)                           => hotkey(mods as import('./desktop-control').ModifierKey[], key))
  ipcMain.handle('desktop:launch-app',          (_e, name: string)                                          => launchApp(name))
  ipcMain.handle('desktop:list-apps',           ()                                                          => listRunningApps())
  ipcMain.handle('desktop:focus-app',           (_e, name: string)                                          => focusApp(name))
  ipcMain.handle('desktop:active-window',       ()                                                          => getActiveWindow())

  // ── Desktop Agent (OODA Loop + Safety) ────────────────────────────────────
  ipcMain.handle('desktop:agent-execute', async (_e, instruction: string, taskId?: string) => {
    try {
      const result = await desktopAgent.executeTask(instruction, taskId)
      return { success: true, result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('desktop:agent-stop', () => {
    desktopAgent.stop()
    return true
  })
  ipcMain.handle('desktop:trust-mode-get',    () => getTrustMode())
  ipcMain.handle('desktop:trust-mode-set',    (_e, mode: string) => { setTrustMode(mode as any); return true })
  ipcMain.handle('desktop:trust-rules',       () => getTrustRules())
  ipcMain.handle('desktop:trust-rules-reset', () => { resetTrustRules(); return true })
  ipcMain.handle('desktop:action-history',    (_e, limit?: number) => getActionHistory(limit))
  ipcMain.handle('desktop:tool-execute', async (_e, toolName: string, args: Record<string, unknown>, taskId?: string) => {
    try {
      const result = await executeDesktopTool(toolName, args, taskId)
      return { success: true, result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('desktop:tool-definitions',  () => getDesktopToolDefinitions())


  ipcMain.handle('computer-use:step-screenshot', (_e, stepId: number) => {
    const screenshot = computerUseBridge.getStepScreenshot(stepId)
    return screenshot ? { base64: screenshot.base64, width: screenshot.width, height: screenshot.height } : null
  })

  // Forward computer-use events to renderer
  for (const evt of ['session:started', 'session:completed', 'session:failed', 'session:cancelled',
                      'session:paused', 'session:resumed', 'session:budget-exhausted',
                      'step:started', 'step:completed'] as const) {
    computerUseBridge.on(evt, (data: unknown) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send(`computer-use:${evt}`, data)
    })
  }

  // ── Agent Message Bus (Inter-Agent Communication) ────────────────────────
  const { messageBus } = agentOrchestrator.default

  ipcMain.handle('agent-bus:send', async (_e, message: any) => {
    try {
      const sent = messageBus.send(message)
      return { success: true, messageId: sent.id }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('agent-bus:history',     (_e, limit?: number) => messageBus.getHistory(limit))
  ipcMain.handle('agent-bus:thread',      (_e, correlationId: string) => messageBus.getThread(correlationId))
  ipcMain.handle('agent-bus:task-messages', (_e, taskId: string) => messageBus.getTaskMessages(taskId))
  ipcMain.handle('agent-bus:unread-counts', () => messageBus.getUnreadCounts())
  ipcMain.handle('agent-bus:mark-read',   (_e, messageId: string) => { messageBus.markRead(messageId); return true })
  ipcMain.handle('agent-bus:inbox',       (_e, agentId: string) => messageBus.getInbox(agentId))

  // Forward all bus messages to renderer for live UI updates
  messageBus.observe((msg) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-bus:message', {
        id: msg.id,
        from: msg.from,
        to: msg.to,
        type: msg.type,
        taskId: msg.taskId,
        correlationId: msg.correlationId,
        summary: msg.payload.summary,
        timestamp: msg.timestamp,
        priority: msg.payload.priority,
      })
    }
  })

  // ── Tiered Memory (5-Tier MemGPT Architecture) ────────────────────────────
  ipcMain.handle('tiered-memory:stats', async () => {
    try {
      const stats = await memoryArchitect.getStats()
      return { success: true, stats }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tiered-memory:cascade-search', async (_e, query: string, tokenBudget?: number) => {
    try {
      const result = await memoryArchitect.cascadeSearch({ text: query }, tokenBudget)
      return { success: true, result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tiered-memory:build-context', async (_e, query: string, tokenBudget?: number) => {
    try {
      const context = await memoryArchitect.buildMemoryContext(query, tokenBudget)
      return { success: true, context }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tiered-memory:remember', async (_e, content: string, metadata: any, tier?: string) => {
    try {
      const id = await memoryArchitect.remember(content, metadata, tier as any)
      return { success: true, id }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tiered-memory:tier-list', async (_e, tier: string, offset: number, limit: number) => {
    try {
      const tierProvider = (memoryArchitect as any).tiers?.get(tier)
      if (!tierProvider) return { success: false, error: `Unknown tier: ${tier}` }
      const entries = await tierProvider.list(offset, limit)
      return { success: true, entries }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tiered-memory:tier-search', async (_e, tier: string, query: string, limit?: number) => {
    try {
      const result = await memoryArchitect.cascadeSearch(
        { text: query, tiers: [tier as any], limit: limit || 20 },
      )
      return { success: true, results: result.results }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tiered-memory:remove', async (_e, tier: string, id: string) => {
    try {
      const tierProvider = (memoryArchitect as any).tiers?.get(tier)
      if (!tierProvider) return { success: false, error: `Unknown tier: ${tier}` }
      await tierProvider.remove(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('tiered-memory:working-state', async () => {
    try {
      const tierProvider = (memoryArchitect as any).tiers?.get('working')
      if (!tierProvider) return { success: false, error: 'Working memory not available' }
      const state = await tierProvider.getState()
      return { success: true, state }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Streaming Chat (Direct Provider Streaming via IPC push) ────────────────
  // Active streams tracked for cancellation
  const activeStreams = new Map<string, { cancelled: boolean }>()

  ipcMain.handle('stream:start', async (_e, opts: {
    streamId: string
    providerId: string
    model: string
    messages: Array<{ role: string; content: any }>
    maxTokens?: number
    temperature?: number
    systemPrompt?: string
  }) => {
    const { streamId, providerId, model, messages, maxTokens, temperature } = opts
    const provider = providerRegistry.get(providerId)
    if (!provider) return { success: false, error: `Provider not found: ${providerId}` }

    const streamState = { cancelled: false }
    activeStreams.set(streamId, streamState)

    // Fire and forget — stream chunks via push events
    ;(async () => {
      try {
        mainWindow.webContents.send('stream:started', { streamId })

        const generator = provider.chatStream({
          model,
          messages: messages as any,
          maxTokens: maxTokens || 4096,
          temperature: temperature || 0.7,
        })

        let totalTokens = 0
        for await (const chunk of generator) {
          if (streamState.cancelled) break
          if (chunk.content) {
            totalTokens++
            mainWindow.webContents.send('stream:chunk', {
              streamId,
              content: chunk.content,
              done: chunk.done || false,
              model: chunk.model,
              usage: chunk.usage,
            })
          }
          if (chunk.done) break
        }

        if (!streamState.cancelled) {
          mainWindow.webContents.send('stream:done', { streamId, totalTokens })
        }
      } catch (err: any) {
        if (!streamState.cancelled) {
          mainWindow.webContents.send('stream:error', { streamId, error: err.message })
        }
      } finally {
        activeStreams.delete(streamId)
      }
    })()

    return { success: true, streamId }
  })

  ipcMain.handle('stream:cancel', (_e, streamId: string) => {
    const state = activeStreams.get(streamId)
    if (state) {
      state.cancelled = true
      mainWindow.webContents.send('stream:cancelled', { streamId })
      activeStreams.delete(streamId)
      return { success: true }
    }
    return { success: false, error: 'Stream not found' }
  })

  // ── Smart Model Router ─────────────────────────────────────────────────────
  ipcMain.handle('model-router:route', async (_e, taskType: string, complexity: string, context?: any) => {
    try {
      const decision = await modelRouter.quickRoute(taskType as any, complexity as any, context)
      return { success: true, ...decision }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('model-router:get-policy', () => ({ success: true, policy: modelRouter.getPolicy() }))

  ipcMain.handle('model-router:set-policy', (_e, updates: any) => {
    try {
      modelRouter.setPolicy(updates)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Provider Health Dashboard ─────────────────────────────────────────────
  ipcMain.handle('provider-health:all', async () => {
    try {
      const providers = providerRegistry.getAll()
      const result = await Promise.all(providers.map(async (p) => {
        const health = providerRegistry.getHealth(p.id)
        let models: Array<{ id: string; name: string; costPer1kInput: number; costPer1kOutput: number }> = []
        try {
          const cards = await p.listModels()
          models = cards.map(m => ({ id: m.id, name: m.name, costPer1kInput: (m as any).costPer1kInput ?? 0, costPer1kOutput: (m as any).costPer1kOutput ?? 0 }))
        } catch { /* provider may not support listing */ }
        return {
          id: p.id,
          name: p.name,
          isLocal: p.isLocal,
          isAvailable: p.isAvailable(),
          models,
          health: health ? { status: health.status, latencyMs: health.latencyMs, lastCheckedAt: health.lastCheckedAt, error: health.error } : null,
        }
      }))
      return { success: true, result }
    } catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle('provider-health:check', async (_e, providerId: string) => {
    try {
      const health = await providerRegistry.checkHealth(providerId)
      return { success: true, result: health }
    } catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle('provider-health:check-all', async () => {
    try {
      const healthMap = await providerRegistry.checkAllHealth()
      const result: Record<string, any> = {}
      healthMap.forEach((h, id) => { result[id] = h })
      return { success: true, result }
    } catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Ollama (Local LLMs) ────────────────────────────────────────────────────
  ipcMain.handle('ollama:status',       () => isOllamaRunning())
  ipcMain.handle('ollama:models',       () => getOllamaModels())
  ipcMain.handle('ollama:provider-def', () => getOllamaProviderDef())
  ipcMain.handle('ollama:sync',         () => syncOllamaToOpenClaw())
  ipcMain.handle('ollama:pull',         (_e, modelName: string) => {
    // Stream progress back to renderer
    return pullModel(modelName, (progress) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('ollama:pull-progress', { modelName, ...progress })
    })
  })
  ipcMain.handle('ollama:delete',       (_e, modelName: string) => deleteModel(modelName))
  ipcMain.handle('ollama:model-info',   (_e, modelName: string) => getModelInfo(modelName))

  // ── Model Hub (Enhanced Local Model Management) ───────────────────────────
  ipcMain.handle('modelhub:search-library',    (_e, opts?: any) => modelHub.searchLibrary(opts))
  ipcMain.handle('modelhub:families',          () => modelHub.getFamilies())
  ipcMain.handle('modelhub:model-card',        (_e, modelName: string) => modelHub.getModelCard(modelName))
  ipcMain.handle('modelhub:installed',         () => modelHub.getInstalledModels())
  ipcMain.handle('modelhub:recommended',       () => modelHub.getRecommended())
  ipcMain.handle('modelhub:is-online',         () => modelHub.isOnline())
  ipcMain.handle('modelhub:gpu-info',          () => modelHub.getSystemGpuInfo())
  ipcMain.handle('modelhub:can-fit',           (_e, modelName: string) => modelHub.canFitModel(modelName))

  // Download management
  ipcMain.handle('modelhub:download-start',    (_e, modelName: string) => modelHub.startDownload(modelName))
  ipcMain.handle('modelhub:download-pause',    (_e, jobId: string) => modelHub.pauseDownload(jobId))
  ipcMain.handle('modelhub:download-resume',   (_e, jobId: string) => modelHub.resumeDownload(jobId))
  ipcMain.handle('modelhub:download-cancel',   (_e, jobId: string) => modelHub.cancelDownload(jobId))
  ipcMain.handle('modelhub:downloads',         () => modelHub.getDownloads())
  ipcMain.handle('modelhub:download',          (_e, jobId: string) => modelHub.getDownload(jobId))
  ipcMain.handle('modelhub:remove-model',      (_e, modelName: string) => modelHub.removeModel(modelName))

  // Side-by-side comparison
  ipcMain.handle('modelhub:compare', async (_e, modelA: string, modelB: string, prompt: string) => {
    try {
      const result = await modelHub.compareModels(modelA, modelB, prompt)
      return { success: true, result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('modelhub:comparisons',       () => modelHub.listComparisons())
  ipcMain.handle('modelhub:comparison',        (_e, id: string) => modelHub.getComparison(id))

  // Performance tracking
  ipcMain.handle('modelhub:record-inference',  (_e, modelName: string, tps: number, latency: number) => modelHub.recordInference(modelName, tps, latency))
  ipcMain.handle('modelhub:rate-model',        (_e, modelName: string, rating: number) => modelHub.rateModel(modelName, rating))
  ipcMain.handle('modelhub:performance',       (_e, modelName: string) => modelHub.getPerformance(modelName))
  ipcMain.handle('modelhub:all-performance',   () => modelHub.getAllPerformance())

  // Model Hub event forwarding
  const modelHubEvents = [
    'download:queued', 'download:started', 'download:progress', 'download:paused',
    'download:resumed', 'download:completed', 'download:failed', 'download:cancelled',
    'model:removed', 'comparison:started', 'comparison:token', 'comparison:completed',
    'performance:updated',
  ] as const
  for (const evt of modelHubEvents) {
    modelHub.on(evt, (data: unknown) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send(`modelhub:${evt}`, data)
    })
  }

  // ── Semantic Memory ────────────────────────────────────────────────────────
  semanticMemory.init()

  ipcMain.handle('memory:add',            async (_e, opts: any) => {
    try {
      const entry = await semanticMemory.addMemory(opts)
      return { success: true, entry }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('memory:get',            (_e, id: number) => semanticMemory.getMemory(id))
  ipcMain.handle('memory:update',         (_e, id: number, updates: any) => semanticMemory.updateMemory(id, updates))
  ipcMain.handle('memory:delete',         (_e, id: number) => semanticMemory.deleteMemory(id))
  ipcMain.handle('memory:search',         async (_e, query: string, opts?: any) => semanticMemory.search(query, opts))
  ipcMain.handle('memory:list',           (_e, opts?: any) => semanticMemory.listMemories(opts))
  ipcMain.handle('memory:topics',         () => semanticMemory.getTopics())
  ipcMain.handle('memory:stats',          () => semanticMemory.getStats())
  ipcMain.handle('memory:extract',        async (_e, text: string, source: string, projectId?: string) => {
    try {
      const entries = await semanticMemory.extractFromText(text, source, projectId)
      return { success: true, count: entries.length, entries }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('semantic-memory:build-context',  async (_e, opts: any) => semanticMemory.buildMemoryContext(opts))
  ipcMain.handle('memory:export',         (_e, projectId?: string) => semanticMemory.exportMemories(projectId))
  ipcMain.handle('memory:import',         async (_e, jsonStr: string, projectId?: string) => {
    try {
      const count = await semanticMemory.importMemories(jsonStr, projectId)
      return { success: true, count }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Memory event forwarding
  const memoryEvents = ['memory:added', 'memory:updated', 'memory:deleted', 'extraction:completed', 'import:completed'] as const
  for (const evt of memoryEvents) {
    semanticMemory.on(evt, (data: unknown) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send(`semantic-${evt}`, data)
    })
  }

  // ── Composer Engine (Multi-File Changes) ───────────────────────────────────
  ipcMain.handle('composer:compose', async (_e, opts: any) => {
    try {
      const session = await composerEngine.compose(opts)
      return { success: true, session }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('composer:apply', async (_e, sessionId: string) => {
    try {
      const result = await composerEngine.apply(sessionId)
      return { success: true, ...result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('composer:rollback',       (_e, sessionId: string) => composerEngine.rollback(sessionId))
  ipcMain.handle('composer:accept-change',  (_e, sessionId: string, changeId: string, accepted: boolean) => composerEngine.setChangeAcceptance(sessionId, changeId, accepted))
  ipcMain.handle('composer:accept-all',     (_e, sessionId: string) => composerEngine.acceptAll(sessionId))
  ipcMain.handle('composer:reject-all',     (_e, sessionId: string) => composerEngine.rejectAll(sessionId))
  ipcMain.handle('composer:session',        (_e, sessionId: string) => composerEngine.getSession(sessionId))
  ipcMain.handle('composer:sessions',       () => composerEngine.listSessions())

  const composerEvents = [
    'composer:generating', 'composer:preview', 'composer:applying',
    'composer:applied', 'composer:failed', 'composer:rolled-back', 'composer:change-applied',
  ] as const
  for (const evt of composerEvents) {
    composerEngine.on(evt, (data: unknown) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send(evt, data)
    })
  }

  // ── Automations Engine (Background Agent Rules) ───────────────────────────
  automationEngine.init()

  ipcMain.handle('automation:add-rule',     (_e, opts: any) => automationEngine.addRule(opts))
  ipcMain.handle('automation:update-rule',  (_e, id: string, updates: any) => automationEngine.updateRule(id, updates))
  ipcMain.handle('automation:delete-rule',  (_e, id: string) => automationEngine.deleteRule(id))
  ipcMain.handle('automation:get-rule',     (_e, id: string) => automationEngine.getRule(id))
  ipcMain.handle('automation:list-rules',   (_e, projectId?: string) => automationEngine.listRules(projectId))
  ipcMain.handle('automation:trigger',      async (_e, ruleId: string, data?: any) => {
    try {
      await automationEngine.triggerManual(ruleId, data)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('automation:logs',         (_e, opts?: any) => automationEngine.getLogs(opts))
  ipcMain.handle('automation:stats',        () => automationEngine.getStats())

  const autoEvents = [
    'automation:triggered', 'automation:executed',
    'automation:rule-added', 'automation:rule-updated', 'automation:rule-deleted',
  ] as const
  for (const evt of autoEvents) {
    automationEngine.on(evt, (data: unknown) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send(evt, data)
    })
  }

  // ── Knowledge Stacks (RAG) ────────────────────────────────────────────────
  knowledgeStacks.init()

  ipcMain.handle('rag:create-stack',        (_e, name: string, projectId: string, desc?: string) => knowledgeStacks.createStack(name, projectId, desc))
  ipcMain.handle('rag:get-stack',           (_e, id: string) => knowledgeStacks.getStack(id))
  ipcMain.handle('rag:list-stacks',         (_e, projectId?: string) => knowledgeStacks.listStacks(projectId))
  ipcMain.handle('rag:delete-stack',        (_e, id: string) => knowledgeStacks.deleteStack(id))
  ipcMain.handle('rag:ingest', async (_e, stackId: string, opts: any) => {
    try {
      const doc = await knowledgeStacks.ingestDocument(stackId, opts)
      return { success: true, document: doc }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('rag:remove-document',     (_e, docId: string) => knowledgeStacks.removeDocument(docId))
  ipcMain.handle('rag:list-documents',      (_e, stackId: string) => knowledgeStacks.listDocuments(stackId))
  ipcMain.handle('rag:query',               async (_e, stackId: string, query: string, opts?: any) => knowledgeStacks.query(stackId, query, opts))
  ipcMain.handle('rag:query-project',       async (_e, projectId: string, query: string, opts?: any) => knowledgeStacks.queryProject(projectId, query, opts))
  ipcMain.handle('rag:build-context',       async (_e, projectId: string, query: string, opts?: any) => knowledgeStacks.buildRAGContext(projectId, query, opts))

  const ragEvents = ['stack:created', 'stack:deleted', 'document:ingested', 'document:removed'] as const
  for (const evt of ragEvents) {
    knowledgeStacks.on(evt, (data: unknown) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send(`rag:${evt}`, data)
    })
  }

  // ── App ───────────────────────────────────────────────────────────────────────
  ipcMain.handle('app:version',       () => app.getVersion())
  ipcMain.handle('app:open-external', (_e, url: string) => {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http/https URLs are allowed')
    return shell.openExternal(url)
  })
  ipcMain.handle('app:platform',      () => process.platform)

  // ── Onboarding ──────────────────────────────────────────────────────────────
  ipcMain.handle('app:is-onboarded',   () => fs.existsSync(ONBOARDED_PATH))
  ipcMain.handle('app:set-onboarded',  async () => {
    try {
      await writeJson(ONBOARDED_PATH, { onboarded: true, at: Date.now() })
      return true
    } catch (err: any) {
      console.error('[IPC] app:set-onboarded failed:', err.message)
      return false
    }
  })

  // ── Terminal (PTY) ──────────────────────────────────────────────────────────
  ipcMain.handle('pty:create',  (_e, cwd?: string) => ptyManager.create(cwd))
  ipcMain.handle('pty:write',   (_e, id: string, data: string) => { ptyManager.write(id, data); return true })
  ipcMain.handle('pty:resize',  (_e, id: string, cols: number, rows: number) => { ptyManager.resize(id, cols, rows); return true })
  ipcMain.handle('pty:kill',    (_e, id: string) => { ptyManager.kill(id); return true })
  ipcMain.handle('pty:list',    () => ptyManager.list())
  ipcMain.handle('pty:history', (_e, id: string) => ptyManager.getHistory(id))
  // Relay PTY events to renderer
  ptyManager.on('data', (id: string, data: string) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('pty:data', id, data)
  })
  ptyManager.on('exit', (id: string, exitCode: number | undefined, signal: number | undefined) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('pty:exit', id, exitCode, signal)
  })

  // ── Git ────────────────────────────────────────────────────────────────────────
  ipcMain.handle('git:open',          (_e, repoPath: string) => gitManager.open(repoPath))
  ipcMain.handle('git:status',        () => gitManager.status())
  ipcMain.handle('git:diff',          (_e, staged?: boolean) => gitManager.diff(staged))
  ipcMain.handle('git:log',           (_e, maxCount?: number) => gitManager.log(maxCount))
  ipcMain.handle('git:branches',      () => gitManager.branches())
  ipcMain.handle('git:checkout',      (_e, branch: string) => gitManager.checkout(branch))
  ipcMain.handle('git:create-branch', (_e, name: string, from?: string) => gitManager.createBranch(name, from))
  ipcMain.handle('git:stage',         (_e, files: string[]) => gitManager.stage(files))
  ipcMain.handle('git:stage-all',     () => gitManager.stageAll())
  ipcMain.handle('git:commit',        (_e, message: string) => gitManager.commit(message))
  ipcMain.handle('git:push',          (_e, remote?: string, branch?: string) => gitManager.push(remote, branch))
  ipcMain.handle('git:pull',          (_e, remote?: string, branch?: string) => gitManager.pull(remote, branch))
  ipcMain.handle('git:stash',         (_e, message?: string) => gitManager.stash(message))
  ipcMain.handle('git:stash-pop',     () => gitManager.stashPop())
  ipcMain.handle('git:blame',         (_e, file: string) => gitManager.blame(file))
  ipcMain.handle('git:show-commit',   (_e, hash: string) => gitManager.showCommit(hash))
  ipcMain.handle('git:file-history',  (_e, file: string, maxCount?: number) => gitManager.fileHistory(file, maxCount))
  ipcMain.handle('git:diff-branch',   (_e, base: string, head?: string) => gitManager.diffBranch(base, head))
  ipcMain.handle('git:merge-base',    (_e, b1: string, b2: string) => gitManager.mergeBase(b1, b2))
  ipcMain.handle('git:is-open',       () => gitManager.isOpen())
  ipcMain.handle('git:repo-path',     () => gitManager.getRepoPath())

  // ── Memory ─────────────────────────────────────────────────────────────────────
  ipcMain.handle('memory:set-fact',          (_e, cat: string, key: string, val: string, opts?: { confidence?: number; source?: string }) => { memoryManager.setFact(cat, key, val, opts); return true })
  ipcMain.handle('memory:get-fact',          (_e, cat: string, key: string) => memoryManager.getFact(cat, key))
  ipcMain.handle('memory:search-facts',      (_e, q: string, cat?: string) => memoryManager.searchFacts(q, cat))
  ipcMain.handle('memory:list-facts',        (_e, cat?: string) => memoryManager.listFacts(cat))
  ipcMain.handle('memory:delete-fact',       (_e, cat: string, key: string) => memoryManager.deleteFact(cat, key))
  ipcMain.handle('memory:add-summary',       (_e, sessionId: string, summary: string, topics?: string[]) => { memoryManager.addSummary(sessionId, summary, topics); return true })
  ipcMain.handle('memory:get-summaries',     (_e, sessionId?: string, limit?: number) => memoryManager.getSummaries(sessionId, limit))
  ipcMain.handle('memory:search-summaries',  (_e, q: string, limit?: number) => memoryManager.searchSummaries(q, limit))
  ipcMain.handle('memory:set-project-ctx',   (_e, pid: string, key: string, val: string) => { memoryManager.setProjectContext(pid, key, val); return true })
  ipcMain.handle('memory:get-project-ctx',   (_e, pid: string, key?: string) => memoryManager.getProjectContext(pid, key))
  ipcMain.handle('memory:delete-project-ctx',(_e, pid: string, key?: string) => { memoryManager.deleteProjectContext(pid, key); return true })
  ipcMain.handle('memory:build-context',     (_e, opts?: { projectId?: string; maxFacts?: number; maxSummaries?: number }) => memoryManager.buildContextBlock(opts))

  // ── Codebase Indexer ───────────────────────────────────────────────────────────
  ipcMain.handle('indexer:open',           (_e, root: string) => codebaseIndexer.open(root))
  ipcMain.handle('indexer:close',          () => codebaseIndexer.close())
  ipcMain.handle('indexer:is-open',        () => codebaseIndexer.isOpen())
  ipcMain.handle('indexer:search',         (_e, q: string, opts?: { ext?: string; limit?: number }) => codebaseIndexer.search(q, opts))
  ipcMain.handle('indexer:search-symbols', (_e, name: string) => codebaseIndexer.searchSymbols(name))
  ipcMain.handle('indexer:get-file',       (_e, relPath: string) => codebaseIndexer.getFile(relPath))
  ipcMain.handle('indexer:list',           (_e, opts?: { ext?: string; dir?: string }) => codebaseIndexer.list(opts))
  ipcMain.handle('indexer:stats',          () => codebaseIndexer.stats())
  // Relay indexer events
  codebaseIndexer.on('indexed', (filePath: string) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('indexer:indexed', filePath)
  })
  codebaseIndexer.on('ready', (stats: unknown) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('indexer:ready', stats)
  })

  // ── Plugins ──────────────────────────────────────────────────────────────────
  ipcMain.handle('plugins:list',      () => getInstalledPlugins())
  ipcMain.handle('plugins:discover',  () => discoverPlugins())
  ipcMain.handle('plugins:install',   (_e, source: string) => installPlugin(source))
  ipcMain.handle('plugins:remove',    (_e, id: string) => { removePlugin(id); return true })
  ipcMain.handle('plugins:enable',    (_e, id: string) => { enablePlugin(id); return true })
  ipcMain.handle('plugins:disable',   (_e, id: string) => { disablePlugin(id); return true })
  ipcMain.handle('plugins:load',      (_e, id: string) => loadPlugin(id))
  ipcMain.handle('plugins:unload',    (_e, id: string) => { unloadPlugin(id); return true })
  ipcMain.handle('plugins:tools',     (_e, id: string) => getPluginTools(id))

  // ── Skills Marketplace ──────────────────────────────────────────────────────
  ipcMain.handle('skills:browse',     (_e, query?: string, category?: string) => browseSkills(query, category))
  ipcMain.handle('skills:install',    (_e, id: string) => { installSkill(id); return true })
  ipcMain.handle('skills:remove',     (_e, id: string) => { removeSkill(id); return true })
  ipcMain.handle('skills:installed',  () => getInstalledSkills())
  ipcMain.handle('skills:enable',     (_e, id: string) => { enableSkill(id); return true })
  ipcMain.handle('skills:disable',    (_e, id: string) => { disableSkill(id); return true })

  // ── Auto Theme (system theme detection) ─────────────────────────────────────
  ipcMain.handle('theme:system-dark', () => nativeTheme.shouldUseDarkColors)
  // Listen for OS-level theme changes and forward to renderer
  nativeTheme.on('updated', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme:system-changed', nativeTheme.shouldUseDarkColors)
    }
  })

  // ── NyraGuard (Security & Stability Bot) ─────────────────────────────────────
  initializeGuard()
  // Config
  ipcMain.handle('guard:get-config',   () => getGuardConfig())
  ipcMain.handle('guard:set-config',   (_e, patch: Record<string, unknown>) => setGuardConfig(patch as any))
  ipcMain.handle('guard:save-key',     (_e, key: string) => saveGuardApiKey(key))
  ipcMain.handle('guard:load-key',     () => loadGuardApiKey())
  ipcMain.handle('guard:remove-key',   () => removeGuardApiKey())
  // Scanning
  ipcMain.handle('guard:scan-security',   () => runSecurityScan())
  ipcMain.handle('guard:scan-stability',  () => runStabilityScan())
  ipcMain.handle('guard:scan-threat',     () => runThreatScan())
  ipcMain.handle('guard:scan-all',        async () => {
    const [sec, stab, threat] = await Promise.all([runSecurityScan(), runStabilityScan(), runThreatScan()])
    return [...sec, ...stab, ...threat]
  })
  // Logging
  ipcMain.handle('guard:get-log',    () => getErrorLog())
  ipcMain.handle('guard:clear-log',  () => { clearErrorLog(); return true })
  // AI diagnostics
  ipcMain.handle('guard:diagnose',           (_e, error: string) => diagnoseError(error))
  ipcMain.handle('guard:recommendations',    () => getSecurityRecommendations())
  // Auto-scan control
  ipcMain.handle('guard:start-auto',  () => { startAutoScan(); return true })
  ipcMain.handle('guard:stop-auto',   () => { stopAutoScan(); return true })
  // Status
  ipcMain.handle('guard:status',      () => getGuardStatus())
  // Forward guard events to renderer
  guardEvents.on('scan-complete', (results: unknown) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('guard:scan-complete', results)
  })
  guardEvents.on('issue-detected', (issue: unknown) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('guard:issue-detected', issue)
  })
  guardEvents.on('log', (entry: unknown) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('guard:log', entry)
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // ── COWORK: Multi-Agent Workspace IPC ─────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  // Initialize event forwarding (all eventBus events → renderer via webContents.send)
  setupEventForwarding(mainWindow)
  // Initialize agent definitions in the registry
  agentRegistry.initializeAgents()

  // ── Tasks ───────────────────────────────────────────────────────────────────
  ipcMain.handle('cowork:task:create',        (_e, input: any) => taskManager.createTask(input))
  ipcMain.handle('cowork:task:get',           (_e, id: string) => taskManager.getTask(id))
  ipcMain.handle('cowork:task:list',          (_e, projectId?: string) => taskManager.listTasks(projectId))
  ipcMain.handle('cowork:task:update',        (_e, id: string, patch: any) => taskManager.updateTask(id, patch))
  ipcMain.handle('cowork:task:transition',    (_e, id: string, to: string, _by?: string, data?: any) => taskManager.transitionTask(id, to as any, data))
  ipcMain.handle('cowork:task:cancel',        (_e, id: string) => taskManager.cancelTask(id))
  ipcMain.handle('cowork:task:pause',         (_e, id: string) => taskManager.pauseTask(id))
  ipcMain.handle('cowork:task:resume',        (_e, id: string) => taskManager.resumeTask(id))
  ipcMain.handle('cowork:task:retry',         (_e, id: string) => taskManager.retryTask(id))
  ipcMain.handle('cowork:task:add-note',      (_e, id: string, note: string) => taskManager.addTaskNote(id, note))
  ipcMain.handle('cowork:task:events',        (_e, id: string) => taskManager.getTaskEvents(id))
  ipcMain.handle('cowork:task:add-event',     (_e, input: any) => taskManager.addTaskEvent(input.taskId, input.eventType, input.agentId, { summary: input.summary, detail: input.detail }))
  ipcMain.handle('cowork:task:artifacts',     (_e, id: string) => taskManager.getTaskArtifacts(id))
  ipcMain.handle('cowork:task:add-artifact',  (_e, input: any) => taskManager.addTaskArtifact(input.taskId, { name: input.name, type: input.type, path: input.path, content: input.content }))
  ipcMain.handle('cowork:task:approvals',     (_e, id: string) => taskManager.getTaskApprovals(id))
  ipcMain.handle('cowork:task:active-count',  () => taskManager.getActiveTaskCount())
  ipcMain.handle('cowork:task:queued',        () => taskManager.getQueuedTasks())
  ipcMain.handle('cowork:task:pending-approvals', () => taskManager.getPendingApprovals())

  // ── Job Queue ──────────────────────────────────────────────────────────────
  ipcMain.handle('jobs:queue',      () => jobQueue.getQueue())
  ipcMain.handle('jobs:active',     () => jobQueue.getActive())
  ipcMain.handle('jobs:stats',      () => jobQueue.getStats())
  ipcMain.handle('jobs:get',        (_e, jobId: string) => jobQueue.getJob(jobId))
  ipcMain.handle('jobs:by-task',    (_e, taskId: string) => jobQueue.getJobsByTask(taskId))
  ipcMain.handle('jobs:cancel',     (_e, jobId: string) => jobQueue.cancel(jobId))
  ipcMain.handle('jobs:cancel-task',(_e, taskId: string) => jobQueue.cancelByTask(taskId))
  ipcMain.handle('jobs:is-processing', () => jobQueue.isProcessing())

  // ── Agents ──────────────────────────────────────────────────────────────────
  ipcMain.handle('cowork:agent:get',          (_e, id: string) => agentRegistry.getAgent(id))
  ipcMain.handle('cowork:agent:list',         () => agentRegistry.getAllAgents())
  ipcMain.handle('cowork:agent:by-role',      (_e, role: string) => agentRegistry.getAgentsByRole(role as any))
  ipcMain.handle('cowork:agent:state',        (_e, id: string) => agentRegistry.getAgentState(id))
  ipcMain.handle('cowork:agent:all-states',   () => agentRegistry.getAllAgentStates())
  ipcMain.handle('cowork:agent:update-status',(_e, id: string, status: string, taskId?: string) => agentRegistry.updateAgentStatus(id, status as any, taskId))
  ipcMain.handle('cowork:agent:reset-all',    () => agentRegistry.resetAllAgents())
  ipcMain.handle('cowork:agent:is-tool-allowed', (_e, agentId: string, toolName: string) => agentRegistry.isToolAllowed(agentId, toolName))

  // Agent Studio CRUD
  ipcMain.handle('agent-studio:create', (_e, def: any) => {
    try { return { success: true, agent: agentRegistry.createAgent(def) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agent-studio:update', (_e, id: string, updates: any) => {
    try { return { success: true, agent: agentRegistry.updateAgent(id, updates) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agent-studio:delete', (_e, id: string) => {
    try { return { success: true, deleted: agentRegistry.deleteAgent(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agent-studio:duplicate', (_e, id: string, name?: string) => {
    try { return { success: true, agent: agentRegistry.duplicateAgent(id, name) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agent-studio:export', (_e, id: string) => agentRegistry.exportAgent(id))
  ipcMain.handle('agent-studio:import', (_e, json: string) => {
    try { return { success: true, agent: agentRegistry.importAgent(json) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Orchestrator ────────────────────────────────────────────────────────────
  ipcMain.handle('cowork:orch:set-mode',      (_e, mode: string) => agentOrchestrator.setMode(mode as any))
  ipcMain.handle('cowork:orch:get-mode',      () => agentOrchestrator.getMode())
  ipcMain.handle('cowork:orch:state',         () => agentOrchestrator.getState())
  ipcMain.handle('cowork:orch:execute',       (_e, taskId: string) => agentOrchestrator.executeTask(taskId))
  ipcMain.handle('cowork:orch:analyze',       (_e, taskId: string) => {
    const task = taskManager.getTask(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    return agentOrchestrator.analyzeComplexity(task.title, task.description || '')
  })
  ipcMain.handle('cowork:orch:decompose',     (_e, taskId: string) => {
    const task = taskManager.getTask(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    return agentOrchestrator.decomposeTask(taskId, task.title, task.description || '', task.folderScope)
  })
  ipcMain.handle('cowork:orch:queue',         (_e, taskId: string) => agentOrchestrator.queueTask(taskId))
  ipcMain.handle('cowork:orch:get-queue',     () => agentOrchestrator.getQueue())
  ipcMain.handle('cowork:orch:process-queue', () => agentOrchestrator.processQueue())
  ipcMain.handle('cowork:orch:cancel',        (_e, taskId: string) => agentOrchestrator.cancelTask(taskId))
  ipcMain.handle('cowork:orch:pause',         (_e, taskId: string) => agentOrchestrator.pauseTask(taskId))
  ipcMain.handle('cowork:orch:resume',        (_e, taskId: string) => agentOrchestrator.resumeTask(taskId))
  ipcMain.handle('cowork:orch:handoffs',      (_e, from: string, to: string, taskId: string, summary: string) => agentOrchestrator.recordHandoff(from, to, taskId, summary))
  ipcMain.handle('cowork:orch:messages',      (_e, taskId: string) => agentOrchestrator.getTaskMessages(taskId))

  // ── Folders ─────────────────────────────────────────────────────────────────
  ipcMain.handle('cowork:folder:attach',      (_e, input: any) => folderManager.attachFolder(input))
  ipcMain.handle('cowork:folder:detach',      (_e, id: string) => folderManager.detachFolder(id))
  ipcMain.handle('cowork:folder:list',        (_e, projectId?: string) => folderManager.listFolders(projectId))
  ipcMain.handle('cowork:folder:get',         (_e, id: string) => folderManager.getFolder(id))
  ipcMain.handle('cowork:folder:update',      (_e, id: string, patch: any) => folderManager.updateFolder(id, patch))
  ipcMain.handle('cowork:folder:add-instr',   (_e, id: string, text: string, priority?: number) => folderManager.addInstruction(id, text, priority))
  ipcMain.handle('cowork:folder:rm-instr',    (_e, instrId: string) => folderManager.removeInstruction(instrId))
  ipcMain.handle('cowork:folder:instructions',(_e, id: string) => folderManager.getInstructions(id))
  ipcMain.handle('cowork:folder:tree',        (_e, id: string, depth?: number) => folderManager.getFolderTree(id, depth))
  ipcMain.handle('cowork:folder:stats',       (_e, folderPath: string) => folderManager.getFolderStats(folderPath))
  ipcMain.handle('cowork:folder:can-access',  (_e, id: string, action: string) => folderManager.canAgentAccess(id, action as any))
  ipcMain.handle('cowork:folder:accessible',  (_e, accessNeeded: string) => folderManager.getAccessibleFolders(accessNeeded as any))

  // ── File Watcher ────────────────────────────────────────────────────────────
  ipcMain.handle('cowork:watch:start',        (_e, folderId: string, folderPath: string) => fileWatcher.watchFolder(folderId, folderPath))
  ipcMain.handle('cowork:watch:stop',         (_e, folderId: string) => fileWatcher.unwatchFolder(folderId))
  ipcMain.handle('cowork:watch:is-watching',  (_e, folderId: string) => fileWatcher.isWatching(folderId))
  ipcMain.handle('cowork:watch:list',         () => fileWatcher.getWatchedFolders())
  ipcMain.handle('cowork:watch:stop-all',     () => fileWatcher.unwatchAll())

  // ── Context Engine ──────────────────────────────────────────────────────────
  ipcMain.handle('cowork:ctx:add-source',     (_e, input: any) => contextEngine.addSource(input))
  ipcMain.handle('cowork:ctx:remove-source',  (_e, id: string) => contextEngine.removeSource(id))
  ipcMain.handle('cowork:ctx:get-source',     (_e, id: string) => contextEngine.getSource(id))
  ipcMain.handle('cowork:ctx:list-sources',   (_e, projectId?: string) => contextEngine.listSources(projectId))
  ipcMain.handle('cowork:ctx:pin',            (_e, id: string) => contextEngine.pinSource(id))
  ipcMain.handle('cowork:ctx:unpin',          (_e, id: string) => contextEngine.unpinSource(id))
  ipcMain.handle('cowork:ctx:toggle-active',  (_e, id: string) => contextEngine.toggleSourceActive(id))
  ipcMain.handle('cowork:ctx:budget',         (_e, modelId?: string) => contextEngine.getBudget(modelId))
  ipcMain.handle('cowork:ctx:assemble',       (_e, projectId: string, taskId?: string, modelId?: string) => contextEngine.assembleContext(projectId, taskId, modelId))
  ipcMain.handle('cowork:ctx:stats',          () => contextEngine.getContextStats())
  ipcMain.handle('cowork:ctx:clear-expired',  () => contextEngine.clearExpiredSources())
  ipcMain.handle('cowork:ctx:clear-temp',     (_e, projectId?: string) => contextEngine.clearTemporarySources(projectId))

  // ── Approvals ───────────────────────────────────────────────────────────────
  ipcMain.handle('cowork:approval:classify',  (_e, actionType: string) => approvalPipeline.classifyRisk(actionType))
  ipcMain.handle('cowork:approval:needs',     (_e, actionType: string, folderAccessLevel?: string) => approvalPipeline.needsApproval(actionType, folderAccessLevel ?? 'read_edit_approve'))
  ipcMain.handle('cowork:approval:request',   (_e, input: any) => approvalPipeline.requestApproval(input.taskId, input.agentId, input.actionType, input.description, input.details))
  ipcMain.handle('cowork:approval:respond',   (_e, id: string, approved: boolean, reason?: string) => approvalPipeline.respondToApproval(id, approved ? 'approved' : 'denied', reason))
  ipcMain.handle('cowork:approval:pending',   () => approvalPipeline.listPendingApprovals())
  ipcMain.handle('cowork:approval:get',       (_e, id: string) => approvalPipeline.getApproval(id))
  ipcMain.handle('cowork:approval:by-task',   (_e, taskId: string) => approvalPipeline.getApprovalsByTask(taskId))
  ipcMain.handle('cowork:approval:has-pending',(_e, taskId: string) => approvalPipeline.hasPendingApprovals(taskId))
  ipcMain.handle('cowork:approval:stats',     () => approvalPipeline.getApprovalStats())

  // ── Audit Log ───────────────────────────────────────────────────────────────
  ipcMain.handle('cowork:audit:log',          (_e, input: any) => auditLog.logAction(input))
  ipcMain.handle('cowork:audit:query',        (_e, filters: any) => auditLog.queryAudit(filters))
  ipcMain.handle('cowork:audit:entry',        (_e, id: string) => auditLog.getAuditEntry(id))
  ipcMain.handle('cowork:audit:count',        (_e, filters?: any) => auditLog.getAuditCount(filters))
  ipcMain.handle('cowork:audit:recent',       (_e, limit?: number) => auditLog.getRecentActions(limit))
  ipcMain.handle('cowork:audit:for-file',     (_e, filePath: string) => auditLog.getActionsForFile(filePath))
  ipcMain.handle('cowork:audit:for-task',     (_e, taskId: string) => auditLog.getTaskActions(taskId))
  ipcMain.handle('cowork:audit:for-agent',    (_e, agentId: string) => auditLog.getAgentActions(agentId))
  ipcMain.handle('cowork:audit:stats',        (_e, opts?: any) => auditLog.getAuditStats(opts?.from, opts?.to))
  ipcMain.handle('cowork:audit:export',       (_e, format: string, filters?: any) => auditLog.exportAudit(format as any, filters))
  ipcMain.handle('cowork:audit:summary',      (_e, opts?: { from?: number; to?: number }) => auditLog.getAuditSummary(opts?.from, opts?.to))

  // ── Snapshots ───────────────────────────────────────────────────────────────
  ipcMain.handle('cowork:snap:create',        (_e, filePath: string, taskId?: string) => snapshotManager.createSnapshot(filePath, taskId))
  ipcMain.handle('cowork:snap:get',           (_e, id: string) => snapshotManager.getSnapshot(id))
  ipcMain.handle('cowork:snap:for-file',      (_e, filePath: string) => snapshotManager.getSnapshotsForFile(filePath))
  ipcMain.handle('cowork:snap:for-task',      (_e, taskId: string) => snapshotManager.getSnapshotsByTask(taskId))
  ipcMain.handle('cowork:snap:rollback',      (_e, id: string) => snapshotManager.rollback(id))
  ipcMain.handle('cowork:snap:content',       (_e, id: string) => {
    const buf = snapshotManager.getSnapshotContent(id)
    return buf ? buf.toString('base64') : null
  })
  ipcMain.handle('cowork:snap:prune',         (_e, maxAge: number) => snapshotManager.pruneOldSnapshots(maxAge))
  ipcMain.handle('cowork:snap:count',         (_e, filePath?: string, taskId?: string) => snapshotManager.getSnapshotCount(filePath, taskId))
  ipcMain.handle('cowork:snap:stats',         () => snapshotManager.getSnapshotStats())
  ipcMain.handle('cowork:snap:verify',        (_e, id: string) => snapshotManager.verifySnapshotIntegrity(id))
  ipcMain.handle('cowork:snap:rollback-batch',(_e, ids: string[]) => snapshotManager.rollbackBatch(ids))

  // ── Global Shortcuts (Phase 6A) ───────────────────────────────────────────────
  if (mainWindow) globalShortcutsManager.init(mainWindow)

  ipcMain.handle('shortcuts:list',         () => globalShortcutsManager.listBindings())
  ipcMain.handle('shortcuts:get',          (_e, id: string) => globalShortcutsManager.getBinding(id))
  ipcMain.handle('shortcuts:update',       (_e, id: string, updates: any) => globalShortcutsManager.updateBinding(id, updates))
  ipcMain.handle('shortcuts:add',          (_e, opts: any) => globalShortcutsManager.addBinding(opts))
  ipcMain.handle('shortcuts:remove',       (_e, id: string) => globalShortcutsManager.removeBinding(id))
  ipcMain.handle('shortcuts:has-conflict', (_e, accel: string, excludeId?: string) => globalShortcutsManager.hasConflict(accel, excludeId))
  ipcMain.handle('shortcuts:get-clipboard', () => globalShortcutsManager.getClipboard())

  // Forward shortcut events
  for (const evt of ['shortcut:activated', 'shortcut:updated', 'shortcut:added', 'shortcut:removed']) {
    globalShortcutsManager.on(evt.replace('shortcut:', ''), (data) => {
      mainWindow?.webContents.send(evt, data)
    })
  }

  // ── Browser Preview (Phase 6B) ──────────────────────────────────────────────
  if (mainWindow) browserPreview.init(mainWindow)

  ipcMain.handle('preview:navigate',     (_e, url: string) => browserPreview.navigate(url))
  ipcMain.handle('preview:go-back',      () => browserPreview.goBack())
  ipcMain.handle('preview:go-forward',   () => browserPreview.goForward())
  ipcMain.handle('preview:reload',       () => browserPreview.reload())
  ipcMain.handle('preview:attach',       () => browserPreview.attach())
  ipcMain.handle('preview:detach',       () => browserPreview.detach())
  ipcMain.handle('preview:set-viewport', (_e, preset: string) => browserPreview.setViewport(preset as any))
  ipcMain.handle('preview:get-viewports',() => browserPreview.getViewportPresets())
  ipcMain.handle('preview:capture',      () => browserPreview.capturePreview())
  ipcMain.handle('preview:get-state',    () => browserPreview.getState())
  ipcMain.handle('preview:get-console',  (_e, limit?: number) => browserPreview.getConsoleLogs(limit))
  ipcMain.handle('preview:clear-console',() => browserPreview.clearConsoleLogs())
  ipcMain.handle('preview:auto-reload-start', () => browserPreview.startAutoReload())
  ipcMain.handle('preview:auto-reload-stop',  () => browserPreview.stopAutoReload())
  ipcMain.handle('preview:toggle-devtools',   () => browserPreview.toggleDevTools())

  // Forward preview events
  for (const evt of ['preview:state-changed', 'preview:console', 'preview:loading']) {
    browserPreview.on(evt.replace('preview:', ''), (data) => {
      mainWindow?.webContents.send(evt, data)
    })
  }

  // ── Browser Agent (OpenClaw Browser Tools) ──────────────────────────────────
  ipcMain.handle('browser-agent:enable',       () => browserAgent.enable())
  ipcMain.handle('browser-agent:disable',      () => browserAgent.disable())
  ipcMain.handle('browser-agent:is-enabled',   () => browserAgent.isEnabled())
  ipcMain.handle('browser-agent:get-state',    () => browserAgent.getState())
  ipcMain.handle('browser-agent:navigate',     (_e, url: string, opts?: any) => browserAgent.navigate(url, opts))
  ipcMain.handle('browser-agent:click',        (_e, opts: any) => browserAgent.click(opts))
  ipcMain.handle('browser-agent:fill',         (_e, opts: any) => browserAgent.fill(opts))
  ipcMain.handle('browser-agent:select',       (_e, selector: string, value: string) => browserAgent.select(selector, value))
  ipcMain.handle('browser-agent:scroll',       (_e, dir: string, amount?: number) => browserAgent.scroll(dir as any, amount))
  ipcMain.handle('browser-agent:wait',         (_e, selector: string, timeout?: number) => browserAgent.waitForSelector(selector, timeout))
  ipcMain.handle('browser-agent:screenshot',   (_e, opts?: any) => browserAgent.screenshot(opts))
  ipcMain.handle('browser-agent:aria-snapshot', () => browserAgent.ariaSnapshot())
  ipcMain.handle('browser-agent:snapshot',     () => browserAgent.captureSnapshot())
  ipcMain.handle('browser-agent:evaluate',     (_e, opts: any) => browserAgent.evaluate(opts))
  ipcMain.handle('browser-agent:get-text',     (_e, maxLen?: number) => browserAgent.getPageText(maxLen))
  ipcMain.handle('browser-agent:get-html',     (_e, selector?: string) => browserAgent.getPageHtml(selector))
  ipcMain.handle('browser-agent:get-history',  (_e, limit?: number) => browserAgent.getActionHistory(limit))
  ipcMain.handle('browser-agent:clear-history', () => browserAgent.clearHistory())

  // Forward browser agent events
  for (const evt of ['agent:state-changed', 'agent:action', 'agent:action-complete', 'agent:action-error']) {
    browserAgent.on(evt, (data) => {
      mainWindow?.webContents.send(`browser-${evt}`, data)
    })
  }

  // ── Workflow Recipes (Phase 6C) ─────────────────────────────────────────────
  workflowRecipes.init()

  ipcMain.handle('recipes:list',           (_e, category?: string) => workflowRecipes.listRecipes(category))
  ipcMain.handle('recipes:get',            (_e, id: string) => workflowRecipes.getRecipe(id))
  ipcMain.handle('recipes:categories',     () => workflowRecipes.getCategories())
  ipcMain.handle('recipes:create',         (_e, opts: any) => workflowRecipes.createRecipe(opts))
  ipcMain.handle('recipes:update',         (_e, id: string, updates: any) => workflowRecipes.updateRecipe(id, updates))
  ipcMain.handle('recipes:delete',         (_e, id: string) => workflowRecipes.deleteRecipe(id))
  ipcMain.handle('recipes:run',            (_e, id: string, vars?: any) => workflowRecipes.runRecipe(id, vars))
  ipcMain.handle('recipes:get-run',        (_e, runId: string) => workflowRecipes.getRun(runId))
  ipcMain.handle('recipes:list-runs',      (_e, opts?: any) => workflowRecipes.listRuns(opts))
  ipcMain.handle('recipes:cancel-run',     (_e, runId: string) => workflowRecipes.cancelRun(runId))
  ipcMain.handle('recipes:export',         (_e, id: string) => workflowRecipes.exportRecipe(id))
  ipcMain.handle('recipes:import',         (_e, json: string) => workflowRecipes.importRecipe(json))

  // Forward recipe events
  for (const evt of ['recipe:created', 'recipe:updated', 'recipe:deleted', 'run:started', 'run:completed', 'run:step-started', 'run:step-completed', 'run:step-failed', 'run:cancelled']) {
    workflowRecipes.on(evt, (data) => {
      mainWindow?.webContents.send(`recipes:${evt}`, data)
    })
  }

  // ── Memory Lifecycle ─────────────────────────────────────────────────────────
  ipcMain.handle('memory-lifecycle:stats', async () => {
    try { return { success: true, result: memoryLifecycle.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle('memory-lifecycle:sessions', async (_e, limit?: number) => {
    try { return { success: true, result: memoryLifecycle.getRecentSessions(limit ?? 20) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle('memory-lifecycle:save-snapshot', async () => {
    try {
      const id = await memoryLifecycle.saveSnapshot()
      return { success: true, result: id }
    }
    catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle('memory-lifecycle:restore-snapshot', async (_e, snapshotId: string) => {
    try {
      const restored = await memoryLifecycle.restoreFromSnapshot(snapshotId)
      return { success: true, result: restored }
    }
    catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle('memory-lifecycle:get-snapshot', async (_e, snapshotId: string) => {
    try {
      const snapshot = memoryLifecycle.getSnapshot(snapshotId)
      return { success: true, result: snapshot }
    }
    catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle('memory-lifecycle:current-session', async () => {
    return { success: true, result: memoryLifecycle.getCurrentSessionId() }
  })

  // ── Conversation Branching ───────────────────────────────────────────────────
  ipcMain.handle('branching:get-tree', async (_e, sessionId: string) => {
    try { return { success: true, result: branchManager.getBranchTree(sessionId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('branching:get-branches', async (_e, sessionId: string) => {
    try { return { success: true, result: branchManager.getBranches(sessionId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('branching:get-messages', async (_e, branchId: string) => {
    try { return { success: true, result: branchManager.getBranchMessages(branchId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('branching:create', async (_e, sessionId: string, forkPoint: number, name?: string) => {
    try { return { success: true, result: branchManager.createBranch(sessionId, forkPoint, name) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('branching:rename', async (_e, branchId: string, name: string) => {
    try { branchManager.renameBranch(branchId, name); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('branching:delete', async (_e, branchId: string) => {
    try { branchManager.deleteBranch(branchId); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('branching:merge', async (_e, sourceId: string, targetId: string) => {
    try { branchManager.mergeBranch(sourceId, targetId); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('branching:stats', async () => {
    try { return { success: true, result: branchManager.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('branching:current-session', async () => {
    return { success: true, result: 'default' }
  })

  // ── Agent Analytics ────────────────────────────────────────────────────────
  ipcMain.handle('analytics:record', async (_e, data: any) => {
    try { agentAnalytics.recordMetric(data); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('analytics:agent-stats', async (_e, agentId: string, from?: number, to?: number) => {
    try { return { success: true, result: agentAnalytics.getAgentStats(agentId, from, to) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('analytics:provider-stats', async (_e, providerId: string, from?: number) => {
    try { return { success: true, result: agentAnalytics.getProviderStats(providerId, from) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('analytics:model-stats', async (_e, modelId: string, from?: number) => {
    try { return { success: true, result: agentAnalytics.getModelStats(modelId, from) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('analytics:time-series', async (_e, agentId: string, days?: number, granularity?: string) => {
    try { return { success: true, result: agentAnalytics.getTimeSeries(agentId, days, granularity as any) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('analytics:top-agents', async (_e, limit?: number) => {
    try { return { success: true, result: agentAnalytics.getTopAgents(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('analytics:overall', async () => {
    try { return { success: true, result: agentAnalytics.getOverallStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('analytics:cost-breakdown', async (_e, days?: number) => {
    try { return { success: true, result: agentAnalytics.getCostBreakdown(days) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Notification Center ────────────────────────────────────────────────────
  ipcMain.handle('notifications:list', async (_e, opts?: any) => {
    try { return { success: true, result: notificationCenter.list(opts) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('notifications:push', async (_e, opts: any) => {
    try { return { success: true, result: notificationCenter.push(opts) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('notifications:mark-read', async (_e, id: string) => {
    try { notificationCenter.markRead(id); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('notifications:mark-all-read', async (_e, category?: string) => {
    try { notificationCenter.markAllRead(category as any); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('notifications:dismiss', async (_e, id: string) => {
    try { notificationCenter.dismiss(id); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('notifications:dismiss-all', async (_e, category?: string) => {
    try { notificationCenter.dismissAll(category as any); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('notifications:unread-counts', async () => {
    try { return { success: true, result: notificationCenter.getUnreadCounts() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('notifications:unread-count', async (_e, category?: string) => {
    try { return { success: true, result: notificationCenter.getUnreadCount(category as any) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('notifications:search', async (_e, query: string) => {
    try { return { success: true, result: notificationCenter.search(query) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('notifications:stats', async () => {
    try { return { success: true, result: notificationCenter.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('notifications:delete', async (_e, id: string) => {
    try { notificationCenter.delete(id); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Context Visualizer ─────────────────────────────────────────────────────
  ipcMain.handle('context-viz:breakdown', async (_e, modelId?: string) => {
    try { return { success: true, result: await contextVisualizer.getContextBreakdown(modelId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('context-viz:model-limits', async () => {
    try { return { success: true, result: contextVisualizer.getModelLimits() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('context-viz:estimate-tokens', async (_e, text: string) => {
    try { return { success: true, result: contextVisualizer.estimateTokens(text) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('context-viz:history', async (_e, hours?: number) => {
    try { return { success: true, result: contextVisualizer.getHistoricalUsage(hours) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('context-viz:record-snapshot', async () => {
    try { contextVisualizer.recordSnapshot(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Plugin Studio ────────────────────────────────────────────────────────────
  ipcMain.handle('plugin-studio:browse-registry', async (_e, query?: string, category?: string) => {
    try { return { success: true, result: pluginStudio.browseRegistry(query, category) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('plugin-studio:install', async (_e, entry: any) => {
    try { return { success: true, result: pluginStudio.install(entry) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('plugin-studio:uninstall', async (_e, pluginId: string) => {
    try { pluginStudio.uninstall(pluginId); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('plugin-studio:enable', async (_e, pluginId: string) => {
    try { pluginStudio.enable(pluginId); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('plugin-studio:disable', async (_e, pluginId: string) => {
    try { pluginStudio.disable(pluginId); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('plugin-studio:list-installed', async () => {
    try { return { success: true, result: pluginStudio.listInstalled() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('plugin-studio:get-config', async (_e, pluginId: string) => {
    try { return { success: true, result: pluginStudio.getConfig(pluginId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('plugin-studio:set-config', async (_e, pluginId: string, config: any) => {
    try { pluginStudio.setConfig(pluginId, config); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('plugin-studio:stats', async () => {
    try { return { success: true, result: pluginStudio.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Prompt Library Store ────────────────────────────────────────────────────
  ipcMain.handle('prompt-lib:list', async (_e, opts?: any) => {
    try { return { success: true, result: promptLibraryStore.list(opts) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('prompt-lib:create', async (_e, title: string, content: string, category?: string, tags?: string[]) => {
    try { return { success: true, result: promptLibraryStore.create(title, content, category, tags) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('prompt-lib:update', async (_e, id: string, updates: any) => {
    try { return { success: true, result: promptLibraryStore.update(id, updates) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('prompt-lib:delete', async (_e, id: string) => {
    try { promptLibraryStore.delete(id); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('prompt-lib:get', async (_e, id: string) => {
    try { return { success: true, result: promptLibraryStore.get(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('prompt-lib:categories', async () => {
    try { return { success: true, result: promptLibraryStore.getCategories() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('prompt-lib:toggle-favorite', async (_e, id: string) => {
    try { return { success: true, result: promptLibraryStore.toggleFavorite(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('prompt-lib:record-use', async (_e, id: string) => {
    try { promptLibraryStore.recordUse(id); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('prompt-lib:interpolate', async (_e, content: string, variables: Record<string, string>) => {
    try { return { success: true, result: promptLibraryStore.interpolate(content, variables) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('prompt-lib:stats', async () => {
    try { return { success: true, result: promptLibraryStore.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Task Board ──────────────────────────────────────────────────────────────
  ipcMain.handle('task-board:create', async (_e, title: string, opts?: any) => {
    try { return { success: true, result: taskBoard.create(title, opts) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('task-board:update', async (_e, id: string, updates: any) => {
    try { return { success: true, result: taskBoard.update(id, updates) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('task-board:delete', async (_e, id: string) => {
    try { taskBoard.delete(id); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('task-board:get', async (_e, id: string) => {
    try { return { success: true, result: taskBoard.get(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('task-board:move', async (_e, id: string, status: string, position?: number) => {
    try { return { success: true, result: taskBoard.moveToStatus(id, status as any, position) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('task-board:get-board', async () => {
    try { return { success: true, result: taskBoard.getBoard() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('task-board:search', async (_e, query: string) => {
    try { return { success: true, result: taskBoard.search(query) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('task-board:stats', async () => {
    try { return { success: true, result: taskBoard.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── API Playground ──────────────────────────────────────────────────────────
  ipcMain.handle('api-playground:execute', async (_e, providerId: string, modelId: string, endpoint: string, payload: any) => {
    try { return { success: true, result: await apiPlayground.executeRequest(providerId, modelId, endpoint, payload) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('api-playground:history', async (_e, limit?: number) => {
    try { return { success: true, result: apiPlayground.getHistory(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('api-playground:get-request', async (_e, id: string) => {
    try { return { success: true, result: apiPlayground.getRequest(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('api-playground:clear-history', async () => {
    try { apiPlayground.clearHistory(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('api-playground:list-presets', async () => {
    try { return { success: true, result: apiPlayground.listPresets() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('api-playground:save-preset', async (_e, name: string, providerId: string, modelId: string, endpoint: string, payload: any) => {
    try { return { success: true, result: apiPlayground.savePreset(name, providerId, modelId, endpoint, payload) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('api-playground:delete-preset', async (_e, id: string) => {
    try { apiPlayground.deletePreset(id); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('api-playground:stats', async () => {
    try { return { success: true, result: apiPlayground.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Performance Profiler ────────────────────────────────────────────────────
  ipcMain.handle('perf-profiler:record', async (_e, entry: any) => {
    try { return { success: true, result: performanceProfiler.record(entry) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('perf-profiler:provider-profile', async (_e, providerId: string, hours?: number) => {
    try { return { success: true, result: performanceProfiler.getProviderProfile(providerId, hours) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('perf-profiler:all-profiles', async (_e, hours?: number) => {
    try { return { success: true, result: performanceProfiler.getAllProviderProfiles(hours) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('perf-profiler:latency-series', async (_e, providerId?: string, hours?: number, bucket?: number) => {
    try { return { success: true, result: performanceProfiler.getLatencyTimeSeries(providerId, hours, bucket) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('perf-profiler:waterfall', async (_e, limit?: number) => {
    try { return { success: true, result: performanceProfiler.getWaterfall(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('perf-profiler:overall', async (_e, hours?: number) => {
    try { return { success: true, result: performanceProfiler.getOverallStats(hours) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Voice Interface ──────────────────────────────────────────────────────────
  ipcMain.handle('voice:start-session', async () => {
    try { return { success: true, result: voiceInterface.startSession() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voice:end-session', async (_e, sessionId: string) => {
    try { return { success: true, result: voiceInterface.endSession(sessionId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voice:add-transcription', async (_e, sessionId: string, text: string, confidence: number, isFinal: boolean, durationMs: number) => {
    try { return { success: true, result: voiceInterface.addTranscription(sessionId, text, confidence, isFinal, durationMs) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voice:get-transcriptions', async (_e, sessionId: string) => {
    try { return { success: true, result: voiceInterface.getTranscriptions(sessionId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voice:list-sessions', async (_e, limit?: number) => {
    try { return { success: true, result: voiceInterface.listSessions(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voice:get-settings', async () => {
    try { return { success: true, result: voiceInterface.getSettings() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voice:update-settings', async (_e, updates: any) => {
    try { return { success: true, result: voiceInterface.updateSettings(updates) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── File Attachment ─────────────────────────────────────────────────────────
  ipcMain.handle('file-attachment:upload-path', async (_e, filePath: string, sessionId?: string) => {
    try { return { success: true, result: await fileAttachment.processFile(filePath, sessionId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('file-attachment:list', async (_e, limit?: number) => {
    try { return { success: true, result: fileAttachment.listRecent(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('file-attachment:get', async (_e, id: string) => {
    try { return { success: true, result: fileAttachment.get(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('file-attachment:delete', async (_e, id: string) => {
    try { fileAttachment.delete(id); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('file-attachment:stats', async () => {
    try { return { success: true, result: fileAttachment.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Diff Viewer ─────────────────────────────────────────────────────────────
  ipcMain.handle('diff-viewer:compare', async (_e, oldText: string, newText: string, label?: string) => {
    try { return { success: true, result: diffViewer.computeDiff(oldText, newText, label) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('diff-viewer:history', async (_e, limit?: number) => {
    try { return { success: true, result: diffViewer.listHistory(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('diff-viewer:clear-history', async () => {
    try { diffViewer.clearHistory(); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── A/B Prompt Testing ──────────────────────────────────────────────────────
  ipcMain.handle('ab-testing:create', async (_e, name: string, prompt: string, models: any[], systemPrompt?: string) => {
    try { return { success: true, result: abPromptTesting.createTest(name, prompt, models, systemPrompt) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('ab-testing:run', async (_e, testId: string) => {
    try { return { success: true, result: await abPromptTesting.runTest(testId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('ab-testing:get', async (_e, testId: string) => {
    try { return { success: true, result: abPromptTesting.getTest(testId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('ab-testing:list', async (_e, limit?: number) => {
    try { return { success: true, result: abPromptTesting.listTests(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('ab-testing:score', async (_e, variantId: string, score: number, notes?: string) => {
    try { abPromptTesting.scoreVariant(variantId, score, notes); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('ab-testing:delete', async (_e, testId: string) => {
    try { abPromptTesting.deleteTest(testId); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('ab-testing:stats', async () => {
    try { return { success: true, result: abPromptTesting.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Theme Engine ────────────────────────────────────────────────────────────
  ipcMain.handle('theme:list', async () => {
    try { return { success: true, result: themeEngine.listThemes() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  ipcMain.handle('theme:create', async (_e, name: string, palette: any, opts?: any) => {
    try { return { success: true, result: themeEngine.createTheme(name, palette, opts) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('theme:update', async (_e, id: string, updates: any) => {
    try { return { success: true, result: themeEngine.updateTheme(id, updates) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('theme:delete', async (_e, id: string) => {
    try { themeEngine.deleteTheme(id); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('theme:activate', async (_e, id: string) => {
    try { return { success: true, result: themeEngine.activateTheme(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('theme:get-active', async () => {
    try { return { success: true, result: themeEngine.getActiveTheme() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('theme:export', async (_e, id: string) => {
    try { return { success: true, result: themeEngine.exportTheme(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('theme:import', async (_e, json: string) => {
    try { return { success: true, result: themeEngine.importTheme(json) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('theme:css', async (_e, themeId?: string) => {
    try { return { success: true, result: themeEngine.generateCSS(themeId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 8: Global Search ──────────────────────────────────────────────
  ipcMain.handle('global-search:search', async (_e, params: any) => {
    try { return { success: true, result: globalSearch.search(params) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('global-search:history', async (_e, limit?: number) => {
    try { return { success: true, result: globalSearch.getSearchHistory(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('global-search:clear', async () => {
    try { globalSearch.clearHistory(); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('global-search:stats', async () => {
    try { return { success: true, result: globalSearch.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 8: Activity Feed ────────────────────────────────────────────────
  ipcMain.handle('activity-feed:record', async (_e, type: string, action: string, title: string, opts?: any) => {
    try { return { success: true, result: activityFeed.record(type, action, title, opts) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('activity-feed:recent', async (_e, limit?: number, offset?: number) => {
    try { return { success: true, result: activityFeed.getRecent(limit, offset) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('activity-feed:by-type', async (_e, type: string, limit?: number) => {
    try { return { success: true, result: activityFeed.getByType(type, limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('activity-feed:stats', async (_e, hours?: number) => {
    try { return { success: true, result: activityFeed.getStats(hours) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 9: Workspace Export ─────────────────────────────────────────────
  ipcMain.handle('workspace-export:export', async (_e, tables?: string[]) => {
    try { return { success: true, result: workspaceExport.exportWorkspace(tables) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('workspace-export:import', async (_e, filePath?: string) => {
    try {
      if (!filePath) {
        const result = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }] })
        if (result.canceled || !result.filePaths[0]) return { success: true, result: null }
        filePath = result.filePaths[0]
      }
      return { success: true, result: workspaceExport.importWorkspace(filePath) }
    } catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('workspace-export:history', async (_e, limit?: number) => {
    try { return { success: true, result: workspaceExport.getExportHistory(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 9: Report Generator ─────────────────────────────────────────────
  ipcMain.handle('report-gen:session', async (_e, sessionId?: string) => {
    try { return { success: true, result: reportGenerator.generateSessionReport(sessionId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('report-gen:analytics', async (_e, hours?: number) => {
    try { return { success: true, result: reportGenerator.generateAnalyticsReport(hours) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('report-gen:custom', async (_e, title: string, sections: any[]) => {
    try { return { success: true, result: reportGenerator.generateCustomReport(title, sections) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('report-gen:get', async (_e, id: string) => {
    try { return { success: true, result: reportGenerator.getReport(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('report-gen:list', async (_e, limit?: number) => {
    try { return { success: true, result: reportGenerator.listReports(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('report-gen:delete', async (_e, id: string) => {
    try { reportGenerator.deleteReport(id); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 9: Webhook Manager ──────────────────────────────────────────────
  ipcMain.handle('webhook:create', async (_e, name: string, url: string, events: string[], opts?: any) => {
    try { return { success: true, result: webhookManager.createWebhook(name, url, events, opts) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('webhook:update', async (_e, id: string, updates: any) => {
    try { return { success: true, result: webhookManager.updateWebhook(id, updates) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('webhook:delete', async (_e, id: string) => {
    try { webhookManager.deleteWebhook(id); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('webhook:enable', async (_e, id: string) => {
    try { webhookManager.enableWebhook(id); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('webhook:disable', async (_e, id: string) => {
    try { webhookManager.disableWebhook(id); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('webhook:list', async () => {
    try { return { success: true, result: webhookManager.listWebhooks() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('webhook:logs', async (_e, webhookId?: string, limit?: number) => {
    try { return { success: true, result: webhookManager.getLogs(webhookId, limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('webhook:stats', async () => {
    try { return { success: true, result: webhookManager.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 9: Backup Manager ───────────────────────────────────────────────
  ipcMain.handle('backup:create', async (_e, type?: string, label?: string) => {
    try { return { success: true, result: backupManager.createBackup(type as any, label) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('backup:restore', async (_e, id: string) => {
    try { return { success: true, result: backupManager.restoreBackup(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('backup:list', async (_e, limit?: number) => {
    try { return { success: true, result: backupManager.listBackups(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('backup:delete', async (_e, id: string) => {
    try { backupManager.deleteBackup(id); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('backup:stats', async () => {
    try { return { success: true, result: backupManager.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 9: Session Sharing ──────────────────────────────────────────────
  ipcMain.handle('session-sharing:export', async (_e, sessionId: string, format?: string) => {
    try { return { success: true, result: sessionSharing.exportSession(sessionId, format as any) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('session-sharing:import', async (_e, filePath?: string) => {
    try {
      if (!filePath) {
        const result = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }] })
        if (result.canceled || !result.filePaths[0]) return { success: true, result: null }
        filePath = result.filePaths[0]
      }
      return { success: true, result: sessionSharing.importSession(filePath) }
    } catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('session-sharing:list', async (_e, limit?: number) => {
    try { return { success: true, result: sessionSharing.listShared(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('session-sharing:delete', async (_e, id: string) => {
    try { sessionSharing.deleteShared(id); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 10: Error Boundary ──────────────────────────────────────────────
  ipcMain.handle('error-boundary:capture', async (_e, module: string, message: string, opts?: any) => {
    try { return { success: true, result: errorBoundaryManager.capture(module, message, opts) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('error-boundary:recent', async (_e, limit?: number) => {
    try { return { success: true, result: errorBoundaryManager.getRecent(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('error-boundary:by-severity', async (_e, severity: string, limit?: number) => {
    try { return { success: true, result: errorBoundaryManager.getBySeverity(severity, limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('error-boundary:mark-recovered', async (_e, id: string) => {
    try { errorBoundaryManager.markRecovered(id); return { success: true, result: null } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('error-boundary:stats', async (_e, hours?: number) => {
    try { return { success: true, result: errorBoundaryManager.getStats(hours) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 10: Offline Manager ─────────────────────────────────────────────
  ipcMain.handle('offline:stats', async () => {
    try { return { success: true, result: offlineManager.getStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('offline:queue', async (_e, status?: string) => {
    try { return { success: true, result: offlineManager.getQueue(status) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('offline:connectivity-log', async (_e, limit?: number) => {
    try { return { success: true, result: offlineManager.getConnectivityLog(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('offline:clear-completed', async () => {
    try { return { success: true, result: offlineManager.clearCompleted() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 10: Startup Profiler ────────────────────────────────────────────
  ipcMain.handle('startup-profiler:finalize', async () => {
    try { return { success: true, result: startupProfiler.finalizeStartup() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('startup-profiler:history', async (_e, limit?: number) => {
    try { return { success: true, result: startupProfiler.getHistory(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('startup-profiler:get', async (_e, id: string) => {
    try { return { success: true, result: startupProfiler.getProfile(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('startup-profiler:average', async (_e, count?: number) => {
    try { return { success: true, result: startupProfiler.getAverageStartup(count) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 10: Accessibility ───────────────────────────────────────────────
  ipcMain.handle('a11y:get-settings', async () => {
    try { return { success: true, result: accessibilityManager.getSettings() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('a11y:update', async (_e, updates: any) => {
    try { return { success: true, result: accessibilityManager.updateSettings(updates) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('a11y:reset', async () => {
    try { return { success: true, result: accessibilityManager.resetSettings() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('a11y:css', async () => {
    try { return { success: true, result: accessibilityManager.generateCSS() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Session 10: Build Validator ─────────────────────────────────────────────
  ipcMain.handle('build-validator:run', async () => {
    try { return { success: true, result: buildValidator.runValidation() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('build-validator:history', async (_e, limit?: number) => {
    try { return { success: true, result: buildValidator.getHistory(limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('build-validator:get', async (_e, id: string) => {
    try { return { success: true, result: buildValidator.getResult(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 1: Channel Router ─────────────────────────────────────────────────────
  ipcMain.handle('channelRouter:init', async (_e) => {
    try { return { success: true, result: channelRouter.init() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('channelRouter:routeMessage', async (_e, msg: any) => {
    try { return { success: true, result: await channelRouter.routeMessage(msg) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('channelRouter:getActiveSessions', async (_e) => {
    try { return { success: true, result: channelRouter.getActiveSessions() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('channelRouter:clearStale', async (_e, maxAgeMs?: number) => {
    try { return { success: true, result: channelRouter.clearStale(maxAgeMs) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('channelRouter:shutdown', async (_e) => {
    try { return { success: true, result: channelRouter.shutdown() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 1: Plugin Sandbox ─────────────────────────────────────────────────────
  ipcMain.handle('pluginSandbox:init', async (_e) => {
    try { return { success: true, result: pluginSandbox.init() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pluginSandbox:createSandbox', async (_e, pluginId: string, manifest: any) => {
    try { return { success: true, result: pluginSandbox.createSandbox(pluginId, manifest) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pluginSandbox:execute', async (_e, pluginId: string, code: string) => {
    try { return { success: true, result: await pluginSandbox.execute(pluginId, code) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pluginSandbox:destroy', async (_e, pluginId: string) => {
    try { return { success: true, result: pluginSandbox.destroy(pluginId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pluginSandbox:getAuditLog', async (_e, pluginId: string) => {
    try { return { success: true, result: pluginSandbox.getAuditLog(pluginId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pluginSandbox:listSandboxes', async (_e) => {
    try { return { success: true, result: pluginSandbox.listSandboxes() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pluginSandbox:getSandboxInfo', async (_e, pluginId: string) => {
    try { return { success: true, result: pluginSandbox.getSandboxInfo(pluginId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pluginSandbox:shutdown', async (_e) => {
    try { return { success: true, result: pluginSandbox.shutdown() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 1: NyraGuard ──────────────────────────────────────────────────────────
  ipcMain.handle('nyraGuard:init', async (_e) => {
    try { return { success: true, result: nyraGuard.init() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('nyraGuard:scanPlugin', async (_e, pluginDir: string) => {
    try { return { success: true, result: nyraGuard.scanPlugin(pluginDir) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('nyraGuard:scanCode', async (_e, files: string[]) => {
    try { return { success: true, result: nyraGuard.scanCode(files) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('nyraGuard:scanDependencies', async (_e, packageJsonPath: string) => {
    try {
      const fs = require('fs')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      return { success: true, result: nyraGuard.scanDependencies(packageJson) }
    }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('nyraGuard:getIssues', async (_e) => {
    try { return { success: true, result: (nyraGuard as any).getIssues?.() || [] } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('nyraGuard:shutdown', async (_e) => {
    try { return { success: true, result: nyraGuard.shutdown() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('nyraGuard:generateReport', async (_e) => {
    try {
      const issues = (nyraGuard as any).getIssues?.() || []
      const report = {
        generatedAt: Date.now(),
        totalIssues: issues.length,
        bySeverity: {
          critical: issues.filter((i: any) => i.severity === 'critical').length,
          high: issues.filter((i: any) => i.severity === 'high').length,
          medium: issues.filter((i: any) => i.severity === 'medium').length,
          low: issues.filter((i: any) => i.severity === 'low').length,
        },
        issues,
      }
      return { success: true, result: report }
    }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 1: Telemetry ──────────────────────────────────────────────────────────
  ipcMain.handle('telemetry:init', async (_e) => {
    try { return { success: true, result: telemetryService.init() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetry:setEnabled', async (_e, enabled: boolean) => {
    try { return { success: true, result: telemetryService.setEnabled(enabled) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetry:isEnabled', async (_e) => {
    try { return { success: true, result: telemetryService.isEnabled() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetry:trackEvent', async (_e, category: string, action: string, properties?: Record<string, any>) => {
    try { return { success: true, result: telemetryService.trackEvent(category, properties) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetry:trackFeatureUsage', async (_e, feature: string) => {
    try { return { success: true, result: telemetryService.trackEvent(`feature:${feature}`) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetry:reportCrash', async (_e, error: any, context?: Record<string, any>) => {
    try { return { success: true, result: telemetryService.reportCrash(error instanceof Error ? error : new Error(String(error)), context) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetry:startSession', async (_e) => {
    try { return { success: true, result: telemetryService.startSession() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetry:endSession', async (_e) => {
    try { return { success: true, result: telemetryService.endSession() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetry:getCurrentSession', async (_e) => {
    try { return { success: true, result: telemetryService.getCurrentSession() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetry:flush', async (_e) => {
    try { return { success: true, result: telemetryService.flush() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetry:getStats', async (_e) => {
    try { return { success: true, result: (telemetryService as any).getStats?.() || { events: 0, crashes: 0 } } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetry:shutdown', async (_e) => {
    try { return { success: true, result: telemetryService.shutdown() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── telemetryService:* aliases (preload uses telemetryService: prefix) ────────
  ipcMain.handle('telemetryService:init', async (_e) => {
    try { return { success: true, result: telemetryService.init() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetryService:track', async (_e, category: string, action: string, properties?: Record<string, any>) => {
    try { return { success: true, result: telemetryService.trackEvent(category, action, properties) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetryService:getStats', async (_e) => {
    try { return { success: true, result: (telemetryService as any).getStats?.() || { events: 0, crashes: 0 } } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetryService:setOptIn', async (_e, optIn: boolean) => {
    try { return { success: true, result: telemetryService.setEnabled(optIn) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('telemetryService:shutdown', async (_e) => {
    try { return { success: true, result: telemetryService.shutdown() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 2: Collaboration ─────────────────────────────────────────────────────
  // PriorityMessageQueue
  ipcMain.handle('priorityQueue:init', async (_e) => {
    try { return { success: true, result: priorityQueue.init() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('priorityQueue:enqueue', async (_e, msg: any) => {
    try { return { success: true, result: priorityQueue.enqueue(msg) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('priorityQueue:dequeue', async (_e, agentId?: string) => {
    try { return { success: true, result: priorityQueue.dequeue(agentId || '') } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('priorityQueue:peek', async (_e, agentId?: string) => {
    try { return { success: true, result: priorityQueue.peek(agentId || '') } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('priorityQueue:getQueueSize', async (_e, agentId?: string) => {
    try { return { success: true, result: agentId ? priorityQueue.getQueueDepth(agentId) : priorityQueue.getTotalPending() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('priorityQueue:registerAgent', async (_e, agentId: string) => {
    try { return { success: true, result: priorityQueue.registerAgent(agentId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('priorityQueue:pruneExpired', async (_e) => {
    try { return { success: true, result: priorityQueue.pruneExpired() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('priorityQueue:getTotalPending', async (_e) => {
    try {
      let total = 0
      for (const agentId of (priorityQueue as any).agentQueues?.keys?.() || []) {
        total += priorityQueue.getQueueSize(agentId)
      }
      return { success: true, result: total }
    }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('priorityQueue:shutdown', async (_e) => {
    try { return { success: true, result: priorityQueue.shutdown() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  
  // SharedWorkspace
  ipcMain.handle('sharedWorkspace:init', async (_e) => {
    try { return { success: true, result: sharedWorkspace.init() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('sharedWorkspace:read', async (_e, key: string) => {
    try { return { success: true, result: sharedWorkspace.read(key) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('sharedWorkspace:write', async (_e, key: string, value: any, owner: string) => {
    try { return { success: true, result: sharedWorkspace.write(key, value, owner) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('sharedWorkspace:cas', async (_e, key: string, value: any, owner: string, expectedVersion: number) => {
    try { return { success: true, result: sharedWorkspace.cas(key, value, owner, expectedVersion) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('sharedWorkspace:list', async (_e) => {
    try { return { success: true, result: sharedWorkspace.list() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('sharedWorkspace:getHistory', async (_e, key?: string, limit?: number) => {
    try { return { success: true, result: sharedWorkspace.getHistory(key, limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('sharedWorkspace:clear', async (_e) => {
    try { return { success: true, result: sharedWorkspace.clear() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('sharedWorkspace:shutdown', async (_e) => {
    try { return { success: true, result: sharedWorkspace.shutdown() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  
  // PlanExecuteReviewPipeline
  ipcMain.handle('pipeline:init', async (_e) => {
    try { return { success: true, result: pipeline.init() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pipeline:createPlan', async (_e, planId: string, steps: any[]) => {
    try { return { success: true, result: pipeline.createPlan(planId, steps) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pipeline:executeStep', async (_e, planId: string, stepId: string) => {
    try { return { success: true, result: await pipeline.executeStep(planId, stepId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pipeline:submitResult', async (_e, planId: string, stepId: string, output: any) => {
    try { return { success: true, result: pipeline.submitResult(planId, stepId, output) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pipeline:approveStep', async (_e, planId: string, stepId: string, notes?: string) => {
    try { return { success: true, result: pipeline.approveStep(planId, stepId, notes) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pipeline:rejectStep', async (_e, planId: string, stepId: string, notes: string) => {
    try { return { success: true, result: pipeline.rejectStep(planId, stepId, notes) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pipeline:getPlan', async (_e, planId: string) => {
    try { return { success: true, result: pipeline.getPlan(planId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pipeline:getPlanProgress', async (_e, planId: string) => {
    try { return { success: true, result: pipeline.getPlanProgress(planId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('pipeline:shutdown', async (_e) => {
    try { return { success: true, result: pipeline.shutdown() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 2: Voice Engine ───────────────────────────────────────────────────────
  ipcMain.handle('voiceEngine:init', async (_e) => {
    try { return { success: true, result: voiceEngine.init() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voiceEngine:initialize', async (_e) => {
    try { return { success: true, result: await voiceEngine.initialize() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voiceEngine:startRecording', async (_e) => {
    try { return { success: true, result: voiceEngine.startRecording() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voiceEngine:stopRecording', async (_e) => {
    try { return { success: true, result: await voiceEngine.stopRecording() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voiceEngine:transcribe', async (_e, audioBuffer: Buffer) => {
    try { return { success: true, result: await voiceEngine.transcribe(audioBuffer) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voiceEngine:speak', async (_e, text: string) => {
    try { return { success: true, result: await voiceEngine.speak(text) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voiceEngine:getConfig', async (_e) => {
    try { return { success: true, result: voiceEngine.getConfig() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voiceEngine:updateConfig', async (_e, partial: any) => {
    try { return { success: true, result: voiceEngine.updateConfig(partial) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('voiceEngine:shutdown', async (_e) => {
    try { return { success: true, result: voiceEngine.shutdown() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 2: Model Router ───────────────────────────────────────────────────────
  ipcMain.handle('modelRouter:init', async (_e) => {
    try { return { success: true, result: modelRouter.init() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('modelRouter:route', async (_e, query: any) => {
    try { return { success: true, result: modelRouter.route(query) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('modelRouter:addModel', async (_e, profile: any) => {
    try { return { success: true, result: modelRouter.addModel(profile) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('modelRouter:removeModel', async (_e, modelId: string) => {
    try {
      const models = modelRouter.getAvailableModels()
      const idx = models.findIndex(m => m.id === modelId)
      if (idx >= 0) models.splice(idx, 1)
      return { success: true, result: true }
    }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('modelRouter:getAvailableModels', async (_e) => {
    try { return { success: true, result: modelRouter.getAvailableModels() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('modelRouter:getRoutingStats', async (_e) => {
    try { return { success: true, result: modelRouter.getRoutingStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('modelRouter:getBudget', async (_e) => {
    try { return { success: true, result: modelRouter.getBudget() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('modelRouter:setBudget', async (_e, daily: number, monthly: number) => {
    try { return { success: true, result: modelRouter.setBudget(daily, monthly) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('modelRouter:recordFeedback', async (_e, modelId: string, feedback: 'good' | 'bad') => {
    try { return { success: true, result: modelRouter.recordFeedback(modelId, feedback) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('modelRouter:recordSpend', async (_e, cents: number) => {
    try { return { success: true, result: modelRouter.recordSpend(cents) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('modelRouter:resetDailySpend', async (_e) => {
    try { return { success: true, result: modelRouter.resetDailySpend() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('modelRouter:shutdown', async (_e) => {
    try { return { success: true, result: modelRouter.shutdown() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 2: Security Scanner ───────────────────────────────────────────────────
  ipcMain.handle('securityScanner:init', async (_e) => {
    try { return { success: true, result: securityScanner.init() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('securityScanner:scanPlugin', async (_e, pluginDir: string) => {
    try { return { success: true, result: await securityScanner.scanPlugin(pluginDir) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('securityScanner:scanCode', async (_e, code: string, filename?: string) => {
    try { return { success: true, result: await securityScanner.scanCode(code, filename) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('securityScanner:shutdown', async (_e) => {
    try { return { success: true, result: securityScanner.shutdown() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 3: SSO/RBAC ───────────────────────────────────────────────────────────
  ipcMain.handle('ssoProvider:init', async (_e) => {
    try { ssoProvider.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('ssoProvider:initiateSsoLogin', async (_e, provider: string, config: any) => {
    try { return { success: true, result: ssoProvider.initiateSsoLogin(provider as 'saml' | 'oidc', config) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('ssoProvider:handleCallback', async (_e, code: string, state: string) => {
    try { return { success: true, result: ssoProvider.handleCallback({ code, state }) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('ssoProvider:validateToken', async (_e, token: string) => {
    try { return { success: true, result: ssoProvider.validateToken(token) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('ssoProvider:refreshToken', async (_e, refreshToken: string) => {
    try { return { success: true, result: ssoProvider.refreshToken(refreshToken) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('rbacManager:init', async (_e) => {
    try { rbacManager.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('rbacManager:assignRole', async (_e, userId: string, role: string) => {
    try { rbacManager.assignRole(userId, role as any); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('rbacManager:removeRole', async (_e, userId: string, role: string) => {
    try { rbacManager.removeRole(userId, role as any); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('rbacManager:getUserRoles', async (_e, userId: string) => {
    try { return { success: true, result: rbacManager.getUserRoles(userId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('rbacManager:checkPermission', async (_e, userId: string, permission: string) => {
    try { return { success: true, result: rbacManager.checkPermission(userId, permission as any) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('teamManager:init', async (_e) => {
    try { teamManager.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('teamManager:createTeam', async (_e, name: string, ownerId: string) => {
    try { return { success: true, result: teamManager.createTeam(name, ownerId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('teamManager:inviteMember', async (_e, teamId: string, email: string, role: string) => {
    try { return { success: true, result: teamManager.inviteMember(teamId, email, role as any) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('teamManager:removeMember', async (_e, teamId: string, userId: string) => {
    try { return { success: true, result: teamManager.removeMember(teamId, userId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('teamManager:listMembers', async (_e, teamId: string) => {
    try { return { success: true, result: teamManager.listMembers(teamId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('teamManager:updateMemberRole', async (_e, teamId: string, userId: string, newRole: string) => {
    try { return { success: true, result: teamManager.updateMemberRole(teamId, userId, newRole as any) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 3: Policy Engine ──────────────────────────────────────────────────────
  ipcMain.handle('policyEngine:init', async (_e) => {
    try { policyEngine.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('policyEngine:createPolicy', async (_e, orgId: string, type: string, rules: any) => {
    try { return { success: true, result: policyEngine.createPolicy(orgId, type as any, rules) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('policyEngine:evaluateRequest', async (_e, context: any, orgId: string) => {
    try { return { success: true, result: policyEngine.evaluateRequest(context, orgId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('policyEngine:getPolicies', async (_e, orgId: string) => {
    try { return { success: true, result: policyEngine.getPolicies(orgId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('policyEngine:updatePolicy', async (_e, id: string, rules: any) => {
    try { return { success: true, result: policyEngine.updatePolicy(id, rules) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('policyEngine:disablePolicy', async (_e, id: string) => {
    try { return { success: true, result: policyEngine.disablePolicy(id) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('policyEngine:getAuditLog', async (_e, orgId: string) => {
    try { return { success: true, result: policyEngine.getAuditLog(orgId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 3: Admin Console ──────────────────────────────────────────────────────
  ipcMain.handle('adminConsole:init', async (_e) => {
    try { adminConsole.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('adminConsole:getDashboard', async (_e, orgId: string) => {
    try { return { success: true, result: adminConsole.getDashboard(orgId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('adminConsole:listUsers', async (_e, orgId: string, filters?: any) => {
    try { return { success: true, result: adminConsole.listUsers(orgId, filters) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('adminConsole:activateUser', async (_e, userId: string) => {
    try { return { success: true, result: adminConsole.activateUser(userId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('adminConsole:suspendUser', async (_e, userId: string) => {
    try { return { success: true, result: adminConsole.suspendUser(userId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('adminConsole:getBillingOverview', async (_e, orgId: string) => {
    try { return { success: true, result: adminConsole.getBillingOverview(orgId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('adminConsole:setSpendingLimit', async (_e, orgId: string, limit: number) => {
    try { return { success: true, result: adminConsole.setSpendingLimit(orgId, limit) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('adminConsole:generateComplianceReport', async (_e, orgId: string, framework: string) => {
    try { return { success: true, result: adminConsole.generateComplianceReport(orgId, framework as any) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('adminConsole:getAuditLog', async (_e, orgId: string, filters?: any) => {
    try { return { success: true, result: adminConsole.getAuditLog(orgId, filters) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 3: Vertical Agents ────────────────────────────────────────────────────
  ipcMain.handle('verticalAgentManager:init', async (_e) => {
    try { verticalAgentManager.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('verticalAgentManager:registerPack', async (_e, pack: any) => {
    try { verticalAgentManager.registerPack(pack); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('verticalAgentManager:listPacks', async (_e) => {
    try { return { success: true, result: verticalAgentManager.listPacks() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('verticalAgentManager:getPack', async (_e, packId: string) => {
    try { return { success: true, result: verticalAgentManager.getPack(packId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('verticalAgentManager:activatePack', async (_e, packId: string, teamId: string) => {
    try { verticalAgentManager.activatePack(packId, teamId); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('verticalAgentManager:deactivatePack', async (_e, packId: string, teamId: string) => {
    try { verticalAgentManager.deactivatePack(packId, teamId); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('verticalAgentManager:getActivePacksForTeam', async (_e, teamId: string) => {
    try { return { success: true, result: verticalAgentManager.getActivePacksForTeam(teamId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 4: Procedural Memory ──────────────────────────────────────────────────
  ipcMain.handle('proceduralMemory:init', async (_e) => {
    try { proceduralMemory.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('proceduralMemory:learn', async (_e, taskResult: any) => {
    try { return { success: true, result: proceduralMemory.learn(taskResult) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('proceduralMemory:recall', async (_e, context: any) => {
    try { return { success: true, result: proceduralMemory.recall(context) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('proceduralMemory:reinforce', async (_e, procedureId: string, success: boolean) => {
    try { proceduralMemory.reinforce(procedureId, success); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('proceduralMemory:getProcedures', async (_e) => {
    try { return { success: true, result: proceduralMemory.getProcedures() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('feedbackLoop:init', async (_e) => {
    try { feedbackLoop.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('feedbackLoop:recordOutcome', async (_e, taskId: string, agentId: string, result: any, rating: number) => {
    try { feedbackLoop.recordOutcome(taskId, agentId, result, rating); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('feedbackLoop:getAgentScore', async (_e, agentId: string) => {
    try { return { success: true, result: feedbackLoop.getAgentScore(agentId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('feedbackLoop:getHistory', async (_e, limit?: number) => {
    try { return { success: true, result: feedbackLoop.getOutcomes() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 4: Cross-org Protocol ─────────────────────────────────────────────────
  ipcMain.handle('crossOrgProtocol:init', async (_e) => {
    try { crossOrgProtocol.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('crossOrgProtocol:startServer', async (_e, port?: number) => {
    try { crossOrgProtocol.startServer(port); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('crossOrgProtocol:register', async (_e, agentDef: any) => {
    try { crossOrgProtocol.register(agentDef); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('crossOrgProtocol:discover', async (_e, capabilities?: string[]) => {
    try { return { success: true, result: crossOrgProtocol.discover(capabilities) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('crossOrgProtocol:sendMessage', async (_e, targetId: any, message: any) => {
    try { return { success: true, result: crossOrgProtocol.sendMessage(targetId, 'request', message) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('crossOrgProtocol:getQueueStatus', async (_e) => {
    try { return { success: true, result: crossOrgProtocol.getQueueStatus() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentMarketplace:init', async (_e) => {
    try { agentMarketplace.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentMarketplace:publishAgent', async (_e, agentDef: any) => {
    try { agentMarketplace.publishAgent(agentDef); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentMarketplace:searchAgents', async (_e, query: string) => {
    try { return { success: true, result: agentMarketplace.listAgents() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentMarketplace:getAgent', async (_e, agentId: string) => {
    try { return { success: true, result: agentMarketplace.listAgents() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentMarketplace:listAgents', async (_e) => {
    try { return { success: true, result: agentMarketplace.listAgents() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 4: Mobile Bridge ──────────────────────────────────────────────────────
  ipcMain.handle('mobileBridge:init', async (_e) => {
    try { mobileBridge.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('mobileBridge:startLocalServer', async (_e) => {
    try { await mobileBridge.startLocalServer(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('mobileBridge:stopLocalServer', async (_e) => {
    try { await mobileBridge.stopLocalServer(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('mobileBridge:generatePairingCode', async (_e) => {
    try { return { success: true, result: mobileBridge.generatePairingCode() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('mobileBridge:confirmPairing', async (_e, code: string, deviceInfo: any) => {
    try { return { success: true, result: mobileBridge.confirmPairing(code, deviceInfo) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('mobileBridge:listDevices', async (_e) => {
    try { return { success: true, result: mobileBridge.listDevices() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('mobileBridge:removeDevice', async (_e, deviceId: string) => {
    try { return { success: true, result: mobileBridge.removeDevice(deviceId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('mobileBridge:syncConversations', async (_e, deviceId: string) => {
    try { return { success: true, result: mobileBridge.syncConversations(deviceId) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('mobileBridge:pushNotification', async (_e, deviceId: string, notification: any) => {
    try { return { success: true, result: mobileBridge.pushNotification(deviceId, notification) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 5: System Overlay ─────────────────────────────────────────────────────
  ipcMain.handle('systemOverlay:init', async (_e) => {
    try { systemOverlay.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('systemOverlay:activate', async (_e) => {
    try { systemOverlay.activate(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('systemOverlay:deactivate', async (_e) => {
    try { systemOverlay.deactivate(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('systemOverlay:registerHotkey', async (_e, combo: string) => {
    try { systemOverlay.registerHotkey(combo); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('systemOverlay:unregisterHotkey', async (_e, combo: string) => {
    try { systemOverlay.unregisterHotkey(combo); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('systemOverlay:getMode', async (_e) => {
    try { return { success: true, result: systemOverlay.getMode() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('systemOverlay:setMode', async (_e, mode: string) => {
    try { systemOverlay.setMode(mode as any); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('systemOverlay:getAppProfile', async (_e, appName: string) => {
    try { return { success: true, result: systemOverlay.getAppProfile(appName) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('systemOverlay:captureContext', async (_e) => {
    try { return { success: true, result: systemOverlay.captureContext() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('systemOverlay:injectResponse', async (_e, text: string) => {
    try { systemOverlay.injectResponse(text); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('systemOverlay:getActiveWindow', async (_e) => {
    try { return { success: true, result: systemOverlay.getActiveWindow() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 5: i18n ───────────────────────────────────────────────────────────────
  ipcMain.handle('i18n:init', async (_e) => {
    try { i18n.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('i18n:t', async (_e, key: string, params?: any) => {
    try { return { success: true, result: i18n.t(key, params) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('i18n:tp', async (_e, key: string, count: number, params?: any) => {
    try { return { success: true, result: i18n.tp(key, count, params) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('i18n:setLocale', async (_e, locale: string) => {
    try { i18n.setLocale(locale); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('i18n:getLocale', async (_e) => {
    try { return { success: true, result: i18n.getLocale() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('i18n:getSupportedLocales', async (_e) => {
    try { return { success: true, result: i18n.getSupportedLocales() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('i18n:formatNumber', async (_e, n: number, locale?: string) => {
    try { return { success: true, result: i18n.formatNumber(n, locale) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('i18n:formatDate', async (_e, d: any, locale?: string) => {
    try { return { success: true, result: i18n.formatDate(new Date(d), locale) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('i18n:formatCurrency', async (_e, n: number, currency: string, locale?: string) => {
    try { return { success: true, result: i18n.formatCurrency(n, currency, locale) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('i18n:isRtl', async (_e, locale?: string) => {
    try { return { success: true, result: i18n.isRtl(locale) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('i18n:loadTranslations', async (_e, locale: string, translations: any) => {
    try { i18n.loadTranslations(locale, translations); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('i18n:getMissingKeys', async (_e, locale: string) => {
    try { return { success: true, result: i18n.getMissingKeys(locale) } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Year 5: Agent Network ──────────────────────────────────────────────────────
  ipcMain.handle('agentNetwork:init', async (_e) => {
    try { agentNetwork.init(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentNetwork:join', async (_e, networkId?: string) => {
    try { agentNetwork.join(networkId); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentNetwork:leave', async (_e) => {
    try { agentNetwork.leave(); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentNetwork:shareInsight', async (_e, topic: string, content: string, confidence: number) => {
    try { return { success: true, result: agentNetwork.shareInsight(topic, content, confidence) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentNetwork:queryInsights', async (_e, topic: string, minConfidence?: number) => {
    try { return { success: true, result: agentNetwork.queryInsights(topic, minConfidence) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentNetwork:voteInsight', async (_e, insightId: string, helpful: boolean) => {
    try { agentNetwork.voteInsight(insightId, helpful); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentNetwork:reportTaskOutcome', async (_e, taskType: string, approach: string, success: boolean) => {
    try { agentNetwork.reportTaskOutcome(taskType, approach, success); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentNetwork:getBestApproach', async (_e, taskType: string) => {
    try { return { success: true, result: agentNetwork.getBestApproach(taskType) } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentNetwork:getTrendingTopics', async (_e) => {
    try { return { success: true, result: agentNetwork.getTrendingTopics() } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('agentNetwork:getNetworkStats', async (_e) => {
    try { return { success: true, result: agentNetwork.getNetworkStats() } }
    catch (err: any) { return { success: false, error: err.message } }
  })

  // ── Window ────────────────────────────────────────────────────────────────────
  ipcMain.on('window:minimize',  () => mainWindow?.minimize())
  ipcMain.on('window:maximize',  () => { if (mainWindow) mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize() })
  ipcMain.on('window:close',     () => mainWindow?.close())
  ipcMain.on('window:hide',      () => mainWindow?.hide())
  ipcMain.on('window:fullscreen',() => { if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen()) })
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)
}

// ── MIME helper ───────────────────────────────────────────────────────────────
function guessMime(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase() ?? ''
  const m: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    json: 'application/json', ts: 'text/typescript', tsx: 'text/typescript',
    js: 'text/javascript', jsx: 'text/javascript', html: 'text/html',
    css: 'text/css', py: 'text/x-python', go: 'text/x-go',
    sh: 'text/x-shellscript', yaml: 'text/yaml', yml: 'text/yaml',
    rs: 'text/x-rust', cpp: 'text/x-c++', c: 'text/x-c', java: 'text/x-java',
    rb: 'text/x-ruby', swift: 'text/x-swift', kt: 'text/x-kotlin',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip', mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav'
  }
  return m[ext] ?? 'application/octet-stream'
}
