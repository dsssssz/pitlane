/**
 * v137: магазин — заявки на товары (PITLANE GPS и др.). Онлайн-оплаты нет: заявка → бот пишет команде, покупателю — «принята».
 *
 * POST /shop/order   (только вошедшие) {productId, qty, city, contact:{method:'tg'|'tg_other'|'phone', value?}, comment?, cid}
 *                    → { ok, order, duplicate?, forwarded, buyerNotified }   · идемпотентно по cid (повтор не создаёт заявку)
 * GET  /shop/orders  (только вошедшие) → { ok, orders: [...] }  — мои заявки и статус
 *
 * Цена и наличие — только из ../../shop-config.js (сервер не верит цене из запроса).
 * KV:  shoporders:<pid> [order…] (последние 20)  ·  shoporder:<id> {order + контакт} metadata {pid}  — обе TTL orderTtlDays,
 *      удаляются вместе с аккаунтом (deleteAccountShop). Персональные данные — минимум: город, способ связи, комментарий.
 * Адресат заявок: env.SHOP_CHAT_ID, иначе env.FEEDBACK_CHAT_ID (владелец).
 * PAYMENTS: при SHOP_CONFIG.payments && legalReady() здесь появится ссылка на оплату (createInvoiceLink / провайдер) — сейчас выключено.
 */
import { FOUNDERS, FOUNDER_CONFIRMED, founderTotal, SHOP_CONFIG, ORDER_STATUS, ORDER_ADMIN_STATUSES, ORDER_SHORT, productById, orderable, orderTotal, fmtRub, statusOf, deliveryById, cartTotals, lineTotal, trackUrl, MAX_CART_LINES, SHOP_PAY_METHODS } from '../../shop-config.js';
import { paymentsOn, payUrl, verifyResult } from './robokassa.js';
import { resolvePromo } from './promo.js';
import { legalReady } from '../../legal-config.js';

export const SHOP_ORDERS_MAX = 20;
const CID_RE = /^[a-z0-9]{8,32}$/;
const ID_RE = /^o[a-z0-9]{10,16}$/;
const TG_USER_RE = /^@?([A-Za-z][A-Za-z0-9_]{4,31})$/;
const METHODS = ['tg', 'tg_other', 'phone'];
export const SHOP_RL = { pilotDay: 5, ipDay: 10, globalDay: 200 };

const ttl = () => Math.max(1, Number(SHOP_CONFIG.orderTtlDays) || 365) * 86400;
const ordersKey = (pid) => 'shoporders:' + pid;
const orderKey = (id) => 'shoporder:' + id;
const FKEY = 'shopfounders';

/** v222: «Основатели» — список id заявок на чип, занявших места (не отменённые, по времени). Честный счётчик:
 *  при первом обращении собирается из уже существующих заявок в KV, дальше ведётся при создании/отмене. */
export async function foundersState(kv, h) {
  const s = await h.kvJson(kv, FKEY);
  if (s && Array.isArray(s.ids)) return s;
  const all = [];
  for (const k of await h.kvListAll(kv, 'shoporder:')) {
    const o = await h.kvJson(kv, k.name);
    if (o && o.productId === FOUNDERS.productId && o.status !== 'canceled') all.push(o);
  }
  all.sort((a, b) => (a.at || 0) - (b.at || 0));
  const st = { ids: all.slice(0, FOUNDERS.limit).map((o) => o.id), initAt: Date.now() };
  await kv.put(FKEY, JSON.stringify(st));
  return st;
}
export const foundersPublic = (s) => ({ open: !!SHOP_CONFIG.foundersOpen, limit: FOUNDERS.limit, taken: Math.min(FOUNDERS.limit, s.ids.length), left: Math.max(0, FOUNDERS.limit - s.ids.length), price: FOUNDERS.price });

export function normPhone(v) {
  const d = String(v || '').replace(/[^\d+]/g, '');
  let n = d.replace(/^\+/, '');
  if (/^8\d{10}$/.test(n)) n = '7' + n.slice(1);
  return /^\d{10,15}$/.test(n) ? '+' + n : null;
}

