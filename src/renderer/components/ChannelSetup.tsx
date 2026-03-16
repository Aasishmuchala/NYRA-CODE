import React, { useState } from 'react'
import { Check, Loader2, ExternalLink, ChevronDown, ChevronRight, Power, AlertCircle, Radio } from 'lucide-react'

interface FieldDef {
  key: string
  label: string
  placeholder: string
  sensitive?: boolean
  helpUrl?: string
}

interface ChannelDef {
  id: string
  name: string
  icon: string
  description: string
  fields: FieldDef[]
}

interface ChannelStatus {
  enabled: boolean
  connected: boolean
  error?: string
}

interface Props {
  channelStatus: Record<string, ChannelStatus> | null
  onConfigureChannel: (channelId: string, config: Record<string, string>) => Promise<void>
  onToggleChannel: (channelId: string, enabled: boolean) => Promise<void>
  compact?: boolean
}

const CHANNELS: ChannelDef[] = [
  {
    id: 'telegram',
    name: 'Telegram',
    icon: '✈️',
    description: 'Connect via Telegram Bot API',
    fields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        placeholder: '123456:ABC-DEF...',
        sensitive: true,
        helpUrl: 'https://core.telegram.org/bots#botfather',
      },
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: '💬',
    description: 'Connect via WhatsApp Business API',
    fields: [
      { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '1234567890' },
      {
        key: 'accessToken',
        label: 'Access Token',
        placeholder: 'EAAx...',
        sensitive: true,
      },
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    icon: '🎮',
    description: 'Connect via Discord Bot',
    fields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        placeholder: 'MTI3...',
        sensitive: true,
        helpUrl: 'https://discord.com/developers/applications',
      },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '💼',
    description: 'Connect via Slack Bot',
    fields: [
      { key: 'botToken', label: 'Bot Token', placeholder: 'xoxb-...', sensitive: true },
      {
        key: 'signingSecret',
        label: 'Signing Secret',
        placeholder: 'abc123...',
        sensitive: true,
      },
    ],
  },
  {
    id: 'matrix',
    name: 'Matrix',
    icon: '🔗',
    description: 'Connect via Matrix protocol',
    fields: [
      { key: 'homeserver', label: 'Homeserver URL', placeholder: 'https://matrix.org' },
      {
        key: 'accessToken',
        label: 'Access Token',
        placeholder: 'syt_...',
        sensitive: true,
      },
    ],
  },
  {
    id: 'signal',
    name: 'Signal',
    icon: '🔒',
    description: 'Connect via Signal API',
    fields: [{ key: 'phoneNumber', label: 'Phone Number', placeholder: '+1234567890' }],
  },
  {
    id: 'irc',
    name: 'IRC',
    icon: '📡',
    description: 'Connect to IRC networks',
    fields: [
      { key: 'server', label: 'Server', placeholder: 'irc.libera.chat' },
      { key: 'nick', label: 'Nickname', placeholder: 'nyra-bot' },
      {
        key: 'channels',
        label: 'Channels (comma-separated)',
        placeholder: '#general, #dev',
      },
    ],
  },
  {
    id: 'google-chat',
    name: 'Google Chat',
    icon: '💚',
    description: 'Connect via Google Chat API',
    fields: [
      {
        key: 'serviceAccountJson',
        label: 'Service Account JSON',
        placeholder: '{"type":"service_account"...}',
        sensitive: true,
      },
    ],
  },
]

