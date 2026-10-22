'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Book, Rendition, NavItem } from 'epubjs';
import { createClient } from '@/lib/supabase/client';
import { getOfflineFile } from '@/lib/offline';
import { Icon } from '../Icon';
import { NotesPanel, useReaderNotes } from './notes';
import { OfflineButton } from './OfflineButton';
import styles from './reader.module.css';

type Theme = 'claro' | 'sepia' | 'escuro';
const THEMES: Record<Theme, { background: string; color: string }> = {
  claro: { background: '#FFFFFF', color: '#10201B' },
  sepia: { background: '#F3E8D3', color: '#3A2C1E' },
  escuro: { background: '#0D1513', color: '#E6E1D6' },
};
interface Toc { label: string; href: string; depth: number }
interface Hit { cfi: string; excerpt: string }

export function EpubReader(props: {
  fileId: string; materialId: string; slug: string; title: string; initialLocation: string | null; canSave: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const book = useRef<Book | null>(null);
  const rendition = useRef<Rendition | null>(null);
  const selection = useRef('');
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [cfi, setCfi] = useState(props.initialLocation ?? '');
  const [percent, setPercent] = useState<number | null>(null);
  const [locationsReady, setLocationsReady] = useState(false);
  const [theme, setTheme] = useState<Theme>('claro');
  const [size, setSize] = useState(100);
  const [panel, setPanel] = useState<'none' | 'toc' | 'search' | 'notes'>('none');
  const [toc, setToc] = useState<Toc[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [quote, setQuote] = useState('');
  const notes = useReaderNotes(props.materialId, props.canSave);

  useEffect(() => {
    try {
      const t = localStorage.getItem('leitor-tema') as Theme | null; if (t && THEMES[t]) setTheme(t);
      const s = Number(localStorage.getItem('leitor-epub-tamanho')); if (s >= 70 && s <= 200) setSize(s);
    } catch { /* sem storage */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await getOfflineFile(props.fileId);
        let data = saved;
        if (!data) {
          const res = await fetch(`/api/files/${props.fileId}`, { cache: 'no-store' }).catch(() => null);
          if (!res) throw new Error('Sem conexão. Este material não foi salvo para leitura offline.');
          if (!res.ok) throw new Error(res.status === 403 ? 'Você não tem permissão para ler este material.' : 'Arquivo indisponível.');
          const { url } = await res.json();
          data = await (await fetch(url)).arrayBuffer();
        }
        if (cancelled || !stage.current) return;
        const { default: ePub } = await import('epubjs');
        const b = ePub(data);
        book.current = b;
        const r = b.renderTo(stage.current, { width: '100%', height: '100%', flow: 'paginated', spread: 'auto', allowScriptedContent: false });
        rendition.current = r;
        (Object.keys(THEMES) as Theme[]).forEach((t) => r.themes.register(t, { body: { background: THEMES[t].background, color: THEMES[t].color } }));
        r.on('relocated', (loc: { start: { cfi: string; percentage: number } }) => {
          setCfi(loc.start.cfi);
          if (b.locations.length()) setPercent(b.locations.percentageFromCfi(loc.start.cfi));
        });
        r.on('selected', (_range: string, contents: { window: Window }) => {
          selection.current = contents.window.getSelection()?.toString().trim() ?? '';
        });
        r.on('keyup', (e: KeyboardEvent) => {
          if (e.key === 'ArrowRight') void r.next();
          if (e.key === 'ArrowLeft') void r.prev();
        });
        await r.display(props.initialLocation || undefined);
        if (cancelled) return;
        setStatus('ready');
        const nav = await b.loaded.navigation;
        const flat: Toc[] = [];
        const walk = (items: NavItem[], depth: number) => items.forEach((i) => {
          flat.push({ label: i.label.trim(), href: i.href, depth });
          if (i.subitems?.length && depth < 2) walk(i.subitems, depth + 1);
        });
        walk(nav.toc, 0);
        if (!cancelled) setToc(flat);
        // Posições para calcular a porcentagem lida (em segundo plano)
        await b.locations.generate(1600);
        if (!cancelled) {
          setLocationsReady(true);
          const here = r.currentLocation() as unknown as { start?: { cfi: string } };
          if (here?.start?.cfi) setPercent(b.locations.percentageFromCfi(here.start.cfi));
        }
      } catch (e) {
        if (!cancelled) { setStatus('error'); setError(e instanceof Error ? e.message : 'Não foi possível abrir o EPUB.'); }
      }
    })();
    return () => { cancelled = true; book.current?.destroy(); };
  }, [props.fileId, props.initialLocation]);

  useEffect(() => {
    rendition.current?.themes.select(theme);
    try { localStorage.setItem('leitor-tema', theme); } catch { /* sem storage */ }
  }, [theme, status]);
  useEffect(() => {
    rendition.current?.themes.fontSize(`${size}%`);
    try { localStorage.setItem('leitor-epub-tamanho', String(size)); } catch { /* sem storage */ }
  }, [size, status]);

  // Progresso: o local exato (CFI) e a porcentagem, sincronizados entre aparelhos
  useEffect(() => {
    if (!props.canSave || status !== 'ready' || !cfi) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from('reading_progress').upsert({
          user_id: user.id, material_id: props.materialId, location: cfi,
          percent: percent != null ? Math.round(percent * 10000) / 100 : null, updated_at: new Date().toISOString(),
        });
      } catch { /* sem conexão: tenta de novo na próxima mudança */ }
    }, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [cfi, percent, status, props.canSave, props.materialId]);

  const go = (target: string) => { void rendition.current?.display(target); };
  const describe = (loc: string) => (locationsReady && book.current ? `${Math.round(book.current.locations.percentageFromCfi(loc) * 100)}% do livro` : 'trecho marcado');

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const b = book.current;
    const q = query.trim();
    if (!b || q.length < 2) return;
    setSearching(true);
    const found: Hit[] = [];
    const spine = b.spine as unknown as { spineItems: { load: (l: unknown) => Promise<unknown>; find: (q: string) => Hit[]; unload: () => void }[] };
    for (const item of spine.spineItems) {
      if (found.length >= 100) break;
      try {
        await item.load(b.load.bind(b));
        found.push(...item.find(q));
      } finally { item.unload(); }
    }
    setHits(found.slice(0, 100));
    setSearching(false);
  }

  function fullscreen() {
    const el = shell.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  const pct = percent != null ? Math.round(percent * 100) : null;
  return (
    <div ref={shell} className={`${styles.shell} ${styles[theme]}`}>
      <header className={styles.bar}>
        <Link href={`/material/${props.slug}`} className={styles.ib} aria-label="Voltar ao material"><Icon name="back" /></Link>
        <button type="button" className={styles.tb} aria-pressed={panel === 'toc'} onClick={() => setPanel(panel === 'toc' ? 'none' : 'toc')}>Sumário</button>
        <button type="button" className={styles.ib} aria-label="Buscar no livro" aria-pressed={panel === 'search'} onClick={() => setPanel(panel === 'search' ? 'none' : 'search')}><Icon name="search" /></button>
        <div className={styles.title}><b>{props.title}</b><span>{status !== 'ready' ? 'carregando…' : pct != null ? `${pct}% lido` : 'calculando posição…'}</span></div>
        <div className={styles.group} role="group" aria-label="Tamanho da letra">
          <button type="button" className={styles.ib} onClick={() => setSize((s) => Math.max(70, s - 10))} aria-label="Diminuir letra"><small>A</small></button>
          <span className={styles.zoom}>{size}%</span>
          <button type="button" className={styles.ib} onClick={() => setSize((s) => Math.min(200, s + 10))} aria-label="Aumentar letra"><b>A</b></button>
        </div>
        <div className={styles.group} role="group" aria-label="Modo de leitura">
          {(['claro', 'sepia', 'escuro'] as Theme[]).map((t) => (
            <button key={t} type="button" className={`${styles.swatch} ${styles['sw_' + t]}`} aria-pressed={theme === t}
              aria-label={`Modo ${t === 'sepia' ? 'sépia' : t}`} onClick={() => setTheme(t)}>Aa</button>
          ))}
        </div>
        <button type="button" className={styles.ib} aria-pressed={notes.isMarked(cfi)} disabled={!props.canSave || status !== 'ready'}
          aria-label={notes.isMarked(cfi) ? 'Remover marcador' : 'Marcar este ponto'}
          onClick={() => void notes.toggleBookmark(cfi, pct != null ? `${pct}% do livro` : 'Marcador')}><Icon name="bookmark" /></button>
        <button type="button" className={styles.ib} aria-pressed={panel === 'notes'} aria-label="Marcadores e anotações"
          onClick={() => { setQuote(selection.current); setPanel(panel === 'notes' ? 'none' : 'notes'); }}><Icon name="note" /></button>
        <OfflineButton fileId={props.fileId} materialId={props.materialId} slug={props.slug} title={props.title} kind="epub" />
        <button type="button" className={styles.ib} onClick={fullscreen} aria-label="Tela cheia"><Icon name="expand" /></button>
      </header>

      <div className={styles.body}>
        {panel !== 'none' ? (
          <aside className={styles.panel} aria-label={panel === 'toc' ? 'Sumário' : panel === 'notes' ? 'Marcadores e anotações' : 'Busca'}>
            {panel === 'notes' ? (
              <NotesPanel api={notes} location={cfi} describe={describe} initialQuote={quote} canSave={props.canSave} onGo={go} />
            ) : panel === 'toc' ? (
              toc.length ? (
                <ol>{toc.map((o, i) => (
                  <li key={i}><button type="button" style={{ paddingLeft: 12 + o.depth * 14 }} onClick={() => { go(o.href); setPanel('none'); }}>{o.label}</button></li>
                ))}</ol>
              ) : <p className={styles.note}>Este livro não tem sumário.</p>
            ) : (
              <>
                <form onSubmit={runSearch} className={styles.searchForm}>
                  <label htmlFor="busca-epub" className="sr-only">Buscar no livro</label>
                  <input id="busca-epub" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no texto…" />
                  <button type="submit" className={styles.tb} disabled={searching}>{searching ? '…' : 'Buscar'}</button>
                </form>
                {hits === null ? null : hits.length === 0 ? <p className={styles.note}>Nada encontrado.</p>
                  : <ol>{hits.map((h, i) => (
                      <li key={i}><button type="button" onClick={() => go(h.cfi)}>…{h.excerpt.trim()}…</button></li>
                    ))}</ol>}
              </>
            )}
          </aside>
        ) : null}
        <div className={styles.epubStage}>
          {status === 'loading' ? <p className={styles.note} role="status">Abrindo o livro…</p> : null}
          {status === 'error' ? <p className={styles.note} role="alert">{error}</p> : null}
          <div ref={stage} className={styles.epubView} />
        </div>
      </div>

      <footer className={styles.foot}>
        <button type="button" className={styles.tb} onClick={() => void rendition.current?.prev()} disabled={status !== 'ready'}>Anterior</button>
        <div className={styles.progress} aria-hidden="true"><i style={{ width: pct != null ? `${pct}%` : 0 }} /></div>
        <button type="button" className={styles.tb} onClick={() => void rendition.current?.next()} disabled={status !== 'ready'}>Próxima</button>
      </footer>
    </div>
  );
}
