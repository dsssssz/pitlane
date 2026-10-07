// v102: security audit regressions — node test/v102.test.mjs (MemKV only, no prod, no real Telegram)
import crypto from 'node:crypto';
import rawWorker, { tgWebhookPath, ROOM_SEASON_STARS } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
const worker = withAutoRefresh(rawWorker);
import { MemKV } from './kvmock.mjs';
import { lapTrace } from './traces.mjs';

const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg, extra) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };
const kv = new MemKV();
const SECRET = 'W'.repeat(40);
const BOT_TOKEN = '123456:' + 'B'.repeat(30);
const tgSent = [];
const env = {
  PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', TG_WEBHOOK_SECRET: SECRET,
  __fetch: async (u, o) => {
    const method = String(u).split('/').pop();
    tgSent.push({ method, body: JSON.parse(o.body || '{}') });
    const result = method === 'createInvoiceLink' ? 'https://t.me/$TESTINVOICE' : method === 'savePreparedInlineMessage' ? { id: 'prep1' } : true;
    return new Response(JSON.stringify({ ok: true, result }), { headers: { 'Content-Type': 'application/json' } });
  },
};
const realNow = Date.now; let shift = 0;
Date.now = () => realNow() + shift;
const DAYMS = 86400000;
let ipSeq = 1;
async function call(method, path, { body, token, ip, rawBody, headers: xh } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.102.0.' + (ipSeq++ % 250), ...(xh || {}) };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: rawBody != null ? rawBody : body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text, headers: res.headers };
}
async function hook(update, { secret = SECRET, path } = {}) {
  const P = path || '/tg/webhook/' + tgWebhookPath(SECRET);
  const h = { 'Content-Type': 'application/json' };
  if (secret != null) h['X-Telegram-Bot-Api-Secret-Token'] = secret;
  const res = await worker.fetch(new Request('https://api.test' + P, { method: 'POST', headers: h, body: JSON.stringify(update) }), env);
  return { status: res.status, data: await res.json() };
}
async function login(phone, nick) {
  const ip = '10.102.' + (ipSeq++) + '.1';
  const o = await call('POST', '/auth/otp', { body: { phone }, ip });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick }, ip });
  return { token: v.data.token, id: v.data.pilotId };
}
function tmaInit(fields, token = BOT_TOKEN) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
const lap = (ms, o = {}) => ({ t: fmt(ms), ms, gps: true, valid: true, gpsQ: 'A', avgAcc: 3, hz: 10, sectors: [Math.round(ms * 0.32), Math.round(ms * 0.66), ms], trackId: 'sochi', trace: lapTrace(ms), ...o });

const A = await login('79010200001', 'Капитан');
const B = await login('79010200002', 'Пилот');
const C = await login('79010200003', 'Чужой');
for (const P of [A, B, C]) await call('PUT', '/me/car', { token: P.token, body: { model: 'BMW M2 G87', tyre: 'Michelin PS4S' } });
await kv.put('auth:tg:6001', A.id);
await kv.put('auth:tg:6002', B.id);

console.log('\n[initData: HMAC + auth_date freshness]');
const nowSec = () => Math.floor(Date.now() / 1000);
const user = JSON.stringify({ id: 6100100, first_name: 'Тест' });
let r = await call('POST', '/auth/tma', { body: { initData: tmaInit({ user, auth_date: String(nowSec() - 1800) }) } });
ok(r.status === 200 && r.data.token, '30-min-old initData → login ok');
r = await call('POST', '/auth/tma', { body: { initData: tmaInit({ user, auth_date: String(nowSec() - 2 * 3600) }) } });
ok(r.status === 401 && r.data.error === 'auth expired', '2-h-old initData → 401 for login (was accepted up to 24 h)', r);
r = await call('POST', '/tma/share-prepare', { body: { initData: tmaInit({ user, auth_date: String(nowSec() - 2 * 3600) }), param: 'tops_sochi', text: 'x' } });
ok(r.data?.error !== 'auth expired', 'share-prepare keeps the 24 h window (long-open Mini App can still share)', r);
r = await call('POST', '/auth/tma', { body: { initData: tmaInit({ user, auth_date: String(nowSec()) }, '999:' + 'Z'.repeat(30)) } });
ok(r.status === 401, 'initData signed by another bot → 401');
const forged = tmaInit({ user, auth_date: String(nowSec()) }).replace('6100100', '6100101');
r = await call('POST', '/auth/tma', { body: { initData: forged } });
ok(r.status === 401, 'tampered user id → 401');
r = await call('POST', '/auth/tma', { body: { initData: tmaInit({ user, auth_date: String(nowSec() + 3600) }) } });
ok(r.status === 401, 'auth_date in the future → 401');

