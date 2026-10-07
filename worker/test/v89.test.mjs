// v89: ghosts, async ghost duels, profile banners — node test/v89.test.mjs
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
const worker = withAutoRefresh(rawWorker);
import { MemKV } from './kvmock.mjs';
import { encodeGhost } from '../../ghost-codec.js';
import { lapBody as tLap, dragBody as tDrag } from './traces.mjs';

const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1' };
let ipSeq = 1;
async function call(method, path, { body, token, ip, raw } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.9.0.1' };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: raw != null ? raw : body ? JSON.stringify(body) : undefined }), env);
  if (raw === undefined && res.headers.get('Content-Type')?.startsWith('image/')) return { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) };
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text, headers: res.headers };
}
async function login(phone, nick) {
  const ip = '10.8.' + (ipSeq++) + '.1';
  const o = await call('POST', '/auth/otp', { body: { phone }, ip });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick }, ip });
  return { token: v.data.token, id: v.data.pilotId, phone };
}
const A = await login('79001890001', 'Мага');
const B = await login('79001890002', 'Артём');
const C = await login('79001890003', 'Лиза');
// v104: призрак принимается только к своему серверно зачтённому результату → кладём такие строки в MemKV
const vrow = (pid, o) => ({ name: 'x', gps: true, valid: true, srv: 1, gpsQ: 'A', pilotId: pid, at: Date.now(), ...o });
await kv.put('lap:sochi', JSON.stringify([121480, 125000, 119500].map((ms) => vrow(A.id, { ms, t: 'x' }))
  .concat([vrow(B.id, { ms: 118920 }), vrow(C.id, { ms: 130000 })])));
await kv.put('drag:0-100', JSON.stringify([vrow(A.id, { t: 4.05, disc: '0-100' })]));

/** Synthetic lap trace around a circle (~3.2 km), 10 Hz, realistic speeds. */
function lapTrace(totalMs, { vScale = 1 } = {}) {
  const pts = []; let d = 0; const R = 500; const lat0 = 43.405; const lon0 = 39.957;
  const n = Math.round(totalMs / 100);
  for (let i = 0; i <= n; i++) {
    const v = (95 + 35 * Math.sin(i / 50)) * vScale;
    if (i) d += v / 3.6 * 0.1;
    const a = d / R;
    pts.push({ t: i * 100, d, v, lat: lat0 + (R * Math.sin(a)) / 111320, lon: lon0 + (R * (1 - Math.cos(a))) / (111320 * Math.cos(lat0 * Math.PI / 180)) });
  }
  return pts;
}
function dragTrace(to100Ms) {
  const pts = []; let v = 0; let d = 0; const acc = 100 / 3.6 / (to100Ms / 1000);
  for (let i = 0; i <= Math.ceil(to100Ms / 100) + 3; i++) {
    if (i) { v = Math.min(130 / 3.6, v + acc * 0.1); d += v * 0.1; }
    pts.push({ t: i * 100, d, v: v * 3.6, lat: 55.57 + d / 111320, lon: 38.14 });
  }
  return pts;
}
const lapBody = (ms, o = {}) => ({ kind: 'lap', ref: 'sochi', tMs: ms, gpsQ: 'A', valid: true, car: 'BMW G87 M2', carId: 'g87-m2', ghost: encodeGhost(lapTrace(ms)), ...o });

