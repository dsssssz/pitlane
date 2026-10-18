// v182: бот @pitlane_official_bot — меню, магазин, карточка товара с фото, предзаказ по шагам, «Мои заказы»,
// кнопки статуса для Маги с уведомлением покупателя, FAQ, «Как работает чип», поддержка. MemKV + перехват Telegram, прод не трогаем.
// Тексты экранов → /workspace/home-shots/v182-bot-screens.json (для превью), если папка есть.
import rawWorker, { tgWebhookPath, BOT_COMMANDS } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import * as B from '../src/botshop.js';
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

console.log('\n[меню /start]');
await say('/start');
let m = last(BUYER); keep('start', m);
ok(m.method === 'sendPhoto' && /^<b>PITLANE<\/b>/.test(m.body.caption) && /Предзаказ — прямо в этом чате/.test(m.body.caption), '/start: баннер, PITLANE, предзаказ в чате');
ok(kbOf(m)[0][0].web_app?.url === 'https://dsssssz.github.io/pitlane/' && datas(m).join() === 'p:pitlane-gps,sh,my,chip,faq', 'кнопки: открыть Mini App, PITLANE GPS, магазин, мои заказы, чип, вопросы', datas(m));
ok(BOT_COMMANDS.map((c) => c.command).join() === 'start,shop,orders,chip,help,stop_notify', 'команды меню: start, shop, orders, chip, help, stop_notify');

console.log('\n[магазин и карточка]');
await say('/shop'); m = last(BUYER); keep('shop', m);
ok(/Магазин PITLANE/.test(txt(m)) && /6\u00a0800\u00a0₽/.test(txt(m)) && datas(m).includes('p:pitlane-gps') && datas(m).some((d) => /^my(~|$)/.test(d)), '/shop: витрина с ценой, кнопки товаров');
await tap('p:pitlane-gps'); m = last(BUYER); keep('product', m);
ok(m.method === 'sendPhoto' && m.body.photo === 'https://dsssssz.github.io/pitlane/img/shop/tg/gps-hero.jpg' && fs.existsSync(path.join(process.cwd(), '..', 'img/shop/tg/gps-hero.jpg')), 'карточка: фото из репо (JPEG для Telegram)', m.body.photo);
ok(/<b>6\u00a0800\u00a0₽<\/b> · Предзаказ/.test(m.body.caption) && /В комплекте/.test(m.body.caption) && productById('pitlane-gps').inBox.every((x) => m.body.caption.includes(x.replace(/&/g, '&amp;'))) && m.body.caption.length <= 1024, 'цена 6 800 ₽, «Предзаказ», состав комплекта, ≤ 1024 символов');
ok(datas(m)[0] === 'ob:pitlane-gps' && datas(m).includes('pk:pitlane-gps') && datas(m).some((d) => /^chip(~|$)/.test(d)), 'кнопки: оформить предзаказ, характеристики, как работает чип');
ok(sent.some((x) => x.method === 'answerCallbackQuery'), 'каждое нажатие отвечено answerCallbackQuery');
await tap('pk:pitlane-gps'); m = last(BUYER); keep('specs', m);
ok(/u-blox NEO-M9N/.test(txt(m)) && /Корпус/.test(txt(m)), 'характеристики');
await tap('chip'); m = last(BUYER); keep('chip', m);
ok(/Как работает PITLANE GPS/.test(txt(m)) && /25 раз в секунду/.test(txt(m)) && /класс A или B/.test(txt(m)), '«Как работает чип»');
await say('/help'); m = last(BUYER); keep('faq', m);
ok(/Вопросы и ответы/.test(txt(m)) && /Онлайн-оплаты нет/.test(txt(m)) && /^sup(~|$)/.test(datas(m)[0]), '/help → вопросы и «Написать в поддержку»');

