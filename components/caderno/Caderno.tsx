'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { BOARD_H, BOARD_W, COLORS, MAX_ITEMS, MAX_TEXT, clean, color, estimateHeight, uid,
  type ColorId, type Item, type Page, type PageContent } from '@/lib/caderno';

type Sel = { type: 'item' | 'link'; id: string } | null;
type Status = 'carregando' | 'salvo' | 'salvando' | 'erro';
type Signed = { path: string | null; signedUrl: string };

// Nota de texto que cresce conforme a pessoa escreve
function AutoText({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  return <textarea ref={ref} value={value} rows={1} maxLength={MAX_TEXT} placeholder="Escreva aqui…" aria-label="Texto da nota"
    onChange={(e) => onChange(e.target.value)} />;
}

// Reduz a imagem (máx. 1600 px) e converte para JPEG antes de enviar
async function toJpeg(file: Blob): Promise<{ blob: Blob; ar: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('falha'))), 'image/jpeg', 0.88));
    return { blob, ar: c.height / c.width };
  } finally { URL.revokeObjectURL(url); }
}

export function Caderno({ compact = false, about, quote, onClose }: { compact?: boolean; about?: string; quote?: string; onClose?: () => void }) {
  const supabase = useRef(createClient()).current;
  const [userId, setUserId] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Sel>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [zoom, setZoom] = useState(compact ? 0.8 : 1);
  useEffect(() => { if (window.innerWidth < 700) setZoom(0.65); }, []);
  const [status, setStatus] = useState<Status>('carregando');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const vp = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const dirty = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const quoteDone = useRef<string | null>(null);
  const loaded = useRef(false);

  const page = pages.find((p) => p.id === current) ?? null;
  const items = useMemo(() => page?.content.items ?? [], [page]);
  const links = useMemo(() => page?.content.links ?? [], [page]);

  // ------------------------------------------------------------ salvar (com espera de 0,8 s)
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const ids = Array.from(dirty.current);
    dirty.current.clear();
    if (!ids.length) return;
    setStatus('salvando');
    const results = await Promise.all(ids.map((id) => {
      const p = pagesRef.current.find((x) => x.id === id);
      return p ? supabase.from('notebook_pages').update({ title: p.title.trim() || 'Sem título', content: p.content, updated_at: new Date().toISOString() }).eq('id', id) : null;
    }));
    const failed = results.some((r) => r?.error);
    if (failed) ids.forEach((id) => dirty.current.add(id));
    setStatus(failed ? 'erro' : 'salvo');
  }, [supabase]);

  const touch = useCallback((id: string) => {
    dirty.current.add(id);
    setStatus('salvando');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }, [flush]);

  useEffect(() => () => { void flush(); }, [flush]);
  useEffect(() => {
    const save = () => { void flush(); };
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [flush]);

  const edit = useCallback((fn: (c: PageContent) => PageContent, pageId = current) => {
    if (!pageId) return;
    setPages((ps) => ps.map((p) => (p.id === pageId ? { ...p, content: fn(p.content) } : p)));
    touch(pageId);
  }, [current, touch]);

  const patchItem = useCallback((id: string, patch: Partial<Item>) => {
    edit((c) => ({ ...c, items: c.items.map((i) => (i.id === id ? ({ ...i, ...patch } as Item) : i)) }));
  }, [edit]);

  // ------------------------------------------------------------ carregar
  const createPage = useCallback(async (title: string, uidOverride?: string) => {
    const owner = uidOverride ?? userId;
    if (!owner) return null;
    const { data, error } = await supabase.from('notebook_pages').insert({ user_id: owner, title }).select('id, title, content, updated_at').single();
    if (error || !data) { setMsg('Não foi possível criar a folha.'); return null; }
    const p = { ...(data as Page), content: clean(data.content) };
    setPages((ps) => [...ps, p]);
    setCurrent(p.id);
    return p;
  }, [supabase, userId]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setStatus('erro'); setMsg('Entre na sua conta para usar o caderno.'); return; }
      setUserId(user.id);
      const { data } = await supabase.from('notebook_pages').select('id, title, content, updated_at').order('created_at');
      const list = ((data ?? []) as Page[]).map((p) => ({ ...p, content: clean(p.content) }));
      if (list.length) {
        setPages(list);
        let last = list[0];
        for (const p of list) if (p.updated_at > last.updated_at) last = p;
        setCurrent(last.id);
      } else {
        await createPage('Minha primeira folha', user.id);
      }
      setStatus('salvo');
    })();
  }, [supabase, createPage]);

  // Links temporários das imagens da folha aberta
  useEffect(() => {
    const missing = items.filter((i) => i.kind === 'image' && !signed[i.path]).map((i) => (i.kind === 'image' ? i.path : ''));
    if (!missing.length) return;
    void supabase.storage.from('caderno').createSignedUrls(missing, 3600).then(({ data }: { data: Signed[] | null }) => {
      const add: Record<string, string> = {};
      (data ?? []).forEach((d) => { if (d.path && d.signedUrl) add[d.path] = d.signedUrl; });
      setSigned((s) => ({ ...s, ...add }));
    });
  }, [items, signed, supabase]);

  // Altura real de cada nota na tela (para as linhas das ligações); compara antes de atualizar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    const next: Record<string, number> = {};
    el.querySelectorAll<HTMLElement>('.cad-item').forEach((n) => { next[n.dataset.id!] = n.offsetHeight; });
    const changed = Object.keys(next).length !== Object.keys(sizes).length || Object.entries(next).some(([k, v]) => sizes[k] !== v);
    if (changed) setSizes(next);
  });

  // ------------------------------------------------------------ criar notas e imagens
  // Procura um lugar livre perto do centro da tela, para a nota nova não cobrir as outras
  const spot = (w: number, h = 120) => {
    const v = vp.current;
    const cx = v ? (v.scrollLeft + v.clientWidth / 2) / zoom - w / 2 : 300;
    const cy = v ? (v.scrollTop + v.clientHeight / 3) / zoom - h / 3 : 200;
    const rects = items.map((i) => ({ x: i.x, y: i.y, w: i.w, h: sizes[i.id] ?? estimateHeight(i) }));
    const free = (x: number, y: number) => rects.every((r) => x + w + 16 < r.x || x > r.x + r.w + 16 || y + h + 16 < r.y || y > r.y + r.h + 16);
    const fit = (x: number, y: number) => ({ x: Math.round(Math.min(BOARD_W - w - 10, Math.max(10, x))), y: Math.round(Math.min(BOARD_H - h - 10, Math.max(10, y))) });
    for (let ring = 0; ring < 9; ring++) {
      for (let gx = -ring; gx <= ring; gx++) {
        for (let gy = -ring; gy <= ring; gy++) {
          if (Math.max(Math.abs(gx), Math.abs(gy)) !== ring) continue;
          const c = fit(cx + gx * (w + 30), cy + gy * (h + 30));
          if (free(c.x, c.y)) return c;
        }
      }
    }
    return fit(cx + (items.length % 6) * 24, cy + (items.length % 6) * 24);
  };

  const addNote = useCallback((text = '', source?: string, c: ColorId = 'amarelo') => {
    if (items.length >= MAX_ITEMS) { setMsg('Esta folha está cheia. Crie uma folha nova.'); return; }
    const w = 240;
    const item: Item = { id: uid(), kind: 'text', ...spot(w, 110), w, text: text.slice(0, MAX_TEXT), color: c, ...(source ? { source } : {}) };
    edit((ct) => ({ ...ct, items: [...ct.items, item] }));
    setSel({ type: 'item', id: item.id });
    setFresh(item.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, edit, zoom]);

  async function addImage(blob: Blob) {
    if (!userId || !current) return;
    if (!blob.type.startsWith('image/')) { setMsg('Só dá para colar imagens (prints, fotos).'); return; }
    if (items.length >= MAX_ITEMS) { setMsg('Esta folha está cheia. Crie uma folha nova.'); return; }
    setBusy(true); setMsg('');
    try {
      const { blob: jpg, ar } = await toJpeg(blob);
      const id = uid();
      const path = `${userId}/${current}/${id}.jpg`;
      const { error } = await supabase.storage.from('caderno').upload(path, jpg, { contentType: 'image/jpeg' });
      if (error) throw error;
      const w = Math.round(Math.min(360, 360 / Math.max(ar, 0.6)));
      const pageId = current;
      edit((c) => ({ ...c, items: [...c.items, { id, kind: 'image', ...spot(w, w * ar + 24), w, path, ar, ...(about ? { source: about } : {}) }] }), pageId);
      setSel({ type: 'item', id });
    } catch {
      setMsg('Não foi possível colar a imagem (até 5 MB, sem conexão?).');
    } finally { setBusy(false); }
  }

  function onPaste(e: React.ClipboardEvent) {
    const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); void addImage(f); return; }
    const t = e.clipboardData.getData('text/plain');
    if (t && !(e.target as HTMLElement).closest('textarea, input')) { e.preventDefault(); addNote(t.trim()); }
  }

  // Trecho selecionado no leitor vira nota com a referência
  useEffect(() => {
    if (!quote || !current || status === 'carregando' || quoteDone.current === quote) return;
    quoteDone.current = quote;
    addNote(`“${quote.slice(0, 1500)}”`, about, 'azul');
  }, [quote, about, current, status, addNote]);

  // ------------------------------------------------------------ arrastar, redimensionar, ligar
  function drag(e: React.PointerEvent, item: Item, mode: 'move' | 'size') {
    e.preventDefault(); e.stopPropagation();
    setSel({ type: 'item', id: item.id });
    const sx = e.clientX, sy = e.clientY, ox = item.x, oy = item.y, ow = item.w;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / zoom, dy = (ev.clientY - sy) / zoom;
      if (mode === 'move') patchItem(item.id, { x: Math.round(Math.min(BOARD_W - 60, Math.max(0, ox + dx))), y: Math.round(Math.min(BOARD_H - 40, Math.max(0, oy + dy))) });
      else patchItem(item.id, { w: Math.round(Math.min(900, Math.max(item.kind === 'image' ? 80 : 140, ow + dx))) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function clickItem(id: string) {
    if (!linkMode) { setSel({ type: 'item', id }); return; }
    if (!linkFrom) { setLinkFrom(id); return; }
    if (linkFrom !== id && !links.some((l) => (l.from === linkFrom && l.to === id) || (l.from === id && l.to === linkFrom))) {
      const from = linkFrom;
      edit((c) => ({ ...c, links: [...c.links, { id: uid(), from, to: id }] }));
    }
    setLinkFrom(null); setLinkMode(false);
  }

  function removeSelected() {
    if (!sel) return;
    if (sel.type === 'link') { edit((c) => ({ ...c, links: c.links.filter((l) => l.id !== sel.id) })); setSel(null); return; }
    const it = items.find((i) => i.id === sel.id);
    if (it?.kind === 'image') void supabase.storage.from('caderno').remove([it.path]);
    edit((c) => ({ items: c.items.filter((i) => i.id !== sel.id), links: c.links.filter((l) => l.from !== sel.id && l.to !== sel.id) }));
    setSel(null);
  }

  // ------------------------------------------------------------ folhas
  async function removePage() {
    if (!page || !confirm(`Apagar a folha “${page.title}” e tudo o que tem nela?`)) return;
    const imgs = page.content.items.filter((i) => i.kind === 'image').map((i) => (i.kind === 'image' ? i.path : ''));
    if (imgs.length) await supabase.storage.from('caderno').remove(imgs);
    dirty.current.delete(page.id);
    await supabase.from('notebook_pages').delete().eq('id', page.id);
    const rest = pages.filter((p) => p.id !== page.id);
    setPages(rest);
    if (rest.length) setCurrent(rest[rest.length - 1].id);
    else await createPage('Nova folha');
  }

  async function download() {
    setBusy(true); setMsg('');
    try {
      await flush();
      const { exportPdf } = await import('./pdf');
      await exportPdf(pagesRef.current, async (paths) => {
        const { data } = await supabase.storage.from('caderno').createSignedUrls(paths, 600);
        return Object.fromEntries(((data ?? []) as Signed[]).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl]));
      });
    } catch (e) {
      console.error(e);
      setMsg('Não foi possível gerar o PDF agora.');
    } finally { setBusy(false); }
  }

  const center = (id: string) => {
    const it = items.find((i) => i.id === id);
    if (!it) return null;
    return { x: it.x + it.w / 2, y: it.y + (sizes[id] ?? estimateHeight(it)) / 2 };
  };
  const selItem = sel?.type === 'item' ? items.find((i) => i.id === sel.id) : undefined;

  return (
    <div className={`cad ${compact ? 'cad-compact' : ''}`} onPaste={onPaste}>
      <div className="cad-top">
        <div className="cad-title">
          <span aria-hidden="true">📓</span>
          <b>Caderno de estudos</b>
          <small data-status={status}>{status === 'salvando' ? 'salvando…' : status === 'erro' ? 'não salvou (sem conexão?)' : status === 'salvo' ? 'salvo' : 'abrindo…'}</small>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-ghost" onClick={() => void download()} disabled={busy || !pages.length}>⬇ PDF</button>
          {compact ? <Link className="btn btn-ghost" href="/caderno" onClick={onClose}>Tela cheia</Link> : null}
          {onClose ? <button type="button" className="btn btn-ghost cad-x" onClick={onClose} aria-label="Fechar o caderno">✕</button> : null}
        </div>
      </div>

      <div className="cad-tabs" role="tablist" aria-label="Folhas do caderno">
        {pages.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === current} onClick={() => { void flush(); setCurrent(p.id); setSel(null); }}>{p.title || 'Sem título'}</button>
        ))}
        <button type="button" className="cad-newtab" onClick={() => void createPage(`Folha ${pages.length + 1}`)} aria-label="Nova folha">+ Folha</button>
      </div>

      {about ? (
        <div className="cad-about">
          <span>Estudando: <b>{about}</b></span>
          <button type="button" className="btn btn-ghost" onClick={() => addNote('', about)}>+ Nota sobre isso</button>
        </div>
      ) : null}

      <div className="cad-tools" role="toolbar" aria-label="Ferramentas do caderno">
        <button type="button" className="btn btn-primary" onClick={() => addNote()} disabled={!page}>+ Nota</button>
        <button type="button" className="btn" onClick={() => file.current?.click()} disabled={!page || busy}>🖼 Imagem</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void addImage(f); e.target.value = ''; }} />
        <button type="button" className="btn" aria-pressed={linkMode} onClick={() => { setLinkMode(!linkMode); setLinkFrom(null); }} disabled={items.length < 2}>🔗 Ligar ideias</button>
        {selItem?.kind === 'text' ? (
          <span className="cad-colors" role="group" aria-label="Cor da nota">
            {COLORS.map((c) => <button key={c.id} type="button" aria-label={`Cor ${c.id}`} aria-pressed={selItem.color === c.id} style={{ background: c.bg, borderColor: c.line }} onClick={() => patchItem(selItem.id, { color: c.id })} />)}
          </span>
        ) : null}
        {sel ? <button type="button" className="btn btn-ghost btn-danger" onClick={removeSelected}>{sel.type === 'link' ? 'Apagar ligação' : 'Apagar'}</button> : null}
        <span className="cad-zoom" role="group" aria-label="Zoom">
          <button type="button" className="btn btn-ghost" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} aria-label="Diminuir">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn btn-ghost" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} aria-label="Aumentar">+</button>
        </span>
      </div>
      {linkMode ? <p className="cad-hint" role="status">{linkFrom ? 'Agora toque na nota que vai ligar com a primeira.' : 'Toque na primeira nota que quer ligar.'}</p> : null}
      {msg ? <p className="cad-hint cad-err" role="alert">{msg}</p> : null}

      <div className="cad-viewport" ref={vp} tabIndex={0} aria-label="Folha do caderno. Cole prints e textos aqui.">
        <div style={{ width: BOARD_W * zoom, height: BOARD_H * zoom, position: 'relative' }}>
          <div className="cad-board" ref={board} style={{ transform: `scale(${zoom})` }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) { setSel(null); setLinkFrom(null); } }}>
            <svg className="cad-links" width={BOARD_W} height={BOARD_H} aria-hidden="true">
              {links.map((l) => {
                const a = center(l.from), b = center(l.to);
                if (!a || !b) return null;
                const on = sel?.type === 'link' && sel.id === l.id;
                const d = `M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`;
                return (
                  <g key={l.id} onPointerDown={(e) => { e.stopPropagation(); setSel({ type: 'link', id: l.id }); }}>
                    <path d={d} className="cad-link-hit" />
                    <path d={d} className="cad-link" data-on={on || undefined} />
                  </g>
                );
              })}
            </svg>
            {items.map((it) => {
              const c = it.kind === 'text' ? color(it.color) : null;
              const on = sel?.type === 'item' && sel.id === it.id;
              return (
                <div key={it.id} data-id={it.id} className={`cad-item cad-${it.kind}`} data-selected={on || undefined} data-linking={linkFrom === it.id || undefined}
                  style={{ left: it.x, top: it.y, width: it.w, background: c?.bg, borderColor: c?.line }}
                  onPointerDown={() => clickItem(it.id)}>
                  <div className="cad-handle" onPointerDown={(e) => { if (linkMode) return; drag(e, it, 'move'); }} title="Arraste para mover" aria-label="Mover">⠿</div>
                  {it.kind === 'text'
                    ? <AutoText value={it.text} autoFocus={fresh === it.id} onChange={(v) => patchItem(it.id, { text: v })} />
                    : signed[it.path] ? <img src={signed[it.path]} alt="Imagem colada no caderno" draggable={false} style={{ aspectRatio: `${1 / it.ar}` }} />
                    : <div className="cad-imgload" style={{ aspectRatio: `${1 / it.ar}` }}>carregando…</div>}
                  {it.source ? <small className="cad-source">📖 {it.source}</small> : null}
                  <span className="cad-resize" onPointerDown={(e) => drag(e, it, 'size')} aria-label="Redimensionar" title="Arraste para mudar a largura" />
                </div>
              );
            })}
            {page && !items.length ? (
              <div className="cad-empty">
                <b>Folha em branco ✍️</b>
                <span>Toque em <b>+ Nota</b> para escrever, cole um print com <b>Ctrl+V</b> (no celular use <b>🖼 Imagem</b>) e use <b>🔗 Ligar ideias</b> para montar seu mapa mental.</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {page ? (
        <div className="cad-foot">
          <label className="field cad-rename">Nome da folha
            <input value={page.title} maxLength={120} placeholder="Nome da folha" onChange={(e) => { const t = e.target.value; setPages((ps) => ps.map((p) => (p.id === page.id ? { ...p, title: t } : p))); touch(page.id); }} />
          </label>
          <button type="button" className="btn btn-ghost btn-danger" onClick={() => void removePage()}>Apagar folha</button>
        </div>
      ) : null}
    </div>
  );
}
