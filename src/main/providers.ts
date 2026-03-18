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
  switchActiveModel,
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
    oauthUrl: 'https://platform.openai.com/api-keys',
    apiKeyPrefix: 'sk-',
    models: [
      // ── Latest (March 2026) ──
      { id: 'openai-codex/gpt-5.4',           label: 'GPT-5.4',            contextWindow: 1_050_000 },
      { id: 'openai-codex/gpt-5.4-pro',       label: 'GPT-5.4 Pro',       contextWindow: 1_050_000 },
      { id: 'openai-codex/gpt-5.3-codex',     label: 'GPT-5.3 Codex',     contextWindow: 1_000_000 },
      { id: 'openai-codex/gpt-5-mini',        label: 'GPT-5 Mini',        contextWindow: 1_000_000 },
      // ── Reasoning ──
      { id: 'openai-codex/o4-mini',           label: 'o4 Mini',            contextWindow: 200_000 },
      { id: 'openai-codex/o3',                label: 'o3',                 contextWindow: 200_000 },
      { id: 'openai-codex/o3-mini',           label: 'o3 Mini',            contextWindow: 200_000 },
      // ── Previous generation (still available) ──
      { id: 'openai-codex/gpt-4.1',           label: 'GPT-4.1',           contextWindow: 1_000_000 },
      { id: 'openai-codex/gpt-4o',            label: 'GPT-4o',            contextWindow: 128_000 },
      { id: 'openai-codex/gpt-4o-mini',       label: 'GPT-4o Mini',       contextWindow: 128_000 },
    ],
  },
  {
    id: 'anthropic',
    label: 'Claude / Anthropic',
    icon: '🧠',
    oauthUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyPrefix: 'sk-ant-',
    models: [
      { id: 'anthropic/claude-opus-4-6',    label: 'Claude Opus 4.6',     contextWindow: 200_000 },
      { id: 'anthropic/claude-sonnet-4-6',  label: 'Claude Sonnet 4.6',   contextWindow: 200_000 },
      { id: 'anthropic/claude-haiku-4-5',   label: 'Claude Haiku 4.5',    contextWindow: 200_000 },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini / Google',
    icon: '💎',
    oauthUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      // ── Latest (March 2026) ──
      { id: 'google-gemini/gemini-3.1-pro-preview',        label: 'Gemini 3.1 Pro',        contextWindow: 1_048_576 },
      { id: 'google-gemini/gemini-3-flash-preview',        label: 'Gemini 3 Flash',        contextWindow: 1_048_576 },
      { id: 'google-gemini/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite', contextWindow: 1_048_576 },
      // ── Previous generation (retiring June 2026) ──
      { id: 'google-gemini/gemini-2.5-pro',                label: 'Gemini 2.5 Pro',        contextWindow: 1_000_000 },
      { id: 'google-gemini/gemini-2.5-flash',              label: 'Gemini 2.5 Flash',      contextWindow: 1_000_000 },
    ],
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    icon: '🐙',
    oauthUrl: 'https://github.com/settings/copilot',
    models: [
      // ── Latest (March 2026) ──
      { id: 'github-copilot/gpt-5.4',              label: 'GPT-5.4',              contextWindow: 1_050_000 },
      { id: 'github-copilot/claude-sonnet-4.6',    label: 'Claude Sonnet 4.6',    contextWindow: 200_000 },
      { id: 'github-copilot/claude-opus-4.6',      label: 'Claude Opus 4.6',      contextWindow: 200_000 },
      { id: 'github-copilot/gpt-5.3-codex',        label: 'GPT-5.3 Codex',        contextWindow: 1_000_000 },
      { id: 'github-copilot/gemini-3.1-pro',       label: 'Gemini 3.1 Pro',       contextWindow: 1_048_576 },
      // ── Other available models ──
      { id: 'github-copilot/claude-opus-4.5',      label: 'Claude Opus 4.5',      contextWindow: 200_000 },
      { id: 'github-copilot/claude-sonnet-4.5',    label: 'Claude Sonnet 4.5',    contextWindow: 200_000 },
      { id: 'github-copilot/claude-haiku-4.5',     label: 'Claude Haiku 4.5',     contextWindow: 200_000 },
      { id: 'github-copilot/gpt-5-mini',           label: 'GPT-5 Mini',           contextWindow: 1_000_000 },
      { id: 'github-copilot/gpt-5.2-codex',        label: 'GPT-5.2 Codex',        contextWindow: 1_000_000 },
      { id: 'github-copilot/gemini-2.5-pro',       label: 'Gemini 2.5 Pro',       contextWindow: 1_000_000 },
      { id: 'github-copilot/o4-mini',              label: 'o4 Mini',              contextWindow: 200_000 },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    icon: '🔀',
    oauthUrl: 'https://openrouter.ai/keys',
    apiKeyPrefix: 'sk-or-',
    models: [
      // ── Smart routing ──
      { id: 'openrouter/auto',                              label: 'Auto (Best)',              contextWindow: 128_000 },
      // ── Flagship paid models (latest, March 2026) ──
      { id: 'openrouter/anthropic/claude-opus-4-6',         label: 'Claude Opus 4.6',          contextWindow: 200_000 },
      { id: 'openrouter/anthropic/claude-sonnet-4-6',       label: 'Claude Sonnet 4.6',        contextWindow: 200_000 },
      { id: 'openrouter/openai/gpt-5.4',                    label: 'GPT-5.4',                  contextWindow: 1_050_000 },
      { id: 'openrouter/openai/gpt-5-mini',                 label: 'GPT-5 Mini',               contextWindow: 1_000_000 },
      { id: 'openrouter/google/gemini-3.1-pro-preview',     label: 'Gemini 3.1 Pro',           contextWindow: 1_048_576 },
      { id: 'openrouter/google/gemini-3-flash-preview',     label: 'Gemini 3 Flash',           contextWindow: 1_048_576 },
      // ── Kimi (Moonshot AI) ──
      { id: 'openrouter/moonshotai/kimi-k2.5',              label: 'Kimi K2.5',                contextWindow: 256_000 },
      { id: 'openrouter/moonshotai/kimi-k2',                label: 'Kimi K2',                  contextWindow: 128_000 },
      // ── MiniMax ──
      { id: 'openrouter/minimax/minimax-m1',                label: 'MiniMax M1',               contextWindow: 1_000_000 },
      { id: 'openrouter/minimax/minimax-m1-mini',           label: 'MiniMax M1 Mini',          contextWindow: 512_000 },
      // ── Reasoning ──
      { id: 'openrouter/deepseek/deepseek-r1',              label: 'DeepSeek R1',              contextWindow: 128_000 },
      { id: 'openrouter/openai/o4-mini',                    label: 'o4 Mini',                  contextWindow: 200_000 },
      // ── Open-weight / strong ──
      { id: 'openrouter/deepseek/deepseek-v3-0324',         label: 'DeepSeek V3 (0324)',       contextWindow: 128_000 },
      { id: 'openrouter/meta-llama/llama-4-maverick',       label: 'Llama 4 Maverick',         contextWindow: 1_048_576 },
      { id: 'openrouter/meta-llama/llama-4-scout',          label: 'Llama 4 Scout',            contextWindow: 512_000 },
      { id: 'openrouter/qwen/qwen-3-235b-a22b',            label: 'Qwen 3 235B',              contextWindow: 128_000 },
      { id: 'openrouter/qwen/qwen-3-32b',                   label: 'Qwen 3 32B',               contextWindow: 128_000 },
      { id: 'openrouter/mistralai/mistral-large-2',         label: 'Mistral Large 2',          contextWindow: 128_000 },
      // ── Free models (community tier, $0) ──
      { id: 'openrouter/deepseek/deepseek-r1:free',         label: 'DeepSeek R1 (Free)',       contextWindow: 128_000 },
      { id: 'openrouter/deepseek/deepseek-v3-0324:free',    label: 'DeepSeek V3 (Free)',       contextWindow: 128_000 },
      { id: 'openrouter/meta-llama/llama-4-maverick:free',   label: 'Llama 4 Maverick (Free)',  contextWindow: 256_000 },
      { id: 'openrouter/qwen/qwen-3-32b:free',              label: 'Qwen 3 32B (Free)',        contextWindow: 128_000 },
      { id: 'openrouter/google/gemma-3-27b-it:free',        label: 'Gemma 3 27B (Free)',       contextWindow: 96_000 },
      { id: 'openrouter/mistralai/mistral-small-3.2:free',  label: 'Mistral Small 3.2 (Free)', contextWindow: 128_000 },
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
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    // Defensive: ensure `.providers` always exists even if the file is malformed
    if (!raw || typeof raw !== 'object' || !raw.providers || typeof raw.providers !== 'object') {
      return { providers: {}, ...raw }
    }
    return raw
  } catch { return { providers: {} } }
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
    if (!cfg.providers) cfg.providers = {}
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
    const model = cfg.providers?.[providerId]?.activeModel
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
    if (cfg.providers?.[providerId]) {
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
    enabled: cfg.providers?.[def.id]?.enabled ?? false,
    hasKey: hasApiKey(def.id),
    activeModel: cfg.providers?.[def.id]?.activeModel ?? def.models[0]?.id,
  }))
}

