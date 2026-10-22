'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listOffline, offlineSupported, removeOffline, type OfflineEntry } from '@/lib/offline';

// Materiais guardados neste aparelho para ler sem internet
export function OfflineList() {
  const [items, setItems] = useState<OfflineEntry[] | null>(null);
  useEffect(() => { if (offlineSupported()) void listOffline().then(setItems); }, []);
  if (!items) return null;
  const mb = items.reduce((a, i) => a + i.size, 0) / 1048576;
  return (
    <section className="panel" aria-labelledby="h-offline">
      <div className="panel-head"><h2 id="h-offline">Sem internet neste aparelho</h2>{items.length ? <span className="muted" style={{ fontSize: 13 }}>{mb.toFixed(1)} MB</span> : null}</div>
      {items.length ? (
        <ol className="lessons">
          {items.map((i) => (
            <li key={i.fileId} className="row" style={{ flexWrap: 'nowrap' }}>
              <Link className="lesson" href={`/ler/${i.slug}`} style={{ flex: 1 }}>
                <span className="lesson-n done" aria-hidden="true">↓</span>
                <span className="lesson-t"><b>{i.title}</b><small>{i.kind.toUpperCase()} · {(i.size / 1048576).toFixed(1)} MB</small></span>
              </Link>
              <button type="button" className="btn btn-ghost btn-danger" style={{ minHeight: 34 }}
                onClick={async () => { await removeOffline(i.fileId); setItems(await listOffline()); }}>Remover</button>
            </li>
          ))}
        </ol>
      ) : <div className="empty"><span className="muted">No leitor, toque no botão de download (↓) para guardar um livro ou apostila e ler mesmo sem conexão.</span></div>}
    </section>
  );
}
