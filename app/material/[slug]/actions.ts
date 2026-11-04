'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/data';

// Membro pede acesso a um curso; a equipe libera no painel do curso
export async function requestCourseAccess(form: FormData) {
  const slug = String(form.get('slug'));
  const { supabase, user } = await requireUser(`/material/${slug}`);
  await supabase.from('course_requests').insert({ course_id: String(form.get('course')), user_id: user.id });
  revalidatePath(`/material/${slug}`);
}

export async function cancelCourseRequest(form: FormData) {
  const slug = String(form.get('slug'));
  const { supabase, user } = await requireUser(`/material/${slug}`);
  await supabase.from('course_requests').delete().eq('course_id', String(form.get('course'))).eq('user_id', user.id);
  revalidatePath(`/material/${slug}`);
}

// Avaliação: nota de 1 a 5 e resenha opcional, uma por pessoa em cada material
export async function saveReview(form: FormData) {
  const slug = String(form.get('slug'));
  const { supabase, user } = await requireUser(`/material/${slug}`);
  const material = String(form.get('material'));
  const rating = Number(form.get('rating'));
  const body = String(form.get('body') ?? '').trim().slice(0, 3000) || null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) redirect(`/material/${slug}?avaliacao=nota#avaliacoes`);
  const { data: mine } = await supabase.from('reviews').select('id').eq('material_id', material).eq('user_id', user.id).maybeSingle();
  const { error } = mine
    ? await supabase.from('reviews').update({ rating, body, updated_at: new Date().toISOString() }).eq('id', mine.id)
    : await supabase.from('reviews').insert({ material_id: material, user_id: user.id, rating, body });
  revalidatePath(`/material/${slug}`);
  redirect(`/material/${slug}?avaliacao=${error ? 'erro' : 'ok'}#avaliacoes`);
}

export async function deleteReview(form: FormData) {
  const slug = String(form.get('slug'));
  const { supabase } = await requireUser(`/material/${slug}`);
  await supabase.from('reviews').delete().eq('id', String(form.get('id')));
  revalidatePath(`/material/${slug}`);
  redirect(`/material/${slug}#avaliacoes`);
}
