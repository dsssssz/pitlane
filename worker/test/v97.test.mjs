// v97: active car, crew rooms, Stars season per room — node test/v97.test.mjs (MemKV only, no prod)
import rawWorker, { tgWebhookPath, ROOM_SEASON_STARS, ROOM_SEASON_DAYS } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
const worker = withAutoRefresh(rawWorker);
import { MemKV } from './kvmock.mjs';
import { lapTrace } from './traces.mjs';

const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };
const kv = new MemKV();
const SECRET = 'S'.repeat(40);
const tgSent = [];
const env = {
  __salesForTests: true, // v108: продажи сезона в проде выключены до реквизитов — здесь проверяем саму механику
  PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'A'.repeat(30), TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', TG_WEBHOOK_SECRET: SECRET,
  __fetch: async (u, o) => {
    const method = String(u).split('/').pop();
    const body = JSON.parse(o.body || '{}');
    tgSent.push({ method, body });
    const result = method === 'createInvoiceLink' ? 'https://t.me/$TESTINVOICE' : true;
    return new Response(JSON.stringify({ ok: true, result }), { headers: { 'Content-Type': 'application/json' } });
  },
};
let realNow = Date.now; let shift = 0;
Date.now = () => realNow() + shift;
const day = 86400000;
let ipSeq = 1;
async function call(method, path, { body, token, ip } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.97.0.1' };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
async function hook(update) {
  const P = '/tg/webhook/' + tgWebhookPath(SECRET);
  const res = await worker.fetch(new Request('https://api.test' + P, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET }, body: JSON.stringify(update) }), env);
  return await res.json();
}
async function login(phone, nick) {
  const ip = '10.97.' + (ipSeq++) + '.1';
  const o = await call('POST', '/auth/otp', { body: { phone }, ip });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick }, ip });
  return { token: v.data.token, id: v.data.pilotId };
}
const A = await login('79009700001', 'Мага');
const B = await login('79009700002', 'Артём');
const C = await login('79009700003', 'Чужой');
// give A and B a Telegram identity (as /auth/tma would)
await kv.put('auth:tg:5001', A.id);
await kv.put('auth:tg:5002', B.id);
await kv.put('auth:tg:5003', C.id);
{ const r = JSON.parse(await kv.get('pilot:' + A.id)); r.providers.push({ type: 'tg', id: '5001' }); await kv.put('pilot:' + A.id, JSON.stringify(r)); }
const lap = (ms, o = {}) => {
  const s = Math.floor(ms / 1000); const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  return { t, ms, gps: true, valid: true, gpsQ: 'A', trackId: 'sochi', trace: lapTrace(t), ...o };
};

console.log('\n[Это моя машина]');
let r = await call('GET', '/me/car');
ok(r.status === 401, 'anonymous → 401');
r = await call('GET', '/me/car', { token: A.token });
ok(r.status === 200 && r.data.car === null, 'no car yet');
r = await call('PUT', '/me/car', { token: A.token, body: { model: 'BMW M2 G87' } });
ok(r.status === 400, 'tyre required');
r = await call('PUT', '/me/car', { token: A.token, body: { model: 'BMW M2 <b>G87</b>', tyre: 'Michelin PS4S', carId: 'g87-m2' } });
ok(r.status === 200 && r.data.car.model === 'BMW M2 bG87/b' && r.data.car.tyre === 'Michelin PS4S', 'car + tyre saved (brackets stripped)');
await call('PUT', '/me/car', { token: A.token, body: { model: 'BMW M2 G87', tyre: 'Michelin PS4S', carId: 'g87-m2' } });
r = await call('POST', '/tops/lap/sochi', { token: B.token, body: lap(121000) });
ok(r.status === 409 && r.data.code === 'NO_CAR', 'global lap without active car → 409 NO_CAR');
r = await call('POST', '/tops/lap/sochi', { token: A.token, body: { ...lap(121000), car: 'Fake Car' } });
const gRow = r.data.find((x) => x.t === '2:01.000');
ok(r.status === 200 && gRow.car === 'BMW M2 G87' && gRow.tyre === 'Michelin PS4S', 'global lap bound to active car + tyre (client car ignored)');

