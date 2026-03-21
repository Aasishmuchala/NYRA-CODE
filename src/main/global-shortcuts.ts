/**
 * Global Shortcuts & Quick Actions — Phase 6A
 *
 * Features:
 *   - Configurable system-wide hotkeys stored in SQLite
 *   - Quick action panel: floating overlay for instant AI access
 *   - Clipboard context: auto-include clipboard in quick prompts
 *   - Screenshot + Ask: capture region and ask about it
 *   - User-customizable keybindings with conflict detection
 *
 * Architecture:
 *   GlobalShortcutsManager → Electron globalShortcut API
 *                          → BrowserWindow (sends IPC events)
 *                          → memoryManager (persists config)
 *                          → clipboard (native access)
 */

import { EventEmitter } from 'events'
import { globalShortcut, clipboard, BrowserWindow, screen } from 'electron'
import { memoryManager } from './memory'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ShortcutBinding {
  id: string
  action: string            // e.g. 'toggle-window', 'quick-ask', 'screenshot-ask', 'new-chat', 'command-palette'
  accelerator: string       // Electron accelerator string, e.g. 'CommandOrControl+Shift+Space'
  label: string
  description?: string
  enabled: boolean
  builtin: boolean          // true for system shortcuts, false for user-created
}

export interface QuickAskContext {
  text: string
  clipboardContent?: string
  screenshotBase64?: string
  source: 'quick-panel' | 'clipboard' | 'screenshot'
}

// ── Default Bindings ────────────────────────────────────────────────────────

const DEFAULT_BINDINGS: Omit<ShortcutBinding, 'id'>[] = [
  { action: 'toggle-window',    accelerator: 'CommandOrControl+Shift+Space', label: 'Toggle Nyra',       description: 'Show/hide the main window',    enabled: true, builtin: true },
  { action: 'quick-ask',        accelerator: 'CommandOrControl+Shift+A',     label: 'Quick Ask',          description: 'Open quick AI prompt overlay',  enabled: true, builtin: true },
  { action: 'clipboard-ask',    accelerator: 'CommandOrControl+Shift+V',     label: 'Ask About Clipboard', description: 'Ask AI about clipboard content', enabled: true, builtin: true },
  { action: 'screenshot-ask',   accelerator: 'CommandOrControl+Shift+S',     label: 'Screenshot + Ask',   description: 'Capture screen and ask about it', enabled: false, builtin: true },
  { action: 'new-chat',         accelerator: 'CommandOrControl+N',           label: 'New Chat',           description: 'Start a new conversation',      enabled: true, builtin: true },
  { action: 'command-palette',  accelerator: 'CommandOrControl+K',           label: 'Command Palette',    description: 'Open command palette',           enabled: true, builtin: true },
  { action: 'toggle-cowork',    accelerator: 'CommandOrControl+Shift+C',     label: 'Toggle Cowork',      description: 'Toggle cowork sidebar',          enabled: true, builtin: true },
]

// ── Global Shortcuts Manager ────────────────────────────────────────────────

class GlobalShortcutsManager extends EventEmitter {
  private bindings: Map<string, ShortcutBinding> = new Map()
  private mainWindow: BrowserWindow | null = null
  private initialized = false

  init(mainWindow: BrowserWindow): void {
    if (this.initialized) return

    this.mainWindow = mainWindow
    this.ensureTable()
    this.loadBindings()
    this.registerAll()
    this.initialized = true

    console.log(`[GlobalShortcuts] Initialized with ${this.bindings.size} binding(s)`)
  }

  private ensureTable(): void {
    memoryManager.run(`
      CREATE TABLE IF NOT EXISTS shortcut_bindings (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        accelerator TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        enabled INTEGER DEFAULT 1,
        builtin INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `)
    memoryManager.run(`CREATE INDEX IF NOT EXISTS idx_shortcuts_action ON shortcut_bindings(action)`)
  }

