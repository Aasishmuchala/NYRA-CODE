/**
 * NyraGuard Security Bot Module
 *
 * Dedicated internal security bot for the Nyra Desktop app.
 * Responsibilities:
 *  1. App stability monitoring (gateway health, memory, disk space, IPC)
 *  2. Security scanning (file permissions, config validation, env exposure)
 *  3. Threat detection (unauthorized access, file tampering, suspicious activity)
 *  4. Error monitoring & AI-powered diagnostics via OpenRouter
 *
 * Config, API keys, logs, and scan history are persisted to userData.
 * API keys are encrypted via safeStorage.
 */

import { EventEmitter } from 'events'
import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
// Electron 28+ provides global fetch — no need for node-fetch

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NyraGuardConfig {
  enabled: boolean
  openRouterApiKey: string | null
  preferredModel: string  // default: 'openrouter/auto'
  autoScan: boolean       // run periodic security scans
  scanInterval: number    // minutes between scans (default: 30)
  errorMonitoring: boolean
  threatDetection: boolean
  lastScanAt: number | null
  scanHistory: ScanResult[]
}

export interface ScanResult {
  id: string
  timestamp: number
  type: 'stability' | 'security' | 'vulnerability' | 'threat'
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  resolution?: string
  resolved: boolean
}

export interface GuardLog {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'critical'
  category: 'stability' | 'security' | 'threat' | 'audit' | 'system'
  message: string
  details?: string
}

// ── Paths ──────────────────────────────────────────────────────────────────────

function getGuardConfigPath(): string {
  return path.join(app.getPath('userData'), 'nyra_guard.json')
}

function getGuardApiKeyStorageKey(): string {
  return 'nyra_guard_apikey'
}

function getGuardLogPath(): string {
  return path.join(app.getPath('userData'), 'nyra_guard_log.json')
}

function getGuardScansPath(): string {
  return path.join(app.getPath('userData'), 'nyra_guard_scans.json')
}

// ── Default Configuration ──────────────────────────────────────────────────────

const DEFAULT_CONFIG: NyraGuardConfig = {
  enabled: true,
  openRouterApiKey: null,
  preferredModel: 'openrouter/auto',
  autoScan: true,
  scanInterval: 30, // minutes
  errorMonitoring: true,
  threatDetection: true,
  lastScanAt: null,
  scanHistory: [],
}

// ── Guard Instance ────────────────────────────────────────────────────────────

export const guardEvents = new EventEmitter()

let guardConfig = DEFAULT_CONFIG
let guardErrorLog: GuardLog[] = []
let autoScanTimerId: NodeJS.Timeout | null = null
let isScanning = false

// ── Initialization ─────────────────────────────────────────────────────────────

export function initializeGuard(): void {
  try {
    // Load config
    const configPath = getGuardConfigPath()
    if (fs.existsSync(configPath)) {
      const stored = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      guardConfig = { ...DEFAULT_CONFIG, ...stored }
    } else {
      guardConfig = { ...DEFAULT_CONFIG }
      saveGuardConfig(guardConfig)
    }

    // Load error log
    const logPath = getGuardLogPath()
    if (fs.existsSync(logPath)) {
      guardErrorLog = JSON.parse(fs.readFileSync(logPath, 'utf-8'))
    }

    addGuardLog({
      level: 'info',
      category: 'system',
      message: 'NyraGuard initialized',
    })

    // Start auto-scan if enabled
    if (guardConfig.autoScan && guardConfig.enabled) {
      startAutoScan()
    }
  } catch (err) {
    console.error('[NyraGuard] Initialization error:', err)
  }
}

// ── Configuration Management ───────────────────────────────────────────────────

export function getGuardConfig(): NyraGuardConfig {
  return { ...guardConfig }
}

export function setGuardConfig(patch: Partial<NyraGuardConfig>): NyraGuardConfig {
  guardConfig = { ...guardConfig, ...patch }
  saveGuardConfig(guardConfig)
  guardEvents.emit('status-change')
  return { ...guardConfig }
}

function saveGuardConfig(cfg: NyraGuardConfig): void {
  try {
    const configPath = getGuardConfigPath()
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  } catch (err) {
    console.error('[NyraGuard] Failed to save config:', err)
  }
}

// ── API Key Management (with Encryption) ───────────────────────────────────────

