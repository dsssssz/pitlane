/**
 * Pitlane shared tops API — Cloudflare Worker + KV
 * Bindings: PITLANE (KV namespace)
 * Env: SMS_DEMO ("0"=prod, no demoCode), TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, EXTRA_ORIGINS
 * Prod: set SMS_DEMO=0 + Twilio secrets. Demo OTP only when SMS_DEMO explicitly "1".
 *
 * Env (Telegram): TELEGRAM_BOT_TOKEN (secret), TELEGRAM_BOT_USERNAME (var). ADMIN_TOKEN (secret, optional:
 * enables POST /admin/migrate-pilots; endpoint is 404 without it).
 *
 * Accounts (v76): opaque pilot id `p_<uuid>` per account.
 *   pilot:<uuid>            → { id, createdAt, providers:[{type:'phone'|'tg', id}], nick, photoRef, trialEnds, plan, paidUntil }
 *   auth:phone:<7XXXXXXXXXX> → <uuid>      auth:tg:<telegramId> → <uuid>
 *   sess:<token>            → { pilotId, nick, provider, at }   (legacy { phone } sessions are upgraded on use)
 *   sessidx:<uuid>          → [token…] (for account deletion)
 * Public responses NEVER include phone numbers: every public row goes through publicTopRow / publicPulse /
 * publicDuel / publicCrew which whitelist fields and drop phone-shaped ids/names.
 *
 * Auth: POST /auth/verify (SMS) · POST /auth/telegram (Login Widget payload) → { token, pilotId, nick, user }
 * GET /auth/config → { sms, telegram, telegramBot, telegramBotId } · GET /me · DELETE /account
 * X-Pilot-Id kept as soft guest id (dev_…) for duels/crews; writes to tops/pulse/garage require session.
 */
// v80: production origin only (Telegram Mini App loads the same GitHub Pages origin).
// Local dev: add origins via the EXTRA_ORIGINS var (never commit localhost into prod config).
const DEFAULT_ORIGINS = ['https://dsssssz.github.io'];

const SHARE_TTL = 30 * 24 * 60 * 60; // 30 days
const SESS_TTL = 90 * 24 * 60 * 60; // 90 days
const OTP_PHONE_LIMIT = 5; // per 15 min
const OTP_IP_LIMIT = 20; // soft per 15 min
const OTP_MAX_TRIES = 5; // bad verify attempts per code
const OTP_TTL_SEC = 600; // 10 min
const OTP_DAILY_CAP = 300; // real SMS sends per day, all numbers (toll-fraud guard)

/** decodeURIComponent that never throws (malformed % escapes → raw string). */
function safeDecode(v) {
  try { return decodeURIComponent(v); } catch { return String(v); }
}

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

/** v80: hardening headers on every API response (JSON only, never rendered as a document). */
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SEC_HEADERS, ...headers },
  });
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Body size caps (bytes) per route family — requests above are refused with 413 before parsing. */
const BODY_LIMITS = {
  default: 32 * 1024,
  auth: 16 * 1024,
  share: 8 * 1024,
  pulse: 256 * 1024,
  feedback: 720 * 1024,
  garage: 1_600_000,
};

/** Read a JSON body with a hard byte cap (streamed; Content-Length is checked first). Bad JSON → null. */
async function readJson(req, max = BODY_LIMITS.default) {
  const cl = Number(req.headers.get('Content-Length') || 0);
  if (cl && cl > max) throw new HttpError(413, 'payload too large');
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      try { await reader.cancel(); } catch (_) {}
      throw new HttpError(413, 'payload too large');
    }
    chunks.push(value);
  }
  if (!n) return null;
  const buf = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(buf)); } catch { return null; }
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

/** Client IP as seen by Cloudflare. X-Forwarded-For is attacker-controlled → never trusted. */
function clientIp(req) {
  return String(req.headers.get('CF-Connecting-IP') || '0.0.0.0').slice(0, 64);
}

/** Crypto-random lowercase base36 string (ids, share keys). */
function randB36(len) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return [...a].map((b) => (b % 36).toString(36)).join('');
}

/** Strip control chars, bidi overrides and angle brackets; trim + cap. For short public labels. */
function cleanLabel(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/g, '')
    .trim()
    .slice(0, max);
}

