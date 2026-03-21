import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  cacheDir: '/sessions/vigilant-trusting-brahmagupta/.vite-cache',
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@': resolve(__dirname, 'src/renderer'),
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  }
})
