// v121: бот как двигатель возврата — уведомления только по реальным событиям. Всё на моках (MemKV + перехват Telegram).
// node test/v121.test.mjs
import rawWorker, { tgWebhookPath } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { dragBody } from './traces.mjs';
import * as N from '../src/notify.js';
import * as C from '../src/botcopy.js';
import fs from 'fs';
const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x ?? ''); } };
const kv = new MemKV();
const SECRET = 'S'.repeat(40);
let sent = [];
const blocked = new Set();
const env = {
  PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'A'.repeat(30), TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', TG_WEBHOOK_SECRET: SECRET,
  __fetch: async (u, o) => {
    const method = String(u).split('/').pop(); const body = JSON.parse(o?.body || '{}');
    if (method === 'sendMessage' && blocked.has(body.chat_id)) return new Response(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }));
    sent.push({ method, body }); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  },
};
let ipSeq = 1;
async function call(method, path, { body, token } = {}) {
  const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.77.' + (ipSeq % 200) + '.' + (ipSeq++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: res.status, data: d };
}
const hook = async (chat, text) => (await worker.fetch(new Request('https://api.test/tg/webhook/' + tgWebhookPath(SECRET), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET }, body: JSON.stringify({ update_id: ipSeq++, message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat }, text } }) }), env)).json();
let phoneSeq = 0;
async function login(nick, tg) {
  const phone = '7900770' + String(++phoneSeq).padStart(4, '0');
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  if (tg) {
    const rec = JSON.parse(await kv.get('pilot:' + v.data.pilotId)); rec.providers.push({ type: 'tg', id: String(tg) }); await kv.put('pilot:' + rec.id, JSON.stringify(rec));
    await kv.put('auth:tg:' + tg, rec.id);
  }
  return { token: v.data.token, id: v.data.pilotId, tg, nick };
}
const msgsTo = (chat) => sent.filter((x) => x.method === 'sendMessage' && x.body.chat_id === chat);
const resetCoalesce = async () => { for (const k of [...kv.m.keys()]) if (k.startsWith('nlast:')) await kv.delete(k); };
let seed = 10;
const drag = (P, t) => call('POST', '/tops/drag/0-100', { token: P.token, body: { ...dragBody('0-100', t, { name: P.nick }, { seed: seed++ }), dev: 'dev-' + P.nick } });

const A = await login('Мага', 8001); const B = await login('Артём', 8002); const Cc = await login('Лиза', 8003);
const D = await login('Костя', 8004); // вошёл через Telegram, но боту не писал
const E = await login('БезТГ', null); // без Telegram

console.log('\n[кто вообще может получать]');
let r = await drag(B, 4.5); ok(r.status === 200 && r.data.stored, 'B 4.50 в топ', r.data);
r = await drag(Cc, 4.8); ok(r.status === 200, 'C 4.80');
r = await drag(D, 4.6); ok(r.status === 200, 'D 4.60');
ok(sent.filter((x) => x.method === 'sendMessage').length === 0, 'никто не писал боту → ни одного сообщения');
for (const P of [A, B, Cc]) await hook(P.tg, '/start');
ok(kv.m.get('tgstart:8001')?.v === '1' && !kv.m.has('tgstart:8004'), 'tgstart: только у тех, кто написал боту');
sent = [];

console.log('\n[«тебя обогнали в топе»]');
r = await drag(A, 4.2); ok(r.status === 200 && r.data.stored, 'A 4.20 → #1');
const toB = msgsTo(8002); const toC = msgsTo(8003);
ok(toB.length === 1 && /<b>Тебя обогнали в топе<\/b>/.test(toB[0].body.text) && /Топ 0–100 · внешний GPS \(A\/B\)/.test(toB[0].body.text) && toB[0].body.text.includes('<code>#2</code>') && toB[0].body.text.includes('<code>4.20 с</code>'), 'B (#1 → #2) получил: доска, время, новое место', toB[0]?.body.text);
ok(toC.length === 1 && toC[0].body.text.includes('<code>#4</code>'), 'C (#3 → #4) получил');
ok(msgsTo(8004).length === 0, 'D сдвинут, но боту не писал → тишина');
ok(msgsTo(8001).length === 0, 'автору зачёта — ничего');
ok(toB[0].body.reply_markup.inline_keyboard[0][0].web_app.url.includes('view=tops'), 'кнопка «Открыть топ»');
sent = []; await resetCoalesce();
r = await drag(A, 4.3);
ok(sent.length === 0, 'A проехал медленнее (не улучшился) → никого не обогнал, тишина');
r = await drag(B, 4.4);
ok(sent.length === 0, 'B улучшился, но остался ниже A → обгонов нет');

