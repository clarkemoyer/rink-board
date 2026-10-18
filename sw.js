/* Rink Board offline cache: the app opens with no signal. Songs from YouTube still need internet. */
const V = 'rink-board-v15';
const CORE = ['./', './index.html', './help.html', './manifest.webmanifest', './icon.svg'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600;700&display=swap';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));  // skip the 10-minute browser cache
    try {
      const r = await fetch(FONT_CSS, { mode: 'cors' });
      if (r.ok) {
        await c.put(FONT_CSS, r.clone());
        const css = await r.text();
        const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(urls.map(u => fetch(u, { mode: 'cors' }).then(x => x.ok && c.put(u, x)).catch(() => {})));
      }
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // App files: answer from the phone instantly, refresh the saved copy in the background.
    // One cache entry per file (link parameters ignored); refreshes check with the server, not the browser cache.
    url.search = '';
    const key = (req.mode === 'navigate' && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'))) ? new URL('./index.html', self.registration.scope).href : url.href;
    e.respondWith((async () => {
      const c = await caches.open(V);
      const hit = await c.match(key);
      const net = fetch(key, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(key, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || new Response('Offline', { status: 503 });
    })());
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(V);
      const hit = await c.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }
      catch (_) { return new Response('', { status: 504 }); }
    })());
  }
  // Everything else (YouTube) goes straight to the network.
});
