// v320: хаб-виджет 10.4 — state, дедуп, fallback, статусы заказа. node test/v320.test.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import rawWorker, { tgWebhookPath, BOT_COMMANDS } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import {
  HUB_HTML, HUB_VER, HUB_KEY, TG_ALLOWED_UPDATES, MENU_BUTTON, MENU_BUTTON_TEXT,
  formatLastLine, pickLastResult, mapOrderToHub, buildHubData, hubDataString,
  chipInfo, ensureHub, updateHubForOrder, buildStateForChat,
} from '../src/bothub.js';

const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, msg, extra) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, extra !== undefined ? String(extra).slice(0, 300) : ''); } };

console.log('\n[html budget and profile]');
const utf8 = Buffer.byteLength(HUB_HTML, 'utf8');
const z9 = zlib.deflateSync(Buffer.from(HUB_HTML, 'utf8'), { level: 9 }).length;
ok(utf8 <= 32768, 'HTML ≤ 32 KB UTF-8 (' + utf8 + ')');
ok(z9 <= 4096, 'HTML ≤ 4 KB zlib-9 (' + z9 + ')');
ok(!/@font-face|url\(https?:|sofia|paddock|паддок|пэддок/i.test(HUB_HTML), 'no custom fonts, external images, or paddock word');
ok(/system-ui/.test(HUB_HTML) && /Сделать замер/.test(HUB_HTML) && /Заказать чип/.test(HUB_HTML), 'system-ui + two hub actions');
ok(/Оформить заявку/.test(HUB_HTML) && /Заявка принята/.test(HUB_HTML) && /Собираем/.test(HUB_HTML) && /Отправлен/.test(HUB_HTML), 'chip CTA + tracker labels');
ok(/startapp=' \+ p/.test(HUB_HTML) || /startapp='\+p/.test(HUB_HTML) || /startapp=' \+p/.test(HUB_HTML) || /startapp='\+ p/.test(HUB_HTML) || /openApp\('zamer'\)/.test(HUB_HTML), 'measurement via startapp=zamer');
ok(MENU_BUTTON_TEXT === 'Замер' && /startapp=zamer/.test(MENU_BUTTON().web_app.url), 'menu button «Замер»');
ok(TG_ALLOWED_UPDATES.includes('widget_query') && BOT_COMMANDS.some((c) => c.command === 'hub'), 'webhook widget_query + /hub command');

console.log('\n[last result and order mapping]');
ok(formatLastLine({}) === '' && formatLastLine({ t: 0 }) === '', 'no time → hide line');
ok(formatLastLine({ t: 3.42, city: 'Краснодар', rank: 4 }) === 'Последний 0–100 · 3.42 с · №4 Краснодар', 'line with city rank');
ok(formatLastLine({ t: 4.1, city: 'Сочи' }) === 'Последний 0–100 · 4.10 с · Сочи', 'line without rank');
const pid = 'p_abc';
ok(!pickLastResult({ ab: [], c: [], pid }), 'no runs → null');
const ab = [
  { pilotId: 'p_other', t: 3.0, valid: true, city: 'Краснодар' },
  { pilotId: pid, t: 3.42, valid: true, city: 'Краснодар', gpsQ: 'A' },
  { pilotId: 'p_mid', t: 3.2, valid: true, city: 'Краснодар' },
];
const picked = pickLastResult({ ab, c: [{ pilotId: pid, t: 4.9, valid: true, cls: 'c', gpsQ: 'C', city: 'Краснодар' }], pid });
ok(picked && picked.t === 3.42 && picked.cls === 'ab' && picked.rank === 3, 'prefer A/B best, city rank 3', picked);
const season = { [pid]: { t: 3.42, city: 'Краснодар' }, p2: { t: 3.1, city: 'Краснодар' }, p3: { t: 3.5, city: 'Сочи' } };
ok(pickLastResult({ ab, c: [], pid, season }).rank === 2, 'season table rank');
ok(!mapOrderToHub({ status: 'delivered' }) && !mapOrderToHub({ status: 'canceled' }), 'delivered/canceled → back to hub');
ok(mapOrderToHub({ status: 'new', no: 1042, title: 'PITLANE GPS', total: 6800, city: 'Краснодар' }).step === 1, 'new → шаг 1 Принята');
ok(mapOrderToHub({ status: 'assembling', no: 1042 }).step === 2, 'assembling → Собираем');
const sh = mapOrderToHub({ status: 'shipped', no: 1042, track: '1234-5678-9012', title: 'PITLANE GPS' });
ok(sh && sh.step === 3 && sh.track === '1234-5678-9012', 'shipped + track', sh);
ok(chipInfo().price.includes('6') && chipInfo().price.includes('800'), 'price from shop-config 6 800');
const data = buildHubData({ last: { t: 3.42, city: 'Краснодар', rank: 4 } });
ok(data.v === 'hub' && data.last.includes('3.42') && Buffer.byteLength(hubDataString(data), 'utf8') <= 1024, 'hub chat_data ≤ 1024');
ok(buildHubData({ last: { t: 3.42 }, view: 'chip' }).v === 'chip', 'chip view without order');
ok(buildHubData({ order: { status: 'assembling', no: 1, title: 'PITLANE GPS' }, view: 'chip' }).v === 'order', 'active order wins over chip view');

console.log('\n[ensureHub dedupe and fallback]');
const kv = new MemKV();
let sent = [];
let mid = 200;
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
    if (method === 'editMessageWidgetData' || method === 'editMessageText') {
      if (body.message_id === 999) return new Response(JSON.stringify({ ok: false, description: 'Bad Request: message to edit not found' }));
      return new Response(JSON.stringify({ ok: true, result: true }));
    }
    return new Response(JSON.stringify({ ok: true, result: true }));
  },
};
const H = { tgCall: async (e, m, p) => { const r = await e.__fetch('https://api.telegram.org/botX/' + m, { body: JSON.stringify(p) }); return r.json(); }, kvJson: async (store, k) => { const raw = await store.get(k); if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } } };

