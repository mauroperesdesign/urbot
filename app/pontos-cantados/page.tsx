import Link from 'next/link';
import type { Metadata } from 'next';
import { getSession, CARD_COLUMNS, toCard, withCoverUrls } from '@/lib/data';
import { supabaseConfigured } from '@/lib/supabase/server';
import { SetupNotice } from '@/components/SetupNotice';
import { MaterialCard } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import type { Category } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pontos cantados', description: 'Pontos cantados organizados por Orixá e por linha de trabalho.' };

const GROUPS = [
  { slug: 'pontos-cantados-orixas', title: 'Por Orixá', hint: 'Oxalá, Iemanjá, Oxum, Ogum, Oxóssi, Xangô…' },
  { slug: 'pontos-cantados-linhas', title: 'Por linha de trabalho', hint: 'Preto Velho, Caboclo, Baiano, Marinheiro…' },
];

export default async function Pontos({ searchParams }: { searchParams: { de?: string } }) {
  if (!supabaseConfigured()) return <SetupNotice />;
  const { supabase } = await getSession();
  const { data: catData } = await supabase.from('categories').select('id, parent_id, name, slug, description, position').order('position');
  const cats = (catData ?? []) as Category[];
  const root = cats.find((c) => c.slug === 'pontos-cantados');
  if (!root) return <div className="container panel"><p>A categoria “Pontos cantados” ainda não foi criada.</p></div>;

  // Toda a árvore abaixo de "Pontos cantados"
  const under = new Set<string>([root.id]);
  for (let changed = true; changed;) {
    changed = false;
    cats.forEach((c) => { if (c.parent_id && under.has(c.parent_id) && !under.has(c.id)) { under.add(c.id); changed = true; } });
  }
  const current = cats.find((c) => c.slug === searchParams.de && under.has(c.id)) ?? null;
  const { data: links } = await supabase.from('material_categories').select('category_id, material_id').in('category_id', Array.from(under));
  const count = new Map<string, Set<string>>();
  (links ?? []).forEach((l) => count.set(l.category_id, (count.get(l.category_id) ?? new Set()).add(l.material_id)));
  const n = (id: string) => count.get(id)?.size ?? 0;

  const ids = current ? Array.from(count.get(current.id) ?? []) : [];
  const { data: rows } = ids.length
    ? await supabase.from('materials').select(CARD_COLUMNS).in('id', ids).eq('status', 'published').order('title')
    : { data: [] };
  const items = await withCoverUrls((rows ?? []).map((r) => toCard(r as never)));
  const extra = cats.filter((c) => c.parent_id === root.id && !GROUPS.some((g) => g.slug === c.slug));

  return (
    <div className="container stack" style={{ ['--gap' as string]: '20px' }}>
      <section className="pontos-hero">
        <span className="eyebrow" style={{ color: '#9DB6FF' }}>Acervo</span>
        <h1 className="page-title-xl">{current ? `Pontos — ${current.name}` : 'Pontos cantados'}</h1>
        <p>Pontos para estudo e para a gira, organizados por Orixá e por linha de trabalho. Letras e toques podem variar entre as casas: siga sempre a orientação do seu terreiro.</p>
        {current ? <Link href="/pontos-cantados" className="btn" style={{ alignSelf: 'flex-start' }}><Icon name="back" size={16} /> Todos os pontos</Link> : null}
      </section>

      {current ? (
        <section className="panel">
          {items.length ? <div className="grid-cards">{items.map((m) => <MaterialCard key={m.id} m={m} />)}</div>
            : <div className="empty"><b>Nenhum ponto de {current.name} ainda</b><span className="muted">Quando a administração cadastrar pontos nesta linha, eles aparecem aqui.</span></div>}
        </section>
      ) : null}

      {GROUPS.map((g) => {
        const parent = cats.find((c) => c.slug === g.slug);
        if (!parent) return null;
        const kids = cats.filter((c) => c.parent_id === parent.id);
        return (
          <section key={g.slug} className="panel" aria-labelledby={`h-${g.slug}`}>
            <div className="panel-head"><h2 id={`h-${g.slug}`}>{g.title}</h2><span className="muted" style={{ fontSize: 12.5 }}>{g.hint}</span></div>
            <div className="ponto-grid">
              {kids.map((k) => (
                <Link key={k.id} href={`/pontos-cantados?de=${k.slug}`} className="ponto-tile" aria-current={current?.id === k.id ? 'true' : undefined}>
                  <b>{k.name}</b><span>{n(k.id) ? `${n(k.id)} ${n(k.id) === 1 ? 'ponto' : 'pontos'}` : 'em breve'}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {extra.length ? (
        <section className="panel">
          <div className="panel-head"><h2>Para a gira</h2></div>
          <div className="ponto-grid">
            {extra.map((k) => (
              <Link key={k.id} href={`/pontos-cantados?de=${k.slug}`} className="ponto-tile"><b>{k.name}</b><span>{n(k.id) ? `${n(k.id)} pontos` : 'em breve'}</span></Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