console.log('\n[склейка: второе событие < 15 мин → сводка по cron]');
sent = [];
r = await drag(Cc, 4.1); // C: #4 → #1, обгоняет A, B, D
ok(msgsTo(8001).length === 1 && msgsTo(8002).length === 1, 'A и B: первое событие — сразу');
sent = [];
r = await drag(E, 4.0); // E (без TG) обгоняет всех: A, B, C — у A и B только что было сообщение
ok(msgsTo(8001).length === 0 && msgsTo(8002).length === 0 && kv.m.has('nq:' + A.id) && kv.m.has('nq:' + B.id), 'A и B: в копилку, не пачкой');
ok(msgsTo(8003).length === 1, 'C: первое событие — сразу');
await rawWorker.scheduled({}, env, null);
ok(msgsTo(8001).length === 0, 'cron раньше 15 мин — не шлёт');
await resetCoalesce();
await rawWorker.scheduled({}, env, null);
const dg = msgsTo(8001);
ok(dg.length === 1 && /пока тебя не было/.test(dg[0].body.text) && /БезТГ обогнал\(а\) тебя/.test(dg[0].body.text) && !kv.m.has('nq:' + A.id), 'через 15 мин — одна сводка, копилка очищена');

console.log('\n[не больше N в сутки]');
sent = []; await resetCoalesce();
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
await kv.put('ncnt:' + B.id + ':' + day, String(N.NOTIFY_DAILY_MAX));
ok(await N.notifyEvent(env, B.id, { type: 'overtake', key: 'cap-test', msg: { text: 'x', keyboard: [] } }, NOTIFY_H()) === 'cap' && msgsTo(8002).length === 0, `B уже получил ${N.NOTIFY_DAILY_MAX} за сутки → лимит, тишина`);
ok(N.NOTIFY_DAILY_MAX === 5, 'лимит 5 в сутки на человека');
ok(await N.notifyEvent(env, A.id, { type: 'overtake', key: 'ot:same', msg: { text: 'x', keyboard: [] } }, NOTIFY_H()) === 'sent', 'событие отправлено');
await resetCoalesce();
ok(await N.notifyEvent(env, A.id, { type: 'overtake', key: 'ot:same', msg: { text: 'x', keyboard: [] } }, NOTIFY_H()) === 'dup', 'то же событие повторно — не шлём (dedupe)');

console.log('\n[настройки: профиль и /stop_notify]');
r = await call('GET', '/me/notify', { token: Cc.token });
ok(r.status === 200 && r.data.linked && r.data.started && r.data.prefs.overtake && r.data.dailyMax === 5 && r.data.types.join() === N.NOTIFY_TYPES.join(), 'GET /me/notify: привязан, писал боту, всё включено', r.data);
r = await call('PUT', '/me/notify', { token: Cc.token, body: { overtake: false } });
ok(r.status === 200 && r.data.prefs.overtake === false && r.data.prefs.duel === true, 'PUT: обгоны выкл, остальное вкл');
ok((await call('GET', '/me/notify', {})).status === 401, 'без входа — 401');
ok((await call('PUT', '/me/notify', { token: Cc.token, body: [1] })).status === 400, 'мусор в теле → 400');
sent = []; await resetCoalesce();
ok(await N.notifyEvent(env, Cc.id, { type: 'overtake', key: 'p1', msg: { text: 'x' } }, NOTIFY_H()) === 'pref_off' && msgsTo(8003).length === 0, 'тип выключен в профиле → не шлём');
let h = await hook(8002, '/stop_notify');
ok(h.cmd === 'stop_notify' && kv.m.get('tgstart:8002').v === 'stop' && /Уведомления выключены/.test(msgsTo(8002).pop()?.body.text || ''), '/stop_notify → выключено, ответ бота');
sent = [];
ok(await N.notifyEvent(env, B.id, { type: 'duel', key: 's1', msg: { text: 'x' } }, NOTIFY_H()) === 'stopped' && msgsTo(8002).length === 0, 'после /stop_notify — ничего');
await hook(8002, '/start');
ok(kv.m.get('tgstart:8002').v === 'stop', '/start не отменяет /stop_notify');
h = await hook(8002, '/start_notify');
ok(h.cmd === 'start_notify' && kv.m.get('tgstart:8002').v === '1', '/start_notify — снова включено');
await call('PUT', '/me/notify', { token: B.token, body: { stop: true } });
ok(await N.notifyEvent(env, B.id, { type: 'duel', key: 's2', msg: { text: 'x' } }, NOTIFY_H()) === 'stopped', 'общий выключатель в профиле');
await call('PUT', '/me/notify', { token: B.token, body: {} });

