'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveMaterial } from '../../actions';
import { TYPE_LABEL, READ_TYPES, LISTEN_TYPES, WATCH_TYPES } from '@/lib/labels';
import type { Category, Material, MaterialType } from '@/lib/types';

function Save() {
  const { pending } = useFormStatus();
  return <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>;
}

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card" style={{ padding: 20, margin: 0, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
      <legend style={{ fontWeight: 700, padding: '0 6px' }}>{title}</legend>
      {children}
    </fieldset>
  );
}

export function MaterialForm({ material, internal, categories, selected, authors }: {
  material: (Material & { publishers: { name: string } | null }) | null;
  internal: { internal_notes: string | null; review_notes: string | null } | null;
  categories: Category[];
  selected: string[];
  authors: string;
}) {
  const [state, action] = useFormState(saveMaterial, undefined);
  const [type, setType] = useState<MaterialType>(material?.type ?? 'book');
  const m = material;
  const isRead = READ_TYPES.includes(type);
  const isMedia = LISTEN_TYPES.includes(type) || WATCH_TYPES.includes(type);
  const roots = categories.filter((c) => !c.parent_id);
  const full = { gridColumn: '1 / -1' } as const;

  return (
    <form action={action} className="stack" style={{ ['--gap' as string]: '16px' }}>
      {m ? <input type="hidden" name="id" value={m.id} /> : null}

      <Fieldset title="Tipo de material">
        <div className="row" style={full} role="radiogroup" aria-label="Tipo">
          {(Object.keys(TYPE_LABEL) as MaterialType[]).map((t) => (
            <label key={t} className={`chip${type === t ? ' active' : ''}`} style={{ cursor: 'pointer' }}>
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />{TYPE_LABEL[t]}
            </label>
          ))}
        </div>
        <p className="muted" style={{ ...full, margin: 0, fontSize: 13 }}>
          {isRead ? 'Livros e documentos: edição, ISBN, páginas e sumário.' : isMedia ? 'Áudio e vídeo: faixas ou capítulos e duração.' : type === 'course' ? 'Cursos: módulos e aulas entram na próxima etapa da plataforma.' : 'Link externo: informe a fonte e confirme que ela autoriza o acesso.'}
        </p>
      </Fieldset>

      <Fieldset title="Identificação">
        <label className="field" style={full}>Título *<input name="title" required defaultValue={m?.title} maxLength={300} /></label>
        <label className="field" style={full}>Subtítulo<input name="subtitle" defaultValue={m?.subtitle ?? ''} /></label>
        <label className="field">Autor(es)<small>Um por linha</small><textarea name="authors" defaultValue={authors} rows={3} style={{ minHeight: 80 }} /></label>
        <label className="field">Organizador<input name="organizer" defaultValue={m?.organizer ?? ''} /></label>
        <label className="field">Editora ou instituição<input name="publisher" defaultValue={m?.publishers?.name ?? ''} /></label>
        <label className="field">Ano<input name="year" inputMode="numeric" defaultValue={m?.year ?? ''} /></label>
        <label className="field">Idioma
          <select name="language" defaultValue={m?.language ?? 'pt'}><option value="pt">Português</option><option value="es">Espanhol</option><option value="en">Inglês</option><option value="yo">Iorubá</option></select>
        </label>
        <label className="field">Tradição ou perspectiva<small>Se conhecida — casa, escola, vertente</small><input name="tradition" defaultValue={m?.tradition ?? ''} /></label>
        {isRead ? <>
          <label className="field">ISBN<input name="isbn" defaultValue={m?.isbn ?? ''} /></label>
          <label className="field">Nº de páginas<small>Preenchido ao enviar o PDF</small><input name="page_count" inputMode="numeric" defaultValue={m?.page_count ?? ''} /></label>
        </> : null}
        {isMedia ? <label className="field">Duração total (min)<small>Calculada ao enviar as faixas</small><input name="duration_minutes" inputMode="numeric" defaultValue={m?.duration_seconds ? Math.round(m.duration_seconds / 60) : ''} /></label> : null}
        <label className="field" style={full}>Descrição<textarea name="description" defaultValue={m?.description ?? ''} /></label>
        <label className="field" style={full}>Palavras-chave<small>Separadas por vírgula</small><input name="keywords" defaultValue={m?.keywords?.join(', ') ?? ''} /></label>
        <label className="field" style={full}>Fonte ou referência bibliográfica<input name="source_reference" defaultValue={m?.source_reference ?? ''} /></label>
      </Fieldset>

      <fieldset className="card" style={{ padding: 20, margin: 0 }}>
        <legend style={{ fontWeight: 700, padding: '0 6px' }}>Categorias</legend>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {roots.map((r) => (
            <div key={r.id} className="stack" style={{ ['--gap' as string]: '2px' }}>
              <label className="check"><input type="checkbox" name="categories" value={r.id} defaultChecked={selected.includes(r.id)} /><b>{r.name}</b></label>
              {categories.filter((c) => c.parent_id === r.id).map((c) => (
                <label key={c.id} className="check" style={{ fontWeight: 400, paddingLeft: 18 }}>
                  <input type="checkbox" name="categories" value={c.id} defaultChecked={selected.includes(c.id)} />{c.name}
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      <Fieldset title="Direitos de uso">
        <label className="field">Titular dos direitos<input name="rights_holder" defaultValue={m?.rights_holder ?? ''} /></label>
        <label className="field">Licença
          <select name="license" defaultValue={m?.license ?? ''}>
            <option value="">Selecione…</option><option>Uso interno do terreiro</option><option>Material próprio</option>
            <option>Autorização do titular</option><option>Creative Commons</option><option>Domínio público</option>
          </select>
        </label>
        <label className="field">Fonte original<input name="original_source" defaultValue={m?.original_source ?? ''} /></label>
        <label className="field">Data da verificação<input type="date" name="rights_verified_at" defaultValue={m?.rights_verified_at ?? ''} /></label>
        <label className="field" style={full}>Condições de acesso<input name="access_conditions" defaultValue={m?.access_conditions ?? ''} /></label>
        <label className="check" style={full}><input type="checkbox" name="publication_authorized" defaultChecked={m?.publication_authorized} />Publicação autorizada (exigida para publicar)</label>
        <label className="check" style={full}><input type="checkbox" name="allow_download" defaultChecked={m?.allow_download} />Permitir download do arquivo</label>
      </Fieldset>

      <Fieldset title="Publicação">
        <label className="field">Status
          <select name="status" defaultValue={m?.status ?? 'draft'}><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="archived">Arquivado</option></select>
        </label>
        <label className="field">Visibilidade
          <select name="visibility" defaultValue={m?.visibility ?? 'restricted'}><option value="restricted">Restrito (membros aprovados)</option><option value="public">Público</option></select>
        </label>
        <label className="check"><input type="checkbox" name="featured" defaultChecked={m?.featured} />Destacar na página inicial</label>
        <label className="field">Ordem no destaque<input name="featured_rank" inputMode="numeric" defaultValue={m?.featured_rank ?? ''} /></label>
        <label className="field" style={full}>Observações internas<small>Visíveis só para a equipe</small><textarea name="internal_notes" defaultValue={internal?.internal_notes ?? ''} /></label>
        <label className="field" style={full}>Pendências de revisão<small>Ex.: confirmar autor, título real, ordem das faixas</small><textarea name="review_notes" defaultValue={internal?.review_notes ?? ''} style={{ minHeight: 70 }} /></label>
      </Fieldset>

      {state?.error ? <p className="alert alert-error" role="alert">{state.error}</p> : null}
      {state?.ok ? <p className="alert alert-ok" role="status">{state.ok}</p> : null}
      <div className="row" style={{ position: 'sticky', bottom: 12, background: 'var(--bg)', padding: 8, borderRadius: 14 }}><Save /></div>
    </form>
  );
}
