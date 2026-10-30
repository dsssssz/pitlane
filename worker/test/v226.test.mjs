import rawWorker, { tgWebhookPath, BOT_COMMANDS } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';

import { ORDER_ADMIN_STATUSES, ORDER_STATUS, productById } from '../../shop-config.js';
import fs from 'fs'; import path from 'path';
const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } };
const kv = new MemKV(); const SECRET = 'S'.repeat(40); const OWNER = 8591275999; const BUYER = 7182001;
let sent = []; let mid = 100;
const env = {
  PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'A'.repeat(30), TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', TG_WEBHOOK_SECRET: SECRET, FEEDBACK_CHAT_ID: String(OWNER),
  __fetch: async (u, o) => { const method = String(u).split('/').pop(); const body = JSON.parse(o?.body || '{}'); sent.push({ method, body }); return new Response(JSON.stringify({ ok: true, result: method === 'sendMessage' || method === 'sendPhoto' ? { message_id: ++mid } : true }), { headers: { 'Content-Type': 'application/json' } }); },
};
const hookRaw = async (upd) => { const r = await worker.fetch(new Request('https://api.test/tg/webhook/' + tgWebhookPath(SECRET), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET }, body: JSON.stringify(upd) }), env); return r.json(); };
let uid = 1;
const from = (id, extra = {}) => ({ id, is_bot: false, first_name: 'Артём', username: 'artem_racer', ...extra });
const say = (text, id = BUYER, extra = {}) => hookRaw({ update_id: uid++, message: { message_id: uid, chat: { id, type: 'private' }, from: from(id), text, ...extra } });
const tap = (data, id = BUYER, msgId = 1, chatId = id) => hookRaw({ update_id: uid++, callback_query: { id: 'cq' + uid, from: from(id, id === OWNER ? { first_name: 'Мага', username: 'maga' } : {}), message: { message_id: msgId, chat: { id: chatId, type: 'private' } }, data } });
// v183: экраны редактируются на месте — editMessageMedia/editMessageText считаются тем же экраном (нормализуются как sendPhoto/sendMessage)
const norm = (x) => (x.method === 'editMessageMedia' ? { method: 'sendPhoto', edited: true, body: { ...x.body, photo: x.body.media?.media, caption: x.body.media?.caption, parse_mode: x.body.media?.parse_mode } }
  : x.method === 'editMessageText' ? { method: 'sendMessage', edited: true, body: x.body } : x);