sent = [];
let r = await ensureHub(env, 555001, H, { last: { t: 3.42, city: 'Краснодар', rank: 4 } });
ok(r.ok && r.mode === 'fresh' && r.kind === 'widget' && r.sent, 'first send → sendWidget', r);
ok(sent.map((x) => x.method).join() === 'sendWidget,pinChatMessage', 'send then pin', sent.map((x) => x.method).join());
ok(sent[0].body.html === HUB_HTML && /3\.42/.test(sent[0].body.chat_data) && sent[0].body.allow_queries === false, 'html + last result in chat_data');
const rec1 = JSON.parse(await kv.get(HUB_KEY(555001)));
ok(rec1.mid === r.mid && rec1.ver === HUB_VER && rec1.kind === 'widget', 'KV bothub:<chat> stored');

sent = [];
r = await ensureHub(env, 555001, H, { last: { t: 3.42, city: 'Краснодар', rank: 5 } });
ok(r.ok && r.mode === 'edit' && r.sent === false && !sent.some((x) => x.method === 'sendWidget'), 'second call edits, no duplicate widget', r);
ok(sent[0].method === 'editMessageWidgetData' && sent[0].body.message_id === rec1.mid && /№5/.test(sent[0].body.chat_data), 'editMessageWidgetData with new last line');

sent = []; failWidget = true;
r = await ensureHub(env, 555002, H);
ok(r.ok && r.kind === 'fallback' && r.fallback && sent[0].method === 'sendWidget' && sent[1].method === 'sendMessage', 'sendWidget error → fallback message', r);
ok(sent[1].body.reply_markup.inline_keyboard[0][0].web_app.url.includes('startapp=zamer'), 'fallback has web_app замер');
ok(sent[2].method === 'pinChatMessage', 'fallback is pinned too');
sent = [];
r = await ensureHub(env, 555002, H, { last: 'Последний 0–100 · 3.00 с' });
ok(r.mode === 'edit' && sent[0].method === 'editMessageText' && !sent.some((x) => x.method === 'sendMessage' && !x.body.reply_markup === false /*noop*/), 'fallback deduped via editMessageText', r);

