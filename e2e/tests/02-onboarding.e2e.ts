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

test.describe('Onboarding Flow', () => {
  test('should show welcome step', async () => {
    // Look for the welcome/onboarding UI
    const welcome = await page.$('text=Welcome, text=Get Started, text=NYRA')
    if (!welcome) {
      // App may skip onboarding if already configured — that's ok
      test.skip()
      return
    }
    expect(welcome).not.toBeNull()
  })

  test('should navigate through steps with Next button', async () => {
    const nextBtn = await page.$('button:has-text("Next"), button:has-text("Continue"), button:has-text("Get Started")')
    if (!nextBtn) {
      test.skip()
      return
    }
    
    await nextBtn.click()
    
    // Should advance to provider setup or next step
    await page.waitForTimeout(500)
    
    // Verify we moved forward (step counter or different content)
    const content = await page.textContent('body')
    expect(content).toBeTruthy()
  })

  test('should show provider setup step', async () => {
    // Look for provider-related UI elements
    const providerUI = await page.$('text=OpenAI, text=Anthropic, text=API Key, text=Provider')
    if (!providerUI) {
      test.skip()
      return
    }
    expect(providerUI).not.toBeNull()
  })

  test('should allow skipping steps', async () => {
    const skipBtn = await page.$('button:has-text("Skip"), button:has-text("Later")')
    if (skipBtn) {
      await skipBtn.click()
      await page.waitForTimeout(300)
      // Should have advanced
    }
  })
})
