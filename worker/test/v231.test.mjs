// v231: античит — замер «подтверждён чипом» (отметка пришла от чипа в GpsLive DO) — node test/v231.test.mjs
import rawWorker, { GpsLive } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { makeLive } from './livemock.mjs';
import { dragBody } from './traces.mjs';
const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const kv = new MemKV(); const live = makeLive(GpsLive);
const env = { PITLANE: kv, SMS_DEMO: '1', GPS_LIVE: live.ns, __WebSocketPair: live.Pair, __upgrade: live.upgrade };
Object.assign(live.env, { PITLANE: kv, __WebSocketPair: live.Pair, __upgrade: live.upgrade });
let ipn = 1;
async function call(method, path, { body, token, headers = {} } = {}) {
  const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.231.0.' + (ipn++ % 250), ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: r.status, data: d };
}
async function login(phone, nick) { const o = await call('POST', '/auth/otp', { body: { phone } }); const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } }); return { token: v.data.token, id: v.data.pilotId }; }
const tick = () => new Promise((r) => setTimeout(r, 0));
const A = await login('79002310001', 'Мага');
const B = await login('79002310002', 'Артём');
const code = (await call('POST', '/gps/pair', { token: A.token })).data.code;
const TOK = (await call('POST', '/gps/claim', { body: { code, name: 'PITLANE-GPS-1', fw: '2.0.0' } })).data.token;
await call('GET', '/gps/ws', { headers: { Upgrade: 'websocket', Authorization: 'Bearer ' + TOK } });
const chip = live.takeClient(); await tick();
await chip.send(JSON.stringify({ h: 1, bid: 'b231aaaa' }));
await chip.send(JSON.stringify({ e: 'launch', id: 1 }));
await chip.send(JSON.stringify({ e: 'mark', id: 2, k: '0-100', ms: 4500 }));
await chip.send(JSON.stringify({ e: 'end', id: 3, vmax: 120 }));

console.log('[чип подтверждает]');
let r = await call('POST', '/tops/drag/0-100', { token: A.token, body: dragBody('0-100', 4.5) });
ok(r.status === 200 && r.data.chip === 1, 'время совпало с отметкой чипа → chip=1', r.data);
const row = (r.data.rows || []).find((x) => x.chip === 1);
ok(!!row, 'в публичном топе поле chip');
r = await call('POST', '/tops/drag/0-100', { token: A.token, body: dragBody('0-100', 4.5, { carId: 'other-car' }) });
ok(r.status === 200 && r.data.chip === 0, 'одна отметка чипа зачитывается один раз', r.data);
r = await call('POST', '/tops/drag/0-100', { token: A.token, body: dragBody('0-100', 5.2, { carId: 'car-3' }) });
ok(r.status === 200 && r.data.chip === 0, 'время не совпало → chip=0 (в топе, но не «чип»)', r.data);
r = await call('POST', '/tops/drag/0-100', { token: B.token, body: dragBody('0-100', 4.52) });
ok(r.status === 200 && r.data.chip === 0, 'чужой чип не подтверждает (DO на пилота)', r.data);
console.log('\n[совместимость]');
const env2 = { ...env, GPS_LIVE: undefined };
const r2 = await worker.fetch(new Request('https://api.test/tops/drag/0-100', { method: 'POST', headers: { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.231.9.9', Authorization: 'Bearer ' + A.token }, body: JSON.stringify(dragBody('0-100', 4.6, { carId: 'car-4' })) }), env2);
const d2 = await r2.json();
ok(r2.status === 200 && d2.ok && d2.chip === 0, 'без DO замер принимается, просто без «чип»', d2);
console.log(fails ? `\n${fails} FAILED` : '\nall v231 tests passed');
process.exit(fails ? 1 : 0);
