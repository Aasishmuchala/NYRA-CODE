import { useState, useEffect, useCallback } from 'react'

export interface AuditEntry {
  id: string
  timestamp: number
  agentId: string
  action: string
  description: string
  filePath?: string
  reversible: boolean
  taskId?: string
}

export interface AuditFilters {
  agentId?: string
  action?: string
  search?: string
  from?: number
  to?: number
}

interface UseAuditLog {
  entries: AuditEntry[]
  loading: boolean
  totalCount: number
  refreshEntries: (filters?: AuditFilters) => Promise<void>
  exportAudit: (format: 'json' | 'csv') => Promise<string>
}

export function useAuditLog(): UseAuditLog {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const refreshEntries = useCallback(async (filters?: AuditFilters) => {
    try {
      setLoading(true)

      // Fetch recent entries (up to 100) and total count in parallel
      const [recentEntries, count] = await Promise.all([
        filters
          ? window.nyra.audit.query({ limit: 100, ...filters })
          : window.nyra.audit.recent(100),
        window.nyra.audit.count(filters),
      ])

      setEntries((recentEntries || []) as unknown as AuditEntry[])
      setTotalCount(count || 0)
    } catch (error) {
      console.error('Failed to refresh audit entries:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const exportAudit = useCallback(async (format: 'json' | 'csv'): Promise<string> => {
    try {
      return await window.nyra.audit.exportAudit(format)
    } catch (error) {
      console.error('Failed to export audit log:', error)
      throw error
    }
  }, [])

  // Load recent entries on mount and poll every 5s
  useEffect(() => {
    refreshEntries()
    const interval = setInterval(() => refreshEntries(), 5000)
    return () => clearInterval(interval)
  }, [refreshEntries])

  return { entries, loading, totalCount, refreshEntries, exportAudit }
}
