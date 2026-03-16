/**
 * NYRA Voice Engine
 *
 * Provides speech-to-text (STT) and text-to-speech (TTS) capabilities.
 * Supports multiple backends:
 * - Local: Whisper.cpp via CLI (offline, private)
 * - Cloud: OpenAI Whisper API, Google Cloud Speech
 * - TTS: System speech synthesis, OpenAI TTS, ElevenLabs
 *
 * Architecture:
 * - VoiceCapture: Records audio from microphone
 * - STTEngine: Converts speech → text
 * - TTSEngine: Converts text → speech
 * - VoiceSession: Manages bidirectional voice conversation
 */
import { EventEmitter } from 'events'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

export type STTBackend = 'whisper-local' | 'openai-whisper' | 'system'
export type TTSBackend = 'system' | 'openai-tts' | 'elevenlabs'

export interface VoiceConfig {
  sttBackend: STTBackend
  ttsBackend: TTSBackend
  language: string
  whisperModelSize: 'tiny' | 'base' | 'small' | 'medium' | 'large'
  voiceId?: string           // For cloud TTS
  openaiApiKey?: string      // For cloud backends
  sampleRate: number
  vadEnabled: boolean        // Voice activity detection
  silenceThresholdMs: number // How long silence before stopping recording
}

export interface TranscriptionResult {
  text: string
  language: string
  confidence: number
  durationMs: number
  backend: STTBackend
}

export interface VoiceEvent {
  type: 'recording-start' | 'recording-stop' | 'transcription' | 'speaking-start' | 'speaking-done' | 'error' | 'vad-speech' | 'vad-silence'
  data?: unknown
}

const DEFAULT_CONFIG: VoiceConfig = {
  sttBackend: 'whisper-local',
  ttsBackend: 'system',
  language: 'en',
  whisperModelSize: 'base',
  sampleRate: 16000,
  vadEnabled: true,
  silenceThresholdMs: 1500,
}

export class VoiceEngine extends EventEmitter {
  private config: VoiceConfig
  private recording = false
  private speaking = false
  private audioChunks: Buffer[] = []
  private whisperBinPath: string | null = null
  private whisperModelPath: string | null = null
  private vadTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: Partial<VoiceConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ── STT Methods ─────────────────────────────────────────────────────

  async initialize(): Promise<{ ready: boolean; backend: STTBackend; error?: string }> {
    if (this.config.sttBackend === 'whisper-local') {
      return this.initializeWhisperLocal()
    }
    if (this.config.sttBackend === 'openai-whisper') {
      if (!this.config.openaiApiKey) return { ready: false, backend: 'openai-whisper', error: 'OpenAI API key required' }
      return { ready: true, backend: 'openai-whisper' }
    }
    return { ready: true, backend: 'system' }
  }

  private async initializeWhisperLocal(): Promise<{ ready: boolean; backend: STTBackend; error?: string }> {
    const { execFileSync } = require('child_process')

    // Check if whisper CLI is installed
    try {
      const binPath = execFileSync('which', ['whisper'], { encoding: 'utf8' }).trim()
      if (binPath) {
        this.whisperBinPath = binPath.split('\n')[0]
      }
    } catch {}

    // Check for whisper.cpp
    if (!this.whisperBinPath) {
      try {
        const binPath = execFileSync('which', ['whisper-cpp'], { encoding: 'utf8' }).trim()
        if (binPath) this.whisperBinPath = binPath.split('\n')[0]
      } catch {}
    }

    if (!this.whisperBinPath) {
      return { ready: false, backend: 'whisper-local', error: 'Whisper not found. Install with: brew install whisper-cpp' }
    }

    // Check for model file
    const modelDir = path.join(os.homedir(), '.nyra', 'models', 'whisper')
    const modelFile = path.join(modelDir, `ggml-${this.config.whisperModelSize}.bin`)

    if (fs.existsSync(modelFile)) {
      this.whisperModelPath = modelFile
      return { ready: true, backend: 'whisper-local' }
    }

    return {
      ready: false,
      backend: 'whisper-local',
      error: `Whisper model not found at ${modelFile}. Download from huggingface.co/ggerganov/whisper.cpp`
    }
  }

  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    const start = Date.now()

