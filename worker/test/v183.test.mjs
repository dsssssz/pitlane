// v183: бот как одно окно — нажатия редактируют тот же экран (editMessageMedia / editMessageText), «← Назад» и «Главное меню»,
// введённый текст удаляется, /start и команды заменяют прошлый экран (KV botscr:<chat>), ошибки «not modified» / «can't be edited»,
// уведомления — отдельные сообщения. Плюс фото-машина в баннере (без силуэта). MemKV + перехват Telegram, прод не трогается.
import rawWorker, { tgWebhookPath } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import * as B from '../src/botshop.js';
import { TG_BANNER_URL } from '../src/botcopy.js';
import { ORDER_ADMIN_STATUSES } from '../../shop-config.js';
import fs from 'fs'; import path from 'path';
const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } };
const kv = new MemKV(); const SECRET = 'S'.repeat(40); const OWNER = 8591275999; const BUYER = 7183001;
let sent = []; let mid = 500; const msgs = new Map(); // message_id → { chat, photo }
let failEdit = null; // описание ошибки для следующего edit*
const env = {
  PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'A'.repeat(30), TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', TG_WEBHOOK_SECRET: SECRET, FEEDBACK_CHAT_ID: String(OWNER),
  __fetch: async (u, o) => {
    const method = String(u).split('/').pop(); const body = JSON.parse(o?.body || '{}'); sent.push({ method, body });
    const res = (x) => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } });
    if (method === 'sendMessage' || method === 'sendPhoto') { const id = ++mid; msgs.set(id, { chat: body.chat_id, photo: method === 'sendPhoto' }); return res({ ok: true, result: { message_id: id } }); }
    if (method === 'editMessageMedia' || method === 'editMessageText') {
      if (failEdit) { const d = failEdit; failEdit = null; return res({ ok: false, error_code: 400, description: d }); }
      if (!msgs.has(body.message_id)) return res({ ok: false, error_code: 400, description: 'Bad Request: message to edit not found' });
      return res({ ok: true, result: { message_id: body.message_id } });
    }
    if (method === 'deleteMessage') { msgs.delete(body.message_id); return res({ ok: true, result: true }); }
    return res({ ok: true, result: true });
  },
};
const hookRaw = async (upd) => { const r = await worker.fetch(new Request('https://api.test/tg/webhook/' + tgWebhookPath(SECRET), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET }, body: JSON.stringify(upd) }), env); return r.json(); };
let uid = 1; let umid = 9000;
const from = (id, extra = {}) => ({ id, is_bot: false, first_name: 'Артём', username: 'artem_racer', ...extra });
const say = (text, id = BUYER, extra = {}) => { const message_id = ++umid; return hookRaw({ update_id: uid++, message: { message_id, chat: { id, type: 'private' }, from: from(id), text, ...extra } }).then((r) => ({ ...r, um: message_id })); };
const tap = (data, msgId, id = BUYER) => hookRaw({ update_id: uid++, callback_query: { id: 'cq' + uid, data, from: from(id, id === OWNER ? { first_name: 'Мага', username: 'maga' } : {}),
  message: { message_id: msgId, chat: { id, type: 'private' }, ...(msgs.get(msgId)?.photo ? { photo: [{ file_id: 'x' }] } : { text: '…' }) } } });
const newMsgs = (id) => sent.filter((x) => (x.method === 'sendMessage' || x.method === 'sendPhoto') && String(x.body.chat_id) === String(id));
const edits = () => sent.filter((x) => /^editMessage/.test(x.method));
const dels = () => sent.filter((x) => x.method === 'deleteMessage').map((x) => x.body.message_id);
const kb = (x) => x?.body.reply_markup?.inline_keyboard || [];
const btn = (x) => kb(x).flat();
const capOf = (x) => x?.body.media?.caption || x?.body.caption || x?.body.text || '';
const navOk = (x, back) => { const b = btn(x); const bk = b.find((y) => y.text === B.BACK); return !!bk && (!back || bk.callback_data === back); };
const homeOk = (x) => btn(x).some((y) => y.text === B.HOME && y.callback_data === 'm');
const acked = () => sent.some((x) => x.method === 'answerCallbackQuery');

console.log('\n[/start: один свежий экран]');
let r = await say('/start');
let start1 = newMsgs(BUYER).pop(); const S1 = r.mid;
ok(start1?.method === 'sendPhoto' && start1.body.photo === TG_BANNER_URL && r.mode === 'fresh' && Number(await kv.get('botscr:' + BUYER)) === S1, '/start → баннер, id экрана в KV botscr:<chat>', r);
ok(dels().includes(r.um), 'команда /start пользователя удалена');
sent = []; r = await say('/start');
ok(newMsgs(BUYER).length === 1 && dels().includes(S1) && Number(await kv.get('botscr:' + BUYER)) === r.mid, 'повторный /start: прошлое меню удалено, одно новое');
const SCR = r.mid;
sent = []; r = await say('/shop');
ok(dels().includes(SCR) && newMsgs(BUYER).length === 1 && newMsgs(BUYER)[0].method === 'sendPhoto', '/shop: прошлый экран удалён, витрина — одним сообщением');
let M = r.mid;

