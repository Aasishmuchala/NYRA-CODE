/**
 * FoldersSection — Compact folder tree for sidebar.
 * Shows attached folders with file counts and watch status.
 * Uses real useFolderManager hook.
 */
import React from 'react'
import {
  FolderOpen, Eye, EyeOff, Plus, Loader2,
} from 'lucide-react'
import { useFolderManager } from '../../../hooks/useFolderManager'

const ACCESS_LABELS: Record<string, { label: string; color: string }> = {
  read_only:          { label: 'Read',     color: 'text-white/40' },
  read_draft:         { label: 'Draft',    color: 'text-terra-400/70' },
  read_edit_approve:  { label: 'Edit',     color: 'text-gold-400/70' },
  trusted:            { label: 'Trusted',  color: 'text-sage-400/70' },
  full:               { label: 'Full',     color: 'text-sage-400' },
}

const FoldersSection: React.FC = () => {
  const { folders, loading, attachFolder } = useFolderManager()

  return (
    <div className="space-y-1">
      {loading && folders.length === 0 && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 size={12} className="text-terra-300 animate-spin" />
          <span className="text-[10px] text-white/35">Loading folders...</span>
        </div>
      )}

      {folders.map(folder => {
        const access = ACCESS_LABELS[folder.accessLevel] || ACCESS_LABELS.read_only
        // Extract folder name from path
        const folderName = folder.label || folder.path.split(/[/\\]/).filter(Boolean).pop() || folder.path

        return (
          <div key={folder.id} className="flex items-center gap-2 py-1.5 group">
            <FolderOpen size={14} className="text-terra-300/70 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white/75 truncate leading-tight">{folderName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-white/45">{folder.fileCount} files</span>
                <span className={`text-[9px] ${access.color}`}>{access.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {folder.watching ? (
                <Eye size={11} className="text-sage-400/60" />
              ) : (
                <EyeOff size={11} className="text-white/35" />
              )}
            </div>
          </div>
        )
      })}

      {!loading && folders.length === 0 && (
        <p className="text-[10px] text-white/45 py-2">No folders attached</p>
      )}

      {/* Attach folder button */}
      <button
        onClick={() => attachFolder()}
        disabled={loading}
        className="w-full mt-1 py-1.5 rounded-md border border-dashed border-white/[0.08] text-[10px] text-white/50 hover:text-white/65 hover:border-white/[0.15] hover:bg-white/[0.02] transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1"
      >
        <Plus size={10} />
        Attach folder
      </button>
    </div>
  )
}

export default FoldersSection