/** Валидация тела заявки → { rec } | { error, field } (без побочных эффектов). */
export function sanitizeOrder(body, h, { hasTg, env } = {}) {
  // v226: корзина {items:[{productId,qty}], delivery:{id,addr}, promo, payMethod}; старое тело {productId, qty} = корзина из одной строки
  const raw = Array.isArray(body?.items) ? body.items : [{ productId: body?.productId, qty: body?.qty }];
  if (!raw.length || raw.length > MAX_CART_LINES) return { error: 'items', field: 'items' };
  const items = [];
  for (const it of raw) {
    const p = productById(String(it?.productId || ''));
    if (!p) return { error: 'unknown product', field: 'productId' };
    if (!orderable(p)) return { error: 'not available', field: 'productId', productId: p.id };
    const qty = Number(it?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > (p.maxQty || 5)) return { error: 'qty 1..' + (p.maxQty || 5), field: 'qty' };
    const ex = items.find((x) => x.productId === p.id);
    if (ex) { ex.qty = Math.min(p.maxQty || 5, ex.qty + qty); continue; }
    items.push({ productId: p.id, title: p.title, qty, price: Number.isFinite(p.price) ? p.price : null });
  }
  let delivery = null;
  if (body?.delivery != null) {
    const d = deliveryById(String(body.delivery?.id || body.delivery || ''));
    if (!d) return { error: 'delivery', field: 'delivery' };
    const addr = h.cleanLabel(String(body.delivery?.addr || '').replace(/\s+/g, ' '), 200);
    if (d.id !== 'pickup' && addr.length < 5) return { error: 'address', field: 'addr' };
    delivery = { id: d.id, title: d.title, price: d.price, addr: d.id === 'pickup' ? '' : addr };
  }
  const payMethod = SHOP_PAY_METHODS.some((m) => m.id === body?.payMethod) ? body.payMethod : null;
  const promoCode = body?.promo ? String(body.promo).slice(0, 24) : '';
  const city = h.cleanLabel(body?.city, 60);
  if (city.length < 2) return { error: 'city required', field: 'city' };
  if (h.containsPhone(city)) return { error: 'bad city', field: 'city' };
  const m = METHODS.includes(body?.contact?.method) ? body.contact.method : null;
  if (!m) return { error: 'contact method', field: 'contact' };
  let contact = { method: m };
  if (m === 'tg') { if (!hasTg) return { error: 'no telegram in session', field: 'contact', code: 'no_tg' }; }
  else if (m === 'tg_other') { const mm = TG_USER_RE.exec(String(body?.contact?.value || '').trim()); if (!mm) return { error: 'telegram username', field: 'contact' }; contact.value = '@' + mm[1]; }
  else { const ph = normPhone(body?.contact?.value); if (!ph) return { error: 'phone', field: 'contact' }; contact.value = ph; }
  const comment = h.cleanLabel(String(body?.comment || '').replace(/\s+/g, ' '), 500);
  const cid = String(body?.cid || '');
  if (!CID_RE.test(cid)) return { error: 'cid required', field: 'cid' };
  const rec = priceRec({ items, delivery, payMethod, city, contact, comment, cid }, env, promoCode);
  if (rec.error) return rec;
  return { rec };
}

/** v226: суммы заказа считает только сервер: строки, доставка, промокод, цена основателя (founder). Поля productId/title/qty/price —
 *  первая строка (совместимость со старыми экранами и заявками). */
export function priceRec(r, env, promoCode, founder = false) {
  const lines = r.items.map((it) => ({ p: productById(it.productId), qty: it.qty, founder }));
  const pre = cartTotals(lines, r.delivery?.id, 0);
  let promo = null;
  if (promoCode) {
    const pr = resolvePromo(env, promoCode, pre.subtotal);
    if (!pr.ok) return { error: 'promo', field: 'promo', reason: pr.error, min: pr.min };
    promo = { code: pr.code, off: pr.off };
  } else if (r.promo) promo = r.promo;
  const t = cartTotals(lines, r.delivery?.id, promo ? promo.off : 0);
  if (promo) promo = { ...promo, off: t.off };
  const items = r.items.map((it, i) => ({ ...it, sum: lineTotal(lines[i].p, it.qty, founder) }));
  const first = items[0]; const qty = items.reduce((a, x) => a + x.qty, 0);
  return { ...r, items, promo, subtotal: t.subtotal, total: t.total,
    productId: first.productId, title: items.length > 1 ? first.title + ' + ещё ' + (items.length - 1) : first.title, qty: items.length > 1 ? qty : first.qty, price: first.price };
}
const itemsOf = (o) => (Array.isArray(o.items) && o.items.length ? o.items : [{ productId: o.productId, title: o.title, qty: o.qty, price: o.price, sum: o.total }]);
export const orderNo = (o) => (o.no ? '№' + o.no : o.id);

