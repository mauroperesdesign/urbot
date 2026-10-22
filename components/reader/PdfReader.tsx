'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { createClient } from '@/lib/supabase/client';
import { getOfflineFile } from '@/lib/offline';
import { Icon } from '../Icon';
import { NotesPanel, useReaderNotes } from './notes';
import { OfflineButton } from './OfflineButton';
import styles from './reader.module.css';

type Fit = 'width' | 'page' | 'custom';
type Theme = 'claro' | 'sepia' | 'escuro';
interface OutlineItem { title: string; page: number | null; depth: number }
interface Hit { page: number; snippet: string }

export function PdfReader(props: {
  fileId: string; materialId: string; slug: string; title: string; initialPage: number; canSave: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const doc = useRef<PDFDocumentProxy | null>(null);
  const task = useRef<RenderTask | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const touchX = useRef<number | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [page, setPage] = useState(props.initialPage);
  const [pages, setPages] = useState(0);
  const [fit, setFit] = useState<Fit>('width');
  const [zoom, setZoom] = useState(1); // só para exibir o percentual
  const [customZoom, setCustomZoom] = useState(1); // escala escolhida pela pessoa (ajuste livre)
  const [theme, setTheme] = useState<Theme>('claro');
  const [panel, setPanel] = useState<'none' | 'toc' | 'search' | 'notes'>('none');
  const [quote, setQuote] = useState('');
  const notes = useReaderNotes(props.materialId, props.canSave);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Preferência de tema guardada no aparelho
  useEffect(() => {
    try { const t = localStorage.getItem('leitor-tema') as Theme | null; if (t) setTheme(t); } catch { /* sem storage */ }
  }, []);
  useEffect(() => { try { localStorage.setItem('leitor-tema', theme); } catch { /* sem storage */ } }, [theme]);

  // Carrega o PDF a partir de uma URL assinada e temporária
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        // Cópia guardada no aparelho (leitura sem internet) tem prioridade
        const saved = await getOfflineFile(props.fileId);
        let source: { url: string } | { data: Uint8Array };
        if (saved) source = { data: new Uint8Array(saved) };
        else {
          const res = await fetch(`/api/files/${props.fileId}`, { cache: 'no-store' }).catch(() => null);
          if (!res) throw new Error('Sem conexão. Este material não foi salvo para leitura offline.');
          if (!res.ok) throw new Error(res.status === 403 ? 'Você não tem permissão para ler este material.' : 'Arquivo indisponível.');
          source = { url: (await res.json()).url };
        }
        const pdf = await pdfjs.getDocument({ ...source, disableAutoFetch: false, isEvalSupported: false }).promise;
        if (cancelled) return;
        doc.current = pdf;
        setPages(pdf.numPages);
        setPage((p) => Math.min(Math.max(1, p), pdf.numPages));
        setStatus('ready');
        const raw = await pdf.getOutline().catch(() => null);
        if (raw && !cancelled) {
          const flat: OutlineItem[] = [];
          const walk = async (items: typeof raw, depth: number) => {
            for (const it of items) {
              let target: number | null = null;
              try {
                const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest;
                if (dest && dest[0]) target = (await pdf.getPageIndex(dest[0])) + 1;
              } catch { target = null; }
              flat.push({ title: it.title, page: target, depth });
              if (it.items?.length && depth < 2) await walk(it.items, depth + 1);
            }
          };
          await walk(raw, 0);
          if (!cancelled) setOutline(flat);
        }
      } catch (e) {
        if (!cancelled) { setStatus('error'); setError(e instanceof Error ? e.message : 'Não foi possível abrir o PDF.'); }
      }
    })();
    return () => { cancelled = true; void doc.current?.destroy(); };
  }, [props.fileId]);

  // Renderiza a página atual
  const render = useCallback(async () => {
    const pdf = doc.current;
    const el = canvas.current;
    const box = stage.current;
    if (!pdf || !el || !box) return;
    const p = await pdf.getPage(page);
    const base = p.getViewport({ scale: 1 });
    const availW = box.clientWidth - 24;
    const availH = box.clientHeight - 24;
    const scale = fit === 'width' ? availW / base.width : fit === 'page' ? Math.min(availW / base.width, availH / base.height) : customZoom;
    const viewport = p.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.floor(viewport.width * ratio);
    el.height = Math.floor(viewport.height * ratio);
    el.style.width = `${Math.floor(viewport.width)}px`;
    el.style.height = `${Math.floor(viewport.height)}px`;
    task.current?.cancel();
    const ctx = el.getContext('2d')!;
    const t = p.render({ canvasContext: ctx, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
    task.current = t;
    try { await t.promise; } catch { /* render cancelado */ }
    // Camada de texto invisível por cima da página: permite selecionar e citar trechos
    const layer = textLayer.current;
    if (layer) {
      layer.replaceChildren();
      layer.style.setProperty('--scale-factor', String(viewport.scale));
      try {
        const { TextLayer } = await import('pdfjs-dist');
        await new TextLayer({ textContentSource: p.streamTextContent(), container: layer, viewport }).render();
      } catch { /* PDF escaneado sem texto */ }
    }
    setZoom(scale);
  }, [page, fit, customZoom]);

  useEffect(() => { if (status === 'ready') void render(); }, [status, render]);
  useEffect(() => {
    const onResize = () => { if (status === 'ready' && fit !== 'custom') void render(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [status, fit, render]);

  // Salva o progresso (debounce) por usuário e material — sincroniza entre aparelhos
  useEffect(() => {
    if (!props.canSave || status !== 'ready' || !pages) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('reading_progress').upsert({
        user_id: user.id, material_id: props.materialId, location: String(page),
        percent: Math.round((page / pages) * 10000) / 100, updated_at: new Date().toISOString(),
      });
    }, 1200);
    return () => clearTimeout(saveTimer.current);
  }, [page, pages, status, props.canSave, props.materialId]);

  const go = (n: number) => setPage((p) => Math.min(Math.max(1, n || p), pages || 1));
  const zoomBy = (f: number) => { setFit('custom'); setCustomZoom(Math.min(4, Math.max(0.4, zoom * f))); };

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const pdf = doc.current;
    const q = query.trim().toLowerCase();
    if (!pdf || q.length < 2) return;
    setSearching(true);
    const found: Hit[] = [];
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const nq = norm(q);
    for (let i = 1; i <= pdf.numPages && found.length < 100; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      const text = tc.items.map((it) => ('str' in it ? it.str : '')).join(' ');
      const idx = norm(text).indexOf(nq);
      if (idx >= 0) found.push({ page: i, snippet: text.slice(Math.max(0, idx - 50), idx + q.length + 60) });
    }
    setHits(found);
    setSearching(false);
  }

  function openNotes() {
    setQuote(window.getSelection()?.toString().trim() ?? '');
    setPanel(panel === 'notes' ? 'none' : 'notes');
  }

  function fullscreen() {
    const el = shell.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  function onKey(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(page + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(page - 1); }
  }

  return (
    <div ref={shell} className={`${styles.shell} ${styles[theme]}`} onKeyDown={onKey}>
      <header className={styles.bar}>
        <Link href={`/material/${props.slug}`} className={styles.ib} aria-label="Voltar ao material"><Icon name="back" /></Link>
        <button type="button" className={styles.tb} aria-pressed={panel === 'toc'} onClick={() => setPanel(panel === 'toc' ? 'none' : 'toc')}>Sumário</button>
        <button type="button" className={styles.ib} aria-label="Buscar no documento" aria-pressed={panel === 'search'} onClick={() => setPanel(panel === 'search' ? 'none' : 'search')}><Icon name="search" /></button>
        <div className={styles.title}><b>{props.title}</b><span>{pages ? `página ${page} de ${pages}` : 'carregando…'}</span></div>
        <div className={styles.group} role="group" aria-label="Zoom">
          <button type="button" className={styles.ib} onClick={() => zoomBy(1 / 1.2)} aria-label="Diminuir zoom"><Icon name="zoomOut" /></button>
          <span className={styles.zoom}>{Math.round(zoom * 100)}%</span>
          <button type="button" className={styles.ib} onClick={() => zoomBy(1.2)} aria-label="Aumentar zoom"><Icon name="zoomIn" /></button>
        </div>
        <div className={styles.group} role="group" aria-label="Ajuste">
          <button type="button" className={styles.tb} aria-pressed={fit === 'width'} onClick={() => setFit('width')}>Largura</button>
          <button type="button" className={styles.tb} aria-pressed={fit === 'page'} onClick={() => setFit('page')}>Página</button>
        </div>
        <div className={styles.group} role="group" aria-label="Modo de leitura">
          {(['claro', 'sepia', 'escuro'] as Theme[]).map((t) => (
            <button key={t} type="button" className={`${styles.swatch} ${styles['sw_' + t]}`} aria-pressed={theme === t}
              aria-label={`Modo ${t === 'sepia' ? 'sépia' : t}`} onClick={() => setTheme(t)}>Aa</button>
          ))}
        </div>
        <button type="button" className={styles.ib} aria-pressed={notes.isMarked(String(page))} disabled={!props.canSave || status !== 'ready'}
          aria-label={notes.isMarked(String(page)) ? 'Remover marcador desta página' : 'Marcar esta página'}
          onClick={() => void notes.toggleBookmark(String(page), `Página ${page}`)}><Icon name="bookmark" /></button>
        <button type="button" className={styles.ib} aria-pressed={panel === 'notes'} aria-label="Marcadores e anotações"
          onMouseDown={(e) => e.preventDefault()} onClick={openNotes}><Icon name="note" /></button>
        <OfflineButton fileId={props.fileId} materialId={props.materialId} slug={props.slug} title={props.title} kind="pdf" />
        <button type="button" className={styles.ib} onClick={fullscreen} aria-label="Tela cheia"><Icon name="expand" /></button>
      </header>

      <div className={styles.body}>
        {panel !== 'none' ? (
          <aside className={styles.panel} aria-label={panel === 'toc' ? 'Sumário' : panel === 'notes' ? 'Marcadores e anotações' : 'Busca'}>
            {panel === 'notes' ? (
              <NotesPanel api={notes} location={String(page)} describe={(l) => `página ${l}`} initialQuote={quote} canSave={props.canSave}
                onGo={(l) => go(Number(l))} />
            ) : panel === 'toc' ? (
              outline.length ? (
                <ol>{outline.map((o, i) => (
                  <li key={i}><button type="button" disabled={!o.page} style={{ paddingLeft: 12 + o.depth * 14 }}
                    onClick={() => { if (o.page) { go(o.page); setPanel('none'); } }}>{o.title}{o.page ? <small>{o.page}</small> : null}</button></li>
                ))}</ol>
              ) : <p className={styles.note}>Este PDF não tem sumário embutido. Use a navegação por páginas ou a busca.</p>
            ) : (
              <>
                <form onSubmit={runSearch} className={styles.searchForm}>
                  <label htmlFor="busca-pdf" className="sr-only">Buscar no documento</label>
                  <input id="busca-pdf" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no texto…" />
                  <button type="submit" className={styles.tb} disabled={searching}>{searching ? '…' : 'Buscar'}</button>
                </form>
                {hits === null ? <p className={styles.note}>A busca funciona quando o PDF tem texto (PDFs escaneados sem OCR não são pesquisáveis).</p>
                  : hits.length === 0 ? <p className={styles.note}>Nada encontrado.</p>
                  : <ol>{hits.map((h, i) => (
                      <li key={i}><button type="button" onClick={() => go(h.page)}><small>p. {h.page}</small>…{h.snippet}…</button></li>
                    ))}</ol>}
              </>
            )}
          </aside>
        ) : null}

        <div ref={stage} className={styles.stage}
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchX.current == null || fit === 'custom') return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 60) go(page + (dx < 0 ? 1 : -1));
            touchX.current = null;
          }}>
          {status === 'loading' ? <p className={styles.note} role="status">Abrindo o documento…</p> : null}
          {status === 'error' ? <p className={styles.note} role="alert">{error}</p> : null}
          <div className={styles.pageWrap} hidden={status !== 'ready'}>
            <canvas ref={canvas} className={styles.canvas} aria-label={`Página ${page} de ${props.title}`} />
            <div ref={textLayer} className={styles.textLayer} />
          </div>
        </div>
      </div>

      <footer className={styles.foot}>
        <button type="button" className={styles.tb} onClick={() => go(page - 1)} disabled={page <= 1}>Anterior</button>
        <label className={styles.pageInput}>
          <span className="sr-only">Ir para a página</span>
          <input type="number" min={1} max={pages || 1} value={page} onChange={(e) => go(Number(e.target.value))} />
          <span>/ {pages || '–'}</span>
        </label>
        <div className={styles.progress} aria-hidden="true"><i style={{ width: pages ? `${(page / pages) * 100}%` : 0 }} /></div>
        <button type="button" className={styles.tb} onClick={() => go(page + 1)} disabled={!pages || page >= pages}>Próxima</button>
      </footer>
    </div>
  );
}
