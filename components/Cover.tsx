import Link from 'next/link';
import { coverTone, TYPE_LABEL, LISTEN_TYPES } from '@/lib/labels';
import type { MaterialCardData, MaterialType } from '@/lib/types';

export function Cover({ title, type, url, seed }: { title: string; type: MaterialType; url?: string | null; seed: string }) {
  const [bg, orb] = coverTone(seed);
  const square = LISTEN_TYPES.includes(type);
  return (
    <div className={`cover${square ? ' square' : ''}`} style={{ background: bg }}>
      <span className="orb" style={{ background: orb }} />
      <span className="tag">{TYPE_LABEL[type]}</span>
      <span className="t">{title}</span>
      {url ? <img src={url} alt={`Capa de ${title}`} loading="lazy" /> : null}
    </div>
  );
}

export function MaterialCard({ m }: { m: MaterialCardData }) {
  return (
    <Link href={`/material/${m.slug}`} className="mcard">
      <Cover title={m.title} type={m.type} url={m.coverUrl} seed={m.id} />
      <b>{m.title}</b>
      <span>{m.authors || 'Autor a confirmar'}</span>
    </Link>
  );
}
