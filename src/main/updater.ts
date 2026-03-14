/**
 * Auto-Updater — GitHub Releases
 * Silently checks on launch, notifies via IPC when update is ready.
 */
import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'

export function initAutoUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('updater:available', info)
  })
  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('updater:ready', info)
  })
  autoUpdater.on('error', (err) => {
    console.warn('[Updater] Error:', err?.message)
  })

  // Check 3 seconds after app launches
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {/* ignore in dev */})
  }, 3000)
}

export function installUpdate() {
  autoUpdater.quitAndInstall(false, true)
}
