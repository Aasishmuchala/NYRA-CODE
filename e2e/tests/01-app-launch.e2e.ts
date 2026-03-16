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

test.describe('App Launch', () => {
  test('should open a window', async () => {
    const windows = app.windows()
    expect(windows.length).toBeGreaterThanOrEqual(1)
  })

  test('should have correct title', async () => {
    const title = await page.title()
    expect(title).toContain('Nyra')
  })

  test('should have the title bar visible', async () => {
    // The custom title bar should be rendered
    const titleBar = await page.$('.title-bar, [data-testid="title-bar"], .drag-region')
    expect(titleBar).not.toBeNull()
  })

  test('should expose window.nyra API', async () => {
    const hasApi = await page.evaluate(() => {
      return typeof (window as any).nyra !== 'undefined'
    })
    expect(hasApi).toBe(true)
  })

  test('should have openclaw bridge methods', async () => {
    const methods = await page.evaluate(() => {
      const nyra = (window as any).nyra
      return {
        hasOpenClaw: !!nyra?.openclaw,
        hasConfigGet: typeof nyra?.openclaw?.configGet === 'function',
        hasChannelsStatus: typeof nyra?.openclaw?.channelsStatus === 'function',
        hasModels: typeof nyra?.openclaw?.models === 'function',
      }
    })
    expect(methods.hasOpenClaw).toBe(true)
    expect(methods.hasConfigGet).toBe(true)
    expect(methods.hasChannelsStatus).toBe(true)
  })
})
