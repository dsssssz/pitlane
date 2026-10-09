// v113: car passport + preparation class (pilot's word) on runs, tops class filter — node test/v113.test.mjs
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { lapBody, dragBody } from './traces.mjs';
const worker = withAutoRefresh(rawWorker);
const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg, x) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1' };
let ipSeq = 1;
async function call(method, path, { body, token, dev } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.113.0.' + (ipSeq++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  if (dev) h['X-Device'] = dev;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
async function login(phone, nick) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  return { token: v.data.token, id: v.data.pilotId };
}
const A = await login('79001130001', 'Мага');
const B = await login('79001130002', 'Артём');
const base = { model: 'BMW G87 M2', tyre: 'Michelin Pilot Sport 4S', carId: 'g87-m2' };

console.log('[my car passport]');
let r = await call('PUT', '/me/car', { token: A.token, body: { ...base, prep: 'stock', tyreT: 'street', hp: 460.4, kg: 1725, bar: 2.25 } });
ok(r.status === 200 && r.data.car.prep === 'stock' && r.data.car.tyreT === 'street' && r.data.car.hp === 460 && r.data.car.bar === 2.3 && r.data.car.self === true, 'class + tyre type + numbers saved, marked as pilot\'s word', r.data);
for (const [bad, why] of [[{ prep: 'stage9', tyreT: 'street' }, 'unknown class'], [{ prep: 'st1' }, 'class without tyre type'], [{ tyreT: 'slick' }, 'unknown tyre type'], [{ hp: 9000 }, 'hp out of range'], [{ kg: 50 }, 'mass out of range'], [{ bar: 9 }, 'pressure out of range'], [{ hp: 'abc' }, 'hp not a number']]) {
  r = await call('PUT', '/me/car', { token: B.token, body: { ...base, ...bad } });
  ok(r.status === 400, 'rejected: ' + why, r.data);
}
r = await call('PUT', '/me/car', { token: B.token, body: base });
ok(r.status === 200 && r.data.car.prep === undefined && r.data.car.self === undefined, 'class stays optional (old flow)');

console.log('\n[class stamped on runs]');
r = await call('POST', '/tops/lap/sochi', { token: A.token, dev: 'devA0000000000001', body: { ...lapBody('1:58.600'), name: 'Мага' } });
ok(r.status === 200, 'A lap accepted', r.data);
r = await call('POST', '/tops/lap/sochi', { token: B.token, dev: 'devB0000000000002', body: { ...lapBody('1:59.400', {}, { seed: 9 }), name: 'Артём' } });
ok(r.status === 200, 'B lap accepted (no class)', r.data);
const laps = JSON.parse(await kv.get('lap:sochi'));
ok(laps.find((x) => x.pilotId === A.id)?.prep === 'stock' && laps.find((x) => x.pilotId === A.id)?.tyreT === 'street', 'A lap row carries prep/tyreT');
ok(laps.find((x) => x.pilotId === B.id)?.prep === undefined, 'B lap row: class not given');
r = await call('GET', '/tops/lap/sochi');
ok(r.data.some((x) => x.prep === 'stock' && x.tyreT === 'street') && !JSON.stringify(r.data).includes('"hp"'), 'public rows show class, not the passport numbers');
r = await call('GET', '/tops/lap/sochi?prep=stock');
ok(r.data.length === 1 && r.data[0].prep === 'stock', 'filter prep=stock');
r = await call('GET', '/tops/lap/sochi?prep=none');
ok(r.data.length === 1 && !r.data[0].prep, 'filter prep=none («класс не указан»)');
r = await call('GET', '/tops/lap/sochi?prep=st2');
ok(r.data.length === 0, 'filter prep=st2 → empty');
r = await call('GET', '/stock/lap/sochi?car=g87-m2');
ok(r.data.best?.ms === 118600, 'stock reference now fed by the class-stamped lap');

r = await call('POST', '/tops/drag/0-100', { token: A.token, dev: 'devA0000000000001', body: { ...dragBody('0-100', 4.1, {}, { seed: 31 }), carId: 'g87-m2', car: 'BMW G87 M2' } });
ok(r.status === 200, 'drag accepted', r.data);
r = await call('POST', '/tops/drag/0-100', { token: A.token, dev: 'devA0000000000001', body: { ...dragBody('0-100', 3.6, {}, { seed: 32 }), carId: 'm4', car: 'BMW M4' } });
const drags = JSON.parse(await kv.get('drag:0-100'));
ok(drags.find((x) => x.carId === 'g87-m2')?.prep === 'stock', 'drag on the declared car → class stamped');
ok(drags.find((x) => x.carId === 'm4') && drags.find((x) => x.carId === 'm4').prep === undefined, 'drag on another car → no class (not guessed)');
r = await call('GET', '/tops/drag/0-100?prep=stock');
ok(r.data.length === 1 && r.data[0].carId === 'g87-m2', 'drag tops filter prep=stock');

console.log('\n[share card class]');
r = await call('POST', '/share', { body: { payload: { car: 'BMW', type: 'lap', time: '1:58.60', prep: 'st2', tyreT: 'semi' } } });
let p = ((x) => x.payload || x)((await call('GET', '/share/' + r.data.id)).data);
ok(p.prep === 'st2' && p.tyreT === 'semi', 'class on share card');
r = await call('POST', '/share', { body: { payload: { car: 'BMW', type: 'lap', time: '1:58.60', prep: '<b>', tyreT: 'x' } } });
p = ((x) => x.payload || x)((await call('GET', '/share/' + r.data.id)).data);
ok(p.prep === undefined && p.tyreT === undefined, 'unknown class dropped');
console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v113 all passed');
process.exit(fails ? 1 : 0);
