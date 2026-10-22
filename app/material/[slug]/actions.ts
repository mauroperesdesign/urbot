'use server';

import { revalidatePath } from 'next/cache';
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
