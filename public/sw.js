// Leitura sem internet: guarda os arquivos do site e as páginas do leitor salvas pela pessoa.
// Os PDFs/EPUBs ficam em outro cache, gerenciado por lib/offline.ts.
const STATIC = 'biblioteca-static-v1';
const PAGES = 'biblioteca-paginas-v1';

// Guarda uma página e os scripts/estilos que ela usa (para abrir sem conexão)
async function cachePage(path) {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await (await caches.open(PAGES)).put(path, res);
  const assets = Array.from(new Set(html.match(/\/_next\/static\/[^"'\\)\s]+/g) || []));
  const statics = await caches.open(STATIC);
  await Promise.all(assets.map(async (a) => { if (!(await statics.match(a))) await statics.add(a).catch(() => undefined); }));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(cachePage('/offline').catch(() => undefined));
});
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'cache-page') event.waitUntil(cachePage(event.data.path).catch(() => undefined));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Arquivos do site com nome único por versão: primeiro do cache
  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/pdf.worker.min.mjs' || /\.(png|webp|woff2)$/.test(url.pathname)) {
    event.respondWith(caches.open(STATIC).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Páginas: sempre da internet; sem conexão, a cópia salva (leitor) ou a página "sem internet"
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => {
      if (res.ok && url.pathname.startsWith('/ler/')) {
        const copy = res.clone();
        caches.open(PAGES).then(async (c) => { if (await c.match(url.pathname)) await c.put(url.pathname, copy); });
      }
      return res;
    }).catch(async () => (await caches.match(url.pathname)) || (await caches.match('/offline')) || Response.error()));
  }
});
