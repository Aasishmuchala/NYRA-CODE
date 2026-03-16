import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Represents a learned procedure from successful task execution
 */
interface LearnedProcedure {
  id: string;
  trigger: string[];
  steps: string[];
  successRate: number;
  lastUsed: number;
  createdFrom: string;
}

/**
 * Represents a recorded task outcome with feedback
 */
interface TaskOutcome {
  taskId: string;
  agentId: string;
  result: unknown;
  userRating: number;
  timestamp: number;
  taskType: string;
}

/**
 * Represents an agent performance snapshot
 */
interface AgentScoreSnapshot {
  agentId: string;
  score: number;
  successRate: number;
  totalAttempts: number;
  timestamp: number;
}

/**
 * ProceduralMemory - Stores and manages learned procedures
 */
class ProceduralMemory extends EventEmitter {
  private procedures: Map<string, LearnedProcedure> = new Map();
  private readonly maxProcedures = 1000;
  private dataDir: string = '';

  /**
   * Initialize ProceduralMemory and load persisted procedures
   */
  init(): void {
    this.dataDir = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra', 'platform');

    // Create directory if it doesn't exist
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    // Load procedures from disk
    const proceduresPath = join(this.dataDir, 'procedural-memory.json');
    if (existsSync(proceduresPath)) {
      try {
        const data = JSON.parse(readFileSync(proceduresPath, 'utf-8')) as LearnedProcedure[];
        this.import(data);
      } catch (error) {
        console.error('Failed to load procedural memory:', error);
      }
    }
  }

  /**
   * Shutdown ProceduralMemory and persist procedures to disk
   */
  shutdown(): void {
    if (!this.dataDir) return;

    try {
      const proceduresPath = join(this.dataDir, 'procedural-memory.json');
      const data = this.export();
      writeFileSync(proceduresPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save procedural memory:', error);
    }
  }

  /**
   * Learn a new procedure from successful task completion
   */
  learn(taskResult: {
    trigger: string[];
    steps: string[];
    taskId: string;
  }): LearnedProcedure {
    const procedure: LearnedProcedure = {
      id: randomUUID(),
      trigger: taskResult.trigger,
      steps: taskResult.steps,
      successRate: 1.0,
      lastUsed: Date.now(),
      createdFrom: taskResult.taskId,
    };

    if (this.procedures.size >= this.maxProcedures) {
      this.prune();
    }

    this.procedures.set(procedure.id, procedure);
    this.emit('procedure-learned', procedure);
    return procedure;
  }

  /**
   * Recall relevant procedures for current context using keyword matching
   */
  recall(context: {
    keywords: string[];
    taskType?: string;
  }): LearnedProcedure[] {
    const matches: LearnedProcedure[] = [];

    for (const procedure of Array.from(this.procedures.values())) {
      const triggerMatch = procedure.trigger.some((t: string) =>
        context.keywords.some(
          (k) => k.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(k.toLowerCase())
        )
      );

      if (triggerMatch && procedure.successRate > 0.1) {
        matches.push(procedure);
      }
    }

    // Sort by success rate and recency
    return matches.sort((a, b) => {
      const scoreA = a.successRate * (1 - (Date.now() - a.lastUsed) / (1000 * 60 * 60 * 24));
      const scoreB = b.successRate * (1 - (Date.now() - b.lastUsed) / (1000 * 60 * 60 * 24));
      return scoreB - scoreA;
    });
  }

  /**
   * Reinforce a procedure using exponential moving average
   */
  reinforce(procedureId: string, success: boolean): void {
    const procedure = this.procedures.get(procedureId);
    if (!procedure) return;

    const alpha = 0.3;
    procedure.successRate = alpha * (success ? 1 : 0) + (1 - alpha) * procedure.successRate;
    procedure.lastUsed = Date.now();

    this.emit('procedure-reinforced', procedureId, procedure.successRate);
  }

  /**
   * Prune low-performing procedures
   */
  prune(): void {
    const toRemove: string[] = [];

    for (const [id, procedure] of Array.from(this.procedures.entries())) {
      const ageInDays = (Date.now() - procedure.lastUsed) / (1000 * 60 * 60 * 24);

      if (procedure.successRate < 0.2 && ageInDays > 10) {
        toRemove.push(id);
      }
    }

    toRemove.forEach((id) => {
      this.procedures.delete(id);
      this.emit('procedure-pruned', id);
    });
  }

  /**
   * Export memory to serializable format
   */
  export(): LearnedProcedure[] {
    return Array.from(this.procedures.values());
  }

  /**
   * Import procedures from serialized format
   */
  import(data: LearnedProcedure[]): void {
    this.procedures.clear();
    data.forEach((proc) => {
      this.procedures.set(proc.id, proc);
    });
  }

  /**
   * Get all stored procedures
   */
  getProcedures(): LearnedProcedure[] {
    return Array.from(this.procedures.values());
  }

  /**
   * Clear all procedures
   */
  clear(): void {
    this.procedures.clear();
  }
}

/**
 * FeedbackLoop - Analyzes outcomes and suggests improvements
 */
class FeedbackLoop extends EventEmitter {
  private outcomes: TaskOutcome[] = [];
  private agentScores: Map<string, number[]> = new Map();
  private readonly maxOutcomes = 10000;
  private dataDir: string = '';

