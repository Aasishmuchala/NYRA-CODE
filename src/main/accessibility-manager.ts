/**
 * Accessibility Manager — High contrast, screen reader hints, reduced motion, font scaling
 */
import { memoryManager } from './memory'

interface AccessibilitySettings {
  highContrast: boolean
  reducedMotion: boolean
  fontScale: number         // 1.0 = default, 1.5 = 150%
  screenReaderMode: boolean
  focusIndicators: boolean
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia'
  largeClickTargets: boolean
  keyboardNavigation: boolean
  announceNotifications: boolean
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  highContrast: false,
  reducedMotion: false,
  fontScale: 1.0,
  screenReaderMode: false,
  focusIndicators: true,
  colorBlindMode: 'none',
  largeClickTargets: false,
  keyboardNavigation: true,
  announceNotifications: true,
}

export class AccessibilityManager {
  private db: any = null
  private settings: AccessibilitySettings = { ...DEFAULT_SETTINGS }

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS accessibility_settings (
          key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
        this.loadSettings()
        console.log('[AccessibilityManager] Initialized')
      }
    } catch (error) {
      console.warn('[AccessibilityManager] Init error (non-fatal):', error)
    }
  }

  getSettings(): AccessibilitySettings { return { ...this.settings } }

  updateSettings(updates: Partial<AccessibilitySettings>): AccessibilitySettings {
    this.settings = { ...this.settings, ...updates }
    this.persistSettings()
    return { ...this.settings }
  }

  resetSettings(): AccessibilitySettings {
    this.settings = { ...DEFAULT_SETTINGS }
    this.persistSettings()
    return { ...this.settings }
  }

  generateCSS(): string {
    const s = this.settings
    let css = ':root {\n'

    // Font scale
    css += `  --nyra-a11y-font-scale: ${s.fontScale};\n`

    // High contrast overrides
    if (s.highContrast) {
      css += `  --nyra-a11y-text: rgba(255,255,255,0.98);\n`
      css += `  --nyra-a11y-border: rgba(255,255,255,0.25);\n`
      css += `  --nyra-a11y-surface: #000000;\n`
    }

    // Reduced motion
    if (s.reducedMotion) {
      css += `  --nyra-a11y-transition-speed: 0s;\n`
    }

    // Large click targets
    if (s.largeClickTargets) {
      css += `  --nyra-a11y-min-target: 44px;\n`
    } else {
      css += `  --nyra-a11y-min-target: 24px;\n`
    }

    // Focus indicators
    if (s.focusIndicators) {
      css += `  --nyra-a11y-focus-ring: 2px solid #60A5FA;\n`
      css += `  --nyra-a11y-focus-offset: 2px;\n`
    }

    css += '}\n\n'

    // Reduced motion media override
    if (s.reducedMotion) {
      css += `*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }\n`
    }

    // Color blind filters
    if (s.colorBlindMode !== 'none') {
      const filters: Record<string, string> = {
        protanopia: 'url(#protanopia)',
        deuteranopia: 'url(#deuteranopia)',
        tritanopia: 'url(#tritanopia)',
      }
      css += `html { filter: ${filters[s.colorBlindMode] || 'none'}; }\n`
    }

    return css
  }

  getAriaHints(): Record<string, string> {
    return {
      sidebar: 'Navigation sidebar',
      chatInput: 'Message input field',
      messageList: 'Chat messages',
      panelOverlay: 'Panel overlay, press Escape to close',
      settingsButton: 'Open settings',
      newChatButton: 'Start new conversation',
      sendButton: 'Send message',
    }
  }

  private loadSettings(): void {
    if (!this.db) return
    try {
      const rows = this.db.prepare(`SELECT key, value FROM accessibility_settings`).all() as any[]
      for (const row of rows) {
        try {
          const val = JSON.parse(row.value)
          if (row.key in this.settings) {
            (this.settings as any)[row.key] = val
          }
        } catch {}
      }
    } catch {}
  }

  private persistSettings(): void {
    if (!this.db) return
    for (const [key, value] of Object.entries(this.settings)) {
      try {
        this.db.prepare(`INSERT OR REPLACE INTO accessibility_settings (key, value) VALUES (?, ?)`).run(key, JSON.stringify(value))
      } catch {}
    }
  }
}

export const accessibilityManager = new AccessibilityManager()