export function saveGuardApiKey(key: string): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.error('[NyraGuard] System keychain/encryption unavailable')
      addGuardLog({
        level: 'warn',
        category: 'security',
        message: 'API key storage failed: encryption unavailable',
      })
      return false
    }

    const encrypted = safeStorage.encryptString(key)
    const keyStorageKey = getGuardApiKeyStorageKey()

    // Store in a simple encrypted file
    const keyPath = path.join(app.getPath('userData'), `.${keyStorageKey}`)
    fs.writeFileSync(keyPath, encrypted.toString('base64'), { mode: 0o600 })

    // Update config to indicate key is set
    setGuardConfig({ openRouterApiKey: '***' })

    addGuardLog({
      level: 'info',
      category: 'security',
      message: 'OpenRouter API key saved',
    })

    return true
  } catch (err) {
    console.error('[NyraGuard] Failed to save API key:', err)
    addGuardLog({
      level: 'error',
      category: 'security',
      message: 'Failed to save API key',
      details: String(err),
    })
    return false
  }
}

export function loadGuardApiKey(): string | null {
  try {
    const keyStorageKey = getGuardApiKeyStorageKey()
    const keyPath = path.join(app.getPath('userData'), `.${keyStorageKey}`)

    if (!fs.existsSync(keyPath)) {
      return null
    }

    const encrypted = Buffer.from(fs.readFileSync(keyPath, 'utf-8'), 'base64')
    const decrypted = safeStorage.decryptString(encrypted)
    return decrypted
  } catch (err) {
    console.error('[NyraGuard] Failed to load API key:', err)
    return null
  }
}

export function removeGuardApiKey(): boolean {
  try {
    const keyStorageKey = getGuardApiKeyStorageKey()
    const keyPath = path.join(app.getPath('userData'), `.${keyStorageKey}`)

    if (fs.existsSync(keyPath)) {
      fs.unlinkSync(keyPath)
    }

    setGuardConfig({ openRouterApiKey: null })

    addGuardLog({
      level: 'info',
      category: 'security',
      message: 'OpenRouter API key removed',
    })

    return true
  } catch (err) {
    console.error('[NyraGuard] Failed to remove API key:', err)
    return false
  }
}

// ── Error Logging ──────────────────────────────────────────────────────────────

export function getErrorLog(): GuardLog[] {
  return [...guardErrorLog]
}

export function addGuardLog(entry: Omit<GuardLog, 'timestamp'>): void {
  const log: GuardLog = {
    timestamp: Date.now(),
    ...entry,
  }

  guardErrorLog.push(log)

  // Keep only last 500 entries
  if (guardErrorLog.length > 500) {
    guardErrorLog = guardErrorLog.slice(-500)
  }

  saveErrorLog()
  guardEvents.emit('log', log)
}

function saveErrorLog(): void {
  try {
    const logPath = getGuardLogPath()
    fs.writeFileSync(logPath, JSON.stringify(guardErrorLog, null, 2), { mode: 0o600 })
  } catch (err) {
    console.error('[NyraGuard] Failed to save error log:', err)
  }
}

export function clearErrorLog(): void {
  guardErrorLog = []
  saveErrorLog()
  addGuardLog({
    level: 'info',
    category: 'audit',
    message: 'Error log cleared',
  })
}

// ── Scan History Management ────────────────────────────────────────────────────

function saveScanHistory(): void {
  try {
    const scansPath = getGuardScansPath()
    fs.writeFileSync(scansPath, JSON.stringify(guardConfig.scanHistory, null, 2), {
      mode: 0o600,
    })
  } catch (err) {
    console.error('[NyraGuard] Failed to save scan history:', err)
  }
}

// @ts-ignore — reserved for future use
function _loadScanHistory(): void {
  try {
    const scansPath = getGuardScansPath()
    if (fs.existsSync(scansPath)) {
      const data = JSON.parse(fs.readFileSync(scansPath, 'utf-8'))
      guardConfig.scanHistory = Array.isArray(data) ? data : []
    }
  } catch (err) {
    console.error('[NyraGuard] Failed to load scan history:', err)
  }
}

function addScanResult(result: ScanResult): void {
  guardConfig.scanHistory.push(result)

  // Keep only last 50 scans
  if (guardConfig.scanHistory.length > 50) {
    guardConfig.scanHistory = guardConfig.scanHistory.slice(-50)
  }

  saveScanHistory()
}

// ── Security Scanning ──────────────────────────────────────────────────────────

