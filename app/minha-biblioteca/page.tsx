import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser, withCoverUrls, CARD_COLUMNS, toCard } from '@/lib/data';
import { MaterialCard, BookCard } from '@/components/Cover';
import { primaryAction } from '@/lib/labels';
import { OfflineList } from './OfflineList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Minha biblioteca', robots: { index: false } };

type Row = { id: string; slug: string; title: string; type: never; cover_path: string | null };

export default async function MyLibrary({ searchParams }: { searchParams: { senha?: string } }) {
  const { supabase, profile } = await requireUser('/minha-biblioteca');
  const [reading, listening, favs, lists, notes] = await Promise.all([
    supabase.from('reading_progress').select('percent, location, updated_at, materials(id, slug, title, type, cover_path)').order('updated_at', { ascending: false }).limit(12),
    supabase.from('media_progress').select('updated_at, completed, material_id, materials(id, slug, title, type, cover_path)').order('updated_at', { ascending: false }).limit(30),
    supabase.from('favorites').select(`created_at, materials(${CARD_COLUMNS})`).order('created_at', { ascending: false }),
    supabase.from('collections').select('id, name, collection_items(material_id)').order('created_at', { ascending: false }),
    supabase.from('annotations').select('id, location, quote, note, created_at, materials(slug, title, type)').order('created_at', { ascending: false }).limit(8),
  ]);

  const readRows = await withCoverUrls((reading.data ?? []).map((r) => ({ ...(r.materials as unknown as Row), percent: r.percent as number | null, location: r.location })));
  const seen = new Set<string>();
  const listenRows = await withCoverUrls((listening.data ?? []).filter((r) => !seen.has(r.material_id) && seen.add(r.material_id)).map((r) => r.materials as unknown as Row));
  const favRows = await withCoverUrls((favs.data ?? []).map((f) => toCard(f.materials as never)));

  return (
    <div className="container">
      {searchParams.senha === 'ok' ? <p className="alert alert-ok">Senha atualizada.</p> : null}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="page-title-xl">Minha biblioteca</h1>
        <Link className="btn" href="/conta">Conta e preferências</Link>
      </div>
      {profile && !profile.approved && profile.role === 'member' ? (
        <p className="alert" style={{ marginTop: 12 }}>Seu acesso ao acervo restrito está aguardando aprovação da administração.</p>
      ) : null}

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head"><h2>Continuar lendo</h2></div>
        {readRows.length ? (
          <div className="shelf">{readRows.map((m) => (
            <BookCard key={m.id} href={`/ler/${m.slug}`} title={m.title} type={m.type} url={m.coverUrl} seed={m.id}
              sub={String(m.location).startsWith('epubcfi(') ? `${Math.round(m.percent ?? 0)}% lido` : `Página ${m.location}${m.percent != null ? ` · ${Math.round(m.percent)}%` : ''}`} percent={m.percent} />
          ))}</div>
        ) : <div className="empty"><span className="muted">Os livros e apostilas que você abrir aparecem aqui, com a página onde parou.</span></div>}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Continuar ouvindo e assistindo</h2></div>
        {listenRows.length ? (
          <div className="shelf">{listenRows.map((m) => (
            <BookCard key={m.id} href={`${primaryAction(m.type).base}/${m.slug}`} title={m.title} type={m.type} url={m.coverUrl} seed={m.id}
              sub={primaryAction(m.type).base === '/assistir' ? 'Continuar assistindo' : 'Continuar ouvindo'} />
          ))}</div>
        ) : <div className="empty"><span className="muted">Seu histórico de audição aparece aqui.</span></div>}
      </section>

      <section className="panel" aria-labelledby="h-listas">
        <div className="panel-head"><h2 id="h-listas">Minhas listas</h2><Link className="pill-link" href="/listas">Gerenciar</Link></div>
        {(lists.data ?? []).length ? (
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {(lists.data ?? []).map((l) => <Link key={l.id} className="chip" href={`/listas/${l.id}`}>{l.name} · {(l.collection_items as unknown[]).length}</Link>)}
          </div>
        ) : <div className="empty"><span className="muted">Crie listas como “Para estudar” ou “Giras de Exu” em <Link href="/listas">Minhas listas</Link> ou pela página de um material.</span></div>}
      </section>

      <section className="panel" aria-labelledby="h-notas">
        <div className="panel-head"><h2 id="h-notas">Anotações recentes</h2></div>
        {(notes.data ?? []).length ? (
          <ol className="lessons">
            {(notes.data ?? []).filter((n) => n.materials).map((n) => {
              const mat = n.materials as unknown as { slug: string; title: string };
              return (
                <li key={n.id}>
                  <Link className="lesson" href={`/ler/${mat.slug}?local=${encodeURIComponent(n.location)}`}>
                    <span className="lesson-n" aria-hidden="true">✎</span>
                    <span className="lesson-t"><b>{n.note || (n.quote ? `“${n.quote.slice(0, 120)}”` : 'Anotação')}</b>
                      <small>{mat.title}{n.location.startsWith('epubcfi(') ? '' : ` · página ${n.location}`}</small></span>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : <div className="empty"><span className="muted">No leitor, use o botão de anotações para escrever sobre um trecho. Elas aparecem aqui.</span></div>}
      </section>

      <OfflineList />

      <section className="panel" id="favoritos">
        <div className="panel-head"><h2>Favoritos</h2></div>
        {favRows.length ? <div className="grid-cards">{favRows.map((m) => <MaterialCard key={m.id} m={m} />)}</div>
          : <div className="empty"><span className="muted">Toque em “Adicionar aos favoritos” na página de um material.</span></div>}
      </section>
    </div>
  );
}
