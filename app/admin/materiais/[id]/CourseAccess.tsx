import { requireStaff } from '@/lib/data';
import { ConfirmButton } from '@/components/ConfirmButton';
import { grantCourseAccess, rejectCourseRequest, revokeCourseAccess } from '../../actions';

type Person = { id: string; display_name: string | null; email: string | null; approved: boolean };
const label = (p: Person | undefined) => (p ? p.display_name || p.email || 'Sem nome' : 'Conta removida');

// Quem pode acessar este curso (a permissão é por curso)
export async function CourseAccess({ courseId, title }: { courseId: string; title: string }) {
  const { supabase } = await requireStaff();
  const [{ data: people }, { data: access }, { data: requests }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, email, approved').order('display_name'),
    supabase.from('course_access').select('user_id, granted_at').eq('course_id', courseId).order('granted_at'),
    supabase.from('course_requests').select('user_id, created_at').eq('course_id', courseId).order('created_at'),
  ]);
  const byId = new Map(((people ?? []) as Person[]).map((p) => [p.id, p]));
  const has = new Set((access ?? []).map((a) => a.user_id));
  const candidates = ((people ?? []) as Person[]).filter((p) => !has.has(p.id));
  const field = (u: string) => (<><input type="hidden" name="course" value={courseId} /><input type="hidden" name="user" value={u} /></>);

  return (
    <section className="card stack" style={{ padding: 20, ['--gap' as string]: '14px' }} aria-label="Quem tem acesso ao curso">
      <h2 style={{ fontSize: 20 }}>Quem tem acesso a este curso</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Os membros veem que o curso existe, mas só as pessoas liberadas aqui abrem as aulas. A equipe (editores e administradores) sempre tem acesso.</p>

      {(requests ?? []).length ? (
        <div className="stack" style={{ ['--gap' as string]: '6px' }}>
          <b>Pedidos de acesso ({requests!.length})</b>
          {requests!.map((r) => (
            <div key={r.user_id} className="row" style={{ background: 'var(--primary-soft)', borderRadius: 12, padding: '8px 12px' }}>
              <span style={{ flex: '1 1 200px' }}><b>{label(byId.get(r.user_id))}</b> <small className="muted">pediu em {new Date(r.created_at).toLocaleDateString('pt-BR')}</small>
                {byId.get(r.user_id) && !byId.get(r.user_id)!.approved ? <small className="muted"> · cadastro ainda não aprovado no site</small> : null}</span>
              <form action={grantCourseAccess}>{field(r.user_id)}<button className="btn btn-primary" type="submit" style={{ minHeight: 34 }}>Liberar</button></form>
              <form action={rejectCourseRequest}>{field(r.user_id)}<button className="btn btn-ghost" type="submit" style={{ minHeight: 34 }}>Recusar</button></form>
            </div>
          ))}
        </div>
      ) : null}

      {(access ?? []).length ? (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, ['--gap' as string]: '4px' }}>
          {access!.map((a) => (
            <li key={a.user_id} className="row" style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '6px 12px' }}>
              <span style={{ flex: '1 1 200px' }}>{label(byId.get(a.user_id))} <small className="muted">· desde {new Date(a.granted_at).toLocaleDateString('pt-BR')}</small></span>
              <form action={revokeCourseAccess}>{field(a.user_id)}
                <ConfirmButton className="btn btn-ghost btn-danger" message={`Tirar o acesso de ${label(byId.get(a.user_id))} ao curso “${title}”?`}>Tirar acesso</ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      ) : <p className="muted" style={{ margin: 0 }}>Ninguém liberado ainda.</p>}

      {candidates.length ? (
        <form action={grantCourseAccess} className="row">
          <input type="hidden" name="course" value={courseId} />
          <label className="sr-only" htmlFor="liberar">Pessoa</label>
          <select id="liberar" name="user" className="input" required defaultValue="" style={{ flex: '1 1 260px', width: 'auto' }}>
            <option value="" disabled>Escolha uma pessoa…</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{label(p)}{p.email && p.display_name ? ` (${p.email})` : ''}{p.approved ? '' : ' — cadastro não aprovado'}</option>)}
          </select>
          <button className="btn btn-primary" type="submit">Liberar acesso</button>
        </form>
      ) : null}
    </section>
  );
}
