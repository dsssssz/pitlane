// v321: виджеты-уведомления 10.4 — обгон, отправка чипа, вызов. node test/v321.test.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import rawWorker, { tgWebhookPath } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import * as N from '../src/notify.js';
import { CARD_HTML, measureCardHtml, overtakeCard, shippedCard, chalCard, cardDataString, sendNotifyWidget, sendBuyerStatus, fmtSec } from '../src/botncard.js';
import { msgOrderStatusBuyer } from '../src/shop.js';
import { HUB_HTML } from '../src/bothub.js';

const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, msg, extra) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, extra !== undefined ? String(extra).slice(0, 300) : ''); } };

const src = CARD_HTML + fs.readFileSync(new URL('../src/botncard.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../src/notify.js', import.meta.url), 'utf8');

console.log('\n[html budget and profile]');
const m = measureCardHtml(undefined, (await import('node:zlib')).default);
ok(m.utf8 <= 32768 && m.zlib <= 4096 && m.ok, 'CARD_HTML ≤ 32 KB / 4 KB zlib-9', m);
ok(!/@font-face|url\(https?:|sofia|paddock|паддок|пэддок/i.test(CARD_HTML) && /system-ui/.test(CARD_HTML), 'system-ui, no fonts/network/paddock');
ok(/\.bad\{color:#e10600\}/.test(CARD_HTML) && (CARD_HTML.match(/#e10600|#e10|#ff0000|#f00/g) || []).length === 1, 'red only for .bad (worse)');
ok(/copyText/.test(CARD_HTML) && /openTelegramLink/.test(CARD_HTML), 'copyText + openTelegramLink');
ok(CARD_HTML !== HUB_HTML, 'notify cards are not the pinned hub HTML');

console.log('\n[builders]');
const ot = overtakeCard({ rivalName: 'Артём', rivalT: 3.21, myT: 3.42, myRank: 5, boardTitle: 'Топ 0–100 · внешний GPS (A/B)' });
ok(ot.v === 'ot' && ot.t === 'Тебя обогнали — теперь №5' && ot.bad === '№5' && ot.a1 === 'Отыграться' && ot.p1 === 'zamer', 'overtake title, red mark, button', ot);
ok(/Артём · 3\.21 с/.test(ot.s) && /вы 3\.42 с/.test(ot.s) && /Топ 0–100/.test(ot.s), 'who + times vs yours + board', ot.s);
ok(Buffer.byteLength(cardDataString(ot), 'utf8') <= 1024, 'overtake chat_data ≤ 1024');
const sh = shippedCard({ no: 1042, track: '1234-5678-9012', delivery: { title: 'СДЭК' }, title: 'PITLANE GPS' });
ok(sh.v === 'sh' && sh.t === 'Чип отправлен' && sh.track === '1234-5678-9012' && sh.p1 === 'copy' && sh.a1 === 'Скопировать трек' && sh.a2 === 'Открыть заявку' && sh.p2 === 'chip', 'shipped track + two buttons', sh);
ok(/СДЭК/.test(sh.s) && /№1042/.test(sh.s), 'delivery + order no', sh.s);
const sh2 = shippedCard({ no: 1042, status: 'shipped' });
ok(!sh2.track && sh2.p1 === 'chip' && !sh2.a2, 'no track → prominent CTA opens order, no copy button');
const chA = chalCard({ win: false, nick: 'Алексей', t: 3.51, mine: 3.42, id: 'cabc123xyz', disc: '0–100' });
ok(chA.t === 'Вызов принят' && !chA.bad && chA.a1 === 'Открыть замер' && chA.p1 === 'ch_cabc123xyz' && /Алексей/.test(chA.s) && /3\.51 с/.test(chA.s) && /у тебя 3\.42 с/.test(chA.s), 'accepted card', chA);
const chB = chalCard({ win: true, nick: 'Алексей', t: 3.20, mine: 3.42, id: 'cabc123xyz', disc: '0–100' });
ok(chB.t === 'Вызов побит' && chB.bad === 'побит', 'beaten uses red on «побит»', chB);
ok(fmtSec(3.4) === '3.40 с' && fmtSec(0) === '', 'time format');

console.log('\n[sendWidget + fallback + no pin]');
const kv = new MemKV();
let sent = [];
let mid = 400;
let failWidget = false;
const env = {
  PITLANE: kv,
  TELEGRAM_BOT_USERNAME: 'pitlane_official_bot',
  TELEGRAM_BOT_TOKEN: '1:fake',
  __fetch: async (u, o) => {
    const method = String(u).split('/').pop();
    const body = JSON.parse(o?.body || '{}');
    sent.push({ method, body });
    if (method === 'sendWidget' && failWidget) return new Response(JSON.stringify({ ok: false, description: 'WIDGET_UNAVAILABLE' }));
    if (/^send/.test(method)) return new Response(JSON.stringify({ ok: true, result: { message_id: ++mid } }));
    return new Response(JSON.stringify({ ok: true, result: true }));
  },
};
const H = {
  tgCall: async (e, m, p) => { const r = await e.__fetch('https://api.telegram.org/botX/' + m, { body: JSON.stringify(p) }); return r.json(); },
  kvJson: async (store, k) => { const raw = await store.get(k); if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } },
  tgChatOf: async (e, pid) => { const rec = JSON.parse((await kv.get('pilot:' + pid)) || 'null'); const id = (rec?.providers || []).find((x) => x.type === 'tg')?.id; return id ? Number(id) : null; },
  telegramConfig: () => ({ enabled: true }),
  moscowDateKey: (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)),
  kvListAll: async (store, prefix) => (await store.list({ prefix })).keys,
  safeName: (s) => String(s || 'пилот'),
  tgEsc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
};

sent = [];
let r = await sendNotifyWidget(env, 7001, ot, H);
ok(r.ok && r.kind === 'widget' && sent.length === 1 && sent[0].method === 'sendWidget' && sent[0].body.html === CARD_HTML, 'sendNotifyWidget → sendWidget only', r);
ok(sent[0].body.allow_queries === false && !sent.some((x) => x.method === 'pinChatMessage'), 'not pinned, no queries');
ok(/"v":"ot"/.test(sent[0].body.chat_data) && /Отыграться/.test(sent[0].body.chat_data), 'chat_data is overtake');

sent = []; failWidget = true;
r = await sendNotifyWidget(env, 7001, ot, H);
ok(!r.ok && sent[0].method === 'sendWidget' && sent.length === 1, 'failed sendWidget does not send text itself (caller falls back)');

console.log('\n[notifyEvent uses widget, cap, fallback]');
const pid = 'p_ot1';
await kv.put('pilot:' + pid, JSON.stringify({ id: pid, providers: [{ type: 'tg', id: '7001' }] }));
await kv.put('auth:tg:7001', pid);
await kv.put('tgstart:7001', '1');
sent = []; failWidget = false;
const msg = N.msgOvertake({ boardTitle: 'Топ 0–100 · внешний GPS (A/B)', rivalName: 'Артём', rivalT: '3.21 с', myT: 3.42, myRank: 5 });
ok(msg.widget && msg.widget.p1 === 'zamer' && /Вас обогнали в топе/.test(msg.text), 'msgOvertake keeps text fallback + widget');
r = await N.notifyEvent(env, pid, { type: 'overtake', key: 'ot:t1', msg }, H);
ok(r === 'sent' && sent[0].method === 'sendWidget' && !sent.some((x) => x.method === 'sendMessage'), 'notifyEvent overtake → widget, not text', r);
ok(N.NOTIFY_DAILY_MAX === 5, 'daily cap still 5');
const day = H.moscowDateKey();
await kv.put('nlast:' + pid, '1'); // skip coalesce window
sent = [];
for (const k of [...kv.m.keys()]) if (String(k).startsWith('nlast:' + pid)) await kv.delete(k);
await kv.put('ncnt:' + pid + ':' + day, String(N.NOTIFY_DAILY_MAX));
r = await N.notifyEvent(env, pid, { type: 'overtake', key: 'ot:cap', msg }, H, Date.now() + 20 * 60 * 1000);
ok(r === 'cap' && sent.length === 0, 'cap blocks widget the same as text', r);

sent = []; failWidget = true;
await kv.delete('ncnt:' + pid + ':' + day);
for (const k of [...kv.m.keys()]) if (String(k).startsWith('nlast:' + pid) || String(k).startsWith('ndup:' + pid)) await kv.delete(k);
r = await N.notifyEvent(env, pid, { type: 'overtake', key: 'ot:fb', msg }, H, Date.now() + 40 * 60 * 1000);
ok(r === 'sent' && sent[0].method === 'sendWidget' && sent[1].method === 'sendMessage' && /Вас обогнали в топе/.test(sent[1].body.text) && sent[1].body.reply_markup.inline_keyboard[0][0].text === 'Открыть топ', 'sendWidget error → current text notification', r);

console.log('\n[shipped status: widget, fallback, other statuses stay text]');
sent = []; failWidget = false;
const order = { status: 'shipped', no: 1042, title: 'PITLANE GPS', qty: 1, track: '1234-5678-9012', delivery: { title: 'СДЭК', id: 'cdek' }, buyer: { tgId: 7001 } };
r = await sendBuyerStatus(env, 7001, order, H, { text: msgOrderStatusBuyer(order, H), keyboard: [[{ text: 'Мои заказы', callback_data: 'n:my' }]] });
ok(r.ok && sent[0].method === 'sendWidget' && /"v":"sh"/.test(sent[0].body.chat_data) && /1234-5678-9012/.test(sent[0].body.chat_data) && !sent.some((x) => x.method === 'sendMessage'), 'shipped → widget with track', r);
sent = [];
r = await sendBuyerStatus(env, 7001, { ...order, status: 'accepted' }, H, { text: msgOrderStatusBuyer({ ...order, status: 'accepted' }, H), keyboard: [[{ text: 'Мои заказы', callback_data: 'n:my' }]] });
ok(r.ok && sent[0].method === 'sendMessage' && /принят в работу/.test(sent[0].body.text) && !sent.some((x) => x.method === 'sendWidget'), 'accepted stays a text notification');
sent = []; failWidget = true;
r = await sendBuyerStatus(env, 7001, order, H, { text: msgOrderStatusBuyer(order, H), keyboard: [[{ text: 'Мои заказы', callback_data: 'n:my' }]] });
ok(r.ok && sent[0].method === 'sendWidget' && sent[1].method === 'sendMessage' && /передан в доставку/.test(sent[1].body.text) && /1234-5678-9012/.test(sent[1].body.text), 'shipped widget fail → current text', r);

console.log('\n[challenge through tgNotify / notifyEvent]');
sent = []; failWidget = false;
for (const k of [...kv.m.keys()]) if (String(k).startsWith('nlast:' + pid) || String(k).startsWith('ndup:' + pid) || String(k).startsWith('ncnt:' + pid)) await kv.delete(k);
await kv.put('tgstart:7001', '1');
const SECRET = 'S'.repeat(40);
// unit via notifyEvent + chalCard-shaped msg (same as chalMsg)
const chalMsg = {
  text: '<b>Твой вызов принят</b>\nАлексей',
  keyboard: [[{ text: 'Открыть вызов', web_app: { url: 'https://dsssssz.github.io/pitlane/?startapp=ch_cabc123xyz' } }]],
  line: 'Алексей · вызов 0–100',
  widget: chalCard({ win: false, nick: 'Алексей', t: 3.51, mine: 3.42, id: 'cabc123xyz', disc: '0–100' }),
};
r = await N.notifyEvent(env, pid, { type: 'challenge', key: 'chal:cabc123xyz:' + pid, msg: chalMsg }, H, Date.now() + 80 * 60 * 1000);
ok(r === 'sent' && sent[0].method === 'sendWidget' && /"v":"ch"/.test(sent[0].body.chat_data) && /Вызов принят/.test(sent[0].body.chat_data) && /ch_cabc123xyz/.test(sent[0].body.chat_data), 'challenge accepted → widget', r);
sent = [];
for (const k of [...kv.m.keys()]) if (String(k).startsWith('nlast:' + pid)) await kv.delete(k);
const beaten = { ...chalMsg, widget: chalCard({ win: true, nick: 'Алексей', t: 3.20, mine: 3.42, id: 'cabc123xyz', disc: '0–100' }), text: '<b>Твой вызов побит</b>\nАлексей' };
r = await N.notifyEvent(env, pid, { type: 'challenge', key: 'chal:cabc123xyz:win', msg: beaten }, H, Date.now() + 100 * 60 * 1000);
ok(r === 'sent' && /Вызов побит/.test(sent[0].body.chat_data) && /"bad":"побит"/.test(sent[0].body.chat_data), 'challenge beaten → widget, red mark');

console.log('\n[source]');
ok(/sendBuyerStatus/.test(fs.readFileSync(new URL('../src/botshop.js', import.meta.url), 'utf8')), 'botshop status / track go through sendBuyerStatus');
ok(/widget: chalCard/.test(fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')), 'chalMsg attaches widget');
ok(!/paddock|паддок/i.test(src), 'no paddock wording in notify cards');

if (fails) { console.log('\n✗ ' + fails + ' failed'); process.exit(1); }
console.log('\n✓ v321 ok');
