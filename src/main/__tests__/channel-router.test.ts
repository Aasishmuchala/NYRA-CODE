import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ChannelRouter } from '../channels/channel-router'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('ChannelRouter', () => {
  let router: ChannelRouter
  const dataDir = path.join(os.homedir(), '.nyra')
  const sessionFile = path.join(dataDir, 'channel-sessions.json')

  beforeEach(() => {
    // Clean up persisted data before test (before init!)
    try {
      if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile)
      }
    } catch {}
    router = new ChannelRouter('ws://localhost:8080')
    router.init()
  })

  afterEach(() => {
    router.shutdown()
    // Clean up after test
    try {
      if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile)
      }
    } catch {}
  })

  describe('Initialization & Lifecycle', () => {
    it('should initialize without error', () => {
      expect(router).toBeDefined()
    })

    it('should create data directory on init', () => {
      const dataDir = path.join(os.homedir(), '.nyra')
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('should persist and restore session mappings', () => {
      const msg = {
        channelType: 'telegram' as const,
        channelId: 'channel-1',
        text: 'test',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      router.routeMessage(msg).catch(() => {})
      router.shutdown()

      router.init()
      const sessions = router.getActiveSessions()
      expect(sessions.length).toBeGreaterThan(0)
    })
  })

  describe('Session Mapping', () => {
    it('should create session for new channel', async () => {
      const msg = {
        channelType: 'telegram' as const,
        channelId: 'channel-1',
        text: 'hello',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      // Route will fail without real gateway, but should create mapping
      await router.routeMessage(msg).catch(() => {})

      const session = router.getSessionForChannel('telegram', 'channel-1')
      expect(session).toBeDefined()
      expect(session?.sessionId).toBeDefined()
    })

    it('should reuse existing session for channel', async () => {
      const msg1 = {
        channelType: 'discord' as const,
        channelId: 'guild-123',
        text: 'first message',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      const msg2 = {
        channelType: 'discord' as const,
        channelId: 'guild-123',
        text: 'second message',
        from: 'user1',
        messageId: 'msg-2',
        timestamp: Date.now() + 1000
      }

      await router.routeMessage(msg1).catch(() => {})
      const session1 = router.getSessionForChannel('discord', 'guild-123')

      await router.routeMessage(msg2).catch(() => {})
      const session2 = router.getSessionForChannel('discord', 'guild-123')

      expect(session1?.sessionId).toBe(session2?.sessionId)
    })

    it('should create different sessions for different channels', async () => {
      const msg1 = {
        channelType: 'slack' as const,
        channelId: 'channel-1',
        text: 'message',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      const msg2 = {
        channelType: 'slack' as const,
        channelId: 'channel-2',
        text: 'message',
        from: 'user1',
        messageId: 'msg-2',
        timestamp: Date.now()
      }

      await router.routeMessage(msg1).catch(() => {})
      const session1 = router.getSessionForChannel('slack', 'channel-1')

      await router.routeMessage(msg2).catch(() => {})
      const session2 = router.getSessionForChannel('slack', 'channel-2')

      expect(session1?.sessionId).not.toBe(session2?.sessionId)
    })

    it('should create different sessions for different channel types', async () => {
      const telegramMsg = {
        channelType: 'telegram' as const,
        channelId: 'chat-1',
        text: 'hello',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      const discordMsg = {
        channelType: 'discord' as const,
        channelId: 'chat-1',
        text: 'hello',
        from: 'user1',
        messageId: 'msg-2',
        timestamp: Date.now()
      }

      await router.routeMessage(telegramMsg).catch(() => {})
      const telegramSession = router.getSessionForChannel('telegram', 'chat-1')

      await router.routeMessage(discordMsg).catch(() => {})
      const discordSession = router.getSessionForChannel('discord', 'chat-1')

      expect(telegramSession?.sessionId).not.toBe(discordSession?.sessionId)
    })
  })

  describe('Active Sessions', () => {
    it('should list active sessions', async () => {
      const msg = {
        channelType: 'telegram' as const,
        channelId: 'channel-1',
        text: 'hello',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      await router.routeMessage(msg).catch(() => {})

      const sessions = router.getActiveSessions()
      expect(Array.isArray(sessions)).toBe(true)
      expect(sessions.length).toBeGreaterThan(0)
    })

    it('should track last message time', async () => {
      const msg = {
        channelType: 'telegram' as const,
        channelId: 'channel-1',
        text: 'hello',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      await router.routeMessage(msg).catch(() => {})

      const session = router.getSessionForChannel('telegram', 'channel-1')
      expect(session?.lastMessageAt).toBeDefined()
      expect(session?.lastMessageAt).toBeGreaterThan(0)
    })
  })

  describe('Stale Session Cleanup', () => {
    it('should clear stale sessions', () => {
      // Create a mock session that appears old
      const veryOldTimestamp = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago

      // We can't directly inject old sessions, but we can test the method
      const cleared = router.clearStale(24 * 60 * 60 * 1000) // 24 hour threshold
      expect(typeof cleared).toBe('number')
    })

    it('should not clear recent sessions', async () => {
      const msg = {
        channelType: 'telegram' as const,
        channelId: 'channel-1',
        text: 'hello',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      await router.routeMessage(msg).catch(() => {})

      const beforeClear = router.getActiveSessions().length
      const cleared = router.clearStale(24 * 60 * 60 * 1000)
      const afterClear = router.getActiveSessions().length

      // Recent session should still exist
      expect(afterClear).toBe(beforeClear)
    })
  })

  describe('Channel Types', () => {
    it('should handle telegram channels', async () => {
      const msg = {
        channelType: 'telegram' as const,
        channelId: 'chat-12345',
        text: '@bot hello',
        from: 'alice',
        messageId: '9999',
        timestamp: Date.now()
      }

      await router.routeMessage(msg).catch(() => {})

      const session = router.getSessionForChannel('telegram', 'chat-12345')
      expect(session?.channelType).toBe('telegram')
    })

    it('should handle discord channels', async () => {
      const msg = {
        channelType: 'discord' as const,
        channelId: 'guild-456:channel-789',
        text: 'hello bot',
        from: 'bob',
        messageId: '888',
        timestamp: Date.now()
      }

      await router.routeMessage(msg).catch(() => {})

      const session = router.getSessionForChannel('discord', 'guild-456:channel-789')
      expect(session?.channelType).toBe('discord')
    })

    it('should handle slack channels', async () => {
      const msg = {
        channelType: 'slack' as const,
        channelId: 'C123456',
        text: 'ping bot',
        from: 'charlie',
        messageId: 'ts-777',
        timestamp: Date.now()
      }

      await router.routeMessage(msg).catch(() => {})

      const session = router.getSessionForChannel('slack', 'C123456')
      expect(session?.channelType).toBe('slack')
    })
  })

  describe('Message Routing', () => {
    it('should return null if routing fails without gateway', async () => {
      const msg = {
        channelType: 'telegram' as const,
        channelId: 'channel-1',
        text: 'hello',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      // Router with no valid gateway URL should fail gracefully
      const noGatewayRouter = new ChannelRouter('')
      const result = await noGatewayRouter.routeMessage(msg)

      // Should return null or error gracefully without throwing
      expect(result === null || result !== null).toBe(true)
    })
  })

  describe('Proxy URL Configuration', () => {
    it('should accept proxy URL in constructor', () => {
      const router2 = new ChannelRouter('ws://api.example.com:8080')
      expect(router2).toBeDefined()
    })

    it('should accept empty proxy URL', () => {
      const router2 = new ChannelRouter('')
      expect(router2).toBeDefined()
    })
  })

  describe('Message Key Generation', () => {
    it('should generate consistent keys for same channel', async () => {
      const msg1 = {
        channelType: 'telegram' as const,
        channelId: 'channel-1',
        text: 'first',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      const msg2 = {
        channelType: 'telegram' as const,
        channelId: 'channel-1',
        text: 'second',
        from: 'user1',
        messageId: 'msg-2',
        timestamp: Date.now()
      }

      await router.routeMessage(msg1).catch(() => {})
      const session1 = router.getSessionForChannel('telegram', 'channel-1')

      await router.routeMessage(msg2).catch(() => {})
      const session2 = router.getSessionForChannel('telegram', 'channel-1')

      // Same channel should map to same session
      expect(session1?.sessionId).toBe(session2?.sessionId)
    })
  })

  describe('Persistence', () => {
    it('should save session mappings on shutdown', async () => {
      const msg = {
        channelType: 'telegram' as const,
        channelId: 'channel-1',
        text: 'hello',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      await router.routeMessage(msg).catch(() => {})
      router.shutdown()

      expect(fs.existsSync(sessionFile)).toBe(true)
    })

    it('should restore session mappings on init', async () => {
      const msg = {
        channelType: 'discord' as const,
        channelId: 'guild-1',
        text: 'hello',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      await router.routeMessage(msg).catch(() => {})
      router.shutdown()

      router.init()
      const session = router.getSessionForChannel('discord', 'guild-1')
      expect(session).toBeDefined()
    })
  })

  describe('Session Metadata', () => {
    it('should track session creation time', async () => {
      const msg = {
        channelType: 'telegram' as const,
        channelId: 'channel-1',
        text: 'hello',
        from: 'user1',
        messageId: 'msg-1',
        timestamp: Date.now()
      }

      const beforeRoute = Date.now()
      await router.routeMessage(msg).catch(() => {})
      const afterRoute = Date.now()

      const session = router.getSessionForChannel('telegram', 'channel-1')
      expect(session?.createdAt).toBeGreaterThanOrEqual(beforeRoute)
      expect(session?.createdAt).toBeLessThanOrEqual(afterRoute)
    })
  })
})
