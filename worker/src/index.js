/**
 * Pitlane shared tops API — Cloudflare Worker + KV
 * Bindings: PITLANE (KV namespace)
 * Env: SMS_DEMO ("0"=prod, no demoCode), TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, EXTRA_ORIGINS
 * Prod: set SMS_DEMO=0 + Twilio secrets. Demo OTP only when SMS_DEMO explicitly "1".
 *
 * Auth: POST /auth/verify → { token, phone, nick, user }
 * Session: KV sess:<token> → { phone, nick, at }; Authorization: Bearer <token>
 * X-Pilot-Id kept as soft fallback for reads; writes to tops/pulse/garage require session.
 */
const DEFAULT_ORIGINS = [
  'https://dsssssz.github.io',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

const SHARE_TTL = 30 * 24 * 60 * 60; // 30 days
const SESS_TTL = 90 * 24 * 60 * 60; // 90 days
const OTP_PHONE_LIMIT = 5; // per 15 min
const OTP_IP_LIMIT = 20; // soft per 15 min
const OTP_MAX_TRIES = 5; // bad verify attempts per code
const OTP_TTL_SEC = 600; // 10 min

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const extra = String(env.EXTRA_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allow = new Set([...DEFAULT_ORIGINS, ...extra]);
  const ok = allow.has(origin) ? origin : DEFAULT_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Pilot-Id, X-Pilot-Name',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

async function readList(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeList(kv, key, arr) {
  await kv.put(key, JSON.stringify(arr.slice(0, 200)));
}

function clientIp(req) {
  return (
    req.headers.get('CF-Connecting-IP') ||
    (req.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    '0.0.0.0'
  );
}

function randomToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Resolve session from Bearer token (preferred) or soft X-Pilot-Id fallback. */
async function resolvePilot(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(\S+)/i);
  if (m) {
    const token = m[1].trim();
    const raw = await env.PITLANE.get('sess:' + token);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        if (s?.phone) {
          return {
            id: String(s.phone).slice(0, 64),
            name: String(s.nick || '').slice(0, 48),
            token,
            authed: true,
          };
        }
      } catch (_) {}
    }
    return { id: '', name: '', token: null, authed: false, badToken: true };
  }
  const id = (req.headers.get('X-Pilot-Id') || '').trim().slice(0, 64);
  const name = (req.headers.get('X-Pilot-Name') || '').trim().slice(0, 48);
  return { id, name, token: null, authed: false };
}

function requireAuth(pilot, headers) {
  if (pilot.badToken) return json({ error: 'invalid session' }, 401, headers);
  if (!pilot.authed || !pilot.id) return json({ error: 'auth required' }, 401, headers);
  return null;
}

/** Public tops: GPS + valid !== false; A/B preferred (C kept only if valid true and no teleport). */
function isValidGpsRow(r) {
  if (!r || !r.gps || r.valid === false) return false;
  if (Array.isArray(r.flags) && r.flags.includes('teleport')) return false;
  return true;
}

function computeValid(body) {
  const flags = Array.isArray(body?.flags)
    ? body.flags.map((f) => String(f).slice(0, 24)).slice(0, 8)
    : [];
  const gpsQ = body?.gpsQ === 'A' || body?.gpsQ === 'B' || body?.gpsQ === 'C' ? body.gpsQ : null;
  let valid = true;
  if (flags.includes('teleport') || flags.includes('speed')) valid = false;
  if (gpsQ === 'C') valid = false;
  if (gpsQ !== 'A' && gpsQ !== 'B' && gpsQ !== 'C') {
    // unknown grade: trust client only if explicitly true and no bad flags
    if (body?.valid === false) valid = false;
  }
  // Public tops: A/B only
  if (gpsQ !== 'A' && gpsQ !== 'B') valid = false;
  return { valid, gpsQ, flags };
}

function sanitizeWeather(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'dry' || s === 'damp' || s === 'wet') return s;
  return null;
}

function sanitizeStraight(body, pilot) {
  const t = Number(body?.t);
  if (!Number.isFinite(t) || t <= 0 || t > 60) return null;
  if (!body?.gps) return null;
  const name = String(body.name || pilot.name || 'пилот').slice(0, 48);
  const car = String(body.car || '').slice(0, 80);
  const { valid, gpsQ, flags } = computeValid(body);
  const row = {
    name,
    car,
    t: Math.round(t * 1000) / 1000,
    gps: true,
    valid,
    pilotId: pilot.id || null,
    at: Date.now(),
  };
  if (gpsQ) row.gpsQ = gpsQ;
  if (flags.length) row.flags = flags;
  if (body.avgAcc != null && Number.isFinite(Number(body.avgAcc))) {
    row.avgAcc = Math.round(Number(body.avgAcc) * 10) / 10;
  }
  if (body.hz != null && Number.isFinite(Number(body.hz))) {
    row.hz = Math.round(Number(body.hz) * 10) / 10;
  }
  const wxS = sanitizeWeather(body.weather);
  if (wxS) row.weather = wxS;
  return row;
}

function sanitizeAvatar(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^https:\/\//i.test(s) && s.length <= 500) return s;
  // data:image/jpeg|png|webp;base64,... — keep small thumbs only
  if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(s) && s.length <= 16000) return s;
  return null;
}

/** Cumulative sector marks [s1,s2,s3?] ms; must be increasing positive. */
function sanitizeSectors(body) {
  const raw = body?.sectors;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const out = [];
  for (let i = 0; i < Math.min(3, raw.length); i++) {
    const n = Number(raw[i]);
    if (!Number.isFinite(n) || n <= 0 || n > 3_600_000) return null;
    if (i > 0 && n <= out[i - 1]) return null;
    out.push(Math.round(n));
  }
  if (out.length < 2) return null;
  return out;
}

function sanitizeLap(body, pilot) {
  const t = String(body?.t || '').trim();
  if (!/^\d+:\d{2}(\.\d+)?$/.test(t)) return null;
  if (!body?.gps) return null;
  const name = String(body.name || pilot.name || 'пилот').slice(0, 48);
  const car = String(body.car || '').slice(0, 80);
  const { valid, gpsQ, flags } = computeValid(body);
  const row = {
    name,
    car,
    t,
    gps: true,
    valid,
    pilotId: pilot.id || null,
    at: Date.now(),
    dist: body.dist != null ? Number(body.dist) : undefined,
    slipAvg: body.slipAvg != null ? Number(body.slipAvg) : undefined,
  };
  if (gpsQ) row.gpsQ = gpsQ;
  if (flags.length) row.flags = flags;
  if (body.avgAcc != null && Number.isFinite(Number(body.avgAcc))) {
    row.avgAcc = Math.round(Number(body.avgAcc) * 10) / 10;
  }
  if (body.hz != null && Number.isFinite(Number(body.hz))) {
    row.hz = Math.round(Number(body.hz) * 10) / 10;
  }
  const wxL = sanitizeWeather(body.weather);
  if (wxL) row.weather = wxL;
  const sectors = sanitizeSectors(body);
  if (sectors) row.sectors = sectors;
  const ms = Number(body?.ms);
  if (Number.isFinite(ms) && ms > 0 && ms <= 3_600_000) row.ms = Math.round(ms);
  const av = sanitizeAvatar(body?.avatar);
  if (av) row.avatar = av;
  return row;
}

