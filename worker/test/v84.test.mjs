// v84: per-discipline straight-line tops + Paddock top-of-day — node test/v84.test.mjs
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
const worker = withAutoRefresh(rawWorker);
import { MemKV } from './kvmock.mjs';
import { dragTraceFor, lapBody, dragBody } from './traces.mjs';

const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1' };
let ipSeq = 1;
async function call(method, path, { body, token, ip } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.2.0.1' };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
async function login(phone, nick) {
  const ip = '10.7.' + (ipSeq++) + '.1';
  const o = await call('POST', '/auth/otp', { body: { phone }, ip });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick }, ip });
  return { token: v.data.token, id: v.data.pilotId, phone };
}
const A = await login('79001240001', 'Мага');
const B = await login('79001240002', 'Артём');
// v104: время и оценку считает сервер по сырому треку — тело несёт trace под нужное время
const run = (o = {}, disc = '402m', opt = {}) => {
  const t = o.t ?? 11.2;
  const b = { t, gps: true, carId: 'g87-m2', car: 'BMW G87 M2 Widebody', ...o };
  if (typeof t === 'number' && Number.isFinite(t) && o.trace !== null) b.trace = dragTraceFor(disc, t, opt);
  return b;
};
const near = (a, b, tol = 0.06) => Math.abs(Number(a) - b) <= tol;
const noPhone = (label, text) => ok(![A, B].some((u) => text.includes(u.phone) || text.includes(u.phone.slice(1)) || text.includes(u.token)), label + ' — no phones / tokens');

console.log('\n[drag disciplines: validation]');
let r = await call('POST', '/tops/drag/402m', { body: run() });
ok(r.status === 401, 'anonymous POST → 401');
r = await call('POST', '/tops/drag/0-1000', { token: A.token, body: run() });
ok(r.status === 400 && r.data.error === 'bad discipline', 'unknown discipline → 400');
r = await call('POST', '/tops/drag/402m', { token: A.token, body: run({ t: 4.9 }) });
ok(r.status === 422, '¼ mile 4.9 s (implausible) → 400');
r = await call('POST', '/tops/drag/402m', { token: A.token, body: run({ t: 75 }) });
ok(r.status === 422, '¼ mile 75 s (not a run) → 400');
r = await call('POST', '/tops/drag/100-200', { token: A.token, body: run({ t: 2.5 }, '100-200') });
ok(r.status === 422, '100–200 2.5 s → 400');
r = await call('POST', '/tops/drag/60ft', { token: A.token, body: run({ t: 'NaN' }, '60ft') });
ok(r.status === 422 && r.data.code === 'no_trace', 'NaN time / no trace → 422 no_trace');
r = await call('POST', '/tops/drag/402m', { token: A.token, body: run({ trace: null }) });
ok(r.status === 422, 'no raw points → 422');
r = await call('POST', '/tops/drag/402m', { token: A.token, body: run({ t: 12 }, '402m', { src: 'phone', hz: 1 }) });
ok(r.status === 422 && r.data.code === 'phone_source', 'phone 1 Hz ¼ mile → 422 phone_source (not in top)');
r = await call('POST', '/tops/drag/402m', { token: A.token, body: run({ pilotId: B.id }) });
ok(r.status === 403, 'forged pilotId → 403');
r = await call('POST', '/tops/drag/402m', { token: A.token, body: run({ carId: '../x', car: 'M2 <script>' }) });
ok(r.status === 200 && r.data.rows[0].carId === undefined && r.data.rows[0].car === 'M2 script', 'bad carId dropped, car label cleaned');

