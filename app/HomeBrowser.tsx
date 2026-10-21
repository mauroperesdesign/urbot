'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { artTone, formatDuration, primaryAction, TYPE_LABEL } from '@/lib/labels';
import type { MaterialType } from '@/lib/types';

export type HomeItem = {
  id: string; slug: string; title: string; type: MaterialType; coverUrl: string | null; authors: string;
  description: string | null; pageCount: number | null; duration: number | null; language: string;
  roots: string[]; featured: boolean;
};
export type HomeContinue = { id: string; slug: string; title: string; type: MaterialType; coverUrl: string | null; percent: number | null; href: string };

const LANG: Record<string, string> = { pt: 'Português', es: 'Espanhol', en: 'Inglês' };
const WIDE = '(min-width: 1280px)';

function Card({ m, sub, href, selected, onSelect, percent }: {
  m: { id: string; title: string; type: MaterialType; coverUrl: string | null }; sub?: string; href: string;
  selected?: boolean; onSelect?: () => void; percent?: number | null;
}) {
  return (
    <Link href={href} className="bcard" aria-current={selected ? 'true' : undefined}
      onClick={(e) => {
        // Na tela larga o clique mostra o material no painel ao lado; no celular abre a página
        if (onSelect && window.matchMedia(WIDE).matches) { e.preventDefault(); onSelect(); }
      }}>
      <span className="art" style={{ ['--art' as string]: artTone(m.id) }}><Cover title={m.title} type={m.type} url={m.coverUrl} seed={m.id} /></span>
      <span className="info">
        <b>{m.title}</b>
        {sub ? <span>{sub}</span> : null}
        {percent != null ? <span className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round(percent))}%` }} /></span> : null}
      </span>
    </Link>
  );
}

function Spotlight({ m }: { m: HomeItem | undefined }) {
  if (!m) return <aside className="spotlight" aria-label="Destaque"><p style={{ textAlign: 'center' }}>Os materiais publicados aparecem aqui.</p></aside>;
  const action = primaryAction(m.type);
  const stats = [
    m.pageCount ? { v: String(m.pageCount), l: 'Páginas' } : null,
    m.duration ? { v: formatDuration(m.duration), l: 'Duração' } : null,
    { v: TYPE_LABEL[m.type], l: 'Formato' },
    { v: LANG[m.language] ?? m.language.toUpperCase(), l: 'Idioma' },
  ].filter(Boolean).slice(0, 3) as { v: string; l: string }[];
  return (
    <aside className="spotlight" aria-label="Material selecionado" aria-live="polite">
      <div className="frame"><Cover title={m.title} type={m.type} url={m.coverUrl} seed={m.id} /></div>
      <h2>{m.title}</h2>
      <span className="by">{m.authors || 'Autor a confirmar'}</span>
      <div className="stats">
        {stats.map((s) => <div key={s.l}><b>{s.v}</b><span>{s.l}</span></div>)}
      </div>
      {m.description ? <p>{m.description}</p> : null}
      <Link href={`${action.base}/${m.slug}`} className="btn btn-primary">
        {action.label} <Icon name={action.base === '/ouvir' ? 'headphones' : 'book'} size={18} />
      </Link>
      <Link href={`/material/${m.slug}`} className="more">Ver detalhes do material</Link>
    </aside>
  );
}

export function HomeBrowser({ items, roots, continuing, pendingApproval }: {
  items: HomeItem[]; roots: { id: string; name: string; slug: string }[]; continuing: HomeContinue[]; pendingApproval: boolean;
}) {
  const recommended = useMemo(() => {
    // Destaques escolhidos pela administração primeiro; depois os que têm capa
    const rank = (i: HomeItem) => (i.featured ? 0 : i.coverUrl ? 1 : 2);
    return [...items].sort((a, b) => rank(a) - rank(b)).slice(0, 10);
  }, [items]);
  const [selectedId, setSelectedId] = useState<string | undefined>(recommended[0]?.id);
  const [root, setRoot] = useState<string | null>(null);
  const usedRoots = roots.filter((r) => items.some((i) => i.roots.includes(r.id)));
  const filtered = (root ? items.filter((i) => i.roots.includes(root)) : items).slice(0, 15);
  const current = roots.find((r) => r.id === root);
  const selected = items.find((i) => i.id === selectedId);
  const pick = (id: string) => () => setSelectedId(id);

  return (
    <div className="home">
      <div className="home-main">
        {pendingApproval ? (
          <p className="alert" style={{ margin: '0 0 16px' }}>
            Seu cadastro está aguardando aprovação da administração. Até lá, você vê apenas os materiais públicos.
          </p>
        ) : null}
        {continuing.length ? (
          <section className="panel" aria-labelledby="h-cont">
            <div className="panel-head"><h2 id="h-cont">Continue de onde parou</h2><Link className="pill-link" href="/minha-biblioteca">Ver tudo <Icon name="next" size={14} /></Link></div>
            <div className="shelf">
              {continuing.map((m) => <Card key={m.id} m={m} href={m.href} percent={m.percent} sub={m.percent != null ? `${Math.round(m.percent)}% concluído` : 'Em andamento'} />)}
            </div>
          </section>
        ) : null}

        <section className="panel" aria-labelledby="h-rec">
          <div className="panel-head"><h2 id="h-rec">Recomendados</h2><Link className="pill-link" href="/acervo">Ver todos <Icon name="next" size={14} /></Link></div>
          {recommended.length ? (
            <div className="shelf">
              {recommended.map((m) => <Card key={m.id} m={m} href={`/material/${m.slug}`} sub={m.authors || 'Autor a confirmar'} selected={m.id === selectedId} onSelect={pick(m.id)} />)}
            </div>
          ) : (
            <div className="empty"><b>O acervo ainda está vazio</b><span className="muted">Os materiais aparecem aqui quando forem publicados pela administração.</span></div>
          )}
        </section>

        {usedRoots.length ? (
          <section className="panel" aria-labelledby="h-cat">
            <div className="panel-head">
              <h2 id="h-cat">Categorias</h2>
              <Link className="pill-link" href={current ? `/acervo?categoria=${current.slug}` : '/acervo'} aria-label="Abrir no acervo com filtros">
                <Icon name="filter" size={15} /> Filtrar
              </Link>
            </div>
            <div className="chips" role="group" aria-label="Filtrar por categoria" style={{ marginBottom: 16 }}>
              <button type="button" className="chip" aria-pressed={!root} onClick={() => setRoot(null)}>Todas</button>
              {usedRoots.map((r) => <button key={r.id} type="button" className="chip" aria-pressed={root === r.id} onClick={() => setRoot(r.id)}>{r.name}</button>)}
            </div>
            <div className="grid-cards">
              {filtered.map((m) => <Card key={m.id} m={m} href={`/material/${m.slug}`} sub={m.authors || 'Autor a confirmar'} selected={m.id === selectedId} onSelect={pick(m.id)} />)}
            </div>
            {current ? (
              <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
                <Link className="btn" href={`/acervo?categoria=${current.slug}`}>Ver tudo em {current.name}</Link>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
      <Spotlight m={selected} />
    </div>
  );
}
