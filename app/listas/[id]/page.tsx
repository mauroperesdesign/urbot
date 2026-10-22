import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser, withCoverUrls, CARD_COLUMNS, toCard } from '@/lib/data';
import { MaterialCard } from '@/components/Cover';
import { deleteList, renameList, toggleListItem } from '../actions';
import { ConfirmButton } from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Lista', robots: { index: false } };

export default async function ListPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireUser(`/listas/${params.id}`);
  const { data: list } = await supabase.from('collections').select('id, name, description').eq('id', params.id).maybeSingle();
  if (!list) notFound();
  const { data } = await supabase.from('collection_items').select(`position, materials(${CARD_COLUMNS})`).eq('collection_id', list.id).order('position');
  const items = await withCoverUrls((data ?? []).filter((r) => r.materials).map((r) => toCard(r.materials as never)));

  return (
    <div className="container stack" style={{ ['--gap' as string]: '20px' }}>
      <Link href="/listas" className="muted" style={{ fontSize: 13 }}>← Minhas listas</Link>
      <div className="panel stack">
        <h1 className="page-title">{list.name}</h1>
        {list.description ? <p className="muted" style={{ margin: 0 }}>{list.description}</p> : null}
        <details>
          <summary className="pill-link" style={{ cursor: 'pointer', listStyle: 'none', width: 'fit-content' }}>Editar lista</summary>
          <div className="stack" style={{ marginTop: 12 }}>
            <form action={renameList} className="stack" style={{ maxWidth: 480 }}>
              <input type="hidden" name="list" value={list.id} />
              <label className="field">Nome<input name="name" defaultValue={list.name} maxLength={80} required /></label>
              <label className="field">Descrição (opcional)<input name="description" defaultValue={list.description ?? ''} maxLength={300} /></label>
              <button className="btn" type="submit" style={{ alignSelf: 'flex-start' }}>Salvar</button>
            </form>
            <form action={deleteList}>
              <input type="hidden" name="list" value={list.id} />
              <ConfirmButton className="btn btn-danger" message={`Apagar a lista “${list.name}”? Os materiais continuam no acervo.`}>Apagar esta lista</ConfirmButton>
            </form>
          </div>
        </details>
      </div>
      <div className="panel">
        {items.length ? (
          <div className="grid-cards">
            {items.map((m) => (
              <div key={m.id} className="stack" style={{ ['--gap' as string]: '6px' }}>
                <MaterialCard m={m} />
                <form action={toggleListItem}>
                  <input type="hidden" name="list" value={list.id} />
                  <input type="hidden" name="material" value={m.id} />
                  <button className="btn btn-ghost btn-danger" type="submit" style={{ minHeight: 30, fontSize: 12, width: '100%' }}>Tirar da lista</button>
                </form>
              </div>
            ))}
          </div>
        ) : <div className="empty"><b>Lista vazia</b><span className="muted">Na página de um material, use “Salvar em lista” para adicioná-lo aqui.</span></div>}
      </div>
    </div>
  );
}
