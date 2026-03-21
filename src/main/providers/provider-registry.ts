/**
 * Provider Registry — discovers, manages, and routes to LLM providers
 *
 * Central hub for:
 * - Registering/unregistering providers
 * - Health monitoring
 * - Smart routing (find best provider for a request)
 * - Initialization from stored API keys
 */

import type {
  LLMProvider,
  ModelCapabilities,
  ProviderHealth,
} from './provider-interface'

/**
 * Routing request for smart provider selection.
 */
export interface RoutingRequest {
  preferredProvider?: string
  preferredModel?: string
  requiresVision?: boolean
  requiresTools?: boolean
  requiresEmbedding?: boolean
  requiresLocal?: boolean      // Must be offline-capable
  maxCostPer1kTokens?: number
  maxLatencyMs?: number
}

/**
 * Provider Registry — singleton that manages all LLM providers.
 */
class ProviderRegistry {
  private providers = new Map<string, LLMProvider>()
  private healthCache = new Map<string, ProviderHealth>()
  private healthMonitorInterval: ReturnType<typeof setInterval> | null = null
  private healthMonitorRunning = false

  /**
   * Register a provider instance.
   */
  register(provider: LLMProvider): void {
    this.providers.set(provider.id, provider)
    console.log(`[ProviderRegistry] Registered provider: ${provider.name}`)
  }

  /**
   * Unregister a provider by ID.
   */
  unregister(providerId: string): void {
    this.providers.delete(providerId)
    this.healthCache.delete(providerId)
    console.log(`[ProviderRegistry] Unregistered provider: ${providerId}`)
  }

  /**
   * Get a provider by ID.
   */
  get(providerId: string): LLMProvider | undefined {
    return this.providers.get(providerId)
  }

  /**
   * Get all registered providers.
   */
  getAll(): LLMProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Get only available (healthy) providers.
   */
  getAvailable(): LLMProvider[] {
    return Array.from(this.providers.values()).filter(p => {
      const health = this.healthCache.get(p.id)
      return health?.status === 'healthy'
    })
  }

  /**
   * Get local providers (Ollama, NPU, etc.)
   */
  getLocalProviders(): LLMProvider[] {
    return Array.from(this.providers.values()).filter(p => p.isLocal)
  }

  /**
   * Get cloud providers (OpenAI, Anthropic, etc.)
   */
  getCloudProviders(): LLMProvider[] {
    return Array.from(this.providers.values()).filter(p => !p.isLocal)
  }

  /**
   * Find the best provider for a routing request.
   *
   * Priority:
   * 1. Preferred provider (if specified and available)
   * 2. Filter by capability requirements
   * 3. Filter by local/cloud requirement
   * 4. Sort by latency (preferred), then cost
   * 5. Return first match
   */
  findBestProvider(request: RoutingRequest): LLMProvider | null {
    const available = this.getAvailable()

    if (available.length === 0) {
      return null
    }

    // 1. Try preferred provider first
    if (request.preferredProvider) {
      const preferred = available.find(p => p.id === request.preferredProvider)
      if (preferred) {
        if (this.meetsRequirements(preferred, request.preferredModel, request)) {
          return preferred
        }
      }
    }

    // 2. Filter by capability requirements
    let candidates = available.filter(p => {
      const model = request.preferredModel || this.getFirstModel(p)
      if (!model) return false
      return this.meetsRequirements(p, model, request)
    })

    if (candidates.length === 0) {
      return null
    }

    // 3. Filter by local/cloud requirement
    if (request.requiresLocal !== undefined) {
      candidates = candidates.filter(p => p.isLocal === request.requiresLocal)
      if (candidates.length === 0) return null
    }

    // 4. Sort by latency, then by preference
    // Prefer local providers for lower latency
    if (request.requiresLocal) {
      candidates.sort((a, b) => {
        const aHealth = this.healthCache.get(a.id)
        const bHealth = this.healthCache.get(b.id)
        return (aHealth?.latencyMs ?? 0) - (bHealth?.latencyMs ?? 0)
      })
    }

    return candidates[0] ?? null
  }

