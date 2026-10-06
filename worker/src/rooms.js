/**
 * v97: «Это моя машина» + комнаты экипажей (private rooms) + Telegram Stars season per room.
 *
 * KV:
 *   mycar:<pilotId>      { model, carId, tyre, at }                       — active car (+ tyre text)
 *   room:<id>            { id, name, members[{pilotId,nick,role,joinedAt}], invite, sessions[], tracks[], paidUntil, payments[] }
 *   roominv:<code>       <roomId>
 *   roomidx:<pilotId>    [roomId…]
 *   roomlaps:<id>        [lap…]  (newest last, capped)
 *   paycharge:<chargeId> { roomId, at, … }                                — idempotency for successful_payment
 *
 * Every room route requires a logged-in pilot (Bearer) and membership (except join by invite).
 * Paywall is decided here on the server — the client only renders what it gets.
 */

/* ——— season / limits (Мага меняет здесь) ——— */
import { PAY, msgSeasonPaid } from './botcopy.js';

export const ROOM_SEASON_DAYS = 90; // длительность оплаченного сезона
export const ROOM_SEASON_STARS = 500; // цена сезона в Telegram Stars (XTR) — ЗАГЛУШКА
export const ROOM_FREE_SESSIONS = 3; // бесплатно: сессий на комнату
export const ROOM_FREE_TRACKS = 1; // бесплатно: треков на комнату
export const ROOM_MAX_MEMBERS = 30;
export const ROOM_MAX_OWNED = 5; // комнат, созданных одним пилотом
export const ROOM_MAX_JOINED = 20;
export const ROOM_LAPS_CAP = 3000;
const DAY = 24 * 60 * 60 * 1000;
const INVITE_RE = /^[A-Z2-9]{8}$/;
const ROOM_ID_RE = /^r[a-z0-9]{10,24}$/;
const LAP_ID_RE = /^l[a-z0-9]{8,24}$/;
const PAYLOAD_RE = /^rs1:(r[a-z0-9]{10,24}):(p_[0-9a-f-]{36})$/;

function inviteCode8() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return [...a].map((b) => alphabet[b % alphabet.length]).join('');
}

export function sanitizeMyCar(body, h) {
  const model = h.cleanLabel(body?.model, 80);
  const tyre = h.cleanLabel(body?.tyre, 40);
  if (!model || h.containsPhone(model)) return { error: 'model required' };
  if (!tyre || h.containsPhone(tyre)) return { error: 'tyre required' };
  const carId = h.slugOk(body?.carId) ? String(body.carId) : null;
  return { model, tyre, carId };
}

export async function loadMyCar(kv, pid, h) {
  if (!pid) return null;
  const c = await h.kvJson(kv, 'mycar:' + pid);
  return c && c.model && c.tyre ? c : null;
}

function isMember(room, pid) {
  return !!pid && (room?.members || []).some((m) => m.pilotId === pid);
}
function memberOf(room, pid) {
  return (room?.members || []).find((m) => m.pilotId === pid) || null;
}

/** Server-side paywall state. */
export function roomQuota(room, h, now = Date.now()) {
  const today = h.moscowDateKey(now);
  const paidUntil = Number(room?.paidUntil) || 0;
  const paid = paidUntil > now;
  const sessions = Array.isArray(room?.sessions) ? room.sessions : [];
  const tracks = Array.isArray(room?.tracks) ? room.tracks : [];
  const openToday = sessions.some((s) => s.date === today);
  const locked = !paid && sessions.length >= ROOM_FREE_SESSIONS && !openToday;
  return {
    paid,
    paidUntil: paid ? paidUntil : null,
    sessionsUsed: sessions.length,
    freeSessions: ROOM_FREE_SESSIONS,
    tracks,
    freeTracks: ROOM_FREE_TRACKS,
    locked,
    price: { stars: ROOM_SEASON_STARS, currency: 'XTR', days: ROOM_SEASON_DAYS },
  };
}

function paywall(h, headers, room, reason) {
  return h.json({
    error: 'season required',
    code: 'ROOM_PAYWALL',
    reason, // 'locked' | 'sessions' | 'track'
    title: 'Экипаж оплачивает сезон',
    quota: roomQuota(room, h),
  }, 402, headers);
}

