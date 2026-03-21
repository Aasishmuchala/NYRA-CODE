# Custom Agent Framework — Quick Start Guide

## 5-Minute Setup

### Step 1: Initialize in Main Process

In your Electron main process (e.g., `src/main/index.ts`):

```typescript
import { agentManager } from './agents'

app.on('ready', async () => {
  // Initialize custom agents framework
  agentManager.initialize()
  
  console.log('Agents ready:', agentManager.getStatistics())
})

app.on('quit', () => {
  agentManager.close()
})
```

### Step 2: Add IPC Handler

```typescript
import { ipcMain } from 'electron'
import { agentManager } from './agents'

// Get all agents
ipcMain.handle('agent:list', () => agentManager.listAgents())

// Create from template
ipcMain.handle('agent:create-from-template', (e, templateId, overrides) =>
  agentManager.createFromTemplate(templateId, overrides)
)

// Clone agent
ipcMain.handle('agent:clone', (e, agentId, name) =>
  agentManager.cloneAgent(agentId, name)
)
```

### Step 3: Use in React

```typescript
import { ipcRenderer } from 'electron'

function AgentList() {
  const [agents, setAgents] = React.useState([])

  React.useEffect(() => {
    ipcRenderer.invoke('agent:list').then(setAgents)
  }, [])

  return (
    <div>
      {agents.map(agent => (
        <div key={agent.id}>
          <h3>{agent.name}</h3>
          <p>{agent.description}</p>
          {agent.isBuiltIn ? (
            <button onClick={() =>
              ipcRenderer.invoke('agent:clone', agent.id, `${agent.name} (Clone)`)
                .then(() => location.reload())
            }>
              Clone
            </button>
          ) : (
            <button onClick={() => {/* delete */}}>Delete</button>
          )}
        </div>
      ))}
    </div>
  )
}
```

## Common Tasks

### Create Agent from Template

```typescript
const agent = await agentManager.createFromTemplate('template-code-developer', {
  name: 'My Code Dev',
  tokenBudget: 2000000,
})
```

### Get Templates by Category

```typescript
const devTemplates = agentManager.getTemplatesByCategory('development')
// Returns: Research Assistant, Code Developer, DevOps Engineer
```

### Clone Built-in Agent

```typescript
const cloned = agentManager.cloneAgent('developer-agent', 'Custom Developer')
// Can now be modified unlike the original
```

### List Custom Agents Only

```typescript
const custom = agentManager.listAgents({ isBuiltIn: false })
```

### Track Agent Performance

```typescript
// Record task completion
agentManager.recordCompletion(agentId, true, 5000, 2340)

// Get metrics
const metrics = agentManager.getPerformance(agentId, 'day')
// { tasksCompleted: 15, avgResponseTime: 2340, ... }
```

### Update Agent

```typescript
const updated = agentManager.updateAgent(agentId, {
  name: 'New Name',
  tokenBudget: 1000000,
  tags: ['custom', 'development'],
})
```

## Template Reference

| Template | Role | Tools | Budget | Features |
|----------|------|-------|--------|----------|
| Research Assistant | research-agent | web-search, browser | 500K | Fact-checking, summarization |
| Code Developer | developer-agent | git, code-editor, test-runner | 1M | Testing, debugging, can spawn sub-agents |
| Document Writer | writer-agent | word-processor, email | 800K | Professional writing, proofreading |
| Data Analyst | analyst-agent | csv-reader, python, sql | 600K | Data exploration, visualization |
| DevOps Engineer | devops-agent | docker, kubernetes, ci-cd | 900K | Deployments, infrastructure, can spawn |
| Project Manager | manager-agent | project-tracker, calendar | 500K | Task tracking, coordination, can spawn |

## API Reference

### AgentManager (Singleton)

**Creation:**
- `createAgent(config)` → CustomAgentDefinition
- `createFromTemplate(templateId, overrides?)` → CustomAgentDefinition
- `cloneAgent(agentId, newName)` → CustomAgentDefinition

**Retrieval:**
- `getAgent(agentId)` → CustomAgentDefinition | undefined
- `listAgents(filters?)` → CustomAgentDefinition[]
- `getTemplates()` → AgentTemplate[]
- `getTemplate(templateId)` → AgentTemplate | undefined

**Modification:**
- `updateAgent(agentId, updates)` → CustomAgentDefinition
- `deleteAgent(agentId)` → void

**Performance:**
- `recordCompletion(agentId, success, tokens?, latency?)` → void
- `getPerformance(agentId, period?)` → AgentPerformanceMetrics

**Utilities:**
- `getStatistics()` → { totalAgents, builtInAgents, customAgents, ... }
- `close()` → void

### Types

```typescript
interface CustomAgentDefinition {
  id: string
  name: string
  role: string
  description: string
  systemPrompt: string
  isBuiltIn: boolean
  createdAt: number
  capabilities: AgentCapability[]
  tags: string[]
  // ... many more fields
}

interface AgentCreationConfig {
  name: string
  role: string
  description: string
  systemPrompt: string
  allowedTools?: string[]
  tokenBudget?: number
  tags?: string[]
  // ... optional fields
}
```

## Events (via event-bus)

Listen for agent lifecycle events:

```typescript
import { on } from './event-bus'

on('agent:created', (event) => {
  console.log('Created:', event.data.name)
})

on('agent:updated', (event) => {
  console.log('Updated:', event.data)
})

on('agent:deleted', (event) => {
  console.log('Deleted:', event.agentId)
})

on('agent:cloned', (event) => {
  console.log('Cloned:', event.data.originalId, '->', event.agentId)
})

on('agent:performance-updated', (event) => {
  console.log('Performance updated:', event.agentId)
})
```

## Database Location

SQLite database stored at:
- **macOS/Linux**: `~/.nyra/nyra_agents.db`
- **Windows**: `%APPDATA%\Nyra\nyra_agents.db`

(Uses Electron's `app.getPath('userData')`)

## Tips

✅ Always call `agentManager.initialize()` on app startup
✅ Built-in agents cannot be modified, only cloned
✅ Custom agents inherit learning profiles from their 100 most recent runs
✅ Use templates to bootstrap new agents quickly
✅ Monitor performance metrics to identify top-performing agents
✅ All database operations are synchronous (no async overhead)
✅ Events enable real-time UI updates without polling

## Troubleshooting

**Database already exists error?**
- This is normal on subsequent launches
- Database is auto-created on first run

**Built-in agent not found?**
- Ensure `agentManager.initialize()` was called
- Built-in agents are converted on initialization

**Agent IDs are long and weird?**
- That's intentional: `agent-custom-${timestamp}-${random6hex}`
- Ensures uniqueness and prevents collisions

**Performance metrics empty?**
- Performance is only tracked when you call `recordCompletion()`
- Call it after agent tasks complete

---

**For detailed integration examples, see INTEGRATION_EXAMPLES.md**

**For architecture overview, see CUSTOM_AGENT_FRAMEWORK_SUMMARY.md**
