/**
 * Native OS Notification helper
 */
import { Notification, BrowserWindow } from 'electron'
import * as path from 'path'

export function sendNotification(
  title: string,
  body: string,
  win?: BrowserWindow
) {
  // Only show OS notification if window is hidden or not focused
  if (win && win.isFocused()) {
    // Send as in-app banner instead
    win.webContents.send('notification:in-app', { title, body })
    return
  }

  if (Notification.isSupported()) {
    const n = new Notification({
      title,
      body,
      icon: path.join(__dirname, '../../resources/icon.png'),
      silent: false
    })
    n.on('click', () => {
      win?.show()
      win?.focus()
    })
    n.show()
  }
}
