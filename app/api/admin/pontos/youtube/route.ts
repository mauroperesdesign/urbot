import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getSession, isStaff } from '@/lib/data';
import { youtubeId, youtubeUrl } from '@/lib/media-links';

export const dynamic = 'force-dynamic';

const BIN = process.env.YTDLP_BIN || 'yt-dlp';
const MAX_MB = 80;

function run(args: string[]) {
  return new Promise<{ out: string; err: string }>((resolve, reject) => {
    execFile(BIN, args, { timeout: 5 * 60_000, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stderr: String(stderr) }));
      else resolve({ out: String(stdout), err: String(stderr) });
    });
  });
}

function explain(e: unknown) {
  const err = e as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };
  const text = `${err.stderr ?? ''} ${err.message ?? ''}`;
  if (err.code === 'ENOENT') return 'O baixador do YouTube não está instalado no servidor. Rode o atualizador (atualizar.sh) e tente de novo.';
  if (err.killed) return 'O download demorou demais e foi cancelado. Tente de novo ou envie o arquivo de áudio.';
  if (/Sign in to confirm|bot/i.test(text)) return 'O YouTube bloqueou o download a partir do servidor. Baixe o áudio no seu computador e use “Enviar arquivo”.';
  if (/Private video|private/i.test(text)) return 'Este vídeo é privado.';
  if (/unavailable|not available|removed/i.test(text)) return 'Este vídeo não está disponível.';
  if (/max-filesize|larger than/i.test(text)) return `O áudio passa de ${MAX_MB} MB.`;
  if (/does not pass filter|duration/i.test(text)) return 'O vídeo é longo demais (máximo de 1 hora).';
  return 'Não foi possível baixar o áudio deste link. Confira o link ou envie o arquivo de áudio.';
}

// Baixa o áudio (MP3) de um vídeo do YouTube e guarda no armazenamento do site, como faixa do ponto
export async function POST(req: Request) {
  const { supabase, profile } = await getSession();
  if (!isStaff(profile)) return NextResponse.json({ error: 'Só a equipe pode importar áudios.' }, { status: 403 });

  const body = await req.json().catch(() => null) as { materialId?: string; url?: string; title?: string } | null;
  const id = youtubeId(body?.url ?? '');
  if (!body?.materialId || !id) return NextResponse.json({ error: 'Link do YouTube inválido.' }, { status: 400 });
  const { data: material } = await supabase.from('materials').select('id, title').eq('id', body.materialId).maybeSingle();
  if (!material) return NextResponse.json({ error: 'Ponto não encontrado.' }, { status: 404 });

  const dir = await mkdtemp(path.join(tmpdir(), 'ponto-'));
  try {
    const { out } = await run([
      '--no-playlist', '--no-progress', '--no-warnings', '-x', '--audio-format', 'mp3', '--audio-quality', '5',
      '--max-filesize', `${MAX_MB}M`, '--match-filter', 'duration <= 3600', '--print-json',
      '-o', path.join(dir, 'audio.%(ext)s'), youtubeUrl(id),
    ]);
    const info = JSON.parse(out.trim().split('\n').filter(Boolean).pop() ?? '{}') as { duration?: number; title?: string };
    const file = (await readdir(dir)).find((f) => f.endsWith('.mp3'));
    if (!file) throw new Error('arquivo mp3 não gerado');
    const bytes = await readFile(path.join(dir, file));
    const sha = createHash('sha256').update(bytes).digest('hex');

    const { data: dup } = await supabase.from('files').select('id, materials(title)').eq('sha256', sha).limit(1).maybeSingle();
    if (dup) {
      const t = (dup.materials as unknown as { title: string } | null)?.title;
      return NextResponse.json({ error: `Este áudio já está na biblioteca${t ? ` (em “${t}”)` : ''}.` }, { status: 409 });
    }

    const storagePath = `pontos/${material.id}/${Date.now().toString(36)}-${id}.mp3`;
    const { error: upErr } = await supabase.storage.from('materials').upload(storagePath, bytes, { contentType: 'audio/mpeg', upsert: false });
    if (upErr) throw new Error(`envio: ${upErr.message}`);
    const duration = info.duration ? Math.round(info.duration) : null;
    const { count } = await supabase.from('files').select('id', { count: 'exact', head: true }).eq('material_id', material.id).eq('role', 'track');
    const { error: insErr } = await supabase.from('files').insert({
      material_id: material.id, role: 'track', bucket: 'materials', path: storagePath, mime_type: 'audio/mpeg',
      size_bytes: bytes.length, sha256: sha, title: body.title?.trim() || material.title, position: count ?? 0,
      duration_seconds: duration, processing_status: 'ready', original_name: `${info.title ?? id}.mp3`,
    });
    if (insErr) { await supabase.storage.from('materials').remove([storagePath]); throw new Error(`registro: ${insErr.message}`); }
    if (duration) await supabase.from('materials').update({ duration_seconds: duration, original_source: youtubeUrl(id) }).eq('id', material.id);
    return NextResponse.json({ ok: true, duration, size: bytes.length });
  } catch (e) {
    console.error('youtube:', (e as { stderr?: string }).stderr?.slice(-500) || e);
    return NextResponse.json({ error: explain(e) }, { status: 502 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