  /**
   * Check health of a single provider.
   */
  async checkHealth(providerId: string): Promise<ProviderHealth> {
    const provider = this.providers.get(providerId)
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`)
    }

    const health = await provider.healthCheck()
    this.healthCache.set(providerId, health)
    return health
  }

  /**
   * Check health of all providers in parallel.
   */
  async checkAllHealth(): Promise<Map<string, ProviderHealth>> {
    const checks = Array.from(this.providers.values()).map(p =>
      p.healthCheck().then(h => [p.id, h] as [string, ProviderHealth])
    )

    const results = await Promise.allSettled(checks)
    const health = new Map<string, ProviderHealth>()

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [id, h] = result.value
        health.set(id, h)
        this.healthCache.set(id, h)
      }
    }

    return health
  }

  /**
   * Start periodic health monitoring.
   * Default: every 60 seconds
   */
  startHealthMonitor(intervalMs: number = 60_000): void {
    if (this.healthMonitorRunning) {
      console.warn('[ProviderRegistry] Health monitor already running')
      return
    }

    this.healthMonitorRunning = true
    console.log(`[ProviderRegistry] Starting health monitor (every ${intervalMs}ms)`)

    // Initial check
    this.checkAllHealth().catch(err => {
      console.error('[ProviderRegistry] Initial health check failed:', err)
    })

    // Periodic checks
    this.healthMonitorInterval = setInterval(() => {
      this.checkAllHealth().catch(err => {
        console.error('[ProviderRegistry] Health check failed:', err)
      })
    }, intervalMs)
  }

  /**
   * Stop health monitoring.
   */
  stopHealthMonitor(): void {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval)
      this.healthMonitorInterval = null
    }
    this.healthMonitorRunning = false
    console.log('[ProviderRegistry] Stopped health monitor')
  }

  /**
   * Get cached health for a provider.
   */
  getHealth(providerId: string): ProviderHealth | undefined {
    return this.healthCache.get(providerId)
  }

  /**
   * Initialize all providers from stored API keys.
   * This reads from the existing providers.ts and creates provider instances.
   *
   * Note: This requires the caller to set up the providers.ts integration.
   */
  async initializeFromConfig(
    loadApiKey: (providerId: string) => string | null,
    createProvider: (id: string, config: any) => LLMProvider | null,
  ): Promise<void> {
    console.log('[ProviderRegistry] Initializing providers from config')

    const providerIds = ['openai', 'anthropic', 'gemini', 'ollama']

    for (const id of providerIds) {
      try {
        const apiKey = loadApiKey(id)
        const provider = createProvider(id, { apiKey })

        if (provider) {
          this.register(provider)
          await provider.initialize()
        }
      } catch (err) {
        console.warn(`[ProviderRegistry] Failed to initialize ${id}:`, err)
      }
    }

    // Initialize NPU provider (no API key needed, local inference)
    try {
      const { NpuProvider } = await import('./npu-provider')
      const npuProvider = new NpuProvider()
      this.register(npuProvider)
      await npuProvider.initialize()
    } catch (err) {
      console.warn('[ProviderRegistry] NPU provider not available:', err)
    }

    // Start health monitoring
    this.startHealthMonitor()
  }

  // ── Private helpers ──

  private meetsRequirements(
    provider: LLMProvider,
    modelId: string | undefined,
    request: RoutingRequest,
  ): boolean {
    if (!modelId) return false

    const capabilities = provider.getModelCapabilities(modelId)
    if (!capabilities) return false

    if (request.requiresVision && !capabilities.supportsVision) return false
    if (request.requiresTools && !capabilities.supportsTools) return false
    if (request.requiresEmbedding && !provider.supportsEmbeddings()) return false

    return true
  }

  private getFirstModel(provider: LLMProvider): string | undefined {
    // This is a placeholder — in real use, we'd track available models
    // For now, return undefined to force the caller to specify a model
    return undefined
  }
}

/**
 * Global singleton provider registry.
 */
export const providerRegistry = new ProviderRegistry()
