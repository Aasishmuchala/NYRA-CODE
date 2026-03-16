/**
 * Electron App Test Helper
 * Launches the NYRA Desktop app for E2E testing
 */
import { _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'

export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [path.join(__dirname, '../../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NYRA_E2E_TEST: '1',
    },
  })

  // Wait for the first BrowserWindow to open
  const page = await app.firstWindow()
  
  // Wait for the app to be fully loaded (boot splash to finish)
  await page.waitForLoadState('domcontentloaded')
  
  // Wait for either onboarding or main UI to appear
  await page.waitForSelector('[data-testid="app-root"], [data-testid="onboarding"], .boot-splash-done, .chat-input', {
    timeout: 30_000,
  })

  return { app, page }
}

export async function closeApp(app: ElectronApplication): Promise<void> {
  try {
    await app.close()
  } catch {
    // App may already be closed
  }
}