/** Cumulative → splits [S1,S2,S3]; null if incomplete. */
function sectorSplitsFromLap(lap) {
  const cum = lap && lap.sectors;
  if (!Array.isArray(cum) || cum.length < 2) return null;
  const c0 = Number(cum[0]);
  const c1 = Number(cum[1]);
  if (!Number.isFinite(c0) || !Number.isFinite(c1) || c1 <= c0 || c0 <= 0) return null;
  let c2 = cum[2] != null ? Number(cum[2]) : NaN;
  if (!Number.isFinite(c2) || c2 <= c1) {
    c2 = Number.isFinite(Number(lap.ms)) ? Number(lap.ms) : NaN;
  }
  if (!Number.isFinite(c2) || c2 <= c1) {
    // last resort: parse lap time string
    const fromT = parseLapMs(lap.t);
    c2 = fromT != null ? fromT : NaN;
  }
  if (!Number.isFinite(c2) || c2 <= c1) return null;
  return [c0, c1 - c0, c2 - c1];
}

function fmtSectorMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const sec = Math.max(0, ms) / 1000;
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(2).padStart(5, '0');
    return m + ':' + s;
  }
  return sec.toFixed(2) + 'с';
}

/**
 * Best A/B sector time per pilot for sectorIndex 0..2.
 * Rows must already be filtered for public tops honesty where possible.
 */
function buildSectorLeaderboard(rows, sectorIndex) {
  const idx = Math.max(0, Math.min(2, Number(sectorIndex) | 0));
  const best = new Map(); // key → row
  for (const r of rows || []) {
    if (!isAbLapRow(r)) continue;
    const sp = sectorSplitsFromLap(r);
    if (!sp || sp[idx] == null) continue;
    const key = r.pilotId ? ('id:' + r.pilotId) : ('n:' + String(r.name || '').toLowerCase());
    const ms = sp[idx];
    const prev = best.get(key);
    if (!prev || ms < prev.ms) {
      best.set(key, {
        name: String(r.name || 'пилот').slice(0, 48),
        car: String(r.car || '').slice(0, 80),
        pilotId: r.pilotId || null,
        gpsQ: r.gpsQ || null,
        weather: r.weather || null,
        at: r.at || null,
        ms,
        t: fmtSectorMs(ms),
        avatar: r.avatar || (prev && prev.avatar) || null,
        sector: idx,
      });
    } else if (prev && !prev.avatar && r.avatar) {
      prev.avatar = r.avatar;
    }
  }
  return [...best.values()].sort((a, b) => a.ms - b.ms).slice(0, 50);
}

async function rememberPilotMeta(kv, pilotId, name, avatar) {
  if (!pilotId) return;
  const key = 'pilotmeta:' + String(pilotId).slice(0, 64);
  let prev = {};
  const raw = await kv.get(key);
  if (raw) {
    try { prev = JSON.parse(raw) || {}; } catch { prev = {}; }
  }
  const next = {
    nick: String(name || prev.nick || 'пилот').slice(0, 48),
    avatar: avatar || prev.avatar || null,
    at: Date.now(),
  };
  await kv.put(key, JSON.stringify(next), { expirationTtl: SESS_TTL });
}

async function enrichSectorAvatars(kv, rows) {
  const need = [];
  for (const r of rows) {
    if (r && r.pilotId && !r.avatar) need.push(r);
  }
  if (!need.length) return rows;
  await Promise.all(
    need.map(async (r) => {
      try {
        const raw = await kv.get('pilotmeta:' + r.pilotId);
        if (!raw) return;
        const meta = JSON.parse(raw);
        if (meta && meta.avatar) r.avatar = meta.avatar;
        if (meta && meta.nick && (!r.name || r.name === 'пилот')) r.name = String(meta.nick).slice(0, 48);
      } catch (_) {}
    })
  );
  return rows;
}

function sanitizePulse(body, pilot) {
  const text = String(body?.text || '').trim().slice(0, 280);
  if (!text) return null;
  return {
    id: String(body.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    who: String(body.who || pilot.name || pilot.id || 'пилот').slice(0, 48),
    text,
    img: body.img ? String(body.img).slice(0, 200_000) : null,
    at: Date.now(),
    likes: [],
    pilotId: pilot.id || null,
  };
}

function shareId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function rateHit(kv, key, limit, ttlSec) {
  const raw = await kv.get(key);
  let n = 0;
  if (raw) {
    try {
      n = Number(JSON.parse(raw).n) || 0;
    } catch {
      n = Number(raw) || 0;
    }
  }
  n += 1;
  await kv.put(key, JSON.stringify({ n, at: Date.now() }), { expirationTtl: ttlSec });
  return n > limit;
}

/** Normalize RU mobiles to 11 digits starting with 7 (no +). */
function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  else if (d.length === 10) d = '7' + d;
  return d;
}

function isDemoSms(env) {
  // Explicit "1" only — unset/other treated as off when deploying prod with SMS_DEMO=0 var.
  // Legacy: if var missing entirely, default off after this release (wrangler.toml sets "0").
  return String(env.SMS_DEMO ?? '0') === '1';
}

function twilioConfigured(env) {
  return !!(env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_FROM);
}

/** Send OTP via Twilio. Never logs the code. Returns { ok, status }. */
async function sendTwilioSms(env, phone, code) {
  const sid = env.TWILIO_SID;
  const token = env.TWILIO_TOKEN;
  const from = env.TWILIO_FROM;
  if (!sid || !token || !from) return { ok: false, status: 0, reason: 'missing_creds' };
  const to = phone.startsWith('+') ? phone : '+' + phone;
  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: 'Pitlane код: ' + code,
  });
  const auth = btoa(sid + ':' + token);
  let res;
  try {
    res = await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json',
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + auth,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }
    );
  } catch (_) {
    return { ok: false, status: 0, reason: 'network' };
  }
  if (!res.ok && isDemoSms(env)) {
    // Dev only: surface Twilio HTTP status, never body (may echo To/From)
    console.warn('twilio sms failed', res.status);
  }
  return { ok: res.ok, status: res.status };
}


