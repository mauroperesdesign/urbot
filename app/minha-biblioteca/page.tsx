import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser, withCoverUrls, CARD_COLUMNS, toCard } from '@/lib/data';
import { MaterialCard, Cover } from '@/components/Cover';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Minha biblioteca', robots: { index: false } };

type Row = { id: string; slug: string; title: string; type: never; cover_path: string | null };

export default async function MyLibrary({ searchParams }: { searchParams: { senha?: string } }) {
  const { supabase, profile } = await requireUser('/minha-biblioteca');
  const [reading, listening, favs] = await Promise.all([
    supabase.from('reading_progress').select('percent, location, updated_at, materials(id, slug, title, type, cover_path)').order('updated_at', { ascending: false }).limit(12),
    supabase.from('media_progress').select('updated_at, completed, material_id, materials(id, slug, title, type, cover_path)').order('updated_at', { ascending: false }).limit(30),
    supabase.from('favorites').select(`created_at, materials(${CARD_COLUMNS})`).order('created_at', { ascending: false }),
  ]);

  const readRows = await withCoverUrls((reading.data ?? []).map((r) => ({ ...(r.materials as unknown as Row), percent: r.percent as number | null, location: r.location })));
  const seen = new Set<string>();
  const listenRows = await withCoverUrls((listening.data ?? []).filter((r) => !seen.has(r.material_id) && seen.add(r.material_id)).map((r) => r.materials as unknown as Row));
  const favRows = await withCoverUrls((favs.data ?? []).map((f) => toCard(f.materials as never)));

  return (
    <div className="container" style={{ marginTop: 24 }}>
      {searchParams.senha === 'ok' ? <p className="alert alert-ok">Senha atualizada.</p> : null}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 'clamp(38px, 6vw, 56px)' }}>Minha biblioteca</h1>
        <Link className="btn" href="/conta">Conta e preferências</Link>
      </div>
      {profile && !profile.approved && profile.role === 'member' ? (
        <p className="alert" style={{ marginTop: 12 }}>Seu acesso ao acervo restrito está aguardando aprovação da administração.</p>
      ) : null}

      <section className="section">
        <div className="section-head"><h2>Continuar lendo</h2></div>
        {readRows.length ? (
          <div className="shelf">{readRows.map((m) => (
            <Link key={m.id} href={`/ler/${m.slug}`} className="mcard">
              <Cover title={m.title} type={m.type} url={m.coverUrl} seed={m.id} />
              <b>{m.title}</b><span>Página {m.location}{m.percent != null ? ` · ${Math.round(m.percent)}%` : ''}</span>
            </Link>
          ))}</div>
        ) : <div className="empty"><span className="muted">Os livros e apostilas que você abrir aparecem aqui, com a página onde parou.</span></div>}
      </section>

      <section className="section">
        <div className="section-head"><h2>Continuar ouvindo</h2></div>
        {listenRows.length ? (
          <div className="shelf">{listenRows.map((m) => (
            <Link key={m.id} href={`/ouvir/${m.slug}`} className="mcard">
              <Cover title={m.title} type={m.type} url={m.coverUrl} seed={m.id} /><b>{m.title}</b>
            </Link>
          ))}</div>
        ) : <div className="empty"><span className="muted">Seu histórico de audição aparece aqui.</span></div>}
      </section>

      <section className="section">
        <div className="section-head"><h2>Favoritos</h2></div>
        {favRows.length ? <div className="grid-cards">{favRows.map((m) => <MaterialCard key={m.id} m={m} />)}</div>
          : <div className="empty"><span className="muted">Toque em “Adicionar aos favoritos” na página de um material.</span></div>}
      </section>
    </div>
  );
}
