// v83 Paddock: likes, comments, public pilot profile — node test/paddock.test.mjs
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
const worker = withAutoRefresh(rawWorker);
import { MemKV } from './kvmock.mjs';
import { lapBody, dragBody } from './traces.mjs';

const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1' };
let ipSeq = 1;
async function call(method, path, { body, raw, token, ip } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.1.0.1' };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: raw != null ? raw : body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
async function login(phone, nick) {
  const ip = '10.8.' + (ipSeq++) + '.1';
  const o = await call('POST', '/auth/otp', { body: { phone }, ip });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick }, ip });
  return { token: v.data.token, id: v.data.pilotId, phone };
}
const A = await login('79001230001', 'Алиса');
const B = await login('79001230002', 'Боб');
const C = await login('79001230003', 'Спамер');
console.log('\n[v258: замер → сообщение в «Замеры»]');
let r = await call('POST', '/tops/drag/0-100', { token: A.token, body: dragBody('0-100', 3.94, { name: 'Алиса', car: 'BMW G87 M2' }) });
ok(r.status === 200 && r.data.stored, 'drag PB stored');
r = await call('GET', '/pulse');
const auto = (r.data || []).find((p) => p.auto && p.ch === 'runs');
ok(auto && auto.run && auto.run.d === '0-100' && Math.abs(auto.run.t - 3.94) < 0.1 && auto.run.ok === 1 && auto.text === '', 'PB сам стал сообщением в «Замеры» (ok=1)');
ok(auto && ['chip', 'phone'].includes(auto.run.src) && /G87/.test(auto.run.car), 'источник и машина в карточке');
r = await call('POST', '/tops/drag/0-100', { token: A.token, body: dragBody('0-100', 4.5, { name: 'Алиса', car: 'BMW G87 M2' }) });
r = await call('GET', '/pulse');
ok(r.data.filter((p) => p.auto).length === 1, 'не-PB → без авто-сообщения');
r = await call('POST', '/pulse', { token: B.token, body: { text: '', ch: 'runs', run: { d: '0-100', t: 2.1, src: 'chip', car: 'Fake' } } });
ok(r.status === 200 && r.data[0].run && !r.data[0].run.ok && r.data[0].run.src === 'phone', 'ручной замер без топа: не «в топе», не «чип»');
r = await call('POST', '/pulse', { token: A.token, body: { text: 'Сухо', ch: 'runs', run: { d: '0-100', t: auto.run.t, src: 'phone' } } });
ok(r.data[0].run.ok === 1 && r.data[0].run.src === auto.run.src, 'ручной замер из топа подтверждён, источник — с сервера');
r = await call('POST', '/pulse', { token: A.token, body: { text: '', run: { d: 'xx', t: 3 } } });
ok(r.status === 400, 'пустое сообщение с мусорным замером → 400');
r = await call('POST', '/pulse', { token: A.token, body: { text: '', run: { d: '0-100', t: 0.3 } } });
ok(r.status === 400, 'нереальное время → 400');
console.log(fails ? `\n✗ ${fails} failed` : '\nall ok'); process.exit(fails ? 1 : 0);