console.log('\n[order updates pinned hub]');
await kv.put('auth:tg:555001', 'p_user');
sent = [];
r = await updateHubForOrder(env, { status: 'assembling', no: 1042, title: 'PITLANE GPS', total: 6800, city: 'Краснодар', buyer: { tgId: 555001 } }, H);
ok(r.ok && r.mode === 'edit' && /"v":"order"/.test(sent[0].body.chat_data) && /"step":2/.test(sent[0].body.chat_data), 'assembling → tracker step 2', sent[0]?.body?.chat_data);
sent = [];
r = await updateHubForOrder(env, { status: 'shipped', no: 1042, title: 'PITLANE GPS', track: '1234-5678-9012', buyer: { tgId: 555001 } }, H);
ok(r.ok && /"step":3/.test(sent[0].body.chat_data) && /1234-5678-9012/.test(sent[0].body.chat_data), 'shipped includes track');
sent = [];
r = await updateHubForOrder(env, { status: 'delivered', no: 1042, buyer: { tgId: 555001 } }, H);
ok(r.ok && /"v":"hub"/.test(sent[0].body.chat_data) && !/"v":"order"/.test(sent[0].body.chat_data), 'delivered → back to hub', sent[0]?.body?.chat_data);
r = await updateHubForOrder(env, { status: 'new', no: 1, buyer: { tgId: 999999 } }, H);
ok(r.skipped, 'no hub for that chat → skip, do not send');

console.log('\n[/start and /hub via webhook]');
const SECRET = 'S'.repeat(40);
sent = []; mid = 300;
const wenv = {
  PITLANE: new MemKV(),
  TELEGRAM_BOT_TOKEN: '1:fake',
  TELEGRAM_BOT_USERNAME: 'pitlane_official_bot',
  TG_WEBHOOK_SECRET: SECRET,
  __fetch: async (u, o) => {
    const method = String(u).split('/').pop();
    const body = JSON.parse(o?.body || '{}');
    if (method !== 'deleteMessage') sent.push({ method, body });
    if (/^send/.test(method)) return new Response(JSON.stringify({ ok: true, result: { message_id: ++mid } }));
    return new Response(JSON.stringify({ ok: true, result: true }));
  },
};
const hook = async (text, chat = 560001) => {
  const res = await worker.fetch(new Request('https://api.test/tg/webhook/' + tgWebhookPath(SECRET), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET },
    body: JSON.stringify({ update_id: mid, message: { message_id: mid + 50, chat: { id: chat, type: 'private' }, from: { id: chat }, text } }),
  }), wenv);
  return res.json();
};
let wr = await hook('/start');
ok(wr.cmd === 'start' && sent.some((x) => x.method === 'sendPhoto') && sent.some((x) => x.method === 'sendWidget' && x.body.chat_id === 560001), '/start sends banner and widget', wr);
ok(sent.some((x) => x.method === 'pinChatMessage'), '/start pins the hub');
const firstMid = sent.find((x) => x.method === 'sendWidget').body;
sent = [];
wr = await hook('/start');
ok(sent.some((x) => x.method === 'editMessageWidgetData') && !sent.some((x) => x.method === 'sendWidget'), 'second /start does not duplicate widget', wr);
sent = [];
wr = await hook('/hub', 560002);
ok(wr.cmd === 'hub' && sent.some((x) => x.method === 'sendWidget') && sent.some((x) => x.method === 'pinChatMessage'), '/hub sends and pins for a new chat', wr);
sent = [];
wr = await hook('/hub', 560002);
ok(wr.cmd === 'hub' && sent.some((x) => x.method === 'editMessageWidgetData') && !sent.some((x) => x.method === 'sendWidget'), '/hub dedupes', wr);

console.log('\n[frontend startapp=zamer]');
const tma = fs.readFileSync(new URL('../../tma.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
ok(/START_PARAM === 'zamer'/.test(tma) && /view', 'zamer'/.test(tma), 'tma.js maps startapp=zamer → view=zamer');
ok(/sp === 'zamer'/.test(app) && /view = 'zamer'/.test(app), 'app.js getDeepLinkView handles startapp=zamer');

if (fails) { console.log('\n✗ ' + fails + ' failed'); process.exit(1); }
console.log('\n✓ v320 ok');
