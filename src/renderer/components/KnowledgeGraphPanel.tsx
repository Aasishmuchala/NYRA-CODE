/**
 * KnowledgeGraphPanel — Interactive force-directed graph of memory relationships
 *
 * Visualizes the 5-tier memory system as an interactive node graph:
 *   - Nodes: individual memories, colored by tier
 *   - Edges: associations between memories (shared tags, explicit links)
 *   - Size: reflects importance score
 *   - Physics: force-directed layout with spring + repulsion forces
 *
 * Built on raw Canvas2D for zero-dependency, 60fps rendering.
 * Supports pan, zoom, click-to-inspect, and tier filtering.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────

interface GraphNode {
  id: string
  label: string
  tier: string
  importance: number
  tags: string[]
  associations: string[]
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

interface GraphEdge {
  source: string
  target: string
  type: 'association' | 'tag'
  strength: number
}

// ── Tier colors ────────────────────────────────────────────────

const TIER_COLORS: Record<string, { fill: string; stroke: string; label: string; hex: string }> = {
  working:    { fill: 'rgba(249, 115, 22, 0.6)',  stroke: 'rgba(249, 115, 22, 0.8)',  label: 'Working',    hex: '#f97316' },
  episodic:   { fill: 'rgba(59, 130, 246, 0.6)',   stroke: 'rgba(59, 130, 246, 0.8)',   label: 'Episodic',   hex: '#3b82f6' },
  semantic:   { fill: 'rgba(168, 85, 247, 0.6)',   stroke: 'rgba(168, 85, 247, 0.8)',   label: 'Semantic',   hex: '#a855f7' },
  procedural: { fill: 'rgba(34, 197, 94, 0.6)',    stroke: 'rgba(34, 197, 94, 0.8)',    label: 'Procedural', hex: '#22c55e' },
  archival:   { fill: 'rgba(107, 114, 128, 0.5)',  stroke: 'rgba(107, 114, 128, 0.7)',  label: 'Archival',   hex: '#6b7280' },
}

// ── Force simulation ───────────────────────────────────────────

const REPULSION = 800
const SPRING_K = 0.005
const SPRING_LENGTH = 100
const DAMPING = 0.92
const CENTER_GRAVITY = 0.001

function simulate(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number): void {
  const cx = width / 2
  const cy = height / 2

  // Repulsion between all nodes (Barnes-Hut simplified)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = REPULSION / (dist * dist)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx -= fx
      a.vy -= fy
      b.vx += fx
      b.vy += fy
    }
  }

  // Spring forces along edges
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  for (const edge of edges) {
    const a = nodeMap.get(edge.source)
    const b = nodeMap.get(edge.target)
    if (!a || !b) continue

    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const displacement = dist - SPRING_LENGTH
    const force = SPRING_K * displacement * edge.strength
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    a.vx += fx
    a.vy += fy
    b.vx -= fx
    b.vy -= fy
  }

  // Center gravity
  for (const node of nodes) {
    node.vx += (cx - node.x) * CENTER_GRAVITY
    node.vy += (cy - node.y) * CENTER_GRAVITY
  }

  // Apply velocity + damping
  for (const node of nodes) {
    node.vx *= DAMPING
    node.vy *= DAMPING
    node.x += node.vx
    node.y += node.vy

    // Keep in bounds
    const margin = 30
    node.x = Math.max(margin, Math.min(width - margin, node.x))
    node.y = Math.max(margin, Math.min(height - margin, node.y))
  }
}

// ── Canvas renderer ────────────────────────────────────────────

function drawGraph(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  hoveredNode: GraphNode | null,
  selectedNode: GraphNode | null,
  pan: { x: number; y: number },
  zoom: number
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.translate(pan.x, pan.y)
  ctx.scale(zoom, zoom)

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Draw edges
  for (const edge of edges) {
    const a = nodeMap.get(edge.source)
    const b = nodeMap.get(edge.target)
    if (!a || !b) continue

    const isHighlighted = hoveredNode && (a.id === hoveredNode.id || b.id === hoveredNode.id)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = isHighlighted ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)'
    ctx.lineWidth = isHighlighted ? 1.5 : 0.5
    ctx.stroke()
  }

  // Draw nodes
  for (const node of nodes) {
    const tier = TIER_COLORS[node.tier] || TIER_COLORS.archival
    const isHovered = hoveredNode?.id === node.id
    const isSelected = selectedNode?.id === node.id

    // Glow for hovered/selected
    if (isHovered || isSelected) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2)
      ctx.fillStyle = tier.fill.replace('0.6', '0.2')
      ctx.fill()
    }

    // Node circle
    ctx.beginPath()
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
    ctx.fillStyle = tier.fill
    ctx.fill()
    ctx.strokeStyle = isSelected ? '#fff' : tier.stroke
    ctx.lineWidth = isSelected ? 2 : 1
    ctx.stroke()

    // Label (only if zoomed enough or hovered)
    if (zoom > 0.7 || isHovered) {
      const label = node.label.length > 30 ? node.label.slice(0, 30) + '...' : node.label
      ctx.font = `${isHovered ? 11 : 9}px Inter, system-ui, sans-serif`
      ctx.fillStyle = isHovered ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)'
      ctx.textAlign = 'center'
      ctx.fillText(label, node.x, node.y + node.radius + 12)
    }
  }

  ctx.restore()
}

// ── Hit test ───────────────────────────────────────────────────

function hitTest(
  x: number, y: number,
  nodes: GraphNode[],
  pan: { x: number; y: number },
  zoom: number
): GraphNode | null {
  // Transform screen coords to graph coords
  const gx = (x - pan.x) / zoom
  const gy = (y - pan.y) / zoom

  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]
    const dx = gx - n.x
    const dy = gy - n.y
    if (dx * dx + dy * dy < (n.radius + 4) * (n.radius + 4)) {
      return n
    }
  }
  return null
}

// ── Inspector panel ────────────────────────────────────────────

const NodeInspector: React.FC<{ node: GraphNode; onClose: () => void }> = ({ node, onClose }) => {
  const tier = TIER_COLORS[node.tier] || TIER_COLORS.archival

  return (
    <div className="absolute bottom-3 left-3 right-3 bg-nyra-surface/95 backdrop-blur-sm border border-white/[0.06] rounded-xl p-3 shadow-2xl">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tier.hex }} />
          <span className="text-[11px] font-medium text-white/70">{tier.label}</span>
        </div>
        <button onClick={onClose} className="text-white/20 hover:text-white/50 text-[10px]">✕</button>
      </div>

      <p className="text-[12px] text-white/60 leading-relaxed mb-2 line-clamp-3">
        {node.label}
      </p>

      <div className="flex items-center gap-3 text-[10px] text-white/25">
        <span>Importance: <span className="text-white/50 font-mono">{(node.importance * 100).toFixed(0)}%</span></span>
        <span>Connections: <span className="text-white/50 font-mono">{node.associations.length}</span></span>
      </div>

      {node.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {node.tags.map(t => (
            <span key={t} className="text-[9px] bg-white/[0.04] text-white/30 px-1.5 py-0.5 rounded border border-white/[0.04]">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────

const KnowledgeGraphPanel: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)

  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set(['working', 'episodic', 'semantic', 'procedural', 'archival']))
  const [loading, setLoading] = useState(true)

  const panRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const draggingRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })

  // Stable refs for animation loop
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const hoveredRef = useRef<GraphNode | null>(null)
  const selectedRef = useRef<GraphNode | null>(null)

  nodesRef.current = nodes
  edgesRef.current = edges
  hoveredRef.current = hoveredNode
  selectedRef.current = selectedNode

  // Load memory data
  const loadMemories = useCallback(async () => {
    setLoading(true)
    const graphNodes: GraphNode[] = []
    const graphEdges: GraphEdge[] = []
    const width = containerRef.current?.clientWidth ?? 600
    const height = containerRef.current?.clientHeight ?? 400

    try {
      // Load from each tier
      for (const tier of ['working', 'episodic', 'semantic', 'procedural', 'archival']) {
        try {
          const result = await window.nyra.tieredMemory.tierList(tier, 0, 50)
          if (!result.success || !result.result) continue

          for (const entry of result.result) {
            graphNodes.push({
              id: entry.id,
              label: entry.content?.slice(0, 100) || entry.id,
              tier,
              importance: entry.importance ?? 0.5,
              tags: entry.metadata?.tags || [],
              associations: entry.metadata?.associations || [],
              x: width / 2 + (Math.random() - 0.5) * width * 0.6,
              y: height / 2 + (Math.random() - 0.5) * height * 0.6,
              vx: 0,
              vy: 0,
              radius: 4 + (entry.importance ?? 0.5) * 8,
            })
          }
        } catch {
          // Tier may not be available
        }
      }

      // Build edges from associations
      const nodeIds = new Set(graphNodes.map(n => n.id))
      for (const node of graphNodes) {
        for (const assocId of node.associations) {
          if (nodeIds.has(assocId)) {
            graphEdges.push({
              source: node.id,
              target: assocId,
              type: 'association',
              strength: 1.0,
            })
          }
        }
      }

      // Build edges from shared tags
      const tagIndex = new Map<string, string[]>()
      for (const node of graphNodes) {
        for (const tag of node.tags) {
          if (!tagIndex.has(tag)) tagIndex.set(tag, [])
          tagIndex.get(tag)!.push(node.id)
        }
      }
      for (const [, ids] of tagIndex) {
        if (ids.length > 1 && ids.length < 10) {
          for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
              graphEdges.push({
                source: ids[i],
                target: ids[j],
                type: 'tag',
                strength: 0.3,
              })
            }
          }
        }
      }
    } catch {
      // Memory system may not be initialized
    }

    setNodes(graphNodes)
    setEdges(graphEdges)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadMemories()
  }, [loadMemories])

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const loop = () => {
      const w = container.clientWidth
      const h = container.clientHeight

      if (canvas.width !== w * 2 || canvas.height !== h * 2) {
        canvas.width = w * 2
        canvas.height = h * 2
        canvas.style.width = w + 'px'
        canvas.style.height = h + 'px'
        ctx.scale(2, 2) // Retina
      }

      // Filter by active tiers
      const visibleNodes = nodesRef.current.filter(n => activeTiers.has(n.tier))
      const visibleIds = new Set(visibleNodes.map(n => n.id))
      const visibleEdges = edgesRef.current.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))

      simulate(visibleNodes, visibleEdges, w, h)
      drawGraph(ctx, visibleNodes, visibleEdges, w, h, hoveredRef.current, selectedRef.current, panRef.current, zoomRef.current)

      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [activeTiers])

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    if (draggingRef.current) {
      panRef.current.x += e.clientX - lastMouseRef.current.x
      panRef.current.y += e.clientY - lastMouseRef.current.y
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      return
    }

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const hit = hitTest(x, y, nodesRef.current.filter(n => activeTiers.has(n.tier)), panRef.current, zoomRef.current)
    setHoveredNode(hit)
  }, [activeTiers])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true
    lastMouseRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false

    // If barely moved, treat as click
    const dx = e.clientX - lastMouseRef.current.x
    const dy = e.clientY - lastMouseRef.current.y
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) {
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const hit = hitTest(x, y, nodesRef.current.filter(n => activeTiers.has(n.tier)), panRef.current, zoomRef.current)
        setSelectedNode(hit)
      }
    }
  }, [activeTiers])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    zoomRef.current = Math.max(0.2, Math.min(3, zoomRef.current * delta))
  }, [])

  const toggleTier = (tier: string) => {
    setActiveTiers(prev => {
      const next = new Set(prev)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })
  }

  // Stats
  const visibleNodes = nodes.filter(n => activeTiers.has(n.tier))
  const visibleEdges = edges.filter(e => {
    const ids = new Set(visibleNodes.map(n => n.id))
    return ids.has(e.source) && ids.has(e.target)
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        <span className="text-[14px]">◆</span>
        <span className="text-[12px] font-medium text-white/60">Knowledge Graph</span>

        <div className="flex-1" />

        <button
          onClick={loadMemories}
          className="text-[10px] px-2 py-1 rounded-md border border-white/[0.06] text-white/30 hover:text-terra-300 hover:border-terra-400/20 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Tier filter bar */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.04]">
        {Object.entries(TIER_COLORS).map(([tier, cfg]) => (
          <button
            key={tier}
            onClick={() => toggleTier(tier)}
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              activeTiers.has(tier)
                ? 'border-white/[0.08] text-white/60'
                : 'border-transparent text-white/15'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{
              backgroundColor: activeTiers.has(tier) ? cfg.hex : 'rgba(255,255,255,0.1)'
            }} />
            {cfg.label}
          </button>
        ))}

        <div className="flex-1" />

        <span className="text-[9px] text-white/15 font-mono">
          {visibleNodes.length}n / {visibleEdges.length}e
        </span>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-nyra-bg/50 cursor-grab active:cursor-grabbing">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/20 text-[12px] animate-pulse">Loading memories...</div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/15">
            <span className="text-3xl">◆</span>
            <p className="text-[13px]">No memories to visualize</p>
            <p className="text-[11px] text-white/10">Memories appear as nodes when created</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            className="w-full h-full"
          />
        )}

        {/* Node inspector */}
        {selectedNode && (
          <NodeInspector node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-t border-white/[0.04] text-[9px] text-white/15">
        <span>Scroll to zoom • Drag to pan • Click node to inspect</span>
        <div className="flex-1" />
        <span className="font-mono">zoom: {(zoomRef.current * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
}

export default KnowledgeGraphPanel
