/**
 * v115: музыка в профиле (как в Telegram). Своего хранилища нет: пилот пересылает аудио боту, Worker сохраняет
 * file_id + метаданные, привязанные к автору сообщения (auth:tg:<from.id> → pilot). Mini App играет через
 * стрим-прокси Worker: getFile → api.telegram.org/file/bot<token>/… (токен не уходит ни на клиент, ни в URL ответа).
 * Прокси отдаёт только файлы из списков профилей; Range пробрасывается (iOS); лимиты — на новые проигрывания.
 *
 * KV: music:<pilotId>  { tracks: [{ id, fid, fu, title, performer, dur, size, mime, thumb, at }] }  (≤ MUSIC_MAX)
 */
export const MUSIC_MAX = 3;
export const MUSIC_MAX_BYTES = 20 * 1024 * 1024; // Bot API getFile: файлы до 20 МБ
const TRACK_ID_RE = /^t[a-z0-9]{6,20}$/;
const PID_RE = /^p_[0-9a-f-]{36}$/;
const MIME_RE = /^audio\/[a-z0-9.+-]{1,40}$/;
const RANGE_RE = /^bytes=\d{0,12}-\d{0,12}$/;

export async function loadMusic(kv, pid, h) {
  if (!PID_RE.test(String(pid || ''))) return [];
  const r = await h.kvJson(kv, 'music:' + pid);
  return Array.isArray(r?.tracks) ? r.tracks.slice(0, MUSIC_MAX) : [];
}
async function saveMusic(kv, pid, tracks) {
  if (!tracks.length) { await kv.delete('music:' + pid); return; }
  await kv.put('music:' + pid, JSON.stringify({ tracks: tracks.slice(0, MUSIC_MAX), at: Date.now() }));
}
/** Public shape: no Telegram file ids. */
export function publicTrack(t) {
  return { id: t.id, title: t.title || 'Без названия', performer: t.performer || '', dur: t.dur || null, cover: !!t.thumb };
}

/** Audio from the bot chat → profile. Returns { text } for the reply (HTML-escaped by caller's tgEsc). */
export async function musicFromBot(env, msg, h) {
  const a = msg.audio || (msg.document && MIME_RE.test(String(msg.document.mime_type || '')) ? msg.document : null);
  if (!a) return null;
  const kv = env.PITLANE;
  const pid = await kv.get(h.providerKey('tg', String(msg.from?.id || '')));
  if (!pid || !PID_RE.test(pid)) return { kind: 'nologin', text: '<b>Сначала вход</b>\nОткрой PITLANE кнопкой ниже и войди через Telegram — тогда трек привяжется к твоему профилю. Потом перешли аудио сюда ещё раз.' };
  if (Number(a.file_size) > MUSIC_MAX_BYTES) return { kind: 'big', text: '<b>Файл больше 20 МБ</b>\nTelegram не даёт ботам забирать такие файлы. Пришли версию поменьше (например, mp3 до 20 МБ).' };
  if (await h.rateHit(kv, 'rl:music:p:' + pid, 20, 86400)) return { kind: 'limited', text: 'Слишком много треков за сутки — попробуй завтра.' };
  const tracks = await loadMusic(kv, pid, h);
  if (tracks.some((t) => t.fu && t.fu === a.file_unique_id)) return { kind: 'dup', text: 'Этот трек уже в твоём профиле.' };
  if (tracks.length >= MUSIC_MAX) return { kind: 'full', text: '<b>В профиле уже 3 трека</b>\nУдали один в PITLANE → Профиль → Музыка и пришли новый.' };
  const base = String(a.file_name || '').replace(/\.[a-z0-9]{1,5}$/i, '');
  const title = h.cleanLabel(a.title || base, 80) || 'Без названия';
  const performer = h.cleanLabel(a.performer, 80);
  const t = {
    id: 't' + h.randB36(10),
    fid: String(a.file_id || '').slice(0, 256),
    fu: String(a.file_unique_id || '').slice(0, 64),
    title: h.containsPhone(title) ? 'Без названия' : title,
    performer: h.containsPhone(performer) ? '' : performer,
    dur: Number.isFinite(Number(a.duration)) ? Math.max(0, Math.min(36000, Math.round(Number(a.duration)))) : null,
    size: Number(a.file_size) || null,
    mime: MIME_RE.test(String(a.mime_type || '')) ? a.mime_type : 'audio/mpeg',
    thumb: (a.thumbnail || a.thumb)?.file_id ? String((a.thumbnail || a.thumb).file_id).slice(0, 256) : null,
    at: Date.now(),
  };
  if (!t.fid) return null;
  tracks.push(t);
  await saveMusic(kv, pid, tracks);
  return { kind: 'added', text: '<b>Трек в профиле</b>\n«' + h.tgEsc(t.title) + '»' + (t.performer ? ' — ' + h.tgEsc(t.performer) : '') + ' (' + tracks.length + '/' + MUSIC_MAX + ').\nПорядок и удаление — в PITLANE → Профиль → Музыка.' };
}

async function tgFilePath(env, fileId, h) {
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const ck = cache ? new Request('https://tgfile.cache/' + encodeURIComponent(fileId)) : null;
  if (cache) { const hit = await cache.match(ck); if (hit) return await hit.text(); }
  const r = await h.tgCall(env, 'getFile', { file_id: fileId });
  const p = r?.ok && typeof r.result?.file_path === 'string' ? r.result.file_path : null;
  if (p && cache) { try { await cache.put(ck, new Response(p, { headers: { 'Cache-Control': 'max-age=3000' } })); } catch (_) {} }
  return p;
}

