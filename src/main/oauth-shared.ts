/**
 * Shared OAuth utilities — callback HTML, flow mutex, validation retry
 *
 * Addresses code review findings:
 *  - #1:  Flow mutex prevents concurrent OAuth flows (port conflict)
 *  - #2:  Idempotent cleanup prevents resource leaks
 *  - #10: Retry logic for token validation
 *  - #14: Shared callback HTML (DRY)
 */

// ── Callback HTML template (shared across all OAuth providers) ───────────────

export function callbackHtml(title: string, message: string): string {
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

// ── OAuth Flow Mutex ─────────────────────────────────────────────────────────
// Prevents concurrent OAuth flows from fighting over the callback port.
// Only one browser-based OAuth flow can run at a time.

let activeFlow: { provider: string; cancel: () => void } | null = null

export function acquireFlowLock(provider: string, cancel: () => void): boolean {
  if (activeFlow) {
    console.warn(`[OAuth] Flow already active for ${activeFlow.provider}, rejecting ${provider}`)
    return false
  }
  activeFlow = { provider, cancel }
  return true
}

export function releaseFlowLock(): void {
  activeFlow = null
}

export function getActiveFlow(): string | null {
  return activeFlow?.provider ?? null
}

// ── Callback Port ────────────────────────────────────────────────────────────
// Non-standard ephemeral port chosen to avoid conflicts with common services.
// All OAuth vendors share this port since flows are serialized via mutex.
export const CALLBACK_PORT = 8085
export const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/oauth2callback`

// ── OAuth timeout (2 minutes — reduced from 5 per review #6) ─────────────────
export const OAUTH_TIMEOUT_MS = 2 * 60 * 1000

// ── Retry helper for token validation (#10) ──────────────────────────────────

/**
 * Retry a validation function once after a delay.
 * If both attempts fail, returns false.
 */
export async function validateWithRetry(
  validate: () => Promise<boolean>,
  retryDelayMs: number = 1500
): Promise<boolean> {
  const firstAttempt = await validate()
  if (firstAttempt) return true

  console.log('[OAuth] Validation failed, retrying after delay...')
  await new Promise(r => setTimeout(r, retryDelayMs))
  return validate()
}
