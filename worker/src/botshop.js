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
 * v183: один экран — навигация редактирует то же сообщение; «← Назад» (bk-данные в кнопке) и «Главное меню» на каждом экране;
 *   введённый на шагах текст удаляется; /start и команды заменяют прошлый экран (KV botscr:<chat>). Данные кнопок: <экран>[~<назад>],
 *   шаги назад: bq · bc · bt · bm; кнопки уведомлений: n:<данные> (открыть экран новым сообщением, уведомление не трогать).
 */
import { SHOP_CONFIG, ORDER_STATUS, ORDER_SHORT, visibleProducts, productById, statusOf, orderable, fmtRub, orderTotal } from '../../shop-config.js';
import { APP_URL, RULE, esc, webAppBtn, START_CAPTION, TG_BANNER_URL } from './botcopy.js';
import { createOrder, listOrders, setOrderStatus, getOrder, msgOrderOwner, adminStatusKeyboard, msgOrderStatusBuyer, msgOrderBuyer, shopAdmins, ownerChat, normPhone, SHOP_RL } from './shop.js';

export const FLOW_TTL = 3600;
export const SUPPORT_DAY_MAX = 100; // v184: обращений в поддержку через бота на весь сервис в сутки (спам с многих аккаунтов)
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
/** Фото-экран; подпись длиннее 1024 → текстовый экран (Telegram не примет). */
const pic = (photo, cap, kb) => (photo && cap.length <= 1024
  ? { method: 'sendPhoto', payload: { photo, caption: cap, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } } }
  : text(cap, kb));
export const IMG = {
  banner: TG_BANNER_URL,
  gps: APP_URL + 'img/shop/tg/gps-hero.jpg',
  specs: APP_URL + 'img/shop/tg/gps-section.jpg',
  chip: APP_URL + 'img/shop/tg/gps-exploded.jpg',
};
export const BACK = '← Назад';
export const HOME = 'Главное меню';
const BACK_RE = /^(m|sh|chip|faq|my|p:[a-z0-9-]{2,40}|pk:[a-z0-9-]{2,40}|mo:o[a-z0-9]{10,16})$/;
/** Нижний ряд: «← Назад» (к предыдущему экрану) и «Главное меню»; с первого уровня «Назад» и есть меню. */
export const navRow = (back) => (!back || back === 'm' ? [cb(BACK, 'm')] : [cb(BACK, back), cb(HOME, 'm')]);
/** Кнопка перехода с подсказкой «куда вернуться»: chip~p:pitlane-gps. */
const go = (label, to, back) => cb(label, back && back !== 'm' && (to + '~' + back).length <= 64 ? to + '~' + back : to);

export function mainMenuRows(param) {
  const gps = productById('pitlane-gps');
  return [
    [webAppBtn(param ? 'Открыть ссылку' : 'Открыть PITLANE', param ? { startapp: param } : {})],
    ...(gps ? [[cb('PITLANE GPS · ' + priceText(gps), 'p:' + gps.id)]] : []),
    [cb('Магазин', 'sh'), cb('Мои заказы', 'my')],
    [cb('Как работает чип', 'chip'), cb('Вопросы и поддержка', 'faq')],
  ];
}
export const MENU_TEXT = START_CAPTION;
/** Главное меню = экран /start: баннер, подпись, кнопки. */
export const screenMenu = (caption = START_CAPTION, param = '') => pic(IMG.banner, caption, mainMenuRows(param));

