'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '../Icon';

export const VOICE_MAX_SECONDS = 10;

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

// Grava uma nota de voz de até 10 segundos (para sozinha no limite)
export function VoiceRecorder({ value, onChange }: { value: Blob | null; onChange: (b: Blob | null) => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'error'>('idle');
  const [left, setLeft] = useState(VOICE_MAX_SECONDS);
  const [error, setError] = useState('');
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const url = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = value ? URL.createObjectURL(value) : null;
    setPreview(url.current);
  }, [value]);
  useEffect(() => () => { clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  async function start() {
    setError('');
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) { setState('error'); setError('Este navegador não grava áudio.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer.current);
        setState('idle');
        onChange(new Blob(chunks, { type: (r.mimeType || mime || 'audio/webm').split(';')[0] }));
      };
      rec.current = r;
      r.start();
      setState('recording');
      setLeft(VOICE_MAX_SECONDS);
      const began = Date.now();
      timer.current = setInterval(() => {
        const remaining = VOICE_MAX_SECONDS - Math.floor((Date.now() - began) / 1000);
        setLeft(Math.max(0, remaining));
        if (remaining <= 0 && r.state === 'recording') r.stop();
      }, 200);
    } catch {
      setState('error');
      setError('Permita o uso do microfone para gravar.');
    }
  }

  return (
    <div className="voice-rec">
      {state === 'recording' ? (
        <button type="button" className="voice-btn rec" onClick={() => rec.current?.stop()} aria-label="Parar gravação">
          <Icon name="stop" size={16} /> Gravando… {left}s
        </button>
      ) : value ? (
        <>
          <audio src={preview ?? undefined} controls preload="metadata" />
          <button type="button" className="voice-btn" onClick={() => onChange(null)} aria-label="Apagar gravação">Refazer</button>
        </>
      ) : (
        <button type="button" className="voice-btn" onClick={start}><Icon name="mic" size={16} /> Gravar voz (até {VOICE_MAX_SECONDS}s)</button>
      )}
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}

// Toca uma nota de voz guardada (URL assinada só para a dona da nota)
export function VoicePlayer({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  return src ? <audio src={src} controls autoPlay preload="none" className="voice-audio" /> : (
    <button type="button" className="voice-btn" disabled={failed} onClick={async (e) => {
      e.stopPropagation();
      const { data } = await createClient().storage.from('notes').createSignedUrl(path, 3600);
      if (data?.signedUrl) setSrc(data.signedUrl); else setFailed(true);
    }}><Icon name="play" size={14} /> {failed ? 'Áudio indisponível' : 'Ouvir nota de voz'}</button>
  );
}
