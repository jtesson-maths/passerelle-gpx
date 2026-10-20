// Passerelle GPX — service worker : mode hors ligne + réception des fichiers partagés
const CACHE = 'pg-app-v1';
const SHARE = 'pg-share';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Fichier partagé depuis Samsung Health (menu Partager d'Android)
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const files = form.getAll('gpx').filter((f) => f && typeof f === 'object');
        const file = files[0];
        if (file) {
          const c = await caches.open(SHARE);
          await c.put('./shared.gpx', new Response(file, {
            headers: { 'X-File-Name': encodeURIComponent(file.name || 'course.gpx') }
          }));
        }
      } catch (err) { /* la page affichera « aucun fichier reçu » */ }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Réseau d'abord (pour recevoir les mises à jour), cache en secours
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res.ok) {
        const c = await caches.open(CACHE);
        c.put(e.request, res.clone());
      }
      return res;
    } catch (err) {
      const hit = await caches.match(e.request, { ignoreSearch: true });
      return hit || caches.match('./index.html');
    }
  })());
});
