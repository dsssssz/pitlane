const CACHE = 'pitlane-v37';
const CORE = ['./', './index.html', './styles.css', './app.js', './api.js', './manifest.json', './favicon.svg', './img/icon-192.png', './img/icon-512.png', './img/emblem.svg', './img/brands/bmw.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
