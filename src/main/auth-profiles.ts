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

// NOTE: OpenClaw uses "api_key" (underscore) and "oauth" (no suffix) internally.
// Previous Nyra code used "api-key" (hyphen) and "oauth-token" — we accept both
// on read but always write the correct OpenClaw format.

export interface ApiKeyProfile {
  type: 'api_key' | 'api-key'
  provider?: string
  key: string
  model?: string
  metadata?: Record<string, string>
}

export interface OAuthTokenProfile {
  type: 'oauth' | 'oauth-token'
  provider?: string
  clientId?: string
  accessToken: string
  refreshToken?: string
  expiresAt?: number  // Unix epoch seconds
  email?: string
}

export type AuthProfile = ApiKeyProfile | OAuthTokenProfile

// ── Map Nyra provider IDs to OpenClaw provider identifiers ──────────────────

const PROVIDER_MAP: Record<string, string> = {
  // Short UI IDs (used by ModelSelector and app logic)
  'openai':         'openai-codex:default',
  'anthropic':      'anthropic:default',
  'gemini':         'google-gemini:default',
  'copilot':        'github-copilot:github',
  'openrouter':     'openrouter:default',
  'ollama':         'ollama:default',
  // OpenClaw-format prefixes (used by PROVIDER_CATALOG model IDs, e.g. "google-gemini/...")
  // These arrive when setActiveModel is called with catalog IDs from SettingsPanel
  'openai-codex':   'openai-codex:default',
  'google-gemini':  'google-gemini:default',
  'github-copilot': 'github-copilot:github',
}

// ── Map UI model prefixes → OpenClaw model prefixes ─────────────────────────
// The ModelSelector uses short prefixes (e.g. "openai/gpt-5.4") but OpenClaw
// auth-profiles expects the full provider plugin ID (e.g. "openai-codex/gpt-5.4").
const MODEL_PREFIX_MAP: Record<string, string> = {
  'openai':     'openai-codex',
  'anthropic':  'anthropic',
  'gemini':     'google-gemini',
  'copilot':    'github-copilot',
  'openrouter': 'openrouter',
  'ollama':     'ollama',
}

/**
 * Translate a UI-facing model ID into an OpenClaw-compatible model ID.
 * e.g. "openai/gpt-5.4" → "openai-codex/gpt-5.4"
 *      "copilot/claude-sonnet-4.6" → "github-copilot/claude-sonnet-4.6"
 *      "anthropic/claude-opus-4-6" → "anthropic/claude-opus-4-6" (no change)
 *
 * If the model ID already uses the OpenClaw prefix (e.g. from PROVIDER_CATALOG),
 * it passes through unchanged.
 */
export function toOpenClawModelId(uiModelId: string): string {
  const slashIdx = uiModelId.indexOf('/')
  if (slashIdx === -1) return uiModelId

  const prefix = uiModelId.slice(0, slashIdx)
  const rest = uiModelId.slice(slashIdx + 1)

  // If this prefix is in our mapping table, translate it
  const openclawPrefix = MODEL_PREFIX_MAP[prefix]
  if (openclawPrefix && openclawPrefix !== prefix) {
    return `${openclawPrefix}/${rest}`
  }

  // OpenRouter models may have triple-segment IDs (openrouter/anthropic/claude-...)
  // These are already in the correct format
  return uiModelId
}

// ── Paths ────────────────────────────────────────────────────────────────────