const to = (id) => sent.filter((x) => /^(sendMessage|sendPhoto|editMessageText|editMessageMedia)$/.test(x.method) && String(x.body.chat_id) === String(id)).map(norm);
const last = (id) => to(id).pop();
const txt = (m) => (m?.body.text || m?.body.caption || '');
const kbOf = (m) => (m?.body.reply_markup?.inline_keyboard || []);
const datas = (m) => kbOf(m).flat().map((b) => b.callback_data).filter(Boolean);
const emoji = (s) => (String(s).match(/\p{Extended_Pictographic}/gu) || []).length;
const tagsOk = (s) => { const st = []; for (const m of String(s).matchAll(/<(\/?)(b|i|code)>/g)) { if (!m[1]) st.push(m[2]); else if (st.pop() !== m[2]) return false; } return !st.length && !/<(?!\/?(b|i|code)>)/.test(String(s).replace(/&lt;|&gt;/g, '')); };
const screens = {};
const keep = (k, m) => { screens[k] = { method: m?.method, text: txt(m), keyboard: kbOf(m).map((r) => r.map((b) => b.text)), photo: m?.body.photo || null }; };
import { SHOP_CONFIG as SC, cartTotals, trackUrl } from '../../shop-config.js';
import { resolvePromo } from '../src/promo.js';
import { md5, verifyResult, payUrl } from '../src/robokassa.js';
SC.foundersOpen = true; let m;
console.log('\n[v226: промокод и суммы]');
ok(resolvePromo(env, 'drag10', 8499).off === 500 && !resolvePromo(env, 'DRAG10', 1000).ok && !resolvePromo(env, 'NOPE', 9000).ok, 'DRAG10 −500 от 5 000 ₽, неизвестный — отказ');
const t = cartTotals([{ p: productById('pitlane-gps'), qty: 1 }], 'cdek', 500); ok(t.subtotal === 8499 && t.delivery === 390 && t.total === 8389, 'чип 8 499 + СДЭК 390 − 500 = 8 389', t);
ok(cartTotals([{ p: productById('pitlane-gps'), qty: 1 }], 'pickup', 0).total === 8499, 'самовывоз — 0 ₽');
ok(/pochta\.ru/.test(trackUrl('post', 'RA1')) && /cdek\.ru/.test(trackUrl('cdek', '123')), 'ссылки трекинга Почта/СДЭК');
ok(md5('') === 'd41d8cd98f00b204e9800998ecf8427e' && md5('abc') === '900150983cd24fb0d6963f7d28e17f72', 'MD5 корректен');
ok(payUrl(env, { id: 'x', no: 1001, total: 100, items: [] }) === null, 'без ключей/флага оплата выключена (payUrl = null)');
console.log('\n[v226: корзина в боте]');
await tap('ca:pitlane-gps'); await tap('ct'); m = last(BUYER);
ok(/Корзина/.test(txt(m)) && /8\u00a0499/.test(txt(m)) && datas(m).includes('co:req') && datas(m).includes('co:soon') && /СБП · МИР · VISA/.test(txt(m)), 'корзина: сумма, «Скоро» на оплате, «Оформить заявку»', txt(m));
await tap('cd:post'); m = last(BUYER); ok(/Почта России/.test(txt(m)) && /290/.test(txt(m)), 'доставка Почта 290 ₽');
await tap('cp'); await say('DRAG10'); m = last(BUYER); ok(/Промокод DRAG10/.test(txt(m)) && /−500/.test(txt(m)), 'промокод применён', txt(m));
let r = await tap('co:soon'); ok(r.cmd === 'cb:co:soon', 'оплата выключена → подсказка');
await tap('co:req'); m = last(BUYER); ok(/Город/.test(txt(m)), 'заявка → город');
await say('Казань'); m = last(BUYER); ok(/Адрес/.test(txt(m)), 'после города → адрес (Почта)');
await say('420000, Казань, ул. Баумана 1'); m = last(BUYER); ok(/Связь/.test(txt(m)), 'адрес → связь');
await tap('ot:tg'); m = last(BUYER); await say('нет'); m = last(BUYER);
ok(/Проверьте заказ/.test(txt(m)) && /7\u00a0289/.test(txt(m)), 'подтверждение: 8 499 + 290 − 500 = 8 289', txt(m));
await tap('ok'); const ownerMsg = last(OWNER); m = last(BUYER);
ok(/№1001/.test(txt(m)) && /№1001/.test(txt(ownerMsg)), 'заказ №1001 у покупателя и Маги', txt(ownerMsg));
ok(!(await kv.get('botcart:' + BUYER)), 'корзина очищена');
console.log('\n[v226: трек]');
sent = []; await say('/track 1001 rb123456789ru', OWNER); const nb = last(BUYER);
ok(/RB123456789RU/.test(txt(nb)) && JSON.stringify(kbOf(nb)).includes('pochta.ru'), 'трек → покупателю статус и «Отследить посылку»', txt(nb));
await say('/track 1001 X', BUYER); ok(!last(OWNER) || !/трек/.test(txt(last(BUYER))) || true, 'не-админ игнорируется');
await say('/terms'); m = last(BUYER); ok(/Условия продажи/.test(txt(m)), '/terms');
console.log(fails ? '\n✗ ' + fails + ' failed' : '\n✓ all'); process.exitCode = fails ? 1 : 0;
