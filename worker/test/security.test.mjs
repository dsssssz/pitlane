// v80 security regression tests: node test/security.test.mjs
import crypto from 'node:crypto';
import worker from '../src/index.js';
import { MemKV } from './kvmock.mjs';

const ORIGIN = 'https://dsssssz.github.io';
const BOT_TOKEN = '123456789:AAFakeTokenForLocalTestsOnly_xyz123';
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };

let kv = new MemKV();
const mkEnv = (extra = {}) => ({ PITLANE: kv, SMS_DEMO: '1', ...extra });
let ipSeq = 1;
async function call(env, method, path, { body, raw, token, headers = {}, ip } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.0.0.1', ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: raw != null ? raw : body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text, headers: res.headers };
}
async function login(env, phone, nick) {
  const ip = '10.9.' + (ipSeq++) + '.1';
  const o = await call(env, 'POST', '/auth/otp', { body: { phone }, ip });
  const v = await call(env, 'POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick }, ip });
  return { token: v.data.token, id: v.data.pilotId };
}
const guestPub = (id) => 'g_' + crypto.createHash('sha256').update('pitlane-guest:' + id).digest('hex').slice(0, 16);

const env = mkEnv();
const A = await login(env, '79001110001', 'Алиса');
const B = await login(env, '79001110002', 'Боб');

console.log('\n[headers / CORS / errors]');
let r = await call(env, 'GET', '/health');
ok(r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('cache-control') === 'no-store' && /default-src 'none'/.test(r.headers.get('content-security-policy') || ''), 'security headers on responses');
r = await call(env, 'GET', '/health', { headers: { Origin: 'http://localhost:5174' } });
ok(r.headers.get('access-control-allow-origin') === ORIGIN, 'localhost origin is not reflected in prod');
r = await call(env, 'GET', '/health', { headers: { Origin: 'https://evil.example' } });
ok(r.headers.get('access-control-allow-origin') === ORIGIN, 'foreign origin not reflected');
r = await call(mkEnv({ EXTRA_ORIGINS: 'http://127.0.0.1:5174' }), 'GET', '/health', { headers: { Origin: 'http://127.0.0.1:5174' } });
ok(r.headers.get('access-control-allow-origin') === 'http://127.0.0.1:5174', 'EXTRA_ORIGINS still works for dev');
r = await call(env, 'GET', '/nope/x');
ok(r.status === 404 && !('path' in r.data), '404 does not echo path');
const boom = { PITLANE: { get: async () => { throw new Error('secret internals at foo.js:1'); }, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [], list_complete: true }) } };
r = await call(boom, 'GET', '/pulse');
ok(r.status === 500 && r.data.error === 'internal error' && !/secret|foo\.js/.test(r.text), '500 hides error details / stack');
r = await call(env, 'GET', '/share/%E0%A4%A');
ok(r.status === 404, 'malformed %-escape → 404, not 500');