/** Free text (feedback / pulse): keep newlines + tabs, drop other control chars and bidi overrides. */
function cleanText(v, max) {
  return String(v == null ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim()
    .slice(0, max);
}

/** Track / car ids used in KV keys: short ASCII slug only (prevents unbounded / weird key creation). */
const SLUG_RE = /^[A-Za-z0-9_.-]{1,64}$/;
function slugOk(v) { return SLUG_RE.test(String(v || '')); }

/* Compact sync SHA-256 (for non-reversible public guest ids; not used for auth). */
const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
function sha256Hex(str) {
  const bytes = new TextEncoder().encode(String(str));
  const l = bytes.length;
  const nBlocks = ((l + 9 + 63) >> 6);
  const m = new Uint8Array(nBlocks * 64);
  m.set(bytes);
  m[l] = 0x80;
  const bits = l * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(m.length - 4, bits >>> 0);
  dv.setUint32(m.length - 8, Math.floor(bits / 0x100000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let b = 0; b < nBlocks; b++) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(b * 64 + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, bb, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA_K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/**
 * Guest device ids (dev_…) act as a bearer credential for guest duels/crews, so they are never
 * published raw: public output shows g_<sha256('pitlane-guest:'+id)[0..16]>. The client computes the
 * same value for itself (api.js publicGuestId) to recognise its own rows.
 */
function publicGuestId(id) {
  return 'g_' + sha256Hex('pitlane-guest:' + String(id)).slice(0, 16);
}

/** Burst limiter via Workers Rate Limiting bindings (RL_READ / RL_WRITE); absent binding → allow. */
async function burstLimited(env, binding, key) {
  const rl = env && env[binding];
  if (!rl || typeof rl.limit !== 'function') return false;
  try {
    const { success } = await rl.limit({ key });
    return !success;
  } catch (_) {
    return false;
  }
}

function randomToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ———————————————————— Opaque pilot ids / privacy helpers ———————————————————— */

const PILOT_UUID_RE = /^p_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function isPilotUuid(v) {
  return PILOT_UUID_RE.test(String(v || ''));
}

/** Whole value is phone-shaped (10–15 digits, optional +, separators). */
function isPhoneLike(v) {
  if (v == null) return false;
  const s = String(v).trim().replace(/[\s\-()]/g, '');
  return /^\+?\d{10,15}$/.test(s);
}

/** Text contains something that looks like a phone number. */
function containsPhone(v) {
  // opaque account ids (p_<uuid>) can contain 10+ digits across dashes — never treat them as phones
  if (isPilotUuid(String(v || ''))) return false;
  return /(?:\+?\d[\s\-()]?){10,}/.test(String(v || ''));
}

/** Pilot id safe for public output: uuid / guest ids pass, phone-ish ids are dropped. */
function pubId(v) {
  if (v == null || v === '') return null;
  const s = String(v).slice(0, 64);
  if (isPilotUuid(s)) return s;
  if (/^g_[0-9a-f]{16}$/.test(s)) return s;
  if (isPhoneLike(s) || /\d{10,}/.test(s) || containsPhone(s)) return null;
  // guest device ids / legacy guest:<nick> ids → non-reversible public form
  return publicGuestId(s);
}

/** Public display name: never a phone number. */
function safeName(v, fallback = 'пилот') {
  const s = cleanLabel(v, 48);
  if (!s || containsPhone(s)) return fallback;
  return s;
}

/** Guest (unauthenticated) id: device ids only — never a phone, never a real account uuid. */
function guestId(v) {
  const s = String(v || '').trim().slice(0, 64);
  // Only real client-generated device ids (api.js devicePilotId: dev_<base36>); 'dev_anon' is shared → refused.
  if (!/^dev_[a-z0-9]{8,40}$/.test(s)) return '';
  if (isPhoneLike(s) || containsPhone(s)) return '';
  return s;
}

function newPilotId() {
  return 'p_' + crypto.randomUUID();
}

function defaultNick(pid) {
  return 'пилот' + String(pid || '').replace(/^p_/, '').replace(/-/g, '').slice(0, 4);
}

function sanitizeNick(v) {
  const s = cleanLabel(v, 24);
  if (!s || containsPhone(s)) return '';
  return s;
}

function isLegacyPhoneNick(nick, phone) {
  const p = String(phone || '');
  return !!p && String(nick || '') === 'пилот' + p.slice(-4);
}

async function kvJson(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function loadPilot(kv, id) {
  if (!isPilotUuid(id)) return null;
  return kvJson(kv, 'pilot:' + id);
}

async function savePilot(kv, rec) {
  await kv.put('pilot:' + rec.id, JSON.stringify(rec));
}

function providerKey(type, providerId) {
  return (type === 'tg' ? 'auth:tg:' : 'auth:phone:') + String(providerId);
}

/**
 * Map a login provider (phone / telegram id) to an opaque pilot uuid; create the account if new.
 * Legacy `user:<phone>` records (pre-v76) are folded into the new account record and removed.
 */
async function ensurePilotForProvider(kv, type, providerId, defaults = {}) {
  const akey = providerKey(type, providerId);
  let pid = await kv.get(akey);
  if (pid && isPilotUuid(pid)) {
    const rec = await loadPilot(kv, pid);
    if (rec) return { pilot: rec, created: false };
  } else {
    pid = null;
  }
  pid = pid || newPilotId();
  const now = Date.now();
  let legacy = null;
  if (type === 'phone') legacy = await kvJson(kv, 'user:' + providerId);
  const legacyNick = legacy?.nick && !isLegacyPhoneNick(legacy.nick, providerId) ? sanitizeNick(legacy.nick) : '';
  const rec = {
    id: pid,
    createdAt: Number(legacy?.createdAt) || now,
    providers: [{ type, id: String(providerId), at: now }],
    nick: sanitizeNick(defaults.nick) || legacyNick || defaultNick(pid),
    photoRef: defaults.photoUrl || null,
    trialEnds: Number(legacy?.trialEnds) || now + 7 * DAY_MS,
    plan: legacy?.plan || 'trial',
    paidUntil: legacy?.paidUntil || null,
  };
  await savePilot(kv, rec);
  await kv.put(akey, pid);
  if (legacy) await kv.delete('user:' + providerId);
  return { pilot: rec, created: true };
}

/** What the account owner (and only the owner) sees about their own account. */
function ownerUser(rec) {
  if (!rec) return null;
  const phoneProv = (rec.providers || []).find((p) => p.type === 'phone');
  const tgProv = (rec.providers || []).find((p) => p.type === 'tg');
  return {
    pilotId: rec.id,
    nick: rec.nick,
    createdAt: rec.createdAt,
    trialEnds: rec.trialEnds || null,
    plan: rec.plan || 'trial',
    paidUntil: rec.paidUntil || null,
    providers: (rec.providers || []).map((p) => p.type),
    phoneMasked: phoneProv ? '+' + String(phoneProv.id).slice(0, 1) + ' ••• ••• ' + String(phoneProv.id).slice(-4, -2) + '-' + String(phoneProv.id).slice(-2) : null,
    telegram: tgProv ? { username: tgProv.username || null } : null,
    photoUrl: rec.photoRef || null,
  };
}

async function addSessIdx(kv, pid, token) {
  const key = 'sessidx:' + pid;
  let idx = (await kvJson(kv, key)) || [];
  if (!Array.isArray(idx)) idx = [];
  idx.unshift(token);
  idx = [...new Set(idx)].slice(0, 50);
  await kv.put(key, JSON.stringify(idx), { expirationTtl: SESS_TTL });
}

async function issueSession(kv, rec, provider) {
  const token = randomToken();
  await kv.put(
    'sess:' + token,
    JSON.stringify({ pilotId: rec.id, nick: rec.nick, provider, at: Date.now() }),
    { expirationTtl: SESS_TTL }
  );
  await addSessIdx(kv, rec.id, token);
  return token;
}

/** Resolve session from Bearer token (preferred) or soft X-Pilot-Id guest fallback. */
async function resolvePilot(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(\S+)/i);
  if (m) {
    const token = m[1].trim();
    const raw = await env.PITLANE.get('sess:' + token);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        if (s?.pilotId && isPilotUuid(s.pilotId)) {
          return {
            id: s.pilotId,
            name: safeName(s.nick, ''),
            token,
            authed: true,
            provider: s.provider || null,
          };
        }
        if (s?.phone) {
          // Legacy phone session (pre-v76) → upgrade to opaque pilot id in place.
          const phone = normPhone(s.phone);
          const { pilot } = await ensurePilotForProvider(env.PITLANE, 'phone', phone, {});
          await env.PITLANE.put(
            'sess:' + token,
            JSON.stringify({ pilotId: pilot.id, nick: pilot.nick, provider: 'phone', at: s.at || Date.now() }),
            { expirationTtl: SESS_TTL }
          );
          await addSessIdx(env.PITLANE, pilot.id, token);
          return { id: pilot.id, name: safeName(pilot.nick, ''), token, authed: true, provider: 'phone' };
        }
      } catch (_) {}
    }
    return { id: '', name: '', token: null, authed: false, badToken: true };
  }
  const id = guestId(req.headers.get('X-Pilot-Id'));
  let rawName = req.headers.get('X-Pilot-Name') || '';
  try { rawName = decodeURIComponent(rawName); } catch (_) {}
  const name = safeName(rawName === 'гость' ? '' : rawName, '');
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

const PUBLIC_ROW_FIELDS = [
  'car', 't', 'gps', 'valid', 'gpsQ', 'flags', 'avgAcc', 'hz', 'weather',
  'dist', 'slipAvg', 'sectors', 'ms', 'at', 'avatar', 'sector',
];

/** Whitelisted public tops row (straight / lap / sector / duel run). No phone, ever. */
function publicTopRow(r) {
  if (!r || typeof r !== 'object') return null;
  const out = { name: safeName(r.name) };
  for (const k of PUBLIC_ROW_FIELDS) {
    if (r[k] !== undefined && r[k] !== null) out[k] = r[k];
  }
  if (typeof out.car === 'string' && containsPhone(out.car)) out.car = '';
  out.pilotId = pubId(r.pilotId);
  return out;
}

function publicRows(rows) {
  return (rows || []).map(publicTopRow).filter(Boolean);
}

function sanitizeStraight(body, pilot) {
  const t = Number(body?.t);
  // anti-cheat bounds: 0–100 faster than 1.5 s is physically implausible for road cars; > 60 s is not a run
  if (!Number.isFinite(t) || t < 1.5 || t > 60) return null;
  if (!body?.gps) return null;
  const name = safeName(body.name || pilot.name);
  const car = cleanLabel(body.car, 80);
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
  const acc = boundedNum(body.avgAcc, 0, 1000);
  if (acc != null) row.avgAcc = Math.round(acc * 10) / 10;
  const hz = boundedNum(body.hz, 0, 100);
  if (hz != null) row.hz = Math.round(hz * 10) / 10;
  const wxS = sanitizeWeather(body.weather);
  if (wxS) row.weather = wxS;
  return row;
}

/** Finite number within [lo, hi] or null (drops NaN / Infinity / absurd values). */
function boundedNum(v, lo, hi) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) return null;
  return n;
}

/** Remote avatars: Telegram CDN only (arbitrary https would let anyone track viewers' IPs). */
const AVATAR_HOST_RE = /^https:\/\/([\w-]+\.)*(telegram\.org|t\.me|telesco\.pe)\//i;

function sanitizeAvatar(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (AVATAR_HOST_RE.test(s) && s.length <= 500 && !/["'<>\s]/.test(s)) return s;
  // data:image/jpeg|png|webp;base64,... — keep small thumbs only
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(s) && s.length <= 16000) return s;
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

const LAP_MIN_MS = 15_000; // shortest plausible karting/track lap
const LAP_MAX_MS = 60 * 60_000; // 1 h (Nordschleife tourist laps are ~8–12 min)

function sanitizeLap(body, pilot) {
  const t = String(body?.t || '').trim();
  if (!/^\d{1,2}:[0-5]\d(\.\d{1,3})?$/.test(t)) return null;
  const tMs = parseLapMs(t);
  if (tMs == null || tMs < LAP_MIN_MS || tMs > LAP_MAX_MS) return null;
  if (!body?.gps) return null;
  const name = safeName(body.name || pilot.name);
  const car = cleanLabel(body.car, 80);
  const { valid, gpsQ, flags } = computeValid(body);
  const row = {
    name,
    car,
    t,
    gps: true,
    valid,
    pilotId: pilot.id || null,
    at: Date.now(),
    dist: boundedNum(body.dist, 0, 100_000) ?? undefined,
    slipAvg: boundedNum(body.slipAvg, -100, 100) ?? undefined,
  };
  if (gpsQ) row.gpsQ = gpsQ;
  if (flags.length) row.flags = flags;
  const acc = boundedNum(body.avgAcc, 0, 1000);
  if (acc != null) row.avgAcc = Math.round(acc * 10) / 10;
  const hz = boundedNum(body.hz, 0, 100);
  if (hz != null) row.hz = Math.round(hz * 10) / 10;
  const wxL = sanitizeWeather(body.weather);
  if (wxL) row.weather = wxL;
  const ms = Number(body?.ms);
  if (body?.ms != null) {
    // ms must agree with the displayed time (±1 s) — otherwise the row is inconsistent / forged
    if (!Number.isFinite(ms) || Math.abs(ms - tMs) > 1000) return null;
    row.ms = Math.round(ms);
  }
  const sectors = sanitizeSectors(body);
  if (sectors && sectors[sectors.length - 1] <= tMs + 1000) row.sectors = sectors;
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
        name: safeName(r.name),
        car: String(r.car || '').slice(0, 80),
        pilotId: pubId(r.pilotId),
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
    nick: safeName(name || prev.nick),
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
        if (meta && meta.nick && (!r.name || r.name === 'пилот')) r.name = safeName(meta.nick);
      } catch (_) {}
    })
  );
  return rows;
}

function sanitizePulse(body, pilot) {
  const text = cleanText(body?.text, 280);
  if (!text) return null;
  const img = body?.img ? String(body.img) : '';
  return {
    // v80: id is always server-generated (a client-chosen id could collide with / shadow another post)
    id: Date.now().toString(36) + '-' + randB36(8),
    // Name fallback is a generic label — never the pilot id / phone.
    who: safeName(body.who, '') || safeName(pilot.name, '') || 'Пилот',
    text,
    img: /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(img) && img.length <= 200_000 ? img : null,
    at: Date.now(),
    likes: [],
    pilotId: pilot.id || null,
  };
}

/** Public pulse post: whitelisted; likes are opaque ids / names, phone-like entries masked. */
function publicPulse(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    id: p.id,
    who: safeName(p.who, 'Пилот'),
    text: String(p.text || ''),
    img: p.img || null,
    at: p.at || null,
    likes: (Array.isArray(p.likes) ? p.likes : []).map((x) => (containsPhone(x) ? '•' : String(x).slice(0, 64))),
    pilotId: pubId(p.pilotId),
  };
}

function publicPulseList(rows) {
  return (rows || []).map(publicPulse).filter(Boolean);
}

function shareId() {
  return Date.now().toString(36) + randB36(10);
}

/** Pulse list is one KV value: keep it ≤ ~3 MB (images!) so reads stay cheap and writes never hit the 25 MB cap. */
const PULSE_MAX_BYTES = 3_000_000;
async function writePulse(kv, rows) {
  let list = rows.slice(0, 200);
  let ser = JSON.stringify(list);
  while (ser.length > PULSE_MAX_BYTES && list.length > 1) {
    list = list.slice(0, Math.max(1, Math.floor(list.length * 0.8)));
    ser = JSON.stringify(list);
  }
  await kv.put('pulse', ser);
  return list;
}

