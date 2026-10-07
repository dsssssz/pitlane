// v105: честный drag — топ 0–100 / 100–200 / 80–120 / ¼ мили только внешний приёмник ≥10 Гц, A/B,
// без симулятора; общая функция порогов клиента и сервера — node test/v105.test.mjs (MemKV)
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { dragBody, dragTraceFor } from './traces.mjs';
import { dragTime, decodeTrace, traceStats, gradeTrace, speedCross, distCross } from '../../gps-core.js';

const worker = withAutoRefresh(rawWorker);
const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg, extra) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('\n[threshold interpolation — unit]');
{
  const p = [{ t: 0, v: 90 }, { t: 100, v: 110 }];
  ok(near(speedCross(p, 100).t, 50, 1e-9), 'speed 100 between 90@0 and 110@100 → t=50 ms');
  ok(speedCross(p, 120) === null, 'threshold never reached → null (no fake time)');
  ok(dragTime([{ t: 0, v: 0, lat: 0, lon: 0 }], '0-100') === null, 'one point → null');
  const c = [{ t: 0, v: 36 }, { t: 1000, v: 36 }, { t: 2000, v: 36 }];
  ok(near(distCross(c, 15, 0), 1500, 1e-6), 'distance 15 m at constant 10 m/s → 1.5 s (trapezoid)');
  for (const hz of [10, 25]) {
    for (const [disc, t] of [['0-100', 4.4], ['100-200', 9.1], ['80-120', 2.6], ['402m', 12.3]]) {
      const w = dragTraceFor(disc, t, { hz });
      const got = dragTime(decodeTrace(w).pts, disc);
      ok(got != null && near(got, t, 0.1), `${disc} ${hz} Гц: client dragTime(trace) ≈ ${t}`, got);
    }
  }
}

const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1' };
let ipSeq = 1;
async function call(method, path, { body, token } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.105.0.' + (ipSeq++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
async function login(phone, nick) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  return { token: v.data.token };
}
const A = await login('79010500001', 'Мага');

console.log('\n[drag top: external ≥10 Hz only]');
let seed = 10;
for (const [disc, t] of [['0-100', 4.4], ['100-200', 9.1], ['80-120', 2.6], ['402m', 12.3]]) {
  let r = await call('POST', '/tops/drag/' + disc, { token: A.token, body: dragBody(disc, t, {}, { src: 'phone', hz: 1, seed: seed++ }) });
  ok(r.status === 422 && r.data.code === 'phone_source', `${disc}: phone → 422 phone_source`, r);
  r = await call('POST', '/tops/drag/' + disc, { token: A.token, body: dragBody(disc, t, {}, { src: 'sim', hz: 10, seed: seed++ }) });
  ok(r.status === 422 && r.data.code === 'simulator', `${disc}: simulator → 422 simulator`, r);
  r = await call('POST', '/tops/drag/' + disc, { token: A.token, body: dragBody(disc, t, {}, { src: 'ext', hz: 5, seed: seed++ }) });
  ok(r.status === 422 && r.data.code === 'low_hz', `${disc}: external 5 Hz → 422 low_hz`, r);
  r = await call('POST', '/tops/drag/' + disc, { token: A.token, body: dragBody(disc, t, {}, { src: 'ext', hz: 10, acc: 20, seed: seed++ }) });
  ok(r.status === 422 && r.data.code === 'gps_c', `${disc}: external 10 Hz but ±20 m → 422 gps_c`, r);
  const body = dragBody(disc, t, { t: 1.11 }, { src: 'ext', hz: 10, seed: seed++ });
  r = await call('POST', '/tops/drag/' + disc, { token: A.token, body });
  const rows = Array.isArray(r.data) ? r.data : r.data?.rows || [];
  const mine = rows[0];
  const expect = dragTime(decodeTrace(body.trace).pts, disc);
  ok(r.status === 200 && mine && mine.src === 'ext' && (mine.gpsQ === 'A' || mine.gpsQ === 'B'), `${disc}: external 10 Hz A/B → accepted`, r);
  ok(mine && near(mine.t, expect, 0.011) && !near(mine.t, 1.11, 0.05), `${disc}: server time = same dragTime(trace), client t ignored`, { mine, expect });
}
console.log('\n[straight 0–100 card top follows the same rule]');
{
  let r = await call('POST', '/tops/straight/m4csl', { token: A.token, body: { name: 'Мага', ...dragBody('0-100', 4.6, {}, { src: 'phone', hz: 1, seed: 99 }) } });
  ok(r.status === 422 && r.data.code === 'phone_source', 'straight via phone → phone_source', r);
}
console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v105 all passed');
process.exit(fails ? 1 : 0);