const DUEL_TTL = 7 * 24 * 60 * 60; // 7 days
const DUEL_TTL_MS = DUEL_TTL * 1000;

function duelId() {
  return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function parseLapMs(t) {
  const m = String(t || '').trim().match(/^(\d+):(\d{2})(?:\.(\d+))?$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const frac = m[3] ? Number('0.' + m[3]) : 0;
  if (!Number.isFinite(min) || !Number.isFinite(sec)) return null;
  return (min * 60 + sec + frac) * 1000;
}

function runScoreMs(type, run) {
  if (!run) return null;
  if (type === 'drag') {
    const t = Number(run.t);
    return Number.isFinite(t) && t > 0 ? t * 1000 : null;
  }
  return parseLapMs(run.t);
}

function refreshDuelStatus(d) {
  if (!d) return d;
  const now = Date.now();
  if (d.status !== 'ready' && d.expiresAt && now > d.expiresAt) {
    d.status = 'expired';
    d.winner = null;
    return d;
  }
  if (d.creatorRun && d.challengerRun && d.status !== 'expired') {
    d.status = 'ready';
    const a = runScoreMs(d.type, d.creatorRun);
    const b = runScoreMs(d.type, d.challengerRun);
    if (a == null || b == null) d.winner = null;
    else if (a < b) d.winner = 'creator';
    else if (b < a) d.winner = 'challenger';
    else d.winner = 'tie';
  } else if (d.status !== 'expired') {
    d.status = 'open';
    d.winner = null;
  }
  return d;
}

function sanitizeDuelRun(body, pilot, type) {
  if (type === 'drag') {
    const row = sanitizeStraight(body, pilot);
    if (!row || !row.valid || (row.gpsQ !== 'A' && row.gpsQ !== 'B')) return null;
    return {
      name: row.name,
      car: row.car,
      t: row.t,
      gps: true,
      valid: true,
      gpsQ: row.gpsQ,
      flags: row.flags || [],
      avgAcc: row.avgAcc,
      hz: row.hz,
      weather: row.weather || null,
      pilotId: pilot.id || null,
      at: Date.now(),
    };
  }
  if (type === 'lap') {
    const row = sanitizeLap(body, pilot);
    if (!row || !row.valid || (row.gpsQ !== 'A' && row.gpsQ !== 'B')) return null;
    return {
      name: row.name,
      car: row.car,
      t: row.t,
      gps: true,
      valid: true,
      gpsQ: row.gpsQ,
      flags: row.flags || [],
      avgAcc: row.avgAcc,
      hz: row.hz,
      weather: row.weather || null,
      dist: row.dist,
      slipAvg: row.slipAvg,
      pilotId: pilot.id || null,
      at: Date.now(),
    };
  }
  return null;
}

function pilotLabel(pilot, body) {
  const id = String(pilot.id || body?.pilotId || '').trim().slice(0, 64);
  const name = String(pilot.name || body?.name || body?.createdBy || 'пилот').trim().slice(0, 48) || 'пилот';
  return { id: id || ('guest:' + name.toLowerCase()), name };
}


const CREW_MAX = 10;

function crewId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((b) => alphabet[b % alphabet.length]).join('');
}

function monthKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthStartMs(ts = Date.now()) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

async function indexCrewMine(kv, pilotId, crewIdVal) {
  if (!pilotId || !crewIdVal) return;
  const ikey = 'crewidx:' + pilotId;
  let idx = [];
  try {
    const raw = await kv.get(ikey);
    if (raw) idx = JSON.parse(raw);
    if (!Array.isArray(idx)) idx = [];
  } catch {
    idx = [];
  }
  idx.unshift(crewIdVal);
  idx = [...new Set(idx)].slice(0, 40);
  await kv.put(ikey, JSON.stringify(idx));
}

function publicCrew(c) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    trackId: c.trackId,
    inviteCode: c.inviteCode,
    createdBy: c.createdBy,
    members: c.members || [],
    createdAt: c.createdAt,
    memberCount: (c.members || []).length,
  };
}

async function buildCrewBoard(kv, crew) {
  const trackId = crew.trackId;
  const mk = monthKey();
  const start = monthStartMs();
  const rows = (await readList(kv, `lap:${trackId}`)).filter(isValidGpsRow);
  const bestByPilot = {};
  for (const r of rows) {
    if (!r?.pilotId) continue;
    if (r.gpsQ !== 'A' && r.gpsQ !== 'B') continue;
    if (r.valid === false) continue;
    const at = Number(r.at) || 0;
    if (at && at < start) continue;
    const ms = parseLapMs(r.t);
    if (ms == null) continue;
    const prev = bestByPilot[r.pilotId];
    if (!prev || ms < prev.ms) {
      bestByPilot[r.pilotId] = {
        time: r.t,
        ms,
        gpsQ: r.gpsQ,
        at: at || Date.now(),
        car: r.car || '',
        source: 'tops',
      };
    }
  }
  // merge stored memberBests for this month (client push)
  const stored = crew.memberBests || {};
  for (const [pid, b] of Object.entries(stored)) {
    if (!b || b.monthKey !== mk) continue;
    if (b.gpsQ !== 'A' && b.gpsQ !== 'B') continue;
    const ms = parseLapMs(b.time);
    if (ms == null) continue;
    const prev = bestByPilot[pid];
    if (!prev || ms < prev.ms) {
      bestByPilot[pid] = {
        time: b.time,
        ms,
        gpsQ: b.gpsQ,
        at: b.at || Date.now(),
        car: b.car || '',
        source: 'member',
      };
    }
  }

  const ranked = (crew.members || []).map((m) => {
    const best = bestByPilot[m.pilotId] || null;
    return {
      pilotId: m.pilotId,
      nick: m.nick,
      joinedAt: m.joinedAt,
      best: best
        ? { time: best.time, gpsQ: best.gpsQ, at: best.at, car: best.car, ms: best.ms }
        : null,
    };
  });
  ranked.sort((a, b) => {
    if (a.best && b.best) return a.best.ms - b.best.ms;
    if (a.best) return -1;
    if (b.best) return 1;
    return (a.joinedAt || 0) - (b.joinedAt || 0);
  });
  const withLap = ranked.filter((r) => r.best);
  const avgMs = withLap.length
    ? Math.round(withLap.reduce((s, r) => s + r.best.ms, 0) / withLap.length)
    : null;
  return {
    id: crew.id,
    name: crew.name,
    trackId: crew.trackId,
    month: mk,
    members: ranked,
    teamBadge: withLap.length,
    teamAvgMs: avgMs,
    memberCount: (crew.members || []).length,
  };
}



