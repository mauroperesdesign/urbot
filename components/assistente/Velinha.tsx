'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Card = { slug: string; title: string; type: string; coverUrl: string | null };
type Msg = { role: 'user' | 'assistant'; content: string; materials?: Card[] };

const KEY = 'velinha-conversa';
const HELLO: Msg = { role: 'assistant', content: 'Oi! Eu sou a Velinha 🕯️ Me conta o que você quer estudar hoje que eu procuro o material ideal no acervo pra você.' };
const IDEAS = ['Quero começar a estudar Umbanda', 'Um audiobook para ouvir no caminho', 'Algo sobre Pretos Velhos', 'Tenho só 15 minutos hoje'];

// Texto da Velinha: links do acervo viram links do site; **negrito** e quebras de linha
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(\/material\/[a-z0-9-]+\)|\*\*[^*]+\*\*|\n)/g);
  return (
    <>
      {parts.map((p, i) => {
        const link = p.match(/^\[([^\]]+)\]\((\/material\/[a-z0-9-]+)\)$/);
        if (link) return <Link key={i} href={link[2]}>{link[1]}</Link>;
        if (/^\*\*[^*]+\*\*$/.test(p)) return <b key={i}>{p.slice(2, -2)}</b>;
        if (p === '\n') return <br key={i} />;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

// Assistente flutuante (canto inferior direito) que sugere materiais do acervo
export function Velinha() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([HELLO]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { const saved = sessionStorage.getItem(KEY); if (saved) setMsgs(JSON.parse(saved)); } catch { /* sem armazenamento */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch { /* sem armazenamento */ }
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, open]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  // No leitor e no painel a bolinha atrapalharia
  if (/^\/(ler|admin|entrar|cadastro|caderno)/.test(path ?? '')) return null;

  async function send(content: string) {
    const q = content.trim().slice(0, 800);
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const res = await fetch('/api/assistente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.filter((m) => m !== HELLO).map(({ role, content: c }) => ({ role, content: c })) }),
      });
      const data = await res.json().catch(() => ({}));
      setMsgs((m) => [...m, res.ok
        ? { role: 'assistant', content: data.reply, materials: data.materials }
        : { role: 'assistant', content: data.error || 'Ops, minha chama piscou aqui 😅 Tenta de novo?' }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'Parece que você está sem internet 🕯️ Tenta de novo quando a conexão voltar.' }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      {open ? (
        <section className="velinha-panel" role="dialog" aria-label="Velinha, assistente do acervo">
          <header>
            <img src="/velinha.webp" alt="" width={36} height={36} />
            <div><b>Velinha</b><small>Te ajudo a achar o material ideal</small></div>
            <button type="button" className="velinha-x" onClick={() => setMsgs([HELLO])} title="Nova conversa" aria-label="Começar nova conversa">↺</button>
            <button type="button" className="velinha-x" onClick={() => setOpen(false)} aria-label="Fechar">✕</button>
          </header>
          <div className="velinha-list" ref={list} aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`velinha-msg ${m.role}`}>
                <div className="velinha-bubble"><Rich text={m.content} /></div>
                {m.materials?.length ? (
                  <div className="velinha-cards">
                    {m.materials.map((c) => (
                      <Link key={c.slug} href={`/material/${c.slug}`} className="velinha-card">
                        {c.coverUrl ? <img src={c.coverUrl} alt="" /> : <span className="velinha-nocover" aria-hidden="true">📖</span>}
                        <span>{c.title}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? <div className="velinha-msg assistant"><div className="velinha-bubble velinha-typing" aria-label="Velinha está pensando"><i /><i /><i /></div></div> : null}
            {msgs.length === 1 && !busy ? (
              <div className="velinha-ideas">
                {IDEAS.map((q) => <button key={q} type="button" onClick={() => void send(q)}>{q}</button>)}
              </div>
            ) : null}
          </div>
          <form className="velinha-form" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
            <label htmlFor="velinha-q" className="sr-only">Mensagem para a Velinha</label>
            <textarea id="velinha-q" ref={input} rows={1} maxLength={800} value={text} placeholder="O que você quer estudar?"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
            <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()} aria-label="Enviar">➤</button>
          </form>
          <small className="velinha-note">A Velinha indica materiais do acervo. Para orientação espiritual, fale com o dirigente da casa.</small>
        </section>
      ) : null}
      <button type="button" className="velinha-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={open ? 'Fechar a Velinha' : 'Conversar com a Velinha, assistente do acervo'}>
        <img src="/velinha.webp" alt="" width={46} height={46} />
      </button>
    </>
  );
}
