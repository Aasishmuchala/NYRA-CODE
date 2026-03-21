import type {
  ReasoningStep,
  ReasoningResult,
  ReasoningConfig,
  ReasoningBranch,
  TaskAnalysis,
} from './reasoning-interfaces'
import { DEFAULT_REASONING_CONFIG } from './reasoning-interfaces'
import { randomUUID } from 'crypto'
import type { StepGenerator } from './chain-of-thought'

export type StepScorer = (
  step: ReasoningStep,
  context: ReasoningStep[]
) => Promise<number>

const CONCLUSION_KEYWORDS = [
  'conclusion', 'therefore', 'in conclusion', 'finally',
  'the answer is', 'result:', 'solution:',
]

class TreeOfThought {
  async reason(
    taskText: string,
    analysis: TaskAnalysis,
    generateStep: StepGenerator,
    scoreStep: StepScorer,
    config: ReasoningConfig = DEFAULT_REASONING_CONFIG
  ): Promise<ReasoningResult> {
    const startTime = Date.now()
    const numBranches = config.maxBranches
    let branches: ReasoningBranch[] = []
    let totalTokens = 0

    // Create initial divergent branches
    for (let i = 0; i < numBranches; i++) {
      const prompt = `Task: ${taskText}\nApproach ${i + 1}: Generate a distinct reasoning approach.`
      const content = await generateStep(prompt, [])
      totalTokens += Math.ceil(content.length / 4)

      const step: ReasoningStep = {
        id: randomUUID(),
        content,
        role: 'reasoning',
        parentId: null,
        children: [],
        score: 0.5,
        tokenCost: Math.ceil(content.length / 4),
        timestamp: Date.now(),
        metadata: { approach: i + 1 },
      }

      branches.push({
        id: randomUUID(),
        steps: [step],
        totalScore: 0,
        status: 'exploring',
        depth: 1,
      })
    }

    // Expand branches iteratively
    for (let depth = 1; depth < config.maxDepth; depth++) {
      if (totalTokens >= config.tokenBudget) break

      for (const branch of branches) {
        if (branch.status === 'pruned') continue
        const lastStep = branch.steps[branch.steps.length - 1]
        if (lastStep.role === 'conclusion') continue

        const prompt = `Continue reasoning:\n${branch.steps.map((s) => s.content).join('\n\n')}\nGenerate the next step.`
        const content = await generateStep(prompt, branch.steps)
        const tokenCost = Math.ceil(content.length / 4)
        totalTokens += tokenCost

        const isConclusion = CONCLUSION_KEYWORDS.some((kw) => content.toLowerCase().includes(kw))

        const newStep: ReasoningStep = {
          id: randomUUID(),
          content,
          role: isConclusion ? 'conclusion' : 'reasoning',
          parentId: lastStep.id,
          children: [],
          score: 0,
          tokenCost,
          timestamp: Date.now(),
          metadata: { depth },
        }

        // Score this step
        newStep.score = await scoreStep(newStep, branch.steps)
        lastStep.children.push(newStep.id)
        branch.steps.push(newStep)
        branch.totalScore += newStep.score
        branch.depth = depth + 1
      }

      // Prune low-scoring branches
      const maxScore = Math.max(...branches.map((b) => b.totalScore))
      if (maxScore > 0) {
        for (const branch of branches) {
          if (branch.totalScore < maxScore * config.pruneThreshold) {
            branch.status = 'pruned'
          }
        }
      }

      // Stop if all active branches concluded
      const active = branches.filter((b) => b.status !== 'pruned')
      if (active.every((b) => b.steps[b.steps.length - 1].role === 'conclusion')) break
    }

    // Select best branch
    const activeBranches = branches.filter((b) => b.status !== 'pruned')
    const best = activeBranches.reduce((a, b) => b.totalScore > a.totalScore ? b : a, activeBranches[0])
    best.status = 'selected'

    const conclusion = best.steps[best.steps.length - 1].content

    return {
      strategy: 'tree-of-thought',
      analysis,
      steps: best.steps,
      conclusion,
      confidence: Math.min(0.95, best.totalScore / best.steps.length),
      totalTokenCost: totalTokens,
      durationMs: Date.now() - startTime,
      branches,
    }
  }
}

export const treeOfThought = new TreeOfThought()
