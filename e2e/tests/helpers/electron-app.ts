/**
 * Electron App Test Helper
 * Launches the NYRA Desktop app for E2E testing with comprehensive setup and teardown
 */
import { _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const APP_MAIN_PATH = path.join(__dirname, '../../../out/main/index.js')

/**
 * Validates that the app binary exists before launching
 */
function validateAppBinary(): void {
  if (!fs.existsSync(APP_MAIN_PATH)) {
    throw new Error(
      `Electron app binary not found at ${APP_MAIN_PATH}. ` +
      `Please run 'npm run build' before running E2E tests.`
    )
  }
}

/**
 * Launches the NYRA Desktop Electron app for testing
 * Waits for the app to fully initialize and UI to be ready
 */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  validateAppBinary()

  const app = await electron.launch({
    args: [APP_MAIN_PATH],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NYRA_E2E_TEST: '1',
      DEBUG: 'nyra:*', // Enable debug logging for troubleshooting
    },
  })

  // Wait for the first BrowserWindow to open
  const page = await app.firstWindow()

  // Wait for the app to be fully loaded (boot splash to finish)
  await page.waitForLoadState('domcontentloaded')

  // Wait for either onboarding or main UI to appear
  // Increased timeout to account for slow builds
  await page.waitForSelector(
    '[data-testid="app-root"], [data-testid="onboarding"], .boot-splash-done, .chat-input',
    { timeout: 45_000 }
  )

  return { app, page }
}

/**
 * Closes the Electron app gracefully
 * Handles edge cases where app may already be closed
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  try {
    await app.close()
  } catch (error) {
    // App may already be closed during test failure
    console.warn('App close error (may be already closed):', error)
  }
}

/**
 * Waits for a specific UI element with custom logging
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout = 10_000
): Promise<void> {
  await page.waitForSelector(selector, { timeout })
}

/**
 * Skips onboarding flow by clicking through Next/Skip buttons
 * Useful when onboarding state is unpredictable
 */
export async function skipOnboarding(page: Page): Promise<void> {
  try {
    // Try multiple iterations to click through all onboarding screens
    for (let i = 0; i < 10; i++) {
      const nextBtn = await page.$('button:has-text("Next"), button:has-text("Continue"), button:has-text("Get Started"), button:has-text("Skip")')
      if (!nextBtn) break

      await nextBtn.click()
      await page.waitForTimeout(300)

      // Check if we've reached the main app
      const mainApp = await page.$('[data-testid="app-root"], .chat-input')
      if (mainApp) break
    }
  } catch (error) {
    console.warn('Onboarding skip error:', error)
  }
}

/**
 * Gets app window count
 */
export async function getWindowCount(app: ElectronApplication): Promise<number> {
  return app.windows().length
}

/**
 * Gets the first visible window
 */
export async function getFirstWindow(app: ElectronApplication): Promise<Page | null> {
  const windows = app.windows()
  return windows.length > 0 ? windows[0] : null
}
