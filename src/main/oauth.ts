/**
 * OAuth Orchestrator — EasyClaw-parity three-step pattern
 *
 * This module coordinates OAuth flows for all providers using a uniform
 * three-step pattern matching EasyClaw's architecture:
 *
 *   Step 1: acquire — Provider-specific token acquisition
 *     • OpenAI:  PKCE flow via oauth-openai.ts (matches pi-ai/EasyClaw)
 *     • Gemini:  Google OAuth2 via oauth-gemini.ts (CLI credential extraction)
 *     • Copilot: GitHub device flow (enter code on github.com/login/device)
 *     • Anthropic: Manual API key only (no consumer OAuth available)
 *
 *   Step 2: validate — Confirm the token actually works (with retry)
 *     • OpenAI:  GET /v1/models (200 = valid)
 *     • Gemini:  GET /oauth2/v3/userinfo (200 = valid)
 *     • Copilot: GET /user (200 = valid)
 *
 *   Step 3: save — Persist to keychain + bridge to OpenClaw
 *     • saveApiKey() → Electron safeStorage (encrypted on disk)
 *     • syncOAuthToken() → ~/.openclaw/agents/main/agent/auth-profiles.json
 *
 * OpenClaw rereads auth-profiles.json every LLM turn, so no restart needed.
 *
 * Concurrency: Only one OAuth flow at a time (flow mutex from oauth-shared.ts).
 * All browser-based flows share port 8085, so concurrent flows would collide.
 */

import { BrowserWindow, shell } from 'electron'
import { saveApiKey } from './providers'
import { syncOAuthToken } from './auth-profiles'
import { acquireCodexOAuthToken, validateCodexAccessToken } from './oauth-openai'
import { acquireGeminiOAuthToken, validateGeminiAccessToken, isGeminiCliAvailable } from './oauth-gemini'
import {
  acquireFlowLock, releaseFlowLock, getActiveFlow,
  validateWithRetry,
} from './oauth-shared'

// ── Result type ──────────────────────────────────────────────────────────────

export interface OAuthResult {
  success: boolean
  providerId: string
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  error?: string
  warning?: string  // non-fatal warnings (e.g. Gemini provisioning)
}

// ── Main OAuth Flow Dispatcher ───────────────────────────────────────────────

/**
 * Start an OAuth flow for the given provider.
 * Routes to the appropriate vendor-specific implementation.
 *
 * Only one flow runs at a time — the flow mutex prevents port conflicts.
 */
export async function startOAuthFlow(
  providerId: string,
  mainWindow: BrowserWindow
): Promise<OAuthResult> {
  console.log(`[OAuth] Starting OAuth flow for provider: ${providerId}`)

  // Check flow mutex — reject if another flow is already running
  const activeProvider = getActiveFlow()
  if (activeProvider) {
    return {
      success: false,
      providerId,
      error: `Another OAuth flow (${activeProvider}) is already in progress. Please wait for it to complete.`,
    }
  }

  // Acquire flow lock (cancel callback is a no-op; cleanup happens in finally)
  if (!acquireFlowLock(providerId, () => {})) {
    return {
      success: false,
      providerId,
      error: 'Could not acquire OAuth flow lock. Please try again.',
    }
  }

  try {
    switch (providerId) {
      case 'openai':
        return await runOpenAIFlow(mainWindow)
      case 'gemini':
        return await runGeminiFlow(mainWindow)
      case 'copilot':
        return await startGitHubDeviceFlow(mainWindow)
      default:
        return {
          success: false,
          providerId,
          error: `No OAuth flow available for provider "${providerId}". Use manual API key entry.`,
        }
    }
  } catch (err) {
    console.error(`[OAuth] Flow failed for ${providerId}:`, err)
    return {
      success: false,
      providerId,
      error: String(err),
    }
  } finally {
    // Always release the mutex, even on error
    releaseFlowLock()
  }
}

// ── OpenAI Flow (three-step) ─────────────────────────────────────────────────

async function runOpenAIFlow(mainWindow: BrowserWindow): Promise<OAuthResult> {
  // Step 1: Acquire
  console.log('[OAuth/OpenAI] Step 1: Acquiring token via PKCE...')
  const tokens = await acquireCodexOAuthToken()

  // Step 2: Validate (with retry — token propagation can lag)
  console.log('[OAuth/OpenAI] Step 2: Validating token...')
  const valid = await validateWithRetry(() => validateCodexAccessToken(tokens.accessToken))
  if (!valid) {
    return {
      success: false,
      providerId: 'openai',
      error: 'Token acquired but failed validation against /v1/models. The token may lack API access.',
    }
  }

  // Step 3: Save
  console.log('[OAuth/OpenAI] Step 3: Saving credentials...')
  const saved = saveApiKey('openai', tokens.accessToken)
  if (!saved) {
    return {
      success: false,
      providerId: 'openai',
      error: 'Token acquired and validated, but failed to save to keychain. Is system encryption available?',
    }
  }
  syncOAuthToken(
    'openai',
    tokens.accessToken,
    tokens.refreshToken,
    tokens.expiresIn ? Math.floor(Date.now() / 1000) + tokens.expiresIn : undefined
  )

  // Notify renderer
  notifyRenderer(mainWindow, 'openai', true)

  console.log('[OAuth/OpenAI] Flow complete — token saved to keychain + auth-profiles')
  return {
    success: true,
    providerId: 'openai',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
  }
}

