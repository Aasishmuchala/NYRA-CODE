# Custom Agent Framework — Integration Examples

Quick reference for integrating the framework into your Nyra Desktop codebase.

## 1. Initialize in Main Process

Add to `src/main/index.ts` or main process initialization:

```typescript
import { agentManager } from './agents'

// Initialize the custom agent framework
export function initializeCustomAgents() {
  try {
    agentManager.initialize()
    const stats = agentManager.getStatistics()
    console.log('Custom Agent Framework initialized', {
      totalAgents: stats.totalAgents,
      builtInAgents: stats.builtInAgents,
      customAgents: stats.customAgents,
    })
  } catch (error) {
    console.error('Failed to initialize custom agents:', error)
  }
}

// Call during app startup
app.on('ready', () => {
  initializeCustomAgents()
  // ... other initialization
})
```

## 2. IPC Handlers for Renderer Process

Add to `src/main/ipc.ts` or similar IPC setup file:

```typescript
import { ipcMain } from 'electron'
import { agentManager } from './agents'

// Get all agents
ipcMain.handle('agents:list', (event, filters) => {
  try {
    return agentManager.listAgents(filters)
  } catch (error) {
    return { error: error.message }
  }
})

// Get single agent
ipcMain.handle('agents:get', (event, agentId) => {
  try {
    return agentManager.getAgent(agentId)
  } catch (error) {
    return { error: error.message }
  }
})

// Create from template
ipcMain.handle('agents:create-from-template', (event, templateId, overrides) => {
  try {
    return agentManager.createFromTemplate(templateId, overrides)
  } catch (error) {
    return { error: error.message }
  }
})

// Create custom agent
ipcMain.handle('agents:create', (event, config) => {
  try {
    return agentManager.createAgent(config)
  } catch (error) {
    return { error: error.message }
  }
})

// Clone agent
ipcMain.handle('agents:clone', (event, agentId, newName) => {
  try {
    return agentManager.cloneAgent(agentId, newName)
  } catch (error) {
    return { error: error.message }
  }
})

// Update agent
ipcMain.handle('agents:update', (event, agentId, updates) => {
  try {
    return agentManager.updateAgent(agentId, updates)
  } catch (error) {
    return { error: error.message }
  }
})

// Delete agent
ipcMain.handle('agents:delete', (event, agentId) => {
  try {
    agentManager.deleteAgent(agentId)
    return { success: true }
  } catch (error) {
    return { error: error.message }
  }
})

// Get templates
ipcMain.handle('agents:templates-list', () => {
  try {
    return agentManager.getTemplates()
  } catch (error) {
    return { error: error.message }
  }
})

// Get templates by category
ipcMain.handle('agents:templates-by-category', (event, category) => {
  try {
    return agentManager.getTemplatesByCategory(category)
  } catch (error) {
    return { error: error.message }
  }
})

// Get template details
ipcMain.handle('agents:template', (event, templateId) => {
  try {
    return agentManager.getTemplate(templateId)
  } catch (error) {
    return { error: error.message }
  }
})

// Get performance metrics
ipcMain.handle('agents:performance', (event, agentId, period) => {
  try {
    return agentManager.getPerformance(agentId, period || 'day')
  } catch (error) {
    return { error: error.message }
  }
})

// Record task completion
ipcMain.handle('agents:record-completion', (event, agentId, success, tokensUsed, latencyMs) => {
  try {
    agentManager.recordCompletion(agentId, success, tokensUsed, latencyMs)
    return { success: true }
  } catch (error) {
    return { error: error.message }
  }
})

// Get statistics
ipcMain.handle('agents:statistics', () => {
  try {
    return agentManager.getStatistics()
  } catch (error) {
    return { error: error.message }
  }
})
```

## 3. React Hook for Renderer Process

Example hook for React components:

```typescript
// hooks/useAgentManager.ts
import { useState, useCallback, useEffect } from 'react'
import { ipcRenderer } from 'electron'
import type { CustomAgentDefinition, AgentTemplate } from '../agents'

export function useAgentManager() {
  const [agents, setAgents] = useState<CustomAgentDefinition[]>([])
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load all agents
  const loadAgents = useCallback(async (filters = {}) => {
    setLoading(true)
    try {
      const result = await ipcRenderer.invoke('agents:list', filters)
      if (result.error) {
        setError(result.error)
      } else {
        setAgents(result)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      const result = await ipcRenderer.invoke('agents:templates-list')
      if (result.error) {
        setError(result.error)
      } else {
        setTemplates(result)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [])

  // Create agent from template
  const createFromTemplate = useCallback(
    async (templateId: string, overrides = {}) => {
      setLoading(true)
      try {
        const result = await ipcRenderer.invoke('agents:create-from-template', templateId, overrides)
        if (result.error) {
          setError(result.error)
        } else {
          await loadAgents()
          setError(null)
          return result
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    },
    [loadAgents],
  )

  // Clone agent
  const cloneAgent = useCallback(
    async (agentId: string, newName: string) => {
      setLoading(true)
      try {
        const result = await ipcRenderer.invoke('agents:clone', agentId, newName)
        if (result.error) {
          setError(result.error)
        } else {
          await loadAgents()
          setError(null)
          return result
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    },
    [loadAgents],
  )

  // Delete agent
  const deleteAgent = useCallback(
    async (agentId: string) => {
      setLoading(true)
      try {
        const result = await ipcRenderer.invoke('agents:delete', agentId)
        if (result.error) {
          setError(result.error)
        } else {
          await loadAgents()
          setError(null)
          return result
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    },
    [loadAgents],
  )

  // Initialize
  useEffect(() => {
    loadAgents()
    loadTemplates()
  }, [loadAgents, loadTemplates])

  return {
    agents,
    templates,
    loading,
    error,
    loadAgents,
    loadTemplates,
    createFromTemplate,
    cloneAgent,
    deleteAgent,
  }
}
```