console.log('\n[«тебя вызвали»: дуэль с адресатом]');
sent = []; await resetCoalesce(); await kv.delete('ncnt:' + B.id + ':' + day);
r = await call('POST', '/duel', { token: A.token, body: { type: 'drag', createdBy: 'Мага', to: B.id, days: 3 } });
ok(r.status === 200 && r.data.to?.id === B.id && r.data.to?.name === 'Артём', 'дуэль создана с адресатом', r.data);
const duelId = r.data.id;
const ch = msgsTo(8002);
ok(ch.length === 1 && /<b>Тебя вызвали<\/b>/.test(ch[0].body.text) && ch[0].body.text.includes('Мага') && ch[0].body.text.includes('<code>3 дн.</code>') && ch[0].body.reply_markup.inline_keyboard[0][0].web_app.url.endsWith('startapp=duel_' + duelId), 'B: «Тебя вызвали» + кнопка дуэли');
ok(JSON.parse(kv.m.get('duelidx:' + B.id).v).includes(duelId), 'дуэль видна у адресата во «Входящих»');
ok((await call('POST', '/duel', { token: A.token, body: { type: 'drag', createdBy: 'Мага', to: A.id } })).status === 400, 'вызвать себя — 400');
ok((await call('POST', '/duel', { token: A.token, body: { type: 'drag', createdBy: 'Мага', to: 'p_00000000-0000-4000-8000-000000000000' } })).status === 404, 'несуществующий пилот — 404');
r = await call('POST', `/duel/${duelId}/run`, { token: Cc.token, body: { ...dragBody('0-100', 4.6, {}, { seed: 90 }), nick: 'Лиза' } });
ok(r.status === 403 && r.data.code === 'addressed', 'чужой не может занять слот адресной дуэли');
r = await call('POST', '/duel', { token: A.token, body: { type: 'drag', createdBy: 'Мага' } });
ok(r.status === 200 && !r.data.to, 'обычная дуэль по ссылке — без адресата, никого не уведомляем');

console.log('\n[«ответили на дуэль» и итог — через те же правила]');
sent = []; await resetCoalesce();
r = await call('POST', `/duel/${duelId}/run`, { token: B.token, body: { ...dragBody('0-100', 4.4, {}, { seed: 91 }), nick: 'Артём' } });
ok(r.status === 200, 'B ответил', r.data);
ok(msgsTo(8001).length === 1 && /<b>Ответили на твою дуэль<\/b>/.test(msgsTo(8001)[0].body.text), 'A: «Ответили на твою дуэль»');