function publicRoom(room, viewer, h) {
  const me = memberOf(room, viewer);
  return {
    id: room.id,
    name: h.safeName(room.name, 'экипаж'),
    createdAt: room.createdAt,
    role: me ? me.role : null,
    invite: me ? room.invite : undefined,
    members: (room.members || []).map((m) => ({
      pilotId: h.pubId(m.pilotId),
      nick: h.safeName(m.nick),
      role: m.role === 'captain' ? 'captain' : 'member',
      joinedAt: m.joinedAt || null,
    })),
    memberCount: (room.members || []).length,
    quota: roomQuota(room, h),
    // v98: team profile (public part lives in teams.js) + join requests for the captain
    about: room.about || '',
    avatarV: room.avatarV || null,
    listed: room.listed !== false,
    requests: me && me.role === 'captain'
      ? (room.requests || []).map((r) => ({ id: h.pubId(r.pilotId), nick: h.safeName(r.nick), at: r.at, note: r.note || '' }))
      : undefined,
  };
}

function publicLap(l, h) {
  return {
    id: l.id,
    pilotId: h.pubId(l.pilotId),
    nick: h.safeName(l.nick),
    model: l.model,
    tyre: l.tyre,
    trackId: l.trackId,
    date: l.date,
    at: l.at,
    t: l.t,
    ms: l.ms,
    sectors: Array.isArray(l.sectors) ? l.sectors : null,
    gpsQ: l.gpsQ || null,
    valid: !!l.valid,
    public: !!l.public,
  };
}

async function loadRoom(kv, id, h) {
  if (!ROOM_ID_RE.test(String(id || ''))) return null;
  return await h.kvJson(kv, 'room:' + id);
}
async function saveRoom(kv, room) {
  await kv.put('room:' + room.id, JSON.stringify(room));
}
async function indexRoom(kv, pid, id, h, remove = false) {
  let idx = (await h.kvJson(kv, 'roomidx:' + pid)) || [];
  if (!Array.isArray(idx)) idx = [];
  idx = idx.filter((x) => x !== id);
  if (!remove) idx.unshift(id);
  await kv.put('roomidx:' + pid, JSON.stringify(idx.slice(0, 40)));
  return idx;
}

