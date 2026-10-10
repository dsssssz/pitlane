// v137: магазин — POST /shop/order, GET /shop/orders, сообщения бота, удаление с аккаунтом, фронт. Всё на моках (MemKV + перехват Telegram).
// node test/v137.test.mjs   · тексты бот-сообщений → /workspace/home-shots/v137-bot-messages.txt (если папка есть)
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import * as S from '../src/shop.js';
import { SHOP_CONFIG, SHOP_PRODUCTS, productById, priceLine, fmtRub, orderTotal } from '../../shop-config.js';
import fs from 'fs';
const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 500) : ''); } };
const kv = new MemKV();
let sent = []; let tgFail = null;
const env = {
  PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'A'.repeat(30), TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', FEEDBACK_CHAT_ID: '8591275999', SHOP_CHAT_ID: '8591275999',
  __fetch: async (u, o) => { const b = JSON.parse(o?.body || '{}'); sent.push({ method: String(u).split('/').pop(), body: b }); if (tgFail && tgFail(b)) return new Response(JSON.stringify({ ok: false, description: 'Bad Request: BUTTON_USER_PRIVACY_RESTRICTED' }), { status: 400 }); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })); },
};
let ipSeq = 1;
async function call(method, path, { body, token, ip } = {}) {
  const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.137.' + (ipSeq % 200) + '.' + (ipSeq++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: res.status, data: d };
}
let phoneSeq = 0;
async function login(nick, tg, username) {
  const phone = '7900137' + String(++phoneSeq).padStart(4, '0');
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  if (tg) { const rec = JSON.parse(await kv.get('pilot:' + v.data.pilotId)); rec.providers.push({ type: 'tg', id: String(tg), ...(username ? { username } : {}) }); await kv.put('pilot:' + rec.id, JSON.stringify(rec)); await kv.put('auth:tg:' + tg, rec.id); }
  return { token: v.data.token, id: v.data.pilotId, tg, nick, phone };
}
const cid = () => Math.random().toString(36).slice(2, 12) + 'x';
const base = (o = {}) => ({ productId: 'pitlane-gps', qty: 2, city: 'Москва', contact: { method: 'tg' }, comment: 'BMW M2, Moscow Raceway', cid: cid(), ...o });