console.log('\n[«дуэль заканчивается» — только дуэли v121, один раз]');
sent = []; await resetCoalesce();
const e = kv.m.get('nend:' + duelId);
ok(e && e.meta?.e > Date.now(), 'индекс конца дуэли записан при создании');
e.meta.e = Date.now() + 2 * 3600 * 1000; // «через 2 часа»
await kv.put('duel:dold000001', JSON.stringify({ id: 'dold000001', type: 'drag', status: 'open', createdAt: Date.now() - 6.9 * 86400e3, expiresAt: Date.now() + 3600e3, createdBy: { id: B.id, name: 'Артём' }, challenger: null, creatorRun: null }));
await rawWorker.scheduled({}, env, null);
const en = msgsTo(8001);
ok(en.length === 1 && /<b>Дуэль заканчивается<\/b>/.test(en[0].body.text) && en[0].body.text.includes('<code>2 ч</code>') && en[0].body.text.includes('Артём'), 'A (ещё не ехал): «Дуэль заканчивается», ~2 ч', en[0]?.body.text);
ok(msgsTo(8002).length === 0, 'B уже проехал → ему не надо; старая дуэль (до v121) — ничего задним числом');
sent = []; await rawWorker.scheduled({}, env, null);
ok(msgsTo(8001).length === 0 && !kv.m.has('nend:' + duelId), 'повторный cron — тишина (одно напоминание)');
sent = []; await resetCoalesce();
for (const k of [...kv.m.keys()]) if (k.startsWith('ncnt:' + A.id)) await kv.delete(k); // новые сутки: лимит 5/сутки у A уже выбран выше
await kv.put('duel:dto0000001', JSON.stringify({ id: 'dto0000001', type: 'drag', status: 'open', expiresAt: Date.now() + 3 * 3600e3, createdBy: { id: B.id, name: 'Артём' }, to: { id: A.id, name: 'Мага' }, challenger: null, creatorRun: { t: 4.4, pilotId: B.id } }));
await N.indexDuelEnd(kv, { id: 'dto0000001', expiresAt: Date.now() + 3 * 3600e3 });
await rawWorker.scheduled({}, env, null);
const en2 = msgsTo(8001);
ok(en2.length === 1 && /Дуэль заканчивается/.test(en2[0].body.text) && en2[0].body.text.includes('Артём'), 'адресный вызов: кому бросили и кто ещё не ответил — тоже напоминание', en2[0]?.body.text);
ok(msgsTo(8002).length === 0, 'автор вызова уже проехал → ему нет');

console.log('\n[заблокировал бота → забываем]');
blocked.add(8003); await resetCoalesce();
await call('PUT', '/me/notify', { token: Cc.token, body: {} });
ok(await N.notifyEvent(env, Cc.id, { type: 'duel', key: 'blk', msg: { text: 'x' } }, NOTIFY_H()) === 'send_failed' && !kv.m.has('tgstart:8003'), '403 от Telegram → tgstart удалён');

console.log('\n[удаление аккаунта]');
r = await call('DELETE', '/account', { token: A.token });
ok(r.status === 200 && !kv.m.has('npref:' + A.id) && ![...kv.m.keys()].some((k) => k.startsWith('ncnt:' + A.id) || k.startsWith('ndup:' + A.id)) && !kv.m.has('tgstart:8001'), 'ключи уведомлений удалены');

console.log('\n[без рассылок и маркетинга]');
const src = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../src/notify.js', import.meta.url), 'utf8');
ok(!/broadcast|mailing|рассылк[аи]\s*\(/i.test(src.replace(/Никаких рассылок/g, '')), 'нет эндпоинта/функции рассылки');
ok((src.match(/notifyEvent\(env, /g) || []).length >= 3 && !/kvListAll\([^)]*'pilot:'[^)]*\)[\s\S]{0,200}notifyEvent/.test(src), 'каждая отправка — по событию конкретного человека, не по списку всех');
ok(C.BOT_COMMANDS.some((c) => c.command === 'stop_notify'), 'команда /stop_notify в меню бота');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
ok(/id="accNotify"/.test(html) && /api\.getNotify\(\)/.test(app) && /api\.putNotify\(/.test(app), 'профиль: переключатели уведомлений');
ok(/to: _duelTo\.id/.test(app) && /Вызвать на дуэль/.test(app), 'вызов пилота из его профиля');

function NOTIFY_H() {
  return {
    kvJson: async (k2, key) => { const v = await k2.get(key); try { return v ? JSON.parse(v) : null; } catch { return null; } },
    tgCall: async (en2, method, payload) => { const res = await en2.__fetch('https://api.telegram.org/botX/' + method, { body: JSON.stringify(payload) }); return res.json(); },
    tgChatOf: async (en2, pid) => { const rec = JSON.parse((await kv.get('pilot:' + pid)) || 'null'); const id = (rec?.providers || []).find((p) => p.type === 'tg')?.id; return id ? Number(id) : null; },
    telegramConfig: () => ({ enabled: true }),
    moscowDateKey: (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)),
    kvListAll: async (k2, prefix) => (await k2.list({ prefix })).keys,
    safeName: (s) => String(s || 'пилот'),
  };
}
console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v121 all passed');
process.exit(fails ? 1 : 0);
