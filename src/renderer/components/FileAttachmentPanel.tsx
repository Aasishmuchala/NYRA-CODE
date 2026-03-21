/**
 * File Attachment Panel — Upload, preview, and manage file attachments
 */
import React, { useEffect, useState, useRef } from 'react'
import { Paperclip, Upload, Trash2, Image, FileText, Code, Database, File, Eye, X } from 'lucide-react'

interface FileAttachmentEntry {
  id: string; originalName: string; mimeType: string; size: number; category: string
  storagePath: string; preview?: string; chatId?: string; messageId?: string
  createdAt: number
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  image: <Image size={12} className="text-gold-300/60" />,
  document: <FileText size={12} className="text-terra-300/60" />,
  code: <Code size={12} className="text-gold-300/60" />,
  data: <Database size={12} className="text-sage-300/60" />,
  other: <File size={12} className="text-white/30" />,
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FileAttachmentPanel: React.FC = () => {
  const [files, setFiles] = useState<FileAttachmentEntry[]>([])
  const [stats, setStats] = useState<any>(null)
  const [previewFile, setPreviewFile] = useState<FileAttachmentEntry | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchFiles = async () => {
    try {
      const r = await window.nyra.fileAttachment.list(50)
      if (r.success) setFiles(r.result)
    } catch {}
  }

  const fetchStats = async () => {
    try {
      const r = await window.nyra.fileAttachment.getStats()
      if (r.success) setStats(r.result)
    } catch {}
  }

  useEffect(() => { fetchFiles(); fetchStats() }, [])

  const handleUpload = async (filePath: string) => {
    try {
      await window.nyra.fileAttachment.uploadFromPath(filePath)
      fetchFiles(); fetchStats()
    } catch {}
  }

  const handleDelete = async (id: string) => {
    try {
      await window.nyra.fileAttachment.delete(id)
      if (previewFile?.id === id) setPreviewFile(null)
      fetchFiles(); fetchStats()
    } catch {}
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    for (const f of droppedFiles) {
      if ((f as any).path) handleUpload((f as any).path)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Paperclip size={16} className="text-gold-300" />
        <h2 className="text-sm font-semibold text-white/80">File Attachments</h2>
        {stats && (
          <span className="text-[9px] text-white/20 ml-1">{stats.totalFiles} files • {formatSize(stats.totalSize)}</span>
        )}
        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-400/15 text-gold-300 text-[10px] font-medium hover:bg-gold-400/25 transition-colors ml-auto">
          <Upload size={10} /> Upload
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden"
          onChange={e => { const files = e.target.files; if (files) Array.from(files).forEach(f => { if ((f as any).path) handleUpload((f as any).path) }) }} />
      </div>

      {/* Drop zone */}
      <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        className={`mx-4 mt-3 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
          isDragging ? 'border-gold-400/40 bg-gold-400/5' : 'border-white/[0.06] bg-white/[0.01]'
        }`}>
        <Upload size={16} className={`mx-auto mb-1.5 ${isDragging ? 'text-gold-300/60' : 'text-white/15'}`} />
        <p className="text-[11px] text-white/25">{isDragging ? 'Drop files here' : 'Drag & drop files or click Upload'}</p>
      </div>

      {/* Category stats */}
      {stats?.byCategory && Object.keys(stats.byCategory).length > 0 && (
        <div className="flex gap-2 px-4 py-2.5">
          {Object.entries(stats.byCategory).map(([cat, count]) => (
            <span key={cat} className="flex items-center gap-1 text-[9px] text-white/20">
              {CATEGORY_ICONS[cat] || CATEGORY_ICONS.other} {cat}: {count as number}
            </span>
          ))}
        </div>
      )}

      {/* Preview overlay */}
      {previewFile && (
        <div className="mx-4 mb-2 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[12px] font-medium text-white/60 truncate">{previewFile.originalName}</h3>
            <button onClick={() => setPreviewFile(null)} className="text-white/20 hover:text-white/40"><X size={14} /></button>
          </div>
          {previewFile.category === 'image' && previewFile.preview && (
            <img src={`data:${previewFile.mimeType};base64,${previewFile.preview}`}
              alt={previewFile.originalName} className="max-h-40 rounded-lg mx-auto" />
          )}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-white/25">
            <span>{previewFile.mimeType}</span>
            <span>{formatSize(previewFile.size)}</span>
            <span>{new Date(previewFile.createdAt).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {files.map(f => (
          <div key={f.id} className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5 hover:border-white/[0.08] transition-colors group">
            {CATEGORY_ICONS[f.category] || CATEGORY_ICONS.other}
            <div className="flex-1 min-w-0">
              <h4 className="text-[11px] text-white/60 font-medium truncate">{f.originalName}</h4>
              <p className="text-[9px] text-white/20">{formatSize(f.size)} • {f.mimeType}</p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {f.category === 'image' && (
                <button onClick={() => setPreviewFile(f)} className="p-1 rounded text-white/20 hover:text-white/50"><Eye size={11} /></button>
              )}
              <button onClick={() => handleDelete(f.id)} className="p-1 rounded text-blush-400/20 hover:text-blush-400/60"><Trash2 size={11} /></button>
            </div>
          </div>
        ))}
        {files.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-white/15 text-[11px]">
            <Paperclip size={20} className="mb-2 opacity-30" />No files attached
          </div>
        )}
      </div>
    </div>
  )
}

export default FileAttachmentPanel
