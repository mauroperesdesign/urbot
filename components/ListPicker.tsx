import { createList, toggleListItem } from '@/app/listas/actions';
import { Icon } from './Icon';

// "Salvar em lista" na página do material (funciona sem JavaScript)
export function ListPicker({ materialId, slug, lists }: { materialId: string; slug: string; lists: { id: string; name: string; has: boolean }[] }) {
  const back = `/material/${slug}`;
  return (
    <details className="list-picker">
      <summary className="btn" style={{ width: '100%' }}><Icon name="list" size={18} /> Salvar em lista{lists.some((l) => l.has) ? ' ✓' : ''}</summary>
      <div className="list-picker-menu">
        {lists.map((l) => (
          <form key={l.id} action={toggleListItem}>
            <input type="hidden" name="list" value={l.id} />
            <input type="hidden" name="material" value={materialId} />
            <input type="hidden" name="add" value={l.has ? '0' : '1'} />
            <button type="submit" aria-pressed={l.has}>
              <span className="tick" aria-hidden="true">{l.has ? <Icon name="check" size={16} /> : null}</span>{l.name}
            </button>
          </form>
        ))}
        <form action={createList} className="row" style={{ ['--gap' as string]: '6px', flexWrap: 'nowrap', marginTop: lists.length ? 6 : 0 }}>
          <input type="hidden" name="material" value={materialId} />
          <input type="hidden" name="voltar" value={back} />
          <label htmlFor="lista-nova" className="sr-only">Nova lista</label>
          <input id="lista-nova" name="name" className="input" placeholder="Nova lista…" maxLength={80} required style={{ minHeight: 38 }} />
          <button className="btn btn-primary" type="submit" style={{ minHeight: 38 }}>Criar</button>
        </form>
      </div>
    </details>
  );
}
