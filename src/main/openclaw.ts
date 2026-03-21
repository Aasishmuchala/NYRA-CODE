/**
 * OpenClaw Auto-Setup Manager
 *
 * Responsibilities:
 *  1. Check if `openclaw` CLI is installed (PATH or bundled)
 *  2. Auto-install if missing (npm global or bundled binary)
 *  3. Detect if the gateway is already running on ws://127.0.0.1:18789
 *  4. Spawn `openclaw gateway --port 18789` if not running
 *  5. Health-monitor the gateway and restart on crash
 *  6. Emit lifecycle events so the renderer can show connection status
 */

import { EventEmitter } from 'events'
import { ChildProcess, spawn, execSync } from 'child_process'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

const IS_WIN = process.platform === 'win32'
const PATH_SEP = IS_WIN ? ';' : ':'
const HOME_DIR = os.homedir()
import { buildGatewayEnvSecrets, ensureGatewayConfig, ensureNyraDevicePaired, ensureOpenClawJsonOrigins, readRefreshedTokens } from './auth-profiles'
import { loadApiKey, saveApiKey } from './providers'

export const GATEWAY_HOST = '127.0.0.1'
export const GATEWAY_PORT = 18789
export const GATEWAY_WS_URL = `ws://${GATEWAY_HOST}:${GATEWAY_PORT}`

export type OpenClawStatus =
  | 'idle'
  | 'checking'
  | 'installing'
  | 'starting'
  | 'running'
  | 'error'
  | 'stopped'

class OpenClawManager extends EventEmitter {
  private gatewayProcess: ChildProcess | null = null
  private status: OpenClawStatus = 'idle'
  private healthCheckInterval: NodeJS.Timeout | null = null
  private restartAttempts = 0
  private readonly MAX_RESTARTS = 5

  getStatus(): OpenClawStatus {
    return this.status
  }

  private setStatus(s: OpenClawStatus) {
    this.status = s
    this.emit('status', s)
  }

  // ── Step 1: Entry point ────────────────────────────────────────────────────
  async initialize(): Promise<void> {
    this.setStatus('checking')

    // 0. Ensure OpenClaw config + auth-profiles + device identity are in sync.
    //    This MUST run before any connection attempt so the device is pre-registered
    //    as a paired device in the gateway config.
    ensureGatewayConfig()
    ensureOpenClawJsonOrigins()

    // 0b. Write device directly to ~/.openclaw/devices/paired.json — the file
    //     the gateway ACTUALLY reads for device-auth (not openclaw.json!)
    ensureNyraDevicePaired()

    // 1. Check if gateway is already up (another process may have started it)
    const alreadyUp = await this.isPortOpen(GATEWAY_HOST, GATEWAY_PORT)
    if (alreadyUp) {
      console.log('[OpenClaw] Gateway already running on port', GATEWAY_PORT)
      this.setStatus('running')
      this.startHealthCheck()
      return
    }

    // 2. Locate openclaw binary
    const cliBin = await this.resolveCliBinary()
    if (!cliBin) {
      this.setStatus('installing')
      const installed = await this.installOpenClaw()
      if (!installed) {
        // Even if install failed, check one more time — maybe another process started it
        const upNow = await this.isPortOpen(GATEWAY_HOST, GATEWAY_PORT)
        if (upNow) {
          console.log('[OpenClaw] Gateway appeared during install attempt')
          this.setStatus('running')
          this.startHealthCheck()
          return
        }
        this.setStatus('error')
        this.emit('error', new Error('Failed to install OpenClaw'))
        return
      }
    }

    // 3. Spawn gateway
    await this.spawnGateway()
  }

  // ── Force-ready: external callers can tell us the gateway is running ──────
  forceReady(): void {
    console.log('[OpenClaw] forceReady() called — setting status to running')
    this.setStatus('running')
    this.startHealthCheck()
    this.emit('ready')
  }

