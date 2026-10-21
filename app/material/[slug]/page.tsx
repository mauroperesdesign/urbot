import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession, isStaff, withCoverUrls, CARD_COLUMNS, toCard } from '@/lib/data';
import { Cover, MaterialCard } from '@/components/Cover';
import { FavoriteButton } from './FavoriteButton';
import { TYPE_LABEL, primaryAction, formatDuration } from '@/lib/labels';
import type { FileRow, Material } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function load(slug: string) {
  const { supabase } = await getSession();
  const { data } = await supabase.from('materials')
    .select('*, material_authors(position, role, authors(name, slug)), material_categories(categories(id, name, slug, parent_id)), publishers(name)')
    .eq('slug', slug).maybeSingle();
  return data as (Material & {
    material_authors: { position: number; role: string; authors: { name: string; slug: string } | null }[];
    material_categories: { categories: { id: string; name: string; slug: string; parent_id: string | null } | null }[];
    publishers: { name: string } | null;
  }) | null;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const m = await load(params.slug);
  if (!m) return { title: 'Material não encontrado' };
  const restricted = m.visibility === 'restricted' || m.status !== 'published';
  return {
    title: m.title,
    description: m.description?.slice(0, 160) ?? `${TYPE_LABEL[m.type]} do acervo da Biblioteca Umbandista.`,
    robots: restricted ? { index: false, follow: false } : undefined,
    openGraph: { title: m.title, type: 'book' },
  };
}