console.log('\n[POST /ghost: auth, validation]');
let r = await call('POST', '/ghost', { body: lapBody(120000) });
ok(r.status === 401, 'anonymous → 401');
r = await call('POST', '/ghost', { token: A.token, body: lapBody(145000, { gpsQ: 'A', valid: true }) });
ok(r.status === 422 && r.data.code === 'not_verified', 'v104: ghost without a server-verified result → 422 not_verified');
r = await call('POST', '/ghost', { token: A.token, body: lapBody(120000, { ref: '../etc' }) });
ok(r.status === 400, 'bad track slug → 400');
r = await call('POST', '/ghost', { token: A.token, body: { ...lapBody(120000), kind: 'drag', ref: '100-200' } });
ok(r.status === 400 && /0-100/.test(r.data.error), 'drag ghost only for 0-100 / 402m');
r = await call('POST', '/ghost', { token: A.token, body: lapBody(90000, { ghost: encodeGhost(lapTrace(120000)) }) });
ok(r.status === 400 && /lap time/.test(r.data.error), 'trace length must match lap time');
r = await call('POST', '/ghost', { token: A.token, body: lapBody(120000, { ghost: encodeGhost(lapTrace(120000, { vScale: 4 })) }) });
ok(r.status === 400 && /speed|jump|acceleration/.test(r.data.error), 'implausible speed (≈500 km/h) → 400 · ' + r.data.error);
{
  const pts = lapTrace(120000); pts[600].lat += 0.01; // 1 km teleport
  r = await call('POST', '/ghost', { token: A.token, body: lapBody(120000, { ghost: encodeGhost(pts) }) });
  ok(r.status === 400 && /jump/.test(r.data.error), 'teleport → 400');
}
{
  const pts = lapTrace(120000); for (let i = 300; i < 320; i++) pts[i].v = i === 300 ? 30 : 230; // 200 km/h in 0.1 s
  r = await call('POST', '/ghost', { token: A.token, body: lapBody(120000, { ghost: encodeGhost(pts) }) });
  ok(r.status === 400 && /acceleration/.test(r.data.error), 'implausible acceleration → 400');
}
r = await call('POST', '/ghost', { token: A.token, body: lapBody(120000, { ghost: { ...encodeGhost(lapTrace(120000)), p: 'A'.repeat(31000) } }) });
ok(r.status === 400 && /large/.test(r.data.error), 'ghost data > 30 000 chars → 400');
r = await call('POST', '/ghost', { token: A.token, raw: JSON.stringify(lapBody(120000)) + ' '.repeat(40 * 1024) });
ok(r.status === 413, 'body > 34 KB → 413');
r = await call('POST', '/ghost', { token: A.token, body: lapBody(120000, { ghost: { ...encodeGhost(lapTrace(120000)), p: encodeGhost(lapTrace(120000)).p.slice(0, -5) } }) });
ok(r.status === 400 && /malformed/.test(r.data.error), 'truncated stream → malformed');
r = await call('POST', '/ghost', { token: A.token, body: lapBody(120000, { pilotId: B.id }) });
ok(r.status === 403, 'forged pilotId → 403');

console.log('\n[POST /ghost: best per pilot, boards]');
r = await call('POST', '/ghost', { token: A.token, body: lapBody(121480) });
ok(r.status === 200 && r.data.stored === true && r.data.rank === 1, 'A 2:01.48 stored, rank 1');
const ghostA1 = r.data.id;
r = await call('POST', '/ghost', { token: A.token, body: lapBody(125000) });
ok(r.data.stored === false && r.data.id === ghostA1, 'slower ghost not stored');
r = await call('POST', '/ghost', { token: A.token, body: lapBody(119500) });
ok(r.data.stored === true && r.data.id !== ghostA1, 'faster ghost replaces best');
const ghostA = r.data.id;
ok((await kv.get('ghost:' + ghostA1)) === null, 'old ghost record deleted');
r = await call('POST', '/ghost', { token: B.token, body: lapBody(118920, { car: 'Porsche 911 GT3 RS', carId: 'gt3rs' }) });
ok(r.data.stored && r.data.rank === 1, 'B 1:58.92 → leader');
r = await call('POST', '/ghost', { token: C.token, body: lapBody(130000) });
r = await call('GET', '/ghosts/top/sochi');
ok(r.status === 200 && r.data.leader?.name === 'Артём' && r.data.leader.ghost?.p && r.data.top.length === 3, 'GET /ghosts/top/sochi → leader with trace + top 3');
ok(r.data.top.map((x) => x.name).join() === 'Артём,Мага,Лиза', 'top order by time');
ok(!r.text.includes(A.phone) && !r.text.includes(A.token), 'no phones / tokens in ghost board');
r = await call('GET', '/ghost/' + ghostA);
ok(r.status === 200 && r.data.tMs === 119500 && r.data.name === 'Мага' && r.data.ghost.n > 100, 'GET /ghost/:id');
r = await call('GET', '/ghost/zz');
ok(r.status === 404, 'bad ghost id → 404');
r = await call('GET', '/ghosts/top/nring');
ok(r.status === 200 && r.data.leader === null && r.data.top.length === 0, 'empty track → empty board');
r = await call('GET', '/ghosts/top/drag/100-200');
ok(r.status === 400, 'unsupported discipline board → 400');

console.log('\n[drag ghosts 0-100 / 402m]');
const dragBody = (ms, disc = '0-100', o = {}) => ({ kind: 'drag', ref: disc, tMs: ms, gpsQ: 'A', valid: true, car: 'BMW G87 M2', ghost: encodeGhost(dragTrace(ms)), ...o });
r = await call('POST', '/ghost', { token: A.token, body: dragBody(4050) });
ok(r.status === 200 && r.data.stored, '0-100 4.05 ghost stored');
const dragA = r.data.id;
r = await call('POST', '/ghost', { token: B.token, body: dragBody(1200) });
ok(r.status === 400, '0-100 1.2 s → 400 (implausible)');
r = await call('POST', '/ghost', { token: B.token, body: dragBody(7000, '402m') });
ok(r.status === 400 && /402/.test(r.data.error), '402m trace that never reaches 402 m → 400');
r = await call('GET', '/ghosts/top/drag/0-100');
ok(r.status === 200 && r.data.leader?.id === dragA && r.data.kind === 'drag', 'GET /ghosts/top/drag/0-100');

