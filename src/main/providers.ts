/**
 * AI Provider Manager — catalog, API key storage (encrypted), OAuth helpers
 *
 * Stores provider API keys encrypted via Electron safeStorage (macOS Keychain).
 * Supports: OpenAI (ChatGPT), Anthropic (Claude), Google (Gemini), GitHub Copilot.
 *
 * Provider tokens can be:
 *  1. Entered manually (API key pasted in settings)
 *  2. Obtained via OAuth (browser flow → deep-link callback)
 *  3. Synced to OpenClaw gateway via RPC so it can use them for routing
 */

import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import {
  syncProviderKey, removeProviderProfile,
  syncAllProviders, ensureGatewayConfig,
} from './auth-profiles'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProviderModel {
  id: string
  label: string
  contextWindow?: number
}

export interface ProviderDef {
  id: string
  label: string
  icon: string          // emoji or short label
  oauthUrl?: string     // URL to open for OAuth / key creation
  apiKeyPrefix?: string // e.g. 'sk-' for OpenAI, 'sk-ant-' for Anthropic
  models: ProviderModel[]
}

export interface ProviderState {
  id: string
  enabled: boolean
  hasKey: boolean       // true if an encrypted key is stored
  activeModel?: string  // currently selected model id
}

// ── Provider catalog ──────────────────────────────────────────────────────────

/**
 * Provider catalog — matches OpenClaw's provider identifiers.
 *
 * OpenClaw uses compound IDs like "openai-codex:default" where the part
 * before ":" is the provider plugin and the part after is the auth profile.
 * Models use the "provider/model" format in auth-profiles, e.g.
 * "openai-codex/gpt-4o".
 *
 * Nyra uses short IDs internally (openai, anthropic, etc.) and maps them
 * to OpenClaw IDs in auth-profiles.ts.
 */
export const PROVIDER_CATALOG: ProviderDef[] = [
  {
    id: 'openai',
    label: 'ChatGPT / OpenAI',
    icon: '🤖',
    oauthUrl: 'https://chat.openai.com',
    apiKeyPrefix: 'sk-',
    models: [
      { id: 'openai-codex/gpt-4o',        label: 'GPT-4o',        contextWindow: 128_000 },
      { id: 'openai-codex/gpt-4o-mini',   label: 'GPT-4o Mini',   contextWindow: 128_000 },
      { id: 'openai-codex/o3-mini',       label: 'o3 Mini',        contextWindow: 200_000 },
      { id: 'openai-codex/o3',            label: 'o3',             contextWindow: 200_000 },
      { id: 'openai-codex/o4-mini',       label: 'o4 Mini',        contextWindow: 200_000 },
      { id: 'openai-codex/gpt-4.1',       label: 'GPT-4.1',       contextWindow: 1_000_000 },
    ],
  },
  {
    id: 'anthropic',
    label: 'Claude / Anthropic',
    icon: '🧠',
    oauthUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyPrefix: 'sk-ant-',
    models: [
      { id: 'anthropic/claude-sonnet-4-6',  label: 'Claude Sonnet 4.6',   contextWindow: 200_000 },
      { id: 'anthropic/claude-opus-4-6',    label: 'Claude Opus 4.6',     contextWindow: 200_000 },
      { id: 'anthropic/claude-haiku-4-5',   label: 'Claude Haiku 4.5',    contextWindow: 200_000 },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini / Google',
    icon: '💎',
    oauthUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'google-gemini/gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   contextWindow: 1_000_000 },
      { id: 'google-gemini/gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextWindow: 1_000_000 },
      { id: 'google-gemini/gemini-2.0-flash', label: 'Gemini 2.0 Flash', contextWindow: 1_000_000 },
    ],
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    icon: '🐙',
    oauthUrl: 'https://github.com/settings/copilot',
    models: [
      { id: 'github-copilot/gpt-4o',       label: 'Copilot GPT-4o' },
      { id: 'github-copilot/claude-sonnet', label: 'Copilot Claude Sonnet' },
    ],
  },
]

// ── Storage paths ─────────────────────────────────────────────────────────────

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'nyra_providers.json')
}

function getKeyPath(providerId: string): string {
  return path.join(app.getPath('userData'), `nyra_apikey_${providerId}`)
}

// ── Config read/write (non-secret metadata) ──────────────────────────────────

