import { requireStaff } from '@/lib/data';
import { setAccess } from '../actions';

export const dynamic = 'force-dynamic';

export default async function Users({ searchParams }: { searchParams: { erro?: string } }) {
  const { supabase, profile, user } = await requireStaff();
  const { data } = await supabase.from('profiles').select('id, display_name, email, role, approved, created_at').order('approved').order('created_at', { ascending: false });
  const isAdmin = profile?.role === 'admin';
  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <h1 style={{ fontSize: 44 }}>Usuários e permissões</h1>
      <p className="muted" style={{ margin: 0 }}>Membros aprovados acessam os materiais restritos. Só administradores alteram papéis e aprovações — a regra é verificada no banco de dados.</p>
      {searchParams.erro ? <p className="alert alert-error">{searchParams.erro}</p> : null}
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Cadastro</th><th scope="col">Acesso</th></tr></thead>
          <tbody>{(data ?? []).map((u) => (
            <tr key={u.id}>
              <td style={{ fontWeight: 700 }}>{u.display_name || '—'}{u.id === user.id ? ' (você)' : ''}</td>
              <td className="muted">{u.email}</td>
              <td className="muted">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
              <td>
                {isAdmin ? (
                  <form action={setAccess} className="row">
                    <input type="hidden" name="id" value={u.id} />
                    <label className="sr-only" htmlFor={`r-${u.id}`}>Papel</label>
                    <select id={`r-${u.id}`} name="role" defaultValue={u.role} className="input" style={{ width: 'auto', minHeight: 36 }}>
                      <option value="member">Membro</option><option value="editor">Editor</option><option value="admin">Administrador</option>
                    </select>
                    <label className="check"><input type="checkbox" name="approved" defaultChecked={u.approved} />Aprovado</label>
                    <button className="btn" type="submit" style={{ minHeight: 36 }}>Salvar</button>
                  </form>
                ) : <span>{u.role} · {u.approved ? 'aprovado' : 'aguardando'}</span>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
