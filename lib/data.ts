import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { MaterialCardData, Profile } from './types';

export const getSession = cache(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as Profile | null };
  const { data: profile } = await supabase
    .from('profiles').select('id, display_name, role, approved, reading_prefs').eq('id', user.id).single();
  return { supabase, user, profile: (profile as Profile | null) ?? null };
});

export async function requireUser(next = '/') {
  const s = await getSession();
  if (!s.user) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return s as typeof s & { user: NonNullable<typeof s.user> };
}

export async function requireStaff() {
  const s = await requireUser('/admin');
  if (!s.profile || !['editor', 'admin'].includes(s.profile.role)) redirect('/?acesso=negado');
  return s;
}

export function isStaff(profile: Profile | null) {
  return !!profile && (profile.role === 'editor' || profile.role === 'admin');
}

// Miniatura leve (gerada no envio da capa ou por scripts/gerar-miniaturas.mjs)
export const thumbPath = (coverPath: string) => `thumbs/${coverPath}.webp`;

// URLs assinadas e temporárias para capas (bucket privado; a RLS decide quem pode).
// Por padrão usa a miniatura quando ela existe; { full: true } pede a imagem original.
export async function withCoverUrls<T extends { cover_path: string | null }>(items: T[], opts: { full?: boolean } = {}) {
  const { supabase } = await getSession();
  const covers = Array.from(new Set(items.map((i) => i.cover_path).filter(Boolean))) as string[];
  if (!covers.length) return items.map((i) => ({ ...i, coverUrl: null as string | null }));
  const paths = opts.full ? covers : [...covers, ...covers.map(thumbPath)];
  const { data } = await supabase.storage.from('covers').createSignedUrls(paths, 60 * 60);
  const map = new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
  const pick = (p: string) => (!opts.full && map.get(thumbPath(p))) || map.get(p) || null;
  return items.map((i) => ({ ...i, coverUrl: i.cover_path ? pick(i.cover_path) : null }));
}

export const CARD_COLUMNS = 'id, slug, title, type, cover_path, material_authors(position, authors(name))';

type CardRow = {
  id: string; slug: string; title: string; type: MaterialCardData['type']; cover_path: string | null;
  material_authors?: { position: number; authors: { name: string } | null }[];
};

export function toCard(row: CardRow): MaterialCardData {
  const authors = (row.material_authors ?? [])
    .sort((a, b) => a.position - b.position)
    .map((a) => a.authors?.name)
    .filter(Boolean)
    .join(', ');
  return { id: row.id, slug: row.slug, title: row.title, type: row.type, cover_path: row.cover_path, authors };
}