console.log('\n[навигация редактирует то же сообщение]');
const screens = {};
const step = async (data, name, msgId = M) => { sent = []; const rr = await tap(data, msgId); const e = edits().pop(); screens[name] = e; return { rr, e }; };
let { rr, e } = await step('m', 'menu');
ok(rr.mode === 'edit' && e.method === 'editMessageMedia' && e.body.message_id === M && e.body.media.media === TG_BANNER_URL && newMsgs(BUYER).length === 0 && acked(), '«Главное меню» → editMessageMedia того же сообщения, без новых сообщений, answerCallbackQuery', rr);
({ rr, e } = await step('sh', 'shop'));
ok(rr.mode === 'edit' && /Магазин PITLANE/.test(capOf(e)) && navOk(e, 'm'), 'магазин: то же сообщение, «← Назад» в меню');
({ rr, e } = await step('p:pitlane-gps', 'product'));
ok(e.body.media.media.endsWith('img/shop/tg/gps-hero.jpg') && navOk(e, 'sh') && homeOk(e), 'товар: фото, «← Назад» в магазин и «Главное меню»');
const chipBtn = btn(e).find((y) => /Как работает чип/.test(y.text));
ok(chipBtn?.callback_data === 'chip~p:pitlane-gps', 'кнопка чипа помнит, откуда пришли (chip~p:pitlane-gps)');
({ rr, e } = await step(chipBtn.callback_data, 'chip'));
ok(/Как работает PITLANE GPS/.test(capOf(e)) && navOk(e, 'p:pitlane-gps') && homeOk(e), '«Как работает чип» → «← Назад» возвращает к товару');
({ rr, e } = await step('p:pitlane-gps', 'product2'));
({ rr, e } = await step('pk:pitlane-gps', 'specs'));
ok(/характеристики/.test(capOf(e)) && navOk(e, 'p:pitlane-gps'), 'характеристики → назад к товару');
({ rr, e } = await step('faq', 'faq'));
ok(/Вопросы и ответы/.test(capOf(e)) && navOk(e, 'm'), 'вопросы → назад в меню');
({ rr, e } = await step('my', 'my'));
ok(/Мои заказы/.test(capOf(e)) && navOk(e, 'm') && newMsgs(BUYER).length === 0, '«Мои заказы» — тот же экран');
ok(sent.filter((x) => x.method === 'answerCallbackQuery').length === 1, 'на каждое нажатие — ровно один answerCallbackQuery');

console.log('\n[ошибки редактирования]');
failEdit = 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same';
sent = []; rr = await tap('my', M);
ok(rr.mode === 'same' && newMsgs(BUYER).length === 0 && !dels().length && acked(), '«message is not modified» → ничего не шлём и не удаляем (экран уже такой)', rr);
failEdit = "Bad Request: message can't be edited";
sent = []; rr = await tap('sh', M);
ok(rr.mode === 'replaced' && newMsgs(BUYER).length === 1 && dels().includes(M) && Number(await kv.get('botscr:' + BUYER)) === rr.mid, '«message can\'t be edited» (старое) → новое сообщение, старое удалено', rr);
M = rr.mid;
failEdit = 'Bad Request: message to edit not found';
sent = []; rr = await tap('m', M);
ok(rr.mode === 'replaced' && newMsgs(BUYER).length === 1 && dels().includes(M), '«message to edit not found» → новое + удаление');
M = rr.mid;
// текстовое сообщение (до v183) → фото-экран: тип не меняется редактированием → замена
const oldText = ++mid; msgs.set(oldText, { chat: BUYER, photo: false });
sent = []; rr = await tap('sh', oldText);
ok(rr.mode === 'replaced' && !edits().length && dels().includes(oldText), 'старый текстовый экран → фото-экран: новое сообщение, старое удалено');
M = rr.mid;

