import React, { useState, useEffect, useCallback } from 'react';

type RecordingState = 'idle' | 'recording' | 'processing';
type STTBackend = 'whisper-local' | 'openai-whisper' | 'system';
type TTSBackend = 'system' | 'openai-tts' | 'elevenlabs';

interface VoiceConfig {
  sttBackend: STTBackend;
  ttsBackend: TTSBackend;
  sampleRate?: number;
  language?: string;
}

interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
  backend: STTBackend;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function VoiceEnginePanel() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [config, setConfig] = useState<VoiceConfig>({
    sttBackend: 'whisper-local',
    ttsBackend: 'system',
  });
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [transcriptHistory, setTranscriptHistory] = useState<TranscriptEntry[]>([]);
  const [customSpeakText, setCustomSpeakText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // Volume level animation when recording
  useEffect(() => {
    if (recordingState === 'recording') {
      const interval = setInterval(() => {
        setVolumeLevel(prev => {
          const val = Math.random() * 100;
          return Math.max(prev - 5, Math.min(100, val));
        });
      }, 100);
      return () => clearInterval(interval);
    } else {
      setVolumeLevel(0);
    }
  }, [recordingState]);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const cfg = await window.nyra.voiceEngine.getConfig();
      if (cfg) {
        setConfig(prev => ({ ...prev, ...cfg }));
      }
    } catch (err) {
      console.error('Failed to load voice config:', err);
      addToast('Failed to load voice engine config', 'error');
    }
  };

  const saveConfig = async () => {
    try {
      setIsLoading(true);
      await window.nyra.voiceEngine.updateConfig(config);
      addToast('Voice engine config saved successfully', 'success');
      setShowConfigPanel(false);
    } catch (err) {
      console.error('Failed to save config:', err);
      addToast('Failed to save voice engine config', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMicrophoneClick = async () => {
    if (recordingState === 'idle') {
      try {
        setRecordingState('recording');
        await window.nyra.voiceEngine.startRecording();
      } catch (err) {
        console.error('Failed to start recording:', err);
        addToast('Failed to start recording', 'error');
        setRecordingState('idle');
      }
    } else if (recordingState === 'recording') {
      try {
        setRecordingState('processing');
        const result = await window.nyra.voiceEngine.stopRecording();
        if (result?.text) {
          const entry: TranscriptEntry = {
            id: Math.random().toString(36).substr(2, 9),
            text: result.text,
            timestamp: Date.now(),
            backend: config.sttBackend,
          };
          setTranscriptHistory(prev => [entry, ...prev]);
          addToast('Transcription completed', 'success');
        }
        setRecordingState('idle');
      } catch (err) {
        console.error('Failed to stop recording:', err);
        addToast('Failed to stop recording', 'error');
        setRecordingState('idle');
      }
    }
  };

  const handleTranscribeFile = async () => {
    try {
      // This would open a file picker in a real implementation
      // For now, show a placeholder
      addToast('File transcription feature requires file picker implementation', 'info');
    } catch (err) {
      console.error('Failed to transcribe file:', err);
      addToast('Failed to transcribe file', 'error');
    }
  };

  const handleCustomSpeak = async () => {
    try {
      if (!customSpeakText.trim()) {
        addToast('Please enter text to speak', 'error');
        return;
      }
      setIsSpeaking(true);
      await window.nyra.voiceEngine.speak(customSpeakText, config.ttsBackend);
      addToast('Text spoken successfully', 'success');
      setCustomSpeakText('');
    } catch (err) {
      console.error('Failed to speak text:', err);
      addToast('Failed to speak text', 'error');
    } finally {
      setIsSpeaking(false);
    }
  };

  const handleTestTTS = async () => {
    try {
      setIsSpeaking(true);
      const sampleText = 'This is a test of the text-to-speech system. How does it sound?';
      await window.nyra.voiceEngine.speak(sampleText, config.ttsBackend);
      addToast('Test spoken successfully', 'success');
    } catch (err) {
      console.error('Failed to test TTS:', err);
      addToast('Failed to test text-to-speech', 'error');
    } finally {
      setIsSpeaking(false);
    }
  };

  const clearTranscriptHistory = () => {
    setTranscriptHistory([]);
    addToast('Transcript history cleared', 'info');
  };

  return (
    <div className="space-y-6 p-6 bg-nyra-surface rounded-lg flex flex-col h-full">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 space-y-2 z-50 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg text-sm font-semibold pointer-events-auto animate-in fade-in slide-in-from-right ${
              toast.type === 'success' ? 'bg-sage text-[#0d0b09]' :
              toast.type === 'error' ? 'bg-red-500 text-white' :
              'bg-blue-500 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-gray-100">Voice Engine</h2>
        <p className="text-sm text-gray-400">Speech recognition and synthesis</p>
      </div>

      {/* Status Indicator */}
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${
          recordingState === 'idle' ? 'bg-sage' :
          recordingState === 'recording' ? 'bg-red-500 animate-pulse' :
          'bg-yellow-500'
        }`} />
        <span className="text-sm text-gray-300 capitalize">
          {recordingState === 'idle' ? 'Ready' :
           recordingState === 'recording' ? 'Recording' :
           'Processing'}
        </span>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        {/* Microphone Button */}
        <div className="flex justify-center py-4">
          <button
            onClick={handleMicrophoneClick}
            disabled={recordingState === 'processing'}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center font-bold text-lg transition-all ${
              recordingState === 'recording'
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/50 animate-pulse'
                : 'bg-[#D4785C] text-white hover:bg-[#c8653a] active:scale-95'
            } ${recordingState === 'processing' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 16.91c-1.48 1.46-3.51 2.36-5.77 2.36-2.26 0-4.29-.9-5.77-2.36l-1.1 1.1c1.86 1.86 4.41 3 7.07 3s5.21-1.14 7.07-3l-1.1-1.1zM12 20c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1z" />
            </svg>
          </button>
        </div>

        {/* Volume Level Visualizer */}
        {recordingState === 'recording' && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase">Volume Level</p>
            <div className="flex items-end gap-1 h-16 justify-center">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 bg-gradient-to-t from-sage to-[#D4785C] rounded-t transition-all duration-100"
                  style={{
                    height: `${Math.max(10, (volumeLevel * (i + 1)) / 12)}%`,
                    opacity: i < volumeLevel / 10 ? 1 : 0.3,
                  }}
                />
              ))}
            </div>
            <p className="text-xs text-gray-500 text-center">{Math.round(volumeLevel)}%</p>
          </div>
        )}

        {/* Config Panel Toggle */}
        <button
          onClick={() => setShowConfigPanel(!showConfigPanel)}
          className="w-full bg-[#1a1816] border border-gray-700 hover:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 font-semibold transition-colors"
        >
          {showConfigPanel ? '▼ Hide Configuration' : '▶ Show Configuration'}
        </button>

        {/* Configuration Panel */}
        {showConfigPanel && (
          <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase">Speech-to-Text Backend</p>
            <select
              value={config.sttBackend}
              onChange={(e) => setConfig(prev => ({ ...prev, sttBackend: e.target.value as STTBackend }))}
              className="w-full bg-[#0d0b09] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 hover:border-gray-600 focus:outline-none focus:border-[#D4785C]"
            >
              <option value="whisper-local">Whisper (Local)</option>
              <option value="openai-whisper">OpenAI Whisper</option>
              <option value="system">System Default</option>
            </select>

            <p className="text-xs font-semibold text-gray-400 uppercase mt-3">Text-to-Speech Backend</p>
            <select
              value={config.ttsBackend}
              onChange={(e) => setConfig(prev => ({ ...prev, ttsBackend: e.target.value as TTSBackend }))}
              className="w-full bg-[#0d0b09] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 hover:border-gray-600 focus:outline-none focus:border-[#D4785C]"
            >
              <option value="system">System Default</option>
              <option value="openai-tts">OpenAI TTS</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>

            <button
              onClick={saveConfig}
              disabled={isLoading}
              className="w-full bg-[#D4785C] hover:bg-[#c8653a] disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors text-sm mt-3"
            >
              {isLoading ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        )}

        {/* Custom Speak Section */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">Speak Custom Text</p>
          <textarea
            value={customSpeakText}
            onChange={(e) => setCustomSpeakText(e.target.value)}
            placeholder="Enter text to speak..."
            className="w-full bg-[#1a1816] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4785C] resize-none h-20"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCustomSpeak}
              disabled={isSpeaking || !customSpeakText.trim()}
              className="flex-1 bg-[#D4785C] hover:bg-[#c8653a] disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
            >
              {isSpeaking ? 'Speaking...' : 'Speak'}
            </button>
            <button
              onClick={handleTestTTS}
              disabled={isSpeaking}
              className="flex-1 bg-[#C9A87C] hover:bg-[#b89668] disabled:opacity-50 text-[#0d0b09] font-semibold py-2 rounded-lg transition-colors text-sm"
            >
              {isSpeaking ? 'Speaking...' : 'Test TTS'}
            </button>
          </div>
        </div>

        {/* Transcribe File Button */}
        <button
          onClick={handleTranscribeFile}
          className="w-full bg-[#1a1816] border border-gray-700 hover:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 font-semibold transition-colors"
        >
          📁 Transcribe File
        </button>

        {/* Transcript History */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase">Transcript History</p>
            {transcriptHistory.length > 0 && (
              <button
                onClick={clearTranscriptHistory}
                className="text-xs text-gray-500 hover:text-gray-400 font-semibold"
              >
                Clear
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {transcriptHistory.length > 0 ? (
              transcriptHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-[#1a1816] border border-gray-700 rounded-lg p-3 space-y-1"
                >
                  <p className="text-xs text-gray-200 leading-relaxed">{entry.text}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span className="text-xs text-[#D4785C]">{entry.backend}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500 italic">No transcripts yet. Click the microphone to start recording.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}