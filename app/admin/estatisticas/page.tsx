import Link from 'next/link';
import { requireStaff } from '@/lib/data';
import { TYPE_LABEL } from '@/lib/labels';
import type { MaterialType } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Stats = {
  members: number; approved: number; pending: number; published: number; active_users: number;
  events: Partial<Record<'view' | 'read' | 'listen' | 'watch', number>>;
  top: { id: string; slug: string; title: string; type: MaterialType; total: number; people: number }[];
  daily: { day: string; total: number }[];
};
const PERIODS = [7, 30, 90];

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="stat-tile">
      <span>{label}</span>
      <b>{value}</b>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export default async function StatsPage({ searchParams }: { searchParams: { dias?: string } }) {
  const { supabase } = await requireStaff();
  const days = PERIODS.includes(Number(searchParams.dias)) ? Number(searchParams.dias) : 30;
  const { data, error } = await supabase.rpc('admin_stats', { days });
  const s = data as Stats | null;

  // Série diária completa (dias sem acesso aparecem como zero)
  const byDay = new Map((s?.daily ?? []).map((d) => [d.day, d.total]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000);
    const key = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    return { key, label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }), total: byDay.get(key) ?? 0 };
  });
  const max = Math.max(1, ...series.map((d) => d.total));
  const topMax = Math.max(1, ...(s?.top ?? []).map((t) => t.total));
  const uses = (s?.events.read ?? 0) + (s?.events.listen ?? 0) + (s?.events.watch ?? 0);

  return (
    <div className="stack" style={{ ['--gap' as string]: '20px' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="page-title">Estatísticas</h1>
        <nav className="chips" aria-label="Período">
          {PERIODS.map((p) => <Link key={p} href={`/admin/estatisticas?dias=${p}`} className="chip" aria-current={p === days ? 'true' : undefined}>Últimos {p} dias</Link>)}
        </nav>
      </div>
      {error ? <p className="alert alert-error">Não foi possível carregar as estatísticas: {error.message}</p> : null}
      {s ? (
        <>
          <div className="stat-grid">
            <Tile label="Pessoas ativas" value={s.active_users} hint={`leram ou ouviram nos últimos ${days} dias`} />
            <Tile label="Leituras" value={s.events.read ?? 0} hint="aberturas do leitor" />
            <Tile label="Audiobooks" value={s.events.listen ?? 0} hint="aberturas do player" />
            <Tile label="Vídeos" value={s.events.watch ?? 0} />
            <Tile label="Membros aprovados" value={s.approved} hint={s.pending ? `${s.pending} aguardando aprovação` : 'nenhum aguardando'} />
            <Tile label="Materiais publicados" value={s.published} />
          </div>

          <section className="card stack" style={{ padding: 20 }} aria-labelledby="h-dia">
            <h2 id="h-dia" style={{ fontSize: 16 }}>Acessos por dia</h2>
            <span className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>Leituras, audiobooks e vídeos abertos · total {uses}</span>
            <div className="daychart" role="img" aria-label={`Acessos por dia nos últimos ${days} dias; máximo de ${max} em um dia`}>
              <div className="daychart-grid" aria-hidden="true"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div>
              <div className="daychart-bars">
                {series.map((d) => (
                  <div key={d.key} className="daychart-col" tabIndex={0} aria-label={`${d.label}: ${d.total}`}>
                    <i style={{ height: `${(d.total / max) * 100}%` }} />
                    <span className="tip">{d.label}<b>{d.total}</b></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 11.5 }} aria-hidden="true">
              <span>{series[0].label}</span><span>{series[series.length - 1].label}</span>
            </div>
            <details>
              <summary className="muted" style={{ fontSize: 12.5, cursor: 'pointer' }}>Ver como tabela</summary>
              <table className="data" style={{ marginTop: 8 }}>
                <thead><tr><th scope="col">Dia</th><th scope="col">Acessos</th></tr></thead>
                <tbody>{series.filter((d) => d.total).map((d) => <tr key={d.key}><td>{d.label}</td><td>{d.total}</td></tr>)}</tbody>
              </table>
            </details>
          </section>

          <section className="card stack" style={{ padding: 20 }} aria-labelledby="h-top">
            <h2 id="h-top" style={{ fontSize: 16 }}>Mais acessados</h2>
            {s.top.length ? (
              <table className="data">
                <thead><tr><th scope="col">Material</th><th scope="col">Formato</th><th scope="col">Pessoas</th><th scope="col" style={{ width: '38%' }}>Acessos</th></tr></thead>
                <tbody>{s.top.map((t) => (
                  <tr key={t.id}>
                    <td><Link href={`/material/${t.slug}`} style={{ fontWeight: 600 }}>{t.title}</Link></td>
                    <td className="muted">{TYPE_LABEL[t.type]}</td>
                    <td>{t.people}</td>
                    <td><span className="hbar"><i style={{ width: `calc(${t.total / topMax} * (100% - 48px))` }} /><b>{t.total}</b></span></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="muted" style={{ margin: 0 }}>Ainda não há acessos neste período.</p>}
            <small className="muted">Cada abertura do leitor, do player ou de um vídeo conta um acesso. Os dados pessoais de leitura continuam privados: aqui aparecem só totais.</small>
          </section>
        </>
      ) : null}
    </div>
  );
}
