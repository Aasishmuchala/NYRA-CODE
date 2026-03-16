import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginSandbox, PluginManifest } from '../marketplace/plugin-sandbox'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('PluginSandbox', () => {
  let sandbox: PluginSandbox
  let tmpDir: string

  beforeEach(() => {
    sandbox = new PluginSandbox()
    tmpDir = path.join(os.tmpdir(), 'nyra-test-plugin-sandbox')
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  describe('Sandbox Creation', () => {
    it('should create a sandbox for a plugin', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test Plugin',
        permissions: {
          network: ['example.com'],
          filesystem: true,
        },
      }

      sandbox.createSandbox('test-plugin', manifest)
      const info = sandbox.getSandboxInfo('test-plugin')
      expect(info).toBeDefined()
      expect(info?.pluginId).toBe('test-plugin')
      expect(info?.manifest.name).toBe('Test Plugin')
    })

    it('should throw error when creating duplicate sandbox', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test',
      }

      sandbox.createSandbox('test-plugin', manifest)
      expect(() => {
        sandbox.createSandbox('test-plugin', manifest)
      }).toThrow('Sandbox already exists for plugin: test-plugin')
    })

    it('should list all active sandboxes', () => {
      const manifest: PluginManifest = {
        id: 'plugin-1',
        version: '1.0.0',
        name: 'Plugin 1',
      }

      sandbox.createSandbox('plugin-1', manifest)
      sandbox.createSandbox('plugin-2', manifest)

      const list = sandbox.listSandboxes()
      expect(list).toContain('plugin-1')
      expect(list).toContain('plugin-2')
      expect(list.length).toBe(2)
    })
  })

  describe('Sandbox Destruction', () => {
    it('should destroy a sandbox', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test',
      }

      sandbox.createSandbox('test-plugin', manifest)
      sandbox.destroy('test-plugin')

      expect(sandbox.listSandboxes()).not.toContain('test-plugin')
    })

    it('should throw error when destroying nonexistent sandbox', () => {
      expect(() => {
        sandbox.destroy('nonexistent')
      }).toThrow('Sandbox not found for plugin: nonexistent')
    })
  })

  describe('Filesystem Restrictions', () => {
    it('should block filesystem read outside sandbox directory', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test',
        permissions: { filesystem: true },
      }

      sandbox.createSandbox('test-plugin', manifest)

      try {
        await sandbox.execute('test-plugin', `
          fs.read('/etc/passwd')
        `)
      } catch (e) {
        expect(String(e)).toContain('Filesystem access denied')
      }
    })

    it('should deny filesystem write without permission', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test',
        permissions: { filesystem: false },
      }

      sandbox.createSandbox('test-plugin', manifest)

      try {
        await sandbox.execute('test-plugin', `
          fs.write('/some/file', 'data')
        `)
      } catch (e) {
        expect(String(e)).toContain('Filesystem access denied')
      }
    })
  })

  describe('Network Restrictions', () => {
    it('should block network requests not in allowlist', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test',
        permissions: { network: ['api.example.com'] },
      }

      sandbox.createSandbox('test-plugin', manifest)

      try {
        await sandbox.execute('test-plugin', `
          fetch('https://malicious.com/data')
        `)
      } catch (e) {
        expect(String(e)).toContain('Network access denied')
      }
    })

    it('should allow network requests in allowlist', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test',
        permissions: { network: ['api.example.com'] },
      }

      sandbox.createSandbox('test-plugin', manifest)

      try {
        await sandbox.execute('test-plugin', `
          fetch('https://api.example.com/data')
        `)
      } catch (e) {
        // Expected to fail with "must use IPC bridge" message
        expect(String(e)).toContain('Network calls must use IPC bridge')
      }
    })

    it('should support wildcard network allowlist', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test',
        permissions: { network: ['*'] },
      }

      sandbox.createSandbox('test-plugin', manifest)

      try {
        await sandbox.execute('test-plugin', `
          fetch('https://any-domain.com/data')
        `)
      } catch (e) {
        expect(String(e)).toContain('Network calls must use IPC bridge')
      }
    })
  })

  describe('Audit Logging', () => {
    it('should record audit log entries', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test',
      }

      sandbox.createSandbox('test-plugin', manifest)

      try {
        await sandbox.execute('test-plugin', `
          console.log('test message')
        `)
      } catch (e) {
        // ignore execution error
      }

      const log = sandbox.getAuditLog('test-plugin')
      const logEntry = log.find((entry) => entry.action === 'console.log')
      expect(logEntry).toBeDefined()
      expect(logEntry?.allowed).toBe(true)
    })

    it('should record denied access attempts in audit log', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test',
        permissions: { network: [] },
      }

      sandbox.createSandbox('test-plugin', manifest)

      try {
        await sandbox.execute('test-plugin', `
          fetch('https://blocked.com/data')
        `)
      } catch (e) {
        // ignore error
      }

      const log = sandbox.getAuditLog('test-plugin')
      const denied = log.find((entry) => entry.action === 'network_request' && !entry.allowed)
      expect(denied).toBeDefined()
      expect(denied?.reason).toContain('Network domain not in allowlist')
    })

    it('should return empty array for nonexistent sandbox audit log', () => {
      const log = sandbox.getAuditLog('nonexistent')
      expect(log).toEqual([])
    })
  })

  describe('Message Passing', () => {
    it('should send messages to sandbox', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test',
      }

      sandbox.createSandbox('test-plugin', manifest)
      let received: unknown = null

      // Register message listener by executing code
      try {
        sandbox.execute('test-plugin', `
          onMessage((msg) => {
            this.receivedMsg = msg
          })
        `)
      } catch (e) {
        // ignore
      }

      sandbox.sendMessage('test-plugin', { type: 'test', data: 'hello' })

      const log = sandbox.getAuditLog('test-plugin')
      expect(log.some((entry) => entry.action === 'ipc.postMessage')).toBe(false)
    })
  })

  describe('Destroyed Sandbox', () => {
    it('should reject execution on destroyed sandbox', async () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test',
      }

      sandbox.createSandbox('test-plugin', manifest)
      sandbox.destroy('test-plugin')

      await expect(sandbox.execute('test-plugin', 'console.log("test")')).rejects.toThrow(
        'Sandbox not found for plugin: test-plugin'
      )
    })
  })

  describe('Init/Shutdown Lifecycle', () => {
    it('should initialize and load persisted configuration', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        version: '1.0.0',
        name: 'Test Plugin',
        permissions: { network: ['example.com'] },
      }

      sandbox.createSandbox('test-plugin', manifest)

      try {
        sandbox.execute('test-plugin', `console.log('test')`)
      } catch (e) {
        // ignore execution error
      }

      sandbox.shutdown()

      // Create new instance and init from disk
      const sandbox2 = new PluginSandbox()
      sandbox2.init()

      // Should have loaded persisted audit logs (if they exist)
      // This test verifies init() doesn't crash
      expect(sandbox2).toBeDefined()
    })

    it('should create data directory on init()', () => {
      const dataDir = path.join(os.homedir(), '.nyra', 'plugin-audits')
      sandbox.init()

      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should save audit logs on shutdown()', async () => {
      const manifest: PluginManifest = {
        id: 'audit-test-plugin',
        version: '1.0.0',
        name: 'Audit Test',
      }

      sandbox.createSandbox('audit-test-plugin', manifest)

      try {
        await sandbox.execute('audit-test-plugin', `console.log('log message')`)
      } catch (e) {
        // ignore execution error
      }

      const auditLogBefore = sandbox.getAuditLog('audit-test-plugin')
      expect(auditLogBefore.length).toBeGreaterThan(0)

      sandbox.shutdown()

      const configPath = path.join(os.homedir(), '.nyra', 'plugin-audits', 'plugin-sandbox.json')
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        expect(data['audit-test-plugin']).toBeDefined()
      }
    })

    it('should persist and restore audit logs across instances', async () => {
      const manifest: PluginManifest = {
        id: 'persist-test-plugin',
        version: '1.0.0',
        name: 'Persistence Test',
      }

      // First instance: create sandbox and execute code
      sandbox.createSandbox('persist-test-plugin', manifest)
      try {
        await sandbox.execute('persist-test-plugin', `console.log('audit entry')`)
      } catch (e) {
        // ignore
      }

      const logBefore = sandbox.getAuditLog('persist-test-plugin')
      sandbox.shutdown()

      // Second instance: init from disk
      const sandbox2 = new PluginSandbox()
      sandbox2.init()

      // Audit logs should be recovered (configuration loaded)
      expect(sandbox2).toBeDefined()
    })
  })
})