function lapMs(l) {
  const n = Number(l?.ms);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sectorSplits(cum) {
  if (!Array.isArray(cum) || cum.length < 2) return null;
  const out = [];
  for (let i = 0; i < cum.length; i++) out.push(i ? cum[i] - cum[i - 1] : cum[0]);
  return out;
}

/** One bump into the room's session/track ledger; returns { ok } or { reason }. */
function roomAdmitLap(room, trackId, h, now = Date.now()) {
  const q = roomQuota(room, h, now);
  if (q.locked) return { reason: 'locked' };
  room.sessions = Array.isArray(room.sessions) ? room.sessions : [];
  room.tracks = Array.isArray(room.tracks) ? room.tracks : [];
  const date = h.moscowDateKey(now);
  if (!q.paid && !room.tracks.includes(trackId) && room.tracks.length >= ROOM_FREE_TRACKS) return { reason: 'track' };
  const k = date + '|' + trackId;
  const has = room.sessions.some((s) => s.k === k);
  if (!has && !q.paid && room.sessions.length >= ROOM_FREE_SESSIONS) return { reason: 'sessions' };
  if (!has) room.sessions.push({ k, date, trackId, at: now });
  if (!room.tracks.includes(trackId)) room.tracks.push(trackId);
  return { ok: true, date };
}

/** Telegram: make sure the webhook also receives pre_checkout_query (once; flag in KV). */
async function ensurePaymentUpdates(env, origin, h) {
  try {
    if (await env.PITLANE.get('tg:wh:pay1')) return;
    const secret = String(env.TG_WEBHOOK_SECRET || '');
    if (secret.length < 32) return;
    const r = await h.tgCall(env, 'setWebhook', {
      url: origin + '/tg/webhook/' + h.tgWebhookPath(secret),
      secret_token: secret,
      allowed_updates: ['message', 'pre_checkout_query'],
      max_connections: 20,
    });
    if (r?.ok) await env.PITLANE.put('tg:wh:pay1', String(Date.now()));
  } catch (_) {}
}

function invoiceSpec(room, pilotId, h) {
  const name = h.safeName(room.name, 'экипаж');
  return {
    title: PAY.title,
    description: PAY.description(name, ROOM_SEASON_DAYS),
    payload: `rs1:${room.id}:${pilotId}`,
    currency: 'XTR',
    prices: [{ label: PAY.label(ROOM_SEASON_DAYS), amount: ROOM_SEASON_STARS }],
  };
}

/* ———————————————— HTTP routes ———————————————— */

/** Returns a Response for /me/car and /rooms…, or null when the path is not ours. */
export async function roomsRoute(ctx) {
  const { req, env, path, url, pilot, headers, ip, h } = ctx;
  const kv = env.PITLANE;
  const isRoomPath = path === '/me/car' || path === '/rooms' || path.startsWith('/rooms/');
  if (!isRoomPath) return null;
  const denied = h.requireAuth(pilot, headers);
  if (denied) return denied;

  // —— «Это моя машина» ——
  if (path === '/me/car') {
    if (req.method === 'GET') return h.json({ ok: true, car: await loadMyCar(kv, pilot.id, h) }, 200, headers);
    if (req.method === 'PUT') {
      const lim = await h.limitOr429(env, headers, [['rl:mycar:p:' + pilot.id, 30, 3600]]);
      if (lim) return lim;
      const body = await h.readJson(req, 4096);
      const c = sanitizeMyCar(body, h);
      if (c.error) return h.json({ error: c.error }, 400, headers);
      const rec = { ...c, at: Date.now() };
      await kv.put('mycar:' + pilot.id, JSON.stringify(rec));
      return h.json({ ok: true, car: rec }, 200, headers);
    }
    return h.json({ error: 'method' }, 405, headers);
  }

  // —— create / list ——
  if (path === '/rooms' && req.method === 'POST') {
    const lim = await h.limitOr429(env, headers, [['rl:room:ip:' + ip, 10, 3600], ['rl:room:p:' + pilot.id, 5, 86400]]);
    if (lim) return lim;
    const body = await h.readJson(req, 4096);
    const name = h.cleanLabel(body?.name, 48);
    if (!name || h.containsPhone(name)) return h.json({ error: 'name required' }, 400, headers);
    const idx = (await h.kvJson(kv, 'roomidx:' + pilot.id)) || [];
    let owned = 0;
    for (const rid of idx.slice(0, 40)) {
      const r = await loadRoom(kv, rid, h);
      if (r && r.createdBy === pilot.id) owned++;
    }
    if (owned >= ROOM_MAX_OWNED) return h.json({ error: 'too many rooms', max: ROOM_MAX_OWNED }, 409, headers);
    if (idx.length >= ROOM_MAX_JOINED) return h.json({ error: 'too many rooms', max: ROOM_MAX_JOINED }, 409, headers);
    let code = inviteCode8();
    for (let i = 0; i < 4 && (await kv.get('roominv:' + code)); i++) code = inviteCode8();
    const now = Date.now();
    const room = {
      id: 'r' + now.toString(36) + h.randB36(8),
      name,
      createdAt: now,
      createdBy: pilot.id,
      members: [{ pilotId: pilot.id, nick: h.safeName(body?.nick || pilot.name), role: 'captain', joinedAt: now }],
      invite: code,
      sessions: [],
      tracks: [],
      paidUntil: 0,
      payments: [],
    };
    await saveRoom(kv, room);
    await kv.put('roominv:' + code, room.id);
    await indexRoom(kv, pilot.id, room.id, h);
    if (h.onRoomChanged) await h.onRoomChanged(kv, room);
    return h.json(publicRoom(room, pilot.id, h), 200, headers);
  }
  if (path === '/rooms' && req.method === 'GET') {
    const idx = (await h.kvJson(kv, 'roomidx:' + pilot.id)) || [];
    const out = [];
    for (const rid of idx.slice(0, 40)) {
      const r = await loadRoom(kv, rid, h);
      if (r && isMember(r, pilot.id)) out.push(publicRoom(r, pilot.id, h));
    }
    return h.json(out, 200, headers);
  }

  // —— invite preview / join ——
  let m = path.match(/^\/rooms\/invite\/([^/]+)$/);
  if (m && req.method === 'GET') {
    const lim = await h.limitOr429(env, headers, [['rl:rinvq:ip:' + ip, 60, 3600]]);
    if (lim) return lim;
    const code = String(h.safeDecode(m[1]) || '').toUpperCase();
    if (!INVITE_RE.test(code)) return h.json({ error: 'invalid invite' }, 404, headers);
    const rid = await kv.get('roominv:' + code);
    const room = rid ? await loadRoom(kv, rid, h) : null;
    if (!room) return h.json({ error: 'invalid invite' }, 404, headers);
    return h.json({ id: room.id, name: h.safeName(room.name, 'экипаж'), memberCount: (room.members || []).length, member: isMember(room, pilot.id) }, 200, headers);
  }
  if (path === '/rooms/join' && req.method === 'POST') {
    const lim = await h.limitOr429(env, headers, [['rl:rjoin:ip:' + ip, 20, 3600], ['rl:rjoin:p:' + pilot.id, 30, 86400]]);
    if (lim) return lim;
    const body = await h.readJson(req, 4096);
    const code = String(body?.code || '').trim().toUpperCase();
    if (!INVITE_RE.test(code)) return h.json({ error: 'invalid invite' }, 404, headers);
    const rid = await kv.get('roominv:' + code);
    const room = rid ? await loadRoom(kv, rid, h) : null;
    if (!room) return h.json({ error: 'invalid invite' }, 404, headers);
    return await joinRoom(ctx, room, body);
  }

  m = path.match(/^\/rooms\/([^/]+)(?:\/([a-z-]+))?$/);
  if (!m) return h.json({ error: 'not found' }, 404, headers);
  const room = await loadRoom(kv, h.safeDecode(m[1]), h);
  const sub = m[2] || '';
  if (!room) return h.json({ error: 'not found' }, 404, headers);
  if (!isMember(room, pilot.id)) return h.json({ error: 'members only' }, 403, headers);
  const me = memberOf(room, pilot.id);

  if (!sub && req.method === 'GET') {
    const laps = await h.readListRaw(kv, 'roomlaps:' + room.id);
    const facets = { tracks: [...new Set(laps.map((l) => l.trackId))], models: [...new Set(laps.map((l) => l.model))], tyres: [...new Set(laps.map((l) => l.tyre))] };
    return h.json({ ...publicRoom(room, pilot.id, h), facets }, 200, headers);
  }

  if (sub === 'leave' && req.method === 'POST') {
    room.members = (room.members || []).filter((x) => x.pilotId !== pilot.id);
    if (room.members.length && !room.members.some((x) => x.role === 'captain')) room.members[0].role = 'captain';
    await indexRoom(kv, pilot.id, room.id, h, true);
    if (!room.members.length) {
      // last one out: the room/team is gone (laps, invite, feed, avatar)
      await kv.delete('room:' + room.id);
      await kv.delete('roomlaps:' + room.id);
      if (room.invite) await kv.delete('roominv:' + room.invite);
      if (h.onRoomDeleted) await h.onRoomDeleted(kv, room);
      return h.json({ ok: true, deleted: true }, 200, headers);
    }
    await saveRoom(kv, room);
    if (h.onRoomChanged) await h.onRoomChanged(kv, room);
    return h.json({ ok: true }, 200, headers);
  }

  if (sub === 'invite' && req.method === 'POST') {
    // rotate invite (captain only) — old links stop working
    if (me.role !== 'captain') return h.json({ error: 'captain only' }, 403, headers);
    const lim = await h.limitOr429(env, headers, [['rl:rinv:p:' + pilot.id, 10, 86400]]);
    if (lim) return lim;
    await kv.delete('roominv:' + room.invite);
    let code = inviteCode8();
    for (let i = 0; i < 4 && (await kv.get('roominv:' + code)); i++) code = inviteCode8();
    room.invite = code;
    await kv.put('roominv:' + code, room.id);
    await saveRoom(kv, room);
    return h.json(publicRoom(room, pilot.id, h), 200, headers);
  }

  if (sub === 'laps' && req.method === 'GET') {
    // old data always visible to members (even when the room is silent)
    const track = String(url.searchParams.get('track') || '');
    let laps = await h.readListRaw(kv, 'roomlaps:' + room.id);
    if (track) laps = laps.filter((l) => l.trackId === track);
    laps = laps.slice(-300).reverse();
    return h.json({ laps: laps.map((l) => publicLap(l, h)), quota: roomQuota(room, h) }, 200, headers);
  }

  if (sub === 'laps' && req.method === 'POST') {
    const lim = await h.limitOr429(env, headers, [['rl:rlap:p:' + pilot.id, 120, 3600]]);
    if (lim) return lim;
    const car = await loadMyCar(kv, pilot.id, h);
    if (!car) return h.json({ error: 'car required', code: 'NO_CAR', hint: 'Это моя машина: выбери машину и резину' }, 409, headers);
    const body = await h.readJson(req, 8192);
    const trackId = String(body?.trackId || '');
    if (!h.slugOk(trackId)) return h.json({ error: 'trackId required' }, 400, headers);
    const row = h.sanitizeLap(body, { id: pilot.id, name: me.nick });
    if (!row) return h.json({ error: 'invalid gps lap row' }, 400, headers);
    const ms = row.ms || h.parseLapMs(row.t);
    if (!ms) return h.json({ error: 'bad time' }, 400, headers);
    const adm = roomAdmitLap(room, trackId, h);
    if (!adm.ok) return paywall(h, headers, room, adm.reason);
    const lap = {
      id: 'l' + Date.now().toString(36) + h.randB36(8),
      pilotId: pilot.id,
      nick: me.nick,
      model: car.model,
      carId: car.carId || null,
      tyre: car.tyre,
      trackId,
      date: adm.date,
      at: Date.now(),
      t: row.t,
      ms,
      sectors: row.sectors || null,
      gpsQ: row.gpsQ || null,
      valid: !!row.valid,
      public: body?.public === true,
    };
    const laps = await h.readListRaw(kv, 'roomlaps:' + room.id);
    laps.push(lap);
    await kv.put('roomlaps:' + room.id, JSON.stringify(laps.slice(-ROOM_LAPS_CAP)));
    await saveRoom(kv, room);
    if (ctx.onRoomLap) { try { await ctx.onRoomLap(room, lap, laps); } catch (_) {} }
    return h.json({ ok: true, lap: publicLap(lap, h), quota: roomQuota(room, h) }, 200, headers);
  }

  if (sub === 'duel' && req.method === 'GET') {
    const q = roomQuota(room, h);
    if (q.locked) return paywall(h, headers, room, 'locked');
    const a = String(url.searchParams.get('a') || '');
    const b = String(url.searchParams.get('b') || '');
    if (!LAP_ID_RE.test(a) || !LAP_ID_RE.test(b) || a === b) return h.json({ error: 'two laps required' }, 400, headers);
    const laps = await h.readListRaw(kv, 'roomlaps:' + room.id);
    const A = laps.find((l) => l.id === a);
    const B = laps.find((l) => l.id === b);
    if (!A || !B) return h.json({ error: 'lap not found' }, 404, headers);
    if (A.trackId !== B.trackId) return h.json({ error: 'different tracks', code: 'TRACK_MISMATCH' }, 400, headers);
    const sa = sectorSplits(A.sectors); const sb = sectorSplits(B.sectors);
    const sectors = sa && sb && sa.length === sb.length ? sa.map((x, i) => ({ a: x, b: sb[i], delta: sb[i] - x })) : null;
    return h.json({ trackId: A.trackId, a: publicLap(A, h), b: publicLap(B, h), delta: lapMs(B) - lapMs(A), sectors }, 200, headers);
  }

  if (sub === 'top' && req.method === 'GET') {
    const q = roomQuota(room, h);
    if (q.locked) return paywall(h, headers, room, 'locked');
    const track = String(url.searchParams.get('track') || '');
    const model = h.cleanLabel(url.searchParams.get('model'), 80);
    const tyre = h.cleanLabel(url.searchParams.get('tyre'), 40);
    if (!h.slugOk(track) || !model || !tyre) return h.json({ error: 'track, model and tyre required', code: 'FILTER_REQUIRED' }, 400, headers);
    const laps = (await h.readListRaw(kv, 'roomlaps:' + room.id)).filter((l) => l.trackId === track && l.model === model && l.tyre === tyre && l.valid && (l.gpsQ === 'A' || l.gpsQ === 'B'));
    const best = {};
    for (const l of laps) {
      const ms = lapMs(l);
      if (ms == null) continue;
      if (!best[l.pilotId] || ms < best[l.pilotId].ms) best[l.pilotId] = l;
    }
    const rows = Object.values(best).sort((x, y) => x.ms - y.ms).map((l, i, arr) => ({ ...publicLap(l, h), pos: i + 1, gap: i ? l.ms - arr[0].ms : 0 }));
    return h.json({ track, model, tyre, rows }, 200, headers);
  }

  if (sub === 'invoice' && req.method === 'POST') {
    const lim = await h.limitOr429(env, headers, [['rl:rpay:p:' + pilot.id, 10, 3600]]);
    if (lim) return lim;
    const tg = h.telegramConfig(env);
    if (!tg.enabled) return h.json({ error: 'payments unavailable' }, 503, headers);
    const body = await h.readJson(req, 2048);
    await ensurePaymentUpdates(env, 'https://' + url.host, h);
    const spec = invoiceSpec(room, pilot.id, h);
    if (body?.via === 'chat') {
      const rec = await h.loadPilot(kv, pilot.id);
      const tgId = (rec?.providers || []).find((p) => p.type === 'tg')?.id;
      if (!tgId) return h.json({ error: 'telegram account required', code: 'NO_TG' }, 409, headers);
      const r = await h.tgCall(env, 'sendInvoice', { chat_id: Number(tgId), ...spec });
      if (!r?.ok) return h.json({ error: 'telegram: ' + String(r?.description || 'fail').slice(0, 120) }, 502, headers);
      return h.json({ ok: true, via: 'chat', price: spec.prices[0] }, 200, headers);
    }
    const r = await h.tgCall(env, 'createInvoiceLink', spec);
    if (!r?.ok || typeof r.result !== 'string') return h.json({ error: 'telegram: ' + String(r?.description || 'fail').slice(0, 120) }, 502, headers);
    return h.json({ ok: true, via: 'link', link: r.result, price: spec.prices[0], days: ROOM_SEASON_DAYS }, 200, headers);
  }

  if (ctx.extraRoomSub) {
    const r = await ctx.extraRoomSub(room, me, sub);
    if (r) return r;
  }
  return h.json({ error: 'not found' }, 404, headers);
}

async function joinRoom(ctx, room, body) {
  const { env, pilot, headers, h } = ctx;
  const kv = env.PITLANE;
  room.members = Array.isArray(room.members) ? room.members : [];
  if (isMember(room, pilot.id)) return h.json(publicRoom(room, pilot.id, h), 200, headers);
  if (room.members.length >= ROOM_MAX_MEMBERS) return h.json({ error: 'room full', max: ROOM_MAX_MEMBERS }, 409, headers);
  const idx = (await h.kvJson(kv, 'roomidx:' + pilot.id)) || [];
  if (idx.length >= ROOM_MAX_JOINED) return h.json({ error: 'too many rooms', max: ROOM_MAX_JOINED }, 409, headers);
  room.members.push({ pilotId: pilot.id, nick: h.safeName(body?.nick || pilot.name), role: 'member', joinedAt: Date.now() });
  if (Array.isArray(room.requests)) room.requests = room.requests.filter((r) => r.pilotId !== pilot.id);
  await saveRoom(kv, room);
  await indexRoom(kv, pilot.id, room.id, h);
  if (h.onRoomChanged) await h.onRoomChanged(kv, room);
  return h.json(publicRoom(room, pilot.id, h), 200, headers);
}
export { joinRoom, loadRoom, saveRoom, indexRoom, isMember, memberOf, publicRoom, publicLap };

/* ———————————————— Telegram Stars (webhook) ———————————————— */

/** pre_checkout_query → answerPreCheckoutQuery (must answer within 10 s). */
export async function roomsPreCheckout(env, q, h) {
  const fail = async (msg) => {
    await h.tgCall(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok: false, error_message: msg });
    return { ok: false, msg };
  };
  if (!q || typeof q.id !== 'string') return { ok: false, msg: 'bad query' };
  const mm = String(q.invoice_payload || '').match(PAYLOAD_RE);
  if (!mm) return await fail(PAY.errStale);
  if (q.currency !== 'XTR' || Number(q.total_amount) !== ROOM_SEASON_STARS) return await fail(PAY.errPrice);
  const room = await loadRoom(env.PITLANE, mm[1], h);
  if (!room) return await fail(PAY.errRoom);
  const payerPid = await env.PITLANE.get(h.providerKey('tg', String(q.from?.id || '')));
  if (!payerPid || !isMember(room, payerPid)) return await fail(PAY.errMember);
  await h.tgCall(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok: true });
  return { ok: true, roomId: room.id };
}

