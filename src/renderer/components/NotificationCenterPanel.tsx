/**
 * NotificationCenterPanel — In-app notification hub with filtering and actions
 *
 * Features:
 * - Category filter tabs (All, Agent, System, Error, Security, Memory, Provider, Task)
 * - Unread/read state with visual indicators
 * - Severity color-coded indicators
 * - Relative timestamps (just now, 2m ago, etc.)
 * - Search filtering
 * - Bulk actions (mark all read, dismiss all)
 * - Sound toggle
 * - Expandable notification details with action buttons
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Bell, BellOff, Check, CheckCheck, Trash2, Search, X,
  Info, AlertCircle, AlertTriangle, CheckCircle,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id: string
  category: 'agent' | 'system' | 'error' | 'security' | 'memory' | 'provider' | 'task'
  severity: 'info' | 'warning' | 'error' | 'success'
  title: string
  body?: string
  source?: string
  sourceId?: string
  actionType?: string
  actionPayload?: string
  read: boolean
  dismissed: boolean
  createdAt: number
  readAt?: number
}

type Category = 'all' | Notification['category']

// ── Utilities ────────────────────────────────────────────────────────────────

const getRelativeTime = (timestamp: number): string => {
  const now = Date.now()
  const elapsed = now - timestamp

  const seconds = Math.floor(elapsed / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`

  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const getCategoryColor = (category: Notification['category']): string => {
  switch (category) {
    case 'agent': return 'terra'
    case 'system': return 'gold'
    case 'error': return 'blush'
    case 'security': return 'blush'
    case 'memory': return 'sage'
    case 'provider': return 'gold'
    case 'task': return 'terra'
    default: return 'warm'
  }
}

const getSeverityIcon = (severity: Notification['severity']) => {
  switch (severity) {
    case 'info': return <Info size={14} className="text-terra-300" />
    case 'warning': return <AlertTriangle size={14} className="text-gold-300" />
    case 'error': return <AlertCircle size={14} className="text-blush-300" />
    case 'success': return <CheckCircle size={14} className="text-sage-300" />
  }
}

// ── Header ───────────────────────────────────────────────────────────────────

interface HeaderProps {
  unreadCount: number
  soundEnabled: boolean
  onSoundToggle: () => void
  onMarkAllRead: () => void
  onDismissAll: () => void
  onClose: () => void
}

const Header: React.FC<HeaderProps> = ({
  unreadCount, soundEnabled, onSoundToggle, onMarkAllRead, onDismissAll, onClose,
}) => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-nyra-border">
    <div className="flex items-center gap-3">
      <Bell size={18} className="text-warm-400" />
      <h2 className="text-sm font-semibold text-warm-100">Notifications</h2>
      {unreadCount > 0 && (
        <span className="px-2 py-0.5 text-xs font-mono bg-terra-500/20 text-terra-300 rounded">
          {unreadCount}
        </span>
      )}
    </div>

    <div className="flex items-center gap-1">
      {unreadCount > 0 && (
        <button
          onClick={onMarkAllRead}
          className="p-1.5 hover:bg-white/[0.05] rounded-md text-warm-400 hover:text-warm-200 transition-colors text-xs"
          title="Mark all as read"
        >
          <CheckCheck size={16} />
        </button>
      )}

      <button
        onClick={onDismissAll}
        className="p-1.5 hover:bg-white/[0.05] rounded-md text-warm-400 hover:text-warm-200 transition-colors text-xs"
        title="Dismiss all"
      >
        <Trash2 size={16} />
      </button>

      <button
        onClick={onSoundToggle}
        className="p-1.5 hover:bg-white/[0.05] rounded-md text-warm-400 hover:text-warm-200 transition-colors text-xs"
        title={soundEnabled ? 'Disable sound' : 'Enable sound'}
      >
        {soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
      </button>

      <button
        onClick={onClose}
        className="p-1.5 hover:bg-white/[0.05] rounded-md text-warm-400 hover:text-warm-200 transition-colors text-xs"
        title="Close"
      >
        <X size={16} />
      </button>
    </div>
  </div>
)

// ── Category Tabs ────────────────────────────────────────────────────────────

interface TabsProps {
  selected: Category
  onChange: (category: Category) => void
  unreadCounts: Record<string, number>
}

const Tabs: React.FC<TabsProps> = ({ selected, onChange, unreadCounts }) => {
  const categories: Array<{ id: Category; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'agent', label: 'Agent' },
    { id: 'system', label: 'System' },
    { id: 'error', label: 'Error' },
    { id: 'security', label: 'Security' },
    { id: 'memory', label: 'Memory' },
    { id: 'provider', label: 'Provider' },
    { id: 'task', label: 'Task' },
  ]

  return (
    <div className="flex gap-1 px-4 py-3 border-b border-nyra-border overflow-x-auto">
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onChange(cat.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all flex items-center gap-1.5 ${
            selected === cat.id
              ? 'bg-warm-500/20 text-warm-100 border border-warm-500/30'
              : 'text-warm-400 hover:bg-white/[0.03] border border-transparent'
          }`}
        >
          {cat.label}
          {cat.id !== 'all' && unreadCounts[cat.id] > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] bg-terra-500/20 text-terra-300 rounded-full">
              {unreadCounts[cat.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Search Bar ───────────────────────────────────────────────────────────────

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

const SearchBar: React.FC<SearchBarProps> = ({ value, onChange }) => (
  <div className="px-4 py-2 border-b border-nyra-border">
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-500" />
      <input
        type="text"
        placeholder="Search notifications..."
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full pl-8 pr-3 py-1.5 bg-nyra-surface border border-nyra-border rounded text-xs text-warm-100 placeholder:text-warm-600 focus:outline-none focus:border-warm-400 focus:ring-1 focus:ring-warm-400/30"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-600 hover:text-warm-400"
        >
          <X size={14} />
        </button>
      )}
    </div>
  </div>
)

// ── Notification Row ─────────────────────────────────────────────────────────

interface NotificationRowProps {
  notification: Notification
  expanded: boolean
  onToggle: () => void
  onMarkRead: () => void
  onDismiss: () => void
}

const NotificationRow: React.FC<NotificationRowProps> = ({
  notification, expanded, onToggle, onMarkRead, onDismiss,
}) => {
  const categoryColor = getCategoryColor(notification.category)
  const accentColor = {
    terra: 'border-l-terra-500',
    gold: 'border-l-gold-500',
    sage: 'border-l-sage-500',
    blush: 'border-l-blush-500',
    warm: 'border-l-warm-500',
  }[categoryColor]

  const unreadAccent = !notification.read ? `bg-${categoryColor}-500/[0.08]` : ''

  return (
    <div className={`border-b border-nyra-border transition-colors hover:bg-white/[0.02] ${unreadAccent}`}>
      <div
        onClick={onToggle}
        className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-l-2 ${accentColor} ${
          !notification.read ? 'font-medium' : ''
        }`}
      >
        {/* Severity icon */}
        <div className="flex-shrink-0 pt-0.5">
          {getSeverityIcon(notification.severity)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h3 className={`text-xs font-medium text-warm-100 truncate ${
                !notification.read ? 'font-semibold' : 'font-normal'
              }`}>
                {notification.title}
              </h3>
              {notification.body && (
                <p className="text-xs text-warm-400 line-clamp-1 mt-0.5">
                  {notification.body}
                </p>
              )}
            </div>
            {notification.source && (
              <span className="flex-shrink-0 px-2 py-0.5 text-[10px] bg-warm-900/40 text-warm-400 rounded">
                {notification.source}
              </span>
            )}
          </div>

          {/* Timestamp and category */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-warm-600">
              {getRelativeTime(notification.createdAt)}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-${categoryColor}-500/20 text-${categoryColor}-300`}>
              {notification.category}
            </span>
          </div>
        </div>

        {/* Unread indicator */}
        {!notification.read && (
          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-terra-400 mt-1" />
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 py-3 bg-white/[0.01] border-t border-nyra-border space-y-3">
          {notification.body && (
            <p className="text-xs text-warm-200 leading-relaxed">
              {notification.body}
            </p>
          )}

          {notification.sourceId && (
            <div className="text-[10px] text-warm-600">
              <span className="font-medium text-warm-500">Source ID:</span> {notification.sourceId}
            </div>
          )}

          {notification.actionPayload && (
            <div className="text-[10px] text-warm-600">
              <span className="font-medium text-warm-500">Action Payload:</span>
              <code className="block mt-1 p-2 bg-warm-900/20 rounded text-warm-400 overflow-auto max-h-24">
                {notification.actionPayload}
              </code>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2">
            {notification.actionType && (
              <button className="flex-1 px-2 py-1.5 text-xs font-medium bg-terra-500/20 hover:bg-terra-500/30 text-terra-300 rounded transition-colors">
                {notification.actionType}
              </button>
            )}

            {!notification.read && (
              <button
                onClick={onMarkRead}
                className="px-2 py-1.5 text-xs font-medium bg-warm-900/40 hover:bg-warm-900/60 text-warm-400 rounded flex items-center gap-1 transition-colors"
              >
                <Check size={12} />
                Mark Read
              </button>
            )}

            <button
              onClick={onDismiss}
              className="px-2 py-1.5 text-xs font-medium bg-warm-900/40 hover:bg-warm-900/60 text-warm-400 rounded flex items-center gap-1 transition-colors"
            >
              <Trash2 size={12} />
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Empty State ──────────────────────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12 px-4">
    <Bell size={32} className="text-warm-700 mb-2" />
    <p className="text-sm text-warm-500">No notifications</p>
  </div>
)

// ── Main Component ───────────────────────────────────────────────────────────

const NotificationCenterPanel: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  // Fetch notifications on mount and poll every 5s
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const result = await (window as any).nyra.notifications.list()
        setNotifications(result)

        // Update unread counts
        const counts: Record<string, number> = {}
        ;(['agent', 'system', 'error', 'security', 'memory', 'provider', 'task'] as const).forEach(cat => {
          counts[cat] = result.filter((n: Notification) => !n.read && n.category === cat).length
        })
        setUnreadCounts(counts)
      } catch (err) {
        console.error('Failed to fetch notifications:', err)
      }
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 5000)
    return () => clearInterval(interval)
  }, [])

  // Filter notifications
  const filtered = useMemo(() => {
    let result = notifications

    if (selectedCategory !== 'all') {
      result = result.filter(n => n.category === selectedCategory)
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        n => n.title.toLowerCase().includes(q) || (n.body?.toLowerCase().includes(q) ?? false)
      )
    }

    return result
  }, [notifications, selectedCategory, searchQuery])

  const handleMarkRead = useCallback(async (id: string) => {
    try {
      await (window as any).nyra.notifications.markRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }, [])

  const handleDismiss = useCallback(async (id: string) => {
    try {
      await (window as any).nyra.notifications.dismiss(id)
      setNotifications(prev => prev.filter(n => n.id !== id))
    } catch (err) {
      console.error('Failed to dismiss notification:', err)
    }
  }, [])

  const handleMarkAllRead = useCallback(async () => {
    try {
      const category = selectedCategory === 'all' ? undefined : selectedCategory
      await (window as any).nyra.notifications.markAllRead(category)
      setNotifications(prev =>
        prev.map(n =>
          selectedCategory === 'all' || n.category === selectedCategory
            ? { ...n, read: true }
            : n
        )
      )
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    }
  }, [selectedCategory])

  const handleDismissAll = useCallback(async () => {
    try {
      const category = selectedCategory === 'all' ? undefined : selectedCategory
      await (window as any).nyra.notifications.dismissAll(category)
      setNotifications(prev =>
        prev.filter(n =>
          selectedCategory === 'all' ? false : n.category !== selectedCategory
        )
      )
    } catch (err) {
      console.error('Failed to dismiss all:', err)
    }
  }, [selectedCategory])

  const unreadTotal = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col h-full bg-nyra-surface">
      <Header
        unreadCount={unreadTotal}
        soundEnabled={soundEnabled}
        onSoundToggle={() => setSoundEnabled(!soundEnabled)}
        onMarkAllRead={handleMarkAllRead}
        onDismissAll={handleDismissAll}
        onClose={() => {
          // Trigger close via event or callback
          window.dispatchEvent(new CustomEvent('notification-center:close'))
        }}
      />

      <Tabs
        selected={selectedCategory}
        onChange={setSelectedCategory}
        unreadCounts={unreadCounts}
      />

      <SearchBar value={searchQuery} onChange={setSearchQuery} />

      {/* Notifications list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map(notification => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              expanded={expandedId === notification.id}
              onToggle={() => setExpandedId(expandedId === notification.id ? null : notification.id)}
              onMarkRead={() => handleMarkRead(notification.id)}
              onDismiss={() => handleDismiss(notification.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default NotificationCenterPanel