/** То, что видит покупатель (без чужих полей). */
export const publicOrder = (o) => ({
  id: o.id, at: o.at, productId: o.productId, title: o.title, qty: o.qty, price: o.price, total: o.total,
  city: o.city, contactMethod: o.contact?.method || null, contact: o.contact?.value || null, comment: o.comment || '',
  founder: !!o.founder, status: ORDER_STATUS[o.status] ? o.status : 'new', statusLabel: ORDER_STATUS[o.status] || ORDER_STATUS.new, payUrl: o.status === 'new' ? (o.payUrl || null) : null,
  no: o.no || null, items: itemsOf(o), delivery: o.delivery || null, promo: o.promo || null, subtotal: o.subtotal ?? o.total, payMethod: o.payMethod || null,
  track: o.track || null, trackUrl: trackUrl(o.delivery?.id, o.track), history: Array.isArray(o.history) ? o.history : [{ st: o.status || 'new', at: o.at }],
});
/** Строки заказа для сообщений (HTML-экранировано). */
export function itemLines(o, e) {
  return itemsOf(o).map((it) => e(it.title) + ' × ' + it.qty + (it.sum != null ? ' — ' + e(fmtRub(it.sum)) : ''));
}
export function sumLines(o, e) {
  const out = [];
  if (o.delivery) out.push('Доставка: ' + e(o.delivery.title) + ' — ' + (o.delivery.price ? e(fmtRub(o.delivery.price)) : 'бесплатно') + (o.delivery.addr ? '\n' + e(o.delivery.addr) : ''));
  if (o.promo) out.push('Промокод ' + e(o.promo.code) + ': −' + e(fmtRub(o.promo.off)));
  if (o.total != null) out.push('<b>Итого: ' + e(fmtRub(o.total)) + '</b>');
  if (o.track) out.push('Трек: <code>' + e(o.track) + '</code>');
  return out;
}

