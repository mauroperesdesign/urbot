import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 3600;

// Só materiais publicados e PÚBLICOS entram no sitemap (consulta anônima, sujeita à RLS)
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const base: MetadataRoute.Sitemap = ['', '/acervo', '/sobre', '/contato', '/privacidade', '/termos'].map((p) => ({ url: `${site}${p}` }));
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return base;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data } = await anon.from('materials').select('slug, updated_at').eq('status', 'published').eq('visibility', 'public').limit(5000);
  return [...base, ...(data ?? []).map((m) => ({ url: `${site}/material/${m.slug}`, lastModified: m.updated_at }))];
}