/** message.successful_payment → extend the room season once per telegram_payment_charge_id. */
export async function roomsSuccessfulPayment(env, msg, h) {
  const sp = msg?.successful_payment;
  const charge = String(sp?.telegram_payment_charge_id || '').slice(0, 128);
  if (!sp || !charge) return { ok: false, msg: 'no charge' };
  const ckey = 'paycharge:' + charge;
  if (await env.PITLANE.get(ckey)) return { ok: true, duplicate: true };
  const mm = String(sp.invoice_payload || '').match(PAYLOAD_RE);
  // financial record (refundStarPayment needs user_id + charge id); no pilot uuid so account deletion stays clean
  const rec = { at: Date.now(), stars: Number(sp.total_amount) || 0, currency: sp.currency, tg: String(msg.from?.id || '') };
  if (!mm || sp.currency !== 'XTR') {
    await env.PITLANE.put(ckey, JSON.stringify({ ...rec, error: 'bad payload' }));
    return { ok: false, msg: 'bad payload' };
  }
  const room = await loadRoom(env.PITLANE, mm[1], h);
  if (!room) {
    await env.PITLANE.put(ckey, JSON.stringify({ ...rec, roomId: mm[1], error: 'room missing' }));
    return { ok: false, msg: 'room missing' };
  }
  const now = Date.now();
  const base = Math.max(now, Number(room.paidUntil) || 0);
  room.paidUntil = base + ROOM_SEASON_DAYS * DAY;
  room.payments = Array.isArray(room.payments) ? room.payments : [];
  room.payments.push({ charge, by: mm[2], tg: rec.tg, stars: rec.stars, at: now, until: room.paidUntil });
  room.payments = room.payments.slice(-50);
  await env.PITLANE.put(ckey, JSON.stringify({ ...rec, roomId: room.id, until: room.paidUntil }));
  await saveRoom(env.PITLANE, room);
  const until = new Date(room.paidUntil).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
  if (Number.isSafeInteger(msg.chat?.id)) {
    const m = msgSeasonPaid({ name: h.safeName(room.name, 'команда'), until, roomId: room.id });
    await h.tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      text: m.text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: m.keyboard },
    });
  }
  return { ok: true, roomId: room.id, paidUntil: room.paidUntil };
}

