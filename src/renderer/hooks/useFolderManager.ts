import { useState, useEffect, useCallback } from 'react'

export interface ManagedFolder {
  id: string
  path: string
  label: string
  accessLevel: 'read_only' | 'read_draft' | 'read_edit_approve' | 'trusted' | 'full'
  watching: boolean
  fileCount: number
  projectId?: string
}

interface UseFolderManager {
  folders: ManagedFolder[]
  loading: boolean
  attachFolder: () => Promise<void>
  detachFolder: (id: string) => Promise<void>
  updateFolder: (id: string, patch: any) => Promise<void>
  refreshFolders: () => Promise<void>
}

export const useFolderManager = (): UseFolderManager => {
  const [folders, setFolders] = useState<ManagedFolder[]>([])
  const [loading, setLoading] = useState(false)

  const refreshFolders = useCallback(async () => {
    try {
      setLoading(true)
      const data = await window.nyra.folders.list()
      setFolders((data || []) as unknown as ManagedFolder[])
    } catch (error) {
      console.error('Failed to refresh folders:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const attachFolder = useCallback(async () => {
    try {
      // Use the file dialog to pick a directory
      const selectedPath = await window.nyra.files.requestDir()
      if (!selectedPath) return

      // Attach via the Cowork folder manager (auto-generates ID, label, etc.)
      await window.nyra.folders.attach({
        path: selectedPath,
        label: selectedPath.split('/').pop() || selectedPath,
        accessLevel: 'read_edit_approve',
      })
      await refreshFolders()
    } catch (error) {
      console.error('Failed to attach folder:', error)
      throw error
    }
  }, [refreshFolders])

  const detachFolder = useCallback(async (id: string) => {
    try {
      await window.nyra.folders.detach(id)
      await refreshFolders()
    } catch (error) {
      console.error('Failed to detach folder:', error)
      throw error
    }
  }, [refreshFolders])

  const updateFolder = useCallback(async (id: string, patch: any) => {
    try {
      await window.nyra.folders.update(id, patch)
      await refreshFolders()
    } catch (error) {
      console.error('Failed to update folder:', error)
      throw error
    }
  }, [refreshFolders])

  // Load folders on mount
  useEffect(() => { refreshFolders() }, [refreshFolders])

  // Subscribe to file change events
  useEffect(() => {
    const unsub = window.nyra.folders.onFileChanged(() => {
      refreshFolders()
    })
    return unsub as (() => void) | undefined
  }, [refreshFolders])

  return { folders, loading, attachFolder, detachFolder, updateFolder, refreshFolders }
}
