# Provider Abstraction Layer — Integration Guide

## Quick Start (5 minutes)

### Step 1: Register Providers in `main.ts`

Add this to your Electron main process startup:

```typescript
import {
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider,
  providerRegistry,
} from './providers'
import { loadApiKey } from './providers'

async function initializeProviders() {
  // 1. Create providers from existing API keys
  const openaiKey = loadApiKey('openai')
  if (openaiKey) {
    const openai = new OpenAIProvider({ apiKey: openaiKey })
    providerRegistry.register(openai)
  }

  const anthropicKey = loadApiKey('anthropic')
  if (anthropicKey) {
    const anthropic = new AnthropicProvider({ apiKey: anthropicKey })
    providerRegistry.register(anthropic)
  }

  // 2. Always register Ollama (local, no auth)
  const ollama = new OllamaProvider()
  providerRegistry.register(ollama)

  // 3. Initialize all registered providers
  for (const provider of providerRegistry.getAll()) {
    try {
      await provider.initialize()
      console.log(`✅ ${provider.name} initialized`)
    } catch (err) {
      console.warn(`⚠️ ${provider.name} initialization failed:`, err)
    }
  }

  // 4. Start health monitoring
  providerRegistry.startHealthMonitor(60_000)  // Every 60 seconds
}

// Call during app startup
app.on('ready', () => {
  initializeProviders().catch(err => {
    console.error('Provider initialization failed:', err)
  })
})
```

### Step 2: Update Agent Orchestrator

**Find this in `agent-orchestrator.ts`:**
```typescript
import { callAgentLLM } from './agent-llm-client'

// ... somewhere in orchestrator code:
const response = await callAgentLLM(agent, userMessage)
```

**Replace with:**
```typescript
import { callAgentLLMV2 } from './providers'

// ... same location:
const response = await callAgentLLMV2(agent, userMessage)
```

**That's it!** The orchestrator now uses the Provider Abstraction Layer instead of wsproxy.

### Step 3: (Optional) Add Streaming Support

If you want progressive response updates:

```typescript
import { callAgentLLMStream } from './providers'

// Streaming version
let fullResponse = ''
for await (const chunk of callAgentLLMStream(agent, userMessage)) {
  fullResponse += chunk
  // Send chunk to UI in real-time
  emitEvent('agent-response-chunk', { chunk, agentId: agent.id })
}

console.log('Final response:', fullResponse)
```

---

## Integration Points

### In `agent-orchestrator.ts`

**Current code** (removes wsproxy dependency):
```typescript
// OLD: WebSocket to wsproxy
import WebSocket from 'ws'
const ws = new WebSocket('ws://localhost:18790')

// NEW: Direct to provider
import { callAgentLLMV2 } from './providers'
```

**Benefits:**
- No WebSocket connection overhead
- Direct API calls to providers
- Automatic fallback (preferred model → fallback model → any available)
- Built-in error handling and retries

### In `agent-registry.ts` (No changes needed)

Your existing agent definitions already work:

```typescript
export interface AgentDefinition {
  // ... existing fields ...
  preferredModel: string    // e.g., 'anthropic/claude-opus-4.6'
  fallbackModel: string     // e.g., 'openai/gpt-4o'
}
```

The provider bridge extracts the provider and model IDs automatically.

### In `providers.ts` (Minimal changes)

Your existing API key management remains unchanged:

```typescript
export function loadApiKey(providerId: string): string | null { /* ... */ }
export function saveApiKey(providerId: string, key: string): boolean { /* ... */ }
```

The new provider layer calls these exact functions. **No refactoring needed.**

---

## Running Agents

### Simple Call

```typescript
import { DEFAULT_AGENTS } from './agent-registry'
import { callAgentLLMV2 } from './providers'

const agent = DEFAULT_AGENTS.find(a => a.id === 'agent-planner')!
const response = await callAgentLLMV2(
  agent,
  'Please plan how to refactor the login flow'
)

console.log(response)
// Output: "The login flow refactoring should include: 1. Separate auth logic... 2. Add OAuth support... etc."
```

### With Error Handling

```typescript
import { callAgentLLMV2, AgentLLMError } from './providers'

try {
  const response = await callAgentLLMV2(agent, message)
  console.log('Agent response:', response)
} catch (err) {
  if (err instanceof AgentLLMError) {
    console.error(`Agent ${err.agentId} failed: ${err.message}`)
    // Handle gracefully: prompt user, log to audit trail, etc.
  } else {
    throw err
  }
}
```

### Streaming (Real-time UI)

```typescript
import { callAgentLLMStream } from './providers'
import { eventBus } from './event-bus'

for await (const chunk of callAgentLLMStream(agent, message)) {
  // Send to UI as tokens arrive
  eventBus.emit('agent-response', {
    agentId: agent.id,
    chunk,
    timestamp: Date.now(),
  })
}
```

---

## Smart Provider Routing

The registry can automatically select the best provider:

```typescript
import { providerRegistry } from './providers'

// Case 1: Use any available cloud provider
const cloudProvider = providerRegistry.findBestProvider({
  requiresLocal: false,  // Cloud only
})

// Case 2: Prefer local for offline work
const localProvider = providerRegistry.findBestProvider({
  requiresLocal: true,   // Must work offline
})

// Case 3: Vision-capable model
const visionProvider = providerRegistry.findBestProvider({
  requiresVision: true,
  requiresLocal: false,
})

// Case 4: Custom routing
const provider = providerRegistry.findBestProvider({
  preferredProvider: 'anthropic',
  preferredModel: 'claude-opus-4.6',
  requiresTools: true,
  maxLatencyMs: 5000,
})
```

