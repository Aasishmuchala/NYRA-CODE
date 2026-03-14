/**
 * Full IPC Handler Registry — all renderer <-> main channels
 * v2 — adds Projects, Prompts, Theme, text-write, ⌘K shortcut channel
 */
import { ipcMain, shell, dialog, BrowserWindow, app } from 'electron'
import { openClawManager } from './openclaw'
import { PROXY_WS_URL } from './wsproxy'
import { listMcpServers, addMcpServer, removeMcpServer, McpServerConfig } from './mcp'
import {
  listProviders, getCatalog, saveApiKey, removeApiKey,
  setActiveModel, resolveProvider
} from './providers'
import { startOAuthFlow, startGitHubDeviceFlow } from './oauth'
import { sendNotification } from './notifications'
import { captureScreen, captureWindow, listSources } from './screen'
import {
  mouseMove, mouseClick, mouseDoubleClick, mouseScroll, mouseDrag,
  typeText, pressKey, hotkey,
  launchApp, listRunningApps, focusApp, getActiveWindow,
} from './desktop-control'
import { isOllamaRunning, getOllamaModels, getOllamaProviderDef, syncOllamaToOpenClaw, pullModel, deleteModel, getModelInfo } from './ollama'
import * as fs from 'fs'
import * as path from 'path'

// ── Filesystem sandbox ─────────────────────────────────────────────────────────
// Only allow file read/write operations within the user's home directory.
// This prevents a compromised renderer from accessing system files.
const HOME_DIR = require('os').homedir()

function assertSafePath(p: string): void {
  const resolved = path.resolve(p)
  // Allow paths inside user home, app userData, and temp dir
  const allowedRoots = [HOME_DIR, app.getPath('userData'), app.getPath('temp')]
  const isSafe = allowedRoots.some(root => resolved.startsWith(root + path.sep) || resolved === root)
  if (!isSafe) {
    throw new Error(`Path access denied (outside allowed directories): ${resolved}`)
  }
}

// ── Paths ──────────────────────────────────────────────────────────────────────
const TASKS_PATH    = path.join(app.getPath('userData'), 'nyra_scheduled_tasks.json')
const PROJECTS_PATH = path.join(app.getPath('userData'), 'nyra_projects.json')
const PROMPTS_PATH  = path.join(app.getPath('userData'), 'nyra_prompts.json')
const THEME_PATH    = path.join(app.getPath('userData'), 'nyra_theme.json')

// ── Types ──────────────────────────────────────────────────────────────────────
interface ScheduledTask {
  id: string; name: string; prompt: string
  cron?: string; fireAt?: string; enabled: boolean
  lastRun?: number; nextRun?: number
}

export interface Project {
  id: string; name: string; emoji: string; color: string
  systemPrompt?: string; model?: string
  sessionIds: string[]; pinnedSessionIds: string[]
  createdAt: number; updatedAt: number
}

export interface SavedPrompt {
  id: string; title: string; content: string
  tags: string[]; createdAt: number
}

export interface ThemeConfig {
  mode: 'dark' | 'dim' | 'light'
  accent: 'indigo' | 'violet' | 'blue' | 'emerald' | 'rose'
  fontSize: 'sm' | 'md' | 'lg'
}

// ── JSON helpers ───────────────────────────────────────────────────────────────
function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T } catch { return fallback }
}
function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

const readTasks    = (): ScheduledTask[] => readJson(TASKS_PATH, [])
const writeTasks   = (t: ScheduledTask[]) => writeJson(TASKS_PATH, t)
const readProjects = (): Project[]       => readJson(PROJECTS_PATH, [])
const writeProjects= (p: Project[])      => writeJson(PROJECTS_PATH, p)
const readPrompts  = (): SavedPrompt[]   => readJson(PROMPTS_PATH, [])
const writePrompts = (p: SavedPrompt[])  => writeJson(PROMPTS_PATH, p)
const defaultTheme: ThemeConfig = { mode: 'dark', accent: 'indigo', fontSize: 'md' }