const OPENCLAW_HOME = path.join(os.homedir(), '.openclaw')
const AGENT_DIR     = path.join(OPENCLAW_HOME, 'agents', 'main', 'agent')
const AUTH_PROFILES = path.join(AGENT_DIR, 'auth-profiles.json')
const GATEWAY_CONFIG_DIR = path.join(OPENCLAW_HOME, 'gateway')
const GATEWAY_CONFIG = path.join(GATEWAY_CONFIG_DIR, 'config.yml')
const DEVICES_DIR   = path.join(OPENCLAW_HOME, 'devices')
const PAIRED_JSON   = path.join(DEVICES_DIR, 'paired.json')
const PENDING_JSON  = path.join(DEVICES_DIR, 'pending.json')

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
    type: 'api_key',       // OpenClaw uses underscore format, NOT hyphenated "api-key"
    provider: nyraProviderId,
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
    type: 'oauth',           // OpenClaw uses "oauth", NOT "oauth-token"
    provider: nyraProviderId,
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
    // Skip Ollama — it's managed separately via syncOllamaToOpenClaw()
    if (nyraId === 'ollama') continue

    const key = loadKey(nyraId)
    if (key) {
      const model = getActiveModel(nyraId)
      const existingProfile = profiles[openclawId]

      // CRITICAL: Don't overwrite OAuth profiles with api_key type!
      // If the existing profile is an OAuth token, preserve its type and just update
      // the access token (in case it was refreshed in keychain).
      if (existingProfile && (existingProfile.type === 'oauth' || existingProfile.type === 'oauth-token')) {
        // Update the access token but keep the OAuth type
        ;(existingProfile as OAuthTokenProfile).accessToken = key
        if (model) (existingProfile as any).model = model
        changed = true
      } else {
        // Regular API key provider
        profiles[openclawId] = { type: 'api_key', provider: nyraId, key, ...(model ? { model } : {}) }
        changed = true
      }
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
    // Accept both "oauth" (OpenClaw native) and "oauth-token" (legacy Nyra format)
    if (profile?.type === 'oauth' || profile?.type === 'oauth-token') {
      results.push({
        nyraProviderId: nyraId,
        accessToken: (profile as OAuthTokenProfile).accessToken,
        refreshToken: (profile as OAuthTokenProfile).refreshToken,
        expiresAt: (profile as OAuthTokenProfile).expiresAt,
      })
    }
  }
  return results
}

// ── Token Refresh Sync-Back ──────────────────────────────────────────────────

/**
 * Sync-back refreshed tokens from auth-profiles.json into Nyra's keychain.
 *
 * OpenClaw may refresh OAuth tokens during a session (e.g. when an access_token
 * expires and the gateway uses the refresh_token to get a new one). The updated
 * tokens are written back to auth-profiles.json. On app shutdown, Nyra reads
 * these back and persists them to the encrypted keychain so they survive restarts.
 *
 * This matches EasyClaw's pattern of reading refreshed tokens on shutdown.
 */
export function syncBackRefreshedTokens(
  saveKey: (providerId: string, key: string) => boolean
): number {
  const refreshed = readRefreshedTokens()
  let count = 0

  for (const token of refreshed) {
    // Only sync back if the token is different from what we have
    // (we can't easily check without decrypting, so just always save)
    const saved = saveKey(token.nyraProviderId, token.accessToken)
    if (saved) {
      count++
      console.log(`[AuthProfiles] Synced back refreshed token for ${token.nyraProviderId}`)
    }
  }

  if (count > 0) {
    console.log(`[AuthProfiles] Synced back ${count} refreshed token(s) to keychain`)
  }
  return count
}

// ── Gateway config writer ────────────────────────────────────────────────────

/**
 * Ensure a minimal gateway config.yml exists so OpenClaw knows where to look.
 * EasyClaw generates this; we do the same.
 *
 * Also pre-registers the Nyra device identity as a paired device so the
 * gateway doesn't reject the device-auth connect with PAIRING_REQUIRED.
 */
