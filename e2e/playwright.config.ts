import { defineConfig } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 1,
  workers: 1,  // Electron tests must run serially
  reporter: [['html', { outputFolder: '../playwright-report' }], ['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.e2e.ts',
    },
  ],
})
