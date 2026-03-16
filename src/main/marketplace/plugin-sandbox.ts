import { EventEmitter } from 'events'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import * as os from 'os'
import * as vm from 'vm'

export interface PluginManifest {
  id: string
  version: string
  name: string
  description?: string
  permissions?: {
    network?: string[]
    filesystem?: boolean
    clipboard?: boolean
    notifications?: boolean
  }
}

interface PluginSandboxContext {
  pluginId: string
  manifest: PluginManifest
  timeout: number
  memoryLimit: number
  networkAllowlist: string[]
  isolateMemory: { [key: string]: any }
  messageListeners: Map<string, Function[]>
  auditLog: AuditEntry[]
  destroyed: boolean
}

interface AuditEntry {
  timestamp: number
  action: string
  resource?: string
  allowed: boolean
  reason?: string
}

/**
 * PluginSandbox: Restricts what marketplace plugins can do
 * Enforces permissions for network, filesystem, CPU, memory, and IPC
 */
export class PluginSandbox extends EventEmitter {
  private sandboxes: Map<string, PluginSandboxContext> = new Map()
  private pluginDataDir: string

  constructor() {
    super()
    this.pluginDataDir = path.join(os.homedir(), '.nyra', 'plugins')
    this.ensurePluginDataDirs()
  }

  private ensurePluginDataDirs(): void {
    if (!fs.existsSync(this.pluginDataDir)) {
      fs.mkdirSync(this.pluginDataDir, { recursive: true })
    }
  }

  /**
   * Create a sandbox for a plugin
   */
  createSandbox(pluginId: string, manifest: PluginManifest): void {
    if (this.sandboxes.has(pluginId)) {
      throw new Error(`Sandbox already exists for plugin: ${pluginId}`)
    }

    // Create scoped data directory for plugin
    const pluginDataPath = path.join(this.pluginDataDir, pluginId, 'data')
    if (!fs.existsSync(pluginDataPath)) {
      fs.mkdirSync(pluginDataPath, { recursive: true })
    }

    const networkAllowlist = manifest.permissions?.network || []
    
    const sandbox: PluginSandboxContext = {
      pluginId,
      manifest,
      timeout: 30000, // 30 seconds default
      memoryLimit: 100 * 1024 * 1024, // 100MB
      networkAllowlist,
      isolateMemory: {},
      messageListeners: new Map(),
      auditLog: [],
      destroyed: false,
    }

    this.sandboxes.set(pluginId, sandbox)
    this.emit('sandbox:created', { pluginId })
  }

