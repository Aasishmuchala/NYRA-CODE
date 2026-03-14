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
import {
  discoverPlugins, loadPlugin, unloadPlugin, installPlugin, removePlugin,
  enablePlugin, disablePlugin, getInstalledPlugins, getPluginTools
} from './plugins'
import {
  browseSkills, installSkill, removeSkill, getInstalledSkills,
  enableSkill, disableSkill
} from './skills-marketplace'
import { ptyManager } from './pty'
import { gitManager } from './git'
import { memoryManager } from './memory'
import { codebaseIndexer } from './indexer'
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
const TASKS_PATH      = path.join(app.getPath('userData'), 'nyra_scheduled_tasks.json')
const PROJECTS_PATH   = path.join(app.getPath('userData'), 'nyra_projects.json')
const PROMPTS_PATH    = path.join(app.getPath('userData'), 'nyra_prompts.json')
const THEME_PATH      = path.join(app.getPath('userData'), 'nyra_theme.json')
const ONBOARDED_PATH  = path.join(app.getPath('userData'), 'nyra_onboarded.json')

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
  ipcMain.handle('desktop:hotkey',              (_e, mods: string[], key: string)                           => hotkey(mods as import('./desktop-control').ModifierKey[], key))
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

  // ── Onboarding ──────────────────────────────────────────────────────────────
  ipcMain.handle('app:is-onboarded',   () => fs.existsSync(ONBOARDED_PATH))
  ipcMain.handle('app:set-onboarded',  () => { writeJson(ONBOARDED_PATH, { onboarded: true, at: Date.now() }); return true })

  // ── Terminal (PTY) ──────────────────────────────────────────────────────────
  ipcMain.handle('pty:create',  (_e, cwd?: string) => ptyManager.create(cwd))
  ipcMain.handle('pty:write',   (_e, id: string, data: string) => { ptyManager.write(id, data); return true })
  ipcMain.handle('pty:resize',  (_e, id: string, cols: number, rows: number) => { ptyManager.resize(id, cols, rows); return true })
  ipcMain.handle('pty:kill',    (_e, id: string) => { ptyManager.kill(id); return true })
  ipcMain.handle('pty:list',    () => ptyManager.list())
  ipcMain.handle('pty:history', (_e, id: string) => ptyManager.getHistory(id))
  // Relay PTY events to renderer
  ptyManager.on('data', (id: string, data: string) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('pty:data', id, data)
  })
  ptyManager.on('exit', (id: string, exitCode: number | undefined, signal: number | undefined) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('pty:exit', id, exitCode, signal)
  })

  // ── Git ────────────────────────────────────────────────────────────────────────
  ipcMain.handle('git:open',          (_e, repoPath: string) => gitManager.open(repoPath))
  ipcMain.handle('git:status',        () => gitManager.status())
  ipcMain.handle('git:diff',          (_e, staged?: boolean) => gitManager.diff(staged))
  ipcMain.handle('git:log',           (_e, maxCount?: number) => gitManager.log(maxCount))
  ipcMain.handle('git:branches',      () => gitManager.branches())
  ipcMain.handle('git:checkout',      (_e, branch: string) => gitManager.checkout(branch))
  ipcMain.handle('git:create-branch', (_e, name: string, from?: string) => gitManager.createBranch(name, from))
  ipcMain.handle('git:stage',         (_e, files: string[]) => gitManager.stage(files))
  ipcMain.handle('git:stage-all',     () => gitManager.stageAll())
  ipcMain.handle('git:commit',        (_e, message: string) => gitManager.commit(message))
  ipcMain.handle('git:push',          (_e, remote?: string, branch?: string) => gitManager.push(remote, branch))
  ipcMain.handle('git:pull',          (_e, remote?: string, branch?: string) => gitManager.pull(remote, branch))
  ipcMain.handle('git:stash',         (_e, message?: string) => gitManager.stash(message))
  ipcMain.handle('git:stash-pop',     () => gitManager.stashPop())
  ipcMain.handle('git:blame',         (_e, file: string) => gitManager.blame(file))
  ipcMain.handle('git:show-commit',   (_e, hash: string) => gitManager.showCommit(hash))
  ipcMain.handle('git:file-history',  (_e, file: string, maxCount?: number) => gitManager.fileHistory(file, maxCount))
  ipcMain.handle('git:diff-branch',   (_e, base: string, head?: string) => gitManager.diffBranch(base, head))
  ipcMain.handle('git:merge-base',    (_e, b1: string, b2: string) => gitManager.mergeBase(b1, b2))
  ipcMain.handle('git:is-open',       () => gitManager.isOpen())
  ipcMain.handle('git:repo-path',     () => gitManager.getRepoPath())

  // ── Memory ─────────────────────────────────────────────────────────────────────
  ipcMain.handle('memory:set-fact',          (_e, cat: string, key: string, val: string, opts?: { confidence?: number; source?: string }) => { memoryManager.setFact(cat, key, val, opts); return true })
  ipcMain.handle('memory:get-fact',          (_e, cat: string, key: string) => memoryManager.getFact(cat, key))
  ipcMain.handle('memory:search-facts',      (_e, q: string, cat?: string) => memoryManager.searchFacts(q, cat))
  ipcMain.handle('memory:list-facts',        (_e, cat?: string) => memoryManager.listFacts(cat))
  ipcMain.handle('memory:delete-fact',       (_e, cat: string, key: string) => memoryManager.deleteFact(cat, key))
  ipcMain.handle('memory:add-summary',       (_e, sessionId: string, summary: string, topics?: string[]) => { memoryManager.addSummary(sessionId, summary, topics); return true })
  ipcMain.handle('memory:get-summaries',     (_e, sessionId?: string, limit?: number) => memoryManager.getSummaries(sessionId, limit))
  ipcMain.handle('memory:search-summaries',  (_e, q: string, limit?: number) => memoryManager.searchSummaries(q, limit))
  ipcMain.handle('memory:set-project-ctx',   (_e, pid: string, key: string, val: string) => { memoryManager.setProjectContext(pid, key, val); return true })
  ipcMain.handle('memory:get-project-ctx',   (_e, pid: string, key?: string) => memoryManager.getProjectContext(pid, key))
  ipcMain.handle('memory:delete-project-ctx',(_e, pid: string, key?: string) => { memoryManager.deleteProjectContext(pid, key); return true })
  ipcMain.handle('memory:build-context',     (_e, opts?: { projectId?: string; maxFacts?: number; maxSummaries?: number }) => memoryManager.buildContextBlock(opts))
  ipcMain.handle('memory:stats',             () => memoryManager.stats())

  // ── Codebase Indexer ───────────────────────────────────────────────────────────
  ipcMain.handle('indexer:open',           (_e, root: string) => codebaseIndexer.open(root))
  ipcMain.handle('indexer:close',          () => codebaseIndexer.close())
  ipcMain.handle('indexer:is-open',        () => codebaseIndexer.isOpen())
  ipcMain.handle('indexer:search',         (_e, q: string, opts?: { ext?: string; limit?: number }) => codebaseIndexer.search(q, opts))
  ipcMain.handle('indexer:search-symbols', (_e, name: string) => codebaseIndexer.searchSymbols(name))
  ipcMain.handle('indexer:get-file',       (_e, relPath: string) => codebaseIndexer.getFile(relPath))
  ipcMain.handle('indexer:list',           (_e, opts?: { ext?: string; dir?: string }) => codebaseIndexer.list(opts))
  ipcMain.handle('indexer:stats',          () => codebaseIndexer.stats())
  // Relay indexer events
  codebaseIndexer.on('indexed', (filePath: string) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('indexer:indexed', filePath)
  })
  codebaseIndexer.on('ready', (stats: unknown) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('indexer:ready', stats)
  })

  // ── Plugins ──────────────────────────────────────────────────────────────────
  ipcMain.handle('plugins:list',      () => getInstalledPlugins())
  ipcMain.handle('plugins:discover',  () => discoverPlugins())
  ipcMain.handle('plugins:install',   (_e, source: string) => installPlugin(source))
  ipcMain.handle('plugins:remove',    (_e, id: string) => { removePlugin(id); return true })
  ipcMain.handle('plugins:enable',    (_e, id: string) => { enablePlugin(id); return true })
  ipcMain.handle('plugins:disable',   (_e, id: string) => { disablePlugin(id); return true })
  ipcMain.handle('plugins:load',      (_e, id: string) => loadPlugin(id))
  ipcMain.handle('plugins:unload',    (_e, id: string) => { unloadPlugin(id); return true })
  ipcMain.handle('plugins:tools',     (_e, id: string) => getPluginTools(id))

  // ── Skills Marketplace ──────────────────────────────────────────────────────
  ipcMain.handle('skills:browse',     (_e, query?: string, category?: string) => browseSkills(query, category))
  ipcMain.handle('skills:install',    (_e, id: string) => { installSkill(id); return true })
  ipcMain.handle('skills:remove',     (_e, id: string) => { removeSkill(id); return true })
  ipcMain.handle('skills:installed',  () => getInstalledSkills())
  ipcMain.handle('skills:enable',     (_e, id: string) => { enableSkill(id); return true })
  ipcMain.handle('skills:disable',    (_e, id: string) => { disableSkill(id); return true })

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
