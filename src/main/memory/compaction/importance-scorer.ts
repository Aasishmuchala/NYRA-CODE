import type {
  MemoryEntry,
  ImportanceFactors,
  ImportanceWeights,
} from '../memory-interfaces';

const DEFAULT_IMPORTANCE_WEIGHTS: ImportanceWeights = {
  recency: 0.25,
  frequency: 0.15,
  relevance: 0.20,
  explicitImportance: 0.20,
  sourceReliability: 0.10,
  uniqueness: 0.10,
};

const SOURCE_RELIABILITY_MAP: Record<string, number> = {
  user_input: 1.0,
  agent_output: 0.8,
  extraction: 0.7,
  compaction: 0.6,
  workflow_learning: 0.9,
  import: 0.5,
};

const HALF_LIFE_DAYS = 7;
const MAX_EXPECTED_ACCESS = 100;

class ImportanceScorer {
  private weights: ImportanceWeights;

  constructor(weights?: ImportanceWeights) {
    this.weights = weights || DEFAULT_IMPORTANCE_WEIGHTS;
  }

  scoreImportance(
    entry: MemoryEntry,
    currentContext?: string
  ): number {
    const recencyScore = this.computeRecency(entry);
    const frequencyScore = this.computeFrequency(entry);
    const relevanceScore = this.computeRelevance(entry, currentContext);
    const explicitScore = entry.importance;
    const sourceScore = this.computeSourceReliability(entry);
    const uniquenessScore = 0.5; // Default; real dedup would need all entries

    const totalScore =
      recencyScore * this.weights.recency +
      frequencyScore * this.weights.frequency +
      relevanceScore * this.weights.relevance +
      explicitScore * this.weights.explicitImportance +
      sourceScore * this.weights.sourceReliability +
      uniquenessScore * this.weights.uniqueness;

    return Math.min(1.0, Math.max(0.0, totalScore));
  }

  private computeRecency(entry: MemoryEntry): number {
    const now = Date.now();
    const daysSinceAccess = (now - entry.lastAccessedAt) / (1000 * 60 * 60 * 24);

    // Exponential decay with 7-day half-life
    return Math.exp(-daysSinceAccess / HALF_LIFE_DAYS);
  }

  private computeFrequency(entry: MemoryEntry): number {
    // log(accessCount + 1) / log(maxExpectedAccess + 1)
    return Math.log(entry.accessCount + 1) / Math.log(MAX_EXPECTED_ACCESS + 1);
  }

  private computeRelevance(
    entry: MemoryEntry,
    currentContext?: string
  ): number {
    if (!currentContext) {
      return 0.5;
    }

    // Simple word overlap ratio
    const entryWords = new Set(
      entry.content
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
    const contextWords = new Set(
      currentContext
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );

    const overlap = Array.from(entryWords).filter((w) =>
      contextWords.has(w)
    ).length;
    const union =
      new Set([...entryWords, ...contextWords]).size;

    return union > 0 ? overlap / union : 0.0;
  }

  private computeSourceReliability(entry: MemoryEntry): number {
    const source = entry.metadata.source || 'user_input';
    return SOURCE_RELIABILITY_MAP[source] ?? 0.5;
  }

  computeDecay(
    entry: MemoryEntry,
    halfLifeDays: number = HALF_LIFE_DAYS
  ): number {
    if (entry.metadata.pinned) {
      return 1.0;
    }

    const now = Date.now();
    const daysSinceAccess = (now - entry.lastAccessedAt) / (1000 * 60 * 60 * 24);

    // Ebbinghaus forgetting curve: retention = e^(-t/halfLife)
    return Math.exp(-daysSinceAccess / halfLifeDays);
  }

  shouldCompact(entry: MemoryEntry, threshold: number): boolean {
    const importance = this.scoreImportance(entry);
    const decay = this.computeDecay(entry);
    const score = importance * decay;
    return score < threshold;
  }

  shouldPromote(entry: MemoryEntry): boolean {
    const importance = this.scoreImportance(entry);
    return entry.accessCount > 5 && importance > 0.7;
  }

  shouldDemote(
    entry: MemoryEntry,
    daysInactive: number
  ): boolean {
    if (entry.metadata.pinned) {
      return false;
    }

    const now = Date.now();
    const daysSinceAccess = (now - entry.lastAccessedAt) / (1000 * 60 * 60 * 24);

    const importance = this.scoreImportance(entry);
    return (
      daysSinceAccess > daysInactive &&
      importance < 0.3 &&
      !entry.metadata.pinned
    );
  }
}

export const importanceScorer = new ImportanceScorer(
  DEFAULT_IMPORTANCE_WEIGHTS
);
