import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession, isStaff, withCoverUrls, CARD_COLUMNS, toCard } from '@/lib/data';
import { courseLessons } from '@/lib/courses';
import { Cover, MaterialCard } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { ListPicker } from '@/components/ListPicker';
import { FavoriteButton } from './FavoriteButton';
import { TYPE_LABEL, LISTEN_TYPES, primaryAction, formatDuration } from '@/lib/labels';
import type { FileRow, Material } from '@/lib/types';

export const dynamic = 'force-dynamic';

const LANG: Record<string, string> = { pt: 'Português', es: 'Espanhol', en: 'Inglês' };

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

  const [{ data: files }, { data: fav }, { data: progress }, { data: lists }] = await Promise.all([
    supabase.from('files').select('id, role, title, position, duration_seconds, processing_status, path, external_url')
      .eq('material_id', m.id).in('role', ['main', 'track', 'supplementary']).order('position'),
    user ? supabase.from('favorites').select('material_id').eq('material_id', m.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from('reading_progress').select('location, percent').eq('material_id', m.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from('collections').select('id, name, collection_items(material_id)').order('created_at') : Promise.resolve({ data: null }),
  ]);
  const fileRows = (files ?? []) as FileRow[];
  const tracks = fileRows.filter((f) => f.role === 'track');
  const main = fileRows.find((f) => f.role === 'main');
  const supplementary = fileRows.filter((f) => f.role === 'supplementary');
  const isCourse = m.type === 'course';
  const course = isCourse ? await courseLessons(m.id) : null;
  const hasContent = isCourse ? !!course?.lessons.length : LISTEN_TYPES.includes(m.type) ? tracks.some((t) => t.path) : !!main?.path || !!main?.external_url;

  const categories = m.material_categories.map((c) => c.categories).filter(Boolean) as { id: string; name: string; slug: string }[];
  const authors = m.material_authors.sort((a, b) => a.position - b.position).filter((a) => a.authors);
  const [withCover] = await withCoverUrls([{ cover_path: m.cover_path }], { full: true });

  const firstCat = categories[0];
  const { data: relRows } = firstCat
    ? await supabase.from('materials').select(`${CARD_COLUMNS}, material_categories!inner(category_id)`)
        .eq('material_categories.category_id', firstCat.id).eq('status', 'published').neq('id', m.id).limit(8)
    : { data: [] };
  const related = await withCoverUrls((relRows ?? []).map((r) => toCard(r as never)));
  if (user) void supabase.from('access_events').insert({ material_id: m.id, user_id: user.id, event: 'view' }).then(() => undefined);

  const action = primaryAction(m.type);
  const pct = (progress as { percent: number | null } | null)?.percent;
  const myLists = ((lists ?? []) as { id: string; name: string; collection_items: { material_id: string }[] }[])
    .map((l) => ({ id: l.id, name: l.name, has: l.collection_items.some((i) => i.material_id === m.id) }));

  const stats = [
    m.page_count ? { v: String(m.page_count), l: 'Páginas' } : null,
    tracks.length ? { v: String(tracks.length), l: tracks.length === 1 ? 'Faixa' : 'Faixas' } : null,
    m.duration_seconds ? { v: formatDuration(m.duration_seconds), l: 'Duração' } : null,
    course ? { v: String(course.lessons.length), l: course.lessons.length === 1 ? 'Aula' : 'Aulas' } : null,
    { v: TYPE_LABEL[m.type], l: 'Formato' },
    { v: LANG[m.language] ?? m.language.toUpperCase(), l: 'Idioma' },
    m.year ? { v: String(m.year), l: 'Ano' } : null,
  ].filter(Boolean).slice(0, 4) as { v: string; l: string }[];

  const cta = isCourse && course?.next
    ? {
        href: course.next.href,
        label: course.done === course.lessons.length ? 'Rever o curso' : course.lessons.some((l) => l.status !== 'todo') ? 'Continuar curso' : 'Começar curso',
      }
    : { href: `${action.base}/${m.slug}`, label: pct ? `Continuar · ${Math.round(pct)}%` : action.label };

  let lastSection: string | null = null;
  return (
    <div className="container stack" style={{ ['--gap' as string]: '20px' }}>
      <nav aria-label="Trilha de navegação" className="row muted" style={{ fontSize: 13 }}>
        <Link href="/acervo">Acervo</Link>
        {firstCat ? <><span aria-hidden="true">/</span><Link href={`/acervo?categoria=${firstCat.slug}`}>{firstCat.name}</Link></> : null}
      </nav>

      <section className="mhero" aria-labelledby="titulo">
        <div className="mhero-cover"><Cover title={m.title} type={m.type} url={withCover.coverUrl} seed={m.id} /></div>
        <div className="mhero-info">
          <div className="row">
            <span className="badge">{TYPE_LABEL[m.type]}</span>
            {m.visibility === 'restricted' ? <span className="badge badge-dark">Acesso restrito</span> : null}
            {m.status !== 'published' ? <span className="badge badge-sand">{m.status === 'draft' ? 'Rascunho' : 'Arquivado'}</span> : null}
            {m.tradition ? <span className="badge badge-sand">Perspectiva: {m.tradition}</span> : null}
          </div>
          <h1 id="titulo">{m.title}</h1>
          {m.subtitle ? <p className="mhero-sub">{m.subtitle}</p> : null}
          <p className="mhero-by">
            {authors.length ? <>por {authors.map((a, i) => <span key={a.authors!.slug}>{i ? ', ' : ''}<b>{a.authors!.name}</b></span>)}</> : 'Autor a confirmar'}
            {m.organizer ? <> · organização {m.organizer}</> : null}
          </p>
          <div className="mhero-stats">
            {stats.map((s) => <div key={s.l}><b>{s.v}</b><span>{s.l}</span></div>)}
          </div>
          <div className="mhero-actions">
            {hasContent ? (
              <Link href={cta.href} className="btn btn-primary" style={{ minHeight: 48 }}>
                {cta.label} <Icon name={action.base === '/ouvir' ? 'headphones' : action.base === '/assistir' ? 'play' : 'book'} size={18} />
              </Link>
            ) : <p className="alert" style={{ margin: 0 }}>{isCourse ? 'Este curso ainda não tem aulas publicadas.' : 'O arquivo deste material ainda não foi enviado para a biblioteca.'}</p>}
            {user ? (
              <>
                <FavoriteButton materialId={m.id} initial={!!fav} />
                <ListPicker materialId={m.id} slug={m.slug} lists={myLists} />
              </>
            ) : <Link className="btn" href={`/entrar?next=/material/${m.slug}`}>Entre para favoritar e salvar progresso</Link>}
            {isStaff(profile) ? <Link href={`/admin/materiais/${m.id}`} className="btn btn-ghost" style={{ color: '#fff' }}>Editar no painel</Link> : null}
          </div>
        </div>
      </section>

      <div className="mgrid">
        <div className="stack" style={{ ['--gap' as string]: '20px', minWidth: 0 }}>
          {m.description || categories.length ? (
            <section className="panel stack">
              <h2 style={{ fontSize: 18 }}>Sobre</h2>
              {m.description ? <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, whiteSpace: 'pre-line' }}>{m.description}</p> : null}
              {categories.length ? <div className="row">{categories.map((c) => <Link key={c.id} href={`/acervo?categoria=${c.slug}`} className="chip">{c.name}</Link>)}</div> : null}
            </section>
          ) : null}

          {course ? (
            <section className="panel stack" aria-labelledby="h-aulas">
              <div className="panel-head" style={{ margin: 0 }}>
                <h2 id="h-aulas">Conteúdo do curso</h2>
                {user && course.lessons.length ? <span className="muted" style={{ fontSize: 13 }}>{course.done} de {course.lessons.length} concluídas</span> : null}
              </div>
              {user && course.lessons.length ? <div className="bar-lg" aria-hidden="true"><i style={{ width: `${(course.done / course.lessons.length) * 100}%` }} /></div> : null}
              <ol className="lessons">
                {course.lessons.map((l, i) => {
                  const head = l.section && l.section !== lastSection ? l.section : null;
                  lastSection = l.section;
                  return (
                    <li key={l.id}>
                      {head ? <h3>{head}</h3> : null}
                      <Link href={l.href} className="lesson">
                        <span className={`lesson-n ${l.status}`} aria-hidden="true">{l.status === 'done' ? <Icon name="check" size={16} /> : i + 1}</span>
                        <span className="lesson-t"><b>{l.title}</b><small>{TYPE_LABEL[l.type]}{l.status === 'started' && l.percent != null ? ` · ${Math.round(l.percent)}%` : l.status === 'done' ? ' · concluída' : ''}</small></span>
                        <Icon name="next" size={18} />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          {tracks.length ? (
            <section className="panel stack" aria-labelledby="h-faixas">
              <h2 id="h-faixas" style={{ fontSize: 18 }}>Faixas</h2>
              <ol className="lessons">
                {tracks.map((t, i) => (
                  <li key={t.id}>
                    <Link href={`/ouvir/${m.slug}?faixa=${i + 1}`} className="lesson">
                      <span className="lesson-n" aria-hidden="true">{i + 1}</span>
                      <span className="lesson-t"><b>{t.title}</b></span>
                      <span className="muted" style={{ fontSize: 13 }}>{formatDuration(t.duration_seconds)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {supplementary.length ? (
            <section className="panel stack">
              <h2 style={{ fontSize: 18 }}>Materiais complementares</h2>
              {supplementary.map((f) => <a key={f.id} href={`/api/files/${f.id}?open=1`}>{f.title || 'Arquivo complementar'}</a>)}
            </section>
          ) : null}
        </div>

        <aside className="stack" style={{ ['--gap' as string]: '20px', minWidth: 0 }}>
          <section className="panel stack">
            <h2 style={{ fontSize: 18 }}>Ficha</h2>
            <dl className="ficha">
              {m.publishers?.name ? <><dt>Editora</dt><dd>{m.publishers.name}</dd></> : null}
              {m.year ? <><dt>Ano</dt><dd>{m.year}</dd></> : null}
              <dt>Idioma</dt><dd>{LANG[m.language] ?? m.language}</dd>
              {m.page_count ? <><dt>Páginas</dt><dd>{m.page_count}</dd></> : null}
              {m.duration_seconds ? <><dt>Duração</dt><dd>{formatDuration(m.duration_seconds)}</dd></> : null}
              {m.isbn ? <><dt>ISBN</dt><dd>{m.isbn}</dd></> : null}
              {m.source_reference ? <><dt>Fonte</dt><dd>{m.source_reference}</dd></> : null}
            </dl>
          </section>
          <section className="panel stack">
            <h2 style={{ fontSize: 18 }}>Créditos e direitos</h2>
            <p style={{ margin: 0, fontSize: 13.5 }}>
              {m.rights_holder ? <>Titular: {m.rights_holder}. </> : null}
              {m.license ? <>Licença: {m.license}. </> : null}
              {m.access_conditions ?? (m.visibility === 'restricted' ? 'Material de uso interno, disponível para membros autorizados.' : null)}
              {!m.allow_download ? ' Sem download.' : null}
            </p>
            <Link href="/contato#direitos" style={{ fontWeight: 600, fontSize: 13.5 }}>Solicitação sobre direitos autorais</Link>
          </section>
        </aside>
      </div>

      {related.length ? (
        <section className="panel">
          <div className="panel-head"><h2>Relacionados</h2>{firstCat ? <Link className="pill-link" href={`/acervo?categoria=${firstCat.slug}`}>Ver todos <Icon name="next" size={14} /></Link> : null}</div>
          <div className="shelf">{related.map((r) => <MaterialCard key={r.id} m={r} />)}</div>
        </section>
      ) : null}
    </div>
  );
}
