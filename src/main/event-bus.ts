import { EventEmitter } from 'events'
import type { BrowserWindow } from 'electron'

type EventDomain = 'task' | 'agent' | 'folder' | 'context' | 'audit'
type EventAction = string

type EventName = `${EventDomain}:${EventAction}`
type WildcardPattern = `${EventDomain}:*` | '*:*' | '*'

type EventListener = (data: unknown) => void

/**
 * Simple pattern matcher for wildcard event subscriptions
 */
function matchesPattern(eventName: EventName, pattern: WildcardPattern): boolean {
  if (pattern === '*') return true
  if (pattern === '*:*') return true

  const [patternDomain, patternAction] = pattern.split(':')
  const [eventDomain, eventAction] = eventName.split(':')

  if (patternDomain === '*') return true
  if (patternDomain !== eventDomain) return false
  if (patternAction === '*') return true

  return patternAction === eventAction
}

/**
 * Central event bus for the Nyra Desktop Electron app (main process)
 * Supports domain:action event patterns with wildcard matching and renderer forwarding
 */
class EventBus extends EventEmitter {
  private mainWindow: BrowserWindow | null = null
  private wildcardListeners = new Map<string, Set<EventListener>>()

  /**
   * Setup event forwarding to the Electron renderer process
   */
  setupEventForwarding(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
  }

  /**
   * Emit an event with automatic renderer process forwarding
   */
  emit(eventName: string, data?: unknown): boolean {
    const result = super.emit(eventName, data)

    // Forward to renderer process if mainWindow exists
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`event:${eventName}`, data)
    }

    // Trigger wildcard listeners
    this.triggerWildcardListeners(eventName as EventName, data)

    return result
  }

  /**
   * Subscribe to wildcard event patterns
   */
  on(eventName: string | symbol, listener: EventListener): this
  on(pattern: WildcardPattern, listener: EventListener): this
  on(eventOrPattern: string | symbol, listener: EventListener): this {
    const patternStr = String(eventOrPattern)

    // Check if this is a wildcard pattern
    if (patternStr.includes('*')) {
      const listeners = this.wildcardListeners.get(patternStr) ?? new Set()
      listeners.add(listener)
      this.wildcardListeners.set(patternStr, listeners)
      return this
    }

    return super.on(eventOrPattern, listener)
  }

  /**
   * Remove wildcard listener
   */
  off(eventName: string | symbol, listener: EventListener): this
  off(pattern: WildcardPattern, listener: EventListener): this
  off(eventOrPattern: string | symbol, listener: EventListener): this {
    const patternStr = String(eventOrPattern)

    if (patternStr.includes('*')) {
      const listeners = this.wildcardListeners.get(patternStr)
      if (listeners) {
        listeners.delete(listener)
        if (listeners.size === 0) {
          this.wildcardListeners.delete(patternStr)
        }
      }
      return this
    }

    return super.off(eventOrPattern, listener)
  }

  /**
   * Trigger all matching wildcard listeners
   */
  private triggerWildcardListeners(eventName: EventName, data: unknown): void {
    for (const [pattern, listeners] of this.wildcardListeners) {
      if (matchesPattern(eventName, pattern as WildcardPattern)) {
        listeners.forEach((listener) => {
          try {
            listener(data)
          } catch (err) {
            console.error(`Error in wildcard listener for ${pattern}:`, err)
          }
        })
      }
    }
  }
}

/**
 * Singleton event bus instance
 */
export const eventBus = new EventBus()

/**
 * Setup event forwarding to renderer process
 */
export function setupEventForwarding(mainWindow: BrowserWindow): void {
  eventBus.setupEventForwarding(mainWindow)
}

/**
 * Emit a typed event
 */
export function emitEvent(eventName: EventName, data?: unknown): void {
  eventBus.emit(eventName, data)
}

/**
 * Subscribe to a typed event or pattern
 */
export function onEvent(
  eventOrPattern: EventName | WildcardPattern,
  listener: EventListener
): () => void {
  eventBus.on(eventOrPattern, listener)
  return () => eventBus.off(eventOrPattern, listener)
}
