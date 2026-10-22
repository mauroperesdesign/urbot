// Gera miniaturas leves (320 px, WebP) das capas que ainda não têm uma.
// Idempotente: rodar de novo só cria as que faltam. Uso:
//   node scripts/gerar-miniaturas.mjs            (lê .env.local ou as variáveis do ambiente)
//   node scripts/gerar-miniaturas.mjs --todas    (refaz todas)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const f = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const all = process.argv.includes('--todas');
const sb = createClient(url, key, { auth: { persistSession: false } });
const thumbPath = (p) => `thumbs/${p}.webp`;

const { data: mats, error } = await sb.from('materials').select('id, cover_path').not('cover_path', 'is', null);
if (error) { console.error(error.message); process.exit(1); }

// Miniaturas que já existem, por pasta
const existing = new Set();
for (const dir of new Set(mats.map((m) => path.posix.dirname(thumbPath(m.cover_path))))) {
  for (let offset = 0; ; offset += 1000) {
    const { data } = await sb.storage.from('covers').list(dir, { limit: 1000, offset });
    (data ?? []).forEach((o) => existing.add(`${dir}/${o.name}`));
    if (!data || data.length < 1000) break;
  }
}

let made = 0, skipped = 0, failed = 0;
for (const m of mats) {
  const target = thumbPath(m.cover_path);
  if (!all && existing.has(target)) { skipped++; continue; }
  const { data: blob, error: dlErr } = await sb.storage.from('covers').download(m.cover_path);
  if (dlErr || !blob) { failed++; console.warn(`  sem capa: ${m.cover_path}`); continue; }
  try {
    const out = await sharp(Buffer.from(await blob.arrayBuffer())).rotate().resize({ width: 320, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
    const { error: upErr } = await sb.storage.from('covers').upload(target, out, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
    if (upErr) throw upErr;
    made++;
  } catch (e) { failed++; console.warn(`  falhou ${m.cover_path}: ${e.message ?? e}`); }
}
console.log(`Miniaturas: ${made} criadas, ${skipped} já existiam, ${failed} com problema.`);
