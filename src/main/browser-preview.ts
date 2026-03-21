/**
 * Browser Preview Panel — Phase 6B
 *
 * Features:
 *   - Embedded WebContentsView: Preview web apps being developed
 *   - URL navigation with back/forward/reload
 *   - Live reload on file save events
 *   - Viewport resize presets (desktop, tablet, mobile)
 *   - Page capture for agent visual feedback
 *   - Console log forwarding
 *   - DevTools toggle
 *
 * Architecture:
 *   BrowserPreviewManager → WebContentsView (attached to main BrowserWindow)
 *                         → EventBus (listens for file:modified to auto-reload)
 *                         → Screenshots for agent context
 */

import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import { eventBus } from './event-bus'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PreviewState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  viewport: ViewportPreset
  autoReload: boolean
  devToolsOpen: boolean
  attached: boolean
}

export type ViewportPreset = 'desktop' | 'tablet' | 'mobile' | 'custom'

interface ViewportSize {
  width: number
  height: number
  label: string
}

const VIEWPORT_SIZES: Record<ViewportPreset, ViewportSize> = {
  desktop: { width: 1280, height: 800, label: 'Desktop (1280×800)' },
  tablet:  { width: 768,  height: 1024, label: 'Tablet (768×1024)' },
  mobile:  { width: 375,  height: 812, label: 'Mobile (375×812)' },
  custom:  { width: 0,    height: 0,   label: 'Custom' },
}

// ── Browser Preview Manager ─────────────────────────────────────────────────

declare const WebContentsView: any

