import type { ReasoningResult, ReflectionResult } from '../reasoning-interfaces'

class SelfCritique {
  shouldReflect(result: ReasoningResult): boolean {
    if (result.steps.length <= 2) return false
    if (result.confidence < 0.7) return true
    if (result.totalTokenCost > 4000) return true
    if (result.strategy === 'tree-of-thought' || result.strategy === 'graph-of-thought') return true
    return false
  }

  async critique(
    result: ReasoningResult,
    llmCall: (prompt: string) => Promise<string>
  ): Promise<ReflectionResult> {
    const stepsContext = result.steps
      .map((step, i) => `${i + 1}. [${step.role}] ${step.content}`)
      .join('\n')

    const critiquePrompt = `Critically analyze this reasoning:

Strategy: ${result.strategy}
Steps:
${stepsContext}

Conclusion: ${result.conclusion}
Confidence: ${result.confidence}

Evaluate:
1. Logical errors or flawed assumptions?
2. Missing considerations?
3. Gaps in reasoning?
4. How could it improve?

Provide a structured critique.`

    const critiqueResponse = await llmCall(critiquePrompt)
    const improvements = this.parseImprovements(critiqueResponse)

    let revisedConclusion: string | null = null
    if (improvements.length > 0) {
      const revisionPrompt = `Based on these weaknesses:
${improvements.join('\n')}

Original conclusion: ${result.conclusion}

Provide a revised, improved conclusion.`

      revisedConclusion = await llmCall(revisionPrompt)
    }

    return {
      originalResult: result,
      critique: critiqueResponse,
      improvements,
      revisedConclusion,
      confidenceAdjustment: improvements.length > 0 ? 0.1 : 0.05,
    }
  }

  private parseImprovements(critiqueText: string): string[] {
    const improvements: string[] = []
    const lines = critiqueText.split('\n')
    let current = ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.match(/^#+/) || trimmed.match(/^[0-9]+\./)) {
        if (current) {
          improvements.push(current.trim())
          current = ''
        }
        continue
      }
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        if (current) improvements.push(current.trim())
        current = trimmed.substring(1).trim()
      } else if (current) {
        current += ' ' + trimmed
      }
    }

    if (current) improvements.push(current.trim())
    return improvements.filter((imp) => imp.length > 0).slice(0, 5)
  }
}

export const selfCritique = new SelfCritique()
