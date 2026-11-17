'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/data';

const KINDS = ['livro', 'audiobook', 'curso', 'video', 'apostila', 'ponto', 'outro'];
const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? '').trim().slice(0, max) || null;

// Membro sugere um material para o acervo; a equipe recebe no painel
export async function sendSuggestion(form: FormData) {
  const { supabase, user } = await requireUser('/sugerir');
  const title = text(form, 'title', 200);
  const kind = String(form.get('kind') ?? 'livro');
  let link = text(form, 'link', 500);
  if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
  if (!title || title.length < 2) redirect('/sugerir?erro=titulo#form');
  const { error } = await supabase.from('material_suggestions').insert({
    user_id: user.id, title, kind: KINDS.includes(kind) ? kind : 'outro',
    author: text(form, 'author', 200), link, reason: text(form, 'reason', 2000),
  });
  revalidatePath('/sugerir');
  revalidatePath('/admin');
  redirect(error ? `/sugerir?erro=${error.message.includes('limite') ? 'limite' : 'falha'}#form` : '/sugerir?enviada=1#minhas');
}

export async function withdrawSuggestion(form: FormData) {
  const { supabase } = await requireUser('/sugerir');
  await supabase.from('material_suggestions').delete().eq('id', String(form.get('id')));
  revalidatePath('/sugerir');
  revalidatePath('/admin');
}
