import Link from 'next/link';
import { requireStaff } from '@/lib/data';
import { TYPE_LABEL } from '@/lib/labels';
import type { MaterialType } from '@/lib/types';
import { bulkUpdate } from '../actions';

export const dynamic = 'force-dynamic';
const PAGE = 50;
const STATUS_LABEL: Record<string, string> = { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' };

export default async function AdminMaterials({ searchParams }: { searchParams: { q?: string; status?: string; tipo?: string; pagina?: string; pendente?: string } }) {
  const { supabase } = await requireStaff();
  const page = Math.max(1, Number(searchParams.pagina) || 1);
  let q = supabase.from('materials')
    .select('id, slug, title, type, status, visibility, featured, cover_path, updated_at, material_authors(authors(name)), files(id, path, role), material_internal(review_notes)', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (searchParams.q) q = q.ilike('title', `%${searchParams.q.replace(/[%_]/g, '')}%`);
  if (searchParams.status) q = q.eq('status', searchParams.status);
  if (searchParams.tipo) q = q.eq('type', searchParams.tipo);
  const { data, count, error } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; slug: string; title: string; type: MaterialType; status: string; visibility: string; featured: boolean; cover_path: string | null;
    material_authors: { authors: { name: string } | null }[]; files: { id: string; path: string | null; role: string }[];
    material_internal: { review_notes: string | null } | null;
  }[];
  const filtered = searchParams.pendente
    ? rows.filter((r) => !r.cover_path || r.files.some((f) => !f.path) || !r.material_authors.length || r.material_internal?.review_notes)
    : rows;
  const pages = Math.ceil((count ?? 0) / PAGE);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...searchParams, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin/materiais?${p.toString()}`;
  };

  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 44 }}>Materiais</h1>
        <div className="row"><Link className="btn" href="/admin/exportar">Exportar CSV</Link><Link className="btn btn-primary" href="/admin/materiais/novo">+ Novo material</Link></div>
      </div>
      <form className="row" action="/admin/materiais">
        <label className="sr-only" htmlFor="aq">Buscar</label>
        <input id="aq" className="input" name="q" defaultValue={searchParams.q} placeholder="Buscar por título" style={{ flex: '1 1 240px' }} />
        <select className="input" name="status" defaultValue={searchParams.status ?? ''} aria-label="Status" style={{ width: 'auto' }}>
          <option value="">Todos os status</option><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="archived">Arquivado</option>
        </select>
        <select className="input" name="tipo" defaultValue={searchParams.tipo ?? ''} aria-label="Tipo" style={{ width: 'auto' }}>
          <option value="">Todos os tipos</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="check"><input type="checkbox" name="pendente" value="1" defaultChecked={!!searchParams.pendente} />Só com pendências</label>
        <button className="btn" type="submit">Filtrar</button>
      </form>
      {error ? <p className="alert alert-error">{error.message}</p> : null}

      <form action={bulkUpdate} className="card">
        <div className="row" style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
          <span className="muted" style={{ fontSize: 13 }}>Ações em lote para os selecionados:</span>
          <select name="action" className="input" style={{ width: 'auto' }} aria-label="Ação em lote" defaultValue="">
            <option value="" disabled>Escolha…</option>
            <option value="publish">Publicar (exige autorização registrada)</option>
            <option value="draft">Voltar para rascunho</option>
            <option value="archive">Arquivar</option>
            <option value="restricted">Tornar restrito</option>
            <option value="public">Tornar público</option>
          </select>
          <button className="btn" type="submit">Aplicar</button>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th scope="col"><span className="sr-only">Selecionar</span></th><th scope="col">Título</th><th scope="col">Autor</th><th scope="col">Tipo</th><th scope="col">Status</th><th scope="col">Acesso</th><th scope="col">Pendências</th></tr></thead>
            <tbody>
              {filtered.map((r) => {
                const issues = [
                  !r.cover_path && 'capa',
                  r.files.some((f) => !f.path) && 'arquivo não enviado',
                  !r.material_authors.length && 'autor',
                  r.material_internal?.review_notes && 'revisão',
                ].filter(Boolean).join(' · ');
                return (
                  <tr key={r.id}>
                    <td><input type="checkbox" name="ids" value={r.id} aria-label={`Selecionar ${r.title}`} /></td>
                    <td><Link href={`/admin/materiais/${r.id}`} style={{ fontWeight: 700 }}>{r.title}</Link>{r.featured ? <span className="badge" style={{ marginLeft: 6 }}>Destaque</span> : null}</td>
                    <td className="muted">{r.material_authors.map((a) => a.authors?.name).filter(Boolean).join(', ') || '—'}</td>
                    <td>{TYPE_LABEL[r.type]}</td>
                    <td><span className="badge badge-sand">{STATUS_LABEL[r.status]}</span></td>
                    <td>{r.visibility === 'restricted' ? 'Restrito' : 'Público'}</td>
                    <td style={{ color: issues ? 'var(--gold-ink)' : 'var(--muted)', fontWeight: 700 }}>{issues || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length ? <p className="muted" style={{ padding: 16 }}>Nenhum material com esses filtros.</p> : null}
      </form>
      {pages > 1 ? (
        <nav className="row" aria-label="Paginação" style={{ justifyContent: 'center' }}>
          {page > 1 ? <Link className="btn" href={qs({ pagina: String(page - 1) })}>Anterior</Link> : null}
          <span className="muted">Página {page} de {pages} · {count} materiais</span>
          {page < pages ? <Link className="btn" href={qs({ pagina: String(page + 1) })}>Próxima</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
