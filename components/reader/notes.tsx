'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './reader.module.css';

export type Bookmark = { id: string; location: string; label: string | null; created_at: string };
export type Note = { id: string; location: string; quote: string | null; note: string | null; created_at: string };

// Marcadores e anotações do leitor: privados de cada pessoa (RLS por user_id)
export function useReaderNotes(materialId: string, enabled: boolean) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!enabled) return;
    const supabase = createClient();
    const [b, n] = await Promise.all([
      supabase.from('bookmarks').select('id, location, label, created_at').eq('material_id', materialId).order('created_at'),
      supabase.from('annotations').select('id, location, quote, note, created_at').eq('material_id', materialId).order('created_at'),
    ]);
    if (b.data) setBookmarks(b.data as Bookmark[]);
    if (n.data) setNotes(n.data as Note[]);
  }, [materialId, enabled]);
  useEffect(() => { void load(); }, [load]);

  async function userId() {
    const { data: { user } } = await createClient().auth.getUser();
    return user?.id ?? null;
  }

  async function toggleBookmark(location: string, label: string) {
    setError('');
    const supabase = createClient();
    const found = bookmarks.find((b) => b.location === location);
    if (found) {
      const { error: e } = await supabase.from('bookmarks').delete().eq('id', found.id);
      if (e) return setError('Não foi possível remover o marcador.');
      return setBookmarks((list) => list.filter((b) => b.id !== found.id));
    }
    const uid = await userId();
    if (!uid) return setError('Entre na sua conta para salvar marcadores.');
    const { data, error: e } = await supabase.from('bookmarks')
      .insert({ user_id: uid, material_id: materialId, location, label }).select('id, location, label, created_at').single();
    if (e || !data) return setError('Não foi possível salvar o marcador (sem conexão?).');
    setBookmarks((list) => [...list, data as Bookmark]);
  }

  async function addNote(location: string, note: string, quote: string) {
    setError('');
    const uid = await userId();
    if (!uid) { setError('Entre na sua conta para salvar anotações.'); return false; }
    const { data, error: e } = await createClient().from('annotations')
      .insert({ user_id: uid, material_id: materialId, location, note: note.trim() || null, quote: quote.trim().slice(0, 2000) || null })
      .select('id, location, quote, note, created_at').single();
    if (e || !data) { setError('Não foi possível salvar a anotação (sem conexão?).'); return false; }
    setNotes((list) => [...list, data as Note]);
    return true;
  }

  async function removeNote(id: string) {
    const { error: e } = await createClient().from('annotations').delete().eq('id', id);
    if (!e) setNotes((list) => list.filter((n) => n.id !== id));
  }

  return { bookmarks, notes, error, toggleBookmark, addNote, removeNote, isMarked: (loc: string) => bookmarks.some((b) => b.location === loc) };
}

export function NotesPanel({ api, location, describe, onGo, initialQuote, canSave }: {
  api: ReturnType<typeof useReaderNotes>; location: string; describe: (loc: string) => string;
  onGo: (loc: string) => void; initialQuote: string; canSave: boolean;
}) {
  const [text, setText] = useState('');
  const [quote, setQuote] = useState(initialQuote);
  const [saving, setSaving] = useState(false);
  useEffect(() => setQuote(initialQuote), [initialQuote]);

  if (!canSave) return <p className={styles.note}>Entre na sua conta para criar marcadores e anotações. Eles ficam guardados só para você.</p>;
  return (
    <div className={styles.notes}>
      <form className={styles.noteForm} onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() && !quote.trim()) return;
        setSaving(true);
        if (await api.addNote(location, text, quote)) { setText(''); setQuote(''); }
        setSaving(false);
      }}>
        <b>Nova anotação · {describe(location)}</b>
        {quote ? <blockquote>{quote}<button type="button" onClick={() => setQuote('')} aria-label="Remover trecho">×</button></blockquote>
          : <small>Dica: selecione um trecho do texto antes de abrir as notas para citá-lo.</small>}
        <label htmlFor="nota" className="sr-only">Anotação</label>
        <textarea id="nota" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Escreva sua anotação…" maxLength={4000} />
        <button type="submit" className={styles.tb} disabled={saving || (!text.trim() && !quote.trim())}>{saving ? 'Salvando…' : 'Salvar anotação'}</button>
      </form>
      {api.error ? <p className={styles.note} role="alert">{api.error}</p> : null}

      <h3>Marcadores</h3>
      {api.bookmarks.length ? (
        <ol>{api.bookmarks.map((b) => (
          <li key={b.id}><button type="button" onClick={() => onGo(b.location)}>{b.label || describe(b.location)}</button></li>
        ))}</ol>
      ) : <p className={styles.note}>Use o botão de marcador na barra para marcar onde quiser voltar.</p>}

      <h3>Anotações</h3>
      {api.notes.length ? (
        <ol>{api.notes.map((n) => (
          <li key={n.id} className={styles.noteItem}>
            <button type="button" onClick={() => onGo(n.location)}>
              <small>{describe(n.location)}</small>
              {n.quote ? <q>{n.quote}</q> : null}
              {n.note ? <span>{n.note}</span> : null}
            </button>
            <button type="button" className={styles.del} onClick={() => { if (confirm('Apagar esta anotação?')) void api.removeNote(n.id); }} aria-label="Apagar anotação">Apagar</button>
          </li>
        ))}</ol>
      ) : <p className={styles.note}>Nenhuma anotação ainda.</p>}
    </div>
  );
}
