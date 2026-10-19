#!/usr/bin/env node
// Importa o catálogo (data/*.csv) para o Supabase.
//
// Uso:
//   node scripts/import-acervo.mjs --simular            # mostra o que faria, sem gravar
//   node scripts/import-acervo.mjs                      # grava metadados, categorias, autores, faixas e capas
//   node scripts/import-acervo.mjs --enviar-arquivos    # também baixa PDFs/áudios do Drive e envia ao Storage
//   node scripts/import-acervo.mjs --publicar           # publica os materiais importados (uso interno autorizado)
//   --somente=telegram:1622,drive:<pasta>               # limita a alguns materiais (útil para testar)
//
// Requer em .env.local: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (chave de serviço —
// use só na sua máquina; nunca no navegador). É idempotente: reexecutar atualiza em vez de duplicar.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const DRY = args.has('--simular');
const UPLOAD = args.has('--enviar-arquivos');
const PUBLISH = args.has('--publicar');
const ONLY = (process.argv.find((a) => a.startsWith('--somente=')) ?? '').split('=')[1]?.split(',').filter(Boolean) ?? [];

// ------------------------------------------------------------------ util
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^﻿/, ''), r[i] ?? ''])));
}

const slugify = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const TYPE = { Livro: 'book', Apostila: 'handout', Artigo: 'article', Pesquisa: 'research', 'Glossário': 'glossary', PDF: 'pdf', Curso: 'course', Audiobook: 'audiobook' };
const GENERIC_AUTHORS = new Set(['', 'Autor desconhecido']);

// Duração de M4A/MP4 lida do átomo mvhd (sem ffmpeg)
function mp4Duration(buf) {
  const i = buf.indexOf(Buffer.from('mvhd'));
  if (i < 4) return null;
  const v = buf[i + 4];
  const ts = v === 1 ? buf.readUInt32BE(i + 24) : buf.readUInt32BE(i + 16);
  const du = v === 1 ? Number(buf.readBigUInt64BE(i + 28)) : buf.readUInt32BE(i + 20);
  return ts ? Math.round(du / ts) : null;
}

async function pdfPageCount(buf) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true }).promise;
    const n = doc.numPages;
    await doc.destroy();
    return n;
  } catch { return null; }
}

