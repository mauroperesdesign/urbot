import { requireStaff } from '@/lib/data';
import { TYPE_LABEL } from '@/lib/labels';
import type { MaterialType } from '@/lib/types';
import { addCourseItem, moveCourseItem, removeCourseItem, updateCourseItem } from '../../actions';

// Monta a sequência de aulas de um curso ou trilha
export async function CourseEditor({ courseId }: { courseId: string }) {
  const { supabase } = await requireStaff();
  const [{ data: items }, { data: all }] = await Promise.all([
    supabase.from('course_items').select('material_id, position, section, materials!course_items_material_id_fkey(title, type, status)').eq('course_id', courseId).order('position'),
    supabase.from('materials').select('id, title, type').neq('type', 'course').neq('id', courseId).order('title'),
  ]);
  const rows = (items ?? []) as unknown as { material_id: string; position: number; section: string | null; materials: { title: string; type: MaterialType; status: string } | null }[];
  const used = new Set(rows.map((r) => r.material_id));
  const options = (all ?? []).filter((m) => !used.has(m.id));
  const hidden = (material: string) => (<><input type="hidden" name="course" value={courseId} /><input type="hidden" name="material" value={material} /></>);

  return (
    <section className="card stack" style={{ padding: 20, ['--gap' as string]: '14px' }} aria-label="Aulas do curso">
      <h2 style={{ fontSize: 20 }}>Aulas do curso</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Escolha os materiais do acervo que formam este curso, na ordem em que devem ser estudados. Use “Seção” para agrupar (ex.: “Módulo 1 — Fundamentos”).</p>
      {rows.length ? (
        <ol className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, ['--gap' as string]: '6px' }}>
          {rows.map((r, i) => (
            <li key={r.material_id} className="row" style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '8px 10px' }}>
              <span className="badge badge-sand" style={{ minWidth: 30, justifyContent: 'center' }}>{i + 1}</span>
              <span style={{ flex: '1 1 200px', fontWeight: 600 }}>{r.materials?.title ?? '—'} <small className="muted">· {r.materials ? TYPE_LABEL[r.materials.type] : ''}{r.materials && r.materials.status !== 'published' ? ' · não publicado' : ''}</small></span>
              <form action={updateCourseItem} className="row" style={{ ['--gap' as string]: '4px' }}>
                {hidden(r.material_id)}
                <label className="sr-only" htmlFor={`sec-${r.material_id}`}>Seção</label>
                <input id={`sec-${r.material_id}`} name="section" className="input" defaultValue={r.section ?? ''} placeholder="Seção" style={{ width: 170, minHeight: 34 }} />
                <button className="btn" type="submit" style={{ minHeight: 34 }}>OK</button>
              </form>
              <form action={moveCourseItem}>{hidden(r.material_id)}<input type="hidden" name="dir" value="up" /><button className="btn icon-btn" type="submit" disabled={i === 0} aria-label="Subir" style={{ width: 34, height: 34, minHeight: 34 }}>↑</button></form>
              <form action={moveCourseItem}>{hidden(r.material_id)}<input type="hidden" name="dir" value="down" /><button className="btn icon-btn" type="submit" disabled={i === rows.length - 1} aria-label="Descer" style={{ width: 34, height: 34, minHeight: 34 }}>↓</button></form>
              <form action={removeCourseItem}>{hidden(r.material_id)}<button className="btn btn-ghost btn-danger" type="submit" style={{ minHeight: 34 }}>Tirar</button></form>
            </li>
          ))}
        </ol>
      ) : <p className="muted" style={{ margin: 0 }}>Nenhuma aula ainda.</p>}
      <form action={addCourseItem} className="row">
        <input type="hidden" name="course" value={courseId} />
        <label className="sr-only" htmlFor="nova-aula">Material</label>
        <select id="nova-aula" name="material" className="input" required defaultValue="" style={{ flex: '1 1 260px', width: 'auto' }}>
          <option value="" disabled>Escolha um material do acervo…</option>
          {options.map((m) => <option key={m.id} value={m.id}>{m.title} ({TYPE_LABEL[m.type as MaterialType]})</option>)}
        </select>
        <label className="sr-only" htmlFor="nova-secao">Seção</label>
        <input id="nova-secao" name="section" className="input" placeholder="Seção (opcional)" style={{ width: 200 }} defaultValue={rows[rows.length - 1]?.section ?? ''} />
        <button className="btn btn-primary" type="submit">Adicionar aula</button>
      </form>
    </section>
  );
}
