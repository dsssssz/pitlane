// v116: PITLANE GPS over Wi-Fi — pairing, device tokens, live Durable Object (mocked WS) — node test/v116.test.mjs
import rawWorker, { GpsLive } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { makeLive } from './livemock.mjs';
const worker = withAutoRefresh(rawWorker);
const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg, x) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const kv = new MemKV();
const live = makeLive(GpsLive);
const env = { PITLANE: kv, SMS_DEMO: '1', GPS_LIVE: live.ns };
Object.assign(live.env, { PITLANE: kv }, { __WebSocketPair: live.Pair, __upgrade: live.upgrade });
env.__WebSocketPair = live.Pair; env.__upgrade = live.upgrade;
let ipSeq = 1;
async function call(method, path, { body, token, ip, headers = {} } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.116.0.' + (ipSeq++ % 250), ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
async function login(phone, nick) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  return { token: v.data.token, id: v.data.pilotId, nick };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const A = await login('79001160001', 'Мага');
const B = await login('79001160002', 'Артём');

console.log('[pairing]');
let r = await call('POST', '/gps/pair');
ok(r.status === 401, 'pair needs an account');
r = await call('POST', '/gps/pair', { token: A.token });
const code = r.data.code;
ok(r.status === 200 && /^[A-HJ-NP-Z2-9]{6}$/.test(code) && r.data.ttl === 1200, 'pair → 6-char code, 20 min', r.data);
r = await call('POST', '/gps/claim', { body: { code: 'abc' } });
ok(r.status === 400 && r.data.code === 'bad_code', 'malformed code → 400');
r = await call('POST', '/gps/claim', { body: { code: 'ZZZZZZ' } });
ok(r.status === 404 && r.data.code === 'code_expired', 'unknown code → 404');
r = await call('POST', '/gps/claim', { body: { code: code.toLowerCase(), name: 'PITLANE-GPS-1A2B', fw: '2.0.0' } });
const TOK = r.data.token; const DEV = r.data.devId;
ok(r.status === 200 && /^[a-f0-9]{48}$/.test(TOK) && /^g[a-z0-9]{8}$/.test(DEV), 'claim → device token (once)', r.data);
r = await call('POST', '/gps/claim', { body: { code } });
ok(r.status === 404, 'code is single-use');
let anyPlain = false;
for (const k of (await kv.list({ prefix: 'gps' })).keys) { const v = await kv.get(k.name); if (String(v).includes(TOK) || k.name.includes(TOK)) anyPlain = true; }
ok(!anyPlain, 'token is stored only as a hash');
r = await call('GET', '/gps/devices', { token: A.token });
ok(r.status === 200 && r.data.devices.length === 1 && r.data.devices[0].devId === DEV && r.data.devices[0].name === 'PITLANE-GPS-1A2B' && !('h' in r.data.devices[0]) && r.data.live && r.data.live.online === false, 'devices list (public fields, offline)', r.data);
r = await call('GET', '/gps/devices', { token: B.token });
ok(r.data.devices.length === 0, 'other pilot sees none');

console.log('\n[live: chip + app sockets]');
const wsHdr = (extra) => ({ Upgrade: 'websocket', ...extra });
r = await call('GET', '/gps/ws', { headers: wsHdr({ Authorization: 'Bearer ' + 'f'.repeat(48) }) });
let bad = live.takeClient();
ok(r.headers.get('x-ws') === '1' && bad.inbox[0]?.err === 'token' && bad.closed, 'bad device token → socket says {err:token} and closes');
r = await call('GET', '/gps/ws', { headers: { Authorization: 'Bearer ' + TOK } });
ok(r.status === 426, 'no upgrade → 426');
r = await call('GET', '/gps/live', { headers: wsHdr({}) });
ok(r.status === 401, 'app socket without session → 401');
r = await call('GET', '/gps/live', { headers: wsHdr({ 'Sec-WebSocket-Protocol': 'pitlane.v1, bearer.' + A.token, Origin: 'https://evil.example' }) });
ok(r.status === 403, 'foreign Origin → 403');
r = await call('GET', '/gps/live', { headers: wsHdr({ 'Sec-WebSocket-Protocol': 'pitlane.v1, bearer.' + A.token }) });
const app = live.takeClient();
ok(r.headers.get('x-ws') === '1' && r.headers.get('Sec-WebSocket-Protocol') === 'pitlane.v1' && app.inbox[0]?.type === 'hello' && app.inbox[0].dev.on === false, 'app socket: subprotocol echoed, hello (chip offline)', app?.inbox);
r = await call('GET', '/gps/ws', { headers: wsHdr({ Authorization: 'Bearer ' + TOK }) });
const chip = live.takeClient();
await tick();
ok(!!chip && app.inbox.some((m) => m.type === 'dev' && m.on === true && m.devId === DEV), 'chip online → app notified');
const rows = (n, off = 0, v0 = 0) => Array.from({ length: n }, (_, i) => [i * 40, 555716000 + (off + i) * 30, 381419000, v0 + (off + i) * 30, 90, 12, 14, 11]);
const now = Date.now();
await chip.send(JSON.stringify({ b: 0, t0: now, p: rows(5) }));
ok(!app.inbox.some((m) => m.type === 'pts'), 'batch before hello ignored');
await chip.send(JSON.stringify({ h: 1, bid: 'BAD!', fw: '2.0.0' }));
ok(!chip.inbox.length, 'hello with bad boot id ignored');
await chip.send(JSON.stringify({ h: 1, bid: 'a1b2c3d4', fw: '2.0.0' }));
ok(chip.inbox.at(-1)?.ack === -1, 'hello → ack -1 (new boot)');
await chip.send(JSON.stringify({ b: 0, t0: now, p: rows(5) }));
let pts = app.inbox.filter((m) => m.type === 'pts');
ok(pts.length === 1 && pts[0].q === 0 && pts[0].p.length === 5 && pts[0].bid === 'a1b2c3d4' && chip.inbox.at(-1).ack === 4, 'batch → app (5 pts), ack 4');
await chip.send(JSON.stringify({ b: 0, t0: now, p: rows(5) }));
ok(app.inbox.filter((m) => m.type === 'pts').length === 1 && chip.inbox.at(-1).ack === 4, 'resend of acked batch: dropped, re-acked (idempotent)');
await chip.send(JSON.stringify({ b: 3, t0: now + 120, p: rows(5, 3) }));
pts = app.inbox.filter((m) => m.type === 'pts');
ok(pts.length === 2 && pts[1].q === 5 && pts[1].p.length === 3 && pts[1].t0 === now + 120 + 80 && pts[1].p[0][0] === 0 && chip.inbox.at(-1).ack === 7, 'overlapping resend: only new points forwarded, times rebased', pts[1]);
await chip.send(JSON.stringify({ b: 8, t0: now, p: [[0, 1, 2, 99999, 1, 1, 1, 1]] }));
ok(app.inbox.filter((m) => m.type === 'pts').length === 2, 'implausible row (speed) rejected');
await chip.send(JSON.stringify({ b: 8, t0: now - 7 * 3600e3, p: rows(2) }));
ok(app.inbox.filter((m) => m.type === 'pts').length === 2, 'batch older than 6 h rejected');
await chip.send(JSON.stringify({ e: 'mark', id: 1, k: '0-100', ms: 3412, at: now + 3400 }));
let evs = app.inbox.filter((m) => m.type === 'ev');
ok(evs.length === 1 && evs[0].k === '0-100' && evs[0].ms === 3412 && chip.inbox.at(-1).eack === 1, 'mark event → app + eack');
await chip.send(JSON.stringify({ e: 'mark', id: 1, k: '0-100', ms: 3412 }));
ok(app.inbox.filter((m) => m.type === 'ev').length === 1 && chip.inbox.at(-1).eack === 1, 'duplicate event ignored, re-acked');
await chip.send(JSON.stringify({ e: 'mark', id: 2, k: '0-999', ms: 1 }));
await chip.send(JSON.stringify({ e: 'evil', id: 3 }));
ok(app.inbox.filter((m) => m.type === 'ev').length === 1, 'unknown mark / event kind rejected');
await chip.send(JSON.stringify({ e: 'end', id: 4, vmax: 301.27, marks: { '0-100': 3412, '0-200': 10950, '0-300': 27001, 'x': 5 } }));
evs = app.inbox.filter((m) => m.type === 'ev');
ok(evs.length === 2 && evs[1].e === 'end' && evs[1].vmax === 301.3 && evs[1].marks['0-300'] === 27001 && !('x' in evs[1].marks), 'end event with marks (sanitised)', evs[1]);
await chip.send(JSON.stringify({ s: { hz: 25, bat: 3950, pct: 71, sv: 14, rssi: -61, buf: 0, fix: 11, fw: '2.0.0<script>' } }));
const st = app.inbox.filter((m) => m.type === 'st').at(-1);
ok(st && st.hz === 25 && st.pct === 71 && st.fw === null, 'status forwarded, junk fw dropped', st);
await chip.send('x'.repeat(13000));
ok(true, 'oversized message ignored (no throw)');

console.log('\n[backlog + state]');
r = await call('GET', '/gps/live', { headers: wsHdr({ 'Sec-WebSocket-Protocol': 'pitlane.v1, bearer.' + A.token }) });
const app2 = live.takeClient();
ok(app2.inbox[0].type === 'hello' && app2.inbox[0].dev.on === true && app2.inbox.filter((m) => m.type === 'pts').length === 2 && app2.inbox.filter((m) => m.type === 'ev').length === 2, 'late app gets hello + recent points + events');
r = await call('GET', '/gps/devices', { token: A.token });
ok(r.data.live.online === true && r.data.live.status.hz === 25, 'devices shows chip online + status');
await app.send(JSON.stringify({ type: 'ping', c: 123 }));
ok(app.inbox.at(-1).type === 'pong' && app.inbox.at(-1).c === 123, 'app ping → pong (clock/latency)');

console.log('\n[reconnect: idempotent resume]');
chip.close(1006, 'lost');
await tick();
ok(app.inbox.some((m) => m.type === 'dev' && m.on === false), 'chip offline → app notified');
const objA = [...live.objs.values()][0];
ok(objA.ctx.storage._m.get('cur')?.seq === 7, 'last seq persisted once on disconnect');
objA.m = { ...objA.m, loaded: false, bid: null, seq: -1, ev: -1 }; // simulate eviction
r = await call('GET', '/gps/ws', { headers: wsHdr({ Authorization: 'Bearer ' + TOK }) });
const chip2 = live.takeClient();
await chip2.send(JSON.stringify({ h: 1, bid: 'a1b2c3d4' }));
ok(chip2.inbox.at(-1).ack === 7 && chip2.inbox.at(-1).eack === 4, 'after eviction the same boot resumes from ack 7 / eack 4');
await chip2.send(JSON.stringify({ b: 5, t0: now + 200, p: rows(6, 5) }));
pts = app.inbox.filter((m) => m.type === 'pts');
ok(pts.at(-1).q === 8 && pts.at(-1).p.length === 3, 'buffer resend after reconnect: only unacked points (8..10) delivered');
await chip2.send(JSON.stringify({ h: 1, bid: 'zz99yy88' }));
ok(chip2.inbox.at(-1).ack === -1, 'new boot id → fresh sequence');

console.log('\n[revoke]');
r = await call('DELETE', '/gps/devices/' + DEV, { token: B.token });
ok(r.status === 404, 'other pilot cannot revoke');
r = await call('DELETE', '/gps/devices/' + DEV, { token: A.token });
ok(r.status === 200 && r.data.devices.length === 0 && chip2.closed && chip2.inbox.some((m) => m.err === 'token'), 'revoke → live chip socket told {err:token} and closed');
r = await call('GET', '/gps/ws', { headers: wsHdr({ Authorization: 'Bearer ' + TOK }) });
bad = live.takeClient();
ok(bad.inbox[0]?.err === 'token', 'revoked token refused');

console.log('\n[limits]');
for (let i = 0; i < 3; i++) { const c = (await call('POST', '/gps/pair', { token: A.token })).data.code; await call('POST', '/gps/claim', { body: { code: c } }); }
r = await call('POST', '/gps/pair', { token: A.token });
ok(r.status === 409 && r.data.code === 'devices_full', 'max 3 chips per pilot');
let last;
for (let i = 0; i < 22; i++) last = await call('POST', '/gps/claim', { body: { code: 'ABCDEF' }, ip: '10.116.9.9' });
ok(last.status === 429, 'claim brute force rate-limited per IP');
let lp;
for (let i = 0; i < 12; i++) lp = await call('POST', '/gps/pair', { token: B.token });
ok(lp.status === 429, 'pair rate-limited per pilot');

console.log('\n[account deletion]');
const before = (await kv.list({ prefix: 'gpsdev:' })).keys.length;
r = await call('DELETE', '/account', { token: A.token });
const after = (await kv.list({ prefix: 'gpsdev:' })).keys.length;
ok(r.status === 200 && r.data.deleted.gpsDevices === 3 && before - after === 3 && !(await kv.get('gpsdevs:' + A.id)), 'chips unbound with the account', { before, after, d: r.data.deleted });
console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v116 all passed');
process.exit(fails ? 1 : 0);
