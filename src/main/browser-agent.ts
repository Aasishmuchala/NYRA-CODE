/**
 * Browser Agent Bridge — OpenClaw Browser Tools Integration
 *
 * Provides agent-controlled browser automation via Playwright.
 * This is separate from BrowserPreviewManager (which is for dev preview).
 *
 * Features:
 *   - Navigate to URLs and capture page state
 *   - Click, fill, select elements by CSS/ARIA selector
 *   - Take screenshots (full page, element, ARIA snapshot)
 *   - Extract page text and structured data
 *   - Execute JavaScript in page context
 *   - Manage browser lifecycle (launch, close, persist)
 *
 * Architecture:
 *   BrowserAgentBridge → Playwright Browser (Chromium)
 *                       → Page pool (max 5 concurrent)
 *                       → Screenshot cache for agent context
 *                       → Action log for audit trail
 */

import { EventEmitter } from 'events'

// ── Types ──────────────────────────────────────────────────────────────────

export interface BrowserAgentState {
  enabled: boolean
  launched: boolean
  currentUrl: string
  currentTitle: string
  pageCount: number
  loading: boolean
  screenshotCount: number
  actionsPerformed: number
  lastError: string | null
}

export interface BrowserAction {
  id: number
  timestamp: number
  type: 'navigate' | 'click' | 'fill' | 'select' | 'screenshot' | 'evaluate' | 'snapshot' | 'scroll' | 'wait' | 'close'
  target?: string
  value?: string
  result: 'success' | 'error' | 'pending'
  error?: string
  durationMs?: number
  screenshotBase64?: string
}

export interface PageSnapshot {
  url: string
  title: string
  text: string
  ariaTree?: string
  screenshotBase64?: string
  timestamp: number
}

export interface NavigateOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
  timeout?: number
}

export interface ClickOptions {
  selector: string
  button?: 'left' | 'right' | 'middle'
  clickCount?: number
  timeout?: number
}

export interface FillOptions {
  selector: string
  value: string
  timeout?: number
}

export interface ScreenshotOptions {
  selector?: string
  fullPage?: boolean
  type?: 'png' | 'jpeg'
  quality?: number
}

export interface EvaluateOptions {
  expression: string
  timeout?: number
}

// ── Browser Agent Bridge ───────────────────────────────────────────────────

