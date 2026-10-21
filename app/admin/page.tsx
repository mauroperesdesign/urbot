import Link from 'next/link';
import { requireStaff } from '@/lib/data';

export const dynamic = 'force-dynamic';

function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: string }) {
  return (
    <div className="card stack" style={{ padding: 18, ['--gap' as string]: '2px', background: tone }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <span className="serif" style={{ fontSize: 40, lineHeight: 1 }}>{value}</span>
      {hint ? <span className="muted" style={{ fontSize: 12 }}>{hint}</span> : null}
    </div>
  );
}

export default async function AdminHome() {
  const { supabase } = await requireStaff();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [total, published, drafts, pendingFiles, failedFiles, pendingUsers, events, sizes] = await Promise.all([
    count(supabase.from('materials').select('id', { count: 'exact', head: true })),
    count(supabase.from('materials').select('id', { count: 'exact', head: true }).eq('status', 'published')),
    count(supabase.from('materials').select('id', { count: 'exact', head: true }).eq('status', 'draft')),
    count(supabase.from('files').select('id', { count: 'exact', head: true }).is('path', null)),
    count(supabase.from('files').select('id', { count: 'exact', head: true }).eq('processing_status', 'failed')),
    count(supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('approved', false).eq('role', 'member')),
    count(supabase.from('access_events').select('id', { count: 'exact', head: true }).gte('created_at', since)),
    supabase.from('files').select('size_bytes').not('path', 'is', null),
  ]);
  const usedBytes = (sizes.data ?? []).reduce((a, f) => a + (f.size_bytes ?? 0), 0);
  const { data: failed } = await supabase.from('files').select('id, original_name, processing_error, materials(id, title)').eq('processing_status', 'failed').limit(10);

  return (
    <div className="stack" style={{ ['--gap' as string]: '20px' }}>
      <h1 className="page-title">Visão geral</h1>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <Stat label="Materiais" value={total} hint={`${published} publicados · ${drafts} rascunhos`} />
        <Stat label="Arquivos aguardando envio" value={pendingFiles} hint="Registros sem arquivo no armazenamento" tone="#FBF3E1" />
        <Stat label="Falhas de processamento" value={failedFiles} tone={failedFiles ? '#F6E3DC' : undefined} />
        <Stat label="Cadastros para aprovar" value={pendingUsers} />
        <Stat label="Acessos (30 dias)" value={events} hint="Aberturas reais de leitura e áudio" />
        <Stat label="Armazenamento usado" value={`${(usedBytes / 1024 ** 3).toFixed(2)} GB`} hint="Soma dos arquivos enviados" />
      </div>
      <div className="row">
        <Link className="btn btn-primary" href="/admin/materiais/novo">+ Novo material</Link>
        <Link className="btn" href="/admin/materiais?status=draft">Revisar rascunhos</Link>
        {pendingUsers ? <Link className="btn" href="/admin/usuarios">Aprovar cadastros</Link> : null}
      </div>
      {failed?.length ? (
        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 24 }}>Falhas de processamento</h2>
          <ul>{failed.map((f) => {
            const mat = f.materials as unknown as { id: string; title: string } | null;
            return <li key={f.id}><Link href={`/admin/materiais/${mat?.id}`}>{mat?.title}</Link> — {f.original_name}: {f.processing_error}</li>;
          })}</ul>
        </section>
      ) : null}
    </div>
  );
}
