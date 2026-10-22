import { CARD_COLUMNS, getSession, toCard, withCoverUrls } from '@/lib/data';
import { supabaseConfigured } from '@/lib/supabase/server';
import { SetupNotice } from '@/components/SetupNotice';
import { primaryAction } from '@/lib/labels';
import type { Category, MaterialType } from '@/lib/types';
import { HomeBrowser, type HomeContinue, type HomeItem } from './HomeBrowser';
import { Welcome } from './Welcome';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; slug: string; title: string; type: MaterialType; cover_path: string | null;
  material_authors?: { position: number; authors: { name: string } | null }[];
  description: string | null; page_count: number | null; duration_seconds: number | null; language: string;
  featured: boolean; featured_rank: number | null; material_categories: { category_id: string }[];
};

export default async function Home() {
  if (!supabaseConfigured()) return <SetupNotice />;
  const { supabase, user, profile } = await getSession();

  const [materialsRes, catsRes] = await Promise.all([
    supabase.from('materials')
      .select(`${CARD_COLUMNS}, description, page_count, duration_seconds, language, featured, featured_rank, material_categories(category_id)`)
      .eq('status', 'published')
      .order('featured', { ascending: false })
      .order('featured_rank', { ascending: true, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(240),
    supabase.from('categories').select('id, parent_id, name, slug, description, position').order('position'),
  ]);

  const cats = (catsRes.data ?? []) as Category[];
  const byId = new Map(cats.map((c) => [c.id, c]));
  const rootOf = (id: string) => {
    let c = byId.get(id);
    while (c?.parent_id) c = byId.get(c.parent_id);
    return c?.id;
  };
  const roots = cats.filter((c) => !c.parent_id && c.slug !== 'a-identificar').map(({ id, name, slug }) => ({ id, name, slug }));

  const rows = (materialsRes.data ?? []) as unknown as Row[];
  const withUrls = await withCoverUrls(rows);
  const items: HomeItem[] = withUrls.map((r) => ({
    id: r.id, slug: r.slug, title: r.title, type: r.type, coverUrl: r.coverUrl, authors: toCard(r).authors ?? '',
    description: r.description, pageCount: r.page_count, duration: r.duration_seconds, language: r.language, featured: r.featured,
    roots: Array.from(new Set(r.material_categories.map((mc) => rootOf(mc.category_id)).filter(Boolean))) as string[],
  }));

  let continuing: HomeContinue[] = [];
  if (user) {
    type M = { id: string; slug: string; title: string; type: MaterialType; cover_path: string | null };
    const [reading, media] = await Promise.all([
      supabase.from('reading_progress').select('percent, updated_at, materials(id, slug, title, type, cover_path)')
        .order('updated_at', { ascending: false }).limit(10),
      supabase.from('media_progress').select('material_id, updated_at, materials(id, slug, title, type, cover_path)')
        .order('updated_at', { ascending: false }).limit(40),
    ]);
    const seen = new Set<string>();
    const list = [
      ...(reading.data ?? []).filter((r) => r.materials).map((r) => ({ ...(r.materials as unknown as M), percent: r.percent as number | null, at: r.updated_at as string })),
      ...(media.data ?? []).filter((r) => r.materials).map((r) => ({ ...(r.materials as unknown as M), percent: null, at: r.updated_at as string })),
    ].sort((a, b) => b.at.localeCompare(a.at)).filter((r) => !seen.has(r.id) && !!seen.add(r.id)).slice(0, 10);
    continuing = (await withCoverUrls(list)).map((r) => ({
      id: r.id, slug: r.slug, title: r.title, type: r.type, coverUrl: r.coverUrl, percent: r.percent,
      href: `${primaryAction(r.type).base}/${r.slug}`,
    }));
  }

  const pendingApproval = user && profile && !profile.approved && profile.role === 'member';

  if (!user) {
    return (
      <>
        <Welcome />
        {items.length ? <div style={{ marginTop: 20 }}><HomeBrowser items={items} roots={roots} continuing={[]} pendingApproval={false} /></div> : null}
      </>
    );
  }
  return <HomeBrowser items={items} roots={roots} continuing={continuing} pendingApproval={!!pendingApproval} />;
}
