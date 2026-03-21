/**
 * Backup Manager Panel — Create, restore, and manage database backups
 */
import React, { useState, useEffect } from 'react'
import { HardDrive, Plus, RotateCcw, Trash2, Shield } from 'lucide-react'

interface BackupEntry { id: string; fileName: string; sizeBytes: number; type: string; label?: string; createdAt: number }
const fmt = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`

const BackupManagerPanel: React.FC = () => {
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [stats, setStats] = useState<any>(null)
  const [creating, setCreating] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fetch_ = async () => {
    try { const r = await window.nyra.backupMgr.list(30); if (r.success) setBackups(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
    try { const r = await window.nyra.backupMgr.stats(); if (r.success) setStats(r.result) } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }
  useEffect(() => { fetch_() }, [])

  const handleCreate = async () => {
    setCreating(true)
    try { await window.nyra.backupMgr.create('manual'); fetch_() } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
    setCreating(false)
  }

  const handleRestore = async (id: string) => {
    setRestoreMsg('')
    try {
      const r = await window.nyra.backupMgr.restore(id)
      setRestoreMsg(r.success ? (r.result?.success ? 'Restored! Restart app to apply.' : r.result?.error || 'Failed') : 'Failed')
    } catch (err: any) { setError(String(err?.message || 'Operation failed')) }
  }

  const handleDelete = async (id: string) => { try { await window.nyra.backupMgr.delete(id); fetch_() } catch (err: any) { setError(String(err?.message || 'Operation failed')) } }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <HardDrive size={16} className="text-terra-300" />
        <h2 className="text-sm font-semibold text-white/80">Backups</h2>
        {stats && <span className="text-[9px] text-white/20 ml-1">{stats.totalBackups} backups • {fmt(stats.totalSize)}</span>}
        <button onClick={handleCreate} disabled={creating}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg bg-terra-400/15 text-terra-300 text-[10px] font-medium hover:bg-terra-400/25 disabled:opacity-40">
          <Plus size={10} /> {creating ? 'Creating...' : 'Backup Now'}
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blush-400/10 border border-blush-400/20 flex items-center justify-between">
          <p className="text-[10px] text-blush-300/70">{error}</p>
          <button onClick={() => setError(null)} className="text-[10px] text-blush-300/40 hover:text-blush-300/70 ml-2">dismiss</button>
        </div>
      )}

      {restoreMsg && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-gold-400/10 border border-gold-400/20">
          <p className="text-[11px] text-gold-300/70">{restoreMsg}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {backups.map(b => (
          <div key={b.id} className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 hover:border-white/[0.08] group">
            <div className="flex items-center gap-2">
              <Shield size={10} className={b.type === 'manual' ? 'text-terra-300/50' : b.type === 'pre-import' ? 'text-gold-300/50' : 'text-white/20'} />
              <h4 className="text-[11px] text-white/60 font-medium flex-1 truncate">{b.fileName}</h4>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/20">{b.type}</span>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-[9px] text-white/20">{fmt(b.sizeBytes)}</span>
              <span className="text-[9px] text-white/15">{new Date(b.createdAt).toLocaleString()}</span>
              {b.label && <span className="text-[8px] text-white/15 italic">{b.label}</span>}
              <div className="flex gap-1 ml-auto opacity-0 group-hover:opacity-100">
                <button onClick={() => handleRestore(b.id)} className="px-2 py-0.5 rounded text-[9px] text-gold-300/50 hover:bg-gold-400/10"><RotateCcw size={9} className="inline mr-0.5" /> Restore</button>
                <button onClick={() => handleDelete(b.id)} className="p-1 text-blush-400/20 hover:text-blush-400/60"><Trash2 size={10} /></button>
              </div>
            </div>
          </div>
        ))}
        {backups.length === 0 && <p className="text-center text-[11px] text-white/15 py-8">No backups yet</p>}
      </div>
    </div>
  )
}
export default BackupManagerPanel