/** Cult RU tracks for session-of-day rotation (keep in sync with app.js TRACKS.cult). */
const CULT_SESSION_TRACKS = [
  { id: 'sochi', title: 'Сочи Автодром' },
  { id: 'moscow', title: 'Moscow Raceway' },
  { id: 'igora', title: 'Игора Драйв' },
  { id: 'kazan', title: 'Казань Ринг' },
  { id: 'smolensk', title: 'Смоленское кольцо' },
  { id: 'nring', title: 'NRING Нижний Новгород' },
  { id: 'adm', title: 'ADM Raceway Мячково' },
  { id: 'grozny', title: 'Fort Grozny Autodrom' },
  { id: 'redring', title: 'Красное Кольцо Красноярск' },
];

function moscowDateKey(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function dayHash(key) {
  let h = 2166136261;
  for (let i = 0; i < String(key).length; i++) {
    h ^= String(key).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickSessionOfDay(manual) {
  const date = moscowDateKey();
  const mid = manual && typeof manual === 'object' ? String(manual.trackId || '').trim() : '';
  if (mid) {
    const found = CULT_SESSION_TRACKS.find((t) => t.id === mid);
    if (found) {
      return {
        trackId: found.id,
        title: String(manual.title || found.title).slice(0, 80),
        date,
        source: 'kv',
      };
    }
  }
  const idx = dayHash(date) % CULT_SESSION_TRACKS.length;
  const t = CULT_SESSION_TRACKS[idx];
  return { trackId: t.id, title: t.title, date, source: 'hash' };
}

function isAbLapRow(r) {
  if (!r || !r.gps || r.valid === false) return false;
  if (Array.isArray(r.flags) && r.flags.includes('teleport')) return false;
  return r.gpsQ === 'A' || r.gpsQ === 'B';
}


export default {
  async fetch(req, env) {
    const headers = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    if (!env.PITLANE) {
      return json({ error: 'KV binding PITLANE missing' }, 500, headers);
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const pilot = await resolvePilot(req, env);

    try {
      if (req.method === 'GET' && path === '/health') {
        return json({ ok: true, service: 'pitlane-api' }, 200, headers);
      }

      // —— Auth OTP ——
      if (req.method === 'POST' && path === '/auth/otp') {
        const body = await req.json().catch(() => null);
        const phone = normPhone(body?.phone);
        if (phone.length !== 11 || !phone.startsWith('7')) {
          return json({ error: 'bad phone', hint: '+7…' }, 400, headers);
        }

        const ip = clientIp(req);
        const phoneLimited = await rateHit(env.PITLANE, 'rl:otp:ph:' + phone, OTP_PHONE_LIMIT, 900);
        const ipLimited = await rateHit(env.PITLANE, 'rl:otp:ip:' + ip, OTP_IP_LIMIT, 900);
        if (phoneLimited || ipLimited) {
          return json({ error: 'rate limit', retry: 900 }, 429, headers);
        }

        const demo = isDemoSms(env);
        const code = String(Math.floor(1000 + Math.random() * 9000));

        let sent = false;
        let twStatus = 0;
        if (twilioConfigured(env)) {
          try {
            const tw = await sendTwilioSms(env, phone, code);
            sent = !!tw.ok;
            twStatus = tw.status || 0;
          } catch (_) {
            sent = false;
          }
        }

        // Prod (SMS_DEMO≠1): require real send; never leak demoCode; do not persist unused OTP
        if (!demo && !sent) {
          return json(
            {
              ok: false,
              error: twilioConfigured(env) ? 'SMS send failed' : 'SMS not configured',
              sent: false,
            },
            503,
            headers
          );
        }

        await env.PITLANE.put(
          'otp:' + phone,
          JSON.stringify({ code, exp: Date.now() + OTP_TTL_SEC * 1000, tries: 0 }),
          { expirationTtl: OTP_TTL_SEC }
        );

        const out = { ok: true, sent, demo: demo && !sent };
        // demoCode only when explicitly SMS_DEMO=1 and Twilio did not send
        if (demo && !sent) out.demoCode = code;
        if (demo && !sent && twStatus) out.twilioStatus = twStatus;
        return json(out, 200, headers);
      }

      if (req.method === 'POST' && path === '/auth/verify') {
        const body = await req.json().catch(() => null);
        const phone = normPhone(body?.phone);
        const code = String(body?.code || '').trim();
        if (phone.length !== 11 || !phone.startsWith('7')) {
          return json({ ok: false, error: 'bad phone' }, 400, headers);
        }
        if (!/^\d{4,6}$/.test(code)) {
          return json({ ok: false, error: 'bad code' }, 400, headers);
        }
        const raw = await env.PITLANE.get('otp:' + phone);
        if (!raw) return json({ ok: false, error: 'no otp' }, 400, headers);
        let otp;
        try {
          otp = JSON.parse(raw);
        } catch {
          return json({ ok: false }, 400, headers);
        }
        if (Date.now() > otp.exp) {
          await env.PITLANE.delete('otp:' + phone);
          return json({ ok: false, error: 'expired' }, 400, headers);
        }
        const tries = (Number(otp.tries) || 0) + 1;
        if (tries > OTP_MAX_TRIES) {
          await env.PITLANE.delete('otp:' + phone);
          return json({ ok: false, error: 'too many attempts' }, 429, headers);
        }
        if (code !== String(otp.code)) {
          otp.tries = tries;
          const remainTtl = Math.max(30, Math.ceil((otp.exp - Date.now()) / 1000));
          await env.PITLANE.put('otp:' + phone, JSON.stringify(otp), {
            expirationTtl: remainTtl,
          });
          return json({ ok: false, error: 'bad code', left: OTP_MAX_TRIES - tries }, 400, headers);
        }
        await env.PITLANE.delete('otp:' + phone);

        const ukey = 'user:' + phone;
        let user = null;
        const uraw = await env.PITLANE.get(ukey);
        if (uraw) {
          try {
            user = JSON.parse(uraw);
          } catch {
            user = null;
          }
        }
        if (!user) {
          user = {
            phone,
            nick: 'пилот' + phone.slice(-4),
            createdAt: Date.now(),
            trialEnds: Date.now() + 7 * 24 * 60 * 60 * 1000,
            plan: 'trial',
          };
        }
        if (body?.nick) user.nick = String(body.nick).trim().slice(0, 48) || user.nick;
        user.lastLogin = Date.now();
        await env.PITLANE.put(ukey, JSON.stringify(user));

        const token = randomToken();
        await env.PITLANE.put(
          'sess:' + token,
          JSON.stringify({ phone, nick: user.nick, at: Date.now() }),
          { expirationTtl: SESS_TTL }
        );

        return json(
          { ok: true, token, phone, nick: user.nick, user },
          200,
          headers
        );
      }

      // —— Garage sync (auth required) ——
      if (path === '/garage') {
        const denied = requireAuth(pilot, headers);
        if (denied) return denied;
        const gkey = 'garage:' + pilot.id;
        if (req.method === 'GET') {
          const raw = await env.PITLANE.get(gkey);
          if (!raw) return json({ cars: [], carId: null }, 200, headers);
          try {
            const data = JSON.parse(raw);
            return json(
              {
                cars: Array.isArray(data.cars) ? data.cars : Array.isArray(data) ? data : [],
                carId: data.carId || null,
                at: data.at || null,
              },
              200,
              headers
            );
          } catch {
            return json({ cars: [], carId: null }, 200, headers);
          }
        }
        if (req.method === 'PUT') {
          const body = await req.json().catch(() => null);
          const cars = Array.isArray(body?.cars)
            ? body.cars.slice(0, 40)
            : Array.isArray(body)
              ? body.slice(0, 40)
              : null;
          if (!cars) return json({ error: 'invalid garage' }, 400, headers);
          const payload = {
            cars,
            carId: body?.carId ? String(body.carId).slice(0, 64) : null,
            at: Date.now(),
          };
          // ~1.5MB soft cap
          const ser = JSON.stringify(payload);
          if (ser.length > 1_500_000) return json({ error: 'garage too large' }, 413, headers);
          await env.PITLANE.put(gkey, ser);
          return json({ ok: true, ...payload }, 200, headers);
        }
      }

      // —— Share cards ——
      if (req.method === 'POST' && path === '/share') {
        const body = await req.json().catch(() => null);
        const payload = body?.payload ?? body;
        if (!payload || typeof payload !== 'object') {
          return json({ error: 'invalid payload' }, 400, headers);
        }
        const id = shareId();
        await env.PITLANE.put('share:' + id, JSON.stringify(payload), {
          expirationTtl: SHARE_TTL,
        });
        return json({ id }, 200, headers);
      }

      let m = path.match(/^\/share\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const id = decodeURIComponent(m[1]);
        const raw = await env.PITLANE.get('share:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        try {
          return json(JSON.parse(raw), 200, headers);
        } catch {
          return json({ error: 'corrupt' }, 500, headers);
        }
      }

      // —— Tops straight ——
      m = path.match(/^\/tops\/straight\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const carId = decodeURIComponent(m[1]);
        const url = new URL(req.url);
        const wx = sanitizeWeather(url.searchParams.get('weather'));
        let rows = (await readList(env.PITLANE, `straight:${carId}`))
          .filter(isValidGpsRow)
          .sort((a, b) => a.t - b.t);
        if (wx) rows = rows.filter((r) => r && r.weather === wx);
        return json(rows, 200, headers);
      }
      if (req.method === 'POST' && m) {
        const denied = requireAuth(pilot, headers);
        if (denied) return denied;
        const carId = decodeURIComponent(m[1]);
        const body = await req.json().catch(() => null);
        const row = sanitizeStraight(body, pilot);
        if (!row) return json({ error: 'invalid gps straight row' }, 400, headers);
        // reject forged pilot ids in body
        if (body?.pilotId && String(body.pilotId) !== pilot.id) {
          return json({ error: 'pilot mismatch' }, 403, headers);
        }
        row.pilotId = pilot.id;
        const key = `straight:${carId}`;
        const rows = await readList(env.PITLANE, key);
        rows.push(row);
        rows.sort((a, b) => a.t - b.t);
        await writeList(env.PITLANE, key, rows);
        return json(rows.filter(isValidGpsRow), 200, headers);
      }

      // —— Tops lap ——
      m = path.match(/^\/tops\/lap\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const trackId = decodeURIComponent(m[1]);
        const url = new URL(req.url);
        const wx = sanitizeWeather(url.searchParams.get('weather'));
        let rows = (await readList(env.PITLANE, `lap:${trackId}`)).filter(isValidGpsRow);
        if (wx) rows = rows.filter((r) => r && r.weather === wx);
        return json(rows, 200, headers);
      }
      if (req.method === 'POST' && m) {
        const denied = requireAuth(pilot, headers);
        if (denied) return denied;
        const trackId = decodeURIComponent(m[1]);
        const body = await req.json().catch(() => null);
        const row = sanitizeLap(body, pilot);
        if (!row) return json({ error: 'invalid gps lap row' }, 400, headers);
        if (body?.pilotId && String(body.pilotId) !== pilot.id) {
          return json({ error: 'pilot mismatch' }, 403, headers);
        }
        row.pilotId = pilot.id;
        const av = row.avatar || null;
        // keep KV lap lists lean — avatar lives in pilotmeta, not on every row
        delete row.avatar;
        const key = `lap:${trackId}`;
        const rows = await readList(env.PITLANE, key);
        rows.push(row);
        await writeList(env.PITLANE, key, rows);
        // remember nick/avatar for sector tops (A/B only; avatar optional)
        if (row.valid && (row.gpsQ === 'A' || row.gpsQ === 'B')) {
          await rememberPilotMeta(env.PITLANE, row.pilotId, row.name, av);
        }
        return json(rows.filter(isValidGpsRow), 200, headers);
      }

      // —— Tops sector (public A/B best sector times) ——
      m = path.match(/^\/tops\/sector\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const trackId = decodeURIComponent(m[1]);
        const url = new URL(req.url);
        const sectorParam = url.searchParams.get('sector');
        const wx = sanitizeWeather(url.searchParams.get('weather'));
        let rows = (await readList(env.PITLANE, `lap:${trackId}`)).filter(isAbLapRow);
        if (wx) rows = rows.filter((r) => r && r.weather === wx);
        if (sectorParam == null || sectorParam === '' || sectorParam === 'all') {
          const sectors = [];
          for (let i = 0; i < 3; i++) {
            let board = buildSectorLeaderboard(rows, i);
            board = await enrichSectorAvatars(env.PITLANE, board);
            sectors.push(board);
          }
          return json({ trackId, sectors }, 200, headers);
        }
        const sector = Math.max(0, Math.min(2, Number(sectorParam) | 0));
        let board = buildSectorLeaderboard(rows, sector);
        board = await enrichSectorAvatars(env.PITLANE, board);
        return json({ trackId, sector, rows: board }, 200, headers);
      }

      // —— Pulse ——
      if (path === '/pulse') {
        if (req.method === 'GET') {
          const rows = await readList(env.PITLANE, 'pulse');
          rows.sort((a, b) => (b.at || 0) - (a.at || 0));
          return json(rows.slice(0, 200), 200, headers);
        }
        if (req.method === 'POST') {
          const denied = requireAuth(pilot, headers);
          if (denied) return denied;
          const body = await req.json().catch(() => null);
          const row = sanitizePulse(body, pilot);
          if (!row) return json({ error: 'invalid pulse' }, 400, headers);
          const rows = await readList(env.PITLANE, 'pulse');
          rows.unshift(row);
          await writeList(env.PITLANE, 'pulse', rows);
          return json(rows.slice(0, 200), 200, headers);
        }
      }

      m = path.match(/^\/pulse\/([^/]+)\/like$/);
      if (req.method === 'POST' && m) {
        const denied = requireAuth(pilot, headers);
        if (denied) return denied;
        const id = decodeURIComponent(m[1]);
        const who = pilot.name || pilot.id || 'пилот';
        const rows = await readList(env.PITLANE, 'pulse');
        const p = rows.find((x) => x.id === id);
        if (!p) return json({ error: 'not found' }, 404, headers);
        p.likes = p.likes || [];
        const i = p.likes.indexOf(who);
        if (i >= 0) p.likes.splice(i, 1);
        else p.likes.push(who);
        await writeList(env.PITLANE, 'pulse', rows);
        rows.sort((a, b) => (b.at || 0) - (a.at || 0));
        return json(rows.slice(0, 200), 200, headers);
      }

      m = path.match(/^\/pulse\/([^/]+)$/);
      if (req.method === 'DELETE' && m) {
        const denied = requireAuth(pilot, headers);
        if (denied) return denied;
        const id = decodeURIComponent(m[1]);
        const who = pilot.name || pilot.id || '';
        let rows = await readList(env.PITLANE, 'pulse');
        rows = rows.filter((x) => !(x.id === id && (x.who === who || x.pilotId === pilot.id)));
        await writeList(env.PITLANE, 'pulse', rows);
        return json(rows.slice(0, 200), 200, headers);
      }


      // —— Duels / Challenge ——
      if (req.method === 'POST' && path === '/duel') {
        const body = await req.json().catch(() => null);
        const type = body?.type === 'lap' ? 'lap' : body?.type === 'drag' ? 'drag' : null;
        if (!type) return json({ error: 'type must be drag|lap' }, 400, headers);
        const trackId = type === 'lap' ? String(body?.trackId || '').trim().slice(0, 64) : null;
        if (type === 'lap' && !trackId) return json({ error: 'trackId required for lap' }, 400, headers);
        const who = pilotLabel(pilot, body);
        if (!who.name) return json({ error: 'createdBy / nick required' }, 400, headers);
        const note = body?.note != null ? String(body.note).trim().slice(0, 140) : '';
        const id = duelId();
        const now = Date.now();
        const duel = {
          id,
          type,
          trackId,
          note,
          status: 'open',
          createdAt: now,
          expiresAt: now + DUEL_TTL_MS,
          createdBy: who,
          challenger: null,
          creatorRun: null,
          challengerRun: null,
          winner: null,
        };
        await env.PITLANE.put('duel:' + id, JSON.stringify(duel), { expirationTtl: DUEL_TTL + 86400 });
        // index for mine list
        const ikey = 'duelidx:' + who.id;
        let idx = [];
        try {
          const raw = await env.PITLANE.get(ikey);
          if (raw) idx = JSON.parse(raw);
          if (!Array.isArray(idx)) idx = [];
        } catch { idx = []; }
        idx.unshift(id);
        idx = [...new Set(idx)].slice(0, 40);
        await env.PITLANE.put(ikey, JSON.stringify(idx), { expirationTtl: DUEL_TTL + 86400 });
        return json(duel, 200, headers);
      }

      if (req.method === 'GET' && path === '/duels') {
        const mine = String(url.searchParams.get('mine') || '').trim().slice(0, 64);
        if (!mine) return json({ error: 'mine= required' }, 400, headers);
        let ids = [];
        try {
          const raw = await env.PITLANE.get('duelidx:' + mine);
          if (raw) ids = JSON.parse(raw);
          if (!Array.isArray(ids)) ids = [];
        } catch { ids = []; }
        const out = [];
        for (const id of ids.slice(0, 40)) {
          const raw = await env.PITLANE.get('duel:' + id);
          if (!raw) continue;
          try {
            let d = JSON.parse(raw);
            const before = d.status;
            d = refreshDuelStatus(d);
            if (d.status !== before) {
              await env.PITLANE.put('duel:' + id, JSON.stringify(d), { expirationTtl: DUEL_TTL + 86400 });
            }
            out.push(d);
          } catch (_) {}
        }
        return json(out, 200, headers);
      }

      m = path.match(/^\/duel\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const id = decodeURIComponent(m[1]).slice(0, 64);
        const raw = await env.PITLANE.get('duel:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let d;
        try { d = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        const before = d.status;
        d = refreshDuelStatus(d);
        if (d.status !== before) {
          await env.PITLANE.put('duel:' + id, JSON.stringify(d), { expirationTtl: DUEL_TTL + 86400 });
        }
        return json(d, 200, headers);
      }

      m = path.match(/^\/duel\/([^/]+)\/run$/);
      if (req.method === 'POST' && m) {
        const id = decodeURIComponent(m[1]).slice(0, 64);
        const raw = await env.PITLANE.get('duel:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let d;
        try { d = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        d = refreshDuelStatus(d);
        if (d.status === 'expired') return json({ error: 'duel expired', duel: d }, 410, headers);
        if (d.status === 'ready') return json({ error: 'duel locked', duel: d }, 409, headers);

        const body = await req.json().catch(() => null);
        const who = pilotLabel(pilot, body);
        const run = sanitizeDuelRun(body, { id: who.id, name: who.name }, d.type);
        if (!run) {
          return json({ error: 'only A/B GPS runs accepted for duel' }, 400, headers);
        }
        if (d.type === 'lap' && d.trackId && body?.trackId && String(body.trackId) !== String(d.trackId)) {
          return json({ error: 'track mismatch' }, 400, headers);
        }

        const isCreator = !!(who.id && d.createdBy?.id && who.id === d.createdBy.id);
        const isChallenger = !!(who.id && d.challenger?.id && who.id === d.challenger.id);

        async function indexMine(pid) {
          if (!pid) return;
          const ikey = 'duelidx:' + pid;
          let idx = [];
          try {
            const iraw = await env.PITLANE.get(ikey);
            if (iraw) idx = JSON.parse(iraw);
            if (!Array.isArray(idx)) idx = [];
          } catch { idx = []; }
          idx.unshift(id);
          idx = [...new Set(idx)].slice(0, 40);
          await env.PITLANE.put(ikey, JSON.stringify(idx), { expirationTtl: DUEL_TTL + 86400 });
        }

        // Each side: one locked A/B run. Creator first match by id; else first other pilot = challenger.
        if (isCreator) {
          if (d.creatorRun) return json({ error: 'creator already submitted', duel: d }, 409, headers);
          d.creatorRun = run;
          d.createdBy = { id: who.id, name: who.name || d.createdBy?.name || 'пилот' };
        } else if (isChallenger) {
          if (d.challengerRun) return json({ error: 'challenger already submitted', duel: d }, 409, headers);
          d.challengerRun = run;
          d.challenger = { id: who.id, name: who.name };
        } else if (!d.creatorRun && !d.challenger) {
          // Creator attaching first run (same device/session)
          if (isCreator || who.id === d.createdBy?.id) {
            d.creatorRun = run;
            d.createdBy = { id: who.id, name: who.name || d.createdBy?.name || 'пилот' };
          } else {
            // Friend accepts via link before creator attached — become challenger
            d.challenger = { id: who.id, name: who.name };
            d.challengerRun = run;
            await indexMine(who.id);
          }
        } else if (!d.creatorRun && who.id === d.createdBy?.id) {
          d.creatorRun = run;
          d.createdBy = { id: who.id, name: who.name || d.createdBy?.name || 'пилот' };
        } else if (!d.challengerRun && who.id !== d.createdBy?.id) {
          d.challenger = { id: who.id, name: who.name };
          d.challengerRun = run;
          await indexMine(who.id);
        } else if (who.id === d.createdBy?.id && d.creatorRun) {
          return json({ error: 'creator already submitted', duel: d }, 409, headers);
        } else {
          return json({ error: 'slot unavailable', duel: d }, 409, headers);
        }

        d = refreshDuelStatus(d);
        await env.PITLANE.put('duel:' + id, JSON.stringify(d), { expirationTtl: DUEL_TTL + 86400 });
        return json(d, 200, headers);
      }


      // —— Crews / Экипажи ——
      if (req.method === 'POST' && path === '/crew') {
        const body = await req.json().catch(() => null);
        const name = String(body?.name || '').trim().slice(0, 48);
        const trackId = String(body?.trackId || '').trim().slice(0, 64);
        if (!name) return json({ error: 'name required' }, 400, headers);
        if (!trackId) return json({ error: 'trackId required' }, 400, headers);
        const who = pilotLabel(pilot, {
          pilotId: body?.pilotId,
          name: body?.nick || body?.createdBy,
          createdBy: body?.createdBy,
        });
        if (!who.id) return json({ error: 'pilot required' }, 400, headers);
        const id = crewId();
        let code = inviteCode();
        // rare collision retry
        for (let i = 0; i < 4; i++) {
          const exists = await env.PITLANE.get('crewinv:' + code);
          if (!exists) break;
          code = inviteCode();
        }
        const now = Date.now();
        const crew = {
          id,
          name,
          trackId,
          inviteCode: code,
          createdAt: now,
          createdBy: { id: who.id, name: who.name },
          members: [{ pilotId: who.id, nick: who.name, joinedAt: now }],
          memberBests: {},
        };
        await env.PITLANE.put('crew:' + id, JSON.stringify(crew));
        await env.PITLANE.put('crewinv:' + code, id);
        await indexCrewMine(env.PITLANE, who.id, id);
        return json({ ...publicCrew(crew), inviteCode: code }, 200, headers);
      }

      if (req.method === 'GET' && path === '/crews') {
        const mine = String(url.searchParams.get('mine') || '').trim().slice(0, 64);
        if (!mine) return json({ error: 'mine= required' }, 400, headers);
        let ids = [];
        try {
          const raw = await env.PITLANE.get('crewidx:' + mine);
          if (raw) ids = JSON.parse(raw);
          if (!Array.isArray(ids)) ids = [];
        } catch { ids = []; }
        const out = [];
        for (const id of ids.slice(0, 40)) {
          const raw = await env.PITLANE.get('crew:' + id);
          if (!raw) continue;
          try {
            out.push(publicCrew(JSON.parse(raw)));
          } catch (_) {}
        }
        return json(out, 200, headers);
      }

      // join by invite code
      if (req.method === 'POST' && path === '/crew/join') {
        const body = await req.json().catch(() => null);
        const code = String(body?.code || body?.inviteCode || '').trim().toUpperCase().slice(0, 12);
        if (!code) return json({ error: 'code required' }, 400, headers);
        const cid = await env.PITLANE.get('crewinv:' + code);
        if (!cid) return json({ error: 'invalid invite' }, 404, headers);
        // fall through by rewriting to /crew/:id/join via internal hop — handled below by cloning logic
        const raw = await env.PITLANE.get('crew:' + cid);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let crew;
        try { crew = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        const who = pilotLabel(pilot, body);
        const nick = String(body?.nick || who.name || 'пилот').trim().slice(0, 48) || 'пилот';
        const pilotId = String(body?.pilotId || who.id || '').trim().slice(0, 64);
        if (!pilotId) return json({ error: 'pilotId required' }, 400, headers);
        crew.members = Array.isArray(crew.members) ? crew.members : [];
        const existing = crew.members.find((m) => m.pilotId === pilotId);
        if (existing) {
          existing.nick = nick;
          await env.PITLANE.put('crew:' + crew.id, JSON.stringify(crew));
          await indexCrewMine(env.PITLANE, pilotId, crew.id);
          return json(publicCrew(crew), 200, headers);
        }
        if (crew.members.length >= CREW_MAX) return json({ error: 'crew full', max: CREW_MAX }, 409, headers);
        crew.members.push({ pilotId, nick, joinedAt: Date.now() });
        await env.PITLANE.put('crew:' + crew.id, JSON.stringify(crew));
        await indexCrewMine(env.PITLANE, pilotId, crew.id);
        return json(publicCrew(crew), 200, headers);
      }

      m = path.match(/^\/crew\/([^/]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]).slice(0, 64);
        if (req.method === 'GET') {
          const raw = await env.PITLANE.get('crew:' + id);
          if (!raw) return json({ error: 'not found' }, 404, headers);
          try {
            return json(publicCrew(JSON.parse(raw)), 200, headers);
          } catch {
            return json({ error: 'corrupt' }, 500, headers);
          }
        }
      }

      m = path.match(/^\/crew\/([^/]+)\/join$/);
      if (req.method === 'POST' && m) {
        const id = decodeURIComponent(m[1]).slice(0, 64);
        const body = await req.json().catch(() => null);
        const raw = await env.PITLANE.get('crew:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let crew;
        try { crew = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        const who = pilotLabel(pilot, body);
        const nick = String(body?.nick || who.name || 'пилот').trim().slice(0, 48) || 'пилот';
        const pilotId = String(body?.pilotId || who.id || '').trim().slice(0, 64);
        if (!pilotId) return json({ error: 'pilotId required' }, 400, headers);
        crew.members = Array.isArray(crew.members) ? crew.members : [];
        const existing = crew.members.find((x) => x.pilotId === pilotId);
        if (existing) {
          existing.nick = nick;
          await env.PITLANE.put('crew:' + id, JSON.stringify(crew));
          await indexCrewMine(env.PITLANE, pilotId, id);
          return json(publicCrew(crew), 200, headers);
        }
        if (crew.members.length >= CREW_MAX) return json({ error: 'crew full', max: CREW_MAX }, 409, headers);
        crew.members.push({ pilotId, nick, joinedAt: Date.now() });
        await env.PITLANE.put('crew:' + id, JSON.stringify(crew));
        await indexCrewMine(env.PITLANE, pilotId, id);
        return json(publicCrew(crew), 200, headers);
      }

      m = path.match(/^\/crew\/([^/]+)\/board$/);
      if (req.method === 'GET' && m) {
        const id = decodeURIComponent(m[1]).slice(0, 64);
        const raw = await env.PITLANE.get('crew:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let crew;
        try { crew = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        const board = await buildCrewBoard(env.PITLANE, crew);
        return json(board, 200, headers);
      }

      m = path.match(/^\/crew\/([^/]+)\/best$/);
      if (req.method === 'POST' && m) {
        const id = decodeURIComponent(m[1]).slice(0, 64);
        const body = await req.json().catch(() => null);
        const raw = await env.PITLANE.get('crew:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let crew;
        try { crew = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        const who = pilotLabel(pilot, body);
        const pilotId = String(body?.pilotId || who.id || '').trim().slice(0, 64);
        if (!pilotId) return json({ error: 'pilotId required' }, 400, headers);
        const member = (crew.members || []).find((x) => x.pilotId === pilotId);
        if (!member) return json({ error: 'not a member' }, 403, headers);
        const trackId = String(body?.trackId || crew.trackId || '').trim();
        if (trackId !== crew.trackId) {
          return json({ error: 'track mismatch', trackId: crew.trackId }, 400, headers);
        }
        const row = sanitizeLap(body, { id: pilotId, name: member.nick || who.name });
        if (!row || !row.valid || (row.gpsQ !== 'A' && row.gpsQ !== 'B')) {
          return json({ error: 'A/B lap required' }, 400, headers);
        }
        const ms = parseLapMs(row.t);
        if (ms == null) return json({ error: 'bad time' }, 400, headers);
        const mk = monthKey();
        crew.memberBests = crew.memberBests || {};
        const prev = crew.memberBests[pilotId];
        if (!prev || prev.monthKey !== mk || (parseLapMs(prev.time) ?? Infinity) > ms) {
          crew.memberBests[pilotId] = {
            time: row.t,
            gpsQ: row.gpsQ,
            at: Date.now(),
            car: row.car || '',
            monthKey: mk,
          };
          if (body?.nick) member.nick = String(body.nick).trim().slice(0, 48);
          await env.PITLANE.put('crew:' + id, JSON.stringify(crew));
        }
        const board = await buildCrewBoard(env.PITLANE, crew);
        return json({ ok: true, best: crew.memberBests[pilotId], board }, 200, headers);
      }



      // —— Session of the day (track-day soft) ——
      if (req.method === 'GET' && path === '/session/today') {
        let manual = null;
        const mraw = await env.PITLANE.get('session:day');
        if (mraw) {
          try { manual = JSON.parse(mraw); } catch { manual = null; }
        }
        const picked = pickSessionOfDay(manual);
        const rows = (await readList(env.PITLANE, `lap:${picked.trackId}`))
          .filter(isAbLapRow)
          .filter((r) => r && r.at && moscowDateKey(Number(r.at)) === picked.date);
        rows.sort((a, b) => (parseLapMs(a.t) ?? 1e15) - (parseLapMs(b.t) ?? 1e15));
        const tops = rows.slice(0, 25).map((r) => ({
          name: r.name,
          car: r.car,
          t: r.t,
          gpsQ: r.gpsQ,
          weather: r.weather || null,
          at: r.at || null,
        }));
        let attendees = [];
        const akey = `session:att:${picked.date}:${picked.trackId}`;
        const araw = await env.PITLANE.get(akey);
        if (araw) {
          try {
            const arr = JSON.parse(araw);
            if (Array.isArray(arr)) attendees = arr;
          } catch (_) {}
        }
        return json(
          {
            trackId: picked.trackId,
            title: picked.title,
            date: picked.date,
            source: picked.source,
            tops,
            attendees: attendees.slice(0, 40).map((a) => ({
              nick: String(a.nick || '').slice(0, 48),
              at: a.at || null,
            })),
          },
          200,
          headers
        );
      }

      if (req.method === 'POST' && path === '/session/today/checkin') {
        const body = await req.json().catch(() => null);
        let manual = null;
        const mraw = await env.PITLANE.get('session:day');
        if (mraw) {
          try { manual = JSON.parse(mraw); } catch { manual = null; }
        }
        const picked = pickSessionOfDay(manual);
        const who = pilotLabel(pilot, body);
        const nick = String(body?.nick || who.name || 'пилот').trim().slice(0, 48) || 'пилот';
        const pilotId = String(body?.pilotId || who.id || '').trim().slice(0, 64);
        const akey = `session:att:${picked.date}:${picked.trackId}`;
        let attendees = [];
        const araw = await env.PITLANE.get(akey);
        if (araw) {
          try {
            const arr = JSON.parse(araw);
            if (Array.isArray(arr)) attendees = arr;
          } catch (_) {}
        }
        const now = Date.now();
        const existing = pilotId
          ? attendees.find((a) => a && a.pilotId === pilotId)
          : attendees.find((a) => a && a.nick === nick);
        if (existing) {
          existing.nick = nick;
          existing.at = now;
        } else {
          attendees.push({ nick, pilotId: pilotId || null, at: now });
        }
        attendees = attendees
          .slice()
          .sort((a, b) => (b.at || 0) - (a.at || 0))
          .slice(0, 60);
        // expire ~36h after midnight Moscow roughly via TTL 2d
        await env.PITLANE.put(akey, JSON.stringify(attendees), { expirationTtl: 172800 });
        return json(
          {
            ok: true,
            trackId: picked.trackId,
            date: picked.date,
            attendees: attendees.slice(0, 40).map((a) => ({
              nick: String(a.nick || '').slice(0, 48),
              at: a.at || null,
            })),
          },
          200,
          headers
        );
      }


      return json({ error: 'not found', path }, 404, headers);
    } catch (err) {
      return json({ error: String(err?.message || err) }, 500, headers);
    }
  },
};