console.log('\n[ghost duels]');
r = await call('POST', '/duel', { token: A.token, body: { type: 'lap', trackId: 'sochi', ghostId: ghostA, days: 5 } });
ok(r.status === 400 && /days/.test(r.data.error), 'days must be 1/3/7');
r = await call('POST', '/duel', { token: A.token, body: { type: 'lap', trackId: 'moscow', ghostId: ghostA, days: 3 } });
ok(r.status === 400 && /track/.test(r.data.error), 'ghost track mismatch → 400');
r = await call('POST', '/duel', { token: B.token, body: { type: 'lap', trackId: 'sochi', ghostId: ghostA, days: 3 } });
ok(r.status === 403, 'someone else\'s ghost → 403');
r = await call('POST', '/duel', { body: { type: 'lap', trackId: 'sochi', ghostId: ghostA, days: 3, pilotId: 'dev_abcdefgh12' } });
ok(r.status === 401, 'guest cannot attach ghost');
r = await call('POST', '/duel', { token: A.token, body: { type: 'lap', trackId: 'sochi', ghostId: ghostA, days: 3, name: 'Мага' } });
ok(r.status === 200 && r.data.ghostId && r.data.ghostId !== ghostA && r.data.days === 3, 'ghost duel created (frozen ghost copy, 3 days)');
const gd = r.data;
ok(Math.abs(gd.expiresAt - gd.createdAt - 3 * 86400_000) < 1000, 'expiresAt = +3 days');
ok(gd.creatorRun?.t === '1:59.500' && gd.creatorRun.ghost === true && gd.status === 'open', 'target time locked from ghost');
ok(kv.ttl('ghost:' + gd.ghostId) > 3 * 86400 && kv.ttl('ghost:' + gd.ghostId) <= 4 * 86400, 'duel ghost copy expires with the duel');
r = await call('GET', '/ghost/' + gd.ghostId);
ok(r.status === 200 && r.data.duel === gd.id && r.data.ghost.p, 'duel ghost readable by link');
await call('POST', '/ghost', { token: A.token, body: lapBody(117000) });
r = await call('GET', '/ghost/' + gd.ghostId);
ok(r.status === 200 && r.data.tMs === 119500, 'new best does not change a running duel ghost');
r = await call('POST', `/duel/${gd.id}/run`, { token: A.token, body: tLap('1:55.000', { trackId: 'sochi' }) });
ok(r.status === 409, 'creator cannot re-submit (target locked)');
r = await call('POST', `/duel/${gd.id}/run`, { token: C.token, body: tLap('1:59.080', { trackId: 'sochi', car: 'VW Golf R' }) });
ok(r.status === 200 && r.data.status === 'ready' && r.data.winner === 'challenger', 'challenger beat ghost by 0.42 → ready, winner challenger');
r = await call('GET', '/duels?mine=' + A.id, { token: A.token });
ok(r.data.some((d) => d.id === gd.id && d.status === 'ready' && d.winner === 'challenger'), 'result visible to creator');
r = await call('GET', '/duels?mine=' + C.id, { token: C.token });
ok(r.data.some((d) => d.id === gd.id), 'result visible to challenger');
r = await call('POST', '/duel', { token: A.token, body: { type: 'drag', ghostId: dragA, days: 1 } });
ok(r.status === 200 && r.data.disc === '0-100' && r.data.creatorRun.t === 4.05, 'drag ghost duel (0-100, 1 day)');
const dd = r.data;
r = await call('POST', `/duel/${dd.id}/run`, { token: B.token, body: tDrag('0-100', 4.4, { gpsQ: 'A', valid: true }, { acc: 30 }) });
ok(r.status === 422 && r.data.code === 'gps_c', 'GPS C run not accepted in ghost duel');
r = await call('POST', '/duel', { token: B.token, body: { type: 'drag', name: 'Артём' } });
ok(r.status === 200 && r.data.days === 7 && r.data.ghostId === null && r.data.creatorRun === null, 'legacy duel unchanged (7 days, no ghost)');

