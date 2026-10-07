// v104: вход только с аккаунтом, access+refresh, серверный зачёт по сырым точкам, коды причин,
// общий gps-core (интерполяция порогов) — node test/v104.test.mjs (MemKV, без прода)
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { lapBody, dragBody, dragPoints } from './traces.mjs';
import { dragTime, speedCross, launchTime, distCross, encodeTrace, decodeTrace, traceStats, gradeTrace, gateCross } from '../../gps-core.js';
import { decodeGhost, encodeGhost } from '../../ghost-codec.js';

const worker = withAutoRefresh(rawWorker);
const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg, extra) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('\n[gps-core: one timing function for client and server]');
{
  // ровно 10 Гц, линейный разгон 5 м/с²: 0→100 = 5.556 с от старта (старт в t=1.0 с)
  const pts = [];
  for (let i = 0; i <= 120; i++) { const t = i * 100; const v = t <= 1000 ? 0 : Math.min(150, (t - 1000) / 1000 * 18); pts.push({ t, lat: 55, lon: 37, v, acc: 2 }); }
  ok(near(launchTime(pts), 1000, 1), 'launch anchored at the last standing point (extrapolated to v=0)', launchTime(pts));
  const c = speedCross(pts, 100);
  ok(near(c.t, 1000 + 100 / 18 * 1000, 1), 'speed crossing interpolated between neighbours (not snapped to a sample)', c);
  ok(near(dragTime(pts, '0-100'), 5.556, 0.002), '0–100 = 5.556 s', dragTime(pts, '0-100'));
  ok(near(dragTime(pts, '80-120'), 40 / 18, 0.002), '80–120 rolling = 2.222 s', dragTime(pts, '80-120'));
  const pts1 = pts.filter((p) => p.t % 1000 === 0);
  ok(near(dragTime(pts1, '0-100'), 5.556, 0.002), '1 Hz phone: same interpolation → same result', dragTime(pts1, '0-100'));
  const d = distCross(pts.map((p) => ({ ...p })), 18.288, 1000);
  ok(near((d - 1000) / 1000, Math.sqrt(2 * 18.288 / 5), 0.01), '60 ft by trapezoid distance integration', (d - 1000) / 1000);
  const p2 = dragPoints({ a: 5, vMax: 160, hz: 10 });
  const w = encodeTrace(p2, 'ext'); const back = decodeTrace(w);
  ok(back.pts.length === p2.length && near(back.pts[50].lat, p2[50].lat, 1e-6) && back.src === 'ext', 'trace codec round-trip');
  const st = traceStats(back.pts);
  ok(st.hz === 10 && st.n === p2.length && st.avgAcc > 2 && gradeTrace(st) === 'A', 'passport: Hz, accuracy, points, grade A', st);
  ok(gradeTrace({ ...st, avgAcc: 12 }) === 'B' && gradeTrace({ ...st, avgAcc: 20 }) === 'C', 'grade B ≤15 m, C above');
  const g = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }];
  ok(gateCross({ lat: -0.0001, lon: 0.0005 }, { lat: 0.0001, lon: 0.0005 }, g)?.k === 0.5, 'S/F gate crossing fraction');
}

const kv = new MemKV();
const BOT_TOKEN = '123456:' + 'B'.repeat(30);
const env = { PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: BOT_TOKEN };
let ipSeq = 1;
async function call(method, path, { body, token, headers: xh, w = worker } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.104.0.' + (ipSeq++ % 250), ...(xh || {}) };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await w.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
async function login(phone, nick) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  return { token: v.data.token, refreshToken: v.data.refreshToken, id: v.data.pilotId, expiresIn: v.data.expiresIn };
}
const A = await login('79010400001', 'Мага');
const B = await login('79010400002', 'Артём');
await call('PUT', '/me/car', { token: A.token, body: { model: 'BMW M2', tyre: 'PS4S' } });

console.log('\n[session: short access + rotating refresh]');
ok(A.token && A.refreshToken && A.expiresIn === 86400, 'login returns access (24 h) + refresh', A);
ok(kv.ttl('sess:' + A.token) <= 86400, 'access token TTL ≤ 24 h in KV');
let r = await call('POST', '/auth/refresh', { body: { refreshToken: A.refreshToken }, w: rawWorker });
ok(r.status === 200 && r.data.token && r.data.refreshToken !== A.refreshToken, 'refresh → new pair');
const A2 = { token: r.data.token, refreshToken: r.data.refreshToken };
r = await call('POST', '/auth/refresh', { body: { refreshToken: A.refreshToken }, w: rawWorker });
ok(r.status === 401 && r.data.code === 'session_expired', 'refresh token is single-use (rotation)');
r = await call('GET', '/me', { token: A2.token, w: rawWorker });
ok(r.status === 200 && r.data.user.termsAt == null, 'new access token works');
r = await call('POST', '/auth/logout', { token: A2.token, w: rawWorker });
r = await call('POST', '/auth/refresh', { body: { refreshToken: A2.refreshToken }, w: rawWorker });
ok(r.status === 401, 'logout revokes the paired refresh token too');

console.log('\n[author only from session]');
r = await call('POST', '/tops/drag/0-100', { body: dragBody('0-100', 4.5), headers: { 'X-Pilot-Id': 'dev_abcdefgh12' }, w: rawWorker });
ok(r.status === 401 && r.data.code === 'no_account', 'no session → 401 no_account (X-Pilot-Id ignored)');
for (const p of ['/duel', '/crew', '/session/today/checkin', '/pulse', '/ghost']) {
  r = await call('POST', p, { body: { type: 'drag', name: 'x', trackId: 'sochi', text: 'hi' }, w: rawWorker });
  ok(r.status === 401 && r.data.code === 'no_account', 'POST ' + p + ' without account → 401 no_account');
}
r = await call('POST', '/tops/drag/0-100', { token: A.token, body: { ...dragBody('0-100', 4.5), pilotId: B.id } });
ok(r.status === 403, 'foreign pilotId in body → 403');