---

## Health Monitoring

Monitor provider status:

```typescript
import { providerRegistry } from './providers'

// Check all providers
const healthMap = await providerRegistry.checkAllHealth()

for (const [providerId, health] of healthMap) {
  console.log(`${providerId}: ${health.status} (${health.latencyMs}ms)`)
}

// Example output:
// openai: healthy (523ms)
// anthropic: healthy (412ms)
// ollama: healthy (145ms)

// Get cached health
const openaiHealth = providerRegistry.getHealth('openai')
if (openaiHealth?.status === 'down') {
  console.warn('OpenAI is unreachable!')
}
```

---

## Error Recovery

### Transient Errors (Retryable)

```typescript
import { ProviderError } from './providers'

try {
  const response = await provider.chat(request)
} catch (err) {
  if (err instanceof ProviderError) {
    if (err.retryable && err.statusCode! >= 500) {
      console.log('Server error, waiting to retry...')
      await new Promise(r => setTimeout(r, 2000))
      // Retry logic here
    }
  }
}
```

### Authentication Errors

```typescript
if (err instanceof ProviderError && err.code === 'AUTH_FAILED') {
  console.error(`Invalid API key for ${err.providerId}`)
  // Prompt user to re-enter key
  const newKey = await askUserForApiKey(err.providerId)
  saveApiKey(err.providerId, newKey)
  
  // Reinitialize provider
  const provider = providerRegistry.get(err.providerId)
  await provider?.initialize()
}
```

### Graceful Degradation

```typescript
// Try cloud, fall back to local
let provider = providerRegistry.findBestProvider({
  preferredProvider: 'anthropic',
})

if (!provider?.isAvailable()) {
  provider = providerRegistry.findBestProvider({
    requiresLocal: true,
  })
}

if (!provider) {
  throw new Error('No LLM providers available')
}

const response = await provider.chat(request)
```

---

## Configuration

### Environment Variables

```bash
# Optional: override Ollama base URL (default: http://localhost:11434)
export OLLAMA_BASE_URL=http://192.168.1.100:11434

# Optional: API key paths (defaults: Electron safeStorage)
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

### Programmatic Configuration

```typescript
import { OllamaProvider } from './providers'

const customOllama = new OllamaProvider({
  baseUrl: 'http://192.168.1.100:11434',  // Remote Ollama
  timeout: 180_000,                        // 3 minute timeout
  maxRetries: 5,
})

providerRegistry.register(customOllama)
```

---

## Performance Tips

1. **Local first:** Ollama (local) has ~100-300ms latency vs ~500-1000ms for cloud
2. **Batch health checks:** Use `checkAllHealth()` instead of individual checks
3. **Cache health:** Registry caches health results, checks run in background
4. **Streaming:** Use streaming API for real-time feedback to users
5. **Model selection:** Smaller models (Haiku, gpt-4o-mini) are faster and cheaper

---

## Testing

```typescript
import { OpenAIProvider } from './providers'

describe('Provider integration', () => {
  let provider: OpenAIProvider

  beforeAll(async () => {
    provider = new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY,
    })
    await provider.initialize()
  })

  it('should respond to agent call', async () => {
    const response = await provider.chat({
      messages: [{ role: 'user', content: 'Hello' }],
    })
    expect(response.content.length).toBeGreaterThan(0)
  })

  it('should stream responses', async () => {
    let content = ''
    for await (const chunk of provider.chatStream({
      messages: [{ role: 'user', content: 'Count to 3' }],
    })) {
      content += chunk.content
    }
    expect(content).toMatch(/1.*2.*3/)
  })
})
```

---

## Troubleshooting

### "Provider not found" error

**Cause:** Provider registered but not initialized  
**Fix:** Check that `provider.initialize()` completed successfully

```typescript
try {
  await provider.initialize()
} catch (err) {
  console.error('Init failed:', err)
  // Don't register this provider
}
```

### "All LLM attempts failed"

**Cause:** All providers unavailable (no API keys, Ollama down, etc.)  
**Fix:** Check health and ensure at least one provider is configured

```typescript
const health = await providerRegistry.checkAllHealth()
console.log(health)  // See which providers are down
```

### Timeout errors

**Cause:** Provider taking too long to respond  
**Fix:** Increase timeout or check provider health

```typescript
const provider = new OpenAIProvider({
  apiKey: key,
  timeout: 180_000,  // 3 minutes instead of default 2
})
```

### Streaming hangs

**Cause:** Network issue or provider stalled  
**Fix:** Use timeout signal or add progress tracking

```typescript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 30_000)

try {
  for await (const chunk of provider.chatStream(request)) {
    // process chunk
  }
} finally {
  clearTimeout(timeout)
}
```

---

## Next Steps

1. ✅ **Now:** Update `agent-orchestrator.ts` to use `callAgentLLMV2`
2. ⏭ **Phase 1.2:** Add Gemini provider
3. ⏭ **Phase 1.3:** Add vision support
4. ⏭ **Phase 2.0:** Add NPU integration

---

**Questions?** See `README.md` for architecture details.  
**API Reference?** Check individual provider files (`openai-provider.ts`, etc.)
