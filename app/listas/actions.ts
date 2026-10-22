'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/data';

const name = (f: FormData) => String(f.get('name') ?? '').trim().slice(0, 80);
const back = (f: FormData, fallback: string) => {
  const v = String(f.get('voltar') ?? '');
  return v.startsWith('/') && !v.startsWith('//') ? v : fallback;
};

// Listas são privadas: a RLS só deixa cada pessoa ver e mexer nas próprias
export async function createList(form: FormData) {
  const { supabase, user } = await requireUser('/listas');
  const n = name(form);
  if (!n) redirect(back(form, '/listas'));
  const { data } = await supabase.from('collections').insert({ user_id: user.id, name: n }).select('id').single();
  const materialId = String(form.get('material') ?? '');
  if (data && materialId) await supabase.from('collection_items').insert({ collection_id: data.id, material_id: materialId });
  revalidatePath('/', 'layout');
  redirect(back(form, data ? `/listas/${data.id}` : '/listas'));
}

export async function toggleListItem(form: FormData) {
  const { supabase } = await requireUser('/listas');
  const list = String(form.get('list'));
  const material = String(form.get('material'));
  if (form.get('add') === '1') {
    const { count } = await supabase.from('collection_items').select('material_id', { count: 'exact', head: true }).eq('collection_id', list);
    await supabase.from('collection_items').insert({ collection_id: list, material_id: material, position: count ?? 0 });
  } else {
    await supabase.from('collection_items').delete().eq('collection_id', list).eq('material_id', material);
  }
  revalidatePath('/', 'layout');
}

export async function renameList(form: FormData) {
  const { supabase } = await requireUser('/listas');
  const n = name(form);
  if (n) await supabase.from('collections').update({ name: n, description: String(form.get('description') ?? '').trim().slice(0, 300) || null }).eq('id', String(form.get('list')));
  revalidatePath('/', 'layout');
}

export async function deleteList(form: FormData) {
  const { supabase } = await requireUser('/listas');
  await supabase.from('collections').delete().eq('id', String(form.get('list')));
  revalidatePath('/', 'layout');
  redirect('/listas');
}
