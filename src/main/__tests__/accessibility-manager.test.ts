/**
 * Unit tests for AccessibilityManager module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMockDb } from './helpers/mock-db'

let db: any

beforeEach(async () => {
  db = await createMockDb()
  ;(globalThis as any).__mockMemoryManager.db = db
})

afterEach(() => {
  ;(globalThis as any).__mockMemoryManager.db = null
  db.close()
  vi.clearAllMocks()
})

describe('AccessibilityManager', () => {
  it('should initialize and create table', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    manager.init()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('accessibility_settings')
  })

  it('should return default settings', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    manager.init()

    const settings = manager.getSettings()
    expect(settings.highContrast).toBe(false)
    expect(settings.reducedMotion).toBe(false)
    expect(settings.fontScale).toBe(1.0)
    expect(settings.screenReaderMode).toBe(false)
  })

  it('should update settings', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    manager.init()

    const updated = manager.updateSettings({
      highContrast: true,
      fontScale: 1.5
    })

    expect(updated.highContrast).toBe(true)
    expect(updated.fontScale).toBe(1.5)
  })

  it('should persist settings to database', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    manager.init()

    manager.updateSettings({
      screenReaderMode: true,
      colorBlindMode: 'protanopia'
    })

    const settings = manager.getSettings()
    expect(settings.screenReaderMode).toBe(true)
    expect(settings.colorBlindMode).toBe('protanopia')
  })

  it('should reset to default settings', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    manager.init()

    manager.updateSettings({
      highContrast: true,
      fontScale: 2.0
    })

    const reset = manager.resetSettings()
    expect(reset.highContrast).toBe(false)
    expect(reset.fontScale).toBe(1.0)
  })

  it('should generate CSS with default settings', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    ;(manager as any).db = db
    ;(manager as any).settings = {
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

    const css = manager.generateCSS()
    expect(css).toContain(':root')
    expect(css).toContain('--nyra-a11y-font-scale: 1')
  })

  it('should generate CSS with high contrast', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    ;(manager as any).db = db
    ;(manager as any).settings = {
      highContrast: true,
      reducedMotion: false,
      fontScale: 1.0,
      screenReaderMode: false,
      focusIndicators: true,
      colorBlindMode: 'none',
      largeClickTargets: false,
      keyboardNavigation: true,
      announceNotifications: true,
    }

    const css = manager.generateCSS()
    expect(css).toContain('--nyra-a11y-text')
    expect(css).toContain('--nyra-a11y-surface')
  })

  it('should generate CSS with reduced motion', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    ;(manager as any).db = db
    ;(manager as any).settings = {
      highContrast: false,
      reducedMotion: true,
      fontScale: 1.0,
      screenReaderMode: false,
      focusIndicators: true,
      colorBlindMode: 'none',
      largeClickTargets: false,
      keyboardNavigation: true,
      announceNotifications: true,
    }

    const css = manager.generateCSS()
    expect(css).toContain('--nyra-a11y-transition-speed')
  })

  it('should generate CSS with custom font scale', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    ;(manager as any).db = db
    ;(manager as any).settings = {
      highContrast: false,
      reducedMotion: false,
      fontScale: 1.5,
      screenReaderMode: false,
      focusIndicators: true,
      colorBlindMode: 'none',
      largeClickTargets: false,
      keyboardNavigation: true,
      announceNotifications: true,
    }

    const css = manager.generateCSS()
    expect(css).toContain('1.5')
  })

  it('should support all color blind modes', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    manager.init()

    const modes = ['none', 'protanopia', 'deuteranopia', 'tritanopia'] as const
    
    for (const mode of modes) {
      const updated = manager.updateSettings({ colorBlindMode: mode })
      expect(updated.colorBlindMode).toBe(mode)
    }
  })

  it('should update multiple settings at once', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    manager.init()

    const updated = manager.updateSettings({
      highContrast: true,
      reducedMotion: true,
      fontScale: 1.25,
      screenReaderMode: true,
      largeClickTargets: true,
    })

    expect(updated.highContrast).toBe(true)
    expect(updated.reducedMotion).toBe(true)
    expect(updated.fontScale).toBe(1.25)
    expect(updated.screenReaderMode).toBe(true)
    expect(updated.largeClickTargets).toBe(true)
  })

  it('should not modify original settings object when getting', async () => {
    const { AccessibilityManager } = await import('../accessibility-manager')
    const manager = new AccessibilityManager()
    manager.init()

    const settings1 = manager.getSettings()
    settings1.highContrast = true

    const settings2 = manager.getSettings()
    expect(settings2.highContrast).toBe(false)
  })
})
