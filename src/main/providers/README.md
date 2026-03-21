# Provider Abstraction Layer — Phase 1.1

**Status:** Complete ✅  
**Scope:** Universal LLM provider interface, direct API implementations, smart routing  
**Part of:** Nyra Desktop 5-Year Domination Plan

---

## Overview

The Provider Abstraction Layer provides a unified interface for multiple LLM providers:
- **Direct API calls** (no wsproxy proxy)
- **Local execution** (Ollama)
- **Cloud providers** (OpenAI, Anthropic, Gemini via OpenRouter, Copilot)
- **Smart routing** (prefer local, fallback to cloud, cost-aware selection)
- **Health monitoring** (automatic provider status tracking)

### Architecture

```
┌─────────────────────────────────────────────────┐
│           Agent Orchestrator                    │
│  (agent-orchestrator.ts)                        │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│        Provider Bridge (provider-bridge.ts)     │
│  Converts agent requests → ChatRequest          │
│  Handles fallback logic                         │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│      Provider Registry (provider-registry.ts)   │
│  - Smart routing (find best provider)           │
│  - Health monitoring                            │
│  - Provider lifecycle                           │
└────────────────┬────────────────────────────────┘
                 │
         ┌───────┴───────────────────┐
         │                           │
         ▼                           ▼
    ┌─────────────┐         ┌──────────────┐
    │  Local      │         │    Cloud     │
    ├─────────────┤         ├──────────────┤
    │ Ollama      │         │ OpenAI       │
    │ (NPU ready) │         │ Anthropic    │
    └─────────────┘         │ Gemini       │
                            │ OpenRouter   │
                            └──────────────┘
```

---

## Files

### 1. `provider-interface.ts`
**Core abstractions** — defines universal interfaces that all providers implement.

**Key Types:**
- `LLMProvider` — main interface
- `ChatMessage`, `ChatRequest`, `ChatResponse`
- `ToolDefinition`, `ToolCall`
- `EmbeddingRequest`, `EmbeddingResponse`
- `ProviderHealth`, `ModelCapabilities`, `ModelCard`

**All methods:**
```typescript
interface LLMProvider {
  id: string
  name: string
  isLocal: boolean
  
  initialize(): Promise<void>
  shutdown(): Promise<void>
  healthCheck(): Promise<ProviderHealth>
  isAvailable(): boolean
  
  listModels(): Promise<ModelCard[]>
  getModelCapabilities(modelId: string): ModelCapabilities | null
  
  chat(request: ChatRequest): Promise<ChatResponse>
  chatStream(request: ChatRequest): AsyncGenerator<ChatChunk>
  
  supportsEmbeddings(): boolean
  embed?(request: EmbeddingRequest): Promise<EmbeddingResponse>
}
```

### 2. `openai-provider.ts`
**OpenAI (ChatGPT)** — direct HTTPS API to `api.openai.com`.

**Features:**
- ✅ Chat completions (GPT-5.4, GPT-4o, etc.)
- ✅ Embeddings (text-embedding-3-small/large)
- ✅ Streaming (Server-Sent Events)
- ✅ Tool calling (function calling)
- ✅ JSON mode

**Auth:** `Authorization: Bearer ${apiKey}`

**Example:**
```typescript
const openai = new OpenAIProvider({
  apiKey: loadApiKey('openai'),
  timeout: 120_000,
  maxRetries: 3,
})

const response = await openai.chat({
  messages: [{ role: 'user', content: 'Hello' }],
  model: 'gpt-4o',
})
```

### 3. `anthropic-provider.ts`
**Anthropic (Claude)** — direct HTTPS API to `api.anthropic.com`.

**Features:**
- ✅ Chat completions (Claude Opus, Sonnet, Haiku)
- ✅ Streaming (Server-Sent Events)
- ✅ Tool calling (with native tool_use blocks)
- ✅ JSON mode (via `response_format`)
- ❌ Embeddings (not supported natively)

**Auth:** `x-api-key: ${apiKey}` + `anthropic-version: 2023-06-01`

**Example:**
```typescript
const anthropic = new AnthropicProvider({
  apiKey: loadApiKey('anthropic'),
})

const response = await anthropic.chat({
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' },
  ],
  model: 'claude-opus-4.6',
})
```

### 4. `ollama-provider.ts`
**Ollama (Local)** — HTTP API to local Ollama instance.