export function screenShop() {
  const ps = visibleProducts();
  const lines = ps.map((p) => '<b>' + esc(p.title) + '</b> — ' + esc(priceText(p)) + ' · ' + esc(statusOf(p).label.toLowerCase()) + '\n' + esc(p.subtitle || ''));
  return pic(IMG.gps,
    '<b>Магазин PITLANE</b>\n' + RULE + '\n' + lines.join('\n\n') + '\n' + RULE + '\n' +
    (SHOP_CONFIG.payments ? '' : 'Онлайн-оплаты нет: оформляете предзаказ — мы пишем вам и согласуем оплату и доставку.'),
    [...ps.map((p) => [cb(p.title + ' · ' + priceText(p), 'p:' + p.id)]), [cb('Мои заказы', 'my~sh')], navRow('m')],
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
const orderBtn = (p) => (orderable(p) ? [[cb(p.status === 'preorder' ? 'Оформить предзаказ' : 'Оформить заказ', 'ob:' + p.id)]] : []);
export function screenProduct(p, back = 'sh') {
  const self = 'p:' + p.id;
  const rows = [
    ...orderBtn(p),
    [cb('Характеристики', 'pk:' + p.id), ...(p.id === 'pitlane-gps' ? [go('Как работает чип', 'chip', self)] : [])],
    navRow(BACK_RE.test(back) ? back : 'sh'),
  ];
  return pic(productPhoto(p), productCaption(p), rows);
}
export function screenSpecs(p) {
  const specs = (p.specs || []).map(([k, v]) => '<b>' + esc(k) + '.</b> ' + esc(v)).join('\n');
  const notes = (p.notes || []).map((x) => '— ' + esc(x)).join('\n');
  return pic(IMG.specs, '<b>' + esc(p.title) + ' · характеристики</b>\n' + RULE + '\n' + specs + (notes ? '\n' + RULE + '\n' + notes : ''),
    [...orderBtn(p), navRow('p:' + p.id)]);
}

export const CHIP_TEXT =
  '<b>Как работает PITLANE GPS</b>\n' + RULE + '\n' +
  '<b>1. Установка.</b> Прибор ставится на торпеду у лобового стекла — антенне нужно небо. Держится на магнитах, питание — USB от машины.\n' +
  '<b>2. Точность.</b> Приёмник u-blox NEO-M9N считает позицию 25 раз в секунду по GPS, ГЛОНАСС, Galileo и BeiDou. Телефон — обычно 1 раз в секунду.\n' +
  '<b>3. Связь.</b> iPhone — по Wi-Fi через режим модема, Android — по Bluetooth или Wi-Fi. Скорость и отсечки видно в приложении в реальном времени.\n' +
  '<b>4. Зачёт.</b> Сервер проверяет трек заезда и ставит класс A или B — с ним результат попадает в топ внешнего GPS.\n' + RULE + '\n' +
  'Первый холодный старт под открытым небом — до минуты. Атермальное стекло может ослаблять сигнал.';
export const screenChip = (back = 'm') => pic(IMG.chip, CHIP_TEXT, [
  [go('PITLANE GPS · ' + priceText(productById('pitlane-gps')), 'p:pitlane-gps', 'chip')],
  [go('Вопросы и поддержка', 'faq', 'chip')],
  navRow(BACK_RE.test(back) ? back : 'm'),
]);

export const FAQ_TEXT =
  '<b>Вопросы и ответы</b>\n' + RULE + '\n' +
  '<b>Как оплатить?</b> Онлайн-оплаты нет. После заявки мы напишем, подтвердим заказ и согласуем оплату и доставку.\n' +
  '<b>Сроки.</b> PITLANE GPS собирается под заказ. Срок назовём при подтверждении.\n' +
  '<b>Доставка.</b> По России — транспортной компанией или курьером, обсудим при подтверждении.\n' +
  '<b>Нужен ли чип?</b> Нет: замеры работают и с GPS телефона (класс C). Чип даёт 25 Гц и зачёт в топ внешнего GPS (A/B).\n' +
  '<b>Отмена.</b> До отправки заказ можно отменить — напишите в поддержку.\n' +
  '<b>Вход в приложение.</b> Откройте PITLANE из этого чата — Telegram подтвердит аккаунт сам.\n' + RULE + '\n' +
  'Не нашли ответ — напишите нам.';
export const screenFaq = (back = 'm') => pic(IMG.banner, FAQ_TEXT, [
  [go('Написать в поддержку', 'sup', 'faq')],
  [go('Как работает чип', 'chip', 'faq')],
  navRow(BACK_RE.test(back) ? back : 'm'),
]);
export const SUPPORT_ASK = '<b>Поддержка</b>\nНапишите вопрос одним сообщением — его прочитает команда PITLANE и ответит в Telegram.';
export const SUPPORT_SENT = 'Сообщение отправлено. Ответим в Telegram.';
export const screenSupport = (back = 'faq', warn = '') => pic(IMG.banner, (warn ? '<i>' + warn + '</i>\n' : '') + SUPPORT_ASK, [navRow(BACK_RE.test(back) ? back : 'faq')]);
export const screenSupportSent = (ok, quote) => pic(IMG.banner,
  '<b>Поддержка</b>\n' + (ok ? SUPPORT_SENT : 'Не получилось отправить — попробуйте позже.') + (quote ? '\n' + RULE + '\n<i>' + esc(quote.slice(0, 300)) + (quote.length > 300 ? '…' : '') + '</i>' : ''),
  [[cb('Мои заказы', 'my')], navRow('m')]);

/* ——— оформление ——— */
const stepHead = (f, n, title) => '<b>' + (productById(f.pid)?.status === 'preorder' ? 'Предзаказ' : 'Заказ') + ' · ' + esc(productById(f.pid)?.title || '') + '</b>\nШаг ' + n + ' из 4 · ' + title;
const stepPic = (f) => productPhoto(productById(f.pid)) || IMG.gps;
const warnLine = (w) => (w ? '\n<i>' + w + '</i>' : '');
export function screenQty(f) {
  const p = productById(f.pid); const max = Math.max(1, Math.min(5, p.maxQty || 5));
  return pic(stepPic(f), stepHead(f, 1, 'Количество') + '\nЦена за штуку — ' + esc(priceText(p)) + '.',
    [Array.from({ length: max }, (_, i) => cb(String(i + 1), 'oq:' + (i + 1))), navRow('p:' + f.pid)]);
}
export const screenCity = (f, warn = '') => pic(stepPic(f), stepHead(f, 2, 'Город доставки') + '\nНапишите город одним сообщением или выберите ниже.' + warnLine(warn),
  [QUICK_CITIES.map((c, i) => cb(c, 'oc:' + i)), navRow('bq')]);
export function screenContact(f) {
  return pic(stepPic(f), stepHead(f, 3, 'Связь') + '\nКак с вами связаться, чтобы подтвердить заказ?',
    [[cb('Telegram — этот аккаунт' + (f.un ? ' (@' + f.un + ')' : ''), 'ot:tg')], [cb('Другой Telegram', 'ot:other'), cb('Телефон', 'ot:phone')], navRow('bc')]);
}
export const ASK_TG_OTHER = 'Напишите имя пользователя Telegram, например <code>@pitlane_racer</code>.';
export const ASK_PHONE = 'Отправьте номер кнопкой ниже или напишите его, например <code>+7 900 123-45-67</code>.';
export const screenTgOther = (f, warn = '') => pic(stepPic(f), stepHead(f, 3, 'Связь') + '\n' + ASK_TG_OTHER + warnLine(warn), [navRow('bt')]);
export const screenPhone = (f, warn = '') => pic(stepPic(f), stepHead(f, 3, 'Связь') + '\n' + ASK_PHONE + warnLine(warn), [navRow('bt')]);
export const screenComment = (f) => pic(stepPic(f), stepHead(f, 4, 'Комментарий') + '\nНапример, удобное время для связи. Можно пропустить.', [[cb('Пропустить', 'on:skip')], navRow('bt')]);
export function contactLabel(f) {
  if (f.cm === 'tg') return 'Telegram' + (f.un ? ' @' + esc(f.un) : ' — этот аккаунт');
  if (f.cm === 'tg_other') return 'Telegram ' + esc(f.cv);
  return 'Телефон ' + esc(f.cv);
}
export function screenConfirm(f) {
  const p = productById(f.pid); const total = orderTotal(p, f.qty);
  return pic(stepPic(f),
    '<b>Проверьте заказ</b>\n' + RULE + '\n' +
    '<b>' + esc(p.title) + '</b> × ' + f.qty + ' — <b>' + esc(total != null ? fmtRub(total) : 'цена по запросу') + '</b>\n' +
    esc(statusOf(p).label) + ' · без онлайн-оплаты\n' +
    'Город: ' + esc(f.city) + '\n' +
    'Связь: ' + contactLabel(f) + '\n' +
    (f.cmt ? 'Комментарий: ' + esc(f.cmt) + '\n' : '') + RULE + '\n' +
    'После подтверждения мы напишем вам, чтобы согласовать оплату и доставку.',
    [[cb('Подтвердить заказ', 'ok')], [cb('Изменить', 'oe'), cb('Отмена', 'ox')], navRow('bm')],
  );
}
/** Экран после «Подтвердить»: то же сообщение превращается в «Заявка принята · номер». */
export const screenPlaced = (o, H) => pic(stepPic({ pid: o.productId }), msgOrderBuyer(o, H), [[cb('Мои заказы', 'my'), cb('Открыть заказ', 'mo:' + o.id)], navRow('m')]);
export const CANCELED_TEXT = 'Оформление отменено.';
export const EXPIRED_TEXT = 'Оформление устарело — начните заново.';
export const screenNote = (t, rows = []) => pic(IMG.banner, '<b>PITLANE</b>\n' + t, [...rows, navRow('m')]);

/* ——— мои заказы ——— */
export function screenMyOrders(orders, back = 'm') {
  const nav = navRow(BACK_RE.test(back) ? back : 'm');
  if (!orders.length) return pic(IMG.banner, '<b>Мои заказы</b>\nЗаказов пока нет.', [[go('PITLANE GPS', 'p:pitlane-gps', 'my')], nav]);
  const lines = orders.slice(0, 8).map((o) => esc(o.title) + ' × ' + o.qty + ' · <b>' + esc(ORDER_SHORT[o.status] || ORDER_SHORT.new) + '</b>\n<code>' + esc(o.id) + '</code> · ' + esc(MSKd(o.at)));
  return pic(IMG.banner, '<b>Мои заказы</b>\n' + RULE + '\n' + lines.join('\n\n'),
    [...orders.slice(0, 5).map((o) => [cb(o.id + ' · ' + (ORDER_SHORT[o.status] || ORDER_SHORT.new), 'mo:' + o.id)]), [cb('Магазин', 'sh')], nav]);
}
export function screenOrder(o) {
  const hist = (Array.isArray(o.history) && o.history.length ? o.history : [{ st: o.status || 'new', at: o.at }])
    .map((x) => '<code>' + esc(MSK(x.at)) + '</code>  ' + esc(ORDER_SHORT[x.st] || x.st)).join('\n');
  return pic(stepPic({ pid: o.productId }),
    '<b>Заказ ' + esc(o.id) + '</b>\n' +
    esc(o.title) + ' × ' + o.qty + (o.total != null ? ' — ' + esc(fmtRub(o.total)) : '') + '\n' +
    'Статус: <b>' + esc(ORDER_STATUS[o.status] ? ORDER_SHORT[o.status] : ORDER_SHORT.new) + '</b>\n' +
    'Город: ' + esc(o.city) + '\n' + RULE + '\n' + hist + '\n' + RULE + '\n' +
    'Вопрос по заказу — «Написать в поддержку».',
    [[go('Написать в поддержку', 'sup', 'mo:' + o.id)], navRow('my')],
  );
}

/* ——— состояние ——— */
async function getFlow(kv, chat) { try { return JSON.parse((await kv.get(flowKey(chat))) || 'null'); } catch (_) { return null; } }
const putFlow = (kv, chat, f) => kv.put(flowKey(chat), JSON.stringify({ ...f, t: Date.now() }), { expirationTtl: FLOW_TTL });
const dropFlow = (kv, chat) => kv.delete(flowKey(chat));
const userName = (from) => String(from?.username || '').replace(/[^\w]/g, '').slice(0, 32) || null;

/* ——— v183: один экран, как в приложении ———
 * Нажатие кнопки редактирует то же сообщение (editMessageMedia для фото-экранов, editMessageText для текстовых).
 * «message is not modified» — экран уже такой, ничего не делаем; любая другая ошибка (сообщение старое / удалено /
 * другой тип) → новое сообщение + удаление старого. Текст, который человек вводит на шагах, удаляется, шаг
 * перерисовывается в том же сообщении. /start и команды удаляют прошлый экран (KV botscr:<chat>) и присылают один новый.
 * Уведомления (статусы, заявки Маге) — отдельные сообщения; их кнопки «n:…» открывают экран новым сообщением. */
export const SCR_TTL = 60 * 86400;
const scrKey = (chat) => 'botscr:' + chat;
export const isPhotoSpec = (s) => s?.method === 'sendPhoto';
const NOT_MODIFIED_RE = /message is not modified/i;

async function send(env, chat, spec, H) {
  let r = await H.tgCall(env, spec.method, { chat_id: chat, ...spec.payload });
  let photo = isPhotoSpec(spec);
  if (!r?.ok && photo) { // фото недоступно → тот же текст без фото
    const { photo: _p, caption, ...rest } = spec.payload;
    r = await H.tgCall(env, 'sendMessage', { chat_id: chat, text: caption, ...rest, link_preview_options: { is_disabled: true } });
    photo = false;
  }
  return { r, mid: r?.result?.message_id || null, photo };
}
const del = (env, chat, mid, H) => (mid ? H.tgCall(env, 'deleteMessage', { chat_id: chat, message_id: Number(mid) }).catch(() => null) : null);

/** Новый экран: удалить прошлый (из KV), прислать один свежий, запомнить его id. */
export async function showFresh(env, chat, spec, H, { userMsg } = {}) {
  const kv = env.PITLANE;
  const old = await kv.get(scrKey(chat));
  const s = await send(env, chat, spec, H);
  if (s.r?.ok) {
    if (old && String(old) !== String(s.mid)) await del(env, chat, old, H);
    if (s.mid) await kv.put(scrKey(chat), String(s.mid), { expirationTtl: SCR_TTL });
  }
  if (userMsg) await del(env, chat, userMsg, H);
  return { ...s, fresh: true };
}

/** Перерисовать экран mid. wasPhoto — текущий тип сообщения. → { r, mid, photo, edited|same|replaced } */
export async function showEdit(env, chat, mid, wasPhoto, spec, H) {
  if (!mid) return showFresh(env, chat, spec, H);
  const p = spec.payload; let r;
  if (isPhotoSpec(spec) && wasPhoto) {
    r = await H.tgCall(env, 'editMessageMedia', { chat_id: chat, message_id: mid, media: { type: 'photo', media: p.photo, caption: p.caption, parse_mode: p.parse_mode || 'HTML' }, reply_markup: p.reply_markup });
  } else if (!isPhotoSpec(spec) && !wasPhoto && !p.reply_markup?.keyboard) {
    r = await H.tgCall(env, 'editMessageText', { chat_id: chat, message_id: mid, text: p.text, parse_mode: p.parse_mode || 'HTML', link_preview_options: { is_disabled: true }, reply_markup: p.reply_markup });
  } else r = { ok: false, description: 'kind change' };
  if (r?.ok) return { r, mid, photo: isPhotoSpec(spec), edited: true };
  if (NOT_MODIFIED_RE.test(String(r?.description || ''))) return { r: { ok: true }, mid, photo: !!wasPhoto, same: true };
  // «message to edit not found», «message can't be edited», старое сообщение, смена типа → новое + удалить старое
  const s = await send(env, chat, spec, H);
  if (s.r?.ok) {
    await del(env, chat, mid, H);
    if (s.mid) await env.PITLANE.put(scrKey(chat), String(s.mid), { expirationTtl: SCR_TTL });
  }
  return { ...s, mid: s.mid || mid, replaced: true, editError: String(r?.description || '').slice(0, 80) };
}

async function myPid(env, tgId, H) {
  const pid = await env.PITLANE.get('auth:tg:' + tgId);
  return pid && H.isPilotUuid(pid) ? pid : null;
}
async function myOrders(env, tgId, H) { const pid = await myPid(env, tgId, H); return pid ? listOrders(env.PITLANE, pid, H) : []; }
const phoneKb = () => ({ keyboard: [[{ text: 'Отправить мой номер', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true, input_field_placeholder: '+7 900 123-45-67' });
export const PHONE_AUX = 'Номер можно отправить кнопкой ниже.';
/** Убрать вспомогательное сообщение с кнопкой «Отправить мой номер» и саму клавиатуру (сообщение с remove_keyboard тут же удаляется). */
async function clearAux(env, chat, f, H) {
  if (!f?.aux) return;
  await del(env, chat, f.aux, H);
  const r = await H.tgCall(env, 'sendMessage', { chat_id: chat, text: 'Готово.', reply_markup: { remove_keyboard: true } });
  if (r?.result?.message_id) await del(env, chat, r.result.message_id, H);
  f.aux = null;
}
/** Выход из оформления/поддержки при переходе на другой экран. */
async function leaveFlow(env, chat, H) {
  const f = await getFlow(env.PITLANE, chat);
  if (f) { await clearAux(env, chat, f, H); await dropFlow(env.PITLANE, chat); }
}
const modeOf = (s) => (!s ? null : s.fresh ? 'fresh' : s.same ? 'same' : s.replaced ? 'replaced' : 'edit');

/** /start (route из tgRoute): прошлый экран удаляется, приходит один новый; команда пользователя тоже убирается. */
export async function botStart(env, msg, route, H) {
  const s = await showFresh(env, msg.chat.id, { method: route.method, payload: route.payload }, H, { userMsg: msg.message_id });
  return { ...route, sent: !!s.r?.ok, mode: 'fresh', mid: s.mid };
}

/** Команды бота, у которых свой экран (вызывается из tgHandleMessage). → { cmd } | null */
export async function botCommand(env, msg, cmd, H) {
  const chat = msg.chat.id;
  const map = { shop: () => screenShop(), chip: () => screenChip(), help: () => screenFaq(), faq: () => screenFaq(), menu: () => screenMenu(), support: () => screenFaq() };
  let spec = null;
  if (cmd === 'orders') spec = screenMyOrders(await myOrders(env, msg.from?.id || chat, H));
  else if (map[cmd]) spec = map[cmd]();
  if (!spec) return null;
  await leaveFlow(env, chat, H);
  const s = await showFresh(env, chat, spec, H, { userMsg: msg.message_id });
  return { cmd, sent: !!s.r?.ok, mode: 'fresh', mid: s.mid };
}

/** Текст/контакт, пока идёт шаг оформления или поддержки. → { cmd } | null (не наш — обычный ответ).
 *  Сообщение человека удаляется, шаг перерисовывается в том же экране (f.mid). */
export async function botFlowMessage(env, msg, H) {
  const chat = msg.chat.id; const kv = env.PITLANE;
  const f = await getFlow(kv, chat); if (!f || !f.step) return null;
  const tx = typeof msg.text === 'string' ? msg.text.trim() : '';
  if (tx.startsWith('/')) { await clearAux(env, chat, f, H); await dropFlow(kv, chat); return null; } // команда прерывает шаг
  const tidy = () => del(env, chat, msg.message_id, H);
  const paint = async (spec) => { const s = await showEdit(env, chat, f.mid, f.ph, spec, H); f.mid = s.mid; f.ph = s.photo; return s; };
  const stay = async (cmd, spec) => { await tidy(); const s = await paint(spec); await putFlow(kv, chat, f); return { cmd, mode: modeOf(s) }; };
  if (f.step === 'support') {
    if (tx.length < 3) return stay('support:short', screenSupport(f.bk, 'Напишите вопрос текстом.'));
    if (await H.rateHit(kv, 'rl:botsup:' + chat, 5, 86400) || await H.rateHit(kv, 'rl:botsup:day:' + H.moscowDateKey(), SUPPORT_DAY_MAX, 86400)) { /* v184: + общий потолок в сутки */ await dropFlow(kv, chat); await tidy(); await paint(screenNote('Сегодня уже несколько обращений — мы ответим на них. Новые — завтра.')); return { cmd: 'support:limited' }; }
    const owner = ownerChat(env);
    const un = userName(msg.from);
    const body = '<b>Поддержка · бот</b>\n' + RULE + '\n' + esc(tx.slice(0, 2000)) + '\n' + RULE + '\n' +
      'От: ' + esc(H.safeName([msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' '), '—')) + (un ? ' · @' + esc(un) : '') + ' · id <code>' + esc(msg.from?.id) + '</code>';
    const url = un ? 'https://t.me/' + un : 'tg://user?id=' + msg.from?.id;
    let r = owner ? await H.tgCall(env, 'sendMessage', { chat_id: owner, text: body, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: 'Ответить', url }]] } }) : null;
    if (owner && !r?.ok) r = await H.tgCall(env, 'sendMessage', { chat_id: owner, text: body, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    await dropFlow(kv, chat); await tidy();
    const s = await paint(screenSupportSent(!!r?.ok, tx));
    return { cmd: 'support:' + (r?.ok ? 'sent' : 'fail'), mode: modeOf(s) };
  }
  if (f.step === 'city') {
    const city = H.cleanLabel(tx, 60);
    if (city.length < 2 || H.containsPhone(city)) return stay('order:city?', screenCity(f, 'Напишите название города, например <code>Казань</code>.'));
    f.city = city; f.step = 'contact'; return stay('order:city', screenContact(f));
  }
  if (f.step === 'tg_other') {
    const m = TG_USER_RE.exec(tx);
    if (!m) return stay('order:tg?', screenTgOther(f, 'Не похоже на имя пользователя.'));
    f.cm = 'tg_other'; f.cv = '@' + m[1]; f.step = 'comment'; return stay('order:tg', screenComment(f));
  }
  if (f.step === 'phone') {
    const raw = msg.contact && (!msg.contact.user_id || msg.contact.user_id === msg.from?.id) ? msg.contact.phone_number : tx;
    const ph = normPhone(raw);
    if (!ph) return stay('order:phone?', screenPhone(f, 'Не похоже на номер телефона.'));
    f.cm = 'phone'; f.cv = ph; f.step = 'comment';
    await clearAux(env, chat, f, H);
    return stay('order:phone', screenComment(f));
  }
  if (f.step === 'comment') {
    f.cmt = H.cleanLabel(tx.replace(/\s+/g, ' '), 500); f.step = 'confirm'; return stay('order:comment', screenConfirm(f));
  }
  if (f.step === 'confirm' || f.step === 'qty' || f.step === 'contact') { await tidy(); return { cmd: 'order:wait' }; } // выбор — кнопками на экране
  return null;
}

/** callback_query (кнопки). Всегда отвечает answerCallbackQuery; экран — редактированием того же сообщения. → { cmd, mode } */
export async function botCallback(env, cq, H) {
  const kv = env.PITLANE;
  let data = String(cq?.data || '').slice(0, 64);
  const from = cq?.from || {}; const chat = cq?.message?.chat?.id;
  const ack = (t, alert) => H.tgCall(env, 'answerCallbackQuery', { callback_query_id: cq.id, ...(t ? { text: t, show_alert: !!alert } : {}) });
  if (!Number.isSafeInteger(chat) || !Number.isSafeInteger(from.id)) { await ack(); return { cmd: 'cb:bad' }; }
  // админ: статус заказа (из чата заявок) — карточка заявки обновляется на месте, покупателю — отдельное уведомление
  const am = data.match(/^as:(o[a-z0-9]{10,16}):([a-z]+)$/);
  if (am) {
    if (!shopAdmins(env).has(String(from.id))) { await ack('Недоступно', true); return { cmd: 'cb:as:denied' }; }
    const r = await setOrderStatus(env, am[1], am[2], H);
    if (r.error) { await ack('Заказ не найден'); return { cmd: 'cb:as:' + r.error }; }
    const o = r.o;
    const buyer = { pid: o.pid, nick: o.buyer?.nick || '', tgId: o.buyer?.tgId || (await H.tgChatOf(env, o.pid)), username: o.buyer?.username || null };
    const m = msgOrderOwner(o, buyer, H);
    const e = await H.tgCall(env, 'editMessageText', { chat_id: chat, message_id: cq.message.message_id, text: m.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: m.keyboard } });
    if (!e?.ok && !NOT_MODIFIED_RE.test(String(e?.description || ''))) await H.tgCall(env, 'editMessageText', { chat_id: chat, message_id: cq.message.message_id, text: m.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: adminStatusKeyboard(o) } });
    let notified = false;
    if (r.changed && buyer.tgId) {
      const s = await H.tgCall(env, 'sendMessage', { chat_id: buyer.tgId, text: msgOrderStatusBuyer(o, H), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[cb('Мои заказы', 'n:my'), cb('Поддержка', 'n:sup')]] } });
      notified = !!s?.ok;
    }
    await ack(r.changed ? (ORDER_SHORT[o.status] + (notified ? ' · покупатель уведомлён' : ' · покупателю не доставлено')) : 'Статус уже такой');
    return { cmd: 'cb:as', status: o.status, changed: r.changed, notified };
  }
  if (await (H.tgFlood ? H.tgFlood(env, 'RL_TGCB', 'c:' + chat, 'rl:tgcb:' + chat, 40) : H.rateHit(kv, 'rl:tgcb:' + chat, 40, 60))) { await ack(); return { cmd: 'cb:limited' }; } // v184: без записи KV на нажатие
  // кнопка из уведомления → экран новым сообщением (уведомление остаётся), прошлый экран удаляется
  const fresh = data.startsWith('n:'); if (fresh) data = data.slice(2);
  const [key, bk0] = data.split('~'); const back = bk0 && BACK_RE.test(bk0) ? bk0 : null;
  const msgId = cq.message?.message_id; const wasPhoto = Array.isArray(cq.message?.photo) && cq.message.photo.length > 0;
  const paint = (spec) => (fresh ? showFresh(env, chat, spec, H) : showEdit(env, chat, msgId, wasPhoto, spec, H));
  const done = async (cmd, spec, toast, alert) => { await ack(toast, alert); const s = spec ? await paint(spec) : null; return { cmd, mode: modeOf(s), mid: s?.mid }; };
  const nav = async (cmd, spec) => { await leaveFlow(env, chat, H); return done(cmd, spec); };
  let m;
  if (key === 'm') return nav('cb:menu', screenMenu());
  if (key === 'sh') return nav('cb:shop', screenShop());
  if (key === 'chip') return nav('cb:chip', screenChip(back || 'm'));
  if (key === 'faq') return nav('cb:faq', screenFaq(back || 'm'));
  if (key === 'my') return nav('cb:my', screenMyOrders(await myOrders(env, from.id, H), back || 'm'));
  if (key === 'sup') {
    await leaveFlow(env, chat, H); await ack();
    const bk = back || 'faq'; const s = await paint(screenSupport(bk));
    await putFlow(kv, chat, { step: 'support', bk, mid: s.mid, ph: s.photo });
    return { cmd: 'cb:sup', mode: modeOf(s), mid: s.mid };
  }
  if ((m = key.match(/^mo:(o[a-z0-9]{10,16})$/))) {
    const o = await getOrder(env, m[1], H); const pid = await myPid(env, from.id, H);
    if (!o || !pid || o.pid !== pid) { await ack('Заказ не найден'); return { cmd: 'cb:mo:none' }; }
    return nav('cb:mo', screenOrder(o));
  }
  if ((m = key.match(/^p:([a-z0-9-]{2,40})$/))) { const p = productById(m[1]); if (!p || p.hidden) { await ack('Товар не найден'); return { cmd: 'cb:p:none' }; } return nav('cb:product', screenProduct(p, back || 'sh')); }
  if ((m = key.match(/^pk:([a-z0-9-]{2,40})$/))) { const p = productById(m[1]); if (!p || p.hidden) { await ack('Товар не найден'); return { cmd: 'cb:pk:none' }; } return nav('cb:specs', screenSpecs(p)); }
  if ((m = key.match(/^ob:([a-z0-9-]{2,40})$/))) {
    const p = productById(m[1]); if (!orderable(p)) { await ack('Сейчас недоступно', true); return { cmd: 'cb:ob:na' }; }
    await leaveFlow(env, chat, H); await ack();
    const f = { step: 'qty', pid: p.id, un: userName(from), nm: H.safeName([from.first_name, from.last_name].filter(Boolean).join(' '), ''), cid: H.randB36(16) };
    const s = await paint(screenQty(f)); f.mid = s.mid; f.ph = s.photo;
    await putFlow(kv, chat, f); return { cmd: 'cb:order', mode: modeOf(s), mid: s.mid };
  }
  if (key === 'ox') return nav('cb:cancel', screenNote(CANCELED_TEXT, [[cb('Магазин', 'sh')]]));
  // дальше — шаги оформления: нужно живое состояние
  const f = await getFlow(kv, chat);
  const p = f && f.pid ? productById(f.pid) : null;
  // v184: товар убрали из конфига посреди оформления → раньше TypeError (кнопка «крутилась» без ответа)
  if (!f || !f.pid || !p) { if (f) await dropFlow(kv, chat); return done('cb:expired', screenNote(EXPIRED_TEXT, [[cb('Магазин', 'sh')]])); }
  const step = async (cmd, spec) => { await ack(); const s = await paint(spec); f.mid = s.mid; f.ph = s.photo; await putFlow(kv, chat, f); return { cmd, mode: modeOf(s), mid: s.mid }; };
  if ((m = key.match(/^oq:(\d)$/))) {
    const q = Number(m[1]); if (q < 1 || q > (p.maxQty || 5)) { await ack(); return { cmd: 'cb:oq:bad' }; }
    f.qty = q; f.step = 'city'; return step('cb:qty', screenCity(f));
  }
  if ((m = key.match(/^oc:(\d)$/)) && f.qty) {
    const c = QUICK_CITIES[Number(m[1])]; if (!c) { await ack(); return { cmd: 'cb:oc:bad' }; }
    f.city = c; f.step = 'contact'; return step('cb:city', screenContact(f));
  }
  if ((m = key.match(/^ot:(tg|other|phone)$/)) && f.city) {
    if (m[1] === 'tg') { f.cm = 'tg'; f.cv = null; f.step = 'comment'; return step('cb:contact', screenComment(f)); }
    if (m[1] === 'other') { f.step = 'tg_other'; return step('cb:contact:other', screenTgOther(f)); }
    f.step = 'phone';
    const res = await step('cb:contact:phone', screenPhone(f));
    if (!f.aux) { // кнопка «Отправить мой номер» живёт только в обычной клавиатуре → одно служебное сообщение под экраном
      const a = await H.tgCall(env, 'sendMessage', { chat_id: chat, text: PHONE_AUX, reply_markup: phoneKb() });
      if (a?.result?.message_id) { f.aux = a.result.message_id; await putFlow(kv, chat, f); }
    }
    return res;
  }
  // «← Назад» по шагам
  if (key === 'bq') { await clearAux(env, chat, f, H); f.step = 'qty'; return step('cb:back:qty', screenQty(f)); }
  if (key === 'bc' && f.qty) { await clearAux(env, chat, f, H); f.step = 'city'; return step('cb:back:city', screenCity(f)); }
  if (key === 'bt' && f.city) { await clearAux(env, chat, f, H); f.step = 'contact'; return step('cb:back:contact', screenContact(f)); }
  if (key === 'bm' && f.cm) { f.step = 'comment'; return step('cb:back:comment', screenComment(f)); }
  if (key === 'on:skip' && f.cm) { f.cmt = ''; f.step = 'confirm'; return step('cb:skip', screenConfirm(f)); }
  if (key === 'oe') { await clearAux(env, chat, f, H); const g = { step: 'qty', pid: f.pid, un: f.un, nm: f.nm, cid: f.cid, mid: f.mid, ph: f.ph }; Object.keys(f).forEach((k) => delete f[k]); Object.assign(f, g); return step('cb:edit', screenQty(f)); }
  if (key === 'ok' && f.step === 'confirm' && f.qty && f.city && f.cm) {
    if (!orderable(p)) { await ack('Товар сейчас недоступен', true); return { cmd: 'cb:ok:na' }; }
    // v184: двойное нажатие «Подтвердить» (Telegram шлёт апдейты параллельно) → раньше две заявки; замок на cid (best effort, KV)
    const lockKey = 'botlock:' + f.cid;
    if (await kv.get(lockKey)) { await ack('Заказ уже оформляется'); return { cmd: 'cb:ok:busy' }; }
    const lockTok = H.randB36(12);
    await kv.put(lockKey, lockTok, { expirationTtl: 60 });
    if ((await kv.get(lockKey)) !== lockTok) { await ack('Заказ уже оформляется'); return { cmd: 'cb:ok:busy' }; } // параллельный «победил»
    const { pilot } = await H.ensurePilotForProvider(kv, 'tg', String(from.id), { nick: f.nm });
    const mine = await listOrders(kv, pilot.id, H);
    const dup = mine.find((o) => o.cid === f.cid);
    if (dup) { await dropFlow(kv, chat); return { ...(await done('cb:ok:dup', screenPlaced(dup, H), 'Заказ уже оформлен')), id: dup.id }; }
    if (await H.rateHit(kv, 'rl:shop:p:' + pilot.id, SHOP_RL.pilotDay, 86400) || await H.rateHit(kv, 'rl:shop:day:' + H.moscowDateKey(), SHOP_RL.globalDay, 86400)) {
      await ack('Слишком много заявок за сутки — напишите в поддержку', true); return { cmd: 'cb:ok:limited' };
    }
    const rec = { productId: p.id, title: p.title, qty: f.qty, price: Number.isFinite(p.price) ? p.price : null, total: orderTotal(p, f.qty), city: f.city,
      contact: f.cm === 'tg' ? { method: 'tg' } : { method: f.cm, value: f.cv }, comment: f.cmt || '', cid: f.cid };
    const o = await createOrder(env, { pid: pilot.id, nick: f.nm || H.safeName(pilot.nick, ''), tgId: from.id, username: f.un }, rec, mine, H, { source: 'bot', notifyBuyer: false });
    await dropFlow(kv, chat);
    const r = await done('cb:ok', screenPlaced(o, H), 'Заказ ' + o.id + ' оформлен');
    return { ...r, id: o.id, forwarded: o.forwarded, buyerNotified: !!r.mid };
  }
  await ack(); return { cmd: 'cb:stale' };
}