console.log('\n[rooms: create / members only / invite]');
r = await call('POST', '/rooms', { body: { name: 'x' } });
ok(r.status === 401, 'create needs login');
r = await call('POST', '/rooms', { token: A.token, body: { name: 'Neon Pack' } });
ok(r.status === 200 && r.data.role === 'captain' && /^[A-Z2-9]{8}$/.test(r.data.invite) && r.data.quota.freeSessions === 3, 'room created, captain, invite code');
const room = r.data;
r = await call('GET', '/rooms/' + room.id, { token: C.token });
ok(r.status === 403, 'non-member cannot read room');
r = await call('POST', '/rooms/' + room.id + '/laps', { token: C.token, body: lap(120000) });
ok(r.status === 403, 'non-member cannot write laps');
r = await call('GET', '/rooms/invite/' + room.invite, { token: B.token });
ok(r.status === 200 && r.data.name === 'Neon Pack' && r.data.member === false, 'invite preview');
r = await call('POST', '/rooms/join', { token: B.token, body: { code: 'ZZZZZZZZ' } });
ok(r.status === 404, 'bad invite → 404');
r = await call('POST', '/rooms/join', { token: B.token, body: { code: room.invite } });
ok(r.status === 200 && r.data.role === 'member' && r.data.memberCount === 2, 'B joined by invite');
r = await call('GET', '/rooms', { token: B.token });
ok(r.status === 200 && r.data.length === 1 && r.data[0].id === room.id, 'B lists the room');
r = await call('POST', '/rooms/' + room.id + '/invite', { token: B.token });
ok(r.status === 403, 'only captain rotates invite');

console.log('\n[laps bound to car; quota 3 sessions / 1 track]');
r = await call('POST', '/rooms/' + room.id + '/laps', { token: B.token, body: lap(120000) });
ok(r.status === 409 && r.data.code === 'NO_CAR', 'room lap without car → 409');
await call('PUT', '/me/car', { token: B.token, body: { model: 'BMW M2 G87', tyre: 'Michelin PS4S' } });
r = await call('POST', '/rooms/' + room.id + '/laps', { token: A.token, body: lap(119500) });
ok(r.status === 200 && r.data.lap.model === 'BMW M2 G87' && r.data.lap.tyre === 'Michelin PS4S' && r.data.lap.trackId === 'sochi' && r.data.lap.sectors.length === 3 && r.data.lap.date, 'lap stored with model, tyre, track, date, time, sectors');
const lapA = r.data.lap;
r = await call('POST', '/rooms/' + room.id + '/laps', { token: B.token, body: lap(120700) });
const lapB = r.data.lap;
ok(r.status === 200 && r.data.quota.sessionsUsed === 1, 'same day+track = same session');
r = await call('POST', '/rooms/' + room.id + '/laps', { token: B.token, body: lap(75000, { trackId: 'moscow' }) });
ok(r.status === 402 && r.data.reason === 'track' && r.data.title === 'Экипаж оплачивает сезон', 'free: 2nd track → 402 track');
shift = day; await call('POST', '/rooms/' + room.id + '/laps', { token: A.token, body: lap(119900) });
shift = 2 * day; r = await call('POST', '/rooms/' + room.id + '/laps', { token: A.token, body: lap(119300) });
ok(r.status === 200 && r.data.quota.sessionsUsed === 3 && !r.data.quota.locked, '3rd session ok, still open today');
r = await call('GET', '/rooms/' + room.id + '/top?track=sochi&model=' + encodeURIComponent('BMW M2 G87') + '&tyre=' + encodeURIComponent('Michelin PS4S'), { token: B.token });
ok(r.status === 200 && r.data.rows.length === 2 && r.data.rows[0].nick === 'Мага' && Math.abs(r.data.rows[0].ms - 119300) < 40 && r.data.rows[1].gap > 0, 'room top with model+tyre filter, best per pilot');
r = await call('GET', '/rooms/' + room.id + '/top?track=sochi', { token: B.token });
ok(r.status === 400 && r.data.code === 'FILTER_REQUIRED', 'top without model+tyre → 400');
r = await call('GET', '/rooms/' + room.id + '/top?track=sochi&model=Supra&tyre=' + encodeURIComponent('Michelin PS4S'), { token: B.token });
ok(r.status === 200 && r.data.rows.length === 0, 'other model → not mixed');
r = await call('GET', `/rooms/${room.id}/duel?a=${lapA.id}&b=${lapB.id}`, { token: A.token });
ok(r.status === 200 && Math.abs(r.data.delta - 1200) < 60 && r.data.sectors.length === 3, 'duel: two laps of one track, delta + sector deltas');

console.log('\n[after the limit the room goes silent]');
shift = 3 * day;
r = await call('POST', '/rooms/' + room.id + '/laps', { token: A.token, body: lap(119000) });
ok(r.status === 402 && r.data.reason === 'locked' && r.data.quota.locked, '4th session → 402 locked');
r = await call('GET', `/rooms/${room.id}/duel?a=${lapA.id}&b=${lapB.id}`, { token: A.token });
ok(r.status === 402, 'duel blocked');
r = await call('GET', '/rooms/' + room.id + '/top?track=sochi&model=a&tyre=b', { token: A.token });
ok(r.status === 402, 'top blocked');
r = await call('GET', '/rooms/' + room.id + '/laps', { token: B.token });
ok(r.status === 200 && r.data.laps.length === 4 && r.data.quota.locked, 'old laps still visible');
r = await call('POST', '/tops/lap/sochi', { token: A.token, body: lap(118000) });
ok(r.status === 200, 'global bot record stays free');

