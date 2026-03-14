/**
 * OpenClaw Auth Profiles Writer
 *
 * Bridges Nyra's provider settings → OpenClaw's native auth system.
 *
 * OpenClaw reads provider credentials from:
 *   ~/.openclaw/agents/main/agent/auth-profiles.json
 *
 * Format (per the EasyClaw reference implementation):
 * {
 *   "openai-codex:default": {
 *     "type": "api-key",
 *     "key": "sk-...",
 *     "model": "openai-codex/gpt-4o"
 *   },
 *   "anthropic:default": {
 *     "type": "api-key",
 *     "key": "sk-ant-...",
 *     "model": "anthropic/claude-sonnet-4-6"
 *   },
 *   "github-copilot:github": {
 *     "type": "oauth-token",
 *     "accessToken": "ghu_...",
 *     "refreshToken": "ghr_...",
 *     "expiresAt": 1710000000
 *   }
 * }
 *
 * Model IDs use OpenClaw's "provider/model" format throughout.
 *
 * OpenClaw rereads this file every LLM turn, so no gateway restart needed.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ── OpenClaw auth-profile types ─────────────────────────────────────────────

export interface ApiKeyProfile {
  type: 'api-key'
  key: string
  model?: string
}

export interface OAuthTokenProfile {
  type: 'oauth-token'
  accessToken: string
  refreshToken?: string
  expiresAt?: number  // Unix epoch seconds
}

export type AuthProfile = ApiKeyProfile | OAuthTokenProfile

// ── Map Nyra provider IDs to OpenClaw provider identifiers ──────────────────

const PROVIDER_MAP: Record<string, string> = {
  'openai':    'openai-codex:default',
  'anthropic': 'anthropic:default',
  'gemini':    'google-gemini:default',
  'copilot':   'github-copilot:github',
}

// ── Paths ────────────────────────────────────────────────────────────────────

const OPENCLAW_HOME = path.join(os.homedir(), '.openclaw')
const AGENT_DIR     = path.join(OPENCLAW_HOME, 'agents', 'main', 'agent')
const AUTH_PROFILES = path.join(AGENT_DIR, 'auth-profiles.json')
const GATEWAY_CONFIG_DIR = path.join(OPENCLAW_HOME, 'gateway')
const GATEWAY_CONFIG = path.join(GATEWAY_CONFIG_DIR, 'config.yml')

export function getAuthProfilesPath(): string {
  return AUTH_PROFILES
}

// ── Read / Write ─────────────────────────────────────────────────────────────

export function readAuthProfiles(): Record<string, AuthProfile> {
  try {
    if (!fs.existsSync(AUTH_PROFILES)) return {}
    return JSON.parse(fs.readFileSync(AUTH_PROFILES, 'utf8'))
  } catch (err) {
    console.warn('[AuthProfiles] Failed to read:', err)
    return {}
  }
}

function writeAuthProfiles(profiles: Record<string, AuthProfile>): void {
  // Ensure the directory tree exists with restrictive permissions
  fs.mkdirSync(AGENT_DIR, { recursive: true, mode: 0o700 })
  // Write with owner-only permissions (0600) — this file contains API keys
  fs.writeFileSync(AUTH_PROFILES, JSON.stringify(profiles, null, 2), { encoding: 'utf8', mode: 0o600 })
  console.log('[AuthProfiles] Written to', AUTH_PROFILES, '—', Object.keys(profiles).length, 'profile(s)')
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Write an API key for a provider into OpenClaw's auth-profiles.
 * This is the "write-through" — Nyra saves the key locally AND pushes
 * it to OpenClaw so the gateway can use it on the next message send.
 */
export function syncProviderKey(nyraProviderId: string, apiKey: string, model?: string): void {
  const openclawId = PROVIDER_MAP[nyraProviderId]
  if (!openclawId) {
    console.warn(`[AuthProfiles] Unknown provider mapping for "${nyraProviderId}"`)
    return
  }

  const profiles = readAuthProfiles()
  profiles[openclawId] = {
    type: 'api-key',
    key: apiKey,
    ...(model ? { model } : {}),
  }
  writeAuthProfiles(profiles)
}

/**
 * Write an OAuth token (from PKCE flow) into OpenClaw's auth-profiles.
 */
