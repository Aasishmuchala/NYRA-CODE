import type {
  ReasoningStep,
  ReasoningResult,
  ReasoningConfig,
  TaskAnalysis,
} from './reasoning-interfaces'
import { DEFAULT_REASONING_CONFIG } from './reasoning-interfaces'
import { randomUUID } from 'crypto'

export type StepGenerator = (
  prompt: string,
  previousSteps: ReasoningStep[]
) => Promise<string>

const CONCLUSION_KEYWORDS = [
  'conclusion', 'therefore', 'in conclusion', 'finally',
  'the answer is', 'result:', 'solution:',
]

class ChainOfThought {
  async reason(
    taskText: string,
    analysis: TaskAnalysis,
    generateStep: StepGenerator,
    config: ReasoningConfig = DEFAULT_REASONING_CONFIG
  ): Promise<ReasoningResult> {
    const startTime = Date.now()
    const steps: ReasoningStep[] = []
    let totalTokens = 0
    let conclusion = ''

    let prompt = `Task: ${taskText}\nComplexity: ${analysis.complexity}, Type: ${analysis.taskType}\nGenerate the first reasoning step.`

    for (let depth = 0; depth < config.maxDepth; depth++) {
      if (totalTokens >= config.tokenBudget) break

      const content = await generateStep(prompt, steps)
      const tokenCost = Math.ceil(content.length / 4)
      totalTokens += tokenCost

      const isConclusion = this.isConclusion(content)
      const step: ReasoningStep = {
        id: randomUUID(),
        content,
        role: isConclusion ? 'conclusion' : 'reasoning',
        parentId: steps.length > 0 ? steps[steps.length - 1].id : null,
        children: [],
        score: 0.5,
        tokenCost,
        timestamp: Date.now(),
        metadata: { depth },
      }

      // Link parent → child
      if (steps.length > 0) {
        steps[steps.length - 1].children.push(step.id)
      }

      steps.push(step)

      if (isConclusion) {
        conclusion = content
        break
      }

      prompt = `Continue reasoning. Previous steps:\n${steps.map((s) => `- ${s.content}`).join('\n')}\nGenerate the next step.`
    }

    if (!conclusion && steps.length > 0) {
      conclusion = steps[steps.length - 1].content
    }

    return {
      strategy: 'chain-of-thought',
      analysis,
      steps,
      conclusion,
      confidence: Math.min(0.9, 0.5 + steps.length * 0.1),
      totalTokenCost: totalTokens,
      durationMs: Date.now() - startTime,
    }
  }

  private isConclusion(content: string): boolean {
    const lower = content.toLowerCase()
    return CONCLUSION_KEYWORDS.some((kw) => lower.includes(kw))
  }
}

export const chainOfThought = new ChainOfThought()
