/**
 * Ensemble Engine — orchestrates multi-model inference with strategy selection.
 *
 * This is the public API for the ensemble system. It:
 *   1. Accepts a ChatRequest + EnsembleConfig
 *   2. Resolves providers via a lookup function (decoupled from ProviderRegistry)
 *   3. Dispatches to the chosen strategy
 *   4. Returns a unified EnsembleResult
 */

import type { ChatRequest } from '../providers/provider-interface'
import type { LLMProvider } from '../providers/provider-interface'
import type {
  EnsembleStrategy,
  EnsembleConfig,
  EnsembleResult,
  EnsembleModelSpec,
} from './ensemble-interfaces'
import { DEFAULT_ENSEMBLE_CONFIG } from './ensemble-interfaces'
import { majorityVote } from './strategies/majority-vote'
import { bestOfN } from './strategies/best-of-n'
import { cascade } from './strategies/cascade'
import { specialize } from './strategies/specialize'
import { debate } from './strategies/debate'

/**
 * Function to look up a provider by ID. Injected by the caller
 * to decouple ensemble from ProviderRegistry singleton.
 */
export type ProviderLookupFn = (providerId: string) => LLMProvider | undefined

class EnsembleEngine {
  /**
   * Execute an ensemble inference run.
   */
  async execute(
    request: ChatRequest,
    config: Partial<EnsembleConfig> & { models: EnsembleModelSpec[] },
    lookupProvider: ProviderLookupFn
  ): Promise<EnsembleResult> {
    const mergedConfig: EnsembleConfig = { ...DEFAULT_ENSEMBLE_CONFIG, ...config }

    if (mergedConfig.models.length === 0) {
      throw new Error('Ensemble requires at least one model')
    }

    // Auto-select strategy if not specified or if the specified one won't work
    const strategy = this.validateStrategy(mergedConfig.strategy, mergedConfig.models)

    return this.dispatch(strategy, request, mergedConfig, lookupProvider)
  }

  /**
   * Execute with an explicit strategy override.
   */
  async executeWithStrategy(
    strategy: EnsembleStrategy,
    request: ChatRequest,
    config: Partial<EnsembleConfig> & { models: EnsembleModelSpec[] },
    lookupProvider: ProviderLookupFn
  ): Promise<EnsembleResult> {
    const mergedConfig: EnsembleConfig = { ...DEFAULT_ENSEMBLE_CONFIG, ...config }
    return this.dispatch(strategy, request, mergedConfig, lookupProvider)
  }

  /**
   * Auto-select the best strategy based on model configuration.
   */
  suggestStrategy(models: EnsembleModelSpec[]): EnsembleStrategy {
    if (models.length === 1) return 'specialize'

    // If models have different cost tiers, cascade is efficient
    const tiers = new Set(models.map((m) => m.costTier))
    if (tiers.size >= 2) return 'cascade'

    // If models have specialties, use specialize
    const hasSpecialists = models.some((m) => m.specialties && m.specialties.length > 0)
    if (hasSpecialists) return 'specialize'

    // Default: best-of-n for small sets, majority-vote for larger
    return models.length >= 3 ? 'majority-vote' : 'best-of-n'
  }

  // ── Private ──────────────────────────────────────────────

  private validateStrategy(strategy: EnsembleStrategy, models: EnsembleModelSpec[]): EnsembleStrategy {
    // Debate requires at least 2 models
    if (strategy === 'debate' && models.length < 2) return 'best-of-n'
    // Majority vote works best with 3+
    if (strategy === 'majority-vote' && models.length < 2) return 'best-of-n'
    return strategy
  }

  private async dispatch(
    strategy: EnsembleStrategy,
    request: ChatRequest,
    config: EnsembleConfig,
    lookupProvider: ProviderLookupFn
  ): Promise<EnsembleResult> {
    switch (strategy) {
      case 'majority-vote':
        return majorityVote(request, config, lookupProvider)
      case 'best-of-n':
        return bestOfN(request, config, lookupProvider)
      case 'cascade':
        return cascade(request, config, lookupProvider)
      case 'specialize':
        return specialize(request, config, lookupProvider)
      case 'debate':
        return debate(request, config, lookupProvider)
      default:
        throw new Error(`Unknown ensemble strategy: ${strategy}`)
    }
  }
}

export const ensembleEngine = new EnsembleEngine()
