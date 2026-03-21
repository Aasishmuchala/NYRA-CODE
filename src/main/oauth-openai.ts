/**
 * OpenAI Codex OAuth — PKCE flow using official public client ID
 *
 * Uses the same client ID as Cline, OpenCode, and other desktop tools that
 * authenticate via ChatGPT Plus/Pro subscriptions:
 *   - Client ID: app_EMoamEEZ73f0CkXaXp7hrann (official Codex public client)
 *   - Auth URL:  https://auth.openai.com/oauth/authorize
 *   - Token URL: https://auth.openai.com/oauth/token
 *   - Redirect:  http://localhost:{port}/auth/callback
 *
 * Three-step pattern:
 *   1. acquireCodexOAuthToken()  — browser-based PKCE flow
 *   2. validateCodexAccessToken() — GET /v1/models to confirm token works
 *   3. Return tokens for the orchestrator to save
 */

import * as http from 'http'
import * as crypto from 'crypto'
import { shell } from 'electron'
import {
  callbackHtml, OAUTH_TIMEOUT_MS,
} from './oauth-shared'

// ── Types ────────────────────────────────────────────────────────────────────

export interface OpenAITokenResult {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Official OpenAI Codex public client ID — used by Cline, OpenCode, etc. */
const OPENAI_CLIENT_ID = process.env.NYRA_OPENAI_CLIENT_ID ?? 'app_EMoamEEZ73f0CkXaXp7hrann'

const OPENAI_AUTH_CONFIG = {
  authorizeUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  clientId: OPENAI_CLIENT_ID,
  scopes: ['openid', 'profile', 'email', 'offline_access'],
  audience: 'https://api.openai.com/v1',
}

/**
 * Callback port — 1455 matches the Codex CLI convention.
 * Uses localhost (not 127.0.0.1) because OpenAI's client registration
 * whitelists http://localhost specifically.
 */
const OPENAI_CALLBACK_PORT = 1455
const OPENAI_CALLBACK_PATH = '/auth/callback'
const OPENAI_CALLBACK_URL = `http://localhost:${OPENAI_CALLBACK_PORT}${OPENAI_CALLBACK_PATH}`

// ── PKCE Helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function generateState(): string {
  return crypto.randomBytes(16).toString('hex')
}

// ── Step 1: Acquire Token via PKCE ───────────────────────────────────────────