**Features:**
- ✅ Chat completions (any Ollama model: Mistral, Llama, etc.)
- ✅ Embeddings (nomic-embed-text, etc.)
- ✅ Streaming
- ⚠️ Offline-capable (requires local setup)
- ⚠️ No auth needed

**Default URL:** `http://localhost:11434`

**Example:**
```typescript
const ollama = new OllamaProvider({
  baseUrl: 'http://localhost:11434',
})

await ollama.initialize()

const response = await ollama.chat({
  messages: [{ role: 'user', content: 'Hello' }],
  model: 'mistral',
})
```

### 5. `provider-registry.ts`
**Central registry** — manages all providers, health monitoring, smart routing.

**Key Methods:**
```typescript
class ProviderRegistry {
  register(provider: LLMProvider): void
  unregister(providerId: string): void
  get(providerId: string): LLMProvider | undefined
  
  getAll(): LLMProvider[]
  getAvailable(): LLMProvider[]        // Only healthy
  getLocalProviders(): LLMProvider[]   // Ollama, etc.
  getCloudProviders(): LLMProvider[]   // OpenAI, etc.
  
  findBestProvider(request: RoutingRequest): LLMProvider | null
  
  async checkHealth(providerId: string): Promise<ProviderHealth>
  async checkAllHealth(): Promise<Map<string, ProviderHealth>>
  
  startHealthMonitor(intervalMs?: number): void  // Default 60s
  stopHealthMonitor(): void
}
```

**Smart Routing:**
```typescript
const request: RoutingRequest = {
  preferredProvider: 'anthropic',
  preferredModel: 'claude-opus-4.6',
  requiresVision: true,
  requiresTools: true,
  requiresLocal: false,
  maxLatencyMs: 5000,
}

const provider = providerRegistry.findBestProvider(request)
```

### 6. `provider-bridge.ts`
**Agent compatibility layer** — converts agent calls to provider calls.

**Replaces:** Old `callAgentLLM()` from `agent-llm-client.ts`

**Key Functions:**
```typescript
// Non-streaming
export async function callAgentLLMV2(
  agent: AgentDefinition,
  userMessage: string,
): Promise<string>

// Streaming
export async function* callAgentLLMStream(
  agent: AgentDefinition,
  userMessage: string,
): AsyncGenerator<string>
```

**Fallback Logic:**
1. Try `agent.preferredModel`
2. Try `agent.fallbackModel`
3. Try any available provider
4. Throw error if all fail

**Example:**
```typescript
const agent = DEFAULT_AGENTS[0]  // Planner agent
const response = await callAgentLLMV2(
  agent,
  'Please organize the files in /Users/me/Downloads'
)
```

---

## Setup & Integration

### 1. Bootstrap Providers (in main.ts or startup code)

```typescript
import {
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider,
  providerRegistry,
} from './providers'
import { loadApiKey } from './providers'  // From existing providers.ts

// Create and register providers
const providers = [
  loadApiKey('openai') ? new OpenAIProvider({
    apiKey: loadApiKey('openai')!,
  }) : null,
  
  loadApiKey('anthropic') ? new AnthropicProvider({
    apiKey: loadApiKey('anthropic')!,
  }) : null,
  
  new OllamaProvider({
    baseUrl: 'http://localhost:11434',
  }),
].filter(Boolean)

for (const provider of providers) {
  if (provider) {
    providerRegistry.register(provider)
  }
}

// Initialize all providers
for (const provider of providerRegistry.getAll()) {
  try {
    await provider.initialize()
    console.log(`✅ ${provider.name} ready`)
  } catch (err) {
    console.warn(`⚠️ Failed to initialize ${provider.name}:`, err)
  }
}

// Start health monitoring
providerRegistry.startHealthMonitor()
```

### 2. Update Agent Orchestrator

**Old code** (agent-orchestrator.ts):
```typescript
import { callAgentLLM } from './agent-llm-client'  // ← Old proxy

const response = await callAgentLLM(agent, userMessage)
```

**New code:**
```typescript
import { callAgentLLMV2 } from './providers'  // ← New provider bridge

const response = await callAgentLLMV2(agent, userMessage)
```

### 3. Streaming Support (Optional)

```typescript
import { callAgentLLMStream } from './providers'

for await (const chunk of callAgentLLMStream(agent, userMessage)) {
  console.log(chunk)  // Process tokens as they arrive
  // Send to UI, accumulate to file, etc.
}
```

---

## Error Handling

All providers throw `ProviderError` on failure:

```typescript
export class ProviderError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly code: string,      // 'AUTH_FAILED', 'API_ERROR', etc.
    message: string,
    public readonly statusCode?: number,
    public readonly retryable?: boolean,
  )
}
```

**Example handling:**
```typescript
try {
  const response = await provider.chat(request)
} catch (err) {
  if (err instanceof ProviderError) {
    if (err.code === 'AUTH_FAILED') {
      console.error('API key invalid, please re-enter')
    } else if (err.retryable) {
      console.error('Transient error, will retry')
    }
  }
}
```

---

## Health Monitoring

The registry provides automatic health checking:

```typescript
// Manual check
const health = await providerRegistry.checkHealth('openai')
console.log(`OpenAI: ${health.status}, latency: ${health.latencyMs}ms`)

// Automatic monitoring (default every 60s)
providerRegistry.startHealthMonitor(60_000)

// Get cached health
const cached = providerRegistry.getHealth('anthropic')

// Stop monitoring
providerRegistry.stopHealthMonitor()
```

**Health Status:**
- `'healthy'` — provider responding normally
- `'degraded'` — slow latency or intermittent issues
- `'down'` — provider unreachable

---

## Model Capabilities

Each model declares what it supports:

```typescript
interface ModelCapabilities {
  supportsVision: boolean       // Image inputs
  supportsTools: boolean        // Function calling
  supportsStreaming: boolean    // Server-Sent Events
  supportsJson: boolean         // JSON mode
  contextWindow: number         // Max tokens in context
  maxOutputTokens: number       // Max tokens in response
}
```

**Query capabilities:**
```typescript
const caps = provider.getModelCapabilities('gpt-4o')
if (caps?.supportsVision) {
  // Can send images
}
```

---

## Future Phases (Roadmap)

### Phase 1.2: Vision Support
- [ ] Add `vision: boolean` to `ChatRequest`
- [ ] Support image inputs in `ChatMessage`
- [ ] Vision-capable models catalog

### Phase 1.3: Gemini & OpenRouter
- [ ] `GeminiProvider` (Google)
- [ ] `OpenRouterProvider` (multi-model aggregator)
- [ ] Cost-aware routing

### Phase 1.4: Function Calling
- [ ] Unified tool/function call format
- [ ] Automatic parameter validation
- [ ] Tool execution framework

### Phase 2.0: NPU Integration
- [ ] Local NPU acceleration
- [ ] Quantized model support
- [ ] Hybrid cloud + local strategies

---

## Testing

Each provider should be tested:

```typescript
import { OpenAIProvider } from './openai-provider'

describe('OpenAI Provider', () => {
  let provider: OpenAIProvider

  beforeAll(async () => {
    provider = new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY || 'sk-test',
    })
    await provider.initialize()
  })

  it('should list models', async () => {
    const models = await provider.listModels()
    expect(models.length).toBeGreaterThan(0)
  })

  it('should chat', async () => {
    const response = await provider.chat({
      messages: [{ role: 'user', content: 'Hello' }],
    })
    expect(response.content).toMatch(/hello|hi/i)
  })

  it('should stream', async () => {
    let chunks = 0
    for await (const chunk of provider.chatStream({
      messages: [{ role: 'user', content: 'Say hello' }],
    })) {
      if (chunk.content) chunks++
    }
    expect(chunks).toBeGreaterThan(0)
  })
})
```

---

## Configuration & Secrets

**API keys are stored encrypted** via Electron's `safeStorage`:

```typescript
// In providers.ts (existing):
import { loadApiKey, saveApiKey } from './providers'

const key = loadApiKey('openai')  // Returns decrypted key or null
saveApiKey('openai', userProvidedKey)  // Saves encrypted
```

**Never hardcode API keys.** Always use the key management in `providers.ts`.

---

## Performance Notes

- **Local (Ollama):** ~100-300ms latency, no API costs
- **OpenAI (GPT-4o):** ~500-1000ms latency, $0.005 per 1k input tokens
- **Anthropic (Claude Opus):** ~800-1200ms latency, $0.015 per 1k input tokens
- **Health checks:** Background, non-blocking, 60s default interval

---

## References

- [OpenAI API Docs](https://platform.openai.com/docs/api-reference)
- [Anthropic API Docs](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
- [Ollama API](https://github.com/jmorganca/ollama/blob/main/docs/api.md)
- [Nyra Desktop Architecture](https://github.com/yourusername/nyra-desktop)

---

**Created:** Phase 1.1 of Nyra Desktop 5-Year Plan  
**Last Updated:** 2026-03-15