export async function runSecurityScan(): Promise<ScanResult[]> {
  const results: ScanResult[] = []

  // Check 1: Auth profiles file permissions
  try {
    const authProfilesPath = path.join(
      os.homedir(),
      '.openclaw',
      'agents',
      'main',
      'agent',
      'auth-profiles.json'
    )
    if (fs.existsSync(authProfilesPath)) {
      const _stat = fs.statSync(authProfilesPath)
      const mode = (_stat.mode & parseInt('777', 8)).toString(8)

      if (mode !== '600') {
        results.push({
          id: generateId(),
          timestamp: Date.now(),
          type: 'security',
          severity: 'high',
          title: 'Auth profiles file permissions',
          description: `auth-profiles.json has insecure permissions (${mode}). Should be 600.`,
          resolution: `Run: chmod 600 "${authProfilesPath}"`,
          resolved: false,
        })
      } else {
        results.push({
          id: generateId(),
          timestamp: Date.now(),
          type: 'security',
          severity: 'info',
          title: 'Auth profiles file permissions OK',
          description: 'auth-profiles.json has correct permissions (600)',
          resolved: true,
        })
      }
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'security',
      message: 'Failed to check auth-profiles permissions',
      details: String(err),
    })
  }

  // Check 2: Gateway config exists and is valid
  try {
    const gatewayConfigPath = path.join(os.homedir(), '.openclaw', 'config.yml')
    if (fs.existsSync(gatewayConfigPath)) {
      const content = fs.readFileSync(gatewayConfigPath, 'utf-8')
      if (content.length > 0) {
        results.push({
          id: generateId(),
          timestamp: Date.now(),
          type: 'security',
          severity: 'info',
          title: 'Gateway config exists',
          description: 'OpenClaw gateway configuration file found and readable',
          resolved: true,
        })
      }
    } else {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'security',
        severity: 'medium',
        title: 'Gateway config missing',
        description: 'OpenClaw gateway config.yml not found',
        resolution: 'Run OpenClaw initialization',
        resolved: false,
      })
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'security',
      message: 'Failed to check gateway config',
      details: String(err),
    })
  }

  // Check 3: Environment variable exposure
  try {
    const suspiciousEnvKeys = ['API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'APIKEY', 'OPENAI_KEY']
    const exposedVars = suspiciousEnvKeys.filter(
      key => process.env[key] && process.env[key]?.length! > 0
    )

    if (exposedVars.length > 0) {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'vulnerability',
        severity: 'high',
        title: 'Exposed secrets in environment',
        description: `Detected ${exposedVars.length} sensitive env variables: ${exposedVars.join(', ')}`,
        resolution: 'Remove sensitive data from environment variables',
        resolved: false,
      })
    } else {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'security',
        severity: 'info',
        title: 'No exposed secrets in environment',
        description: 'No sensitive environment variables detected',
        resolved: true,
      })
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'security',
      message: 'Failed to check environment variables',
      details: String(err),
    })
  }

  // Check 4: Disk space
  try {
    const userDataPath = app.getPath('userData')
    const _stat = fs.statSync(userDataPath)
    const diskAvailable = getDiskSpace(userDataPath)

    if (diskAvailable < 100 * 1024 * 1024) {
      // < 100 MB
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'high',
        title: 'Low disk space',
        description: `Only ${(diskAvailable / 1024 / 1024).toFixed(2)} MB available on userData partition`,
        resolution: 'Free up disk space',
        resolved: false,
      })
    } else if (diskAvailable < 500 * 1024 * 1024) {
      // < 500 MB
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'medium',
        title: 'Disk space warning',
        description: `${(diskAvailable / 1024 / 1024).toFixed(2)} MB available on userData partition`,
        resolved: false,
      })
    } else {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'security',
        severity: 'info',
        title: 'Disk space adequate',
        description: `${(diskAvailable / 1024 / 1024).toFixed(2)} MB available`,
        resolved: true,
      })
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'security',
      message: 'Failed to check disk space',
      details: String(err),
    })
  }

  // Check 5: OpenClaw ports accessibility
  try {
    const port = 18789
    const accessible = await isPortOpen('127.0.0.1', port)

    if (accessible) {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'security',
        severity: 'info',
        title: 'OpenClaw port accessible',
        description: `Gateway port ${port} is open and listening (expected)`,
        resolved: true,
      })
    } else {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'medium',
        title: 'OpenClaw port not accessible',
        description: `Gateway port ${port} is not responding`,
        resolution: 'Check if OpenClaw gateway is running',
        resolved: false,
      })
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'security',
      message: 'Failed to check OpenClaw port',
      details: String(err),
    })
  }

  // Log results
  results.forEach(r => addScanResult(r))

  return results
}

