/**
 * v280: «Вызов» после заезда. Создатель вызывает друга на ту же дисциплину по ссылке startapp=ch_<id>.
 * Время создателя — его лучшая серверно зачтённая строка доски (A/B или C). Друг делает замер → его зачтённая
 * строка (после guardRun) записывается в вызов; создателю — сообщение бота (через notify.js, с лимитами).
 * KV: chal:<id> (TTL 30 дн.). Публично: ник, время, источник, машина. Никаких телефонов/координат.
 */
export const CHAL_DISCS = ['0-100', '100-200', '200-300', '0-200', '80-120', '0-60', '402m', '201m'];
const ID_RE = /^c[a-z0-9]{8,24}$/;
const TTL = 30 * 86400;
const pubRun = (r) => ({ pilotId: r.pilotId, nick: r.nick, t: r.t, src: r.src, chip: r.chip ? 1 : 0, car: r.car || '', at: r.at, pn: r.pn ?? null });
export function publicChal(c) {
  return { id: c.id, disc: c.disc, at: c.at, until: c.until, from: pubRun(c.from), runs: (c.runs || []).map(pubRun).sort((a, b) => a.t - b.t) };
}
async function bestRow(env, h, disc, pid) {
  let best = null;
  for (const cls of ['ab', 'c']) {
    for (const r of await h.readListRaw(env.PITLANE, h.boardKey('drag', disc, cls))) {
      if (!r || r.pilotId !== pid || !(Number(r.t) > 0) || r.valid === false) continue;
      if (!best || Number(r.t) < Number(best.t)) best = r;
    }
  }
  return best;
}
const runOf = (r, nick, pn) => ({ pilotId: r.pilotId, nick, t: Math.round(Number(r.t) * 100) / 100, src: r.src === 'ext' ? 'chip' : 'phone', chip: r.chip === 1 ? 1 : 0, car: typeof r.car === 'string' ? r.car.slice(0, 60) : '', at: Number(r.at) || Date.now(), pn: pn ?? null });

/** POST /chal · GET /chal/<id>. null — не наш путь. */
export async function chalRoute({ req, env, path, pilot, headers, ip, h }) {
  if (path !== '/chal' && !path.startsWith('/chal/')) return null;
  if (req.method === 'GET') {
    const id = path.slice(6);
    if (!ID_RE.test(id)) return h.json({ error: 'bad id' }, 400, headers);
    const lim = await h.limitOr429(env, headers, [['rl:chalg:ip:' + ip, 240, 3600]]);
    if (lim) return lim;
    const c = await h.kvJson(env.PITLANE, 'chal:' + id);
    if (!c) return h.json({ error: 'not found' }, 404, headers);
    return h.json({ ok: true, chal: publicChal(c) }, 200, headers);
  }
  if (req.method !== 'POST' || path !== '/chal') return h.json({ error: 'method' }, 405, headers);
  const denied = h.requireAuth(pilot, headers);
  if (denied) return denied;
  const lim = await h.limitOr429(env, headers, [['rl:chal:p:' + pilot.id, 20, 86400]]);
  if (lim) return lim;
  const body = await h.readJson(req, 1024).catch(() => ({}));
  const disc = CHAL_DISCS.includes(body?.disc) ? body.disc : null;
  if (!disc) return h.json({ error: 'bad discipline' }, 400, headers);
  const best = await bestRow(env, h, disc, pilot.id);
  if (!best) return h.json({ error: 'нет зачтённого замера', code: 'no_run' }, 409, headers);
  const rec = await h.loadPilot(env.PITLANE, pilot.id);
  const pn = h.pnumOf ? await h.pnumOf(env.PITLANE, pilot.id) : null;
  const id = 'c' + Date.now().toString(36) + h.randB36(8);
  const c = { id, disc, at: Date.now(), until: Date.now() + TTL * 1000, from: runOf(best, h.safeName(rec?.nick, '') || 'Пилот', pn), runs: [] };
  await env.PITLANE.put('chal:' + id, JSON.stringify(c), { expirationTtl: TTL });
  return h.json({ ok: true, chal: publicChal(c) }, 200, headers);
}

/** После зачтённого замера разгона с body.chal: записать результат друга, создателю — сообщение бота. */
export async function chalOnDrag(env, h, chalId, disc, row, nick, notify) {
  if (!ID_RE.test(String(chalId || ''))) return null;
  const key = 'chal:' + chalId;
  const c = await h.kvJson(env.PITLANE, key);
  if (!c || c.disc !== disc || Date.now() > c.until || !row?.pilotId || row.pilotId === c.from.pilotId || row.valid === false) return null;
  const pn = h.pnumOf ? await h.pnumOf(env.PITLANE, row.pilotId) : null;
  const run = runOf(row, h.safeName(nick, '') || 'Пилот', pn);
  const runs = (c.runs || []).filter((r) => r.pilotId !== run.pilotId);
  const prev = (c.runs || []).find((r) => r.pilotId === run.pilotId);
  if (prev && prev.t <= run.t) return publicChal(c);
  runs.push(run);
  c.runs = runs.sort((a, b) => a.t - b.t).slice(0, 30);
  await env.PITLANE.put(key, JSON.stringify(c), { expirationTtl: Math.max(86400, Math.ceil((c.until - Date.now()) / 1000)) });
  if (typeof notify === 'function') {
    const win = run.t < c.from.t;
    try { await notify(c.from.pilotId, { win, nick: run.nick, t: run.t, mine: c.from.t, id: c.id, disc }); } catch (_) {}
  }
  return publicChal(c);
}
