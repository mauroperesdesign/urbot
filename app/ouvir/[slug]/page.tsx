import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession, withCoverUrls } from '@/lib/data';
import { AudioView } from '@/components/player/AudioView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Ouvir' };

export default async function ListenPage({ params, searchParams }: { params: { slug: string }; searchParams: { faixa?: string } }) {
  const { supabase, user } = await getSession();
  const { data: m } = await supabase.from('materials')
    .select('id, slug, title, cover_path, material_authors(position, authors(name))').eq('slug', params.slug).maybeSingle();
  if (!m) notFound();
  const { data: tracks } = await supabase.from('files')
    .select('id, title, position, duration_seconds, path').eq('material_id', m.id).eq('role', 'track').order('position');
  const playable = (tracks ?? []).filter((t) => t.path);
  if (!playable.length) {
    return (
      <div className="container" style={{ maxWidth: 640, marginTop: 40 }}>
        <div className="card stack" style={{ padding: 24 }}>
          <h1 style={{ fontSize: 32 }}>Áudio indisponível</h1>
          <p>As faixas de “{m.title}” ainda não foram enviadas para a biblioteca.</p>
          <Link className="btn" href={`/material/${m.slug}`}>Voltar ao material</Link>
        </div>
      </div>
    );
  }

  let startIndex = Math.max(0, (Number(searchParams.faixa) || 0) - 1);
  let startAt = 0;
  if (user && !searchParams.faixa) {
    const { data: last } = await supabase.from('media_progress')
      .select('file_id, position_seconds, completed').eq('material_id', m.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const i = last ? playable.findIndex((t) => t.id === last.file_id) : -1;
    if (i >= 0) {
      startIndex = last!.completed && i + 1 < playable.length ? i + 1 : i;
      startAt = last!.completed ? 0 : Number(last!.position_seconds) || 0;
    }
  }
  const [cover] = await withCoverUrls([{ cover_path: m.cover_path }]);
  const author = ((m.material_authors ?? []) as unknown as { position: number; authors: { name: string } | null }[])
    .sort((a, b) => a.position - b.position).map((a) => a.authors?.name).filter(Boolean).join(', ');
  void supabase.from('access_events').insert({ material_id: m.id, user_id: user?.id ?? null, event: 'listen' }).then(() => undefined);

  return (
    <AudioView
      queue={{
        materialId: m.id, materialSlug: m.slug, materialTitle: m.title, author,
        tracks: playable.map((t) => ({ id: t.id, title: t.title ?? `Faixa ${t.position + 1}`, duration: t.duration_seconds })),
      }}
      startIndex={Math.min(startIndex, playable.length - 1)}
      startAt={startAt}
      coverUrl={cover.coverUrl}
      canSave={!!user}
    />
  );
}
