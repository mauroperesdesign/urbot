import Link from 'next/link';
import { artTone, coverTone, TYPE_LABEL, LISTEN_TYPES } from '@/lib/labels';
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

export function BookCard({ href, title, sub, type, url, seed, percent }: {
  href: string; title: string; sub?: string | null; type: MaterialType; url?: string | null; seed: string; percent?: number | null;
}) {
  return (
    <Link href={href} className="bcard">
      <span className="art" style={{ background: artTone(seed) }}><Cover title={title} type={type} url={url} seed={seed} /></span>
      <span className="info">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
        {percent != null ? <span className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round(percent))}%` }} /></span> : null}
      </span>
    </Link>
  );
}

export function MaterialCard({ m }: { m: MaterialCardData }) {
  return <BookCard href={`/material/${m.slug}`} title={m.title} sub={m.authors || 'Autor a confirmar'} type={m.type} url={m.coverUrl} seed={m.id} />;
}
