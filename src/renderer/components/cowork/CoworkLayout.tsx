/**
 * CoworkLayout — Redesigned as a Claude Cowork-style collapsible section sidebar.
 *
 * Instead of 14 horizontal tabs, the Cowork panel is now a single scrollable
 * column with collapsible sections. Each section uses real hooks/IPC for live data.
 * Tool panels (Models, Composer, Preview, etc.) are accessible via a compact toolbar.
 */
import React, { useState, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ListTodo,
  FolderOpen,
  Brain,
  Bot,
  Map,
  Database,
  Layers,
  Zap,
  BookOpen,
  Globe,
  BookTemplate,
  FileCode,
  Shield,
  Cpu,
} from 'lucide-react'

// ── Section panels (inline compact versions) ───────────────────────────────
import ProgressSection from './sections/ProgressSection'
import FoldersSection from './sections/FoldersSection'
import ContextSection from './sections/ContextSection'
import PlanSection from './sections/PlanSection'
import AgentsSection from './sections/AgentsSection'
import MemorySection from './sections/MemorySection'

// ── Full tool panels (for expanded view) ────────────────────────────────────
import AutomationsPanel from './AutomationsPanel'
import KnowledgePanel from './KnowledgePanel'
import BrowserPreviewTab from './BrowserPreviewTab'
import RecipesPanel from './RecipesPanel'
import ArtifactsTab from './ArtifactsTab'
import AuditLog from './AuditLog'
import ModelHubTab from './ModelHubTab'
import ComposerPanel from './ComposerPanel'

// ── Types ───────────────────────────────────────────────────────────────────

type ToolId = 'models' | 'composer' | 'automations' | 'knowledge' | 'preview' | 'recipes' | 'artifacts' | 'audit'

interface CoworkLayoutProps {
  badges?: Record<string, number>
}

// ── Collapsible Section Wrapper ─────────────────────────────────────────────

const Section: React.FC<{
  id: string
  label: string
  icon: React.ComponentType<any>
  badge?: string | number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}> = ({ label, icon: Icon, badge, expanded, onToggle, children }) => (
  <div className="border-b border-white/[0.06] last:border-b-0">
    <button
      onClick={onToggle}
      aria-expanded={expanded}
      className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer group"
    >
      <Icon size={15} className="text-white/50 group-hover:text-white/70 transition-colors flex-shrink-0" />
      <span className="text-[11px] font-medium text-white/80 flex-1 text-left">{label}</span>
      {badge !== undefined && badge !== '' && (
        <span className="text-[10px] text-white/40 font-medium tabular-nums">{badge}</span>
      )}
      {expanded ? (
        <ChevronDown size={13} className="text-white/45 flex-shrink-0" />
      ) : (
        <ChevronRight size={13} className="text-white/45 flex-shrink-0" />
      )}
    </button>
    {expanded && (
      <div className="px-4 pb-3">
        {children}
      </div>
    )}
  </div>
)

// ── Tool Toolbar Button ─────────────────────────────────────────────────────

const ToolButton: React.FC<{
  label: string
  icon: React.ComponentType<any>
  active: boolean
  onClick: () => void
}> = ({ label, icon: Icon, active, onClick }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium
      transition-all duration-150 cursor-pointer whitespace-nowrap
      ${active
        ? 'bg-terra-300/15 text-terra-300 border border-terra-300/25'
        : 'text-white/45 hover:text-white/65 hover:bg-white/[0.04] border border-transparent'
      }
    `}
    title={label}
  >
    <Icon size={13} />
    <span>{label}</span>
  </button>
)

// ── Main Layout ─────────────────────────────────────────────────────────────

const CoworkLayout: React.FC<CoworkLayoutProps> = ({ badges = {} }) => {
  // Section expand/collapse state — Progress and Folders open by default
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    progress: true,
    folders: true,
    context: false,
    plan: false,
    agents: false,
    memory: false,
  })

  // Active tool panel (null = sidebar-only mode)
  const [activeTool, setActiveTool] = useState<ToolId | null>(null)

  const toggleSection = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const toggleTool = useCallback((id: ToolId) => {
    setActiveTool(prev => prev === id ? null : id)
  }, [])

  // Tool panel definitions
  const tools: { id: ToolId; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'models', label: 'Models', icon: Cpu },
    { id: 'composer', label: 'Compose', icon: Layers },
    { id: 'automations', label: 'Flows', icon: Zap },
    { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
    { id: 'preview', label: 'Preview', icon: Globe },
    { id: 'recipes', label: 'Recipes', icon: BookTemplate },
    { id: 'artifacts', label: 'Artifacts', icon: FileCode },
    { id: 'audit', label: 'Audit', icon: Shield },
  ]

  const renderToolPanel = () => {
    switch (activeTool) {
      case 'models':      return <ModelHubTab />
      case 'composer':    return <ComposerPanel />
      case 'automations': return <AutomationsPanel />
      case 'knowledge':   return <KnowledgePanel />
      case 'preview':     return <BrowserPreviewTab />
      case 'recipes':     return <RecipesPanel />
      case 'artifacts':   return <ArtifactsTab />
      case 'audit':       return <AuditLog />
      default:            return null
    }
  }

  return (
    <div className="flex flex-col h-full bg-black/10">
      {/* ── Tool Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.06] bg-black/20 overflow-x-auto scrollbar-thin">
        {tools.map(tool => (
          <ToolButton
            key={tool.id}
            label={tool.label}
            icon={tool.icon}
            active={activeTool === tool.id}
            onClick={() => toggleTool(tool.id)}
          />
        ))}
      </div>

      {/* ── Content Area ─────────────────────────────────────────────── */}
      {activeTool ? (
        // Full tool panel view
        <div className="flex-1 overflow-hidden">
          {renderToolPanel()}
        </div>
      ) : (
        // Default: Collapsible sections sidebar
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <Section
            id="progress"
            label="Progress"
            icon={ListTodo}
            badge={badges.progress}
            expanded={expanded.progress}
            onToggle={() => toggleSection('progress')}
          >
            <ProgressSection />
          </Section>

          <Section
            id="plan"
            label="Plan"
            icon={Map}
            badge={badges.plan}
            expanded={expanded.plan}
            onToggle={() => toggleSection('plan')}
          >
            <PlanSection />
          </Section>

          <Section
            id="folders"
            label="Working Folders"
            icon={FolderOpen}
            badge={badges.folders}
            expanded={expanded.folders}
            onToggle={() => toggleSection('folders')}
          >
            <FoldersSection />
          </Section>

          <Section
            id="context"
            label="Context"
            icon={Brain}
            badge={badges.context}
            expanded={expanded.context}
            onToggle={() => toggleSection('context')}
          >
            <ContextSection />
          </Section>

          <Section
            id="agents"
            label="Agents"
            icon={Bot}
            badge={badges.agents}
            expanded={expanded.agents}
            onToggle={() => toggleSection('agents')}
          >
            <AgentsSection />
          </Section>

          <Section
            id="memory"
            label="Memory"
            icon={Database}
            badge={badges.memory}
            expanded={expanded.memory}
            onToggle={() => toggleSection('memory')}
          >
            <MemorySection />
          </Section>
        </div>
      )}
    </div>
  )
}

export default CoworkLayout
