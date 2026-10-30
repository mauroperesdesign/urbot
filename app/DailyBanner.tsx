import { getSession } from '@/lib/data';
import { DailyMessage } from './DailyMessage';

// Data de hoje no fuso do terreiro
function today() {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'numeric' }).formatToParts(new Date());
  return { day: Number(parts.find((p) => p.type === 'day')!.value), month: Number(parts.find((p) => p.type === 'month')!.value) };
}

// Topo da página inicial: data especial da religião (quando houver) e a mensagem do dia
export async function DailyBanner() {
  const { supabase } = await getSession();
  const { day, month } = today();
  const [{ data: special }, { data: messages }] = await Promise.all([
    supabase.from('calendar_dates').select('title, description, greeting').eq('month', month).eq('day', day),
    supabase.from('daily_messages').select('entity, text').eq('active', true),
  ]);
  const list = messages ?? [];
  return (
    <>
      {(special ?? []).map((s) => (
        <section key={s.title} className="special-day" aria-label="Data especial de hoje">
          <span className="eyebrow" style={{ color: '#9DB6FF' }}>Hoje</span>
          <h2>{s.title}</h2>
          {s.description ? <p>{s.description}</p> : null}
          {s.greeting ? <b className="greeting">{s.greeting}</b> : null}
        </section>
      ))}
      {list.length ? <DailyMessage messages={list} initial={Math.floor(Math.random() * list.length)} /> : null}
    </>
  );
}
