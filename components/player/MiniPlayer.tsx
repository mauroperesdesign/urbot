'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePlayer } from './PlayerProvider';
import { PauseIcon, PlayIcon, Icon } from '../Icon';

export function MiniPlayer() {
  const p = usePlayer();
  const path = usePathname();
  if (!p.queue || path.startsWith('/ouvir')) return null;
  const track = p.queue.tracks[p.index];
  const pct = p.duration ? (p.time / p.duration) * 100 : 0;
  return (
    <div className="mini-player" role="region" aria-label="Player de áudio">
      <div className="progress"><i style={{ width: `${pct}%` }} /></div>
      <div className="meta">
        <b>{track?.title}</b>
        <span>{p.queue.materialTitle} · faixa {p.index + 1} de {p.queue.tracks.length}</span>
      </div>
      <button type="button" onClick={() => p.skip(-15)} aria-label="Voltar 15 segundos">−15</button>
      <button type="button" className="play" onClick={p.toggle} aria-label={p.playing ? 'Pausar' : 'Reproduzir'}>
        {p.playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button type="button" onClick={() => p.skip(30)} aria-label="Avançar 30 segundos">+30</button>
      <Link href={`/ouvir/${p.queue.materialSlug}`} aria-label="Abrir player completo"
        style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'inherit' }}>
        <Icon name="chevronUp" />
      </Link>
    </div>
  );
}
