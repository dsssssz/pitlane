/**
 * v121: бот как двигатель возврата — уведомления ТОЛЬКО по реальным событиям:
 *   challenge — «тебя вызвали» (дуэль с адресатом),
 *   overtake  — «тебя обогнали в топе» (чей-то зачёт сдвинул тебя вниз в первой десятке),
 *   duel      — «ответили на твою дуэль» / итог дуэли,
 *   ending    — «дуэль заканчивается», а ты ещё не проехал,
 *   team      — новый рекорд команды (старое уведомление комнат, теперь через те же правила).
 * Кому: только тем, кто вошёл через Telegram (провайдер tg у аккаунта) И сам писал боту (/start или любое сообщение →
 * tgstart:<chat> = '1'). /stop_notify → 'stop' (ничего не шлём), /start_notify — снова '1'. Блокировка бота (403) → ключ удаляется.
 * Антиспам: не больше NOTIFY_DAILY_MAX сообщений в сутки (МСК) на человека; если последнее было < COALESCE_MS назад —
 * событие копится и уходит одной сводкой (cron каждые 15 мин); дубликаты одного события — не повторяются.
 * Никаких рассылок: каждая отправка — ответ на конкретное событие конкретного человека. Задним числом ничего не шлём:
 * индекс «дуэль заканчивается» пишется только для дуэлей, созданных/принятых после v121.
 */
import { esc, code, RULE, webAppBtn, trackTitle } from './botcopy.js';

export const NOTIFY_TYPES = ['challenge', 'overtake', 'duel', 'ending', 'team'];
export const NOTIFY_LABELS = { challenge: 'Тебя вызвали', overtake: 'Тебя обогнали в топе', duel: 'Ответ и итог дуэли', ending: 'Дуэль заканчивается', team: 'Рекорд команды' };
export const NOTIFY_DAILY_MAX = 5;
export const COALESCE_MS = 15 * 60 * 1000;
export const OVERTAKE_TOP = 10;
export const ENDING_WINDOW_MS = 12 * 3600 * 1000;
const DAY = 86400;

/* ——— тексты (чистые функции) ——— */
export function msgChallenge({ duelId, fromName, type, disc, trackId, days, cls }) {
  const what = type === 'lap' ? 'круг · ' + trackTitle(trackId) : (disc || '0–100');
  return {
    text: '<b>Тебя вызвали</b>\n' + esc(fromName) + ' зовёт на дуэль: ' + esc(what) + '\n' + RULE + '\n' +
      'Срок  ' + code((days || 7) + ' дн.') + (cls === 'c' ? '\nКласс: телефон (C)' : cls === 'ab' ? '\nКласс: внешний GPS (A/B)' : ''),
    keyboard: [[webAppBtn('Открыть дуэль', { startapp: 'duel_' + duelId })]],
    line: esc(fromName) + ' вызвал(а) тебя на дуэль',
  };
}
export function msgOvertake({ boardTitle, rivalName, rivalT, myRank, open }) {
  return {
    text: '<b>Тебя обогнали в топе</b>\n' + esc(boardTitle) + '\n' + RULE + '\n' +
      esc(rivalName) + '  ' + code(rivalT) + '\n' + 'Ты теперь  ' + code('#' + myRank),
    keyboard: [[webAppBtn('Открыть топ', open || { view: 'tops', skipIntro: '1' })]],
    line: esc(rivalName) + ' обогнал(а) тебя: ' + esc(boardTitle) + ', ты #' + myRank,
  };
}
export function msgEnding({ duelId, rivalName, hoursLeft, trackId }) {
  return {
    text: '<b>Дуэль заканчивается</b>\n' + (rivalName ? 'Соперник: ' + esc(rivalName) + (trackId ? ' · ' + esc(trackTitle(trackId)) : '') + '\n' : '') + RULE + '\n' +
      'Осталось около  ' + code(hoursLeft + ' ч') + '\nТвоей попытки ещё нет.',
    keyboard: [[webAppBtn('Открыть дуэль', { startapp: 'duel_' + duelId })]],
    line: 'дуэль заканчивается через ~' + hoursLeft + ' ч, твоей попытки нет',
  };
}
export function msgDigest(lines) {
  const show = lines.slice(0, 6);
  return {
    text: '<b>PITLANE · пока тебя не было</b>\n' + RULE + '\n' + show.map((l) => '• ' + l).join('\n') + (lines.length > show.length ? '\n…и ещё ' + (lines.length - show.length) : ''),
    keyboard: [[webAppBtn('Открыть PITLANE', {})]],
  };
}
export const NOTIFY_BOT_TEXT = {
  stopped: '<b>Уведомления выключены</b>\nБольше ничего не пришлю сам. Включить снова: /start_notify или в профиле PITLANE.',
  started: '<b>Уведомления включены</b>\nПишу только по делу: вызов, обгон в топе, ответ на дуэль, конец дуэли. Не больше ' + NOTIFY_DAILY_MAX + ' в сутки. Выключить: /stop_notify.',
};

