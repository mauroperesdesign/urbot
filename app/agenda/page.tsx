import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/data';
import { ConfirmButton } from '@/components/ConfirmButton';
import { headers } from 'next/headers';
import { addEvent, deleteEvent, removeFeed, rotateFeed } from './actions';
import { SyncLinks } from './SyncLinks';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Agenda', robots: { index: false } };

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function todayIso() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

type Holy = { month: number; day: number; title: string; description: string | null; greeting: string | null };
type Ev = { id: string; day: string; title: string; notes: string | null };

export default async function Agenda({ searchParams }: { searchParams: { ano?: string; dia?: string } }) {
  const { supabase } = await requireUser('/agenda');
  const h0 = headers();
  const site = process.env.NEXT_PUBLIC_SITE_URL || `${h0.get('x-forwarded-proto') ?? 'http'}://${h0.get('host')}`;
  const today = todayIso();
  const year = Number(searchParams.ano) >= 1900 && Number(searchParams.ano) <= 2200 ? Number(searchParams.ano) : Number(today.slice(0, 4));
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.dia ?? '') && searchParams.dia!.startsWith(String(year)) ? searchParams.dia! : (today.startsWith(String(year)) ? today : `${year}-01-01`);

  const [{ data: holyData }, { data: evData }, { data: feed }] = await Promise.all([
    supabase.from('calendar_dates').select('month, day, title, description, greeting').order('month').order('day'),
    supabase.from('agenda_events').select('id, day, title, notes').gte('day', `${year}-01-01`).lte('day', `${year}-12-31`).order('day').order('created_at'),
    supabase.from('calendar_feeds').select('token').maybeSingle(),
  ]);
  const feedUrl = feed?.token ? `${site.replace(/\/$/, '')}/api/agenda/${feed.token}.ics` : null;
  const holy = (holyData ?? []) as Holy[];
  const events = (evData ?? []) as Ev[];
  const holyOn = (m: number, d: number) => holy.filter((h) => h.month === m && h.day === d);
  const eventsOn = (key: string) => events.filter((e) => e.day === key);

  const [, sm, sd] = selected.split('-').map(Number);
  const dayHoly = holyOn(sm, sd);
  const dayEvents = eventsOn(selected);
  const longDate = new Date(`${selected}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const label = longDate.charAt(0).toUpperCase() + longDate.slice(1);
  const upcoming = holy
    .map((h) => ({ ...h, key: iso(Number(today.slice(0, 4)), h.month, h.day) }))
    .map((h) => (h.key < today ? { ...h, key: iso(Number(today.slice(0, 4)) + 1, h.month, h.day) } : h))
    .sort((a, b) => a.key.localeCompare(b.key)).slice(0, 5);

  return (
    <div className="container stack" style={{ ['--gap' as string]: '20px' }}>
      <div className="panel row" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ ['--gap' as string]: '2px' }}>
          <h1 className="page-title">Agenda {year}</h1>
          <span className="muted" style={{ fontSize: 13 }}>
            <span className="cal-dot holy" aria-hidden="true" /> datas da religião · <span className="cal-dot mine" aria-hidden="true" /> seus compromissos
          </span>
        </div>
        <nav className="row" aria-label="Ano">
          <Link className="btn" href={`/agenda?ano=${year - 1}`} aria-label="Ano anterior">← {year - 1}</Link>
          {String(year) !== today.slice(0, 4) ? <Link className="btn" href="/agenda">Hoje</Link> : null}
          <Link className="btn" href={`/agenda?ano=${year + 1}`} aria-label="Próximo ano">{year + 1} →</Link>
        </nav>
      </div>

      <div className="agenda-layout">
        <div className="cal-year">
          {MONTHS.map((name, mi) => {
            const m = mi + 1;
            const first = new Date(year, mi, 1).getDay();
            const days = new Date(year, m, 0).getDate();
            return (
              <section key={name} className="cal-month" aria-label={`${name} de ${year}`}>
                <h2>{name}</h2>
                <div className="cal-grid">
                  {WEEK.map((w, i) => <span key={i} className="cal-wd" aria-hidden="true">{w}</span>)}
                  {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
                  {Array.from({ length: days }, (_, i) => {
                    const d = i + 1;
                    const key = iso(year, m, d);
                    const h = holyOn(m, d);
                    const mine = eventsOn(key);
                    const desc = [h.map((x) => x.title).join(', '), mine.length ? `${mine.length} compromisso(s)` : ''].filter(Boolean).join(' · ');
                    return (
                      <Link key={key} href={`/agenda?ano=${year}&dia=${key}#dia`} className="cal-day"
                        data-holy={h.length ? 'true' : undefined} data-mine={mine.length ? 'true' : undefined}
                        data-today={key === today ? 'true' : undefined} aria-current={key === selected ? 'date' : undefined}
                        aria-label={`${d} de ${name}${desc ? `: ${desc}` : ''}`} title={desc || undefined}>
                        {d}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="stack" style={{ ['--gap' as string]: '20px' }}>
          <section className="panel stack" id="dia" aria-labelledby="h-dia">
            <h2 id="h-dia" style={{ fontSize: 17 }}>{label}</h2>
            {dayHoly.map((h) => (
              <div key={h.title} className="cal-holy-card">
                <b>{h.title}</b>
                {h.description ? <span>{h.description}</span> : null}
                {h.greeting ? <em>{h.greeting}</em> : null}
              </div>
            ))}
            {dayEvents.length ? (
              <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, ['--gap' as string]: '6px' }}>
                {dayEvents.map((e) => (
                  <li key={e.id} className="cal-event">
                    <div style={{ flex: 1, minWidth: 0 }}><b>{e.title}</b>{e.notes ? <p>{e.notes}</p> : null}</div>
                    <form action={deleteEvent}>
                      <input type="hidden" name="id" value={e.id} /><input type="hidden" name="day" value={selected} />
                      <ConfirmButton className="btn btn-ghost btn-danger" message={`Apagar “${e.title}”?`}>Apagar</ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : !dayHoly.length ? <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Nada marcado neste dia.</p> : null}
            <form action={addEvent} className="stack" style={{ ['--gap' as string]: '8px' }}>
              <input type="hidden" name="day" value={selected} />
              <label className="field">Novo compromisso<input name="title" maxLength={120} required placeholder="Ex.: Gira de Pretos Velhos, 20h" /></label>
              <label className="field">Observações (opcional)<textarea name="notes" maxLength={2000} rows={2} style={{ minHeight: 60 }} /></label>
              <button className="btn btn-primary" type="submit" style={{ alignSelf: 'flex-start' }}>Adicionar</button>
            </form>
          </section>

          <section className="panel stack" id="sincronizar" aria-labelledby="h-sync">
            <h2 id="h-sync" style={{ fontSize: 17 }}>Vincular ao seu calendário</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              Seus compromissos e as datas da religião aparecem no Google Agenda ou no Calendário do iPhone, e se atualizam sozinhos.
            </p>
            {feedUrl ? (
              <>
                <SyncLinks https={feedUrl} />
                <small className="muted">
                  O link é pessoal: quem tiver ele vê a sua agenda. Os apps buscam novidades de tempos em tempos (o Google pode levar algumas horas).
                </small>
                <div className="row">
                  <form action={rotateFeed}><ConfirmButton className="btn btn-ghost" message="Gerar um novo link? O link atual para de funcionar e será preciso vincular de novo.">Gerar novo link</ConfirmButton></form>
                  <form action={removeFeed}><ConfirmButton className="btn btn-ghost btn-danger" message="Desligar a sincronização? Os calendários vinculados param de receber a agenda.">Desligar</ConfirmButton></form>
                </div>
              </>
            ) : (
              <form action={rotateFeed}><button className="btn btn-primary" type="submit">Criar link de sincronização</button></form>
            )}
          </section>

          <section className="panel stack" aria-labelledby="h-prox">
            <h2 id="h-prox" style={{ fontSize: 17 }}>Próximas datas da religião</h2>
            <ol className="lessons">
              {upcoming.map((h) => (
                <li key={h.key + h.title}>
                  <Link className="lesson" href={`/agenda?ano=${h.key.slice(0, 4)}&dia=${h.key}#dia`}>
                    <span className="lesson-n" aria-hidden="true">{Number(h.key.slice(8))}</span>
                    <span className="lesson-t"><b>{h.title}</b><small>{new Date(`${h.key}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}{h.greeting ? ` · ${h.greeting}` : ''}</small></span>
                  </Link>
                </li>
              ))}
            </ol>
            <small className="muted">As datas e os sincretismos variam entre as casas; a administração pode ajustá-las.</small>
          </section>
        </aside>
      </div>
    </div>
  );
}