async function driveDownload(id) {
  const res = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
  if (!res.ok) throw new Error(`Drive respondeu ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 15).toString().includes('<!DOCTYPE')) throw new Error('Drive devolveu uma página HTML (arquivo não compartilhado por link?)');
  return buf;
}

// ------------------------------------------------------------------ principal
loadEnv();
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!URL_ || !KEY)) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local (ou use --simular).');
  process.exit(1);
}

const pdfRows = parseCsv(fs.readFileSync(path.join(ROOT, 'data/acervo-telegram.csv'), 'utf8'));
const bookRows = parseCsv(fs.readFileSync(path.join(ROOT, 'data/audiobooks-drive.csv'), 'utf8'));
const trackRows = parseCsv(fs.readFileSync(path.join(ROOT, 'data/audiobooks-faixas.csv'), 'utf8'));

const items = [
  ...pdfRows.map((r) => {
    const fileAuthor = GENERIC_AUTHORS.has(r.autor) ? '' : r.autor;
    const coverAuthor = r.autor_lido_na_capa || '';
    const review = [r.observacoes, r.revisao_capa, !fileAuthor && coverAuthor ? `Autor lido na capa (${coverAuthor}) — confirmar` : '']
      .filter((x) => x && !/^Autor a confirmar$/.test(x)).join(' · ');
    return {
      legacy: `telegram:${r.telegram_id}`, title: r.titulo, type: TYPE[r.tipo] ?? 'pdf', language: r.idioma || 'pt',
      category: r.categoria, sub: r.subcategoria, tradition: r.tradicao_perspectiva || null,
      authors: fileAuthor ? fileAuthor.split(/\s+e\s+/) : coverAuthor ? coverAuthor.split(/\s+e\s+/) : [],
      review, cover: r.capa ? path.join(ROOT, r.capa) : null, coverKey: r.telegram_id,
      files: [{ role: 'main', name: r.arquivo, drive_id: r.drive_id || null, size: Math.round(Number(r.tamanho_mb) * 1048576), mime: 'application/pdf', title: r.arquivo, position: 0 }],
    };
  }),
  ...bookRows.map((b) => {
    const folder = b.drive_pasta.split('/').pop();
    const tracks = trackRows.filter((t) => t.audiobook === b.titulo).sort((x, y) => Number(x.ordem) - Number(y.ordem));
    const samePdf = b.titulo === 'Zé do Laço' ? pdfRows.find((p) => p.telegram_id === '1733') : null;
    return {
      legacy: `drive:${folder}`, title: b.titulo, type: 'audiobook', language: b.idioma || 'pt',
      category: b.categoria, sub: b.subcategoria, tradition: b.tradicao_perspectiva || null,
      authors: b.autor ? [b.autor] : [], review: [b.observacoes, b.ordem_faixas.includes('revisar') ? 'Revisar a ordem das faixas' : ''].filter(Boolean).join(' · '),
      cover: samePdf?.capa ? path.join(ROOT, samePdf.capa) : null, coverKey: samePdf ? samePdf.telegram_id : null,
      files: tracks.map((t, i) => ({ role: 'track', name: t.arquivo, drive_id: t.drive_id, size: Math.round(Number(t.tamanho_mb) * 1048576), mime: 'audio/mp4', title: t.faixa, position: i })),
    };
  }),
];

console.log(`Catálogo: ${pdfRows.length} PDFs, ${bookRows.length} audiobooks (${trackRows.length} faixas).`);
if (DRY) {
  const byCat = {};
  for (const it of items) byCat[`${it.category} › ${it.sub}`] = (byCat[`${it.category} › ${it.sub}`] ?? 0) + 1;
  console.table(byCat);
  console.log(`Capas: ${items.filter((i) => i.cover && fs.existsSync(i.cover)).length} · arquivos: ${items.reduce((a, i) => a + i.files.length, 0)} · com autor: ${items.filter((i) => i.authors.length).length}`);
  console.log('Simulação concluída — nada foi gravado.');
  process.exit(0);
}

const { createClient } = await import('@supabase/supabase-js');
const db = createClient(URL_, KEY, { auth: { persistSession: false } });
const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };

const cats = must(await db.from('categories').select('id, name, parent_id'), 'categorias');
const catId = (parentName, subName) => {
  const parent = cats.find((c) => !c.parent_id && c.name === parentName);
  const sub = parent && cats.find((c) => c.parent_id === parent.id && c.name === subName);
  return { parent: parent?.id ?? null, sub: sub?.id ?? null };
};
const authorIds = new Map();
async function authorId(name) {
  const slug = slugify(name);
  if (authorIds.has(slug)) return authorIds.get(slug);
  const row = must(await db.from('authors').upsert({ name, slug }, { onConflict: 'slug' }).select('id').single(), `autor ${name}`);
  authorIds.set(slug, row.id);
  return row.id;
}
const coverPaths = new Map();

const report = { criados: 0, atualizados: 0, capas: 0, arquivosEnviados: 0, falhas: [] };
for (const it of items) {
  if (ONLY.length && !ONLY.includes(it.legacy)) continue;
  try {
    const existing = must(await db.from('materials').select('id, slug').eq('legacy_ref', it.legacy).maybeSingle(), 'busca');
    let slug = existing?.slug;
    if (!slug) {
      const base = slugify(it.title) || 'material';
      slug = base;
      for (let n = 2; ; n++) {
        const taken = must(await db.from('materials').select('id').eq('slug', slug).maybeSingle(), 'slug');
        if (!taken) break;
        slug = `${base}-${n}`;
      }
    }
    const record = {
      slug, title: it.title, type: it.type, language: it.language, tradition: it.tradition, legacy_ref: it.legacy,
      visibility: 'restricted', license: 'Uso interno do terreiro', publication_authorized: true,
      access_conditions: 'Material de uso interno, disponível para membros autorizados.', allow_download: false,
      ...(PUBLISH ? { status: 'published' } : existing ? {} : { status: 'draft' }),
    };
    const mat = existing
      ? must(await db.from('materials').update(record).eq('id', existing.id).select('id').single(), 'atualizar')
      : must(await db.from('materials').insert(record).select('id').single(), 'criar');
    existing ? report.atualizados++ : report.criados++;

    // categorias (subcategoria + categoria-mãe)
    const { parent, sub } = catId(it.category, it.sub);
    if (!parent) report.falhas.push(`${it.title}: categoria “${it.category}” não existe`);
    must(await db.from('material_categories').delete().eq('material_id', mat.id), 'limpar categorias');
    const links = [parent, sub].filter(Boolean).map((category_id) => ({ material_id: mat.id, category_id }));
    if (links.length) must(await db.from('material_categories').insert(links), 'categorias');

    // autores
    must(await db.from('material_authors').delete().eq('material_id', mat.id), 'limpar autores');
    for (const [position, name] of it.authors.entries()) {
      must(await db.from('material_authors').insert({ material_id: mat.id, author_id: await authorId(name.trim()), position }), 'autor');
    }
    if (it.review) must(await db.from('material_internal').upsert({ material_id: mat.id, review_notes: it.review }), 'revisão');

    // capa
    if (it.cover && fs.existsSync(it.cover)) {
      const key = `legacy/${it.coverKey}.jpg`;
      if (!coverPaths.has(key)) {
        must(await db.storage.from('covers').upload(key, fs.readFileSync(it.cover), { contentType: 'image/jpeg', upsert: true }), 'capa');
        coverPaths.set(key, true);
      }
      must(await db.from('materials').update({ cover_path: key }).eq('id', mat.id), 'capa');
      report.capas++;
    }

    // arquivos
    const current = must(await db.from('files').select('id, drive_id, path').eq('material_id', mat.id), 'arquivos');
    for (const f of it.files) {
      if (!f.drive_id) {
        must(await db.from('material_internal').upsert({ material_id: mat.id, review_notes: [it.review, 'Arquivo não encontrado no Drive — enviar pelo painel'].filter(Boolean).join(' · ') }), 'revisão');
        report.semArquivo = (report.semArquivo ?? 0) + 1;
        continue;
      }
      let row = current.find((c) => c.drive_id && c.drive_id === f.drive_id);
      if (!row) {
        row = must(await db.from('files').insert({
          material_id: mat.id, role: f.role, bucket: 'materials', drive_id: f.drive_id, original_name: f.name,
          title: f.title, position: f.position, mime_type: f.mime, size_bytes: f.size || null, processing_status: 'pending',
        }).select('id, drive_id, path').single(), 'registrar arquivo');
      } else {
        must(await db.from('files').update({ title: f.title, position: f.position }).eq('id', row.id), 'atualizar arquivo');
      }
      if (UPLOAD && !row.path && f.drive_id) {
        try {
          const buf = await driveDownload(f.drive_id);
          const key = `${mat.id}/${f.role}/${f.position.toString().padStart(3, '0')}-${slugify(f.name.replace(/\.[^.]+$/, ''))}${path.extname(f.name).toLowerCase()}`;
          must(await db.storage.from('materials').upload(key, buf, { contentType: f.mime, upsert: true }), 'upload');
          const sha = crypto.createHash('sha256').update(buf).digest('hex');
          const extra = f.role === 'track' ? { duration_seconds: mp4Duration(buf) } : { page_count: await pdfPageCount(buf) };
          must(await db.from('files').update({ path: key, size_bytes: buf.length, sha256: sha, processing_status: 'ready', processing_error: null, ...extra }).eq('id', row.id), 'marcar enviado');
          if (extra.page_count) must(await db.from('materials').update({ page_count: extra.page_count }).eq('id', mat.id), 'páginas');
          report.arquivosEnviados++;
          process.stdout.write('.');
        } catch (e) {
          await db.from('files').update({ processing_status: 'failed', processing_error: String(e.message).slice(0, 300) }).eq('id', row.id);
          report.falhas.push(`${it.title} / ${f.name}: ${e.message}`);
        }
      }
    }
    if (UPLOAD && it.type === 'audiobook') {
      const durs = must(await db.from('files').select('duration_seconds').eq('material_id', mat.id).eq('role', 'track'), 'durações');
      const total = durs.reduce((a, d) => a + (d.duration_seconds ?? 0), 0);
      if (total) must(await db.from('materials').update({ duration_seconds: total }).eq('id', mat.id), 'duração');
    }
  } catch (e) {
    report.falhas.push(`${it.title}: ${e.message}`);
  }
}

console.log('\nResultado:', { ...report, falhas: report.falhas.length });
if (report.falhas.length) { console.log('Falhas:'); report.falhas.forEach((f) => console.log(' -', f)); process.exitCode = 1; }
