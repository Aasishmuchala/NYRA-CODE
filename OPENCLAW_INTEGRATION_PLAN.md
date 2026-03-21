# OpenClaw Integration Plan — Nyra Desktop

## Root Cause Analysis

**Why model switching doesn't work today:**

The current Nyra codebase writes to `auth-profiles.json` and `config.yml` to switch models, hoping the gateway re-reads the file on the next `chat.send`. This is fragile and fundamentally wrong because:

1. **`chat.send` does NOT accept a `model` parameter** — confirmed from OpenClaw source
2. **The correct method is `sessions.patch`** — sets `modelOverride`/`providerOverride` on the session, which the gateway uses for all subsequent messages in that session
3. **Model catalog is hardcoded** in `providers.ts` and `ModelSelector.tsx` — should come from `models.list` RPC
4. **OAuth tokens are written as `type: "api-key"`** by `syncAllProviders()` — should be `type: "oauth"` with `accessToken`/`refreshToken` fields
5. **No channel configuration** exists — OpenClaw supports 22+ channels (Telegram, WhatsApp, Slack, Discord, etc.)

---

## Phase 1: Fix Model Switching (Critical — Day 1)

### 1A. Add `sessions.patch` RPC call to useOpenClaw hook

**File: `src/renderer/hooks/useOpenClaw.ts`**

Add a new function `patchSession()` that calls the gateway's `sessions.patch` method:

```typescript
const patchSession = useCallback(async (sessionId: string, patch: Record<string, unknown>) => {
  return rpc('sessions.patch', { key: sessionId, ...patch })
}, [rpc])
```

### 1B. Call `sessions.patch` when model changes

When the user selects a model in ModelSelector, the flow should be:

1. User picks model (e.g., `"openai/gpt-5.4"`)
2. UI calls `patchSession(activeSessionId, { model: "openai-codex/gpt-5.4" })`
3. Gateway validates against its catalog and stores `modelOverride` on session
4. Next `chat.send` automatically uses the patched model

**File: `src/renderer/hooks/useOpenClaw.ts`** — modify `setSessionModel`:

```typescript
const setSessionModel = useCallback(async (sessionId: string, model: string) => {
  // 1. Update local UI state immediately
  setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, model } : s))

  // 2. Translate UI model ID → OpenClaw format
  const openclawModelId = translateModelId(model)

  // 3. Patch the gateway session
  try {
    await rpc('sessions.patch', { key: sessionId, model: openclawModelId })
    console.log(`[OpenClaw] Model switched to ${openclawModelId} for session ${sessionId}`)
  } catch (err) {
    console.error('[OpenClaw] sessions.patch failed:', err)
    // Still keep the IPC fallback for auth-profiles write
    window.nyra?.providers?.switchModel(model)
  }
}, [rpc])
```

### 1C. Add `models.list` RPC to fetch dynamic catalog

**File: `src/renderer/hooks/useOpenClaw.ts`** — add:

```typescript
const fetchModelCatalog = useCallback(async () => {
  try {
    const catalog = await rpc<ModelCatalogEntry[]>('models.list', {})
    return catalog
  } catch (err) {
    console.warn('[OpenClaw] models.list failed, using fallback catalog:', err)
    return null
  }
}, [rpc])
```

### 1D. Replace hardcoded ModelSelector with dynamic catalog

**File: `src/renderer/components/ModelSelector.tsx`**

Instead of hardcoded `OPENAI_MODELS`, `COPILOT_MODELS`, etc.:

1. Accept a `catalog` prop of type `ModelCatalogEntry[]`
2. On mount (or when connection status changes), call `models.list` via IPC
3. Group models by `provider` field
4. Fall back to current hardcoded catalog if gateway is unavailable

### 1E. Model ID translation (keep existing, refine)

The current `toOpenClawModelId()` in `auth-profiles.ts` handles `openai/gpt-5.4` → `openai-codex/gpt-5.4`. This stays, but now it's used for `sessions.patch` rather than writing to files.

---

## Phase 2: Fix Auth Profile Format (Critical — Day 1-2)

### 2A. Fix OAuth token format in syncAllProviders

**File: `src/main/auth-profiles.ts`** — `syncAllProviders()`

Currently, ALL providers are written as `type: "api-key"`. OAuth tokens from ChatGPT/Gemini/GitHub need to be written as `type: "oauth"`:

```typescript
// BEFORE (wrong for OAuth tokens):
profiles[openclawId] = { type: 'api-key', key: apiKey }

// AFTER (detect token type):
if (tokenLooksLikeOAuth(key)) {
  profiles[openclawId] = { type: 'oauth', provider: nyraId, accessToken: key }
} else {
  profiles[openclawId] = { type: 'api_key', provider: nyraId, key: key }
}
```

Note: OpenClaw uses `type: "api_key"` (with underscore), NOT `type: "api-key"`.

### 2B. Fix syncOAuthToken to use correct format

**File: `src/main/auth-profiles.ts`** — `syncOAuthToken()`

Update to match OpenClaw's actual `OAuthCredential` format:

```typescript
profiles[openclawId] = {
  type: 'oauth',
  provider: nyraProviderId,
  accessToken,
  refreshToken,
  expiresAt,
  clientId: getOAuthClientId(nyraProviderId),
}
```

---

## Phase 3: Dynamic Model Catalog via IPC (Day 2)

