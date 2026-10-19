'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface Track { id: string; title: string; duration?: number | null }
export interface Queue {
  materialId: string;
  materialSlug: string;
  materialTitle: string;
  author?: string;
  tracks: Track[];
}

interface PlayerState {
  queue: Queue | null;
  index: number;
  playing: boolean;
  time: number;
  duration: number;
  rate: number;
  sleepAt: number | null;      // timestamp em ms
  sleepEndOfTrack: boolean;
  error: string | null;
}

interface PlayerApi extends PlayerState {
  load: (q: Queue, index?: number, startAt?: number, autoplay?: boolean) => void;
  toggle: () => void;
  seek: (t: number) => void;
  skip: (delta: number) => void;
  goTo: (i: number) => void;
  setRate: (r: number) => void;
  setSleep: (minutes: number | 'track' | null) => void;
  setVolume: (v: number) => void;
}

const Ctx = createContext<PlayerApi | null>(null);
export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

async function signedUrl(fileId: string) {
  const res = await fetch(`/api/files/${fileId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 403 ? 'Você não tem acesso a este áudio.' : 'Não foi possível carregar o áudio.');
  return (await res.json()).url as string;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const lastSaved = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const [s, set] = useState<PlayerState>({
    queue: null, index: 0, playing: false, time: 0, duration: 0, rate: 1,
    sleepAt: null, sleepEndOfTrack: false, error: null,
  });
  const state = useRef(s);
  state.current = s;

  const save = useCallback(async (completed = false) => {
    const { queue, index } = state.current;
    const el = audio.current;
    if (!queue || !el) return;
    const track = queue.tracks[index];
    if (!track) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('media_progress').upsert({
      user_id: user.id, file_id: track.id, material_id: queue.materialId,
      position_seconds: Math.floor(el.currentTime), completed, updated_at: new Date().toISOString(),
    });
  }, []);

  const playIndex = useCallback(async (q: Queue, i: number, startAt = 0, autoplay = true) => {
    const el = audio.current;
    if (!el) return;
    set((p) => ({ ...p, queue: q, index: i, time: startAt, duration: q.tracks[i]?.duration ?? 0, error: null }));
    try {
      el.src = await signedUrl(q.tracks[i].id);
      el.playbackRate = state.current.rate;
      pendingSeek.current = startAt;
      if (autoplay) await el.play();
    } catch (e) {
      set((p) => ({ ...p, playing: false, error: e instanceof Error ? e.message : 'Erro ao reproduzir.' }));
    }
  }, []);

  useEffect(() => {
    const el = new Audio();
    el.preload = 'metadata';
    audio.current = el;
    const onTime = () => {
      set((p) => ({ ...p, time: el.currentTime }));
      if (Date.now() - lastSaved.current > 15000) { lastSaved.current = Date.now(); void save(); }
      const { sleepAt } = state.current;
      if (sleepAt && Date.now() >= sleepAt) { el.pause(); set((p) => ({ ...p, sleepAt: null })); }
    };
    const onMeta = () => {
      if (pendingSeek.current) { el.currentTime = pendingSeek.current; pendingSeek.current = null; }
      set((p) => ({ ...p, duration: el.duration }));
    };
    const onPlay = () => set((p) => ({ ...p, playing: true }));
    const onPause = () => { set((p) => ({ ...p, playing: false })); void save(); };
    const onEnded = () => {
      void save(true);
      const { queue, index, sleepEndOfTrack } = state.current;
      if (sleepEndOfTrack) { set((p) => ({ ...p, sleepEndOfTrack: false })); return; }
      if (queue && index + 1 < queue.tracks.length) void playIndex(queue, index + 1);
    };
    const onError = () => set((p) => ({ ...p, playing: false, error: 'Não foi possível tocar este arquivo.' }));
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    const beforeUnload = () => { void save(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      el.pause();
      window.removeEventListener('beforeunload', beforeUnload);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, [playIndex, save]);

  // Controles da tela de bloqueio / fones (Media Session)
  useEffect(() => {
    if (!('mediaSession' in navigator) || !s.queue) return;
    const t = s.queue.tracks[s.index];
    navigator.mediaSession.metadata = new MediaMetadata({ title: t?.title, artist: s.queue.author, album: s.queue.materialTitle });
    navigator.mediaSession.setActionHandler('seekbackward', () => api.skip(-15));
    navigator.mediaSession.setActionHandler('seekforward', () => api.skip(30));
    navigator.mediaSession.setActionHandler('previoustrack', () => api.goTo(s.index - 1));
    navigator.mediaSession.setActionHandler('nexttrack', () => api.goTo(s.index + 1));
  });

  const api: PlayerApi = useMemo(() => ({
    ...s,
    load: (q, index = 0, startAt = 0, autoplay = true) => {
      const cur = state.current;
      if (cur.queue?.materialId === q.materialId && cur.index === index && audio.current?.src) {
        if (autoplay) void audio.current.play();
        return;
      }
      void save();
      void playIndex(q, index, startAt, autoplay);
    },
    toggle: () => {
      const el = audio.current;
      if (!el || !state.current.queue) return;
      if (el.paused) void el.play(); else el.pause();
    },
    seek: (t) => { if (audio.current) audio.current.currentTime = Math.max(0, t); },
    skip: (d) => { if (audio.current) audio.current.currentTime = Math.max(0, audio.current.currentTime + d); },
    goTo: (i) => {
      const { queue } = state.current;
      if (!queue || i < 0 || i >= queue.tracks.length) return;
      void save();
      void playIndex(queue, i);
    },
    setRate: (r) => { if (audio.current) audio.current.playbackRate = r; set((p) => ({ ...p, rate: r })); },
    setSleep: (m) => set((p) => ({
      ...p,
      sleepAt: typeof m === 'number' ? Date.now() + m * 60000 : null,
      sleepEndOfTrack: m === 'track',
    })),
    setVolume: (v) => { if (audio.current) audio.current.volume = v; },
  }), [s, playIndex, save]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlayer fora do PlayerProvider');
  return ctx;
}
