import Link from 'next/link';
import { StreakCard, loadStreak } from '@/components/streak/Streak';

// Ofensiva no topo do início, com atalho para ligar o lembrete no perfil
export async function HomeStreak() {
  const s = await loadStreak();
  if (!s) return null;
  return (
    <StreakCard s={s} compact>
      <Link href="/perfil#ofensiva" className="streak-link">Recorde, lembrete diário e mais →</Link>
    </StreakCard>
  );
}
