/**
 * Voice Interface — Backend support for speech-to-text and text-to-speech
 *
 * The actual STT/TTS happens in the renderer via Web Speech API.
 * This module handles: voice session history, transcription storage,
 * TTS preferences, and voice command routing.
 */

import { memoryManager } from './memory'
import { randomUUID } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

interface VoiceSession {
  id: string
  transcriptions: VoiceTranscription[]
  startedAt: number
  endedAt?: number
  totalDurationMs: number
  wordCount: number
}

interface VoiceTranscription {
  id: string
  sessionId: string
  text: string
  confidence: number
  isFinal: boolean
  durationMs: number
  timestamp: number
}

interface VoiceSettings {
  sttLanguage: string
  ttsVoice: string
  ttsRate: number
  ttsPitch: number
  continuous: boolean
  autoSend: boolean
  wakeWord?: string
}

// ── Voice Interface ──────────────────────────────────────────────────────────

export class VoiceInterface {
  private db: any = null
  private settings: VoiceSettings = {
    sttLanguage: 'en-US',
    ttsVoice: 'default',
    ttsRate: 1.0,
    ttsPitch: 1.0,
    continuous: true,
    autoSend: false,
  }

  init(): void {
    try {
      this.db = (memoryManager as any).db
      if (this.db) {
        const run = (sql: string) => this.db.prepare(sql).run()
        run(`CREATE TABLE IF NOT EXISTS voice_sessions (
            id TEXT PRIMARY KEY, startedAt INTEGER NOT NULL, endedAt INTEGER,
            totalDurationMs INTEGER DEFAULT 0, wordCount INTEGER DEFAULT 0)`)
        run(`CREATE TABLE IF NOT EXISTS voice_transcriptions (
            id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, text TEXT NOT NULL,
            confidence REAL DEFAULT 0, isFinal INTEGER DEFAULT 1,
            durationMs INTEGER DEFAULT 0, timestamp INTEGER NOT NULL)`)
        run(`CREATE TABLE IF NOT EXISTS voice_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
        run(`CREATE INDEX IF NOT EXISTS idx_voice_trans_session ON voice_transcriptions(sessionId)`)
        this.loadSettings()
        console.log('[VoiceInterface] Initialized')
      }
    } catch (error) {
      console.warn('[VoiceInterface] Init error (non-fatal):', error)
    }
  }

  startSession(): VoiceSession {
    const id = randomUUID()
    const now = Date.now()
    if (this.db) {
      this.db.prepare(`INSERT INTO voice_sessions (id, startedAt) VALUES (?, ?)`).run(id, now)
    }
    return { id, transcriptions: [], startedAt: now, totalDurationMs: 0, wordCount: 0 }
  }

  endSession(sessionId: string): VoiceSession | null {
    if (!this.db) return null
    this.db.prepare(`UPDATE voice_sessions SET endedAt = ? WHERE id = ?`).run(Date.now(), sessionId)
    return this.getSession(sessionId)
  }

  getSession(sessionId: string): VoiceSession | null {
    if (!this.db) return null
    const row = this.db.prepare(`SELECT * FROM voice_sessions WHERE id = ?`).get(sessionId) as any
    if (!row) return null
    const transcriptions = this.getTranscriptions(sessionId)
    return { id: row.id, transcriptions, startedAt: row.startedAt, endedAt: row.endedAt || undefined, totalDurationMs: row.totalDurationMs, wordCount: row.wordCount }
  }

  listSessions(limit: number = 20): Array<Omit<VoiceSession, 'transcriptions'>> {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM voice_sessions ORDER BY startedAt DESC LIMIT ?`).all(limit) as any[]).map(r => ({
      id: r.id, transcriptions: [], startedAt: r.startedAt, endedAt: r.endedAt || undefined, totalDurationMs: r.totalDurationMs, wordCount: r.wordCount,
    }))
  }

  addTranscription(sessionId: string, text: string, confidence: number, isFinal: boolean, durationMs: number): VoiceTranscription {
    const id = randomUUID()
    const now = Date.now()
    if (this.db) {
      this.db.prepare(`INSERT INTO voice_transcriptions (id, sessionId, text, confidence, isFinal, durationMs, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, sessionId, text, confidence, isFinal ? 1 : 0, durationMs, now)
      const words = text.split(/\s+/).filter(Boolean).length
      this.db.prepare(`UPDATE voice_sessions SET totalDurationMs = totalDurationMs + ?, wordCount = wordCount + ? WHERE id = ?`)
        .run(durationMs, words, sessionId)
    }
    return { id, sessionId, text, confidence, isFinal, durationMs, timestamp: now }
  }

  getTranscriptions(sessionId: string): VoiceTranscription[] {
    if (!this.db) return []
    return (this.db.prepare(`SELECT * FROM voice_transcriptions WHERE sessionId = ? ORDER BY timestamp ASC`).all(sessionId) as any[]).map(r => ({
      id: r.id, sessionId: r.sessionId, text: r.text, confidence: r.confidence, isFinal: !!r.isFinal, durationMs: r.durationMs, timestamp: r.timestamp,
    }))
  }

  getSettings(): VoiceSettings { return { ...this.settings } }

  updateSettings(updates: Partial<VoiceSettings>): VoiceSettings {
    this.settings = { ...this.settings, ...updates }
    this.saveSettings()
    return { ...this.settings }
  }

  private loadSettings(): void {
    if (!this.db) return
    try {
      const rows = this.db.prepare(`SELECT key, value FROM voice_settings`).all() as any[]
      for (const row of rows) {
        try { (this.settings as any)[row.key] = JSON.parse(row.value) } catch { (this.settings as any)[row.key] = row.value }
      }
    } catch { /* non-fatal */ }
  }

  private saveSettings(): void {
    if (!this.db) return
    try {
      const stmt = this.db.prepare(`INSERT OR REPLACE INTO voice_settings (key, value) VALUES (?, ?)`)
      for (const [key, value] of Object.entries(this.settings)) { stmt.run(key, JSON.stringify(value)) }
    } catch { /* non-fatal */ }
  }

  getStats(): { totalSessions: number; totalTranscriptions: number; totalWords: number; totalDurationMs: number } {
    if (!this.db) return { totalSessions: 0, totalTranscriptions: 0, totalWords: 0, totalDurationMs: 0 }
    const sessions = (this.db.prepare(`SELECT COUNT(*) as c FROM voice_sessions`).get() as any)?.c || 0
    const transcriptions = (this.db.prepare(`SELECT COUNT(*) as c FROM voice_transcriptions`).get() as any)?.c || 0
    const words = (this.db.prepare(`SELECT SUM(wordCount) as s FROM voice_sessions`).get() as any)?.s || 0
    const duration = (this.db.prepare(`SELECT SUM(totalDurationMs) as s FROM voice_sessions`).get() as any)?.s || 0
    return { totalSessions: sessions, totalTranscriptions: transcriptions, totalWords: words, totalDurationMs: duration }
  }
}

export const voiceInterface = new VoiceInterface()
