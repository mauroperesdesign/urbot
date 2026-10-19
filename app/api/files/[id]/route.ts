import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Gera uma URL assinada e temporária para um arquivo. A consulta usa a sessão do
// usuário, então a RLS de `files` e de `storage.objects` decide se ele pode acessar.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const open = new URL(req.url).searchParams.get('open') === '1';
  const supabase = createClient();
  const { data: file } = await supabase
    .from('files').select('id, bucket, path, external_url, material_id, role').eq('id', params.id).maybeSingle();
  if (!file) return NextResponse.json({ error: 'sem acesso' }, { status: 403 });
  if (!file.path) {
    if (file.external_url) return NextResponse.json({ url: file.external_url });
    return NextResponse.json({ error: 'arquivo ainda não enviado' }, { status: 404 });
  }
  const { data, error } = await supabase.storage.from(file.bucket).createSignedUrl(file.path, 60 * 60 * 2);
  if (error || !data) return NextResponse.json({ error: 'sem acesso' }, { status: 403 });
  if (open) return NextResponse.redirect(data.signedUrl);
  return NextResponse.json({ url: data.signedUrl }, { headers: { 'Cache-Control': 'private, no-store' } });
}
