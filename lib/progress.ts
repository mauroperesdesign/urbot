import 'server-only';
import { getSession, withCoverUrls } from './data';
import { formatDuration, primaryAction, WATCH_TYPES } from './labels';
import type { MaterialType } from './types';

export type ProgressItem = {
  id: string; slug: string; title: string; type: MaterialType; coverUrl: string | null;
  percent: number | null; href: string; sub: string; at: string;
};
type M = { id: string; slug: string; title: string; type: MaterialType; cover_path: string | null; page_count: number | null };

// Onde a pessoa parou de ler (PDF: página; EPUB: porcentagem)
export async function readingProgress(limit = 10): Promise<ProgressItem[]> {
  const { supabase } = await getSession();
  const { data } = await supabase.from('reading_progress')
    .select('percent, location, updated_at, materials(id, slug, title, type, cover_path, page_count)')
    .order('updated_at', { ascending: false }).limit(limit);
  const rows = (data ?? []).filter((r) => r.materials).map((r) => ({
    ...(r.materials as unknown as M), percent: r.percent as number | null, location: String(r.location), at: r.updated_at as string,
  }));
  return (await withCoverUrls(rows)).map((r) => {
    const pct = r.percent != null ? Math.round(Number(r.percent)) : null;
    const sub = r.location.startsWith('epubcfi(')
      ? `${pct ?? 0}% lido`
      : `Página ${r.location}${r.page_count ? ` de ${r.page_count}` : ''}${pct != null ? ` · ${pct}%` : ''}`;
    return { id: r.id, slug: r.slug, title: r.title, type: r.type, coverUrl: r.coverUrl, percent: r.percent, sub, at: r.at,
      href: `/ler/${r.slug}` };
  });
}

// Onde a pessoa parou de ouvir (audiobook: faixa e minuto) ou de assistir
export async function listeningProgress(limit = 10): Promise<ProgressItem[]> {
  const { supabase } = await getSession();
  const { data } = await supabase.from('media_progress')
    .select('material_id, position_seconds, completed, updated_at, files(title, position), materials(id, slug, title, type, cover_path, page_count)')
    .order('updated_at', { ascending: false }).limit(60);
  const seen = new Set<string>();
  const rows = (data ?? []).filter((r) => r.materials && !seen.has(r.material_id) && !!seen.add(r.material_id)).slice(0, limit).map((r) => ({
    ...(r.materials as unknown as M), file: r.files as unknown as { title: string | null; position: number } | null,
    pos: Number(r.position_seconds) || 0, at: r.updated_at as string,
  }));
  return (await withCoverUrls(rows)).map((r) => {
    const video = WATCH_TYPES.includes(r.type);
    const sub = video
      ? `Parou em ${formatDuration(r.pos)}`
      : `Faixa ${(r.file?.position ?? 0) + 1}${r.file?.title ? ` · ${r.file.title}` : ''} · ${formatDuration(r.pos)}`;
    // Sem ?faixa o player retoma a faixa e o minuto exatos
    const href = `${video ? '/assistir' : primaryAction(r.type).base}/${r.slug}`;
    return { id: r.id, slug: r.slug, title: r.title, type: r.type, coverUrl: r.coverUrl, percent: null, sub, href, at: r.at };
  });
}
