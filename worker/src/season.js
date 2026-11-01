/**
 * v114: сезонный зачёт экипажей (команды v98 = комнаты v97). Сезон = календарный месяц по МСК.
 *   Круг: сумма лучших кругов трёх лучших пилотов экипажа на трассе — только серверно зачтённые A/B строки
 *         общего топа `lap:<trackId>` с датой внутри месяца. Меньше трёх пилотов → «не хватает N».
 *   0–100 (справочно): лучший 0–100 экипажа — только внешний GPS ≥ 10 Гц (src:'ext', hz ≥ 10), A/B, srv:1.
 *         Источник — месячный агрегат `season:<YYYY-MM>:d0100` (пишется при каждом зачтённом 0–100) +
 *         строки общего топа `drag:0-100` с датой в этом месяце.
 * В таблицу попадают только публичные (listed) команды. Ничего не выдумываем: пустой месяц → пустые таблицы.
 * Не платно, без рассылок.
 */
const MSK = 3 * 3600 * 1000;
export const SEASON_TEAMS_CAP = 300;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const RU_MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

export function seasonKey(ms = Date.now()) {
  const d = new Date(ms + MSK);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
export function seasonBounds(key) {
  const m = MONTH_RE.exec(String(key || ''));
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]) - 1;
  return { from: Date.UTC(y, mo, 1) - MSK, to: Date.UTC(y, mo + 1, 1) - MSK, label: RU_MONTHS[mo] + ' ' + y };
}
function isAb(r) {
  return !!r && r.gps && r.valid === true && r.srv === 1 && (r.gpsQ === 'A' || r.gpsQ === 'B');
}
export function isSeasonDragRow(r) {
  return isAb(r) && r.src === 'ext' && Number(r.hz) >= 10 && Number.isFinite(Number(r.t));
}

/** Called after an accepted 0–100 row: keep the pilot's best of the month (ext ≥ 10 Hz only). */
export async function seasonRecord0100(kv, row, h) {
  if (!isSeasonDragRow(row) || !row.pilotId) return false;
  const key = 'season:' + seasonKey(row.at || Date.now()) + ':d0100';
  const agg = (await h.kvJson(kv, key)) || {};
  const prev = agg[row.pilotId];
  if (prev && Number(prev.t) <= Number(row.t)) return false;
  agg[row.pilotId] = { t: Number(row.t), at: row.at || Date.now(), car: String(row.car || '').slice(0, 80), carId: row.carId || null, hz: Number(row.hz), gpsQ: row.gpsQ };
  await kv.put(key, JSON.stringify(agg), { expirationTtl: 400 * 86400 });
  return true;
}

async function listedTeams(kv, h) {
  const idx = (await h.kvJson(kv, 'teamidx')) || [];
  const out = [];
  for (const t of (Array.isArray(idx) ? idx : []).filter((x) => x && x.listed !== false && x.id).slice(0, SEASON_TEAMS_CAP)) {
    const room = await h.kvJson(kv, 'room:' + t.id);
    if (!room || !Array.isArray(room.members) || !room.members.length || room.listed === false) continue;
    out.push(room);
  }
  return out;
}