  // ── Step 2: Resolve binary path ────────────────────────────────────────────
  private async resolveCliBinary(): Promise<string | null> {
    // 2a. Check for bundled binary (packed alongside the Electron app)
    const resourcesBin = path.join(
      process.resourcesPath ?? app.getAppPath(),
      'bin',
      process.platform === 'win32' ? 'openclaw.exe' : 'openclaw'
    )
    if (fs.existsSync(resourcesBin)) return resourcesBin

    // 2b. Check PATH (platform-specific lookup command)
    try {
      const lookupBin = IS_WIN ? 'where' : 'which'
      const found = execSync(`${lookupBin} openclaw`, {
        encoding: 'utf8',
        timeout: 3000,
        stdio: 'pipe',
      }).trim().split(/\r?\n/)[0]  // `where` on Windows can return multiple lines
      if (found && fs.existsSync(found)) return found
    } catch {
      // not found in PATH
    }

    // 2c. Check common global npm paths (platform-aware)
    const npmGlobalBins = IS_WIN
      ? [
          path.join(process.env.APPDATA ?? '', 'npm', 'openclaw.cmd'),
          path.join(HOME_DIR, '.npm-global', 'openclaw.cmd'),
        ]
      : [
          path.join(HOME_DIR, '.npm-global', 'bin', 'openclaw'),
          '/usr/local/bin/openclaw',
          '/opt/homebrew/bin/openclaw',
        ]
    for (const p of npmGlobalBins) {
      if (fs.existsSync(p)) return p
    }

    // 2d. Check nvm-managed Node installations (any v22+)
    const nvmDir = path.join(HOME_DIR, '.nvm', 'versions', 'node')
    if (fs.existsSync(nvmDir)) {
      try {
        const versions = fs.readdirSync(nvmDir)
          .filter(v => /^v(2[2-9]|[3-9]\d)/.test(v))
          .sort()
          .reverse()
        for (const v of versions) {
          const candidate = path.join(nvmDir, v, 'bin', 'openclaw')
          if (fs.existsSync(candidate)) return candidate
        }
      } catch { /* ignore */ }
    }

    return null
  }

