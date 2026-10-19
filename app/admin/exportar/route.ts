import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const COLS = ['slug', 'title', 'subtitle', 'type', 'status', 'visibility', 'language', 'year', 'isbn', 'tradition', 'page_count', 'duration_seconds', 'license', 'rights_holder', 'publication_authorized', 'allow_download', 'legacy_ref', 'created_at', 'updated_at'] as const;
const esc = (v: unknown) => {
  const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Exporta os metadados do acervo (somente equipe; a RLS e a checagem abaixo garantem)
export async function GET() {
  const supabase = createClient();
  const { data: staff } = await supabase.rpc('is_staff');
  if (!staff) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  const { data, error } = await supabase.from('materials')
    .select(`${COLS.join(', ')}, keywords, material_authors(authors(name)), material_categories(categories(name)), files(role)`).order('title');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const header = [...COLS, 'keywords', 'authors', 'categories', 'files'];
  const lines = (data ?? []).map((r) => {
    const row = r as unknown as Record<string, unknown> & {
      material_authors: { authors: { name: string } | null }[]; material_categories: { categories: { name: string } | null }[]; files: { role: string }[];
    };
    return [
      ...COLS.map((c) => esc(row[c])), esc(row.keywords),
      esc(row.material_authors.map((a) => a.authors?.name).filter(Boolean)),
      esc(row.material_categories.map((c) => c.categories?.name).filter(Boolean)),
      esc(row.files.map((f) => f.role)),
    ].join(',');
  });
  const csv = '﻿' + [header.join(','), ...lines].join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="acervo-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
