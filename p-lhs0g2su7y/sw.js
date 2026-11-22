// preview: SW не используется. Если вдруг зарегистрировался — сам снимается, кэши не трогает.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()));