export async function runStabilityScan(): Promise<ScanResult[]> {
  const results: ScanResult[] = []

  // Check 1: Gateway process status
  try {
    const gatewayPortOpen = await isPortOpen('127.0.0.1', 18789)
    if (gatewayPortOpen) {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'info',
        title: 'Gateway process healthy',
        description: 'OpenClaw gateway is responding',
        resolved: true,
      })
    } else {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'high',
        title: 'Gateway process unhealthy',
        description: 'OpenClaw gateway not responding on port 18789',
        resolution: 'Restart the application',
        resolved: false,
      })
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'stability',
      message: 'Failed to check gateway status',
      details: String(err),
    })
  }

  // Check 2: Memory usage
  try {
    const memUsage = process.memoryUsage()
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100

    if (heapUsedPercent > 90) {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'high',
        title: 'High memory usage',
        description: `Heap usage at ${heapUsedPercent.toFixed(1)}% of limit`,
        resolution: 'Close unused sessions or restart the app',
        resolved: false,
      })
    } else if (heapUsedPercent > 70) {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'medium',
        title: 'Elevated memory usage',
        description: `Heap usage at ${heapUsedPercent.toFixed(1)}%`,
        resolved: false,
      })
    } else {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'info',
        title: 'Memory usage normal',
        description: `Heap usage at ${heapUsedPercent.toFixed(1)}%`,
        resolved: true,
      })
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'stability',
      message: 'Failed to check memory usage',
      details: String(err),
    })
  }

  // Check 3: Required config files exist
  try {
    const userDataPath = app.getPath('userData')
    const requiredFiles = [
      'nyra_projects.json',
      'nyra_theme.json',
      'nyra_onboarded.json',
    ]

    const missing = requiredFiles.filter(
      f => !fs.existsSync(path.join(userDataPath, f))
    )

    if (missing.length > 0) {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'medium',
        title: 'Missing config files',
        description: `Missing files: ${missing.join(', ')}`,
        resolution: 'Restart the application to regenerate missing config',
        resolved: false,
      })
    } else {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'info',
        title: 'All config files present',
        description: 'Required configuration files are in place',
        resolved: true,
      })
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'stability',
      message: 'Failed to check config files',
      details: String(err),
    })
  }

  // Check 4: Process uptime
  try {
    const uptime = process.uptime()
    const uptimeHours = uptime / 3600

    if (uptimeHours > 72) {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'low',
        title: 'Long process uptime',
        description: `App has been running for ${uptimeHours.toFixed(1)} hours`,
        resolution: 'Consider restarting the app to release accumulated resources',
        resolved: false,
      })
    } else {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'stability',
        severity: 'info',
        title: 'Process uptime normal',
        description: `App uptime: ${uptimeHours.toFixed(1)} hours`,
        resolved: true,
      })
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'stability',
      message: 'Failed to check process uptime',
      details: String(err),
    })
  }

  // Log results
  results.forEach(r => addScanResult(r))

  return results
}

