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
import { syncProvidersToOpenClaw } from './providers'

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
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
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
      sandbox: false,
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

  // NOTE: session.webRequest.onBeforeSendHeaders does NOT intercept WebSocket
  // upgrade requests in Electron 29. Origin rewriting for WS is handled by
  // the local WsProxy (wsproxy.ts) started above instead.

  // Sync stored API keys → OpenClaw auth-profiles before gateway starts
  syncProvidersToOpenClaw()

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

app.on('before-quit', () => {
  ;(app as typeof app & { isQuitting: boolean }).isQuitting = true
  globalShortcut.unregisterAll()
  openClawManager.shutdown()
  stopWsProxy()
  destroyTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
