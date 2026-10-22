'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const RATES = [0.75, 1, 1.25, 1.5, 2];

// Vídeo com legendas, velocidade e posição salva (continua de onde parou, em qualquer aparelho)
export function VideoPlayer({ src, subtitles, fileId, materialId, resumeAt, canSave, poster }: {
  src: string; subtitles: { src: string; label: string; lang: string }[]; fileId: string; materialId: string;
  resumeAt: number; canSave: boolean; poster?: string | null;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const lastSave = useRef(0);
  const [rate, setRate] = useState(1);

  async function save(completed = false) {
    const v = video.current;
    if (!canSave || !v || !isFinite(v.currentTime)) return;
    lastSave.current = Date.now();
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('media_progress').upsert({
        user_id: user.id, file_id: fileId, material_id: materialId, position_seconds: Math.floor(v.currentTime),
        completed: completed || (v.duration > 0 && v.currentTime / v.duration > 0.95), updated_at: new Date().toISOString(),
      });
    } catch { /* sem conexão */ }
  }

  useEffect(() => { if (video.current) video.current.playbackRate = rate; }, [rate]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void save(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  });

  return (
    <div className="stack" style={{ ['--gap' as string]: '10px' }}>
      <video ref={video} src={src} controls playsInline preload="metadata" crossOrigin="anonymous" poster={poster ?? undefined}
        style={{ width: '100%', maxHeight: '75vh', borderRadius: 16, background: '#000' }}
        onLoadedMetadata={(e) => { const v = e.currentTarget; if (resumeAt > 5 && resumeAt < v.duration - 5) v.currentTime = resumeAt; }}
        onTimeUpdate={() => { if (Date.now() - lastSave.current > 10000) void save(); }}
        onPause={() => void save()} onEnded={() => void save(true)}>
        {subtitles.map((t, i) => <track key={t.src} kind="subtitles" src={t.src} label={t.label} srcLang={t.lang} default={i === 0} />)}
        Seu navegador não reproduz este vídeo.
      </video>
      <div className="row" role="group" aria-label="Velocidade">
        <span className="muted" style={{ fontSize: 13 }}>Velocidade</span>
        {RATES.map((r) => <button key={r} type="button" className="chip" aria-pressed={rate === r} onClick={() => setRate(r)}>{String(r).replace('.', ',')}×</button>)}
      </div>
    </div>
  );
}
