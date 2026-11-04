'use client';

import { useState } from 'react';

const WORDS = ['', 'Fraco', 'Regular', 'Bom', 'Muito bom', 'Excelente'];

// Escolha da nota em estrelas (funciona com teclado: são botões de rádio)
export function StarInput({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset className="star-input" onMouseLeave={() => setHover(0)}>
      <legend>Sua nota</legend>
      <div className="row" style={{ gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} onMouseEnter={() => setHover(n)} data-on={n <= shown ? 'true' : undefined}>
            <input type="radio" name="rating" value={n} required checked={value === n} onChange={() => setValue(n)} className="sr-only" />
            <span aria-hidden="true">★</span><span className="sr-only">{n} {n === 1 ? 'estrela' : 'estrelas'}</span>
          </label>
        ))}
        <span className="muted" style={{ fontSize: 13, marginLeft: 8 }} aria-live="polite">{WORDS[shown]}</span>
      </div>
    </fieldset>
  );
}
