/**
 * v182: магазин и поддержка в боте @pitlane_official_bot — витрина, карточка товара с фото, предзаказ по шагам
 * (товар → количество → город → связь → комментарий → подтверждение), «Мои заказы», FAQ, «Как работает чип», поддержка,
 * кнопки статуса для Маги (принят / собирается / отправлен / доставлен / отменён) с уведомлением покупателя.
 *
 * Онлайн-оплаты нет — как и в Mini App: заказ = заявка Маге, дальше связь в Telegram.
 * Состояние шага: KV botflow:<chatId> (1 ч). Заказы — те же записи, что и в приложении (shop.js → createOrder).
 * Callback-данные (≤ 64 байт): m · sh · p:<id> · pk:<id> · chip · faq · sup · ob:<id> · oq:<n> · oc:<i> · ot:<tg|other|phone>
 *   · on:skip · ok · oe · ox · my · mo:<orderId> · as:<orderId>:<status> (только админ).
 * Весь пользовательский текст — через esc(). Тексты — «вы», коротко, без эмодзи.
 */
import { SHOP_CONFIG, ORDER_STATUS, ORDER_SHORT, visibleProducts, productById, statusOf, orderable, fmtRub, orderTotal } from '../../shop-config.js';
import { APP_URL, RULE, esc, webAppBtn } from './botcopy.js';
import { createOrder, listOrders, setOrderStatus, getOrder, msgOrderOwner, adminStatusKeyboard, msgOrderStatusBuyer, shopAdmins, ownerChat, normPhone, SHOP_RL } from './shop.js';

export const FLOW_TTL = 3600;
const flowKey = (chat) => 'botflow:' + chat;
const TG_USER_RE = /^@?([A-Za-z][A-Za-z0-9_]{4,31})$/;
export const QUICK_CITIES = ['Москва', 'Санкт-Петербург'];
const cb = (text, data) => ({ text, callback_data: data });
const priceText = (p) => (Number.isFinite(p?.price) && p.price > 0 ? fmtRub(p.price) : 'Цена по запросу');
const MSK = (t) => new Date(t).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const MSKd = (t) => new Date(t).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short' });

/** Фото товара для Telegram: JPEG рядом с WebP-галереей (img/shop/tg/<ключ>.jpg). */
export function productPhoto(p) {
  const src = String(p?.gallery?.[0]?.src || '');
  const m = src.match(/img\/shop\/([a-z0-9-]+)-720\.webp$/);
  return m ? APP_URL + 'img/shop/tg/' + m[1] + '.jpg' : null;
}

/* ——— экраны (чистые функции → { method, payload }) ——— */
const text = (t, kb) => ({ method: 'sendMessage', payload: { text: t, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: kb } } });

export function mainMenuRows(param) {
  const gps = productById('pitlane-gps');
  return [
    [webAppBtn(param ? 'Открыть ссылку' : 'Открыть PITLANE', param ? { startapp: param } : {})],
    ...(gps ? [[cb('PITLANE GPS · ' + priceText(gps), 'p:' + gps.id)]] : []),
    [cb('Магазин', 'sh'), cb('Мои заказы', 'my')],
    [cb('Как работает чип', 'chip'), cb('Вопросы и поддержка', 'faq')],
  ];
}
export const MENU_TEXT = '<b>PITLANE</b>\nВыберите раздел.';
export const screenMenu = () => text(MENU_TEXT, mainMenuRows());

export function screenShop() {
  const ps = visibleProducts();
  const lines = ps.map((p) => '<b>' + esc(p.title) + '</b> — ' + esc(priceText(p)) + ' · ' + esc(statusOf(p).label.toLowerCase()) + '\n' + esc(p.subtitle || ''));
  return text(
    '<b>Магазин PITLANE</b>\n' + RULE + '\n' + lines.join('\n\n') + '\n' + RULE + '\n' +
    (SHOP_CONFIG.payments ? '' : 'Онлайн-оплаты нет: оформляете предзаказ — мы пишем вам и согласуем оплату и доставку.'),
    [...ps.map((p) => [cb(p.title + ' · ' + priceText(p), 'p:' + p.id)]), [cb('Мои заказы', 'my'), cb('Меню', 'm')]],
  );
}

