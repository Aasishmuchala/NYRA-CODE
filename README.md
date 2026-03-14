# Nyra Desktop

A fully-featured AI desktop app powered by [OpenClaw](https://openclaw.ai). Same architecture as Claude Desktop — Electron + React + TypeScript — but auto-connects to an OpenClaw gateway instead of requiring any login.

## Quick Start

```bash
# Install dependencies
npm install

# Development (hot-reload)
npm run dev

# Build for production
npm run build

# Package for macOS
npm run package:mac

# Package for Windows
npm run package:win

# Package for both
npm run package:all
```

## How It Works

When Nyra opens:

1. **Checks** if OpenClaw is installed (bundled binary → PATH → common npm paths)
2. **Installs** OpenClaw automatically via `npm install -g openclaw` if missing (first run only)
3. **Detects** if the gateway is already running on `ws://127.0.0.1:18789`
4. **Spawns** `openclaw gateway --port 18789` if not running
5. **Connects** the renderer via WebSocket JSON-RPC 2.0
6. **Health-monitors** the gateway and auto-restarts on crash (exponential back-off, max 5 retries)

## Architecture

```
src/
├── main/
│   ├── index.ts         # Electron main process (window, tray, lifecycle)
│   ├── openclaw.ts      # OpenClaw auto-setup manager
│   ├── ipc.ts           # IPC channel registry (renderer ↔ main)
│   ├── mcp.ts           # MCP server config (nyra_mcp_config.json)
│   └── tray.ts          # System tray
├── preload/
│   └── index.ts         # contextBridge — exposes window.nyra API
└── renderer/
    ├── App.tsx           # Root component + layout
    ├── hooks/
    │   └── useOpenClaw.ts  # WebSocket client + session/chat state
    ├── components/
    │   ├── TitleBar.tsx     # Custom frameless titlebar
    │   ├── Sidebar.tsx      # Session list
    │   ├── ChatMessage.tsx  # Message bubble (streaming support)
    │   ├── ChatInput.tsx    # Input bar + file attach
    │   ├── BootSplash.tsx   # Loading/install screen
    │   ├── SettingsPanel.tsx # MCP config + about
    │   └── StatusBar.tsx    # Connection status
    └── styles/
        └── globals.css      # Tailwind + custom styles
```

## MCP Servers

Add MCP servers via **Settings → MCP Servers**, or edit `~/Library/Application Support/Nyra/nyra_mcp_config.json` directly:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/you/Documents"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "your-token-here" }
    }
  }
}
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop runtime | Electron 29 |
| Build system | electron-vite + Vite 5 |
| UI framework | React 18 + TypeScript |
| Styling | Tailwind CSS 3 |
| Icons | lucide-react |
| AI backend | OpenClaw (local gateway) |
| Protocol | JSON-RPC 2.0 over WebSocket |
| Tool integrations | Model Context Protocol (MCP) |
| Packaging | electron-builder (dmg, nsis, portable) |
| Updates | electron-updater (GitHub Releases) |