interface ProvidersConfig {
  providers: Record<string, { enabled: boolean; activeModel?: string }>
}

function readConfig(): ProvidersConfig {
  const p = getConfigPath()
  if (!fs.existsSync(p)) return { providers: {} }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return { providers: {} } }
}

function writeConfig(cfg: ProvidersConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf8')
}

// ── Encrypted API key storage ─────────────────────────────────────────────────

export function saveApiKey(providerId: string, key: string): boolean {
  try {
    const keyPath = getKeyPath(providerId)
    if (!safeStorage.isEncryptionAvailable()) {
      // Encryption unavailable (e.g. headless Linux without keyring).
      // Refuse to store plaintext — prompt user to set up a keyring.
      console.error(`[Providers] Cannot save key for ${providerId}: system keychain/encryption unavailable`)
      return false
    }
    const encrypted = safeStorage.encryptString(key)
    fs.writeFileSync(keyPath, encrypted, { mode: 0o600 })
    // Enable provider in config
    const cfg = readConfig()
    if (!cfg.providers[providerId]) {
      const def = PROVIDER_CATALOG.find(p => p.id === providerId)
      cfg.providers[providerId] = {
        enabled: true,
        activeModel: def?.models[0]?.id,
      }
    } else {
      cfg.providers[providerId].enabled = true
    }
    writeConfig(cfg)

    // ── Write-through to OpenClaw auth-profiles.json ──
    const model = cfg.providers[providerId]?.activeModel
    syncProviderKey(providerId, key, model)

    return true
  } catch (err) {
    console.error(`[Providers] Failed to save key for ${providerId}:`, err)
    return false
  }
}

export function loadApiKey(providerId: string): string | null {
  try {
    const keyPath = getKeyPath(providerId)
    if (!fs.existsSync(keyPath)) return null
    const raw = fs.readFileSync(keyPath)
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn(`[Providers] Cannot decrypt key for ${providerId}: encryption unavailable`)
      return null
    }
    return safeStorage.decryptString(raw)
  } catch {
    return null
  }
}

export function removeApiKey(providerId: string): boolean {
  try {
    const keyPath = getKeyPath(providerId)
    if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath)
    const cfg = readConfig()
    if (cfg.providers[providerId]) {
      cfg.providers[providerId].enabled = false
    }
    writeConfig(cfg)

    // ── Remove from OpenClaw auth-profiles.json ──
    removeProviderProfile(providerId)

    return true
  } catch {
    return false
  }
}

export function hasApiKey(providerId: string): boolean {
  return fs.existsSync(getKeyPath(providerId))
}

// ── Provider state (for renderer) ─────────────────────────────────────────────

export function listProviders(): ProviderState[] {
  const cfg = readConfig()
  return PROVIDER_CATALOG.map(def => ({
    id: def.id,
    enabled: cfg.providers[def.id]?.enabled ?? false,
    hasKey: hasApiKey(def.id),
    activeModel: cfg.providers[def.id]?.activeModel ?? def.models[0]?.id,
  }))
}

export function setActiveModel(providerId: string, modelId: string): boolean {
  const cfg = readConfig()
  if (!cfg.providers[providerId]) {
    cfg.providers[providerId] = { enabled: false }
  }
  cfg.providers[providerId].activeModel = modelId
  writeConfig(cfg)
  return true
}

export function getCatalog(): ProviderDef[] {
  return PROVIDER_CATALOG
}

// ── Sync all keys to OpenClaw on startup ──────────────────────────────────────

export function syncProvidersToOpenClaw(): void {
  ensureGatewayConfig()

  const cfg = readConfig()
  syncAllProviders(
    (id) => loadApiKey(id),
    (id) => cfg.providers[id]?.activeModel
  )
  console.log('[Providers] Synced all provider keys to OpenClaw auth-profiles')
}

// ── Resolve best available provider (for direct chat fallback) ────────────────

export function resolveProvider(): { providerId: string; apiKey: string; model: string } | null {
  const cfg = readConfig()
  // Prefer order: openai, anthropic, gemini, copilot
  for (const def of PROVIDER_CATALOG) {
    const state = cfg.providers[def.id]
    if (state?.enabled) {
      const key = loadApiKey(def.id)
      if (key) {
        const model = state.activeModel ?? def.models[0]?.id
        if (!model) continue
        return { providerId: def.id, apiKey: key, model }
      }
    }
  }
  return null
}
