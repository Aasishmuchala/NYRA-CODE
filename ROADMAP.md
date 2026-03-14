# Nyra Desktop v2 Roadmap — The Open AI Operating System

> **Mission:** Build the first model-agnostic, full-computer-control AI desktop agent that replaces Claude Code, Cowork, and ChatGPT Desktop with a single open tool.

---

## Competitive Analysis: Why They Can't Do What We Can

| Capability | Claude Code | Cowork | ChatGPT Desktop | **Nyra v2** |
|---|---|---|---|---|
| See your screen | ❌ | ❌ (VM only) | 📸 Screenshots only | ✅ **Live screen capture** |
| Control mouse/keyboard | ❌ | ❌ | ❌ (API only, not in app) | ✅ **Full autonomous control** |
| Run terminal commands | ✅ | ✅ (sandboxed) | ❌ | ✅ **Native, unsandboxed** |
| Edit files | ✅ | ✅ (workspace folder) | ❌ | ✅ **Full filesystem** |
| Control other apps | ❌ | ❌ | ❌ | ✅ **Launch, switch, automate** |
| Browse the web | ❌ | Via tools | Via ChatGPT | ✅ **Real browser control** |
| Use any AI model | ❌ (Anthropic only) | ❌ (Anthropic only) | ❌ (OpenAI only) | ✅ **Any provider + local** |
| Run local LLMs | ❌ | ❌ | ❌ | ✅ **Ollama/llama.cpp** |
| Plugin ecosystem | ✅ (plugins) | ✅ (plugins + MCP) | ❌ | ✅ **OpenClaw skills + MCP + custom** |
| Multi-agent teams | ✅ (Agent Teams) | ❌ | ❌ | ✅ **Via OpenClaw** |
| Works offline | ❌ | ❌ | ❌ | ✅ **With local models** |
| Open source gateway | ❌ | ❌ | ❌ | ✅ **OpenClaw** |
| Cross-platform | Terminal only | macOS + Windows | macOS + Windows | ✅ **macOS + Windows + Linux** |

---

## Phase 1: Desktop Agent Core (Weeks 1-3)

> *"Nyra can see your screen and control your computer"*

This is the #1 differentiator. Neither Claude Code nor Cowork can do this.

### 1.1 Screen Capture Engine
**What:** Capture the screen on-demand or continuously, send frames to the AI for visual understanding.

**How:**
- Use Electron's `desktopCapturer` API for screen/window capture
- Capture as PNG/JPEG, resize to fit model context windows (1024x768 typical)
- New main-process module: `src/main/screen.ts`
- IPC channels: `screen:capture`, `screen:start-stream`, `screen:stop-stream`
- Configurable capture interval (500ms–5s) for continuous monitoring

**UI:**
- "Screen" button in ChatInput toolbar (next to file attach + voice)
- Floating capture overlay showing what Nyra can see
- Red indicator when screen capture is active

### 1.2 Mouse & Keyboard Control
**What:** AI can move the mouse, click, type, scroll — full desktop automation.

**How:**
- Use `nut.js` (Node.js desktop automation library) for cross-platform mouse/keyboard control
- Alternative: `robotjs` for lower-level access
- New main-process module: `src/main/desktop-control.ts`
- Actions: `mouse.move(x,y)`, `mouse.click()`, `mouse.doubleClick()`, `mouse.scroll()`, `keyboard.type(text)`, `keyboard.pressKey(key)`, `keyboard.hotkey(mod, key)`
- Safety: require user confirmation before executing actions (configurable)
- All actions logged to a visible action history panel

**OpenClaw Integration:**
- Register these as OpenClaw tools so the gateway can invoke them during agent loops
- Map to OpenClaw's existing "Desktop Control" skill format
- Tool definitions: `computer.screenshot`, `computer.click`, `computer.type`, `computer.scroll`, `computer.hotkey`

### 1.3 App Control & Window Management
**What:** Launch apps, switch windows, resize/arrange windows, read window titles.

**How:**
- macOS: `osascript` (AppleScript) for window management, `open -a` for launching
- Windows: PowerShell `Get-Process`, `Start-Process`, Win32 API via `ffi-napi`
- Linux: `wmctrl`, `xdotool`
- New module: `src/main/app-control.ts`
- Tools: `app.launch(name)`, `app.list()`, `app.focus(name)`, `app.close(name)`, `window.list()`, `window.resize()`, `window.arrange()`