console.log('\n[конфиг и цена]');
const P = productById('pitlane-gps');
ok(P && P.price === 6800 && P.status === 'preorder', 'PITLANE GPS: 6 800 ₽, предзаказ', P && { price: P.price, status: P.status });
ok(priceLine(P) === '6\u00a0800\u00a0₽ · Предзаказ', 'строка цены «6 800 ₽ · Предзаказ»', priceLine(P));
ok(orderTotal(P, 3) === 20400 && fmtRub(20400) === '20\u00a0400\u00a0₽', 'сумма по количеству');
const cfgSrc = fs.readFileSync(new URL('../../shop-config.js', import.meta.url), 'utf8');
ok(/5\s?450/.test(cfgSrc) && /25\s?%/.test(cfgSrc) && /себестоимост/i.test(cfgSrc), 'в конфиге комментарий: себестоимость 5 450 ₽ и наценка 25 %');
ok(SHOP_CONFIG.payments === false, 'онлайн-оплата выключена флагом');
ok(new Set(SHOP_PRODUCTS.map((p) => p.id)).size === SHOP_PRODUCTS.length, 'id товаров уникальны (каталог расширяемый)');
for (const g of P.gallery) for (const f of [...g.webp.split(','), ...g.avif.split(',')].map((x) => x.trim().split(' ')[0])) {
  const pth = new URL('../../' + f.replace(/^\.\//, ''), import.meta.url); ok(fs.existsSync(pth) && fs.statSync(pth).size < 40000, 'картинка галереи есть и лёгкая: ' + f);
}
ok(P.specs.some(([k, v]) => /NEO-M9N/.test(v) && /25 Гц/.test(v)) && P.specs.some(([, v]) => /режим модема/.test(v)) && P.specs.some(([, v]) => /100 \/ 200 \/ 300/.test(v)) && P.specs.some(([, v]) => /магнит/.test(v)) && P.specs.some(([, v]) => /76 × 46 × 15/.test(v)), 'честные характеристики на месте');

console.log('\n[POST /shop/order]');
const A = await login('Мага Тест', 913701, 'maga_buyer'); const B = await login('Без ТГ'); const C = await login('Скрытый', 913703);
ok((await call('POST', '/shop/order', { body: base() })).status === 401, 'без входа — 401');
ok((await call('GET', '/shop/orders')).status === 401, 'GET без входа — 401');
for (const [bad, field, why] of [
  [{ productId: 'nope' }, 'productId', 'неизвестный товар'], [{ qty: 0 }, 'qty', 'кол-во 0'], [{ qty: 6 }, 'qty', 'кол-во > maxQty'], [{ qty: 1.5 }, 'qty', 'дробное'],
  [{ city: ' ' }, 'city', 'пустой город'], [{ city: '+7 900 123 45 67' }, 'city', 'телефон вместо города'], [{ contact: { method: 'email' } }, 'contact', 'неизвестный способ связи'],
  [{ contact: { method: 'tg_other', value: '@ab' } }, 'contact', 'короткий ник'], [{ contact: { method: 'phone', value: '123' } }, 'contact', 'кривой телефон'], [{ cid: 'X!' }, 'cid', 'без cid'],
]) { const r = await call('POST', '/shop/order', { token: A.token, body: base(bad) }); ok(r.status === 400 && r.data.field === field, 'валидация: ' + why, r.data); }
let r = await call('POST', '/shop/order', { token: B.token, body: base() });
ok(r.status === 400 && r.data.code === 'no_tg', 'вход без Telegram + «мой Telegram» → no_tg', r.data);
const before = kv.m.size;
ok([...kv.m.keys()].filter((k) => k.startsWith('shoporder')).length === 0, 'невалидные заявки ничего не сохранили');
sent = [];
const c1 = cid();
r = await call('POST', '/shop/order', { token: A.token, body: base({ cid: c1, comment: '<b>жирный</b> & <script>' }) });
ok(r.status === 200 && r.data.ok && /^o[a-z0-9]{12}$/.test(r.data.order.id), 'заявка создана', r.data);
const o1 = r.data.order;
ok(o1.total === 13600 && o1.price === 6800 && o1.qty === 2 && o1.status === 'new' && /Заявка принята/.test(o1.statusLabel), 'сумма считает сервер: 2 × 6 800 = 13 600, статус new');
ok(r.data.forwarded === true && r.data.buyerNotified === true, 'ушло Маге и покупателю');
const toOwner = sent.filter((x) => x.method === 'sendMessage' && String(x.body.chat_id) === '8591275999');
const toBuyer = sent.filter((x) => x.method === 'sendMessage' && x.body.chat_id === 913701);
ok(toOwner.length === 1 && toBuyer.length === 1, 'по одному сообщению', sent.map((x) => x.body.chat_id));
const ow = toOwner[0]?.body || {}; const bu = toBuyer[0]?.body || {};
ok(/13\u00a0600\u00a0₽/.test(ow.text) && /2 × 6\u00a0800\u00a0₽/.test(ow.text) && /Москва/.test(ow.text) && /@maga_buyer/.test(ow.text) && ow.text.includes(o1.id), 'Маге: сумма по кол-ву, город, контакт, номер', ow.text);
ok(/bжирный\/b &amp; script/.test(ow.text) && !/<script|<b>жирный/.test(ow.text), 'пользовательский текст очищен от <> и экранирован (HTML)', ow.text);
ok(ow.reply_markup?.inline_keyboard?.[0]?.[0]?.text === 'Написать покупателю' && ow.reply_markup.inline_keyboard[0][0].url === 'https://t.me/maga_buyer', 'кнопка «Написать покупателю» → t.me/username', ow.reply_markup);
ok(!ow.text.includes(A.phone) && !ow.text.includes('7900137'), 'телефон входа в заявку не попадает');
ok(!/[\u{1F300}-\u{1FAFF}\u2705]/u.test(ow.text + bu.text) && /Заявка принята/.test(bu.text) && /свяжемся/.test(bu.text) && /13\u00a0600\u00a0₽/.test(bu.text) && bu.reply_markup?.inline_keyboard?.[0]?.[0]?.web_app?.url?.includes('screen=shop'), 'покупателю: «Заявка принята, свяжемся» + кнопка «Мои заявки»', bu);
// идемпотентность
sent = [];
r = await call('POST', '/shop/order', { token: A.token, body: base({ cid: c1 }) });
ok(r.status === 200 && r.data.duplicate === true && r.data.order.id === o1.id && sent.length === 0, 'повтор с тем же cid — та же заявка, без новых сообщений', r.data);
r = await call('GET', '/shop/orders', { token: A.token });
ok(r.status === 200 && r.data.orders.length === 1 && r.data.orders[0].id === o1.id && r.data.payments === false && r.data.tg === '@maga_buyer', 'GET /shop/orders — моя заявка, статус и Telegram входа', r.data);
{ const rb = (await call('GET', '/shop/orders', { token: B.token })).data; ok(rb.orders.length === 0 && rb.tg === null, 'чужие заявки не видны; без Telegram-входа tg=null', rb); }
// другой ник / телефон
sent = [];
r = await call('POST', '/shop/order', { token: B.token, body: base({ qty: 1, contact: { method: 'tg_other', value: 'Some_Racer' } }) });
ok(r.status === 200 && r.data.order.contact === '@Some_Racer' && r.data.buyerNotified === false, 'другой Telegram: сохранён @ник; без ТГ-входа бот покупателю не пишет', r.data);
ok(sent[0]?.body.reply_markup?.inline_keyboard?.[0]?.[0]?.url === 'https://t.me/Some_Racer' && /6\u00a0800\u00a0₽/.test(sent[0]?.body.text) && !/×\s1\s\(/.test(sent[0]?.body.text), 'кнопка на указанный ник, сумма за 1 шт.');
const ownerOther = sent[0]?.body.text;
sent = [];
r = await call('POST', '/shop/order', { token: B.token, body: base({ qty: 1, contact: { method: 'phone', value: '8 (900) 111-22-33' } }) });
ok(r.status === 200 && r.data.order.contact === '+79001112233' && (sent[0]?.body.reply_markup?.inline_keyboard || []).length === 0 && /\+79001112233/.test(sent[0]?.body.text), 'телефон нормализован, без url-кнопки', r.data);
const ownerPhone = sent[0]?.body.text;
// скрытый профиль: tg://user отвергнут → повтор без кнопки
sent = []; tgFail = (b) => !!b.reply_markup?.inline_keyboard?.[0]?.[0]?.url?.startsWith('tg://');
r = await call('POST', '/shop/order', { token: C.token, body: base({ qty: 1 }) });
tgFail = null;
ok(r.status === 200 && r.data.forwarded === true && sent.filter((x) => String(x.body.chat_id) === '8591275999').length === 2, 'tg://user отвергнут → заявка всё равно доходит без кнопки', sent.map((x) => x.body.reply_markup));
// не продаётся
const prev = P.status; P.status = 'out';
r = await call('POST', '/shop/order', { token: A.token, body: base() });
ok(r.status === 400 && r.data.error === 'not available', 'товар «нет в наличии» — заявку не принять', r.data);
P.status = prev;
// лимит
let last;
for (let i = 0; i < 5; i++) last = await call('POST', '/shop/order', { token: A.token, body: base({ qty: 1 }) });
ok(last.status === 429, 'лимит заявок в сутки на пилота (' + S.SHOP_RL.pilotDay + ')', last.status);
r = await call('GET', '/shop/orders', { token: A.token });
ok(r.data.orders.length === S.SHOP_RL.pilotDay && r.data.orders.every((o) => !('pid' in o) && !('cid' in o)), 'в ответе нет служебных полей (pid, cid)');
const ttlOk = [...kv.m.entries()].filter(([k]) => k.startsWith('shoporder')).every(([, v]) => v.exp);
ok(ttlOk, 'у заявок есть срок хранения (TTL)');

console.log('\n[удаление аккаунта]');
const keysA = () => [...kv.m.entries()].filter(([k, v]) => k === 'shoporders:' + A.id || (k.startsWith('shoporder:') && v.meta?.pid === A.id)).length;
ok(keysA() > 0, 'до удаления заявки A есть');
const del = await call('DELETE', '/account', { token: A.token, body: { confirm: 'DELETE' } });
ok(del.status === 200, 'аккаунт удалён', del.data);
ok(keysA() === 0, 'заявки A удалены вместе с аккаунтом');
ok([...kv.m.keys()].some((k) => k === 'shoporders:' + B.id), 'заявки B не тронуты');

console.log('\n[фронт]');
const R = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const html = R('index.html'); const app = R('app.js'); const ui = R('shop-ui.js'); const css = R('styles.css'); const sw = R('sw.js'); const pp = R('privacy.html');
ok(/data-plm="shop"[\s\S]{0,400}Магазин/.test(html), 'пункт «Магазин» в меню ☰');
ok(/id="railShop"[^>]*class|class="nav-btn nav-shop" id="railShop"/.test(html) && !/railShop"[^>]*sheet-tab/.test(html), 'кнопка в боковой рейке (только широкие экраны — не sheet-tab)');
ok(/id="shopSheet"/.test(html) && /id="shopBody"/.test(html), 'шторка магазина');
ok(/import\('\.\/shop-ui\.js'\)/.test(app) && /k === 'shop'/.test(app) && /shop: 'home'/.test(app), 'модуль грузится лениво; меню и ?screen=shop');
ok(!/innerHTML/.test(ui), 'shop-ui.js без innerHTML (только textContent)');
ok(/loading = eager \? 'eager' : 'lazy'/.test(ui) && /image\/avif/.test(ui), 'галерея: avif + webp, ленивая загрузка');
ok(/cid: d\.cid/.test(ui) && /if \(st\.busy\) return/.test(ui), 'заявка с cid, защита от двойного нажатия');
const shopCss = css.slice(css.indexOf('v137: магазин'));
ok(!/(box|text)-shadow:\s*[^;]*\d+px\s+\d+px\s+([2-9]|\d{2,})px[^;]*rgba?\(\s*(57|0|74)\s*,\s*2[0-5]\d/.test(shopCss) && !/drop-shadow/.test(shopCss) && !/#39ff|#0f0\b|lime/i.test(shopCss), 'без зелёного неона/свечения в стилях магазина');
ok(!/img\/brands|brand-mark/.test(ui + shopCss), 'без эмблем марок');
ok(/pitlane-v1(3[7-9]|[4-9]\d)/.test(sw) && /shop-ui\.js/.test(sw) && /shop-config\.js/.test(sw), 'sw.js: кэш поднят, модули магазина в precache');
ok(/Заявка в магазине/.test(pp) && /заявки в магазине/.test(pp), 'политика конфиденциальности: заявки и их удаление');
ok(/SHOP_CHAT_ID/.test(fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')), 'адресат заявок в конфиге Worker');

// тексты бот-сообщений
const out = '/workspace/home-shots';
if (fs.existsSync(out)) {
  const strip = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const kb = (b) => (b.reply_markup?.inline_keyboard || []).flat().map((x) => '[' + x.text + (x.url ? ' → ' + x.url : x.web_app ? ' → Mini App ' + x.web_app.url : '') + ']').join(' ');
  fs.writeFileSync(out + '/v137-bot-messages.txt', [
    '=== Маге (SHOP_CHAT_ID), Telegram-вход покупателя, 2 шт ===', strip(ow.text), kb(ow), '',
    '=== Маге, контакт «другой Telegram», 1 шт ===', strip(ownerOther), '',
    '=== Маге, контакт «телефон» (без кнопки) ===', strip(ownerPhone), '',
    '=== Покупателю ===', strip(bu.text), kb(bu), '',
  ].join('\n'));
  console.log('  → ' + out + '/v137-bot-messages.txt');
}
console.log(fails ? `\n✗ ${fails} fail(s)` : '\n✓ v137 ok');
process.exit(fails ? 1 : 0);
