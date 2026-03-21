/**
 * IPC Listener Cleanup — extracted for Rollup compatibility
 */

export const cleanupFns: Array<() => void> = []

export function cleanupIpcListeners(): void {
  for (const fn of cleanupFns) {
    try {
      fn()
    } catch (err) {
      console.error('[IPC] Cleanup error:', err)
    }
  }
  cleanupFns.length = 0
}
