/**
 * Provider Abstraction Layer — Phase 1.1 Exports
 *
 * Core interfaces, implementations, and the registry for all LLM providers.
 */

// ── Core Interfaces ──
export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  TokenUsage,
  ToolDefinition,
  ToolCall,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderHealth,
  ModelCapabilities,
  ModelCard,
  LLMProvider,
  LLMProviderFactory,
  ProviderConfig,
} from './provider-interface'

export { ProviderError } from './provider-interface'

// ── Provider Implementations ──
export { OpenAIProvider } from './openai-provider'
export { AnthropicProvider } from './anthropic-provider'
export { OllamaProvider } from './ollama-provider'
export { GeminiProvider } from './gemini-provider'

// ── Registry ──
export { providerRegistry, type RoutingRequest } from './provider-registry'

// ── Bridge (Agent LLM compatibility) ──
export {
  callAgentLLMV2,
  callAgentLLMStream,
  AgentLLMError,
} from './provider-bridge'
