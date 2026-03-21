import type {
  ReasoningStrategy,
  TaskAnalysis,
  ReasoningResult,
  ReasoningConfig,
} from './reasoning-interfaces'
import { DEFAULT_REASONING_CONFIG } from './reasoning-interfaces'
import { chainOfThought } from './chain-of-thought'
import type { StepGenerator } from './chain-of-thought'
import { treeOfThought } from './tree-of-thought'
import type { StepScorer } from './tree-of-thought'
import { graphOfThought } from './graph-of-thought'
import type { NodeResolver } from './graph-of-thought'
import { selfCritique } from './reflection/self-critique'

export type LLMCallFn = (prompt: string) => Promise<string>

class ReasoningEngine {
  analyzeTask(taskText: string): TaskAnalysis {
    const wordCount = taskText.split(/\s+/).length
    const estimatedSteps = Math.min(Math.ceil(wordCount / 20), 10)

    const constraintKeywords = [
      'must', 'should', 'requires', 'however', 'but', 'ensure', 'constraint',
    ]
    const constraintCount = constraintKeywords.filter((kw) =>
      taskText.toLowerCase().includes(kw)
    ).length

    const questionMarkCount = (taskText.match(/\?/g) || []).length
    const ambiguity = Math.min(questionMarkCount / Math.max(wordCount, 1), 1)

    const lower = taskText.toLowerCase()
    let taskType: TaskAnalysis['taskType']
    if (lower.includes('fix') || lower.includes('bug') || lower.includes('error')) {
      taskType = 'debugging'
    } else if (lower.includes('create') || lower.includes('design') || lower.includes('imagine')) {
      taskType = 'creative'
    } else if (lower.includes('analyze') || lower.includes('compare')) {
      taskType = 'analysis'
    } else if (lower.includes('code') || lower.includes('implement') || lower.includes('function')) {
      taskType = 'coding'
    } else if (lower.includes('plan') || lower.includes('schedule') || lower.includes('organize')) {
      taskType = 'planning'
    } else {
      taskType = 'general'
    }

    let complexity: TaskAnalysis['complexity']
    let suggestedStrategy: ReasoningStrategy

    const isSimple = estimatedSteps <= 3 && constraintCount <= 1
    if (isSimple) {
      complexity = 'simple'
      suggestedStrategy = 'chain-of-thought'
    } else if (ambiguity > 0.5 || taskType === 'creative') {
      complexity = 'complex'
      suggestedStrategy = 'tree-of-thought'
    } else if (constraintCount >= 3 || taskType === 'planning') {
      complexity = 'complex'
      suggestedStrategy = 'graph-of-thought'
    } else {
      complexity = 'moderate'
      suggestedStrategy = 'chain-of-thought'
    }

    return {
      taskText,
      complexity,
      ambiguity,
      constraintCount,
      estimatedSteps,
      suggestedStrategy,
      confidence: isSimple ? 0.9 : complexity === 'moderate' ? 0.7 : 0.5,
      taskType,
    }
  }

  private createStepGenerator(llmCall: LLMCallFn): StepGenerator {
    return async (prompt: string, _previousSteps) => {
      return llmCall(prompt)
    }
  }

  private createStepScorer(llmCall: LLMCallFn): StepScorer {
    return async (step, _context) => {
      const prompt = `Rate this reasoning step 0-1:\n"${step.content}"\nRespond with only a decimal number.`
      const response = await llmCall(prompt)
      const score = parseFloat(response.trim())
      return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score))
    }
  }

  private createNodeResolver(llmCall: LLMCallFn): NodeResolver {
    return async (node, resolvedDeps) => {
      const depsContext = resolvedDeps
        .filter((d) => d.value)
        .map((d) => `[${d.type}] ${d.value}`)
        .join('\n')

      const prompt = `Resolve this reasoning node:\n\nDependencies:\n${depsContext || '(none)'}\n\nNode [${node.type}]: ${node.content}\n\nProvide a resolution.`
      return llmCall(prompt)
    }
  }

  async execute(
    taskText: string,
    llmCall: LLMCallFn,
    config?: ReasoningConfig
  ): Promise<ReasoningResult> {
    const analysis = this.analyzeTask(taskText)
    return this.executeWithStrategy(taskText, analysis, analysis.suggestedStrategy, llmCall, config)
  }

  async executeWithStrategy(
    taskText: string,
    analysis: TaskAnalysis,
    strategy: ReasoningStrategy,
    llmCall: LLMCallFn,
    config?: ReasoningConfig
  ): Promise<ReasoningResult> {
    const mergedConfig: ReasoningConfig = { ...DEFAULT_REASONING_CONFIG, ...config }

    let result: ReasoningResult

    if (strategy === 'chain-of-thought') {
      const gen = this.createStepGenerator(llmCall)
      result = await chainOfThought.reason(taskText, analysis, gen, mergedConfig)
    } else if (strategy === 'tree-of-thought') {
      const gen = this.createStepGenerator(llmCall)
      const scorer = this.createStepScorer(llmCall)
      result = await treeOfThought.reason(taskText, analysis, gen, scorer, mergedConfig)
    } else if (strategy === 'graph-of-thought') {
      const resolver = this.createNodeResolver(llmCall)
      result = await graphOfThought.reason(taskText, analysis, resolver, mergedConfig)
    } else {
      throw new Error(`Unknown strategy: ${strategy}`)
    }

    // Optional self-reflection
    if (mergedConfig.enableReflection && selfCritique.shouldReflect(result)) {
      const reflection = await selfCritique.critique(result, llmCall)
      if (reflection.revisedConclusion) {
        result = {
          ...result,
          conclusion: reflection.revisedConclusion,
          confidence: Math.min(0.95, result.confidence + reflection.confidenceAdjustment),
        }
      }
    }

    return result
  }
}

export const reasoningEngine = new ReasoningEngine()
