// v132: фото своей машины — PUT/DELETE /me/car-photo, GET /car-photo/:id, без EXIF/XMP, лимиты, удаление с аккаунтом.
// node test/v132.test.mjs
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import * as P from '../src/carphoto.js';
import fs from 'fs';
const worker = withAutoRefresh(rawWorker);
let fails = 0; const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const kv = new MemKV(); const env = { PITLANE: kv, SMS_DEMO: '1' }; let ip = 1;
const call = async (m, p, { body, token } = {}) => {
  const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.132.' + (ip >> 8) + '.' + (ip++ % 250) }; if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const ct = res.headers.get('Content-Type') || ''; let d;
  if (/json/.test(ct)) d = await res.json(); else d = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, data: d, h: res.headers };
};
const login = async (ph, nick) => { const o = await call('POST', '/auth/otp', { body: { phone: ph } }); const v = await call('POST', '/auth/verify', { body: { phone: ph, code: o.data.demoCode, nick } }); return { token: v.data.token, id: v.data.pilotId }; };
const u8 = (...parts) => { const a = []; for (const p of parts) { if (typeof p === 'string') for (const ch of p) a.push(ch.charCodeAt(0)); else for (const x of p) a.push(x); } return Uint8Array.from(a); };
const le = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
const fill = (n, s = 7) => Array.from({ length: n }, (_, i) => (i * 31 + s) & 255);
const chunk = (id, data) => u8(id, le(data.length), data, data.length & 1 ? [0] : []);
const webp = (extra = [], n = 4000) => { const body = u8('WEBP', chunk('VP8 ', fill(n)), ...extra); return u8('RIFF', le(body.length), body); };
const jpeg = (app1 = false, n = 4000) => u8([0xff, 0xd8], [0xff, 0xe0, 0, 16], 'JFIF\0', fill(9), app1 ? u8([0xff, 0xe1, 0, 20], 'Exif\0\0', fill(12)) : [], [0xff, 0xda, 0, 8], fill(6), fill(n), [0xff, 0xd9]);
const avif = (meta = false) => u8([0, 0, 0, 28], 'ftypavif', [0, 0, 0, 0], 'avifmif1miaf', fill(200), meta ? 'Exif\0\0' : '', fill(3000));
const durl = (mime, u) => 'data:' + mime + ';base64,' + Buffer.from(u).toString('base64');

const A = await login('79001320001', 'Мага'); const B = await login('79001320002', 'Артём');

console.log('\n[проверки файла]');
ok(P.sanitizeCarPhoto(durl('image/webp', webp())).mime === 'image/webp', 'чистый WebP — да');
ok(P.sanitizeCarPhoto(durl('image/webp', webp([chunk('EXIF', fill(40))]))).code === 'has_meta', 'WebP с EXIF-чанком — нет');
ok(P.sanitizeCarPhoto(durl('image/webp', webp([chunk('XMP ', fill(40))]))).code === 'has_meta', 'WebP с XMP — нет');
ok(P.sanitizeCarPhoto(durl('image/jpeg', jpeg())).mime === 'image/jpeg', 'чистый JPEG (Safari без WebP-кодера) — да');
ok(P.sanitizeCarPhoto(durl('image/jpeg', jpeg(true))).code === 'has_meta', 'JPEG с APP1/Exif (геометки) — нет');
ok(P.sanitizeCarPhoto(durl('image/avif', avif())).mime === 'image/avif', 'AVIF — да');
ok(P.sanitizeCarPhoto(durl('image/avif', avif(true))).code === 'has_meta', 'AVIF с Exif — нет');
ok(P.sanitizeCarPhoto(durl('image/webp', jpeg())).code === 'bad_format', 'MIME не совпадает с содержимым — нет');
ok(P.sanitizeCarPhoto(durl('image/png', webp())).code === 'bad_format', 'PNG — нет');
ok(P.sanitizeCarPhoto(durl('image/webp', webp([], P.PCAR_MAX))).code === 'too_large', 'больше лимита — нет');
ok(P.sanitizeCarPhoto(durl('image/webp', webp([], 10))).code === 'too_small', 'пустышка — нет');