// ── Gemini Flow (three-step) ─────────────────────────────────────────────────

async function runGeminiFlow(mainWindow: BrowserWindow): Promise<OAuthResult> {
  // Step 1: Acquire (uses CLI credentials if available, else built-in fallback)
  console.log('[OAuth/Gemini] Step 1: Acquiring token via Google OAuth2...')
  const tokens = await acquireGeminiOAuthToken()

  // Step 2: Validate (with retry)
  console.log('[OAuth/Gemini] Step 2: Validating token...')
  const valid = await validateWithRetry(() => validateGeminiAccessToken(tokens.accessToken))
  if (!valid) {
    return {
      success: false,
      providerId: 'gemini',
      error: 'Token acquired but failed validation. Please try again.',
    }
  }

  // Step 3: Save
  console.log('[OAuth/Gemini] Step 3: Saving credentials...')
  const saved = saveApiKey('gemini', tokens.accessToken)
  if (!saved) {
    return {
      success: false,
      providerId: 'gemini',
      error: 'Token acquired and validated, but failed to save to keychain. Is system encryption available?',
    }
  }
  syncOAuthToken(
    'gemini',
    tokens.accessToken,
    tokens.refreshToken,
    tokens.expiresIn ? Math.floor(Date.now() / 1000) + tokens.expiresIn : undefined
  )

  notifyRenderer(mainWindow, 'gemini', true)

  console.log('[OAuth/Gemini] Flow complete — token saved to keychain + auth-profiles')
  return {
    success: true,
    providerId: 'gemini',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    // Surface provisioning warning so the UI can inform the user
    warning: tokens.provisioningWarning,
  }
}

// ── GitHub Copilot Device Flow ───────────────────────────────────────────────

/**
 * GitHub device flow for Copilot authentication.
 * User visits github.com/login/device and enters a code.
 * We poll for the token in the background.
 *
 * Note: Device flow doesn't use the shared callback port, but we still
 * hold the flow mutex to prevent UI confusion from concurrent flows.
 */
export async function startGitHubDeviceFlow(
  mainWindow: BrowserWindow
): Promise<OAuthResult> {
  const clientId = process.env.NYRA_GITHUB_CLIENT_ID ?? 'Iv1.b507a08c87ecfe98'

  try {
    // Step 1: Request device code
    console.log('[OAuth/GitHub] Step 1: Requesting device code...')
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

    if (!deviceResp.ok) {
      throw new Error(`Device code request failed: ${deviceResp.status}`)
    }

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

    // Open browser for user to enter code
    shell.openExternal(deviceData.verification_uri)

    // Step 2: Poll for token
    console.log('[OAuth/GitHub] Step 2: Polling for token...')
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

        // Step 2b: Validate (with retry)
        console.log('[OAuth/GitHub] Validating token...')
        const valid = await validateWithRetry(() => validateGitHubToken(accessToken))
        if (!valid) {
          return {
            success: false,
            providerId: 'copilot',
            error: 'Token received but failed validation against GitHub API.',
          }
        }

        // Step 3: Save
        console.log('[OAuth/GitHub] Step 3: Saving credentials...')
        const saved = saveApiKey('copilot', accessToken)
        if (!saved) {
          return {
            success: false,
            providerId: 'copilot',
            error: 'Token acquired but failed to save to keychain.',
          }
        }
        syncOAuthToken('copilot', accessToken)

        notifyRenderer(mainWindow, 'copilot', true)

        console.log('[OAuth/GitHub] Flow complete — token saved')
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

// ── GitHub Token Validation ──────────────────────────────────────────────────

async function validateGitHubToken(accessToken: string): Promise<boolean> {
  try {
    const resp = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
      },
    })
    if (resp.ok) {
      const data = await resp.json() as { login?: string }
      console.log(`[OAuth/GitHub] Token validated — user: ${data.login ?? 'unknown'}`)
      return true
    }
    console.warn(`[OAuth/GitHub] Token validation failed: ${resp.status}`)
    return false
  } catch (err) {
    console.warn('[OAuth/GitHub] Token validation error:', err)
    return false
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function notifyRenderer(mainWindow: BrowserWindow, providerId: string, success: boolean) {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('providers:oauth-complete', { providerId, success })
  }
}

// ── Provider OAuth availability ──────────────────────────────────────────────

/**
 * Check which providers support OAuth in the current environment.
 * Used by the renderer to decide whether to show "Sign in" vs "Get API key".
 */
export function getOAuthAvailability(): Record<string, boolean> {
  return {
    openai: true,                    // PKCE via official Codex public client ID
    gemini: isGeminiCliAvailable(),  // Requires Gemini CLI installed
    copilot: true,                   // Always available (device flow)
    anthropic: false,                // No consumer OAuth — API key only
  }
}
