const CACHE = 'pitlane-v137';
const GLB_CACHE = 'pitlane-glb-v2';
const THREE_CACHE = 'pitlane-three-v1';

const CORE = [
  './',
  './index.html',
  './zamer.html',
  './method.html',
  './privacy.html',
  './terms.html',
  './offer.html',
  './delete-account.html',
  './tools/tma-check.html',
  './legal.css',
  './styles.css', './fonts/inter-display-num-500.woff2', './fonts/inter-display-num-600.woff2',
  './app.js',
  './plates.js',
  './ext-gps.js',
  './crew-rooms.js',
  './music-ui.js',
  './teams-ui.js',
  './tips.js',
  './chase-match.js',
  './ghost.js',
  './session-review.js',
  './ghost-codec.js',
  './gps-core.js',
  './run-marks.js',
  './car-brands.js',
  './shop-config.js',
  './shop-ui.js',
  './img/shop/gps-hero-720.webp',
  './img/flags/de.svg', './img/flags/gb.svg', './img/flags/it.svg', './img/flags/jp.svg', './img/flags/us.svg',
  './track-cal.js',
  './legal-config.js',
  './legal.js',
  './img/profile-banners/neon-sochi-600.webp',
  './img/profile-banners/neon-moscow-600.webp',
  './img/profile-banners/neon-nring-600.webp',
  './img/profile-banners/telemetry-600.webp',
  './img/profile-banners/carbon-600.webp',
  './img/profile-banners/asphalt-600.webp',
  './img/profile-banners/stripes-600.webp',
  './img/profile-banners/sunset-600.webp',
  './img/profile-banners/ice-600.webp',
  './img/profile-banners/photo-duels-600.webp',
  './img/profile-banners/photo-tracks-600.webp',
  './img/profile-banners/photo-paddock-600.webp',
  './img/track-maps/sochi-thumb.webp',
  './img/track-maps/moscow-thumb.webp',
  './img/track-maps/igora-thumb.webp',
  './img/track-maps/kazan-thumb.webp',
  './img/track-maps/smolensk-thumb.webp',
  './img/track-maps/nring-thumb.webp',
  './img/track-maps/adm-thumb.webp',
  './img/track-maps/grozny-thumb.webp',
  './img/track-maps/redring-thumb.webp',
  './img/track-maps/spb-thumb.webp',
  './img/track-maps/tlt-thumb.webp',
  './img/track-maps/lipetsk-thumb.webp',
  './img/track-maps/auto-msk-thumb.webp',
  './img/track-maps/neva-thumb.webp',
  './img/track-maps/ufa-thumb.webp',
  './img/track-maps/don-thumb.webp',
  './track-sat-map.js',
  './geo/outlines.js',
  './api.js',
  './tma.js',
  './vendor/telegram-web-app.js',
  './manifest.json',
  './favicon.svg',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/emblem.svg',
  './img/cars/g87-m2.webp',
  './img/cars/studio/g87-m2-1170.avif',
  './img/cars/gt3rs.webp',
  './img/cars/mclaren-765lt.webp',
  './img/cars/g63.webp',
  './img/cars/m4.webp',
  './img/cars/m3.webp',
  './img/cars/x6.webp',
  './img/cars/isf.webp',
  './img/cars/c63-ed507.webp',
  './img/cars/spark.webp',
  './img/banners/duels-800.webp',
  './img/banners/tracks-800.webp',
  './img/banners/paddock-800.webp',
  './audio/huracan-start.mp3',
];
/* v119: three.js, Leaflet и GLB не качаются при установке/активации — только при первом заходе в Бокс / на «Круг»
 * (fetch-обработчик ниже кладёт их в кэш после первой загрузки, офлайн дальше работает как раньше). */


async function softPut(cache, url, init) {
  try {
    const res = await fetch(url, init || { cache: 'reload' });
    if (res.ok) await cache.put(url, res);
  } catch (_) {}
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      await Promise.all(CORE.map((u) => softPut(c, u)));
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== GLB_CACHE && k !== THREE_CACHE)
          .map((k) => caches.delete(k))
      );
      // v119: GLB больше не докачиваются здесь (было ~111 МБ в фоне на первом визите) — только по запросу модели
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const p = url.pathname;
  // v80: never touch authenticated or Worker API traffic (no caching of personal responses, ever)
  if (e.request.headers.has('authorization') || url.hostname.endsWith('.workers.dev')) return;
  // API + live map tiles: never SW-cache (online-first; graceful app fallback offline)
  if (
    p.includes('/auth/') ||
    p.includes('/tops/') ||
    p.includes('/pulse') ||
    p.includes('/garage') ||
    p.includes('/share') ||
    p.includes('/duel') ||
    p.includes('/crew') ||
    p.includes('/session') ||
    p.includes('/feedback') ||
    p.includes('/hardware/') || // v82: firmware images / web-flash page — never cache
    p.endsWith('.mp4') || e.request.headers.has('range') ||
    (url.origin !== self.location.origin && (p === '/me' || p === '/account' || p.startsWith('/admin'))) ||
    url.hostname.includes('arcgisonline.com') ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('server.arcgisonline.com')
  ) {
    return;
  }
  e.respondWith(
    (async () => {
      try {
        const net = await fetch(e.request);
        if (net.ok) {
          const isThree = url.hostname.includes('unpkg.com') && url.pathname.includes('/three');
          const isGlb = url.pathname.endsWith('.glb');
          const isShell = url.origin === self.location.origin;
          if (isThree) {
            caches.open(THREE_CACHE).then((t) => t.put(e.request, net.clone())).catch(() => {});
          } else if (isGlb) {
            caches.open(GLB_CACHE).then((g) => g.put(e.request, net.clone())).catch(() => {});
          } else if (isShell) {
            caches.open(CACHE).then((c) => c.put(e.request, net.clone())).catch(() => {});
          }
        }
        return net;
      } catch (err) {
        const hit =
          (await caches.match(e.request)) ||
          (await caches.match(url.pathname)) ||
          (await caches.match(e.request.url));
        if (hit) return hit;
        if (e.request.mode === 'navigate') {
          const idx = await caches.match('./index.html');
          if (idx) return idx;
        }
        throw err;
      }
    })()
  );
});