export default async function MaterialPage({ params }: { params: { slug: string } }) {
  const m = await load(params.slug);
  if (!m) notFound();
  const { supabase, user, profile } = await getSession();

  const [{ data: files }, { data: fav }, { data: progress }] = await Promise.all([
    supabase.from('files').select('id, role, title, position, duration_seconds, processing_status, path, external_url')
      .eq('material_id', m.id).in('role', ['main', 'track', 'supplementary']).order('position'),
    user ? supabase.from('favorites').select('material_id').eq('material_id', m.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from('reading_progress').select('location, percent').eq('material_id', m.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const fileRows = (files ?? []) as FileRow[];
  const tracks = fileRows.filter((f) => f.role === 'track');
  const main = fileRows.find((f) => f.role === 'main');
  const supplementary = fileRows.filter((f) => f.role === 'supplementary');
  const hasContent = m.type === 'audiobook' || m.type === 'audio' ? tracks.some((t) => t.path) : !!main?.path || !!main?.external_url;

  const categories = m.material_categories.map((c) => c.categories).filter(Boolean) as { id: string; name: string; slug: string }[];
  const authors = m.material_authors.sort((a, b) => a.position - b.position).filter((a) => a.authors);
  const [withCover] = await withCoverUrls([{ cover_path: m.cover_path }]);

  const firstCat = categories[0];
  const { data: relRows } = firstCat
    ? await supabase.from('materials').select(`${CARD_COLUMNS}, material_categories!inner(category_id)`)
        .eq('material_categories.category_id', firstCat.id).eq('status', 'published').neq('id', m.id).limit(5)
    : { data: [] };
  const related = await withCoverUrls((relRows ?? []).map((r) => toCard(r as never)));

  const action = primaryAction(m.type);
  const pct = (progress as { percent: number | null } | null)?.percent;

  return (
    <div className="container panel">
      <nav aria-label="Trilha de navegação" className="row muted" style={{ fontSize: 14 }}>
        <Link href="/acervo">Acervo</Link>
        {firstCat ? <><span aria-hidden="true">/</span><Link href={`/acervo?categoria=${firstCat.slug}`}>{firstCat.name}</Link></> : null}
      </nav>

      <div style={{ display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', marginTop: 20, alignItems: 'start' }}>
        <div className="stack" style={{ maxWidth: 340, width: '100%', justifySelf: 'center', ['--gap' as string]: '14px' }}>
          <Cover title={m.title} type={m.type} url={withCover.coverUrl} seed={m.id} />
          {hasContent ? (
            <Link href={`${action.base}/${m.slug}`} className="btn btn-primary" style={{ minHeight: 56, fontSize: 16 }}>
              {pct ? `Continuar · ${Math.round(pct)}%` : action.label}
            </Link>
          ) : (
            <p className="alert">O arquivo deste material ainda não foi enviado para a biblioteca.</p>
          )}
          {user ? <FavoriteButton materialId={m.id} initial={!!fav} /> : <Link className="btn" href={`/entrar?next=/material/${m.slug}`}>Entre para favoritar e salvar progresso</Link>}
        </div>

        <div className="stack" style={{ gridColumn: 'span 2', ['--gap' as string]: '18px', minWidth: 0 }}>
          <div className="row">
            <span className="badge">{TYPE_LABEL[m.type]}</span>
            {m.visibility === 'restricted' ? <span className="badge badge-dark">Acesso restrito</span> : null}
            {m.status !== 'published' ? <span className="badge badge-sand">{m.status === 'draft' ? 'Rascunho' : 'Arquivado'}</span> : null}
            {m.tradition ? <span className="badge badge-sand">Perspectiva: {m.tradition}</span> : null}
          </div>
          <h1 className="page-title-xl">{m.title}</h1>
          {m.subtitle ? <p className="serif" style={{ fontSize: 22, margin: 0, fontStyle: 'italic' }}>{m.subtitle}</p> : null}
          <p style={{ margin: 0, fontSize: 16 }} className="muted">
            {authors.length ? <>por {authors.map((a, i) => <span key={a.authors!.slug}>{i ? ', ' : ''}<b style={{ color: 'var(--ink)' }}>{a.authors!.name}</b></span>)}</> : 'Autor a confirmar'}
            {m.organizer ? <> · organização {m.organizer}</> : null}
          </p>
          {m.description ? <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{m.description}</p> : null}
          {categories.length ? (
            <div className="row">{categories.map((c) => <Link key={c.id} href={`/acervo?categoria=${c.slug}`} className="chip">{c.name}</Link>)}</div>
          ) : null}

          {tracks.length ? (
            <section className="card" style={{ padding: 8 }}>
              <h2 style={{ fontSize: 28, margin: '10px 12px' }}>Faixas</h2>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {tracks.map((t, i) => (
                  <li key={t.id}>
                    <Link href={`/ouvir/${m.slug}?faixa=${i + 1}`} className="row" style={{ minHeight: 52, padding: '0 12px', borderRadius: 14, color: 'var(--ink)', flexWrap: 'nowrap' }}>
                      <span className="badge badge-sand" style={{ minWidth: 30, justifyContent: 'center' }}>{i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{t.title}</span>
                      <span className="muted" style={{ fontSize: 13 }}>{formatDuration(t.duration_seconds)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
            <section className="card stack" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 22 }}>Ficha</h2>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 14 }}>
                {m.publishers?.name ? <><dt className="muted">Editora</dt><dd style={{ margin: 0 }}>{m.publishers.name}</dd></> : null}
                {m.year ? <><dt className="muted">Ano</dt><dd style={{ margin: 0 }}>{m.year}</dd></> : null}
                <dt className="muted">Idioma</dt><dd style={{ margin: 0 }}>{m.language === 'pt' ? 'Português' : m.language === 'es' ? 'Espanhol' : m.language === 'en' ? 'Inglês' : m.language}</dd>
                {m.page_count ? <><dt className="muted">Páginas</dt><dd style={{ margin: 0 }}>{m.page_count}</dd></> : null}
                {m.duration_seconds ? <><dt className="muted">Duração</dt><dd style={{ margin: 0 }}>{formatDuration(m.duration_seconds)}</dd></> : null}
                {m.isbn ? <><dt className="muted">ISBN</dt><dd style={{ margin: 0 }}>{m.isbn}</dd></> : null}
                {m.source_reference ? <><dt className="muted">Fonte</dt><dd style={{ margin: 0 }}>{m.source_reference}</dd></> : null}
              </dl>
            </section>
            <section className="card stack" style={{ padding: 20, background: 'var(--sand)', border: 0 }}>
              <h2 style={{ fontSize: 22 }}>Créditos e direitos</h2>
              <p style={{ margin: 0, fontSize: 14 }}>
                {m.rights_holder ? <>Titular: {m.rights_holder}. </> : null}
                {m.license ? <>Licença: {m.license}. </> : null}
                {m.access_conditions ?? (m.visibility === 'restricted' ? 'Material de uso interno, disponível para membros autorizados.' : null)}
                {!m.allow_download ? ' Sem download.' : null}
              </p>
              <Link href="/contato#direitos" style={{ fontWeight: 700, fontSize: 14 }}>Solicitação sobre direitos autorais</Link>
            </section>
          </div>

          {supplementary.length ? (
            <section className="stack">
              <h2 style={{ fontSize: 24 }}>Materiais complementares</h2>
              {supplementary.map((f) => <a key={f.id} href={`/api/files/${f.id}?open=1`} className="muted">{f.title || 'Arquivo complementar'}</a>)}
            </section>
          ) : null}

          {isStaff(profile) ? <Link href={`/admin/materiais/${m.id}`} className="btn" style={{ alignSelf: 'flex-start' }}>Editar no painel</Link> : null}
        </div>
      </div>

      {related.length ? (
        <section className="section">
          <div className="section-head"><h2>Relacionados</h2></div>
          <div className="shelf">{related.map((r) => <MaterialCard key={r.id} m={r} />)}</div>
        </section>
      ) : null}
    </div>
  );
}
