// Offline tests for the Pitlane Worker: node test/api.test.mjs
import crypto from 'node:crypto';
import worker from '../src/index.js';
import { MemKV } from './kvmock.mjs';

const PHONE = '79001234567';
const PHONE2 = '79005550011';
const ORIGIN = 'https://dsssssz.github.io';
const BOT_TOKEN = '123456789:AAFakeTokenForLocalTestsOnly_xyz123';
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };
const phoneRe = /(?<!\d)\+?7[\s\-()]*9\d{2}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}(?!\d)/;

function mkEnv(extra = {}) { return { PITLANE: kv, SMS_DEMO: '0', ...extra }; }
async function call(env, method, path, { body, token, headers = {} } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
function noPhone(label, text, ...phones) {
  const leaks = phones.filter((p) => text.includes(p) || text.includes(p.slice(1)));
  ok(!leaks.length && !phoneRe.test(text), label + ' — no phone in response' + (leaks.length || phoneRe.test(text) ? ' :: ' + text.slice(0, 300) : ''));
}
function tgSign(data, token = BOT_TOKEN) {
  const dcs = Object.keys(data).filter((k) => k !== 'hash').sort().map((k) => `${k}=${data[k]}`).join('\n');
  const secret = crypto.createHash('sha256').update(token).digest();
  return crypto.createHmac('sha256', secret).update(dcs).digest('hex');
}
const kvKeys = () => [...kv.m.keys()].sort();

const kv = new MemKV();
const now = Date.now();
// ---------- seed legacy (pre-v76) phone-keyed data ----------
await kv.put('user:' + PHONE, JSON.stringify({ phone: PHONE, nick: 'пилот4567', createdAt: now - 5e8, trialEnds: now + 1e8, plan: 'trial' }));
await kv.put('sess:legacytok', JSON.stringify({ phone: PHONE, nick: 'пилот4567', at: now }), { expirationTtl: 3600 });
await kv.put('straight:bmw-m2', JSON.stringify([
  { name: 'пилот4567', car: 'M2', t: 4.12, gps: true, valid: true, gpsQ: 'A', pilotId: PHONE, at: now },
  { name: '+7 900 123-45-67', car: 'M2', t: 4.5, gps: true, valid: true, gpsQ: 'B', pilotId: 'dev_abc', at: now },
]));
await kv.put('lap:sochi', JSON.stringify([
  { name: 'Мага', car: 'M2', t: '2:01.500', ms: 121500, sectors: [40000, 80000, 121500], gps: true, valid: true, gpsQ: 'A', pilotId: PHONE, at: now },
]));
await kv.put('pulse', JSON.stringify([
  { id: 'p1', who: PHONE, text: 'hello', at: now, likes: [PHONE, 'Вася'], pilotId: PHONE },
  { id: 'p2', who: 'Вася', text: 'yo', at: now - 1, likes: [PHONE], pilotId: 'dev_zz' },
]));
await kv.put('pilotmeta:' + PHONE, JSON.stringify({ nick: 'Мага', avatar: 'data:image/png;base64,AAAA', at: now }));
await kv.put('garage:' + PHONE, JSON.stringify({ cars: [{ id: 'm2' }], carId: 'm2' }));
await kv.put('crew:c1', JSON.stringify({ id: 'c1', name: 'Team', trackId: 'sochi', inviteCode: 'ABCDEF', createdAt: now, createdBy: { id: PHONE, name: 'Мага' }, members: [{ pilotId: PHONE, nick: 'Мага', joinedAt: now }], memberBests: { [PHONE]: { time: '2:01.500', gpsQ: 'A', monthKey: 'x' } } }));
await kv.put('crewinv:ABCDEF', 'c1');
await kv.put('crewidx:' + PHONE, JSON.stringify(['c1']));
await kv.put('duel:d1', JSON.stringify({ id: 'd1', type: 'drag', status: 'open', createdAt: now, expiresAt: now + 6e8, createdBy: { id: PHONE, name: 'Мага' }, challenger: null, creatorRun: { name: 'Мага', t: 4.1, pilotId: PHONE, gpsQ: 'A', valid: true, gps: true }, challengerRun: null }), { expirationTtl: 700000 });
await kv.put('duelidx:' + PHONE, JSON.stringify(['d1']));

let env = mkEnv();
console.log('\n[1] public endpoints scrub phones even BEFORE migration');
for (const p of ['/tops/straight/bmw-m2', '/tops/lap/sochi', '/tops/sector/sochi?sector=all', '/pulse', '/duel/d1', '/crew/c1', '/crew/c1/board', '/duels?mine=' + PHONE, '/crews?mine=' + PHONE]) {
  const r = await call(env, 'GET', p); noPhone('GET ' + p + ' (' + r.status + ')', r.text, PHONE);
}

console.log('\n[2] migration (admin protected, idempotent)');
let r = await call(env, 'POST', '/admin/migrate-pilots');
ok(r.status === 404, 'no ADMIN_TOKEN → 404');
env = mkEnv({ ADMIN_TOKEN: 'x'.repeat(40) });
r = await call(env, 'POST', '/admin/migrate-pilots', { headers: { 'X-Admin-Token': 'wrong'.repeat(8) } });
ok(r.status === 404, 'wrong admin token → 404');
r = await call(env, 'POST', '/admin/migrate-pilots?dry=1', { headers: { 'X-Admin-Token': 'x'.repeat(40) } });
ok(r.status === 200 && r.data.report.phonesFound === 1 && !kvKeys().some((k) => k.startsWith('pilot:')), 'dry run reports, writes nothing: ' + JSON.stringify(r.data.report));
r = await call(env, 'POST', '/admin/migrate-pilots', { headers: { 'X-Admin-Token': 'x'.repeat(40) } });
console.log('    report:', JSON.stringify(r.data.report));
ok(r.data.report.accountsCreated === 1 && r.data.report.lapRows === 1 && r.data.report.straightRows === 1 && r.data.report.pulsePosts === 1, 'migration counts');
const uuid = await kv.get('auth:phone:' + PHONE);
ok(/^p_[0-9a-f-]{36}$/.test(uuid), 'auth:phone mapping → ' + uuid);
const leftovers = kv.dump().filter(([k, v]) => (k.includes(PHONE) || v.includes(PHONE)) && k !== 'auth:phone:' + PHONE && k !== 'pilot:' + uuid);
ok(!leftovers.length, 'no other key/value contains the phone ' + JSON.stringify(leftovers.map((x) => x[0])));
const r2 = await call(env, 'POST', '/admin/migrate-pilots', { headers: { 'X-Admin-Token': 'x'.repeat(40) } });
const zero = Object.values(r2.data.report).every((v) => v === 0);
ok(zero, 're-run is a no-op: ' + JSON.stringify(r2.data.report));
const pilotRec = JSON.parse(await kv.get('pilot:' + uuid));
ok(pilotRec.nick !== 'пилот4567' && !kv.m.has('user:' + PHONE), 'legacy default nick (last 4 digits) replaced: ' + pilotRec.nick + '; user:<phone> folded');
ok(JSON.parse(await kv.get('garage:' + uuid)).carId === 'm2' && JSON.parse(await kv.get('pilotmeta:' + uuid)).nick === 'Мага', 'garage + pilotmeta moved to uuid');

console.log('\n[3] legacy session upgrades to uuid');
r = await call(env, 'GET', '/me', { token: 'legacytok' });
ok(r.status === 200 && r.data.pilotId === uuid, 'GET /me with legacy token → uuid');
noPhone('GET /me (owner, masked phone only)', r.text, PHONE);

console.log('\n[4] SMS demo account (local only) + publish');
env = mkEnv({ SMS_DEMO: '1' });
r = await call(env, 'GET', '/auth/config');
ok(r.data.sms === true && r.data.telegram === false, '/auth/config demo: ' + r.text);
r = await call(env, 'POST', '/auth/otp', { body: { phone: '+7 900 555-00-11' } });
ok(r.status === 200 && r.data.demoCode, 'otp demo code');
r = await call(env, 'POST', '/auth/verify', { body: { phone: PHONE2, code: r.data.demoCode, nick: 'Тест' } });
const tok2 = r.data.token; const uuid2 = r.data.pilotId;
ok(r.status === 200 && /^p_/.test(uuid2) && r.data.user.pilotId === uuid2, 'verify → session with uuid ' + uuid2);
const straightBody = { name: 'Тест', car: 'M2', t: 3.99, gps: true, valid: true, gpsQ: 'A' };
r = await call(env, 'POST', '/tops/straight/bmw-m2', { token: tok2, body: straightBody });
ok(r.status === 200 && r.data.some((x) => x.pilotId === uuid2), 'POST straight ok, row pilotId=uuid');
noPhone('POST straight response', r.text, PHONE, PHONE2);
r = await call(env, 'POST', '/tops/lap/sochi', { token: tok2, body: { name: 'Тест', car: 'M2', t: '2:00.100', ms: 120100, sectors: [39000, 79000, 120100], gps: true, valid: true, gpsQ: 'A', avatar: 'data:image/png;base64,BBBB' } });
ok(r.status === 200, 'POST lap ok');
r = await call(env, 'POST', '/pulse', { token: tok2, body: { text: 'first post', who: '' } });
ok(r.status === 200 && r.data[0].who === 'Тест', 'pulse name from session nick');
const envNoNick = mkEnv();
await kv.put('sess:nonick', JSON.stringify({ pilotId: uuid2, nick: '', provider: 'phone', at: now }));
await kv.put('sessidx:' + uuid2, JSON.stringify([tok2, 'nonick']));
r = await call(envNoNick, 'POST', '/pulse', { token: 'nonick', body: { text: 'nameless' } });
ok(r.data[0].who === 'Пилот', 'pulse fallback name = «Пилот» (not id)');
r = await call(env, 'POST', '/pulse/p2/like', { token: tok2 });
ok(r.data.find((x) => x.id === 'p2').likes.includes(uuid2), 'like stored as uuid');
r = await call(env, 'POST', '/pulse/p2/like', { token: tok2 });
await call(env, 'POST', '/pulse/p2/like', { token: tok2 });
r = await call(env, 'DELETE', '/pulse/p2', { token: tok2 });
ok(r.data.some((x) => x.id === 'p2'), 'cannot delete someone else\'s post');
for (const p of ['/tops/straight/bmw-m2', '/tops/lap/sochi', '/tops/sector/sochi?sector=all', '/pulse', '/session/today']) {
  const g = await call(env, 'GET', p); noPhone('GET ' + p, g.text, PHONE, PHONE2);
}
r = await call(env, 'POST', '/crew/c1/join', { token: tok2, body: { nick: 'Тест', pilotId: uuid } });
ok(r.data.members.some((m) => m.pilotId === uuid2), 'crew join uses session uuid (body pilotId ignored)');
r = await call(env, 'POST', '/duel', { headers: { 'X-Pilot-Id': uuid }, body: { type: 'drag', createdBy: 'Гость' } });
ok(r.status === 400 && r.data.error === 'pilot required', 'guest cannot impersonate account uuid via X-Pilot-Id (400)');
r = await call(env, 'POST', '/duel', { headers: { 'X-Pilot-Id': PHONE2 }, body: { type: 'drag', createdBy: 'Гость' } });
noPhone('duel created with phone as X-Pilot-Id', r.text, PHONE2);

console.log('\n[5] Telegram');
r = await call(mkEnv(), 'POST', '/auth/telegram', { body: { id: 1 } });
ok(r.status === 503 && r.data.error === 'Telegram not configured', 'no secret → 503 Telegram not configured');
const tenv = mkEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_BOT_USERNAME: 'YOUR_BOT_USERNAME' });
r = await call(tenv, 'GET', '/auth/config');
ok(r.data.telegram === true && r.data.telegramBotId === '123456789' && r.data.sms === false && r.data.telegramBot === null, '/auth/config telegram on: ' + r.text);
const nowSec = Math.floor(Date.now() / 1000);
const tgData = { id: 555000111, first_name: 'Иван', username: 'ivan_racer', photo_url: 'https://t.me/i/userpic/320/x.jpg', auth_date: nowSec };
tgData.hash = tgSign(tgData);
r = await call(tenv, 'POST', '/auth/telegram', { body: tgData });
const tokTg = r.data.token; const uuidTg = r.data.pilotId;
ok(r.status === 200 && /^p_/.test(uuidTg) && r.data.nick === 'ivan_racer' && r.data.created, 'valid payload → account ' + uuidTg);
r = await call(tenv, 'POST', '/auth/telegram', { body: tgData });
ok(r.data.pilotId === uuidTg && r.data.created === false, 'same telegram id → same uuid');
r = await call(tenv, 'POST', '/auth/telegram', { body: { ...tgData, first_name: 'Хакер' } });
ok(r.status === 401 && r.data.error === 'bad hash', 'tampered field → 401 bad hash');
const old = { ...tgData, auth_date: nowSec - 90000 }; old.hash = tgSign(old);
r = await call(tenv, 'POST', '/auth/telegram', { body: old });
ok(r.status === 401 && r.data.error === 'auth expired', 'auth_date > 1 day → 401');
const wrong = { ...tgData }; wrong.hash = tgSign(wrong, '999:OtherBotTokenOtherBotToken12345');
r = await call(tenv, 'POST', '/auth/telegram', { body: wrong });
ok(r.status === 401, 'signed by other bot → 401');
r = await call(tenv, 'GET', '/me', { token: tokTg });
ok(r.data.user.providers.includes('tg') && r.data.user.telegram.username === 'ivan_racer', 'GET /me for telegram session');
r = await call(tenv, 'POST', '/crew/join', { token: tokTg, body: { code: 'ABCDEF', nick: 'Иван' } });
ok(r.status === 200, 'tg user joins crew c1');

