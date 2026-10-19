import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, withCoverUrls } from '@/lib/data';
import { MaterialForm } from './MaterialForm';
import { FileManager } from './FileManager';
import type { Category, FileRow, Material } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EditMaterial({ params, searchParams }: { params: { id: string }; searchParams: { criado?: string } }) {
  const { supabase } = await requireStaff();
  const isNew = params.id === 'novo';
  const { data: catData } = await supabase.from('categories').select('id, parent_id, name, slug, description, position').order('position');
  const categories = (catData ?? []) as Category[];

  let material: (Material & { publishers: { name: string } | null }) | null = null;
  let internal: { internal_notes: string | null; review_notes: string | null } | null = null;
  let selected: string[] = [];
  let authors = '';
  let files: FileRow[] = [];
  let coverUrl: string | null = null;

  if (!isNew) {
    const { data } = await supabase.from('materials').select('*, publishers(name)').eq('id', params.id).maybeSingle();
    if (!data) notFound();
    material = data as typeof material;
    const [mi, mc, ma, fl] = await Promise.all([
      supabase.from('material_internal').select('internal_notes, review_notes').eq('material_id', params.id).maybeSingle(),
      supabase.from('material_categories').select('category_id').eq('material_id', params.id),
      supabase.from('material_authors').select('position, authors(name)').eq('material_id', params.id).order('position'),
      supabase.from('files').select('*').eq('material_id', params.id).order('role').order('position'),
    ]);
    internal = mi.data;
    selected = (mc.data ?? []).map((c) => c.category_id);
    authors = (ma.data ?? []).map((a) => (a.authors as unknown as { name: string } | null)?.name).filter(Boolean).join('\n');
    files = (fl.data ?? []) as FileRow[];
    [{ coverUrl }] = await withCoverUrls([{ cover_path: material!.cover_path }]);
  }

  return (
    <div className="stack" style={{ ['--gap' as string]: '18px' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ ['--gap' as string]: '2px' }}>
          <Link href="/admin/materiais" className="muted" style={{ fontSize: 13 }}>← Materiais</Link>
          <h1 style={{ fontSize: 40 }}>{isNew ? 'Novo material' : material!.title}</h1>
        </div>
        {!isNew ? <Link className="btn" href={`/material/${material!.slug}`}>Pré-visualizar</Link> : null}
      </div>
      {searchParams.criado ? <p className="alert alert-ok">Material criado como rascunho. Agora envie a capa e os arquivos.</p> : null}
      {!isNew ? <FileManager materialId={material!.id} materialType={material!.type} files={files} coverUrl={coverUrl} /> : null}
      <MaterialForm material={material} internal={internal} categories={categories} selected={selected} authors={authors} />
    </div>
  );
}
