import { useState, useEffect, useCallback } from 'react'

export interface ContextSource {
  id: string
  type: 'file' | 'folder' | 'clipboard' | 'web' | 'memory'
  name: string
  tokens: number
  priority: 'high' | 'medium' | 'low'
  pinned: boolean
  active: boolean
}

export interface ContextBudget {
  used: number
  limit: number
  percent: number
}

interface UseContextEngine {
  sources: ContextSource[]
  budget: ContextBudget | null
  loading: boolean
  addSource: (input: any) => Promise<void>
  removeSource: (id: string) => Promise<void>
  pinSource: (id: string) => Promise<void>
  unpinSource: (id: string) => Promise<void>
  toggleActive: (id: string) => Promise<void>
  refreshSources: () => Promise<void>
  refreshBudget: (modelId?: string) => Promise<void>
}

export const useContextEngine = (): UseContextEngine => {
  const [sources, setSources] = useState<ContextSource[]>([])
  const [budget, setBudget] = useState<ContextBudget | null>(null)
  const [loading, setLoading] = useState(false)

  const refreshSources = useCallback(async () => {
    try {
      setLoading(true)
      const data = await window.nyra.context.listSources()
      setSources((data || []) as unknown as ContextSource[])
    } catch (error) {
      console.error('Failed to refresh context sources:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshBudget = useCallback(async (modelId?: string) => {
    try {
      const data = await window.nyra.context.getBudget(modelId)
      setBudget(data || null)
    } catch (error) {
      console.error('Failed to refresh context budget:', error)
    }
  }, [])

  const addSource = useCallback(async (input: any) => {
    try {
      await window.nyra.context.addSource(input)
      await refreshSources()
      await refreshBudget()
    } catch (error) {
      console.error('Failed to add context source:', error)
      throw error
    }
  }, [refreshSources, refreshBudget])

  const removeSource = useCallback(async (id: string) => {
    try {
      await window.nyra.context.removeSource(id)
      await refreshSources()
      await refreshBudget()
    } catch (error) {
      console.error('Failed to remove context source:', error)
      throw error
    }
  }, [refreshSources, refreshBudget])

  const pinSource = useCallback(async (id: string) => {
    try {
      await window.nyra.context.pin(id)
      await refreshSources()
    } catch (error) {
      console.error('Failed to pin context source:', error)
      throw error
    }
  }, [refreshSources])

  const unpinSource = useCallback(async (id: string) => {
    try {
      await window.nyra.context.unpin(id)
      await refreshSources()
    } catch (error) {
      console.error('Failed to unpin context source:', error)
      throw error
    }
  }, [refreshSources])

  const toggleActive = useCallback(async (id: string) => {
    try {
      await window.nyra.context.toggleActive(id)
      await refreshSources()
    } catch (error) {
      console.error('Failed to toggle context source:', error)
      throw error
    }
  }, [refreshSources])

  // Load on mount
  useEffect(() => {
    refreshSources()
    refreshBudget()
  }, [refreshSources, refreshBudget])

  // Refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshSources()
      refreshBudget()
    }, 10000)
    return () => clearInterval(interval)
  }, [refreshSources, refreshBudget])

  return {
    sources, budget, loading,
    addSource, removeSource, pinSource, unpinSource, toggleActive,
    refreshSources, refreshBudget,
  }
}
