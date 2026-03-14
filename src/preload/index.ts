/**
 * Preload — full contextBridge for Nyra Desktop  (v2)
 * Adds: projects, prompts, theme, files:write-text, shortcuts:onCommandPalette
 */
import { contextBridge, ipcRenderer } from 'electron'

// ── Exported types (used by renderer directly) ────────────────────────────────
export type OpenClawStatus = 'idle' | 'checking' | 'installing' | 'starting' | 'running' | 'error' | 'stopped'
export interface McpServerConfig { command: string; args?: string[]; env?: Record<string, string> }
export interface FileReadResult  { name: string; size: number; content: string; mimeType: string }
export interface ScheduledTask   { id: string; name: string; prompt: string; cron?: string; fireAt?: string; enabled: boolean; lastRun?: number; nextRun?: number }

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

// ── API surface ───────────────────────────────────────────────────────────────
const nyraApi = {

  openclaw: {
    getStatus:          (): Promise<OpenClawStatus> => ipcRenderer.invoke('openclaw:status'),
    getWsUrl:           (): Promise<string>          => ipcRenderer.invoke('openclaw:ws-url'),
    restart:            (): Promise<boolean>         => ipcRenderer.invoke('openclaw:restart'),
    onStatusChange:     (cb: (s: OpenClawStatus) => void)         => ipcRenderer.on('openclaw:status-change', (_, s) => cb(s)),
    onLog:              (cb: (l: string) => void)                  => ipcRenderer.on('openclaw:log',          (_, l) => cb(l)),
    onInstallLog:       (cb: (l: string) => void)                  => ipcRenderer.on('openclaw:install-log',  (_, l) => cb(l)),
    onError:            (cb: (m: string) => void)                  => ipcRenderer.on('openclaw:error',        (_, m) => cb(m)),
    onReady:            (cb: () => void)                           => ipcRenderer.on('openclaw:ready',        ()     => cb()),
    onRestarting:       (cb: (i: { attempt: number; delay: number }) => void) => ipcRenderer.on('openclaw:restarting', (_, i) => cb(i)),
    removeAllListeners: () => ['openclaw:status-change','openclaw:log','openclaw:install-log','openclaw:error','openclaw:ready','openclaw:restarting'].forEach(c => ipcRenderer.removeAllListeners(c)),
  },

  providers: {
    list:       (): Promise<Array<{ id: string; enabled: boolean; hasKey: boolean; activeModel?: string }>> => ipcRenderer.invoke('providers:list'),
    catalog:    (): Promise<Array<{ id: string; label: string; icon: string; oauthUrl?: string; apiKeyPrefix?: string; models: Array<{ id: string; label: string; contextWindow?: number }> }>> => ipcRenderer.invoke('providers:catalog'),
    saveKey:    (id: string, key: string): Promise<boolean>   => ipcRenderer.invoke('providers:save-key', id, key),
    removeKey:  (id: string): Promise<boolean>                => ipcRenderer.invoke('providers:remove-key', id),
    setModel:   (id: string, modelId: string): Promise<boolean> => ipcRenderer.invoke('providers:set-model', id, modelId),
    resolve:    (): Promise<{ providerId: string; apiKey: string; model: string } | null> => ipcRenderer.invoke('providers:resolve'),
    openOauth:  (url: string): Promise<void>                  => ipcRenderer.invoke('providers:open-oauth', url),
    // OAuth PKCE flows
    startOAuth:       (id: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('providers:start-oauth', id),
    githubDeviceFlow: (): Promise<{ success: boolean; error?: string }>            => ipcRenderer.invoke('providers:github-device-flow'),
    // OAuth event listeners
    onOAuthComplete:  (cb: (d: { providerId: string; success: boolean }) => void) => ipcRenderer.on('providers:oauth-complete', (_, d) => cb(d)),
    onDeviceCode:     (cb: (d: { providerId: string; userCode: string; verificationUri: string }) => void) => ipcRenderer.on('providers:device-code', (_, d) => cb(d)),
    removeOAuthListeners: () => ['providers:oauth-complete', 'providers:device-code'].forEach(c => ipcRenderer.removeAllListeners(c)),
  },

  mcp: {
    list:   (): Promise<Record<string, McpServerConfig>>          => ipcRenderer.invoke('mcp:list'),
    add:    (n: string, s: McpServerConfig): Promise<boolean>     => ipcRenderer.invoke('mcp:add', n, s),
    remove: (n: string): Promise<boolean>                         => ipcRenderer.invoke('mcp:remove', n),
  },

  files: {
    requestDir:  (): Promise<string | null>          => ipcRenderer.invoke('files:request-dir'),
    requestFile: (): Promise<string[]>               => ipcRenderer.invoke('files:request-file'),
    read:        (p: string): Promise<FileReadResult | null> => ipcRenderer.invoke('files:read', p),
    saveDialog:  (name: string): Promise<string | null>      => ipcRenderer.invoke('files:save-dialog', name),
    write:       (p: string, content: string): Promise<boolean>     => ipcRenderer.invoke('files:write', p, content),
    writeText:   (p: string, content: string): Promise<boolean>     => ipcRenderer.invoke('files:write-text', p, content),
  },

  notify: {
    send:   (title: string, body: string)                     => ipcRenderer.invoke('notify:send', title, body),
    onInApp:(cb: (n: { title: string; body: string }) => void) => ipcRenderer.on('notification:in-app', (_, n) => cb(n)),
  },

  scheduled: {
    list:   (): Promise<ScheduledTask[]>                               => ipcRenderer.invoke('scheduled:list'),
    add:    (t: ScheduledTask): Promise<boolean>                       => ipcRenderer.invoke('scheduled:add', t),
    update: (id: string, p: Partial<ScheduledTask>): Promise<boolean>  => ipcRenderer.invoke('scheduled:update', id, p),
    remove: (id: string): Promise<boolean>                             => ipcRenderer.invoke('scheduled:remove', id),
  },

  projects: {
    list:   (): Promise<Project[]>                                    => ipcRenderer.invoke('projects:list'),
    create: (p: Project): Promise<boolean>                           => ipcRenderer.invoke('projects:create', p),
    update: (id: string, patch: Partial<Project>): Promise<boolean>  => ipcRenderer.invoke('projects:update', id, patch),
    delete: (id: string): Promise<boolean>                           => ipcRenderer.invoke('projects:delete', id),
  },

  prompts: {
    list:   (): Promise<SavedPrompt[]>                                       => ipcRenderer.invoke('prompts:list'),
    add:    (p: SavedPrompt): Promise<boolean>                              => ipcRenderer.invoke('prompts:add', p),
    update: (id: string, patch: Partial<SavedPrompt>): Promise<boolean>     => ipcRenderer.invoke('prompts:update', id, patch),
    remove: (id: string): Promise<boolean>                                  => ipcRenderer.invoke('prompts:remove', id),
  },

  theme: {
    get:      (): Promise<ThemeConfig>               => ipcRenderer.invoke('theme:get'),
    set:      (t: ThemeConfig): Promise<boolean>     => ipcRenderer.invoke('theme:set', t),
    onChange: (cb: (t: ThemeConfig) => void) => {
      const handler = (_: unknown, t: ThemeConfig) => cb(t)
      ipcRenderer.on('theme:changed', handler)
      return () => ipcRenderer.removeListener('theme:changed', handler)
    },
  },

  // ── Screen Capture ──────────────────────────────────────────────────────────
  screen: {
    capture:        (): Promise<{ base64: string; width: number; height: number; timestamp: number } | null>  => ipcRenderer.invoke('screen:capture'),
    captureWindow:  (title: string): Promise<{ base64: string; width: number; height: number; timestamp: number } | null> => ipcRenderer.invoke('screen:capture-window', title),
    listSources:    (): Promise<Array<{ id: string; name: string; type: 'screen' | 'window' }>>                           => ipcRenderer.invoke('screen:list-sources'),
  },

  // ── Desktop Control ────────────────────────────────────────────────────────
  desktop: {
    mouseMove:        (x: number, y: number)                              => ipcRenderer.invoke('desktop:mouse-move', x, y),
    mouseClick:       (x: number, y: number, button?: string)             => ipcRenderer.invoke('desktop:mouse-click', x, y, button),
    mouseDoubleClick: (x: number, y: number)                              => ipcRenderer.invoke('desktop:mouse-double-click', x, y),
    mouseScroll:      (x: number, y: number, dir: string, amount?: number) => ipcRenderer.invoke('desktop:mouse-scroll', x, y, dir, amount),
    mouseDrag:        (fx: number, fy: number, tx: number, ty: number)    => ipcRenderer.invoke('desktop:mouse-drag', fx, fy, tx, ty),
    typeText:         (text: string)                                       => ipcRenderer.invoke('desktop:type-text', text),
    pressKey:         (key: string)                                        => ipcRenderer.invoke('desktop:press-key', key),
    hotkey:           (mods: string[], key: string)                        => ipcRenderer.invoke('desktop:hotkey', mods, key),
    launchApp:        (name: string)                                       => ipcRenderer.invoke('desktop:launch-app', name),
    listApps:         (): Promise<Array<{ name: string; pid: number }>>    => ipcRenderer.invoke('desktop:list-apps'),
    focusApp:         (name: string)                                       => ipcRenderer.invoke('desktop:focus-app', name),
    activeWindow:     (): Promise<{ title: string; app: string; bounds: { x: number; y: number; width: number; height: number } } | null> => ipcRenderer.invoke('desktop:active-window'),
  },

  // ── Ollama (Local LLMs) ────────────────────────────────────────────────────
  ollama: {
    status:       (): Promise<boolean>             => ipcRenderer.invoke('ollama:status'),
    models:       (): Promise<Array<{ id: string; name: string; size: number; modifiedAt: string; parameterSize?: string; quantization?: string }>> => ipcRenderer.invoke('ollama:models'),
    providerDef:  (): Promise<{ id: string; label: string; icon: string; models: unknown[] }>                           => ipcRenderer.invoke('ollama:provider-def'),
    sync:         (): Promise<void>                => ipcRenderer.invoke('ollama:sync'),
    pull:         (name: string): Promise<boolean> => ipcRenderer.invoke('ollama:pull', name),
    delete:       (name: string): Promise<boolean> => ipcRenderer.invoke('ollama:delete', name),
    modelInfo:    (name: string): Promise<unknown>  => ipcRenderer.invoke('ollama:model-info', name),
    onPullProgress: (cb: (d: { modelName: string; status: string; completed?: number; total?: number }) => void) => ipcRenderer.on('ollama:pull-progress', (_, d) => cb(d)),
    removePullListener: () => ipcRenderer.removeAllListeners('ollama:pull-progress'),
  },

  app: {
    version:      (): Promise<string>        => ipcRenderer.invoke('app:version'),
    openExternal: (url: string)              => ipcRenderer.invoke('app:open-external', url),
    platform:     (): Promise<string>        => ipcRenderer.invoke('app:platform'),
  },

  zoom: {
    in:       ()                                    => ipcRenderer.send('zoom:in'),
    out:      ()                                    => ipcRenderer.send('zoom:out'),
    reset:    ()                                    => ipcRenderer.send('zoom:reset'),
    get:      (): Promise<number>                   => ipcRenderer.invoke('zoom:get'),
    onChange: (cb: (f: number) => void) => {
      const handler = (_: unknown, f: number) => cb(f)
      ipcRenderer.on('zoom:changed', handler)
      return () => ipcRenderer.removeListener('zoom:changed', handler)
    },
  },

  updater: {
    onAvailable: (cb: (info: unknown) => void) => ipcRenderer.on('updater:available', (_, i) => cb(i)),
    onReady:     (cb: (info: unknown) => void) => ipcRenderer.on('updater:ready',     (_, i) => cb(i)),
    install:     ()                            => ipcRenderer.send('updater:install'),
  },

  window: {
    minimize:    () => ipcRenderer.send('window:minimize'),
    maximize:    () => ipcRenderer.send('window:maximize'),
    close:       () => ipcRenderer.send('window:close'),
    hide:        () => ipcRenderer.send('window:hide'),
    fullscreen:  () => ipcRenderer.send('window:fullscreen'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  },

  shortcuts: {
    onNewChat: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('shortcut:new-chat', handler)
      return () => ipcRenderer.removeListener('shortcut:new-chat', handler)
    },
    onSettings: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('shortcut:settings', handler)
      return () => ipcRenderer.removeListener('shortcut:settings', handler)
    },
    onCommandPalette: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('shortcut:command-palette', handler)
      return () => ipcRenderer.removeListener('shortcut:command-palette', handler)
    },
    onDeepLink: (cb: (url: string) => void) => {
      const handler = (_: unknown, url: string) => cb(url)
      ipcRenderer.on('deeplink', handler)
      return () => ipcRenderer.removeListener('deeplink', handler)
    },
  },
}

contextBridge.exposeInMainWorld('nyra', nyraApi)

declare global {
  interface Window { nyra: typeof nyraApi }
}
