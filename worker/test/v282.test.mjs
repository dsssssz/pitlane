// v282: печать PITLANE — node test/v234.test.mjs
import rawWorker from '../src/index.js';
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
import { pnumSuccessfulPayment, pnumOf } from '../src/pnum.js';
const A = await login('79002820001', 'Мага'), B = await login('79002820002', 'Артём');
let r = await call('POST', '/stamp', { token: A.token, body: { disc: '0-100', t: 4.6 } });
ok(r.status === 409 && r.data.code === 'no_run', 'печать без записи — нет', r.data);
const p = await call('POST', '/tops/drag/0-100', { token: A.token, body: dragBody('0-100', 4.6) });
const t = p.data?.row?.t ?? p.data?.t ?? (await call('GET', '/tops/drag/0-100?cls=ab')).data?.[0]?.t ?? 4.6;
let rows = (await call('GET', '/tops/drag/0-100')).data; rows = Array.isArray(rows) ? rows : (rows.rows || []);
const tt = rows.find((x) => x.nick === 'Мага')?.t ?? t;
r = await call('POST', '/stamp', { token: A.token, body: { disc: '0-100', t: tt } });
ok(r.status === 200 && /^[2-9A-HJ-NP-Z]{8}$/.test(r.data.stamp?.code) && r.data.stamp.nick === 'Мага', 'печать создана из строки доски', r.data);
const code = r.data.stamp?.code;
const r2 = await call('POST', '/stamp', { token: A.token, body: { disc: '0-100', t: tt } });
ok(r2.data.stamp?.code === code, 'повтор — тот же код');
r = await call('POST', '/stamp', { token: B.token, body: { disc: '0-100', t: tt } });
ok(r.status === 409, 'чужое время — не печатается');
r = await call('GET', '/stamp/' + code);
ok(r.status === 200 && r.data.stamp.t > 0 && !JSON.stringify(r.data).includes('pilotId') && !JSON.stringify(r.data).includes('7900'), 'проверка публичная, без id/телефонов', r.data);
r = await call('GET', '/stamp/AAAAAAAA');
ok(r.status === 404, 'неизвестный код — 404');
console.log(fails ? fails + ' FAIL' : 'OK'); process.exit(fails ? 1 : 0);
