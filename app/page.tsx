import Link from 'next/link';
import { CARD_COLUMNS, getSession, toCard, withCoverUrls } from '@/lib/data';
import { supabaseConfigured } from '@/lib/supabase/server';
import { MaterialCard, Cover } from '@/components/Cover';
import { TYPE_LABEL } from '@/lib/labels';
import { SetupNotice } from '@/components/SetupNotice';
import type { Category } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!supabaseConfigured()) return <SetupNotice />;
  const { supabase, user, profile } = await getSession();

  const [featuredRes, recentRes, audioRes, catsRes] = await Promise.all([
    supabase.from('materials').select(`${CARD_COLUMNS}, subtitle, description`).eq('featured', true)
      .order('featured_rank', { ascending: true, nullsFirst: false }).limit(1),
    supabase.from('materials').select(CARD_COLUMNS).neq('type', 'audiobook')
      .order('published_at', { ascending: false, nullsFirst: false }).limit(12),
    supabase.from('materials').select(CARD_COLUMNS).eq('type', 'audiobook').order('title').limit(12),
    supabase.from('categories').select('id, parent_id, name, slug, description, position').order('position'),
  ]);

  const [featured] = await withCoverUrls((featuredRes.data ?? []).map((r) => ({ ...toCard(r as never), subtitle: (r as { subtitle: string | null }).subtitle })));
  const recent = await withCoverUrls((recentRes.data ?? []).map((r) => toCard(r as never)));
  const audios = await withCoverUrls((audioRes.data ?? []).map((r) => toCard(r as never)));
  const cats = (catsRes.data ?? []) as Category[];
  const roots = cats.filter((c) => !c.parent_id && c.slug !== 'a-identificar');

  let continuing: { slug: string; title: string; type: string; percent: number | null; cover: string | null; id: string }[] = [];
  if (user) {
    const { data } = await supabase.from('reading_progress')
      .select('percent, updated_at, materials(id, slug, title, type, cover_path)')
      .order('updated_at', { ascending: false }).limit(6);
    const rows = (data ?? []).map((r) => ({ ...(r.materials as unknown as { id: string; slug: string; title: string; type: string; cover_path: string | null }), percent: r.percent as number | null }));
    const withUrls = await withCoverUrls(rows);
    continuing = withUrls.map((r) => ({ ...r, cover: r.coverUrl }));
  }

  const pendingApproval = user && profile && !profile.approved && profile.role === 'member';

  return (
    <div className="container">
      {pendingApproval ? (
        <p className="alert" style={{ marginTop: 16 }}>
          Seu cadastro está aguardando aprovação da administração. Até lá, você vê apenas os materiais públicos.
        </p>
      ) : null}

      <section style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', marginTop: 24 }}>
        <div className="stack" style={{ justifyContent: 'center', ['--gap' as string]: '16px' }}>
          <span className="eyebrow">Acervo de estudos · En Tenda</span>
          <h1 style={{ fontSize: 'clamp(40px, 7vw, 76px)', lineHeight: 0.98 }}>O que vamos<br /><em style={{ color: 'var(--petrol)' }}>estudar</em> hoje?</h1>
          <div className="row">
            {roots.slice(0, 6).map((c) => <Link key={c.id} className="chip" href={`/acervo?categoria=${c.slug}`}>{c.name}</Link>)}
          </div>
        </div>
        {featured ? (
          <div style={{ background: '#0E3B2E', color: '#F6F3EC', borderRadius: 32, padding: 28, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 160 }}><Cover title={featured.title} type={featured.type} url={featured.coverUrl} seed={featured.id} /></div>
            <div className="stack" style={{ flex: '1 1 220px', ['--gap' as string]: '12px' }}>
              <span className="badge" style={{ background: '#E7C47A', color: '#10201B', alignSelf: 'flex-start' }}>Destaque</span>
              <h2 style={{ fontSize: 38, lineHeight: 1 }}>{featured.title}</h2>
              <span style={{ color: '#BFD3C8', fontSize: 14 }}>{featured.authors || 'Autor a confirmar'} · {TYPE_LABEL[featured.type]}</span>
              <div className="row">
                <Link href={`/material/${featured.slug}`} className="btn" style={{ background: '#F6F3EC', color: '#0E3B2E', borderColor: '#F6F3EC' }}>Ver material</Link>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {continuing.length ? (
        <section className="section">
          <div className="section-head"><h2>Continue estudando</h2></div>
          <div className="shelf">
            {continuing.map((m) => (
              <Link key={m.id} href={`/ler/${m.slug}`} className="mcard">
                <Cover title={m.title} type={m.type as never} url={m.cover} seed={m.id} />
                <b>{m.title}</b>
                <span>{m.percent != null ? `${Math.round(m.percent)}% lido` : 'Em andamento'}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="section-head"><h2>Adicionados recentemente</h2><Link href="/acervo" style={{ fontWeight: 700 }}>Ver o acervo</Link></div>
        {recent.length ? (
          <div className="shelf">{recent.map((m) => <MaterialCard key={m.id} m={m} />)}</div>
        ) : (
          <div className="empty"><b>O acervo ainda está vazio</b><span className="muted">Os materiais aparecem aqui quando forem publicados pela administração.</span></div>
        )}
      </section>

      {audios.length ? (
        <section className="section">
          <div className="section-head"><h2>Para ouvir</h2><Link href="/acervo?tipo=audiobook" style={{ fontWeight: 700 }}>Todos os audiobooks</Link></div>
          <div className="shelf">{audios.map((m) => <MaterialCard key={m.id} m={m} />)}</div>
        </section>
      ) : null}

      <section className="section">
        <div className="section-head"><h2>Explorar o acervo</h2></div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
          {roots.map((c, i) => (
            <Link key={c.id} href={`/acervo?categoria=${c.slug}`} className="card" style={{
              padding: 20, display: 'flex', flexDirection: 'column', gap: 6, color: i < 2 ? '#F6F3EC' : 'var(--ink)',
              background: ['#0E3B2E', '#0F4C5C', 'var(--surface)', 'var(--mint)', 'var(--sand)', '#2B3A67'][i % 6], border: 0, textDecoration: 'none',
            }}>
              <span className="serif" style={{ fontSize: 24, lineHeight: 1.05, color: i === 5 ? '#F6F3EC' : undefined }}>{c.name}</span>
              <span style={{ fontSize: 12, opacity: 0.85, color: i === 5 ? '#F6F3EC' : undefined }}>
                {cats.filter((x) => x.parent_id === c.id).slice(0, 6).map((x) => x.name).join(' · ')}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
