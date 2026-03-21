/**
 * Browser shim for window.nyra — provides mock IPC responses
 * so the renderer can run standalone in a browser for development.
 * Every window.nyra.* namespace used in the renderer is stubbed here.
 */

const noop = async (..._args: any[]) => {};
const noopSync = (..._args: any[]) => {};
const noopArr = async () => [] as any[];
const noopNull = async () => null;
const noopStr = async () => '';
const noopFalse = async () => false;
const noopTrue = async () => true;
const noopUnsub = (_cb: any) => () => {};

const nyraShim: Record<string, any> = {
  // ── App ─────────────────────────────────────
  app: {
    isOnboarded: noopTrue,
    setOnboarded: noop,
    version: async () => '0.1.0-preview',
    openExternal: async (url: string) => window.open(url, '_blank'),
  },

  // ── Providers ───────────────────────────────
  providers: {
    list: async () => [
      { id: 'ollama', name: 'Ollama (Local)', status: 'available', icon: '🦙' },
      { id: 'openai', name: 'OpenAI', status: 'not-configured', icon: '🤖' },
      { id: 'anthropic', name: 'Anthropic', status: 'not-configured', icon: '🧠' },
    ],
    catalog: async () => [
      { id: 'ollama', name: 'Ollama (Local)', description: 'Run models locally', icon: '🦙' },
      { id: 'openai', name: 'OpenAI', description: 'GPT-4o, o1, etc.', icon: '🤖' },
      { id: 'anthropic', name: 'Anthropic', description: 'Claude 3.5 Sonnet, Opus', icon: '🧠' },
    ],
    saveKey: noop,
    removeKey: noop,
    setModel: noop,
    startOAuth: noop,
    openOauth: noop,
    githubDeviceFlow: noop,
    oauthAvailability: async () => ({ openai: true, gemini: false, copilot: true, anthropic: false }),
    onDeviceCode: noopUnsub,
    onOAuthComplete: noopUnsub,
    removeOAuthListeners: noopSync,
  },

  // ── OpenClaw Gateway ────────────────────────
  openclaw: {
    getStatus: async () => 'running',
    getWsUrl: async () => 'ws://localhost:18080',
    restart: noopSync,
    onStatusChange: noopUnsub,
    onLog: noopUnsub,
    onInstallLog: noopUnsub,
    onReady: (cb: () => void) => { setTimeout(cb, 200); },
    onError: noopUnsub,
    removeAllListeners: noopSync,
  },

  // ── Ollama ──────────────────────────────────
  ollama: {
    status: async () => 'running',
    models: async () => [
      { name: 'llama3.1:latest', size: '4.7 GB', modified: '2025-01-15' },
      { name: 'codellama:latest', size: '3.8 GB', modified: '2025-01-10' },
    ],
    pull: noop,
    delete: noop,
    sync: noop,
    onPullProgress: noopUnsub,
    removePullListener: noopSync,
  },

  // ── Desktop Control ─────────────────────────
  desktop: {
    mouseClick: noop,
    mouseMove: noop,
    typeText: noop,
    pressKey: noop,
    hotkey: noop,
    launchApp: noop,
    focusApp: noop,
    activeWindow: async () => ({ title: 'Browser Preview', app: 'Chrome', pid: 0 }),
    listApps: noopArr,
  },

  // ── Screen ──────────────────────────────────
  screen: {
    capture: async () => 'data:image/png;base64,',
    captureWindow: async () => 'data:image/png;base64,',
    listSources: noopArr,
  },

  // ── Files ───────────────────────────────────
  files: {
    read: async () => '',
    writeText: noop,
    requestFile: async () => null,
    requestDir: async () => null,
    saveDialog: async () => null,
  },

  // ── Git ─────────────────────────────────────
  git: {
    status: async () => ({ branch: 'main', clean: true, files: [], ahead: 0, behind: 0 }),
    log: async () => [
      { hash: 'abc1234', message: 'Initial commit', author: 'Nyra', date: '2025-01-01' },
    ],
    diff: noopStr,
    commit: noop,
    push: noop,
    pull: noop,
    branches: async () => ['main'],
    checkout: noop,
    stage: noop,
    stageAll: noop,
    showCommit: noopStr,
    open: noop,
  },

  // ── MCP ─────────────────────────────────────
  mcp: {
    list: noopArr,
    add: noop,
    remove: noop,
  },

  // ── Terminal (PTY) ──────────────────────────
  terminal: {
    create: async () => 'mock-session',
    write: noop,
    resize: noop,
    kill: noop,
    list: noopArr,
    getHistory: noopStr,
    onData: noopUnsub,
    onExit: noopUnsub,
  },

  // ── Memory ──────────────────────────────────
  memory: {
    setFact: noop,
    getFact: noopNull,
    searchFacts: noopArr,
    listFacts: noopArr,
    deleteFact: noopFalse,
    addSummary: noop,
    getSummaries: noopArr,
    searchSummaries: noopArr,
    setProjectContext: noop,
    getProjectContext: noopArr,
    deleteProjectContext: noop,
    buildContextBlock: noopStr,
    stats: async () => ({ facts: 0, summaries: 0, projectContexts: 0, dbSizeBytes: 0 }),
    init: noop,
    close: noop,
  },

  // ── Plugins ─────────────────────────────────
  plugins: {
    list: noopArr,
    discover: noopArr,
    install: noop,
    remove: noop,
    enable: noop,
    disable: noop,
    load: noop,
    unload: noop,
    tools: noopArr,
  },

  // ── Skills ──────────────────────────────────
  skills: {
    browse: noopArr,
    install: noop,
    remove: noop,
    installed: noopArr,
    enable: noop,
    disable: noop,
  },

  // ── Projects ────────────────────────────────
  projects: {
    list: noopArr,
    create: noop,
  },

  // ── Prompts ─────────────────────────────────
  prompts: {
    list: noopArr,
    add: noop,
    update: noop,
    remove: noop,
  },

  // ── Scheduled Tasks ─────────────────────────
  scheduled: {
    list: noopArr,
    add: noop,
    update: noop,
    remove: noop,
  },

  // ── Notifications ───────────────────────────
  notify: {
    send: noop,
    onInApp: noopUnsub,
  },

  // ── Theme ───────────────────────────────────
  theme: {
    get: async () => 'dark',
    set: noop,
    onChange: noopUnsub,
  },

  // ── Window Controls ─────────────────────────
  window: {
    minimize: noopSync,
    maximize: noopSync,
    close: noopSync,
  },

  // ── Zoom ────────────────────────────────────
  zoom: {
    onChange: noopUnsub,
  },

  // ── Shortcuts ───────────────────────────────
  shortcuts: {
    onCommandPalette: noopUnsub,
    onNewChat: noopUnsub,
    onSettings: noopUnsub,
  },

  // ── Updater ─────────────────────────────────
  updater: {
    install: noop,
    onAvailable: noopUnsub,
    onReady: noopUnsub,
  },

  // ── System ──────────────────────────────────
  system: {
    openExternal: async (url: string) => window.open(url, '_blank'),
  },

  // ── Cowork: Tasks ─────────────────────────────
  tasks: {
    create: noopNull, list: noopArr, get: noopNull, update: noopNull,
    cancel: noopFalse, pause: noopFalse, resume: noopFalse, retry: noopFalse,
    execute: noopFalse, addNote: noop, getEvents: noopArr, getArtifacts: noopArr,
    activeCount: async () => 0, queued: noopArr, pendingApprovals: noopArr,
    onStatusChanged: noopUnsub, onProgress: noopUnsub, onApprovalNeeded: noopUnsub,
  },

  // ── Cowork: Agents ────────────────────────────
  agents: {
    list: noopArr, states: noopArr, get: noopNull, getState: noopNull,
    getRuns: noopArr, stop: noopFalse,
    setMode: noopFalse, getMode: async () => 'solo',
    getOrchestratorState: async () => ({ mode: 'solo', activeTasks: [], queuedTasks: [] }),
    resetAll: noop,
    onStatusChanged: noopUnsub, onHandoff: noopUnsub,
  },

  // ── Cowork: Folders ───────────────────────────
  folders: {
    attach: noopNull, detach: noopFalse, list: noopArr, get: noopNull,
    update: noopNull, addInstruction: noopNull, removeInstruction: noopFalse,
    getInstructions: noopArr, getTree: noopNull, getStats: noopNull,
    canAccess: noopTrue, onFileChanged: noopUnsub,
  },

  // ── Cowork: Context ───────────────────────────
  context: {
    assemble: noopNull, addSource: noopNull, removeSource: noopFalse,
    pin: noopFalse, unpin: noopFalse, toggleActive: noopFalse,
    listSources: noopArr, getBudget: async () => ({ used: 0, limit: 128000, percent: 0 }),
    getStats: async () => ({ totalSources: 0, activeSources: 0, pinnedSources: 0, sourcesByType: {} }),
  },

  // ── Cowork: Approvals ─────────────────────────
  approvals: {
    listPending: noopArr, respond: noopNull, get: noopNull, byTask: noopArr,
    stats: async () => ({ total: 0, approved: 0, denied: 0, pending: 0 }),
  },

  // ── Cowork: Audit ─────────────────────────────
  audit: {
    query: noopArr, recent: noopArr, forFile: noopArr,
    count: async () => 0, summary: noopNull, exportAudit: noopStr,
  },

  // ── Cowork: Snapshots ─────────────────────────
  snapshots: {
    forFile: noopArr, rollback: noopFalse, get: noopNull,
    create: noopNull, stats: noopNull,
  },
};

// Install shim if not in Electron (window.nyra is set by preload in Electron)
if (!(window as any).nyra) {
  (window as any).nyra = nyraShim;
  console.log(
    '%c[Nyra] Running in browser preview mode (mocked IPC)',
    'color: #d4845a; font-weight: bold; font-size: 14px;'
  );
}
