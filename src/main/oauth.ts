/**
 * OAuth PKCE Flow — local browser-based sign-in for AI providers
 *
 * How it works (matching EasyClaw's pattern):
 *  1. Nyra generates a PKCE code_verifier + code_challenge
 *  2. Opens the provider's OAuth authorize URL in the user's default browser
 *  3. Starts a tiny HTTP server on 127.0.0.1:8085 to capture the callback
 *  4. On callback, exchanges the authorization code for an access token
 *  5. Stores the token via Nyra's encrypted keychain AND writes to
 *     OpenClaw's auth-profiles.json
 *
 * Supported providers:
 *  - OpenAI (ChatGPT)  — uses chatgpt.com OAuth
 *  - GitHub Copilot    — uses GitHub device flow
 *
 * Note: Anthropic and Google don't offer consumer OAuth for API access,
 * so those use manual API key entry only.
 */

import * as http from 'http'
import * as crypto from 'crypto'
import { shell, BrowserWindow } from 'electron'
import { saveApiKey } from './providers'
import { syncOAuthToken } from './auth-profiles'

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

// ── OAuth provider configs ───────────────────────────────────────────────────

const CALLBACK_PORT = 8085
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/oauth2callback`

interface OAuthProviderConfig {
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  scopes: string[]
  // Some providers need different param names
  extraAuthorizeParams?: Record<string, string>
}

/**
 * OAuth configs per provider.
 *
 * OpenAI:  Uses auth0-based OAuth at auth0.openai.com (same as ChatGPT login).
 *          Client ID must be a registered OAuth app — set NYRA_OPENAI_CLIENT_ID
 *          in your env, or the EasyClaw-compatible default is used.
 *
 * Claude:  Anthropic uses OAuth via console.anthropic.com for API access.
 *          Set NYRA_ANTHROPIC_CLIENT_ID in your env.
 *
 * GitHub:  Uses device flow (not standard PKCE) for Copilot.
 *          Set NYRA_GITHUB_CLIENT_ID in your env.
 */
const OAUTH_CONFIGS: Record<string, OAuthProviderConfig> = {
  'openai': {
    authorizeUrl: 'https://auth0.openai.com/authorize',
    tokenUrl: 'https://auth0.openai.com/oauth/token',
    clientId: process.env.NYRA_OPENAI_CLIENT_ID ?? 'pdlLIX2Y72MgS3oleaJuCouzaOB5gvzl',
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    extraAuthorizeParams: {
      audience: 'https://api.openai.com/v1',
    },
  },
  'anthropic': {
    authorizeUrl: 'https://console.anthropic.com/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/oauth/token',
    clientId: process.env.NYRA_ANTHROPIC_CLIENT_ID ?? 'nyra-desktop',
    scopes: ['api:read', 'api:write'],
  },
  'copilot': {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    clientId: process.env.NYRA_GITHUB_CLIENT_ID ?? 'Iv1.b507a08c87ecfe98',
    scopes: ['copilot', 'read:user'],
  },
}

// ── Active flow state ────────────────────────────────────────────────────────

let activeServer: http.Server | null = null
let _activeResolve: ((result: OAuthResult) => void) | null = null

export interface OAuthResult {
  success: boolean
  providerId: string
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  error?: string
}

// ── Start OAuth flow ─────────────────────────────────────────────────────────

export async function startOAuthFlow(
  providerId: string,
  mainWindow: BrowserWindow
): Promise<OAuthResult> {
  const config = OAUTH_CONFIGS[providerId]
  if (!config) {
    return { success: false, providerId, error: `No OAuth config for provider "${providerId}"` }
  }

  // Kill any previous flow
  if (activeServer) {
    activeServer.close()
    activeServer = null
  }

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  return new Promise<OAuthResult>((resolve) => {
    _activeResolve = resolve

    // Start local callback server
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${CALLBACK_PORT}`)

      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(makeCallbackHtml('Error', `OAuth error: ${error}. You can close this tab.`))
        cleanup()
        resolve({ success: false, providerId, error })
        return
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(makeCallbackHtml('Error', 'Invalid callback. Please try again.'))
        cleanup()
        resolve({ success: false, providerId, error: 'Invalid state or missing code' })
        return
      }

      // Exchange code for token
      try {
        const tokenResult = await exchangeCodeForToken(config, code, codeVerifier)

        // Save to Nyra's encrypted keychain
        if (tokenResult.accessToken) {
          saveApiKey(providerId, tokenResult.accessToken)
          // Also write as OAuth token to OpenClaw auth-profiles
          syncOAuthToken(
            providerId,
            tokenResult.accessToken,
            tokenResult.refreshToken,
            tokenResult.expiresIn
              ? Math.floor(Date.now() / 1000) + tokenResult.expiresIn
              : undefined
          )
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(makeCallbackHtml(
          'Connected!',
          `${providerId === 'openai' ? 'ChatGPT' : 'GitHub Copilot'} is now connected to Nyra. You can close this tab.`
        ))

        // Notify renderer to refresh provider list
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('providers:oauth-complete', { providerId, success: true })
        }

        cleanup()
        resolve({
          success: true,
          providerId,
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken,
          expiresIn: tokenResult.expiresIn,
        })
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(makeCallbackHtml('Error', `Token exchange failed: ${String(err)}`))
        cleanup()
        resolve({ success: false, providerId, error: String(err) })
      }
    })

    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      console.log(`[OAuth] Callback server listening on http://127.0.0.1:${CALLBACK_PORT}`)
      activeServer = server

      // Build the authorize URL
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: CALLBACK_URL,
        scope: config.scopes.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        ...(config.extraAuthorizeParams ?? {}),
      })

      const authorizeUrl = `${config.authorizeUrl}?${params.toString()}`
      console.log(`[OAuth] Opening browser for ${providerId}:`, authorizeUrl)
      shell.openExternal(authorizeUrl)
    })

    server.on('error', (err) => {
      console.error('[OAuth] Server error:', err)
      resolve({ success: false, providerId, error: `Callback server error: ${String(err)}` })
    })

    // Auto-timeout after 5 minutes
    setTimeout(() => {
      if (activeServer === server) {
        cleanup()
        resolve({ success: false, providerId, error: 'OAuth flow timed out (5 min)' })
      }
    }, 5 * 60 * 1000)
  })
}

