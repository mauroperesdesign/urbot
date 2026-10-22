import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession, withCoverUrls } from '@/lib/data';
import { VideoPlayer } from '@/components/player/VideoPlayer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Vídeo' };

export default async function WatchPage({ params }: { params: { slug: string } }) {
  const { supabase, user } = await getSession();
  const { data: m } = await supabase.from('materials').select('id, slug, title, subtitle, type, cover_path, description').eq('slug', params.slug).maybeSingle();
  if (!m) notFound();
  const { data: files } = await supabase.from('files').select('id, role, title, path, mime_type, external_url')
    .eq('material_id', m.id).in('role', ['main', 'subtitle']).order('position');
  const main = (files ?? []).find((f) => f.role === 'main' && (f.path || f.external_url));

  if (!main) {
    return (
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="panel stack">
          <h1 className="page-title">Vídeo indisponível</h1>
          <p>O vídeo de “{m.title}” ainda não foi enviado para a biblioteca.</p>
          <Link className="btn" href={`/material/${m.slug}`}>Voltar ao material</Link>
        </div>
      </div>
    );
  }

  const sign = async (path: string) => (await supabase.storage.from('materials').createSignedUrl(path, 60 * 60 * 4)).data?.signedUrl ?? null;
  const src = main.path ? await sign(main.path) : main.external_url;
  const subtitles = (await Promise.all((files ?? []).filter((f) => f.role === 'subtitle' && f.path).map(async (f) => {
    const url = await sign(f.path!);
    const name = (f.title ?? '').toLowerCase();
    const lang = /\b(en|ingl)/.test(name) ? 'en' : /\b(es|espa)/.test(name) ? 'es' : 'pt';
    return url ? { src: url, lang, label: lang === 'en' ? 'Inglês' : lang === 'es' ? 'Espanhol' : 'Português' } : null;
  }))).filter(Boolean) as { src: string; label: string; lang: string }[];

  const { data: progress } = user
    ? await supabase.from('media_progress').select('position_seconds').eq('file_id', main.id).maybeSingle()
    : { data: null };
  const [cover] = await withCoverUrls([{ cover_path: m.cover_path }], { full: true });
  void supabase.from('access_events').insert({ material_id: m.id, user_id: user?.id ?? null, event: 'watch' }).then(() => undefined);

  if (!src) return <div className="container panel"><p>Você não tem permissão para assistir a este vídeo.</p></div>;
  return (
    <div className="container stack" style={{ ['--gap' as string]: '16px', maxWidth: 1100 }}>
      <Link href={`/material/${m.slug}`} className="muted" style={{ fontSize: 13 }}>← {m.title}</Link>
      <div className="panel stack" style={{ ['--gap' as string]: '14px' }}>
        <VideoPlayer src={src} subtitles={subtitles} fileId={main.id} materialId={m.id} canSave={!!user}
          resumeAt={Number(progress?.position_seconds) || 0} poster={cover.coverUrl} />
        <div className="stack" style={{ ['--gap' as string]: '4px' }}>
          <h1 className="page-title">{m.title}</h1>
          {m.subtitle ? <span className="muted">{m.subtitle}</span> : null}
        </div>
        {m.description ? <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{m.description}</p> : null}
        {!user ? <p className="muted" style={{ margin: 0, fontSize: 13 }}><Link href={`/entrar?next=/assistir/${m.slug}`}>Entre</Link> para salvar onde você parou.</p> : null}
      </div>
    </div>
  );
}
