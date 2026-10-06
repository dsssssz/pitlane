/**
 * v98: команды (поверх комнат экипажей v97).
 * Публично: профиль команды (имя, аватар, описание, участники с ролями) + лента.
 * Приватно (как v97, только участники): дуэли, топ комнаты, круги/сессии, оплаченный сезон — в rooms.js.
 *
 * KV:
 *   room:<id>            + about, listed, avatarV, requests[] (поля в той же записи комнаты)
 *   teamav:<id>          { mime, b64, v, at }            аватар (≤150 KB webp/jpeg, сжат на клиенте)
 *   teamfeed:<id>        [post] (старые → новые, ≤ TEAM_FEED_CAP)
 *   teamimg:<postId>     { mime, b64 }                   фото поста (≤150 KB)
 *   teamidx              [{ id, name, n, at, av, listed }] — список/поиск команд
 */
import { loadRoom, saveRoom, indexRoom, isMember, memberOf, roomQuota, ROOM_MAX_MEMBERS, ROOM_MAX_JOINED } from './rooms.js';

export const TEAM_ABOUT_MAX = 280;
export const TEAM_POST_MAX = 600;
export const TEAM_FEED_CAP = 200;
export const TEAM_REQ_MAX = 30;
export const TEAM_INDEX_CAP = 2000;
export const TEAM_POSTS_PER_DAY = 20; // на пилота
export const TEAM_POSTS_PER_TEAM_DAY = 80;
export const TEAM_IMAGES_PER_DAY = 10; // фото в постах + аватары, на пилота
export const TEAM_RL_BUCKETS = ['tpost', 'tpostt', 'timg', 'treq', 'tedit', 'tmod', 'tduel'];

const POST_ID_RE = /^p[a-z0-9]{8,24}$/;
const LAP_ID_RE = /^l[a-z0-9]{8,24}$/;
const DAY = 86400;
export const TEAM_REQ_TTL_MS = 14 * DAY * 1000;

function publicPost(p, viewer, room, h) {
  const me = viewer ? memberOf(room, viewer) : null;
  return {
    id: p.id,
    kind: p.kind,
    nick: h.safeName(p.nick),
    role: p.role === 'captain' ? 'captain' : 'member',
    text: p.text || '',
    img: !!p.img,
    at: p.at,
    meta: p.meta || null,
    mine: !!viewer && p.by === viewer,
    canDelete: !!viewer && (p.by === viewer || me?.role === 'captain'),
  };
}

export function teamPublic(room, viewer, h) {
  const me = viewer ? memberOf(room, viewer) : null;
  return {
    id: room.id,
    name: h.safeName(room.name, 'команда'),
    about: room.about || '',
    avatarV: room.avatarV || null,
    listed: room.listed !== false,
    createdAt: room.createdAt,
    members: (room.members || []).map((m) => ({ nick: h.safeName(m.nick), role: m.role === 'captain' ? 'captain' : 'member' })),
    memberCount: (room.members || []).length,
    viewer: {
      member: !!me,
      role: me ? me.role : null,
      requested: !!viewer && (room.requests || []).some((r) => r.pilotId === viewer),
    },
  };
}

/** Keep the team list/search index in sync (cheap single key). */
export async function syncTeamIndex(kv, room, h, remove = false) {
  let idx = (await h.kvJson(kv, 'teamidx')) || [];
  if (!Array.isArray(idx)) idx = [];
  idx = idx.filter((x) => x && x.id !== room.id);
  if (!remove && (room.members || []).length) {
    idx.unshift({ id: room.id, name: h.safeName(room.name, 'команда'), n: room.members.length, at: room.createdAt || Date.now(), av: room.avatarV || null, listed: room.listed !== false, about: String(room.about || '').slice(0, 90) });
  }
  await kv.put('teamidx', JSON.stringify(idx.slice(0, TEAM_INDEX_CAP)));
}

async function readFeed(kv, id, h) {
  const f = await h.kvJson(kv, 'teamfeed:' + id);
  return Array.isArray(f) ? f : [];
}
async function writeFeed(kv, id, feed) {
  const drop = feed.length > TEAM_FEED_CAP ? feed.slice(0, feed.length - TEAM_FEED_CAP) : [];
  for (const p of drop) if (p.img) await kv.delete('teamimg:' + p.id);
  await kv.put('teamfeed:' + id, JSON.stringify(feed.slice(-TEAM_FEED_CAP)));
}
function newPostId(h) { return 'p' + Date.now().toString(36) + h.randB36(8); }

