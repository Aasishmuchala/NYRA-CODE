/**
 * Discord Channel Integration for NYRA Desktop
 * 
 * Manages the lifecycle of a Discord bot connection:
 * - Connect to Discord Gateway WebSocket
 * - Listen for MESSAGE_CREATE events
 * - Forward incoming messages to OpenClaw gateway
 * - Send OpenClaw responses back to Discord
 */

import { EventEmitter } from 'events'
import { https } from 'https'

const DISCORD_API = 'https://discordapp.com/api/v10'
const DISCORD_GATEWAY = 'wss://gateway.discord.gg'

export interface DiscordConfig {
  botToken: string
}

export interface DiscordMessage {
  channelId: string
  messageId: string
  text: string
  from: string
  timestamp: number
}

export class DiscordChannel extends EventEmitter {
  private config: DiscordConfig | null = null
  private running = false
  private ws: any = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private lastSequence: number | null = null
  private sessionId: string | null = null
  private resumeGatewayUrl: string | null = null

  get isRunning(): boolean { return this.running }

  async start(config: DiscordConfig): Promise<{ success: boolean; error?: string; botName?: string }> {
    try {
      // Validate token
      const me = await this.apiCall(config.botToken, '/users/@me', 'GET')
      if (!me.username) {
        return { success: false, error: 'Invalid bot token' }
      }

      this.config = config
      this.running = true
      
      // Connect to Gateway
      await this.connectGateway()

      console.log(`[Discord] Bot @${me.username} connected to Gateway`)
      return { success: true, botName: `@${me.username}` }
    } catch (err) {
      this.running = false
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.ws) {
      try {
        this.ws.close(1000, 'Bot shutdown')
      } catch {}
      this.ws = null
    }
    console.log('[Discord] Disconnected from Gateway')
  }

  async testConnection(botToken: string): Promise<{ success: boolean; botName?: string; error?: string }> {
    try {
      const me = await this.apiCall(botToken, '/users/@me', 'GET')
      if (!me.username) {
        return { success: false, error: 'Invalid bot token' }
      }
      return { success: true, botName: `@${me.username}` }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sendMessage(channelId: string, text: string): Promise<boolean> {
    if (!this.config) return false
    try {
      const payload = { content: text }
      await this.apiCall(this.config.botToken, `/channels/${channelId}/messages`, 'POST', payload)
      return true
    } catch {
      return false
    }
  }

  private async connectGateway(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const WebSocket = require('ws')
        const gatewayUrl = this.resumeGatewayUrl || `${DISCORD_GATEWAY}/?v=10&encoding=json`
        
        this.ws = new WebSocket(gatewayUrl)

        this.ws.on('open', () => {
          console.log('[Discord] WebSocket connected')
          if (this.resumeGatewayUrl && this.sessionId) {
            // Resume previous session
            this.sendGatewayMessage({
              op: 6,
              d: {
                token: this.config!.botToken,
                session_id: this.sessionId,
                seq: this.lastSequence,
              },
            })
          } else {
            // Initial identify
            this.sendGatewayMessage({
              op: 2,
              d: {
                token: this.config!.botToken,
                intents: 512 | 32768, // GUILD_MESSAGES | DIRECT_MESSAGES
                properties: {
                  os: 'linux',
                  browser: 'nyra-desktop',
                  device: 'nyra-desktop',
                },
              },
            })
          }
          resolve()
        })

        this.ws.on('message', (data: Buffer) => {
          this.handleGatewayMessage(data)
        })

        this.ws.on('close', (code: number) => {
          console.log(`[Discord] WebSocket closed with code ${code}`)
          this.heartbeatInterval && clearInterval(this.heartbeatInterval)
          if (this.running && code !== 1000) {
            // Auto-reconnect on unexpected close
            setTimeout(() => this.connectGateway().catch(console.error), 3000)
          }
        })

        this.ws.on('error', (err: any) => {
          console.error('[Discord] WebSocket error:', err.message)
          reject(err)
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  private sendGatewayMessage(payload: any): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  private handleGatewayMessage(data: Buffer): void {
    try {
      const msg = JSON.parse(data.toString())
      
      // Update sequence for resuming
      if (msg.s) this.lastSequence = msg.s

      switch (msg.op) {
        case 10: // HELLO
          this.startHeartbeat(msg.d.heartbeat_interval)
          break

        case 11: // HEARTBEAT_ACK
          // OK
          break

        case 0: // DISPATCH
          this.handleDispatch(msg)
          break

        case 9: // INVALID_SESSION
          console.warn('[Discord] Invalid session, will reconnect')
          this.sessionId = null
          this.resumeGatewayUrl = null
          break
      }
    } catch (err) {
      console.error('[Discord] Failed to parse gateway message:', err)
    }
  }

  private handleDispatch(msg: any): void {
    switch (msg.t) {
      case 'READY':
        this.sessionId = msg.d.session_id
        this.resumeGatewayUrl = msg.d.resume_gateway_url
        console.log('[Discord] Ready event received')
        break

      case 'MESSAGE_CREATE':
        this.handleMessageCreate(msg.d)
        break

      case 'RESUMED':
        console.log('[Discord] Session resumed')
        break
    }
  }

  private handleMessageCreate(data: any): void {
    // Ignore bot's own messages
    if (data.author.bot) return

    const message: DiscordMessage = {
      channelId: data.channel_id,
      messageId: data.id,
      text: data.content,
      from: data.author.username || data.author.id,
      timestamp: new Date(data.timestamp).getTime(),
    }

    this.emit('message', message)
  }

  private startHeartbeat(interval: number): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
    
    this.heartbeatInterval = setInterval(() => {
      this.sendGatewayMessage({
        op: 1,
        d: this.lastSequence,
      })
    }, interval)
  }

  private apiCall(
    token: string,
    path: string,
    method: string = 'GET',
    body?: any
  ): Promise<any> {
    const https_mod = require('https')
    const url = `${DISCORD_API}${path}`

    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : undefined
      const options = {
        method,
        headers: {
          'Authorization': `Bot ${token}`,
          'Content-Type': 'application/json',
          ...(bodyStr && { 'Content-Length': Buffer.byteLength(bodyStr) }),
        },
        timeout: 30000,
      }

      const req = https_mod.request(url, options, (res: any) => {
        let data = ''
        res.on('data', (chunk: string) => (data += chunk))
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {}
            if (res.statusCode >= 400) {
              reject(new Error(`Discord API error ${res.statusCode}: ${parsed.message || data}`))
            } else {
              resolve(parsed)
            }
          } catch (e) {
            reject(new Error(`Failed to parse Discord API response: ${data}`))
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Discord API timeout'))
      })

      if (bodyStr) req.write(bodyStr)
      req.end()
    })
  }
}

// Singleton instance
export const discordChannel = new DiscordChannel()
