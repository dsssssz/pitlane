// v114: crews monthly season (sum of 3 best A/B laps; 0–100 ext ≥10 Hz «справочно») — node test/v114.test.mjs
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { dragBody } from './traces.mjs';
import { seasonKey, seasonBounds } from '../src/season.js';
const worker = withAutoRefresh(rawWorker);
const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg, x) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1' };
let ipSeq = 1;
async function call(method, path, { body, token, dev, ip } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.114.0.' + (ipSeq++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  if (dev) h['X-Device'] = dev;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
async function login(phone, nick) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  return { token: v.data.token, id: v.data.pilotId, nick };
}
const P = [];
for (let i = 0; i < 6; i++) P.push(await login('7900114000' + i, ['Мага', 'Артём', 'Лиза', 'Тимур', 'Олег', 'Ника'][i]));
const [A, B, C, D, E, F] = P;
for (const p of P) await call('PUT', '/me/car', { token: p.token, body: { model: 'BMW G87 M2', tyre: 'Michelin PS4S', carId: 'g87-m2' } });
const mk = async (cap, name, others) => {
  const r = await call('POST', '/rooms', { token: cap.token, body: { name } });
  for (const o of others) await call('POST', '/rooms/join', { token: o.token, body: { code: r.data.invite } });
  return r.data.id;
};
const t1 = await mk(A, 'Neon Pack', [B, C, D]);
const t2 = await mk(E, 'Late Apex', [F]);
const t3 = await mk(D, 'Hidden Crew', []);
{ const room = JSON.parse(await kv.get('room:' + t3)); room.listed = false; await kv.put('room:' + t3, JSON.stringify(room)); const idx = JSON.parse(await kv.get('teamidx')); idx.forEach((x) => { if (x.id === t3) x.listed = false; }); await kv.put('teamidx', JSON.stringify(idx)); }

const now = Date.now();
const b = seasonBounds(seasonKey(now));
const lastMonth = b.from - 5 * 86400000;
const lr = (u, ms, o = {}) => ({ name: u.nick, gps: true, valid: true, srv: 1, gpsQ: 'A', pilotId: u.id, ms, t: 'x', car: 'BMW G87 M2', carId: 'g87-m2', at: now - 1000, ...o });
await kv.put('lap:sochi', JSON.stringify([
  lr(A, 118600), lr(A, 119900), lr(B, 120100, { gpsQ: 'B' }), lr(C, 121000), lr(D, 125000),
  lr(B, 110000, { at: lastMonth }), // last month → ignored
  lr(C, 111000, { gpsQ: 'C' }), // C → ignored
  lr(D, 112000, { srv: 0 }), // not server-checked → ignored
  lr(E, 119000), lr(F, 117500),
]));

console.log('[lap season]');
let r = await call('GET', '/season/crews?track=sochi');
ok(r.status === 200 && r.data.month === seasonKey(now) && /\d{4}$/.test(r.data.label), 'current MSK month by default · ' + r.data.label);
const L = r.data.lap;
ok(L[0].team.name === 'Neon Pack' && L[0].sumMs === 118600 + 120100 + 121000 && L[0].pilots.map((p) => p.nick).join(',') === 'Мага,Артём,Лиза', 'sum of 3 best pilots (A/B, this month, best lap per pilot)', L[0]);
ok(L[1].team.name === 'Late Apex' && L[1].need === 1 && L[1].sumMs === null, 'crew with 2 pilots → «не хватает 1»', L[1]);
ok(!L.some((x) => x.team.name === 'Hidden Crew'), 'unlisted team not in the public table');
ok(!JSON.stringify(r.data).includes(A.id) && !JSON.stringify(r.data).includes('pilotId'), 'no pilot ids in the table');
r = await call('GET', '/season/crews?track=sochi&month=' + seasonKey(lastMonth));
ok(r.status === 200 && r.data.lap.length === 1 && r.data.lap[0].pilots[0].ms === 110000, 'previous month season separate');
r = await call('GET', '/season/crews?track=moscow-raceway');
ok(r.status === 200 && r.data.lap.length === 0 && r.data.drag.length === 0, 'empty month/track → honest empty tables');
r = await call('GET', '/season/crews?month=2099-01');
ok(r.status === 400, 'future month rejected');
r = await call('GET', '/season/crews?month=13-2026');
ok(r.status === 400, 'bad month rejected');

console.log('\n[0–100 справочно]');
r = await call('POST', '/tops/drag/0-100', { token: B.token, dev: 'devB000000000001', body: { ...dragBody('0-100', 4.02, {}, { seed: 41 }), carId: 'g87-m2', car: 'BMW G87 M2' } });
ok(r.status === 200, 'B ext 10 Hz 0–100 accepted', r.data);
r = await call('POST', '/tops/drag/0-100', { token: F.token, dev: 'devF000000000001', body: { ...dragBody('0-100', 3.9, {}, { seed: 42, src: 'phone', hz: 1 }), carId: 'g87-m2', car: 'BMW G87 M2' } });
const agg = JSON.parse(await kv.get('season:' + seasonKey(now) + ':d0100') || '{}');
ok(agg[B.id] && agg[B.id].hz >= 10 && !agg[F.id], 'aggregate keeps only ext ≥10 Hz 0–100', agg);
r = await call('GET', '/season/crews?track=sochi');
ok(r.data.drag.length === 1 && r.data.drag[0].team.name === 'Neon Pack' && r.data.drag[0].nick === 'Артём' && r.data.drag[0].hz >= 10, 'best 0–100 of the crew', r.data.drag);

console.log('\n[limits + deletion]');
let last = 200;
for (let i = 0; i < 65; i++) { last = (await call('GET', '/season/crews?track=sochi', { ip: '10.114.9.9' })).status; if (last === 429) break; }
ok(last === 429, 'season table rate-limited per IP');
r = await call('DELETE', '/account', { token: B.token });
const agg2 = JSON.parse(await kv.get('season:' + seasonKey(now) + ':d0100') || '{}');
ok(r.status === 200 && !agg2[B.id] && r.data.deleted.season === 1, 'account deletion removes season entry', r.data.deleted);
console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v114 all passed');
process.exit(fails ? 1 : 0);
