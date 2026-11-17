// Transcreve os áudios que estão na fila: letras dos pontos cantados e notas de voz das anotações.
// Roda de minuto em minuto (cron, com trava para não sobrepor). Usa o Whisper no próprio servidor;
// se houver ANTHROPIC_API_KEY, a IA revisa a letra dos pontos (corrige nomes e organiza as estrofes).
// Uso: node scripts/transcrever.mjs            (processa a fila)
//      node scripts/transcrever.mjs --uma-vez  (no máximo 1 item de cada tipo — teste)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const run = promisify(execFile);
function loadEnv() {
  const f = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
const PY = process.env.WHISPER_PY || 'python3';
if (!url || !key) { console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const once = process.argv.includes('--uma-vez');
const stamp = () => new Date().toISOString();

// Áudio → WAV 16 kHz mono (até 15 min) → Whisper → trechos com tempo
async function transcribe(bucket, objectPath, music) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcricao-'));
  try {
    const { data, error } = await sb.storage.from(bucket).download(objectPath);
    if (error || !data) throw new Error(`não foi possível baixar o áudio (${error?.message ?? 'vazio'})`);
    const src = path.join(dir, 'audio');
    fs.writeFileSync(src, Buffer.from(await data.arrayBuffer()));
    const wav = path.join(dir, 'audio.wav');
    await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-t', '900', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], { timeout: 120_000 });
    const script = path.join(process.cwd(), 'scripts', 'whisper_json.py');
    const { stdout } = await run(PY, ['-I', script, wav, ...(music ? ['--musica'] : [])], { timeout: 30 * 60_000, maxBuffer: 20 * 1024 * 1024 });
    return JSON.parse(stdout.trim().split('\n').pop());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Letra em versos e estrofes: cada frase vira um verso; pausa de 1,2 s ou mais abre uma estrofe nova
export function formatLyrics(segments) {
  const stanzas = [];
  let current = [];
  let lastEnd = null;
  for (const s of segments) {
    if (lastEnd !== null && s.start - lastEnd >= 1.2 && current.length) { stanzas.push(current); current = []; }
    lastEnd = s.end;
    for (let line of s.text.split(/(?<=[.!?])\s+/)) {
      line = line.replace(/[.]+$/, '').trim();
      if (!line) continue;
      const parts = line.length > 60 ? line.split(/,\s+/).reduce((acc, p) => {
        if (acc.length && (acc[acc.length - 1] + ', ' + p).length <= 60) acc[acc.length - 1] += `, ${p}`; else acc.push(p);
        return acc;
      }, []) : [line];
      for (const p of parts) current.push(p.charAt(0).toUpperCase() + p.slice(1));
    }
  }
  if (current.length) stanzas.push(current);
  return stanzas.map((st) => st.join('\n')).join('\n\n');
}

// Revisão opcional com a IA (Claude): corrige nomes e saudações e organiza a letra, sem inventar versos
async function polishLyrics(title, draft) {
  if (!process.env.ANTHROPIC_API_KEY || !draft.trim()) return draft;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: process.env.ASSISTENTE_MODELO || 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: 'Você revisa letras de pontos cantados de Umbanda transcritas automaticamente de um áudio. '
        + 'Corrija apenas erros evidentes de reconhecimento de fala (nomes de Orixás, linhas de trabalho, saudações e palavras da religião, ortografia e pontuação). '
        + 'Organize em versos (um por linha) e estrofes (linha em branco entre elas), mantendo a ordem e as repetições do canto. '
        + 'Não invente versos nem complete trechos que não estão na transcrição; se algo estiver incompreensível, mantenha como está. '
        + 'Responda somente com a letra, sem título, comentários ou marcações.',
      messages: [{ role: 'user', content: `Ponto: ${title}\n\nTranscrição (estrofes separadas pelas pausas do áudio):\n\n${draft}` }],
    });
    if (res.stop_reason === 'refusal') return draft;
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    return text && text.length < draft.length * 3 ? text : draft;
  } catch (e) {
    console.error(`revisão pela IA falhou (${e?.status ?? ''} ${e?.message ?? e}); fica a transcrição direta`);
    return draft;
  }
}

async function claim(table, id) {
  const { data } = await sb.from(table).update({ transcript_status: 'processando', transcript_at: stamp() })
    .eq('id', id).eq('transcript_status', 'pendente').select('id');
  return !!data?.length;
}

// Itens presos em "processando" há mais de 45 min (servidor reiniciou no meio) voltam para a fila
const stale = new Date(Date.now() - 45 * 60_000).toISOString();
await sb.from('files').update({ transcript_status: 'pendente' }).eq('transcript_status', 'processando').lt('transcript_at', stale);
await sb.from('annotations').update({ transcript_status: 'pendente' }).eq('transcript_status', 'processando').lt('transcript_at', stale);

let done = 0, failed = 0;

// Notas de voz (curtas): até 20 por rodada
const { data: notes } = await sb.from('annotations').select('id, audio_path').eq('transcript_status', 'pendente').not('audio_path', 'is', null)
  .order('created_at').limit(once ? 1 : 20);
for (const n of notes ?? []) {
  if (!(await claim('annotations', n.id))) continue;
  try {
    const r = await transcribe('notes', n.audio_path, false);
    const text = r.segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
    await sb.from('annotations').update({ transcript: text || '(sem fala reconhecida)', transcript_status: 'pronto', transcript_at: stamp() }).eq('id', n.id);
    done++;
  } catch (e) {
    await sb.from('annotations').update({ transcript_status: 'erro', transcript_at: stamp() }).eq('id', n.id);
    console.error(`nota ${n.id}: ${String(e?.stderr || e?.message || e).slice(-300)}`); failed++;
  }
}

// Pontos cantados (mais longos): até 3 por rodada
const { data: tracks } = await sb.from('files').select('id, bucket, path, material_id, materials(title, description)')
  .eq('transcript_status', 'pendente').not('path', 'is', null).order('created_at').limit(once ? 1 : 3);
for (const t of tracks ?? []) {
  if (!(await claim('files', t.id))) continue;
  try {
    const r = await transcribe(t.bucket || 'materials', t.path, true);
    const draft = formatLyrics(r.segments);
    const lyrics = (await polishLyrics(t.materials?.title ?? '', draft)).slice(0, 20000);
    await sb.from('files').update({ transcript: lyrics, transcript_status: 'pronto', transcript_error: null, transcript_at: stamp() }).eq('id', t.id);
    // A letra vai para a página do ponto, se ainda não tiver uma escrita pela equipe
    if (lyrics && !t.materials?.description?.trim()) await sb.from('materials').update({ description: lyrics }).eq('id', t.material_id);
    done++;
  } catch (e) {
    const msg = String(e?.stderr || e?.message || e).slice(-500);
    await sb.from('files').update({ transcript_status: 'erro', transcript_error: msg, transcript_at: stamp() }).eq('id', t.id);
    console.error(`faixa ${t.id}: ${msg}`); failed++;
  }
}

if (done || failed) console.log(`${stamp()} transcritos: ${done}, falhas: ${failed}`);