/* ——— KV ——— */
const K = {
  pref: (pid) => 'npref:' + pid,
  start: (chat) => 'tgstart:' + chat,
  cnt: (pid, day) => 'ncnt:' + pid + ':' + day,
  last: (pid) => 'nlast:' + pid,
  queue: (pid) => 'nq:' + pid,
  dup: (pid, key) => 'ndup:' + pid + ':' + key,
  end: (duelId) => 'nend:' + duelId,
};
export function cleanPrefs(p) {
  const o = {};
  for (const t of NOTIFY_TYPES) o[t] = !(p && p[t] === false);
  o.stop = !!(p && p.stop === true);
  return o;
}
export async function loadPrefs(kv, pid, h) { return cleanPrefs(await h.kvJson(kv, K.pref(pid))); }
export async function savePrefs(kv, pid, body) {
  const p = cleanPrefs(body);
  await kv.put(K.pref(pid), JSON.stringify({ ...p, at: Date.now() }));
  return p;
}
/** Бот: любое личное сообщение от человека = «запустил бота». stop не перетираем. */
export async function markStarted(kv, chatId) {
  if (!Number.isSafeInteger(chatId)) return;
  const cur = await kv.get(K.start(chatId));
  if (cur) return;
  await kv.put(K.start(chatId), '1');
}
export async function setChatStop(kv, chatId, stop) {
  if (!Number.isSafeInteger(chatId)) return;
  await kv.put(K.start(chatId), stop ? 'stop' : '1');
}
export async function chatState(kv, chatId) {
  if (!chatId) return null;
  return await kv.get(K.start(chatId));
}

/** → { chat } когда можно, иначе { no: причина }. */
export async function gate(env, pid, type, h) {
  if (!NOTIFY_TYPES.includes(type)) return { no: 'type' };
  if (!h.telegramConfig(env).enabled) return { no: 'tg_off' };
  const chat = await h.tgChatOf(env, pid);
  if (!chat) return { no: 'not_linked' };
  const st = await chatState(env.PITLANE, chat);
  if (st !== '1') return { no: st === 'stop' ? 'stopped' : 'not_started' };
  const p = await loadPrefs(env.PITLANE, pid, h);
  if (p.stop) return { no: 'stopped' };
  if (!p[type]) return { no: 'pref_off' };
  return { chat };
}
async function bumpCount(kv, pid, h, now) {
  const k = K.cnt(pid, h.moscowDateKey(now));
  const n = Number((await kv.get(k)) || 0);
  if (n >= NOTIFY_DAILY_MAX) return false;
  await kv.put(k, String(n + 1), { expirationTtl: 2 * DAY });
  return true;
}
async function send(env, chat, pid, m, h) {
  const r = await h.tgCall(env, 'sendMessage', { chat_id: chat, text: m.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: m.keyboard || [] } });
  if (!r?.ok && (r?.error_code === 403 || /blocked|deactivated/i.test(String(r?.description || '')))) {
    try { await env.PITLANE.delete(K.start(chat)); } catch (_) {}
  }
  return !!r?.ok;
}
/**
 * Одно событие одному человеку. ev = { type, key, msg:{text,keyboard,line} }.
 * → 'sent' | 'queued' | 'dup' | 'cap' | причина отказа gate.
 */
