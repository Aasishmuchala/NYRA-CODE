/**
 * Telegram Channel Integration for NYRA Desktop
 * 
 * Manages the lifecycle of a Telegram bot connection:
 * - Start/stop polling for messages
 * - Forward incoming messages to OpenClaw gateway
 * - Send OpenClaw responses back to Telegram
 */

import { EventEmitter } from 'events'

const TELEGRAM_API = 'https://api.telegram.org/bot'

export interface TelegramConfig {
  botToken: string
  allowedChatIds?: string[]  // Optional whitelist
}

export interface TelegramMessage {
  chatId: number
  text: string
  from: string
  messageId: number
  timestamp: number
}

export class TelegramChannel extends EventEmitter {
  private config: TelegramConfig | null = null
  private polling = false
  private pollTimeout: ReturnType<typeof setTimeout> | null = null
  private lastUpdateId = 0

  get isRunning(): boolean { return this.polling }

  async start(config: TelegramConfig): Promise<{ success: boolean; error?: string; botName?: string }> {
    try {
      // Validate token by calling getMe
      const me = await this.apiCall(config.botToken, 'getMe')
      if (!me.ok) return { success: false, error: me.description || 'Invalid bot token' }
      
      this.config = config
      this.polling = true
      this.lastUpdateId = 0
      this.pollLoop()
      
      console.log(`[Telegram] Bot @${me.result.username} started polling`)
      return { success: true, botName: `@${me.result.username}` }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async stop(): Promise<void> {
    this.polling = false
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout)
      this.pollTimeout = null
    }
    console.log('[Telegram] Stopped polling')
  }

  async testConnection(botToken: string): Promise<{ success: boolean; botName?: string; error?: string }> {
    try {
      const me = await this.apiCall(botToken, 'getMe')
      if (!me.ok) return { success: false, error: me.description || 'Invalid bot token' }
      return { success: true, botName: `@${me.result.username}` }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sendMessage(chatId: number, text: string): Promise<boolean> {
    if (!this.config) return false
    try {
      const result = await this.apiCall(this.config.botToken, 'sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      })
      return result.ok
    } catch {
      return false
    }
  }

  private async pollLoop(): Promise<void> {
    if (!this.polling || !this.config) return

    try {
      const updates = await this.apiCall(this.config.botToken, 'getUpdates', {
        offset: this.lastUpdateId + 1,
        timeout: 25,  // Long polling
        allowed_updates: ['message'],
      })

      if (updates.ok && updates.result?.length > 0) {
        for (const update of updates.result) {
          this.lastUpdateId = update.update_id
          
          if (update.message?.text) {
            const msg: TelegramMessage = {
              chatId: update.message.chat.id,
              text: update.message.text,
              from: update.message.from?.first_name || 'Unknown',
              messageId: update.message.message_id,
              timestamp: update.message.date * 1000,
            }
            
            // Check whitelist if configured
            if (this.config.allowedChatIds?.length) {
              if (!this.config.allowedChatIds.includes(String(msg.chatId))) {
                console.log(`[Telegram] Ignoring message from non-whitelisted chat ${msg.chatId}`)
                continue
              }
            }
            
            this.emit('message', msg)
          }
        }
      }
    } catch (err) {
      console.warn('[Telegram] Poll error:', err)
    }

    // Schedule next poll (with short delay to avoid hammering on errors)
    if (this.polling) {
      this.pollTimeout = setTimeout(() => this.pollLoop(), 500)
    }
  }

  private async apiCall(token: string, method: string, params?: Record<string, unknown>): Promise<any> {
    const url = `${TELEGRAM_API}${token}/${method}`
    const https = require('https')
    const http = require('http')
    
    return new Promise((resolve, reject) => {
      const body = params ? JSON.stringify(params) : undefined
      const urlObj = new URL(url)
      const client = urlObj.protocol === 'https:' ? https : http
      
      const req = client.request(url, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
        timeout: 30000,
      }, (res: any) => {
        let data = ''
        res.on('data', (chunk: string) => data += chunk)
        res.on('end', () => {
          try { resolve(JSON.parse(data)) }
          catch { reject(new Error(`Invalid JSON response from Telegram API`)) }
        })
      })
      
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Telegram API timeout')) })
      if (body) req.write(body)
      req.end()
    })
  }
}

// Singleton instance
export const telegramChannel = new TelegramChannel()