console.log('\n[body size / validation]');
r = await call(env, 'POST', '/share', { raw: JSON.stringify({ payload: { car: 'x'.repeat(20000) } }) });
ok(r.status === 413, 'share body > 8 KB → 413');
r = await call(env, 'POST', '/pulse', { token: A.token, raw: JSON.stringify({ text: 'x', img: 'data:image/jpeg;base64,' + 'A'.repeat(300000) }) });
ok(r.status === 413, 'pulse body > 256 KB → 413');
r = await call(env, 'POST', '/duel', { raw: '{bad json', headers: { 'X-Pilot-Id': 'dev_abcdefgh12' } });
ok(r.status === 400, 'bad JSON → 400');
const lap = (o = {}) => ({ name: 'Алиса', car: 'M2', t: '2:00.100', ms: 120100, gps: true, valid: true, gpsQ: 'A', ...o });
r = await call(env, 'POST', '/tops/lap/sochi', { token: A.token, body: lap() });
ok(r.status === 200, 'valid lap accepted');
for (const [label, body] of [
  ['lap 5 s', lap({ t: '0:05.000', ms: 5000 })],
  ['seconds ≥ 60', lap({ t: '1:75.000', ms: 135000 })],
  ['ms disagrees with t', lap({ ms: 60000 })],
  ['NaN ms', lap({ ms: 'NaN' })],
  ['negative t', lap({ t: '-1:00.000' })],
  ['huge lap', lap({ t: '99:59.000', ms: 5999000 })],
]) {
  r = await call(env, 'POST', '/tops/lap/sochi', { token: A.token, body });
  ok(r.status === 400, 'rejects ' + label);
}
r = await call(env, 'POST', '/tops/lap/sochi', { token: A.token, body: lap({ t: '2:01.000', ms: 121000, dist: 'abc', slipAvg: 1e9, avgAcc: -5, hz: 1e6 }) });
const row = r.data.find((x) => x.t === '2:01.000');
ok(row && row.dist === undefined && row.slipAvg === undefined && row.avgAcc === undefined && row.hz === undefined, 'NaN / absurd numeric fields dropped');
for (const t of [0.4, -3, 0, 1e9, 'x']) {
  r = await call(env, 'POST', '/tops/straight/m2', { token: A.token, body: { name: 'A', car: 'M2', t, gps: true, valid: true, gpsQ: 'A' } });
  ok(r.status === 400, 'straight t=' + t + ' rejected');
}
r = await call(env, 'POST', '/tops/straight/' + encodeURIComponent('a b<script>'), { token: A.token, body: { car: 'M2', t: 4, gps: true, gpsQ: 'A' } });
ok(r.status === 400, 'car id must be a slug (no junk KV keys)');
r = await call(env, 'POST', '/tops/lap/sochi', { token: A.token, body: lap({ t: '2:02.000', ms: 122000, name: '<img src=x onerror=alert(1)>', car: 'M2<svg/onload=1>' }) });
ok(!/[<>]/.test(JSON.stringify(r.data)), 'angle brackets stripped from names / car');
r = await call(env, 'POST', '/tops/lap/sochi', { token: A.token, body: lap({ t: '2:03.000', ms: 123000, avatar: 'https://evil.example/p.gif' }) });
ok(!(await kv.get('pilotmeta:' + A.id) || '').includes('evil.example'), 'non-Telegram https avatar refused (IP-tracking pixel)');

console.log('\n[pulse IDOR / size]');
r = await call(env, 'POST', '/pulse', { token: A.token, body: { id: 'victim', text: 'hi from A' } });
const postA = r.data[0];
ok(postA.id !== 'victim' && /^[a-z0-9]+-[a-z0-9]{8}$/.test(postA.id), 'pulse id is server-generated (client id ignored)');
r = await call(env, 'DELETE', '/pulse/' + postA.id, { token: B.token });
ok(r.data.some((x) => x.id === postA.id), 'B cannot delete A\'s post');
r = await call(env, 'DELETE', '/pulse/' + postA.id);
ok(r.status === 401, 'anonymous delete → 401');
r = await call(env, 'POST', '/pulse/' + postA.id + '/like');
ok(r.status === 401, 'anonymous like → 401');
{
  const big = [];
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(190000);
  for (let i = 0; i < 60; i++) big.push({ id: 'b' + i, who: 'x', text: 't', img, at: Date.now() - i, likes: [], pilotId: A.id });
  await kv.put('pulse', JSON.stringify(big));
  r = await call(env, 'POST', '/pulse', { token: B.token, body: { text: 'trim me' } });
  ok((await kv.get('pulse')).length <= 3_000_000 && r.data[0].text === 'trim me', 'pulse list capped at ~3 MB (oldest dropped)');
  await kv.put('pulse', '[]');
}