const ChannelCard: React.FC<{
  channel: ChannelDef
  status: ChannelStatus | undefined
  onConfigure: (config: Record<string, string>) => Promise<void>
  onToggle: (enabled: boolean) => Promise<void>
}> = ({ channel, status, onConfigure, onToggle }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({})
  const [testingChannel, setTestingChannel] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; botName?: string; error?: string }>>({})

  const isConnected = status?.connected ?? false
  const isEnabled = status?.enabled ?? false
  const hasError = !!status?.error

  const handleToggle = async () => {
    setIsLoading(true)
    try {
      await onToggle(!isEnabled)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    // Validate required fields — at least one field must be filled
    const filledFields = Object.entries(formData).filter(([, v]) => v.trim() !== '')
    if (filledFields.length === 0) return
    // Check that all fields for this channel have values (sensitive fields are required)
    const missingRequired = channel.fields.filter(f => !formData[f.key]?.trim())
    if (missingRequired.length > 0) return
    setIsSaving(true)
    try {
      const result = await (window as any).nyra?.openclaw?.channelEnable?.(channel.id, formData)
      if (result?.success) {
        await onConfigure(formData)
        setIsExpanded(false)
      }
    } catch (err) {
      console.error(`[ChannelSetup] Save failed for ${channel.id}:`, err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleInputChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }


  const handleTest = async (channelId: string) => {
    setTestingChannel(channelId)
    setTestResult(prev => ({ ...prev, [channelId]: undefined as any }))
    try {
      const result = await (window as any).nyra?.openclaw?.channelTest?.(channelId, formData)
      if (result) setTestResult(prev => ({ ...prev, [channelId]: result }))
      else setTestResult(prev => ({ ...prev, [channelId]: { success: false, error: 'No response from test' } }))
    } catch (err) {
      setTestResult(prev => ({ ...prev, [channelId]: { success: false, error: String(err) } }))
    } finally {
      setTestingChannel(null)
    }
  }
  const togglePasswordVisibility = (key: string) => {
    setShowPassword((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div
      className={`rounded-lg border transition-all ${
        isConnected
          ? 'border-sage-500/25 bg-sage-500/[0.08]'
          : 'border-white/[0.08] bg-white/[0.02]'
      } ${hasError ? 'border-blush-500/40 bg-blush-400/10' : ''}`}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex-shrink-0 text-white/60 hover:text-white/80 transition-colors"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </button>

            <span className="text-2xl flex-shrink-0">{channel.icon}</span>

            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-white">{channel.name}</h3>
              <p className="text-sm text-white/60 truncate">{channel.description}</p>
            </div>
          </div>

          {/* Status Indicator */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isConnected && (
              <div className="flex items-center gap-1 text-sage-300">
                <Check size={16} />
                <span className="text-xs">Connected</span>
              </div>
            )}
            {hasError && (
              <div className="flex items-center gap-1 text-blush-300">
                <AlertCircle size={16} />
              </div>
            )}
            {!isConnected && !hasError && isEnabled && (
              <div className="flex items-center gap-1 text-white/40">
                <Radio size={16} className="animate-pulse" />
              </div>
            )}

            {/* Toggle */}
            <button
              onClick={handleToggle}
              disabled={isLoading}
              className={`p-2 rounded-lg transition-all ${
                isEnabled
                  ? 'bg-sage-500/20 text-sage-300 hover:bg-sage-500/30'
                  : 'bg-white/[0.05] text-white/40 hover:bg-white/[0.08]'
              } disabled:opacity-50`}
              aria-label={isEnabled ? 'Disable channel' : 'Enable channel'}
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Power size={18} />}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {hasError && status?.error && (
          <div className="mt-3 p-2 rounded bg-blush-400/10 border border-blush-500/20">
            <p className="text-xs text-blush-300">{status.error}</p>
          </div>
        )}

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mt-4 space-y-4 border-t border-white/[0.05] pt-4">
            {channel.fields.map((field) => (
              <div key={field.key}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-white/80">{field.label}</label>
                  {field.helpUrl && (
                    <a
                      href={field.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-terra-400 hover:text-terra-300 flex items-center gap-1 transition-colors"
                    >
                      Help <ExternalLink size={12} />
                    </a>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={field.sensitive && !showPassword[field.key] ? 'password' : 'text'}
                    placeholder={field.placeholder}
                    value={formData[field.key] ?? ''}
                    onChange={(e) => handleInputChange(field.key, e.target.value)}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-terra-500/50 focus:bg-white/[0.05] transition-colors text-sm"
                  />
                  {field.sensitive && (
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility(field.key)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors text-xs"
                    >
                      {showPassword[field.key] ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {channel.id === 'telegram' && formData.botToken?.trim() && (
              <button
                onClick={() => handleTest(channel.id)}
                disabled={testingChannel === channel.id}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-nyra-surface-2 border border-white/10 text-nyra-gold hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                {testingChannel === channel.id ? '⏳ Testing...' : '🔌 Test Connection'}
              </button>
            )}

            {testResult[channel.id] && (
              <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${testResult[channel.id].success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {testResult[channel.id].success
                  ? `✅ Connected! Bot: ${testResult[channel.id].botName}`
                  : `❌ ${testResult[channel.id].error}`
                }
              </div>
            )}

            {/* Save Button */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={isSaving || channel.fields.some(f => !formData[f.key]?.trim())}
                className="flex-1 px-3 py-2 bg-terra-500/20 hover:bg-terra-500/30 text-terra-300 rounded-lg font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Save Configuration
                  </>
                )}
              </button>
              <button
                onClick={() => setIsExpanded(false)}
                className="px-3 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-white/60 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export const ChannelSetup: React.FC<Props> = ({
  channelStatus,
  onConfigureChannel,
  onToggleChannel,
  compact = false,
}) => {
  const [showAllChannels, setShowAllChannels] = useState(!compact)
  const displayedChannels = showAllChannels || !compact ? CHANNELS : CHANNELS.slice(0, 4)
  const hiddenCount = compact && !showAllChannels ? CHANNELS.length - 4 : 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Message Channels</h2>
        <p className="text-sm text-white/50">
          {channelStatus
            ? Object.values(channelStatus).filter((s) => s.connected).length
            : 0}{' '}
          connected
        </p>
      </div>

      <div className="space-y-3">
        {displayedChannels.map((channel) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            status={channelStatus?.[channel.id]}
            onConfigure={(config) => onConfigureChannel(channel.id, config)}
            onToggle={(enabled) => onToggleChannel(channel.id, enabled)}
          />
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAllChannels(true)}
          className="w-full px-4 py-3 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.08] rounded-lg text-white/70 hover:text-white/80 transition-colors text-sm font-medium flex items-center justify-center gap-2"
        >
          <ChevronDown size={16} />
          Show all channels ({hiddenCount} more)
        </button>
      )}
    </div>
  )
}
