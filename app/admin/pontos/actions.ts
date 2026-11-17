'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/data';
import { slugify } from '@/lib/labels';
import { spotifyRef, spotifyUrl } from '@/lib/media-links';

type Result = { id?: string; slug?: string; error?: string };

// Cria o ponto cantado (como rascunho até o áudio chegar). Spotify: guarda o link para o player oficial.
export async function createPonto(form: FormData): Promise<Result> {
  const { supabase, user } = await requireStaff();
  const title = String(form.get('title') ?? '').trim().slice(0, 300);
  const category = String(form.get('category') ?? '');
  const source = String(form.get('source') ?? 'file');
  const authorized = form.get('authorized') === 'on';
  if (title.length < 2) return { error: 'Escreva o nome do ponto.' };
  if (!category) return { error: 'Escolha para qual Orixá ou linha é o ponto.' };
  const spotify = source === 'spotify' ? spotifyRef(String(form.get('url') ?? '')) : null;
  if (source === 'spotify' && !spotify) return { error: 'Link do Spotify inválido. Use o link de compartilhar da música (open.spotify.com/track/…).' };
  if (source !== 'spotify' && !authorized) return { error: 'Confirme que a biblioteca pode guardar este áudio.' };

  const base = slugify(title) || 'ponto';
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await supabase.from('materials').select('id').eq('slug', slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${i}`;
  }
  const lyrics = String(form.get('lyrics') ?? '').trim().slice(0, 8000) || null;
  const { data, error } = await supabase.from('materials').insert({
    slug, title, type: 'audio', status: 'draft', visibility: 'restricted', language: 'pt', created_by: user.id,
    description: lyrics, publication_authorized: authorized || !!spotify,
    original_source: spotify ? spotifyUrl(spotify) : null,
    rights_holder: String(form.get('rights_holder') ?? '').trim().slice(0, 300) || null,
  }).select('id, slug').single();
  if (error || !data) return { error: `Não foi possível criar o ponto: ${error?.message}` };
  await supabase.from('material_categories').insert({ material_id: data.id, category_id: category });
  if (spotify) {
    await supabase.from('files').insert({ material_id: data.id, role: 'main', bucket: 'materials', external_url: spotifyUrl(spotify), title, processing_status: 'ready' });
  }
  return { id: data.id, slug: data.slug };
}

export async function publishPonto(id: string): Promise<Result> {
  const { supabase } = await requireStaff();
  const { error } = await supabase.from('materials').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/admin/pontos');
  revalidatePath('/pontos-cantados');
  return error ? { error: 'Não foi possível publicar (confira a autorização).' } : { id };
}

// Coloca as faixas do ponto de volta na fila de transcrição (ex.: depois de trocar o áudio)
export async function retranscribePonto(form: FormData) {
  const { supabase } = await requireStaff();
  const id = String(form.get('id'));
  await supabase.from('files').update({ transcript_status: 'pendente', transcript: null, transcript_error: null })
    .eq('material_id', id).eq('role', 'track').not('path', 'is', null);
  if (form.get('lyrics') === 'replace') await supabase.from('materials').update({ description: null }).eq('id', id);
  revalidatePath('/admin/pontos');
}

export async function deletePonto(form: FormData) {
  const { supabase } = await requireStaff();
  const id = String(form.get('id'));
  const { data: files } = await supabase.from('files').select('path').eq('material_id', id).not('path', 'is', null);
  const paths = (files ?? []).map((f) => f.path as string);
  if (paths.length) await supabase.storage.from('materials').remove(paths);
  await supabase.from('materials').delete().eq('id', id);
  revalidatePath('/admin/pontos');
  revalidatePath('/pontos-cantados');
}
