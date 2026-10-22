'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/data';
import { slugify } from '@/lib/labels';
import type { MaterialType } from '@/lib/types';

const TYPES: MaterialType[] = ['book', 'pdf', 'handout', 'document', 'audiobook', 'audio', 'video', 'video_lesson', 'course', 'article', 'research', 'glossary', 'external_link'];

const str = (f: FormData, k: string, max = 4000) => {
  const v = String(f.get(k) ?? '').trim();
  return v ? v.slice(0, max) : null;
};
const int = (f: FormData, k: string) => {
  const v = Number(f.get(k));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
};

export type SaveState = { error?: string; ok?: string } | undefined;

export async function saveMaterial(_: SaveState, form: FormData): Promise<SaveState> {
  const { supabase, user } = await requireStaff();
  const id = str(form, 'id');
  const title = str(form, 'title', 300);
  const type = String(form.get('type')) as MaterialType;
  if (!title) return { error: 'Informe o título.' };
  if (!TYPES.includes(type)) return { error: 'Tipo de material inválido.' };

  const status = (['draft', 'published', 'archived'].includes(String(form.get('status'))) ? form.get('status') : 'draft') as string;
  const authorized = form.get('publication_authorized') === 'on';
  if (status === 'published' && !authorized) {
    return { error: 'Para publicar, marque “Publicação autorizada” e registre os direitos de uso.' };
  }

  const record = {
    title,
    subtitle: str(form, 'subtitle', 300),
    description: str(form, 'description', 10000),
    type,
    language: str(form, 'language', 8) ?? 'pt',
    year: int(form, 'year'),
    isbn: str(form, 'isbn', 32),
    organizer: str(form, 'organizer', 200),
    tradition: str(form, 'tradition', 200),
    source_reference: str(form, 'source_reference', 1000),
    keywords: (str(form, 'keywords', 1000) ?? '').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 40),
    page_count: int(form, 'page_count'),
    duration_seconds: int(form, 'duration_minutes') ? int(form, 'duration_minutes')! * 60 : null,
    status,
    visibility: form.get('visibility') === 'public' ? 'public' : 'restricted',
    featured: form.get('featured') === 'on',
    featured_rank: int(form, 'featured_rank'),
    rights_holder: str(form, 'rights_holder', 300),
    license: str(form, 'license', 200),
    original_source: str(form, 'original_source', 1000),
    publication_authorized: authorized,
    access_conditions: str(form, 'access_conditions', 1000),
    rights_verified_at: str(form, 'rights_verified_at', 10),
    allow_download: form.get('allow_download') === 'on',
  };

  let materialId = id;
  if (id) {
    const { error } = await supabase.from('materials').update(record).eq('id', id);
    if (error) return { error: `Não foi possível salvar: ${error.message}` };
  } else {
    const base = slugify(title) || 'material';
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const { data } = await supabase.from('materials').select('id').eq('slug', slug).maybeSingle();
      if (!data) break;
      slug = `${base}-${i}`;
    }
    const { data, error } = await supabase.from('materials').insert({ ...record, slug, created_by: user.id }).select('id').single();
    if (error || !data) return { error: `Não foi possível criar: ${error?.message}` };
    materialId = data.id;
  }

  // Notas internas (somente equipe)
  await supabase.from('material_internal').upsert({
    material_id: materialId, internal_notes: str(form, 'internal_notes', 10000), review_notes: str(form, 'review_notes', 2000),
    updated_at: new Date().toISOString(),
  });

  // Categorias
  const cats = form.getAll('categories').map(String);
  await supabase.from('material_categories').delete().eq('material_id', materialId!);
  if (cats.length) await supabase.from('material_categories').insert(cats.map((category_id) => ({ material_id: materialId, category_id })));

  // Autores (um por linha ou separados por ponto e vírgula)
  const names = (str(form, 'authors', 2000) ?? '').split(/[;\n]/).map((n) => n.trim()).filter(Boolean);
  await supabase.from('material_authors').delete().eq('material_id', materialId!);
  for (const [position, name] of names.entries()) {
    const slug = slugify(name);
    if (!slug) continue;
    const { data: a } = await supabase.from('authors').upsert({ name, slug }, { onConflict: 'slug' }).select('id').single();
    if (a) await supabase.from('material_authors').insert({ material_id: materialId, author_id: a.id, position });
  }

  // Editora
  const publisher = str(form, 'publisher', 200);
  if (publisher) {
    const { data: p } = await supabase.from('publishers').upsert({ name: publisher, slug: slugify(publisher) }, { onConflict: 'slug' }).select('id').single();
    await supabase.from('materials').update({ publisher_id: p?.id ?? null }).eq('id', materialId!);
  } else {
    await supabase.from('materials').update({ publisher_id: null }).eq('id', materialId!);
  }

  revalidatePath('/admin/materiais');
  revalidatePath('/');
  if (!id) redirect(`/admin/materiais/${materialId}?criado=1`);
  return { ok: 'Alterações salvas.' };
}