console.log('\n[5b] Telegram Mini App initData');
function tmaInit(fields, token = BOT_TOKEN) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
const tmaUser = JSON.stringify({ id: 555000111, first_name: 'Иван', username: 'ivan_racer', language_code: 'ru', allows_write_to_pm: true });
const tmaFields = { query_id: 'AAHdF6IQAAAAAN0XohDhrOrc', user: tmaUser, auth_date: String(nowSec), signature: 'abc', start_param: 'duel_d1' };
r = await call(mkEnv(), 'POST', '/auth/tma', { body: { initData: tmaInit(tmaFields) } });
ok(r.status === 503 && r.data.error === 'Telegram not configured', 'tma: no secret → 503');
r = await call(tenv, 'GET', '/auth/config');
ok(r.data.tma === true && r.data.tmaShare === false, '/auth/config tma:true, tmaShare:false (placeholder username)');
r = await call(mkEnv(), 'GET', '/auth/config');
ok(r.data.tma === false, '/auth/config tma:false without token');
r = await call(tenv, 'POST', '/auth/tma', { body: { initData: tmaInit(tmaFields) } });
ok(r.status === 200 && r.data.pilotId === uuidTg && r.data.provider === 'tma' && r.data.tgUserId === '555000111' && r.data.token, 'valid initData → SAME uuid as login widget (' + r.data.pilotId + ')');
const tokTma = r.data.token;
r = await call(tenv, 'GET', '/me', { token: tokTma });
ok(r.status === 200 && r.data.pilotId === uuidTg, 'tma session works for /me');
r = await call(tenv, 'POST', '/auth/tma', { body: tmaInit(tmaFields) });
ok(r.status === 200 && r.data.pilotId === uuidTg, 'raw string body accepted too');
const forged = tmaInit(tmaFields).replace(encodeURIComponent('Иван'), encodeURIComponent('Хакер'));
r = await call(tenv, 'POST', '/auth/tma', { body: { initData: forged } });
ok(r.status === 401 && r.data.error === 'bad hash', 'forged user → 401 bad hash');
r = await call(tenv, 'POST', '/auth/tma', { body: { initData: tmaInit({ ...tmaFields, auth_date: String(nowSec - 90000) }) } });
ok(r.status === 401 && r.data.error === 'auth expired', 'expired auth_date → 401');
r = await call(tenv, 'POST', '/auth/tma', { body: { initData: tmaInit(tmaFields, '999:OtherBotTokenOtherBotToken12345') } });
ok(r.status === 401 && r.data.error === 'bad hash', 'other bot → 401');
// login-widget style signature (SHA256 key) must NOT be accepted as initData
const wl = { ...tmaFields }; const wlDcs = Object.keys(wl).sort().map((k) => `${k}=${wl[k]}`).join('\n');
const wlHash = crypto.createHmac('sha256', crypto.createHash('sha256').update(BOT_TOKEN).digest()).update(wlDcs).digest('hex');
r = await call(tenv, 'POST', '/auth/tma', { body: { initData: new URLSearchParams({ ...wl, hash: wlHash }).toString() } });
ok(r.status === 401, 'widget-scheme hash rejected for initData');
r = await call(tenv, 'POST', '/auth/tma', { body: { initData: '' } });
ok(r.status === 400, 'empty initData → 400');
r = await call(tenv, 'POST', '/auth/tma', { body: { initData: tmaInit({ auth_date: String(nowSec), query_id: 'x' }) } });
ok(r.status === 400 && r.data.error === 'no user', 'no user field → 400');
// share-prepare with mocked Bot API
let sent = null;
const senv = mkEnv({ TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_BOT_USERNAME: 'pitlane_test_bot', __fetch: async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ ok: true, result: { id: 'PREP1', expiration_date: nowSec + 3600 } })); } });
r = await call(senv, 'POST', '/tma/share-prepare', { body: { initData: tmaInit(tmaFields), param: 'duel_d1', text: 'Дуэль' } });
ok(r.status === 200 && r.data.id === 'PREP1' && r.data.link === 'https://t.me/pitlane_test_bot?startapp=duel_d1', 'share-prepare → prepared id + startapp link');
ok(sent && sent.url.endsWith('/savePreparedInlineMessage') && sent.body.user_id === 555000111 && sent.body.result.reply_markup.inline_keyboard[0][0].url.includes('startapp=duel_d1'), 'Bot API called with user_id + startapp button');
r = await call(senv, 'POST', '/tma/share-prepare', { body: { initData: tmaInit(tmaFields), param: '../evil' } });
ok(r.status === 400, 'bad share param → 400');
r = await call(senv, 'POST', '/tma/share-prepare', { body: { initData: forged, param: 'duel_d1' } });
ok(r.status === 401, 'share-prepare needs valid initData');