function imageResponse(b, headers) {
  const bin = atob(b.b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': b.mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

function lapMs(l) { const n = Number(l?.ms); return Number.isFinite(n) && n > 0 ? n : null; }
function honest(l) { return !!l && l.valid && (l.gpsQ === 'A' || l.gpsQ === 'B') && lapMs(l) != null; }

/** Auto-post «новый лучший круг» — only if the lap is marked public. */
export async function teamsOnLap(env, room, lap, laps, h) {
  if (!lap?.public || !honest(lap)) return null;
  const prev = laps.filter((l) => l.id !== lap.id && l.trackId === lap.trackId && honest(l));
  let best = null;
  for (const l of prev) if (!best || l.ms < best.ms) best = l;
  if (best && lap.ms >= best.ms) return null;
  const kv = env.PITLANE;
  const me = memberOf(room, lap.pilotId);
  const feed = await readFeed(kv, room.id, h);
  const post = {
    id: newPostId(h), kind: 'best', by: lap.pilotId, nick: me?.nick || lap.nick, role: me?.role || 'member', text: '', img: 0, at: Date.now(),
    // the previous holder is named only if that lap was public too (private laps never leak into the public feed)
    meta: { trackId: lap.trackId, t: lap.t, model: lap.model, tyre: lap.tyre, prevNick: best && best.public && best.pilotId !== lap.pilotId ? h.safeName(best.nick) : null, delta: best && best.public ? best.ms - lap.ms : null },
  };
  feed.push(post);
  await writeFeed(kv, room.id, feed);
  return post;
}

/** Account deletion: drop the pilot's posts (+ images); for deleted rooms wipe everything. */
export async function teamsOnMemberDeleted(kv, room, pid, h) {
  const feed = await readFeed(kv, room.id, h);
  const kept = [];
  for (const p of feed) {
    if (p.by === pid) { if (p.img) await kv.delete('teamimg:' + p.id); continue; }
    kept.push(p);
  }
  if (kept.length !== feed.length) await kv.put('teamfeed:' + room.id, JSON.stringify(kept));
  await syncTeamIndex(kv, room, h);
}
export async function teamsOnRoomDeleted(kv, room, h) {
  const feed = await readFeed(kv, room.id, h);
  for (const p of feed) if (p.img) await kv.delete('teamimg:' + p.id);
  await kv.delete('teamfeed:' + room.id);
  await kv.delete('teamav:' + room.id);
  await syncTeamIndex(kv, room, h, true);
}

export async function teamsRoute(ctx) {
  const { req, env, path, url, pilot, headers, ip, h } = ctx;
  if (path !== '/teams' && !path.startsWith('/teams/')) return null;
  const kv = env.PITLANE;
  // v102: only a signed-in account counts as viewer (guest device ids are client-chosen)
  const viewer = pilot && pilot.authed && pilot.id ? pilot.id : null;

  // —— public: list / search ——
  if (path === '/teams' && req.method === 'GET') {
    if (await h.burstLimited(env, 'RL_READ', ip)) return h.json({ error: 'rate limit', retry: 60 }, 429, headers);
    const q = h.cleanLabel(url.searchParams.get('q'), 40).toLowerCase();
    let idx = (await h.kvJson(kv, 'teamidx')) || [];
    if (!Array.isArray(idx)) idx = [];
    let rows = idx.filter((x) => x && x.listed !== false);
    if (q) rows = rows.filter((x) => String(x.name || '').toLowerCase().includes(q));
    rows.sort((a, b) => (b.n || 0) - (a.n || 0) || (b.at || 0) - (a.at || 0));
    return h.json({ teams: rows.slice(0, 60).map((x) => ({ id: x.id, name: x.name, memberCount: x.n, avatarV: x.av || null, about: x.about || '' })) }, 200, headers);
  }

  let m = path.match(/^\/teams\/([^/]+)(?:\/([a-z]+)(?:\/([^/]+)(?:\/([a-z]+))?)?)?$/);
  if (!m) return h.json({ error: 'not found' }, 404, headers);
  const room = await loadRoom(kv, h.safeDecode(m[1]), h);
  const sub = m[2] || '';
  const arg = m[3] ? h.safeDecode(m[3]) : '';
  const act = m[4] || '';
  if (!room || !(room.members || []).length) return h.json({ error: 'not found' }, 404, headers);

  // —— public reads ——
  if (req.method === 'GET') {
    if (sub === 'avatar' || sub === 'img') {
      if (await h.burstLimited(env, 'RL_GHOST', ip)) return h.json({ error: 'rate limit', retry: 60 }, 429, { ...headers, 'Retry-After': '60' });
      let b = null;
      if (sub === 'avatar') b = await h.kvJson(kv, 'teamav:' + room.id);
      else if (POST_ID_RE.test(arg)) {
        const feed = await readFeed(kv, room.id, h);
        if (feed.some((p) => p.id === arg && p.img)) b = await h.kvJson(kv, 'teamimg:' + arg);
      }
      if (!b || !b.b64 || (b.mime !== 'image/webp' && b.mime !== 'image/jpeg')) return h.json({ error: 'not found' }, 404, headers);
      return imageResponse(b, headers);
    }
    if (await h.burstLimited(env, 'RL_READ', ip)) return h.json({ error: 'rate limit', retry: 60 }, 429, headers);
    if (!sub) return h.json(teamPublic(room, viewer, h), 200, headers);
    if (sub === 'feed') {
      const feed = await readFeed(kv, room.id, h);
      const before = Number(url.searchParams.get('before')) || Infinity;
      const page = feed.filter((p) => p.at < before).slice(-30).reverse();
      return h.json({ posts: page.map((p) => publicPost(p, viewer, room, h)), more: feed.filter((p) => p.at < before).length > page.length }, 200, headers);
    }
    return h.json({ error: 'not found' }, 404, headers);
  }

  // —— everything else needs an account ——
  const denied = h.requireAuth(pilot, headers);
  if (denied) return denied;
  const me = memberOf(room, pilot.id);

  // «Попроситься» в команду
  if (sub === 'request' && !arg) {
    if (req.method === 'DELETE') {
      // v102: rate-limited + write only when something actually changed (no KV write amplification)
      const limD = await h.limitOr429(env, headers, [['rl:treqd:p:' + pilot.id, 30, 3600]]);
      if (limD) return limD;
      const reqs = Array.isArray(room.requests) ? room.requests : [];
      const rest = reqs.filter((r) => r.pilotId !== pilot.id);
      if (rest.length !== reqs.length) {
        room.requests = rest;
        await saveRoom(kv, room);
      }
      return h.json({ ok: true }, 200, headers);
    }
    if (req.method !== 'POST') return h.json({ error: 'method' }, 405, headers);
    if (me) return h.json({ error: 'already member' }, 409, headers);
    const lim = await h.limitOr429(env, headers, [['rl:treq:ip:' + ip, 20, 3600], ['rl:treq:p:' + pilot.id, 10, DAY]]);
    if (lim) return lim;
    const body = await h.readJson(req, 2048);
    room.requests = Array.isArray(room.requests) ? room.requests : [];
    // v102: stale requests (no answer in 14 days) expire so sockpuppets can't keep the list full forever
    const nowR = Date.now();
    room.requests = room.requests.filter((r) => r && nowR - (Number(r.at) || 0) < TEAM_REQ_TTL_MS);
    if (room.requests.some((r) => r.pilotId === pilot.id)) return h.json({ ok: true, requested: true }, 200, headers);
    if (room.requests.length >= TEAM_REQ_MAX) return h.json({ error: 'too many requests' }, 409, headers);
    if ((room.members || []).length >= ROOM_MAX_MEMBERS) return h.json({ error: 'room full', max: ROOM_MAX_MEMBERS }, 409, headers);
    const note = h.cleanText(body?.note, 140);
    room.requests.push({ pilotId: pilot.id, nick: h.safeName(body?.nick || pilot.name), at: Date.now(), note: h.containsPhone(note) ? '' : note });
    await saveRoom(kv, room);
    return h.json({ ok: true, requested: true }, 200, headers);
  }

  if (!me) return h.json({ error: 'members only' }, 403, headers);
  const captain = me.role === 'captain';

  // профиль команды (капитан)
  if (!sub && req.method === 'PUT') {
    if (!captain) return h.json({ error: 'captain only' }, 403, headers);
    const lim = await h.limitOr429(env, headers, [['rl:tedit:p:' + pilot.id, 30, 3600]]);
    if (lim) return lim;
    const body = await h.readJson(req, 4096);
    if (body?.name != null) {
      const name = h.cleanLabel(body.name, 48);
      if (!name || h.containsPhone(name)) return h.json({ error: 'name required' }, 400, headers);
      room.name = name;
    }
    if (body?.about != null) {
      const about = h.cleanText(body.about, TEAM_ABOUT_MAX);
      if (h.containsPhone(about)) return h.json({ error: 'no phone numbers' }, 400, headers);
      room.about = about;
    }
    if (body?.listed != null) room.listed = body.listed !== false;
    await saveRoom(kv, room);
    await syncTeamIndex(kv, room, h);
    return h.json(teamPublic(room, pilot.id, h), 200, headers);
  }

  if (sub === 'avatar' && req.method === 'PUT') {
    if (!captain) return h.json({ error: 'captain only' }, 403, headers);
    const lim = await h.limitOr429(env, headers, [['rl:timg:p:' + pilot.id, TEAM_IMAGES_PER_DAY, DAY]]);
    if (lim) return lim;
    const body = await h.readJson(req, 260 * 1024);
    if (body?.image === null) {
      await kv.delete('teamav:' + room.id);
      room.avatarV = null;
    } else {
      const img = h.sanitizeBannerImage(body?.image);
      if (img.error) return h.json({ error: img.error.replace('banner', 'image') }, 400, headers);
      const v = Date.now().toString(36);
      await kv.put('teamav:' + room.id, JSON.stringify({ mime: img.mime, b64: img.b64, v, at: Date.now() }));
      room.avatarV = v;
    }
    await saveRoom(kv, room);
    await syncTeamIndex(kv, room, h);
    return h.json(teamPublic(room, pilot.id, h), 200, headers);
  }

  // лента: пост участника (текст + фото по желанию)
  if (sub === 'posts' && !arg && req.method === 'POST') {
    const lim = await h.limitOr429(env, headers, [['rl:tpost:p:' + pilot.id, TEAM_POSTS_PER_DAY, DAY], ['rl:tpostt:t:' + room.id, TEAM_POSTS_PER_TEAM_DAY, DAY]]);
    if (lim) return lim;
    const body = await h.readJson(req, 260 * 1024);
    const text = h.cleanText(body?.text, TEAM_POST_MAX + 1);
    if (text.length > TEAM_POST_MAX) return h.json({ error: 'text too long', max: TEAM_POST_MAX }, 400, headers);
    if (h.containsPhone(text)) return h.json({ error: 'no phone numbers' }, 400, headers);
    let img = null;
    if (body?.image) {
      const ilim = await h.limitOr429(env, headers, [['rl:timg:p:' + pilot.id, TEAM_IMAGES_PER_DAY, DAY]]);
      if (ilim) return ilim;
      img = h.sanitizeBannerImage(body.image);
      if (img.error) return h.json({ error: img.error.replace('banner', 'image') }, 400, headers);
    }
    if (!text && !img) return h.json({ error: 'empty post' }, 400, headers);
    const post = { id: newPostId(h), kind: 'post', by: pilot.id, nick: me.nick, role: me.role, text, img: img ? 1 : 0, at: Date.now(), meta: null };
    if (img) await kv.put('teamimg:' + post.id, JSON.stringify({ mime: img.mime, b64: img.b64 }));
    const feed = await readFeed(kv, room.id, h);
    feed.push(post);
    await writeFeed(kv, room.id, feed);
    return h.json({ ok: true, post: publicPost(post, pilot.id, room, h) }, 200, headers);
  }

  // удалить пост: капитан — любой, участник — свой
  if (sub === 'posts' && arg && !act && req.method === 'DELETE') {
    if (!POST_ID_RE.test(arg)) return h.json({ error: 'not found' }, 404, headers);
    const lim = await h.limitOr429(env, headers, [['rl:tmod:p:' + pilot.id, 120, 3600]]);
    if (lim) return lim;
    const feed = await readFeed(kv, room.id, h);
    const p = feed.find((x) => x.id === arg);
    if (!p) return h.json({ error: 'not found' }, 404, headers);
    if (p.by !== pilot.id && !captain) return h.json({ error: 'captain only' }, 403, headers);
    if (p.img) await kv.delete('teamimg:' + p.id);
    await kv.put('teamfeed:' + room.id, JSON.stringify(feed.filter((x) => x.id !== arg)));
    return h.json({ ok: true }, 200, headers);
  }

  // «выиграл дуэль» в ленту — только если оба круга помечены публичными
  if (sub === 'duelpost' && req.method === 'POST') {
    const lim = await h.limitOr429(env, headers, [['rl:tduel:p:' + pilot.id, 20, DAY]]);
    if (lim) return lim;
    if (roomQuota(room, h).locked) return h.json({ error: 'season required', code: 'ROOM_PAYWALL', reason: 'locked', title: 'Экипаж оплачивает сезон', quota: roomQuota(room, h) }, 402, headers);
    const body = await h.readJson(req, 1024);
    const a = String(body?.a || ''); const b = String(body?.b || '');
    if (!LAP_ID_RE.test(a) || !LAP_ID_RE.test(b) || a === b) return h.json({ error: 'two laps required' }, 400, headers);
    const laps = await h.readListRaw(kv, 'roomlaps:' + room.id);
    const A = laps.find((l) => l.id === a); const B = laps.find((l) => l.id === b);
    if (!A || !B) return h.json({ error: 'lap not found' }, 404, headers);
    if (A.trackId !== B.trackId) return h.json({ error: 'different tracks', code: 'TRACK_MISMATCH' }, 400, headers);
    if (!A.public || !B.public) return h.json({ error: 'both laps must be public', code: 'NOT_PUBLIC' }, 409, headers);
    if (A.pilotId === B.pilotId) return h.json({ error: 'same pilot' }, 400, headers);
    if (A.pilotId !== pilot.id && B.pilotId !== pilot.id && !captain) return h.json({ error: 'own duels only' }, 403, headers);
    const [W, L] = lapMs(A) <= lapMs(B) ? [A, B] : [B, A];
    const k = [a, b].sort().join('|');
    const feed = await readFeed(kv, room.id, h);
    if (feed.some((p) => p.kind === 'duel' && p.meta?.k === k)) return h.json({ ok: true, dup: true }, 200, headers);
    const wm = memberOf(room, W.pilotId);
    const post = { id: newPostId(h), kind: 'duel', by: W.pilotId, nick: wm?.nick || W.nick, role: wm?.role || 'member', text: '', img: 0, at: Date.now(),
      meta: { k, trackId: W.trackId, t: W.t, model: W.model, tyre: W.tyre, vsNick: h.safeName(L.nick), vsT: L.t, delta: lapMs(L) - lapMs(W) } };
    feed.push(post);
    await writeFeed(kv, room.id, feed);
    return h.json({ ok: true, post: publicPost(post, pilot.id, room, h) }, 200, headers);
  }

  // заявки: капитан принимает / отклоняет
  if (sub === 'requests' && arg && (act === 'approve' || act === 'decline') && req.method === 'POST') {
    if (!captain) return h.json({ error: 'captain only' }, 403, headers);
    const lim = await h.limitOr429(env, headers, [['rl:tmod:p:' + pilot.id, 120, 3600]]);
    if (lim) return lim;
    const reqs = Array.isArray(room.requests) ? room.requests : [];
    const r = reqs.find((x) => h.pubId(x.pilotId) === arg);
    if (!r) return h.json({ error: 'not found' }, 404, headers);
    room.requests = reqs.filter((x) => x !== r);
    if (act === 'approve' && !isMember(room, r.pilotId)) {
      if ((room.members || []).length >= ROOM_MAX_MEMBERS) return h.json({ error: 'room full', max: ROOM_MAX_MEMBERS }, 409, headers);
      const idx = (await h.kvJson(kv, 'roomidx:' + r.pilotId)) || [];
      if (idx.length >= ROOM_MAX_JOINED) return h.json({ error: 'too many rooms', max: ROOM_MAX_JOINED }, 409, headers);
      room.members.push({ pilotId: r.pilotId, nick: h.safeName(r.nick), role: 'member', joinedAt: Date.now() });
      await indexRoom(kv, r.pilotId, room.id, h);
    }
    await saveRoom(kv, room);
    await syncTeamIndex(kv, room, h);
    return h.json({ ok: true }, 200, headers);
  }

  // участники: капитан убирает участника или передаёт капитанство
  if (sub === 'members' && arg && (act === 'remove' || act === 'captain') && req.method === 'POST') {
    if (!captain) return h.json({ error: 'captain only' }, 403, headers);
    const lim = await h.limitOr429(env, headers, [['rl:tmod:p:' + pilot.id, 120, 3600]]);
    if (lim) return lim;
    const target = (room.members || []).find((x) => h.pubId(x.pilotId) === arg);
    if (!target || target.pilotId === pilot.id) return h.json({ error: 'not found' }, 404, headers);
    if (act === 'remove') {
      room.members = room.members.filter((x) => x !== target);
      await indexRoom(kv, target.pilotId, room.id, h, true);
    } else {
      target.role = 'captain';
      me.role = 'member';
    }
    await saveRoom(kv, room);
    await syncTeamIndex(kv, room, h);
    return h.json(teamPublic(room, pilot.id, h), 200, headers);
  }

  return h.json({ error: 'not found' }, 404, headers);
}