### 3A. Add IPC handler for models.list

**File: `src/main/ipc.ts`**

```typescript
ipcMain.handle('openclaw:models', async () => {
  // Try fetching from gateway via WS
  // If gateway is running, send models.list RPC
  // Fall back to PROVIDER_CATALOG from providers.ts
})
```

### 3B. Add preload bridge

**File: `src/preload/index.ts`**

```typescript
modelCatalog: () => ipcRenderer.invoke('openclaw:models')
```

### 3C. Consume in ModelSelector

The ModelSelector component fetches the catalog on mount and refreshes when connection status changes. Models from the gateway include provider info, context window, and whether they support reasoning.

---

## Phase 4: Full Onboarding Wizard (Day 2-3)

### 4A. Use OpenClaw's wizard RPC methods

The gateway exposes `wizard.start`, `wizard.next`, `wizard.cancel` for guided onboarding. Nyra should:

1. Call `wizard.start` to begin the onboarding flow
2. Present each wizard step in the UI
3. Call `wizard.next` with user responses to advance
4. Call `wizard.cancel` to abort

### 4B. Rewrite Onboarding.tsx

**File: `src/renderer/components/Onboarding.tsx`**

Replace the current 5-step static onboarding with a dynamic wizard that includes:

**Step 1: Welcome + Gateway Check**
- Verify gateway is running (auto-start if not)
- Show version info

**Step 2: AI Provider Setup**
- For each provider (OpenAI, Anthropic, Gemini, GitHub Copilot, OpenRouter):
  - Show OAuth login button (where available)
  - Show API key input field (always available)
  - Show connection status indicator
  - Mark which providers are already configured

**Step 3: Model Selection**
- Fetch models from `models.list`
- Let user pick a default model
- Call `sessions.patch` on the `main` session to set it

**Step 4: Channel Configuration (NEW)**
- Show available channels: Telegram, WhatsApp, Slack, Discord, Signal, iMessage, Google Chat, IRC, Teams
- For each enabled channel, show setup instructions
- Use `config.set` / `config.patch` RPC to configure

**Step 5: Verification**
- Send a test message via `chat.send`
- Confirm response arrives
- Show "Ready to use" state

### 4C. Keep onboarding accessible from Settings

Users should be able to re-run the onboarding wizard from Settings → Setup tab.

---

## Phase 5: Channel Configuration in Settings (Day 3)

### 5A. Add Channels tab to SettingsPanel

**File: `src/renderer/components/SettingsPanel.tsx`**

New "Channels" tab showing:

- List of supported channels with enable/disable toggles
- Per-channel configuration (bot token, webhook URL, etc.)
- Per-channel model override selection
- Connection status indicator

### 5B. Channel config via gateway RPC

Use `config.get` and `config.patch` to read/write channel config:

```typescript
// Read current channel config
const config = await rpc('config.get', { path: 'channels' })

// Update channel config
await rpc('config.patch', {
  path: 'channels.telegram',
  value: { enabled: true, botToken: '...', defaultModel: 'openai-codex/gpt-5.4' }
})
```

---

## Phase 6: Provider Management Overhaul (Day 3-4)

### 6A. Providers tab in Settings

Show each provider with:
- Connection method: OAuth vs API Key
- Current status: Connected / Disconnected / Expired
- Available models (from `models.list`, filtered by provider)
- Active model selection
- Reconnect / Disconnect buttons

### 6B. Live provider health from gateway

Instead of Nyra validating API keys against external APIs (current `openclaw:ping` approach), use the gateway's own health check:

```typescript
// The gateway knows which providers are working
const health = await rpc('health', {})
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/renderer/hooks/useOpenClaw.ts` | Add `sessions.patch`, `models.list` RPC calls; fix `setSessionModel` |
| `src/renderer/components/ModelSelector.tsx` | Accept dynamic catalog prop; remove hardcoded models |
| `src/main/auth-profiles.ts` | Fix OAuth token format (`type: "oauth"`); fix `type: "api_key"` |
| `src/main/providers.ts` | Add `fetchDynamicCatalog()` IPC; keep static as fallback |
| `src/main/ipc.ts` | Add `openclaw:models`, `openclaw:patch-session`, `openclaw:config` handlers |
| `src/preload/index.ts` | Add new IPC bridges |
| `src/renderer/components/Onboarding.tsx` | Full rewrite with wizard flow |
| `src/renderer/components/SettingsPanel.tsx` | Add Channels tab, improve Providers tab |

## Files to Create

| File | Purpose |
|------|---------|
| `src/renderer/components/ChannelSetup.tsx` | Channel configuration UI component |
| `src/renderer/components/ProviderSetup.tsx` | Provider setup with OAuth + API key |
| `src/renderer/hooks/useModelCatalog.ts` | Hook for fetching/caching model catalog |

---

## Implementation Priority

1. **sessions.patch for model switching** — This alone fixes the "model doesn't change" bug
2. **Fix auth-profile format** — This fixes the "GPT-5.4 not supported" error
3. **Dynamic model catalog** — Removes hardcoded model lists
4. **Onboarding wizard** — Full onboarding experience
5. **Channel config** — Telegram, WhatsApp, etc.
6. **Settings overhaul** — Polish

The first two items are the most critical and should be done first. They directly fix the two bugs the user has been experiencing.