console.log('\n[6] DELETE /account');
r = await call(env, 'DELETE', '/account');
ok(r.status === 401, 'no session → 401');
const before = kvKeys();
r = await call(env, 'DELETE', '/account', { token: 'legacytok' });
console.log('    deleted:', JSON.stringify(r.data.deleted));
const after = kvKeys();
console.log('    keys removed:', before.filter((k) => !after.includes(k)).join(', '));
const refs = kv.dump().filter(([k, v]) => k.includes(uuid) || v.includes(uuid) || k.includes(PHONE) || v.includes(PHONE));
ok(!refs.length, 'no key/value references deleted uuid or its phone ' + JSON.stringify(refs.map((x) => x[0])));
const crew = JSON.parse(await kv.get('crew:c1'));
ok(crew.createdBy.id === uuid2 && crew.members.length === 2, 'owned crew transferred to earliest remaining member (' + crew.createdBy.name + ')');
ok(!kv.m.has('duel:d1'), 'duel with deleted pilot removed');
r = await call(env, 'GET', '/me', { token: 'legacytok' });
ok(r.status === 401, 'old session invalid after deletion');
for (const [t, u] of [[tok2, uuid2], [tokTg, uuidTg]]) {
  await call(env, 'DELETE', '/account', { token: t });
  const rr = kv.dump().filter(([k, v]) => k.includes(u) || v.includes(u));
  ok(!rr.length, 'account ' + u.slice(0, 10) + '… fully removed ' + JSON.stringify(rr.map((x) => x[0])));
}
ok(!kv.m.has('crew:c1') && !kv.m.has('crewinv:ABCDEF'), 'crew deleted when last member left');
ok(!kvKeys().some((k) => k.startsWith('auth:') || k.startsWith('pilot:') || k.startsWith('sess')), 'no auth/pilot/session keys remain');
console.log('    remaining keys:', kvKeys().join(', '));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