console.log('\n[server-side grading: client gpsQ / valid / t ignored]');
r = await call('POST', '/tops/drag/0-100', { token: A.token, body: { ...dragBody('0-100', 4.5), t: 2.0, gpsQ: 'A', valid: true } });
ok(r.status === 200 && near(r.data.rows[0].t, 4.5, 0.06) && r.data.rows[0].gpsQ === 'A' && r.data.rows[0].hz === 10 && r.data.rows[0].src === 'ext', 'time & grade recomputed from points', r.data.rows?.[0]);
ok(!('th' in r.data.rows[0]) && !('flags' in r.data.rows[0]) && !('trace' in r.data.rows[0]), 'public row: no trace / hash / flags');
const codes = [
  ['phone 1 Hz', dragBody('0-100', 5, {}, { src: 'phone', hz: 1 }), 'phone_source'],
  ['external 5 Hz', dragBody('0-100', 5, {}, { hz: 5 }), 'low_hz'],
  ['simulator', dragBody('0-100', 5, {}, { src: 'sim' }), 'simulator'],
  ['accuracy 30 m', dragBody('0-100', 5, {}, { acc: 30 }), 'gps_c'],
  ['no trace', { t: 4.0, gps: true, gpsQ: 'A', valid: true }, 'no_trace'],
];
for (const [label, body, code] of codes) {
  r = await call('POST', '/tops/drag/0-100', { token: A.token, body });
  ok(r.status === 422 && r.data.code === code, label + ' → ' + code, r.data);
}
{
  const w = dragBody('0-100', 5).trace; const p = w.p.map((x) => x.slice()); p[40][1] += 20000; // ~2 km прыжок
  r = await call('POST', '/tops/drag/0-100', { token: A.token, body: { trace: { ...w, p } } });
  ok(r.status === 422 && r.data.code === 'teleport', 'teleport → teleport');
  const p2 = w.p.map((x) => x.slice()); p2[40][0] += 3000;
  r = await call('POST', '/tops/drag/0-100', { token: A.token, body: { trace: { ...w, p: p2 } } });
  ok(r.status === 422 && r.data.code === 'pause', '3 s hole → pause');
  r = await call('POST', '/tops/drag/0-100', { token: A.token, body: { trace: { ...w, t0: Date.now() - 40 * 86400_000 } } });
  ok(r.status === 422 && r.data.code === 'stale', 'old trace → stale');
}
r = await call('POST', '/tops/lap/sochi', { token: A.token, body: lapBody('2:05.000', { how: 'manual' }) });
ok(r.status === 422 && r.data.code === 'manual_finish', 'manual finish → manual_finish');
r = await call('POST', '/tops/lap/sochi', { token: A.token, body: lapBody('2:05.000') });
ok(r.status === 200 && r.data[0].ms === 125000 && r.data[0].track === 'sochi' && r.data[0].sectors.length === 3, 'auto S/F lap on calibrated Sochi accepted');
ok(!/"(?:-?\d+,){4}-?\d+"|"p":\[\[/.test(r.text) && !r.text.includes('trace'), 'lap top never returns raw points');
r = await call('POST', '/tops/lap/moscow', { token: A.token, body: lapBody('2:05.000') });
ok(r.status === 422 && r.data.code === 'track_uncalibrated', 'uncalibrated track → track_uncalibrated');

console.log('\n[old rows without server grade are hidden, not deleted]');
await kv.put('drag:402m', JSON.stringify([{ name: 'старый', t: 11.1, gps: true, valid: true, gpsQ: 'A', pilotId: B.id, at: 1 }]));
r = await call('GET', '/tops/drag/402m');
ok(Array.isArray(r.data) && r.data.length === 0, 'legacy row (no srv) hidden from output');
ok(JSON.parse(await kv.get('drag:402m')).length === 1, 'legacy row still in KV (not silently deleted)');

console.log('\n[ghosts: no foreign coordinates]');
{
  await kv.put('ghost:gtestghost01', JSON.stringify({ id: 'gtestghost01', kind: 'lap', ref: 'sochi', pilotId: B.id, name: 'Артём', tMs: 125000, srv: 1, at: 1,
    data: encodeGhost(Array.from({ length: 50 }, (_, i) => ({ t: i * 100, d: i * 3, v: 108, lat: 43.4 + i * 1e-5, lon: 39.95 }))) }));
  r = await call('GET', '/ghost/gtestghost01');
  const dec = decodeGhost(r.data.ghost);
  ok(r.status === 200 && dec && dec.n === 50 && dec.lat.every((x) => x === 0) && dec.lon.every((x) => x === 0) && dec.d[49] === 147, 'GET /ghost/:id: time/distance/speed kept, lat/lon zeroed (legacy record too)');
}

console.log('\n[account deletion: refresh tokens gone]');
const D = await login('79010400009', 'Удаляюсь');
r = await call('DELETE', '/account', { token: D.token, w: rawWorker });
ok(r.status === 200 && !kv.dump().some(([k, v]) => k.startsWith('rt:') && v.includes(D.id)), 'refresh tokens erased on account deletion');
r = await call('POST', '/auth/refresh', { body: { refreshToken: D.refreshToken }, w: rawWorker });
ok(r.status === 401, 'refresh after deletion → 401');

console.log(fails ? `\n${fails} v104 test(s) FAILED` : '\nall v104 tests passed');
process.exit(fails ? 1 : 0);