class BrowserAgentBridge extends EventEmitter {
  private browser: any = null
  private context: any = null
  private page: any = null
  private enabled = false
  private actions: BrowserAction[] = []
  private actionCounter = 0
  private screenshotCount = 0
  private playwrightModule: any = null

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async enable(): Promise<{ success: boolean; error?: string }> {
    if (this.enabled && this.browser) {
      return { success: true }
    }

    try {
      // Dynamically import playwright — it may not be installed
      this.playwrightModule = await this.loadPlaywright()
      if (!this.playwrightModule) {
        return {
          success: false,
          error: 'Playwright is not installed. Run: npm install playwright && npx playwright install chromium'
        }
      }

      const chromium = this.playwrightModule.chromium
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ]
      })

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'NyraDesktop/1.0 (BrowserAgent)',
      })

      this.page = await this.context.newPage()
      this.enabled = true

      this.emitState()
      console.log('[BrowserAgent] Enabled — Playwright Chromium launched')
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error launching browser'
      console.error('[BrowserAgent] Failed to enable:', message)
      return { success: false, error: message }
    }
  }

  async disable(): Promise<void> {
    try {
      if (this.page) { await this.page.close().catch(() => {}) }
      if (this.context) { await this.context.close().catch(() => {}) }
      if (this.browser) { await this.browser.close().catch(() => {}) }
    } catch {
      // Ignore cleanup errors
    } finally {
      this.page = null
      this.context = null
      this.browser = null
      this.enabled = false
      this.emitState()
      console.log('[BrowserAgent] Disabled — browser closed')
    }
  }

  private async loadPlaywright(): Promise<any> {
    try {
      // Try the full playwright package first
      return require('playwright')
    } catch {
      try {
        // Fallback to playwright-core
        return require('playwright-core')
      } catch {
        return null
      }
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────

  async navigate(url: string, options?: NavigateOptions): Promise<PageSnapshot> {
    this.ensureEnabled()

    // Normalize URL
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
      url = `https://${url}`
    }

    const action = this.startAction('navigate', url)
    try {
      await this.page!.goto(url, {
        waitUntil: options?.waitUntil || 'domcontentloaded',
        timeout: options?.timeout || 30000,
      })

      const snapshot = await this.captureSnapshot()
      this.completeAction(action)
      return snapshot
    } catch (err) {
      this.failAction(action, err)
      throw err
    }
  }

  // ── Interactions ───────────────────────────────────────────────────────

  async click(options: ClickOptions): Promise<void> {
    this.ensureEnabled()

    const action = this.startAction('click', options.selector)
    try {
      await this.page!.click(options.selector, {
        button: options.button || 'left',
        clickCount: options.clickCount || 1,
        timeout: options.timeout || 10000,
      })
      this.completeAction(action)
    } catch (err) {
      this.failAction(action, err)
      throw err
    }
  }

  async fill(options: FillOptions): Promise<void> {
    this.ensureEnabled()

    const action = this.startAction('fill', options.selector, options.value)
    try {
      await this.page!.fill(options.selector, options.value, {
        timeout: options.timeout || 10000,
      })
      this.completeAction(action)
    } catch (err) {
      this.failAction(action, err)
      throw err
    }
  }

  async select(selector: string, value: string): Promise<void> {
    this.ensureEnabled()

    const action = this.startAction('select', selector, value)
    try {
      await this.page!.selectOption(selector, value)
      this.completeAction(action)
    } catch (err) {
      this.failAction(action, err)
      throw err
    }
  }

  async scroll(direction: 'up' | 'down', amount: number = 300): Promise<void> {
    this.ensureEnabled()

    const action = this.startAction('scroll', direction)
    try {
      const deltaY = direction === 'down' ? amount : -amount
      await this.page!.mouse.wheel(0, deltaY)
      // Brief wait for scroll to complete
      await this.page!.waitForTimeout(300)
      this.completeAction(action)
    } catch (err) {
      this.failAction(action, err)
      throw err
    }
  }

  async waitForSelector(selector: string, timeout: number = 10000): Promise<void> {
    this.ensureEnabled()

    const action = this.startAction('wait', selector)
    try {
      await this.page!.waitForSelector(selector, { timeout })
      this.completeAction(action)
    } catch (err) {
      this.failAction(action, err)
      throw err
    }
  }

  // ── Screenshots & Snapshots ────────────────────────────────────────────

  async screenshot(options?: ScreenshotOptions): Promise<string> {
    this.ensureEnabled()

    const action = this.startAction('screenshot', options?.selector || 'full-page')
    try {
      let buffer: Buffer

      if (options?.selector) {
        const element = await this.page!.$(options.selector)
        if (!element) throw new Error(`Element not found: ${options.selector}`)
        buffer = await element.screenshot({
          type: options?.type || 'png',
          quality: options?.type === 'jpeg' ? (options?.quality || 80) : undefined,
        })
      } else {
        buffer = await this.page!.screenshot({
          fullPage: options?.fullPage ?? false,
          type: options?.type || 'png',
          quality: options?.type === 'jpeg' ? (options?.quality || 80) : undefined,
        })
      }

      const base64 = buffer.toString('base64')
      const dataUrl = `data:image/${options?.type || 'png'};base64,${base64}`
      this.screenshotCount++
      action.screenshotBase64 = dataUrl
      this.completeAction(action)
      return dataUrl
    } catch (err) {
      this.failAction(action, err)
      throw err
    }
  }

  async ariaSnapshot(): Promise<string> {
    this.ensureEnabled()

    const action = this.startAction('snapshot', 'aria')
    try {
      // Get the accessibility tree
      const snapshot = await this.page!.accessibility.snapshot()
      const serialized = JSON.stringify(snapshot, null, 2)
      this.completeAction(action)
      return serialized
    } catch (err) {
      this.failAction(action, err)
      throw err
    }
  }

  async captureSnapshot(): Promise<PageSnapshot> {
    this.ensureEnabled()

    const [text, screenshotBase64] = await Promise.all([
      this.page!.evaluate(() => document.body?.innerText || '').catch(() => ''),
      this.screenshot({ fullPage: false }).catch(() => null),
    ])

    let ariaTree: string | undefined
    try {
      ariaTree = await this.ariaSnapshot()
    } catch {
      // ARIA snapshot is optional
    }

    return {
      url: this.page!.url(),
      title: await this.page!.title(),
      text: text.slice(0, 10000), // Limit to 10K chars for token efficiency
      ariaTree,
      screenshotBase64: screenshotBase64 || undefined,
      timestamp: Date.now(),
    }
  }

  // ── JavaScript Evaluation ──────────────────────────────────────────────

  async evaluate(options: EvaluateOptions): Promise<any> {
    this.ensureEnabled()

    // Security: Block dangerous patterns in expressions
    const BLOCKED_PATTERNS = [
      /require\s*\(/i,
      /process\./i,
      /child_process/i,
      /\bexec\b\s*\(/i,
      /\bspawn\b\s*\(/i,
      /\beval\b\s*\(/i,
      /__dirname/i,
      /__filename/i,
      /import\s*\(/i,
      /globalThis\s*\.\s*(process|require)/i,
      /window\s*\.\s*(require|process)/i,
    ]
    
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(options.expression)) {
        console.warn(`[BrowserAgent] Blocked dangerous expression pattern: ${pattern}`)
        return { error: 'Expression contains blocked pattern for security reasons' }
      }
    }
    
    // Limit expression length to prevent DoS
    if (options.expression.length > 10_000) {
      return { error: 'Expression too long (max 10,000 characters)' }
    }

    const action = this.startAction('evaluate', options.expression.slice(0, 100))
    try {
      const result = await this.page!.evaluate(options.expression)
      this.completeAction(action)
      return result
    } catch (err) {
      this.failAction(action, err)
      throw err
    }
  }

  // ── Page Text Extraction ───────────────────────────────────────────────

  async getPageText(maxLength: number = 10000): Promise<string> {
    this.ensureEnabled()

    const text = await this.page!.evaluate(() => document.body?.innerText || '')
    return text.slice(0, maxLength)
  }

  async getPageHtml(selector?: string): Promise<string> {
    this.ensureEnabled()

    if (selector) {
      return await this.page!.evaluate(
        (sel: string) => document.querySelector(sel)?.outerHTML || '',
        selector
      )
    }
    return await this.page!.evaluate(() => document.documentElement.outerHTML)
  }

  // ── State & History ────────────────────────────────────────────────────

  getState(): BrowserAgentState {
    return {
      enabled: this.enabled,
      launched: this.browser !== null,
      currentUrl: this.page?.url?.() || '',
      currentTitle: '',
      pageCount: this.context?._pages?.length || (this.page ? 1 : 0),
      loading: false,
      screenshotCount: this.screenshotCount,
      actionsPerformed: this.actionCounter,
      lastError: this.actions.length > 0 ?
        (this.actions[this.actions.length - 1].error || null) : null,
    }
  }

  getActionHistory(limit: number = 50): BrowserAction[] {
    return this.actions.slice(-limit)
  }

  clearHistory(): void {
    this.actions = []
    this.actionCounter = 0
    this.screenshotCount = 0
  }

  isEnabled(): boolean {
    return this.enabled
  }

  // ── Internal Helpers ───────────────────────────────────────────────────

  private ensureEnabled(): void {
    if (!this.enabled || !this.page) {
      throw new Error('Browser agent is not enabled. Call enable() first.')
    }
  }

  private startAction(type: BrowserAction['type'], target?: string, value?: string): BrowserAction {
    const action: BrowserAction = {
      id: ++this.actionCounter,
      timestamp: Date.now(),
      type,
      target,
      value,
      result: 'pending',
    }
    this.actions.push(action)
    if (this.actions.length > 200) this.actions.splice(0, this.actions.length - 200)
    this.emit('agent:action', action)
    return action
  }

  private completeAction(action: BrowserAction): void {
    action.result = 'success'
    action.durationMs = Date.now() - action.timestamp
    this.emit('agent:action-complete', action)
    this.emitState()
  }

  private failAction(action: BrowserAction, err: unknown): void {
    action.result = 'error'
    action.error = err instanceof Error ? err.message : String(err)
    action.durationMs = Date.now() - action.timestamp
    this.emit('agent:action-error', action)
    this.emitState()
  }

  private emitState(): void {
    this.emit('agent:state-changed', this.getState())
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────

export const browserAgent = new BrowserAgentBridge()