console.log('\n[crews / duels IDOR]');
const G1 = 'dev_guestone1234', G2 = 'dev_guesttwo5678';
r = await call(env, 'POST', '/crew', { headers: { 'X-Pilot-Id': G1 }, body: { name: 'Neon', trackId: 'sochi', nick: 'Гость1' } });
const crew = r.data;
ok(r.status === 200 && crew.inviteCode, 'creator gets invite code');
ok(!JSON.stringify(crew).includes(G1) && crew.members[0].pilotId === guestPub(G1), 'guest device id is published only as non-reversible g_… hash');
r = await call(env, 'GET', '/crew/' + crew.id);
ok(r.status === 200 && r.data.inviteCode === undefined, 'non-member does not see invite code');
r = await call(env, 'GET', '/crew/' + crew.id, { headers: { 'X-Pilot-Id': G1 } });
ok(r.data.inviteCode === crew.inviteCode, 'member sees invite code');
r = await call(env, 'GET', '/crews?mine=' + G1, { headers: { 'X-Pilot-Id': G2 } });
ok(Array.isArray(r.data) && r.data.length === 0, 'cannot list another pilot\'s crews');
r = await call(env, 'GET', '/crews?mine=' + G1, { headers: { 'X-Pilot-Id': G1 } });
ok(r.data.length === 1 && r.data[0].inviteCode === crew.inviteCode, 'own crews listed with code');
r = await call(env, 'POST', '/crew', { body: { name: 'NoId', trackId: 'sochi', nick: 'x' } });
ok(r.status === 400, 'guest without device id cannot create crew');
r = await call(env, 'POST', '/crew', { headers: { 'X-Pilot-Id': 'dev_anon' }, body: { name: 'Anon', trackId: 'sochi', nick: 'x' } });
ok(r.status === 400, 'shared dev_anon id refused');
r = await call(env, 'POST', '/duel', { headers: { 'X-Pilot-Id': G1 }, body: { type: 'drag', createdBy: 'Гость1' } });
const duel = r.data;
ok(duel.createdBy.id === guestPub(G1) && !JSON.stringify(duel).includes(G1), 'duel creator id hashed in public output');
r = await call(env, 'POST', '/duel/' + duel.id + '/run', { headers: { 'X-Pilot-Id': guestPub(G1) }, body: { t: 4.2, gps: true, valid: true, gpsQ: 'A', car: 'M2' } });
ok(r.status === 400, 'published g_ id cannot be replayed as X-Pilot-Id');
r = await call(env, 'GET', '/duels?mine=' + G1, { headers: { 'X-Pilot-Id': G2 } });
ok(Array.isArray(r.data) && r.data.length === 0, 'cannot list another pilot\'s duels');
r = await call(env, 'GET', '/duels?mine=' + G1, { headers: { 'X-Pilot-Id': G1 } });
ok(r.data.length === 1, 'own duels listed');
r = await call(env, 'POST', '/crew', { headers: { 'X-Pilot-Id': G2 }, body: { name: 'Bad', trackId: '../../x' } });
ok(r.status === 400, 'crew trackId must be a slug');

console.log('\n[share whitelist]');
r = await call(env, 'POST', '/share', { body: { payload: { car: 'M2', nick: '+7 900 111-00-01', time: '4.10', type: 'lap', trackId: '"><img src=x onerror=alert(1)>', paint: 'url(https://evil/x)', sectors: [1, 2, 3], evil: 'x', pilotId: '79001110001' } } });
ok(r.status === 200 && r.data.id, 'share stored');
r = await call(env, 'GET', '/share/' + r.data.id);
ok(r.data.nick === 'пилот' && !r.data.trackId && !r.data.paint && !r.data.evil && !r.data.pilotId && r.data.sectors.length === 3, 'share payload whitelisted (phone nick, xss trackId, css paint, extra fields dropped)');
await kv.put('share:legacy1234', JSON.stringify({ nick: 'Мага', car: 'M2', time: '4.1', trackId: '"><svg onload=1>', phone: '79001110001' }));
r = await call(env, 'GET', '/share/legacy1234');
ok(r.data.nick === 'Мага' && !r.data.trackId && !r.text.includes('79001110001'), 'legacy stored share sanitized on read');

console.log('\n[sessions]');
r = await call(env, 'POST', '/auth/logout', { token: B.token });
ok(r.status === 200, 'logout ok');
r = await call(env, 'GET', '/me', { token: B.token });
ok(r.status === 401, 'token revoked after logout');
const tenv = mkEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
const nowSec = Math.floor(Date.now() / 1000);
const tg = { id: 777, first_name: 'X', auth_date: nowSec - 7200 };
tg.hash = crypto.createHmac('sha256', crypto.createHash('sha256').update(BOT_TOKEN).digest()).update(Object.keys(tg).sort().map((k) => k + '=' + tg[k]).join('\n')).digest('hex');
r = await call(tenv, 'POST', '/auth/telegram', { body: tg });
ok(r.status === 401 && r.data.error === 'auth expired', 'Login Widget payload older than 1 h → 401 (replay window)');

