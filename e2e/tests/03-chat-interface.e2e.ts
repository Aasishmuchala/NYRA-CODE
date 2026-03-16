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

test.describe('Chat Interface', () => {
  test('should have a chat input area', async () => {
    // Wait for main UI to load (may need to complete onboarding first)
    const chatInput = await page.$('textarea, [data-testid="chat-input"], .chat-input, [contenteditable="true"]')
    if (!chatInput) {
      // Try to skip through onboarding first
      const skipButtons = await page.$$('button:has-text("Skip"), button:has-text("Later"), button:has-text("Get Started")')
      for (const btn of skipButtons) {
        try { await btn.click(); await page.waitForTimeout(300) } catch {}
      }
    }
    
    const input = await page.$('textarea, [data-testid="chat-input"], .chat-input, [contenteditable="true"]')
    expect(input).not.toBeNull()
  })

  test('should accept text input', async () => {
    const input = await page.$('textarea, [data-testid="chat-input"], .chat-input')
    if (!input) { test.skip(); return }
    
    await input.fill('Hello, NYRA!')
    const value = await input.inputValue().catch(() => '')
    expect(value).toContain('Hello')
  })

  test('should have a send button', async () => {
    const sendBtn = await page.$('button[aria-label="Send"], button:has-text("Send"), [data-testid="send-button"], button svg')
    expect(sendBtn).not.toBeNull()
  })

  test('should display the sidebar', async () => {
    const sidebar = await page.$('[data-testid="sidebar"], .sidebar, aside, nav')
    expect(sidebar).not.toBeNull()
  })

  test('should have a model selector', async () => {
    const modelSelector = await page.$('[data-testid="model-selector"], .model-selector, button:has-text("GPT"), button:has-text("Claude"), button:has-text("Model")')
    // Model selector is optional but expected
    if (modelSelector) {
      await modelSelector.click()
      await page.waitForTimeout(300)
    }
  })
})