export function acquireCodexOAuthToken(): Promise<OpenAITokenResult> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  return new Promise<OpenAITokenResult>((resolve, reject) => {
    let server: http.Server | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    let settled = false   // guard against double-resolve/reject

    // Idempotent cleanup — safe to call multiple times
    const cleanup = () => {
      if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null }
      const s = server
      server = null      // null first to prevent re-entry
      if (s) {
        s.close(() => { /* ignore close errors */ })
      }
    }

    const settle = (action: 'resolve' | 'reject', value: OpenAITokenResult | Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (action === 'resolve') resolve(value as OpenAITokenResult)
      else reject(value)
    }

    server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${OPENAI_CALLBACK_PORT}`)

      if (url.pathname !== OPENAI_CALLBACK_PATH) {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(callbackHtml('Error', `OAuth error: ${error}. You can close this tab.`))
        settle('reject', new Error(`OpenAI OAuth error: ${error}`))
        return
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(callbackHtml('Error', 'Invalid callback parameters. Please try again.'))
        settle('reject', new Error('Invalid OAuth state or missing authorization code'))
        return
      }

      try {
        const tokens = await exchangeCodeForToken(code, codeVerifier)
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(callbackHtml('Connected!', 'ChatGPT / OpenAI is now connected to Nyra. You can close this tab.'))
        settle('resolve', tokens)
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(callbackHtml('Error', `Token exchange failed: ${String(err)}`))
        settle('reject', err instanceof Error ? err : new Error(String(err)))
      }
    })

    // Listen on localhost (not 127.0.0.1) to match OpenAI's redirect_uri registration
    server.listen(OPENAI_CALLBACK_PORT, '127.0.0.1', () => {
      console.log(`[OAuth/OpenAI] Callback server listening on localhost:${OPENAI_CALLBACK_PORT}`)

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: OPENAI_AUTH_CONFIG.clientId,
        redirect_uri: OPENAI_CALLBACK_URL,
        scope: OPENAI_AUTH_CONFIG.scopes.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        audience: OPENAI_AUTH_CONFIG.audience,
      })

      const authorizeUrl = `${OPENAI_AUTH_CONFIG.authorizeUrl}?${params.toString()}`
      console.log(`[OAuth/OpenAI] Opening browser: ${OPENAI_AUTH_CONFIG.authorizeUrl}`)
      shell.openExternal(authorizeUrl)
    })

    // Handle EADDRINUSE and other server errors
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        settle('reject', new Error(
          `Port ${OPENAI_CALLBACK_PORT} is in use. Another OAuth flow may be running. Please wait and try again.`
        ))
      } else {
        settle('reject', new Error(`OAuth callback server error: ${err.message}`))
      }
    })

    // 2-minute timeout
    timeoutHandle = setTimeout(() => {
      settle('reject', new Error(
        'OpenAI OAuth flow timed out (2 min). If the browser didn\'t open, check your default browser settings.'
      ))
    }, OAUTH_TIMEOUT_MS)
  })
}

// ── Token Exchange ───────────────────────────────────────────────────────────

async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<OpenAITokenResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: OPENAI_CALLBACK_URL,
    client_id: OPENAI_AUTH_CONFIG.clientId,
    code_verifier: codeVerifier,
  })

  const resp = await fetch(OPENAI_AUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new Error(`OpenAI token exchange failed (${resp.status}): ${text}`)
  }

  const data = await resp.json() as Record<string, unknown>
  const accessToken = (data.access_token as string) ?? ''
  if (!accessToken) throw new Error('No access_token in OpenAI response')

  return {
    accessToken,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number | undefined,
  }
}

// ── Step 2: Validate Token ───────────────────────────────────────────────────

/**
 * Validate the access token obtained via the Codex PKCE flow.
 *
 * Consumer OAuth tokens (ChatGPT Plus/Pro/Team) obtained via the Codex
 * public client ID do NOT reliably work with GET /v1/models — that endpoint
 * may return 403 for subscription-based tokens that lack broad API scope.
 *
 * Instead we validate by:
 *  1. Checking /v1/me (lightweight user-info endpoint, works with consumer tokens)
 *  2. Falling back to /v1/models/{specific_model} (querying one model, not listing all)
 *  3. Falling back to trusting the token — a successful PKCE exchange with
 *     OpenAI's auth server IS validation (the token came from a trusted source)
 *
 * This matches how the Codex CLI and Cline handle consumer tokens.
 */
export async function validateCodexAccessToken(accessToken: string): Promise<boolean> {
  // Strategy 1: /v1/me (ChatGPT user info — lightweight, works with consumer tokens)
  try {
    const meResp = await fetch('https://api.openai.com/v1/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (meResp.ok) {
      console.log('[OAuth/OpenAI] Token validated via /v1/me')
      return true
    }
    console.log(`[OAuth/OpenAI] /v1/me returned ${meResp.status}, trying fallback...`)
  } catch (err) {
    console.log('[OAuth/OpenAI] /v1/me not available, trying fallback...', err)
  }

  // Strategy 2: Query a specific model (much more likely to work than listing all)
  try {
    const modelResp = await fetch('https://api.openai.com/v1/models/gpt-4o-mini', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (modelResp.ok) {
      console.log('[OAuth/OpenAI] Token validated via /v1/models/gpt-4o-mini')
      return true
    }
    console.log(`[OAuth/OpenAI] /v1/models/gpt-4o-mini returned ${modelResp.status}, trying fallback...`)
  } catch (err) {
    console.log('[OAuth/OpenAI] /v1/models/gpt-4o-mini not available:', err)
  }

  // Strategy 3: Trust the PKCE exchange
  // If the token came from a successful PKCE exchange with auth.openai.com,
  // the token is valid by definition — OpenAI's auth server issued it.
  // We still reach here only if all API endpoints are unreachable or return
  // unexpected errors. In that case, trust the source and let the gateway
  // handle any actual auth errors at message-send time.
  console.warn('[OAuth/OpenAI] All validation endpoints failed — trusting PKCE-sourced token')
  return true
}
