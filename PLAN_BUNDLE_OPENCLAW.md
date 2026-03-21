# Plan: Bundle OpenClaw Gateway Into Nyra Desktop

## Problem Statement

The OpenClaw gateway is the **sole chat routing layer** — all LLM requests flow through it.
Currently it's installed at runtime via `npm install -g openclaw`, which:
1. Often fails silently (no npm, wrong Node version, permissions)
2. Installs an unknown version that may lack provider plugins (OpenRouter, etc.)
3. API keys injected as env vars at spawn time only — keys added later are invisible
4. User sees "⚠️ API rate limit reached" because gateway can't route to their provider

**Goal:** Bundle the OpenClaw gateway from source into the Nyra app, so it always works,
supports all providers, and can be patched when routing breaks.

---

## Phase 0: Documentation Discovery (COMPLETE)

### Key Architecture Facts

| Component | Location | Purpose |
|-----------|----------|---------|
| Gateway Manager | `src/main/openclaw.ts` | Spawns `openclaw gateway --port 18789` |
| WS Proxy | `src/main/wsproxy.ts` | Translates renderer JSON-RPC ↔ gateway native (port 18790) |
| Auth Profiles | `src/main/auth-profiles.ts` | Writes `~/.openclaw/agents/main/agent/auth-profiles.json` |
| Provider Config | `src/main/providers.ts` | Encrypted key storage + PROVIDER_CATALOG |
| Onboarding | `src/renderer/components/Onboarding.tsx` | 7-step setup flow |
| Settings | `src/renderer/components/SettingsPanel.jsx` | Provider key management |
| Build Config | `electron-builder.yml` | Has `extraResources: from: resources/bin` (currently empty!) |
| Vite Config | `electron.vite.config.ts` | Main/preload/renderer bundling |

### Binary Resolution Order (openclaw.ts:112-165)
1. `{resourcesPath}/bin/openclaw` ← **THIS IS WHERE WE'LL PUT IT**
2. PATH lookup via `which`/`where`
3. npm global paths (`~/.npm-global/bin/openclaw`, `/usr/local/bin/`, etc.)
4. NVM-managed Node v22+ dirs

### Environment Injected at Spawn (auth-profiles.ts:780-805)
```
OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY,
GITHUB_TOKEN, OPENROUTER_API_KEY,
OPENCLAW_CONFIG_PATH, OPENCLAW_STATE_DIR
```

### Gateway Config Written To
- `~/.openclaw/gateway/config.yml` — host, port, allowed origins, default-provider
- `~/.openclaw/agents/main/agent/auth-profiles.json` — provider keys + models
- `~/.openclaw/devices/paired.json` — device identity for auth

---

## Phase 1: Import OpenClaw Source & Build Script

### Prerequisites
- [ ] User provides OpenClaw repo (clone URL or local path)

### Tasks

**1.1 — Copy OpenClaw source into Nyra project**
- Create `vendor/openclaw/` directory at project root
- Copy the OpenClaw repo contents there
- Add to `.gitignore` if needed (or commit as vendored dependency)

**1.2 — Understand OpenClaw's build system**
- Read OpenClaw's `package.json` — identify build script, entry point, dependencies
- Determine if it's a Node.js CLI (likely `#!/usr/bin/env node`) or compiled binary
- Check if it has provider plugins — specifically look for `openrouter` support
- Document: Which file handles `gateway` subcommand? How does it read auth-profiles?

**1.3 — Create build script for bundled gateway**
- If Node.js CLI: bundle with `esbuild` or `ncc` into single file at `resources/bin/openclaw`
- If compiled: cross-compile for macOS (arm64 + x64) and Windows (x64)
- Add npm script: `"build:gateway": "..."` that produces `resources/bin/openclaw`
- Update `package:mac` and `package:win` to depend on `build:gateway`

**1.4 — Verify binary resolution picks up bundled version**
- Confirm `resolveCliBinary()` at openclaw.ts:114-119 finds `resources/bin/openclaw`
- `process.resourcesPath` in dev = app root; in packaged = `Contents/Resources/`
- Test: `npm run dev` should find the binary at first resolution step