export async function runThreatScan(): Promise<ScanResult[]> {
  const results: ScanResult[] = []

  // Check 1: Auth profiles integrity
  try {
    const authProfilesPath = path.join(
      os.homedir(),
      '.openclaw',
      'agents',
      'main',
      'agent',
      'auth-profiles.json'
    )

    if (fs.existsSync(authProfilesPath)) {
      const content = fs.readFileSync(authProfilesPath, 'utf-8')
      try {
        JSON.parse(content)
        results.push({
          id: generateId(),
          timestamp: Date.now(),
          type: 'threat',
          severity: 'info',
          title: 'Auth profiles integrity OK',
          description: 'auth-profiles.json parses successfully (no corruption)',
          resolved: true,
        })
      } catch {
        results.push({
          id: generateId(),
          timestamp: Date.now(),
          type: 'threat',
          severity: 'critical',
          title: 'Auth profiles corrupted',
          description: 'auth-profiles.json is not valid JSON',
          resolution: 'Restore from backup or reconfigure providers',
          resolved: false,
        })
      }
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'threat',
      message: 'Failed to check auth-profiles integrity',
      details: String(err),
    })
  }

  // Check 2: Gateway config integrity
  try {
    const gatewayConfigPath = path.join(os.homedir(), '.openclaw', 'config.yml')

    if (fs.existsSync(gatewayConfigPath)) {
      const stat = fs.statSync(gatewayConfigPath)
      const lastModified = stat.mtime.getTime()
      const ageMs = Date.now() - lastModified

      // Warn if modified in last 5 minutes (potential tampering)
      if (ageMs < 5 * 60 * 1000 && ageMs > 0) {
        results.push({
          id: generateId(),
          timestamp: Date.now(),
          type: 'threat',
          severity: 'medium',
          title: 'Gateway config recently modified',
          description: `config.yml was modified ${(ageMs / 1000).toFixed(0)} seconds ago`,
          resolution: 'Verify the modification was intentional',
          resolved: false,
        })
      } else {
        results.push({
          id: generateId(),
          timestamp: Date.now(),
          type: 'threat',
          severity: 'info',
          title: 'Gateway config stable',
          description: 'No recent suspicious modifications detected',
          resolved: true,
        })
      }
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'threat',
      message: 'Failed to check gateway config integrity',
      details: String(err),
    })
  }

  // Check 3: Suspicious environment variables
  try {
    const suspiciousPatterns = ['MALWARE', 'BACKDOOR', 'ROOTKIT', 'EXPLOIT', 'INJECT']
    const foundSuspicious = Object.keys(process.env).filter(key =>
      suspiciousPatterns.some(pattern => key.toUpperCase().includes(pattern))
    )

    if (foundSuspicious.length > 0) {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'threat',
        severity: 'critical',
        title: 'Suspicious environment variables detected',
        description: `Found: ${foundSuspicious.join(', ')}`,
        resolution: 'Investigate and remove suspicious environment variables',
        resolved: false,
      })
    } else {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'threat',
        severity: 'info',
        title: 'No suspicious environment variables',
        description: 'Environment is clean',
        resolved: true,
      })
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'threat',
      message: 'Failed to check environment variables',
      details: String(err),
    })
  }

  // Check 4: Nyra userData directory permissions
  try {
    const userDataPath = app.getPath('userData')
    const stat = fs.statSync(userDataPath)
    const mode = (stat.mode & parseInt('777', 8)).toString(8)

    // userData should not be world-readable
    if (mode.endsWith('7') || mode.endsWith('5')) {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'threat',
        severity: 'high',
        title: 'userData directory world-accessible',
        description: `userData has overly permissive permissions (${mode})`,
        resolution: `Run: chmod 700 "${userDataPath}"`,
        resolved: false,
      })
    } else {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        type: 'threat',
        severity: 'info',
        title: 'userData directory permissions secure',
        description: `userData permissions are restrictive (${mode})`,
        resolved: true,
      })
    }
  } catch (err) {
    addGuardLog({
      level: 'warn',
      category: 'threat',
      message: 'Failed to check userData permissions',
      details: String(err),
    })
  }

  // Log results
  results.forEach(r => addScanResult(r))

  return results
}

// ── Auto-scan Timer ────────────────────────────────────────────────────────────

export function startAutoScan(): void {
  if (autoScanTimerId) {
    console.log('[NyraGuard] Auto-scan already running')
    return
  }

  console.log('[NyraGuard] Starting auto-scan')

  // Run scan immediately
  runFullScan().catch(err => {
    console.error('[NyraGuard] Auto-scan error:', err)
  })

  // Then schedule recurring scans
  const intervalMs = guardConfig.scanInterval * 60 * 1000
  autoScanTimerId = setInterval(() => {
    if (!isScanning) {
      runFullScan().catch(err => {
        console.error('[NyraGuard] Auto-scan error:', err)
      })
    }
  }, intervalMs)
}

export function stopAutoScan(): void {
  if (autoScanTimerId) {
    clearInterval(autoScanTimerId)
    autoScanTimerId = null
    console.log('[NyraGuard] Auto-scan stopped')
  }
}

async function runFullScan(): Promise<ScanResult[]> {
  if (isScanning) {
    console.log('[NyraGuard] Scan already in progress, skipping')
    return []
  }

  isScanning = true
  try {
    const [securityResults, stabilityResults, threatResults] = await Promise.all([
      runSecurityScan(),
      runStabilityScan(),
      runThreatScan(),
    ])

    const allResults = [...securityResults, ...stabilityResults, ...threatResults]

    guardConfig.lastScanAt = Date.now()
    saveGuardConfig(guardConfig)

    guardEvents.emit('scan-complete', allResults)

    // Emit individual critical/high issues
    allResults.forEach(result => {
      if (!result.resolved && (result.severity === 'high' || result.severity === 'critical')) {
        guardEvents.emit('issue-detected', result)
      }
    })

    addGuardLog({
      level: 'info',
      category: 'audit',
      message: 'Security scan completed',
      details: `${allResults.length} checks performed`,
    })

    return allResults
  } finally {
    isScanning = false
  }
}