console.log('\n[profile banners]');
r = await call('PUT', '/me/banner', { body: { id: 'carbon' } });
ok(r.status === 401, 'anonymous → 401');
r = await call('PUT', '/me/banner', { token: A.token, body: { id: 'https://evil/x.png' } });
ok(r.status === 400, 'unknown builtin id → 400');
r = await call('PUT', '/me/banner', { token: A.token, body: { id: 'neon-sochi' } });
ok(r.status === 200 && r.data.banner?.id === 'neon-sochi', 'builtin banner set');
r = await call('GET', '/pilot/' + A.id);
ok(r.data.banner?.id === 'neon-sochi', 'GET /pilot/:id returns banner');
r = await call('GET', '/me', { token: A.token });
ok(r.data.banner?.id === 'neon-sochi', 'GET /me returns banner');
const webp = new Uint8Array(1200); webp.set([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32]);
const jpeg = new Uint8Array(1200); jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 4096) s += String.fromCharCode(...u8.subarray(i, i + 4096)); return btoa(s); };
r = await call('PUT', '/me/banner', { token: A.token, body: { image: 'data:image/png;base64,' + b64(jpeg) } });
ok(r.status === 400, 'PNG / other MIME → 400');
r = await call('PUT', '/me/banner', { token: A.token, body: { image: 'data:image/webp;base64,' + b64(jpeg) } });
ok(r.status === 400 && /match/.test(r.data.error), 'JPEG bytes labelled webp → 400 (magic bytes)');
r = await call('PUT', '/me/banner', { token: A.token, body: { image: 'data:image/jpeg;base64,' + b64(new Uint8Array(152 * 1024).fill(0xff)) } });
ok(r.status === 400 && /150/.test(r.data.error), '> 150 KB → 400');
r = await call('PUT', '/me/banner', { token: A.token, raw: JSON.stringify({ image: 'x'.repeat(260 * 1024) }) });
ok(r.status === 413, 'body > 210 KB → 413');
r = await call('PUT', '/me/banner', { token: A.token, body: { image: 'data:image/webp;base64,' + b64(webp) } });
ok(r.status === 200 && r.data.banner?.custom === true && r.data.banner.v, 'custom webp banner uploaded');
r = await call('GET', '/banner/' + A.id);
ok(r.status === 200 && r.headers.get('Content-Type') === 'image/webp' && r.bytes.length === 1200 && r.bytes[8] === 87, 'GET /banner/:id serves the image');
ok(r.headers.get('X-Content-Type-Options') === 'nosniff', 'banner served with nosniff');
r = await call('GET', '/banner/p_nope');
ok(r.status === 404, 'banner of bad id → 404');
r = await call('PUT', '/me/banner', { token: C.token, body: { id: 'sunset' } });
r = await call('GET', '/duel/' + gd.id);
ok(r.data.createdBy?.banner?.custom === true && r.data.challenger?.banner?.id === 'sunset', 'duel VS header carries both banners');
r = await call('PUT', '/me/banner', { token: C.token, body: { id: null } });
ok(r.status === 200 && r.data.banner === null, 'banner reset');
{
  const ipB = '10.9.9.9';
  let last = 0;
  for (let i = 0; i < 22; i++) last = (await call('PUT', '/me/banner', { token: B.token, ip: ipB, body: { id: 'ice' } })).status;
  ok(last === 429, 'banner writes rate-limited (20/h per account)');
}

console.log('\n[share card ghost line]');
r = await call('POST', '/share', { ip: '10.9.7.1', body: { payload: { car: 'BMW', nick: 'Мага', type: 'lap', track: 'Сочи', time: '1:58.50', ghost: 'Побил на 0.42 с<script>', ghostVs: 'лидер · Артём', evil: 'x' } } });
ok(r.status === 200 && r.data.id, 'share with ghost line stored');
{
  const sh = await call('GET', '/share/' + r.data.id);
  const p = sh.data.payload || sh.data;
  ok(p.ghost === 'Побил на 0.42 сscript' && p.ghostVs === 'лидер · Артём' && p.evil === undefined, 'ghost line sanitized, unknown fields dropped');
}
r = await call('POST', '/share', { ip: '10.9.7.1', body: { payload: { car: 'BMW', type: '402m', time: '12.40 с' } } });
{
  const sh = await call('GET', '/share/' + r.data.id);
  const p = sh.data.payload || sh.data;
  ok(p.type === '402m', 'share type ¼ mile kept');
}

console.log('\n[account deletion]');
r = await call('DELETE', '/account', { token: A.token });
ok(r.status === 200 && r.data.deleted.ghosts >= 3 && r.data.deleted.banner === 1, 'deletion report: ghosts + banner · ' + JSON.stringify({ g: r.data.deleted.ghosts, b: r.data.deleted.banner }));
ok((await kv.list({ prefix: 'ghost:' })).keys.every((k) => k.metadata?.pid !== A.id), 'no ghost:* left for A (incl. duel copies)');
r = await call('GET', '/ghosts/top/sochi');
ok(!r.data.top.some((x) => x.name === 'Мага'), 'A removed from ghost boards');
ok((await kv.get('pbanner:' + A.id)) === null, 'custom banner deleted');
r = await call('GET', '/banner/' + A.id);
ok(r.status === 404, 'banner URL → 404 after deletion');

console.log(fails ? `\n${fails} v89 test(s) FAILED` : '\nall v89 tests passed');
process.exit(fails ? 1 : 0);