### 1.4 Agent Action Confirmation System
**What:** Show the user what the AI wants to do before it does it. Trust is everything.

**How:**
- Modal overlay: "Nyra wants to: Click on 'Submit' button at (450, 320)"
- Three modes: Always Ask, Ask for Dangerous Only, Full Autopilot
- Action categories: Safe (read screen, list windows), Moderate (click, type), Dangerous (delete files, run shell commands)
- Undo system: snapshot before each action, one-click rollback

**UI:**
- Action preview card with highlighted screenshot showing where Nyra will click
- Quick approve/deny buttons
- "Trust this action type" checkbox for repeated actions
- Action history sidebar showing everything Nyra has done

---

## Phase 2: Multi-Provider & Local LLMs (Weeks 2-4)

> *"Use any AI model — cloud or local — through one interface"*

### 2.1 Local LLM Support (Ollama / llama.cpp)
**What:** Run AI models locally with zero cloud dependency. Privacy-first.

**How:**
- Detect Ollama at `http://localhost:11434` (standard port)
- Add to provider catalog: `{ id: 'ollama', label: 'Ollama (Local)', icon: '🏠' }`
- Model discovery: `GET /api/tags` returns installed models
- Streaming: Ollama supports SSE streaming natively
- Auth-profiles bridge: write Ollama config to OpenClaw so gateway can route to local models
- New module: `src/main/ollama.ts` — discovery, health check, model listing

**Models to list by default:**
- `llama3.3:70b` — Best open-source general model
- `qwen3:32b` — Strong coding model
- `deepseek-r1:32b` — Reasoning model
- `codestral:22b` — Code-focused
- Auto-discover: any model the user has pulled in Ollama

**UI:**
- "Local Models" section in Settings → Providers
- Ollama status indicator (running/not found)
- One-click model pull: "Pull llama3.3:70b" button that runs `ollama pull`
- VRAM usage display if possible

### 2.2 Provider Router
**What:** Automatic model routing — send code questions to the coding model, creative tasks to the creative model.

**How:**
- New module: `src/main/router.ts`
- Rules engine: user defines routing rules per project or globally
- Default rules: "Use [fast model] for quick questions, [powerful model] for complex tasks"
- Cost-aware: show estimated token cost per model before sending
- Fallback chain: if primary model fails, try secondary

### 2.3 Model Comparison Mode
**What:** Send the same prompt to 2-3 models simultaneously, compare responses side-by-side.

**How:**
- Split the chat area into columns (2 or 3)
- Each column streams from a different model
- User picks the best response, which becomes the "canonical" message in the session

---

## Phase 3: Memory & Context System (Weeks 3-5)

> *"Nyra remembers everything and gets smarter the more you use it"*

### 3.1 Persistent Memory Database
**What:** Cross-session memory that survives app restarts. Nyra learns your preferences, coding style, project context.

**How:**
- SQLite database via `better-sqlite3`: `~/.nyra/memory.db`
- Tables: `facts` (key-value), `preferences` (auto-learned), `project_context`, `conversation_summaries`
- Auto-extract facts from conversations: names, technologies, coding conventions, preferences
- Inject relevant memories into system prompt before each message
- New module: `src/main/memory.ts`

**Memory types:**
- **User profile:** Name, role, tech stack, preferences
- **Project knowledge:** File structures, APIs, conventions, architecture decisions
- **Conversation summaries:** Compressed versions of past chats for reference
- **Learned corrections:** When user corrects Nyra, remember the correction

### 3.2 Codebase Indexing
**What:** Nyra understands your entire codebase — not just the file you're looking at.

**How:**
- Watch a project directory, index all source files
- Generate embeddings (via local model or API) for semantic search
- Store in SQLite with vector extension or use `hnswlib-node`
- "@codebase" mention in chat triggers codebase-aware context injection
- File change watcher: re-index modified files automatically

### 3.3 Smart Context Window
**What:** Automatically select the most relevant context for each message, maximizing model effectiveness.

**How:**
- Score context sources: recent messages (high), memory facts (medium), codebase chunks (by relevance)
- Fill context window optimally — never waste tokens on irrelevant context
- Show "context budget" indicator: "Using 45K of 200K tokens"
- Let users pin/unpin context sources manually

---

