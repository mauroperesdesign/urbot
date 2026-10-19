'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'tus-js-client';
import { createClient } from '@/lib/supabase/client';
import { deleteFile } from '../../actions';
import { LISTEN_TYPES, READ_TYPES, formatDuration } from '@/lib/labels';
import type { FileRole, FileRow, MaterialType } from '@/lib/types';

const LIMITS: Record<'cover' | 'main' | 'track' | 'supplementary', { mimes: string[]; maxMb: number; accept: string }> = {
  cover: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maxMb: 5, accept: 'image/jpeg,image/png,image/webp' },
  main: { mimes: ['application/pdf', 'application/epub+zip'], maxMb: 500, accept: '.pdf,.epub,application/pdf,application/epub+zip' },
  track: { mimes: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/m4a', 'audio/wav', 'audio/x-wav'], maxMb: 300, accept: 'audio/*,.m4a,.mp3' },
  supplementary: { mimes: ['application/pdf', 'text/plain', 'text/vtt'], maxMb: 100, accept: '.pdf,.txt,.vtt' },
};

interface Job { name: string; pct: number; status: 'fila' | 'enviando' | 'ok' | 'erro'; message?: string }

const safeName = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-120);
const mimeOf = (f: File) => f.type || (f.name.toLowerCase().endsWith('.m4a') ? 'audio/mp4' : f.name.toLowerCase().endsWith('.epub') ? 'application/epub+zip' : '');
const naturalSort = (a: File, b: File) => a.name.localeCompare(b.name, 'pt', { numeric: true });

async function sha256(file: File) {
  if (file.size > 300 * 1024 * 1024) return null; // evita travar o navegador em arquivos enormes
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pdfPages(file: File) {
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const n = doc.numPages;
    await doc.destroy();
    return n;
  } catch { return null; }
}

function audioDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => { resolve(isFinite(a.duration) ? Math.round(a.duration) : null); URL.revokeObjectURL(url); };
    a.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    a.src = url;
  });
}

export function FileManager({ materialId, materialType, files, coverUrl }: {
  materialId: string; materialType: MaterialType; files: FileRow[]; coverUrl: string | null;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const inputs = { cover: useRef<HTMLInputElement>(null), main: useRef<HTMLInputElement>(null), track: useRef<HTMLInputElement>(null), supplementary: useRef<HTMLInputElement>(null) };
  const update = (i: number, patch: Partial<Job>) => setJobs((js) => js.map((j, k) => (k === i ? { ...j, ...patch } : j)));

  async function send(role: 'cover' | 'main' | 'track' | 'supplementary', list: FileList | null) {
    if (!list?.length) return;
    const chosen = Array.from(list).sort(naturalSort);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { alert('Sessão expirada. Entre novamente.'); return; }
    const start = jobs.length;
    setJobs((js) => [...js, ...chosen.map((f) => ({ name: f.name, pct: 0, status: 'fila' as const }))]);
    setBusy(true);
    const existingTracks = files.filter((f) => f.role === 'track').length;
    let totalDuration = files.filter((f) => f.role === 'track').reduce((a, f) => a + (f.duration_seconds ?? 0), 0);

    for (const [k, file] of chosen.entries()) {
      const i = start + k;
      const limit = LIMITS[role];
      const mime = mimeOf(file);
      if (!limit.mimes.includes(mime)) { update(i, { status: 'erro', message: `Formato não aceito (${mime || 'desconhecido'})` }); continue; }
      if (file.size > limit.maxMb * 1024 * 1024) { update(i, { status: 'erro', message: `Maior que ${limit.maxMb} MB` }); continue; }

      update(i, { status: 'enviando', message: 'verificando…' });
      const hash = await sha256(file);
      if (hash && role !== 'cover') {
        const { data: dup } = await supabase.from('files').select('id, materials(title)').eq('sha256', hash).limit(1).maybeSingle();
        if (dup) {
          const t = (dup.materials as unknown as { title: string } | null)?.title;
          update(i, { status: 'erro', message: `Arquivo idêntico já existe em “${t}”` }); continue;
        }
      }
      const pages = role === 'main' && mime === 'application/pdf' ? await pdfPages(file) : null;
      const duration = role === 'track' ? await audioDuration(file) : null;

      const bucket = role === 'cover' ? 'covers' : 'materials';
      const path = `${materialId}/${role}/${Date.now()}-${safeName(file.name)}`;
      try {
        await new Promise<void>((resolve, reject) => {
          const up = new Upload(file, {
            endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: { authorization: `Bearer ${session.access_token}`, 'x-upsert': 'false' },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            chunkSize: 6 * 1024 * 1024,
            metadata: { bucketName: bucket, objectName: path, contentType: mime, cacheControl: '3600' },
            onError: reject,
            onProgress: (sent, total) => update(i, { pct: Math.round((sent / total) * 100), message: undefined }),
            onSuccess: () => resolve(),
          });
          // Retoma um envio interrompido do mesmo arquivo, se houver
          up.findPreviousUploads().then((prev) => { if (prev.length) up.resumeFromPreviousUpload(prev[0]); up.start(); });
        });
      } catch (e) {
        // Se o envio retomável falhar (ex.: proxy), tenta o envio comum antes de desistir
        update(i, { message: 'tentando envio simples…' });
        const { error: plain } = await supabase.storage.from(bucket).upload(path, file, { contentType: mime, upsert: false });
        if (plain) { update(i, { status: 'erro', message: (e instanceof Error ? e.message : plain.message).slice(0, 160) }); continue; }
      }

      if (role === 'cover') {
        const { error } = await supabase.from('materials').update({ cover_path: path }).eq('id', materialId);
        if (error) { update(i, { status: 'erro', message: error.message }); continue; }
      } else {
        const fileRole: FileRole = role;
        const { error } = await supabase.from('files').insert({
          material_id: materialId, role: fileRole, bucket, path, mime_type: mime, size_bytes: file.size, sha256: hash,
          original_name: file.name, title: role === 'track' ? file.name.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]*/, '').trim() || file.name : file.name,
          position: role === 'track' ? existingTracks + k : 0,
          duration_seconds: duration, page_count: pages, processing_status: 'ready',
        });
        if (error) { await supabase.storage.from(bucket).remove([path]); update(i, { status: 'erro', message: error.message }); continue; }
        if (pages) await supabase.from('materials').update({ page_count: pages }).eq('id', materialId);
        if (duration) { totalDuration += duration; await supabase.from('materials').update({ duration_seconds: totalDuration }).eq('id', materialId); }
      }
      update(i, { status: 'ok', pct: 100, message: pages ? `${pages} páginas` : duration ? formatDuration(duration) : undefined });
    }
    setBusy(false);
    Object.values(inputs).forEach((r) => { if (r.current) r.current.value = ''; });
    router.refresh();
  }

  const showMain = READ_TYPES.includes(materialType);
  const showTracks = LISTEN_TYPES.includes(materialType);
  const listed = files.filter((f) => f.role !== 'cover');

  const Picker = ({ role, label, multiple }: { role: keyof typeof LIMITS; label: string; multiple?: boolean }) => (
    <label className="btn" style={{ cursor: busy ? 'wait' : 'pointer' }}>
      {label}
      <input ref={inputs[role]} type="file" className="sr-only" accept={LIMITS[role].accept} multiple={multiple} disabled={busy}
        onChange={(e) => void send(role, e.target.files)} />
    </label>
  );

  return (
    <section className="card stack" style={{ padding: 20, ['--gap' as string]: '14px' }} aria-label="Capa e arquivos">
      <h2 style={{ fontSize: 26 }}>Capa e arquivos</h2>
      <div className="row" style={{ alignItems: 'flex-start', ['--gap' as string]: '16px' }}>
        <div style={{ width: 96, aspectRatio: '2 / 3', borderRadius: '4px 12px 12px 4px', background: 'var(--emerald)', overflow: 'hidden' }}>
          {coverUrl ? <img src={coverUrl} alt="Capa atual" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        </div>
        <div className="stack" style={{ flex: 1, minWidth: 220 }}>
          <div className="row">
            <Picker role="cover" label={coverUrl ? 'Trocar capa' : 'Enviar capa'} />
            {showMain ? <Picker role="main" label="Enviar PDF/EPUB principal" /> : null}
            {showTracks ? <Picker role="track" label="Enviar faixas de áudio" multiple /> : null}
            <Picker role="supplementary" label="Arquivo complementar" multiple />
          </div>
          <small className="muted">Envio retomável: se a conexão cair, escolha o mesmo arquivo de novo para continuar de onde parou. As faixas são ordenadas pelo nome do arquivo.</small>
        </div>
      </div>

      {jobs.length ? (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, ['--gap' as string]: '6px' }} aria-live="polite">
          {jobs.map((j, i) => (
            <li key={i} className="row" style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '8px 12px', flexWrap: 'nowrap' }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{j.name}</span>
              <span style={{ width: 120, height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${j.pct}%`, background: j.status === 'erro' ? 'var(--danger)' : 'var(--emerald)' }} /></span>
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 120, color: j.status === 'erro' ? 'var(--danger)' : 'var(--muted)' }}>
                {j.status === 'enviando' ? j.message ?? `${j.pct}%` : j.status === 'ok' ? `Pronto${j.message ? ' · ' + j.message : ''}` : j.status === 'erro' ? j.message : 'na fila'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {listed.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th scope="col">Arquivo</th><th scope="col">Papel</th><th scope="col">Detalhes</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{listed.map((f) => (
              <tr key={f.id}>
                <td style={{ fontWeight: 600 }}>{f.title || f.original_name}</td>
                <td>{f.role === 'main' ? 'Principal' : f.role === 'track' ? `Faixa ${f.position + 1}` : 'Complementar'}</td>
                <td className="muted">{f.duration_seconds ? formatDuration(f.duration_seconds) : ''}{f.size_bytes ? ` · ${(f.size_bytes / 1048576).toFixed(1)} MB` : ''}</td>
                <td style={{ color: !f.path ? 'var(--gold-ink)' : f.processing_status === 'failed' ? 'var(--danger)' : 'var(--emerald)', fontWeight: 700 }}>
                  {!f.path ? 'Aguardando envio' : f.processing_status === 'failed' ? `Falha: ${f.processing_error ?? ''}` : 'Enviado'}
                </td>
                <td>
                  <form action={deleteFile} onSubmit={(e) => { if (!confirm('Remover este arquivo?')) e.preventDefault(); }}>
                    <input type="hidden" name="id" value={f.id} />
                    <button className="btn btn-ghost btn-danger" type="submit" style={{ minHeight: 32 }}>Remover</button>
                  </form>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="muted" style={{ margin: 0 }}>Nenhum arquivo enviado ainda.</p>}
    </section>
  );
}
