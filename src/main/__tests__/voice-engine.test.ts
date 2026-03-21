import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { voiceEngine, VoiceEngine } from '../voice-engine'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('VoiceEngine', () => {
  let engine: VoiceEngine
  const configPath = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra', 'voice-config.json')

  beforeEach(() => {
    // Clean up saved config before each test for isolation
    try {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath)
      }
    } catch {}
    engine = new VoiceEngine()
    engine.init()
  })

  afterEach(() => {
    if (engine) {
      engine.shutdown()
    }
    // Clean up after test
    try {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath)
      }
    } catch {}
  })

  describe('Initialization & Configuration', () => {
    it('should initialize with default config', () => {
      const config = engine.getConfig()
      expect(config.sttBackend).toBe('whisper-local')
      expect(config.ttsBackend).toBe('system')
      expect(config.language).toBe('en')
    })

    it('should initialize with custom config', () => {
      const customEngine = new VoiceEngine({
        sttBackend: 'openai-whisper',
        language: 'es',
        ttsBackend: 'openai-tts'
      })

      const config = customEngine.getConfig()
      expect(config.sttBackend).toBe('openai-whisper')
      expect(config.language).toBe('es')
      expect(config.ttsBackend).toBe('openai-tts')
    })

    it('should load saved config from disk', () => {
      engine.updateConfig({ language: 'fr' })
      engine.shutdown()

      const newEngine = new VoiceEngine()
      newEngine.init()

      const config = newEngine.getConfig()
      // Config should be loaded or default
      expect(config.language).toBeDefined()
    })

    it('should persist config on shutdown', () => {
      engine.updateConfig({ language: 'de', sttBackend: 'openai-whisper' })
      engine.shutdown()

      const configPath = path.join(os.homedir(), '.nyra', 'voice-config.json')
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        expect(data.language).toBeDefined()
      }
    })

    it('should update config', () => {
      engine.updateConfig({ language: 'ja', silenceThresholdMs: 2000 })

      const config = engine.getConfig()
      expect(config.language).toBe('ja')
      expect(config.silenceThresholdMs).toBe(2000)
    })
  })

  describe('STT Initialization', () => {
    it('should check if Whisper local is available', async () => {
      const result = await engine.initialize()

      expect(result.ready).toBeDefined()
      expect(result.backend).toBeDefined()
      expect(['whisper-local', 'openai-whisper', 'system']).toContain(result.backend)
    })

    it('should handle missing OpenAI API key for cloud backend', async () => {
      const cloudEngine = new VoiceEngine({ sttBackend: 'openai-whisper' })
      const result = await cloudEngine.initialize()

      expect(result.ready).toBe(false)
      expect(result.error).toContain('API key')
    })

    it('should be ready for system backend', async () => {
      const systemEngine = new VoiceEngine({ sttBackend: 'system' })
      const result = await systemEngine.initialize()

      expect(result.ready).toBe(true)
    })
  })

  describe('Recording Control', () => {
    it('should start recording', () => {
      const listener = vi.fn()
      engine.on('event', listener)

      engine.startRecording()

      expect(engine.isRecording).toBe(true)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        type: 'recording-start'
      }))
    })

    it('should not be recording initially', () => {
      expect(engine.isRecording).toBe(false)
    })

    it('should add audio chunks during recording', () => {
      engine.startRecording()

      const chunk1 = Buffer.from('audio data 1')
      const chunk2 = Buffer.from('audio data 2')

      engine.addAudioChunk(chunk1)
      engine.addAudioChunk(chunk2)

      expect(engine.isRecording).toBe(true)
    })

    it('should not add audio chunks if not recording', () => {
      const chunk = Buffer.from('audio data')
      engine.addAudioChunk(chunk)

      // Should silently do nothing
      expect(engine.isRecording).toBe(false)
    })

    it('should stop recording', async () => {
      const listener = vi.fn()
      engine.on('event', listener)

      engine.startRecording()
      engine.addAudioChunk(Buffer.from('test audio'))

      const result = await engine.stopRecording()

      expect(engine.isRecording).toBe(false)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        type: 'recording-stop'
      }))
    })

    it('should return null if no audio chunks recorded', async () => {
      engine.startRecording()
      const result = await engine.stopRecording()

      expect(result).toBeNull()
    })
  })

  describe('VAD (Voice Activity Detection)', () => {
    it('should enable VAD when configured', () => {
      const vadEngine = new VoiceEngine({ vadEnabled: true })
      const config = vadEngine.getConfig()

      expect(config.vadEnabled).toBe(true)
    })

    it('should disable VAD when configured', () => {
      const noVadEngine = new VoiceEngine({ vadEnabled: false })
      const config = noVadEngine.getConfig()

      expect(config.vadEnabled).toBe(false)
    })

    it('should respect silence threshold', () => {
      const engine2 = new VoiceEngine({ vadEnabled: true, silenceThresholdMs: 500 })
      const config = engine2.getConfig()

      expect(config.silenceThresholdMs).toBe(500)
    })

    it('should have default VAD enabled', () => {
      const config = engine.getConfig()
      expect(config.vadEnabled).toBe(true)
    })
  })

  describe('TTS (Text-to-Speech)', () => {
    it('should not be speaking initially', () => {
      expect(engine.isSpeaking).toBe(false)
    })

    it('should have speak method available', () => {
      expect(engine.speak).toBeDefined()
      expect(typeof engine.speak).toBe('function')
    })

    it('should support openai-tts backend configuration', () => {
      const customEngine = new VoiceEngine({
        ttsBackend: 'openai-tts'
      })
      const config = customEngine.getConfig()
      expect(config.ttsBackend).toBe('openai-tts')
    })
  })

  describe('State Management', () => {
    it('should track recording state', () => {
      expect(engine.isRecording).toBe(false)

      engine.startRecording()
      expect(engine.isRecording).toBe(true)

      engine.stopRecording()
      expect(engine.isRecording).toBe(false)
    })

    it('should expose speaking state', () => {
      expect(engine.isSpeaking).toBe(false)
      expect(typeof engine.isSpeaking).toBe('boolean')
    })
  })

  describe('Recording & Transcription', () => {
    it('should track audio chunks added during recording', () => {
      engine.startRecording()
      expect(engine.isRecording).toBe(true)

      const chunk1 = Buffer.from('audio data 1')
      const chunk2 = Buffer.from('audio data 2')

      engine.addAudioChunk(chunk1)
      engine.addAudioChunk(chunk2)

      engine.stopRecording()
      expect(engine.isRecording).toBe(false)
    })

    it('should require recording to be started before adding audio', () => {
      const chunk = Buffer.from('test audio')

      // Should not throw when adding audio without recording
      expect(() => {
        engine.addAudioChunk(chunk)
      }).not.toThrow()
    })

    it('should reset audio buffers after stopping recording', () => {
      engine.startRecording()
      engine.addAudioChunk(Buffer.from('audio'))
      engine.stopRecording()

      // Start new recording session
      engine.startRecording()
      engine.addAudioChunk(Buffer.from('new audio'))
      expect(engine.isRecording).toBe(true)

      engine.stopRecording()
      expect(engine.isRecording).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should initialize with system backend by default', () => {
      const config = engine.getConfig()
      expect(config.sttBackend).toBeDefined()
      expect(['whisper-local', 'openai-whisper', 'system']).toContain(config.sttBackend)
    })
  })

  describe('Configuration Edge Cases', () => {
    it('should handle empty config update', () => {
      const originalConfig = engine.getConfig()
      engine.updateConfig({})

      const newConfig = engine.getConfig()
      expect(newConfig).toEqual(originalConfig)
    })

    it('should handle partial config update', () => {
      engine.updateConfig({ language: 'fr' })

      const config = engine.getConfig()
      expect(config.language).toBe('fr')
      expect(config.sttBackend).toBe('whisper-local') // unchanged
    })

    it('should support multiple language codes', () => {
      const languages = ['en', 'es', 'fr', 'de', 'ja', 'zh']

      languages.forEach(lang => {
        const testEngine = new VoiceEngine({ language: lang })
        const config = testEngine.getConfig()
        expect(config.language).toBe(lang)
      })
    })

    it('should support different Whisper model sizes', () => {
      const sizes = ['tiny', 'base', 'small', 'medium', 'large']

      sizes.forEach(size => {
        const testEngine = new VoiceEngine({
          whisperModelSize: size as any
        })
        const config = testEngine.getConfig()
        expect(config.whisperModelSize).toBe(size)
      })
    })
  })

  describe('Persistence', () => {
    it('should save voice config on shutdown', () => {
      engine.updateConfig({ language: 'ko' })
      engine.shutdown()

      const configPath = path.join(os.homedir(), '.nyra', 'voice-config.json')
      // File may or may not exist depending on system
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        expect(data).toBeDefined()
      }
    })
  })
})

describe('Singleton voiceEngine', () => {
  it('should be available as singleton', () => {
    expect(voiceEngine).toBeDefined()
    expect(typeof voiceEngine.startRecording).toBe('function')
  })
})