export function productCaption(p) {
  const kit = (p.inBox || []).map((x) => '— ' + esc(x)).join('\n');
  const short = (p.specs || []).filter(([k]) => /Приёмник|Системы|Связь/.test(k)).map(([, v]) => esc(v)).join('\n');
  const cap = [
    '<b>' + esc(p.title) + '</b>',
    esc(p.subtitle || ''),
    '<b>' + esc(priceText(p)) + '</b> · ' + esc(statusOf(p).label),
    RULE,
    kit ? '<b>В комплекте</b>\n' + kit : '',
    short ? RULE + '\n' + short : '',
  ].filter(Boolean).join('\n');
  return cap.length <= 1024 ? cap : cap.slice(0, 1000);
}
export function screenProduct(p) {
  const rows = [
    ...(orderable(p) ? [[cb(p.status === 'preorder' ? 'Оформить предзаказ' : 'Оформить заказ', 'ob:' + p.id)]] : []),
    [cb('Характеристики', 'pk:' + p.id), ...(p.id === 'pitlane-gps' ? [cb('Как работает чип', 'chip')] : [])],
    [cb('Все товары', 'sh'), cb('Меню', 'm')],
  ];
  const photo = productPhoto(p);
  if (!photo) return text(productCaption(p), rows);
  return { method: 'sendPhoto', payload: { photo, caption: productCaption(p), parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } } };
}
export function screenSpecs(p) {
  const specs = (p.specs || []).map(([k, v]) => '<b>' + esc(k) + '.</b> ' + esc(v)).join('\n');
  const notes = (p.notes || []).map((x) => '— ' + esc(x)).join('\n');
  return text('<b>' + esc(p.title) + ' · характеристики</b>\n' + RULE + '\n' + specs + (notes ? '\n' + RULE + '\n' + notes : ''),
    [...(orderable(p) ? [[cb(p.status === 'preorder' ? 'Оформить предзаказ' : 'Оформить заказ', 'ob:' + p.id)]] : []), [cb('Назад к товару', 'p:' + p.id), cb('Меню', 'm')]]);
}

export const CHIP_TEXT =
  '<b>Как работает PITLANE GPS</b>\n' + RULE + '\n' +
  '<b>1. Установка.</b> Прибор ставится на торпеду у лобового стекла — антенне нужно небо. Держится на магнитах, питание — USB от машины.\n' +
  '<b>2. Точность.</b> Приёмник u-blox NEO-M9N считает позицию 25 раз в секунду по GPS, ГЛОНАСС, Galileo и BeiDou. Телефон — обычно 1 раз в секунду.\n' +
  '<b>3. Связь.</b> iPhone — по Wi-Fi через режим модема, Android — по Bluetooth или Wi-Fi. Скорость и отсечки видно в приложении в реальном времени.\n' +
  '<b>4. Зачёт.</b> Сервер проверяет трек заезда и ставит класс A или B — с ним результат попадает в топ внешнего GPS.\n' + RULE + '\n' +
  'Первый холодный старт под открытым небом — до минуты. Атермальное стекло может ослаблять сигнал.';
export const screenChip = () => text(CHIP_TEXT, [[cb('PITLANE GPS · ' + priceText(productById('pitlane-gps')), 'p:pitlane-gps')], [cb('Вопросы и поддержка', 'faq'), cb('Меню', 'm')]]);

export const FAQ_TEXT =
  '<b>Вопросы и ответы</b>\n' + RULE + '\n' +
  '<b>Как оплатить?</b> Онлайн-оплаты нет. После заявки мы напишем, подтвердим заказ и согласуем оплату и доставку.\n' +
  '<b>Сроки.</b> PITLANE GPS собирается под заказ. Срок назовём при подтверждении.\n' +
  '<b>Доставка.</b> По России — транспортной компанией или курьером, обсудим при подтверждении.\n' +
  '<b>Нужен ли чип?</b> Нет: замеры работают и с GPS телефона (класс C). Чип даёт 25 Гц и зачёт в топ внешнего GPS (A/B).\n' +
  '<b>Отмена.</b> До отправки заказ можно отменить — напишите в поддержку.\n' +
  '<b>Вход в приложение.</b> Откройте PITLANE из этого чата — Telegram подтвердит аккаунт сам.\n' + RULE + '\n' +
  'Не нашли ответ — напишите нам.';
