/**
 * Nyra Desktop — Electron Main Process  (v2 — full feature build)
 *
 * Shortcuts:
 *  ⌘/Ctrl + Shift + Space   show/hide
 *  ⌘/Ctrl + K               command palette
 *  ⌘/Ctrl + N               new chat
 *  ⌘/Ctrl + ,               settings
 *  ⌘/Ctrl + +/-/0           zoom in/out/reset
 *  ⌘/Ctrl + Shift + I       devtools
 */

import {
  app, BrowserWindow, nativeTheme, shell,
  globalShortcut, Menu, MenuItem
} from 'electron'
import { join } from 'path'
import { openClawManager } from './openclaw'
import { registerIpcHandlers } from './ipc'
import { createTray, destroyTray } from './tray'
import { initAutoUpdater } from './updater'
import { startWsProxy, stopWsProxy } from './wsproxy'
import { syncProvidersToOpenClaw, saveApiKey } from './providers'
import { syncBackRefreshedTokens } from './auth-profiles'
import { syncOllamaToOpenClaw } from './ollama'
import { memoryManager } from './memory'
import { ptyManager } from './pty'
import { codebaseIndexer } from './indexer'
import { mcpRuntime } from './mcp-runtime'

// ── Phase 1.1: Provider Abstraction Layer ────────────────────────────────────
import { providerRegistry } from './providers/provider-registry'
import { OpenAIProvider } from './providers/openai-provider'
import { AnthropicProvider } from './providers/anthropic-provider'
import { OllamaProvider } from './providers/ollama-provider'
import { loadApiKey } from './providers'

// ── Phase 1.3: Custom Agent Framework ────────────────────────────────────────
import { agentManager } from './agents/agent-manager'

// ── Phase 2: Intelligence Modules ────────────────────────────────────────────
import { memoryArchitect } from './memory/memory-architecture'
import { memoryLifecycle } from './memory/memory-lifecycle'
import { registerSemanticTier } from './memory/semantic-adapter'
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
import { reasoningEngine } from './reasoning/reasoning-engine'
import { ensembleEngine } from './ensemble/ensemble-engine'

// ── Session 8: Search & Activity ────────────────────────────────────────────
import { globalSearch } from './global-search'
import { activityFeed } from './activity-feed'

// ── Session 9: Export, Reports, Webhooks, Backup, Sharing ───────────────────
import { workspaceExport } from './workspace-export'
import { reportGenerator } from './report-generator'
import { webhookManager } from './webhook-manager'
import { backupManager } from './backup-manager'
import { sessionSharing } from './session-sharing'

// ── Session 10: Error, Offline, Startup, Accessibility, Validator ───────────
import { errorBoundaryManager } from './error-boundary-manager'
import { offlineManager } from './offline-manager'
import { startupProfiler } from './startup-profiler'
import { accessibilityManager } from './accessibility-manager'
import { buildValidator } from './build-validator'

// ── Dark mode ─────────────────────────────────────────────────────────────────
nativeTheme.themeSource = 'dark'

// ── Deep links (nyra://) ─────────────────────────────────────────────────────
if (process.platform === 'darwin') {
  app.setAsDefaultProtocolClient('nyra')
} else {
  app.setAsDefaultProtocolClient('nyra', process.execPath, [__filename])
}

// ── Single-instance lock ──────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// ── App state ─────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let zoomFactor = 1.0
const ZOOM_STEP = 0.1
const ZOOM_MIN  = 0.6
const ZOOM_MAX  = 2.0

// ── Window factory ────────────────────────────────────────────────────────────
function createWindow(): BrowserWindow {
  // On Windows/Linux the icon must be set at runtime (macOS uses the .icns from the bundle)
  const iconPath = process.platform !== 'darwin'
    ? join(__dirname, '../../resources/icon.png')
    : undefined

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    ...(iconPath ? { icon: iconPath } : {}),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 18, y: 14 },
    backgroundColor: '#0c0c0c',
    ...(process.platform === 'darwin' ? {
      vibrancy: 'sidebar',
      visualEffectState: 'active',
    } : {}),
    ...(process.platform === 'win32' ? {
      backgroundMaterial: 'acrylic',
    } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  win.once('ready-to-show', () => { win.show(); win.focus() })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') || url.startsWith('https')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Minimize to tray on close
  win.on('close', (e) => {
    if (!(app as typeof app & { isQuitting?: boolean }).isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(zoomFactor)
  })

  // Pipe renderer console to terminal (debug helper)
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const lvl = ['verbose','info','warning','error'][level] ?? 'log'
    console.log(`[Renderer:${lvl}] ${message}  (${sourceId}:${line})`)
  })

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Renderer crashed]', details)
  })

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[DidFailLoad]', code, desc, url)
  })

  return win
}