const BULK_DONE: Record<string, string> = {
  publish: 'publicados', draft: 'voltaram para rascunho', archive: 'arquivados (não aparecem mais no site)',
  restricted: 'agora restritos', public: 'agora públicos',
};

export async function bulkUpdate(form: FormData) {
  const { supabase } = await requireStaff();
  const ids = form.getAll('ids').map(String).slice(0, 500);
  const action = String(form.get('action'));
  if (!ids.length) redirect('/admin/materiais?erro=' + encodeURIComponent('Marque pelo menos um material na lista.'));
  if (action === 'delete') return deleteMaterials(ids);
  const patch: Record<string, string> | null =
    action === 'publish' ? { status: 'published' } :
    action === 'draft' ? { status: 'draft' } :
    action === 'archive' ? { status: 'archived' } :
    action === 'restricted' ? { visibility: 'restricted' } :
    action === 'public' ? { visibility: 'public' } : null;
  if (!patch) redirect('/admin/materiais?erro=' + encodeURIComponent('Escolha uma ação.'));
  // Só publica os que têm autorização registrada (a restrição do banco também garante isso)
  const query = supabase.from('materials').update(patch).in('id', ids);
  const { data, error } = await (action === 'publish' ? query.eq('publication_authorized', true) : query).select('id');
  if (error) redirect('/admin/materiais?erro=' + encodeURIComponent(error.message));
  revalidatePath('/', 'layout');
  redirect('/admin/materiais?ok=' + encodeURIComponent(`${data?.length ?? 0} material(is) ${BULK_DONE[action]}.`));
}

// Exclusão definitiva: apaga os arquivos do armazenamento e o registro (progresso, favoritos etc. saem junto)
async function deleteMaterials(ids: string[]) {
  const { supabase, profile } = await requireStaff();
  if (profile?.role !== 'admin') redirect('/admin/materiais?erro=' + encodeURIComponent('Só administradores podem excluir materiais. Editores podem arquivar.'));
  const { data: mats } = await supabase.from('materials').select('id, cover_path, files(bucket, path)').in('id', ids);
  const byBucket = new Map<string, string[]>();
  const add = (bucket: string, path: string | null) => { if (path) byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]); };
  for (const m of (mats ?? []) as { cover_path: string | null; files: { bucket: string; path: string | null }[] }[]) {
    add('covers', m.cover_path);
    if (m.cover_path) add('covers', `thumbs/${m.cover_path}.webp`);
    m.files.forEach((f) => add(f.bucket, f.path));
  }
  for (const [bucket, paths] of Array.from(byBucket)) {
    for (let i = 0; i < paths.length; i += 100) await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
  }
  const { data, error } = await supabase.from('materials').delete().in('id', ids).select('id');
  if (error) redirect('/admin/materiais?erro=' + encodeURIComponent(error.message));
  revalidatePath('/', 'layout');
  redirect('/admin/materiais?ok=' + encodeURIComponent(`${data?.length ?? 0} material(is) excluído(s) definitivamente.`));
}