/** Сообщение команде (HTML, весь пользовательский текст экранирован) + клавиатура «Написать покупателю». */
export function msgOrderOwner(o, buyer, h) {
  const e = h.tgEsc;
  const sum = o.total != null ? fmtRub(o.total) + (o.qty > 1 ? ` (${o.qty} × ${fmtRub(o.price)})` : '') : 'цена по запросу';
  const contactLine = o.contact.method === 'tg'
    ? 'Telegram: ' + (buyer.username ? '@' + e(buyer.username) : 'id ' + e(buyer.tgId || '—')) + ' (из входа)'
    : o.contact.method === 'tg_other' ? 'Telegram: ' + e(o.contact.value) : 'Телефон: ' + e(o.contact.value);
  const text = [
    '<b>PITLANE · заявка ' + e(orderNo(o)) + '</b> · <code>' + e(o.id) + '</code>',
    '',
    ...(o.items ? [...itemLines(o, e), ...sumLines(o, e)] : ['<b>' + e(o.title) + '</b> × ' + o.qty + ' — <b>' + e(sum) + '</b>']),
    o.founder ? 'Основатель: цена ' + e(fmtRub(FOUNDERS.price)) + ' за 1 шт. «Принят» = подтвердить и выдать значок' : '',
    'Статус товара: ' + e(statusOf(productById(o.productId)).label) + ' · оплата: ' + (o.payUrl ? 'онлайн' + (o.payMethod ? ' (' + (o.payMethod === 'sbp' ? 'СБП' : 'карта') + ')' : '') : 'нет онлайн-оплаты, договориться'),
    'Трек-номер: /track ' + (o.no || o.id) + ' &lt;трек&gt;',
    '',
    'Город: ' + e(o.city),
    contactLine,
    o.comment ? 'Комментарий: ' + e(o.comment) : '',
    '',
    'Пилот: ' + e(buyer.nick || '—') + ' · аккаунт ' + e(buyer.pid) + (o.source === 'bot' ? ' · оформлено в боте' : ''),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  const url = o.contact.method === 'tg' ? (buyer.username ? 'https://t.me/' + buyer.username : (buyer.tgId ? 'tg://user?id=' + buyer.tgId : null))
    : o.contact.method === 'tg_other' ? 'https://t.me/' + o.contact.value.slice(1) : null;
  const keyboard = url ? [[{ text: 'Написать покупателю', url }]] : [];
  return { text: text + statusFooter(o), keyboard: [...keyboard, ...adminStatusKeyboard(o)] };
}

/** v182: строка статуса под заявкой у Маги (после смены статуса сообщение перерисовывается). */
function statusFooter(o) {
  const st = ORDER_STATUS[o.status] ? o.status : 'new';
  return '\n\nСтатус: <b>' + (ORDER_SHORT[st] || st) + '</b>';
}
/** v182: кнопки статуса для администратора — callback as:<id>:<status>; текущий отмечен точкой. */
export function adminStatusKeyboard(o) {
  const btn = (st) => ({ text: (o.status === st ? '· ' : '') + ORDER_SHORT[st], callback_data: 'as:' + o.id + ':' + st });
  const l = ORDER_ADMIN_STATUSES; const rows = [];
  for (let i = 0; i < l.length; i += 2) rows.push(l.slice(i, i + 2).map(btn));
  return rows;
}
const BUYER_NOTE = {
  paid: 'Оплата получена, спасибо! Чек придёт от «Мой налог». Начинаем сборку.',
  accepted: 'Заказ принят в работу. Напишем, когда начнём сборку.',
  assembling: 'Собираем и проверяем прибор. Обычно это занимает несколько дней.',
  shipped: 'Заказ передан в доставку.',
  delivered: 'Заказ доставлен. Если что-то не так — ответьте на это сообщение или откройте «Поддержка».',
  canceled: 'Заказ отменён. Если это ошибка — напишите в «Поддержка».',
};
/** v182: уведомление покупателю о смене статуса. */
export function msgOrderStatusBuyer(o, h) {
  const e = h.tgEsc;
  return [
    '<b>Заказ ' + e(orderNo(o)) + ' · ' + e(ORDER_SHORT[o.status] || o.status) + '</b>',
    e(o.title) + ' × ' + o.qty + (o.total != null ? ' · ' + e(fmtRub(o.total)) : ''),
    '',
    (BUYER_NOTE[o.status] || '') + (o.status === 'shipped' ? (o.track ? ' Трек-номер: <code>' + e(o.track) + '</code>' : ' Трек-номер пришлём в этом чате.') : ''),
  ].filter((l, i, a) => !(l === '' && i === a.length - 1)).join('\n');
}

export function msgOrderBuyer(o, h) {
  const e = h.tgEsc;
  const sum = o.total != null ? ' — ' + fmtRub(o.total) : '';
  return [
    '<b>' + (o.payUrl ? 'Заказ оформлен' : 'Заявка принята') + ' · ' + e(orderNo(o)) + '</b>',
    '',
    ...(o.items ? [...itemLines(o, e), ...sumLines(o, e)] : [e(o.title) + ' × ' + o.qty + e(sum) + ' · ' + e(statusOf(productById(o.productId)).label.toLowerCase())]),
    'Город: ' + e(o.city) + (o.delivery ? ' · ' + e(o.delivery.title) + (o.delivery.addr ? ', ' + e(o.delivery.addr) : '') : ''),
    'Номер для поддержки: <code>' + e(o.id) + '</code>',
    '',
    o.payUrl ? 'Оплатите по кнопке «Оплатить» — СБП или картой. Чек придёт автоматически.'
      : 'Мы свяжемся с вами ' + (o.contact.method === 'phone' ? 'по телефону' : 'в Telegram') + ', чтобы подтвердить заказ, оплату и доставку. Онлайн-оплаты пока нет — платить ничего не нужно, пока мы не напишем.',
    'Статусы заказа будут приходить в этот чат.',
  ].join('\n');
}

export async function listOrders(kv, pid, h) {
  const l = await h.kvJson(kv, ordersKey(pid));
  return Array.isArray(l) ? l.filter((o) => o && ID_RE.test(o.id)).slice(0, SHOP_ORDERS_MAX) : [];
}

export async function shopRoute({ req, env, path, headers, ip, pilot, h }) {
  if (!path.startsWith('/shop/')) return null;
  if (!SHOP_CONFIG.enabled) return h.json({ error: 'shop disabled' }, 404, headers);
  if (req.method === 'GET' && path === '/shop/founders') {
    const lim = await h.limitOr429(env, headers, [['rl:shopf:ip:' + ip, 300, 3600]]); if (lim) return lim;
    return h.json({ ok: true, ...foundersPublic(await foundersState(env.PITLANE, h)) }, 200, headers);
  }
  if (req.method === 'POST' && path === '/shop/promo') { // v226: проверка промокода (сумма — по серверным ценам)
    const lim = await h.limitOr429(env, headers, [['rl:shoppromo:ip:' + ip, 30, 3600]]); if (lim) return lim;
    const body = await h.readJson(req, 4 * 1024); if (!body) return h.json({ error: 'invalid json' }, 400, headers);
    const raw = Array.isArray(body.items) ? body.items.slice(0, MAX_CART_LINES) : [];
    let sub = 0;
    for (const it of raw) { const p = productById(String(it?.productId || '')); const q = Number(it?.qty); if (!p || !Number.isFinite(p.price) || !Number.isInteger(q) || q < 1 || q > 5) { sub = null; break; } sub += p.price * q; }
    const r = resolvePromo(env, body.code, raw.length ? sub : null);
    return h.json(r.ok ? { ok: true, code: r.code, off: r.off } : { ok: false, error: r.error, min: r.min || undefined }, 200, headers);
  }
  if (path === '/shop/robokassa/result') return robokassaResult(req, env, h);
  if (req.method === 'GET' && /^\/shop\/order\/o[a-z0-9]{10,16}$/.test(path)) {
    const denied = h.requireAuth(pilot, headers); if (denied) return denied;
    const o = await getOrder(env, path.slice('/shop/order/'.length), h);
    if (!o || o.pid !== pilot.id) return h.json({ ok: false, error: 'not found' }, 404, headers);
    return h.json({ ok: true, order: publicOrder(o) }, 200, headers);
  }
  if (req.method === 'GET' && path === '/shop/orders') {
    const denied = h.requireAuth(pilot, headers); if (denied) return denied;
    const lim = await h.limitOr429(env, headers, [['rl:shopget:p:' + pilot.id, 120, 3600]]); if (lim) return lim;
    const tgId = await h.tgChatOf(env, pilot.id); const un = tgId ? await h.tgUsernameOf(env, pilot.id) : null;
    // tg — есть ли Telegram во входе (для «Мой Telegram» в форме): '@username' | 'telegram' | null
    const mine = await listOrders(env.PITLANE, pilot.id, h);
    const fs = await foundersState(env.PITLANE, h);
    const founder = mine.some((o) => FOUNDER_CONFIRMED.includes(o.status) && (o.founder || fs.ids.includes(o.id)));
    return h.json({ ok: true, founder, founders: foundersPublic(fs), orders: mine.map(publicOrder), tg: un ? '@' + un : (tgId ? 'telegram' : null), payments: paymentsOn(env) }, 200, headers);
  }
  if (req.method === 'POST' && path === '/shop/order') {
    const denied = h.requireAuth(pilot, headers); if (denied) return denied;
    const body = await h.readJson(req, 8 * 1024);
    if (!body) return h.json({ error: 'invalid json' }, 400, headers);
    const tgId = await h.tgChatOf(env, pilot.id);
    const s = sanitizeOrder(body, h, { hasTg: !!tgId, env });
    if (s.error) return h.json({ ok: false, ...s }, 400, headers);
    const kv = env.PITLANE;
    const mine = await listOrders(kv, pilot.id, h);
    const dup = mine.find((o) => o.cid === s.rec.cid);
    if (dup) return h.json({ ok: true, duplicate: true, order: publicOrder(dup), forwarded: !!dup.forwarded, buyerNotified: !!dup.buyerNotified }, 200, headers);
    const lim = await h.limitOr429(env, headers, [
      ['rl:shop:p:' + pilot.id, SHOP_RL.pilotDay, 86400], ['rl:shop:ip:' + ip, SHOP_RL.ipDay, 86400], ['rl:shop:day:' + h.moscowDateKey(), SHOP_RL.globalDay, 86400],
    ]);
    if (lim) return lim;
    const buyer = { pid: pilot.id, nick: h.safeName(pilot.name, ''), tgId: tgId || null, username: await h.tgUsernameOf(env, pilot.id) };
    const o = await createOrder(env, buyer, s.rec, mine, h, { source: 'app' });
    return h.json({ ok: true, order: publicOrder(o), forwarded: o.forwarded, buyerNotified: o.buyerNotified }, 200, headers);
  }
  return h.json({ error: 'not found' }, 404, headers);
}

/** v182: общий путь создания заказа — Mini App (POST /shop/order) и бот (оформление в чате). Пишет KV, шлёт Маге и покупателю. */
export async function createOrder(env, buyer, rec, mine, h, { source = 'app', notifyBuyer = true } = {}) {
  const kv = env.PITLANE;
  const o = { id: 'o' + h.randB36(12), at: Date.now(), pid: buyer.pid, ...rec, status: 'new', payUrl: null, source,
    buyer: { nick: buyer.nick || '', username: buyer.username || null, tgId: buyer.tgId || null }, history: [{ st: 'new', at: Date.now() }] };
  const chipIn = itemsOf(o).some((it) => it.productId === FOUNDERS.productId);
  if (chipIn && SHOP_CONFIG.foundersOpen) {
    const fs = await foundersState(kv, h);
    if (fs.ids.length < FOUNDERS.limit) {
      o.founder = true; fs.ids.push(o.id); await kv.put(FKEY, JSON.stringify(fs));
      if (o.items) Object.assign(o, priceRec(o, env, null, true)); else o.total = founderTotal(productById(o.productId), o.qty);
    }
  }
  // v231: места основателей кончились (или закрыты) — пересчёт по обычной цене, даже если превью (бот) посчитало founder
  if (!o.founder && o.items) Object.assign(o, priceRec(o, env, null, false));
  // v226: короткий номер заказа (№1001…) = InvId Robokassa; KV-счётчик (best effort) + индекс shopno:<no> → id
  const seq = Math.max(1000, Number(await kv.get('shopseq')) || 1000) + 1;
  await kv.put('shopseq', String(seq)); o.no = seq;
  await kv.put('shopno:' + seq, o.id, { expirationTtl: ttl() });
  o.payUrl = payUrl(env, o); // null, пока оплата выключена (SHOP_CONFIG.payments / legalReady / ключи)
  const owner = ownerChat(env);
  if (owner) {
    const m = msgOrderOwner(o, buyer, h);
    const r = await h.tgCall(env, 'sendMessage', { chat_id: owner, text: m.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: m.keyboard } });
    o.forwarded = !!r?.ok;
    if (!r?.ok) { // tg://user?id= отвергается, если покупатель скрыл профиль → только кнопки статуса
      const r2 = await h.tgCall(env, 'sendMessage', { chat_id: owner, text: m.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: adminStatusKeyboard(o) } });
      o.forwarded = !!r2?.ok;
    }
  } else o.forwarded = false;
  // v183: в боте подтверждение — сам экран «Заявка принята» (то же сообщение), отдельное сообщение не нужно
  if (buyer.tgId && notifyBuyer) {
    const r = await h.tgCall(env, 'sendMessage', { chat_id: buyer.tgId, text: msgOrderBuyer(o, h), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: (source === 'bot'
      ? [[{ text: 'Мои заказы', callback_data: 'n:my' }], [h.webAppBtn('Открыть PITLANE', {})]]
      : [[h.webAppBtn('Мои заявки', { screen: 'shop', skipIntro: '1' })]]).concat(o.payUrl ? [[{ text: 'Оплатить · СБП / карта', url: o.payUrl }]] : []) } });
    o.buyerNotified = !!r?.ok;
  } else o.buyerNotified = notifyBuyer ? false : null;
  const t = ttl();
  await kv.put(orderKey(o.id), JSON.stringify(o), { expirationTtl: t, metadata: { pid: buyer.pid } });
  await kv.put(ordersKey(buyer.pid), JSON.stringify([o, ...(mine || [])].slice(0, SHOP_ORDERS_MAX)), { expirationTtl: t });
  return o;
}

