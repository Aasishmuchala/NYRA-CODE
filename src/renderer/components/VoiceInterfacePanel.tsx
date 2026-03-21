/**
 * Voice Interface Panel — Voice session history, TTS settings, waveform display
 */
import React, { useEffect, useState } from 'react'
import { Mic, MicOff, Clock, Play, Square } from 'lucide-react'

interface VoiceSession {
  id: string; mode: string; startedAt: number; endedAt?: number; transcriptionCount: number
}
interface VoiceTranscription {
  id: string; sessionId: string; role: string; text: string; confidence?: number; timestamp: number
}
interface VoiceSettings {
  ttsEnabled: boolean; ttsVoice: string; ttsRate: number; ttsPitch: number
  sttEnabled: boolean; sttLanguage: string; sttContinuous: boolean
  wakeWord: string; wakeWordEnabled: boolean
}

type Tab = 'live' | 'history' | 'settings'

const VoiceInterfacePanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>('live')
  const [sessions, setSessions] = useState<VoiceSession[]>([])
  const [settings, setSettings] = useState<VoiceSettings | null>(null)
  const [selectedSession, setSelectedSession] = useState<VoiceSession | null>(null)
  const [transcriptions, setTranscriptions] = useState<VoiceTranscription[]>([])
  const [isListening, setIsListening] = useState(false)
  const [liveText, setLiveText] = useState('')

  const fetchSessions = async () => {
    try {
      const r = await window.nyra.voice.listSessions(20)
      if (r.success) setSessions(r.result)
    } catch {}
  }

  const fetchSettings = async () => {
    try {
      const r = await window.nyra.voice.getSettings()
      if (r.success) setSettings(r.result)
    } catch {}
  }

  useEffect(() => { fetchSessions(); fetchSettings() }, [])

  const handleViewSession = async (session: VoiceSession) => {
    setSelectedSession(session)
    try {
      const r = await window.nyra.voice.getTranscriptions(session.id)
      if (r.success) setTranscriptions(r.result)
    } catch {}
  }

  const handleUpdateSetting = async (key: string, value: any) => {
    if (!settings) return
    try {
      await window.nyra.voice.updateSettings({ [key]: value })
      setSettings({ ...settings, [key]: value })
    } catch {}
  }

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false)
      setLiveText('')
    } else {
      setIsListening(true)
      setLiveText('Listening...')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <Mic size={16} className="text-terra-300" />
        <h2 className="text-sm font-semibold text-white/80">Voice Interface</h2>
        <div className="ml-auto flex gap-1">
          {(['live', 'history', 'settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setSelectedSession(null) }}
              className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${tab === t ? 'bg-terra-400/15 text-terra-300' : 'text-white/30 hover:text-white/50'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'live' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 space-y-6">
          {/* Waveform placeholder */}
          <div className="w-full h-20 bg-white/[0.02] border border-white/[0.06] rounded-xl flex items-center justify-center overflow-hidden">
            {isListening ? (
              <div className="flex items-end gap-[3px] h-12">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="w-[3px] bg-terra-400/60 rounded-full animate-pulse"
                    style={{ height: `${12 + Math.random() * 36}px`, animationDelay: `${i * 50}ms` }} />
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-white/15">Waveform display</span>
            )}
          </div>

          {/* Mic button */}
          <button onClick={toggleListening}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? 'bg-blush-400/20 border-2 border-blush-400/40 text-blush-400 animate-pulse'
                : 'bg-terra-400/15 border-2 border-terra-400/30 text-terra-300 hover:bg-terra-400/25'
            }`}>
            {isListening ? <MicOff size={24} /> : <Mic size={24} />}
          </button>

          <p className="text-[12px] text-white/40">{isListening ? liveText : 'Click to start listening'}</p>

          {/* TTS test */}
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.04] text-white/30 hover:text-white/50 text-[11px]">
              <Play size={12} /> Test TTS
            </button>
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.04] text-white/30 hover:text-white/50 text-[11px]">
              <Square size={12} /> Stop
            </button>
          </div>
        </div>
      )}

      {tab === 'history' && !selectedSession && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {sessions.map(s => (
            <button key={s.id} onClick={() => handleViewSession(s)}
              className="w-full text-left bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 hover:border-white/[0.08] transition-colors">
              <div className="flex items-center gap-2">
                <Mic size={10} className="text-terra-300/50" />
                <span className="text-[11px] text-white/50 font-medium">{s.mode} session</span>
                <span className="text-[9px] text-white/15 ml-auto">{s.transcriptionCount} lines</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Clock size={8} className="text-white/15" />
                <span className="text-[9px] text-white/20">{new Date(s.startedAt).toLocaleString()}</span>
                {s.endedAt && (
                  <span className="text-[9px] text-white/10">({Math.round((s.endedAt - s.startedAt) / 1000)}s)</span>
                )}
              </div>
            </button>
          ))}
          {sessions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-white/15 text-[11px]">
              <Mic size={20} className="mb-2 opacity-30" />No voice sessions yet
            </div>
          )}
        </div>
      )}

      {tab === 'history' && selectedSession && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <button onClick={() => setSelectedSession(null)} className="text-[10px] text-white/30 hover:text-white/50">&larr; Back</button>
          <h3 className="text-[12px] font-medium text-white/60">{selectedSession.mode} session</h3>
          <div className="space-y-1.5">
            {transcriptions.map(t => (
              <div key={t.id} className={`rounded-lg p-2.5 ${t.role === 'user' ? 'bg-terra-400/5 border border-terra-400/10 ml-6' : 'bg-white/[0.02] border border-white/[0.05] mr-6'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] font-medium ${t.role === 'user' ? 'text-terra-300/60' : 'text-white/30'}`}>{t.role}</span>
                  {t.confidence !== undefined && <span className="text-[8px] text-white/15">{(t.confidence * 100).toFixed(0)}%</span>}
                  <span className="text-[8px] text-white/10 ml-auto">{new Date(t.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'settings' && settings && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <div className="space-y-3">
            <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Text to Speech</h3>
            <label className="flex items-center justify-between">
              <span className="text-[12px] text-white/50">Enable TTS</span>
              <button onClick={() => handleUpdateSetting('ttsEnabled', !settings.ttsEnabled)}
                className={`w-8 h-4 rounded-full transition-colors ${settings.ttsEnabled ? 'bg-terra-400/50' : 'bg-white/10'}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white/80 transition-transform ${settings.ttsEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between">
              <span className="text-[12px] text-white/50">Voice</span>
              <select value={settings.ttsVoice} onChange={e => handleUpdateSetting('ttsVoice', e.target.value)}
                className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1 text-[11px] text-white/50 outline-none">
                <option value="default">Default</option>
                <option value="alloy">Alloy</option>
                <option value="echo">Echo</option>
                <option value="nova">Nova</option>
                <option value="shimmer">Shimmer</option>
              </select>
            </label>
            <label className="flex items-center justify-between">
              <span className="text-[12px] text-white/50">Speed ({settings.ttsRate.toFixed(1)}x)</span>
              <input type="range" min="0.5" max="2" step="0.1" value={settings.ttsRate}
                onChange={e => handleUpdateSetting('ttsRate', parseFloat(e.target.value))}
                className="w-28 accent-terra-400" />
            </label>
          </div>

          <div className="space-y-3 pt-2 border-t border-white/[0.04]">
            <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Speech to Text</h3>
            <label className="flex items-center justify-between">
              <span className="text-[12px] text-white/50">Enable STT</span>
              <button onClick={() => handleUpdateSetting('sttEnabled', !settings.sttEnabled)}
                className={`w-8 h-4 rounded-full transition-colors ${settings.sttEnabled ? 'bg-terra-400/50' : 'bg-white/10'}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white/80 transition-transform ${settings.sttEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between">
              <span className="text-[12px] text-white/50">Language</span>
              <select value={settings.sttLanguage} onChange={e => handleUpdateSetting('sttLanguage', e.target.value)}
                className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1 text-[11px] text-white/50 outline-none">
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="es-ES">Spanish</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
                <option value="ja-JP">Japanese</option>
              </select>
            </label>
            <label className="flex items-center justify-between">
              <span className="text-[12px] text-white/50">Continuous mode</span>
              <button onClick={() => handleUpdateSetting('sttContinuous', !settings.sttContinuous)}
                className={`w-8 h-4 rounded-full transition-colors ${settings.sttContinuous ? 'bg-terra-400/50' : 'bg-white/10'}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white/80 transition-transform ${settings.sttContinuous ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
          </div>

          <div className="space-y-3 pt-2 border-t border-white/[0.04]">
            <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Wake Word</h3>
            <label className="flex items-center justify-between">
              <span className="text-[12px] text-white/50">Enable wake word</span>
              <button onClick={() => handleUpdateSetting('wakeWordEnabled', !settings.wakeWordEnabled)}
                className={`w-8 h-4 rounded-full transition-colors ${settings.wakeWordEnabled ? 'bg-terra-400/50' : 'bg-white/10'}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white/80 transition-transform ${settings.wakeWordEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between">
              <span className="text-[12px] text-white/50">Wake word</span>
              <input value={settings.wakeWord} onChange={e => handleUpdateSetting('wakeWord', e.target.value)}
                className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1 text-[11px] text-white/50 outline-none w-28 text-right" />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

export default VoiceInterfacePanel
