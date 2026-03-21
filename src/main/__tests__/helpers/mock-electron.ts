/**
 * Mock Electron module for testing
 */
import { vi } from 'vitest'

export function setupElectronMocks() {
  vi.mock('electron', () => ({
    app: {
      getPath: vi.fn((name: string) => {
        if (name === 'userData') return '/mock/userData'
        if (name === 'home') return '/mock/home'
        return '/mock'
      }),
      getName: vi.fn(() => 'Nyra'),
      getVersion: vi.fn(() => '1.0.0'),
    },
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      invoke: vi.fn(),
    },
    BrowserWindow: vi.fn(() => ({
      webContents: {
        send: vi.fn(),
      },
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
      request: vi.fn((opts) => ({
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
}