/** Куда идут заявки: SHOP_CHAT_ID, иначе владелец (FEEDBACK_CHAT_ID). */
export function ownerChat(env) {
  const v = String(env.SHOP_CHAT_ID || env.FEEDBACK_CHAT_ID || '').trim();
  return /^-?\d{1,20}$/.test(v) ? v : null;
}
/** Кто может менять статусы: FEEDBACK_CHAT_ID (Мага), SHOP_CHAT_ID (если это личный чат), SHOP_ADMIN_IDS через запятую. */
export function shopAdmins(env) {
  const ids = [env.FEEDBACK_CHAT_ID, env.SHOP_CHAT_ID, ...String(env.SHOP_ADMIN_IDS || '').split(',')].map((x) => String(x || '').trim()).filter((x) => /^\d{1,20}$/.test(x));
  return new Set(ids);
}

/** v182: смена статуса (только админ; проверка — у вызывающего). Обновляет обе копии в KV, историю; возвращает { o, changed }. */
export async function setOrderStatus(env, id, st, h, extra = {}) {
  if (!ID_RE.test(String(id || '')) || !ORDER_ADMIN_STATUSES.includes(st)) return { error: 'bad' };
  const kv = env.PITLANE;
  const o = await h.kvJson(kv, orderKey(id));
  if (!o) return { error: 'not found' };
  if (extra.track) o.track = extra.track;
  if (o.status === st && !extra.track) return { o, changed: false };
  if (o.productId === FOUNDERS.productId && (st === 'canceled' || o.status === 'canceled')) { // v222: отмена освобождает место основателя
    const fs = await foundersState(kv, h);
    if (st === 'canceled' && fs.ids.includes(id)) { fs.ids = fs.ids.filter((x) => x !== id); o.founder = false; await kv.put(FKEY, JSON.stringify(fs)); }
  }
  if (o.status !== st) { o.status = st; o.history = [...(Array.isArray(o.history) ? o.history : []), { st, at: Date.now() }].slice(-12); }
  if (st !== 'new') o.payUrl = null;
  const t = ttl();
  await kv.put(orderKey(id), JSON.stringify(o), { expirationTtl: t, metadata: { pid: o.pid } });
  const list = await listOrders(kv, o.pid, h);
  await kv.put(ordersKey(o.pid), JSON.stringify(list.map((x) => (x.id === id ? { ...x, status: st, history: o.history, founder: !!o.founder, track: o.track || null, payUrl: o.payUrl } : x))), { expirationTtl: t });
  return { o, changed: true };
}
export const getOrder = (env, id, h) => (ID_RE.test(String(id || '')) ? h.kvJson(env.PITLANE, orderKey(id)) : null);

