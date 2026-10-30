import rawWorker, { tgWebhookPath, BOT_COMMANDS } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';

import { ORDER_ADMIN_STATUSES, ORDER_STATUS, productById } from '../../shop-config.js';
import fs from 'fs'; import path from 'path';
const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } };
const kv = new MemKV(); const SECRET = 'S'.repeat(40); const OWNER = 8591275999; const BUYER = 7182361;
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
import { SHOP_CONFIG as SC } from '../../shop-config.js';
SC.foundersOpen = true; let m;
async function flow() {
  await tap('ca:pitlane-gps'); await tap('ct'); await tap('cd:post'); await tap('cp'); await say('DRAG10');
  await tap('co:req'); await say('Казань'); await say('420000, Казань, ул. Баумана 1'); await tap('ot:tg'); await say('нет');
  return last(BUYER);
}
console.log('\n[v236: превью «Проверьте заказ» без мест основателей]');
await kv.put('shopfounders', JSON.stringify({ ids: Array.from({ length: 50 }, (_, i) => 'o' + i), initAt: Date.now() }));
m = await flow();
ok(/Проверьте заказ/.test(txt(m)) && /8\u00a0289/.test(txt(m)) && !/7\u00a0289/.test(txt(m)), 'мест нет → обычная цена 8 499 + 290 − 500 = 8 289', txt(m));
await tap('ok'); m = last(BUYER);
ok(/8\u00a0289/.test(txt(m)) || !/7\u00a0289/.test(txt(m)), 'заказ оформлен без цены основателя', txt(m));
await kv.put('shopfounders', JSON.stringify({ ids: ['o1'], initAt: Date.now() }));
m = await flow();
ok(/7\u00a0289/.test(txt(m)), 'места есть → цена основателя 7 289', txt(m));
console.log(fails ? `FAIL ${fails}` : 'OK'); process.exit(fails ? 1 : 0);