console.log('\n[предзаказ в одном экране]');
({ rr, e } = await step('p:pitlane-gps', 'p'));
({ rr, e } = await step('ob:pitlane-gps', 'qty'));
ok(rr.mode === 'edit' && /Шаг 1 из 4/.test(capOf(e)) && navOk(e, 'p:pitlane-gps') && homeOk(e), 'шаг 1 — в том же сообщении, назад к товару');
({ rr, e } = await step('oq:2', 'city'));
ok(/Шаг 2 из 4/.test(capOf(e)) && navOk(e, 'bq'), 'шаг 2 — «← Назад» к количеству');
({ rr, e } = await step('bq', 'qty_back'));
ok(/Шаг 1 из 4/.test(capOf(e)), '«← Назад» с города → количество');
await step('oq:2', 'city');
sent = []; let u = await say('К');
ok(dels().includes(u.um) && edits().pop()?.body.message_id === M && /название города/.test(capOf(edits().pop())) && newMsgs(BUYER).length === 0, 'короткий город: сообщение удалено, подсказка в том же экране');
sent = []; u = await say('Казань');
e = edits().pop();
ok(dels().includes(u.um) && e?.body.message_id === M && /Шаг 3 из 4/.test(capOf(e)) && navOk(e, 'bc') && newMsgs(BUYER).length === 0, 'город введён: сообщение удалено, шаг 3 — редактированием');
sent = []; rr = await tap('ot:phone', M);
const aux = newMsgs(BUYER).find((x) => x.body.reply_markup?.keyboard);
ok(/Шаг 3 из 4/.test(capOf(edits().pop())) && aux && aux.body.text === B.PHONE_AUX && aux.body.reply_markup.keyboard[0][0].request_contact, 'телефон: шаг в экране + одно служебное сообщение с «Отправить мой номер»');
const AUX = mid;
sent = []; u = await say('', BUYER, { contact: { phone_number: '89001234567', user_id: BUYER } });
const rm = newMsgs(BUYER).find((x) => x.body.reply_markup?.remove_keyboard);
e = edits().pop();
ok(dels().includes(u.um) && dels().includes(AUX) && rm && dels().includes(AUX + 1) && /Шаг 4 из 4/.test(capOf(e)) && e.body.message_id === M, 'контакт: сообщение, служебное и клавиатура убраны; шаг 4 — в том же экране');
sent = []; u = await say('После 18:00');
e = edits().pop();
ok(dels().includes(u.um) && /Проверьте заказ/.test(capOf(e)) && /Телефон \+79001234567/.test(capOf(e)) && navOk(e, 'bm') && homeOk(e) && newMsgs(BUYER).length === 0, 'комментарий: удалён, «Проверьте заказ» — тот же экран');
sent = []; rr = await tap('ok', M);
e = edits().pop();
ok(rr.cmd === 'cb:ok' && rr.forwarded && rr.mode === 'edit' && /Заявка принята · /.test(capOf(e)) && capOf(e).includes(rr.id) && e.body.message_id === M, 'подтверждение: тот же экран становится «Заявка принята · номер»', rr);
ok(newMsgs(BUYER).length === 0 && newMsgs(OWNER).length === 1, 'покупателю — без лишнего сообщения, Маге — заявка отдельным сообщением');
const OID = rr.id; const ownerMsg = mid;

console.log('\n[уведомления — отдельно]');
sent = []; rr = await tap('as:' + OID + ':' + ORDER_ADMIN_STATUSES[0], ownerMsg, OWNER);
const note = newMsgs(BUYER).pop();
ok(rr.notified && edits().some((x) => x.body.message_id === ownerMsg) && btn(note).map((y) => y.callback_data).join() === 'n:my,n:sup', 'статус: карточка Маги обновлена на месте, покупателю — уведомление с кнопками n:…');
const NOTE = mid;
sent = []; rr = await tap('n:my', NOTE);
ok(rr.mode === 'fresh' && !edits().length && !dels().includes(NOTE) && dels().includes(M) && newMsgs(BUYER).length === 1, '«Мои заказы» из уведомления: уведомление остаётся, прошлый экран удалён, экран — новым сообщением');
M = rr.mid;

console.log('\n[выход из шага]');
await step('ob:pitlane-gps', 'q2'); await step('oq:1', 'c2');
await step('m', 'menu2');
sent = []; u = await say('Казань');
ok(!(await kv.get('botflow:' + BUYER)) && !edits().length, 'ушли в меню посреди оформления → текст больше не считается городом');

console.log('\n[каждый экран — «← Назад»; меню — без]');
for (const [k, x] of Object.entries(screens)) if (x && k !== 'menu' && k !== 'menu2') ok(navOk(x), k + ': «← Назад»');
ok(!btn(screens.menu).some((y) => y.text === B.BACK), 'главное меню — без «Назад»');
ok(B.screenSpecs({ id: 'x', title: 'X', specs: [['a', 'b'.repeat(1100)]] }).method === 'sendMessage', 'подпись > 1024 → текстовый экран');

console.log('\n[баннер: фото-машина вместо силуэта]');
const gen = fs.readFileSync(path.join(process.cwd(), '..', 'tools/tg-banner.mjs'), 'utf8');
ok(!/coupe\.svg/.test(gen) && /img\/tg\/car-hero\.jpg/.test(gen), 'генератор баннера: без силуэта coupe.svg, фото img/tg/car-hero.jpg');
if (fs.existsSync(path.join(process.cwd(), '..', 'img/tg/car-hero.jpg'))) ok(Number(TG_BANNER_URL.match(/\?v=(\d+)/)?.[1]) >= 4, 'фото машины в репо → URL баннера v≥4 (кэш Telegram)');
else console.log('  · img/tg/car-hero.jpg ещё нет — баннер остаётся прежним (v=3)');

console.log(fails ? `\n✗ v183: ${fails}` : '\n✓ v183');
process.exit(fails ? 1 : 0);