## 4. React Component Example

Agent list component using the hook:

```typescript
// components/AgentManager.tsx
import React, { useState } from 'react'
import { useAgentManager } from '../hooks/useAgentManager'

export function AgentManager() {
  const { agents, templates, loading, error, createFromTemplate, cloneAgent, deleteAgent } =
    useAgentManager()
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')

  if (loading) return <div>Loading agents...</div>
  if (error) return <div className="error">Error: {error}</div>

  return (
    <div className="agent-manager">
      <h2>Custom Agents</h2>

      {/* Built-in agents */}
      <section className="built-in-agents">
        <h3>Built-in Agents</h3>
        <div className="agent-list">
          {agents
            .filter(a => a.isBuiltIn)
            .map(agent => (
              <div key={agent.id} className="agent-card">
                <h4>{agent.name}</h4>
                <p>{agent.description}</p>
                <button onClick={() => cloneAgent(agent.id, `Clone of ${agent.name}`)}>
                  Clone
                </button>
              </div>
            ))}
        </div>
      </section>

      {/* Custom agents */}
      <section className="custom-agents">
        <h3>Your Custom Agents</h3>
        <div className="agent-list">
          {agents
            .filter(a => !a.isBuiltIn)
            .map(agent => (
              <div key={agent.id} className="agent-card">
                <h4>{agent.name}</h4>
                <p>{agent.description}</p>
                <div className="tags">
                  {agent.tags.map(tag => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <button onClick={() => cloneAgent(agent.id, `${agent.name} (2)`)} className="clone">
                  Clone
                </button>
                <button onClick={() => deleteAgent(agent.id)} className="delete">
                  Delete
                </button>
              </div>
            ))}
        </div>
      </section>

      {/* Create from template */}
      <section className="create-agent">
        <h3>Create Agent from Template</h3>
        <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
          <option value="">Select a template...</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.category})
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            if (selectedTemplate) {
              createFromTemplate(selectedTemplate, {
                name: `New ${selectedTemplate.split('-')[1] || 'Agent'}`,
              })
            }
          }}
          disabled={!selectedTemplate}
        >
          Create
        </button>
      </section>
    </div>
  )
}
```

## 5. Event Monitoring

Listen to agent events:

```typescript
// Setup in main process
import { on } from './event-bus'

on('agent:created', (event) => {
  console.log('Agent created:', event.agentId, event.data.name)
})

on('agent:updated', (event) => {
  console.log('Agent updated:', event.agentId, event.data)
})

on('agent:deleted', (event) => {
  console.log('Agent deleted:', event.agentId)
})

on('agent:cloned', (event) => {
  console.log('Agent cloned:', event.data.originalId, '->', event.agentId)
})

on('agent:performance-updated', (event) => {
  console.log('Agent performance updated:', event.agentId)
})
```

## 6. Performance Tracking Integration

Track agent task execution:

```typescript
import { agentManager } from './agents'

async function executeAgentTask(agentId: string, task: string) {
  const startTime = performance.now()
  let success = false
  let tokensUsed = 0

  try {
    // Execute task
    const result = await runAgent(agentId, task)
    success = true
    tokensUsed = result.tokensUsed
  } catch (error) {
    success = false
    console.error('Agent task failed:', error)
  }

  const latencyMs = Math.round(performance.now() - startTime)

  // Record performance
  agentManager.recordCompletion(agentId, success, tokensUsed, latencyMs)
}
```

## 7. Type Imports for Development

```typescript
// Use these types in your code
import type {
  CustomAgentDefinition,
  AgentCapability,
  AgentLearningProfile,
  ModelPreference,
  AgentTemplate,
  AgentPerformanceMetrics,
  ExtendedAgentRole,
} from './agents'

import { agentManager, AgentFactory, BUILT_IN_TEMPLATES } from './agents'
```

## Notes

- Always call `agentManager.initialize()` on app startup
- IPC handlers should validate and sanitize user input
- Built-in agents cannot be modified or deleted
- Custom agents are stored in the user's data directory
- Performance metrics are calculated from the last 100 runs
- All operations are synchronous except IPC communication

---

For questions or additional examples, refer to the main implementation files in `src/main/agents/`
