// Bot copy (после v98): premium texts, escaping, notifications — node test/bot.test.mjs (MemKV only, fake Telegram)
import rawWorker, { tgWebhookPath } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
const worker = withAutoRefresh(rawWorker);
import * as C from '../src/botcopy.js';
import { MemKV } from './kvmock.mjs';
import { lapTrace } from './traces.mjs';

let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };
const kv = new MemKV();
const SECRET = 'S'.repeat(40);
const sent = [];
const env = {
  __salesForTests: true, // v108: продажи сезона в проде выключены до реквизитов — здесь проверяем саму механику
  PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'A'.repeat(30), TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', TG_WEBHOOK_SECRET: SECRET,
  __fetch: async (u, o) => { const method = String(u).split('/').pop(); if (method !== 'deleteMessage') sent.push({ method, body: JSON.parse(o?.body || '{}') }); return new Response(JSON.stringify({ ok: true, result: method === 'createInvoiceLink' ? 'https://t.me/$X' : { message_id: 1 } })); },
};
const emojiCount = (s) => (String(s).match(/\p{Extended_Pictographic}/gu) || []).length;
const tagsBalanced = (s) => { const st = []; for (const m of String(s).matchAll(/<(\/?)(b|i|code)>/g)) { if (!m[1]) st.push(m[2]); else if (st.pop() !== m[2]) return false; } return !st.length && !/<(?!\/?(b|i|code)>)/.test(String(s)); };
let ipSeq = 1;
async function call(method, path, { body, token } = {}) {
  const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.99.0.' + (ipSeq++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: res.status, data: d };
}
const hook = async (update) => (await worker.fetch(new Request('https://api.test/tg/webhook/' + tgWebhookPath(SECRET), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET }, body: JSON.stringify(update) }), env)).json();
async function login(phone, nick, tg) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  const rec = JSON.parse(await kv.get('pilot:' + v.data.pilotId)); rec.providers.push({ type: 'tg', id: String(tg) }); await kv.put('pilot:' + rec.id, JSON.stringify(rec));
  await kv.put('auth:tg:' + tg, rec.id);
  return { token: v.data.token, id: v.data.pilotId, tg };
}
const lap = (ms, o = {}) => { const s = Math.floor(ms / 1000); return { t: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`, ms, gps: true, valid: true, gpsQ: 'A', sectors: [Math.round(ms * 0.3), Math.round(ms * 0.65), ms], trackId: 'sochi', trace: lapTrace(ms), ...o }; };

console.log('\n[copy style]');
const all = [C.START_CAPTION, ...Object.values(C.BOT_TEXT), C.BOT_DESCRIPTION, C.BOT_SHORT_DESCRIPTION,
  C.msgSeasonPaid({ name: 'N', until: '05.01.2027', roomId: 'r1' }).text,
  C.msgRoomBest({ teamName: 'N', roomId: 'r1', nick: 'A', t: '2:01.000', trackId: 'sochi', model: 'M', tyre: 'T', prevNick: 'B', delta: 500 }).text,
  C.msgDuelAccepted({ duelId: 'd1', rivalName: 'B', t: '2:01.000', trackId: 'sochi' }).text,
  C.msgDuelResult({ duelId: 'd1', won: true, myT: '2:00.000', rivalName: 'B', rivalT: '2:01.000', delta: 1000, trackId: 'sochi' }).text,
  ...['room_ABCDEFGH', 'team_r1', 'duel_x', 's_x', 'track_x', 'tops_x'].map((p) => C.startPayloadLine(p, { name: 'N', members: 3 }))];
ok(all.every((t) => emojiCount(t) <= 1), 'max 1 emoji per message (' + all.map(emojiCount).join('') + ')');
ok(all.every(tagsBalanced), 'only <b>/<i>/<code>, all balanced');
ok([...C.BOT_SHORT_DESCRIPTION].length <= 120 && [...C.BOT_DESCRIPTION].length <= 512, 'description limits');
ok(/<code>2:01\.000<\/code>/.test(all[all.length - 9 + 0] || '') || all.some((t) => /<code>2:01\.000<\/code>/.test(t)), 'lap times monospace (<code>)');

console.log('\n[escaping user text]');
const evil = '<b>Neon</b> & "Co"';
const best = C.msgRoomBest({ teamName: evil, roomId: 'r1', nick: '<i>x</i>', t: '<code>', trackId: 'sochi', model: '<a href=x>', tyre: 'T&T', prevNick: '</b>', delta: 1 }).text;
ok(!/<a |<i>x|<\/b>,|<code><code>/.test(best) && best.includes('&lt;b&gt;Neon&lt;/b&gt; &amp; &quot;Co&quot;') && tagsBalanced(best), 'names/cars/tyres escaped in notifications');

const A = await login('79009900001', 'Мага', 7001);
const B = await login('79009900002', 'Артём', 7002);
for (const P of [A, B]) await call('PUT', '/me/car', { token: P.token, body: { model: 'BMW M2 G87', tyre: 'Michelin Cup 2' } });
// v121: уведомления — только тем, кто сам писал боту
for (const id of [7001, 7002]) await hook({ update_id: 100 + id, message: { message_id: 1, chat: { id, type: 'private' }, from: { id }, text: '/start' } });
const room = (await call('POST', '/rooms', { token: A.token, body: { name: '<b>Neon</b> & Co' } })).data;
await call('POST', '/rooms/join', { token: B.token, body: { code: room.invite } });

console.log('\n[/start invite with team name]');
// v206: команды и дуэли убраны из продукта — старые ссылки ведут в приложение, уведомлений нет
sent.length = 0;
await hook({ update_id: 1, message: { message_id: 1, chat: { id: 7003, type: 'private' }, from: { id: 7003 }, text: '/start room_' + room.invite } });
let s = [...sent].reverse().find((x) => x.method === 'sendPhoto') || sent.pop();
ok(s && s.method === 'sendPhoto' && s.body.parse_mode === 'HTML' && /больше недоступен/.test(s.body.caption) && !s.body.caption.includes('Neon') && tagsBalanced(s.body.caption), 'v206: старое приглашение в команду — «раздел недоступен», имя команды не выводится');
ok(s.body.reply_markup.inline_keyboard[0][0].text === 'Открыть ссылку' && s.body.reply_markup.inline_keyboard[0][0].web_app.url.endsWith('startapp=room_' + room.invite), 'invite button → web_app startapp');
ok(s.body.photo.includes('banner.jpg'), 'banner kept');

console.log('\n[new best lap → teammates]');
sent.length = 0;
await call('POST', `/rooms/${room.id}/laps`, { token: B.token, body: lap(123000) });
await call('POST', `/rooms/${room.id}/laps`, { token: A.token, body: lap(121500) });
ok(!sent.some((x) => x.method === 'sendMessage'), 'v206: рекорд команды — без уведомлений (команды убраны)');

console.log('\n[duels]');
const d = (await call('POST', '/duel', { token: A.token, body: { type: 'lap', trackId: 'sochi', createdBy: 'Мага' } })).data;
sent.length = 0;
if (d && d.id) { await call('POST', `/duel/${d.id}/run`, { token: B.token, body: { ...lap(122400), nick: 'Артём' } }); await call('POST', `/duel/${d.id}/run`, { token: A.token, body: { ...lap(121900), nick: 'Мага' } }); }
ok(!sent.some((x) => x.method === 'sendMessage'), 'v206: дуэли — без уведомлений в бот');
const DUEL_RESULT_DIRECT = C.msgDuelResult({ duelId: 'd1', won: false, myT: '2:02.400', rivalName: 'Мага', rivalT: '2:01.900', delta: 500, trackId: 'sochi' });
ok(/<b>Дуэль проиграна<\/b>/.test(DUEL_RESULT_DIRECT.text) && DUEL_RESULT_DIRECT.text.includes('Разница  <code>0.500</code>') && tagsBalanced(DUEL_RESULT_DIRECT.text), 'шаблон итога дуэли остаётся корректным HTML');

console.log('\n[season payment message]');
sent.length = 0;
await hook({ update_id: 5, message: { message_id: 9, chat: { id: 7001, type: 'private' }, from: { id: 7001 }, successful_payment: { currency: 'XTR', total_amount: 500, invoice_payload: `rs1:${room.id}:${A.id}`, telegram_payment_charge_id: 'ch_bot_1' } } });
const pm = sent.find((x) => x.method === 'sendMessage');
ok(pm && /^<b>Сезон оплачен<\/b>/.test(pm.body.text) && pm.body.text.includes('«bNeon/b &amp; Co» · до <code>') && emojiCount(pm.body.text) <= 1 && pm.body.reply_markup.inline_keyboard[0][0].text === 'Открыть команду', 'paid: bold title, escaped name, <code> date, button');

console.log(fails ? `\n${fails} FAILED` : '\nall bot tests passed');
process.exit(fails ? 1 : 0);