  /**
   * Initialize FeedbackLoop and load persisted feedback history
   */
  init(): void {
    this.dataDir = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra', 'platform');

    // Create directory if it doesn't exist
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    // Load feedback history from disk
    const feedbackPath = join(this.dataDir, 'feedback-history.json');
    if (existsSync(feedbackPath)) {
      try {
        const data = JSON.parse(readFileSync(feedbackPath, 'utf-8')) as {
          outcomes: TaskOutcome[];
          agentScores: Record<string, number[]>;
        };
        this.outcomes = data.outcomes || [];
        if (data.agentScores) {
          this.agentScores = new Map(Object.entries(data.agentScores));
        }
      } catch (error) {
        console.error('Failed to load feedback history:', error);
      }
    }
  }

  /**
   * Shutdown FeedbackLoop and persist feedback history to disk
   */
  shutdown(): void {
    if (!this.dataDir) return;

    try {
      const feedbackPath = join(this.dataDir, 'feedback-history.json');
      const data = {
        outcomes: this.outcomes,
        agentScores: Object.fromEntries(this.agentScores),
      };
      writeFileSync(feedbackPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save feedback history:', error);
    }
  }

  /**
   * Record a task outcome with user rating (1-5)
   */
  recordOutcome(taskId: string, agentId: string, result: unknown, userRating: number): void {
    if (userRating < 1 || userRating > 5) {
      throw new Error('User rating must be between 1 and 5');
    }

    const outcome: TaskOutcome = {
      taskId,
      agentId,
      result,
      userRating,
      timestamp: Date.now(),
      taskType: this.inferTaskType(result),
    };

    this.outcomes.push(outcome);

    // Update rolling score
    if (!this.agentScores.has(agentId)) {
      this.agentScores.set(agentId, []);
    }
    this.agentScores.get(agentId)!.push(userRating);

    if (this.outcomes.length > this.maxOutcomes) {
      this.outcomes.shift();
    }

    this.emit('outcome-recorded', outcome);
  }

  /**
   * Analyze patterns in agent performance
   */
  analyzePatterns(agentId: string): {
    failureMode: string[];
    bestPerforming: string[];
    averageRating: number;
    attemptCount: number;
  } {
    const agentOutcomes = this.outcomes.filter((o) => o.agentId === agentId);

    if (agentOutcomes.length === 0) {
      return {
        failureMode: [],
        bestPerforming: [],
        averageRating: 0,
        attemptCount: 0,
      };
    }

    const failures = agentOutcomes.filter((o) => o.userRating <= 2);
    const successes = agentOutcomes.filter((o) => o.userRating >= 4);

    const failureTypes: Map<string, number> = new Map();
    failures.forEach((f) => {
      const count = failureTypes.get(f.taskType) || 0;
      failureTypes.set(f.taskType, count + 1);
    });

    const successTypes: Map<string, number> = new Map();
    successes.forEach((s) => {
      const count = successTypes.get(s.taskType) || 0;
      successTypes.set(s.taskType, count + 1);
    });

    const avgRating = agentOutcomes.reduce((sum, o) => sum + o.userRating, 0) / agentOutcomes.length;

    return {
      failureMode: Array.from(failureTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type]) => type),
      bestPerforming: Array.from(successTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type]) => type),
      averageRating: avgRating,
      attemptCount: agentOutcomes.length,
    };
  }

  /**
   * Generate improvement suggestions based on failure analysis
   */
  suggestImprovements(agentId: string): string[] {
    const analysis = this.analyzePatterns(agentId);
    const suggestions: string[] = [];

    if (analysis.averageRating < 2.5) {
      suggestions.push('Agent performance is significantly below average. Consider full retraining.');
    }

    if (analysis.failureMode.length > 0) {
      suggestions.push(`Focus on improving ${analysis.failureMode[0]} task handling.`);
    }

    if (analysis.bestPerforming.length > 0) {
      suggestions.push(`Leverage success patterns from ${analysis.bestPerforming[0]} tasks.`);
    }

    if (analysis.attemptCount < 10) {
      suggestions.push('Insufficient data for reliable improvement suggestions. Continue collecting feedback.');
    }

    return suggestions;
  }

  /**
   * Get rolling average performance score for an agent
   */
  getAgentScore(agentId: string): AgentScoreSnapshot {
    const scores = this.agentScores.get(agentId) || [];
    const recentScores = scores.slice(-50);

    const score = recentScores.length > 0 ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : 0;
    const successCount = scores.filter((s) => s >= 4).length;
    const successRate = scores.length > 0 ? successCount / scores.length : 0;

    return {
      agentId,
      score,
      successRate,
      totalAttempts: scores.length,
      timestamp: Date.now(),
    };
  }

  /**
   * Get outcomes for an agent
   */
  getOutcomes(agentId?: string): TaskOutcome[] {
    if (!agentId) return this.outcomes;
    return this.outcomes.filter((o) => o.agentId === agentId);
  }

  /**
   * Clear all outcomes
   */
  clear(): void {
    this.outcomes = [];
    this.agentScores.clear();
  }

  /**
   * Infer task type from result
   */
  private inferTaskType(result: unknown): string {
    if (!result || typeof result !== 'object') return 'unknown';
    if ('type' in result) return String(result.type);
    return result.constructor.name;
  }
}