console.log('\n[drag disciplines: boards]');
await kv.put('drag:402m', '[]');
r = await call('POST', '/tops/drag/402m', { token: A.token, body: run({ t: 12.4 }) });
ok(r.status === 200 && r.data.stored === true && r.data.rows.length === 1 && r.data.rows[0].name === 'Мага', 'A ¼ mile 12.4 stored (nick from account)');
r = await call('POST', '/tops/drag/402m', { token: A.token, body: run({ t: 12.9 }) });
ok(r.data.stored === false && r.data.rows.length === 1 && near(r.data.rows[0].t, 12.4), 'slower run does not replace best');
r = await call('POST', '/tops/drag/402m', { token: A.token, body: run({ t: 12.1 }) });
ok(r.data.stored === true && r.data.rows.length === 1 && near(r.data.rows[0].t, 12.1), 'faster run replaces best (one row per pilot+car)');
r = await call('POST', '/tops/drag/402m', { token: A.token, body: run({ t: 13.5, carId: 'g63', car: 'Mercedes-AMG G 63' }) });
ok(r.data.rows.length === 2, 'another car → separate row');
r = await call('POST', '/tops/drag/402m', { token: B.token, body: run({ t: 11.8, carId: 'gt3rs', car: 'Porsche 911 GT3 RS', gpsQ: 'A', valid: true }, '402m', { acc: 30 }) });
ok(r.status === 422 && r.data.code === 'gps_c', 'GPS C run (client claims A) → 422 gps_c, not on board');
r = await call('POST', '/tops/drag/402m', { token: B.token, body: run({ t: 11.8, carId: 'gt3rs', car: 'Porsche 911 GT3 RS', gpsQ: 'B', weather: 'dry' }) });
r = await call('GET', '/tops/drag/402m');
ok(r.status === 200 && r.data.length === 3 && r.data[0].name === 'Артём' && near(r.data[0].t, 11.8) && r.data[0].disc === '402m', 'GET board sorted by time');
ok(r.data.every((x) => x.pilotId && /^p_/.test(x.pilotId)), 'rows carry public pilot id (for profile)');
noPhone('GET /tops/drag', r.text);
r = await call('GET', '/tops/drag/402m?car=g63');
ok(r.data.length === 1 && r.data[0].carId === 'g63', 'car filter');
r = await call('GET', '/tops/drag/402m?weather=dry');
ok(r.data.length === 1 && r.data[0].name === 'Артём', 'weather filter');
r = await call('GET', '/tops/drag/nope');
ok(r.status === 200 && Array.isArray(r.data) && !r.data.length, 'unknown discipline GET → []');
for (const d of ['0-50', '0-60', '80-120', '0-200', '200-300', '201m']) {
  const x = await call('POST', '/tops/drag/' + d, { token: A.token, body: run({ t: { '0-50': 2.1, '0-60': 2.4, '80-120': 2.3, '0-200': 11.9, '200-300': 14.2, '201m': 7.9 }[d] }, d) });
  ok(x.status === 200 && x.data.stored, d + ' accepted');
}
// 0–100 via the classic endpoint mirrors to the global board
r = await call('POST', '/tops/straight/g87-m2', { token: A.token, body: dragBody('0-100', 3.95, { name: 'x', car: 'BMW G87 M2 Widebody' }) });
r = await call('GET', '/tops/drag/0-100');
ok(r.data.length === 1 && near(r.data[0].t, 3.95) && r.data[0].carId === 'g87-m2', '0–100 from /tops/straight mirrored into drag:0-100');
// avatar enrichment from pilotmeta (set by an A/B lap)
await call('PUT', '/me/car', { token: B.token, body: { model: 'GT3 RS', tyre: 'Cup 2' } });
await call('POST', '/tops/lap/sochi', { token: B.token, body: lapBody('2:00.100', { name: 'Артём', car: 'GT3 RS', avatar: 'data:image/png;base64,QUJD' }) });
r = await call('GET', '/tops/drag/402m');
ok(r.data.find((x) => x.name === 'Артём').avatar === 'data:image/png;base64,QUJD', 'board rows get avatar from pilotmeta');
r = await call('GET', '/tops/lap/sochi?avatars=1');
ok(r.data[0].avatar === 'data:image/png;base64,QUJD', 'lap board ?avatars=1 enriched');

console.log('\n[profile: all disciplines]');
r = await call('GET', '/pilot/' + A.id);
const dr = r.data.best.drag;
ok(near(dr['402m'].t, 12.1) && near(dr['0-100'].t, 3.95) && near(dr['201m'].t, 7.9) && near(dr['80-120'].t, 2.3), 'profile best.drag has every discipline');
ok(!('100-200' in dr), 'no invented disciplines (100–200 never driven)');
noPhone('GET /pilot', r.text);

console.log('\n[paddock top of the day]');
const now = Date.now();
await kv.put('pulse', JSON.stringify([
  { id: 'p-new', who: 'x', text: 'свежий, 1 лайк', at: now - 3600e3, likes: ['p_liker_a'], pilotId: A.id, img: 'data:image/jpeg;base64,AAAA' },
  { id: 'p-hot', who: 'y', text: 'горячий, 3 лайка', at: now - 5 * 3600e3, likes: ['p_liker_a', 'p_liker_b', 'p_liker_c'], pilotId: B.id },
  { id: 'p-zero', who: 'z', text: 'без лайков', at: now - 60e3, likes: [], pilotId: B.id },
  { id: 'p-old', who: 'o', text: 'вчерашний, 9 лайков', at: now - 30 * 3600e3, likes: Array.from({ length: 9 }, (_, i) => 'p_' + i), pilotId: A.id },
]));
r = await call('GET', '/pulse?top=day');
ok(r.status === 200 && r.data.map((p) => p.id).join() === 'p-hot,p-new,p-zero', 'last 24 h only, sorted by likes then recency: ' + r.data.map((p) => p.id).join());
ok(r.data[1].img === null && r.data[1].hasImg === true, 'images stripped (hasImg flag) — light payload');
ok(!/"likes"\s*:\s*\[/.test(r.text) && !r.text.includes('p_liker_'), 'liker ids not exposed');
await kv.put('pulse', '[]');
r = await call('GET', '/pulse?top=day');
ok(r.status === 200 && Array.isArray(r.data) && r.data.length === 0, 'empty feed → []');

console.log('\n[account deletion]');
r = await call('DELETE', '/account', { token: A.token });
ok(r.status === 200 && r.data.deleted.dragRows >= 8, 'account deletion removes drag rows (' + r.data.deleted.dragRows + ')');
r = await call('GET', '/tops/drag/402m');
ok(r.data.every((x) => x.name !== 'Мага'), 'deleted pilot gone from boards');

console.log(fails ? `\n${fails} v84 test(s) FAILED` : '\nall v84 tests passed');
process.exit(fails ? 1 : 0);
