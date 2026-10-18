// v184: аудит безопасности — флуд-контроль бота без записей KV (биндинги RL_TGMSG / RL_TGCB), PulseHub не роняет
// операцию при сбое KV-снимка (alarm догоняет), замок двойного «Подтвердить», общий суточный потолок поддержки,
// пропавший товар посреди оформления, возврат Stars (refunded_payment), CSP на всех страницах (хэши инлайн-скриптов),
// esp-web-tools без стороннего CDN, подпись карты без innerHTML. MemKV + перехват Telegram, прод не трогается.
import rawWorker, { tgWebhookPath } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { PulseHub } from '../src/pulsehub.js';
import { roomsRefundedPayment, roomsSuccessfulPayment, ROOM_SEASON_STARS, ROOM_SEASON_DAYS } from '../src/rooms.js';
import { SUPPORT_DAY_MAX } from '../src/botshop.js';
import fs from 'fs'; import crypto from 'crypto';
const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } };
const R = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

const SECRET = 'S'.repeat(40); const OWNER = 8591275999;
function mkEnv(extra = {}) {
  const kv = new MemKV(); let mid = 700; const sent = [];
  const env = {
    PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'A'.repeat(30), TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', TG_WEBHOOK_SECRET: SECRET, FEEDBACK_CHAT_ID: String(OWNER),
    __fetch: async (u, o) => {
      const method = String(u).split('/').pop(); const body = JSON.parse(o?.body || '{}'); sent.push({ method, body });
      const res = (x) => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } });
      if (method === 'sendMessage' || method === 'sendPhoto') return res({ ok: true, result: { message_id: ++mid } });
      return res({ ok: true, result: true });
    },
    ...extra,
  };
  let uid = 1; let um = 9000;
  const hook = async (upd) => (await worker.fetch(new Request('https://api.test/tg/webhook/' + tgWebhookPath(SECRET), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET }, body: JSON.stringify({ update_id: uid++, ...upd }) }), env)).json();
  const from = (id) => ({ id, is_bot: false, first_name: 'Артём', username: 'artem_racer' });
  const say = (text, id, extra2 = {}) => hook({ message: { message_id: ++um, chat: { id, type: 'private' }, from: from(id), text, ...extra2 } });
  const tap = (data, msgId, id) => hook({ callback_query: { id: 'cq' + uid, data, from: from(id), message: { message_id: msgId, chat: { id, type: 'private' }, text: '…' } } });
  return { env, kv, sent, say, tap, hook };
}
const fakeRL = (limit) => { const n = new Map(); return { calls: 0, async limit({ key }) { this.calls++; const c = (n.get(key) || 0) + 1; n.set(key, c); return { success: c <= limit }; } }; };
const kvKeys = async (kv, prefix) => (await kv.list({ prefix })).keys.map((k) => k.name);

console.log('\n[M1: флуд-контроль бота без записей KV]');
{
  const RL_TGMSG = fakeRL(12); const RL_TGCB = fakeRL(40);
  const t = mkEnv({ RL_TGMSG, RL_TGCB }); const U = 7184001;
  let last;
  for (let i = 0; i < 14; i++) last = await t.say('привет ' + i, U);
  ok(last.cmd === 'limited' && RL_TGMSG.calls >= 14, '13-е+ сообщение за минуту → limited через биндинг RL_TGMSG', last);
  ok((await kvKeys(t.kv, 'rl:tgchat:')).length === 0, 'ни одной записи rl:tgchat:* в KV');
  const s = await t.say('/shop', 7184002); let lastCb;
  for (let i = 0; i < 42; i++) lastCb = await t.tap('sh', s.mid || 701, 7184002);
  ok(lastCb.cmd === 'cb:limited' && t.sent.some((x) => x.method === 'answerCallbackQuery'), '41-е+ нажатие за минуту → cb:limited (с ответом на нажатие) через RL_TGCB', lastCb);
  ok((await kvKeys(t.kv, 'rl:tgcb:')).length === 0, 'ни одной записи rl:tgcb:* в KV');
  const t2 = mkEnv(); let l2;
  for (let i = 0; i < 13; i++) l2 = await t2.say('x' + i, 7184003);
  ok(l2.cmd === 'limited' && (await kvKeys(t2.kv, 'rl:tgchat:')).length === 1, 'без биндинга (тесты/локально) — прежнее KV-окно');
}

