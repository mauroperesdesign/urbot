'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { spotifyRef, youtubeId } from '@/lib/media-links';
import { createPonto, publishPonto } from './actions';

type Group = { label: string; options: { id: string; name: string }[] };
type Source = 'file' | 'youtube' | 'spotify';

async function sha256(file: File) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
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

// Cadastro rápido de ponto cantado: arquivo de áudio, link do YouTube (o servidor baixa o MP3) ou link do Spotify (player oficial)
export function PontoForm({ groups, entities = [] }: { groups: Group[]; entities?: string[] }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [source, setSource] = useState<Source>('youtube');
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ slug: string; title: string; published: boolean } | null>(null);
  const busy = !!step;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(''); setDone(null);
    const fd = new FormData(e.currentTarget);
    fd.set('source', source);
    const url = String(fd.get('url') ?? '');
    const file = fd.get('file') as File | null;
    if (source === 'youtube' && !youtubeId(url)) return setError('Cole um link de vídeo do YouTube (youtube.com/watch?v=… ou youtu.be/…).');
    if (source === 'spotify' && !spotifyRef(url)) return setError('Cole o link de compartilhar do Spotify (open.spotify.com/track/…).');
    if (source === 'file' && (!file || !file.size)) return setError('Escolha o arquivo de áudio.');
    if (source === 'file' && file && file.size > 200 * 1024 * 1024) return setError('Arquivo grande demais (máximo de 200 MB).');

    setStep('Criando o ponto…');
    const res = await createPonto(fd);
    if (res.error || !res.id) { setStep(''); return setError(res.error ?? 'Erro ao criar.'); }
    const title = String(fd.get('title'));

    if (source === 'youtube') {
      setStep('Baixando o áudio do YouTube… (pode levar até 1 minuto)');
      const r = await fetch('/api/admin/pontos/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materialId: res.id, url, title }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setStep(''); setError(`${j.error ?? 'Falha ao baixar.'} O ponto ficou salvo como rascunho: dá para enviar o áudio depois em “Editar”.`); router.refresh(); return; }
    } else if (source === 'file' && file) {
      setStep('Enviando o áudio…');
      const supabase = createClient();
      const hash = await sha256(file);
      const { data: dup } = await supabase.from('files').select('id').eq('sha256', hash).limit(1).maybeSingle();
      if (dup) { setStep(''); setError('Este áudio já está na biblioteca. O ponto ficou como rascunho.'); router.refresh(); return; }
      const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `pontos/${res.id}/${Date.now().toString(36)}.${ext}`;
      const { error: up } = await supabase.storage.from('materials').upload(path, file, { contentType: file.type || 'audio/mpeg' });
      if (up) { setStep(''); setError('Não foi possível enviar o arquivo. O ponto ficou como rascunho.'); router.refresh(); return; }
      const duration = await audioDuration(file);
      await supabase.from('files').insert({ material_id: res.id, role: 'track', bucket: 'materials', path, mime_type: file.type || 'audio/mpeg',
        size_bytes: file.size, sha256: hash, title, position: 0, duration_seconds: duration, processing_status: 'ready', original_name: file.name });
      if (duration) await supabase.from('materials').update({ duration_seconds: duration }).eq('id', res.id);
    }

    let published = false;
    if (fd.get('publish') === 'on') { setStep('Publicando…'); published = !(await publishPonto(res.id)).error; }
    setStep('');
    setDone({ slug: res.slug!, title, published });
    form.current?.reset();
    router.refresh();
  }

  return (
    <form ref={form} onSubmit={submit} className="stack ponto-form" style={{ ['--gap' as string]: '14px' }}>
      <div className="sug-grid">
        <label className="field">Nome do ponto *<input name="title" required minLength={2} maxLength={300} placeholder="Ex.: Ogum, beira-mar" /></label>
        <label className="field">Entidade (opcional)<small>Quem é cantado no ponto — guia, Orixá ou falange</small>
          <input name="entity" maxLength={200} list="entidades" placeholder="Ex.: Pai Joaquim de Angola, Caboclo Sete Flechas" />
          <datalist id="entidades">{entities.map((e) => <option key={e} value={e} />)}</datalist>
        </label>
        <label className="field">Para quem é o ponto *
          <select name="category" required defaultValue="">
            <option value="" disabled>Escolha o Orixá ou a linha</option>
            {groups.map((g) => <optgroup key={g.label} label={g.label}>{g.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>)}
          </select>
        </label>
      </div>

      <fieldset className="ponto-source">
        <legend>De onde vem o áudio?</legend>
        <div className="chips" role="radiogroup">
          {([['youtube', '▶ Link do YouTube'], ['file', '🎵 Enviar arquivo'], ['spotify', '🟢 Link do Spotify']] as [Source, string][]).map(([k, label]) => (
            <label key={k} className="chip" aria-current={source === k ? 'true' : undefined}>
              <input type="radio" name="src" value={k} checked={source === k} onChange={() => setSource(k)} className="sr-only" />{label}
            </label>
          ))}
        </div>
        {source === 'file' ? (
          <label className="field">Arquivo de áudio (MP3, M4A, WAV…)<input name="file" type="file" accept="audio/*" required /></label>
        ) : (
          <label className="field">{source === 'youtube' ? 'Link do vídeo no YouTube' : 'Link da música no Spotify'}
            <input name="url" type="text" inputMode="url" autoCapitalize="off" required
              placeholder={source === 'youtube' ? 'https://www.youtube.com/watch?v=…' : 'https://open.spotify.com/track/…'} />
          </label>
        )}
        <small className="muted">
          {source === 'youtube' ? 'O servidor baixa só o áudio, converte para MP3 e guarda no acervo da biblioteca (máx. 1 hora de duração).'
            : source === 'spotify' ? 'O Spotify não permite baixar as músicas: o ponto fica com o player oficial do Spotify na página. Quem não tem conta Spotify ouve só um trecho de 30 segundos.'
            : 'O arquivo vai direto para o acervo da biblioteca.'}
        </small>
      </fieldset>

      <label className="field">Letra do ponto (opcional)<textarea name="lyrics" rows={4} maxLength={8000} placeholder={'Deixe em branco para o site transcrever o áudio sozinho\n(em versos e estrofes) em alguns minutos.'} /></label>
      <label className="field">Intérprete / autoria (opcional)<input name="rights_holder" maxLength={300} placeholder="Ex.: Curimba do terreiro, domínio público" /></label>

      {source !== 'spotify' ? (
        <label className="ponto-check">
          <input type="checkbox" name="authorized" required />
          <span>Confirmo que a biblioteca pode guardar este áudio: é gravação do próprio terreiro, de domínio público ou temos autorização de quem gravou.</span>
        </label>
      ) : null}
      <label className="ponto-check"><input type="checkbox" name="publish" defaultChecked /><span>Publicar assim que o áudio estiver pronto</span></label>

      {error ? <p className="alert alert-error" role="alert" style={{ margin: 0 }}>{error}</p> : null}
      {step ? <p className="alert" role="status" style={{ margin: 0 }}>⏳ {step}</p> : null}
      {done ? (
        <p className="alert alert-ok" role="status" style={{ margin: 0 }}>
          ✔ “{done.title}” {done.published ? 'publicado' : 'salvo como rascunho'}. <Link href={`/material/${done.slug}`} style={{ fontWeight: 700 }}>Ver o ponto</Link>
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Aguarde…' : 'Adicionar ponto'}</button>
    </form>
  );
}
