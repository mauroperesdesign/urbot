import Link from 'next/link';
import { ConfirmButton } from '@/components/ConfirmButton';
import { deleteReview, saveReview } from './actions';
import { StarInput } from './StarInput';

export type Review = { id: string; rating: number; body: string | null; created_at: string; updated_at: string; author: string; mine: boolean };

export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span className="stars" style={{ fontSize: size }} role="img" aria-label={`${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} de 5 estrelas`}>
      <span aria-hidden="true">★★★★★</span>
      <span aria-hidden="true" className="stars-on" style={{ width: `${(value / 5) * 100}%` }}>★★★★★</span>
    </span>
  );
}

export function reviewSummary(list: Review[]) {
  const count = list.length;
  const avg = count ? list.reduce((s, r) => s + r.rating, 0) / count : 0;
  return { count, avg };
}

// Espaço de avaliações do material: média, distribuição, sua avaliação e as dos outros membros
export function Reviews({ materialId, slug, list, canReview, signedIn, staff, status }: {
  materialId: string; slug: string; list: Review[]; canReview: boolean; signedIn: boolean; staff: boolean; status?: string;
}) {
  const { count, avg } = reviewSummary(list);
  const mine = list.find((r) => r.mine);
  const others = list.filter((r) => !r.mine);
  const date = (s: string) => new Date(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <section className="panel stack" id="avaliacoes" aria-labelledby="h-avaliacoes">
      <h2 id="h-avaliacoes" style={{ fontSize: 18 }}>Avaliações e resenhas</h2>

      {!signedIn ? (
        <p className="muted" style={{ margin: 0 }}><Link href={`/entrar?next=/material/${slug}%23avaliacoes`} style={{ fontWeight: 600 }}>Entre na sua conta</Link> para ver e escrever avaliações.</p>
      ) : !canReview ? (
        <p className="muted" style={{ margin: 0 }}>As avaliações ficam disponíveis depois que a administração aprovar o seu cadastro.</p>
      ) : (
        <>
          <div className="review-summary">
            <div className="review-avg">
              <b>{count ? avg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–'}</b>
              <Stars value={avg} size={18} />
              <span className="muted">{count ? `${count} ${count === 1 ? 'avaliação' : 'avaliações'}` : 'Sem avaliações ainda'}</span>
            </div>
            <ol className="review-bars" aria-label="Distribuição das notas">
              {[5, 4, 3, 2, 1].map((n) => {
                const k = list.filter((r) => r.rating === n).length;
                return (
                  <li key={n}>
                    <span>{n} ★</span>
                    <span className="bar" aria-hidden="true"><i style={{ width: count ? `${(k / count) * 100}%` : 0 }} /></span>
                    <span className="muted">{k}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {status === 'ok' ? <p className="alert alert-ok" role="status" style={{ margin: 0 }}>Avaliação salva. Obrigado por compartilhar!</p> : null}
          {status === 'erro' ? <p className="alert alert-error" role="alert" style={{ margin: 0 }}>Não foi possível salvar a avaliação. Tente de novo.</p> : null}
          {status === 'nota' ? <p className="alert alert-error" role="alert" style={{ margin: 0 }}>Escolha uma nota de 1 a 5 estrelas.</p> : null}

          <form action={saveReview} className="review-form stack" style={{ ['--gap' as string]: '10px' }}>
            <b>{mine ? 'Sua avaliação' : 'Avalie este material'}</b>
            <input type="hidden" name="material" value={materialId} />
            <input type="hidden" name="slug" value={slug} />
            <StarInput initial={mine?.rating ?? 0} />
            <label className="field">Resenha (opcional)
              <textarea name="body" rows={4} maxLength={3000} defaultValue={mine?.body ?? ''}
                placeholder="O que você aprendeu? Para quem recomendaria? Algum capítulo ou faixa que se destaca?" />
            </label>
            <div className="row">
              <button className="btn btn-primary" type="submit">{mine ? 'Atualizar avaliação' : 'Publicar avaliação'}</button>
              {mine ? <span className="muted" style={{ fontSize: 12.5 }}>Publicada em {date(mine.created_at)}</span> : null}
            </div>
          </form>
          {mine ? (
            <form action={deleteReview}>
              <input type="hidden" name="id" value={mine.id} /><input type="hidden" name="slug" value={slug} />
              <ConfirmButton className="btn btn-ghost btn-danger" message="Apagar a sua avaliação?">Apagar minha avaliação</ConfirmButton>
            </form>
          ) : null}

          {others.length ? (
            <ul className="review-list">
              {others.map((r) => (
                <li key={r.id} className="review">
                  <div className="review-head">
                    <span className="avatar" aria-hidden="true">{r.author.slice(0, 1).toUpperCase()}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{r.author}</b>
                      <div className="row" style={{ gap: 8 }}><Stars value={r.rating} size={13} /><span className="muted" style={{ fontSize: 12.5 }}>{date(r.updated_at)}{r.updated_at.slice(0, 16) !== r.created_at.slice(0, 16) ? ' · editada' : ''}</span></div>
                    </div>
                    {staff ? (
                      <form action={deleteReview}>
                        <input type="hidden" name="id" value={r.id} /><input type="hidden" name="slug" value={slug} />
                        <ConfirmButton className="btn btn-ghost btn-danger" message={`Remover a avaliação de ${r.author}?`}>Remover</ConfirmButton>
                      </form>
                    ) : null}
                  </div>
                  {r.body ? <p>{r.body}</p> : null}
                </li>
              ))}
            </ul>
          ) : count <= 1 ? <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{mine ? 'Você foi a primeira pessoa a avaliar.' : 'Seja a primeira pessoa a avaliar este material.'}</p> : null}
        </>
      )}
    </section>
  );
}
