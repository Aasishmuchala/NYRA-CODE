/**
 * Vitest global setup — mocks native/Electron modules before any test imports.
 *
 * This runs before every test file, ensuring that transitive imports of
 * 'better-sqlite3' and 'electron' don't crash the test runner.
 */
import { vi } from 'vitest'

// ── Mock better-sqlite3 ──────────────────────────────────────────
// The actual module under test gets its db injected via `(instance as any).db = db`
// from the test's beforeEach, so this mock just prevents the import from failing.
vi.mock('better-sqlite3', () => {
  const MockDatabase = vi.fn(() => ({
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(() => []),
    })),
    exec: vi.fn(),
    close: vi.fn(),
    pragma: vi.fn(),
  }))
  return { default: MockDatabase, __esModule: true }
})

// ── Mock electron ────────────────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/mock/userData'
      if (name === 'home') return '/mock/home'
      return '/mock'
    }),
    getName: vi.fn(() => 'Nyra'),
    getVersion: vi.fn(() => '1.0.0'),
    on: vi.fn(),
    once: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    invoke: vi.fn(),
  },
  BrowserWindow: vi.fn(() => ({
    webContents: { send: vi.fn() },
    on: vi.fn(),
    show: vi.fn(),
    loadFile: vi.fn(),
    loadURL: vi.fn(),
  })),
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
  net: {
    request: vi.fn(() => ({
      on: vi.fn(),
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    })),
    isOnline: vi.fn(() => true),
  },
  globalShortcut: {
    register: vi.fn(),
    unregister: vi.fn(),
    isRegistered: vi.fn(),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: vi.fn(),
  },
}))

// ── Mock memory manager ──────────────────────────────────────────
// The mockMemoryManager object is mutable — tests set .db before calling init()
const mockMemoryManager = { db: null as any, dbPath: ':memory:' }
;(globalThis as any).__mockMemoryManager = mockMemoryManager

vi.mock('../../memory', () => ({
  memoryManager: (globalThis as any).__mockMemoryManager,
}))
