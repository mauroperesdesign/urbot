import type { Metadata } from 'next';
import { requireUser } from '@/lib/data';
import { ConfirmButton } from '@/components/ConfirmButton';
import { SUGGESTION_KINDS, SUGGESTION_STATUS, type Suggestion } from '@/lib/suggestions';
import { sendSuggestion, withdrawSuggestion } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sugerir material', robots: { index: false } };

const ERRORS: Record<string, string> = {
  titulo: 'Escreva pelo menos o título do material.',
  limite: 'Você já enviou 10 sugestões nas últimas 24 horas. Tente de novo amanhã.',
  falha: 'Não foi possível enviar agora. Tente de novo.',
};

export default async function Sugerir({ searchParams }: { searchParams: { enviada?: string; erro?: string } }) {
  const { supabase, profile } = await requireUser('/sugerir');
  const canSend = !!profile && (profile.approved || ['editor', 'admin'].includes(profile.role));
  const { data } = await supabase.from('material_suggestions').select('*').order('created_at', { ascending: false }).limit(100);
  const mine = (data ?? []) as Suggestion[];
  const date = (s: string) => new Date(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="container stack" style={{ ['--gap' as string]: '20px', maxWidth: 860 }}>
      <section className="panel stack sug-hero">
        <h1 className="page-title">💡 Sugerir material</h1>
        <p className="muted" style={{ margin: 0 }}>
          Conhece um livro, audiobook, curso, vídeo ou ponto que deveria estar na biblioteca? Conte pra gente. A sugestão vai direto para a
          administração do terreiro, que analisa e responde aqui mesmo.
        </p>
      </section>

      <section className="panel stack" id="form" aria-labelledby="h-form">
        <h2 id="h-form" style={{ fontSize: 18 }}>Nova sugestão</h2>
        {searchParams.erro ? <p className="alert alert-error" role="alert" style={{ margin: 0 }}>{ERRORS[searchParams.erro] ?? ERRORS.falha}</p> : null}
        {canSend ? (
          <form action={sendSuggestion} className="stack" style={{ ['--gap' as string]: '12px' }}>
            <label className="field">Título do material *<input name="title" required minLength={2} maxLength={200} placeholder="Ex.: Umbanda de Todos Nós" /></label>
            <div className="sug-grid">
              <label className="field">Autor ou responsável<input name="author" maxLength={200} placeholder="Se souber" /></label>
              <label className="field">Tipo
                <select name="kind" defaultValue="livro">{Object.entries(SUGGESTION_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
            </div>
            <label className="field">Link (opcional)<input name="link" type="text" inputMode="url" autoCapitalize="off" maxLength={500} placeholder="https://… onde encontrar o material" /></label>
            <label className="field">Por que esse material é importante?
              <textarea name="reason" maxLength={2000} rows={3} placeholder="Do que trata, para quem ajudaria, se é de domínio público ou se você tem autorização…" />
            </label>
            <small className="muted">Lembre que a biblioteca respeita direitos autorais: a equipe verifica se o material pode ser disponibilizado.</small>
            <button className="btn btn-primary" type="submit" style={{ alignSelf: 'flex-start' }}>Enviar sugestão</button>
          </form>
        ) : <p className="muted" style={{ margin: 0 }}>Você poderá sugerir materiais depois que a administração aprovar o seu cadastro.</p>}
      </section>

      <section className="panel stack" id="minhas" aria-labelledby="h-minhas">
        <h2 id="h-minhas" style={{ fontSize: 18 }}>Minhas sugestões</h2>
        {searchParams.enviada ? <p className="alert alert-ok" role="status" style={{ margin: 0 }}>Sugestão enviada! Obrigado por ajudar a biblioteca a crescer 🙏</p> : null}
        {mine.length ? (
          <ul className="sug-list">
            {mine.map((s) => {
              const st = SUGGESTION_STATUS[s.status] ?? SUGGESTION_STATUS.nova;
              return (
                <li key={s.id} className="sug-item">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <b>{s.title}</b>
                      <small className="muted" style={{ display: 'block' }}>{SUGGESTION_KINDS[s.kind] ?? s.kind}{s.author ? ` · ${s.author}` : ''} · enviada em {date(s.created_at)}</small>
                    </div>
                    <span className={st.tone}>{st.label}</span>
                  </div>
                  {s.admin_note ? <p className="sug-note"><b>Resposta da administração:</b> {s.admin_note}</p> : null}
                  {s.status === 'nova' ? (
                    <form action={withdrawSuggestion}>
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmButton className="btn btn-ghost btn-danger" message={`Retirar a sugestão “${s.title}”?`}>Retirar sugestão</ConfirmButton>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <p className="muted" style={{ margin: 0 }}>Você ainda não enviou sugestões.</p>}
      </section>
    </div>
  );
}