console.log('\n[anti-cheat: per-track lap floor + sector plausibility]');
r = await call('POST', '/tops/lap/sochi', { token: A.token, body: lap(75_000) });
ok(r.status === 422, 'Sochi 1:15 (avg 281 km/h, faster than F1) → rejected 422', r.status);
r = await call('POST', '/tops/lap/sochi', { token: A.token, body: lap(86_000) });
ok(r.status === 200, 'Sochi 1:26 → accepted', r);
r = await call('POST', '/tops/lap/moscow', { token: A.token, body: lap(50_000, { trackId: 'moscow' }) });
ok(r.status === 422 && r.data.code === 'track_uncalibrated', 'v104: Moscow Raceway (not calibrated) → no public top');
r = await call('POST', '/tops/lap/karting-x', { token: A.token, body: lap(40_000, { trackId: 'karting-x' }) });
ok(r.status === 422 && r.data.code === 'track_uncalibrated', 'v104: unknown track → personal only (422 track_uncalibrated)', r);
r = await call('POST', '/tops/lap/sochi', { token: B.token, body: lap(120_000, { sectors: [1000, 2000, 120000] }) });
let tops = await call('GET', '/tops/lap/sochi');
let rowB = (Array.isArray(tops.data) ? tops.data : []).find((x) => x.name === 'Пилот');
ok(r.status === 200 && rowB && rowB.sectors && rowB.sectors[0] > 30000, 'v104: client sectors ignored — server S1/S2 gates', rowB);
r = await call('POST', '/tops/lap/sochi', { token: C.token, body: lap(121_000, { sectors: [40000, 80000, 125000] }) });
tops = await call('GET', '/tops/lap/sochi');
const rowC = tops.data.find((x) => x.name === 'Чужой');
ok(rowC && rowC.sectors && rowC.sectors[2] === rowC.ms, 'v104: sector marks come from the server (last = lap)');

console.log('\n[rooms: IDOR, captain rights, paywall on the server]');
r = await call('POST', '/rooms', { token: A.token, body: { name: 'Audit Team' } });
const room = r.data;
await call('POST', '/rooms/join', { token: B.token, body: { code: room.invite } });
r = await call('GET', '/rooms/' + room.id + '/laps', { token: C.token });
ok(r.status === 403, 'non-member cannot read room laps');
r = await call('POST', '/rooms/' + room.id + '/laps', { token: C.token, body: lap(120_000) });
ok(r.status === 403, 'non-member cannot post a lap into the room');
r = await call('POST', '/rooms/' + room.id + '/invite', { token: B.token, body: {} });
ok(r.status === 403, 'member cannot rotate invite (captain only)');
r = await call('POST', '/rooms/' + room.id + '/laps', { token: B.token, body: lap(70_000) });
ok(r.status === 422, 'room lap faster than the Sochi floor → rejected');
r = await call('POST', '/rooms/' + room.id + '/laps', { token: B.token, body: lap(120_000) });
ok(r.status === 200, 'room lap ok');
r = await call('POST', '/rooms/' + room.id + '/laps', { token: B.token, body: lap(110_000, { trackId: 'moscow', t: fmt(110_000) }) });
ok(r.status === 402 || r.status === 403, 'free room: 2nd track refused by the server (paywall is not client-only)', r);

console.log('\n[Stars: payment spoofing]');
const payload = `rs1:${room.id}:${B.id}`;
const until0 = JSON.parse(await kv.get('room:' + room.id)).paidUntil || 0;
const paid = (o) => ({ message: { message_id: 1, chat: { id: 6002, type: 'private' }, from: { id: 6002 }, successful_payment: { currency: 'XTR', total_amount: ROOM_SEASON_STARS, invoice_payload: payload, telegram_payment_charge_id: 'ch_' + Math.random().toString(36).slice(2), ...o } } });
let w = await hook(paid({ total_amount: 1 }));
let until1 = JSON.parse(await kv.get('room:' + room.id)).paidUntil || 0;
ok(w.data.paid === false && until1 === until0, 'successful_payment with wrong amount does NOT extend the season', w);
w = await hook(paid({ currency: 'USD' }));
until1 = JSON.parse(await kv.get('room:' + room.id)).paidUntil || 0;
ok(w.data.paid === false && until1 === until0, 'wrong currency does not extend');
w = await hook(paid({}), { secret: null });
ok(w.status === 404, 'webhook without X-Telegram-Bot-Api-Secret-Token → 404');
w = await hook(paid({}), { secret: 'X'.repeat(40) });
ok(w.status === 404, 'webhook with a wrong secret → 404');
w = await hook(paid({}), { path: '/tg/webhook/' + 'a'.repeat(32) });
ok(w.status === 404, 'webhook on a wrong path → 404');
tgSent.length = 0;
await hook({ pre_checkout_query: { id: 'q1', from: { id: 6002 }, currency: 'XTR', total_amount: ROOM_SEASON_STARS - 1, invoice_payload: payload } });
ok(tgSent.find((x) => x.method === 'answerPreCheckoutQuery')?.body.ok === false, 'pre_checkout with a lower price refused');
w = await hook(paid({}));
until1 = JSON.parse(await kv.get('room:' + room.id)).paidUntil || 0;
ok(w.data.paid === true && until1 > Date.now(), 'genuine payment extends the season');

