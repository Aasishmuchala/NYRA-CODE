import type { MemoryEntry, MemorySearchResult, MemoryTier } from '../memory-interfaces';

export interface ScoredEntry {
  entry: MemoryEntry;
  bm25Score: number;
  semanticScore: number;
  importanceScore: number;
  combinedScore: number;
}

export interface HybridWeights {
  bm25: number;
  semantic: number;
  importance: number;
}

const DEFAULT_WEIGHTS: HybridWeights = {
  bm25: 0.3,
  semantic: 0.5,
  importance: 0.2,
};

class HybridSearch {
  /**
   * Compute BM25 score for a query term in a document.
   * Uses standard BM25 formula with configurable k1 and b parameters.
   */
  bm25Score(
    query: string,
    document: string,
    avgDocLength: number,
    k1: number = 1.5,
    b: number = 0.75
  ): number {
    const queryTerms = this.tokenize(query);
    const docTerms = this.tokenize(document);
    const docLength = docTerms.length;

    // Guard against edge cases
    if (queryTerms.length === 0 || docLength === 0 || avgDocLength === 0) {
      return 0;
    }

    // Build term frequency map for document
    const termFreq = new Map<string, number>();
    for (const term of docTerms) {
      termFreq.set(term, (termFreq.get(term) ?? 0) + 1);
    }

    // Compute BM25 score as sum over query terms
    let score = 0;
    for (const queryTerm of queryTerms) {
      const tf = termFreq.get(queryTerm) ?? 0;
      if (tf > 0) {
        const numerator = tf * (k1 + 1);
        const denominator =
          tf + k1 * (1 - b + (b * docLength) / avgDocLength);
        score += numerator / denominator;
      }
    }

    return score;
  }

  /**
   * Compute cosine similarity between two embedding vectors.
   * Uses standard formula: dot_product / (norm_a * norm_b)
   */
  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Embedding vectors must have same length');
    }

    if (a.length === 0) {
      return 0;
    }

    // Compute dot product
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }

    // Compute norms
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    // Guard against division by zero
    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Perform min-max normalization on an array of scores.
   * Normalizes to [0, 1] range.
   */
  private normalizeScores(scores: number[]): number[] {
    if (scores.length === 0) {
      return [];
    }

    const min = Math.min(...scores);
    const max = Math.max(...scores);

    // Handle case where all scores are identical
    if (min === max) {
      return scores.map(() => 0.5);
    }

    const range = max - min;
    return scores.map((score) => (score - min) / range);
  }

  /**
   * Apply hybrid ranking to scored entries.
   * Combines BM25, semantic, and importance scores using weighted sum.
   */
  hybridRank(results: ScoredEntry[], weights?: HybridWeights): ScoredEntry[] {
    const w = weights ?? DEFAULT_WEIGHTS;

    if (results.length === 0) {
      return [];
    }

    // Extract individual score arrays for normalization
    const bm25Scores = results.map((r) => r.bm25Score);
    const semanticScores = results.map((r) => r.semanticScore);
    const importanceScores = results.map((r) => r.importanceScore);

    // Normalize each dimension
    const normalizedBm25 = this.normalizeScores(bm25Scores);
    const normalizedSemantic = this.normalizeScores(semanticScores);
    const normalizedImportance = this.normalizeScores(importanceScores);

    // Compute combined scores and update results
    const rankedResults = results.map((result, index) => ({
      ...result,
      combinedScore:
        w.bm25 * normalizedBm25[index] +
        w.semantic * normalizedSemantic[index] +
        w.importance * normalizedImportance[index],
    }));

    // Sort by combined score descending
    rankedResults.sort((a, b) => b.combinedScore - a.combinedScore);

    return rankedResults;
  }

  /**
   * Full hybrid search pipeline.
   * Scores entries on BM25 lexical search, semantic similarity (if embedding provided),
   * and importance/decay. Returns top results ranked by hybrid score.
   */
  search(
    query: string,
    entries: MemoryEntry[],
    queryEmbedding?: Float32Array,
    limit: number = 20
  ): MemorySearchResult[] {
    if (entries.length === 0) {
      return [];
    }

    // Compute average document length
    const contentLengths = entries.map((e) =>
      this.tokenize(e.content).length
    );
    const avgDocLength =
      contentLengths.reduce((sum, len) => sum + len, 0) / entries.length;

    // Score all entries
    const scoredEntries = entries.map((entry) => {
      const bm25Score = this.bm25Score(query, entry.content, avgDocLength);

      // Compute semantic score if query embedding and entry embedding both provided
      let semanticScore = 0;
      if (queryEmbedding && entry.embedding) {
        semanticScore = this.cosineSimilarity(queryEmbedding, entry.embedding);
      }

      // Compute importance score from importance * decay factor
      const importanceScore = entry.importance * entry.decayFactor;

      return {
        entry,
        bm25Score,
        semanticScore,
        importanceScore,
        combinedScore: 0, // Will be computed by hybridRank
      };
    });

    // Apply hybrid ranking
    const rankedEntries = this.hybridRank(scoredEntries);

    // Determine match type for each result based on dominant score
    const results: MemorySearchResult[] = rankedEntries.slice(0, limit).map(
      (scored) => {
        let matchType: MemorySearchResult['matchType'] = 'keyword';

        if (
          scored.semanticScore > scored.bm25Score &&
          scored.semanticScore > scored.importanceScore
        ) {
          matchType = 'semantic';
        } else if (
          scored.importanceScore > scored.bm25Score &&
          scored.importanceScore > scored.semanticScore
        ) {
          matchType = 'associative';
        }

        return {
          entry: scored.entry,
          relevance: scored.combinedScore,
          matchType,
          tier: scored.entry.metadata.tier,
        };
      }
    );

    return results;
  }

  /**
   * Tokenize text by splitting on non-word characters and lowercasing.
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 0);
  }
}

export const hybridSearch = new HybridSearch();