/**
 * SelfImprovingAgent - Wraps any agent with learning and feedback
 */
class SelfImprovingAgent extends EventEmitter {
  private agentId: string;
  private procedureMemory: ProceduralMemory;
  private feedbackLoop: FeedbackLoop;
  private executionHistory: Array<{
    taskId: string;
    timestamp: number;
    proceduresUsed: string[];
  }> = [];

  constructor(
    agentId: string,
    procedureMemory: ProceduralMemory,
    feedbackLoop: FeedbackLoop
  ) {
    super();
    this.agentId = agentId;
    this.procedureMemory = procedureMemory;
    this.feedbackLoop = feedbackLoop;
  }

  /**
   * Execute a task with augmented context from procedural memory
   */
  async execute(task: {
    id: string;
    type: string;
    keywords: string[];
    payload: unknown;
  }): Promise<{
    result: unknown;
    proceduresUsed: string[];
    context: unknown;
  }> {
    const relevantProcedures = this.procedureMemory.recall({
      keywords: task.keywords,
      taskType: task.type,
    });

    const procedureIds = relevantProcedures.map((p) => p.id);
    const context = {
      taskType: task.type,
      suggestedSteps: relevantProcedures.flatMap((p) => p.steps),
      similarTasks: relevantProcedures.length,
    };

    this.executionHistory.push({
      taskId: task.id,
      timestamp: Date.now(),
      proceduresUsed: procedureIds,
    });

    this.emit('task-executed', { taskId: task.id, proceduresUsed: procedureIds });

    return {
      result: task.payload,
      proceduresUsed: procedureIds,
      context,
    };
  }

  /**
   * Periodic self-assessment and learning
   */
  async reflect(): Promise<void> {
    const recentOutcomes = this.feedbackLoop
      .getOutcomes(this.agentId)
      .slice(-20);

    if (recentOutcomes.length === 0) return;

    for (const outcome of recentOutcomes) {
      if (outcome.userRating >= 4) {
        const history = this.executionHistory.find((h) => h.taskId === outcome.taskId);
        if (history) {
          for (const procId of history.proceduresUsed) {
            this.procedureMemory.reinforce(procId, true);
          }

          if (history.proceduresUsed.length === 0) {
            this.procedureMemory.learn({
              trigger: [outcome.taskType],
              steps: ['execute-task'],
              taskId: outcome.taskId,
            });
          }
        }
      }
    }

    this.emit('reflection-complete');
  }

  /**
   * Get comprehensive performance report
   */
  getPerformanceReport(): {
    agentId: string;
    score: AgentScoreSnapshot;
    learnedProcedures: number;
    executionCount: number;
    improvements: string[];
  } {
    const score = this.feedbackLoop.getAgentScore(this.agentId);
    const improvements = this.feedbackLoop.suggestImprovements(this.agentId);
    const procedures = this.procedureMemory.getProcedures();

    return {
      agentId: this.agentId,
      score,
      learnedProcedures: procedures.length,
      executionCount: this.executionHistory.length,
      improvements,
    };
  }
}

// Export singletons
export const proceduralMemory = new ProceduralMemory();
export const feedbackLoop = new FeedbackLoop();

// Export classes
export { ProceduralMemory, FeedbackLoop, SelfImprovingAgent };
export type { LearnedProcedure, TaskOutcome, AgentScoreSnapshot };