console.log('\n[предзаказ по шагам]');
await tap('ob:pitlane-gps'); m = last(BUYER); keep('step1_qty', m);
ok(/Шаг 1 из 4 · Количество/.test(txt(m)) && datas(m).slice(0, 5).join() === 'oq:1,oq:2,oq:3,oq:4,oq:5', 'шаг 1: количество 1–5');
await tap('oq:2'); m = last(BUYER); keep('step2_city', m);
ok(/Шаг 2 из 4 · Город/.test(txt(m)) && datas(m).includes('oc:0'), 'шаг 2: город (текстом или кнопкой)');
await say('К'); m = last(BUYER);
ok(/название города/.test(txt(m)), 'слишком короткий город → просьба повторить');
await say('<b>Казань</b>'); m = last(BUYER); keep('step3_contact', m);
ok(/Шаг 3 из 4 · Связь/.test(txt(m)) && datas(m).join().startsWith('ot:tg,ot:other,ot:phone') && /@artem_racer/.test(JSON.stringify(kbOf(m))), 'шаг 3: связь — этот Telegram (@ник), другой, телефон');
await tap('ot:phone'); m = last(BUYER);
ok(m.body.reply_markup?.keyboard?.[0]?.[0]?.request_contact === true, 'телефон: кнопка «Отправить мой номер» (request_contact)');
await say('', BUYER, { contact: { phone_number: '89001234567', user_id: BUYER } }); m = last(BUYER); keep('step4_comment', m);
ok(/Шаг 4 из 4 · Комментарий/.test(txt(m)) && to(BUYER).some((x) => x.body.reply_markup?.remove_keyboard), 'контакт принят, клавиатура убрана, шаг 4: комментарий');
await say('Удобно после 18:00 & <i>в выходные</i>'); m = last(BUYER); keep('confirm', m);
ok(/Проверьте заказ/.test(txt(m)) && /× 2 — <b>13\u00a0600\u00a0₽<\/b>/.test(txt(m)) && /Город: bКазань\/b|Город: Казань/.test(txt(m)) && /Телефон \+79001234567/.test(txt(m)) && txt(m).includes('&amp;') && !/<i>в/.test(txt(m)) && tagsOk(txt(m)), 'подтверждение: сумма 2 × 6 800, город, телефон, комментарий экранирован', txt(m));
ok(datas(m).join() === 'ok,oe,ox,bm,m', 'кнопки: подтвердить / изменить / отмена + «← Назад» / «Главное меню» (v183)');
sent = [];
let r = await tap('ok');
ok(r.cmd === 'cb:ok' && r.forwarded === true && r.buyerNotified === true && /^o[a-z0-9]{12}$/.test(r.id), 'заказ создан, ушёл Маге и покупателю', r);
const OID = r.id;
const ow = last(OWNER); const bu = last(BUYER); keep('owner_new', ow); keep('buyer_new', bu);
ok(/заявка/.test(txt(ow)) && txt(ow).includes(OID) && /13\u00a0600\u00a0₽/.test(txt(ow)) && /Телефон: \+79001234567/.test(txt(ow)) && /Статус: <b>Новая<\/b>/.test(txt(ow)), 'Маге: номер, сумма, контакт, статус «Новая»');
ok(datas(ow).join() === ORDER_ADMIN_STATUSES.map((s) => 'as:' + OID + ':' + s).join(), 'Маге: кнопки статуса принят/собирается/отправлен/доставлен/отменён', datas(ow));
ok(/Заявка принята · /.test(txt(bu)) && txt(bu).includes(OID) && /Онлайн-оплаты нет/.test(txt(bu)) && datas(bu)[0] === 'my', 'покупателю: номер заказа, без оплаты, кнопка «Мои заказы»');
r = await tap('ok'); ok(r.cmd === 'cb:expired' || r.cmd === 'cb:ok:dup', 'повторное «Подтвердить» не создаёт второй заказ', r);
const pid = await kv.get('auth:tg:' + BUYER);
ok(pid && JSON.parse(await kv.get('shoporders:' + pid)).length === 1, 'заказ — в тех же записях, что и в приложении (shoporders:<pid>)');

console.log('\n[мои заказы]');
await say('/orders'); m = last(BUYER); keep('orders', m);
ok(/Мои заказы/.test(txt(m)) && txt(m).includes(OID) && /<b>Новая<\/b>/.test(txt(m)) && datas(m)[0] === 'mo:' + OID, '/orders: заказ со статусом и кнопкой подробностей');
await tap('mo:' + OID); m = last(BUYER); keep('order', m);
ok(/Заказ o/.test(txt(m)) && /Статус: <b>Новая<\/b>/.test(txt(m)) && /<code>\d\d\.\d\d \d\d:\d\d<\/code>/.test(txt(m)), 'подробности: статус и история по МСК');
r = await tap('mo:' + OID, 7182999); ok(r.cmd === 'cb:mo:none', 'чужой заказ не показывается');

console.log('\n[статусы — только Мага]');
sent = [];
r = await tap('as:' + OID + ':shipped', BUYER);
ok(r.cmd === 'cb:as:denied' && !to(BUYER).length && JSON.parse(await kv.get('shoporder:' + OID)).status === 'new', 'покупатель не может менять статус');
for (const [st, label, re] of [['accepted', 'Принят', /принят в работу/], ['assembling', 'Собирается', /Собираем/], ['shipped', 'Отправлен', /в доставку/], ['delivered', 'Доставлен', /доставлен/]]) {
  sent = [];
  r = await tap('as:' + OID + ':' + st, OWNER, 555);
  const ed = sent.find((x) => x.method === 'editMessageText'); const nb = last(BUYER);
  ok(r.cmd === 'cb:as' && r.changed && r.notified && ed?.body.message_id === 555 && new RegExp('Статус: <b>' + label).test(ed.body.text) && kbOf(ed).flat().some((b) => b.text === '· ' + label)
    && new RegExp(label).test(txt(nb)) && re.test(txt(nb)) && txt(nb).includes(OID), 'Мага → «' + label + '»: сообщение обновлено, покупатель уведомлён', { r, ed: ed?.body.text, nb: txt(nb) });
  if (st === 'assembling') { keep('buyer_status', nb); keep('owner_status', ed); }
}
const stored = JSON.parse(await kv.get('shoporder:' + OID));
const list = JSON.parse(await kv.get('shoporders:' + pid));
ok(stored.status === 'delivered' && list[0].status === 'delivered' && stored.history.map((h) => h.st).join() === 'new,accepted,assembling,shipped,delivered', 'обе копии обновлены, история статусов');
sent = []; r = await tap('as:' + OID + ':delivered', OWNER, 555);
ok(r.cmd === 'cb:as' && !r.changed && !to(BUYER).length, 'тот же статус — без повторного уведомления');
r = await tap('as:' + OID + ':bogus', OWNER); ok(r.cmd === 'cb:stale' || r.cmd === 'cb:limited' || !/^cb:as$/.test(r.cmd), 'неизвестный статус игнорируется');
ok(ORDER_STATUS.delivered === 'Доставлен' && ORDER_STATUS.assembling === 'Собирается', 'статусы общие с Mini App (shop-config.js)');