console.log('\n[Stars: invoice → pre_checkout → successful_payment]');
r = await call('POST', '/rooms/' + room.id + '/invoice', { token: C.token, body: {} });
ok(r.status === 403, 'non-member cannot request invoice');
tgSent.length = 0;
r = await call('POST', '/rooms/' + room.id + '/invoice', { token: B.token, body: {} });
const inv = tgSent.find((x) => x.method === 'createInvoiceLink')?.body;
ok(r.status === 200 && r.data.link === 'https://t.me/$TESTINVOICE', 'invoice link returned');
ok(inv && inv.currency === 'XTR' && inv.prices[0].amount === ROOM_SEASON_STARS && !('provider_token' in inv) && inv.payload === `rs1:${room.id}:${B.id}` && inv.payload.length <= 128, 'createInvoiceLink: XTR, price const, payload room+pilot');
ok(tgSent.some((x) => x.method === 'setWebhook' && x.body.allowed_updates.includes('pre_checkout_query')), 'webhook updated to receive pre_checkout_query (once)');
tgSent.length = 0;
await call('POST', '/rooms/' + room.id + '/invoice', { token: B.token, body: {} });
ok(!tgSent.some((x) => x.method === 'setWebhook'), 'webhook self-heal not repeated');
tgSent.length = 0;
r = await call('POST', '/rooms/' + room.id + '/invoice', { token: A.token, body: { via: 'chat' } });
ok(r.status === 200 && tgSent.some((x) => x.method === 'sendInvoice' && x.body.chat_id === 5001), 'sendInvoice to payer chat');
const pcq = (o) => ({ pre_checkout_query: { id: 'q' + Math.random(), from: { id: 5002 }, currency: 'XTR', total_amount: ROOM_SEASON_STARS, invoice_payload: inv.payload, ...o } });
const lastAnswer = () => tgSent.filter((x) => x.method === 'answerPreCheckoutQuery').pop()?.body;
tgSent.length = 0; await hook(pcq({ total_amount: 1 }));
ok(lastAnswer()?.ok === false, 'pre_checkout: wrong amount refused');
await hook(pcq({ from: { id: 5003 } }));
ok(lastAnswer()?.ok === false, 'pre_checkout: non-member payer refused');
await hook(pcq({ invoice_payload: 'rs1:rnope1234567:' + B.id }));
ok(lastAnswer()?.ok === false, 'pre_checkout: unknown room refused');
await hook(pcq({}));
ok(lastAnswer()?.ok === true, 'pre_checkout: member + exact price → ok');
const paidMsg = { message: { message_id: 9, chat: { id: 5002, type: 'private' }, from: { id: 5002 }, successful_payment: { currency: 'XTR', total_amount: ROOM_SEASON_STARS, invoice_payload: inv.payload, telegram_payment_charge_id: 'ch_TEST_1', provider_payment_charge_id: '' } } };
let w = await hook(paidMsg);
ok(w.paid === true, 'successful_payment processed');
const until1 = JSON.parse(await kv.get('room:' + room.id)).paidUntil;
ok(Math.abs(until1 - (Date.now() + ROOM_SEASON_DAYS * day)) < 5000, `season = ${ROOM_SEASON_DAYS} days`);
w = await hook(paidMsg);
const until2 = JSON.parse(await kv.get('room:' + room.id)).paidUntil;
ok(w.duplicate === true && until1 === until2, 'idempotent by telegram_payment_charge_id');
r = await call('GET', '/rooms/' + room.id, { token: A.token });
ok(r.data.quota.paid && !r.data.quota.locked, 'room unlocked for every member (A did not pay)');
r = await call('POST', '/rooms/' + room.id + '/laps', { token: A.token, body: lap(118800, { trackId: 'moscow' }) });
ok(r.status === 200, 'paid: new sessions + other tracks allowed');

console.log('\n[limits]');
for (let i = 0; i < 5; i++) await call('POST', '/rooms', { token: C.token, body: { name: 'C' + i }, ip: '10.97.200.' + i });
r = await call('POST', '/rooms', { token: C.token, body: { name: 'C6' }, ip: '10.97.201.1' });
ok(r.status === 429 || r.status === 409, 'room creation capped per pilot');

console.log('\n[account deletion]');
r = await call('DELETE', '/account', { token: B.token, ip: '10.97.250.1' });
const rest = kv.dump().filter(([k, v]) => k !== 'auth:tg:5002' /* test-injected */ && (k.includes(B.id) || v.includes(B.id)));
ok(r.status === 200 && rest.length === 0, 'no room/car/lap key references the deleted pilot ' + JSON.stringify(rest.map((x) => x[0])));

Date.now = realNow;
console.log(fails ? `\n${fails} FAILED` : '\nall v97 tests passed');
process.exit(fails ? 1 : 0);
