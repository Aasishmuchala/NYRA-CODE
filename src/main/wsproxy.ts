/**
 * Dev-mode WebSocket Origin Proxy + OpenClaw Auth + Protocol Translator  (v4)
 *
 * 1. Proxy on 18790, relay to 18789 with Origin: file://
 * 2. Handle connect.challenge / connect handshake with Ed25519 device auth
 * 3. Translate renderer JSON-RPC ↔ gateway native frame format:
 *    - Renderer sends:  { jsonrpc:"2.0", id, method, params }
 *    - Gateway expects: { type:"req", id, method, params }
 *    - Gateway replies: { type:"res", id, ok, payload, error }
 *    - We return:       { id, result: payload } or { id, error: {message} }
 *    - Gateway events:  { type:"event", event, payload }
 *    - We forward as-is (renderer v3 handles both formats)
 */

import WebSocket, { WebSocketServer } from 'ws'
import { GATEWAY_HOST, GATEWAY_PORT } from './openclaw'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import type { IncomingMessage } from 'http'

export const PROXY_PORT = 18790
export const PROXY_WS_URL = `ws://${GATEWAY_HOST}:${PROXY_PORT}`

// ── OpenClaw config ──────────────────────────────────────────────────────────

function readOpenClawConfig(): Record<string, unknown> {
  const cfgPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
  try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } catch { return {} }
}

function getGatewayToken(): string | null {
  try {
    const gw = (readOpenClawConfig()['gateway'] as any) ?? {}
    return gw?.auth?.token ?? null
  } catch { return null }
}

// ── Device identity (Ed25519, matching EasyClaw) ─────────────────────────────

interface DeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem)
  const spki = key.export({ type: 'spki', format: 'der' }) as Buffer
  if (spki.length === ED25519_SPKI_PREFIX.length + 32 &&
      spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    return spki.subarray(ED25519_SPKI_PREFIX.length)
  }
  return spki
}

function loadOrCreateDeviceIdentity(): DeviceIdentity {
  const idFile = path.join(os.homedir(), '.openclaw', 'nyra-device-identity.json')
  try {
    if (fs.existsSync(idFile)) {
      const stored = JSON.parse(fs.readFileSync(idFile, 'utf8'))
      if (stored?.version === 1 && stored.deviceId && stored.publicKeyPem && stored.privateKeyPem) {
        return { deviceId: stored.deviceId, publicKeyPem: stored.publicKeyPem, privateKeyPem: stored.privateKeyPem }
      }
    }
  } catch { /* regenerate */ }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const raw = derivePublicKeyRaw(publicKeyPem)
  const deviceId = crypto.createHash('sha256').update(raw).digest('hex')

  const dir = path.dirname(idFile)
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(idFile, JSON.stringify({ version: 1, deviceId, publicKeyPem, privateKeyPem, createdAtMs: Date.now() }, null, 2) + '\n', { mode: 0o600 })
  } catch (err) { console.warn('[WsProxy] Could not persist device identity:', err) }

  return { deviceId, publicKeyPem, privateKeyPem }
}

// ── Auth constants (matching EasyClaw rpc-client.ts) ─────────────────────────

const CLIENT_ID   = 'node-host'
const CLIENT_MODE = 'ui'
const ROLE        = 'operator'
const SCOPES      = ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing']

// ── Build connect request ────────────────────────────────────────────────────

function buildConnectRequest(nonce: string, token: string): { msg: string; id: string } {
  const identity  = loadOrCreateDeviceIdentity()
  const signedAt  = Date.now()
  const connectId = `nyra-${signedAt}-${Math.random().toString(36).slice(2, 8)}`

  // Build signature payload (v2 format, same as EasyClaw buildDeviceAuthPayload)
  const sigPayload = [
    'v2', identity.deviceId, CLIENT_ID, CLIENT_MODE, ROLE,
    SCOPES.join(','), String(signedAt), token, nonce
  ].join('|')

  // Ed25519 sign (NOT HMAC — matching EasyClaw's signPayload)
  const privateKey = crypto.createPrivateKey(identity.privateKeyPem)
  const sig = crypto.sign(null, Buffer.from(sigPayload, 'utf8'), privateKey)
  const signature = base64UrlEncode(sig as Buffer)

  const publicKeyB64 = base64UrlEncode(derivePublicKeyRaw(identity.publicKeyPem))

  const params: Record<string, unknown> = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id:       CLIENT_ID,
      version:  '1.0.0',
      platform: process.platform,
      mode:     CLIENT_MODE,
    },
    role:   ROLE,
    scopes: SCOPES,
    caps:   ['tool-events'],
    auth:   { token },
    device: {
      id:        identity.deviceId,
      publicKey: publicKeyB64,
      signature,
      signedAt,
      nonce,
    },
  }

  // Gateway native frame format: { type:"req", id, method, params }
  const req = { type: 'req', id: connectId, method: 'connect', params }
  return { msg: JSON.stringify(req), id: connectId }
}

