// v107: антифрод — аккаунт + хэш устройства, дедуп трека между аккаунтами, без чужих координат,
// дуэли (A/B, без сима, спринт без телефона, ничья, истёкшая ссылка), «Оспорить» — node test/v107.test.mjs
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { lapBody, dragBody } from './traces.mjs';
import { decodeTrace, lapFromTrace } from '../../gps-core.js';
import { TRACK_CAL } from '../../track-cal.js';
const lapMsOfBody = (b) => lapFromTrace(decodeTrace(b.trace).pts, TRACK_CAL.sochi).ms;
function exactLap(t, seed0) { for (let s = seed0; s < seed0 + 60; s++) { const b = lapBody(t, {}, { seed: s }); if (lapMsOfBody(b) === 121900) return b; } return null; }

const worker = withAutoRefresh(rawWorker);
const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg, extra) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };

const kv = new MemKV();
const sent = [];
const env = {
  PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'C'.repeat(30), FEEDBACK_CHAT_ID: '8591275999',
  __fetch: async (u, o) => { sent.push({ url: String(u), body: JSON.parse(o?.body || '{}') }); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })); },
};
let ipSeq = 1;
async function call(method, path, { body, token, dev } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.107.0.' + (ipSeq++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  if (dev) h['X-Device'] = dev;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
async function login(phone, nick) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  return { token: v.data.token, id: v.data.pilotId };
}
const A = await login('79010700001', 'Мага');
const B = await login('79010700002', 'Артём');
const C = await login('79010700003', 'Третий');
const DA = 'devAAAAAAAAAAAA1', DB = 'devBBBBBBBBBBBB2';

console.log('\n[trace dedup across accounts + device binding]');
const body0 = dragBody('0-100', 4.6, {}, { seed: 71 });
let r = await call('POST', '/tops/drag/0-100', { token: A.token, dev: DA, body: body0 });
ok(r.status === 200, 'A: verified 0–100 accepted', r.data);
r = await call('POST', '/tops/drag/0-100', { token: B.token, dev: DB, body: body0 });
ok(r.status === 422 && r.data.code === 'duplicate', 'B re-submits A\'s trace → 422 duplicate', r.data);
r = await call('POST', '/tops/drag/60ft', { token: A.token, dev: DA, body: body0 });
ok(r.status === 200 || r.data.code !== 'duplicate', 'A may reuse own trace for another discipline');
const stored = JSON.parse(await kv.get('drag:0-100'));
ok(stored[0].dev && stored[0].dev !== DA && stored[0].th && stored[0].pilotId === A.id, 'stored row bound to account + device hash (raw device id not stored)', stored[0]);
r = await call('GET', '/tops/drag/0-100');
const pub = JSON.stringify(r.data);
ok(!/"dev"|"th"|"lat"|"lon"|"trace"|"flags"/.test(pub), 'public top: no device hash, trace hash or coordinates', pub.slice(0, 200));

