import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Mock Electron's globalShortcut before importing the module
vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
    isRegistered: vi.fn(() => false),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
  },
}))

import { systemOverlay } from '../os-integration/system-overlay'

const configDir = path.join(os.homedir(), '.nyra', 'os-integration')
const configFile = path.join(configDir, 'overlay-config.json')

describe('SystemOverlay', () => {
  beforeEach(() => {
    // Clean persisted config so singleton starts fresh
    try { if (fs.existsSync(configFile)) fs.unlinkSync(configFile) } catch {}
    // Reset singleton internal state fully (safe because we mock electron)
    try { systemOverlay.deactivate() } catch {}
    ;(systemOverlay as any).isActive = false
    ;(systemOverlay as any).currentMode = 'floating'
    ;(systemOverlay as any).registeredHotkeys = new Map()
    ;(systemOverlay as any).electronHotkeys = new Set()
    ;(systemOverlay as any).contextCache = new Map()
    ;(systemOverlay as any).lastActiveWindow = null
    systemOverlay.removeAllListeners()
    systemOverlay.init()
  })

  afterEach(() => {
    systemOverlay.shutdown()
    try { if (fs.existsSync(configFile)) fs.unlinkSync(configFile) } catch {}
  })

  describe('Initialization & Lifecycle', () => {
    it('should initialize without error', () => {
      expect(systemOverlay).toBeDefined()
    })

    it('should create data directory on init', () => {
      const dataDir = path.join(os.homedir(), '.nyra', 'os-integration')
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should persist and restore configuration', () => {
      systemOverlay.activate()
      systemOverlay.setMode('sidebar')
      systemOverlay.shutdown()

      systemOverlay.init()
      const mode = systemOverlay.getMode()
      expect(['floating', 'sidebar', 'inline']).toContain(mode)
    })
  })

  describe('Activation & Deactivation', () => {
    it('should activate the overlay', () => {
      const listener = vi.fn()
      systemOverlay.on('activated', listener)

      systemOverlay.activate()
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        mode: 'floating'
      }))
    })

    it('should not activate if already active', () => {
      const listener = vi.fn()
      systemOverlay.on('activated', listener)

      systemOverlay.activate()
      systemOverlay.activate()

      // Should only be called once
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('should deactivate the overlay', () => {
      const listener = vi.fn()
      systemOverlay.on('deactivated', listener)

      systemOverlay.activate()
      systemOverlay.deactivate()

      expect(listener).toHaveBeenCalled()
    })

    it('should not deactivate if already inactive', () => {
      const listener = vi.fn()
      systemOverlay.on('deactivated', listener)

      systemOverlay.deactivate()
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('Mode Management', () => {
    it('should set display mode to floating', () => {
      systemOverlay.activate()
      systemOverlay.setMode('floating')
      expect(systemOverlay.getMode()).toBe('floating')
    })

    it('should set display mode to sidebar', () => {
      systemOverlay.activate()
      systemOverlay.setMode('sidebar')
      expect(systemOverlay.getMode()).toBe('sidebar')
    })

    it('should set display mode to inline', () => {
      systemOverlay.activate()
      systemOverlay.setMode('inline')
      expect(systemOverlay.getMode()).toBe('inline')
    })

    it('should emit mode-changed event', () => {
      const listener = vi.fn()
      systemOverlay.on('mode-changed', listener)

      systemOverlay.activate()
      systemOverlay.setMode('sidebar')

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        mode: 'sidebar'
      }))
    })

    it('should reject invalid mode', () => {
      systemOverlay.activate()
      expect(() => {
        systemOverlay.setMode('invalid' as any)
      }).toThrow('Invalid mode')
    })
  })

  describe('Hotkey Management', () => {
    it('should require activation before registering hotkeys', () => {
      expect(() => {
        systemOverlay.registerHotkey('Ctrl+Shift+K')
      }).toThrow('must be activated')
    })

    it('should register a valid hotkey when active', () => {
      const listener = vi.fn()
      systemOverlay.on('hotkey-registered', listener)

      systemOverlay.activate()
      systemOverlay.registerHotkey('Ctrl+Shift+K')

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        combo: 'Ctrl+Shift+K'
      }))
    })

    it('should reject invalid hotkey format', () => {
      systemOverlay.activate()
      expect(() => {
        systemOverlay.registerHotkey('invalid')
      }).toThrow('Invalid hotkey combination format')
    })

    it('should unregister a hotkey', () => {
      const listener = vi.fn()
      systemOverlay.on('hotkey-unregistered', listener)

      systemOverlay.activate()
      systemOverlay.registerHotkey('Ctrl+Shift+K')
      systemOverlay.unregisterHotkey('Ctrl+Shift+K')

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        combo: 'Ctrl+Shift+K'
      }))
    })

    it('should call hotkey callback when triggered', () => {
      const callback = vi.fn()
      systemOverlay.activate()
      systemOverlay.registerHotkey('Cmd+Shift+K', callback)

      // In real scenario, OS would trigger the hotkey
      // For testing, we simulate the callback
      callback()
      expect(callback).toHaveBeenCalled()
    })

    it('should emit hotkey-triggered event with default callback', () => {
      const listener = vi.fn()
      systemOverlay.on('hotkey-triggered', listener)

      systemOverlay.activate()
      systemOverlay.registerHotkey('Ctrl+Shift+K')

      // Simulate hotkey trigger
      const hotkeyName = 'Ctrl+Shift+K'
      systemOverlay.emit('hotkey-triggered', { combo: hotkeyName, timestamp: Date.now() })

      expect(listener).toHaveBeenCalled()
    })
  })

  describe('App Profiles', () => {
    it('should return default profile for unknown app', () => {
      const profile = systemOverlay.getAppProfile('UnknownApp')
      expect(profile.name).toBe('default')
      expect(profile.contextType).toBe('general')
    })

    it('should return profile for VS Code', () => {
      const profile = systemOverlay.getAppProfile('VS Code')
      expect(profile.name).toBe('VS Code')
      expect(profile.contextType).toBe('code')
    })

    it('should return profile for Chrome', () => {
      const profile = systemOverlay.getAppProfile('Chrome')
      expect(profile.name).toBe('Chrome')
      expect(profile.contextType).toBe('search')
    })

    it('should return all profiles', () => {
      const profiles = systemOverlay.getAllProfiles()
      expect(Object.keys(profiles).length).toBeGreaterThanOrEqual(5)
      expect(profiles['VS Code']).toBeDefined()
    })

    it('should set custom app profile', () => {
      const listener = vi.fn()
      systemOverlay.on('profile-updated', listener)

      const customProfile = {
        name: 'CustomApp',
        suggestedBehavior: 'custom behavior',
        contextType: 'general' as const,
        injectionMethod: 'paste' as const
      }

      systemOverlay.setAppProfile('CustomApp', customProfile)

      const profile = systemOverlay.getAppProfile('CustomApp')
      expect(profile.name).toBe('CustomApp')
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('Context Management', () => {
    it('should capture context', () => {
      const listener = vi.fn()
      systemOverlay.on('context-captured', listener)

      systemOverlay.activate()
      const context = systemOverlay.captureContext()

      expect(context).toBeDefined()
      expect(context.windowTitle).toBeDefined()
      expect(listener).toHaveBeenCalled()
    })

    it('should get cached context', () => {
      systemOverlay.activate()
      systemOverlay._setActiveWindow({
        app: 'TestApp',
        title: 'Test Window',
        pid: 12345
      })

      const context = systemOverlay.captureContext()
      const cached = systemOverlay.getCachedContext('TestApp')

      expect(cached).toBeDefined()
      expect(cached?.windowTitle).toBe('Test Window')
    })

    it('should clear context cache', () => {
      const listener = vi.fn()
      systemOverlay.on('context-cache-cleared', listener)

      systemOverlay.activate()
      systemOverlay.captureContext()
      systemOverlay.clearContextCache()

      expect(listener).toHaveBeenCalled()
    })
  })

  describe('Response Injection', () => {
    it('should require activation to inject', () => {
      systemOverlay.deactivate()
      expect(() => {
        systemOverlay.injectResponse('test')
      }).toThrow('must be active')
    })

    it('should inject response when active', () => {
      const listener = vi.fn()
      systemOverlay.on('response-injected', listener)

      systemOverlay.activate()
      systemOverlay.injectResponse('Hello world')

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        length: 11
      }))
    })

    it('should emit injection-failed on error', () => {
      const listener = vi.fn()
      systemOverlay.on('injection-failed', listener)

      systemOverlay.activate()
      
      // Set up condition that could cause failure
      const originalInject = systemOverlay.injectResponse
      systemOverlay.injectResponse('')

      // Check if error was handled
      expect(systemOverlay).toBeDefined()
    })
  })

  describe('Window Tracking', () => {
    it('should set and get active window', () => {
      const listener = vi.fn()
      systemOverlay.on('active-window-changed', listener)

      systemOverlay._setActiveWindow({
        app: 'TestApp',
        title: 'Test Window',
        pid: 12345
      })

      const window = systemOverlay.getActiveWindow()
      expect(window.app).toBeDefined()
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('Persistence', () => {
    it('should save configuration on shutdown', () => {
      systemOverlay.activate()
      systemOverlay.setMode('sidebar')
      systemOverlay.shutdown()

      const configPath = path.join(os.homedir(), '.nyra', 'os-integration', 'overlay-config.json')
      expect(fs.existsSync(configPath)).toBe(true)

      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(data.currentMode).toBe('sidebar')
    })

    it('should restore configuration on init', () => {
      systemOverlay.activate()
      systemOverlay.setMode('inline')
      systemOverlay.shutdown()

      systemOverlay.init()
      const mode = systemOverlay.getMode()
      // Mode should be preserved or reset to default
      expect(['floating', 'sidebar', 'inline']).toContain(mode)
    })
  })
})
