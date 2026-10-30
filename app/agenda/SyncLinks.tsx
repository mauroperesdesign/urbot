'use client';

import { useState } from 'react';

// Botões para assinar a agenda no Calendário da Apple, no Google Agenda ou copiar o link
export function SyncLinks({ https }: { https: string }) {
  const [copied, setCopied] = useState(false);
  const webcal = https.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <a className="btn btn-primary" href={webcal}>Adicionar no iPhone, iPad ou Mac</a>
      <a className="btn" href={google} target="_blank" rel="noopener noreferrer">Adicionar no Google Agenda</a>
      <label className="field">Link da agenda (para outros apps)
        <input readOnly value={https} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={async () => {
        try { await navigator.clipboard.writeText(https); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* sem permissão: o campo acima pode ser copiado à mão */ }
      }}>{copied ? 'Link copiado ✓' : 'Copiar link'}</button>
    </div>
  );
}