export const screenFaq = () => text(FAQ_TEXT, [[cb('Написать в поддержку', 'sup')], [cb('Как работает чип', 'chip'), cb('Меню', 'm')]]);
export const SUPPORT_ASK = '<b>Поддержка</b>\nНапишите вопрос одним сообщением — его прочитает команда PITLANE и ответит в Telegram.';
export const SUPPORT_SENT = 'Сообщение отправлено. Ответим в Telegram.';

/* ——— оформление ——— */
const stepHead = (f, n, title) => '<b>' + (productById(f.pid)?.status === 'preorder' ? 'Предзаказ' : 'Заказ') + ' · ' + esc(productById(f.pid)?.title || '') + '</b>\nШаг ' + n + ' из 4 · ' + title;
export function screenQty(f) {
  const p = productById(f.pid); const max = Math.max(1, Math.min(5, p.maxQty || 5));
  return text(stepHead(f, 1, 'Количество') + '\nЦена за штуку — ' + esc(priceText(p)) + '.',
    [Array.from({ length: max }, (_, i) => cb(String(i + 1), 'oq:' + (i + 1))), [cb('Отмена', 'ox')]]);
}
export const screenCity = (f) => text(stepHead(f, 2, 'Город доставки') + '\nНапишите город одним сообщением или выберите ниже.',
  [QUICK_CITIES.map((c, i) => cb(c, 'oc:' + i)), [cb('Отмена', 'ox')]]);
export function screenContact(f) {
  return text(stepHead(f, 3, 'Связь') + '\nКак с вами связаться, чтобы подтвердить заказ?',
    [[cb('Telegram — этот аккаунт' + (f.un ? ' (@' + f.un + ')' : ''), 'ot:tg')], [cb('Другой Telegram', 'ot:other'), cb('Телефон', 'ot:phone')], [cb('Отмена', 'ox')]]);
}
export const ASK_TG_OTHER = 'Напишите имя пользователя Telegram, например <code>@pitlane_racer</code>.';
export const ASK_PHONE = 'Отправьте номер кнопкой ниже или напишите его, например <code>+7 900 123-45-67</code>.';
export const screenComment = (f) => text(stepHead(f, 4, 'Комментарий') + '\nНапример, удобное время для связи. Можно пропустить.', [[cb('Пропустить', 'on:skip')], [cb('Отмена', 'ox')]]);
export function contactLabel(f) {
  if (f.cm === 'tg') return 'Telegram' + (f.un ? ' @' + esc(f.un) : ' — этот аккаунт');
  if (f.cm === 'tg_other') return 'Telegram ' + esc(f.cv);
  return 'Телефон ' + esc(f.cv);
}
export function screenConfirm(f) {
  const p = productById(f.pid); const total = orderTotal(p, f.qty);
  return text(
    '<b>Проверьте заказ</b>\n' + RULE + '\n' +
    '<b>' + esc(p.title) + '</b> × ' + f.qty + ' — <b>' + esc(total != null ? fmtRub(total) : 'цена по запросу') + '</b>\n' +
    esc(statusOf(p).label) + ' · без онлайн-оплаты\n' +
    'Город: ' + esc(f.city) + '\n' +
    'Связь: ' + contactLabel(f) + '\n' +
    (f.cmt ? 'Комментарий: ' + esc(f.cmt) + '\n' : '') + RULE + '\n' +
    'После подтверждения мы напишем вам, чтобы согласовать оплату и доставку.',
    [[cb('Подтвердить заказ', 'ok')], [cb('Изменить', 'oe'), cb('Отмена', 'ox')]],
  );
}
export const CANCELED_TEXT = 'Оформление отменено. Вернуться к товарам — /shop.';
export const EXPIRED_TEXT = 'Оформление устарело — начните заново.';

