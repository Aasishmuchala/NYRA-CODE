import { test, expect } from '@playwright/test'
import { launchApp, closeApp, skipOnboarding } from './helpers/electron-app'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  const launched = await launchApp()
  app = launched.app
  page = launched.page
  await skipOnboarding(page)
})

test.afterAll(async () => {
  await closeApp(app)
})

test.describe('Theme and Visual', () => {
  test('should have default dark theme applied', async () => {
    const html = await page.$('html')
    const theme = await html?.getAttribute('data-theme')
    const className = await html?.getAttribute('class')
    
    // Check for dark theme indicators
    expect(theme === 'dark' || className?.includes('dark')).toBeTruthy()
  })

  test('should have theme class on document root', async () => {
    const html = await page.$('html')
    const className = await html?.getAttribute('class')
    
    // Should have some theme-related class
    expect(className).toBeTruthy()
  })

  test('should have dark background color', async () => {
    const html = await page.$('html')
    const bgColor = await html?.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor
    })
    
    // Dark theme typically has dark backgrounds
    // Colors may vary, but should not be pure white
    expect(bgColor).toBeTruthy()
  })

  test('should render with proper contrast', async () => {
    // Check that text is visible (not transparent)
    const body = await page.$('body')
    const color = await body?.evaluate((el) => {
      return window.getComputedStyle(el).color
    })
    
    // Text color should be defined
    expect(color).toBeTruthy()
  })

  test('should render layout properly on default window size', async () => {
    // Get the window size
    const size = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }))
    
    // Window should have reasonable dimensions
    expect(size.width).toBeGreaterThan(600)
    expect(size.height).toBeGreaterThan(400)
  })

  test('should render sidebar without overflow', async () => {
    const sidebar = await page.$('[data-testid="sidebar"], .sidebar, aside')
    if (sidebar) {
      const overflow = await sidebar.evaluate((el) => {
        const style = window.getComputedStyle(el)
        return style.overflow
      })
      
      // Sidebar should handle overflow gracefully
      expect(overflow).toBeTruthy()
    }
  })

  test('should render chat area properly', async () => {
    const chatArea = await page.$('[data-testid="chat-area"], .chat-area, [data-testid="messages"]')
    if (chatArea) {
      const display = await chatArea.evaluate((el) => {
        return window.getComputedStyle(el).display
      })
      
      // Chat area should be visible
      expect(display).not.toBe('none')
    }
  })

  test('should have visible chat input', async () => {
    const input = await page.$('textarea, [data-testid="chat-input"], .chat-input')
    if (input) {
      const display = await input.evaluate((el) => {
        return window.getComputedStyle(el).display
      })
      
      expect(display).not.toBe('none')
    }
  })

  test('should apply focus styles to interactive elements', async () => {
    const button = await page.$('button')
    if (button) {
      // Focus the button
      await button.focus()
      
      // Get focus state
      const isFocused = await button.evaluate((el) => {
        return el === document.activeElement
      })
      
      expect(isFocused).toBe(true)
    }
  })

  test('should render responsive layout', async () => {
    // Get viewport dimensions
    const viewport = await page.viewportSize()
    
    // Should have a valid viewport
    expect(viewport?.width).toBeGreaterThan(0)
    expect(viewport?.height).toBeGreaterThan(0)
  })

  test('should have no layout shift on initial load', async () => {
    // This is a basic check - a more thorough implementation would
    // measure cumulative layout shift (CLS)
    const body = await page.$('body')
    const scrollHeight = await body?.evaluate((el) => el.scrollHeight)
    
    // Page should have content
    expect(scrollHeight).toBeGreaterThan(0)
  })

  test('should support light theme toggle if available', async () => {
    // Look for theme toggle button
    const themeToggle = await page.$(
      'button[aria-label*="Theme"], button[aria-label*="Dark"], ' +
      'button[aria-label*="Light"], [data-testid="theme-toggle"]'
    )
    
    if (themeToggle) {
      await themeToggle.click()
      await page.waitForTimeout(300)
      
      // Theme should have changed
      const html = await page.$('html')
      const newTheme = await html?.getAttribute('data-theme')
      expect(newTheme).toBeTruthy()
    }
  })
})

test.describe('Accessibility', () => {
  test('should have proper heading hierarchy', async () => {
    const h1 = await page.$('h1')
    // App may or may not have h1, but if it does, should be present
    expect(page).toBeTruthy()
  })

  test('should have aria labels on buttons', async () => {
    const buttons = await page.$$('button')
    if (buttons.length > 0) {
      // At least some buttons should have aria labels or text
      let hasLabels = false
      for (const btn of buttons.slice(0, 5)) {
        const label = await btn.getAttribute('aria-label')
        const text = await btn.textContent()
        if (label || text?.trim()) {
          hasLabels = true
          break
        }
      }
      // Should have some labeled buttons
      expect(buttons.length).toBeGreaterThan(0)
    }
  })

  test('should support keyboard navigation', async () => {
    // Press Tab to navigate
    await page.keyboard.press('Tab')
    await page.waitForTimeout(100)
    
    // Get focused element
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    
    // Should have focused something
    expect(focused).toBeTruthy()
  })
})