export function setActiveModel(providerId: string, modelId: string): boolean {
  const cfg = readConfig()
  if (!cfg.providers) cfg.providers = {}
  if (!cfg.providers[providerId]) {
    // Don't create a disabled entry — only update if provider is already configured
    // (key file presence is the source of truth for whether a provider is set up)
    if (!hasApiKey(providerId)) {
      console.warn(`[Providers] setActiveModel called for unconfigured provider "${providerId}" — skipping`)
      return false
    }
    cfg.providers[providerId] = { enabled: true }
  }
  cfg.providers[providerId].activeModel = modelId
  writeConfig(cfg)

  // ── Keep gateway in sync — write model change to auth-profiles.json ──────
  // switchActiveModel handles both UI-format ("gemini/...") and OpenClaw-format
  // ("google-gemini/...") model IDs via the extended PROVIDER_MAP.
  const synced = switchActiveModel(modelId)
  if (!synced) {
    console.warn(`[Providers] setActiveModel: gateway sync failed for "${modelId}" — provider may not have a key stored yet`)
  }

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
    (id) => cfg.providers?.[id]?.activeModel
  )
  console.log('[Providers] Synced all provider keys to OpenClaw auth-profiles')
}

// ── Resolve best available provider (for direct chat fallback) ────────────────

export function resolveProvider(): { providerId: string; apiKey: string; model: string } | null {
  const cfg = readConfig()
  // Prefer order: openai, anthropic, gemini, copilot
  for (const def of PROVIDER_CATALOG) {
    const state = cfg.providers?.[def.id]
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