console.log('\n[L4–L6: бот — двойное «Подтвердить», потолок поддержки, пропавший товар]');
{
  const t = mkEnv(); const U = 7184010;
  let r = await t.say('/shop', U); const M = r.mid;
  for (const d of ['p:pitlane-gps', 'ob:pitlane-gps', 'oq:2']) await t.tap(d, M, U);
  await t.say('Казань', U); await t.tap('ot:phone', M, U);
  await t.say('', U, { contact: { phone_number: '89001234567', user_id: U } });
  await t.say('После 18:00', U);
  const pa = t.tap('ok', M, U); await new Promise((r) => setTimeout(r, 0)); // второе нажатие, пока первое ещё оформляет заявку
  const [a, b] = await Promise.all([pa, t.tap('ok', M, U)]);
  const cmds = [a.cmd, b.cmd].sort();
  const orders = (await kvKeys(t.kv, 'order:')).filter((k) => !/idx|seq|num/.test(k));
  ok(cmds.filter((c) => c === 'cb:ok').length === 1 && cmds.some((c) => c === 'cb:ok:busy' || c === 'cb:expired'), 'двойное «Подтвердить» → одна заявка, второе нажатие — «уже оформляется»/«устарело»', cmds);
  ok(t.sent.filter((x) => x.method === 'sendMessage' && String(x.body.chat_id) === String(OWNER) && /Заказ|заявк/i.test(x.body.text || '')).length === 1, 'Маге пришла ровно одна заявка');

  const t3 = mkEnv(); const U3 = 7184011;
  const { moscowDateKey } = await import('../src/index.js').then((m) => m.default.__h || {}).catch(() => ({}));
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const s3 = await t3.say('/start', U3); await t3.tap('sup', s3.mid, U3);
  const dayKeysBefore = await kvKeys(t3.kv, 'rl:botsup:day:');
  await t3.say('Вопрос номер один про доставку', U3);
  const dk = (await kvKeys(t3.kv, 'rl:botsup:day:'))[0];
  ok(!dayKeysBefore.length && dk, 'обращение в поддержку считает общий суточный счётчик rl:botsup:day:<дата>', dk);
  const raw = await t3.kv.get(dk); let rec; try { rec = JSON.parse(raw); } catch (_) { rec = null; }
  await t3.kv.put(dk, rec && typeof rec === 'object' ? JSON.stringify({ ...rec, n: SUPPORT_DAY_MAX + 1, c: SUPPORT_DAY_MAX + 1, count: SUPPORT_DAY_MAX + 1 }) : String(SUPPORT_DAY_MAX + 1), { expirationTtl: 86400 });
  const U4 = 7184012; const s4 = await t3.say('/start', U4); await t3.tap('sup', s4.mid, U4);
  t3.sent.length = 0; const r4 = await t3.say('Вопрос от другого аккаунта', U4);
  ok(r4.cmd === 'support:limited' && !t3.sent.some((x) => x.method === 'sendMessage' && String(x.body.chat_id) === String(OWNER)), 'после общего потолка новые аккаунты не шлют Маге (support:limited)', r4);
  void day; void moscowDateKey;

  const t5 = mkEnv(); const U5 = 7184013; const s5 = await t5.say('/shop', U5);
  await t5.tap('p:pitlane-gps', s5.mid, U5); await t5.tap('ob:pitlane-gps', s5.mid, U5);
  const fk = 'botflow:' + U5; const f = JSON.parse(await t5.kv.get(fk)); f.pid = 'removed-product'; await t5.kv.put(fk, JSON.stringify(f));
  t5.sent.length = 0; const r5 = await t5.tap('oq:2', s5.mid, U5);
  ok(r5.cmd === 'cb:expired' && t5.sent.some((x) => x.method === 'answerCallbackQuery') && !(await t5.kv.get(fk)), 'товар убрали посреди оформления → «устарело», нажатие отвечено, шаг сброшен (раньше TypeError)', r5);
}

console.log('\n[L7: возврат Stars откатывает продление]');
{
  const kv = new MemKV(); const h = { kvJson: async (k, key) => { const v = await k.get(key); return v ? JSON.parse(v) : null; }, tgCall: async () => ({ ok: true }), safeName: (x, d) => x || d };
  const RID = 'r' + 'a1b2c3d4e5f6'; const PID = 'p_' + crypto.randomUUID();
  await kv.put('room:' + RID, JSON.stringify({ id: RID, name: 'Команда', paidUntil: 0, members: [PID] }));
  const pay = await roomsSuccessfulPayment({ PITLANE: kv }, { from: { id: 5 }, successful_payment: { telegram_payment_charge_id: 'ch1', currency: 'XTR', total_amount: ROOM_SEASON_STARS, invoice_payload: 'rs1:' + RID + ':' + PID } }, h);
  const until = JSON.parse(await kv.get('room:' + RID)).paidUntil;
  ok(pay.ok && until > Date.now(), 'оплата продлила сезон', pay);
  const rf = await roomsRefundedPayment({ PITLANE: kv }, { from: { id: 5 }, refunded_payment: { telegram_payment_charge_id: 'ch1', currency: 'XTR', total_amount: ROOM_SEASON_STARS, invoice_payload: 'rs1:' + RID + ':' + PID } }, h);
  const room = JSON.parse(await kv.get('room:' + RID));
  ok(rf.ok && room.paidUntil === until - ROOM_SEASON_DAYS * 86400e3 && room.payments[0].refunded, 'refunded_payment → срок сезона откатан, платёж помечен', { rf, room });
  const rf2 = await roomsRefundedPayment({ PITLANE: kv }, { refunded_payment: { telegram_payment_charge_id: 'ch1' } }, h);
  ok(rf2.duplicate && JSON.parse(await kv.get('room:' + RID)).paidUntil === room.paidUntil, 'повторный апдейт возврата — без двойного отката');
  const rf3 = await roomsRefundedPayment({ PITLANE: kv }, { refunded_payment: { telegram_payment_charge_id: 'nope' } }, h);
  ok(!rf3.ok, 'возврат неизвестного платежа ничего не трогает');
  const t = mkEnv(); const w = await t.hook({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5 }, refunded_payment: { telegram_payment_charge_id: 'zzz', currency: 'XTR', total_amount: 1, invoice_payload: 'x' } } });
  ok(w.ok && w.refunded === false, 'вебхук принимает refunded_payment (только с секретом вебхука)', w);
}