class BrowserPreviewManager extends EventEmitter {
  private view: any = null
  private mainWindow: BrowserWindow | null = null
  private currentUrl = ''
  private viewport: ViewportPreset = 'desktop'
  private autoReload = false
  private attached = false
  private consoleLogs: Array<{ level: string; message: string; timestamp: number }> = []
  private fileWatchUnsub: (() => void) | null = null

  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
    console.log('[BrowserPreview] Initialized')
  }

  // ── View Lifecycle ────────────────────────────────────────────────────────

  private ensureView() {
    if (this.view) return this.view

    // WebContentsView is available in Electron 28+
    // For now, use a simple web view approach
    const { WebContentsView } = require('electron')
    this.view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    // Forward console messages
    this.view.webContents.on('console-message', (_e, level, message) => {
      const levelMap = ['verbose', 'info', 'warning', 'error']
      const entry = {
        level: levelMap[level] || 'info',
        message,
        timestamp: Date.now(),
      }
      this.consoleLogs.push(entry)
      if (this.consoleLogs.length > 200) this.consoleLogs.splice(0, this.consoleLogs.length - 200)
      this.emit('preview:console', entry)
    })

    // Navigation events
    this.view.webContents.on('did-start-loading', () => {
      this.emit('preview:loading', true)
    })

    this.view.webContents.on('did-stop-loading', () => {
      this.emit('preview:loading', false)
    })

    this.view.webContents.on('did-navigate', (_e, url) => {
      this.currentUrl = url
      this.emitState()
    })

    this.view.webContents.on('did-navigate-in-page', (_e, url) => {
      this.currentUrl = url
      this.emitState()
    })

    this.view.webContents.on('page-title-updated', () => {
      this.emitState()
    })

    return this.view
  }

  attach(): void {
    if (this.attached || !this.mainWindow) return

    const view = this.ensureView()
    const contentView = (this.mainWindow as any).contentView
    if (contentView) {
      contentView.addChildView(view)
    }
    this.attached = true

    // Position view (right panel, adjustable later)
    this.updateViewBounds()

    // Listen for window resize
    this.mainWindow.on('resize', () => this.updateViewBounds())

    this.emitState()
  }

  detach(): void {
    if (!this.attached || !this.mainWindow || !this.view) return

    const contentView = (this.mainWindow as any).contentView
    if (contentView) {
      contentView.removeChildView(this.view)
    }
    this.attached = false
    this.stopAutoReload()
    this.emitState()
  }

  destroy(): void {
    this.detach()
    if (this.view) {
      this.view.webContents.close()
      this.view = null
    }
  }

  private updateViewBounds(): void {
    if (!this.mainWindow || !this.view || !this.attached) return

    const [winWidth, winHeight] = this.mainWindow.getContentSize()
    const size = VIEWPORT_SIZES[this.viewport]

    // Use viewport preset size or fill available space
    const previewWidth = this.viewport === 'custom' ? Math.floor(winWidth * 0.4) : Math.min(size.width, Math.floor(winWidth * 0.4))
    const previewHeight = this.viewport === 'custom' ? winHeight : Math.min(size.height, winHeight)

    // Position on right side
    this.view.setBounds({
      x: winWidth - previewWidth,
      y: 0,
      width: previewWidth,
      height: previewHeight,
    })
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  async navigate(url: string): Promise<void> {
    const view = this.ensureView()

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
      url = `http://${url}`
    }

    this.currentUrl = url
    await view.webContents.loadURL(url)
    this.emitState()
  }

  goBack(): void {
    if (this.view?.webContents.canGoBack()) {
      this.view.webContents.goBack()
    }
  }

  goForward(): void {
    if (this.view?.webContents.canGoForward()) {
      this.view.webContents.goForward()
    }
  }

  reload(): void {
    this.view?.webContents.reload()
  }

  // ── Viewport ──────────────────────────────────────────────────────────────

  setViewport(preset: ViewportPreset): void {
    this.viewport = preset
    this.updateViewBounds()
    this.emitState()
  }

  getViewportPresets(): Record<ViewportPreset, ViewportSize> {
    return { ...VIEWPORT_SIZES }
  }

  // ── Auto Reload ───────────────────────────────────────────────────────────

  startAutoReload(): void {
    if (this.autoReload) return
    this.autoReload = true

    // Subscribe to file change events via EventBus
    const handler = () => {
      if (this.autoReload && this.view && this.currentUrl) {
        // Debounce: wait 300ms after last change
        setTimeout(() => this.view?.webContents.reload(), 300)
      }
    }

    eventBus.on('file:modified', handler)
    this.fileWatchUnsub = () => eventBus.off('file:modified', handler)

    this.emitState()
  }

  stopAutoReload(): void {
    if (!this.autoReload) return
    this.autoReload = false
    if (this.fileWatchUnsub) {
      this.fileWatchUnsub()
      this.fileWatchUnsub = null
    }
    this.emitState()
  }

  // ── DevTools ──────────────────────────────────────────────────────────────

  toggleDevTools(): void {
    if (!this.view) return
    if (this.view.webContents.isDevToolsOpened()) {
      this.view.webContents.closeDevTools()
    } else {
      this.view.webContents.openDevTools({ mode: 'detach' })
    }
    this.emitState()
  }

  // ── Screenshots for Agent ─────────────────────────────────────────────────

  async capturePreview(): Promise<string | null> {
    if (!this.view) return null

    try {
      const image = await this.view.webContents.capturePage()
      return image.toDataURL()
    } catch {
      return null
    }
  }

  // ── Console Logs ──────────────────────────────────────────────────────────

  getConsoleLogs(limit = 50): Array<{ level: string; message: string; timestamp: number }> {
    return this.consoleLogs.slice(-limit)
  }

  clearConsoleLogs(): void {
    this.consoleLogs = []
  }

  // ── State ─────────────────────────────────────────────────────────────────

  getState(): PreviewState {
    return {
      url: this.currentUrl,
      title: this.view?.webContents.getTitle() || '',
      loading: this.view?.webContents.isLoading() || false,
      canGoBack: this.view?.webContents.canGoBack() || false,
      canGoForward: this.view?.webContents.canGoForward() || false,
      viewport: this.viewport,
      autoReload: this.autoReload,
      devToolsOpen: this.view?.webContents.isDevToolsOpened() || false,
      attached: this.attached,
    }
  }

  private emitState(): void {
    this.emit('preview:state-changed', this.getState())
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────

export const browserPreview = new BrowserPreviewManager()