/* ———————————————— account deletion ———————————————— */
export const ROOM_RL_BUCKETS = ['mycar', 'room', 'rjoin', 'rlap', 'rpay', 'rinv'];

/** Remove a pilot from every room (laps, membership, payment attribution) + their active car. */
export async function deleteAccountRooms(kv, pid, h) {
  const rep = { roomsLeft: 0, roomsDeleted: 0, roomLaps: 0 };
  await kv.delete('mycar:' + pid);
  const ids = new Set(((await h.kvJson(kv, 'roomidx:' + pid)) || []).filter(Boolean));
  for (const k of await h.kvListAll(kv, 'room:')) ids.add(k.name.slice(5));
  for (const rid of ids) {
    const room = await loadRoom(kv, rid, h);
    if (!room) continue;
    const was = isMember(room, pid) || room.createdBy === pid || (room.payments || []).some((p) => p.by === pid) || (room.requests || []).some((r) => r.pilotId === pid);
    if (!was) continue;
    room.members = (room.members || []).filter((m) => m.pilotId !== pid);
    room.requests = (room.requests || []).filter((r) => r.pilotId !== pid);
    for (const p of room.payments || []) if (p.by === pid) { p.by = null; p.tg = null; }
    const laps = await h.readListRaw(kv, 'roomlaps:' + rid);
    const kept = laps.filter((l) => l.pilotId !== pid);
    rep.roomLaps += laps.length - kept.length;
    if (!room.members.length) {
      await kv.delete('room:' + rid);
      await kv.delete('roomlaps:' + rid);
      if (room.invite) await kv.delete('roominv:' + room.invite);
      if (h.onRoomDeleted) await h.onRoomDeleted(kv, room);
      rep.roomsDeleted++;
      continue;
    }
    if (room.createdBy === pid) room.createdBy = room.members[0].pilotId;
    if (!room.members.some((m) => m.role === 'captain')) room.members[0].role = 'captain';
    if (kept.length !== laps.length) await kv.put('roomlaps:' + rid, JSON.stringify(kept));
    if (h.onRoomMemberDeleted) await h.onRoomMemberDeleted(kv, room, pid);
    await saveRoom(kv, room);
    rep.roomsLeft++;
  }
  await kv.delete('roomidx:' + pid);
  return rep;
}