console.log('\n[duels]');
const mkDuel = async (who, extra) => (await call('POST', '/duel', { token: who.token, dev: DA, body: { type: 'lap', trackId: 'sochi', createdBy: 'x', ...extra } })).data;
let d = await mkDuel(A, { days: 7 });
ok(d.id && d.expiresAt - d.createdAt === 7 * 86400_000, 'duel link lives 7 days');
r = await call('POST', '/duel', { token: A.token, body: { type: 'lap', trackId: 'sochi', days: 14 } });
ok(r.status === 400, 'longer than 7 days refused');
r = await call('POST', `/duel/${d.id}/run`, { token: A.token, dev: DA, body: lapBody('2:01.900', {}, { src: 'sim', seed: 5 }) });
ok(r.status === 422 && r.data.code === 'simulator', 'duel: simulator run refused', r.data);
r = await call('POST', `/duel/${d.id}/run`, { token: A.token, dev: DA, body: lapBody('2:01.900', {}, { acc: 30, seed: 6 }) });
ok(r.status === 422 && r.data.code === 'gps_c', 'duel: GPS C refused', r.data);
const bA = exactLap('2:01.900', 100), bB = exactLap('2:01.900', 200);
r = await call('POST', `/duel/${d.id}/run`, { token: A.token, dev: DA, body: bA });
ok(r.status === 200, 'duel: A/B lap accepted', r.data);
r = await call('POST', `/duel/${d.id}/run`, { token: B.token, dev: DA, body: lapBody('2:01.900', {}, { seed: 8 }) });
ok(r.status === 422 && r.data.code === 'duplicate', 'duel: other account from the same device → duplicate', r.data);
r = await call('POST', `/duel/${d.id}/run`, { token: B.token, dev: DB, body: bB });
ok(r.status === 200 && r.data.status === 'ready' && r.data.winner === 'tie', 'equal server time → draw (tie)', [r.data.creatorRun?.t, r.data.challengerRun?.t, r.data.winner]);
d = await mkDuel(A, {});
await call('POST', `/duel/${d.id}/run`, { token: A.token, dev: DA, body: lapBody('2:02.500', {}, { seed: 11 }) });
r = await call('POST', `/duel/${d.id}/run`, { token: B.token, dev: DB, body: lapBody('2:01.400', {}, { seed: 12 }) });
ok(r.data.winner === 'challenger', 'lower time wins', r.data.winner);
// drag duel: phone refused
const dd = (await call('POST', '/duel', { token: A.token, body: { type: 'drag', createdBy: 'x' } })).data;
r = await call('POST', `/duel/${dd.id}/run`, { token: A.token, dev: DA, body: dragBody('0-100', 4.9, {}, { src: 'phone', hz: 1, seed: 13 }) });
ok(r.status === 200 && r.data.cls === 'c' && r.data.creatorRun?.gpsQ === 'C', 'v118: sprint duel: phone run → дуэль класса C', r.data);
// expired link
const de = await mkDuel(A, { days: 1 });
const raw = JSON.parse(await kv.get('duel:' + de.id)); raw.expiresAt = Date.now() - 1000; await kv.put('duel:' + de.id, JSON.stringify(raw));
r = await call('POST', `/duel/${de.id}/run`, { token: B.token, dev: DB, body: lapBody('2:03.000', {}, { seed: 14 }) });
ok(r.status === 410, 'expired duel link → results refused (410)', r.status);

console.log('\n[«Оспорить»]');
sent.length = 0;
const before = await kv.get('drag:0-100');
r = await call('POST', '/dispute', { body: { kind: 'top', board: 'drag:0-100', target: 'abc', reason: 'подозрительно' } });
ok(r.status === 401 && r.data.code === 'no_account', 'dispute needs an account');
r = await call('POST', '/dispute', { token: C.token, body: { kind: 'top', board: 'drag:0-100', target: 'g_0123456789abcdef', at: Date.now(), reason: 'Видео показывает другое время' } });
ok(r.status === 200 && r.data.ok && r.data.forwarded, 'dispute stored + forwarded', r.data);
const keys = (await kv.list({ prefix: 'dispute:' })).keys;
ok(keys.length === 1, 'dispute record in KV');
ok(sent.length === 1 && sent[0].body.chat_id === '8591275999' && /оспорить/i.test(sent[0].body.text), 'notification only to chat 8591275999', sent);
ok((await kv.get('drag:0-100')) === before, 'nothing deleted / changed in the top');
r = await call('POST', '/dispute', { token: C.token, body: { kind: 'duel', target: d.id, reason: 'соперник ехал по другой трассе' } });
ok(r.status === 200, 'duel dispute accepted');

console.log('\n[thresholds are not revealed]');
r = await call('POST', '/tops/drag/0-100', { token: C.token, dev: 'devCCCCCCCCCC3', body: dragBody('0-100', 4.4, {}, { acc: 30, seed: 15 }) }); // v118: 5 Гц теперь зачёт C — отказ даём слабой точностью
ok(r.status === 422 && Object.keys(r.data).sort().join() === 'code,error' && !/\d/.test(r.text), '422 body = {error, code} only, no numbers', r.text);
console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v107 all passed');
process.exit(fails ? 1 : 0);
