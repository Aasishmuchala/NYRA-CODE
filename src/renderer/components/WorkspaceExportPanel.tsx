/**
 * Workspace Export Panel — Export/import workspace state
 */
import React, { useState, useEffect } from 'react'
import { Download, Upload, Archive, Clock } from 'lucide-react'

interface ExportHistoryEntry { id: string; filePath: string; tables: string[]; sizeBytes: number; timestamp: number }

const fmt = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`

const WorkspaceExportPanel: React.FC = () => {
  const [history, setHistory] = useState<ExportHistoryEntry[]>([])
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [lastExport, setLastExport] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = async () => { try { const r = await window.nyra.workspaceExport.history(20); if (r.success) setHistory(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) } }
  useEffect(() => { fetchHistory() }, [])

  const handleExport = async () => {
    setExporting(true)
    try { const r = await window.nyra.workspaceExport.export(); if (r.success) { setLastExport(r.result); fetchHistory() } } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
    setExporting(false)
  }

  const handleImport = async () => {
    setImporting(true)
    try { const r = await window.nyra.workspaceExport.import(); if (r.success) setImportResult(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
    setImporting(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Archive size={16} className="text-gold-300" />
        <h2 className="text-sm font-semibold text-white/80">Workspace Export</h2>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      <div className="px-4 py-4 space-y-3">
        <div className="flex gap-2">
          <button onClick={handleExport} disabled={exporting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gold-400/15 text-gold-300 text-[12px] font-medium hover:bg-gold-400/25 disabled:opacity-40">
            <Download size={14} /> {exporting ? 'Exporting...' : 'Export Workspace'}
          </button>
          <button onClick={handleImport} disabled={importing}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/[0.04] text-white/40 text-[12px] font-medium hover:bg-white/[0.06] disabled:opacity-40">
            <Upload size={14} /> {importing ? 'Importing...' : 'Import'}
          </button>
        </div>

        {lastExport && (
          <div className="bg-sage-400/5 border border-sage-400/15 rounded-xl p-3">
            <p className="text-[11px] text-sage-300/70">Export complete</p>
            <p className="text-[10px] text-white/30 mt-1">{lastExport.manifest?.tables?.length || 0} tables • {fmt(lastExport.sizeBytes || 0)}</p>
          </div>
        )}

        {importResult && (
          <div className={`border rounded-xl p-3 ${importResult.success ? 'bg-sage-400/5 border-sage-400/15' : 'bg-blush-400/5 border-blush-400/15'}`}>
            <p className="text-[11px]" style={{ color: importResult.success ? 'rgb(134,184,138)' : 'rgb(201,123,123)' }}>
              {importResult.success ? `Imported ${importResult.tablesImported?.length || 0} tables` : 'Import failed'}
            </p>
            {importResult.errors?.length > 0 && (
              <p className="text-[9px] text-blush-300/50 mt-1">{importResult.errors[0]}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        <p className="text-[10px] text-white/20 mb-1 flex items-center gap-1"><Clock size={9} /> Export History</p>
        {history.map(h => (
          <div key={h.id} className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2.5">
            <div className="flex items-center gap-2">
              <Archive size={10} className="text-gold-300/40" />
              <span className="text-[11px] text-white/50 font-medium flex-1 truncate">{h.tables.length} tables</span>
              <span className="text-[10px] text-white/20">{fmt(h.sizeBytes)}</span>
            </div>
            <p className="text-[9px] text-white/15 mt-0.5">{new Date(h.timestamp).toLocaleString()}</p>
          </div>
        ))}
        {history.length === 0 && <p className="text-center text-[11px] text-white/15 py-8">No exports yet</p>}
      </div>
    </div>
  )
}
export default WorkspaceExportPanel