/* ——— мои заказы ——— */
export function screenMyOrders(orders) {
  if (!orders.length) return text('<b>Мои заказы</b>\nЗаказов пока нет.', [[cb('PITLANE GPS', 'p:pitlane-gps'), cb('Меню', 'm')]]);
  const lines = orders.slice(0, 8).map((o) => esc(o.title) + ' × ' + o.qty + ' · <b>' + esc(ORDER_SHORT[o.status] || ORDER_SHORT.new) + '</b>\n<code>' + esc(o.id) + '</code> · ' + esc(MSKd(o.at)));
  return text('<b>Мои заказы</b>\n' + RULE + '\n' + lines.join('\n\n'),
    [...orders.slice(0, 5).map((o) => [cb(o.id + ' · ' + (ORDER_SHORT[o.status] || ORDER_SHORT.new), 'mo:' + o.id)]), [cb('Магазин', 'sh'), cb('Меню', 'm')]]);
}
export function screenOrder(o) {
  const hist = (Array.isArray(o.history) && o.history.length ? o.history : [{ st: o.status || 'new', at: o.at }])
    .map((x) => '<code>' + esc(MSK(x.at)) + '</code>  ' + esc(ORDER_SHORT[x.st] || x.st)).join('\n');
  return text(
    '<b>Заказ ' + esc(o.id) + '</b>\n' +
    esc(o.title) + ' × ' + o.qty + (o.total != null ? ' — ' + esc(fmtRub(o.total)) : '') + '\n' +
    'Статус: <b>' + esc(ORDER_STATUS[o.status] ? ORDER_SHORT[o.status] : ORDER_SHORT.new) + '</b>\n' +
    'Город: ' + esc(o.city) + '\n' + RULE + '\n' + hist + '\n' + RULE + '\n' +
    'Вопрос по заказу — «Написать в поддержку».',
    [[cb('Написать в поддержку', 'sup')], [cb('Мои заказы', 'my'), cb('Меню', 'm')]],
  );
}

/* ——— состояние ——— */
async function getFlow(kv, chat) { try { return JSON.parse((await kv.get(flowKey(chat))) || 'null'); } catch (_) { return null; } }
const putFlow = (kv, chat, f) => kv.put(flowKey(chat), JSON.stringify({ ...f, t: Date.now() }), { expirationTtl: FLOW_TTL });
const dropFlow = (kv, chat) => kv.delete(flowKey(chat));
const userName = (from) => String(from?.username || '').replace(/[^\w]/g, '').slice(0, 32) || null;

async function send(env, chat, spec, H) {
  let r = await H.tgCall(env, spec.method, { chat_id: chat, ...spec.payload });
  if (!r?.ok && spec.method === 'sendPhoto') { // фото недоступно → тот же текст без фото
    const { photo, caption, ...rest } = spec.payload;
    r = await H.tgCall(env, 'sendMessage', { chat_id: chat, text: caption, ...rest, link_preview_options: { is_disabled: true } });
  }
  return r;
}
async function myPid(env, tgId, H) {
  const pid = await env.PITLANE.get('auth:tg:' + tgId);
  return pid && H.isPilotUuid(pid) ? pid : null;
}
async function myOrders(env, tgId, H) { const pid = await myPid(env, tgId, H); return pid ? listOrders(env.PITLANE, pid, H) : []; }

/** Команды бота, у которых свой экран (вызывается из tgHandleMessage). → { cmd } | null */
export async function botCommand(env, msg, cmd, H) {
  const chat = msg.chat.id;
  const map = { shop: screenShop, chip: screenChip, help: screenFaq, faq: screenFaq, menu: screenMenu, support: screenFaq };
  if (cmd === 'orders') { await dropFlow(env.PITLANE, chat); const r = await send(env, chat, screenMyOrders(await myOrders(env, msg.from?.id || chat, H)), H); return { cmd, sent: !!r?.ok }; }
  if (map[cmd]) { await dropFlow(env.PITLANE, chat); const r = await send(env, chat, map[cmd](), H); return { cmd, sent: !!r?.ok }; }
  return null;
}