console.log('\n[teams: join requests]');
const D = await login('79010200004', 'Заявка');
r = await call('POST', '/teams/' + room.id + '/request', { token: D.token, body: { note: 'возьмите' } });
ok(r.status === 200, 'request sent');
const roomEntry = kv.m.get('room:' + room.id);
r = await call('DELETE', '/teams/' + room.id + '/request', { token: C.token });
ok(r.status === 200 && kv.m.get('room:' + room.id) === roomEntry, 'DELETE request with nothing to cancel → room record not rewritten');
let last;
for (let i = 0; i < 31; i++) last = await call('DELETE', '/teams/' + room.id + '/request', { token: C.token });
ok(last.status === 429, 'DELETE request is rate-limited');
shift = 15 * DAYMS;
const E = await login('79010200005', 'Новый');
await call('PUT', '/me/car', { token: E.token, body: { model: 'Audi RS3', tyre: 'PS4S' } });
r = await call('POST', '/teams/' + room.id + '/request', { token: E.token, body: {} });
const reqs = JSON.parse(await kv.get('room:' + room.id)).requests || [];
ok(r.status === 200 && reqs.length === 1 && reqs[0].pilotId === E.id, 'requests older than 14 days expire', reqs.map((x) => x.nick));
shift = 0;

console.log('\n[feed: XSS payloads stay text, no PII]');
r = await call('POST', '/teams/' + room.id + '/posts', { token: B.token, body: { text: '<img src=x onerror=alert(1)>' } });
ok(r.status === 200, 'post with HTML accepted as plain text');
r = await call('GET', '/teams/' + room.id + '/feed');
const feedStr = JSON.stringify(r.data);
ok(!feedStr.includes(A.id) && !feedStr.includes(B.id) && !feedStr.includes('6002') && !feedStr.includes('7901020'), 'public feed: no pilot ids, Telegram ids or phones');
r = await call('GET', '/teams/' + room.id);
ok(!JSON.stringify(r.data).includes(B.id) && !JSON.stringify(r.data).includes('requests'), 'public team page: no ids, no join-request list');
r = await call('GET', '/teams/' + room.id + '/feed', { headers: { 'X-Pilot-Id': 'dev_' + 'a'.repeat(20) } });
ok(r.data.posts.every((p) => !p.canDelete && !p.mine), 'guest device id never gets owner/captain flags');
r = await call('POST', '/teams/' + room.id + '/posts', { token: B.token, body: { text: 'звони 8 900 123 45 67' } });
ok(r.status === 400, 'phone numbers rejected in posts');

console.log('\n[uploads]');
const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64');
r = await call('PUT', '/teams/' + room.id + '/avatar', { token: A.token, body: { image: svg } });
ok(r.status === 400, 'SVG avatar rejected');
const png = Buffer.alloc(800, 1); png.write('\x89PNG\r\n\x1a\n', 0, 'latin1');
r = await call('POST', '/teams/' + room.id + '/posts', { token: B.token, body: { text: 'фото', image: 'data:image/jpeg;base64,' + png.toString('base64') } });
ok(r.status === 400, 'PNG bytes labelled as JPEG rejected (magic bytes checked on the server)');
const html = Buffer.from('<html><script>alert(1)</script></html>'.padEnd(800, ' '));
r = await call('POST', '/teams/' + room.id + '/posts', { token: B.token, body: { text: 'фото', image: 'data:image/webp;base64,' + html.toString('base64') } });
ok(r.status === 400, 'HTML disguised as webp rejected');

console.log('\n[DoS: body size, field length, GPS points]');
r = await call('POST', '/rooms/' + room.id + '/laps', { token: B.token, rawBody: JSON.stringify({ ...lap(121_000), pad: 'x'.repeat(420 * 1024) }) });
ok(r.status === 413, 'v104: room lap body > 400 KB (trace cap) rejected', r.status);
r = await call('POST', '/teams/' + room.id + '/posts', { token: B.token, rawBody: JSON.stringify({ text: 'x', image: 'data:image/webp;base64,' + 'A'.repeat(400000) }) });
ok(r.status === 413 || r.status === 400, 'oversized post image body rejected', r.status);
r = await call('POST', '/ghost', { token: B.token, rawBody: JSON.stringify({ kind: 'lap', ref: 'sochi', ms: 120000, pts: Array.from({ length: 200000 }, (_, i) => [i, i, i]) }) });
ok(r.status === 413 || r.status === 400, 'ghost with 200k GPS points rejected', r.status);
r = await call('PUT', '/teams/' + room.id, { token: A.token, body: { name: 'N'.repeat(500) } });
ok(r.status === 200 && r.data.name.length <= 48, 'team name capped at 48');

console.log('\n[CORS]');
const cors = await worker.fetch(new Request('https://api.test/teams', { method: 'GET', headers: { Origin: 'https://evil.example' } }), env);
ok(cors.headers.get('Access-Control-Allow-Origin') !== 'https://evil.example' && cors.headers.get('Access-Control-Allow-Origin') !== '*', 'foreign Origin is not reflected');
ok(cors.headers.get('X-Content-Type-Options') === 'nosniff', 'API responses carry nosniff');

console.log(fails ? `\n${fails} v102 test(s) FAILED` : '\nall v102 tests passed');
process.exit(fails ? 1 : 0);