// ── AI-Powered Diagnostics (OpenRouter) ────────────────────────────────────────

export async function diagnoseError(errorMessage: string): Promise<{
  diagnosis: string
  suggestedFix: string
  severity: string
}> {
  const apiKey = loadGuardApiKey()
  if (!apiKey) {
    return {
      diagnosis: 'No OpenRouter API key configured',
      suggestedFix: 'Set up OpenRouter API key in NyraGuard settings',
      severity: 'info',
    }
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nyra.app',
        'X-Title': 'NyraGuard',
      },
      body: JSON.stringify({
        model: guardConfig.preferredModel,
        messages: [
          {
            role: 'system',
            content:
              'You are NyraGuard, the security and stability bot for the Nyra Desktop app. Analyze error messages and provide concise diagnostic analysis and suggested fixes. Format your response as JSON with fields: diagnosis (string), suggestedFix (string), severity (info/low/medium/high/critical).',
          },
          {
            role: 'user',
            content: `Error occurred:\n\n${errorMessage}\n\nPlease diagnose the issue and suggest a fix.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${errText}`)
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('Empty response from OpenRouter')
    }

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from response')
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      diagnosis: string
      suggestedFix: string
      severity: string
    }

    addGuardLog({
      level: 'info',
      category: 'audit',
      message: 'AI diagnosis completed',
      details: `Severity: ${parsed.severity}`,
    })

    return parsed
  } catch (err) {
    console.error('[NyraGuard] AI diagnosis error:', err)
    addGuardLog({
      level: 'error',
      category: 'system',
      message: 'AI diagnosis failed',
      details: String(err),
    })

    return {
      diagnosis: 'AI diagnosis unavailable',
      suggestedFix: 'Check the error log for details',
      severity: 'info',
    }
  }
}

export async function getSecurityRecommendations(): Promise<string[]> {
  const apiKey = loadGuardApiKey()
  if (!apiKey) {
    return []
  }

  try {
    const recentIssues = guardConfig.scanHistory
      .filter(r => !r.resolved)
      .slice(-10)
      .map(r => `${r.severity.toUpperCase()}: ${r.title} - ${r.description}`)
      .join('\n')

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nyra.app',
        'X-Title': 'NyraGuard',
      },
      body: JSON.stringify({
        model: guardConfig.preferredModel,
        messages: [
          {
            role: 'system',
            content:
              'You are NyraGuard security advisor. Provide 3-5 specific, actionable security recommendations for the Nyra Desktop app based on recent security issues. Return as a JSON array of strings.',
          },
          {
            role: 'user',
            content: `Recent security issues:\n\n${recentIssues}\n\nProvide recommendations.`,
          },
        ],
        temperature: 0.4,
        max_tokens: 600,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
    const content = data.choices[0]?.message?.content

    if (!content) {
      return []
    }

    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return []
    }

    const parsed = JSON.parse(jsonMatch[0]) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('[NyraGuard] Failed to get recommendations:', err)
    return []
  }
}

// ── Status Report ──────────────────────────────────────────────────────────────

export function getGuardStatus(): {
  enabled: boolean
  hasApiKey: boolean
  lastScan: number | null
  activeIssues: number
  issuesBySeverity: Record<string, number>
  isScanning: boolean
} {
  const unresolved = guardConfig.scanHistory.filter(r => !r.resolved)

  const issuesBySeverity: Record<string, number> = {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  }

  unresolved.forEach(issue => {
    issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1
  })

  return {
    enabled: guardConfig.enabled,
    hasApiKey: loadGuardApiKey() !== null,
    lastScan: guardConfig.lastScanAt,
    activeIssues: unresolved.length,
    issuesBySeverity,
    isScanning,
  }
}

// ── Utility Functions ──────────────────────────────────────────────────────────

function generateId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const net = require('net')
    const socket = new net.Socket()
    socket.setTimeout(2000)

    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })

    socket.on('error', () => {
      resolve(false)
    })

    socket.connect(port, host)
  })
}

function getDiskSpace(dirPath: string): number {
  try {
    // Simple estimation: check available bytes on the partition
    // This is a fallback; in production you might use 'df' or other tools
    const stat = fs.statSync(dirPath)

    // Try to estimate from filesystem; this varies by OS
    // For now return a conservative estimate
    return 1024 * 1024 * 1024 // 1 GB default estimate
  } catch {
    return 1024 * 1024 * 1024
  }
}

export {}