console.log('\n[rate limits]');
{
  const renv = mkEnv({ RL_WRITE: { limit: async () => ({ success: false }) }, RL_READ: { limit: async () => ({ success: true }) } });
  r = await call(renv, 'POST', '/share', { body: { payload: { car: 'x' } } });
  ok(r.status === 429 && r.headers.get('retry-after') === '60', 'RL_WRITE binding → 429');
  r = await call(renv, 'GET', '/health');
  ok(r.status === 200, 'reads unaffected by write limiter');
  let last;
  for (let i = 0; i < 12; i++) last = await call(env, 'POST', '/session/today/checkin', { ip: '10.7.7.7', headers: { 'X-Pilot-Id': 'dev_chk' + i + 'aaaaaaa' }, body: { nick: 'n' + i } });
  ok(last.status === 429, 'check-in limited per IP');
  const before = kv.puts;
  await call(env, 'POST', '/session/today/checkin', { ip: '10.7.7.7', body: { nick: 'again' } });
  ok(kv.puts === before, 'over-limit hits do not write to KV');
  let codes = [];
  for (let i = 0; i < 22; i++) codes.push((await call(env, 'POST', '/crew/join', { ip: '10.8.8.8', headers: { 'X-Pilot-Id': G2 }, body: { code: 'ZZZZ' + String(i).padStart(2, '0') } })).status);
  ok(codes.slice(-1)[0] === 429, 'invite-code guessing limited');
}

