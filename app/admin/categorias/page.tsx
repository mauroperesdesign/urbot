import { requireStaff } from '@/lib/data';
import { saveCategory, deleteCategory } from '../actions';
import type { Category } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Categories() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.from('categories').select('id, parent_id, name, slug, description, position').order('position');
  const cats = (data ?? []) as Category[];
  const { data: counts } = await supabase.from('material_categories').select('category_id');
  const used = new Map<string, number>();
  (counts ?? []).forEach((c) => used.set(c.category_id, (used.get(c.category_id) ?? 0) + 1));
  const roots = cats.filter((c) => !c.parent_id);

  const Row = ({ c, depth }: { c: Category; depth: number }) => (
    <li style={{ paddingLeft: depth * 20 }}>
      <form action={saveCategory} className="row" style={{ padding: '6px 0' }}>
        <input type="hidden" name="id" value={c.id} />
        <label className="sr-only" htmlFor={`n-${c.id}`}>Nome</label>
        <input id={`n-${c.id}`} className="input" name="name" defaultValue={c.name} style={{ flex: '1 1 220px', minHeight: 38 }} />
        <label className="sr-only" htmlFor={`p-${c.id}`}>Categoria-mãe</label>
        <select id={`p-${c.id}`} className="input" name="parent_id" defaultValue={c.parent_id ?? ''} style={{ width: 'auto', minHeight: 38 }}>
          <option value="">(principal)</option>
          {roots.filter((r) => r.id !== c.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label className="sr-only" htmlFor={`o-${c.id}`}>Ordem</label>
        <input id={`o-${c.id}`} className="input" name="position" type="number" defaultValue={c.position} style={{ width: 80, minHeight: 38 }} />
        <span className="muted" style={{ fontSize: 12, minWidth: 80 }}>{used.get(c.id) ?? 0} materiais</span>
        <button className="btn" type="submit" style={{ minHeight: 38 }}>Salvar</button>
        <button className="btn btn-ghost btn-danger" type="submit" formAction={deleteCategory} style={{ minHeight: 38 }}
          disabled={(used.get(c.id) ?? 0) > 0 || cats.some((x) => x.parent_id === c.id)}
          title="Só é possível excluir categorias sem materiais e sem subcategorias">Excluir</button>
      </form>
      {cats.some((x) => x.parent_id === c.id) ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {cats.filter((x) => x.parent_id === c.id).map((x) => <Row key={x.id} c={x} depth={depth + 1} />)}
        </ul>
      ) : null}
    </li>
  );

  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <h1 className="page-title">Categorias</h1>
      <form action={saveCategory} className="card row" style={{ padding: 16 }}>
        <label className="field" style={{ flex: '1 1 240px' }}>Nova categoria<input name="name" required /></label>
        <label className="field">Dentro de
          <select name="parent_id" defaultValue=""><option value="">(categoria principal)</option>{roots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </label>
        <label className="field" style={{ width: 100 }}>Ordem<input name="position" type="number" defaultValue={0} /></label>
        <button className="btn btn-primary" type="submit" style={{ alignSelf: 'flex-end' }}>Adicionar</button>
      </form>
      <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 16 }}>{roots.map((c) => <Row key={c.id} c={c} depth={0} />)}</ul>
    </div>
  );
}
