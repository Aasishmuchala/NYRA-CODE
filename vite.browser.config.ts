import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Standalone Vite config for running the renderer in a browser.
 * Usage: npx vite --config vite.browser.config.ts src/renderer
 */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
})
