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
  mode: 'dark' | 'dim' | 'light' | 'auto'
  accent: 'indigo' | 'violet' | 'blue' | 'emerald' | 'rose'
  fontSize: 'sm' | 'md' | 'lg'
  wallpaper: 'none' | 'herringbone' | 'chevron' | 'diamond' | 'marble' | 'silk' | 'leather' | 'linen' | 'concrete' | 'hexagon' | 'waves' | 'circuit' | 'scales'
}

export interface GuardScanResult {
  id: string; timestamp: number
  type: 'stability' | 'security' | 'vulnerability' | 'threat'
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  title: string; description: string; resolution?: string; resolved: boolean
}
export interface GuardLog {
  timestamp: number; level: 'info' | 'warn' | 'error' | 'critical'
  category: 'stability' | 'security' | 'threat' | 'audit' | 'system'
  message: string; details?: string
}
export interface GuardStatus {
  enabled: boolean; hasApiKey: boolean; lastScan: number | null
  activeIssues: number; issuesBySeverity: Record<string, number>; isScanning: boolean
}

// ── Cowork types ────────────────────────────────────────────────────────────
export type TaskStatus = 'intake' | 'planning' | 'gathering_context' | 'delegation' | 'execution' | 'verification' | 'awaiting_approval' | 'finalizing' | 'completed' | 'failed' | 'paused' | 'cancelled'
export type AgentRole = 'planner' | 'research' | 'file_ops' | 'writer' | 'spreadsheet' | 'browser' | 'code' | 'qa' | 'security' | 'context_curator' | 'review'
export type AgentStatus = 'idle' | 'running' | 'blocked' | 'done' | 'error'
export type ExecutionMode = 'solo' | 'subagent' | 'team'
export type FolderAccessLevel = 'read_only' | 'read_draft' | 'read_edit_approve' | 'trusted' | 'full'

export interface CoworkTask {
  id: string; projectId: string | null; title: string; description: string | null
  status: TaskStatus; priority: number; mode: string; model: string | null
  folderScope: string | null; createdAt: number; startedAt: number | null
  completedAt: number | null; error: string | null; summary: string | null
  parentTask: string | null; assignedAgent: string | null
}

export interface TaskEvent {
  id: string; taskId: string; eventType: string; agentId: string | null
  data: string | null; timestamp: number
}

export interface TaskArtifact {
  id: string; taskId: string; name: string; type: string | null
  path: string | null; content: string | null; createdAt: number
}

export interface AgentDefinition {
  id: string; role: AgentRole; name: string; description: string
  systemPrompt: string; preferredModel: string; fallbackModel: string
  allowedTools: string[]; maxFolderAccess: string
  canRequestApproval: boolean; canSpawnSubagents: boolean
  tokenBudget: number; icon: string
}

export interface AgentState {
  id: string; status: AgentStatus; currentTaskId: string | null
  currentAssignment: string | null; lastActiveAt: number | null
}

export interface ManagedFolder {
  id: string; projectId: string | null; path: string; label: string | null
  accessLevel: FolderAccessLevel; isActive: boolean; addedAt: number
  lastAiAccess: number | null
}

export interface FolderInstruction {
  id: string; folderId: string; instruction: string; priority: number; createdAt: number
}

export interface ContextSource {
  id: string; projectId: string | null; type: string; label: string | null
  content: string; tokenEstimate: number | null; pinned: boolean
  active: boolean; createdAt: number; expiresAt: number | null
}

export interface ContextAssembly {
  sources: ContextSource[]; totalTokens: number; budgetLimit: number; budgetUsedPercent: number
}

export interface ApprovalRequest {
  id: string; taskId: string; agentId: string | null; actionType: string
  description: string; details: string | null; status: string
  dryRunOutput: string | null; respondedAt: number | null; createdAt: number
}

export interface AuditEntry {
  id: string; taskId: string | null; agentId: string | null; action: string
  target: string | null; details: string | null; reversible: boolean
  snapshotId: string | null; timestamp: number
}

export interface OrchestratorState {
  mode: ExecutionMode; activeTaskCount: number; queuedTaskCount: number; activeAgents: string[]
}