/* ———————————————————— Share card payload (whitelist) ———————————————————— */
function sanitizeSharePayload(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const out = {
    brand: 'PITLANE',
    car: cleanLabel(p.car, 80) || '—',
    nick: safeName(p.nick),
    type: p.type === 'lap' || p.type === 'круг' ? 'lap' : '0-100',
    track: cleanLabel(p.track, 80),
    time: cleanLabel(p.time, 24) || '—',
    valid: p.valid !== false,
    at: boundedNum(p.at, 0, 4e12) ?? Date.now(),
    date: cleanLabel(p.date, 40),
  };
  if (p.gpsQ === 'A' || p.gpsQ === 'B' || p.gpsQ === 'C') out.gpsQ = p.gpsQ;
  const acc = boundedNum(p.avgAcc, 0, 1000); if (acc != null) out.avgAcc = acc;
  const hz = boundedNum(p.hz, 0, 100); if (hz != null) out.hz = hz;
  const wx = sanitizeWeather(p.weather); if (wx) out.weather = wx;
  if (typeof p.paint === 'string' && /^#[0-9a-f]{3,8}$/i.test(p.paint)) out.paint = p.paint;
  if (slugOk(p.trackId)) out.trackId = String(p.trackId);
  if (Array.isArray(p.sectors)) {
    const sec = p.sectors.slice(0, 3).map((x) => boundedNum(x, 0, LAP_MAX_MS));
    if (sec.every((x) => x != null)) out.sectors = sec;
  }
  const ms = boundedNum(p.ms, 0, LAP_MAX_MS); if (ms != null) out.ms = ms;
  return out;
}

/**
 * Fixed-window counter in KV → true when over the limit. v80: the window no longer slides on every hit,
 * and once over the limit nothing is written (so a flood can't turn into a KV write flood).
 */
async function rateHit(kv, key, limit, ttlSec) {
  const now = Date.now();
  let n = 0;
  let exp = 0;
  const raw = await kv.get(key);
  if (raw) {
    try {
      const o = JSON.parse(raw);
      n = Number(o.n) || 0;
      exp = Number(o.exp) || 0;
    } catch {
      n = Number(raw) || 0;
    }
  }
  if (!exp || exp <= now) { n = 0; exp = now + ttlSec * 1000; }
  if (n >= limit) return true;
  n += 1;
  await kv.put(key, JSON.stringify({ n, exp }), { expirationTtl: Math.max(60, Math.ceil((exp - now) / 1000)) });
  return false;
}

/** Several KV windows at once; returns a 429 Response or null. */
async function limitOr429(env, headers, rules) {
  for (const [key, limit, ttl] of rules) {
    if (await rateHit(env.PITLANE, key, limit, ttl)) {
      return json({ error: 'rate limit', retry: ttl }, 429, { ...headers, 'Retry-After': String(ttl) });
    }
  }
  return null;
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
  return 'd' + Date.now().toString(36) + randB36(10);
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

/**
 * Who is acting (duels / crews / check-in). Authenticated → account uuid (body can't override).
 * Guests → device id (dev_…) from header/body; phone-shaped or account-uuid guest ids are refused.
 */
function pilotLabel(pilot, body) {
  const name = safeName(pilot.name || body?.nick || body?.name || body?.createdBy);
  if (pilot.authed && pilot.id) return { id: pilot.id, name };
  // v80: guests must present a device id (dev_…); the old 'guest:<nick>' fallback let anyone act as anyone.
  const id = guestId(pilot.id) || guestId(body?.pilotId);
  return { id, name };
}

/** Requester identity for "is this mine" checks (account uuid or guest device id), '' if none. */
function viewerId(pilot) {
  if (pilot.authed && pilot.id) return pilot.id;
  return guestId(pilot.id);
}

function publicWho(w) {
  if (!w) return null;
  return { id: pubId(w.id), name: safeName(w.name) };
}

function publicDuel(d) {
  if (!d) return d;
  return {
    id: d.id,
    type: d.type,
    trackId: d.trackId || null,
    note: String(d.note || ''),
    status: d.status,
    createdAt: d.createdAt,
    expiresAt: d.expiresAt,
    createdBy: publicWho(d.createdBy),
    challenger: publicWho(d.challenger),
    creatorRun: d.creatorRun ? publicTopRow(d.creatorRun) : null,
    challengerRun: d.challengerRun ? publicTopRow(d.challengerRun) : null,
    winner: d.winner || null,
  };
}


const CREW_MAX = 10;

function crewId() {
  return 'c' + Date.now().toString(36) + randB36(10);
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

/** Public crew. The invite code is shown to members only (it used to leak to anyone with the crew id). */
function publicCrew(c, viewer) {
  if (!c) return null;
  const isMember = !!viewer && (c.members || []).some((m) => m.pilotId === viewer);
  return {
    id: c.id,
    name: safeName(c.name, 'экипаж'),
    trackId: c.trackId,
    inviteCode: isMember ? c.inviteCode : undefined,
    createdBy: publicWho(c.createdBy),
    members: (c.members || []).map((m) => ({
      pilotId: pubId(m.pilotId),
      nick: safeName(m.nick),
      joinedAt: m.joinedAt || null,
    })),
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
      pilotId: pubId(m.pilotId),
      nick: safeName(m.nick),
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
    name: safeName(crew.name, 'экипаж'),
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


/* ———————————————————— Telegram Login Widget ———————————————————— */

function telegramConfig(env) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  const username = String(env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
  const m = token.match(/^(\d{3,20}):[\w-]{20,}$/);
  const placeholder = !username || /^(YOUR_|CHANGE|TODO|placeholder)/i.test(username);
  return {
    // Username is optional (only used for display / widget); the redirect flow needs just the bot id.
    enabled: !!m,
    botId: m ? m[1] : null,
    username: placeholder ? null : username,
  };
}

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualStr(a, b) {
  a = String(a);
  b = String(b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * Verify Telegram Login Widget payload (https://core.telegram.org/widgets/login#checking-authorization):
 * data_check_string = all received fields except `hash`, sorted "key=value" joined by "\n";
 * secret_key = SHA256(bot_token); valid iff hex(HMAC_SHA256(data_check_string, secret_key)) == hash.
 * Also: auth_date must be fresh (< maxAgeSec) and not in the future.
 */
async function verifyTelegramAuth(data, botToken, opts = {}) {
  // v80: Login Widget payload comes straight back from oauth.telegram.org → 1 h is plenty (was 24 h)
  const maxAgeSec = opts.maxAgeSec || 3600;
  const nowSec = opts.nowSec || Math.floor(Date.now() / 1000);
  if (!botToken) return { ok: false, error: 'Telegram not configured', status: 503 };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'bad payload', status: 400 };
  const hash = String(data.hash || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, error: 'bad hash', status: 401 };
  const keys = Object.keys(data)
    .filter((k) => k !== 'hash' && data[k] != null && (typeof data[k] === 'string' || typeof data[k] === 'number'))
    .sort();
  if (keys.length > 16) return { ok: false, error: 'bad payload', status: 400 };
  const dcs = keys.map((k) => k + '=' + data[k]).join('\n');
  const enc = new TextEncoder();
  const secret = await crypto.subtle.digest('SHA-256', enc.encode(String(botToken)));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = bytesToHex(await crypto.subtle.sign('HMAC', key, enc.encode(dcs)));
  if (!timingSafeEqualStr(sig, hash)) return { ok: false, error: 'bad hash', status: 401 };
  const authDate = Number(data.auth_date);
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, error: 'bad auth_date', status: 401 };
  if (nowSec - authDate > maxAgeSec) return { ok: false, error: 'auth expired', status: 401 };
  if (authDate - nowSec > 300) return { ok: false, error: 'bad auth_date', status: 401 };
  const id = String(data.id || '');
  if (!/^\d{1,20}$/.test(id)) return { ok: false, error: 'bad id', status: 400 };
  const photo = String(data.photo_url || '');
  return {
    ok: true,
    id,
    username: data.username ? String(data.username).replace(/[^\w]/g, '').slice(0, 32) : null,
    firstName: data.first_name ? String(data.first_name).slice(0, 48) : null,
    lastName: data.last_name ? String(data.last_name).slice(0, 48) : null,
    photoUrl: /^https:\/\/[\w.-]*(telegram\.org|t\.me|telesco\.pe)\//i.test(photo) && photo.length <= 500 ? photo : null,
    authDate,
  };
}

/**
 * Verify Telegram Mini App initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 * data_check_string = all fields except `hash` (and `signature` is kept, per spec only `hash` is excluded), sorted "k=v" joined by "\n";
 * secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token); valid iff hex(HMAC_SHA256(key=secret_key, msg=dcs)) == hash.
 */
async function verifyTmaInitData(initData, botToken, opts = {}) {
  const maxAgeSec = opts.maxAgeSec || 86400;
  const nowSec = opts.nowSec || Math.floor(Date.now() / 1000);
  if (!botToken) return { ok: false, error: 'Telegram not configured', status: 503 };
  if (typeof initData !== 'string' || !initData || initData.length > 8192) return { ok: false, error: 'bad initData', status: 400 };
  let params;
  try { params = new URLSearchParams(initData); } catch (_) { return { ok: false, error: 'bad initData', status: 400 }; }
  const hash = String(params.get('hash') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, error: 'bad hash', status: 401 };
  const pairs = [];
  for (const [k, v] of params.entries()) if (k !== 'hash') pairs.push([k, v]);
  if (pairs.length > 32) return { ok: false, error: 'bad initData', status: 400 };
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dcs = pairs.map(([k, v]) => k + '=' + v).join('\n');
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', k1, enc.encode(String(botToken)));
  const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = bytesToHex(await crypto.subtle.sign('HMAC', k2, enc.encode(dcs)));
  if (!timingSafeEqualStr(sig, hash)) return { ok: false, error: 'bad hash', status: 401 };
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, error: 'bad auth_date', status: 401 };
  if (nowSec - authDate > maxAgeSec) return { ok: false, error: 'auth expired', status: 401 };
  if (authDate - nowSec > 300) return { ok: false, error: 'bad auth_date', status: 401 };
  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (_) { user = null; }
  const id = user && user.id != null ? String(user.id) : '';
  if (!/^\d{1,20}$/.test(id)) return { ok: false, error: 'no user', status: 400 };
  const photo = String(user.photo_url || '');
  return {
    ok: true,
    id,
    username: user.username ? String(user.username).replace(/[^\w]/g, '').slice(0, 32) : null,
    firstName: user.first_name ? String(user.first_name).slice(0, 48) : null,
    lastName: user.last_name ? String(user.last_name).slice(0, 48) : null,
    photoUrl: /^https:\/\/[\w.-]*(telegram\.org|t\.me|telesco\.pe)\//i.test(photo) && photo.length <= 500 ? photo : null,
    startParam: String(params.get('start_param') || '').slice(0, 64) || null,
    authDate,
  };
}

/** Shared by /auth/telegram (login widget) and /auth/tma (Mini App): same `auth:tg:<id>` → same pilot uuid. */
async function loginTelegramUser(env, v, provider) {
  const { pilot: rec, created } = await ensurePilotForProvider(env.PITLANE, 'tg', v.id, {
    nick: v.username || [v.firstName, v.lastName].filter(Boolean).join(' '),
    photoUrl: v.photoUrl,
  });
  const prov = (rec.providers || []).find((x) => x.type === 'tg');
  if (prov) prov.username = v.username || null;
  if (v.photoUrl && (!rec.photoRef || created)) rec.photoRef = v.photoUrl;
  rec.lastLogin = Date.now();
  await savePilot(env.PITLANE, rec);
  const token = await issueSession(env.PITLANE, rec, provider);
  return { ok: true, token, pilotId: rec.id, nick: rec.nick, provider, created, user: ownerUser(rec) };
}

const TMA_PARAM_RE = /^(duel|crew|lap|run|s|track|tops)_[A-Za-z0-9_-]{1,56}$/;

/** Bot API savePreparedInlineMessage → id for WebApp.shareMessage(). */
async function prepareTmaShare(env, v, body) {
  const tg = telegramConfig(env);
  const param = String(body?.param || '');
  if (!TMA_PARAM_RE.test(param)) return { status: 400, data: { ok: false, error: 'bad param' } };
  if (!tg.username) return { status: 503, data: { ok: false, error: 'bot username not configured' } };
  const text = cleanText(body?.text || 'PITLANE', 600).replace(/[<>]/g, '');
  const link = 'https://t.me/' + tg.username + '?startapp=' + encodeURIComponent(param);
  const result = {
    type: 'article',
    id: ('p' + Date.now().toString(36) + randB36(10)).slice(0, 64),
    title: cleanLabel(body?.title || 'PITLANE', 64) || 'PITLANE',
    description: text.split('\n')[0].slice(0, 120),
    input_message_content: { message_text: text + '\n' + link },
    reply_markup: { inline_keyboard: [[{ text: 'Открыть в PITLANE', url: link }]] },
  };
  const f = (env.__fetch || fetch);
  let res;
  try {
    res = await f('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/savePreparedInlineMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: Number(v.id), result,
        allow_user_chats: true, allow_bot_chats: false, allow_group_chats: true, allow_channel_chats: true,
      }),
    });
  } catch (_) {
    return { status: 502, data: { ok: false, error: 'telegram unreachable', link } };
  }
  const data = await res.json().catch(() => null);
  if (!data?.ok || !data.result?.id) return { status: 502, data: { ok: false, error: 'telegram: ' + String(data?.description || res.status).slice(0, 120), link } };
  return { status: 200, data: { ok: true, id: data.result.id, link } };
}

/* ———————————————————— Feedback (v80) ———————————————————— */

const FEEDBACK_TYPES = { bug: 'Ошибка', idea: 'Идея', complaint: 'Жалоба', other: 'Другое' };
const FEEDBACK_TTL = 180 * 24 * 60 * 60; // ~180 days
const FEEDBACK_MIN_FORM_MS = 3000; // bots submit instantly
const FEEDBACK_SHOT_MAX = 400 * 1024; // decoded JPEG bytes

function b64DecodedLen(b64) {
  const s = String(b64 || '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - pad;
}

/** → { spam:true } | { error } | { rec, shot } */
function sanitizeFeedback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid body' };
  // honeypot: hidden «website» input, humans never fill it
  if (body.website != null && String(body.website).trim() !== '') return { spam: true };
  const elapsed = Number(body.elapsedMs);
  if (!Number.isFinite(elapsed) || elapsed < FEEDBACK_MIN_FORM_MS) return { spam: true };
  const type = Object.prototype.hasOwnProperty.call(FEEDBACK_TYPES, body.type) ? body.type : null;
  if (!type) return { error: 'bad type' };
  const text = cleanText(body.text, 2100);
  const len = [...text].length;
  if (len < 10) return { error: 'text too short', min: 10 };
  if (len > 2000) return { error: 'text too long', max: 2000 };
  const contact = cleanLabel(body.contact, 120);
  let shot = null;
  if (body.screenshot != null && body.screenshot !== '') {
    const m = String(body.screenshot).match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!m) return { error: 'screenshot must be JPEG' };
    if (!m[1].startsWith('/9j/')) return { error: 'screenshot must be JPEG' }; // FF D8 FF magic
    if (b64DecodedLen(m[1]) > FEEDBACK_SHOT_MAX) return { error: 'screenshot too large', max: FEEDBACK_SHOT_MAX };
    shot = m[1];
  }
  const d = body.diag && typeof body.diag === 'object' ? body.diag : {};
  const diag = {
    app: cleanLabel(d.app, 24),
    sw: cleanLabel(d.sw, 32),
    ua: cleanLabel(d.ua, 300),
    tier: ['high', 'medium', 'low'].includes(d.tier) ? d.tier : '',
    tma: d.tma === true,
    tgPlatform: cleanLabel(d.tgPlatform, 24),
    tab: /^[a-z0-9_-]{1,24}$/i.test(String(d.tab || '')) ? String(d.tab) : '',
    lang: /^[a-z]{2}(-[A-Za-z]{2})?$/.test(String(d.lang || '')) ? String(d.lang) : '',
    screen: /^\d{2,5}x\d{2,5}(@[\d.]{1,4})?$/.test(String(d.screen || '')) ? String(d.screen) : '',
    online: d.online === false ? false : true,
    queued: d.queued === true,
  };
  return { rec: { type, text, contact, diag }, shot };
}

function feedbackMessage(rec, key) {
  const lines = [
    '📝 Pitlane · обратная связь · ' + FEEDBACK_TYPES[rec.type],
    '',
    rec.text,
    '',
    '— — —',
    'Контакт: ' + (rec.contact || '—'),
    'Пилот: ' + (rec.nick || '—') + (rec.authed ? ' (аккаунт ' + rec.pilotId + ')' : ' (гость)'),
    'App ' + (rec.diag.app || '?') + ' · SW ' + (rec.diag.sw || '?') + ' · 3D ' + (rec.diag.tier || '?') +
      ' · TMA ' + (rec.diag.tma ? 'да' + (rec.diag.tgPlatform ? ' (' + rec.diag.tgPlatform + ')' : '') : 'нет') +
      ' · вкладка ' + (rec.diag.tab || '?') + (rec.diag.queued ? ' · из офлайн-очереди' : ''),
    'UA: ' + (rec.diag.ua || '?') + (rec.diag.screen ? ' · ' + rec.diag.screen : ''),
    'KV: ' + key,
  ];
  // plain text (no parse_mode) → user text can't inject markup; Telegram limit 4096
  return lines.join('\n').slice(0, 4000);
}

/** Forward to the owner's chat. Returns true when Telegram accepted the message. Never throws. */
async function forwardFeedbackToTelegram(env, rec, key, shot) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  const chat = String(env.FEEDBACK_CHAT_ID || '').trim();
  if (!token || !/^-?\d{1,20}$/.test(chat)) return false;
  const f = env.__fetch || fetch;
  const api = 'https://api.telegram.org/bot' + token;
  const withTimeout = async (url, init) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try { return await f(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
  };
  try {
    const res = await withTimeout(api + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: feedbackMessage(rec, key), link_preview_options: { is_disabled: true } }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) return false;
    if (shot) {
      const bin = Uint8Array.from(atob(shot), (c) => c.charCodeAt(0));
      const fd = new FormData();
      fd.append('chat_id', chat);
      fd.append('caption', 'Скриншот · ' + key);
      fd.append('photo', new Blob([bin], { type: 'image/jpeg' }), 'screenshot.jpg');
      await withTimeout(api + '/sendPhoto', { method: 'POST', body: fd }).catch(() => null);
    }
    return true;
  } catch (_) {
    return false;
  }
}

