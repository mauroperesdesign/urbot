import Link from 'next/link';
import { requireStaff } from '@/lib/data';
import { ConfirmButton } from '@/components/ConfirmButton';
import { SUGGESTION_KINDS, SUGGESTION_STATUS, type Suggestion } from '@/lib/suggestions';
import { deleteSuggestion, reviewSuggestion } from '../actions';

export const dynamic = 'force-dynamic';

const TABS = [
  { id: 'nova', label: 'Novas' },
  { id: 'analisando', label: 'Em análise' },
  { id: 'adicionada', label: 'Adicionadas' },
  { id: 'recusada', label: 'Recusadas' },
  { id: 'todas', label: 'Todas' },
];

// Sugestões de materiais enviadas pelos membros
export default async function SugestoesAdmin({ searchParams }: { searchParams: { s?: string } }) {
  const { supabase } = await requireStaff();
  const tab = TABS.some((t) => t.id === searchParams.s) ? searchParams.s! : 'nova';
  let q = supabase.from('material_suggestions').select('*').order('created_at', { ascending: false }).limit(300);
  if (tab !== 'todas') q = q.eq('status', tab);
  const [{ data }, { data: counts }] = await Promise.all([q, supabase.from('material_suggestions').select('status')]);
  const list = (data ?? []) as Suggestion[];
  const n = (id: string) => (counts ?? []).filter((c) => id === 'todas' || c.status === id).length;
  const ids = Array.from(new Set(list.map((s) => s.user_id)));
  const { data: people } = ids.length ? await supabase.from('profiles').select('id, display_name, email').in('id', ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p.display_name || p.email || 'Membro']));
  const date = (s: string) => new Date(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="page-title">💡 Sugestões de materiais</h1>
        <span className="muted" style={{ fontSize: 13 }}>Enviadas pelos membros em “Sugerir material”</span>
      </div>
      <nav className="chips" aria-label="Situação">
        {TABS.map((t) => (
          <Link key={t.id} href={`/admin/sugestoes?s=${t.id}`} className="chip" aria-current={tab === t.id ? 'true' : undefined}>
            {t.label} · {n(t.id)}
          </Link>
        ))}
      </nav>
      {list.length ? (
        <ul className="sug-list">
          {list.map((s) => {
            const st = SUGGESTION_STATUS[s.status] ?? SUGGESTION_STATUS.nova;
            return (
              <li key={s.id} className="sug-item">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 16 }}>{s.title}</b>
                    <small className="muted" style={{ display: 'block' }}>
                      {SUGGESTION_KINDS[s.kind] ?? s.kind}{s.author ? ` · ${s.author}` : ''} · por <b>{who.get(s.user_id) ?? 'Membro'}</b> em {date(s.created_at)}
                    </small>
                  </div>
                  <span className={st.tone}>{st.label}</span>
                </div>
                {s.reason ? <p style={{ margin: 0, fontSize: 14, whiteSpace: 'pre-line' }}>{s.reason}</p> : null}
                {s.link ? <a href={s.link} target="_blank" rel="noopener noreferrer nofollow" style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{s.link}</a> : null}
                <form action={reviewSuggestion} className="sug-review">
                  <input type="hidden" name="id" value={s.id} />
                  <label className="field">Situação
                    <select name="status" defaultValue={s.status}>
                      {Object.entries(SUGGESTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ flex: '1 1 260px' }}>Recado para quem sugeriu (opcional)
                    <input name="admin_note" defaultValue={s.admin_note ?? ''} maxLength={1000} placeholder="Ex.: Já está no acervo! / Não temos autorização dos direitos." />
                  </label>
                  <button className="btn btn-primary" type="submit">Salvar</button>
                </form>
                <div className="row">
                  <Link className="btn btn-ghost" href="/admin/materiais/novo">+ Cadastrar este material</Link>
                  <form action={deleteSuggestion}>
                    <input type="hidden" name="id" value={s.id} />
                    <ConfirmButton className="btn btn-ghost btn-danger" message={`Apagar a sugestão “${s.title}”?`}>Apagar</ConfirmButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="muted">Nenhuma sugestão {tab === 'todas' ? 'ainda' : 'nesta situação'}.</p>}
    </div>
  );
}