console.log('\n[приложение видит статус]');
// вход через Telegram Mini App тем же tg id → тот же аккаунт и заказ
ok(pid && /^p_[0-9a-f-]{36}$/.test(pid), 'аккаунт создан по Telegram id (тот же, что даст вход в Mini App)');

console.log('\n[поддержка]');
await tap('sup'); m = last(BUYER); keep('support_ask', m);
ok(/Поддержка/.test(txt(m)), '«Написать в поддержку» → просьба написать вопрос');
sent = [];
await say('Когда будет доставка в Казань? <script>');
const sp = last(OWNER); m = last(BUYER); keep('owner_support', sp);
ok(/Поддержка · бот/.test(txt(sp)) && /&lt;script&gt;/.test(txt(sp)) && kbOf(sp)[0][0].url === 'https://t.me/artem_racer' && /отправлено/.test(txt(m)), 'вопрос ушёл Маге (экранирован) с кнопкой «Ответить», покупателю — «отправлено»');
await say('привет'); m = last(BUYER); ok(/\/help/.test(txt(m)), 'после поддержки обычный текст — обычная подсказка');

console.log('\n[отмена и устаревшее оформление]');
await tap('ob:pitlane-gps'); await tap('ox'); m = last(BUYER);
ok(/отменено/.test(txt(m)) && !(await kv.get('botflow:' + BUYER)), 'отмена очищает шаг');
r = await tap('oq:1'); ok(r.cmd === 'cb:expired', 'кнопка старого шага → «начните заново»');
await tap('ob:pitlane-gps'); await say('/start'); ok(!(await kv.get('botflow:' + BUYER)), 'команда прерывает оформление');

console.log('\n[стиль]');
const all = Object.values(screens).map((s) => s.text);
ok(all.every((t) => emoji(t) === 0), 'без эмодзи', all.map(emoji).join(''));
ok(all.every(tagsOk), 'только <b>/<i>/<code>, теги закрыты');
ok(!all.some((t) => /\bты\b|\bтебя\b|\bтвой\b|\bтвою\b/i.test(t)), 'единый тон — «вы»');
const allData = Object.values(screens).flatMap(() => []).concat(sent.flatMap((x) => (x.body.reply_markup?.inline_keyboard || []).flat().map((b) => b.callback_data || '')));
ok(allData.every((d) => Buffer.byteLength(d) <= 64), 'callback_data ≤ 64 байт');
ok(B.CHIP_TEXT.length < 4096 && B.FAQ_TEXT.length < 4096, 'длина сообщений в пределах Telegram');

console.log('\n[Mini App]');
const appSrc = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8'); const swSrc = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8'); const ui = fs.readFileSync(new URL('../../shop-ui.js', import.meta.url), 'utf8');
ok(/const APP_VERSION = 'v1(8[2-9]|9\d)'/.test(appSrc) && /const CACHE = 'pitlane-v1(8[2-9]|9\d)'/.test(swSrc) && /'v181', 'v182'/.test(appSrc), 'версия v182');
ok(/ORDER_SHORT\[s\]/.test(ui), '«Мои заявки» в приложении — те же статусы, что в боте');

console.log('\n[подписка на кнопки]');
const rooms = fs.readFileSync(new URL('../src/rooms.js', import.meta.url), 'utf8'); const idx = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
ok(/tg:wh:pay2/.test(rooms) && /'callback_query'\]/.test(rooms) && /allowed_updates: \['message', 'pre_checkout_query', 'callback_query'\]/.test(idx), 'webhook подписан на callback_query (self-heal после деплоя + /tg/setup)');
ok(fs.existsSync(new URL('../../tools/tg-bot-setup.mjs', import.meta.url)), 'скрипт настройки бота tools/tg-bot-setup.mjs');

try { if (fs.existsSync('/workspace/home-shots')) fs.writeFileSync('/workspace/home-shots/v182-bot-screens.json', JSON.stringify(screens, null, 1)); } catch (_) {}
if (fails) { console.log('\n✗ ' + fails + ' failed'); process.exit(1); }
console.log('\n✓ v182 ok');