/** Удаление аккаунта: заявки и их копии для команды. */
export async function deleteAccountShop(kv, pid, h) {
  let n = 0;
  for (const o of await listOrders(kv, pid, h)) { await kv.delete(orderKey(o.id)); n++; }
  await kv.delete(ordersKey(pid));
  for (const k of await h.kvListAll(kv, 'shoporder:')) if (k.metadata && k.metadata.pid === pid) { await kv.delete(k.name); n++; }
  return { shopOrders: n };
}

/** v226: заказ по короткому номеру (1001) или id. */
export async function findOrder(env, ref, h) {
  const r = String(ref || '').replace(/^№/, '').trim();
  if (/^\d{4,9}$/.test(r)) { const id = await env.PITLANE.get('shopno:' + r); return id ? getOrder(env, id, h) : null; }
  return getOrder(env, r, h);
}
/** v226: Robokassa ResultURL — подпись Pass2, сумма = сумме заказа → «Оплачен», сообщение покупателю и команде. Ответ "OK<InvId>". */
export async function robokassaResult(req, env, h) {
  const txt = (s, st = 200) => new Response(s, { status: st, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (!paymentsOn(env)) return txt('payments off', 404);
  let f = {};
  if (req.method === 'POST') { const t = await req.text(); f = Object.fromEntries(new URLSearchParams(t.slice(0, 8192))); }
  else f = Object.fromEntries(new URL(req.url).searchParams);
  const v = verifyResult(env, f);
  if (!v.ok) return txt('bad sign', 400);
  const o = await getOrder(env, v.oid, h);
  if (!o || o.no !== v.inv || Math.abs(Number(o.total) - v.sum) > 0.009) return txt('bad order', 400);
  if (o.status === 'new') {
    const r = await setOrderStatus(env, o.id, 'paid', h);
    const ox = r.o || o;
    if (ox.buyer?.tgId) await h.tgCall(env, 'sendMessage', { chat_id: ox.buyer.tgId, text: msgOrderStatusBuyer(ox, h), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: 'Мои заказы', callback_data: 'n:my' }]] } });
    const owner = ownerChat(env);
    if (owner) await h.tgCall(env, 'sendMessage', { chat_id: owner, text: '<b>Оплачен заказ ' + h.tgEsc(orderNo(ox)) + '</b> — ' + h.tgEsc(fmtRub(ox.total)) + ' (Robokassa)', parse_mode: 'HTML', reply_markup: { inline_keyboard: adminStatusKeyboard(ox) } });
  }
  return txt('OK' + v.inv);
}
