'use client';

import { useState } from 'react';

// "Mensagem de Preto Velho", "Mensagem do Caboclo", "Mensagem da Pombagira"...
const PREP: Record<string, string> = { 'Preto Velho': 'de', Pombagira: 'da', Oxalá: 'de', Iemanjá: 'de', Ogum: 'de', Oxum: 'de', Xangô: 'de', Iansã: 'de', Oxóssi: 'de', Nanã: 'de' };
const of = (entity: string) => `Mensagem ${PREP[entity] ?? 'do'} ${entity}`;

export function DailyMessage({ messages, initial }: { messages: { entity: string; text: string }[]; initial: number }) {
  const [i, setI] = useState(initial);
  const m = messages[i % messages.length];
  return (
    <section className="daily-msg" aria-live="polite" aria-label="Mensagem do dia">
      <div className="daily-msg-head">
        <span className="daily-msg-ico" aria-hidden="true">✦</span>
        <b>{of(m.entity)}</b>
        {messages.length > 1 ? (
          <button type="button" className="pill-link" onClick={() => setI((n) => (n + 1 + Math.floor(Math.random() * (messages.length - 1))) % messages.length)}>Outra mensagem</button>
        ) : null}
      </div>
      <blockquote>“{m.text}”</blockquote>
      <small>Mensagens de inspiração escritas para a biblioteca, no jeito de falar de cada linha.</small>
    </section>
  );
}
