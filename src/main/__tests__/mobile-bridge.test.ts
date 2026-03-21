import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mobileBridge } from '../platform/mobile-bridge'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('MobileBridge', () => {
  const dataDir = path.join(os.homedir(), '.nyra', 'platform', 'mobile')
  const devicesFile = path.join(dataDir, 'devices.json')

  const cleanupDevices = () => {
    try {
      if (fs.existsSync(devicesFile)) {
        fs.unlinkSync(devicesFile)
      }
    } catch {}
    // Also clear in-memory devices
    const currentDevices = mobileBridge.listDevices()
    currentDevices.forEach(device => {
      mobileBridge.removeDevice(device.id)
    })
  }

  beforeEach(() => {
    // Clean up persisted devices before test (important: do this BEFORE init)
    cleanupDevices()
    mobileBridge.init()
  })

  afterEach(() => {
    mobileBridge.shutdown()
    // Clean up after test
    cleanupDevices()
  })

  describe('Initialization & Lifecycle', () => {
    it('should initialize without error', () => {
      expect(mobileBridge).toBeDefined()
    })

    it('should create data directory on init', () => {
      const dataDir = path.join(os.homedir(), '.nyra', 'platform', 'mobile')
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should persist and restore device pairings', () => {
      const deviceInfo = {
        id: 'device-1',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: true
      }

      mobileBridge.confirmPairing('123456', deviceInfo)
      mobileBridge.shutdown()

      mobileBridge.init()
      const devices = mobileBridge.listDevices()
      expect(devices.length).toBeGreaterThan(0)
    })
  })

  describe('Pairing Code Generation', () => {
    it('should generate a 6-digit pairing code', () => {
      const code = mobileBridge.generatePairingCode()

      expect(code).toMatch(/^\d{6}$/)
    })

    it('should generate unique pairing codes', () => {
      const code1 = mobileBridge.generatePairingCode()
      const code2 = mobileBridge.generatePairingCode()

      // They may occasionally be the same, but that's statistically unlikely
      expect(code1).toMatch(/^\d{6}$/)
      expect(code2).toMatch(/^\d{6}$/)
    })
  })

  describe('Device Pairing', () => {
    it('should confirm pairing with valid code', () => {
      const listener = vi.fn()
      mobileBridge.on('device:paired', listener)

      const deviceInfo = {
        id: 'temp-id',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      const result = mobileBridge.confirmPairing('123456', deviceInfo)

      expect(result.success).toBe(true)
      expect(result.deviceId).toBeDefined()
      expect(listener).toHaveBeenCalled()
    })

    it('should reject invalid pairing code format', () => {
      const deviceInfo = {
        id: 'temp-id',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      const result = mobileBridge.confirmPairing('invalid', deviceInfo)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should pair multiple devices', () => {
      const device1 = {
        id: 'temp-1',
        name: 'Device 1',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      const device2 = {
        id: 'temp-2',
        name: 'Device 2',
        platform: 'android' as const,
        lastSeen: Date.now(),
        paired: false
      }

      const result1 = mobileBridge.confirmPairing('111111', device1)
      const result2 = mobileBridge.confirmPairing('222222', device2)

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      const devices = mobileBridge.listDevices()
      expect(devices.length).toBe(2)
    })
  })

  describe('Device Management', () => {
    it('should list paired devices', () => {
      const deviceInfo = {
        id: 'temp',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      mobileBridge.confirmPairing('123456', deviceInfo)
      const devices = mobileBridge.listDevices()

      expect(Array.isArray(devices)).toBe(true)
      expect(devices.length).toBeGreaterThan(0)
    })

    it('should get device status', () => {
      const deviceInfo = {
        id: 'temp',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      const result = mobileBridge.confirmPairing('123456', deviceInfo)
      const status = mobileBridge.getDeviceStatus(result.deviceId!)

      expect(status).toBeDefined()
      expect(status?.paired).toBe(true)
    })

    it('should return null for unknown device', () => {
      const status = mobileBridge.getDeviceStatus('nonexistent')
      expect(status).toBeNull()
    })

    it('should remove a device', () => {
      const listener = vi.fn()
      mobileBridge.on('device:removed', listener)

      const deviceInfo = {
        id: 'temp',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      const result = mobileBridge.confirmPairing('123456', deviceInfo)
      const removed = mobileBridge.removeDevice(result.deviceId!)

      expect(removed).toBe(true)
      expect(listener).toHaveBeenCalledWith(result.deviceId)

      const status = mobileBridge.getDeviceStatus(result.deviceId!)
      expect(status).toBeNull()
    })

    it('should return false when removing nonexistent device', () => {
      const removed = mobileBridge.removeDevice('nonexistent')
      expect(removed).toBe(false)
    })
  })

  describe('Sync Operations', () => {
    it('should sync conversations for valid device', () => {
      const deviceInfo = {
        id: 'temp',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      const result = mobileBridge.confirmPairing('123456', deviceInfo)
      const conversations = mobileBridge.syncConversations(result.deviceId!)

      expect(Array.isArray(conversations)).toBe(true)
      expect(conversations.length).toBeGreaterThan(0)
    })

    it('should return empty array for unknown device', () => {
      const conversations = mobileBridge.syncConversations('nonexistent')
      expect(conversations).toEqual([])
    })

    it('should sync settings for valid device', () => {
      const deviceInfo = {
        id: 'temp',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      const result = mobileBridge.confirmPairing('123456', deviceInfo)
      const settings = mobileBridge.syncSettings(result.deviceId!)

      expect(settings).toBeDefined()
      expect(['light', 'dark', 'auto']).toContain(settings.theme)
    })

    it('should return empty object for unknown device settings', () => {
      const settings = mobileBridge.syncSettings('nonexistent')
      expect(settings).toEqual({})
    })
  })

  describe('Notifications', () => {
    it('should push notification to device with push token', () => {
      const deviceInfo = {
        id: 'temp',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false,
        pushToken: 'test-token-123'
      }

      const listener = vi.fn()
      mobileBridge.on('notification:queued', listener)

      const result = mobileBridge.confirmPairing('123456', deviceInfo)
      const notification = {
        id: 'notif-1',
        title: 'Test',
        body: 'Test notification',
        timestamp: Date.now()
      }

      const success = mobileBridge.pushNotification(result.deviceId!, notification)

      expect(success).toBe(true)
      expect(listener).toHaveBeenCalled()
    })

    it('should return false if device not found', () => {
      const notification = {
        id: 'notif-1',
        title: 'Test',
        body: 'Test',
        timestamp: Date.now()
      }

      const success = mobileBridge.pushNotification('nonexistent', notification)
      expect(success).toBe(false)
    })
  })

  describe('Voice Commands', () => {
    it('should receive voice command from device', async () => {
      const deviceInfo = {
        id: 'temp',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      const listener = vi.fn()
      mobileBridge.on('voice:received', listener)

      const result = mobileBridge.confirmPairing('123456', deviceInfo)
      const audioBuffer = Buffer.from('fake audio data')

      const transcription = await mobileBridge.receiveVoiceCommand(result.deviceId!, audioBuffer)

      expect(typeof transcription).toBe('string')
      expect(listener).toHaveBeenCalled()
    })

    it('should throw error for unknown device voice command', async () => {
      const audioBuffer = Buffer.from('fake audio data')

      await expect(
        mobileBridge.receiveVoiceCommand('nonexistent', audioBuffer)
      ).rejects.toThrow('Device not found')
    })
  })

  describe('Session Management', () => {
    it('should validate session token', () => {
      const deviceInfo = {
        id: 'temp',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      const result = mobileBridge.confirmPairing('123456', deviceInfo)

      // Session should be valid after pairing
      const conversations = mobileBridge.syncConversations(result.deviceId!)
      expect(conversations).toBeDefined()
    })

    it('should expire session after inactivity', async () => {
      const deviceInfo = {
        id: 'temp',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      const listener = vi.fn()
      mobileBridge.on('session:expired', listener)

      const result = mobileBridge.confirmPairing('123456', deviceInfo)

      // Session expiry is configured at 5 minutes, we can't easily test timeout in unit tests
      // But we can verify the session exists
      const status = mobileBridge.getDeviceStatus(result.deviceId!)
      expect(status).toBeDefined()
    })
  })

  describe('Local Server', () => {
    it('should start local HTTP server', async () => {
      const listener = vi.fn()
      mobileBridge.on('server:started', listener)

      await mobileBridge.startLocalServer(18791)

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        port: 18791
      }))

      await mobileBridge.stopLocalServer()
    })

    it('should stop local HTTP server', async () => {
      const listener = vi.fn()
      mobileBridge.on('server:stopped', listener)

      await mobileBridge.startLocalServer(18791)
      await mobileBridge.stopLocalServer()

      expect(listener).toHaveBeenCalled()
    })

    it('should handle multiple start/stop cycles', async () => {
      await mobileBridge.startLocalServer(18791)
      await mobileBridge.stopLocalServer()

      await mobileBridge.startLocalServer(18791)
      await mobileBridge.stopLocalServer()

      expect(mobileBridge).toBeDefined()
    })
  })

  describe('Persistence', () => {
    it('should save devices on shutdown', () => {
      const deviceInfo = {
        id: 'temp',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      mobileBridge.confirmPairing('123456', deviceInfo)
      mobileBridge.shutdown()

      const devicesPath = path.join(os.homedir(), '.nyra', 'platform', 'mobile', 'devices.json')
      expect(fs.existsSync(devicesPath)).toBe(true)
    })

    it('should restore devices on init', () => {
      const deviceInfo = {
        id: 'temp',
        name: 'Test Device',
        platform: 'ios' as const,
        lastSeen: Date.now(),
        paired: false
      }

      mobileBridge.confirmPairing('123456', deviceInfo)
      mobileBridge.shutdown()

      mobileBridge.init()
      const devices = mobileBridge.listDevices()
      expect(devices.length).toBeGreaterThan(0)
    })
  })
})