export async function deleteMaterial(form: FormData) {
  return deleteMaterials([String(form.get('id'))]);
}

export async function deleteFile(form: FormData) {
  const { supabase } = await requireStaff();
  const id = String(form.get('id'));
  const { data: f } = await supabase.from('files').select('bucket, path, material_id').eq('id', id).single();
  if (f?.path) await supabase.storage.from(f.bucket).remove([f.path]);
  await supabase.from('files').delete().eq('id', id);
  if (f) revalidatePath(`/admin/materiais/${f.material_id}`);
}

export async function saveCategory(form: FormData) {
  const { supabase } = await requireStaff();
  const id = str(form, 'id');
  const name = str(form, 'name', 120);
  if (!name) return;
  const parent_id = str(form, 'parent_id');
  const position = Number(form.get('position')) || 0;
  if (id) {
    await supabase.from('categories').update({ name, parent_id, position, description: str(form, 'description', 500) }).eq('id', id);
  } else {
    await supabase.from('categories').insert({ name, parent_id, position, slug: `${slugify(name)}-${Date.now().toString(36).slice(-4)}` });
  }
  revalidatePath('/admin/categorias');
}

export async function deleteCategory(form: FormData) {
  const { supabase } = await requireStaff();
  // Falha (restrição do banco) se houver subcategorias ou materiais ligados
  await supabase.from('categories').delete().eq('id', String(form.get('id')));
  revalidatePath('/admin/categorias');
}

export async function setAccess(form: FormData) {
  const { supabase } = await requireStaff();
  // A função no banco verifica se quem chama é admin
  const { error } = await supabase.rpc('admin_set_access', {
    target: String(form.get('id')),
    new_role: String(form.get('role')),
    new_approved: form.get('approved') === 'on',
  });
  if (error) redirect(`/admin/usuarios?erro=${encodeURIComponent(error.message)}`);
  revalidatePath('/admin/usuarios');
}

// ---------------------------------------------------------------- cursos e trilhas
async function courseItems(course: string) {
  const { supabase } = await requireStaff();
  const { data } = await supabase.from('course_items').select('material_id, position').eq('course_id', course).order('position');
  return { supabase, items: data ?? [] };
}

export async function addCourseItem(form: FormData) {
  const course = String(form.get('course'));
  const material = String(form.get('material'));
  const { supabase, items } = await courseItems(course);
  if (material && material !== course && !items.some((i) => i.material_id === material)) {
    await supabase.from('course_items').insert({ course_id: course, material_id: material, position: items.length, section: str(form, 'section', 120) });
  }
  revalidatePath(`/admin/materiais/${course}`);
}

export async function moveCourseItem(form: FormData) {
  const course = String(form.get('course'));
  const material = String(form.get('material'));
  const dir = form.get('dir') === 'up' ? -1 : 1;
  const { supabase, items } = await courseItems(course);
  const order = items.map((i) => i.material_id);
  const at = order.indexOf(material);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= order.length) return;
  [order[at], order[to]] = [order[to], order[at]];
  await Promise.all(order.map((id, position) => supabase.from('course_items').update({ position }).eq('course_id', course).eq('material_id', id)));
  revalidatePath(`/admin/materiais/${course}`);
}

export async function updateCourseItem(form: FormData) {
  const course = String(form.get('course'));
  const { supabase } = await requireStaff();
  await supabase.from('course_items').update({ section: str(form, 'section', 120) }).eq('course_id', course).eq('material_id', String(form.get('material')));
  revalidatePath(`/admin/materiais/${course}`);
}

export async function removeCourseItem(form: FormData) {
  const course = String(form.get('course'));
  const { supabase, items } = await courseItems(course);
  await supabase.from('course_items').delete().eq('course_id', course).eq('material_id', String(form.get('material')));
  const rest = items.filter((i) => i.material_id !== String(form.get('material')));
  await Promise.all(rest.map((i, position) => supabase.from('course_items').update({ position }).eq('course_id', course).eq('material_id', i.material_id)));
  revalidatePath(`/admin/materiais/${course}`);
}
