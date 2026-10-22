'use client';

// Leitura sem internet: o arquivo escolhido fica guardado no próprio aparelho (Cache Storage),
// junto com a página do leitor. Tudo é apagado ao sair da conta.

export type OfflineEntry = {
  fileId: string; materialId: string; slug: string; title: string; kind: 'pdf' | 'epub'; size: number; savedAt: string;
};

const FILES = 'biblioteca-offline-v1';
export const PAGES = 'biblioteca-paginas-v1';
export const STATIC = 'biblioteca-static-v1';
const INDEX = '/__offline/index';
const fileKey = (id: string) => `/__offline/file/${id}`;

export const offlineSupported = () => typeof window !== 'undefined' && 'caches' in window;

export async function listOffline(): Promise<OfflineEntry[]> {
  if (!offlineSupported()) return [];
  try {
    const res = await (await caches.open(FILES)).match(INDEX);
    return res ? ((await res.json()) as OfflineEntry[]) : [];
  } catch { return []; }
}

async function writeIndex(entries: OfflineEntry[]) {
  const cache = await caches.open(FILES);
  await cache.put(INDEX, new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json' } }));
}

export async function getOfflineFile(fileId: string): Promise<ArrayBuffer | null> {
  if (!offlineSupported()) return null;
  try {
    const res = await (await caches.open(FILES)).match(fileKey(fileId));
    return res ? await res.arrayBuffer() : null;
  } catch { return null; }
}

export async function saveOffline(entry: Omit<OfflineEntry, 'size' | 'savedAt'>) {
  const meta = await fetch(`/api/files/${entry.fileId}`, { cache: 'no-store' });
  if (!meta.ok) throw new Error('Não foi possível baixar o arquivo agora.');
  const { url } = await meta.json();
  const blob = await (await fetch(url)).blob();
  const files = await caches.open(FILES);
  await files.put(fileKey(entry.fileId), new Response(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } }));

  // A página do leitor e os scripts que ela usa, para abrir mesmo sem conexão
  const pages = await caches.open(PAGES);
  const here = `/ler/${entry.slug}`;
  const page = await fetch(here, { credentials: 'same-origin' });
  if (page.ok) await pages.put(here, page);
  const statics = await caches.open(STATIC);
  const assets = performance.getEntriesByType('resource').map((r) => r.name)
    .filter((u) => u.startsWith(location.origin) && (u.includes('/_next/static/') || u.endsWith('.mjs') || u.endsWith('.webp') || u.endsWith('.png')));
  await Promise.all(Array.from(new Set(assets)).map(async (u) => { if (!(await statics.match(u))) await statics.add(u).catch(() => undefined); }));

  // Atualiza também a página "sem internet" e seus scripts (versão atual do site)
  navigator.serviceWorker?.controller?.postMessage({ type: 'cache-page', path: '/offline' });

  const rest = (await listOffline()).filter((e) => e.fileId !== entry.fileId);
  await writeIndex([{ ...entry, size: blob.size, savedAt: new Date().toISOString() }, ...rest]);
}

export async function removeOffline(fileId: string) {
  if (!offlineSupported()) return;
  const list = await listOffline();
  const gone = list.find((e) => e.fileId === fileId);
  await (await caches.open(FILES)).delete(fileKey(fileId));
  if (gone) await (await caches.open(PAGES)).delete(`/ler/${gone.slug}`);
  await writeIndex(list.filter((e) => e.fileId !== fileId));
}

// Ao sair da conta: nada de material restrito fica no aparelho (os arquivos do site ficam)
export async function clearOffline() {
  if (!offlineSupported()) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('biblioteca-') && k !== STATIC).map((k) => caches.delete(k)));
  navigator.serviceWorker?.controller?.postMessage({ type: 'cache-page', path: '/offline' });
}