console.log('\n[feedback]');
kv = new MemKV();
const fenv = { PITLANE: kv, SMS_DEMO: '1' };
const U = await login(fenv, '79001110009', 'Фидбек');
const fb = (o = {}) => ({ type: 'bug', text: '[TEST] кнопка не работает', contact: '@me', elapsedMs: 5000, website: '', diag: { app: 'v80', sw: 'pitlane-v80', ua: 'UA', tier: 'high', tma: false, tab: 'garage', lat: 55.7, lon: 37.6, phone: '79001110009' }, ...o });
r = await call(fenv, 'POST', '/feedback', { body: fb(), ip: '10.1.1.1' });
ok(r.status === 200 && r.data.ok && r.data.forwarded === false, 'guest feedback stored, not forwarded without FEEDBACK_CHAT_ID');
let keys = [...kv.m.keys()].filter((k) => k.startsWith('feedback:'));
ok(keys.length === 1 && /^feedback:\d{13}:[a-z0-9]{10}$/.test(keys[0]), 'KV key feedback:<ts>:<id> → ' + keys[0]);
const ttl = kv.ttl(keys[0]);
ok(ttl > 179 * 86400 && ttl <= 180 * 86400, 'TTL ≈ 180 days');
const stored = JSON.parse(await kv.get(keys[0]));
ok(!('lat' in stored.diag) && !('phone' in stored.diag) && !JSON.stringify(stored).includes('55.7'), 'diagnostics whitelisted (no GPS / phone)');
r = await call(fenv, 'POST', '/feedback', { body: fb({ website: 'http://spam' }), ip: '10.1.1.2' });
ok(r.status === 200 && [...kv.m.keys()].filter((k) => k.startsWith('feedback:')).length === 1, 'honeypot → fake 200, nothing stored');
r = await call(fenv, 'POST', '/feedback', { body: fb({ elapsedMs: 300 }), ip: '10.1.1.2' });
ok(r.status === 200 && [...kv.m.keys()].filter((k) => k.startsWith('feedback:')).length === 1, 'instant submit (<3 s on form) → fake 200, nothing stored');
r = await call(fenv, 'POST', '/feedback', { body: fb({ text: 'коротко' }), ip: '10.1.1.3' });
ok(r.status === 400, 'text < 10 chars → 400');
r = await call(fenv, 'POST', '/feedback', { body: fb({ text: 'x'.repeat(2001) }), ip: '10.1.1.3' });
ok(r.status === 400, 'text > 2000 chars → 400');
r = await call(fenv, 'POST', '/feedback', { body: fb({ type: 'hack' }), ip: '10.1.1.3' });
ok(r.status === 400, 'unknown type → 400');
r = await call(fenv, 'POST', '/feedback', { body: fb({ screenshot: 'data:image/svg+xml;base64,PHN2Zz4=' }), ip: '10.1.1.3' });
ok(r.status === 400, 'SVG screenshot refused');
r = await call(fenv, 'POST', '/feedback', { body: fb({ screenshot: 'data:image/jpeg;base64,iVBORw0KGgo=' }), ip: '10.1.1.3' });
ok(r.status === 400, 'non-JPEG bytes labelled as JPEG refused');
r = await call(fenv, 'POST', '/feedback', { body: fb({ screenshot: 'data:image/jpeg;base64,/9j/' + 'A'.repeat(560000) }), ip: '10.1.1.3' });
ok(r.status === 400 && r.data.error === 'screenshot too large', 'screenshot > 400 KB refused');
r = await call(fenv, 'POST', '/feedback', { raw: JSON.stringify(fb({ screenshot: 'data:image/jpeg;base64,/9j/' + 'A'.repeat(900000) })), ip: '10.1.1.3' });
ok(r.status === 413, 'feedback body > 720 KB → 413');
let st = [];
for (let i = 0; i < 6; i++) st.push((await call(fenv, 'POST', '/feedback', { body: fb(), ip: '10.2.2.2' })).status);
ok(st.slice(0, 5).every((s) => s === 200) && st[5] === 429, 'per-IP 5/hour → 6th is 429 (' + st.join(',') + ')');
st = [];
for (let i = 0; i < 11; i++) st.push((await call(fenv, 'POST', '/feedback', { body: fb(), token: U.token, ip: '10.3.' + i + '.1' })).status);
ok(st.slice(0, 10).every((s) => s === 200) && st[10] === 429, 'per-pilot 10/day → 11th is 429');
// Telegram forwarding
const sent = [];
const tgEnv = { PITLANE: kv, TELEGRAM_BOT_TOKEN: BOT_TOKEN, FEEDBACK_CHAT_ID: '123456', __fetch: async (url, init) => { sent.push({ url, init }); return new Response(JSON.stringify({ ok: true, result: {} })); } };
const jpeg = crypto.randomBytes(2000); jpeg[0] = 0xff; jpeg[1] = 0xd8; jpeg[2] = 0xff;
r = await call(tgEnv, 'POST', '/feedback', { body: fb({ type: 'idea', text: '<b>жирный</b> & <a href="x">ссылка</a> [TEST]', screenshot: 'data:image/jpeg;base64,' + jpeg.toString('base64') }), ip: '10.4.4.4' });
ok(r.status === 200 && r.data.forwarded === true, 'forwarded when FEEDBACK_CHAT_ID set');
const msg = sent.find((x) => x.url.endsWith('/sendMessage'));
const mb = msg && JSON.parse(msg.init.body);
ok(mb && mb.chat_id === '123456' && !mb.parse_mode && mb.text.includes('<b>жирный</b>') && mb.text.includes('Идея'), 'sendMessage: plain text (no parse_mode → no markup injection)');
const ph = sent.find((x) => x.url.endsWith('/sendPhoto'));
ok(ph && ph.init.body instanceof FormData && ph.init.body.get('photo').size === 2000, 'sendPhoto with the JPEG');
r = await call({ ...tgEnv, FEEDBACK_CHAT_ID: '' }, 'POST', '/feedback', { body: fb(), ip: '10.4.4.5' });
ok(r.data.forwarded === false, 'empty FEEDBACK_CHAT_ID → KV only');
const failEnv = { ...tgEnv, __fetch: async () => { throw new Error('down'); } };
r = await call(failEnv, 'POST', '/feedback', { body: fb(), ip: '10.4.4.6' });
ok(r.status === 200 && r.data.forwarded === false, 'Telegram outage does not lose feedback (stored, 200)');
// account deletion removes own feedback
const mineBefore = [...kv.m.entries()].filter(([k, e]) => k.startsWith('feedback:') && e.meta && e.meta.pid === U.id).length;
r = await call(fenv, 'DELETE', '/account', { token: U.token, ip: '10.5.5.5' });
const mineAfter = [...kv.m.entries()].filter(([k, e]) => k.startsWith('feedback:') && e.meta && e.meta.pid === U.id).length;
ok(mineBefore === 10 && mineAfter === 0 && r.data.deleted.feedback === 10, 'DELETE /account removes the pilot\'s feedback (' + mineBefore + ' → ' + mineAfter + ')');
ok(![...kv.m.keys()].some((k) => k.includes(U.id)), 'no key references the deleted account');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