  private loadBindings(): void {
    const rows = memoryManager.queryAll(`SELECT * FROM shortcut_bindings`)

    if (rows.length === 0) {
      // Seed defaults
      for (const def of DEFAULT_BINDINGS) {
        const id = `sc-${def.action}`
        memoryManager.run(
          `INSERT INTO shortcut_bindings (id, action, accelerator, label, description, enabled, builtin)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, def.action, def.accelerator, def.label, def.description || null, def.enabled ? 1 : 0, def.builtin ? 1 : 0]
        )
        this.bindings.set(id, { id, ...def })
      }
    } else {
      for (const row of rows) {
        this.bindings.set(row.id, {
          id: row.id,
          action: row.action,
          accelerator: row.accelerator,
          label: row.label,
          description: row.description,
          enabled: !!row.enabled,
          builtin: !!row.builtin,
        })
      }
    }
  }

  // ── Registration ──────────────────────────────────────────────────────────

  private registerAll(): void {
    globalShortcut.unregisterAll()

    for (const [, binding] of this.bindings) {
      if (!binding.enabled) continue
      this.registerSingle(binding)
    }
  }

  private registerSingle(binding: ShortcutBinding): boolean {
    try {
      return globalShortcut.register(binding.accelerator, () => {
        this.handleAction(binding)
      })
    } catch (err) {
      console.warn(`[GlobalShortcuts] Failed to register ${binding.accelerator}:`, err)
      return false
    }
  }

  private handleAction(binding: ShortcutBinding): void {
    const win = this.mainWindow
    if (!win) return

    this.emit('shortcut:activated', { action: binding.action, accelerator: binding.accelerator })

    switch (binding.action) {
      case 'toggle-window':
        if (win.isVisible() && win.isFocused()) win.hide()
        else { win.show(); win.focus() }
        break

      case 'quick-ask':
        win.show(); win.focus()
        win.webContents.send('shortcut:quick-ask')
        break

      case 'clipboard-ask': {
        const text = clipboard.readText()
        if (text.trim()) {
          win.show(); win.focus()
          win.webContents.send('shortcut:clipboard-ask', { clipboardContent: text })
        }
        break
      }

      case 'screenshot-ask':
        this.captureScreenshot(win)
        break

      case 'new-chat':
        win.show(); win.focus()
        win.webContents.send('shortcut:new-chat')
        break

      case 'command-palette':
        win.show(); win.focus()
        win.webContents.send('shortcut:command-palette')
        break

      case 'toggle-cowork':
        win.show(); win.focus()
        win.webContents.send('shortcut:toggle-cowork')
        break

      default:
        // Custom user action — forward to renderer
        win.show(); win.focus()
        win.webContents.send('shortcut:custom', { action: binding.action })
        break
    }
  }

  private async captureScreenshot(win: BrowserWindow): Promise<void> {
    try {
      // Get the focused display
      const cursorPoint = screen.getCursorScreenPoint()
      const _dsp = screen.getDisplayNearestPoint(cursorPoint)

      // Use desktopCapturer via the main window
      const image = await win.webContents.capturePage()
      const base64 = image.toDataURL()

      win.show(); win.focus()
      win.webContents.send('shortcut:screenshot-ask', { screenshotBase64: base64 })
    } catch (err) {
      console.error('[GlobalShortcuts] Screenshot capture failed:', err)
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  listBindings(): ShortcutBinding[] {
    return Array.from(this.bindings.values()).sort((a, b) => a.label.localeCompare(b.label))
  }

  getBinding(id: string): ShortcutBinding | undefined {
    return this.bindings.get(id)
  }

  updateBinding(id: string, updates: Partial<Pick<ShortcutBinding, 'accelerator' | 'enabled' | 'label' | 'description'>>): ShortcutBinding | null {
    const binding = this.bindings.get(id)
    if (!binding) return null

    if (updates.accelerator !== undefined) binding.accelerator = updates.accelerator
    if (updates.enabled !== undefined) binding.enabled = updates.enabled
    if (updates.label !== undefined) binding.label = updates.label
    if (updates.description !== undefined) binding.description = updates.description

    memoryManager.run(
      `UPDATE shortcut_bindings SET accelerator=?, enabled=?, label=?, description=? WHERE id=?`,
      [binding.accelerator, binding.enabled ? 1 : 0, binding.label, binding.description || null, id]
    )

    // Re-register all shortcuts
    this.registerAll()

    this.emit('shortcut:updated', binding)
    return binding
  }

  addBinding(opts: { action: string; accelerator: string; label: string; description?: string }): ShortcutBinding | null {
    // Check for accelerator conflict
    if (this.hasConflict(opts.accelerator)) return null

    const id = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const binding: ShortcutBinding = {
      id,
      action: opts.action,
      accelerator: opts.accelerator,
      label: opts.label,
      description: opts.description,
      enabled: true,
      builtin: false,
    }

    memoryManager.run(
      `INSERT INTO shortcut_bindings (id, action, accelerator, label, description, enabled, builtin)
       VALUES (?, ?, ?, ?, ?, 1, 0)`,
      [id, binding.action, binding.accelerator, binding.label, binding.description || null]
    )

    this.bindings.set(id, binding)
    this.registerAll()

    this.emit('shortcut:added', binding)
    return binding
  }

  removeBinding(id: string): boolean {
    const binding = this.bindings.get(id)
    if (!binding || binding.builtin) return false

    this.bindings.delete(id)
    memoryManager.run(`DELETE FROM shortcut_bindings WHERE id = ?`, [id])
    this.registerAll()

    this.emit('shortcut:removed', { id })
    return true
  }

  hasConflict(accelerator: string, excludeId?: string): boolean {
    for (const [id, b] of this.bindings) {
      if (excludeId && id === excludeId) continue
      if (b.enabled && b.accelerator.toLowerCase() === accelerator.toLowerCase()) return true
    }
    return false
  }

  /**
   * Get current clipboard content for quick-ask context
   */
  getClipboard(): string {
    return clipboard.readText()
  }

  /**
   * Cleanup on app quit
   */
  destroy(): void {
    globalShortcut.unregisterAll()
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────

export const globalShortcutsManager = new GlobalShortcutsManager()
