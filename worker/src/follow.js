/**
 * v131: подписка на пилота или команду + уведомление в бот об улучшении (в рамках notify.js v121:
 * только запустившим бота и вошедшим, переключатель «Подписки», ≤ 5 в сутки, склейка, без дублей).
 * Только зачтённые улучшения: новый лучший результат пилота на доске (A/B или C) лучше его прежнего.
 */
import { notifyEvent } from './notify.js';
import { webAppBtn, trackTitle } from './botcopy.js';

export const FOLLOW_MAX = 30;      // подписок у одного пилота
export const FOLLOWERS_MAX = 1000; // подписчиков у одной цели
export const FANOUT_MAX = 300;     // получателей одного события
const K = {
  mine: (pid) => 'fol:' + pid,
  by: (kind, id) => 'fby:' + (kind === 'team' ? 't' : 'p') + ':' + id,
};
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const code = (s) => '<code>' + esc(s) + '</code>';
const RULE = '──────────';

async function readArr(kv, key, h) { const v = await h.kvJson(kv, key); return Array.isArray(v) ? v : []; }

export async function listFollows(kv, pid, h) { return readArr(kv, K.mine(pid), h); }

/** → { ok, items } | { code } */
export async function setFollow(kv, pid, { kind, id, name, on }, h) {
  if (kind !== 'pilot' && kind !== 'team') return { code: 'bad_kind' };
  const mine = await readArr(kv, K.mine(pid), h);
  const i = mine.findIndex((x) => x.kind === kind && x.id === id);
  const by = await readArr(kv, K.by(kind, id), h);
  if (on) {
    if (i < 0) {
      if (mine.length >= FOLLOW_MAX) return { code: 'follow_limit' };
      if (by.length >= FOLLOWERS_MAX && !by.includes(pid)) return { code: 'followers_full' };
      mine.push({ kind, id, name: String(name || '').slice(0, 40), at: Date.now() });
      await kv.put(K.mine(pid), JSON.stringify(mine));
    }
    if (!by.includes(pid)) { by.push(pid); await kv.put(K.by(kind, id), JSON.stringify(by)); }
  } else {
    if (i >= 0) { mine.splice(i, 1); await kv.put(K.mine(pid), JSON.stringify(mine)); }
    const j = by.indexOf(pid);
    if (j >= 0) { by.splice(j, 1); if (by.length) await kv.put(K.by(kind, id), JSON.stringify(by)); else await kv.delete(K.by(kind, id)); }
  }
  return { ok: true, items: mine };
}

/** Прежний и новый лучший пилота на доске → { prev, now } | null (первый результат — не «улучшение»). */
export function improvedBy(before, after, pid, timeOf) {
  const best = (rows) => { let b = null; for (const r of rows || []) { if (!r || r.pilotId !== pid) continue; const t = timeOf(r); if (Number.isFinite(t) && t > 0 && (b == null || t < b)) b = t; } return b; };
  const prev = best(before); const now = best(after);
  if (prev == null || now == null || !(now < prev)) return null;
  return { prev, now };
}

export function msgImproved({ name, what, t, delta, open }) {
  return {
    text: '<b>' + esc(name) + ' улучшил(а) ' + esc(what.kind) + '</b>\n' + esc(what.title) + '\n' + RULE + '\n' + code(t) + '  ' + code('−' + delta),
    keyboard: [[webAppBtn('Открыть топ', open || { view: 'tops', skipIntro: '1' })]],
    line: esc(name) + ' улучшил(а) ' + esc(what.kind) + ' — ' + esc(what.title) + ': ' + esc(t) + ' (−' + esc(delta) + ')',
  };
}

/**
 * Улучшение на доске → подписчикам пилота и его команд. board = { kind:'lap'|'drag', ref, cls }.
 * → число поставленных уведомлений.
 */
export async function followImproveNotify(env, h, { board, before, after, submitterId, timeOf, fmt, fmtDelta, title, now = Date.now() }) {
  const imp = improvedBy(before, after, submitterId, timeOf);
  if (!imp) return 0;
  const kv = env.PITLANE;
  const rcpt = new Set(await readArr(kv, K.by('pilot', submitterId), h));
  let crews = []; try { crews = (await h.kvJson(kv, 'crewidx:' + submitterId)) || []; } catch (_) { crews = []; }
  for (const cid of (Array.isArray(crews) ? crews : []).slice(0, 10)) for (const f of await readArr(kv, K.by('team', cid), h)) rcpt.add(f);
  rcpt.delete(submitterId);
  if (!rcpt.size) return 0;
  const me = (after || []).find((r) => r && r.pilotId === submitterId && timeOf(r) === imp.now);
  const name = h.safeName(me?.name) || 'Пилот';
  const what = board.kind === 'lap' ? { kind: 'круг', title: trackTitle(board.ref) + (board.cls === 'c' ? ' · телефон (C)' : '') } : { kind: title || board.ref, title: board.cls === 'c' ? 'телефон (C)' : 'внешний GPS (A/B)' };
  const msg = msgImproved({ name, what, t: fmt(imp.now), delta: fmtDelta(imp.prev - imp.now) });
  let n = 0;
  for (const pid of [...rcpt].slice(0, FANOUT_MAX)) {
    const r = await notifyEvent(env, pid, { type: 'follow', key: 'fl:' + board.kind + board.cls + ':' + board.ref + ':' + submitterId + ':' + imp.now, msg }, h, now);
    if (r === 'sent' || r === 'queued') n++;
  }
  return n;
}

/** Удаление аккаунта: свои подписки, себя из чужих списков подписчиков, список своих подписчиков. */
export async function deleteFollowKeys(kv, pid, h) {
  for (const x of await readArr(kv, K.mine(pid), h)) {
    const by = await readArr(kv, K.by(x.kind, x.id), h);
    const j = by.indexOf(pid);
    if (j >= 0) { by.splice(j, 1); try { if (by.length) await kv.put(K.by(x.kind, x.id), JSON.stringify(by)); else await kv.delete(K.by(x.kind, x.id)); } catch (_) {} }
  }
  for (const k of [K.mine(pid), K.by('pilot', pid)]) { try { await kv.delete(k); } catch (_) {} }
}