// ── Zoom helpers ──────────────────────────────────────────────────────────────
function zoomIn(win: BrowserWindow)    { zoomFactor = Math.min(zoomFactor + ZOOM_STEP, ZOOM_MAX); win.webContents.setZoomFactor(zoomFactor); win.webContents.send('zoom:changed', zoomFactor) }
function zoomOut(win: BrowserWindow)   { zoomFactor = Math.max(zoomFactor - ZOOM_STEP, ZOOM_MIN); win.webContents.setZoomFactor(zoomFactor); win.webContents.send('zoom:changed', zoomFactor) }
function zoomReset(win: BrowserWindow) { zoomFactor = 1.0; win.webContents.setZoomFactor(zoomFactor); win.webContents.send('zoom:changed', zoomFactor) }

// ── Global shortcuts ──────────────────────────────────────────────────────────
function registerShortcuts(win: BrowserWindow) {
  const mod = process.platform === 'darwin' ? 'Command' : 'Control'

  globalShortcut.register(`${mod}+Shift+Space`, () => {
    if (win.isVisible() && win.isFocused()) win.hide()
    else { win.show(); win.focus() }
  })

  globalShortcut.register(`${mod}+K`, () => {
    win.show(); win.focus()
    win.webContents.send('shortcut:command-palette')
  })

  globalShortcut.register(`${mod}+=`, () => zoomIn(win))
  globalShortcut.register(`${mod}+Plus`, () => zoomIn(win))
  globalShortcut.register(`${mod}+-`, () => zoomOut(win))
  globalShortcut.register(`${mod}+0`, () => zoomReset(win))

  globalShortcut.register(`${mod}+N`, () => {
    win.show(); win.focus()
    win.webContents.send('shortcut:new-chat')
  })

  globalShortcut.register(`${mod}+,`, () => {
    win.show(); win.focus()
    win.webContents.send('shortcut:settings')
  })

  globalShortcut.register(`${mod}+Shift+I`, () => {
    win.webContents.toggleDevTools()
  })
}

// ── Context menu ──────────────────────────────────────────────────────────────
function buildContextMenu(win: BrowserWindow) {
  win.webContents.on('context-menu', (_e, params) => {
    const menu = new Menu()
    if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }))
      menu.append(new MenuItem({ type: 'separator' }))
    }
    menu.append(new MenuItem({ label: 'Select All', role: 'selectAll' }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({ label: 'Zoom In',    click: () => zoomIn(win) }))
    menu.append(new MenuItem({ label: 'Zoom Out',   click: () => zoomOut(win) }))
    menu.append(new MenuItem({ label: 'Reset Zoom', click: () => zoomReset(win) }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({ label: 'Inspect Element', click: () => win.webContents.inspectElement(params.x, params.y) }))
    menu.popup({ window: win })
  })
}

