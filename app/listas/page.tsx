import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser, withCoverUrls } from '@/lib/data';
import { artTone } from '@/lib/labels';
import { createList } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Minhas listas', robots: { index: false } };

export default async function Lists() {
  const { supabase } = await requireUser('/listas');
  const { data } = await supabase.from('collections')
    .select('id, name, description, created_at, collection_items(position, materials(id, title, cover_path))')
    .order('created_at', { ascending: false });
  const lists = await Promise.all((data ?? []).map(async (l) => {
    const items = (l.collection_items as unknown as { position: number; materials: { id: string; title: string; cover_path: string | null } | null }[])
      .filter((i) => i.materials).sort((a, b) => a.position - b.position).map((i) => i.materials!);
    return { ...l, count: items.length, covers: await withCoverUrls(items.slice(0, 3)) };
  }));

  return (
    <div className="container stack" style={{ ['--gap' as string]: '20px' }}>
      <div className="panel stack">
        <h1 className="page-title">Minhas listas</h1>
        <p className="muted" style={{ margin: 0 }}>Organize materiais do seu jeito: “Para estudar”, “Giras de Exu”, “Preparação para o desenvolvimento”… Só você vê suas listas.</p>
        <form action={createList} className="row">
          <label htmlFor="nova-lista" className="sr-only">Nome da nova lista</label>
          <input id="nova-lista" name="name" className="input" placeholder="Nome da nova lista" maxLength={80} required style={{ flex: '1 1 240px' }} />
          <button className="btn btn-primary" type="submit">Criar lista</button>
        </form>
      </div>
      {lists.length ? (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' }}>
          {lists.map((l) => (
            <Link key={l.id} href={`/listas/${l.id}`} className="panel stack" style={{ color: 'var(--ink)', textDecoration: 'none', ['--gap' as string]: '10px' }}>
              <div className="row" style={{ ['--gap' as string]: '0', height: 96, flexWrap: 'nowrap' }}>
                {l.covers.length ? l.covers.map((c, i) => (
                  <span key={c.id} style={{ width: 64, height: 96, borderRadius: 8, overflow: 'hidden', marginLeft: i ? -18 : 0, boxShadow: 'var(--shadow)', background: artTone(c.id), flex: 'none' }}>
                    {c.coverUrl ? <img src={c.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                  </span>
                )) : <span className="muted" style={{ fontSize: 13 }}>Lista vazia</span>}
              </div>
              <b style={{ fontSize: 16 }}>{l.name}</b>
              <span className="muted" style={{ fontSize: 13 }}>{l.count} {l.count === 1 ? 'material' : 'materiais'}{l.description ? ` · ${l.description}` : ''}</span>
            </Link>
          ))}
        </div>
      ) : <div className="empty"><b>Nenhuma lista ainda</b><span className="muted">Crie uma acima ou use “Salvar em lista” na página de um material.</span></div>}
    </div>
  );
}