export function syncOAuthToken(
  nyraProviderId: string,
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number
): void {
  const openclawId = PROVIDER_MAP[nyraProviderId]
  if (!openclawId) return

  const profiles = readAuthProfiles()
  profiles[openclawId] = {
    type: 'oauth-token',
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  }
  writeAuthProfiles(profiles)
}

/**
 * Remove a provider from OpenClaw's auth-profiles (when user disconnects).
 */
export function removeProviderProfile(nyraProviderId: string): void {
  const openclawId = PROVIDER_MAP[nyraProviderId]
  if (!openclawId) return

  const profiles = readAuthProfiles()
  delete profiles[openclawId]
  writeAuthProfiles(profiles)
}

/**
 * Bulk-sync all Nyra providers into OpenClaw's auth-profiles.
 * Called on app startup to ensure the auth-profiles file reflects
 * what's stored in Nyra's encrypted keychain.
 */
export function syncAllProviders(
  loadKey: (providerId: string) => string | null,
  getActiveModel: (providerId: string) => string | undefined
): void {
  const profiles = readAuthProfiles()
  let changed = false

  for (const [nyraId, openclawId] of Object.entries(PROVIDER_MAP)) {
    const key = loadKey(nyraId)
    if (key) {
      const model = getActiveModel(nyraId)
      profiles[openclawId] = { type: 'api-key', key, ...(model ? { model } : {}) }
      changed = true
    } else if (profiles[openclawId]) {
      // Key was removed from Nyra but still in auth-profiles — remove it
      delete profiles[openclawId]
      changed = true
    }
  }

  if (changed) {
    writeAuthProfiles(profiles)
  }
}

/**
 * Read back any OAuth tokens from auth-profiles (e.g. after OpenClaw
 * refreshed them during a session) so Nyra can persist them to keychain.
 */
export function readRefreshedTokens(): Array<{
  nyraProviderId: string
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}> {
  const profiles = readAuthProfiles()
  const results: Array<{
    nyraProviderId: string
    accessToken: string
    refreshToken?: string
    expiresAt?: number
  }> = []

  for (const [nyraId, openclawId] of Object.entries(PROVIDER_MAP)) {
    const profile = profiles[openclawId]
    if (profile?.type === 'oauth-token') {
      results.push({
        nyraProviderId: nyraId,
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
        expiresAt: profile.expiresAt,
      })
    }
  }
  return results
}

// ── Gateway config writer ────────────────────────────────────────────────────

/**
 * Ensure a minimal gateway config.yml exists so OpenClaw knows where to look.
 * EasyClaw generates this; we do the same.
 */
export function ensureGatewayConfig(): void {
  if (fs.existsSync(GATEWAY_CONFIG)) return

  fs.mkdirSync(GATEWAY_CONFIG_DIR, { recursive: true })
  const yaml = [
    '# Auto-generated by Nyra Desktop',
    'host: 127.0.0.1',
    'port: 18789',
    'agent: main',
    '',
  ].join('\n')
  fs.writeFileSync(GATEWAY_CONFIG, yaml, 'utf8')
  console.log('[AuthProfiles] Created gateway config at', GATEWAY_CONFIG)
}

/**
 * Build env vars to inject into the gateway process.
 * EasyClaw injects secrets as OPENCLAW_<PROVIDER>_API_KEY so the gateway
 * can read them from the environment as a fallback.
 */
export function buildGatewayEnvSecrets(
  loadKey: (providerId: string) => string | null
): Record<string, string> {
  const env: Record<string, string> = {}

  const key_openai = loadKey('openai')
  if (key_openai) env['OPENAI_API_KEY'] = key_openai

  const key_anthropic = loadKey('anthropic')
  if (key_anthropic) env['ANTHROPIC_API_KEY'] = key_anthropic

  const key_gemini = loadKey('gemini')
  if (key_gemini) env['GOOGLE_API_KEY'] = key_gemini

  const key_copilot = loadKey('copilot')
  if (key_copilot) env['GITHUB_TOKEN'] = key_copilot

  // OpenClaw-specific paths
  env['OPENCLAW_CONFIG_PATH'] = GATEWAY_CONFIG
  env['OPENCLAW_STATE_DIR'] = OPENCLAW_HOME

  return env
}