// ── Registration ───────────────────────────────────────────────────────────────
export function registerIpcHandlers(mainWindow: BrowserWindow): void {

  // ── OpenClaw ─────────────────────────────────────────────────────────────────
  ipcMain.handle('openclaw:status', () => openClawManager.getStatus())
  ipcMain.handle('openclaw:ws-url', () => PROXY_WS_URL)
  ipcMain.handle('openclaw:restart', async () => {
    openClawManager.shutdown()
    await openClawManager.initialize()
    return true
  })
  const fwd = (ev: string, ch: string) =>
    openClawManager.on(ev, (...a) => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send(ch, ...a) })
  fwd('status', 'openclaw:status-change')
  fwd('gateway-log', 'openclaw:log')
  fwd('install-log', 'openclaw:install-log')
  fwd('restarting',  'openclaw:restarting')
  fwd('ready',       'openclaw:ready')
  openClawManager.on('error', (err: Error) => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('openclaw:error', err.message) })

  // ── Providers ───────────────────────────────────────────────────────────────
  ipcMain.handle('providers:list',         () => listProviders())
  ipcMain.handle('providers:catalog',      () => getCatalog())
  ipcMain.handle('providers:save-key',     (_e, id: string, key: string) => saveApiKey(id, key))
  ipcMain.handle('providers:remove-key',   (_e, id: string)              => removeApiKey(id))
  ipcMain.handle('providers:set-model',    (_e, id: string, modelId: string) => setActiveModel(id, modelId))
  ipcMain.handle('providers:resolve',      () => resolveProvider())
  ipcMain.handle('providers:open-oauth',   (_e, url: string) => shell.openExternal(url))

  // ── OAuth PKCE flows ──────────────────────────────────────────────────────
  ipcMain.handle('providers:start-oauth',  (_e, providerId: string) => startOAuthFlow(providerId, mainWindow))
  ipcMain.handle('providers:github-device-flow', () => startGitHubDeviceFlow(mainWindow))

  // ── MCP ───────────────────────────────────────────────────────────────────────
  ipcMain.handle('mcp:list',   () => listMcpServers())
  ipcMain.handle('mcp:add',    (_e, n: string, s: McpServerConfig) => { addMcpServer(n, s); return true })
  ipcMain.handle('mcp:remove', (_e, n: string) => { removeMcpServer(n); return true })

  // ── Files ─────────────────────────────────────────────────────────────────────
  ipcMain.handle('files:request-dir', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('files:request-file', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('files:read', (_e, p: string) => {
    try {
      assertSafePath(p)
      const s = fs.statSync(p)
      if (s.size > 50 * 1024 * 1024) return { error: 'File too large' }
      return { name: path.basename(p), size: s.size, content: fs.readFileSync(p).toString('base64'), mimeType: guessMime(p) }
    } catch (err: any) {
      if (err.message?.includes('Path access denied')) return { error: err.message }
      return null
    }
  })
  ipcMain.handle('files:save-dialog', async (_e, name: string) => {
    const r = await dialog.showSaveDialog(mainWindow, { defaultPath: name })
    return r.canceled ? null : r.filePath
  })
  ipcMain.handle('files:write',      (_e, p: string, c: string)       => { assertSafePath(p); fs.writeFileSync(p, Buffer.from(c, 'base64')); return true })
  ipcMain.handle('files:write-text', (_e, p: string, content: string) => { assertSafePath(p); fs.writeFileSync(p, content, 'utf8'); return true })

  // ── Notifications ─────────────────────────────────────────────────────────────
  ipcMain.handle('notify:send', (_e, title: string, body: string) => sendNotification(title, body, mainWindow))

  // ── Scheduled Tasks ───────────────────────────────────────────────────────────
  ipcMain.handle('scheduled:list',   () => readTasks())
  ipcMain.handle('scheduled:add',    (_e, t: ScheduledTask)           => { const ts = readTasks(); ts.push(t); writeTasks(ts); return true })
  ipcMain.handle('scheduled:update', (_e, id: string, p: Partial<ScheduledTask>) => { writeTasks(readTasks().map(t => t.id === id ? { ...t, ...p } : t)); return true })
  ipcMain.handle('scheduled:remove', (_e, id: string)                 => { writeTasks(readTasks().filter(t => t.id !== id)); return true })

  // ── Projects ──────────────────────────────────────────────────────────────────
  ipcMain.handle('projects:list',   () => readProjects())
  ipcMain.handle('projects:create', (_e, p: Project) => {
    const ps = readProjects(); ps.push(p); writeProjects(ps); return true
  })
  ipcMain.handle('projects:update', (_e, id: string, patch: Partial<Project>) => {
    writeProjects(readProjects().map(p => p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p))
    return true
  })
  ipcMain.handle('projects:delete', (_e, id: string) => {
    writeProjects(readProjects().filter(p => p.id !== id)); return true
  })

  // ── Saved Prompts ─────────────────────────────────────────────────────────────
  ipcMain.handle('prompts:list',   () => readPrompts())
  ipcMain.handle('prompts:add',    (_e, p: SavedPrompt) => {
    const ps = readPrompts(); ps.push(p); writePrompts(ps); return true
  })
  ipcMain.handle('prompts:update', (_e, id: string, patch: Partial<SavedPrompt>) => {
    writePrompts(readPrompts().map(p => p.id === id ? { ...p, ...patch } : p)); return true
  })
  ipcMain.handle('prompts:remove', (_e, id: string) => {
    writePrompts(readPrompts().filter(p => p.id !== id)); return true
  })

  // ── Theme ─────────────────────────────────────────────────────────────────────
  ipcMain.handle('theme:get', () => readJson(THEME_PATH, defaultTheme))
  ipcMain.handle('theme:set', (_e, theme: unknown) => {
    writeJson(THEME_PATH, theme)
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('theme:changed', theme)
    return true
  })

  // ── Screen Capture ──────────────────────────────────────────────────────────
  ipcMain.handle('screen:capture',        ()                       => captureScreen())
  ipcMain.handle('screen:capture-window', (_e, title: string)      => captureWindow(title))
  ipcMain.handle('screen:list-sources',   ()                       => listSources())

  // ── Desktop Control ────────────────────────────────────────────────────────
  ipcMain.handle('desktop:mouse-move',          (_e, x: number, y: number)                                 => mouseMove(x, y))
  ipcMain.handle('desktop:mouse-click',         (_e, x: number, y: number, button?: string)                => mouseClick(x, y, button as 'left' | 'right' | 'middle'))
  ipcMain.handle('desktop:mouse-double-click',  (_e, x: number, y: number)                                 => mouseDoubleClick(x, y))
  ipcMain.handle('desktop:mouse-scroll',        (_e, x: number, y: number, dir: string, amount?: number)   => mouseScroll(x, y, dir as 'up' | 'down', amount))
  ipcMain.handle('desktop:mouse-drag',          (_e, fx: number, fy: number, tx: number, ty: number)       => mouseDrag(fx, fy, tx, ty))
  ipcMain.handle('desktop:type-text',           (_e, text: string)                                          => typeText(text))
  ipcMain.handle('desktop:press-key',           (_e, key: string)                                           => pressKey(key))
  ipcMain.handle('desktop:hotkey',              (_e, mods: string[], key: string)                           => hotkey(mods, key))
  ipcMain.handle('desktop:launch-app',          (_e, name: string)                                          => launchApp(name))
  ipcMain.handle('desktop:list-apps',           ()                                                          => listRunningApps())
  ipcMain.handle('desktop:focus-app',           (_e, name: string)                                          => focusApp(name))
  ipcMain.handle('desktop:active-window',       ()                                                          => getActiveWindow())

  // ── Ollama (Local LLMs) ────────────────────────────────────────────────────
  ipcMain.handle('ollama:status',       () => isOllamaRunning())
  ipcMain.handle('ollama:models',       () => getOllamaModels())
  ipcMain.handle('ollama:provider-def', () => getOllamaProviderDef())
  ipcMain.handle('ollama:sync',         () => syncOllamaToOpenClaw())
  ipcMain.handle('ollama:pull',         (_e, modelName: string) => {
    // Stream progress back to renderer
    return pullModel(modelName, (progress) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('ollama:pull-progress', { modelName, ...progress })
    })
  })
  ipcMain.handle('ollama:delete',       (_e, modelName: string) => deleteModel(modelName))
  ipcMain.handle('ollama:model-info',   (_e, modelName: string) => getModelInfo(modelName))

  // ── App ───────────────────────────────────────────────────────────────────────
  ipcMain.handle('app:version',       () => app.getVersion())
  ipcMain.handle('app:open-external', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('app:platform',      () => process.platform)

  // ── Window ────────────────────────────────────────────────────────────────────
  ipcMain.on('window:minimize',  () => mainWindow?.minimize())
  ipcMain.on('window:maximize',  () => { if (mainWindow) mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize() })
  ipcMain.on('window:close',     () => mainWindow?.close())
  ipcMain.on('window:hide',      () => mainWindow?.hide())
  ipcMain.on('window:fullscreen',() => { if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen()) })
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)
}

// ── MIME helper ───────────────────────────────────────────────────────────────
function guessMime(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase() ?? ''
  const m: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    json: 'application/json', ts: 'text/typescript', tsx: 'text/typescript',
    js: 'text/javascript', jsx: 'text/javascript', html: 'text/html',
    css: 'text/css', py: 'text/x-python', go: 'text/x-go',
    sh: 'text/x-shellscript', yaml: 'text/yaml', yml: 'text/yaml',
    rs: 'text/x-rust', cpp: 'text/x-c++', c: 'text/x-c', java: 'text/x-java',
    rb: 'text/x-ruby', swift: 'text/x-swift', kt: 'text/x-kotlin',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip', mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav'
  }
  return m[ext] ?? 'application/octet-stream'
}