/* ———————————————————— KV scan helpers ———————————————————— */

async function kvListAll(kv, prefix, limit = 20000) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor, limit: 1000 });
    for (const k of page.keys || []) out.push(k);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && out.length < limit);
  return out;
}

/** Put preserving an existing absolute expiration (from kv.list metadata) if any. */
async function kvPutKeep(kv, key, value, expiration) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiration && expiration > nowSec + 60) await kv.put(key, value, { expiration });
  else if (expiration) await kv.put(key, value, { expirationTtl: 60 });
  else await kv.put(key, value);
}

/* ———————————————————— Account deletion ———————————————————— */

/**
 * Remove everything tied to an account uuid.
 * Crews: member removed (+ their monthly bests). If they created the crew and others remain →
 * ownership passes to the earliest-joined remaining member; if nobody remains → crew + invite deleted.
 * Duels: any duel they took part in is deleted (short-lived, 7 days; a half-anonymous duel is useless).
 * Pulse: their posts deleted, their likes removed from others' posts.
 * Share cards (`share:<id>`) are anonymous snapshots without a pilot link and expire in 30 days.
 */
async function deleteAccount(kv, pid, currentToken) {
  const rep = {
    account: 0, providers: 0, sessions: 0, meta: 0, garage: 0,
    straightRows: 0, lapRows: 0, pulsePosts: 0, pulseLikes: 0,
    crewsLeft: 0, crewsTransferred: 0, crewsDeleted: 0, duels: 0, checkins: 0,
  };
  if (!isPilotUuid(pid)) return rep;
  const rec = await loadPilot(kv, pid);
  const del = async (key) => { await kv.delete(key); };

  // providers → auth mappings (+ phone-keyed OTP / rate-limit leftovers, legacy user record)
  for (const p of rec?.providers || []) {
    const akey = providerKey(p.type, p.id);
    const mapped = await kv.get(akey);
    if (mapped === pid) { await del(akey); rep.providers++; }
    if (p.type === 'phone') {
      await del('otp:' + p.id);
      await del('rl:otp:ph:' + p.id);
      await del('user:' + p.id);
      await del('garage:' + p.id);
      await del('pilotmeta:' + p.id);
    }
  }
  // sessions
  const tokens = new Set(((await kvJson(kv, 'sessidx:' + pid)) || []).filter(Boolean));
  if (currentToken) tokens.add(currentToken);
  for (const t of tokens) { await del('sess:' + t); rep.sessions++; }
  await del('sessidx:' + pid);
  // profile meta / avatar, garage
  if (await kv.get('pilotmeta:' + pid)) rep.meta++;
  await del('pilotmeta:' + pid);
  if (await kv.get('garage:' + pid)) rep.garage++;
  await del('garage:' + pid);

  // tops (sector tops are derived from lap rows)
  for (const [prefix, field] of [['straight:', 'straightRows'], ['lap:', 'lapRows']]) {
    for (const k of await kvListAll(kv, prefix)) {
      const rows = await readList(kv, k.name);
      const kept = rows.filter((r) => !(r && r.pilotId === pid));
      if (kept.length !== rows.length) {
        rep[field] += rows.length - kept.length;
        await kvPutKeep(kv, k.name, JSON.stringify(kept.slice(0, 200)), k.expiration);
      }
    }
  }
  // pulse
  {
    const rows = await readList(kv, 'pulse');
    let changed = false;
    const kept = [];
    for (const r of rows) {
      if (r && r.pilotId === pid) { rep.pulsePosts++; changed = true; continue; }
      if (r && Array.isArray(r.likes) && r.likes.includes(pid)) {
        r.likes = r.likes.filter((x) => x !== pid);
        rep.pulseLikes++;
        changed = true;
      }
      kept.push(r);
    }
    if (changed) await writeList(kv, 'pulse', kept);
  }
  // crews
  {
    const ids = new Set(((await kvJson(kv, 'crewidx:' + pid)) || []).filter(Boolean));
    for (const k of await kvListAll(kv, 'crew:')) ids.add(k.name.slice(5));
    for (const cid of ids) {
      const crew = await kvJson(kv, 'crew:' + cid);
      if (!crew) continue;
      const members = Array.isArray(crew.members) ? crew.members : [];
      const isMember = members.some((m) => m.pilotId === pid);
      const isOwner = crew.createdBy?.id === pid;
      if (!isMember && !isOwner) continue;
      crew.members = members.filter((m) => m.pilotId !== pid);
      if (crew.memberBests) delete crew.memberBests[pid];
      if (!crew.members.length) {
        await del('crew:' + cid);
        if (crew.inviteCode) await del('crewinv:' + crew.inviteCode);
        rep.crewsDeleted++;
        continue;
      }
      if (isOwner) {
        const heir = crew.members.slice().sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0];
        crew.createdBy = { id: heir.pilotId, name: heir.nick || 'пилот' };
        rep.crewsTransferred++;
      } else {
        rep.crewsLeft++;
      }
      await kv.put('crew:' + cid, JSON.stringify(crew));
    }
    await del('crewidx:' + pid);
  }
  // duels
  {
    const ids = new Set(((await kvJson(kv, 'duelidx:' + pid)) || []).filter(Boolean));
    for (const k of await kvListAll(kv, 'duel:')) ids.add(k.name.slice(5));
    for (const did of ids) {
      const d = await kvJson(kv, 'duel:' + did);
      if (!d) continue;
      if (d.createdBy?.id === pid || d.challenger?.id === pid ||
          d.creatorRun?.pilotId === pid || d.challengerRun?.pilotId === pid) {
        await del('duel:' + did);
        rep.duels++;
      }
    }
    await del('duelidx:' + pid);
  }
  // session-of-day check-ins
  for (const k of await kvListAll(kv, 'session:att:')) {
    const arr = await kvJson(kv, k.name);
    if (!Array.isArray(arr)) continue;
    const kept = arr.filter((a) => !(a && a.pilotId === pid));
    if (kept.length !== arr.length) {
      rep.checkins += arr.length - kept.length;
      await kvPutKeep(kv, k.name, JSON.stringify(kept), k.expiration);
    }
  }
  // feedback authored by this account (KV metadata carries the pilot id → no value reads needed)
  rep.feedback = 0;
  for (const k of await kvListAll(kv, 'feedback:')) {
    if (k.metadata && k.metadata.pid === pid) { await del(k.name); rep.feedback++; }
  }
  // per-account rate-limit counters (short-lived anyway; removed so nothing references the uuid)
  for (const b of ['top', 'pulse', 'pulsed', 'like', 'gar', 'me', 'del', 'fb', 'duel', 'crew']) await del('rl:' + b + ':p:' + pid);
  // finally the account record itself
  if (rec) rep.account = 1;
  await del('pilot:' + pid);
  return rep;
}

