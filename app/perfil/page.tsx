import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser, withCoverUrls } from '@/lib/data';
import { readingProgress, listeningProgress } from '@/lib/progress';
import { BookCard } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { VoicePlayer } from '@/components/reader/VoiceNote';
import type { MaterialType } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Meu perfil', robots: { index: false } };

type NoteRow = { id: string; location: string; quote: string | null; note: string | null; audio_path: string | null; created_at: string; material_id: string };
type MarkRow = { id: string; location: string; label: string | null; material_id: string };

const where = (loc: string) => (loc.startsWith('epubcfi(') ? 'trecho do livro' : `página ${loc}`);

export default async function Profile() {
  const { supabase, user, profile } = await requireUser('/perfil');
  const [pagesRes, listenRes, notesRes, marksRes, reading, listening, meRes] = await Promise.all([
    supabase.from('reading_pages').select('page', { count: 'exact', head: true }),
    supabase.from('listening_time').select('seconds'),
    supabase.from('annotations').select('id, location, quote, note, audio_path, created_at, material_id').order('created_at').limit(1000),
    supabase.from('bookmarks').select('id, location, label, material_id').order('created_at').limit(1000),
    readingProgress(30),
    listeningProgress(30),
    supabase.from('profiles').select('created_at').eq('id', user.id).maybeSingle(),
  ]);
  const pages = pagesRes.count ?? 0;
  const minutes = Math.floor((listenRes.data ?? []).reduce((a, r) => a + (r.seconds ?? 0), 0) / 60);
  const notes = (notesRes.data ?? []) as NoteRow[];
  const marks = (marksRes.data ?? []) as MarkRow[];

  // Caderno: anotações e marcadores agrupados por livro
  const bookIds = Array.from(new Set([...notes.map((n) => n.material_id), ...marks.map((m) => m.material_id)]));
  const { data: books } = bookIds.length
    ? await supabase.from('materials').select('id, slug, title, type, cover_path').in('id', bookIds)
    : { data: [] };
  const withCovers = await withCoverUrls((books ?? []) as { id: string; slug: string; title: string; type: MaterialType; cover_path: string | null }[]);
  const notebook = withCovers.map((b) => ({
    ...b,
    notes: notes.filter((n) => n.material_id === b.id),
    marks: marks.filter((m) => m.material_id === b.id),
    last: notes.filter((n) => n.material_id === b.id).map((n) => n.created_at).sort().pop() ?? '',
  })).sort((a, b) => b.last.localeCompare(a.last));

  const name = profile?.display_name || user.email?.split('@')[0] || 'Membro';
  const since = meRes.data?.created_at ? new Date(meRes.data.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : null;
  const role = profile?.role === 'admin' ? 'Administração' : profile?.role === 'editor' ? 'Equipe' : profile?.approved ? 'Membro' : 'Aguardando aprovação';

  return (
    <div className="container stack" style={{ ['--gap' as string]: '20px' }}>
      <section className="profile-hero">
        <span className="avatar profile-avatar">{name.slice(0, 1).toUpperCase()}</span>
        <div className="stack" style={{ ['--gap' as string]: '4px', flex: 1, minWidth: 0 }}>
          <h1 className="page-title-xl">{name}</h1>
          <span className="profile-sub">{role}{since ? ` · na biblioteca desde ${since}` : ''}</span>
        </div>
        <Link href="/conta" className="btn" style={{ alignSelf: 'center' }}><Icon name="settings" size={16} /> Conta e senha</Link>
      </section>

      <div className="panel stat-grid">
        <div className="stat-tile"><span>Páginas lidas</span><b>{pages.toLocaleString('pt-BR')}</b><small>cada página conta uma vez</small></div>
        <div className="stat-tile"><span>Minutos escutados</span><b>{minutes.toLocaleString('pt-BR')}</b><small>audiobooks, áudios e vídeos</small></div>
        <div className="stat-tile"><span>Anotações</span><b>{notes.length}</b><small>{marks.length} marcadores</small></div>
        <div className="stat-tile"><span>Em andamento</span><b>{reading.length + listening.length}</b><small>leituras e escutas</small></div>
      </div>

      <section className="panel" id="lendo" aria-labelledby="h-lendo">
        <div className="panel-head"><h2 id="h-lendo">Continue lendo</h2></div>
        {reading.length ? (
          <div className="shelf">{reading.map((m) => <BookCard key={m.id} href={m.href} title={m.title} type={m.type} url={m.coverUrl} seed={m.id} sub={m.sub} percent={m.percent} />)}</div>
        ) : <div className="empty"><span className="muted">Os livros e apostilas que você abrir aparecem aqui, com a página onde parou.</span></div>}
      </section>

      <section className="panel" id="ouvindo" aria-labelledby="h-ouvindo">
        <div className="panel-head"><h2 id="h-ouvindo">Onde parei de ouvir</h2></div>
        {listening.length ? (
          <ol className="lessons">
            {listening.map((m) => (
              <li key={m.id}>
                <Link className="lesson" href={m.href}>
                  <span className="lesson-n" aria-hidden="true"><Icon name={m.href.startsWith('/assistir') ? 'play' : 'headphones'} size={16} /></span>
                  <span className="lesson-t"><b>{m.title}</b><small>{m.sub}</small></span>
                  <span className="pill-link">Continuar</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : <div className="empty"><span className="muted">Os audiobooks que você ouvir aparecem aqui, com a faixa e o minuto onde parou.</span></div>}
      </section>

      <section className="panel" id="caderno" aria-labelledby="h-caderno">
        <div className="panel-head"><h2 id="h-caderno">Caderno de anotações</h2><span className="muted" style={{ fontSize: 12.5 }}>separado por livro</span></div>
        {notebook.length ? (
          <div className="stack" style={{ ['--gap' as string]: '14px' }}>
            {notebook.map((b) => (
              <details key={b.id} className="notebook" open={notebook.length <= 3}>
                <summary>
                  <span className="notebook-cover">{b.coverUrl ? <img src={b.coverUrl} alt="" /> : null}</span>
                  <span className="lesson-t"><b>{b.title}</b><small>{b.notes.length} {b.notes.length === 1 ? 'anotação' : 'anotações'} · {b.marks.length} {b.marks.length === 1 ? 'marcador' : 'marcadores'}</small></span>
                  <Icon name="chevronDown" size={16} />
                </summary>
                <div className="notebook-body">
                  {b.marks.length ? (
                    <div className="chips" style={{ flexWrap: 'wrap' }}>
                      {b.marks.map((m) => <Link key={m.id} className="chip" href={`/ler/${b.slug}?local=${encodeURIComponent(m.location)}`}><Icon name="bookmark" size={13} /> {m.label || where(m.location)}</Link>)}
                    </div>
                  ) : null}
                  {b.notes.map((n) => (
                    <article key={n.id} className="note-card">
                      <div className="note-meta">
                        <Link href={`/ler/${b.slug}?local=${encodeURIComponent(n.location)}`}>{where(n.location)}</Link>
                        <span>{new Date(n.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                      {n.quote ? <blockquote>“{n.quote}”</blockquote> : null}
                      {n.note ? <p>{n.note}</p> : null}
                      {n.audio_path ? <VoicePlayer path={n.audio_path} /> : null}
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : <div className="empty"><b>Seu caderno está vazio</b><span className="muted">No leitor, toque no lápis (✎) para escrever, citar um trecho ou gravar uma nota de voz.</span></div>}
      </section>
    </div>
  );
}
