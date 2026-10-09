// v112: stock reference (real A/B rows, same model, class «сток») + share card stock/sector fields — node test/v112.test.mjs
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { lapBody } from './traces.mjs';
const worker = withAutoRefresh(rawWorker);
const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1' };
let ipSeq = 1;
async function call(method, path, { body, token, ip } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.12.0.' + (ipSeq++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
async function login(phone, nick) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  return { token: v.data.token, id: v.data.pilotId };
}
const A = await login('79001120001', 'Мага');
const row = (o) => ({ name: 'x', gps: true, valid: true, srv: 1, gpsQ: 'A', pilotId: A.id, at: Date.now(), ...o });
await kv.put('lap:sochi', JSON.stringify([
  row({ ms: 118000, t: '1:58.000', carId: 'g87-m2', car: 'BMW G87 M2', prep: 'st1', tyreT: 'street' }), // tuned → not stock
  row({ ms: 119000, t: '1:59.000', carId: 'g87-m2', car: 'BMW G87 M2', prep: 'stock', tyreT: 'semi' }), // semi-slicks → not stock
  row({ ms: 117000, t: '1:57.000', carId: 'g87-m2', car: 'BMW G87 M2', prep: 'stock', tyreT: 'street', gpsQ: 'C' }), // C → no
  row({ ms: 116000, t: '1:56.000', carId: 'g87-m2', car: 'BMW G87 M2', prep: 'stock', tyreT: 'street', srv: 0 }), // not server-checked
  row({ ms: 120500, t: '2:00.500', carId: 'g87-m2', car: 'BMW G87 M2', prep: 'stock', tyreT: 'street' }),
  row({ ms: 120200, t: '2:00.200', carId: 'g87-m2', car: 'BMW G87 M2', prep: 'stock', tyreT: 'street', gpsQ: 'B' }),
  row({ ms: 110000, t: '1:50.000', carId: 'm4', car: 'BMW M4', prep: 'stock', tyreT: 'street' }), // other model
  row({ ms: 121000, t: '2:01.000', car: 'Toyota GR86', prep: 'stock', tyreT: 'street' }),
]));
await kv.put('drag:0-100', JSON.stringify([row({ t: 3.95, disc: '0-100', carId: 'g87-m2', car: 'BMW G87 M2', prep: 'stock', tyreT: 'street', src: 'ext', hz: 10 })]));

console.log('[stock reference]');
let r = await call('GET', '/stock/lap/sochi?car=g87-m2');
ok(r.status === 200 && r.data.best?.ms === 120200 && r.data.best.gpsQ === 'B', 'best real A/B stock lap of the same model · ' + r.data.best?.t);
ok(r.data.best && r.data.best.trace === undefined && r.data.best.th === undefined && r.data.best.prep === undefined, 'public fields only (no trace / hash)');
r = await call('GET', '/stock/lap/sochi?model=' + encodeURIComponent('toyota gr86'));
ok(r.data.best?.ms === 121000, 'custom model matched by name');
r = await call('GET', '/stock/lap/sochi?car=gt3rs');
ok(r.status === 200 && r.data.best === null, 'no stock time for another model → null (no invented reference)');
r = await call('GET', '/stock/lap/sochi');
ok(r.data.best === null, 'no car → null');
r = await call('GET', '/stock/drag/0-100?car=g87-m2');
ok(r.data.best?.t === 3.95, 'drag 0–100 stock best');
r = await call('GET', '/stock/drag/nope?car=g87-m2');
ok(r.data.best === null, 'unknown discipline → null');
let last = 200;
for (let i = 0; i < 245; i++) { last = (await call('GET', '/stock/lap/sochi?car=g87-m2', { ip: '10.12.9.9' })).status; if (last === 429) break; }
ok(last === 429, 'stock lookups rate-limited per IP');

console.log('\n[share card stock/sector fields]');
r = await call('POST', '/share', { body: { payload: { car: 'BMW', type: 'lap', time: '2:00.00', stD: -0.2004, stLab: 'G87<b>', secI: 1, secD: 0.3, trace: [1] } } });
{
  const p = ((x) => x.payload || x)((await call('GET', '/share/' + r.data.id)).data);
  ok(p.stD === -0.2 && p.stLab === 'G87b' && p.secI === 1 && p.secD === 0.3 && p.trace === undefined, 'stD/stLab/secI/secD kept and cleaned');
}
r = await call('POST', '/share', { body: { payload: { car: 'BMW', type: 'lap', time: '2:00.00', stD: 5, stNone: true, secI: 1.5, secD: 0.3, secOk: true } } });
{
  const p = ((x) => x.payload || x)((await call('GET', '/share/' + r.data.id)).data);
  ok(p.stD === undefined && p.stNone === true && p.secI === undefined && p.secOk === true, 'stD without label / fractional sector dropped');
}

console.log('\n[duel lap run keeps server sectors]');
await call('PUT', '/me/car', { token: A.token, body: { model: 'BMW G87 M2', tyre: 'Michelin Pilot Sport 4S', carId: 'g87-m2' } });
r = await call('POST', '/duel', { token: A.token, body: { type: 'lap', trackId: 'sochi', createdBy: 'Мага', name: 'Мага', days: 7 } });
const did = r.data.id;
r = await call('POST', '/duel/' + did + '/run', { token: A.token, body: { ...lapBody('1:58.600'), name: 'Мага', trackId: 'sochi', valid: true } });
{
  const d = (await call('GET', '/duel/' + did)).data;
  const run = d.creatorRun;
  ok(run && run.ms === 118600 && Array.isArray(run.sectors) && run.sectors.length >= 2, 'creator run has server sectors · ' + JSON.stringify(run?.sectors));
}
console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v112 all passed');
process.exit(fails ? 1 : 0);