export async function notifyEvent(env, pid, ev, h, now = Date.now()) {
  try {
    const g = await gate(env, pid, ev.type, h);
    if (!g.chat) return g.no;
    const kv = env.PITLANE;
    if (ev.key) {
      if (await kv.get(K.dup(pid, ev.key))) return 'dup';
      await kv.put(K.dup(pid, ev.key), '1', { expirationTtl: 8 * DAY });
    }
    const last = Number((await kv.get(K.last(pid))) || 0);
    if (last && now - last < COALESCE_MS) {
      const q = (await h.kvJson(kv, K.queue(pid))) || [];
      if (q.length < 30) q.push({ type: ev.type, line: ev.msg.line || '', at: now });
      await kv.put(K.queue(pid), JSON.stringify(q), { expirationTtl: 2 * DAY });
      return 'queued';
    }
    if (!(await bumpCount(kv, pid, h, now))) return 'cap';
    const ok = await send(env, g.chat, pid, ev.msg, h);
    if (ok) await kv.put(K.last(pid), String(now), { expirationTtl: 3600 });
    return ok ? 'sent' : 'send_failed';
  } catch (_) { return 'error'; }
}

/** Cron: копилки → одна сводка (если с последнего сообщения прошло ≥ COALESCE_MS). */
export async function flushQueues(env, h, now = Date.now()) {
  const kv = env.PITLANE; let sent = 0;
  for (const k of await h.kvListAll(kv, 'nq:', 2000)) {
    const pid = k.name.slice(3);
    const last = Number((await kv.get(K.last(pid))) || 0);
    if (last && now - last < COALESCE_MS) continue;
    const q = (await h.kvJson(kv, k.name)) || [];
    await kv.delete(k.name);
    const p = await loadPrefs(kv, pid, h);
    const lines = q.filter((x) => x && x.line && p[x.type] && !p.stop).map((x) => x.line);
    if (!lines.length) continue;
    const g = await gate(env, pid, q.find((x) => p[x.type])?.type || 'duel', h);
    if (!g.chat) continue;
    if (!(await bumpCount(kv, pid, h, now))) continue;
    if (await send(env, g.chat, pid, msgDigest(lines), h)) { sent++; await kv.put(K.last(pid), String(now), { expirationTtl: 3600 }); }
  }
  return sent;
}

/** Индекс «дуэль заканчивается»: только для дуэлей v121+ (создание / принятие вызова). */
export async function indexDuelEnd(kv, d) {
  if (!d || !d.id || !Number.isFinite(d.expiresAt)) return;
  const exp = Math.floor(d.expiresAt / 1000) + 3600;
  await kv.put(K.end(d.id), '1', { expiration: exp, metadata: { e: d.expiresAt } });
}
export async function duelEndingSweep(env, h, now = Date.now()) {
  const kv = env.PITLANE; let n = 0;
  for (const k of await h.kvListAll(kv, 'nend:', 2000)) {
    const e = Number(k.metadata?.e || 0);
    if (!e || e - now > ENDING_WINDOW_MS) continue;
    await kv.delete(k.name); // одно напоминание на дуэль
    if (e <= now) continue;
    const id = k.name.slice(5);
    const d = await h.kvJson(kv, 'duel:' + id);
    if (!d || d.status === 'ready' || d.winner) continue;
    const hoursLeft = Math.max(1, Math.round((e - now) / 3600000));
    const sides = [
      { who: d.createdBy, run: d.creatorRun, rival: d.challenger },
      { who: d.challenger || d.to, run: d.challengerRun, rival: d.createdBy }, // адресный вызов: напомнить и тому, кто ещё не ответил
    ];
    for (const s of sides) {
      if (!s.who?.id || s.run) continue;
      const r = await notifyEvent(env, s.who.id, { type: 'ending', key: 'end:' + id, msg: msgEnding({ duelId: id, rivalName: s.rival?.name ? h.safeName(s.rival.name) : '', hoursLeft, trackId: d.trackId }) }, h, now);
      if (r === 'sent' || r === 'queued') n++;
    }
  }
  return n;
}