/** /me/music (GET, PUT order, DELETE /:id) · /music/<pid> · /music/<pid>/<tid>/(audio|cover) */
export async function musicRoute(ctx) {
  const { req, env, path, headers, ip, pilot, h } = ctx;
  if (!(path === '/me/music' || path.startsWith('/me/music/') || path.startsWith('/music/'))) return null;
  const kv = env.PITLANE;
  if (path === '/me/music' || path.startsWith('/me/music/')) {
    const denied = h.requireAuth(pilot, headers);
    if (denied) return denied;
    const tracks = await loadMusic(kv, pilot.id, h);
    if (req.method === 'GET' && path === '/me/music') return h.json({ ok: true, tracks: tracks.map(publicTrack), max: MUSIC_MAX, bot: h.botUsername(env) }, 200, headers);
    const lim = await h.limitOr429(env, headers, [['rl:musicw:p:' + pilot.id, 60, 3600]]);
    if (lim) return lim;
    if (req.method === 'PUT' && path === '/me/music') {
      const body = await h.readJson(req, 2048);
      const ids = Array.isArray(body?.order) ? body.order.map(String) : null;
      if (!ids || ids.length !== tracks.length || new Set(ids).size !== ids.length || !ids.every((id) => tracks.some((t) => t.id === id))) return h.json({ error: 'bad order' }, 400, headers);
      const next = ids.map((id) => tracks.find((t) => t.id === id));
      await saveMusic(kv, pilot.id, next);
      return h.json({ ok: true, tracks: next.map(publicTrack) }, 200, headers);
    }
    const m = path.match(/^\/me\/music\/([^/]+)$/);
    if (req.method === 'DELETE' && m) {
      const id = h.safeDecode(m[1]);
      if (!TRACK_ID_RE.test(id) || !tracks.some((t) => t.id === id)) return h.json({ error: 'not found' }, 404, headers);
      const next = tracks.filter((t) => t.id !== id);
      await saveMusic(kv, pilot.id, next);
      return h.json({ ok: true, tracks: next.map(publicTrack) }, 200, headers);
    }
    return h.json({ error: 'method' }, 405, headers);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return h.json({ error: 'method' }, 405, headers);
  let m = path.match(/^\/music\/([^/]+)$/);
  if (m) {
    const pid = h.safeDecode(m[1]);
    if (!PID_RE.test(pid)) return h.json({ error: 'not found' }, 404, headers);
    return h.json({ ok: true, tracks: (await loadMusic(kv, pid, h)).map(publicTrack) }, 200, headers);
  }
  m = path.match(/^\/music\/([^/]+)\/([^/]+)\/(audio|cover)$/);
  if (!m) return h.json({ error: 'not found' }, 404, headers);
  const pid = h.safeDecode(m[1]); const tid = h.safeDecode(m[2]); const kind = m[3];
  if (!PID_RE.test(pid) || !TRACK_ID_RE.test(tid)) return h.json({ error: 'not found' }, 404, headers);
  const t = (await loadMusic(kv, pid, h)).find((x) => x.id === tid); // only files listed in a profile
  const fid = t ? (kind === 'audio' ? t.fid : t.thumb) : null;
  if (!fid) return h.json({ error: 'not found' }, 404, headers);
  const range = req.headers.get('Range');
  if (range && !RANGE_RE.test(range)) return new Response(null, { status: 416, headers });
  // limits: new plays (no Range / from byte 0) and covers count; iOS range chunks of one play don't
  if (!range || /^bytes=0-/.test(range)) {
    const lim = await h.limitOr429(env, headers, [['rl:music:ip:' + ip, kind === 'audio' ? 120 : 300, 3600]]);
    if (lim) return lim;
  }
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return h.json({ error: 'unavailable' }, 503, headers);
  const fp = await tgFilePath(env, fid, h);
  if (!fp || !/^[A-Za-z0-9_./-]{1,200}$/.test(fp) || fp.includes('..')) return h.json({ error: 'file unavailable' }, 502, headers);
  const f = env.__fetch || fetch;
  const up = await f('https://api.telegram.org/file/bot' + token + '/' + fp, { method: 'GET', headers: range ? { Range: range } : {} });
  if (!up || (up.status !== 200 && up.status !== 206)) return h.json({ error: 'file unavailable' }, 502, headers);
  const out = new Headers(headers);
  out.set('Content-Type', kind === 'audio' ? (t.mime || 'audio/mpeg') : 'image/jpeg');
  out.set('Accept-Ranges', 'bytes');
  out.set('Cache-Control', 'public, max-age=3600');
  out.set('X-Content-Type-Options', 'nosniff');
  for (const k of ['Content-Length', 'Content-Range']) { const v = up.headers.get(k); if (v) out.set(k, v); }
  return new Response(req.method === 'HEAD' ? null : up.body, { status: up.status, headers: out });
}

export async function deleteAccountMusic(kv, pid) {
  const had = !!(await kv.get('music:' + pid));
  if (had) await kv.delete('music:' + pid);
  return { music: had ? 1 : 0 };
}