  // ── Step 3: Auto-install via npm ────────────────────────────────────────────
  private installOpenClaw(): Promise<boolean> {
    return new Promise((resolve) => {
      this.emit('installing', 'Running: npm install -g openclaw ...')
      const proc = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '-g', 'openclaw'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      })

      proc.stdout?.on('data', (d) => this.emit('install-log', d.toString()))
      proc.stderr?.on('data', (d) => this.emit('install-log', d.toString()))

      proc.on('close', (code) => {
        if (code === 0) {
          console.log('[OpenClaw] Installation complete')
          resolve(true)
        } else {
          console.error('[OpenClaw] Installation failed with code', code)
          resolve(false)
        }
      })
    })
  }

  // ── Step 4a: Find a Node.js v22+ binary (needed when Electron's PATH has
  //            an older Node via nvm) ────────────────────────────────────────
  private resolveNodeV22BinDir(): string | null {
    // Look in ~/.nvm/versions/node/ for any v22, v23, v24 … installation
    const nvmDir = path.join(HOME_DIR, '.nvm', 'versions', 'node')
    if (!fs.existsSync(nvmDir)) return null
    try {
      const versions = fs.readdirSync(nvmDir)
        .filter(v => /^v(2[2-9]|[3-9]\d)/.test(v))  // v22+
        .sort((a, b) => {
          // Semantic sort descending so we prefer the latest
          const pa = a.slice(1).split('.').map(Number)
          const pb = b.slice(1).split('.').map(Number)
          for (let i = 0; i < 3; i++) {
            if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0)
          }
          return 0
        })
      for (const v of versions) {
        const binDir = path.join(nvmDir, v, 'bin')
        if (fs.existsSync(path.join(binDir, 'node'))) {
          console.log('[OpenClaw] Found Node v22+ at:', binDir)
          return binDir
        }
      }
    } catch { /* ignore */ }
    return null
  }

  // ── Step 4: Spawn the gateway subprocess (with progressive self-healing) ────
  private async spawnGateway(): Promise<void> {
    this.setStatus('starting')

    const cliBin = (await this.resolveCliBinary()) ?? 'openclaw'

    // Ensure OpenClaw config directory + gateway config exist (with allowed origins)
    ensureGatewayConfig()
    ensureOpenClawJsonOrigins()
    ensureNyraDevicePaired()

    // Build an env where Node v22+ comes first in PATH so that the openclaw
    // shebang (#!/usr/bin/env node) picks the right version.
    // Also inject provider API keys as env vars (EasyClaw pattern).
    const nodeV22BinDir = this.resolveNodeV22BinDir()
    const secretEnv = buildGatewayEnvSecrets(loadApiKey)
    const spawnEnv = {
      ...process.env,
      ...secretEnv,
      ...(nodeV22BinDir ? { PATH: `${nodeV22BinDir}${PATH_SEP}${process.env.PATH ?? ''}` } : {}),
    }

    const trySpawn = (extraArgs: string[] = []): void => {
      const args = ['gateway', '--port', String(GATEWAY_PORT), ...extraArgs]
      console.log('[OpenClaw] Spawning:', cliBin, ...args)
      this.gatewayProcess = spawn(cliBin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: false,
        env: spawnEnv,
      })
      this.gatewayProcess.stdout?.on('data', (d) => {
        const line = d.toString().trim()
        console.log('[OpenClaw Gateway]', line)
        this.emit('gateway-log', line)
      })
      this.gatewayProcess.stderr?.on('data', (d) => {
        const line = d.toString().trim()
        console.warn('[OpenClaw Gateway][stderr]', line)
        this.emit('gateway-log', line)
      })
      this.gatewayProcess.on('close', (code) => {
        console.warn('[OpenClaw] Gateway exited with code', code)
        this.setStatus('stopped')
        this.stopHealthCheck()
        this.maybeRestart()
      })
    }

    // Attempt 1: plain start (no --force)
    trySpawn()
    const ready1 = await this.waitForPort(GATEWAY_HOST, GATEWAY_PORT, 8_000)
    if (ready1) {
      this.onGatewayReady()
      return
    }

    // Attempt 2: stop any stale instance, then plain start
    console.log('[OpenClaw] Gateway not up after 8s — stopping stale instance and retrying')
    await this.stopGatewayProcess(cliBin, spawnEnv)
    await new Promise(r => setTimeout(r, 1500))
    trySpawn()
    const ready2 = await this.waitForPort(GATEWAY_HOST, GATEWAY_PORT, 8_000)
    if (ready2) {
      this.onGatewayReady()
      return
    }

    // Attempt 3: --force (kills anything on the port and restarts)
    console.log('[OpenClaw] Still not up — using --force')
    await this.stopGatewayProcess(cliBin, spawnEnv)
    await new Promise(r => setTimeout(r, 500))
    trySpawn(['--force'])
    const ready3 = await this.waitForPort(GATEWAY_HOST, GATEWAY_PORT, 10_000)
    if (ready3) {
      this.onGatewayReady()
    } else {
      this.setStatus('error')
      this.emit('error', new Error('Gateway did not start after 3 attempts'))
    }
  }

  private onGatewayReady(): void {
    this.setStatus('running')
    this.restartAttempts = 0
    this.startHealthCheck()
    this.emit('ready')
  }

  private stopGatewayProcess(cliBin: string, env: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve) => {
      // Kill our own process handle if we have one
      if (this.gatewayProcess) {
        this.gatewayProcess.removeAllListeners('close')
        // Windows doesn't support POSIX signals; .kill() without args does a forceful stop
        IS_WIN ? this.gatewayProcess.kill() : this.gatewayProcess.kill('SIGTERM')
        this.gatewayProcess = null
      }
      // Also ask openclaw to stop (in case a different process owns the gateway)
      const stopper = spawn(cliBin, ['gateway', 'stop'], {
        stdio: 'ignore', shell: process.platform === 'win32', env
      })
      stopper.on('close', () => resolve())
      stopper.on('error', () => resolve()) // ignore errors — best-effort
      setTimeout(resolve, 3000) // don't wait more than 3s
    })
  }

  // ── Health check & auto-restart ─────────────────────────────────────────────
  private startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      const alive = await this.isPortOpen(GATEWAY_HOST, GATEWAY_PORT)
      if (!alive) {
        console.warn('[OpenClaw] Health check failed — gateway unreachable')
        this.setStatus('stopped')
        this.stopHealthCheck()
        this.maybeRestart()
      }
    }, 5_000)
  }

  private stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  private async maybeRestart() {
    if (this.restartAttempts >= this.MAX_RESTARTS) {
      this.emit('error', new Error(`Gateway crashed ${this.MAX_RESTARTS} times. Giving up.`))
      return
    }
    this.restartAttempts++
    const delay = Math.min(1000 * 2 ** this.restartAttempts, 30_000)
    console.log(`[OpenClaw] Restarting in ${delay}ms (attempt ${this.restartAttempts})`)
    this.emit('restarting', { attempt: this.restartAttempts, delay })
    setTimeout(() => {
      this.spawnGateway().catch((err) => {
        console.error('[OpenClaw] Restart failed:', err)
        this.setStatus('error')
        this.emit('error', err instanceof Error ? err : new Error(String(err)))
      })
    }, delay)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private isPortOpen(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port })
      socket.setTimeout(1000)
      socket.on('connect', () => { socket.destroy(); resolve(true) })
      socket.on('error', () => { socket.destroy(); resolve(false) })
      socket.on('timeout', () => { socket.destroy(); resolve(false) })
    })
  }

  private waitForPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now()
      const poll = async () => {
        if (await this.isPortOpen(host, port)) { resolve(true); return }
        if (Date.now() - start > timeoutMs) { resolve(false); return }
        setTimeout(poll, 500)
      }
      poll()
    })
  }

  // ── Graceful restart (refreshes env vars with latest API keys) ────────────
  async restart(): Promise<void> {
    console.log('[OpenClaw] Restart requested — refreshing gateway with latest keys')
    this.stopHealthCheck()
    if (this.gatewayProcess) {
      this.gatewayProcess.removeAllListeners('close')
      IS_WIN ? this.gatewayProcess.kill() : this.gatewayProcess.kill('SIGTERM')
      this.gatewayProcess = null
    }
    // Brief pause to let the port close
    await new Promise(r => setTimeout(r, 1000))
    this.restartAttempts = 0
    await this.spawnGateway()
  }

  // ── Teardown ─────────────────────────────────────────────────────────────────
  shutdown() {
    this.stopHealthCheck()

    // Sync refreshed OAuth tokens back to keychain before shutting down
    // (OpenClaw may have refreshed tokens during the session)
    try {
      const refreshed = readRefreshedTokens()
      for (const { nyraProviderId, accessToken } of refreshed) {
        const existing = loadApiKey(nyraProviderId)
        if (existing !== accessToken) {
          console.log(`[OpenClaw] Syncing refreshed token for ${nyraProviderId} back to keychain`)
          saveApiKey(nyraProviderId, accessToken)
        }
      }
    } catch (err) {
      console.warn('[OpenClaw] Failed to sync refreshed tokens:', err)
    }

    if (this.gatewayProcess) {
      console.log('[OpenClaw] Shutting down gateway process')
      IS_WIN ? this.gatewayProcess.kill() : this.gatewayProcess.kill('SIGTERM')
      this.gatewayProcess = null
    }
    this.setStatus('stopped')
  }
}

export const openClawManager = new OpenClawManager()