/** Лучшее время пилота на доске → места (1..). timeOf(row) → число (меньше — лучше). */
export function pilotRanks(rows, timeOf) {
  const best = new Map();
  for (const r of rows || []) {
    if (!r || !r.pilotId) continue;
    const t = timeOf(r);
    if (!Number.isFinite(t)) continue;
    if (!best.has(r.pilotId) || t < best.get(r.pilotId).t) best.set(r.pilotId, { t, name: r.name });
  }
  const order = [...best.entries()].sort((a, b) => a[1].t - b[1].t);
  const rank = new Map();
  order.forEach(([pid, v], i) => rank.set(pid, { rank: i + 1, ...v }));
  return rank;
}
/** Кого сдвинул вниз новый зачёт submitterId (только те, кто был в первой OVERTAKE_TOP и оказался позади него). */
export function overtaken(before, after, submitterId, timeOf) {
  const b = pilotRanks(before, timeOf); const a = pilotRanks(after, timeOf);
  const me = a.get(submitterId); const meBefore = b.get(submitterId);
  if (!me) return [];
  if (meBefore && meBefore.t <= me.t) return []; // не улучшился — никого не обогнал
  const out = [];
  for (const [pid, rb] of b) {
    if (pid === submitterId || rb.rank > OVERTAKE_TOP) continue;
    const ra = a.get(pid);
    if (!ra || ra.rank <= rb.rank) continue;
    if (me.rank < ra.rank && (!meBefore || meBefore.rank > rb.rank)) out.push({ pid, rank: ra.rank, was: rb.rank });
  }
  return out.slice(0, OVERTAKE_TOP);
}
export async function overtakeNotify(env, h, { boardKey, boardTitle, before, after, submitterId, timeOf, fmt, open, now = Date.now() }) {
  const list = overtaken(before, after, submitterId, timeOf);
  if (!list.length) return 0;
  const me = pilotRanks(after, timeOf).get(submitterId);
  const rivalName = h.safeName(me?.name);
  const rivalT = fmt(me.t);
  let n = 0;
  for (const x of list) {
    const r = await notifyEvent(env, x.pid, { type: 'overtake', key: 'ot:' + boardKey + ':' + submitterId + ':' + me.t, msg: msgOvertake({ boardTitle, rivalName, rivalT, myRank: x.rank, open }) }, h, now);
    if (r === 'sent' || r === 'queued') n++;
  }
  return n;
}

/** Cron (каждые 15 мин): сводки и «дуэль заканчивается». */
export async function notifyCron(env, h, now = Date.now()) {
  if (!h.telegramConfig(env).enabled) return { skipped: 'tg_off' };
  const ending = await duelEndingSweep(env, h, now);
  const digests = await flushQueues(env, h, now);
  return { ending, digests };
}

/** Удаление аккаунта: личные ключи уведомлений. */
export async function deleteNotifyKeys(kv, pid, h) {
  const keys = [K.pref(pid), K.last(pid), K.queue(pid)];
  for (const k of keys) { try { await kv.delete(k); } catch (_) {} }
  for (const pre of ['ncnt:' + pid + ':', 'ndup:' + pid + ':']) {
    for (const k of await h.kvListAll(kv, pre, 500)) { try { await kv.delete(k.name); } catch (_) {} }
  }
}