export function ensureGatewayConfig(): void {
  fs.mkdirSync(GATEWAY_CONFIG_DIR, { recursive: true })

  // Required allowed origins for the WsProxy to connect
  const REQUIRED_ORIGINS = [
    'http://127.0.0.1:18790',
    'http://localhost:18790',
    'file://',
  ]

  if (fs.existsSync(GATEWAY_CONFIG)) {
    // Patch existing config: ensure controlUi.allowedOrigins includes our proxy
    try {
      let content = fs.readFileSync(GATEWAY_CONFIG, 'utf8')
      let needsWrite = false

      if (!content.includes('allowedOrigins')) {
        // Append controlUi block
        content += [
          '',
          '# Added by Nyra Desktop — allow WsProxy to connect',
          'controlUi:',
          '  allowedOrigins:',
          ...REQUIRED_ORIGINS.map(o => `    - "${o}"`),
          '',
        ].join('\n')
        needsWrite = true
      } else {
        // Check if each required origin is present
        for (const origin of REQUIRED_ORIGINS) {
          if (!content.includes(origin)) {
            // Insert the missing origin after the allowedOrigins: line
            content = content.replace(
              /(allowedOrigins:\s*\n)/,
              `$1    - "${origin}"\n`
            )
            needsWrite = true
          }
        }
      }

      // Remove pairingMode if we previously added it (gateway doesn't recognize it in YAML either)
      if (content.includes('pairingMode')) {
        content = content.replace(/\n# Added by Nyra Desktop — auto-approve device pairing\nauth:\n  pairingMode: open\n?/g, '')
        needsWrite = true
      }

      if (needsWrite) {
        fs.writeFileSync(GATEWAY_CONFIG, content, 'utf8')
        console.log('[AuthProfiles] Patched gateway config with allowed origins + pairing mode')
      }
    } catch (err) {
      console.warn('[AuthProfiles] Could not patch gateway config:', err)
    }
    return
  }

  // Create fresh config with allowed origins baked in
  const yaml = [
    '# Auto-generated by Nyra Desktop',
    'host: 127.0.0.1',
    'port: 18789',
    'agent: main',
    '',
    'controlUi:',
    '  allowedOrigins:',
    ...REQUIRED_ORIGINS.map(o => `    - "${o}"`),
    '',
  ].join('\n')
  fs.writeFileSync(GATEWAY_CONFIG, yaml, 'utf8')
  console.log('[AuthProfiles] Created gateway config at', GATEWAY_CONFIG)
}

/**
 * Ensure openclaw.json also has the allowed origins.
 * Some gateway versions read from JSON instead of YAML.
 */
export function ensureOpenClawJsonOrigins(): void {
  const cfgPath = path.join(OPENCLAW_HOME, 'openclaw.json')
  try {
    let cfg: Record<string, any> = {}
    if (fs.existsSync(cfgPath)) {
      cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    }
    if (!cfg.gateway) cfg.gateway = {}
    if (!cfg.gateway.controlUi) cfg.gateway.controlUi = {}
    const existing: string[] = cfg.gateway.controlUi.allowedOrigins ?? []
    const needed = ['http://127.0.0.1:18790', 'http://localhost:18790', 'file://']
    let changed = false
    for (const o of needed) {
      if (!existing.includes(o)) {
        existing.push(o)
        changed = true
      }
    }
    if (changed) {
      cfg.gateway.controlUi.allowedOrigins = existing
    }

    // Clean up invalid keys that break gateway startup (from earlier code versions)
    if (cfg.gateway.pairedDevices) {
      delete cfg.gateway.pairedDevices
      changed = true
    }
    if (cfg.gateway.auth?.pairingMode) {
      delete cfg.gateway.auth.pairingMode
      changed = true
    }

    if (changed) {
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
      console.log('[AuthProfiles] Updated openclaw.json with origins + pairing + device')
    }
  } catch (err) {
    console.warn('[AuthProfiles] Could not update openclaw.json:', err)
  }
}

/**
 * Write the Nyra device directly into ~/.openclaw/devices/paired.json — the file
 * the gateway ACTUALLY reads for device-auth.
 *
 * Also cleans up any stale Nyra entries from pending.json to avoid the gateway
 * re-prompting pairing requests we already handled.
 *
 * Format (from real gateway data):
 * {
 *   "<deviceId-hex>": {
 *     "deviceId": "<hex>",
 *     "publicKey": "<base64url>",
 *     "platform": "darwin",
 *     "clientId": "nyra-desktop",
 *     "clientMode": "ui",
 *     "role": "operator",
 *     "roles": ["operator"],
 *     "scopes": ["operator.admin", ...],
 *     "approvedScopes": ["operator.admin", ...],
 *     "tokens": { "operator": { "token": "<rand>", "role": "operator", "scopes": [...], "createdAtMs": ... } },
 *     "createdAtMs": ...,
 *     "approvedAtMs": ...
 *   }
 * }
 */
export function ensureNyraDevicePaired(): void {
  const deviceIdentity = loadNyraDeviceIdentity()
  if (!deviceIdentity) {
    console.warn('[AuthProfiles] No device identity — cannot register in paired.json')
    return
  }

  const { deviceId, publicKeyB64 } = deviceIdentity

  // Read existing paired devices
  fs.mkdirSync(DEVICES_DIR, { recursive: true, mode: 0o700 })
  let paired: Record<string, any> = {}
  try {
    if (fs.existsSync(PAIRED_JSON)) {
      paired = JSON.parse(fs.readFileSync(PAIRED_JSON, 'utf8'))
    }
  } catch (err) {
    console.warn('[AuthProfiles] Could not read paired.json:', err)
    paired = {}
  }

  // Check if already paired with correct scopes
  const REQUIRED_SCOPES = ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing']
  const existing = paired[deviceId]
  if (existing) {
    const existingScopes = (existing.scopes ?? []) as string[]
    const hasAllScopes = REQUIRED_SCOPES.every(s => existingScopes.includes(s))
    if (hasAllScopes) {
      console.log(`[AuthProfiles] Nyra device ${deviceId.slice(0, 12)}… already paired with full scopes`)
      // Still clean up pending
      cleanPendingForDevice(deviceId)
      return
    }
    console.log(`[AuthProfiles] Nyra device paired but missing scopes — upgrading`)
  }

  // Generate a random token for the device (matches gateway's token format)
  const crypto = require('crypto')
  const tokenRaw = crypto.randomBytes(32)
  const token = tokenRaw.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')

  const now = Date.now()

  paired[deviceId] = {
    deviceId,
    publicKey: publicKeyB64,
    platform: process.platform === 'darwin' ? 'darwin' : process.platform,
    clientId: 'nyra-desktop',
    clientMode: 'ui',
    role: 'operator',
    roles: ['operator'],
    scopes: REQUIRED_SCOPES,
    approvedScopes: REQUIRED_SCOPES,
    tokens: {
      operator: {
        token,
        role: 'operator',
        scopes: REQUIRED_SCOPES,
        createdAtMs: now,
      },
    },
    createdAtMs: now,
    approvedAtMs: now,
  }

  fs.writeFileSync(PAIRED_JSON, JSON.stringify(paired, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
  console.log(`[AuthProfiles] ✅ Nyra device ${deviceId.slice(0, 12)}… written to paired.json with full scopes`)

  // Clean up pending
  cleanPendingForDevice(deviceId)
}

/**
 * Remove any stale pairing requests for our device from pending.json.
 */
function cleanPendingForDevice(deviceId: string): void {
  try {
    if (!fs.existsSync(PENDING_JSON)) return
    const pending = JSON.parse(fs.readFileSync(PENDING_JSON, 'utf8'))
    let changed = false
    for (const [reqId, entry] of Object.entries(pending)) {
      if ((entry as any)?.deviceId === deviceId) {
        delete pending[reqId]
        changed = true
        console.log(`[AuthProfiles] Cleaned stale pending request ${reqId} for device ${deviceId.slice(0, 12)}…`)
      }
    }
    if (changed) {
      fs.writeFileSync(PENDING_JSON, JSON.stringify(pending, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    }
  } catch (err) {
    console.warn('[AuthProfiles] Could not clean pending.json:', err)
  }
}

/**
 * Load or create the Nyra device identity for pre-registration in the gateway config.
 * This ensures the device identity exists BEFORE the gateway starts, solving the
 * chicken-and-egg problem (wsproxy creates identity on first connect, but gateway
 * needs it registered before the connect handshake).
 */
function loadNyraDeviceIdentity(): { deviceId: string; publicKeyB64: string } | null {
  const idFile = path.join(OPENCLAW_HOME, 'nyra-device-identity.json')
  try {
    const crypto = require('crypto')
    const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

    let stored: Record<string, string> | null = null

    if (fs.existsSync(idFile)) {
      stored = JSON.parse(fs.readFileSync(idFile, 'utf8'))
    }

    // Create the identity if it doesn't exist yet
    if (!stored?.deviceId || !stored?.publicKeyPem) {
      console.log('[AuthProfiles] Creating Nyra device identity (first run)…')
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

      const spkiRaw = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
      let rawKey: Buffer
      if (spkiRaw.length === ED25519_SPKI_PREFIX.length + 32 &&
          spkiRaw.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
        rawKey = spkiRaw.subarray(ED25519_SPKI_PREFIX.length)
      } else {
        rawKey = spkiRaw
      }
      const deviceId = crypto.createHash('sha256').update(rawKey).digest('hex')

      fs.mkdirSync(path.dirname(idFile), { recursive: true })
      fs.writeFileSync(idFile, JSON.stringify({
        version: 1, deviceId, publicKeyPem, privateKeyPem, createdAtMs: Date.now()
      }, null, 2) + '\n', { mode: 0o600 })

      stored = { deviceId, publicKeyPem, privateKeyPem }
      console.log(`[AuthProfiles] Device identity created: ${deviceId.slice(0, 16)}…`)
    }

    // Derive the base64url-encoded raw public key
    const key = crypto.createPublicKey(stored.publicKeyPem)
    const spki = key.export({ type: 'spki', format: 'der' }) as Buffer
    let raw: Buffer
    if (spki.length === ED25519_SPKI_PREFIX.length + 32 &&
        spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
      raw = spki.subarray(ED25519_SPKI_PREFIX.length)
    } else {
      raw = spki
    }
    const publicKeyB64 = raw.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')

    return { deviceId: stored.deviceId, publicKeyB64 }
  } catch (err) {
    console.warn('[AuthProfiles] Could not load/create device identity:', err)
    return null
  }
}

/**
 * Switch the active model for a provider.
 * Parses model ID (e.g., "gemini/gemini-2.5-pro") and updates auth-profiles.json.
 * The model ID from the UI uses short prefixes ("openai/gpt-5.4") which get
 * translated to OpenClaw's format ("openai-codex/gpt-5.4") before writing.
 */
export function switchActiveModel(modelId: string): boolean {
  try {
    if (!modelId || modelId === 'auto') {
      console.log('[AuthProfiles] Skipping model switch for "auto"')
      return true
    }

    if (!modelId.includes('/')) {
      console.warn('[AuthProfiles] Invalid model ID format:', modelId)
      return false
    }

    // Extract UI prefix to find the provider profile
    const [uiPrefix] = modelId.split('/')
    const openclawId = PROVIDER_MAP[uiPrefix]
    if (!openclawId) {
      console.warn(`[AuthProfiles] Unknown provider prefix "${uiPrefix}" in model ID "${modelId}"`)
      return false
    }

    // Translate UI model ID → OpenClaw model ID
    const openclawModelId = toOpenClawModelId(modelId)

    const profiles = readAuthProfiles()
    const profile = profiles[openclawId]
    if (!profile) {
      // For Ollama, create a minimal profile on-the-fly if it doesn't exist yet.
      // syncOllamaToOpenClaw() writes the full profile (with models array),
      // so this is just a fallback that adds the selected model field.
      if (uiPrefix === 'ollama') {
        (profiles as Record<string, unknown>)[openclawId] = {
          type: 'local',
          baseUrl: 'http://localhost:11434',
          model: openclawModelId,
          models: [],  // Will be populated by syncOllamaToOpenClaw on next sync
        }
        writeAuthProfiles(profiles)
        console.log(`[AuthProfiles] Created ollama profile and set model to ${openclawModelId}`)
        // Also set as default provider
        setDefaultProvider(openclawId)
        return true
      }
      // No profile for this provider — the user hasn't configured an API key.
      // DON'T create a placeholder with an empty key — it would corrupt the
      // gateway's default-provider setting and could wipe valid profiles if
      // readAuthProfiles() has a transient failure (returns {}).
      // Instead, just log the issue. The UI model state still updates so the
      // user sees their selection, and when they add an API key, the next
      // switchActiveModel call will find the profile and succeed.
      console.warn(`[AuthProfiles] No profile found for "${openclawId}" — user needs to add an API key for ${uiPrefix}`)
      return false
    }

    // Update the model field for this provider (works for both api-key and local types)
    ;(profile as unknown as Record<string, unknown>).model = openclawModelId

    writeAuthProfiles(profiles)
    console.log(`[AuthProfiles] Switched model for ${openclawId}: ${modelId} → ${openclawModelId}`)

    // Also set as default provider so OpenClaw routes to this provider by default
    setDefaultProvider(openclawId)

    return true
  } catch (err) {
    console.error('[AuthProfiles] switchActiveModel error:', err)
    return false
  }
}

/**
 * Set the default provider in the gateway config.yml.
 * This ensures OpenClaw uses the selected provider when no explicit provider is given.
 */
/**
 * Read the current default-provider from gateway config.yml.
 * Returns the OpenClaw profile ID (e.g. "openai-codex:default") or null.
 */
export function getDefaultProvider(): string | null {
  try {
    if (!fs.existsSync(GATEWAY_CONFIG)) return null
    const content = fs.readFileSync(GATEWAY_CONFIG, 'utf8')
    for (const line of content.split('\n')) {
      if (line.startsWith('default-provider:')) {
        return line.slice('default-provider:'.length).trim() || null
      }
    }
    return null
  } catch {
    return null
  }
}

export function setDefaultProvider(openclawProfileId: string): boolean {
  try {
    if (!fs.existsSync(GATEWAY_CONFIG)) {
      console.warn('[AuthProfiles] Gateway config does not exist — skipping default provider update')
      return false
    }

    let content = fs.readFileSync(GATEWAY_CONFIG, 'utf8')
    const lines = content.split('\n')
    let found = false

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('default-provider:')) {
        lines[i] = `default-provider: ${openclawProfileId}`
        found = true
        break
      }
    }

    if (!found) {
      // Add default-provider at the beginning (after any comments)
      let insertIndex = 0
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('#')) {
          insertIndex = i
          break
        }
      }
      lines.splice(insertIndex, 0, `default-provider: ${openclawProfileId}`)
    }

    fs.writeFileSync(GATEWAY_CONFIG, lines.join('\n'), 'utf8')
    console.log(`[AuthProfiles] Set default provider to ${openclawProfileId}`)
    return true
  } catch (err) {
    console.error('[AuthProfiles] setDefaultProvider error:', err)
    return false
  }
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

  const key_openrouter = loadKey('openrouter')
  if (key_openrouter) env['OPENROUTER_API_KEY'] = key_openrouter

  // OpenClaw-specific paths
  env['OPENCLAW_CONFIG_PATH'] = GATEWAY_CONFIG
  env['OPENCLAW_STATE_DIR'] = OPENCLAW_HOME

  return env
}
