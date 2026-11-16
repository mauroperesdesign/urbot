import { getSession } from '@/lib/data';
import { PushSettings } from './PushSettings';

export type StreakData = { current: number; best: number; today: boolean; week: { day: string; done: boolean }[] };

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

export async function loadStreak() {
  const { supabase, user } = await getSession();
  if (!user) return null;
  const { data } = await supabase.rpc('my_streak');
  return (data as StreakData | null) ?? null;
}

function hint(s: StreakData) {
  if (s.today) return s.current > 1 ? 'Você já estudou hoje. Volte amanhã para continuar!' : 'Primeiro dia feito! Volte amanhã para começar a ofensiva.';
  if (s.current) return `Estude hoje para não perder sua ofensiva de ${dias(s.current)}.`;
  return 'Leia, ouça ou assista algo hoje para começar uma ofensiva.';
}

// Ofensiva de estudos: dias seguidos estudando, com os últimos 7 dias marcados
export function StreakCard({ s, compact = false, children }: { s: StreakData; compact?: boolean; children?: React.ReactNode }) {
  return (
    <section className={`streak${compact ? ' streak-compact' : ''}`} data-today={s.today ? 'true' : undefined} aria-labelledby="h-ofensiva" id="ofensiva">
      <div className="streak-flame" aria-hidden="true">🔥</div>
      <div className="streak-main">
        <h2 id="h-ofensiva"><b>{dias(s.current)}</b> de ofensiva</h2>
        <p>{hint(s)}</p>
        <ol className="streak-week" aria-label="Últimos 7 dias">
          {s.week.map((d, i) => {
            const wd = WD[new Date(`${d.day}T12:00:00`).getDay()];
            const label = new Date(`${d.day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
            return (
              <li key={d.day} data-done={d.done ? 'true' : undefined} data-today={i === s.week.length - 1 ? 'true' : undefined}
                aria-label={`${label}: ${d.done ? 'estudou' : 'não estudou'}`}>
                <span aria-hidden="true">{d.done ? '✓' : ''}</span><small aria-hidden="true">{wd}</small>
              </li>
            );
          })}
        </ol>
        {!compact ? <small className="muted">Seu recorde: {dias(s.best)}</small> : null}
        {children}
      </div>
    </section>
  );
}

// Cartão completo (perfil): ofensiva + ajuste das notificações
export async function StreakPanel() {
  const s = await loadStreak();
  if (!s) return null;
  const { supabase } = await getSession();
  const { count } = await supabase.from('streak_phrases').select('id', { count: 'exact', head: true }).eq('active', true);
  return (
    <StreakCard s={s}>
      <PushSettings publicKey={process.env.VAPID_PUBLIC_KEY ?? ''} phrases={count ?? 0} />
    </StreakCard>
  );
}
