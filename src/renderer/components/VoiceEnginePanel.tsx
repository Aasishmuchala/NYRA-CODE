import React, { useState, useEffect } from 'react';

interface RecordingMetrics {
  isRecording: boolean;
  transcriptText: string;
  volumeLevel: number;
}

type RecordingState = 'idle' | 'recording' | 'processing';
type STTBackend = 'whisper-local' | 'openai-whisper' | 'system';
type TTSBackend = 'system' | 'openai-tts' | 'elevenlabs';

export default function VoiceEnginePanel() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [sttBackend, setSttBackend] = useState<STTBackend>('whisper-local');
  const [ttsBackend, setTtsBackend] = useState<TTSBackend>('system');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

  const handleMicrophoneClick = async () => {
    if (recordingState === 'idle') {
      try {
        setRecordingState('recording');
        await (window.nyra?.voiceEngine?.startRecording as any)?.();
      } catch (err) {
        console.error('Failed to start recording:', err);
        setRecordingState('idle');
      }
    } else if (recordingState === 'recording') {
      try {
        setRecordingState('processing');
        const result = await (window.nyra?.voiceEngine?.stopRecording as any)?.();
        if (result?.text) {
          setTranscript(result.text);
        }
        setRecordingState('idle');
      } catch (err) {
        console.error('Failed to stop recording:', err);
        setRecordingState('idle');
      }
    }
  };

  const handleTestTTS = async () => {
    try {
      setIsLoading(true);
      const sampleText = 'This is a test of the text-to-speech system. How does it sound?';
      await (window.nyra?.voiceEngine?.synthesize as any)?.(sampleText, ttsBackend);
    } catch (err) {
      console.error('Failed to synthesize:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-nyra-surface rounded-lg">
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

      {/* Microphone Button */}
      <div className="flex justify-center py-6">
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

      {/* Volume Level */}
      {recordingState === 'recording' && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400 uppercase">Volume Level</label>
          <div className="w-full bg-[#1a1816] rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sage to-[#D4785C] transition-all"
              style={{ width: `${volumeLevel}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 text-right">{Math.round(volumeLevel)}%</p>
        </div>
      )}

      {/* STT Backend */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-400 uppercase">Speech-to-Text Backend</label>
        <select
          value={sttBackend}
          onChange={(e) => setSttBackend(e.target.value as STTBackend)}
          className="w-full bg-[#1a1816] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 hover:border-gray-600 focus:outline-none focus:border-[#D4785C]"
        >
          <option value="whisper-local">Whisper (Local)</option>
          <option value="openai-whisper">OpenAI Whisper</option>
          <option value="system">System Default</option>
        </select>
      </div>

      {/* TTS Backend */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-400 uppercase">Text-to-Speech Backend</label>
        <select
          value={ttsBackend}
          onChange={(e) => setTtsBackend(e.target.value as TTSBackend)}
          className="w-full bg-[#1a1816] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 hover:border-gray-600 focus:outline-none focus:border-[#D4785C]"
        >
          <option value="system">System Default</option>
          <option value="openai-tts">OpenAI TTS</option>
          <option value="elevenlabs">ElevenLabs</option>
        </select>
      </div>

      {/* Transcript Display */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-400 uppercase">Last Transcript</label>
        <div className="bg-[#1a1816] border border-gray-700 rounded-lg p-3 min-h-16 max-h-24 overflow-y-auto">
          {transcript ? (
            <p className="text-sm text-gray-200 leading-relaxed">{transcript}</p>
          ) : (
            <p className="text-xs text-gray-500 italic">No transcript yet. Click the microphone to start recording.</p>
          )}
        </div>
      </div>

      {/* Test TTS Button */}
      <button
        onClick={handleTestTTS}
        disabled={isLoading}
        className="w-full bg-[#C9A87C] hover:bg-[#b89668] text-[#0d0b09] font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Speaking...' : 'Test TTS'}
      </button>
    </div>
  );
}
