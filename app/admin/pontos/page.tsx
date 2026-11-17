import Link from 'next/link';
import { requireStaff } from '@/lib/data';
import { formatDuration } from '@/lib/labels';
import { ConfirmButton } from '@/components/ConfirmButton';
import { PontoForm } from './PontoForm';
import { deletePonto } from './actions';

export const dynamic = 'force-dynamic';

type Cat = { id: string; parent_id: string | null; slug: string; name: string; position: number };
type Row = {
  id: string; slug: string; title: string; status: string; duration_seconds: number | null; original_source: string | null;
  material_categories: { category_id: string }[];
  files: { role: string; path: string | null; external_url: string | null }[];
};

// Área separada para cadastrar pontos cantados (arquivo, YouTube ou Spotify)
export default async function PontosAdmin() {
  const { supabase } = await requireStaff();
  const { data: cats } = await supabase.from('categories').select('id, parent_id, slug, name, position').order('position');
  const all = (cats ?? []) as Cat[];
  const root = all.find((c) => c.slug === 'pontos-cantados');
  const level1 = all.filter((c) => c.parent_id === root?.id);
  const groups = level1.map((g) => {
    const kids = all.filter((c) => c.parent_id === g.id);
    return { label: g.name, options: kids.length ? kids.map((k) => ({ id: k.id, name: k.name })) : [{ id: g.id, name: g.name }] };
  });
  const ids = new Set([root?.id, ...level1.map((c) => c.id), ...all.filter((c) => level1.some((g) => g.id === c.parent_id)).map((c) => c.id)].filter(Boolean) as string[]);
  const name = new Map(all.map((c) => [c.id, c.name]));

  const { data } = ids.size
    ? await supabase.from('materials')
        .select('id, slug, title, status, duration_seconds, original_source, material_categories!inner(category_id), files(role, path, external_url)')
        .in('material_categories.category_id', Array.from(ids)).order('created_at', { ascending: false }).limit(300)
    : { data: [] };
  const pontos = (data ?? []) as unknown as Row[];
  const origin = (p: Row) => {
    if (p.files.some((f) => f.external_url?.includes('spotify.com'))) return '🟢 Spotify';
    if (p.files.some((f) => f.role === 'track' && f.path)) return p.original_source?.includes('youtube.com') ? '▶ YouTube (MP3 no acervo)' : '🎵 Arquivo';
    return '⚠ sem áudio';
  };

  return (
    <div className="stack" style={{ ['--gap' as string]: '20px' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="page-title">🥁 Pontos cantados</h1>
        <Link className="pill-link" href="/pontos-cantados">Ver no site</Link>
      </div>
      <section className="card stack" style={{ padding: 20 }} aria-labelledby="h-novo-ponto">
        <h2 id="h-novo-ponto" style={{ fontSize: 18 }}>Novo ponto</h2>
        <PontoForm groups={groups} />
      </section>

      <section className="card stack" style={{ padding: 20 }} aria-labelledby="h-lista-pontos">
        <h2 id="h-lista-pontos" style={{ fontSize: 18 }}>Pontos cadastrados ({pontos.length})</h2>
        {pontos.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th scope="col">Ponto</th><th scope="col">Para</th><th scope="col">Áudio</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>{pontos.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/material/${p.slug}`} style={{ fontWeight: 600 }}>{p.title}</Link>{p.duration_seconds ? <small className="muted"> · {formatDuration(p.duration_seconds)}</small> : null}</td>
                  <td className="muted">{p.material_categories.map((c) => name.get(c.category_id)).filter(Boolean).join(', ')}</td>
                  <td>{origin(p)}</td>
                  <td>{p.status === 'published' ? <span className="badge badge-ok">Publicado</span> : <span className="badge badge-sand">Rascunho</span>}</td>
                  <td className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <Link className="btn btn-ghost" href={`/admin/materiais/${p.id}`}>Editar</Link>
                    <form action={deletePonto}><input type="hidden" name="id" value={p.id} />
                      <ConfirmButton className="btn btn-ghost btn-danger" message={`Apagar o ponto “${p.title}” e o áudio dele?`}>Apagar</ConfirmButton></form>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted" style={{ margin: 0 }}>Nenhum ponto cadastrado ainda.</p>}
      </section>
    </div>
  );
}
