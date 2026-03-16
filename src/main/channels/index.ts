/**
 * Channel Registry
 * 
 * Central export of all channel implementations for NYRA Desktop.
 * Each channel handles its own lifecycle (start, stop, testConnection, sendMessage).
 */

export { telegramChannel, TelegramChannel } from './telegram'
export { discordChannel, DiscordChannel } from './discord'
export { slackChannel, SlackChannel } from './slack'

import { telegramChannel } from './telegram'
import { discordChannel } from './discord'
import { slackChannel } from './slack'

export const CHANNEL_REGISTRY: Record<
  string,
  {
    start: (config: any) => Promise<any>
    stop: () => Promise<void>
    testConnection: (token: string) => Promise<any>
    sendMessage: (channelId: string, text: string) => Promise<boolean>
  }
> = {
  telegram: telegramChannel,
  discord: discordChannel,
  slack: slackChannel,
}
