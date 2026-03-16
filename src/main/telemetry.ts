import { EventEmitter } from 'events'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

export interface TelemetryEvent {
  name: string
  properties: Record<string, any>
  timestamp: number
}

export interface CrashReport {
  id: string
  timestamp: number
  message: string
  stack: string
  appVersion: string
  osVersion: string
  osType: string
  context?: Record<string, any>
}

export interface SessionInfo {
  sessionId: string
  startTime: number
  endTime?: number
  duration?: number
  featureUsage: Record<string, number>
}

/**
 * TelemetryService: Crash reporting and opt-in telemetry
 * All data is anonymized, no PII is collected
 */
export class TelemetryService extends EventEmitter {
  private enabled: boolean = false
  private deviceId: string
  private eventQueue: TelemetryEvent[] = []
  private crashQueue: CrashReport[] = []
  private sessionInfo: SessionInfo | null = null
  private batchInterval: ReturnType<typeof setInterval> | null = null
  private batchIntervalMs: number = 60000 // 60 seconds
  private consentFile: string
  private appVersion: string = '1.0.0'

  constructor() {
    super()
    this.deviceId = this.generateDeviceId()
    this.consentFile = this.getConsentFilePath()
    this.loadConsentState()
    this.startBatchSender()
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Get current consent state
   */
  getConsent(): { enabled: boolean; timestamp: number } {
    if (fs.existsSync(this.consentFile)) {
      try {
        const content = fs.readFileSync(this.consentFile, 'utf-8')
        return JSON.parse(content)
      } catch {
        return { enabled: false, timestamp: Date.now() }
      }
    }
    return { enabled: false, timestamp: Date.now() }
  }

  /**
   * Set telemetry consent (opt-in only)
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    const consentData = {
      enabled,
      timestamp: Date.now(),
    }

    const dir = path.dirname(this.consentFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(this.consentFile, JSON.stringify(consentData, null, 2), 'utf-8')
    this.emit('consent:changed', { enabled })
  }

  /**
   * Track an event
   */
  trackEvent(name: string, properties?: Record<string, any>): void {
    if (!this.enabled) {
      return
    }

    const event: TelemetryEvent = {
      name,
      properties: this.anonymizeProperties(properties || {}),
      timestamp: Date.now(),
    }

    this.eventQueue.push(event)

    // Update session feature usage
    if (this.sessionInfo) {
      this.sessionInfo.featureUsage[name] = (this.sessionInfo.featureUsage[name] || 0) + 1
    }

    this.emit('event:tracked', event)
  }

  /**
   * Report a crash
   */
  reportCrash(error: Error, context?: Record<string, any>): void {
    if (!this.enabled) {
      return
    }

    const crashReport: CrashReport = {
      id: `crash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack || '',
      appVersion: this.appVersion,
      osVersion: this.getOsVersion(),
      osType: os.type(),
      context: context ? this.anonymizeProperties(context) : undefined,
    }

    this.crashQueue.push(crashReport)
    this.emit('crash:reported', crashReport)

    // Attempt immediate send for crashes
    this.flush()
  }

  /**
   * Start a new session
   */
  startSession(): string {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    this.sessionInfo = {
      sessionId,
      startTime: Date.now(),
      featureUsage: {},
    }

    this.emit('session:started', { sessionId })
    return sessionId
  }

  /**
   * End the current session
   */
  endSession(): SessionInfo | null {
    if (!this.sessionInfo) {
      return null
    }

    this.sessionInfo.endTime = Date.now()
    this.sessionInfo.duration = this.sessionInfo.endTime - this.sessionInfo.startTime

    if (this.enabled) {
      this.trackEvent('session:ended', {
        duration: this.sessionInfo.duration,
        featureCount: Object.keys(this.sessionInfo.featureUsage).length,
      })
    }

    const endedSession = this.sessionInfo
    this.sessionInfo = null
    this.emit('session:ended', endedSession)
    
    return endedSession
  }

  /**
   * Get current session info
   */
  getCurrentSession(): SessionInfo | null {
    return this.sessionInfo
  }

  /**
   * Get device ID (anonymous, generated once per install)
   */
  getDeviceId(): string {
    return this.deviceId
  }

  /**
   * Flush queued events immediately
   */
  flush(): void {
    this.sendBatch()
  }

  /**
   * Shutdown telemetry service
   */
  shutdown(): void {
    if (this.batchInterval) {
      clearInterval(this.batchInterval)
      this.batchInterval = null
    }
    this.flush()
  }

  /**
   * Start the batch sender interval
   */
  private startBatchSender(): void {
    this.batchInterval = setInterval(() => {
      this.sendBatch()
    }, this.batchIntervalMs)
  }

  /**
   * Send batched events
   */
  private sendBatch(): void {
    if (!this.enabled) {
      return
    }

    if (this.eventQueue.length === 0 && this.crashQueue.length === 0) {
      return
    }

    const batch = {
      deviceId: this.deviceId,
      timestamp: Date.now(),
      appVersion: this.appVersion,
      osType: os.type(),
      osVersion: this.getOsVersion(),
      events: this.eventQueue,
      crashes: this.crashQueue,
    }

    // In production, this would send to a telemetry endpoint
    // For now, just emit the batch and clear queues
    this.emit('batch:ready', batch)

    this.eventQueue = []
    this.crashQueue = []
  }

  /**
   * Generate a unique device ID
   */
  private generateDeviceId(): string {
    const deviceIdFile = this.getDeviceIdFilePath()
    
    if (fs.existsSync(deviceIdFile)) {
      try {
        const id = fs.readFileSync(deviceIdFile, 'utf-8').trim()
        if (id) {
          return id
        }
      } catch {
        // Fall through to generate new ID
      }
    }

    const newId = crypto.randomUUID()
    const dir = path.dirname(deviceIdFile)
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(deviceIdFile, newId, 'utf-8')
    return newId
  }

  /**
   * Load consent state from disk
   */
  private loadConsentState(): void {
    const consent = this.getConsent()
    this.enabled = consent.enabled
  }

  /**
   * Anonymize event properties (remove PII)
   */
  private anonymizeProperties(properties: Record<string, any>): Record<string, any> {
    const anonymized: Record<string, any> = {}

    for (const [key, value] of Object.entries(properties)) {
      // Skip known PII fields
      if (
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('key') ||
        key.toLowerCase().includes('email') ||
        key.toLowerCase().includes('phone') ||
        key.toLowerCase().includes('address') ||
        key.toLowerCase().includes('credit') ||
        key.toLowerCase().includes('api')
      ) {
        continue
      }

      // Keep non-string values as-is
      if (typeof value !== 'string') {
        anonymized[key] = value
        continue
      }

      // Hash string values that might contain PII
      if (value.length > 20 || value.includes('@') || value.includes('.')) {
        anonymized[key] = this.hashString(value)
      } else {
        anonymized[key] = value
      }
    }

    return anonymized
  }

  /**
   * Hash a string for anonymization
   */
  private hashString(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16)
  }

  /**
   * Get OS version string
   */
  private getOsVersion(): string {
    return os.release()
  }

  /**
   * Get consent file path
   */
  private getConsentFilePath(): string {
    const homeDir = os.homedir()
    return path.join(homeDir, '.nyra', 'telemetry-consent.json')
  }

  /**
   * Get device ID file path
   */
  private getDeviceIdFilePath(): string {
    const homeDir = os.homedir()
    return path.join(homeDir, '.nyra', 'device-id')
  }
}

// Export singleton instance
export const telemetryService = new TelemetryService()
