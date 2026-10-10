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
import { SHOP_CONFIG, ORDER_STATUS, productById, orderable, orderTotal, fmtRub, statusOf } from '../../shop-config.js';
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

export function normPhone(v) {
  const d = String(v || '').replace(/[^\d+]/g, '');
  let n = d.replace(/^\+/, '');
  if (/^8\d{10}$/.test(n)) n = '7' + n.slice(1);
  return /^\d{10,15}$/.test(n) ? '+' + n : null;
}

/** Валидация тела заявки → { rec } | { error, field } (без побочных эффектов). */
export function sanitizeOrder(body, h, { hasTg }) {
  const p = productById(String(body?.productId || ''));
  if (!p) return { error: 'unknown product', field: 'productId' };
  if (!orderable(p)) return { error: 'not available', field: 'productId' };
  const qty = Number(body?.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > (p.maxQty || 5)) return { error: 'qty 1..' + (p.maxQty || 5), field: 'qty' };
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
  return { rec: { productId: p.id, title: p.title, qty, price: Number.isFinite(p.price) ? p.price : null, total: orderTotal(p, qty), city, contact, comment, cid } };
}

/** То, что видит покупатель (без чужих полей). */
export const publicOrder = (o) => ({
  id: o.id, at: o.at, productId: o.productId, title: o.title, qty: o.qty, price: o.price, total: o.total,
  city: o.city, contactMethod: o.contact?.method || null, contact: o.contact?.value || null, comment: o.comment || '',
  status: ORDER_STATUS[o.status] ? o.status : 'new', statusLabel: ORDER_STATUS[o.status] || ORDER_STATUS.new, payUrl: o.payUrl || null,
});

