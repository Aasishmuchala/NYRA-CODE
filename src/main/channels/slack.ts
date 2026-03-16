/**
 * Slack Channel Integration for NYRA Desktop
 * 
 * Manages the lifecycle of a Slack bot connection:
 * - Connect to Slack Socket Mode (WebSocket)
 * - Listen for message events
 * - Forward incoming messages to OpenClaw gateway
 * - Send OpenClaw responses back to Slack
 */

import { EventEmitter } from 'events'

const SLACK_API = 'https://slack.com/api'

export interface SlackConfig {
  botToken: string
  appToken: string
}

export interface SlackMessage {
  channelId: string
  messageId: string
  text: string
  from: string
  timestamp: number
}

export class SlackChannel extends EventEmitter {
  private config: SlackConfig | null = null
  private running = false
  private ws: any = null
  private envelopeId = 0

  get isRunning(): boolean { return this.running }

  async start(config: SlackConfig): Promise<{ success: boolean; error?: string; botName?: string }> {
    try {
      // Validate tokens
      const authTest = await this.apiCall(config.botToken, 'auth.test', {})
      if (!authTest.ok) {
        return { success: false, error: 'Invalid bot token' }
      }

      this.config = config
      this.running = true

      // Open Socket Mode connection
      await this.openSocketMode()

      console.log(`[Slack] Bot @${authTest.user_id} connected to Socket Mode`)
      return { success: true, botName: `@${authTest.user_id}` }
    } catch (err) {
      this.running = false
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.ws) {
      try {
        this.ws.close(1000, 'Bot shutdown')
      } catch {}
      this.ws = null
    }
    console.log('[Slack] Disconnected from Socket Mode')
  }

  async testConnection(botToken: string): Promise<{ success: boolean; botName?: string; error?: string }> {
    try {
      const result = await this.apiCall(botToken, 'auth.test', {})
      if (!result.ok) {
        return { success: false, error: result.error || 'Invalid bot token' }
      }
      return { success: true, botName: `@${result.user_id}` }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sendMessage(channelId: string, text: string): Promise<boolean> {
    if (!this.config) return false
    try {
      const result = await this.apiCall(this.config.botToken, 'chat.postMessage', {
        channel: channelId,
        text,
      })
      return result.ok
    } catch {
      return false
    }
  }

  private async openSocketMode(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const result = this.apiCallSync(this.config!.appToken, 'apps.connections.open', {})
        result
          .then((res: any) => {
            if (!res.ok) {
              reject(new Error(`Failed to open Socket Mode: ${res.error}`))
              return
            }

            const WebSocket = require('ws')
            this.ws = new WebSocket(res.url)

            this.ws.on('open', () => {
              console.log('[Slack] Socket Mode connected')
              resolve()
            })

            this.ws.on('message', (data: Buffer) => {
              this.handleSocketMessage(data)
            })

            this.ws.on('close', () => {
              console.log('[Slack] Socket Mode disconnected')
              if (this.running) {
                // Auto-reconnect
                setTimeout(() => this.openSocketMode().catch(console.error), 3000)
              }
            })

            this.ws.on('error', (err: any) => {
              console.error('[Slack] Socket Mode error:', err.message)
              if (!this.running) reject(err)
            })
          })
          .catch(reject)
      } catch (err) {
        reject(err)
      }
    })
  }

  private handleSocketMessage(data: Buffer): void {
    try {
      const envelope = JSON.parse(data.toString())

      // Always acknowledge to prevent retries
      if (envelope.envelope_id) {
        this.sendSocketMessage({
          envelope_id: envelope.envelope_id,
        })
      }

      if (envelope.payload) {
        this.handlePayload(envelope.payload)
      }
    } catch (err) {
      console.error('[Slack] Failed to parse socket message:', err)
    }
  }

  private handlePayload(payload: any): void {
    switch (payload.type) {
      case 'events_api':
        this.handleEventPayload(payload)
        break

      case 'slash_commands':
        console.log('[Slack] Slash command received (not yet handled)')
        break

      case 'interactive':
        console.log('[Slack] Interactive event received (not yet handled)')
        break
    }
  }

  private handleEventPayload(payload: any): void {
    if (payload.event?.type === 'message') {
      // Ignore bot messages and thread messages
      if (payload.event.bot_id || payload.event.thread_ts) return

      const message: SlackMessage = {
        channelId: payload.event.channel,
        messageId: payload.event.ts,
        text: payload.event.text,
        from: payload.event.user || 'unknown',
        timestamp: Math.floor(parseFloat(payload.event.ts) * 1000),
      }

      this.emit('message', message)
    }
  }

  private sendSocketMessage(payload: any): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  private apiCallSync(
    token: string,
    method: string,
    params: Record<string, any>
  ): Promise<any> {
    const https_mod = require('https')
    const url = `${SLACK_API}/${method}`

    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(params)
      const options = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
        timeout: 30000,
      }

      const req = https_mod.request(url, options, (res: any) => {
        let data = ''
        res.on('data', (chunk: string) => (data += chunk))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            resolve(parsed)
          } catch (e) {
            reject(new Error(`Failed to parse Slack API response: ${data}`))
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Slack API timeout'))
      })

      req.write(bodyStr)
      req.end()
    })
  }

  private async apiCall(
    token: string,
    method: string,
    params: Record<string, any>
  ): Promise<any> {
    return this.apiCallSync(token, method, params)
  }
}

// Singleton instance
export const slackChannel = new SlackChannel()
