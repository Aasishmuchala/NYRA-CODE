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
    isOnboarded:  (): Promise<boolean>       => ipcRenderer.invoke('app:is-onboarded'),
    setOnboarded: (): Promise<boolean>       => ipcRenderer.invoke('app:set-onboarded'),
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

  // ── Terminal (PTY) ──────────────────────────────────────────────────────────
  pty: {
    create:   (cwd?: string): Promise<string>         => ipcRenderer.invoke('pty:create', cwd),
    write:    (id: string, data: string): Promise<boolean> => ipcRenderer.invoke('pty:write', id, data),
    resize:   (id: string, cols: number, rows: number): Promise<boolean> => ipcRenderer.invoke('pty:resize', id, cols, rows),
    kill:     (id: string): Promise<boolean>           => ipcRenderer.invoke('pty:kill', id),
    list:     (): Promise<Array<{ id: string; cwd: string; pid: number }>> => ipcRenderer.invoke('pty:list'),
    history:  (id: string): Promise<string>            => ipcRenderer.invoke('pty:history', id),
    onData:   (cb: (id: string, data: string) => void) => {
      const handler = (_: unknown, id: string, data: string) => cb(id, data)
      ipcRenderer.on('pty:data', handler)
      return () => ipcRenderer.removeListener('pty:data', handler)
    },
    onExit:   (cb: (id: string, exitCode?: number, signal?: number) => void) => {
      const handler = (_: unknown, id: string, exitCode?: number, signal?: number) => cb(id, exitCode, signal)
      ipcRenderer.on('pty:exit', handler)
      return () => ipcRenderer.removeListener('pty:exit', handler)
    },
  },

  // ── Git ────────────────────────────────────────────────────────────────────────
  git: {
    open:         (repoPath: string): Promise<{ branch: string; isClean: boolean }> => ipcRenderer.invoke('git:open', repoPath),
    status:       (): Promise<unknown>              => ipcRenderer.invoke('git:status'),
    diff:         (staged?: boolean): Promise<string> => ipcRenderer.invoke('git:diff', staged),
    log:          (maxCount?: number): Promise<unknown> => ipcRenderer.invoke('git:log', maxCount),
    branches:     (): Promise<{ current: string; all: string[] }> => ipcRenderer.invoke('git:branches'),
    checkout:     (branch: string): Promise<void>   => ipcRenderer.invoke('git:checkout', branch),
    createBranch: (name: string, from?: string): Promise<void> => ipcRenderer.invoke('git:create-branch', name, from),
    stage:        (files: string[]): Promise<void>  => ipcRenderer.invoke('git:stage', files),
    stageAll:     (): Promise<void>                 => ipcRenderer.invoke('git:stage-all'),
    commit:       (message: string): Promise<string> => ipcRenderer.invoke('git:commit', message),
    push:         (remote?: string, branch?: string): Promise<void> => ipcRenderer.invoke('git:push', remote, branch),
    pull:         (remote?: string, branch?: string): Promise<void> => ipcRenderer.invoke('git:pull', remote, branch),
    stash:        (message?: string): Promise<void> => ipcRenderer.invoke('git:stash', message),
    stashPop:     (): Promise<void>                 => ipcRenderer.invoke('git:stash-pop'),
    blame:        (file: string): Promise<string>   => ipcRenderer.invoke('git:blame', file),
    showCommit:   (hash: string): Promise<string>   => ipcRenderer.invoke('git:show-commit', hash),
    fileHistory:  (file: string, maxCount?: number): Promise<unknown> => ipcRenderer.invoke('git:file-history', file, maxCount),
    diffBranch:   (base: string, head?: string): Promise<string> => ipcRenderer.invoke('git:diff-branch', base, head),
    mergeBase:    (b1: string, b2: string): Promise<string> => ipcRenderer.invoke('git:merge-base', b1, b2),
    isOpen:       (): Promise<boolean>              => ipcRenderer.invoke('git:is-open'),
    repoPath:     (): Promise<string | null>        => ipcRenderer.invoke('git:repo-path'),
  },

  // ── Memory ─────────────────────────────────────────────────────────────────────
  memory: {
    setFact:          (cat: string, key: string, val: string, opts?: { confidence?: number; source?: string }): Promise<boolean> => ipcRenderer.invoke('memory:set-fact', cat, key, val, opts),
    getFact:          (cat: string, key: string): Promise<{ value: string; confidence: number; source: string; updatedAt: number } | null> => ipcRenderer.invoke('memory:get-fact', cat, key),
    searchFacts:      (q: string, cat?: string): Promise<Array<{ category: string; key: string; value: string; confidence: number }>> => ipcRenderer.invoke('memory:search-facts', q, cat),
    listFacts:        (cat?: string): Promise<Array<{ category: string; key: string; value: string; confidence: number }>> => ipcRenderer.invoke('memory:list-facts', cat),
    deleteFact:       (cat: string, key: string): Promise<boolean> => ipcRenderer.invoke('memory:delete-fact', cat, key),
    addSummary:       (sessionId: string, summary: string, topics?: string[]): Promise<boolean> => ipcRenderer.invoke('memory:add-summary', sessionId, summary, topics),
    getSummaries:     (sessionId?: string, limit?: number): Promise<Array<{ sessionId: string; summary: string; keyTopics: string[]; createdAt: number }>> => ipcRenderer.invoke('memory:get-summaries', sessionId, limit),
    searchSummaries:  (q: string, limit?: number): Promise<Array<{ sessionId: string; summary: string; keyTopics: string[]; createdAt: number }>> => ipcRenderer.invoke('memory:search-summaries', q, limit),
    setProjectCtx:    (pid: string, key: string, val: string): Promise<boolean> => ipcRenderer.invoke('memory:set-project-ctx', pid, key, val),
    getProjectCtx:    (pid: string, key?: string): Promise<Array<{ key: string; value: string }>> => ipcRenderer.invoke('memory:get-project-ctx', pid, key),
    deleteProjectCtx: (pid: string, key?: string): Promise<boolean> => ipcRenderer.invoke('memory:delete-project-ctx', pid, key),
    buildContext:     (opts?: { projectId?: string; maxFacts?: number; maxSummaries?: number }): Promise<string> => ipcRenderer.invoke('memory:build-context', opts),
    stats:            (): Promise<{ facts: number; summaries: number; projectContexts: number; dbSizeBytes: number }> => ipcRenderer.invoke('memory:stats'),
  },

  // ── Codebase Indexer ───────────────────────────────────────────────────────────
  indexer: {
    open:          (root: string): Promise<{ fileCount: number; totalLines: number }> => ipcRenderer.invoke('indexer:open', root),
    close:         (): Promise<void>                => ipcRenderer.invoke('indexer:close'),
    isOpen:        (): Promise<boolean>             => ipcRenderer.invoke('indexer:is-open'),
    search:        (q: string, opts?: { ext?: string; limit?: number }): Promise<Array<{ path: string; ext: string; size: number; lines: number; symbols: string[]; snippet: string }>> => ipcRenderer.invoke('indexer:search', q, opts),
    searchSymbols: (name: string): Promise<Array<{ path: string; symbol: string }>> => ipcRenderer.invoke('indexer:search-symbols', name),
    getFile:       (relPath: string): Promise<{ path: string; ext: string; size: number; lines: number; symbols: string[]; snippet: string } | null> => ipcRenderer.invoke('indexer:get-file', relPath),
    list:          (opts?: { ext?: string; dir?: string }): Promise<Array<{ path: string; ext: string; size: number; lines: number }>> => ipcRenderer.invoke('indexer:list', opts),
    stats:         (): Promise<{ fileCount: number; totalLines: number; totalSize: number; byExtension: Record<string, number> }> => ipcRenderer.invoke('indexer:stats'),
    onIndexed:     (cb: (filePath: string) => void) => {
      const handler = (_: unknown, p: string) => cb(p)
      ipcRenderer.on('indexer:indexed', handler)
      return () => ipcRenderer.removeListener('indexer:indexed', handler)
    },
    onReady:       (cb: (stats: { fileCount: number; totalLines: number }) => void) => {
      const handler = (_: unknown, s: { fileCount: number; totalLines: number }) => cb(s)
      ipcRenderer.on('indexer:ready', handler)
      return () => ipcRenderer.removeListener('indexer:ready', handler)
    },
  },

  // ── Plugins ──────────────────────────────────────────────────────────────────
  plugins: {
    list:     (): Promise<Array<{ manifest: { id: string; name: string; version: string; description: string; author: string; icon?: string; homepage?: string; tools?: unknown[]; permissions?: string[] }; enabled: boolean; loaded: boolean }>> => ipcRenderer.invoke('plugins:list'),
    discover: (): Promise<unknown[]>                   => ipcRenderer.invoke('plugins:discover'),
    install:  (source: string): Promise<boolean>       => ipcRenderer.invoke('plugins:install', source),
    remove:   (id: string): Promise<boolean>           => ipcRenderer.invoke('plugins:remove', id),
    enable:   (id: string): Promise<boolean>           => ipcRenderer.invoke('plugins:enable', id),
    disable:  (id: string): Promise<boolean>           => ipcRenderer.invoke('plugins:disable', id),
    load:     (id: string): Promise<boolean>           => ipcRenderer.invoke('plugins:load', id),
    unload:   (id: string): Promise<boolean>           => ipcRenderer.invoke('plugins:unload', id),
    tools:    (id: string): Promise<unknown[]>         => ipcRenderer.invoke('plugins:tools', id),
  },

  // ── Skills Marketplace ──────────────────────────────────────────────────────
  skills: {
    browse:    (query?: string, category?: string): Promise<Array<{ id: string; name: string; description: string; author: string; version: string; category: string; downloads: number; rating: number; tags: string[]; icon?: string; installedLocally?: boolean }>> => ipcRenderer.invoke('skills:browse', query, category),
    install:   (id: string): Promise<boolean>            => ipcRenderer.invoke('skills:install', id),
    remove:    (id: string): Promise<boolean>            => ipcRenderer.invoke('skills:remove', id),
    installed: (): Promise<Array<{ id: string; name: string; description: string; author: string; version: string; category: string; downloads: number; rating: number; tags: string[]; icon?: string; enabled: boolean }>> => ipcRenderer.invoke('skills:installed'),
    enable:    (id: string): Promise<boolean>            => ipcRenderer.invoke('skills:enable', id),
    disable:   (id: string): Promise<boolean>            => ipcRenderer.invoke('skills:disable', id),
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