/* ———————————————————— Migration: phone pilot ids → opaque uuids ———————————————————— */

/**
 * Idempotent. Finds every phone-shaped pilot id (legacy sessions, user:<phone>, tops rows, pulse,
 * crews, duels, pilotmeta/garage/crewidx/duelidx keys, check-ins), maps each phone to an account uuid
 * (creating `pilot:<uuid>` + `auth:phone:<phone>` when missing) and rewrites the data in place.
 * Re-running finds nothing left to change.
 */
async function migratePilots(kv, { dry = false } = {}) {
  const rep = {
    phonesFound: 0, accountsCreated: 0, sessionsUpgraded: 0, legacyUsersFolded: 0,
    straightRows: 0, lapRows: 0, pulsePosts: 0, pulseLikes: 0, crews: 0, duels: 0,
    keysMoved: 0, checkins: 0, namesScrubbed: 0, unmappedDropped: 0,
  };
  const phones = new Set();
  const norm = (v) => normPhone(String(v || '').replace(/^\+/, ''));
  const addPhone = (v) => {
    if (!isPhoneLike(v)) return null;
    const p = norm(v);
    if (p.length >= 10) phones.add(p);
    return p;
  };

  // 1) discover
  const userKeys = await kvListAll(kv, 'user:');
  for (const k of userKeys) addPhone(k.name.slice(5));
  const sessKeys = await kvListAll(kv, 'sess:');
  const sessions = [];
  for (const k of sessKeys) {
    const s = await kvJson(kv, k.name);
    if (s && s.phone && !s.pilotId) { addPhone(s.phone) || phones.add(norm(s.phone)); sessions.push([k, s]); }
  }
  const idKeyPrefixes = ['pilotmeta:', 'garage:', 'crewidx:', 'duelidx:'];
  const idKeys = [];
  for (const pre of idKeyPrefixes) {
    for (const k of await kvListAll(kv, pre)) {
      const id = k.name.slice(pre.length);
      if (isPhoneLike(id)) { addPhone(id); idKeys.push([pre, id, k]); }
    }
  }
  const lists = [];
  for (const pre of ['straight:', 'lap:']) {
    for (const k of await kvListAll(kv, pre)) {
      const rows = await readList(kv, k.name);
      for (const r of rows) if (r && isPhoneLike(r.pilotId)) addPhone(r.pilotId);
      lists.push([k, rows, pre]);
    }
  }
  const pulse = await readList(kv, 'pulse');
  for (const r of pulse) {
    if (r && isPhoneLike(r.pilotId)) addPhone(r.pilotId);
    for (const l of r?.likes || []) if (isPhoneLike(l)) addPhone(l);
  }
  const crews = [];
  for (const k of await kvListAll(kv, 'crew:')) {
    const c = await kvJson(kv, k.name);
    if (!c) continue;
    for (const m of c.members || []) if (isPhoneLike(m.pilotId)) addPhone(m.pilotId);
    if (isPhoneLike(c.createdBy?.id)) addPhone(c.createdBy.id);
    for (const pid of Object.keys(c.memberBests || {})) if (isPhoneLike(pid)) addPhone(pid);
    crews.push([k, c]);
  }
  const duels = [];
  for (const k of await kvListAll(kv, 'duel:')) {
    const d = await kvJson(kv, k.name);
    if (!d) continue;
    for (const v of [d.createdBy?.id, d.challenger?.id, d.creatorRun?.pilotId, d.challengerRun?.pilotId]) {
      if (isPhoneLike(v)) addPhone(v);
    }
    duels.push([k, d]);
  }
  const atts = [];
  for (const k of await kvListAll(kv, 'session:att:')) {
    const arr = await kvJson(kv, k.name);
    if (!Array.isArray(arr)) continue;
    for (const a of arr) if (a && isPhoneLike(a.pilotId)) addPhone(a.pilotId);
    atts.push([k, arr]);
  }
  rep.phonesFound = phones.size;

  // 2) map phone → uuid (create accounts)
  const map = new Map();
  const nickOf = new Map();
  for (const ph of phones) {
    if (dry) {
      const existing = await kv.get('auth:phone:' + ph);
      map.set(ph, existing || 'p_dry-run');
      if (!existing) rep.accountsCreated++;
      continue;
    }
    const hadLegacy = !!(await kv.get('user:' + ph));
    const { pilot, created } = await ensurePilotForProvider(kv, 'phone', ph, {});
    if (created) rep.accountsCreated++;
    if (hadLegacy) rep.legacyUsersFolded++;
    map.set(ph, pilot.id);
    nickOf.set(pilot.id, pilot.nick);
  }
  const mapId = (v) => {
    if (!isPhoneLike(v)) return v;
    return map.get(norm(v)) || null;
  };
  // Scrub names that are phones or the old default "пилот" + last-4-digits.
  const fixName = (name, oldId, newId) => {
    const n = String(name || '');
    if (containsPhone(n) || (isPhoneLike(oldId) && isLegacyPhoneNick(n, norm(oldId)))) {
      rep.namesScrubbed++;
      return (newId && nickOf.get(newId)) || (newId ? defaultNick(newId) : 'пилот');
    }
    return name;
  };
  const W = async (fn) => { if (!dry) await fn(); };

  // 3) rewrite sessions
  for (const [k, s] of sessions) {
    const pid = map.get(norm(s.phone));
    if (!pid) continue;
    rep.sessionsUpgraded++;
    await W(async () => {
      await kvPutKeep(kv, k.name, JSON.stringify({ pilotId: pid, nick: nickOf.get(pid) || s.nick, provider: 'phone', at: s.at || Date.now() }), k.expiration);
      await addSessIdx(kv, pid, k.name.slice(5));
    });
  }
  // 4) id-keyed records
  for (const [pre, id, k] of idKeys) {
    const pid = map.get(norm(id));
    if (!pid) continue;
    rep.keysMoved++;
    await W(async () => {
      const oldRaw = await kv.get(k.name);
      const newKey = pre + pid;
      const cur = await kv.get(newKey);
      if (pre === 'crewidx:' || pre === 'duelidx:') {
        let a = []; let b = [];
        try { a = JSON.parse(oldRaw || '[]'); } catch {}
        try { b = JSON.parse(cur || '[]'); } catch {}
        const merged = [...new Set([...(Array.isArray(b) ? b : []), ...(Array.isArray(a) ? a : [])])].slice(0, 40);
        await kvPutKeep(kv, newKey, JSON.stringify(merged), k.expiration);
      } else if (pre === 'pilotmeta:') {
        let meta = {};
        try { meta = JSON.parse(oldRaw || '{}') || {}; } catch {}
        let prev = {};
        try { prev = JSON.parse(cur || '{}') || {}; } catch {}
        const next = { ...meta, ...prev };
        next.nick = fixName(next.nick, id, pid);
        await kvPutKeep(kv, newKey, JSON.stringify(next), k.expiration);
      } else if (!cur && oldRaw != null) {
        await kvPutKeep(kv, newKey, oldRaw, k.expiration);
      }
      await kv.delete(k.name);
    });
  }
  // 5) tops lists
  for (const [k, rows, pre] of lists) {
    let changed = false;
    for (const r of rows) {
      if (!r) continue;
      if (isPhoneLike(r.pilotId)) {
        const old = r.pilotId;
        r.pilotId = mapId(old);
        r.name = fixName(r.name, old, r.pilotId);
        rep[pre === 'lap:' ? 'lapRows' : 'straightRows']++;
        changed = true;
      } else if (containsPhone(r.name)) {
        r.name = fixName(r.name, null, r.pilotId);
        changed = true;
      }
    }
    if (changed) await W(() => kvPutKeep(kv, k.name, JSON.stringify(rows.slice(0, 200)), k.expiration));
  }
  // 6) pulse
  {
    let changed = false;
    for (const r of pulse) {
      if (!r) continue;
      if (isPhoneLike(r.pilotId)) {
        const old = r.pilotId;
        r.pilotId = mapId(old);
        r.who = fixName(r.who, old, r.pilotId);
        rep.pulsePosts++;
        changed = true;
      } else if (containsPhone(r.who)) {
        r.who = fixName(r.who, null, r.pilotId);
        changed = true;
      }
      if (Array.isArray(r.likes) && r.likes.some((l) => !isPilotUuid(l) && (isPhoneLike(l) || containsPhone(l)))) {
        r.likes = r.likes.map((l) => {
          if (isPilotUuid(l)) return l;
          if (isPhoneLike(l)) { rep.pulseLikes++; return mapId(l) || null; }
          if (containsPhone(l)) { rep.unmappedDropped++; return null; }
          return l;
        }).filter(Boolean);
        changed = true;
      }
    }
    if (changed) await W(() => writeList(kv, 'pulse', pulse));
  }
  // 7) crews
  for (const [k, c] of crews) {
    let changed = false;
    for (const m of c.members || []) {
      if (isPhoneLike(m.pilotId)) {
        const old = m.pilotId;
        m.pilotId = mapId(old);
        m.nick = fixName(m.nick, old, m.pilotId);
        changed = true;
      }
    }
    if (c.createdBy && isPhoneLike(c.createdBy.id)) {
      const old = c.createdBy.id;
      c.createdBy.id = mapId(old);
      c.createdBy.name = fixName(c.createdBy.name, old, c.createdBy.id);
      changed = true;
    }
    if (c.memberBests) {
      for (const pid of Object.keys(c.memberBests)) {
        if (isPhoneLike(pid)) {
          const nid = mapId(pid);
          if (nid) c.memberBests[nid] = c.memberBests[pid];
          delete c.memberBests[pid];
          changed = true;
        }
      }
    }
    if (changed) { rep.crews++; await W(() => kvPutKeep(kv, k.name, JSON.stringify(c), k.expiration)); }
  }
  // 8) duels
  for (const [k, d] of duels) {
    let changed = false;
    for (const w of [d.createdBy, d.challenger]) {
      if (w && isPhoneLike(w.id)) { const old = w.id; w.id = mapId(old); w.name = fixName(w.name, old, w.id); changed = true; }
    }
    for (const r of [d.creatorRun, d.challengerRun]) {
      if (r && isPhoneLike(r.pilotId)) { const old = r.pilotId; r.pilotId = mapId(old); r.name = fixName(r.name, old, r.pilotId); changed = true; }
    }
    if (changed) { rep.duels++; await W(() => kvPutKeep(kv, k.name, JSON.stringify(d), k.expiration)); }
  }
  // 9) check-ins
  for (const [k, arr] of atts) {
    let changed = false;
    for (const a of arr) {
      if (a && isPhoneLike(a.pilotId)) { const old = a.pilotId; a.pilotId = mapId(old); a.nick = fixName(a.nick, old, a.pilotId); changed = true; rep.checkins++; }
    }
    if (changed) await W(() => kvPutKeep(kv, k.name, JSON.stringify(arr), k.expiration));
  }
  return rep;
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
    const ip = clientIp(req);
    const isWrite = req.method !== 'GET' && req.method !== 'HEAD';

    // v80: per-IP burst limits (Workers Rate Limiting bindings, in-memory per colo, no KV cost)
    if (await burstLimited(env, isWrite ? 'RL_WRITE' : 'RL_READ', ip)) {
      return json({ error: 'rate limit', retry: 60 }, 429, { ...headers, 'Retry-After': '60' });
    }
    if (path.length > 256) return json({ error: 'not found' }, 404, headers);

    try {
    const pilot = await resolvePilot(req, env);
      if (req.method === 'GET' && path === '/health') {
        return json({ ok: true, service: 'pitlane-api' }, 200, headers);
      }

      // —— Auth OTP ——
      if (req.method === 'POST' && path === '/auth/otp') {
        const body = await readJson(req, BODY_LIMITS.auth);
        const phone = normPhone(body?.phone);
        if (phone.length !== 11 || !phone.startsWith('7')) {
          return json({ error: 'bad phone', hint: '+7…' }, 400, headers);
        }

        const phoneLimited = await rateHit(env.PITLANE, 'rl:otp:ph:' + phone, OTP_PHONE_LIMIT, 900);
        const ipLimited = await rateHit(env.PITLANE, 'rl:otp:ip:' + ip, OTP_IP_LIMIT, 900);
        if (phoneLimited || ipLimited) {
          return json({ error: 'rate limit', retry: 900 }, 429, headers);
        }
        // global daily SMS cap (SMS-pumping / toll-fraud guard) — only counts when a real send would happen
        if (twilioConfigured(env) && await rateHit(env.PITLANE, 'rl:otp:day:' + moscowDateKey(), OTP_DAILY_CAP, 86400)) {
          return json({ error: 'rate limit', retry: 3600 }, 429, headers);
        }

        const demo = isDemoSms(env);
        const code = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));

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
        if (await rateHit(env.PITLANE, 'rl:otpv:ip:' + ip, 30, 900)) {
          return json({ ok: false, error: 'rate limit', retry: 900 }, 429, headers);
        }
        const body = await readJson(req, BODY_LIMITS.auth);
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

        const { pilot: rec } = await ensurePilotForProvider(env.PITLANE, 'phone', phone, { nick: body?.nick });
        const wantNick = sanitizeNick(body?.nick);
        if (wantNick) rec.nick = wantNick;
        rec.lastLogin = Date.now();
        await savePilot(env.PITLANE, rec);
        const token = await issueSession(env.PITLANE, rec, 'phone');
        // `phone` is echoed only to its owner (this response), never in public endpoints.
        return json(
          { ok: true, token, pilotId: rec.id, phone, nick: rec.nick, provider: 'phone', user: ownerUser(rec) },
          200,
          headers
        );
      }

      // —— Which login providers are enabled (client hides disabled ones) ——
      if (req.method === 'GET' && path === '/auth/config') {
        const tg = telegramConfig(env);
        return json(
          {
            sms: twilioConfigured(env) || isDemoSms(env),
            smsDemo: isDemoSms(env) && !twilioConfigured(env),
            telegram: tg.enabled,
            telegramBot: tg.enabled ? tg.username : null,
            telegramBotId: tg.enabled ? tg.botId : null,
            tma: tg.enabled,
            tmaShare: tg.enabled && !!tg.username,
          },
          200,
          headers
        );
      }

      // —— Telegram Login Widget ——
      if (req.method === 'POST' && path === '/auth/telegram') {
        const tg = telegramConfig(env);
        if (!tg.enabled) return json({ ok: false, error: 'Telegram not configured' }, 503, headers);
        if (await rateHit(env.PITLANE, 'rl:tg:ip:' + ip, 30, 900)) {
          return json({ ok: false, error: 'rate limit', retry: 900 }, 429, headers);
        }
        const body = await readJson(req, BODY_LIMITS.auth);
        const payload = body && typeof body === 'object' && body.auth && typeof body.auth === 'object' ? body.auth : body;
        const v = await verifyTelegramAuth(payload, env.TELEGRAM_BOT_TOKEN);
        if (!v.ok) return json({ ok: false, error: v.error }, v.status || 401, headers);
        return json(await loginTelegramUser(env, v, 'telegram'), 200, headers);
      }

      // —— Telegram Mini App: raw initData → same account as /auth/telegram ——
      if (req.method === 'POST' && (path === '/auth/tma' || path === '/tma/share-prepare')) {
        const tg = telegramConfig(env);
        if (!tg.enabled) return json({ ok: false, error: 'Telegram not configured' }, 503, headers);
        if (await rateHit(env.PITLANE, 'rl:tma:ip:' + ip, 60, 900)) {
          return json({ ok: false, error: 'rate limit', retry: 900 }, 429, headers);
        }
        const body = await readJson(req, BODY_LIMITS.auth);
        const initData = typeof body === 'string' ? body : body?.initData;
        const v = await verifyTmaInitData(initData, env.TELEGRAM_BOT_TOKEN);
        if (!v.ok) return json({ ok: false, error: v.error }, v.status || 401, headers);
        if (path === '/auth/tma') {
          const out = await loginTelegramUser(env, v, 'tma');
          out.tgUserId = v.id;
          return json(out, 200, headers);
        }
        const r = await prepareTmaShare(env, v, body);
        return json(r.data, r.status, headers);
      }

      // —— Logout: revoke this session token server-side ——
      if (req.method === 'POST' && path === '/auth/logout') {
        if (pilot.authed && pilot.token) {
          await env.PITLANE.delete('sess:' + pilot.token);
          const idx = (await kvJson(env.PITLANE, 'sessidx:' + pilot.id)) || [];
          if (Array.isArray(idx) && idx.includes(pilot.token)) {
            const rest = idx.filter((t) => t !== pilot.token);
            if (rest.length) await env.PITLANE.put('sessidx:' + pilot.id, JSON.stringify(rest), { expirationTtl: SESS_TTL });
            else await env.PITLANE.delete('sessidx:' + pilot.id);
          }
        }
        return json({ ok: true }, 200, headers);
      }

      // —— Feedback (works for guests too) ——
      if (req.method === 'POST' && path === '/feedback') {
        const body = await readJson(req, BODY_LIMITS.feedback);
        const fb = sanitizeFeedback(body);
        // bots (honeypot / instant submit): pretend success, store nothing
        if (fb.spam) return json({ ok: true }, 200, headers);
        if (fb.error) return json({ ok: false, ...fb }, 400, headers);
        const who = viewerId(pilot);
        const rules = [
          ['rl:fb:ip:' + ip, 5, 3600],
          ['rl:fb:day:' + moscowDateKey(), 300, 86400], // global cap → bounded KV / Telegram usage
        ];
        if (who) rules.unshift(['rl:fb:p:' + who, 10, 86400]);
        const lim = await limitOr429(env, headers, rules);
        if (lim) return lim;
        const at = Date.now();
        const id = randB36(10);
        const key = 'feedback:' + at + ':' + id;
        const rec = {
          id,
          at,
          ...fb.rec,
          authed: !!pilot.authed,
          pilotId: pilot.authed ? pilot.id : (who ? publicGuestId(who) : null),
          nick: safeName(pilot.name, ''),
          screenshot: fb.shot ? 'data:image/jpeg;base64,' + fb.shot : null,
        };
        await env.PITLANE.put(key, JSON.stringify(rec), {
          expirationTtl: FEEDBACK_TTL,
          metadata: { pid: pilot.authed ? pilot.id : null, type: rec.type, shot: !!fb.shot },
        });
        const forwarded = await forwardFeedbackToTelegram(env, rec, key, fb.shot);
        return json({ ok: true, id, forwarded }, 200, headers);
      }

      // —— Own account ——
      if (path === '/me' && (req.method === 'GET' || req.method === 'PUT')) {
        const denied = requireAuth(pilot, headers);
        if (denied) return denied;
        const rec = await loadPilot(env.PITLANE, pilot.id);
        if (!rec) return json({ error: 'account not found' }, 404, headers);
        if (req.method === 'PUT') {
          const lim = await limitOr429(env, headers, [['rl:me:p:' + pilot.id, 30, 3600]]);
          if (lim) return lim;
          const body = await readJson(req, BODY_LIMITS.auth);
          const nick = sanitizeNick(body?.nick);
          if (nick) {
            rec.nick = nick;
            await savePilot(env.PITLANE, rec);
          }
        }
        return json({ ok: true, pilotId: rec.id, nick: rec.nick, user: ownerUser(rec) }, 200, headers);
      }

      // —— Account deletion (Google Play / 152-ФЗ) ——
      if (req.method === 'DELETE' && path === '/account') {
        const denied = requireAuth(pilot, headers);
        if (denied) return denied;
        // full-KV scan per call → strictly limited
        const lim = await limitOr429(env, headers, [['rl:del:p:' + pilot.id, 3, 3600], ['rl:del:ip:' + ip, 5, 3600]]);
        if (lim) return lim;
        const report = await deleteAccount(env.PITLANE, pilot.id, pilot.token);
        return json({ ok: true, deleted: report }, 200, headers);
      }

      // —— Admin: one-off idempotent migration phone ids → opaque uuids ——
      if (req.method === 'POST' && path === '/admin/migrate-pilots') {
        const adm = String(env.ADMIN_TOKEN || '');
        const got = String(req.headers.get('X-Admin-Token') || '');
        if (adm.length < 24) return json({ error: 'not found' }, 404, headers);
        if (await rateHit(env.PITLANE, 'rl:adm:ip:' + ip, 10, 3600)) return json({ error: 'not found' }, 404, headers);
        if (!timingSafeEqualStr(adm, got)) return json({ error: 'not found' }, 404, headers);
        const dry = url.searchParams.get('dry') === '1';
        const report = await migratePilots(env.PITLANE, { dry });
        return json({ ok: true, dry, report }, 200, headers);
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
          const lim = await limitOr429(env, headers, [['rl:gar:p:' + pilot.id, 60, 3600]]);
          if (lim) return lim;
          const body = await readJson(req, BODY_LIMITS.garage);
          const cars = Array.isArray(body?.cars)
            ? body.cars.slice(0, 40)
            : Array.isArray(body)
              ? body.slice(0, 40)
              : null;
          if (!cars) return json({ error: 'invalid garage' }, 400, headers);
          const payload = {
            cars,
            carId: body?.carId ? cleanLabel(body.carId, 64) : null,
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
        const body = await readJson(req, BODY_LIMITS.share);
        const payload = sanitizeSharePayload(body?.payload ?? body);
        if (!payload) {
          return json({ error: 'invalid payload' }, 400, headers);
        }
        // anonymous write → per-IP window + global daily cap (KV quota guard)
        const lim = await limitOr429(env, headers, [['rl:share:ip:' + ip, 30, 3600], ['rl:share:day:' + moscowDateKey(), 3000, 86400]]);
        if (lim) return lim;
        const id = shareId();
        await env.PITLANE.put('share:' + id, JSON.stringify(payload), {
          expirationTtl: SHARE_TTL,
        });
        return json({ id }, 200, headers);
      }

      let m = path.match(/^\/share\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const id = safeDecode(m[1]);
        if (!/^[a-z0-9]{4,40}$/i.test(id)) return json({ error: 'not found' }, 404, headers);
        const raw = await env.PITLANE.get('share:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        try {
          // v80: whitelist on read too (old cards were stored verbatim; phone-ish nicks → «пилот»)
          const payload = sanitizeSharePayload(JSON.parse(raw));
          if (!payload) return json({ error: 'not found' }, 404, headers);
          return json(payload, 200, headers);
        } catch {
          return json({ error: 'corrupt' }, 500, headers);
        }
      }

      // —— Tops straight ——
      m = path.match(/^\/tops\/straight\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const carId = safeDecode(m[1]);
        if (!slugOk(carId)) return json([], 200, headers);
        const wx = sanitizeWeather(url.searchParams.get('weather'));
        let rows = (await readList(env.PITLANE, `straight:${carId}`))
          .filter(isValidGpsRow)
          .sort((a, b) => a.t - b.t);
        if (wx) rows = rows.filter((r) => r && r.weather === wx);
        return json(publicRows(rows), 200, headers);
      }
      if (req.method === 'POST' && m) {
        const denied = requireAuth(pilot, headers);
        if (denied) return denied;
        const carId = safeDecode(m[1]);
        if (!slugOk(carId)) return json({ error: 'bad car id' }, 400, headers);
        const lim = await limitOr429(env, headers, [['rl:top:p:' + pilot.id, 60, 3600]]);
        if (lim) return lim;
        const body = await readJson(req);
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
        return json(publicRows(rows.filter(isValidGpsRow)), 200, headers);
      }

      // —— Tops lap ——
      m = path.match(/^\/tops\/lap\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const trackId = safeDecode(m[1]);
        if (!slugOk(trackId)) return json([], 200, headers);
        const wx = sanitizeWeather(url.searchParams.get('weather'));
        let rows = (await readList(env.PITLANE, `lap:${trackId}`)).filter(isValidGpsRow);
        if (wx) rows = rows.filter((r) => r && r.weather === wx);
        return json(publicRows(rows), 200, headers);
      }
      if (req.method === 'POST' && m) {
        const denied = requireAuth(pilot, headers);
        if (denied) return denied;
        const trackId = safeDecode(m[1]);
        if (!slugOk(trackId)) return json({ error: 'bad track id' }, 400, headers);
        const lim = await limitOr429(env, headers, [['rl:top:p:' + pilot.id, 60, 3600]]);
        if (lim) return lim;
        const body = await readJson(req);
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
        return json(publicRows(rows.filter(isValidGpsRow)), 200, headers);
      }

      // —— Tops sector (public A/B best sector times) ——
      m = path.match(/^\/tops\/sector\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const trackId = safeDecode(m[1]);
        if (!slugOk(trackId)) return json({ trackId: null, sectors: [[], [], []] }, 200, headers);
        const sectorParam = url.searchParams.get('sector');
        const wx = sanitizeWeather(url.searchParams.get('weather'));
        let rows = (await readList(env.PITLANE, `lap:${trackId}`)).filter(isAbLapRow);
        if (wx) rows = rows.filter((r) => r && r.weather === wx);
        if (sectorParam == null || sectorParam === '' || sectorParam === 'all') {
          const sectors = [];
          for (let i = 0; i < 3; i++) {
            let board = buildSectorLeaderboard(rows, i);
            board = await enrichSectorAvatars(env.PITLANE, board);
            sectors.push(publicRows(board));
          }
          return json({ trackId, sectors }, 200, headers);
        }
        const sector = Math.max(0, Math.min(2, Number(sectorParam) | 0 || 0));
        let board = buildSectorLeaderboard(rows, sector);
        board = await enrichSectorAvatars(env.PITLANE, board);
        return json({ trackId, sector, rows: publicRows(board) }, 200, headers);
      }

      // —— Pulse ——
      if (path === '/pulse') {
        if (req.method === 'GET') {
          const rows = await readList(env.PITLANE, 'pulse');
          rows.sort((a, b) => (b.at || 0) - (a.at || 0));
          return json(publicPulseList(rows.slice(0, 200)), 200, headers);
        }
        if (req.method === 'POST') {
          const denied = requireAuth(pilot, headers);
          if (denied) return denied;
          const lim = await limitOr429(env, headers, [['rl:pulse:p:' + pilot.id, 10, 3600], ['rl:pulsed:p:' + pilot.id, 40, 86400]]);
          if (lim) return lim;
          const body = await readJson(req, BODY_LIMITS.pulse);
          const row = sanitizePulse(body, pilot);
          if (!row) return json({ error: 'invalid pulse' }, 400, headers);
          const rows = await readList(env.PITLANE, 'pulse');
          rows.unshift(row);
          const kept = await writePulse(env.PITLANE, rows);
          return json(publicPulseList(kept), 200, headers);
        }
      }

      m = path.match(/^\/pulse\/([^/]+)\/like$/);
      if (req.method === 'POST' && m) {
        const denied = requireAuth(pilot, headers);
        if (denied) return denied;
        const id = safeDecode(m[1]).slice(0, 64);
        const lim = await limitOr429(env, headers, [['rl:like:p:' + pilot.id, 120, 3600]]);
        if (lim) return lim;
        // Likes are keyed by the opaque account id (never a phone / nick).
        const who = pilot.id;
        const rows = await readList(env.PITLANE, 'pulse');
        const p = rows.find((x) => x.id === id);
        if (!p) return json({ error: 'not found' }, 404, headers);
        p.likes = Array.isArray(p.likes) ? p.likes.slice(0, 5000) : [];
        const i = p.likes.indexOf(who);
        if (i >= 0) p.likes.splice(i, 1);
        else p.likes.push(who);
        await writePulse(env.PITLANE, rows);
        rows.sort((a, b) => (b.at || 0) - (a.at || 0));
        return json(publicPulseList(rows.slice(0, 200)), 200, headers);
      }

      m = path.match(/^\/pulse\/([^/]+)$/);
      if (req.method === 'DELETE' && m) {
        const denied = requireAuth(pilot, headers);
        if (denied) return denied;
        const id = safeDecode(m[1]).slice(0, 64);
        // Only the author (by account id) can delete a post.
        let rows = await readList(env.PITLANE, 'pulse');
        const before = rows.length;
        rows = rows.filter((x) => !(x.id === id && x.pilotId && x.pilotId === pilot.id));
        if (rows.length !== before) await writePulse(env.PITLANE, rows);
        rows.sort((a, b) => (b.at || 0) - (a.at || 0));
        return json(publicPulseList(rows.slice(0, 200)), 200, headers);
      }


      // —— Duels / Challenge ——
      if (req.method === 'POST' && path === '/duel') {
        const body = await readJson(req);
        const type = body?.type === 'lap' ? 'lap' : body?.type === 'drag' ? 'drag' : null;
        if (!type) return json({ error: 'type must be drag|lap' }, 400, headers);
        const trackId = type === 'lap' ? String(body?.trackId || '').trim().slice(0, 64) : null;
        if (type === 'lap' && !slugOk(trackId)) return json({ error: 'trackId required for lap' }, 400, headers);
        const who = pilotLabel(pilot, body);
        if (!who.id) return json({ error: 'pilot required' }, 400, headers);
        if (!who.name) return json({ error: 'createdBy / nick required' }, 400, headers);
        const lim = await limitOr429(env, headers, [['rl:duel:ip:' + ip, 20, 3600], ['rl:duel:p:' + who.id, 20, 86400]]);
        if (lim) return lim;
        const note = body?.note != null ? cleanLabel(body.note, 140) : '';
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
        return json(publicDuel(duel), 200, headers);
      }

      if (req.method === 'GET' && path === '/duels') {
        const mine = String(url.searchParams.get('mine') || '').trim().slice(0, 64);
        if (!mine) return json({ error: 'mine= required' }, 400, headers);
        // v80: only your own list (was: anyone could list any pilot's duels by id)
        if (mine !== viewerId(pilot)) return json([], 200, headers);
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
            out.push(publicDuel(d));
          } catch (_) {}
        }
        return json(out, 200, headers);
      }

      m = path.match(/^\/duel\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const id = safeDecode(m[1]).slice(0, 64);
        const raw = await env.PITLANE.get('duel:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let d;
        try { d = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        const before = d.status;
        d = refreshDuelStatus(d);
        if (d.status !== before) {
          await env.PITLANE.put('duel:' + id, JSON.stringify(d), { expirationTtl: DUEL_TTL + 86400 });
        }
        return json(publicDuel(d), 200, headers);
      }

      m = path.match(/^\/duel\/([^/]+)\/run$/);
      if (req.method === 'POST' && m) {
        const id = safeDecode(m[1]).slice(0, 64);
        const raw = await env.PITLANE.get('duel:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let d;
        try { d = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        d = refreshDuelStatus(d);
        if (d.status === 'expired') return json({ error: 'duel expired', duel: publicDuel(d) }, 410, headers);
        if (d.status === 'ready') return json({ error: 'duel locked', duel: publicDuel(d) }, 409, headers);

        const body = await readJson(req);
        const who = pilotLabel(pilot, body);
        if (!who.id) return json({ error: 'pilot required' }, 400, headers);
        const lim = await limitOr429(env, headers, [['rl:drun:ip:' + ip, 30, 3600]]);
        if (lim) return lim;
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
          if (d.creatorRun) return json({ error: 'creator already submitted', duel: publicDuel(d) }, 409, headers);
          d.creatorRun = run;
          d.createdBy = { id: who.id, name: who.name || d.createdBy?.name || 'пилот' };
        } else if (isChallenger) {
          if (d.challengerRun) return json({ error: 'challenger already submitted', duel: publicDuel(d) }, 409, headers);
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
          return json({ error: 'creator already submitted', duel: publicDuel(d) }, 409, headers);
        } else {
          return json({ error: 'slot unavailable', duel: publicDuel(d) }, 409, headers);
        }

        d = refreshDuelStatus(d);
        await env.PITLANE.put('duel:' + id, JSON.stringify(d), { expirationTtl: DUEL_TTL + 86400 });
        return json(publicDuel(d), 200, headers);
      }


      // —— Crews / Экипажи ——
      if (req.method === 'POST' && path === '/crew') {
        const body = await readJson(req);
        const name = cleanLabel(body?.name, 48);
        const trackId = String(body?.trackId || '').trim().slice(0, 64);
        if (!name || containsPhone(name)) return json({ error: 'name required' }, 400, headers);
        if (!slugOk(trackId)) return json({ error: 'trackId required' }, 400, headers);
        const who = pilotLabel(pilot, {
          pilotId: body?.pilotId,
          name: body?.nick || body?.createdBy,
          createdBy: body?.createdBy,
        });
        if (!who.id) return json({ error: 'pilot required' }, 400, headers);
        const lim = await limitOr429(env, headers, [['rl:crew:ip:' + ip, 10, 3600], ['rl:crew:p:' + who.id, 10, 86400]]);
        if (lim) return lim;
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
        return json({ ...publicCrew(crew, who.id), inviteCode: code }, 200, headers);
      }

      if (req.method === 'GET' && path === '/crews') {
        const mine = String(url.searchParams.get('mine') || '').trim().slice(0, 64);
        if (!mine) return json({ error: 'mine= required' }, 400, headers);
        // v80: only your own list (was: anyone could list any pilot's crews + invite codes)
        if (mine !== viewerId(pilot)) return json([], 200, headers);
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
            out.push(publicCrew(JSON.parse(raw), mine));
          } catch (_) {}
        }
        return json(out, 200, headers);
      }

      // join by invite code
      if (req.method === 'POST' && path === '/crew/join') {
        const body = await readJson(req);
        const code = String(body?.code || body?.inviteCode || '').trim().toUpperCase().slice(0, 12);
        if (!/^[A-Z0-9]{4,12}$/.test(code)) return json({ error: 'code required' }, 400, headers);
        // invite-code guessing guard
        const lim = await limitOr429(env, headers, [['rl:cjoin:ip:' + ip, 20, 3600]]);
        if (lim) return lim;
        const cid = await env.PITLANE.get('crewinv:' + code);
        if (!cid) return json({ error: 'invalid invite' }, 404, headers);
        // fall through by rewriting to /crew/:id/join via internal hop — handled below by cloning logic
        const raw = await env.PITLANE.get('crew:' + cid);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let crew;
        try { crew = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        const who = pilotLabel(pilot, body);
        const nick = safeName(body?.nick || who.name);
        const pilotId = who.id;
        if (!pilotId) return json({ error: 'pilotId required' }, 400, headers);
        crew.members = Array.isArray(crew.members) ? crew.members : [];
        const existing = crew.members.find((m) => m.pilotId === pilotId);
        if (existing) {
          existing.nick = nick;
          await env.PITLANE.put('crew:' + crew.id, JSON.stringify(crew));
          await indexCrewMine(env.PITLANE, pilotId, crew.id);
          return json(publicCrew(crew, pilotId), 200, headers);
        }
        if (crew.members.length >= CREW_MAX) return json({ error: 'crew full', max: CREW_MAX }, 409, headers);
        crew.members.push({ pilotId, nick, joinedAt: Date.now() });
        await env.PITLANE.put('crew:' + crew.id, JSON.stringify(crew));
        await indexCrewMine(env.PITLANE, pilotId, crew.id);
        return json(publicCrew(crew, pilotId), 200, headers);
      }

      m = path.match(/^\/crew\/([^/]+)$/);
      if (m) {
        const id = safeDecode(m[1]).slice(0, 64);
        if (req.method === 'GET') {
          const raw = await env.PITLANE.get('crew:' + id);
          if (!raw) return json({ error: 'not found' }, 404, headers);
          try {
            return json(publicCrew(JSON.parse(raw), viewerId(pilot)), 200, headers);
          } catch {
            return json({ error: 'corrupt' }, 500, headers);
          }
        }
      }

      m = path.match(/^\/crew\/([^/]+)\/join$/);
      if (req.method === 'POST' && m) {
        const id = safeDecode(m[1]).slice(0, 64);
        const body = await readJson(req);
        const lim = await limitOr429(env, headers, [['rl:cjoin:ip:' + ip, 20, 3600]]);
        if (lim) return lim;
        const raw = await env.PITLANE.get('crew:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let crew;
        try { crew = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        const who = pilotLabel(pilot, body);
        const nick = safeName(body?.nick || who.name);
        const pilotId = who.id;
        if (!pilotId) return json({ error: 'pilotId required' }, 400, headers);
        crew.members = Array.isArray(crew.members) ? crew.members : [];
        const existing = crew.members.find((x) => x.pilotId === pilotId);
        if (existing) {
          existing.nick = nick;
          await env.PITLANE.put('crew:' + id, JSON.stringify(crew));
          await indexCrewMine(env.PITLANE, pilotId, id);
          return json(publicCrew(crew, pilotId), 200, headers);
        }
        if (crew.members.length >= CREW_MAX) return json({ error: 'crew full', max: CREW_MAX }, 409, headers);
        crew.members.push({ pilotId, nick, joinedAt: Date.now() });
        await env.PITLANE.put('crew:' + id, JSON.stringify(crew));
        await indexCrewMine(env.PITLANE, pilotId, id);
        return json(publicCrew(crew, pilotId), 200, headers);
      }

      m = path.match(/^\/crew\/([^/]+)\/board$/);
      if (req.method === 'GET' && m) {
        const id = safeDecode(m[1]).slice(0, 64);
        const raw = await env.PITLANE.get('crew:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let crew;
        try { crew = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        const board = await buildCrewBoard(env.PITLANE, crew);
        return json(board, 200, headers);
      }

      m = path.match(/^\/crew\/([^/]+)\/best$/);
      if (req.method === 'POST' && m) {
        const id = safeDecode(m[1]).slice(0, 64);
        const body = await readJson(req);
        const lim = await limitOr429(env, headers, [['rl:cbest:ip:' + ip, 60, 3600]]);
        if (lim) return lim;
        const raw = await env.PITLANE.get('crew:' + id);
        if (!raw) return json({ error: 'not found' }, 404, headers);
        let crew;
        try { crew = JSON.parse(raw); } catch { return json({ error: 'corrupt' }, 500, headers); }
        const who = pilotLabel(pilot, body);
        const pilotId = who.id;
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
          if (body?.nick) member.nick = safeName(body.nick);
          await env.PITLANE.put('crew:' + id, JSON.stringify(crew));
        }
        const board = await buildCrewBoard(env.PITLANE, crew);
        return json({ ok: true, best: crew.memberBests[pilotId] || null, board }, 200, headers);
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
          name: safeName(r.name),
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
              nick: safeName(a.nick),
              at: a.at || null,
            })),
          },
          200,
          headers
        );
      }

      if (req.method === 'POST' && path === '/session/today/checkin') {
        const body = await readJson(req);
        const lim = await limitOr429(env, headers, [['rl:chk:ip:' + ip, 10, 3600]]);
        if (lim) return lim;
        let manual = null;
        const mraw = await env.PITLANE.get('session:day');
        if (mraw) {
          try { manual = JSON.parse(mraw); } catch { manual = null; }
        }
        const picked = pickSessionOfDay(manual);
        const who = pilotLabel(pilot, body);
        const nick = safeName(body?.nick || who.name);
        const pilotId = who.id && !who.id.startsWith('guest:') ? who.id : '';
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
              nick: safeName(a.nick),
              at: a.at || null,
            })),
          },
          200,
          headers
        );
      }


      return json({ error: 'not found' }, 404, headers);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status, headers);
      // never leak internals / stack traces to clients; details go to Workers logs only
      console.error('pitlane-api error', req.method, path, err && err.stack ? err.stack : err);
      return json({ error: 'internal error' }, 500, headers);
    }
  },
};