// ── Deep link handler ─────────────────────────────────────────────────────────
function handleDeepLink(url: string, win: BrowserWindow) {
  win.show(); win.focus()
  win.webContents.send('deeplink', url)
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Start the WS origin-rewriting proxy before creating the window so that
  // the renderer can connect to ws://127.0.0.1:18790 as soon as it loads.
  startWsProxy()

  mainWindow = createWindow()
  registerIpcHandlers(mainWindow)
  createTray(mainWindow)
  registerShortcuts(mainWindow)
  buildContextMenu(mainWindow)
  initAutoUpdater(mainWindow)

  const { ipcMain } = await import('electron')
  ipcMain.handle('zoom:get', () => zoomFactor)
  ipcMain.on('zoom:in',    () => mainWindow && zoomIn(mainWindow))
  ipcMain.on('zoom:out',   () => mainWindow && zoomOut(mainWindow))
  ipcMain.on('zoom:reset', () => mainWindow && zoomReset(mainWindow))
  ipcMain.on('updater:install', () => {
    const { installUpdate } = require('./updater')
    installUpdate()
  })

  // ── Content Security Policy ──────────────────────────────────────────────────
  // Restrict what the renderer can load to prevent injection attacks.
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // React needs eval in dev
            "style-src 'self' 'unsafe-inline'",                 // Tailwind uses inline styles
            "img-src 'self' data: blob: https:",                // Allow images from HTTPS + data URIs
            "font-src 'self' data:",                            // Local fonts + data URIs
            "connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:* https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.github.com https://api.telegram.org",
            "object-src 'none'",                                // No plugins/embeds
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; ')
        ],
      },
    })
  })

  // NOTE: session.webRequest.onBeforeSendHeaders does NOT intercept WebSocket
  // upgrade requests in Electron 29. Origin rewriting for WS is handled by
  // the local WsProxy (wsproxy.ts) started above instead.

  // Initialize persistent memory database
  memoryManager.init()

  // ── Phase 1.1: Initialize Provider Abstraction Layer ──────────────────────
  // Register direct API providers (bypasses wsproxy for direct LLM calls)
  try {
    const openaiKey = loadApiKey('openai')
    if (openaiKey) {
      const openai = new OpenAIProvider({ apiKey: openaiKey })
      await openai.initialize()
      providerRegistry.register(openai)
      console.log('[Main] OpenAI provider registered (direct API)')
    }

    const anthropicKey = loadApiKey('anthropic')
    if (anthropicKey) {
      const anthropic = new AnthropicProvider({ apiKey: anthropicKey })
      await anthropic.initialize()
      providerRegistry.register(anthropic)
      console.log('[Main] Anthropic provider registered (direct API)')
    }

    // Ollama is always registered (local, no API key needed)
    const ollama = new OllamaProvider({})
    await ollama.initialize()
    providerRegistry.register(ollama)
    console.log('[Main] Ollama provider registered (local)')

    // Start health monitoring (check every 60s)
    providerRegistry.startHealthMonitor(60_000)
    console.log('[Main] Provider registry initialized with', providerRegistry.getAll().length, 'providers')
  } catch (err) {
    console.warn('[Main] Provider registry init error (non-fatal, wsproxy fallback active):', err)
  }

  // ── Phase 1.3: Initialize Custom Agent Framework ──────────────────────────
  try {
    agentManager.initialize()
    console.log('[Main] Custom Agent Framework initialized')
  } catch (err) {
    console.warn('[Main] Agent manager init error (non-fatal):', err)
  }

  // ── Phase 2: Initialize Intelligence Modules ──────────────────────────────
  try {
    await memoryArchitect.init()
    registerSemanticTier()
    memoryArchitect.startCompaction()
    console.log('[Main] Phase 2 Memory Architecture initialized (5-tier + compaction)')

    // Initialize cross-session memory persistence
    await memoryLifecycle.init()
    const restored = await memoryLifecycle.restoreSnapshot()
    console.log(`[Main] Memory lifecycle ready — snapshot ${restored ? 'restored' : 'none found (fresh start)'}`)

    // Initialize Session 5 modules
    branchManager.init()
    agentAnalytics.init()
    notificationCenter.init()
    contextVisualizer.init()
    console.log('[Main] Session 5 modules initialized (branching, analytics, notifications, context-viz)')

    // Initialize Session 6 modules
    pluginStudio.init()
    promptLibraryStore.init()
    taskBoard.init()
    apiPlayground.init()
    performanceProfiler.init()
    console.log('[Main] Session 6 modules initialized (plugin-studio, prompt-lib, task-board, api-playground, perf-profiler)')

    voiceInterface.init()
    fileAttachment.init()
    diffViewer.init()
    abPromptTesting.init()
    themeEngine.init()
    console.log('[Main] Session 7 modules initialized (voice, file-attachment, diff-viewer, ab-testing, theme-engine)')

    // Initialize Session 8 modules
    globalSearch.init()
    activityFeed.init()
    console.log('[Main] Session 8 modules initialized (global-search, activity-feed)')

    // Initialize Session 9 modules
    workspaceExport.init()
    reportGenerator.init()
    webhookManager.init()
    backupManager.init()
    sessionSharing.init()
    console.log('[Main] Session 9 modules initialized (workspace-export, report-gen, webhooks, backup, session-sharing)')

    // Initialize Session 10 modules
    errorBoundaryManager.init()
    offlineManager.init()
    startupProfiler.init()
    accessibilityManager.init()
    buildValidator.init()
    console.log('[Main] Session 10 modules initialized (error-boundary, offline, startup-profiler, accessibility, build-validator)')
  } catch (err) {
    console.warn('[Main] Memory Architecture init error (non-fatal):', err)
  }

  // Sync stored API keys → OpenClaw auth-profiles before gateway starts
  syncProvidersToOpenClaw()
  // Also sync Ollama models (fire-and-forget, non-blocking)
  syncOllamaToOpenClaw().catch(err => {
    console.log('[Main] Ollama sync skipped (may not be running):', err?.message || err)
  })

  openClawManager.initialize().catch((err) => {
    console.error('[Main] OpenClaw init error:', err)
  })
})

app.on('second-instance', (_e, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show(); mainWindow.focus()
    const url = argv.find((a) => a.startsWith('nyra://'))
    if (url) handleDeepLink(url, mainWindow)
  }
})

app.on('open-url', (_e, url) => { if (mainWindow) handleDeepLink(url, mainWindow) })

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow()
    // IPC handlers already registered at startup — don't re-register
    // (ipcMain.handle throws on duplicate channel names)
  } else {
    mainWindow?.show()
  }
})

app.on('before-quit', async () => {
  ;(app as typeof app & { isQuitting: boolean }).isQuitting = true
  globalShortcut.unregisterAll()

  // Sync-back any OAuth tokens that OpenClaw may have refreshed during this session.
  // This ensures refreshed tokens survive app restarts (saved to encrypted keychain).
  try {
    syncBackRefreshedTokens((providerId, key) => saveApiKey(providerId, key))
  } catch (err) {
    console.warn('[Main] Token sync-back failed (non-fatal):', err)
  }

  ptyManager.killAll()
  offlineManager.destroy()
  await mcpRuntime.shutdownAll().catch(() => {})
  await codebaseIndexer.close().catch(() => {})

  // Persist working memory and end session before closing the database
  await memoryLifecycle.shutdown().catch((err) => {
    console.warn('[Main] Memory lifecycle shutdown error (non-fatal):', err)
  })

  memoryManager.close()
  openClawManager.shutdown()
  stopWsProxy()
  destroyTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
