/**
 * System Tray Manager
 * Creates a tray icon so Nyra lives in the menu bar / system tray.
 * Clicking it shows/hides the main window.
 */

import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron'
import * as path from 'path'

let tray: Tray | null = null

export function createTray(mainWindow: BrowserWindow): void {
  // Use a 22×22 icon (macOS template image for light/dark mode support)
  const iconPath = path.join(__dirname, '../../resources/tray-icon.png')
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
    // On macOS use template image for auto dark/light adaptation
    if (process.platform === 'darwin') icon.setTemplateImage(true)
  } catch {
    // Fallback: empty 1×1 pixel so tray still works even without the asset
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('Nyra')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Nyra',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Nyra',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // Single-click toggles window on all platforms
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