/** Сообщение команде (HTML, весь пользовательский текст экранирован) + клавиатура «Написать покупателю». */
export function msgOrderOwner(o, buyer, h) {
  const e = h.tgEsc;
  const sum = o.total != null ? fmtRub(o.total) + (o.qty > 1 ? ` (${o.qty} × ${fmtRub(o.price)})` : '') : 'цена по запросу';
  const contactLine = o.contact.method === 'tg'
    ? 'Telegram: ' + (buyer.username ? '@' + e(buyer.username) : 'id ' + e(buyer.tgId || '—')) + ' (из входа)'
    : o.contact.method === 'tg_other' ? 'Telegram: ' + e(o.contact.value) : 'Телефон: ' + e(o.contact.value);
  const text = [
    '<b>PITLANE · заявка ' + e(o.id) + '</b>',
    '',
    '<b>' + e(o.title) + '</b> × ' + o.qty + ' — <b>' + e(sum) + '</b>',
    'Статус товара: ' + e(statusOf(productById(o.productId)).label) + ' · оплата: ' + (o.payUrl ? 'онлайн' : 'нет онлайн-оплаты, договориться'),
    '',
    'Город: ' + e(o.city),
    contactLine,
    o.comment ? 'Комментарий: ' + e(o.comment) : '',
    '',
    'Пилот: ' + e(buyer.nick || '—') + ' · аккаунт ' + e(buyer.pid),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  const url = o.contact.method === 'tg' ? (buyer.username ? 'https://t.me/' + buyer.username : (buyer.tgId ? 'tg://user?id=' + buyer.tgId : null))
    : o.contact.method === 'tg_other' ? 'https://t.me/' + o.contact.value.slice(1) : null;
  const keyboard = url ? [[{ text: 'Написать покупателю', url }]] : [];
  return { text, keyboard };
}

export function msgOrderBuyer(o, h) {
  const e = h.tgEsc;
  const sum = o.total != null ? ' на ' + fmtRub(o.total) : '';
  return [
    '<b>Заявка принята</b>',
    '',
    e(o.title) + ' × ' + o.qty + e(sum) + ' · ' + e(statusOf(productById(o.productId)).label.toLowerCase()),
    'Номер: ' + e(o.id),
    '',
    'Мы свяжемся с вами ' + (o.contact.method === 'phone' ? 'по телефону' : 'в Telegram') + ', чтобы договориться об оплате и доставке. Онлайн-оплаты в приложении пока нет — заранее ничего платить не нужно.',
  ].join('\n');
}

async function listOrders(kv, pid, h) {
  const l = await h.kvJson(kv, ordersKey(pid));
  return Array.isArray(l) ? l.filter((o) => o && ID_RE.test(o.id)).slice(0, SHOP_ORDERS_MAX) : [];
}

export async function shopRoute({ req, env, path, headers, ip, pilot, h }) {
  if (!path.startsWith('/shop/')) return null;
  if (!SHOP_CONFIG.enabled) return h.json({ error: 'shop disabled' }, 404, headers);
  if (req.method === 'GET' && path === '/shop/orders') {
    const denied = h.requireAuth(pilot, headers); if (denied) return denied;
    const lim = await h.limitOr429(env, headers, [['rl:shopget:p:' + pilot.id, 120, 3600]]); if (lim) return lim;
    const tgId = await h.tgChatOf(env, pilot.id); const un = tgId ? await h.tgUsernameOf(env, pilot.id) : null;
    // tg — есть ли Telegram во входе (для «Мой Telegram» в форме): '@username' | 'telegram' | null
    return h.json({ ok: true, orders: (await listOrders(env.PITLANE, pilot.id, h)).map(publicOrder), tg: un ? '@' + un : (tgId ? 'telegram' : null), payments: !!(SHOP_CONFIG.payments && legalReady()) }, 200, headers);
  }
  if (req.method === 'POST' && path === '/shop/order') {
    const denied = h.requireAuth(pilot, headers); if (denied) return denied;
    const body = await h.readJson(req, 8 * 1024);
    if (!body) return h.json({ error: 'invalid json' }, 400, headers);
    const tgId = await h.tgChatOf(env, pilot.id);
    const s = sanitizeOrder(body, h, { hasTg: !!tgId });
    if (s.error) return h.json({ ok: false, ...s }, 400, headers);
    const kv = env.PITLANE;
    const mine = await listOrders(kv, pilot.id, h);
    const dup = mine.find((o) => o.cid === s.rec.cid);
    if (dup) return h.json({ ok: true, duplicate: true, order: publicOrder(dup), forwarded: !!dup.forwarded, buyerNotified: !!dup.buyerNotified }, 200, headers);
    const lim = await h.limitOr429(env, headers, [
      ['rl:shop:p:' + pilot.id, SHOP_RL.pilotDay, 86400], ['rl:shop:ip:' + ip, SHOP_RL.ipDay, 86400], ['rl:shop:day:' + h.moscowDateKey(), SHOP_RL.globalDay, 86400],
    ]);
    if (lim) return lim;
    const o = { id: 'o' + h.randB36(12), at: Date.now(), pid: pilot.id, ...s.rec, status: 'new', payUrl: null };
    // PAYMENTS: if (SHOP_CONFIG.payments && legalReady() && o.total) o.payUrl = await createPayment(env, o);  — провайдер не подключён
    const buyer = { pid: pilot.id, nick: h.safeName(pilot.name, ''), tgId: tgId || null, username: await h.tgUsernameOf(env, pilot.id) };
    const owner = String(env.SHOP_CHAT_ID || env.FEEDBACK_CHAT_ID || '').trim();
    if (/^-?\d{1,20}$/.test(owner)) {
      const m = msgOrderOwner(o, buyer, h);
      const r = await h.tgCall(env, 'sendMessage', { chat_id: owner, text: m.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: m.keyboard } });
      o.forwarded = !!r?.ok;
      if (!r?.ok && m.keyboard.length) { // tg://user?id= отвергается, если покупатель скрыл профиль → без кнопки
        const r2 = await h.tgCall(env, 'sendMessage', { chat_id: owner, text: m.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
        o.forwarded = !!r2?.ok;
      }
    } else o.forwarded = false;
    if (tgId) {
      const r = await h.tgCall(env, 'sendMessage', { chat_id: tgId, text: msgOrderBuyer(o, h), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[h.webAppBtn('Мои заявки', { screen: 'shop', skipIntro: '1' })]] } });
      o.buyerNotified = !!r?.ok;
    } else o.buyerNotified = false;
    const t = ttl();
    await kv.put(orderKey(o.id), JSON.stringify(o), { expirationTtl: t, metadata: { pid: pilot.id } });
    await kv.put(ordersKey(pilot.id), JSON.stringify([o, ...mine].slice(0, SHOP_ORDERS_MAX)), { expirationTtl: t });
    return h.json({ ok: true, order: publicOrder(o), forwarded: o.forwarded, buyerNotified: o.buyerNotified }, 200, headers);
  }
  return h.json({ error: 'not found' }, 404, headers);
}

/** Удаление аккаунта: заявки и их копии для команды. */
export async function deleteAccountShop(kv, pid, h) {
  let n = 0;
  for (const o of await listOrders(kv, pid, h)) { await kv.delete(orderKey(o.id)); n++; }
  await kv.delete(ordersKey(pid));
  for (const k of await h.kvListAll(kv, 'shoporder:')) if (k.metadata && k.metadata.pid === pid) { await kv.delete(k.name); n++; }
  return { shopOrders: n };
}