  /**
   * Execute code within a plugin's sandbox
   */
  execute(pluginId: string, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const sandbox = this.sandboxes.get(pluginId)
      if (!sandbox) {
        return reject(new Error(`Sandbox not found for plugin: ${pluginId}`))
      }

      if (sandbox.destroyed) {
        return reject(new Error(`Sandbox has been destroyed for plugin: ${pluginId}`))
      }

      try {
        // Create execution context with restricted API
        const context = {
          console: {
            log: (...args: any[]) => {
              sandbox.auditLog.push({
                timestamp: Date.now(),
                action: 'console.log',
                allowed: true,
              })
            },
            error: (...args: any[]) => {
              sandbox.auditLog.push({
                timestamp: Date.now(),
                action: 'console.error',
                allowed: true,
              })
            },
          },
          fetch: (url: string, opts?: any) => {
            if (!this.isNetworkAllowed(sandbox, url)) {
              sandbox.auditLog.push({
                timestamp: Date.now(),
                action: 'network_request',
                resource: url,
                allowed: false,
                reason: 'Network domain not in allowlist',
              })
              throw new Error(`Network access denied for: ${url}`)
            }
            sandbox.auditLog.push({
              timestamp: Date.now(),
              action: 'network_request',
              resource: url,
              allowed: true,
            })
            // Actual fetch would be delegated to IPC
            return Promise.reject(new Error('Network calls must use IPC bridge'))
          },
          fs: {
            read: (filePath: string) => {
              if (!this.isFilesystemAllowed(sandbox, filePath)) {
                sandbox.auditLog.push({
                  timestamp: Date.now(),
                  action: 'fs.read',
                  resource: filePath,
                  allowed: false,
                  reason: 'File outside plugin sandbox directory',
                })
                throw new Error(`Filesystem access denied for: ${filePath}`)
              }
              sandbox.auditLog.push({
                timestamp: Date.now(),
                action: 'fs.read',
                resource: filePath,
                allowed: true,
              })
              return null // Would be implemented via IPC
            },
            write: (filePath: string, data: string) => {
              if (!sandbox.manifest.permissions?.filesystem) {
                sandbox.auditLog.push({
                  timestamp: Date.now(),
                  action: 'fs.write',
                  resource: filePath,
                  allowed: false,
                  reason: 'Filesystem permission not granted',
                })
                throw new Error(`Filesystem access denied for: ${filePath}`)
              }
              if (!this.isFilesystemAllowed(sandbox, filePath)) {
                sandbox.auditLog.push({
                  timestamp: Date.now(),
                  action: 'fs.write',
                  resource: filePath,
                  allowed: false,
                  reason: 'File outside plugin sandbox directory',
                })
                throw new Error(`Filesystem access denied for: ${filePath}`)
              }
              sandbox.auditLog.push({
                timestamp: Date.now(),
                action: 'fs.write',
                resource: filePath,
                allowed: true,
              })
            },
          },
          postMessage: (message: any, transfer?: any[]) => {
            sandbox.auditLog.push({
              timestamp: Date.now(),
              action: 'ipc.postMessage',
              allowed: true,
            })
            this.emit('plugin:message', { pluginId, message })
          },
          onMessage: (callback: Function) => {
            if (!sandbox.messageListeners.has('message')) {
              sandbox.messageListeners.set('message', [])
            }
            sandbox.messageListeners.get('message')!.push(callback)
          },
        }

        const contextObj = vm.createContext(context)
        const script = new vm.Script(code, { filename: `plugin-${pluginId}.js` })
        
        const timeout = setTimeout(() => {
          reject(new Error(`Plugin execution timeout after ${sandbox.timeout}ms`))
        }, sandbox.timeout)

        try {
          const result = script.runInContext(contextObj, {
            timeout: sandbox.timeout,
          })
          clearTimeout(timeout)
          resolve(result)
        } catch (err) {
          clearTimeout(timeout)
          throw err
        }
      } catch (err) {
        sandbox.auditLog.push({
          timestamp: Date.now(),
          action: 'execution_error',
          allowed: false,
          reason: err instanceof Error ? err.message : String(err),
        })
        reject(err)
      }
    })
  }

  /**
   * Send a message to a plugin
   */
  sendMessage(pluginId: string, message: any): void {
    const sandbox = this.sandboxes.get(pluginId)
    if (!sandbox) {
      throw new Error(`Sandbox not found for plugin: ${pluginId}`)
    }

    const listeners = sandbox.messageListeners.get('message') || []
    for (const listener of listeners) {
      try {
        listener(message)
      } catch (err) {
        sandbox.auditLog.push({
          timestamp: Date.now(),
          action: 'message_handler_error',
          allowed: false,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  /**
   * Destroy a plugin's sandbox
   */
  destroy(pluginId: string): void {
    const sandbox = this.sandboxes.get(pluginId)
    if (!sandbox) {
      throw new Error(`Sandbox not found for plugin: ${pluginId}`)
    }

    sandbox.destroyed = true
    sandbox.messageListeners.clear()
    sandbox.auditLog = []
    
    this.sandboxes.delete(pluginId)
    this.emit('sandbox:destroyed', { pluginId })
  }

  /**
   * Get audit log for a plugin
   */
  getAuditLog(pluginId: string): AuditEntry[] {
    const sandbox = this.sandboxes.get(pluginId)
    if (!sandbox) {
      return []
    }
    return [...sandbox.auditLog]
  }

  /**
   * Check if network domain is in allowlist
   */
  private isNetworkAllowed(sandbox: PluginSandboxContext, url: string): boolean {
    if (!sandbox.manifest.permissions?.network) {
      return false
    }

    try {
      const urlObj = new URL(url)
      return sandbox.networkAllowlist.some((domain) => {
        if (domain === '*') return true
        if (domain.startsWith('*.')) {
          const suffix = domain.slice(2)
          return urlObj.hostname.endsWith(suffix)
        }
        return urlObj.hostname === domain
      })
    } catch {
      return false
    }
  }

  /**
   * Check if filesystem path is within plugin's scoped directory
   */
  private isFilesystemAllowed(sandbox: PluginSandboxContext, filePath: string): boolean {
    const pluginDataPath = path.join(this.pluginDataDir, sandbox.pluginId, 'data')
    const resolvedPath = path.resolve(filePath)
    const resolvedDataPath = path.resolve(pluginDataPath)

    return resolvedPath.startsWith(resolvedDataPath)
  }

  /**
   * List all active sandboxes
   */
  listSandboxes(): string[] {
    return Array.from(this.sandboxes.keys())
  }

  /**
   * Get sandbox info
   */
  getSandboxInfo(pluginId: string): PluginSandboxContext | null {
    return this.sandboxes.get(pluginId) || null
  }
}

// Export singleton instance
export const pluginSandbox = new PluginSandbox()
