import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Recebe o progresso enviado pelo leitor ao fechar a página (navigator.sendBeacon).
// Usa a sessão da pessoa: a RLS só aceita o próprio progresso de material que ela pode ler.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { material?: string; location?: string; percent?: number | null; page?: number | null } | null;
  if (!body?.material || typeof body.location !== 'string' || body.location.length > 500) return NextResponse.json({ ok: false }, { status: 400 });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const percent = typeof body.percent === 'number' && body.percent >= 0 && body.percent <= 100 ? body.percent : null;
  await supabase.from('reading_progress').upsert({
    user_id: user.id, material_id: body.material, location: body.location, percent, updated_at: new Date().toISOString(),
  });
  if (Number.isInteger(body.page) && body.page! > 0) {
    await supabase.from('reading_pages').upsert({ user_id: user.id, material_id: body.material, page: body.page }, { onConflict: 'user_id,material_id,page', ignoreDuplicates: true });
  }
  return NextResponse.json({ ok: true });
}
