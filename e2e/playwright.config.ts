import { defineConfig } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './tests',
  timeout: 90_000, // Extended timeout for Electron app initialization
  globalTimeout: 10 * 60_000, // 10 minutes total timeout
  expect: {
    timeout: 15_000, // Assertion timeout
  },
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Electron tests MUST run serially (single worker)
  reporter: [
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
    ['list'],
    ['junit', { outputFile: '../junit.xml' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  fullyParallel: false, // Disable parallelization for Electron
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.e2e.ts',
    },
  ],
  webServer: undefined, // No web server needed for Electron
})