console.log('\n[M2: PulseHub — сбой KV-снимка не роняет операцию]');
{
  const kv = new MemKV(); let fail = true; const realPut = kv.put.bind(kv);
  kv.put = async (k, v, o) => { if (k === 'pulse' && fail) throw new Error('KV PUT failed: 429 Too Many Requests'); return realPut(k, v, o); };
  const m = new Map(); let alarmAt = null;
  const storage = { get: async (k) => m.get(k), put: async (k, v) => { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) m.set(a, b); else m.set(k, v); }, list: async ({ prefix = '' } = {}) => new Map([...m].filter(([k]) => k.startsWith(prefix))), delete: async (ks) => { for (const k of [].concat(ks)) m.delete(k); }, getAlarm: async () => alarmAt, setAlarm: async (t) => { alarmAt = t; } };
  const hub = new PulseHub({ storage }, { PITLANE: kv });
  const res = await hub.fetch(new Request('https://do/op', { method: 'POST', body: JSON.stringify({ t: 'add', row: { id: 'post1', at: Date.now(), text: 'x', pilotId: 'p1' } }) }));
  const j = await res.json();
  ok(res.status === 200 && j.res.ok && j.rows.length === 1, 'KV 429 на снимке → операция всё равно 200, пост в DO', { s: res.status, j });
  ok(alarmAt && alarmAt > Date.now(), 'запланирован alarm догнать снимок');
  fail = false; alarmAt = null; await hub.alarm();
  ok(JSON.parse(await kv.get('pulse'))[0]?.id === 'post1', 'alarm записал снимок ленты в KV');
}

console.log('\n[M3/L8/L9: сайт — CSP, сторонние скрипты, innerHTML]');
{
  const pages = ['index.html', 'delete-account.html', 'method.html', 'offer.html', 'privacy.html', 'terms.html', 'zamer.html'];
  for (const p of pages) {
    const s = R(p); const csp = (s.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
    const hashes = [...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => "'sha256-" + crypto.createHash('sha256').update(m[1]).digest('base64') + "'");
    ok(csp && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp) && !/\*\.workers\.dev/.test(csp) && !/'unsafe-inline'[^;]*;/.test(csp.split('script-src')[1].split(';')[0] + ';') && hashes.every((h) => csp.includes(h)),
      p + ': CSP есть, connect-src без *.workers.dev, все инлайн-скрипты по хэшу', { csp: csp.slice(0, 120), hashes });
  }
  const wf = R('hardware/pitlane-gps/web-flash/index.html');
  ok(!/<script[^>]+src="https?:/.test(wf) && /vendor\/esp-web-tools-10\.4\.0\/install-button\.js/.test(wf) && /Content-Security-Policy/.test(wf), 'web-flash: esp-web-tools свой (10.4.0), не с unpkg; CSP script-src self');
  const v = R('hardware/pitlane-gps/web-flash/vendor/esp-web-tools-10.4.0/install-button.js');
  ok(!/(from|import\()\s*['"]https?:/.test(v), 'вендорный бандл не тянет модули со сторонних хостов');
  ok(!/cap\.innerHTML/.test(R('track-sat-map.js')), 'подпись спутниковой карты — без innerHTML');
  ok(/APP_VERSION = 'v184'/.test(R('app.js')) && /pitlane-v184/.test(R('sw.js')) && /'v184'\);/.test(R('app.js')), 'версия v184 (APP_VERSION, кэш SW, класс)');
  ok(/RL_TGMSG/.test(R('worker/wrangler.toml')) && /RL_TGCB/.test(R('worker/wrangler.toml')), 'wrangler.toml: биндинги RL_TGMSG / RL_TGCB');
}

console.log(fails ? `\nv184: ${fails} FAILED` : '\nv184: all passed');
if (fails) process.exit(1);