### Verification Checklist
- [ ] `resources/bin/openclaw` exists and is executable
- [ ] `npm run dev` → gateway starts with bundled binary (check console: "Spawning: resources/bin/openclaw gateway --port 18789")
- [ ] `npm run build` includes binary in `out/` or packaged app

### Anti-Pattern Guards
- Do NOT install openclaw globally anymore — bundled binary is canonical
- Do NOT assume openclaw is a single-file script — read its actual structure first
- Do NOT skip checking if it has an openrouter provider plugin

---

## Phase 2: Ensure All Provider Routing Works

### Tasks

**2.1 — Audit OpenClaw provider plugins**
- In `vendor/openclaw/`, search for provider implementations
- Grep for: `openrouter`, `anthropic`, `google-gemini`, `github-copilot`, `openai-codex`
- Document: Which providers are built-in? Which are missing?

**2.2 — Add missing provider plugins (if needed)**
- If OpenRouter is missing: add it as an OpenAI-compatible provider
  - OpenRouter API is at `https://openrouter.ai/api/v1` with same format as OpenAI
  - Needs `OPENROUTER_API_KEY` env var or `key` from auth-profiles
  - Model IDs: pass through as-is (e.g., `anthropic/claude-opus-4-6`)
- If any other provider is missing: add similarly

**2.3 — Fix env var injection timing**
- Current bug: `buildGatewayEnvSecrets()` runs once at spawn; keys saved later are invisible
- The gateway restart fix (already committed) helps, but is heavy-handed
- Better fix: ensure gateway reads keys from `auth-profiles.json` on every request
  - Check if OpenClaw already supports this (likely does for `api_key` type profiles)
  - If not, patch the gateway source to re-read auth-profiles per request

**2.4 — Verify auth-profiles format compatibility**
- Nyra writes profiles like: `{ "openrouter:default": { type: "api_key", key: "sk-or-..." } }`
- Verify OpenClaw actually reads this format
- Check: does OpenClaw expect `type: "api_key"` or `type: "api-key"`? (Nyra uses underscore)
- Check: does it read the `model` field? The `provider` field?

### Verification Checklist
- [ ] OpenRouter key saved → gateway can route to `openrouter/anthropic/claude-opus-4-6`
- [ ] Anthropic key saved → gateway routes to `anthropic/claude-opus-4-6`
- [ ] Model switch in UI → gateway uses new model on next message
- [ ] No "API rate limit reached" error with valid keys

### Anti-Pattern Guards
- Do NOT assume auth-profiles format without checking OpenClaw source
- Do NOT skip checking if `type: "api_key"` (underscore) is what OpenClaw expects
- Do NOT assume the gateway re-reads auth-profiles per request — verify

---

## Phase 3: Onboarding Gateway Setup

### Tasks

**3.1 — Add gateway status to onboarding**
- In `Onboarding.tsx`, between Welcome and Provider steps:
  - Check `window.nyra.openclaw.status()` — is gateway running?
  - If not running, show a "Starting AI gateway..." spinner
  - Wait for `openclaw:ready` event before proceeding to provider setup
  - On error: show diagnostic message + retry button

**3.2 — Gateway health check before provider step**
- Before showing provider setup, verify gateway is responsive:
  - Call `window.nyra.openclaw.ping()` — tests WS proxy + gateway + provider
  - If ping fails, show: "Gateway starting up..." with progress
  - Timeout after 15s: show "Gateway failed to start" with troubleshooting

**3.3 — Auto-restart gateway after provider setup**
- After user saves their first API key in onboarding:
  - Trigger `window.nyra.openclaw.restart()` (IPC handler at ipc.ts:214)
  - Wait for `openclaw:ready` event
  - Then proceed to model selection step
- This ensures gateway has fresh env vars with the newly-saved key

**3.4 — Remove npm global install fallback**
- In `openclaw.ts`, remove or disable `installOpenClaw()` (lines 168-189)
- The bundled binary should always be found at step 1 of `resolveCliBinary()`
- If bundled binary is missing, show clear error: "Gateway binary not found — app may be corrupted"

