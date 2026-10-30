// v234: город пилота и фильтр топов по городу — node test/v234.test.mjs
import rawWorker, { sanitizeCity } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { dragBody } from './traces.mjs';
const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const env = { PITLANE: new MemKV(), SMS_DEMO: '1' };
let ipn = 1;
async function call(method, path, { body, token } = {}) {
  const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.234.0.' + (ipn++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: r.status, data: d };
}
async function login(phone, nick) { const o = await call('POST', '/auth/otp', { body: { phone } }); const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } }); return { token: v.data.token, id: v.data.pilotId }; }
ok(sanitizeCity('  Москва ') === 'Москва' && sanitizeCity('<b>') === '' && sanitizeCity('Санкт-Петербург') === 'Санкт-Петербург', 'sanitizeCity');
const A = await login('79002340001', 'Мага'), B = await login('79002340002', 'Артём');
let r = await call('PUT', '/me', { token: A.token, body: { city: 'Махачкала' } });
ok(r.data.city === 'Махачкала', 'город сохранён', r.data);
r = await call('PUT', '/me', { token: B.token, body: { city: 'Москва' } });
await call('POST', '/tops/drag/0-100', { token: A.token, body: dragBody('0-100', 4.6) });
await call('POST', '/tops/drag/0-100', { token: B.token, body: dragBody('0-100', 4.4) });
r = await call('GET', '/tops/drag/0-100');
ok(Array.isArray(r.data) && r.data.length === 2, 'без фильтра — все', r.data);
r = await call('GET', '/tops/drag/0-100?city=' + encodeURIComponent('махачкала'));
ok(r.data.length === 1 && r.data[0].city === 'Махачкала', 'фильтр по городу (регистр не важен)', r.data);
r = await call('PUT', '/me', { token: A.token, body: { city: '' } });
ok(r.data.city === '', 'город можно убрать');
r = await call('PUT', '/me', { token: A.token, body: { nick: 'Мага' } });
ok(r.status === 200, 'старый клиент без city — ок');
console.log(fails ? `FAIL ${fails}` : 'OK'); process.exit(fails ? 1 : 0);
