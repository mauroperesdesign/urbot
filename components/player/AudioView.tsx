'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RATES, usePlayer, type Queue } from './PlayerProvider';
import { formatDuration } from '@/lib/labels';
import { Icon, PauseIcon, PlayIcon } from '../Icon';

const SLEEP = [
  { label: 'Desligado', value: null },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '60 min', value: 60 },
  { label: 'Fim da faixa', value: 'track' as const },
];

export function AudioView({ queue, startIndex, startAt, coverUrl, canSave }: {
  queue: Queue; startIndex: number; startAt: number; coverUrl: string | null; canSave: boolean;
}) {
  const p = usePlayer();
  const [sleepIdx, setSleepIdx] = useState(0);
  const mine = p.queue?.materialId === queue.materialId;

  // Prepara a fila sem tocar automaticamente; se já estiver tocando este material, mantém
  useEffect(() => {
    if (!mine) p.load(queue, startIndex, startAt, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.materialId]);

  const track = queue.tracks[mine ? p.index : startIndex];
  const duration = mine && p.duration ? p.duration : track?.duration ?? 0;
  const time = mine ? p.time : startAt;

  return (
    <div className="container" style={{ maxWidth: 1100, marginTop: 24 }}>
      <Link href={`/material/${queue.materialSlug}`} className="row muted"><Icon name="back" size={18} /> Voltar ao material</Link>
      <div style={{ display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', marginTop: 16, alignItems: 'start' }}>
        <section className="stack" style={{ background: '#0B3A46', color: '#F6F3EC', borderRadius: 32, padding: 24, ['--gap' as string]: '18px' }} aria-label="Player">
          <div style={{ aspectRatio: '1', borderRadius: 24, overflow: 'hidden', background: '#9A4A2B', position: 'relative', maxWidth: 320, width: '100%', alignSelf: 'center' }}>
            {coverUrl ? <img src={coverUrl} alt={`Capa de ${queue.materialTitle}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span className="serif" style={{ position: 'absolute', left: 20, bottom: 20, right: 20, fontSize: 32, lineHeight: 1 }}>{queue.materialTitle}</span>}
          </div>
          <div className="stack" style={{ ['--gap' as string]: '2px' }}>
            <h1 style={{ fontSize: 30, lineHeight: 1.05 }}>{track?.title}</h1>
            <span style={{ color: '#BFD6DC', fontSize: 14 }}>{queue.materialTitle}{queue.author ? ` · ${queue.author}` : ''} · faixa {(mine ? p.index : startIndex) + 1} de {queue.tracks.length}</span>
          </div>
          <div className="stack" style={{ ['--gap' as string]: '4px' }}>
            <label htmlFor="seek" className="sr-only">Posição na faixa</label>
            <input id="seek" type="range" min={0} max={Math.max(1, Math.floor(duration))} value={Math.floor(time)}
              onChange={(e) => p.seek(Number(e.target.value))} disabled={!mine} style={{ width: '100%', accentColor: '#E7C47A' }} />
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, color: '#BFD6DC', fontVariantNumeric: 'tabular-nums' }}>
              <span>{formatDuration(time)}</span><span>−{formatDuration(Math.max(0, duration - time))}</span>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-ghost icon-btn" style={{ color: 'inherit' }} onClick={() => p.goTo(p.index - 1)} disabled={!mine || p.index === 0} aria-label="Faixa anterior">⏮</button>
            <button type="button" className="btn btn-ghost" style={{ color: 'inherit' }} onClick={() => p.skip(-15)} disabled={!mine} aria-label="Voltar 15 segundos">−15s</button>
            <button type="button" onClick={() => (mine ? p.toggle() : p.load(queue, startIndex, startAt, true))}
              aria-label={mine && p.playing ? 'Pausar' : 'Reproduzir'}
              style={{ width: 76, height: 76, borderRadius: '50%', border: 0, background: '#F6F3EC', color: '#0B3A46', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              {mine && p.playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
            </button>
            <button type="button" className="btn btn-ghost" style={{ color: 'inherit' }} onClick={() => p.skip(30)} disabled={!mine} aria-label="Avançar 30 segundos">+30s</button>
            <button type="button" className="btn btn-ghost icon-btn" style={{ color: 'inherit' }} onClick={() => p.goTo(p.index + 1)} disabled={!mine || p.index >= queue.tracks.length - 1} aria-label="Próxima faixa">⏭</button>
          </div>
          <div className="row" style={{ ['--gap' as string]: '8px' }}>
            <button type="button" className="btn" style={{ background: 'rgba(246,243,236,0.1)', color: 'inherit', borderColor: 'transparent' }}
              onClick={() => p.setRate(RATES[(RATES.indexOf(p.rate) + 1) % RATES.length])} aria-label="Velocidade de reprodução">
              {String(p.rate).replace('.', ',')}×
            </button>
            <button type="button" className="btn" aria-label="Temporizador para desligar"
              style={{ background: sleepIdx ? '#E7C47A' : 'rgba(246,243,236,0.1)', color: sleepIdx ? '#10201B' : 'inherit', borderColor: 'transparent' }}
              onClick={() => { const n = (sleepIdx + 1) % SLEEP.length; setSleepIdx(n); p.setSleep(SLEEP[n].value); }}>
              <Icon name="timer" size={18} /> {SLEEP[sleepIdx].label}
            </button>
            <label className="row" style={{ marginLeft: 'auto', fontSize: 13 }}>
              Volume <input type="range" min={0} max={100} defaultValue={100} onChange={(e) => p.setVolume(Number(e.target.value) / 100)} style={{ width: 90, accentColor: '#E7C47A' }} />
            </label>
          </div>
          {p.error && mine ? <p role="alert" style={{ margin: 0, color: '#F6C9B8' }}>{p.error}</p> : null}
          {!canSave ? <p style={{ margin: 0, fontSize: 13, color: '#BFD6DC' }}>Entre na sua conta para continuar de onde parou em qualquer aparelho.</p> : null}
        </section>

        <section className="card" style={{ padding: 8 }} aria-label="Faixas">
          <h2 style={{ fontSize: 28, margin: '10px 12px' }}>Faixas</h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {queue.tracks.map((t, i) => {
              const active = (mine ? p.index : startIndex) === i;
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => (mine ? p.goTo(i) : p.load(queue, i, 0, true))}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '0 12px', borderRadius: 14, border: 0, cursor: 'pointer', textAlign: 'left', background: active ? 'var(--sand)' : 'transparent' }}>
                    <span className="badge badge-sand" style={{ minWidth: 30, justifyContent: 'center', background: active ? 'var(--gold)' : undefined }}>{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{t.title}</span>
                    <span className="muted" style={{ fontSize: 13 }}>{active && mine && p.playing ? 'tocando' : formatDuration(t.duration)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
