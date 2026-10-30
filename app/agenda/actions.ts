'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/data';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Compromissos da agenda: privados de cada pessoa
export async function addEvent(form: FormData) {
  const { supabase, user } = await requireUser('/agenda');
  const day = String(form.get('day') ?? '');
  const title = String(form.get('title') ?? '').trim().slice(0, 120);
  if (DAY.test(day) && title) {
    await supabase.from('agenda_events').insert({ user_id: user.id, day, title, notes: String(form.get('notes') ?? '').trim().slice(0, 2000) || null });
  }
  revalidatePath('/agenda');
  redirect(`/agenda?ano=${day.slice(0, 4)}&dia=${day}#dia`);
}

export async function deleteEvent(form: FormData) {
  const { supabase } = await requireUser('/agenda');
  const day = String(form.get('day') ?? '');
  await supabase.from('agenda_events').delete().eq('id', String(form.get('id')));
  revalidatePath('/agenda');
  redirect(`/agenda?ano=${day.slice(0, 4)}&dia=${day}#dia`);
}

// Link de sincronização com Google Agenda / Calendário do iPhone
export async function rotateFeed() {
  const { supabase } = await requireUser('/agenda');
  await supabase.rpc('rotate_calendar_feed');
  revalidatePath('/agenda');
  redirect('/agenda#sincronizar');
}

export async function removeFeed() {
  const { supabase, user } = await requireUser('/agenda');
  await supabase.from('calendar_feeds').delete().eq('user_id', user.id);
  revalidatePath('/agenda');
  redirect('/agenda#sincronizar');
}
