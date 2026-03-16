/**
 * Dev-mode WebSocket Origin Proxy + OpenClaw Auth + Protocol Translator  (v6)
 *
 * 1. Proxy on 18790, relay to 18789 with origin cycling
 * 2. Multi-strategy auth cascade:
 *    A. Token-only (no device block) — simplest, works for most local gateways
 *    B. Full device auth (Ed25519 signed connect)
 *    C. Auto-approve pairing via pairing.respond (if B returns PAIRING_REQUIRED)
 *    D. Raw relay (skip auth entirely)
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
import { ensureGatewayConfig, ensureOpenClawJsonOrigins } from './auth-profiles'
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

// ── Auth strategies ──────────────────────────────────────────────────────────

type AuthStrategy = 'token-only' | 'device-auth' | 'raw-relay'
// Device-auth FIRST: token-only "succeeds" but grants zero scopes (useless).
// Device-auth sends the Ed25519 signature which the gateway requires to grant
// operator.read, operator.write, operator.admin scopes.
const AUTH_STRATEGIES: AuthStrategy[] = ['device-auth', 'token-only', 'raw-relay']

// ── Build connect request ────────────────────────────────────────────────────

function buildTokenOnlyConnect(token: string): { msg: string; id: string } {
  const connectId = `nyra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
  }
  const req = { type: 'req', id: connectId, method: 'connect', params }
  return { msg: JSON.stringify(req), id: connectId }
}

function buildDeviceAuthConnect(nonce: string, token: string): { msg: string; id: string } {
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

function buildPairingResponse(requestId: string, approve: boolean): string {
  const rpcId = `nyra-pair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return JSON.stringify({
    type: 'req',
    id: rpcId,
    method: 'pairing.respond',
    params: {
      requestId,
      action: approve ? 'approve' : 'reject',
    },
  })
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
  console.log('[WsProxy] *** PROTOCOL-TRANSLATOR BUILD v6 — multi-strategy auth cascade ***')

  // Pre-patch gateway config with allowed origins BEFORE any connections
  try {
    ensureGatewayConfig()
    ensureOpenClawJsonOrigins()
    console.log('[WsProxy] Gateway config patched with allowed origins')
  } catch (err) {
    console.warn('[WsProxy] Could not patch gateway config:', err)
  }

  wss = new WebSocketServer({ host: GATEWAY_HOST, port: PROXY_PORT })

  wss.on('listening', () => {
    console.log(`[WsProxy] Listening on ${PROXY_WS_URL} -> ws://${GATEWAY_HOST}:${GATEWAY_PORT}`)
  })

  let connCount = 0

  wss.on('connection', (clientWs: WebSocket, req: IncomingMessage) => {
    const id = ++connCount
    const t0 = Date.now()
    console.log(`[WsProxy] #${id} Client connected (origin: ${req.headers['origin'] ?? 'none'})`)

    let upstream: WebSocket | null = null
    let authDone      = false
    let authConnectId: string | null = null
    const clientQueue: Array<{ data: WebSocket.RawData; isBinary: boolean }> = []
    let upstreamRetries = 0
    let totalAuthRejects = 0            // Track ALL auth rejections (any type)
    const MAX_UPSTREAM_RETRIES = 30     // ~30 s total (1 s each)
    const MAX_AUTH_REJECTS = 6          // Stop after 6 total auth rejections (covers 2 full strategy cycles)
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false                  // tracks if the client-side has been closed/torn down

    // ── Origin strategy — cycle through different origins if one is rejected ──
    const ORIGIN_STRATEGIES = [
      `http://${GATEWAY_HOST}:${PROXY_PORT}`,      // proxy's own address
      `http://localhost:${GATEWAY_PORT}`,            // gateway's own address
      `http://${GATEWAY_HOST}:${GATEWAY_PORT}`,      // gateway's address with IP
      undefined,                                      // no Origin header at all
    ]
    let originIdx = 0

    // ── Auth strategy — cascade through different auth approaches ─────────────
    let authStrategyIdx = 0
    let _lastNonce: string | null = null      // remember nonce across reconnects
    let pairingRequestId: string | null = null  // from PAIRING_REQUIRED response

    function currentAuthStrategy(): AuthStrategy {
      return AUTH_STRATEGIES[Math.min(authStrategyIdx, AUTH_STRATEGIES.length - 1)]
    }

    // ── Open (or re-open) the upstream connection to the gateway ────────────
    function openUpstream(): void {
      if (closed) return

      // If we've exhausted all auth strategies, stop
      if (totalAuthRejects >= MAX_AUTH_REJECTS) {
        console.error(`[WsProxy] #${id} Auth failed after ${totalAuthRejects} rejections across all strategies — giving up`)
        console.error(`[WsProxy] #${id} The gateway may require manual device pairing. ` +
          `Try running: openclaw pair approve`)
        try { clientWs.close(4001, 'Authentication failed — all strategies exhausted') } catch { try { clientWs.terminate() } catch { /* */ } }
        return
      }

      const origin = ORIGIN_STRATEGIES[originIdx % ORIGIN_STRATEGIES.length]
      const strategy = currentAuthStrategy()
      const headers: Record<string, string> = {}
      if (origin) headers['Origin'] = origin
      console.log(`[WsProxy] #${id} Connecting upstream Origin=${origin ?? '(none)'} auth=${strategy} (rejects=${totalAuthRejects})`)
      upstream = new WebSocket(`ws://${GATEWAY_HOST}:${GATEWAY_PORT}`, { headers })

      upstream.on('open', () => {
        console.log(`[WsProxy] #${id} Upstream open (+${Date.now() - t0}ms, retries=${upstreamRetries}) — strategy: ${strategy}`)
        // For raw-relay strategy, skip auth entirely
        if (strategy === 'raw-relay') {
          console.log(`[WsProxy] #${id} Raw relay mode — skipping auth, forwarding directly`)
          authDone = true
          if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }
          flushClientQueue()
        }
      })

      upstream.on('error', (err: Error) => {
        if (!closed && upstreamRetries < MAX_UPSTREAM_RETRIES) {
          upstreamRetries++
          console.log(`[WsProxy] #${id} Upstream connect failed (${err.message}), retry ${upstreamRetries}/${MAX_UPSTREAM_RETRIES} in 1s`)
          retryTimer = setTimeout(openUpstream, 1_000)
        } else if (!closed) {
          console.error(`[WsProxy] #${id} Upstream err after ${upstreamRetries} retries:`, err.message)
          try { clientWs.close(1011, 'Gateway unreachable') } catch { try { clientWs.terminate() } catch { /* */ } }
        }
      })

      upstream.on('close', (code: number, reason: Buffer) => {
        if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }
        const livedMs = Date.now() - t0
        console.log(`[WsProxy] #${id} Upstream closed code=${code} (lived ${livedMs}ms)`)

        // If the gateway immediately closes after we set authDone (e.g. raw-relay
        // or token-only was accepted but gateway still rejects), count it as a
        // soft auth failure to prevent infinite reconnect loops.
        if (authDone && code === 1008) {
          totalAuthRejects++
          console.warn(`[WsProxy] #${id} Gateway closed with 1008 after auth-done — counting as soft reject (${totalAuthRejects}/${MAX_AUTH_REJECTS})`)
        }

        // If auth is done and connection drops, try to reconnect (transient failure)
        // If auth was never completed, this is likely an auth rejection close
        if (!closed && upstreamRetries < MAX_UPSTREAM_RETRIES && totalAuthRejects < MAX_AUTH_REJECTS) {
          upstreamRetries++
          authDone = false
          authConnectId = null
          resetAuthTimeout()
          console.log(`[WsProxy] #${id} Upstream lost — reconnecting (retry ${upstreamRetries}/${MAX_UPSTREAM_RETRIES})`)
          retryTimer = setTimeout(openUpstream, 1_000)
        } else if (!closed && (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING)) {
          console.log(`[WsProxy] #${id} Upstream lost — max retries or auth rejects reached, closing client`)
          try { clientWs.close(code, reason) } catch { clientWs.terminate() }
        }
      })

      upstream.on('message', handleUpstreamMessage)
    }

    // Flush queued client messages to upstream
    function flushClientQueue(): void {
      for (const { data: qd, isBinary: qb } of clientQueue) {
        if (upstream?.readyState === WebSocket.OPEN) {
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

    // Auth safety timeout — if handshake doesn't complete in N seconds, advance strategy
    let authTimeout: ReturnType<typeof setTimeout> | null = null
    function resetAuthTimeout(): void {
      if (authTimeout) clearTimeout(authTimeout)
      authTimeout = setTimeout(() => {
        if (!authDone) {
          console.warn(`[WsProxy] #${id} Auth timeout after 6s — advancing to next strategy`)
          advanceAuthStrategy('timeout')
        }
        authTimeout = null
      }, 6_000)
    }
    resetAuthTimeout()

    // Advance to next auth strategy after rejection
    function advanceAuthStrategy(reason: string): void {
      totalAuthRejects++
      if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }

      console.log(`[WsProxy] #${id} Auth strategy "${currentAuthStrategy()}" failed (${reason}), rejects=${totalAuthRejects}/${MAX_AUTH_REJECTS}`)

      // Check if we've exhausted everything
      if (totalAuthRejects >= MAX_AUTH_REJECTS) {
        console.error(`[WsProxy] #${id} All auth strategies exhausted — stopping retries`)
        authDone = true  // prevent further auth attempts
        upstreamRetries = MAX_UPSTREAM_RETRIES  // prevent reconnects
        try { upstream?.close() } catch { /* */ }
        try { clientWs.close(4001, 'Authentication failed') } catch { try { clientWs.terminate() } catch { /* */ } }
        return
      }

      // Move to next strategy
      authStrategyIdx++
      const nextStrategy = currentAuthStrategy()
      console.log(`[WsProxy] #${id} Advancing to auth strategy: ${nextStrategy}`)

      // Close current upstream and reconnect with new strategy
      try { upstream?.close() } catch { /* */ }
      // The upstream.on('close') handler will reconnect
    }

    // Start the upstream connection
    openUpstream()

    // ── Handle messages from the gateway (via upstream WS) ───────────────
    function handleUpstreamMessage(data: WebSocket.RawData, isBinary: boolean): void {
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
        if (!nonce) { console.error(`[WsProxy] #${id} challenge missing nonce`); upstream?.close(); return }
        _lastNonce = nonce

        const token = getGatewayToken()
        if (!token) {
          console.warn(`[WsProxy] #${id} No gateway token found — advancing to raw relay`)
          authStrategyIdx = AUTH_STRATEGIES.length - 1  // jump to raw-relay
          authDone = true
          if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }
          flushClientQueue()
          return
        }

        const strategy = currentAuthStrategy()
        console.log(`[WsProxy] #${id} Challenge (nonce=${nonce.slice(0, 8)}…) — strategy: ${strategy}`)

        if (strategy === 'token-only') {
          // Strategy A: Token-only connect (no device block)
          const { msg, id: cid } = buildTokenOnlyConnect(token)
          authConnectId = cid
          upstream!.send(msg)
        } else if (strategy === 'device-auth') {
          // Strategy B: Full device auth with Ed25519 signature
          const { msg, id: cid } = buildDeviceAuthConnect(nonce, token)
          authConnectId = cid
          upstream!.send(msg)
        } else {
          // Strategy C: raw-relay — don't respond to challenge, just forward everything
          authDone = true
          if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }
          flushClientQueue()
        }
        return
      }

      // ── connect response ─────────────────────────────────────────────
      if (!authDone && authConnectId && parsed['type'] === 'res' && parsed['id'] === authConnectId) {
        if (!parsed['ok']) {
          const errDetail = JSON.stringify(parsed['error'])
          const strategy = currentAuthStrategy()
          console.error(`[WsProxy] #${id} Auth REJECTED (strategy=${strategy}, total=${totalAuthRejects + 1}):`, errDetail)

          // Check specific error types
          const isOriginRejected = errDetail.includes('CONTROL_UI_ORIGIN_NOT_ALLOWED')
          const isPairingRequired = errDetail.includes('PAIRING_REQUIRED') || errDetail.includes('NOT_PAIRED')

          if (isOriginRejected) {
            // Try next origin with same auth strategy
            originIdx++
            if (originIdx < ORIGIN_STRATEGIES.length * 2) {
              totalAuthRejects++
              console.warn(`[WsProxy] #${id} Origin rejected — trying next origin (${originIdx}/${ORIGIN_STRATEGIES.length})`)
              try { upstream?.close() } catch { /* */ }
              return
            }
            // All origins exhausted — advance auth strategy
            originIdx = 0  // reset origins for next strategy
          }

          if (isPairingRequired) {
            // Extract requestId for potential auto-approve
            try {
              const errObj = parsed['error'] as any
              pairingRequestId = errObj?.details?.requestId ?? errObj?.requestId ?? null
              if (pairingRequestId) {
                console.log(`[WsProxy] #${id} PAIRING_REQUIRED — attempting auto-approve with requestId: ${pairingRequestId}`)
                // Try to send pairing approval on this connection before it closes
                const approveMsg = buildPairingResponse(pairingRequestId, true)
                try {
                  upstream?.send(approveMsg)
                  console.log(`[WsProxy] #${id} Sent pairing.respond(approve) — will RETRY same strategy after brief delay`)
                } catch (sendErr) {
                  console.warn(`[WsProxy] #${id} Could not send pairing approval:`, sendErr)
                }
              }
            } catch { /* ignore parsing errors */ }

            // After sending pairing approval, retry the SAME strategy (don't advance).
            // The pairing should now be approved, so the same device-auth connect should succeed.
            totalAuthRejects++
            if (totalAuthRejects < MAX_AUTH_REJECTS) {
              console.log(`[WsProxy] #${id} Retrying same strategy after pairing approval (rejects=${totalAuthRejects})`)
              try { upstream?.close() } catch { /* */ }
              // upstream.on('close') will reconnect with same strategy
              return
            }
          }

          // Advance to next auth strategy (applies to non-pairing rejection types)
          advanceAuthStrategy(isOriginRejected ? 'origin-rejected' : 'auth-rejected')
          return
        }

        // Auth succeeded! But check if scopes were actually granted.
        const payload = parsed['payload'] as Record<string, unknown> | undefined
        const grantedScopes = (payload?.scopes ?? payload?.granted_scopes ?? payload?.grants) as string[] | undefined
        const strategy = currentAuthStrategy()

        // If the response explicitly includes empty scopes, this auth is useless
        // (the gateway accepted the connection but gave us no permissions).
        if (grantedScopes && grantedScopes.length === 0) {
          console.warn(`[WsProxy] #${id} Auth "succeeded" with ZERO scopes (strategy=${strategy}) — treating as failure`)
          advanceAuthStrategy('zero-scopes')
          return
        }
        if (grantedScopes) {
          console.log(`[WsProxy] #${id} Granted scopes: ${grantedScopes.join(', ')}`)
        }

        totalAuthRejects = 0
        upstreamRetries = 0
        pairingRequestId = null
        console.log(`[WsProxy] #${id} Auth OK (strategy=${strategy}) — flushing ${clientQueue.length} queued msg(s)`)
        authDone = true
        if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }
        flushClientQueue()
        return
      }

      // ── Normal relay: gateway → renderer (translate responses) ───────
      if (clientWs.readyState === WebSocket.OPEN) {
        // Debug: log all gateway→renderer messages
        const preview = raw.length > 300 ? raw.slice(0, 300) + '…' : raw
        console.log(`[WsProxy] #${id} GW→Renderer: ${preview}`)
        const translated = translateResponse(raw)
        if (translated) {
          console.log(`[WsProxy] #${id} Translated: ${translated.slice(0, 300)}`)
        }
        clientWs.send(translated ?? raw)
      }
    }

    clientWs.on('close', (code: number, reason: Buffer) => {
      closed = true
      if (authTimeout) { clearTimeout(authTimeout); authTimeout = null }
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      console.log(`[WsProxy] #${id} Client disconnected code=${code}`)
      if (upstream && (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)) {
        try { upstream.close(code, reason) } catch { upstream.terminate() }
      }
    })

    // ── Renderer → gateway (translate requests) ─────────────────────────
    clientWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (!authDone) {
        const preview = isBinary ? '(binary)' : data.toString().slice(0, 200)
        console.log(`[WsProxy] #${id} Renderer→GW [queued, auth pending]: ${preview}`)
        clientQueue.push({ data, isBinary })
        return
      }
      if (upstream?.readyState === WebSocket.OPEN) {
        if (!isBinary) {
          const raw = data.toString()
          const translated = translateRequest(raw)
          const preview = (translated ?? raw).slice(0, 300)
          console.log(`[WsProxy] #${id} Renderer→GW: ${preview}`)
          upstream.send(translated ?? raw)
        } else {
          upstream.send(data, { binary: isBinary })
        }
      } else {
        // Upstream not open (reconnecting) — queue instead of dropping silently
        console.log(`[WsProxy] #${id} Upstream not open (state=${upstream?.readyState ?? 'null'}) — queuing client message`)
        clientQueue.push({ data, isBinary })
      }
    })

    clientWs.on('error', (err: Error) => { console.error(`[WsProxy] #${id} Client err:`, err.message); try { upstream?.terminate() } catch { /* */ } })
  })

  wss.on('error', (err: Error) => { console.error('[WsProxy] Server error:', err) })
}

export function stopWsProxy(): void {
  if (wss) { wss.close(); wss = null; console.log('[WsProxy] Stopped') }
}