/** Текст/контакт, пока идёт шаг оформления или поддержки. → { cmd } | null (не наш — обычный ответ) */
export async function botFlowMessage(env, msg, H) {
  const chat = msg.chat.id; const kv = env.PITLANE;
  const f = await getFlow(kv, chat); if (!f || !f.step) return null;
  const tx = typeof msg.text === 'string' ? msg.text.trim() : '';
  if (tx.startsWith('/')) { await dropFlow(kv, chat); return null; } // команда прерывает шаг
  const reply = (spec) => send(env, chat, spec, H);
  const removeKb = { remove_keyboard: true };
  if (f.step === 'support') {
    if (tx.length < 3) { await reply(text('Напишите вопрос текстом.', [[cb('Отмена', 'ox')]])); return { cmd: 'support:short' }; }
    if (await H.rateHit(kv, 'rl:botsup:' + chat, 5, 86400)) { await dropFlow(kv, chat); await reply(text('Сегодня уже несколько обращений — мы ответим на них. Новые — завтра.', [[cb('Меню', 'm')]])); return { cmd: 'support:limited' }; }
    const owner = ownerChat(env);
    const un = userName(msg.from);
    const body = '<b>Поддержка · бот</b>\n' + RULE + '\n' + esc(tx.slice(0, 2000)) + '\n' + RULE + '\n' +
      'От: ' + esc(H.safeName([msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' '), '—')) + (un ? ' · @' + esc(un) : '') + ' · id <code>' + esc(msg.from?.id) + '</code>';
    const url = un ? 'https://t.me/' + un : 'tg://user?id=' + msg.from?.id;
    let r = owner ? await H.tgCall(env, 'sendMessage', { chat_id: owner, text: body, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: 'Ответить', url }]] } }) : null;
    if (owner && !r?.ok) r = await H.tgCall(env, 'sendMessage', { chat_id: owner, text: body, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    await dropFlow(kv, chat);
    await reply(text(r?.ok ? SUPPORT_SENT : 'Не получилось отправить — попробуйте позже.', [[cb('Меню', 'm')]]));
    return { cmd: 'support:' + (r?.ok ? 'sent' : 'fail') };
  }
  if (f.step === 'city') {
    const city = H.cleanLabel(tx, 60);
    if (city.length < 2 || H.containsPhone(city)) { await reply(text('Напишите название города, например <code>Казань</code>.', [[cb('Отмена', 'ox')]])); return { cmd: 'order:city?' }; }
    f.city = city; f.step = 'contact'; await putFlow(kv, chat, f); await reply(screenContact(f)); return { cmd: 'order:city' };
  }
  if (f.step === 'tg_other') {
    const m = TG_USER_RE.exec(tx);
    if (!m) { await reply(text(ASK_TG_OTHER, [[cb('Отмена', 'ox')]])); return { cmd: 'order:tg?' }; }
    f.cm = 'tg_other'; f.cv = '@' + m[1]; f.step = 'comment'; await putFlow(kv, chat, f); await reply(screenComment(f)); return { cmd: 'order:tg' };
  }
  if (f.step === 'phone') {
    const raw = msg.contact && (!msg.contact.user_id || msg.contact.user_id === msg.from?.id) ? msg.contact.phone_number : tx;
    const ph = normPhone(raw);
    if (!ph) { await reply({ method: 'sendMessage', payload: { text: ASK_PHONE, parse_mode: 'HTML', reply_markup: phoneKb() } }); return { cmd: 'order:phone?' }; }
    f.cm = 'phone'; f.cv = ph; f.step = 'comment'; await putFlow(kv, chat, f);
    await H.tgCall(env, 'sendMessage', { chat_id: chat, text: 'Номер: ' + ph, reply_markup: removeKb });
    await reply(screenComment(f)); return { cmd: 'order:phone' };
  }
  if (f.step === 'comment') {
    f.cmt = H.cleanLabel(tx.replace(/\s+/g, ' '), 500); f.step = 'confirm'; await putFlow(kv, chat, f); await reply(screenConfirm(f)); return { cmd: 'order:comment' };
  }
  if (f.step === 'confirm' || f.step === 'qty' || f.step === 'contact') { await reply(text('Выберите вариант кнопкой выше.', [[cb('Отмена', 'ox')]])); return { cmd: 'order:wait' }; }
  return null;
}
const phoneKb = () => ({ keyboard: [[{ text: 'Отправить мой номер', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true, input_field_placeholder: '+7 900 123-45-67' });

/** callback_query (кнопки). Всегда отвечает answerCallbackQuery. → { cmd } */
export async function botCallback(env, cq, H) {
  const kv = env.PITLANE;
  const data = String(cq?.data || '').slice(0, 64);
  const from = cq?.from || {}; const chat = cq?.message?.chat?.id;
  const ack = (t, alert) => H.tgCall(env, 'answerCallbackQuery', { callback_query_id: cq.id, ...(t ? { text: t, show_alert: !!alert } : {}) });
  if (!Number.isSafeInteger(chat) || !Number.isSafeInteger(from.id)) { await ack(); return { cmd: 'cb:bad' }; }
  // админ: статус заказа (из чата заявок)
  const am = data.match(/^as:(o[a-z0-9]{10,16}):([a-z]+)$/);
  if (am) {
    if (!shopAdmins(env).has(String(from.id))) { await ack('Недоступно', true); return { cmd: 'cb:as:denied' }; }
    const r = await setOrderStatus(env, am[1], am[2], H);
    if (r.error) { await ack('Заказ не найден'); return { cmd: 'cb:as:' + r.error }; }
    const o = r.o;
    const buyer = { pid: o.pid, nick: o.buyer?.nick || '', tgId: o.buyer?.tgId || (await H.tgChatOf(env, o.pid)), username: o.buyer?.username || null };
    const m = msgOrderOwner(o, buyer, H);
    await H.tgCall(env, 'editMessageText', { chat_id: chat, message_id: cq.message.message_id, text: m.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: m.keyboard } });
    let notified = false;
    if (r.changed && buyer.tgId) {
      const s = await H.tgCall(env, 'sendMessage', { chat_id: buyer.tgId, text: msgOrderStatusBuyer(o, H), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[cb('Мои заказы', 'my'), cb('Поддержка', 'sup')]] } });
      notified = !!s?.ok;
    }
    await ack(r.changed ? (ORDER_SHORT[o.status] + (notified ? ' · покупатель уведомлён' : ' · покупателю не доставлено')) : 'Статус уже такой');
    return { cmd: 'cb:as', status: o.status, changed: r.changed, notified };
  }
  if (await H.rateHit(kv, 'rl:tgcb:' + chat, 40, 60)) { await ack(); return { cmd: 'cb:limited' }; }
  const reply = (spec) => send(env, chat, spec, H);
  const done = async (cmd, spec) => { await ack(); if (spec) await reply(spec); return { cmd }; };
  let m;
  if (data === 'm') return done('cb:menu', screenMenu());
  if (data === 'sh') return done('cb:shop', screenShop());
  if (data === 'chip') return done('cb:chip', screenChip());
  if (data === 'faq') return done('cb:faq', screenFaq());
  if (data === 'sup') { await putFlow(kv, chat, { step: 'support' }); return done('cb:sup', text(SUPPORT_ASK, [[cb('Отмена', 'ox')]])); }
  if (data === 'my') { await dropFlow(kv, chat); return done('cb:my', screenMyOrders(await myOrders(env, from.id, H))); }
  if ((m = data.match(/^mo:(o[a-z0-9]{10,16})$/))) {
    const o = await getOrder(env, m[1], H); const pid = await myPid(env, from.id, H);
    if (!o || !pid || o.pid !== pid) { await ack('Заказ не найден'); return { cmd: 'cb:mo:none' }; }
    return done('cb:mo', screenOrder(o));
  }
  if ((m = data.match(/^p:([a-z0-9-]{2,40})$/))) { const p = productById(m[1]); if (!p || p.hidden) { await ack('Товар не найден'); return { cmd: 'cb:p:none' }; } return done('cb:product', screenProduct(p)); }
  if ((m = data.match(/^pk:([a-z0-9-]{2,40})$/))) { const p = productById(m[1]); if (!p || p.hidden) { await ack('Товар не найден'); return { cmd: 'cb:pk:none' }; } return done('cb:specs', screenSpecs(p)); }
  if ((m = data.match(/^ob:([a-z0-9-]{2,40})$/))) {
    const p = productById(m[1]); if (!orderable(p)) { await ack('Сейчас недоступно', true); return { cmd: 'cb:ob:na' }; }
    const f = { step: 'qty', pid: p.id, un: userName(from), nm: H.safeName([from.first_name, from.last_name].filter(Boolean).join(' '), ''), cid: H.randB36(16) };
    await putFlow(kv, chat, f); return done('cb:order', screenQty(f));
  }
  if (data === 'ox') { await dropFlow(kv, chat); return done('cb:cancel', text(CANCELED_TEXT, [[cb('Меню', 'm')]])); }
  // дальше — шаги оформления: нужно живое состояние
  const f = await getFlow(kv, chat);
  if (!f || !f.pid) { await ack(); await reply(text(EXPIRED_TEXT, [[cb('Магазин', 'sh')]])); return { cmd: 'cb:expired' }; }
  const p = productById(f.pid);
  if ((m = data.match(/^oq:(\d)$/))) {
    const q = Number(m[1]); if (q < 1 || q > (p.maxQty || 5)) { await ack(); return { cmd: 'cb:oq:bad' }; }
    f.qty = q; f.step = 'city'; await putFlow(kv, chat, f); return done('cb:qty', screenCity(f));
  }
  if ((m = data.match(/^oc:(\d)$/)) && f.qty) {
    const c = QUICK_CITIES[Number(m[1])]; if (!c) { await ack(); return { cmd: 'cb:oc:bad' }; }
    f.city = c; f.step = 'contact'; await putFlow(kv, chat, f); return done('cb:city', screenContact(f));
  }
  if ((m = data.match(/^ot:(tg|other|phone)$/)) && f.city) {
    if (m[1] === 'tg') { f.cm = 'tg'; f.cv = null; f.step = 'comment'; await putFlow(kv, chat, f); return done('cb:contact', screenComment(f)); }
    if (m[1] === 'other') { f.step = 'tg_other'; await putFlow(kv, chat, f); return done('cb:contact:other', text(ASK_TG_OTHER, [[cb('Отмена', 'ox')]])); }
    f.step = 'phone'; await putFlow(kv, chat, f); return done('cb:contact:phone', { method: 'sendMessage', payload: { text: ASK_PHONE, parse_mode: 'HTML', reply_markup: phoneKb() } });
  }
  if (data === 'on:skip' && f.cm) { f.cmt = ''; f.step = 'confirm'; await putFlow(kv, chat, f); return done('cb:skip', screenConfirm(f)); }
  if (data === 'oe') { const g = { step: 'qty', pid: f.pid, un: f.un, nm: f.nm, cid: f.cid }; await putFlow(kv, chat, g); return done('cb:edit', screenQty(g)); }
  if (data === 'ok' && f.step === 'confirm' && f.qty && f.city && f.cm) {
    if (!orderable(p)) { await ack('Товар сейчас недоступен', true); return { cmd: 'cb:ok:na' }; }
    const { pilot } = await H.ensurePilotForProvider(kv, 'tg', String(from.id), { nick: f.nm });
    const mine = await listOrders(kv, pilot.id, H);
    const dup = mine.find((o) => o.cid === f.cid);
    if (dup) { await dropFlow(kv, chat); await ack('Заказ уже оформлен'); return { cmd: 'cb:ok:dup', id: dup.id }; }
    if (await H.rateHit(kv, 'rl:shop:p:' + pilot.id, SHOP_RL.pilotDay, 86400) || await H.rateHit(kv, 'rl:shop:day:' + H.moscowDateKey(), SHOP_RL.globalDay, 86400)) {
      await ack('Слишком много заявок за сутки — напишите в поддержку', true); return { cmd: 'cb:ok:limited' };
    }
    const rec = { productId: p.id, title: p.title, qty: f.qty, price: Number.isFinite(p.price) ? p.price : null, total: orderTotal(p, f.qty), city: f.city,
      contact: f.cm === 'tg' ? { method: 'tg' } : { method: f.cm, value: f.cv }, comment: f.cmt || '', cid: f.cid };
    const o = await createOrder(env, { pid: pilot.id, nick: f.nm || H.safeName(pilot.nick, ''), tgId: from.id, username: f.un }, rec, mine, H, { source: 'bot' });
    await dropFlow(kv, chat);
    await ack('Заказ ' + o.id + ' оформлен');
    return { cmd: 'cb:ok', id: o.id, forwarded: o.forwarded, buyerNotified: o.buyerNotified };
  }
  await ack(); return { cmd: 'cb:stale' };
}
