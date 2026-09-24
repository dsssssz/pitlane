const CACHE = 'pitlane-v75';
const GLB_CACHE = 'pitlane-glb-v1';
const THREE_CACHE = 'pitlane-three-v1';

const CORE = [
  './',
  './index.html',
  './zamer.html',
  './method.html',
  './styles.css',
  './app.js',
  './plates.js',
  './track-sat-map.js',
  './geo/outlines.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './api.js',
  './manifest.json',
  './favicon.svg',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/emblem.svg',
  './img/brands/bmw.png',
  './audio/huracan-start.mp3',
  './vendor/three/three.module.js',
  './vendor/three/addons/controls/OrbitControls.js',
  './vendor/three/addons/loaders/GLTFLoader.js',
  './vendor/three/addons/environments/RoomEnvironment.js',
  './vendor/three/addons/objects/Reflector.js',
  './vendor/three/addons/lights/RectAreaLightUniformsLib.js',
  './vendor/three/addons/lights/RectAreaLightTexturesLib.js',
  './vendor/three/addons/utils/BufferGeometryUtils.js',
  './vendor/three/addons/utils/SkeletonUtils.js',
];

const THREE_CDN = [
  'https://unpkg.com/three@0.168.0/build/three.module.js',
  'https://unpkg.com/three@0.168.0/examples/jsm/controls/OrbitControls.js',
  'https://unpkg.com/three@0.168.0/examples/jsm/loaders/GLTFLoader.js',
  'https://unpkg.com/three@0.168.0/examples/jsm/environments/RoomEnvironment.js',
  'https://unpkg.com/three@0.168.0/examples/jsm/objects/Reflector.js',
  'https://unpkg.com/three@0.168.0/examples/jsm/lights/RectAreaLightUniformsLib.js',
  'https://unpkg.com/three@0.168.0/examples/jsm/lights/RectAreaLightTexturesLib.js',
  'https://unpkg.com/three@0.168.0/examples/jsm/utils/BufferGeometryUtils.js',
];

const GLB_MODELS = [
  './models/g87-m2.glb',
  './models/m3.glb',
  './models/m4.glb',
  './models/c63-ed507.glb',
  './models/gt3rs.glb',
  './models/g63.glb',
  './models/isf.glb',
  './models/mclaren-765lt.glb',
  './models/spark.glb',
  './models/x6.glb',
];

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
      const t = await caches.open(THREE_CACHE);
      await Promise.all(THREE_CDN.map((u) => softPut(t, u, { mode: 'cors' })));
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
      const g = await caches.open(GLB_CACHE);
      await Promise.all(
        GLB_MODELS.map(async (u) => {
          try {
            if (await g.match(u)) return;
            await softPut(g, u);
          } catch (_) {}
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const p = url.pathname;
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