console.log('\n[API]');
ok((await call('PUT', '/me/car-photo', { body: { image: durl('image/webp', webp()) } })).status === 401, 'без входа — 401');
let r = await call('PUT', '/me/car-photo', { token: A.token, body: { share: true } });
ok(r.status === 409 && r.data.code === 'no_photo', 'share без фото — 409');
r = await call('PUT', '/me/car-photo', { token: A.token, body: { image: durl('image/jpeg', jpeg(true)) } });
ok(r.status === 400 && r.data.code === 'has_meta', 'с EXIF — 400 has_meta', r.data);
r = await call('PUT', '/me/car-photo', { token: A.token, body: { image: durl('image/webp', webp([], P.PCAR_MAX + 10)) } });
ok(r.status === 413, 'слишком большое — 413', r.status);
const img1 = webp();
r = await call('PUT', '/me/car-photo', { token: A.token, body: { image: durl('image/webp', img1) } });
ok(r.status === 200 && r.data.carPhoto?.v && r.data.carPhoto.share === true, 'загрузка WebP — 200, v, share по умолчанию', r.data);
const v1 = r.data.carPhoto.v;
r = await call('GET', '/car-photo/' + A.id);
ok(r.status === 200 && r.h.get('Content-Type') === 'image/webp' && Buffer.compare(Buffer.from(r.data), Buffer.from(img1)) === 0, 'GET /car-photo/:id — те же байты, image/webp');
ok(/max-age=\d+/.test(r.h.get('Cache-Control') || '') && r.h.get('X-Content-Type-Options') === 'nosniff' && /default-src 'none'/.test(r.h.get('Content-Security-Policy') || ''), 'кэшируемо, nosniff, CSP none');
ok((await call('GET', '/car-photo/' + B.id)).status === 404, 'у B фото нет — 404');
ok((await call('GET', '/car-photo/evil')).status === 404, 'кривой id — 404');
r = await call('GET', '/pilot/' + A.id);
ok(r.status === 200 && r.data.carPhoto?.v === v1, 'публичный профиль: carPhoto.v', r.data?.carPhoto);
r = await call('GET', '/pilot/' + B.id);
ok(r.status === 200 && r.data.carPhoto === null, 'у B в профиле carPhoto: null');
r = await call('GET', '/me', { token: A.token });
ok(r.data.carPhoto?.v === v1, '/me: carPhoto');
r = await call('PUT', '/me/car-photo', { token: A.token, body: { share: false } });
ok(r.status === 200 && r.data.carPhoto.share === false && r.data.carPhoto.v === v1, 'выключил «на карточке заезда»');
await new Promise((res) => setTimeout(res, 5));
r = await call('PUT', '/me/car-photo', { token: A.token, body: { image: durl('image/jpeg', jpeg()) } });
ok(r.status === 200 && r.data.carPhoto.v !== v1 && r.data.carPhoto.share === false, 'замена: новая версия (кэш по ?v), share сохраняется');
ok((await call('GET', '/car-photo/' + A.id)).h.get('Content-Type') === 'image/jpeg', 'теперь JPEG');
r = await call('DELETE', '/me/car-photo', { token: A.token });
ok(r.status === 200 && r.data.carPhoto === null && !kv.m.has('pcarphoto:' + A.id), 'DELETE: фото удалено → снова рендер');
ok((await call('GET', '/car-photo/' + A.id)).status === 404, 'после удаления — 404');
let rl = 0; for (let i = 0; i < 22; i++) { const q = await call('PUT', '/me/car-photo', { token: B.token, body: { share: true } }); if (q.status === 429) rl++; }
ok(rl > 0, 'частые запросы — 429');

console.log('\n[удаление аккаунта]');
r = await call('PUT', '/me/car-photo', { token: A.token, body: { image: durl('image/webp', webp()) } });
ok(r.status === 200 && kv.m.has('pcarphoto:' + A.id), 'снова загрузил');
r = await call('DELETE', '/account', { token: A.token, body: { confirm: 'DELETE' } });
ok(r.status === 200 && !kv.m.has('pcarphoto:' + A.id) && r.data.deleted?.carPhoto === 1, 'фото удалено вместе с аккаунтом', r.data);

console.log('\n[клиент]');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
const ver = Number((app.match(/APP_VERSION = 'v(\d+)'/) || [])[1]);
ok(ver >= 132 && Number((sw.match(/pitlane-v(\d+)/) || [])[1]) === ver, 'APP_VERSION / SW ≥ v132 и совпадают');
const blk = app.slice(app.indexOf('const CPH_W'), app.indexOf('/* v131: «Следить»'));
ok(/CPH_W = 1280, CPH_H = 800/.test(blk), 'кадр 16:10, 1280 px (≥ 1170)');
ok(/imageOrientation: 'from-image'/.test(blk), 'ориентация из EXIF применяется до перекодирования');
ok(/toBlob\(\(b\) => res\(b\), type, q\)/.test(blk) && /'image\/webp'/.test(blk) && /'image\/jpeg'/.test(blk), 'canvas → WebP, JPEG как запасной (EXIF не переживает)');
ok(/CPH_MAX = 230 \* 1024/.test(blk) && 230 * 1024 <= P.PCAR_MAX, 'клиентский лимит ≤ серверного');
ok(!/innerHTML/.test(blk), 'только textContent');
ok(html.includes('id="accCarPhoto"') && html.includes('accept="image/*"') && html.includes('id="sharePhoto"') && html.includes('Показывать на карточке заезда'), 'разметка: карточка, файл, карточка заезда, переключатель');
ok(/myCarPhotoUrl\(remote\)/.test(app) && /renderHwCar\(null\)/.test(app), 'виджет «Моя машина»: фото, при ошибке — рендер');
ok(/pilot-carphoto/.test(app), 'фото в публичном профиле');
ok(/own = !!_shareOwn/.test(app), 'на чужой карточке (по ссылке) моё фото не показывается');
const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
ok(/script-src 'self'/.test(csp) && !/unsafe-eval/.test(csp), 'CSP не ослаблен');

console.log(fails ? `\n✗ v132: ${fails} fail(s)` : '\n✓ v132: all ok');
process.exit(fails ? 1 : 0);
