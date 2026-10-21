import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/data';
import { PdfReader } from '@/components/reader/PdfReader';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Leitura' };

export default async function ReadPage({ params }: { params: { slug: string } }) {
  const { supabase, user } = await getSession();
  const { data: m } = await supabase.from('materials').select('id, slug, title, type, allow_download, page_count').eq('slug', params.slug).maybeSingle();
  if (!m) notFound();
  const { data: file } = await supabase.from('files')
    .select('id, mime_type, path, external_url').eq('material_id', m.id).eq('role', 'main').order('position').limit(1).maybeSingle();

  if (!file || (!file.path && !file.external_url)) {
    return (
      <div className="container" style={{ maxWidth: 640, marginTop: 40 }}>
        <div className="card stack" style={{ padding: 24 }}>
          <h1 className="page-title">Arquivo indisponível</h1>
          <p>O arquivo de “{m.title}” ainda não foi enviado para a biblioteca.</p>
          <Link className="btn" href={`/material/${m.slug}`}>Voltar ao material</Link>
        </div>
      </div>
    );
  }

  const isPdf = (file.mime_type ?? '').includes('pdf') || (file.path ?? '').toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    return (
      <div className="container" style={{ maxWidth: 640, marginTop: 40 }}>
        <div className="card stack" style={{ padding: 24 }}>
          <h1 className="page-title">Formato ainda não suportado no leitor</h1>
          <p>Este arquivo ({file.mime_type ?? 'formato desconhecido'}) não pode ser exibido diretamente no navegador por enquanto.
            {m.allow_download ? ' A administração permite o download.' : ' Fale com a administração para uma alternativa.'}</p>
          {m.allow_download ? <a className="btn btn-primary" href={`/api/files/${file.id}?open=1`}>Abrir arquivo</a> : null}
          <Link className="btn" href={`/material/${m.slug}`}>Voltar ao material</Link>
        </div>
      </div>
    );
  }

  const { data: progress } = user
    ? await supabase.from('reading_progress').select('location').eq('material_id', m.id).maybeSingle()
    : { data: null };
  void supabase.from('access_events').insert({ material_id: m.id, user_id: user?.id ?? null, event: 'read' }).then(() => undefined);

  return (
    <PdfReader
      fileId={file.id}
      materialId={m.id}
      slug={m.slug}
      title={m.title}
      initialPage={Math.max(1, Number(progress?.location) || 1)}
      canSave={!!user}
    />
  );
}