// ── Token exchange ───────────────────────────────────────────────────────────

async function exchangeCodeForToken(
  config: OAuthProviderConfig,
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: CALLBACK_URL,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  })

  const resp = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new Error(`Token exchange ${resp.status}: ${text}`)
  }

  const data = await resp.json() as Record<string, unknown>
  const accessToken = (data.access_token as string) ?? ''
  const refreshToken = data.refresh_token as string | undefined
  const expiresIn = data.expires_in as number | undefined

  if (!accessToken) {
    throw new Error('No access_token in response')
  }

  return { accessToken, refreshToken, expiresIn }
}

// ── GitHub Device Flow (alternative for Copilot) ─────────────────────────────

export async function startGitHubDeviceFlow(
  mainWindow: BrowserWindow
): Promise<OAuthResult> {
  const clientId = process.env.NYRA_GITHUB_CLIENT_ID ?? 'nyra-desktop'

  try {
    // Step 1: Request device code
    const deviceResp = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: 'copilot read:user',
      }),
    })

    if (!deviceResp.ok) throw new Error(`Device code request failed: ${deviceResp.status}`)

    const deviceData = await deviceResp.json() as {
      device_code: string
      user_code: string
      verification_uri: string
      expires_in: number
      interval: number
    }

    // Notify renderer to show the user_code
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('providers:device-code', {
        providerId: 'copilot',
        userCode: deviceData.user_code,
        verificationUri: deviceData.verification_uri,
      })
    }

    // Open browser for the user to enter the code
    shell.openExternal(deviceData.verification_uri)

    // Step 2: Poll for token
    const pollInterval = (deviceData.interval || 5) * 1000
    const deadline = Date.now() + (deviceData.expires_in * 1000)

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, pollInterval))

      const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          device_code: deviceData.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })

      const tokenData = await tokenResp.json() as Record<string, unknown>

      if (tokenData.access_token) {
        const accessToken = tokenData.access_token as string
        saveApiKey('copilot', accessToken)
        syncOAuthToken('copilot', accessToken)

        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('providers:oauth-complete', {
            providerId: 'copilot',
            success: true,
          })
        }

        return { success: true, providerId: 'copilot', accessToken }
      }

      if (tokenData.error === 'slow_down') {
        await new Promise(r => setTimeout(r, 5000))
      } else if (tokenData.error === 'authorization_pending') {
        // Keep polling
      } else if (tokenData.error) {
        return {
          success: false,
          providerId: 'copilot',
          error: `GitHub: ${tokenData.error_description ?? tokenData.error}`,
        }
      }
    }

    return { success: false, providerId: 'copilot', error: 'Device flow timed out' }
  } catch (err) {
    return { success: false, providerId: 'copilot', error: String(err) }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function cleanup() {
  if (activeServer) {
    activeServer.close()
    activeServer = null
  }
  if (_activeResolve) {
    _activeResolve({ success: false, providerId: '', error: 'OAuth flow cancelled' })
    _activeResolve = null
  }
}

function makeCallbackHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Nyra — ${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
      background: #0c0c0c; color: #e0e0e0;
    }
    .card {
      text-align: center; padding: 48px;
      background: #1a1a1a; border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.06);
      max-width: 400px;
    }
    h1 { font-size: 24px; margin-bottom: 12px; }
    p { color: #888; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
}