### Verification Checklist
- [ ] Fresh install → onboarding shows gateway starting → provider step appears when ready
- [ ] API key saved during onboarding → gateway restarts → model selection works
- [ ] If gateway fails, onboarding shows actionable error (not silent failure)
- [ ] No `npm install -g openclaw` runs during onboarding

### Anti-Pattern Guards
- Do NOT show provider setup before gateway is confirmed running
- Do NOT silently proceed if gateway fails — always show status to user
- Do NOT keep the npm global install path — it's unreliable and installs unknown versions

---

## Phase 4: Direct API Fallback (Safety Net)

### Tasks

**4.1 — Add direct provider call path in useOpenClaw.ts**
- When `chat.send` via WebSocket gateway fails with error containing "rate limit" or "not found":
  - Fall back to direct provider API call via `stream:start` IPC
  - Use `resolveProvider()` (providers.ts:340) to get provider + key + model
  - Route through `providerRegistry` (openai-provider.ts, anthropic-provider.ts)

**4.2 — Add OpenRouter to providerRegistry**
- Create `src/main/providers/openrouter-provider.ts`
- Extend `OpenAIProvider` with `baseUrl: 'https://openrouter.ai/api/v1'`
- Register in `provider-bridge.ts` when OpenRouter key exists

**4.3 — Register all providers in provider-bridge on startup**
- In `src/main/index.ts` or IPC setup:
  - For each provider with a saved key, instantiate and register the provider
  - This makes `stream:start` IPC handler work as a fallback

### Verification Checklist
- [ ] Gateway down → chat still works via direct API
- [ ] OpenRouter key → direct API call to openrouter.ai succeeds
- [ ] Fallback is transparent to user (no UI change, just works)

### Anti-Pattern Guards
- Do NOT use direct API as primary path — gateway is preferred (it handles auth refresh, etc.)
- Do NOT duplicate provider logic — extend OpenAIProvider for OpenRouter
- Do NOT remove gateway path — fallback is a safety net, not a replacement

---

## Phase 5: Final Verification

### Tasks

**5.1 — End-to-end test: OpenRouter**
- Paste OpenRouter API key → save → select model → send message → response streams

**5.2 — End-to-end test: OpenAI**
- Paste OpenAI API key → save → select GPT-4o → send message → response streams

**5.3 — End-to-end test: GitHub Copilot OAuth**
- GitHub device flow → authorize → select model → send message → response streams

**5.4 — End-to-end test: Fresh install onboarding**
- Delete `~/.openclaw/` and provider keys
- Launch app → onboarding → add provider → send first message

**5.5 — Gateway restart resilience**
- Send message → kill gateway process → message should fail gracefully
- Gateway auto-restarts within 5s → next message works

**5.6 — Grep for anti-patterns**
- `grep -r "npm install -g openclaw"` → should NOT exist anymore
- `grep -r "rate limit"` → only in error handling, not in normal flow
- `grep -r "type: 'api-key'"` → should NOT exist (OpenClaw uses `api_key`)

---

## Dependency Graph

```
Phase 1 (Bundle OpenClaw) ──→ Phase 2 (Fix Provider Routing) ──→ Phase 3 (Onboarding)
                                                                       │
                                                                       ▼
                                                              Phase 4 (Direct Fallback)
                                                                       │
                                                                       ▼
                                                              Phase 5 (Verification)
```

## Blockers

1. **BLOCKING:** Need OpenClaw repo from user to start Phase 1
   - Need: repo URL or local path
   - Need: which branch/version to use
   - Need: confirmation this is the same OpenClaw the app was designed to work with

2. **Non-blocking but important:** Need to verify OpenClaw supports `openrouter` provider
   - If not, Phase 2.2 becomes critical (add provider plugin)

---

## Estimated Effort

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 1: Bundle | Medium (depends on OpenClaw build system) | Medium (build complexity unknown) |
| Phase 2: Provider routing | Low-Medium | Low (if OpenClaw has plugins) / High (if not) |
| Phase 3: Onboarding | Low | Low (UI changes only) |
| Phase 4: Direct fallback | Medium | Low (OpenAI-compatible API) |
| Phase 5: Verification | Low | Low (testing only) |
