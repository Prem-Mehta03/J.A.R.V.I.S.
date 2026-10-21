// Caches the app shell so the app opens instantly and offline. Data is never cached here (the app keeps its own copy).
const CACHE = 'jarvis-shell-v5';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'logic.js', 'orb.js', 'icons.js', 'voice.js', 'voicemode.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // server calls go straight to the network
  // Network first so updates arrive on the next open; fall back to the cached copy when offline.
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((m) => m || caches.match('./')))
  );
});