// ── Protocol translation helpers ─────────────────────────────────────────────

/** Renderer JSON-RPC → Gateway native */
function translateRequest(raw: string): string | null {
  try {
    const msg = JSON.parse(raw)
    if (msg.jsonrpc === '2.0' && msg.method) {
      // Convert { jsonrpc:"2.0", id, method, params } → { type:"req", id, method, params }
      return JSON.stringify({ type: 'req', id: msg.id, method: msg.method, params: msg.params })
    }
  } catch { /* not JSON or not JSON-RPC */ }
  return null  // pass through as-is
}

/** Gateway native → Renderer JSON-RPC */
function translateResponse(raw: string): string | null {
  try {
    const msg = JSON.parse(raw)
    if (msg.type === 'res' && msg.id) {
      // Convert { type:"res", id, ok, payload, error } → { id, result/error }
      if (msg.ok) {
        return JSON.stringify({ id: msg.id, result: msg.payload ?? null })
      } else {
        return JSON.stringify({ id: msg.id, error: { code: -1, message: msg.error?.message ?? 'request failed', data: msg.error } })
      }
    }
    // Events: pass through as-is (renderer handles { type:"event", event, payload })
  } catch { /* not JSON */ }
  return null
}

// ── Proxy server ─────────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null

export function startWsProxy(): void {
  if (wss) return
  console.log('[WsProxy] *** PROTOCOL-TRANSLATOR BUILD v4 ***')

  wss = new WebSocketServer({ host: GATEWAY_HOST, port: PROXY_PORT })

  wss.on('listening', () => {
    console.log(`[WsProxy] Listening on ${PROXY_WS_URL} -> ws://${GATEWAY_HOST}:${GATEWAY_PORT}`)
  })

  let connCount = 0

  wss.on('connection', (clientWs: WebSocket, req: IncomingMessage) => {
    const id = ++connCount
    const t0 = Date.now()
    console.log(`[WsProxy] #${id} Client connected (origin: ${req.headers['origin'] ?? 'none'})`)

    const upstream = new WebSocket(`ws://${GATEWAY_HOST}:${GATEWAY_PORT}`, {
      headers: { Origin: 'file://' },
    })

    let authDone      = false
    let authConnectId: string | null = null
    const clientQueue: Array<{ data: WebSocket.RawData; isBinary: boolean }> = []

    // Auth safety timeout — if handshake doesn't complete in 6s, skip auth and relay raw
    let authTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!authDone) {
        console.warn(`[WsProxy] #${id} Auth timeout after 6s — skipping auth, relaying raw`)
        authDone = true
        // Flush any queued client messages
        for (const { data: qd, isBinary: qb } of clientQueue) {
          if (upstream.readyState === WebSocket.OPEN) {
            if (!qb) {
              const translated = translateRequest(qd.toString())
              upstream.send(translated ?? qd.toString())
            } else {
              upstream.send(qd, { binary: qb })
            }
          }
        }
        clientQueue.length = 0
      }
      authTimeout = null
    }, 6_000)

    upstream.on('open', () => {
      console.log(`[WsProxy] #${id} Upstream open (+${Date.now() - t0}ms) — awaiting challenge`)
    })

    upstream.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        if (authDone && clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: true })
        return
      }

      const raw = data.toString()
      let parsed: Record<string, unknown>
      try { parsed = JSON.parse(raw) } catch {
        if (authDone && clientWs.readyState === WebSocket.OPEN) clientWs.send(raw)
        return
      }

      // ── connect.challenge ────────────────────────────────────────────
      if (!authDone && parsed['type'] === 'event' && parsed['event'] === 'connect.challenge') {
        const nonce = ((parsed['payload'] as any)?.nonce as string) ?? ''
        if (!nonce) { console.error(`[WsProxy] #${id} challenge missing nonce`); upstream.close(); return }

        const token = getGatewayToken()
        if (!token) {
          console.warn(`[WsProxy] #${id} No token — skipping auth, forwarding raw`)
          authDone = true
          if (clientWs.readyState === WebSocket.OPEN) clientWs.send(raw)
          return
        }

        console.log(`[WsProxy] #${id} Challenge (nonce=${nonce.slice(0, 8)}…) — sending connect`)
        const { msg, id: cid } = buildConnectRequest(nonce, token)
        authConnectId = cid
        upstream.send(msg)
        return
      }

      // ── connect response ─────────────────────────────────────────────
      if (!authDone && authConnectId && parsed['type'] === 'res' && parsed['id'] === authConnectId) {
        if (!parsed['ok']) {
          console.error(`[WsProxy] #${id} Auth REJECTED:`, JSON.stringify(parsed['error']))
          if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }
          // Don't close — try raw relay instead (some gateways allow unauthenticated access)
          console.warn(`[WsProxy] #${id} Falling back to raw relay after auth rejection`)
          authDone = true
          for (const { data: qd, isBinary: qb } of clientQueue) {
            if (upstream.readyState === WebSocket.OPEN) {
              if (!qb) {
                const translated = translateRequest(qd.toString())
                upstream.send(translated ?? qd.toString())
              } else {
                upstream.send(qd, { binary: qb })
              }
            }
          }
          clientQueue.length = 0
          return
        }

        console.log(`[WsProxy] #${id} Auth OK — flushing ${clientQueue.length} queued msg(s)`)
        authDone = true
        if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }

        for (const { data: qd, isBinary: qb } of clientQueue) {
          if (upstream.readyState === WebSocket.OPEN) {
            // Translate queued messages too
            if (!qb) {
              const translated = translateRequest(qd.toString())
              upstream.send(translated ?? qd.toString())
            } else {
              upstream.send(qd, { binary: qb })
            }
          }
        }
        clientQueue.length = 0
        return
      }

      // ── Normal relay: gateway → renderer (translate responses) ───────
      if (clientWs.readyState === WebSocket.OPEN) {
        const translated = translateResponse(raw)
        clientWs.send(translated ?? raw)
      }
    })

    upstream.on('close', (code: number, reason: Buffer) => {
      if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }
      console.log(`[WsProxy] #${id} Upstream closed code=${code} (lived ${Date.now() - t0}ms)`)
      if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
        try { clientWs.close(code, reason) } catch { clientWs.terminate() }
      }
    })

    clientWs.on('close', (code: number, reason: Buffer) => {
      // Clear auth timeout to prevent leaked timer firing after disconnect
      if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }
      console.log(`[WsProxy] #${id} Client disconnected code=${code}`)
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        try { upstream.close(code, reason) } catch { upstream.terminate() }
      }
    })

    // ── Renderer → gateway (translate requests) ─────────────────────────
    clientWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (!authDone) {
        clientQueue.push({ data, isBinary })
        return
      }
      if (upstream.readyState === WebSocket.OPEN) {
        if (!isBinary) {
          const translated = translateRequest(data.toString())
          upstream.send(translated ?? data.toString())
        } else {
          upstream.send(data, { binary: isBinary })
        }
      }
    })

    clientWs.on('error', (err: Error) => { console.error(`[WsProxy] #${id} Client err:`, err.message); try { upstream.terminate() } catch { /* already closed */ } })
    upstream.on('error', (err: Error) => { console.error(`[WsProxy] #${id} Upstream err:`, err.message); try { clientWs.terminate() } catch { /* already closed */ } })
  })

  wss.on('error', (err: Error) => { console.error('[WsProxy] Server error:', err) })
}

export function stopWsProxy(): void {
  if (wss) { wss.close(); wss = null; console.log('[WsProxy] Stopped') }
}