// ── API surface ───────────────────────────────────────────────────────────────
const nyraApi = {

  openclaw: {
    getStatus:          (): Promise<OpenClawStatus> => ipcRenderer.invoke('openclaw:status'),
    getWsUrl:           (): Promise<string>          => ipcRenderer.invoke('openclaw:ws-url'),
    restart:            (): Promise<boolean>         => ipcRenderer.invoke('openclaw:restart'),
    ping:               (): Promise<{ wsProxy: boolean; gateway: string; providers: Array<{ id: string; ready: boolean }>; modelTest: { tested: boolean; ok: boolean; model: string; error: string } }> => ipcRenderer.invoke('openclaw:ping'),
    modelCatalog:       (): Promise<Array<{ id: string; name: string; provider: string; contextWindow?: number; reasoning?: boolean }>> => ipcRenderer.invoke('openclaw:models'),
    configGet: () => ipcRenderer.invoke('openclaw:config-get'),
    configPatch: (raw: string, options?: { sessionKey?: string; note?: string }) => ipcRenderer.invoke('openclaw:config-patch', raw, options),
    channelsStatus: () => ipcRenderer.invoke('openclaw:channels-status'),
    channelEnable: (channelId: string, config: Record<string, string>) => ipcRenderer.invoke('openclaw:channel-enable', channelId, config),
    channelDisable: (channelId: string) => ipcRenderer.invoke('openclaw:channel-disable', channelId),
    channelTest: (channelId: string, config: Record<string, string>) => ipcRenderer.invoke('openclaw:channel-test', channelId, config),
    onStatusChange: (cb: (s: OpenClawStatus) => void) => {
      const handler = (_: unknown, s: OpenClawStatus) => cb(s)
      ipcRenderer.on('openclaw:status-change', handler)
      return () => ipcRenderer.removeListener('openclaw:status-change', handler)
    },
    onLog: (cb: (l: string) => void) => {
      const handler = (_: unknown, l: string) => cb(l)
      ipcRenderer.on('openclaw:log', handler)
      return () => ipcRenderer.removeListener('openclaw:log', handler)
    },
    onInstallLog: (cb: (l: string) => void) => {
      const handler = (_: unknown, l: string) => cb(l)
      ipcRenderer.on('openclaw:install-log', handler)
      return () => ipcRenderer.removeListener('openclaw:install-log', handler)
    },
    onError: (cb: (m: string) => void) => {
      const handler = (_: unknown, m: string) => cb(m)
      ipcRenderer.on('openclaw:error', handler)
      return () => ipcRenderer.removeListener('openclaw:error', handler)
    },
    onReady: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('openclaw:ready', handler)
      return () => ipcRenderer.removeListener('openclaw:ready', handler)
    },
    onRestarting: (cb: (i: { attempt: number; delay: number }) => void) => {
      const handler = (_: unknown, i: { attempt: number; delay: number }) => cb(i)
      ipcRenderer.on('openclaw:restarting', handler)
      return () => ipcRenderer.removeListener('openclaw:restarting', handler)
    },
    /** @deprecated Use the cleanup functions returned by individual on* methods instead */
    removeAllListeners: () => ['openclaw:status-change','openclaw:log','openclaw:install-log','openclaw:error','openclaw:ready','openclaw:restarting'].forEach(c => ipcRenderer.removeAllListeners(c)),
  },

  providers: {
    list:       (): Promise<Array<{ id: string; enabled: boolean; hasKey: boolean; activeModel?: string }>> => ipcRenderer.invoke('providers:list'),
    catalog:    (): Promise<Array<{ id: string; label: string; icon: string; oauthUrl?: string; apiKeyPrefix?: string; models: Array<{ id: string; label: string; contextWindow?: number }> }>> => ipcRenderer.invoke('providers:catalog'),
    saveKey:    (id: string, key: string): Promise<boolean>   => ipcRenderer.invoke('providers:save-key', id, key),
    removeKey:  (id: string): Promise<boolean>                => ipcRenderer.invoke('providers:remove-key', id),
    setModel:   (id: string, modelId: string): Promise<boolean> => ipcRenderer.invoke('providers:set-model', id, modelId),
    switchModel:(modelId: string): Promise<boolean>           => ipcRenderer.invoke('providers:switch-model', modelId),
    resync:     (): Promise<boolean>                            => ipcRenderer.invoke('providers:resync'),
    resolve:    (): Promise<{ providerId: string; apiKey: string; model: string } | null> => ipcRenderer.invoke('providers:resolve'),
    openOauth:  (url: string): Promise<void>                  => ipcRenderer.invoke('providers:open-oauth', url),
    // OAuth flows (EasyClaw-parity)
    startOAuth:       (id: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('providers:start-oauth', id),
    githubDeviceFlow: (): Promise<{ success: boolean; error?: string }>            => ipcRenderer.invoke('providers:github-device-flow'),
    oauthAvailability: (): Promise<Record<string, boolean>>                        => ipcRenderer.invoke('providers:oauth-availability'),
    // OAuth event listeners
    onOAuthComplete: (cb: (d: { providerId: string; success: boolean }) => void) => {
      const handler = (_: unknown, d: { providerId: string; success: boolean }) => cb(d)
      ipcRenderer.on('providers:oauth-complete', handler)
      return () => ipcRenderer.removeListener('providers:oauth-complete', handler)
    },
    onDeviceCode: (cb: (d: { providerId: string; userCode: string; verificationUri: string }) => void) => {
      const handler = (_: unknown, d: { providerId: string; userCode: string; verificationUri: string }) => cb(d)
      ipcRenderer.on('providers:device-code', handler)
      return () => ipcRenderer.removeListener('providers:device-code', handler)
    },
    /** @deprecated Use the cleanup functions returned by individual on* methods instead */
    removeOAuthListeners: () => ['providers:oauth-complete', 'providers:device-code'].forEach(c => ipcRenderer.removeAllListeners(c)),
  },

  mcp: {
    // ── Config (persisted to disk) ──
    list:   (): Promise<Record<string, McpServerConfig>>          => ipcRenderer.invoke('mcp:list'),
    add:    (n: string, s: McpServerConfig): Promise<boolean>     => ipcRenderer.invoke('mcp:add', n, s),
    remove: (n: string): Promise<boolean>                         => ipcRenderer.invoke('mcp:remove', n),
    // ── Runtime (live server management) ──
    startServer:  (n: string, c: McpServerConfig): Promise<{ success: boolean; status?: any; error?: string }> => ipcRenderer.invoke('mcp:start-server', n, c),
    stopServer:   (n: string): Promise<boolean>                   => ipcRenderer.invoke('mcp:stop-server', n),
    restartServer: (n: string): Promise<{ success: boolean; status?: any }> => ipcRenderer.invoke('mcp:restart-server', n),
    listRunning:  (): Promise<any[]>                              => ipcRenderer.invoke('mcp:list-running'),
    serverStatus: (n: string): Promise<any>                       => ipcRenderer.invoke('mcp:server-status', n),
    listTools:    (): Promise<any[]>                               => ipcRenderer.invoke('mcp:list-tools'),
    callTool:     (qualifiedName: string, args: Record<string, unknown>, taskId?: string): Promise<any> => ipcRenderer.invoke('mcp:call-tool', qualifiedName, args, taskId),
    capabilitiesSummary: (): Promise<string>                      => ipcRenderer.invoke('mcp:capabilities-summary'),
    startAll:     (): Promise<any[]>                               => ipcRenderer.invoke('mcp:start-all'),
    onServerStateChange: (cb: (status: any) => void) => {
      const handler = (_e: any, status: any) => cb(status)
      ipcRenderer.on('mcp:server-state-change', handler)
      return () => ipcRenderer.removeListener('mcp:server-state-change', handler)
    },
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
    /** Returns true if OS is in dark mode */
    systemDark: (): Promise<boolean> => ipcRenderer.invoke('theme:system-dark'),
    /** Listen for OS theme changes (dark ↔ light) */
    onSystemChange: (cb: (isDark: boolean) => void) => {
      const handler = (_: unknown, isDark: boolean) => cb(isDark)
      ipcRenderer.on('theme:system-changed', handler)
      return () => ipcRenderer.removeListener('theme:system-changed', handler)
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
    sync:         (): Promise<{ success: boolean; modelCount: number; error?: string }> => ipcRenderer.invoke('ollama:sync'),
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

  // ── NyraGuard (Security & Stability Bot) ──────────────────────────────────
  guard: {
    getConfig:    (): Promise<Record<string, unknown>>          => ipcRenderer.invoke('guard:get-config'),
    setConfig:    (patch: Record<string, unknown>): Promise<Record<string, unknown>> => ipcRenderer.invoke('guard:set-config', patch),
    saveKey:      (key: string): Promise<boolean>               => ipcRenderer.invoke('guard:save-key', key),
    loadKey:      (): Promise<string | null>                    => ipcRenderer.invoke('guard:load-key'),
    removeKey:    (): Promise<boolean>                          => ipcRenderer.invoke('guard:remove-key'),
    scanSecurity: (): Promise<GuardScanResult[]>                => ipcRenderer.invoke('guard:scan-security'),
    scanStability:(): Promise<GuardScanResult[]>                => ipcRenderer.invoke('guard:scan-stability'),
    scanThreat:   (): Promise<GuardScanResult[]>                => ipcRenderer.invoke('guard:scan-threat'),
    scanAll:      (): Promise<GuardScanResult[]>                => ipcRenderer.invoke('guard:scan-all'),
    getLog:       (): Promise<GuardLog[]>                       => ipcRenderer.invoke('guard:get-log'),
    clearLog:     (): Promise<boolean>                          => ipcRenderer.invoke('guard:clear-log'),
    diagnose:     (error: string): Promise<{ diagnosis: string; suggestedFix: string; severity: string }> => ipcRenderer.invoke('guard:diagnose', error),
    recommendations: (): Promise<string[]>                      => ipcRenderer.invoke('guard:recommendations'),
    startAuto:    (): Promise<boolean>                          => ipcRenderer.invoke('guard:start-auto'),
    stopAuto:     (): Promise<boolean>                          => ipcRenderer.invoke('guard:stop-auto'),
    status:       (): Promise<GuardStatus>                      => ipcRenderer.invoke('guard:status'),
    onScanComplete: (cb: (results: GuardScanResult[]) => void) => {
      const handler = (_: unknown, r: GuardScanResult[]) => cb(r)
      ipcRenderer.on('guard:scan-complete', handler)
      return () => ipcRenderer.removeListener('guard:scan-complete', handler)
    },
    onIssueDetected: (cb: (issue: GuardScanResult) => void) => {
      const handler = (_: unknown, i: GuardScanResult) => cb(i)
      ipcRenderer.on('guard:issue-detected', handler)
      return () => ipcRenderer.removeListener('guard:issue-detected', handler)
    },
    onLog: (cb: (entry: GuardLog) => void) => {
      const handler = (_: unknown, e: GuardLog) => cb(e)
      ipcRenderer.on('guard:log', handler)
      return () => ipcRenderer.removeListener('guard:log', handler)
    },
  },

  // ── Cowork: Tasks ────────────────────────────────────────────────────────────
  // Channel names must match ipcMain.handle() registrations in ipc.ts
  tasks: {
    create:       (data: Partial<CoworkTask>): Promise<CoworkTask>       => ipcRenderer.invoke('cowork:task:create', data),
    list:         (projectId?: string): Promise<CoworkTask[]>            => ipcRenderer.invoke('cowork:task:list', projectId),
    get:          (id: string): Promise<CoworkTask | null>               => ipcRenderer.invoke('cowork:task:get', id),
    update:       (id: string, patch: Partial<CoworkTask>): Promise<CoworkTask> => ipcRenderer.invoke('cowork:task:update', id, patch),
    cancel:       (id: string): Promise<boolean>                         => ipcRenderer.invoke('cowork:task:cancel', id),
    pause:        (id: string): Promise<boolean>                         => ipcRenderer.invoke('cowork:task:pause', id),
    resume:       (id: string): Promise<boolean>                         => ipcRenderer.invoke('cowork:task:resume', id),
    retry:        (id: string): Promise<boolean>                         => ipcRenderer.invoke('cowork:task:retry', id),
    execute:      (id: string): Promise<boolean>                         => ipcRenderer.invoke('cowork:orch:execute', id),
    addNote:      (id: string, note: string): Promise<void>              => ipcRenderer.invoke('cowork:task:add-note', id, note),
    getEvents:    (id: string): Promise<TaskEvent[]>                     => ipcRenderer.invoke('cowork:task:events', id),
    getArtifacts: (id: string): Promise<TaskArtifact[]>                  => ipcRenderer.invoke('cowork:task:artifacts', id),
    activeCount:  (): Promise<number>                                    => ipcRenderer.invoke('cowork:task:active-count'),
    queued:       (): Promise<CoworkTask[]>                              => ipcRenderer.invoke('cowork:task:queued'),
    pendingApprovals: (): Promise<any[]>                                 => ipcRenderer.invoke('cowork:task:pending-approvals'),
    onStatusChanged: (cb: (data: { taskId: string; from: string; to: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('event:task:status-changed', handler)
      return () => ipcRenderer.removeListener('event:task:status-changed', handler)
    },
    onProgress: (cb: (data: { taskId: string; stage: string; progress: number; message: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('event:task:progress', handler)
      return () => ipcRenderer.removeListener('event:task:progress', handler)
    },
    onApprovalNeeded: (cb: (data: { taskId: string; approvalId: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('event:task:approval-needed', handler)
      return () => ipcRenderer.removeListener('event:task:approval-needed', handler)
    },
  },

  // ── Cowork: Agents ───────────────────────────────────────────────────────────
  agents: {
    list:       (): Promise<AgentDefinition[]>            => ipcRenderer.invoke('cowork:agent:list'),
    states:     (): Promise<AgentState[]>                 => ipcRenderer.invoke('cowork:agent:all-states'),
    get:        (id: string): Promise<AgentDefinition | null> => ipcRenderer.invoke('cowork:agent:get', id),
    getState:   (id: string): Promise<AgentState>         => ipcRenderer.invoke('cowork:agent:state', id),
    getRuns:    (taskId: string): Promise<any[]>           => ipcRenderer.invoke('cowork:orch:messages', taskId),
    stop:       (id: string): Promise<boolean>             => ipcRenderer.invoke('cowork:orch:cancel', id),
    setMode:    (mode: ExecutionMode): Promise<boolean>    => ipcRenderer.invoke('cowork:orch:set-mode', mode),
    getMode:    (): Promise<ExecutionMode>                 => ipcRenderer.invoke('cowork:orch:get-mode'),
    getOrchestratorState: (): Promise<OrchestratorState>   => ipcRenderer.invoke('cowork:orch:state'),
    resetAll:   (): Promise<void>                          => ipcRenderer.invoke('cowork:agent:reset-all'),
    onStatusChanged: (cb: (data: { agentId: string; status: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('event:agent:status-changed', handler)
      return () => ipcRenderer.removeListener('event:agent:status-changed', handler)
    },
    onHandoff: (cb: (data: { from: string; to: string; taskId: string; summary: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('event:agent:handoff', handler)
      return () => ipcRenderer.removeListener('event:agent:handoff', handler)
    },
  },

  // ── Cowork: Folders ──────────────────────────────────────────────────────────
  folders: {
    attach:          (input: any): Promise<ManagedFolder | null>         => ipcRenderer.invoke('cowork:folder:attach', input),
    detach:          (id: string): Promise<boolean>                      => ipcRenderer.invoke('cowork:folder:detach', id),
    list:            (projectId?: string): Promise<ManagedFolder[]>      => ipcRenderer.invoke('cowork:folder:list', projectId),
    get:             (id: string): Promise<ManagedFolder | null>         => ipcRenderer.invoke('cowork:folder:get', id),
    update:          (id: string, patch: any): Promise<ManagedFolder>    => ipcRenderer.invoke('cowork:folder:update', id, patch),
    addInstruction:  (folderId: string, instruction: string, priority?: number): Promise<FolderInstruction> => ipcRenderer.invoke('cowork:folder:add-instr', folderId, instruction, priority),
    removeInstruction: (instructionId: string): Promise<boolean>         => ipcRenderer.invoke('cowork:folder:rm-instr', instructionId),
    getInstructions: (folderId: string): Promise<FolderInstruction[]>    => ipcRenderer.invoke('cowork:folder:instructions', folderId),
    getTree:         (folderId: string, depth?: number): Promise<any>    => ipcRenderer.invoke('cowork:folder:tree', folderId, depth),
    getStats:        (folderPath: string): Promise<any>                  => ipcRenderer.invoke('cowork:folder:stats', folderPath),
    canAccess:       (id: string, action: string): Promise<boolean>      => ipcRenderer.invoke('cowork:folder:can-access', id, action),
    onFileChanged: (cb: (data: { folderId: string; filePath: string; changeType: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('event:folder:file-changed', handler)
      return () => ipcRenderer.removeListener('event:folder:file-changed', handler)
    },
  },

  // ── Cowork: Context ──────────────────────────────────────────────────────────
  context: {
    assemble:     (projectId: string, taskId?: string, modelId?: string): Promise<ContextAssembly> => ipcRenderer.invoke('cowork:ctx:assemble', projectId, taskId, modelId),
    addSource:    (source: any): Promise<ContextSource>                  => ipcRenderer.invoke('cowork:ctx:add-source', source),
    removeSource: (id: string): Promise<boolean>                         => ipcRenderer.invoke('cowork:ctx:remove-source', id),
    pin:          (id: string): Promise<boolean>                         => ipcRenderer.invoke('cowork:ctx:pin', id),
    unpin:        (id: string): Promise<boolean>                         => ipcRenderer.invoke('cowork:ctx:unpin', id),
    toggleActive: (id: string): Promise<boolean>                         => ipcRenderer.invoke('cowork:ctx:toggle-active', id),
    listSources:  (projectId?: string): Promise<ContextSource[]>         => ipcRenderer.invoke('cowork:ctx:list-sources', projectId),
    getBudget:    (modelId?: string): Promise<{ used: number; limit: number; percent: number }> => ipcRenderer.invoke('cowork:ctx:budget', modelId),
    getStats:     (): Promise<any>                                       => ipcRenderer.invoke('cowork:ctx:stats'),
  },

  // ── Cowork: Approvals ────────────────────────────────────────────────────────
  approvals: {
    listPending: (): Promise<ApprovalRequest[]>               => ipcRenderer.invoke('cowork:approval:pending'),
    respond:     (id: string, status: 'approved' | 'denied' | 'modified', modification?: string): Promise<ApprovalRequest> => ipcRenderer.invoke('cowork:approval:respond', id, status === 'approved', modification),
    get:         (id: string): Promise<ApprovalRequest | null> => ipcRenderer.invoke('cowork:approval:get', id),
    byTask:      (taskId: string): Promise<ApprovalRequest[]>  => ipcRenderer.invoke('cowork:approval:by-task', taskId),
    stats:       (): Promise<any>                              => ipcRenderer.invoke('cowork:approval:stats'),
  },

  // ── Cowork: Audit ────────────────────────────────────────────────────────────
  audit: {
    query:     (filters: any): Promise<AuditEntry[]>          => ipcRenderer.invoke('cowork:audit:query', filters),
    recent:    (limit?: number): Promise<AuditEntry[]>        => ipcRenderer.invoke('cowork:audit:recent', limit),
    forFile:   (filePath: string): Promise<AuditEntry[]>      => ipcRenderer.invoke('cowork:audit:for-file', filePath),
    count:     (filters?: any): Promise<number>               => ipcRenderer.invoke('cowork:audit:count', filters),
    summary:   (opts?: { from?: number; to?: number }): Promise<any> => ipcRenderer.invoke('cowork:audit:summary', opts),
    exportAudit: (format: 'json' | 'csv', filters?: any): Promise<string> => ipcRenderer.invoke('cowork:audit:export', format, filters),
  },

  // ── Cowork: Snapshots ────────────────────────────────────────────────────────
  snapshots: {
    forFile:   (filePath: string): Promise<any[]>             => ipcRenderer.invoke('cowork:snap:for-file', filePath),
    rollback:  (id: string): Promise<boolean>                 => ipcRenderer.invoke('cowork:snap:rollback', id),
    get:       (id: string): Promise<any>                     => ipcRenderer.invoke('cowork:snap:get', id),
    create:    (filePath: string, taskId?: string): Promise<any> => ipcRenderer.invoke('cowork:snap:create', filePath, taskId),
    stats:     (): Promise<any>                               => ipcRenderer.invoke('cowork:snap:stats'),
  },

  // ── Computer Use ──────────────────────────────────────────────────────────
  computerUse: {
    start:          (task: string, config?: { tokenBudget?: number; maxIterations?: number; captureDelayMs?: number; requireApproval?: boolean; targetWindow?: string }): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('computer-use:start', task, config),
    pause:          (): Promise<boolean>             => ipcRenderer.invoke('computer-use:pause'),
    resume:         (): Promise<boolean>             => ipcRenderer.invoke('computer-use:resume'),
    cancel:         (): Promise<boolean>             => ipcRenderer.invoke('computer-use:cancel'),
    getSession:     (): Promise<any>                 => ipcRenderer.invoke('computer-use:session'),
    approveAction:  (approvalId: string, approved: boolean): Promise<boolean> => ipcRenderer.invoke('computer-use:approve-action', approvalId, approved),
    onSessionStarted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('computer-use:session:started', handler)
      return () => ipcRenderer.removeListener('computer-use:session:started', handler)
    },
    onSessionCompleted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('computer-use:session:completed', handler)
      return () => ipcRenderer.removeListener('computer-use:session:completed', handler)
    },
    onSessionFailed: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('computer-use:session:failed', handler)
      return () => ipcRenderer.removeListener('computer-use:session:failed', handler)
    },
    onSessionPaused: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('computer-use:session:paused', handler)
      return () => ipcRenderer.removeListener('computer-use:session:paused', handler)
    },
    onStepStarted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('computer-use:step:started', handler)
      return () => ipcRenderer.removeListener('computer-use:step:started', handler)
    },
    onStepCompleted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('computer-use:step:completed', handler)
      return () => ipcRenderer.removeListener('computer-use:step:completed', handler)
    },
    onApprovalNeeded: (cb: (data: { sessionId: string; stepId: number; approvalId: string; action: any }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('computer-use:step:approval-needed', handler)
      return () => ipcRenderer.removeListener('computer-use:step:approval-needed', handler)
    },
    onBudgetExhausted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('computer-use:session:budget-exhausted', handler)
      return () => ipcRenderer.removeListener('computer-use:session:budget-exhausted', handler)
    },
  },

  // ── Desktop Agent (Phase 2 — OODA Loop + Safety) ─────────────────────────
  desktopAgent: {
    execute:        (instruction: string, taskId?: string): Promise<{ success: boolean; result?: any; error?: string }> => ipcRenderer.invoke('desktop:agent-execute', instruction, taskId),
    stop:           (): Promise<boolean>                                     => ipcRenderer.invoke('desktop:agent-stop'),
    getTrustMode:   (): Promise<string>                                      => ipcRenderer.invoke('desktop:trust-mode-get'),
    setTrustMode:   (mode: string): Promise<boolean>                         => ipcRenderer.invoke('desktop:trust-mode-set', mode),
    getTrustRules:  (): Promise<any[]>                                       => ipcRenderer.invoke('desktop:trust-rules'),
    resetTrustRules:(): Promise<boolean>                                     => ipcRenderer.invoke('desktop:trust-rules-reset'),
    getActionHistory:(limit?: number): Promise<any[]>                        => ipcRenderer.invoke('desktop:action-history', limit),
    executeTool:    (toolName: string, args: Record<string, unknown>, taskId?: string): Promise<{ success: boolean; result?: any; error?: string }> => ipcRenderer.invoke('desktop:tool-execute', toolName, args, taskId),
    getToolDefinitions: (): Promise<any[]>                                   => ipcRenderer.invoke('desktop:tool-definitions'),
    getStepScreenshot:  (stepId: number): Promise<{ base64: string; width: number; height: number } | null> => ipcRenderer.invoke('computer-use:step-screenshot', stepId),
  },

  // ── Agent Pipeline Events (reasoning, ensemble, orchestration) ──────────
  agentPipeline: {
    onTaskStarted: (cb: (data: { taskId: string; agentId: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('agent:status', handler)
      return () => ipcRenderer.removeListener('agent:status', handler)
    },
    onAgentOutput: (cb: (data: { agentId: string; taskId: string; message: any }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('agent:output', handler)
      return () => ipcRenderer.removeListener('agent:output', handler)
    },
    onAgentError: (cb: (data: { agentId: string; taskId: string; error: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('agent:error', handler)
      return () => ipcRenderer.removeListener('agent:error', handler)
    },
    onTaskExecutionStarted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('task:execution-started', handler)
      return () => ipcRenderer.removeListener('task:execution-started', handler)
    },
    onTaskExecutionCompleted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('task:execution-completed', handler)
      return () => ipcRenderer.removeListener('task:execution-completed', handler)
    },
    onTaskExecutionFailed: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('task:execution-failed', handler)
      return () => ipcRenderer.removeListener('task:execution-failed', handler)
    },
    onComputerUseSessionStarted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('computer-use:session:started', handler)
      return () => ipcRenderer.removeListener('computer-use:session:started', handler)
    },
    onComputerUseStepCompleted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('computer-use:step:completed', handler)
      return () => ipcRenderer.removeListener('computer-use:step:completed', handler)
    },
  },

  // ── Agent Message Bus (Inter-Agent Communication) ────────────────────────
  agentBus: {
    send:          (message: any): Promise<{ success: boolean; messageId?: string; error?: string }> => ipcRenderer.invoke('agent-bus:send', message),
    history:       (limit?: number): Promise<any[]>          => ipcRenderer.invoke('agent-bus:history', limit),
    thread:        (correlationId: string): Promise<any[]>   => ipcRenderer.invoke('agent-bus:thread', correlationId),
    taskMessages:  (taskId: string): Promise<any[]>          => ipcRenderer.invoke('agent-bus:task-messages', taskId),
    unreadCounts:  (): Promise<Record<string, number>>       => ipcRenderer.invoke('agent-bus:unread-counts'),
    markRead:      (messageId: string): Promise<boolean>     => ipcRenderer.invoke('agent-bus:mark-read', messageId),
    inbox:         (agentId: string): Promise<any[]>         => ipcRenderer.invoke('agent-bus:inbox', agentId),
    onMessage: (cb: (data: { id: string; from: string; to: string; type: string; taskId?: string; correlationId?: string; summary: string; timestamp: number; priority?: number }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('agent-bus:message', handler)
      return () => ipcRenderer.removeListener('agent-bus:message', handler)
    },
  },

  // ── Plan Mode ──────────────────────────────────────────────────────────────
  plan: {
    generate:    (request: string, projectId?: string, modelId?: string): Promise<{ success: boolean; plan?: any; error?: string }> => ipcRenderer.invoke('plan:generate', request, projectId, modelId),
    get:         (planId: string): Promise<any>              => ipcRenderer.invoke('plan:get', planId),
    list:        (): Promise<any[]>                          => ipcRenderer.invoke('plan:list'),
    approve:     (planId: string): Promise<any>              => ipcRenderer.invoke('plan:approve', planId),
    cancel:      (planId: string): Promise<any>              => ipcRenderer.invoke('plan:cancel', planId),
    delete:      (planId: string): Promise<boolean>          => ipcRenderer.invoke('plan:delete', planId),
    updateStep:  (planId: string, stepId: number, updates: any): Promise<any> => ipcRenderer.invoke('plan:update-step', planId, stepId, updates),
    addStep:     (planId: string, step: any): Promise<any>   => ipcRenderer.invoke('plan:add-step', planId, step),
    removeStep:  (planId: string, stepId: number): Promise<any> => ipcRenderer.invoke('plan:remove-step', planId, stepId),
    execute:     (planId: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('plan:execute', planId),
    pause:       (): Promise<boolean>                        => ipcRenderer.invoke('plan:pause'),
    resume:      (): Promise<boolean>                        => ipcRenderer.invoke('plan:resume'),
    cancelExec:  (): Promise<boolean>                        => ipcRenderer.invoke('plan:cancel-exec'),
    execState:   (): Promise<{ planId: string; isRunning: boolean; currentStepId: number | null; completedSteps: number; totalSteps: number; isPaused: boolean; isCancelled: boolean }> => ipcRenderer.invoke('plan:exec-state'),
    // Event listeners
    onGenerated: (cb: (plan: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('plan:generated', handler)
      return () => ipcRenderer.removeListener('plan:generated', handler)
    },
    onUpdated: (cb: (plan: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('plan:updated', handler)
      return () => ipcRenderer.removeListener('plan:updated', handler)
    },
    onStepUpdate: (cb: (data: { planId: string; stepId: number; status: string; result?: string; error?: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('plan:step-update', handler)
      return () => ipcRenderer.removeListener('plan:step-update', handler)
    },
    onStepStarted: (cb: (data: { planId: string; stepId: number }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('plan:step-started', handler)
      return () => ipcRenderer.removeListener('plan:step-started', handler)
    },
    onStepCompleted: (cb: (data: { planId: string; stepId: number; success: boolean; result: string; error?: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('plan:step-completed', handler)
      return () => ipcRenderer.removeListener('plan:step-completed', handler)
    },
    onStateChange: (cb: (state: { planId: string; isRunning: boolean; currentStepId: number | null; completedSteps: number; totalSteps: number; isPaused: boolean; isCancelled: boolean }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('plan:state', handler)
      return () => ipcRenderer.removeListener('plan:state', handler)
    },
    onCompleted: (cb: (plan: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('plan:completed', handler)
      return () => ipcRenderer.removeListener('plan:completed', handler)
    },
    onFailed: (cb: (plan: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('plan:failed', handler)
      return () => ipcRenderer.removeListener('plan:failed', handler)
    },
    onError: (cb: (data: { planId: string; error: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('plan:error', handler)
      return () => ipcRenderer.removeListener('plan:error', handler)
    },
  },

  // ── Model Hub ───────────────────────────────────────────────────────────
  modelHub: {
    searchLibrary:    (opts?: { query?: string; family?: string; maxSizeGb?: number }): Promise<any[]> => ipcRenderer.invoke('modelhub:search-library', opts),
    getFamilies:      (): Promise<string[]>              => ipcRenderer.invoke('modelhub:families'),
    getModelCard:     (modelName: string): Promise<any>  => ipcRenderer.invoke('modelhub:model-card', modelName),
    getInstalled:     (): Promise<any[]>                 => ipcRenderer.invoke('modelhub:installed'),
    getRecommended:   (): Promise<any[]>                 => ipcRenderer.invoke('modelhub:recommended'),
    isOnline:         (): Promise<boolean>               => ipcRenderer.invoke('modelhub:is-online'),
    getGpuInfo:       (): Promise<any>                   => ipcRenderer.invoke('modelhub:gpu-info'),
    canFit:           (modelName: string): Promise<{ fits: boolean; requiredMb: number; availableMb: number }> => ipcRenderer.invoke('modelhub:can-fit', modelName),
    // Downloads
    startDownload:    (modelName: string): Promise<any>  => ipcRenderer.invoke('modelhub:download-start', modelName),
    pauseDownload:    (jobId: string): Promise<boolean>  => ipcRenderer.invoke('modelhub:download-pause', jobId),
    resumeDownload:   (jobId: string): Promise<boolean>  => ipcRenderer.invoke('modelhub:download-resume', jobId),
    cancelDownload:   (jobId: string): Promise<boolean>  => ipcRenderer.invoke('modelhub:download-cancel', jobId),
    getDownloads:     (): Promise<any[]>                 => ipcRenderer.invoke('modelhub:downloads'),
    getDownload:      (jobId: string): Promise<any>      => ipcRenderer.invoke('modelhub:download', jobId),
    removeModel:      (modelName: string): Promise<void> => ipcRenderer.invoke('modelhub:remove-model', modelName),
    // Comparison
    compare:          (modelA: string, modelB: string, prompt: string): Promise<any> => ipcRenderer.invoke('modelhub:compare', modelA, modelB, prompt),
    listComparisons:  (): Promise<any[]>                 => ipcRenderer.invoke('modelhub:comparisons'),
    getComparison:    (id: string): Promise<any>         => ipcRenderer.invoke('modelhub:comparison', id),
    // Performance
    recordInference:  (modelName: string, tps: number, latency: number): Promise<void> => ipcRenderer.invoke('modelhub:record-inference', modelName, tps, latency),
    rateModel:        (modelName: string, rating: number): Promise<void> => ipcRenderer.invoke('modelhub:rate-model', modelName, rating),
    getPerformance:   (modelName: string): Promise<any>  => ipcRenderer.invoke('modelhub:performance', modelName),
    getAllPerformance: (): Promise<any[]>                 => ipcRenderer.invoke('modelhub:all-performance'),
    // Event listeners
    onDownloadProgress: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('modelhub:download:progress', handler)
      return () => ipcRenderer.removeListener('modelhub:download:progress', handler)
    },
    onDownloadCompleted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('modelhub:download:completed', handler)
      return () => ipcRenderer.removeListener('modelhub:download:completed', handler)
    },
    onDownloadFailed: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('modelhub:download:failed', handler)
      return () => ipcRenderer.removeListener('modelhub:download:failed', handler)
    },
    onModelRemoved: (cb: (data: { modelName: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('modelhub:model:removed', handler)
      return () => ipcRenderer.removeListener('modelhub:model:removed', handler)
    },
    onComparisonCompleted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('modelhub:comparison:completed', handler)
      return () => ipcRenderer.removeListener('modelhub:comparison:completed', handler)
    },
    onComparisonToken: (cb: (data: { id: string; model: string; token: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('modelhub:comparison:token', handler)
      return () => ipcRenderer.removeListener('modelhub:comparison:token', handler)
    },
  },

  // ── Semantic Memory ─────────────────────────────────────────────────────
  memory: {
    add:           (opts: { type: string; content: string; topic?: string; source?: string; projectId?: string; confidence?: number; tags?: string[]; pinned?: boolean }): Promise<any> => ipcRenderer.invoke('memory:add', opts),
    get:           (id: number): Promise<any>                  => ipcRenderer.invoke('memory:get', id),
    update:        (id: number, updates: any): Promise<any>    => ipcRenderer.invoke('memory:update', id, updates),
    delete:        (id: number): Promise<boolean>              => ipcRenderer.invoke('memory:delete', id),
    search:        (query: string, opts?: any): Promise<any[]> => ipcRenderer.invoke('memory:search', query, opts),
    list:          (opts?: any): Promise<any[]>                => ipcRenderer.invoke('memory:list', opts),
    getTopics:     (): Promise<string[]>                       => ipcRenderer.invoke('memory:topics'),
    getStats:      (): Promise<any>                            => ipcRenderer.invoke('memory:stats'),
    extract:       (text: string, source: string, projectId?: string): Promise<any> => ipcRenderer.invoke('memory:extract', text, source, projectId),
    buildContext:  (opts: { query?: string; projectId?: string; maxTokens?: number }): Promise<string> => ipcRenderer.invoke('memory:build-context', opts),
    exportMemories: (projectId?: string): Promise<string>      => ipcRenderer.invoke('memory:export', projectId),
    importMemories: (jsonStr: string, projectId?: string): Promise<any> => ipcRenderer.invoke('memory:import', jsonStr, projectId),
    // Events
    onMemoryAdded: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('semantic-memory:added', handler)
      return () => ipcRenderer.removeListener('semantic-memory:added', handler)
    },
    onMemoryUpdated: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('semantic-memory:updated', handler)
      return () => ipcRenderer.removeListener('semantic-memory:updated', handler)
    },
    onMemoryDeleted: (cb: (data: { id: number }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('semantic-memory:deleted', handler)
      return () => ipcRenderer.removeListener('semantic-memory:deleted', handler)
    },
    onExtractionCompleted: (cb: (data: { source: string; count: number }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('semantic-extraction:completed', handler)
      return () => ipcRenderer.removeListener('semantic-extraction:completed', handler)
    },
  },

  // ── Tiered Memory (5-Tier MemGPT Architecture) ──────────────────────
  tieredMemory: {
    getStats:        (): Promise<any>                     => ipcRenderer.invoke('tiered-memory:stats'),
    cascadeSearch:   (query: string, tokenBudget?: number): Promise<any> => ipcRenderer.invoke('tiered-memory:cascade-search', query, tokenBudget),
    buildContext:    (query: string, tokenBudget?: number): Promise<any> => ipcRenderer.invoke('tiered-memory:build-context', query, tokenBudget),
    remember:        (content: string, metadata: any, tier?: string): Promise<any> => ipcRenderer.invoke('tiered-memory:remember', content, metadata, tier),
    tierList:        (tier: string, offset: number, limit: number): Promise<any> => ipcRenderer.invoke('tiered-memory:tier-list', tier, offset, limit),
    tierSearch:      (tier: string, query: string, limit?: number): Promise<any> => ipcRenderer.invoke('tiered-memory:tier-search', tier, query, limit),
    remove:          (tier: string, id: string): Promise<any> => ipcRenderer.invoke('tiered-memory:remove', tier, id),
    getWorkingState: (): Promise<any>                     => ipcRenderer.invoke('tiered-memory:working-state'),
  },

  // ── Streaming Chat (Direct Provider Streaming) ─────────────────────
  streaming: {
    start: (opts: {
      streamId: string
      providerId: string
      model: string
      messages: Array<{ role: string; content: any }>
      maxTokens?: number
      temperature?: number
    }): Promise<any> => ipcRenderer.invoke('stream:start', opts),
    cancel: (streamId: string): Promise<any> => ipcRenderer.invoke('stream:cancel', streamId),
    onStarted: (cb: (data: { streamId: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('stream:started', handler)
      return () => { ipcRenderer.removeListener('stream:started', handler) }
    },
    onChunk: (cb: (data: { streamId: string; content: string; done: boolean; model?: string; usage?: any }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('stream:chunk', handler)
      return () => { ipcRenderer.removeListener('stream:chunk', handler) }
    },
    onDone: (cb: (data: { streamId: string; totalTokens: number }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('stream:done', handler)
      return () => { ipcRenderer.removeListener('stream:done', handler) }
    },
    onError: (cb: (data: { streamId: string; error: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('stream:error', handler)
      return () => { ipcRenderer.removeListener('stream:error', handler) }
    },
    onCancelled: (cb: (data: { streamId: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('stream:cancelled', handler)
      return () => { ipcRenderer.removeListener('stream:cancelled', handler) }
    },
  },

  // ── Agent Studio (CRUD) ────────────────────────────────────────────
  agentStudio: {
    create:    (def: any): Promise<any>                 => ipcRenderer.invoke('agent-studio:create', def),
    update:    (id: string, updates: any): Promise<any> => ipcRenderer.invoke('agent-studio:update', id, updates),
    delete:    (id: string): Promise<any>               => ipcRenderer.invoke('agent-studio:delete', id),
    duplicate: (id: string, name?: string): Promise<any> => ipcRenderer.invoke('agent-studio:duplicate', id, name),
    export:    (id: string): Promise<string | null>     => ipcRenderer.invoke('agent-studio:export', id),
    import:    (json: string): Promise<any>             => ipcRenderer.invoke('agent-studio:import', json),
  },

  // ── Smart Model Router ─────────────────────────────────────────────
  modelRouter: {
    route:     (taskType: string, complexity: string, context?: any): Promise<any> => ipcRenderer.invoke('model-router:route', taskType, complexity, context),
    getPolicy: (): Promise<any> => ipcRenderer.invoke('model-router:get-policy'),
    setPolicy: (updates: any): Promise<any> => ipcRenderer.invoke('model-router:set-policy', updates),
  },

  // ── Provider Health Dashboard ────────────────────────────────────────────
  providerHealth: {
    getAll:     (): Promise<any> => ipcRenderer.invoke('provider-health:all'),
    check:      (providerId: string): Promise<any> => ipcRenderer.invoke('provider-health:check', providerId),
    checkAll:   (): Promise<any> => ipcRenderer.invoke('provider-health:check-all'),
  },

  // ── Memory Lifecycle (Cross-Session Persistence) ────────────────────────
  memoryLifecycle: {
    getStats:         (): Promise<any> => ipcRenderer.invoke('memory-lifecycle:stats'),
    getSessions:      (limit?: number): Promise<any> => ipcRenderer.invoke('memory-lifecycle:sessions', limit),
    saveSnapshot:     (): Promise<any> => ipcRenderer.invoke('memory-lifecycle:save-snapshot'),
    restoreSnapshot:  (snapshotId: string): Promise<any> => ipcRenderer.invoke('memory-lifecycle:restore-snapshot', snapshotId),
    getSnapshot:      (snapshotId: string): Promise<any> => ipcRenderer.invoke('memory-lifecycle:get-snapshot', snapshotId),
    getCurrentSession: (): Promise<any> => ipcRenderer.invoke('memory-lifecycle:current-session'),
  },

  // ── Composer (Multi-File Changes) ─────────────────────────────────────
  composer: {
    compose:        (opts: { request: string; files: string[]; projectId?: string; folderScope?: string }): Promise<any> => ipcRenderer.invoke('composer:compose', opts),
    apply:          (sessionId: string): Promise<any>         => ipcRenderer.invoke('composer:apply', sessionId),
    rollback:       (sessionId: string): Promise<boolean>     => ipcRenderer.invoke('composer:rollback', sessionId),
    acceptChange:   (sessionId: string, changeId: string, accepted: boolean): Promise<boolean> => ipcRenderer.invoke('composer:accept-change', sessionId, changeId, accepted),
    acceptAll:      (sessionId: string): Promise<boolean>     => ipcRenderer.invoke('composer:accept-all', sessionId),
    rejectAll:      (sessionId: string): Promise<boolean>     => ipcRenderer.invoke('composer:reject-all', sessionId),
    getSession:     (sessionId: string): Promise<any>         => ipcRenderer.invoke('composer:session', sessionId),
    listSessions:   (): Promise<any[]>                        => ipcRenderer.invoke('composer:sessions'),
    onPreview: (cb: (session: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('composer:preview', handler)
      return () => ipcRenderer.removeListener('composer:preview', handler)
    },
    onApplied: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('composer:applied', handler)
      return () => ipcRenderer.removeListener('composer:applied', handler)
    },
    onFailed: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('composer:failed', handler)
      return () => ipcRenderer.removeListener('composer:failed', handler)
    },
  },

  // ── Automations (Background Agent Rules) ────────────────────────────────
  automations: {
    addRule:       (opts: any): Promise<any>                   => ipcRenderer.invoke('automation:add-rule', opts),
    updateRule:    (id: string, updates: any): Promise<any>    => ipcRenderer.invoke('automation:update-rule', id, updates),
    deleteRule:    (id: string): Promise<boolean>              => ipcRenderer.invoke('automation:delete-rule', id),
    getRule:       (id: string): Promise<any>                  => ipcRenderer.invoke('automation:get-rule', id),
    listRules:     (projectId?: string): Promise<any[]>        => ipcRenderer.invoke('automation:list-rules', projectId),
    trigger:       (ruleId: string, data?: any): Promise<any>  => ipcRenderer.invoke('automation:trigger', ruleId, data),
    getLogs:       (opts?: any): Promise<any[]>                => ipcRenderer.invoke('automation:logs', opts),
    getStats:      (): Promise<any>                            => ipcRenderer.invoke('automation:stats'),
    onTriggered: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('automation:triggered', handler)
      return () => ipcRenderer.removeListener('automation:triggered', handler)
    },
    onExecuted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('automation:executed', handler)
      return () => ipcRenderer.removeListener('automation:executed', handler)
    },
    onRuleAdded: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('automation:rule-added', handler)
      return () => ipcRenderer.removeListener('automation:rule-added', handler)
    },
  },

  // ── RAG Knowledge Stacks ────────────────────────────────────────────────
  rag: {
    createStack:     (name: string, projectId: string, desc?: string): Promise<any> => ipcRenderer.invoke('rag:create-stack', name, projectId, desc),
    getStack:        (id: string): Promise<any>                => ipcRenderer.invoke('rag:get-stack', id),
    listStacks:      (projectId?: string): Promise<any[]>      => ipcRenderer.invoke('rag:list-stacks', projectId),
    deleteStack:     (id: string): Promise<boolean>            => ipcRenderer.invoke('rag:delete-stack', id),
    ingest:          (stackId: string, opts: { filePath?: string; content?: string; fileName?: string; fileType?: string }): Promise<any> => ipcRenderer.invoke('rag:ingest', stackId, opts),
    removeDocument:  (docId: string): Promise<boolean>         => ipcRenderer.invoke('rag:remove-document', docId),
    listDocuments:   (stackId: string): Promise<any[]>         => ipcRenderer.invoke('rag:list-documents', stackId),
    query:           (stackId: string, query: string, opts?: any): Promise<any[]> => ipcRenderer.invoke('rag:query', stackId, query, opts),
    queryProject:    (projectId: string, query: string, opts?: any): Promise<any[]> => ipcRenderer.invoke('rag:query-project', projectId, query, opts),
    buildContext:    (projectId: string, query: string, opts?: any): Promise<string> => ipcRenderer.invoke('rag:build-context', projectId, query, opts),
    onDocumentIngested: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('rag:document:ingested', handler)
      return () => ipcRenderer.removeListener('rag:document:ingested', handler)
    },
    onStackCreated: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('rag:stack:created', handler)
      return () => ipcRenderer.removeListener('rag:stack:created', handler)
    },
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
    onQuickAsk: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('shortcut:quick-ask', handler)
      return () => ipcRenderer.removeListener('shortcut:quick-ask', handler)
    },
    onClipboardAsk: (cb: (data: { clipboardContent: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('shortcut:clipboard-ask', handler)
      return () => ipcRenderer.removeListener('shortcut:clipboard-ask', handler)
    },
    onScreenshotAsk: (cb: (data: { screenshotBase64: string }) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('shortcut:screenshot-ask', handler)
      return () => ipcRenderer.removeListener('shortcut:screenshot-ask', handler)
    },
    onToggleCowork: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('shortcut:toggle-cowork', handler)
      return () => ipcRenderer.removeListener('shortcut:toggle-cowork', handler)
    },
  },

  // ── Global Shortcuts Config (Phase 6A) ─────────────────────────────────────
  shortcutConfig: {
    list:          (): Promise<any[]>                => ipcRenderer.invoke('shortcuts:list'),
    get:           (id: string): Promise<any>        => ipcRenderer.invoke('shortcuts:get', id),
    update:        (id: string, updates: any): Promise<any> => ipcRenderer.invoke('shortcuts:update', id, updates),
    add:           (opts: any): Promise<any>         => ipcRenderer.invoke('shortcuts:add', opts),
    remove:        (id: string): Promise<boolean>    => ipcRenderer.invoke('shortcuts:remove', id),
    hasConflict:   (accel: string, excludeId?: string): Promise<boolean> => ipcRenderer.invoke('shortcuts:has-conflict', accel, excludeId),
    getClipboard:  (): Promise<string>               => ipcRenderer.invoke('shortcuts:get-clipboard'),
    onActivated: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('shortcut:activated', handler)
      return () => ipcRenderer.removeListener('shortcut:activated', handler)
    },
    onUpdated: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('shortcut:updated', handler)
      return () => ipcRenderer.removeListener('shortcut:updated', handler)
    },
  },

  // ── Browser Preview (Phase 6B) ─────────────────────────────────────────────
  preview: {
    navigate:       (url: string): Promise<void>     => ipcRenderer.invoke('preview:navigate', url),
    goBack:         (): Promise<void>                 => ipcRenderer.invoke('preview:go-back'),
    goForward:      (): Promise<void>                 => ipcRenderer.invoke('preview:go-forward'),
    reload:         (): Promise<void>                 => ipcRenderer.invoke('preview:reload'),
    attach:         (): Promise<void>                 => ipcRenderer.invoke('preview:attach'),
    detach:         (): Promise<void>                 => ipcRenderer.invoke('preview:detach'),
    setViewport:    (preset: string): Promise<void>   => ipcRenderer.invoke('preview:set-viewport', preset),
    getViewports:   (): Promise<any>                  => ipcRenderer.invoke('preview:get-viewports'),
    capture:        (): Promise<string | null>        => ipcRenderer.invoke('preview:capture'),
    getState:       (): Promise<any>                  => ipcRenderer.invoke('preview:get-state'),
    getConsole:     (limit?: number): Promise<any[]>  => ipcRenderer.invoke('preview:get-console', limit),
    clearConsole:   (): Promise<void>                 => ipcRenderer.invoke('preview:clear-console'),
    startAutoReload: (): Promise<void>                => ipcRenderer.invoke('preview:auto-reload-start'),
    stopAutoReload:  (): Promise<void>                => ipcRenderer.invoke('preview:auto-reload-stop'),
    toggleDevTools:  (): Promise<void>                => ipcRenderer.invoke('preview:toggle-devtools'),
    onStateChanged: (cb: (state: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('preview:state-changed', handler)
      return () => ipcRenderer.removeListener('preview:state-changed', handler)
    },
    onConsole: (cb: (entry: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('preview:console', handler)
      return () => ipcRenderer.removeListener('preview:console', handler)
    },
    onLoading: (cb: (loading: boolean) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('preview:loading', handler)
      return () => ipcRenderer.removeListener('preview:loading', handler)
    },
  },

  // ── Browser Agent (OpenClaw Browser Tools) ─────────────────────────────────
  browserAgent: {
    enable:        (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('browser-agent:enable'),
    disable:       (): Promise<void>       => ipcRenderer.invoke('browser-agent:disable'),
    isEnabled:     (): Promise<boolean>    => ipcRenderer.invoke('browser-agent:is-enabled'),
    getState:      (): Promise<any>        => ipcRenderer.invoke('browser-agent:get-state'),
    navigate:      (url: string, opts?: any): Promise<any>  => ipcRenderer.invoke('browser-agent:navigate', url, opts),
    click:         (opts: any): Promise<void>               => ipcRenderer.invoke('browser-agent:click', opts),
    fill:          (opts: any): Promise<void>               => ipcRenderer.invoke('browser-agent:fill', opts),
    select:        (selector: string, value: string): Promise<void> => ipcRenderer.invoke('browser-agent:select', selector, value),
    scroll:        (dir: string, amount?: number): Promise<void>    => ipcRenderer.invoke('browser-agent:scroll', dir, amount),
    waitForSelector: (selector: string, timeout?: number): Promise<void> => ipcRenderer.invoke('browser-agent:wait', selector, timeout),
    screenshot:    (opts?: any): Promise<string>            => ipcRenderer.invoke('browser-agent:screenshot', opts),
    ariaSnapshot:  (): Promise<string>                      => ipcRenderer.invoke('browser-agent:aria-snapshot'),
    captureSnapshot: (): Promise<any>                       => ipcRenderer.invoke('browser-agent:snapshot'),
    evaluate:      (opts: any): Promise<any>                => ipcRenderer.invoke('browser-agent:evaluate', opts),
    getPageText:   (maxLen?: number): Promise<string>       => ipcRenderer.invoke('browser-agent:get-text', maxLen),
    getPageHtml:   (selector?: string): Promise<string>     => ipcRenderer.invoke('browser-agent:get-html', selector),
    getHistory:    (limit?: number): Promise<any[]>         => ipcRenderer.invoke('browser-agent:get-history', limit),
    clearHistory:  (): Promise<void>                        => ipcRenderer.invoke('browser-agent:clear-history'),
    onStateChanged: (cb: (state: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('browser-agent:state-changed', handler)
      return () => ipcRenderer.removeListener('browser-agent:state-changed', handler)
    },
    onAction: (cb: (action: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('browser-agent:action', handler)
      return () => ipcRenderer.removeListener('browser-agent:action', handler)
    },
    onActionComplete: (cb: (action: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('browser-agent:action-complete', handler)
      return () => ipcRenderer.removeListener('browser-agent:action-complete', handler)
    },
    onActionError: (cb: (action: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('browser-agent:action-error', handler)
      return () => ipcRenderer.removeListener('browser-agent:action-error', handler)
    },
  },

  // ── Workflow Recipes (Phase 6C) ────────────────────────────────────────────
  recipes: {
    list:         (category?: string): Promise<any[]>     => ipcRenderer.invoke('recipes:list', category),
    get:          (id: string): Promise<any>              => ipcRenderer.invoke('recipes:get', id),
    categories:   (): Promise<string[]>                   => ipcRenderer.invoke('recipes:categories'),
    create:       (opts: any): Promise<any>               => ipcRenderer.invoke('recipes:create', opts),
    update:       (id: string, updates: any): Promise<any> => ipcRenderer.invoke('recipes:update', id, updates),
    delete:       (id: string): Promise<boolean>          => ipcRenderer.invoke('recipes:delete', id),
    run:          (id: string, vars?: any): Promise<any>  => ipcRenderer.invoke('recipes:run', id, vars),
    getRun:       (runId: string): Promise<any>           => ipcRenderer.invoke('recipes:get-run', runId),
    listRuns:     (opts?: any): Promise<any[]>            => ipcRenderer.invoke('recipes:list-runs', opts),
    cancelRun:    (runId: string): Promise<boolean>       => ipcRenderer.invoke('recipes:cancel-run', runId),
    export:       (id: string): Promise<string | null>    => ipcRenderer.invoke('recipes:export', id),
    import:       (json: string): Promise<any>            => ipcRenderer.invoke('recipes:import', json),
    onRunStarted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('recipes:run:started', handler)
      return () => ipcRenderer.removeListener('recipes:run:started', handler)
    },
    onRunCompleted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('recipes:run:completed', handler)
      return () => ipcRenderer.removeListener('recipes:run:completed', handler)
    },
    onStepCompleted: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('recipes:run:step-completed', handler)
      return () => ipcRenderer.removeListener('recipes:run:step-completed', handler)
    },
    onStepFailed: (cb: (data: any) => void) => {
      const handler = (_: unknown, d: any) => cb(d)
      ipcRenderer.on('recipes:run:step-failed', handler)
      return () => ipcRenderer.removeListener('recipes:run:step-failed', handler)
    },
  },

  // ── Conversation Branching ──────────────────────────────────────────────────
  branching: {
    getTree:           (sessionId: string): Promise<any>     => ipcRenderer.invoke('branching:get-tree', sessionId),
    getBranches:       (sessionId: string): Promise<any[]>   => ipcRenderer.invoke('branching:get-branches', sessionId),
    getMessages:       (branchId: string): Promise<any[]>    => ipcRenderer.invoke('branching:get-messages', branchId),
    create:            (sessionId: string, forkPoint: number, name?: string): Promise<any> => ipcRenderer.invoke('branching:create', sessionId, forkPoint, name),
    rename:            (branchId: string, name: string): Promise<any> => ipcRenderer.invoke('branching:rename', branchId, name),
    delete:            (branchId: string): Promise<any>      => ipcRenderer.invoke('branching:delete', branchId),
    merge:             (sourceId: string, targetId: string): Promise<any> => ipcRenderer.invoke('branching:merge', sourceId, targetId),
    getStats:          (): Promise<any>                      => ipcRenderer.invoke('branching:stats'),
    getCurrentSessionId: (): Promise<string>                 => ipcRenderer.invoke('branching:current-session'),
  },

  // ── Agent Analytics ─────────────────────────────────────────────────────────
  analytics: {
    record:         (data: any): Promise<any>                => ipcRenderer.invoke('analytics:record', data),
    agentStats:     (agentId: string, from?: number, to?: number): Promise<any> => ipcRenderer.invoke('analytics:agent-stats', agentId, from, to),
    providerStats:  (providerId: string, from?: number): Promise<any> => ipcRenderer.invoke('analytics:provider-stats', providerId, from),
    modelStats:     (modelId: string, from?: number): Promise<any> => ipcRenderer.invoke('analytics:model-stats', modelId, from),
    timeSeries:     (agentId: string, days?: number, granularity?: string): Promise<any> => ipcRenderer.invoke('analytics:time-series', agentId, days, granularity),
    topAgents:      (limit?: number): Promise<any>           => ipcRenderer.invoke('analytics:top-agents', limit),
    overall:        (): Promise<any>                         => ipcRenderer.invoke('analytics:overall'),
    costBreakdown:  (days?: number): Promise<any>            => ipcRenderer.invoke('analytics:cost-breakdown', days),
  },

  // ── Notification Center ─────────────────────────────────────────────────────
  notifications: {
    list:           (opts?: any): Promise<any[]>             => ipcRenderer.invoke('notifications:list', opts),
    push:           (opts: any): Promise<any>                => ipcRenderer.invoke('notifications:push', opts),
    markRead:       (id: string): Promise<any>               => ipcRenderer.invoke('notifications:mark-read', id),
    markAllRead:    (category?: string): Promise<any>        => ipcRenderer.invoke('notifications:mark-all-read', category),
    dismiss:        (id: string): Promise<any>               => ipcRenderer.invoke('notifications:dismiss', id),
    dismissAll:     (category?: string): Promise<any>        => ipcRenderer.invoke('notifications:dismiss-all', category),
    unreadCounts:   (): Promise<any>                         => ipcRenderer.invoke('notifications:unread-counts'),
    unreadCount:    (category?: string): Promise<any>        => ipcRenderer.invoke('notifications:unread-count', category),
    search:         (query: string): Promise<any[]>          => ipcRenderer.invoke('notifications:search', query),
    stats:          (): Promise<any>                         => ipcRenderer.invoke('notifications:stats'),
    delete:         (id: string): Promise<any>               => ipcRenderer.invoke('notifications:delete', id),
  },

  // ── Context Visualizer ──────────────────────────────────────────────────────
  contextViz: {
    getBreakdown:    (modelId?: string): Promise<any>        => ipcRenderer.invoke('context-viz:breakdown', modelId),
    getModelLimits:  (): Promise<Record<string, number>>     => ipcRenderer.invoke('context-viz:model-limits'),
    estimateTokens:  (text: string): Promise<number>         => ipcRenderer.invoke('context-viz:estimate-tokens', text),
    getHistory:      (hours?: number): Promise<any[]>        => ipcRenderer.invoke('context-viz:history', hours),
    recordSnapshot:  (): Promise<any>                        => ipcRenderer.invoke('context-viz:record-snapshot'),
  },

  // ── Plugin Studio ──────────────────────────────────────────────────────────
  pluginStudio: {
    browseRegistry:  (query?: string, category?: string): Promise<any> => ipcRenderer.invoke('plugin-studio:browse-registry', query, category),
    install:         (entry: any): Promise<any>              => ipcRenderer.invoke('plugin-studio:install', entry),
    uninstall:       (pluginId: string): Promise<any>        => ipcRenderer.invoke('plugin-studio:uninstall', pluginId),
    enable:          (pluginId: string): Promise<any>        => ipcRenderer.invoke('plugin-studio:enable', pluginId),
    disable:         (pluginId: string): Promise<any>        => ipcRenderer.invoke('plugin-studio:disable', pluginId),
    listInstalled:   (): Promise<any>                        => ipcRenderer.invoke('plugin-studio:list-installed'),
    getConfig:       (pluginId: string): Promise<any>        => ipcRenderer.invoke('plugin-studio:get-config', pluginId),
    setConfig:       (pluginId: string, config: any): Promise<any> => ipcRenderer.invoke('plugin-studio:set-config', pluginId, config),
    stats:           (): Promise<any>                        => ipcRenderer.invoke('plugin-studio:stats'),
  },

  // ── Prompt Library Store ───────────────────────────────────────────────────
  promptLib: {
    list:            (opts?: any): Promise<any>              => ipcRenderer.invoke('prompt-lib:list', opts),
    create:          (title: string, content: string, category?: string, tags?: string[]): Promise<any> => ipcRenderer.invoke('prompt-lib:create', title, content, category, tags),
    update:          (id: string, updates: any): Promise<any> => ipcRenderer.invoke('prompt-lib:update', id, updates),
    delete:          (id: string): Promise<any>              => ipcRenderer.invoke('prompt-lib:delete', id),
    get:             (id: string): Promise<any>              => ipcRenderer.invoke('prompt-lib:get', id),
    getCategories:   (): Promise<any>                        => ipcRenderer.invoke('prompt-lib:categories'),
    toggleFavorite:  (id: string): Promise<any>              => ipcRenderer.invoke('prompt-lib:toggle-favorite', id),
    recordUse:       (id: string): Promise<any>              => ipcRenderer.invoke('prompt-lib:record-use', id),
    interpolate:     (content: string, variables: Record<string, string>): Promise<any> => ipcRenderer.invoke('prompt-lib:interpolate', content, variables),
    stats:           (): Promise<any>                        => ipcRenderer.invoke('prompt-lib:stats'),
  },

  // ── Task Board ─────────────────────────────────────────────────────────────
  taskBoard: {
    create:          (title: string, opts?: any): Promise<any> => ipcRenderer.invoke('task-board:create', title, opts),
    update:          (id: string, updates: any): Promise<any> => ipcRenderer.invoke('task-board:update', id, updates),
    delete:          (id: string): Promise<any>              => ipcRenderer.invoke('task-board:delete', id),
    get:             (id: string): Promise<any>              => ipcRenderer.invoke('task-board:get', id),
    moveToStatus:    (id: string, status: string, position?: number): Promise<any> => ipcRenderer.invoke('task-board:move', id, status, position),
    getBoard:        (): Promise<any>                        => ipcRenderer.invoke('task-board:get-board'),
    search:          (query: string): Promise<any>           => ipcRenderer.invoke('task-board:search', query),
    getStats:        (): Promise<any>                        => ipcRenderer.invoke('task-board:stats'),
  },

  // ── API Playground ─────────────────────────────────────────────────────────
  apiPlayground: {
    execute:         (providerId: string, modelId: string, endpoint: string, payload: any): Promise<any> => ipcRenderer.invoke('api-playground:execute', providerId, modelId, endpoint, payload),
    getHistory:      (limit?: number): Promise<any>          => ipcRenderer.invoke('api-playground:history', limit),
    getRequest:      (id: string): Promise<any>              => ipcRenderer.invoke('api-playground:get-request', id),
    clearHistory:    (): Promise<any>                        => ipcRenderer.invoke('api-playground:clear-history'),
    listPresets:     (): Promise<any>                        => ipcRenderer.invoke('api-playground:list-presets'),
    savePreset:      (name: string, providerId: string, modelId: string, endpoint: string, payload: any): Promise<any> => ipcRenderer.invoke('api-playground:save-preset', name, providerId, modelId, endpoint, payload),
    deletePreset:    (id: string): Promise<any>              => ipcRenderer.invoke('api-playground:delete-preset', id),
    stats:           (): Promise<any>                        => ipcRenderer.invoke('api-playground:stats'),
  },

  // ── Performance Profiler ───────────────────────────────────────────────────
  perfProfiler: {
    record:              (entry: any): Promise<any>          => ipcRenderer.invoke('perf-profiler:record', entry),
    providerProfile:     (providerId: string, hours?: number): Promise<any> => ipcRenderer.invoke('perf-profiler:provider-profile', providerId, hours),
    allProviderProfiles: (hours?: number): Promise<any>      => ipcRenderer.invoke('perf-profiler:all-profiles', hours),
    latencyTimeSeries:   (providerId?: string, hours?: number, bucket?: number): Promise<any> => ipcRenderer.invoke('perf-profiler:latency-series', providerId, hours, bucket),
    waterfall:           (limit?: number): Promise<any>      => ipcRenderer.invoke('perf-profiler:waterfall', limit),
    overall:             (hours?: number): Promise<any>      => ipcRenderer.invoke('perf-profiler:overall', hours),
  },

  // ── Session 7 ──────────────────────────────────────────────────────────────
  voice: {
    startSession:      (mode?: string): Promise<any>                => ipcRenderer.invoke('voice:start-session', mode),
    endSession:        (sessionId: string): Promise<any>            => ipcRenderer.invoke('voice:end-session', sessionId),
    addTranscription:  (sessionId: string, role: string, text: string, confidence?: number): Promise<any> => ipcRenderer.invoke('voice:add-transcription', sessionId, role, text, confidence),
    getTranscriptions: (sessionId: string): Promise<any>            => ipcRenderer.invoke('voice:get-transcriptions', sessionId),
    listSessions:      (limit?: number): Promise<any>               => ipcRenderer.invoke('voice:list-sessions', limit),
    getSettings:       (): Promise<any>                             => ipcRenderer.invoke('voice:get-settings'),
    updateSettings:    (updates: any): Promise<any>                 => ipcRenderer.invoke('voice:update-settings', updates),
  },

  fileAttachment: {
    uploadFromPath:  (filePath: string, chatId?: string, messageId?: string): Promise<any> => ipcRenderer.invoke('file-attachment:upload-path', filePath, chatId, messageId),
    list:            (limit?: number, chatId?: string): Promise<any> => ipcRenderer.invoke('file-attachment:list', limit, chatId),
    get:             (id: string): Promise<any>                     => ipcRenderer.invoke('file-attachment:get', id),
    delete:          (id: string): Promise<any>                     => ipcRenderer.invoke('file-attachment:delete', id),
    getStats:        (): Promise<any>                               => ipcRenderer.invoke('file-attachment:stats'),
  },

  diffViewer: {
    compare:      (oldText: string, newText: string, label?: string): Promise<any> => ipcRenderer.invoke('diff-viewer:compare', oldText, newText, label),
    getHistory:   (limit?: number): Promise<any>                    => ipcRenderer.invoke('diff-viewer:history', limit),
    clearHistory: (): Promise<any>                                  => ipcRenderer.invoke('diff-viewer:clear-history'),
  },

  abTesting: {
    createTest:   (name: string, prompt: string, models: any[], systemPrompt?: string): Promise<any> => ipcRenderer.invoke('ab-testing:create', name, prompt, models, systemPrompt),
    runTest:      (testId: string): Promise<any>                    => ipcRenderer.invoke('ab-testing:run', testId),
    getTest:      (testId: string): Promise<any>                    => ipcRenderer.invoke('ab-testing:get', testId),
    listTests:    (limit?: number): Promise<any>                    => ipcRenderer.invoke('ab-testing:list', limit),
    scoreVariant: (variantId: string, score: number, notes?: string): Promise<any> => ipcRenderer.invoke('ab-testing:score', variantId, score, notes),
    deleteTest:   (testId: string): Promise<any>                    => ipcRenderer.invoke('ab-testing:delete', testId),
    getStats:     (): Promise<any>                                  => ipcRenderer.invoke('ab-testing:stats'),
  },

  themeEngine: {
    listThemes:  (): Promise<any>                                  => ipcRenderer.invoke('theme:list'),
    get:         (id: string): Promise<any>                        => ipcRenderer.invoke('theme:get', id),
    create:      (name: string, palette: any, opts?: any): Promise<any> => ipcRenderer.invoke('theme:create', name, palette, opts),
    update:      (id: string, updates: any): Promise<any>          => ipcRenderer.invoke('theme:update', id, updates),
    delete:      (id: string): Promise<any>                        => ipcRenderer.invoke('theme:delete', id),
    activate:    (id: string): Promise<any>                        => ipcRenderer.invoke('theme:activate', id),
    getActive:   (): Promise<any>                                  => ipcRenderer.invoke('theme:get-active'),
    export:      (id: string): Promise<any>                        => ipcRenderer.invoke('theme:export', id),
    import:      (json: string): Promise<any>                      => ipcRenderer.invoke('theme:import', json),
    css:         (themeId?: string): Promise<any>                  => ipcRenderer.invoke('theme:css', themeId),
  },

  // ── Session 8 ─────────────────────────────────────────────────────────────
  globalSearch: {
    search:       (params: any): Promise<any>                     => ipcRenderer.invoke('global-search:search', params),
    history:      (limit?: number): Promise<any>                  => ipcRenderer.invoke('global-search:history', limit),
    clear:        (): Promise<any>                                => ipcRenderer.invoke('global-search:clear'),
    stats:        (): Promise<any>                                => ipcRenderer.invoke('global-search:stats'),
  },

  activityFeed: {
    record:       (type: string, action: string, title: string, opts?: any): Promise<any> => ipcRenderer.invoke('activity-feed:record', type, action, title, opts),
    recent:       (limit?: number, offset?: number): Promise<any> => ipcRenderer.invoke('activity-feed:recent', limit, offset),
    byType:       (type: string, limit?: number): Promise<any>    => ipcRenderer.invoke('activity-feed:by-type', type, limit),
    stats:        (hours?: number): Promise<any>                  => ipcRenderer.invoke('activity-feed:stats', hours),
  },

  // ── Session 9 ─────────────────────────────────────────────────────────────
  workspaceExport: {
    export:       (tables?: string[]): Promise<any>               => ipcRenderer.invoke('workspace-export:export', tables),
    import:       (): Promise<any>                                => ipcRenderer.invoke('workspace-export:import'),
    history:      (limit?: number): Promise<any>                  => ipcRenderer.invoke('workspace-export:history', limit),
  },

  reportGen: {
    session:      (sessionId?: string): Promise<any>              => ipcRenderer.invoke('report-gen:session', sessionId),
    analytics:    (hours?: number): Promise<any>                  => ipcRenderer.invoke('report-gen:analytics', hours),
    custom:       (title: string, sections: any[]): Promise<any>  => ipcRenderer.invoke('report-gen:custom', title, sections),
    get:          (id: string): Promise<any>                      => ipcRenderer.invoke('report-gen:get', id),
    list:         (limit?: number): Promise<any>                  => ipcRenderer.invoke('report-gen:list', limit),
    delete:       (id: string): Promise<any>                      => ipcRenderer.invoke('report-gen:delete', id),
  },

  webhookMgr: {
    create:       (name: string, url: string, events: string[], opts?: any): Promise<any> => ipcRenderer.invoke('webhook:create', name, url, events, opts),
    update:       (id: string, updates: any): Promise<any>        => ipcRenderer.invoke('webhook:update', id, updates),
    delete:       (id: string): Promise<any>                      => ipcRenderer.invoke('webhook:delete', id),
    enable:       (id: string): Promise<any>                      => ipcRenderer.invoke('webhook:enable', id),
    disable:      (id: string): Promise<any>                      => ipcRenderer.invoke('webhook:disable', id),
    list:         (): Promise<any>                                => ipcRenderer.invoke('webhook:list'),
    logs:         (webhookId?: string, limit?: number): Promise<any> => ipcRenderer.invoke('webhook:logs', webhookId, limit),
    stats:        (): Promise<any>                                => ipcRenderer.invoke('webhook:stats'),
  },

  backupMgr: {
    create:       (type?: string, label?: string): Promise<any>   => ipcRenderer.invoke('backup:create', type, label),
    restore:      (id: string): Promise<any>                      => ipcRenderer.invoke('backup:restore', id),
    list:         (limit?: number): Promise<any>                  => ipcRenderer.invoke('backup:list', limit),
    delete:       (id: string): Promise<any>                      => ipcRenderer.invoke('backup:delete', id),
    stats:        (): Promise<any>                                => ipcRenderer.invoke('backup:stats'),
  },

  sessionSharing: {
    export:       (sessionId: string, format?: string): Promise<any> => ipcRenderer.invoke('session-sharing:export', sessionId, format),
    import:       (): Promise<any>                                => ipcRenderer.invoke('session-sharing:import'),
    list:         (limit?: number): Promise<any>                  => ipcRenderer.invoke('session-sharing:list', limit),
    delete:       (id: string): Promise<any>                      => ipcRenderer.invoke('session-sharing:delete', id),
  },

  // ── Session 10 ────────────────────────────────────────────────────────────
  errorBoundary: {
    capture:      (module: string, message: string, opts?: any): Promise<any> => ipcRenderer.invoke('error-boundary:capture', module, message, opts),
    recent:       (limit?: number): Promise<any>                  => ipcRenderer.invoke('error-boundary:recent', limit),
    bySeverity:   (severity: string, limit?: number): Promise<any> => ipcRenderer.invoke('error-boundary:by-severity', severity, limit),
    markRecovered:(id: string): Promise<any>                      => ipcRenderer.invoke('error-boundary:mark-recovered', id),
    stats:        (hours?: number): Promise<any>                  => ipcRenderer.invoke('error-boundary:stats', hours),
  },

  offlineMgr: {
    stats:        (): Promise<any>                                => ipcRenderer.invoke('offline:stats'),
    queue:        (status?: string): Promise<any>                 => ipcRenderer.invoke('offline:queue', status),
    connectivityLog: (limit?: number): Promise<any>               => ipcRenderer.invoke('offline:connectivity-log', limit),
    clearCompleted: (): Promise<any>                              => ipcRenderer.invoke('offline:clear-completed'),
  },

  startupProfiler: {
    finalize:     (): Promise<any>                                => ipcRenderer.invoke('startup-profiler:finalize'),
    history:      (limit?: number): Promise<any>                  => ipcRenderer.invoke('startup-profiler:history', limit),
    get:          (id: string): Promise<any>                      => ipcRenderer.invoke('startup-profiler:get', id),
    average:      (count?: number): Promise<any>                  => ipcRenderer.invoke('startup-profiler:average', count),
  },

  accessibility: {
    getSettings:  (): Promise<any>                                => ipcRenderer.invoke('a11y:get-settings'),
    update:       (updates: any): Promise<any>                    => ipcRenderer.invoke('a11y:update', updates),
    reset:        (): Promise<any>                                => ipcRenderer.invoke('a11y:reset'),
    css:          (): Promise<any>                                => ipcRenderer.invoke('a11y:css'),
  },

  buildValidator: {
    run:          (): Promise<any>                                => ipcRenderer.invoke('build-validator:run'),
    history:      (limit?: number): Promise<any>                  => ipcRenderer.invoke('build-validator:history', limit),
    get:          (id: string): Promise<any>                      => ipcRenderer.invoke('build-validator:get', id),
  },

  // ── Year 1: Channel Router ──────────────────────────────────────────────────
  channelRouter: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('channelRouter:init'),
    routeMessage:           (...args: any[]): Promise<any>        => ipcRenderer.invoke('channelRouter:routeMessage', ...args),
    getActiveSessions:      (): Promise<any>                      => ipcRenderer.invoke('channelRouter:getActiveSessions'),
    clearStale:             (): Promise<any>                      => ipcRenderer.invoke('channelRouter:clearStale'),
  },

  // ── Year 1: Plugin Sandbox ──────────────────────────────────────────────────
  pluginSandbox: {
    createSandbox:          (...args: any[]): Promise<any>        => ipcRenderer.invoke('pluginSandbox:createSandbox', ...args),
    destroySandbox:         (...args: any[]): Promise<any>        => ipcRenderer.invoke('pluginSandbox:destroySandbox', ...args),
    listSandboxes:          (): Promise<any>                      => ipcRenderer.invoke('pluginSandbox:listSandboxes'),
    getSandboxStats:        (...args: any[]): Promise<any>        => ipcRenderer.invoke('pluginSandbox:getSandboxStats', ...args),
  },

  // ── Year 1: NyraGuard ──────────────────────────────────────────────────────
  nyraGuard: {
    scan:                   (...args: any[]): Promise<any>        => ipcRenderer.invoke('nyraGuard:scan', ...args),
    scanPlugin:             (...args: any[]): Promise<any>        => ipcRenderer.invoke('nyraGuard:scanPlugin', ...args),
    getResults:             (): Promise<any>                      => ipcRenderer.invoke('nyraGuard:getResults'),
    generateReport:         (...args: any[]): Promise<any>        => ipcRenderer.invoke('nyraGuard:generateReport', ...args),
  },

  // ── Year 1: Telemetry ──────────────────────────────────────────────────────
  telemetry: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('telemetry:init'),
    track:                  (...args: any[]): Promise<any>        => ipcRenderer.invoke('telemetry:track', ...args),
    getStats:               (): Promise<any>                      => ipcRenderer.invoke('telemetry:getStats'),
    setOptIn:               (...args: any[]): Promise<any>        => ipcRenderer.invoke('telemetry:setOptIn', ...args),
  },

  // ── Year 2: Collaboration ──────────────────────────────────────────────────
  priorityQueue: {
    enqueue:                (...args: any[]): Promise<any>        => ipcRenderer.invoke('priorityQueue:enqueue', ...args),
  },

  sharedWorkspace: {
    addEntry:               (...args: any[]): Promise<any>        => ipcRenderer.invoke('sharedWorkspace:addEntry', ...args),
  },

  pipeline: {
    execute:                (...args: any[]): Promise<any>        => ipcRenderer.invoke('pipeline:execute', ...args),
  },

  // ── Year 2: Voice Engine ───────────────────────────────────────────────────
  voiceEngine: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('voiceEngine:init'),
    startRecording:         (): Promise<any>                      => ipcRenderer.invoke('voiceEngine:startRecording'),
    stopRecording:          (): Promise<any>                      => ipcRenderer.invoke('voiceEngine:stopRecording'),
    speak:                  (...args: any[]): Promise<any>        => ipcRenderer.invoke('voiceEngine:speak', ...args),
    getConfig:              (): Promise<any>                      => ipcRenderer.invoke('voiceEngine:getConfig'),
    setConfig:              (...args: any[]): Promise<any>        => ipcRenderer.invoke('voiceEngine:setConfig', ...args),
  },

  // ── Year 2: Model Router ───────────────────────────────────────────────────
  modelRouter: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('modelRouter:init'),
    route:                  (...args: any[]): Promise<any>        => ipcRenderer.invoke('modelRouter:route', ...args),
    getStats:               (): Promise<any>                      => ipcRenderer.invoke('modelRouter:getStats'),
    addModel:               (...args: any[]): Promise<any>        => ipcRenderer.invoke('modelRouter:addModel', ...args),
    setBudget:              (...args: any[]): Promise<any>        => ipcRenderer.invoke('modelRouter:setBudget', ...args),
  },

  // ── Year 2: Security Scanner ───────────────────────────────────────────────
  securityScanner: {
    scanPlugin:             (...args: any[]): Promise<any>        => ipcRenderer.invoke('securityScanner:scanPlugin', ...args),
    getResults:             (): Promise<any>                      => ipcRenderer.invoke('securityScanner:getResults'),
  },

  // ── Year 3: SSO/RBAC ───────────────────────────────────────────────────────
  rbacManager: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('rbacManager:init'),
  },

  ssoProvider: {
    authenticate:           (...args: any[]): Promise<any>        => ipcRenderer.invoke('ssoProvider:authenticate', ...args),
  },

  teamManager: {
    addTeam:                (...args: any[]): Promise<any>        => ipcRenderer.invoke('teamManager:addTeam', ...args),
  },

  // ── Year 3: Policy Engine ──────────────────────────────────────────────────
  policyEngine: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('policyEngine:init'),
    evaluatePolicy:         (...args: any[]): Promise<any>        => ipcRenderer.invoke('policyEngine:evaluatePolicy', ...args),
  },

  // ── Year 3: Admin Console ──────────────────────────────────────────────────
  adminConsole: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('adminConsole:init'),
    getDashboard:           (): Promise<any>                      => ipcRenderer.invoke('adminConsole:getDashboard'),
  },

  // ── Year 3: Vertical Agents ────────────────────────────────────────────────
  verticalAgentManager: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('verticalAgentManager:init'),
    registerPack:           (...args: any[]): Promise<any>        => ipcRenderer.invoke('verticalAgentManager:registerPack', ...args),
    activatePack:           (...args: any[]): Promise<any>        => ipcRenderer.invoke('verticalAgentManager:activatePack', ...args),
  },

  // ── Year 4: Procedural Memory ──────────────────────────────────────────────
  proceduralMemory: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('proceduralMemory:init'),
    learnFromExperience:    (...args: any[]): Promise<any>        => ipcRenderer.invoke('proceduralMemory:learnFromExperience', ...args),
  },

  // ── Year 4: Cross-org Protocol ─────────────────────────────────────────────
  crossOrgProtocol: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('crossOrgProtocol:init'),
    shareAgent:             (...args: any[]): Promise<any>        => ipcRenderer.invoke('crossOrgProtocol:shareAgent', ...args),
  },

  // ── Year 4: Mobile Bridge ──────────────────────────────────────────────────
  mobileBridge: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('mobileBridge:init'),
    pairDevice:             (...args: any[]): Promise<any>        => ipcRenderer.invoke('mobileBridge:pairDevice', ...args),
    sync:                   (): Promise<any>                      => ipcRenderer.invoke('mobileBridge:sync'),
  },

  // ── Year 5: System Overlay ─────────────────────────────────────────────────
  systemOverlay: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('systemOverlay:init'),
    show:                   (...args: any[]): Promise<any>        => ipcRenderer.invoke('systemOverlay:show', ...args),
    hide:                   (): Promise<any>                      => ipcRenderer.invoke('systemOverlay:hide'),
  },

  // ── Year 5: i18n ───────────────────────────────────────────────────────────
  i18n: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('i18n:init'),
    translate:              (...args: any[]): Promise<any>        => ipcRenderer.invoke('i18n:translate', ...args),
    getLocales:             (): Promise<any>                      => ipcRenderer.invoke('i18n:getLocales'),
  },

  // ── Year 5: Agent Network ──────────────────────────────────────────────────
  agentNetwork: {
    init:                   (): Promise<any>                      => ipcRenderer.invoke('agentNetwork:init'),
    connectAgent:           (...args: any[]): Promise<any>        => ipcRenderer.invoke('agentNetwork:connectAgent', ...args),
    broadcastMessage:       (...args: any[]): Promise<any>        => ipcRenderer.invoke('agentNetwork:broadcastMessage', ...args),
  },
}

contextBridge.exposeInMainWorld('nyra', nyraApi)

declare global {
  interface Window { nyra: typeof nyraApi }
}
