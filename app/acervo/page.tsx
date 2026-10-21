import Link from 'next/link';
import type { Metadata } from 'next';
import { getSession, withCoverUrls } from '@/lib/data';
import { supabaseConfigured } from '@/lib/supabase/server';
import { MaterialCard } from '@/components/Cover';
import { SetupNotice } from '@/components/SetupNotice';
import { TYPE_LABEL } from '@/lib/labels';
import type { Category, MaterialType } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Acervo', description: 'Busque livros, apostilas e audiobooks por tema, autor ou palavra-chave.' };

const PAGE_SIZE = 30;
const TYPE_FILTERS: MaterialType[] = ['book', 'handout', 'audiobook', 'article', 'research', 'glossary', 'course'];

type Search = { q?: string; categoria?: string; tipo?: string; pagina?: string };

function href(base: Search, patch: Search) {
  const p = new URLSearchParams();
  const merged = { ...base, ...patch };
  (Object.keys(merged) as (keyof Search)[]).forEach((k) => { if (merged[k]) p.set(k, merged[k]!); });
  const s = p.toString();
  return s ? `/acervo?${s}` : '/acervo';
}

export default async function Acervo({ searchParams }: { searchParams: Search }) {
  if (!supabaseConfigured()) return <SetupNotice />;
  const { supabase } = await getSession();
  const page = Math.max(1, Number(searchParams.pagina) || 1);
  const tipo = TYPE_FILTERS.includes(searchParams.tipo as MaterialType) ? (searchParams.tipo as MaterialType) : null;

  const { data: catData } = await supabase.from('categories').select('id, parent_id, name, slug, description, position').order('position');
  const cats = (catData ?? []) as Category[];
  const current = cats.find((c) => c.slug === searchParams.categoria) ?? null;
  const roots = cats.filter((c) => !c.parent_id);
  const rootOfCurrent = current ? (current.parent_id ? cats.find((c) => c.id === current.parent_id) : current) : null;
  const subs = rootOfCurrent ? cats.filter((c) => c.parent_id === rootOfCurrent.id) : [];

  const { data: hits, error } = await supabase.rpc('search_materials', {
    q: searchParams.q?.slice(0, 120) || null, category: current?.id ?? null, mtype: tipo, lang: null,
    page, page_size: PAGE_SIZE,
  });
  const rows = (hits ?? []) as { id: string; slug: string; title: string; type: MaterialType; cover_path: string | null; total: number }[];
  const total = rows[0]?.total ?? 0;

  const ids = rows.map((r) => r.id);
  const { data: authorRows } = ids.length
    ? await supabase.from('material_authors').select('material_id, position, authors(name)').in('material_id', ids)
    : { data: [] };
  const authorsBy = new Map<string, string[]>();
  (authorRows ?? []).sort((a, b) => a.position - b.position).forEach((a) => {
    const name = (a.authors as unknown as { name: string } | null)?.name;
    if (name) authorsBy.set(a.material_id, [...(authorsBy.get(a.material_id) ?? []), name]);
  });
  const cards = await withCoverUrls(rows.map((r) => ({ ...r, authors: authorsBy.get(r.id)?.join(', ') })));
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="container panel">
      <div className="stack" style={{ ['--gap' as string]: '6px' }}>
        <h1 className="page-title-xl">{current ? current.name : 'Acervo'}</h1>
        <span className="muted">
          {searchParams.q ? <>Resultados para “{searchParams.q}” · </> : null}
          {total} {total === 1 ? 'material' : 'materiais'}
          {current?.description ? <> · {current.description}</> : null}
        </span>
      </div>

      <form action="/acervo" className="search" style={{ marginTop: 16, maxWidth: 640 }} role="search">
        <label htmlFor="busca" className="sr-only">Buscar</label>
        <input id="busca" name="q" defaultValue={searchParams.q} placeholder="Buscar por título, autor, tema…" />
        {searchParams.categoria ? <input type="hidden" name="categoria" value={searchParams.categoria} /> : null}
        {tipo ? <input type="hidden" name="tipo" value={tipo} /> : null}
        <button className="btn btn-primary" type="submit" style={{ minHeight: 36 }}>Buscar</button>
      </form>

      <nav aria-label="Categorias" className="row" style={{ marginTop: 16, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 6 }}>
        <Link className={`chip${!current ? ' active' : ''}`} href={href(searchParams, { categoria: undefined, pagina: undefined })}>Todas</Link>
        {roots.map((c) => (
          <Link key={c.id} className={`chip${rootOfCurrent?.id === c.id ? ' active' : ''}`} href={href(searchParams, { categoria: c.slug, pagina: undefined })}>{c.name}</Link>
        ))}
      </nav>
      {subs.length ? (
        <nav aria-label="Subcategorias" className="row" style={{ marginTop: 8 }}>
          {subs.map((c) => (
            <Link key={c.id} className="chip" aria-current={current?.id === c.id ? 'true' : undefined}
              href={href(searchParams, { categoria: c.slug, pagina: undefined })} style={{ minHeight: 30, fontSize: 13 }}>{c.name}</Link>
          ))}
        </nav>
      ) : null}
      <nav aria-label="Formato" className="row" style={{ marginTop: 8 }}>
        <Link className="chip" aria-current={!tipo ? 'true' : undefined} href={href(searchParams, { tipo: undefined, pagina: undefined })} style={{ minHeight: 30, fontSize: 13 }}>Todos os formatos</Link>
        {TYPE_FILTERS.map((t) => (
          <Link key={t} className="chip" aria-current={tipo === t ? 'true' : undefined} href={href(searchParams, { tipo: t, pagina: undefined })} style={{ minHeight: 30, fontSize: 13 }}>{TYPE_LABEL[t]}</Link>
        ))}
      </nav>

      {error ? <p className="alert alert-error" style={{ marginTop: 20 }}>Não foi possível buscar agora. Tente novamente em instantes.</p> : null}

      {cards.length ? (
        <div className="grid-cards" style={{ marginTop: 24 }}>{cards.map((m) => <MaterialCard key={m.id} m={m} />)}</div>
      ) : !error ? (
        <div className="empty" style={{ marginTop: 24 }}>
          <b>Nada encontrado</b>
          <span className="muted">Tente outras palavras, remova filtros ou explore as categorias.</span>
        </div>
      ) : null}

      {pages > 1 ? (
        <nav aria-label="Paginação" className="row" style={{ marginTop: 28, justifyContent: 'center' }}>
          {page > 1 ? <Link className="btn" href={href(searchParams, { pagina: String(page - 1) })}>Anterior</Link> : null}
          <span className="muted">Página {page} de {pages}</span>
          {page < pages ? <Link className="btn" href={href(searchParams, { pagina: String(page + 1) })}>Próxima</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
