/**
 * Channel Router — maps incoming channel messages to NYRA sessions.
 * 
 * When a message arrives on any channel (Telegram, Discord, Slack), the router:
 * 1. Checks if this chat/channel/DM has an existing NYRA session
 * 2. If not, creates a new session for this conversation
 * 3. Forwards the message to the OpenClaw gateway as a user message
 * 4. Receives the response and routes it back to the originating channel
 */

import { EventEmitter } from 'events'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

interface ChannelMessage {
  channelType: 'telegram' | 'discord' | 'slack'
  channelId: string | number
  text: string
  from: string
  messageId: string | number
  timestamp: number
}

interface SessionMapping {
  sessionId: string
  channelType: string
  channelId: string | number
  createdAt: number
  lastMessageAt: number
}

export class ChannelRouter extends EventEmitter {
  private sessions: Map<string, SessionMapping> = new Map()
  private proxyWsUrl: string
  private dataDir: string

  constructor(proxyWsUrl: string = '') {
    super()
    this.proxyWsUrl = proxyWsUrl
    this.dataDir = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra')
  }

  /**
   * Initialize: load persisted session mappings from disk
   */
  init(): void {
    try {
      mkdirSync(this.dataDir, { recursive: true })
      const sessionsPath = join(this.dataDir, 'channel-sessions.json')

      if (existsSync(sessionsPath)) {
        const data = readFileSync(sessionsPath, 'utf-8')
        const mappings = JSON.parse(data) as Array<[string, SessionMapping]>
        this.sessions = new Map(mappings)
        console.log(`[ChannelRouter] Loaded ${this.sessions.size} session mappings`)
      }
    } catch (err) {
      console.error('[ChannelRouter] Failed to load session mappings:', err)
    }
  }

  /**
   * Shutdown: save current session mappings to disk
   */
  shutdown(): void {
    try {
      mkdirSync(this.dataDir, { recursive: true })
      const sessionsPath = join(this.dataDir, 'channel-sessions.json')
      const mappings = Array.from(this.sessions.entries())
      writeFileSync(sessionsPath, JSON.stringify(mappings, null, 2), 'utf-8')
      console.log(`[ChannelRouter] Saved ${this.sessions.size} session mappings`)
    } catch (err) {
      console.error('[ChannelRouter] Failed to save session mappings:', err)
    }
  }

  private makeKey(channelType: string, channelId: string | number): string {
    return `${channelType}:${channelId}`
  }

  async routeMessage(msg: ChannelMessage): Promise<string | null> {
    const key = this.makeKey(msg.channelType, msg.channelId)
    let mapping = this.sessions.get(key)

    if (!mapping) {
      // Create new session for this channel conversation
      const sessionId = `channel-${msg.channelType}-${msg.channelId}-${Date.now()}`
      mapping = {
        sessionId,
        channelType: msg.channelType,
        channelId: msg.channelId,
        createdAt: Date.now(),
        lastMessageAt: Date.now(),
      }
      this.sessions.set(key, mapping)
      console.log(`[ChannelRouter] New session ${sessionId} for ${key}`)
    }

    mapping.lastMessageAt = Date.now()

    // Forward to OpenClaw gateway via WebSocket
    try {
      const response = await this.forwardToGateway(mapping.sessionId, msg.text)
      return response
    } catch (err) {
      console.error(`[ChannelRouter] Failed to route message for ${key}:`, err)
      return null
    }
  }

  private forwardToGateway(sessionId: string, text: string): Promise<string | null> {
    const WebSocket = require('ws')
    return new Promise((resolve) => {
      let resolved = false
      const rpcId = `route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      const finish = (value: string | null) => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        try {
          ws?.close()
        } catch {}
        resolve(value)
      }

      const timeout = setTimeout(() => finish(null), 30000) // 30s for LLM response
      let ws: any
      let responseText = ''

      try {
        ws = new WebSocket(this.proxyWsUrl)
        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: rpcId,
              method: 'sessions.message',
              params: {
                sessionId,
                message: { role: 'user', content: text },
              },
            })
          )
        })
        ws.on('message', (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString())
            // Streaming chunks
            if (msg.type === 'chunk' && msg.text) {
              responseText += msg.text
            }
            // Final response (JSON-RPC)
            if (msg.id === rpcId && msg.result) {
              const content =
                typeof msg.result === 'string'
                  ? msg.result
                  : msg.result?.content || msg.result?.text || JSON.stringify(msg.result)
              finish(content)
            }
            // Native gateway format
            if (msg.type === 'res' && msg.id === rpcId) {
              const content = msg.payload?.content || msg.payload?.text || responseText || null
              finish(content)
            }
            // Done streaming indicator
            if (msg.type === 'done' || msg.type === 'stream-end') {
              if (responseText) finish(responseText)
            }
          } catch {}
        })
        ws.on('error', () => finish(null))
        ws.on('close', () => {
          if (!resolved && responseText) finish(responseText)
          else if (!resolved) finish(null)
        })
      } catch {
        finish(null)
      }
    })
  }

  getSessionForChannel(
    channelType: string,
    channelId: string | number
  ): SessionMapping | undefined {
    return this.sessions.get(this.makeKey(channelType, channelId))
  }

  getActiveSessions(): SessionMapping[] {
    return Array.from(this.sessions.values())
  }

  clearStale(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now()
    let cleared = 0
    for (const [key, mapping] of this.sessions) {
      if (now - mapping.lastMessageAt > maxAgeMs) {
        this.sessions.delete(key)
        cleared++
      }
    }
    return cleared
  }
}

export const channelRouter = new ChannelRouter('')
