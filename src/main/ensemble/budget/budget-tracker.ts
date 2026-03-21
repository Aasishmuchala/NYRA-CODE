/**
 * Budget Tracker — manages token budget across ensemble participants.
 *
 * Ensures the ensemble doesn't exceed the configured token limit.
 * Supports per-model allocation and real-time spend tracking.
 */

import type { BudgetState, BudgetAllocation, EnsembleModelSpec } from '../ensemble-interfaces'

class BudgetTracker {
  private state: BudgetState | null = null

  /**
   * Initialize budget for an ensemble run.
   */
  initialize(totalBudget: number, models: EnsembleModelSpec[]): BudgetState {
    // Allocate budget proportional to model weight
    const totalWeight = models.reduce((sum, m) => sum + m.weight, 0) || 1

    const allocations: BudgetAllocation[] = models.map((m) => ({
      providerId: m.providerId,
      model: m.model,
      allocated: Math.floor((m.weight / totalWeight) * totalBudget),
      spent: 0,
    }))

    this.state = {
      totalBudget,
      spent: 0,
      remaining: totalBudget,
      allocations,
    }

    return { ...this.state }
  }

  /**
   * Check if a model can still make a request within its allocation.
   */
  canSpend(providerId: string, model: string, estimatedTokens: number): boolean {
    if (!this.state) return false
    if (this.state.remaining < estimatedTokens) return false

    const alloc = this.findAllocation(providerId, model)
    if (!alloc) return true // No specific allocation = use global budget

    return alloc.spent + estimatedTokens <= alloc.allocated * 1.5 // Allow 50% overflow per model
  }

  /**
   * Record tokens spent by a model.
   */
  recordSpend(providerId: string, model: string, tokens: number): void {
    if (!this.state) return

    this.state.spent += tokens
    this.state.remaining = Math.max(0, this.state.totalBudget - this.state.spent)

    const alloc = this.findAllocation(providerId, model)
    if (alloc) {
      alloc.spent += tokens
    }
  }

  /**
   * Get remaining budget for the ensemble run.
   */
  getRemaining(): number {
    return this.state?.remaining ?? 0
  }

  /**
   * Get full budget state snapshot.
   */
  getState(): BudgetState | null {
    return this.state ? { ...this.state } : null
  }

  /**
   * Check if the overall budget is exhausted.
   */
  isExhausted(): boolean {
    return this.state ? this.state.remaining <= 0 : true
  }

  /**
   * Reallocate unspent budget from finished models to remaining ones.
   */
  reallocateUnspent(finishedModels: string[]): void {
    if (!this.state) return

    let freed = 0
    const activeAllocations: BudgetAllocation[] = []

    for (const alloc of this.state.allocations) {
      const key = `${alloc.providerId}:${alloc.model}`
      if (finishedModels.includes(key)) {
        freed += Math.max(0, alloc.allocated - alloc.spent)
      } else {
        activeAllocations.push(alloc)
      }
    }

    if (freed > 0 && activeAllocations.length > 0) {
      const perModel = Math.floor(freed / activeAllocations.length)
      for (const alloc of activeAllocations) {
        alloc.allocated += perModel
      }
    }
  }

  private findAllocation(providerId: string, model: string): BudgetAllocation | undefined {
    return this.state?.allocations.find(
      (a) => a.providerId === providerId && a.model === model
    )
  }
}

export const budgetTracker = new BudgetTracker()
