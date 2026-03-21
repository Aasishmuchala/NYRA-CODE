import { useState, useEffect, useCallback } from 'react'

interface ApprovalRequest {
  id: string
  taskId: string
  agentId: string
  action: string
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical'
  description: string
  status: 'pending' | 'approved' | 'denied'
  createdAt: number
}

interface ApprovalStats {
  total: number
  approved: number
  denied: number
  pending: number
}

interface UseApprovals {
  pending: ApprovalRequest[]
  loading: boolean
  approve: (id: string, reason?: string) => Promise<void>
  deny: (id: string, reason?: string) => Promise<void>
  refreshPending: () => Promise<void>
  stats: ApprovalStats | null
}

export function useApprovals(): UseApprovals {
  const [pending, setPending] = useState<ApprovalRequest[]>([])
  const [stats, setStats] = useState<ApprovalStats | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshPending = useCallback(async () => {
    try {
      setLoading(true)
      const [requests, approvalStats] = await Promise.all([
        window.nyra.approvals.listPending(),
        window.nyra.approvals.stats(),
      ])
      setPending((requests || []) as unknown as ApprovalRequest[])
      setStats(approvalStats || null)
    } catch (error) {
      console.error('Failed to refresh pending approvals:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const approve = useCallback(async (id: string, reason?: string) => {
    try {
      await window.nyra.approvals.respond(id, 'approved', reason)
      // Optimistic update
      setPending(prev => prev.map(req =>
        req.id === id ? { ...req, status: 'approved' as const } : req
      ))
      // Refresh stats
      const updatedStats = await window.nyra.approvals.stats()
      setStats(updatedStats)
    } catch (error) {
      console.error('Failed to approve request:', error)
      throw error
    }
  }, [])

  const deny = useCallback(async (id: string, reason?: string) => {
    try {
      await window.nyra.approvals.respond(id, 'denied', reason)
      // Optimistic update
      setPending(prev => prev.map(req =>
        req.id === id ? { ...req, status: 'denied' as const } : req
      ))
      // Refresh stats
      const updatedStats = await window.nyra.approvals.stats()
      setStats(updatedStats)
    } catch (error) {
      console.error('Failed to deny request:', error)
      throw error
    }
  }, [])

  // Load on mount
  useEffect(() => { refreshPending() }, [refreshPending])

  // Refresh every 2 seconds (approvals are time-sensitive)
  useEffect(() => {
    const interval = setInterval(refreshPending, 2000)
    return () => clearInterval(interval)
  }, [refreshPending])

  return { pending, loading, approve, deny, refreshPending, stats }
}