## Phase 4: Terminal & Developer Power Tools (Weeks 4-6)

> *"Better than Claude Code at coding, better than Cowork at everything else"*

### 4.1 Integrated Terminal
**What:** A full terminal emulator inside Nyra, so developers never leave the app.

**How:**
- Embed `xterm.js` (the standard Electron terminal emulator)
- PTY backend via `node-pty`
- AI can read terminal output and suggest commands
- AI can run commands directly (with confirmation)
- Split view: chat on left, terminal on right

### 4.2 Git Workflow Integration
**What:** Nyra understands git. It can review PRs, suggest commits, resolve conflicts, manage branches.

**How:**
- Use `simple-git` npm package for git operations
- Tools: `git.status()`, `git.diff()`, `git.commit(msg)`, `git.createBranch()`, `git.push()`
- PR review: fetch PR diff, send to AI with codebase context
- Commit messages: AI generates from staged changes
- Conflict resolution: show conflicts in chat, AI suggests resolution

### 4.3 Code Actions
**What:** Right-click any code block in chat → Run, Save to File, Apply as Diff, Copy, Insert at Cursor.

**How:**
- "Run" button executes code in integrated terminal
- "Apply as Diff" patches the actual file
- "Save to File" with file path autocomplete
- "Insert at Cursor" sends to IDE via clipboard or extension protocol

### 4.4 Multi-File Edit Mode
**What:** AI proposes changes across multiple files, shown as a unified diff the user can review and apply.

**How:**
- Diff view component showing all proposed changes
- Per-file accept/reject
- Per-hunk accept/reject within a file
- "Apply All" button
- Preview: show the file before/after

---

## Phase 5: Plugin & MCP Ecosystem (Weeks 5-7)

> *"Connect Nyra to everything"*

### 5.1 Plugin System
**What:** Installable extensions that add new tools, UI panels, and capabilities.

**How:**
- Plugin format: directory with `plugin.json` manifest, tools, UI components
- Plugin registry: curated list + community submissions
- Install flow: one-click install from in-app marketplace
- Sandboxed execution: plugins run in isolated worker threads
- API surface: plugins can register tools, add sidebar panels, hook into message flow

### 5.2 Deep MCP Integration
**What:** Connect Nyra to Slack, GitHub, Notion, Jira, databases, calendars — any MCP server.

**How:**
- MCP server browser: discover and connect to MCP servers
- One-click install for popular servers (Slack, GitHub, Google, Notion)
- Show available MCP tools in a discoverable sidebar
- Tool approval: user sees what MCP tools the AI wants to use
- Already have: basic MCP config in Settings. Need: discovery, install, tool browser.

### 5.3 OpenClaw Skill Marketplace
**What:** Browse and install from OpenClaw's 13,700+ community skills.

**How:**
- Integrate with ClawHub registry API
- Skill browser with categories, search, popularity ranking
- One-click install: downloads SKILL.md to OpenClaw skills directory
- Skill management: enable/disable, update, remove

---

## Phase 6: Advanced Agent Features (Weeks 6-8)

> *"Nyra works while you sleep"*

### 6.1 Multi-Agent Orchestration
**What:** Spawn multiple AI agents working in parallel on different subtasks.

**How:**
- Lead agent decomposes task into subtasks
- Each subtask runs in a separate OpenClaw session
- Results merged back into the main conversation
- Visual: agent tree showing what each agent is working on

### 6.2 Workflow Automation Builder
**What:** Visual workflow builder — chain actions into reusable automations.

**How:**
- Drag-and-drop workflow canvas
- Nodes: AI prompt, shell command, file operation, MCP tool, conditional, loop
- Save as reusable workflow
- Trigger: manual, scheduled (cron), file change, webhook

### 6.3 Background Tasks
**What:** Long-running tasks that continue even when you're not looking at the app.

**How:**
- Task queue with progress tracking
- Notification when task completes
- Tasks survive app minimization (tray mode)
- Examples: "Monitor this log file and alert me if errors spike", "Watch my inbox and summarize new emails every hour"

---

## Phase 7: Polish & Ship (Weeks 7-9)

### 7.1 Onboarding Flow
- First-launch wizard: choose provider, set up API key or OAuth, optional Ollama setup
- Interactive tutorial: "Try asking Nyra to take a screenshot and describe what it sees"
- Showcase differentiators: "Unlike other AI tools, Nyra can control your entire computer"

