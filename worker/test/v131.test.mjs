// v131: подписка на пилота / команду + уведомление в бот об улучшении. Всё на моках (MemKV + перехват Telegram).
// node test/v131.test.mjs
import rawWorker, { tgWebhookPath } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { dragBody, lapBody } from './traces.mjs';
import * as F from '../src/follow.js';
import * as N from '../src/notify.js';
import fs from 'fs';
const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const kv = new MemKV();
const SECRET = 'S'.repeat(40);
let sent = [];
const env = {
  PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'A'.repeat(30), TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', TG_WEBHOOK_SECRET: SECRET,
  __fetch: async (u, o) => { sent.push({ method: String(u).split('/').pop(), body: JSON.parse(o?.body || '{}') }); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })); },
};
let ipSeq = 1;
async function call(method, path, { body, token } = {}) {
  const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.131.' + (ipSeq % 200) + '.' + (ipSeq++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: res.status, data: d };
}
const hook = async (chat, text) => (await worker.fetch(new Request('https://api.test/tg/webhook/' + tgWebhookPath(SECRET), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET }, body: JSON.stringify({ update_id: ipSeq++, message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat }, text } }) }), env)).json();
let phoneSeq = 0;
async function login(nick, tg) {
  const phone = '7900131' + String(++phoneSeq).padStart(4, '0');
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
let seed = 1310;
const drag = (P, t) => call('POST', '/tops/drag/0-100', { token: P.token, body: { ...dragBody('0-100', t, { name: P.nick }, { seed: seed++ }), dev: 'dev-' + P.nick } });
const lap = (P, t) => call('POST', '/tops/lap/sochi', { token: P.token, body: { ...lapBody(t, { weather: 'dry', name: P.nick }, { seed: seed++ }), dev: 'dev-' + P.nick } });

const A = await login('Мага', 9101); const B = await login('Артём', 9102); const L = await login('Лиза', 9103);
const D = await login('Костя', 9104); // подписан, но боту не писал
for (const P of [A, B, L, D]) await call('PUT', '/me/car', { token: P.token, body: { model: 'BMW M2', carId: 'g87-m2', tyre: 'street' } });
for (const P of [A, B, L]) await hook(P.tg, '/start');

console.log('\n[API подписок]');
ok((await call('GET', '/me/follows')).status === 401, 'GET /me/follows без входа — 401');
ok((await call('POST', '/follow', { body: { kind: 'pilot', id: B.id } })).status === 401, 'POST /follow без входа — 401');
let r = await call('POST', '/follow', { token: A.token, body: { kind: 'pilot', id: A.id } });
ok(r.status === 400 && r.data.code === 'self', 'на себя нельзя', r.data);
r = await call('POST', '/follow', { token: A.token, body: { kind: 'pilot', id: 'p_00000000-0000-4000-8000-000000000000' } });
ok(r.status === 404, 'несуществующий пилот — 404', r.data);
r = await call('POST', '/follow', { token: A.token, body: { kind: 'team', id: 'nope-team' } });
ok(r.status === 404, 'несуществующая команда — 404', r.data);
ok((await call('POST', '/follow', { token: A.token, body: { kind: 'car', id: B.id } })).status === 400, 'неизвестный вид — 400');
r = await call('POST', '/follow', { token: A.token, body: { kind: 'pilot', id: B.id } });
ok(r.status === 200 && r.data.following === true && r.data.count === 1, 'A следит за B', r.data);
r = await call('POST', '/follow', { token: A.token, body: { kind: 'pilot', id: B.id } });
ok(r.status === 200 && r.data.count === 1, 'повторно — без дубля');
r = await call('POST', '/follow', { token: D.token, body: { kind: 'pilot', id: B.id } });
ok(r.status === 200, 'D следит за B (но боту не писал)');
r = await call('GET', '/me/follows', { token: A.token });
ok(r.status === 200 && r.data.items.length === 1 && r.data.items[0].kind === 'pilot' && r.data.items[0].id === B.id && r.data.items[0].name === 'Артём' && r.data.max === F.FOLLOW_MAX, 'список подписок: имя, вид, лимит', r.data);
ok(JSON.stringify(r.data).indexOf('7900131') < 0, 'в ответе нет телефонов');
ok(JSON.parse(kv.m.get('fby:p:' + B.id).v).sort().join() === [A.id, D.id].sort().join(), 'обратный индекс подписчиков B');

console.log('\n[уведомление об улучшении — только зачтённые улучшения]');
sent = [];
r = await drag(B, 4.6); ok(r.status === 200 && r.data.stored, 'B первый 0–100 = 4.60', r.data);
ok(msgsTo(9101).length === 0, 'первый результат — не «улучшение», тишина');
await resetCoalesce(); sent = [];
r = await drag(B, 4.8); ok(r.status === 200, 'B медленнее (4.80)');
ok(msgsTo(9101).length === 0, 'не улучшился — тишина');
await resetCoalesce(); sent = [];
r = await drag(B, 4.4); ok(r.status === 200 && r.data.stored, 'B улучшил: 4.40');
let toA = msgsTo(9101);
ok(toA.length === 1 && /<b>Артём улучшил\(а\) 0–100<\/b>/.test(toA[0].body.text) && toA[0].body.text.includes('<code>4.40 с</code>') && /<code>−0\.\d\d<\/code>/.test(toA[0].body.text), 'A получил: кто, что, время, дельта', toA[0]?.body.text);
ok(toA[0]?.body.reply_markup.inline_keyboard[0][0].web_app.url.includes('view=tops'), 'кнопка «Открыть топ»');
ok(msgsTo(9104).length === 0, 'D подписан, но боту не писал → тишина');
ok(msgsTo(9102).length === 0, 'самому B — ничего');
await resetCoalesce(); sent = [];
r = await drag(L, 4.0); ok(r.status === 200, 'L (не в подписках) проехал');
ok(msgsTo(9101).length === 0, 'на L не подписан — тишина');

console.log('\n[круг: «Артём улучшил круг на …: 1:42.3 (−0.8)»]');
await resetCoalesce(); sent = [];
r = await lap(B, '1:43.100'); ok(r.status === 200, 'B первый круг 1:43.100', r.data);
ok(msgsTo(9101).length === 0, 'первый круг — тишина');
await resetCoalesce(); sent = [];
r = await lap(B, '1:42.300'); ok(r.status === 200, 'B круг 1:42.300', r.data);
toA = msgsTo(9101);
ok(toA.length === 1 && /<b>Артём улучшил\(а\) круг<\/b>/.test(toA[0].body.text) && /Сочи/.test(toA[0].body.text) && toA[0].body.text.includes('<code>1:42.3</code>') && toA[0].body.text.includes('<code>−0.8</code>'), 'A получил: круг, трасса, 1:42.3, −0.8', toA[0]?.body.text);

console.log('\n[переключатель и лимиты v121]');
await resetCoalesce(); sent = [];
r = await call('PUT', '/me/notify', { token: A.token, body: { follow: false } });
ok(r.status === 200 && r.data.prefs.follow === false, 'A выключил «Подписки: улучшения»', r.data);
r = await drag(B, 4.3); ok(r.status === 200 && r.data.stored, 'B снова улучшил');
ok(msgsTo(9101).length === 0, 'выключено → тишина');
await call('PUT', '/me/notify', { token: A.token, body: { follow: true } });
r = await call('GET', '/me/notify', { token: A.token });
ok(r.data.types.includes('follow') && r.data.labels.follow === 'Подписки: улучшения', 'тип «follow» в настройках профиля');
await resetCoalesce(); sent = [];
await kv.put('nlast:' + A.id, String(Date.now()));
r = await drag(B, 4.25); ok(r.status === 200, 'B улучшил ещё, но A недавно получил сообщение');
ok(msgsTo(9101).length === 0 && Array.isArray(JSON.parse(kv.m.get('nq:' + A.id)?.v || '[]')) && JSON.parse(kv.m.get('nq:' + A.id).v).some((x) => x.type === 'follow'), 'склейка: ушло в сводку');
const dupKey = [...kv.m.keys()].find((k) => k.startsWith('ndup:' + A.id + ':fl:'));
ok(!!dupKey, 'антидубль ключ события записан');

console.log('\n[команда]');
r = await call('POST', '/crew', { token: L.token, body: { name: 'Night Shift', trackId: 'sochi', nick: 'Лиза' } });
ok(r.status === 200 && r.data.id, 'L создала команду', r.data);
const crewId = r.data.id;
r = await call('POST', '/follow', { token: A.token, body: { kind: 'team', id: crewId } });
ok(r.status === 200 && r.data.count === 2, 'A следит за командой', r.data);
r = await call('GET', '/me/follows', { token: A.token });
ok(r.data.items.some((x) => x.kind === 'team' && x.id === crewId && x.name === 'Night Shift'), 'команда в списке с названием');
for (const k of [...kv.m.keys()]) if (k.startsWith('nq:') || k.startsWith('ncnt:')) await kv.delete(k);
await resetCoalesce(); sent = [];
r = await drag(L, 3.9); ok(r.status === 200 && r.data.stored, 'L (участник команды) улучшила 0–100');
toA = msgsTo(9101);
ok(toA.length === 1 && /Лиза улучшил\(а\) 0–100/.test(toA[0].body.text), 'подписчик команды получил', toA[0]?.body.text);

console.log('\n[отписка, лимит подписок]');
r = await call('POST', '/follow', { token: A.token, body: { kind: 'pilot', id: B.id, on: false } });
ok(r.status === 200 && r.data.following === false && r.data.count === 1, 'A отписался от B');
ok(!JSON.parse(kv.m.get('fby:p:' + B.id).v).includes(A.id), 'A убран из подписчиков B');
await resetCoalesce(); sent = [];
r = await drag(B, 4.1); ok(r.status === 200 && r.data.stored, 'B улучшил');
ok(msgsTo(9101).length === 0, 'после отписки — тишина');
const many = []; for (let i = 0; i < F.FOLLOW_MAX; i++) many.push({ kind: 'pilot', id: 'p_' + String(i).padStart(8, '0') + '-0000-4000-8000-000000000000', name: 'x' });
await kv.put('fol:' + D.id, JSON.stringify(many));
r = await call('POST', '/follow', { token: D.token, body: { kind: 'pilot', id: L.id } });
ok(r.status === 409 && r.data.code === 'follow_limit', 'лимит подписок → 409 follow_limit', r.data);
let rl = 0; for (let i = 0; i < 62; i++) { const q = await call('POST', '/follow', { token: B.token, body: { kind: 'pilot', id: L.id, on: i % 2 === 0 } }); if (q.status === 429) rl++; }
ok(rl > 0, 'частые нажатия — 429');

console.log('\n[чистые функции]');
const tm = (x) => x.t;
ok(F.improvedBy([{ pilotId: 'a', t: 5 }], [{ pilotId: 'a', t: 4.5 }], 'a', tm)?.now === 4.5, 'improvedBy: лучше прежнего');
ok(F.improvedBy([], [{ pilotId: 'a', t: 4.5 }], 'a', tm) === null, 'improvedBy: первый результат — null');
ok(F.improvedBy([{ pilotId: 'a', t: 4 }], [{ pilotId: 'a', t: 4 }], 'a', tm) === null, 'improvedBy: тот же — null');
const m = F.msgImproved({ name: '<b>x</b>', what: { kind: 'круг', title: 'Сочи' }, t: '1:42.3', delta: '0.8' });
ok(!m.text.includes('<b>x</b>') && m.text.includes('&lt;b&gt;'), 'имя экранируется в HTML бота');
ok(N.NOTIFY_TYPES.includes('follow'), 'notify: тип follow');

console.log('\n[удаление аккаунта]');
r = await call('POST', '/follow', { token: B.token, body: { kind: 'pilot', id: L.id } });
const del = await call('DELETE', '/account', { token: A.token, body: { confirm: 'DELETE' } });
ok(del.status === 200, 'A удалил аккаунт', del.data);
ok(!kv.m.has('fol:' + A.id), 'подписки A удалены');
ok(!kv.m.has('fby:t:' + crewId) || !JSON.parse(kv.m.get('fby:t:' + crewId).v).includes(A.id), 'A убран из подписчиков команды');

console.log('\n[клиент]');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
const ver = Number((app.match(/APP_VERSION = 'v(\d+)'/) || [])[1]);
ok(ver >= 131 && Number((sw.match(/pitlane-v(\d+)/) || [])[1]) === ver, 'APP_VERSION / SW ≥ v131 и совпадают');
ok(/appendFollowButton\(body, pid, res\)/.test(app) && /followButton\('team', crew\.id/.test(app), 'кнопка «Следить» в профиле пилота и в команде');
ok(html.includes('id="accFollows"') && html.includes('id="accFollowList"') && html.includes('id="crewFollowRow"'), 'разметка: карточка «Подписки», место кнопки в команде');
const fb = app.slice(app.indexOf('function followButton'), app.indexOf('function renderFollowNote'));
ok(fb.length > 100 && !/innerHTML/.test(fb), 'подписки: только textContent');
ok(/'Ты следишь' : 'Следить'/.test(app), 'состояние кнопки');

console.log(fails ? `\n✗ v131: ${fails} fail(s)` : '\n✓ v131: all ok');
process.exit(fails ? 1 : 0);