/** → { month, label, trackId, lap:[…], drag:[…], teams } */
export async function crewStandings(kv, { month, trackId }, h) {
  const b = seasonBounds(month);
  const inMonth = (r) => Number(r.at) >= b.from && Number(r.at) < b.to;
  const teams = await listedTeams(kv, h);
  // pilot → best lap of the month on this track
  const bestLap = new Map();
  if (trackId) {
    for (const r of await h.readListRaw(kv, 'lap:' + trackId)) {
      if (!isAb(r) || !r.pilotId || !inMonth(r) || !Number.isFinite(r.ms)) continue;
      const p = bestLap.get(r.pilotId);
      if (!p || r.ms < p.ms) bestLap.set(r.pilotId, { ms: r.ms, t: r.t, car: r.car || '', carId: r.carId || null, gpsQ: r.gpsQ });
    }
  }
  // pilot → best 0–100 of the month (ext ≥ 10 Hz)
  const best0100 = new Map();
  const put0 = (pid, r) => { const p = best0100.get(pid); if (!p || Number(r.t) < Number(p.t)) best0100.set(pid, { t: Number(r.t), car: r.car || '', carId: r.carId || null, hz: Number(r.hz) }); };
  const agg = (await h.kvJson(kv, 'season:' + month + ':d0100')) || {};
  for (const [pid, r] of Object.entries(agg)) if (r && Number.isFinite(Number(r.t)) && Number(r.hz) >= 10 && inMonth(r)) put0(pid, r);
  for (const r of await h.readListRaw(kv, 'drag:0-100')) if (isSeasonDragRow(r) && r.pilotId && inMonth(r)) put0(r.pilotId, r);

  const lap = []; const drag = [];
  for (const room of teams) {
    const team = { id: room.id, name: h.safeName(room.name, 'команда'), avatarV: room.avatarV || null, n: room.members.length };
    const laps = [];
    let d0 = null;
    for (const m of room.members) {
      const nick = h.safeName(m.nick);
      const l = bestLap.get(m.pilotId);
      if (l) laps.push({ nick, ms: l.ms, t: l.t, car: l.car, carId: l.carId, gpsQ: l.gpsQ });
      const d = best0100.get(m.pilotId);
      if (d && (!d0 || d.t < d0.t)) d0 = { nick, t: d.t, car: d.car, carId: d.carId, hz: d.hz };
    }
    laps.sort((a, b2) => a.ms - b2.ms);
    if (laps.length) {
      const top = laps.slice(0, 3);
      lap.push({ team, pilots: top, n: top.length, need: Math.max(0, 3 - top.length), sumMs: top.length === 3 ? top.reduce((s, x) => s + x.ms, 0) : null });
    }
    if (d0) drag.push({ team, ...d0 });
  }
  lap.sort((a, b2) => (a.need - b2.need) || ((a.sumMs ?? 0) - (b2.sumMs ?? 0)) || (a.pilots[0].ms - b2.pilots[0].ms));
  drag.sort((a, b2) => a.t - b2.t);
  return { ok: true, month, label: b.label, trackId: trackId || null, lap, drag, teams: teams.length };
}

