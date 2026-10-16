// v144: магазин — корпус и держатель как заявки в бота, подписки «Скоро» без оплаты. Всё на моках.
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { SHOP_CONFIG, SHOP_PRODUCTS, SHOP_SUBS, productById, orderable } from '../../shop-config.js';
import fs from 'fs';
const worker = withAutoRefresh(rawWorker);
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : JSON.stringify(x ?? '').slice(0, 300)); if (!c) fails++; };
ok(['pitlane-gps', 'pitlane-gps-case', 'pitlane-mount'].every((id) => productById(id) && orderable(productById(id))), 'чип, корпус, держатель — предзаказ');
ok(productById('pitlane-gps').price === 6800, 'цена чипа не тронута');
ok(SHOP_SUBS.length === 2 && SHOP_SUBS.every((s) => s.status === 'soon' && !('price' in s)), 'подписки — «скоро», без цены');
ok(SHOP_CONFIG.payments === false, 'оплаты выключены');
ok(!productById('sub-analytics'), 'подписку нельзя заказать как товар');
const kv = new MemKV(); const sent = [];
const env = { PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'A'.repeat(30), TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', FEEDBACK_CHAT_ID: '8591275999', SHOP_CHAT_ID: '8591275999',
  __fetch: async (u, o) => { sent.push({ m: String(u).split('/').pop(), b: JSON.parse(o?.body || '{}') }); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })); } };
let ip = 1;
async function call(method, path, { body, token } = {}) { const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.144.0.' + (ip++ % 250) }; if (token) h.Authorization = 'Bearer ' + token;
  const r = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: r.status, data: d }; }
const o = await call('POST', '/auth/otp', { body: { phone: '79001440001' } });
const v = await call('POST', '/auth/verify', { body: { phone: '79001440001', code: o.data.demoCode, nick: 'Мага' } });
const r = await call('POST', '/shop/order', { token: v.data.token, body: { productId: 'pitlane-mount', qty: 2, city: 'Москва', contact: { method: 'phone', value: '+79001112233' }, cid: 'mount0000001' } });
ok(r.status === 200 && r.data.ok && r.data.order.total == null && r.data.forwarded, 'заявка на держатель ушла в бот (цена по запросу)', r);
ok(sent.some((x) => x.m === 'sendMessage' && x.b.chat_id === '8591275999' && /Магнитный держатель/.test(x.b.text)), 'сообщение владельцу');
ok((await call('POST', '/shop/order', { token: v.data.token, body: { productId: 'sub-tracks', qty: 1, city: 'Москва', contact: { method: 'phone', value: '+79001112233' }, cid: 'sub000000001' } })).status === 400, 'подписка не заказывается');
const ui = fs.readFileSync(new URL('../../shop-ui.js', import.meta.url), 'utf8');
ok(ui.includes('SHOP_SUBS') && ui.includes("'Скоро'"), 'витрина показывает подписки «Скоро»');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v144 OK');
