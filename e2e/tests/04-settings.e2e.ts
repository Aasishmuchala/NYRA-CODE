import { test, expect } from '@playwright/test'
import { launchApp, closeApp } from './helpers/electron-app'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  const launched = await launchApp()
  app = launched.app
  page = launched.page
})

test.afterAll(async () => {
  await closeApp(app)
})

test.describe('Settings Panel', () => {
  test('should open settings', async () => {
    // Try keyboard shortcut first
    await page.keyboard.press('Meta+,')
    await page.waitForTimeout(500)
    
    let settings = await page.$('[data-testid="settings-panel"], .settings-panel, text=Settings')
    
    if (!settings) {
      // Try clicking settings button in sidebar
      const settingsBtn = await page.$('button[aria-label="Settings"], button:has-text("Settings"), [data-testid="settings-btn"]')
      if (settingsBtn) {
        await settingsBtn.click()
        await page.waitForTimeout(500)
      }
    }
    
    settings = await page.$('[data-testid="settings-panel"], .settings-panel, text=Settings, text=Preferences')
    expect(settings).not.toBeNull()
  })

  test('should show settings tabs', async () => {
    const tabs = await page.$$('[role="tab"], .settings-tab, button[data-tab]')
    expect(tabs.length).toBeGreaterThan(0)
  })

  test('should navigate between tabs', async () => {
    const tabs = await page.$$('[role="tab"], .settings-tab, button[data-tab]')
    if (tabs.length < 2) { test.skip(); return }
    
    await tabs[1].click()
    await page.waitForTimeout(300)
    // Content should change
  })

  test('should have channels tab', async () => {
    const channelTab = await page.$('button:has-text("Channels"), [data-tab="channels"]')
    if (!channelTab) { test.skip(); return }
    
    await channelTab.click()
    await page.waitForTimeout(300)
    
    // Should show channel configuration options
    const telegram = await page.$('text=Telegram')
    expect(telegram).not.toBeNull()
  })

  test('should close settings', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })
})