### 7.2 Security & Trust
- All desktop actions require explicit user approval by default
- Action audit log: everything Nyra does is recorded
- Permissions system: per-tool approval, per-session, or permanent
- Sandboxed plugin execution
- No telemetry unless user opts in

### 7.3 Performance
- Token streaming: already optimized with rAF batching
- Screen capture: adaptive quality based on bandwidth
- Memory: LRU cache for embeddings, lazy-load conversation history
- Startup: target <2s cold start

---

## Implementation Priority (What to Build First)

### Sprint 1 (Week 1-2): The Demo Killer
1. **Screen capture** → `desktopCapturer` + send to AI
2. **Mouse/keyboard control** → `nut.js` integration
3. **Action confirmation UI** → Trust overlay
4. **Ollama support** → Local model detection + routing

*Demo: "Nyra, open Chrome, go to GitHub, and star my repo" — executed autonomously.*

### Sprint 2 (Week 3-4): The Developer Magnet
5. **Integrated terminal** → `xterm.js` + `node-pty`
6. **Git integration** → PR review, commit generation
7. **Persistent memory** → SQLite + auto-fact extraction
8. **Codebase indexing** → File watcher + embeddings

### Sprint 3 (Week 5-6): The Ecosystem Play
9. **Plugin system** → Manifest format, loader, marketplace
10. **Deep MCP** → Server browser, one-click install
11. **OpenClaw skills marketplace** → Browse + install from ClawHub
12. **Model comparison mode** → Side-by-side responses

### Sprint 4 (Week 7-8): The Autonomy Push
13. **Multi-agent orchestration** → Parallel task execution
14. **Workflow builder** → Visual automation canvas
15. **Background tasks** → Long-running monitored jobs
16. **Onboarding + polish** → First-run wizard, tutorials

---

## Technical Architecture for v2

```
┌─────────────────────────────────────────────────────────────┐
│                     NYRA DESKTOP v2                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  RENDERER (React + Tailwind)                          │   │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │  Chat   │ │Terminal │ │  Agent   │ │ Workflow │  │   │
│  │  │  Panel  │ │ (xterm) │ │  Tree    │ │ Builder  │  │   │
│  │  └─────────┘ └─────────┘ └──────────┘ └──────────┘  │   │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │ Screen  │ │  Diff   │ │  Plugin  │ │  MCP     │  │   │
│  │  │ Preview │ │  View   │ │ Sidebar  │ │ Browser  │  │   │
│  │  └─────────┘ └─────────┘ └──────────┘ └──────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │ IPC                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  MAIN PROCESS (Electron)                              │   │
│  │                                                        │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────┐  │   │
│  │  │   Desktop   │ │   Memory     │ │   Plugin      │  │   │
│  │  │   Control   │ │   (SQLite)   │ │   Loader      │  │   │
│  │  │  nut.js     │ │   memory.ts  │ │   plugins.ts  │  │   │
│  │  │  screen.ts  │ │              │ │               │  │   │
│  │  └─────────────┘ └──────────────┘ └───────────────┘  │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────┐  │   │
│  │  │  Terminal   │ │   Ollama     │ │   Router      │  │   │
│  │  │  node-pty   │ │   ollama.ts  │ │   router.ts   │  │   │
│  │  │  pty.ts     │ │              │ │               │  │   │
│  │  └─────────────┘ └──────────────┘ └───────────────┘  │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────┐  │   │
│  │  │  OpenClaw   │ │   WS Proxy   │ │  Auth/OAuth   │  │   │
│  │  │  Gateway    │ │   + Device   │ │  + Profiles   │  │   │
│  │  │  Mgr        │ │   Auth       │ │               │  │   │
│  │  └─────────────┘ └──────────────┘ └───────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  OPENCLAW GATEWAY                                     │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐  │   │
│  │  │  Chat   │ │  Tools  │ │  MCP    │ │  Skills   │  │   │
│  │  │  Engine │ │  System │ │  Bridge │ │  Registry │  │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └───────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  AI PROVIDERS                                         │   │
│  │  OpenAI │ Anthropic │ Gemini │ Copilot │ Ollama(local)│  │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## The Pitch (One Sentence)

**Nyra is the open-source AI desktop agent that can see your screen, control your computer, use any AI model (including local), and connect to all your tools — something no other AI app can do today.**
