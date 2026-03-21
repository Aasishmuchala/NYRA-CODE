import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // Let vitest resolve .ts files properly from test import paths
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['src/main/__tests__/integration-flows.test.ts'],
    setupFiles: ['src/main/__tests__/helpers/vitest-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
    },
  },
})
