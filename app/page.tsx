import { CARD_COLUMNS, getSession, toCard, withCoverUrls } from '@/lib/data';
import { supabaseConfigured } from '@/lib/supabase/server';
import { SetupNotice } from '@/components/SetupNotice';
import type { Category, MaterialType } from '@/lib/types';
import { HomeBrowser, type HomeItem } from './HomeBrowser';
import { DailyBanner } from './DailyBanner';
import { readingProgress, listeningProgress } from '@/lib/progress';
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

  const [reading, listening] = user ? await Promise.all([readingProgress(10), listeningProgress(10)]) : [[], []];

  const pendingApproval = user && profile && !profile.approved && profile.role === 'member';

  if (!user) {
    return (
      <>
        <DailyBanner />
        <Welcome />
        {items.length ? <div style={{ marginTop: 20 }}><HomeBrowser items={items} roots={roots} pendingApproval={false} /></div> : null}
      </>
    );
  }
  return <HomeBrowser items={items} roots={roots} reading={reading} listening={listening} pendingApproval={!!pendingApproval} top={<DailyBanner />} />;
}
