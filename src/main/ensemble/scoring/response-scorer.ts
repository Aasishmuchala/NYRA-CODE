/**
 * Response Scorer — evaluates candidate responses across multiple quality dimensions.
 *
 * Scoring is heuristic-based (no LLM call needed) for speed:
 *   - Coherence: sentence structure, readability
 *   - Relevance: keyword overlap with the original query
 *   - Completeness: response length relative to expected
 *   - Consistency: agreement with other candidates (cross-comparison)
 *   - Cost efficiency: inverse token cost
 */

import type {
  EnsembleCandidate,
  ScoringCriteria,
  ScoreBreakdown,
} from '../ensemble-interfaces'
import { DEFAULT_SCORING_CRITERIA } from '../ensemble-interfaces'

class ResponseScorer {
  /**
   * Score a single candidate relative to a query and its peers.
   */
  scoreCandidate(
    candidate: EnsembleCandidate,
    query: string,
    allCandidates: EnsembleCandidate[],
    criteria: ScoringCriteria = DEFAULT_SCORING_CRITERIA
  ): ScoreBreakdown {
    const content = candidate.response.content

    const coherence = this.scoreCoherence(content)
    const relevance = this.scoreRelevance(content, query)
    const completeness = this.scoreCompleteness(content)
    const consistency = this.scoreConsistency(content, allCandidates)
    const costEfficiency = this.scoreCostEfficiency(candidate.tokenCost, allCandidates)

    const weighted =
      coherence * criteria.coherence +
      relevance * criteria.relevance +
      completeness * criteria.completeness +
      consistency * criteria.consistency +
      costEfficiency * criteria.costEfficiency

    return { coherence, relevance, completeness, consistency, costEfficiency, weighted }
  }

  /**
   * Score all candidates and return them sorted by weighted score (best first).
   */
  rankCandidates(
    candidates: EnsembleCandidate[],
    query: string,
    criteria: ScoringCriteria = DEFAULT_SCORING_CRITERIA
  ): EnsembleCandidate[] {
    const scored = candidates.map((c) => {
      const breakdown = this.scoreCandidate(c, query, candidates, criteria)
      return { candidate: c, score: breakdown.weighted }
    })

    scored.sort((a, b) => b.score - a.score)

    return scored.map((s) => {
      s.candidate.score = s.score
      return s.candidate
    })
  }

  /**
   * Compute consensus: ratio of candidates that substantially agree.
   * Uses pairwise Jaccard similarity on word sets.
   */
  computeConsensus(candidates: EnsembleCandidate[]): number {
    if (candidates.length <= 1) return 1.0

    const wordSets = candidates.map((c) =>
      new Set(c.response.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3))
    )

    let totalSimilarity = 0
    let pairs = 0

    for (let i = 0; i < wordSets.length; i++) {
      for (let j = i + 1; j < wordSets.length; j++) {
        const intersection = new Set([...wordSets[i]].filter((w) => wordSets[j].has(w)))
        const union = new Set([...wordSets[i], ...wordSets[j]])
        totalSimilarity += union.size > 0 ? intersection.size / union.size : 0
        pairs++
      }
    }

    return pairs > 0 ? totalSimilarity / pairs : 0
  }

  // ── Private scoring methods ──────────────────────────────

  private scoreCoherence(content: string): number {
    if (!content || content.length === 0) return 0

    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0)
    if (sentences.length === 0) return 0.1

    // Heuristic: good responses have reasonable sentence lengths
    const avgSentenceLen = content.length / sentences.length
    const lenScore = avgSentenceLen > 20 && avgSentenceLen < 200 ? 0.8 : 0.4

    // Has paragraph structure?
    const hasParagraphs = content.includes('\n\n') ? 0.2 : 0.1

    return Math.min(1.0, lenScore + hasParagraphs)
  }

  private scoreRelevance(content: string, query: string): number {
    if (!content || !query) return 0

    const queryWords = new Set(
      query.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    )
    const contentWords = new Set(
      content.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    )

    if (queryWords.size === 0) return 0.5

    let matches = 0
    for (const word of queryWords) {
      if (contentWords.has(word)) matches++
    }

    return Math.min(1.0, matches / queryWords.size)
  }

  private scoreCompleteness(content: string): number {
    if (!content) return 0

    // Heuristic: very short responses are likely incomplete
    const len = content.length
    if (len < 50) return 0.2
    if (len < 200) return 0.5
    if (len < 500) return 0.7
    if (len < 2000) return 0.9
    return 0.85 // Very long might be verbose
  }

  private scoreConsistency(content: string, allCandidates: EnsembleCandidate[]): number {
    if (allCandidates.length <= 1) return 1.0

    const myWords = new Set(
      content.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    )

    const similarities = allCandidates
      .filter((c) => c.response.content !== content)
      .map((c) => {
        const otherWords = new Set(
          c.response.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
        )
        const intersection = new Set([...myWords].filter((w) => otherWords.has(w)))
        const union = new Set([...myWords, ...otherWords])
        return union.size > 0 ? intersection.size / union.size : 0
      })

    if (similarities.length === 0) return 0.5
    return similarities.reduce((a, b) => a + b, 0) / similarities.length
  }

  private scoreCostEfficiency(tokenCost: number, allCandidates: EnsembleCandidate[]): number {
    if (allCandidates.length === 0) return 0.5

    const maxCost = Math.max(...allCandidates.map((c) => c.tokenCost))
    if (maxCost === 0) return 1.0

    // Lower cost = higher score
    return 1.0 - tokenCost / maxCost
  }
}

export const responseScorer = new ResponseScorer()
