import type {
  ReasoningStep,
  ReasoningResult,
  ReasoningConfig,
  ReasoningGraph,
  ReasoningNode,
  ReasoningEdge,
  TaskAnalysis,
} from './reasoning-interfaces'
import { DEFAULT_REASONING_CONFIG } from './reasoning-interfaces'
import { randomUUID } from 'crypto'

/**
 * Function signature for node resolution callback
 * Resolves a node by processing its dependencies
 */
export type NodeResolver = (
  node: ReasoningNode,
  resolvedDeps: ReasoningNode[]
) => Promise<string>

/**
 * GraphOfThought: DAG-based reasoning for multi-constraint problems
 * Decomposes task into nodes, handles dependencies, and resolves topologically
 */
class GraphOfThought {
  async reason(
    taskText: string,
    analysis: TaskAnalysis,
    resolveNode: NodeResolver,
    config: ReasoningConfig = DEFAULT_REASONING_CONFIG
  ): Promise<ReasoningResult> {
    const startTime = Date.now()
    const graph = this.decomposeToGraph(taskText)
    let totalTokens = 0

    const sortedNodes = this.topologicalSort(graph)
    const steps: ReasoningStep[] = []

    for (const node of sortedNodes) {
      if (totalTokens >= config.tokenBudget) break

      // Get resolved dependencies
      const resolvedDeps = node.dependencies
        .map((depId) => graph.nodes.get(depId))
        .filter((n): n is ReasoningNode => n !== undefined)

      // Resolve this node
      const resolvedContent = await resolveNode(node, resolvedDeps)
      const tokenCost = Math.ceil(resolvedContent.length / 4)
      totalTokens += tokenCost

      // Mark resolved
      node.resolved = true
      node.value = resolvedContent

      // Record as reasoning step
      const step: ReasoningStep = {
        id: node.id,
        content: resolvedContent,
        role: 'reasoning',
        parentId: steps.length > 0 ? steps[steps.length - 1].id : null,
        children: [],
        score: 0.5,
        tokenCost,
        timestamp: Date.now(),
        metadata: { nodeType: node.type, depth: this.calculateNodeDepth(node, graph) },
      }

      if (steps.length > 0) {
        steps[steps.length - 1].children.push(step.id)
      }
      steps.push(step)
    }

    // Create conclusion step synthesizing all resolved nodes
    const synthesisParts = Array.from(graph.nodes.values())
      .filter((n) => n.resolved && n.value)
      .map((n) => `[${n.type}] ${n.value}`)
      .join('\n\n')

    const conclusionNode: ReasoningNode = {
      id: randomUUID(),
      content: `Synthesize:\n${synthesisParts}\n\nProvide a final conclusion.`,
      type: 'conclusion',
      resolved: false,
      value: null,
      dependencies: Array.from(graph.nodes.keys()),
    }

    const conclusionContent = await resolveNode(
      conclusionNode,
      Array.from(graph.nodes.values()).filter((n) => n.resolved)
    )
    const conclusionTokenCost = Math.ceil(conclusionContent.length / 4)
    totalTokens += conclusionTokenCost

    const conclusionStep: ReasoningStep = {
      id: conclusionNode.id,
      content: conclusionContent,
      role: 'conclusion',
      parentId: steps.length > 0 ? steps[steps.length - 1].id : null,
      children: [],
      score: 0.7,
      tokenCost: conclusionTokenCost,
      timestamp: Date.now(),
      metadata: { nodeType: 'conclusion' },
    }

    if (steps.length > 0) {
      steps[steps.length - 1].children.push(conclusionStep.id)
    }
    steps.push(conclusionStep)

    return {
      strategy: 'graph-of-thought',
      analysis,
      steps,
      conclusion: conclusionContent,
      confidence: Math.min(0.9, 0.4 + steps.length * 0.08),
      totalTokenCost: totalTokens,
      durationMs: Date.now() - startTime,
      graph,
    }
  }

  /**
   * Decomposes task text into a directed acyclic graph of nodes and edges.
   * Heuristic: split by sentences, identify constraints, create dependency edges.
   */
  private decomposeToGraph(taskText: string): ReasoningGraph {
    const nodes = new Map<string, ReasoningNode>()
    const edges: ReasoningEdge[] = []

    const sentences = taskText
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0)

    const constraintKeywords = [
      'must', 'should', 'requires', 'but', 'however',
      'constraint', 'condition', 'if', 'given',
    ]

    const nodeIds: string[] = []

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim()
      const isConstraint = constraintKeywords.some((kw) =>
        sentence.toLowerCase().includes(kw)
      )

      const id = randomUUID()
      const node: ReasoningNode = {
        id,
        content: sentence,
        type: isConstraint ? 'constraint' : 'premise',
        resolved: false,
        value: null,
        dependencies: [],
      }

      nodes.set(id, node)
      nodeIds.push(id)
    }

    // Constraint nodes depend on the premise before them
    for (let i = 1; i < nodeIds.length; i++) {
      const current = nodes.get(nodeIds[i])!
      if (current.type === 'constraint') {
        current.dependencies.push(nodeIds[i - 1])
        edges.push({
          from: nodeIds[i - 1],
          to: nodeIds[i],
          relation: 'requires',
        })
      }
    }

    return { nodes, edges }
  }

  /**
   * Topologically sorts nodes using Kahn's algorithm on the Map-based graph.
   */
  private topologicalSort(graph: ReasoningGraph): ReasoningNode[] {
    const { nodes, edges } = graph

    const inDegree = new Map<string, number>()
    const adjList = new Map<string, string[]>()

    for (const [id] of nodes) {
      inDegree.set(id, 0)
      adjList.set(id, [])
    }

    for (const edge of edges) {
      adjList.get(edge.from)!.push(edge.to)
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
    }

    const queue: string[] = []
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) queue.push(nodeId)
    }

    const sorted: ReasoningNode[] = []
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      const node = nodes.get(nodeId)!
      sorted.push(node)

      for (const neighbor of adjList.get(nodeId) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 0) - 1
        inDegree.set(neighbor, newDeg)
        if (newDeg === 0) queue.push(neighbor)
      }
    }

    return sorted
  }

  /**
   * Calculates the depth of a node in the dependency graph.
   */
  private calculateNodeDepth(node: ReasoningNode, graph: ReasoningGraph): number {
    if (node.dependencies.length === 0) return 0

    return Math.max(
      ...node.dependencies.map((depId) => {
        const depNode = graph.nodes.get(depId)
        return depNode ? this.calculateNodeDepth(depNode, graph) + 1 : 0
      })
    )
  }
}

export const graphOfThought = new GraphOfThought()