/** GET /season/crews?month=YYYY-MM&track=<id> — public, rate-limited, short edge cache. */
export async function seasonRoute(ctx) {
  const { req, env, path, url, headers, ip, h } = ctx;
  if (path !== '/season/crews') return null;
  if (req.method !== 'GET') return h.json({ error: 'method' }, 405, headers);
  const now = seasonKey();
  const month = url.searchParams.get('month') || now;
  const b = seasonBounds(month);
  if (!b || b.from > Date.now()) return h.json({ error: 'bad month' }, 400, headers);
  if (Date.now() - b.from > 400 * 86400000) return h.json({ error: 'season too old' }, 400, headers);
  const tq = url.searchParams.get('track');
  const trackId = tq && h.slugOk(tq) ? String(tq) : null;
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const ckey = cache ? new Request('https://season.cache/' + month + '/' + (trackId || '-')) : null;
  if (cache) {
    const hit = await cache.match(ckey);
    if (hit) return h.json(await hit.json(), 200, headers);
  }
  const lim = await h.limitOr429(env, headers, [['rl:season:ip:' + ip, 60, 3600]]);
  if (lim) return lim;
  const out = await crewStandings(env.PITLANE, { month, trackId }, h);
  if (cache) { try { await cache.put(ckey, new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' } })); } catch (_) {} }
  return h.json(out, 200, headers);
}

/* ——— v280: сезоны городов «<Город> · <Месяц>» ———
 * Агрегат месяца по дисциплине и классу: cseason:<YYYY-MM>:<disc>:<ab|c> = { pid: {t, at, city, nick, car, src, chip} }.
 * Пишется при каждом зачтённом сервером замере разгона пилота с городом в профиле. Новый месяц — новая таблица (сброс).
 * Победители прошлого месяца (лучший в каждом городе, дисциплине, классе) считаются лениво один раз → cschamp:<pid>.
 */
export const CITY_SEASON_DISCS = ['0-100', '100-200', '402m'];
const cKey = (c) => String(c || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}]+/gu, '');
const monthName = (m) => { const b = seasonBounds(m); return b ? b.label.split(' ')[0] : ''; };
const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
function prevMonth(m) { const [y, mo] = m.split('-').map(Number); return mo === 1 ? (y - 1) + '-12' : y + '-' + String(mo - 1).padStart(2, '0'); }

export async function citySeasonRecord(kv, row, disc, nick, h) {
  if (!CITY_SEASON_DISCS.includes(disc) || !row?.pilotId || !row.city || row.valid === false || !(Number(row.t) > 0)) return false;
  const cls = row.cls === 'c' ? 'c' : 'ab';
  const key = 'cseason:' + seasonKey(row.at || Date.now()) + ':' + disc + ':' + cls;
  const agg = (await h.kvJson(kv, key)) || {};
  const prev = agg[row.pilotId];
  if (prev && Number(prev.t) <= Number(row.t) && prev.city === row.city) return false;
  agg[row.pilotId] = { t: Math.round(Number(row.t) * 100) / 100, at: row.at || Date.now(), city: String(row.city).slice(0, 40), nick: String(nick || 'Пилот').slice(0, 32), car: String(row.car || '').slice(0, 60), src: row.src === 'ext' ? 'chip' : 'phone', chip: row.chip === 1 ? 1 : 0 };
  await kv.put(key, JSON.stringify(agg), { expirationTtl: 400 * 86400 });
  return true;
}

async function ensureChamps(kv, month, h) {
  const flag = 'cschampdone:' + month;
  if (await kv.get(flag)) return;
  const won = new Map();
  for (const disc of CITY_SEASON_DISCS) for (const cls of ['ab', 'c']) {
    const agg = (await h.kvJson(kv, 'cseason:' + month + ':' + disc + ':' + cls)) || {};
    const best = new Map();
    for (const [pid, r] of Object.entries(agg)) { const k = cKey(r.city); if (!k) continue; const b = best.get(k); if (!b || r.t < b.r.t) best.set(k, { pid, r }); }
    for (const { pid, r } of best.values()) { if (!won.has(pid)) won.set(pid, []); won.get(pid).push({ m: month, city: r.city, disc, cls }); }
  }
  for (const [pid, list] of won) {
    const cur = (await h.kvJson(kv, 'cschamp:' + pid)) || [];
    const merged = cur.filter((x) => x.m !== month).concat(list).slice(-24);
    await kv.put('cschamp:' + pid, JSON.stringify(merged));
  }
  await kv.put(flag, '1', { expirationTtl: 400 * 86400 });
}
/** Последний титул пилота → «Казань · октябрь» | null */
export async function champBadge(kv, pid) {
  try {
    const list = JSON.parse((await kv.get('cschamp:' + pid)) || '[]');
    if (!Array.isArray(list) || !list.length) return null;
    const x = list[list.length - 1];
    return { label: x.city + ' · ' + monthName(x.m), m: x.m, disc: x.disc, n: list.length };
  } catch (_) { return null; }
}

/** GET /season/city?city=&disc=&cls=&month= */
export async function citySeasonRoute({ req, env, path, url, headers, ip, h }) {
  if (path !== '/season/city') return null;
  if (req.method !== 'GET') return h.json({ error: 'method' }, 405, headers);
  const lim = await h.limitOr429(env, headers, [['rl:cseason:ip:' + ip, 240, 3600]]);
  if (lim) return lim;
  const now = seasonKey();
  const month = url.searchParams.get('month') || now;
  const b = seasonBounds(month);
  if (!b || b.from > Date.now() || Date.now() - b.from > 400 * 86400000) return h.json({ error: 'bad month' }, 400, headers);
  const disc = CITY_SEASON_DISCS.includes(url.searchParams.get('disc')) ? url.searchParams.get('disc') : '0-100';
  const cls = url.searchParams.get('cls') === 'c' ? 'c' : 'ab';
  const city = String(url.searchParams.get('city') || '').trim().slice(0, 40);
  const k = cKey(city);
  try { await ensureChamps(env.PITLANE, prevMonth(now), h); } catch (_) {}
  const agg = (await h.kvJson(env.PITLANE, 'cseason:' + month + ':' + disc + ':' + cls)) || {};
  const rows = Object.entries(agg).filter(([, r]) => !k || cKey(r.city) === k)
    .map(([pilotId, r]) => ({ pilotId, ...r })).sort((a, b2) => a.t - b2.t).slice(0, 50);
  if (h.attachPass) await h.attachPass(env.PITLANE, rows, 50);
  const ends = month === now ? b.to : null;
  return h.json({ ok: true, month, label: (city ? cap(city) + ' · ' : '') + cap(monthName(month)), disc, cls, ends, rows }, 200, headers);
}
