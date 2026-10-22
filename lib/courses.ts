import 'server-only';
import { getSession, withCoverUrls } from './data';
import { primaryAction } from './labels';
import type { MaterialType } from './types';

export type Lesson = {
  id: string; slug: string; title: string; type: MaterialType; coverUrl: string | null; section: string | null;
  href: string; status: 'done' | 'started' | 'todo'; percent: number | null;
};

// Aulas de um curso, na ordem, com o andamento de quem está vendo
export async function courseLessons(courseId: string) {
  const { supabase, user } = await getSession();
  const { data } = await supabase.from('course_items')
    .select('position, section, materials!course_items_material_id_fkey(id, slug, title, type, cover_path, status)')
    .eq('course_id', courseId).order('position');
  const rows = ((data ?? []) as unknown as { section: string | null; materials: { id: string; slug: string; title: string; type: MaterialType; cover_path: string | null; status: string } | null }[])
    .filter((r) => r.materials && r.materials.status === 'published');
  const ids = rows.map((r) => r.materials!.id);

  const reading = new Map<string, number | null>();
  const media = new Map<string, { done: number; total: number }>();
  if (user && ids.length) {
    const [rp, mp, tracks] = await Promise.all([
      supabase.from('reading_progress').select('material_id, percent').in('material_id', ids),
      supabase.from('media_progress').select('material_id, completed').in('material_id', ids),
      supabase.from('files').select('material_id').in('material_id', ids).in('role', ['track', 'main']).not('path', 'is', null),
    ]);
    (rp.data ?? []).forEach((r) => reading.set(r.material_id, r.percent as number | null));
    const totals = new Map<string, number>();
    (tracks.data ?? []).forEach((f) => totals.set(f.material_id, (totals.get(f.material_id) ?? 0) + 1));
    (mp.data ?? []).forEach((r) => {
      const cur = media.get(r.material_id) ?? { done: 0, total: totals.get(r.material_id) ?? 1 };
      media.set(r.material_id, { ...cur, done: cur.done + (r.completed ? 1 : 0) });
    });
  }

  const withCovers = await withCoverUrls(rows.map((r) => ({ ...r.materials!, section: r.section })));
  const lessons: Lesson[] = withCovers.map((m) => {
    const read = reading.get(m.id);
    const heard = media.get(m.id);
    const percent = read != null ? Number(read) : heard ? Math.round((heard.done / Math.max(1, heard.total)) * 100) : null;
    const status: Lesson['status'] = percent != null && percent >= 90 ? 'done' : reading.has(m.id) || heard ? 'started' : 'todo';
    return { id: m.id, slug: m.slug, title: m.title, type: m.type, coverUrl: m.coverUrl, section: m.section, percent, status, href: `${primaryAction(m.type).base}/${m.slug}` };
  });
  const next = lessons.find((l) => l.status === 'started') ?? lessons.find((l) => l.status === 'todo') ?? lessons[0];
  return { lessons, next, done: lessons.filter((l) => l.status === 'done').length };
}