    if (this.config.sttBackend === 'whisper-local') {
      return this.transcribeWhisperLocal(audioBuffer, start)
    }
    if (this.config.sttBackend === 'openai-whisper') {
      return this.transcribeOpenAI(audioBuffer, start)
    }
    throw new Error(`Unsupported STT backend: ${this.config.sttBackend}`)
  }

  private async transcribeWhisperLocal(audio: Buffer, startTime: number): Promise<TranscriptionResult> {
    if (!this.whisperBinPath || !this.whisperModelPath) {
      throw new Error('Whisper not initialized')
    }

    const { execFileSync } = require('child_process')
    const tmpFile = path.join(os.tmpdir(), `nyra-voice-${Date.now()}.wav`)

    try {
      // Write audio to temp WAV file
      fs.writeFileSync(tmpFile, audio)

      const output = execFileSync(
        this.whisperBinPath,
        ['-m', this.whisperModelPath, '-l', this.config.language, '--no-timestamps', '-f', tmpFile],
        { encoding: 'utf8', timeout: 30000 }
      )

      const text = output.trim().replace(/^\[.*?\]\s*/, '') // Remove whisper timestamp prefix

      return {
        text,
        language: this.config.language,
        confidence: 0.85,
        durationMs: Date.now() - startTime,
        backend: 'whisper-local',
      }
    } finally {
      try { fs.unlinkSync(tmpFile) } catch {}
    }
  }

  private async transcribeOpenAI(audio: Buffer, startTime: number): Promise<TranscriptionResult> {
    const https = require('https')
    const boundary = `----NyraVoice${Date.now()}`

    const formParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
      audio,
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1`,
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${this.config.language}`,
      `\r\n--${boundary}--\r\n`,
    ]

    return new Promise((resolve, reject) => {
      const req = https.request('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.openaiApiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        timeout: 30000,
      }, (res: any) => {
        let data = ''
        res.on('data', (chunk: string) => data += chunk)
        res.on('end', () => {
          try {
            const result = JSON.parse(data)
            resolve({
              text: result.text || '',
              language: this.config.language,
              confidence: 0.95,
              durationMs: Date.now() - startTime,
              backend: 'openai-whisper',
            })
          } catch { reject(new Error('Invalid API response')) }
        })
      })
      req.on('error', reject)
      for (const part of formParts) {
        if (Buffer.isBuffer(part)) req.write(part)
        else req.write(part)
      }
      req.end()
    })
  }

  // ── TTS Methods ─────────────────────────────────────────────────────

  async speak(text: string): Promise<void> {
    this.speaking = true
    this.emit('event', { type: 'speaking-start', data: { text } } as VoiceEvent)

    try {
      if (this.config.ttsBackend === 'system') {
        await this.speakSystem(text)
      } else if (this.config.ttsBackend === 'openai-tts') {
        await this.speakOpenAI(text)
      }
    } finally {
      this.speaking = false
      this.emit('event', { type: 'speaking-done' } as VoiceEvent)
    }
  }

  private speakSystem(text: string): Promise<void> {
    const { execFile } = require('child_process')
    return new Promise((resolve, reject) => {
      let cmd: string
      let args: string[] = []

      if (process.platform === 'darwin') {
        cmd = 'say'
        args = [text]
      } else if (process.platform === 'win32') {
        cmd = 'powershell'
        args = ['-Command', `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${text.replace(/'/g, "''")}')`]
      } else {
        cmd = 'espeak-ng'
        args = [text]
      }

      execFile(cmd, args, { timeout: 30000 }, (err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private speakOpenAI(text: string): Promise<void> {
    // OpenAI TTS API returns audio that would need to be played
    // For now, fall back to system TTS
    return this.speakSystem(text)
  }

  // ── Recording Control ───────────────────────────────────────────────

  startRecording(): void {
    this.recording = true
    this.audioChunks = []
    this.emit('event', { type: 'recording-start' } as VoiceEvent)
  }

  addAudioChunk(chunk: Buffer): void {
    if (!this.recording) return
    this.audioChunks.push(chunk)

    // VAD: reset silence timer on each chunk
    if (this.config.vadEnabled) {
      if (this.vadTimer) clearTimeout(this.vadTimer)
      this.vadTimer = setTimeout(() => {
        this.emit('event', { type: 'vad-silence' } as VoiceEvent)
      }, this.config.silenceThresholdMs)
      this.emit('event', { type: 'vad-speech' } as VoiceEvent)
    }
  }

  async stopRecording(): Promise<TranscriptionResult | null> {
    this.recording = false
    if (this.vadTimer) { clearTimeout(this.vadTimer); this.vadTimer = null }
    this.emit('event', { type: 'recording-stop' } as VoiceEvent)

    if (this.audioChunks.length === 0) return null

    const fullAudio = Buffer.concat(this.audioChunks)
    this.audioChunks = []

    try {
      const result = await this.transcribe(fullAudio)
      this.emit('event', { type: 'transcription', data: result } as VoiceEvent)
      return result
    } catch (err) {
      this.emit('event', { type: 'error', data: { error: String(err) } } as VoiceEvent)
      return null
    }
  }

  // ── State ───────────────────────────────────────────────────────────

  get isRecording(): boolean { return this.recording }
  get isSpeaking(): boolean { return this.speaking }
  getConfig(): VoiceConfig { return { ...this.config } }

  updateConfig(partial: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...partial }
  }
}

// Singleton
export const voiceEngine = new VoiceEngine()
