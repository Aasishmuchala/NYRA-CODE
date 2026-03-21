/**
 * VoiceInput — Web Speech API microphone capture
 * Floating recording indicator with live transcript preview.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, X, Check } from 'lucide-react';
export const VoiceInput = ({ onTranscript, onClose }) => {
    const [state, setState] = useState('idle');
    const [transcript, setTranscript] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [volume, setVolume] = useState(0);
    const recognitionRef = useRef(null);
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const rafRef = useRef(null);
    const streamRef = useRef(null);
    // Volume visualiser
    const measureVolume = useCallback(() => {
        if (!analyserRef.current)
            return;
        const buf = new Uint8Array(analyserRef.current.fftSize);
        analyserRef.current.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++)
            sum += Math.abs(buf[i] - 128);
        setVolume(Math.min(1, (sum / buf.length) / 30));
        rafRef.current = requestAnimationFrame(measureVolume);
    }, []);
    const startListening = useCallback(async () => {
        const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
        if (!SR) {
            setErrorMsg('Speech recognition is not supported in this browser.');
            setState('error');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            const src = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            analyserRef.current = analyser;
            rafRef.current = requestAnimationFrame(measureVolume);
        }
        catch {
            // Volume visualiser optional — continue without it
        }
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';
        recognitionRef.current = rec;
        rec.onstart = () => setState('listening');
        rec.onerror = (e) => {
            setErrorMsg(e.error === 'not-allowed' ? 'Microphone access denied.' : `Error: ${e.error}`);
            setState('error');
        };
        rec.onresult = (e) => {
            let interim = '', final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal)
                    final += t;
                else
                    interim += t;
            }
            setTranscript(prev => {
                const base = prev.replace(/…$/, '');
                if (final)
                    return (base + ' ' + final).trim();
                return (base + (interim ? ' ' + interim + '…' : '')).trim();
            });
        };
        rec.start();
    }, [measureVolume]);
    const stopListening = useCallback(() => {
        recognitionRef.current?.stop();
        if (rafRef.current)
            cancelAnimationFrame(rafRef.current);
        streamRef.current?.getTracks().forEach(t => t.stop());
        audioCtxRef.current?.close();
        setVolume(0);
        setState('idle');
    }, []);
    useEffect(() => {
        startListening();
        return () => {
            recognitionRef.current?.stop();
            if (rafRef.current)
                cancelAnimationFrame(rafRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
            audioCtxRef.current?.close();
        };
    }, [startListening]);
    const handleConfirm = () => {
        const text = transcript.replace(/…$/, '').trim();
        if (text)
            onTranscript(text);
        onClose();
    };
    const pulseSize = 40 + volume * 24;
    return (<div className="fixed inset-0 z-50 flex items-end justify-center pb-32 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[420px] bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5" onClick={e => e.stopPropagation()}>
        {/* Visualiser */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center">
            {/* Pulse ring */}
            {state === 'listening' && (<div className="absolute rounded-full bg-blush-500/10 transition-all duration-75" style={{ width: pulseSize + 20, height: pulseSize + 20 }}/>)}
            <div className={`relative rounded-full flex items-center justify-center transition-all duration-75 ${state === 'listening' ? 'bg-blush-500/20' : state === 'error' ? 'bg-white/5' : 'bg-white/5'}`} style={{ width: state === 'listening' ? pulseSize : 48, height: state === 'listening' ? pulseSize : 48 }}>
              {state === 'error'
            ? <MicOff size={20} className="text-white/30"/>
            : <Mic size={18} className={state === 'listening' ? 'text-blush-400' : 'text-white/50'}/>}
            </div>
          </div>

          <p className="text-[11px] text-white/35 text-center">
            {state === 'listening' ? 'Listening…'
            : state === 'error' ? errorMsg
                : 'Starting microphone…'}
          </p>
        </div>

        {/* Transcript preview */}
        <div className="min-h-[60px] max-h-[120px] overflow-y-auto bg-white/[0.04] rounded-xl px-4 py-3">
          {transcript
            ? <p className="text-sm text-white/80 leading-relaxed">{transcript}</p>
            : <p className="text-sm text-white/20 italic">Your speech will appear here…</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-white/40 hover:text-white/70 rounded-xl hover:bg-white/[0.06] transition-colors">
            <X size={13}/> Cancel
          </button>
          {state === 'listening' && (<button onClick={stopListening} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-blush-400 hover:text-blush-400 rounded-xl hover:bg-blush-500/10 transition-colors border border-blush-500/20">
              <MicOff size={13}/> Stop
            </button>)}
          <button onClick={handleConfirm} disabled={!transcript.trim()} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium bg-terra-500 hover:bg-terra-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors">
            <Check size={13}/> Use Text
          </button>
        </div>
      </div>
    </div>);
};
