/**
 * Pitlane shared tops API — Cloudflare Worker + KV
 * Bindings: PITLANE (KV namespace)
 * Env: SMS_DEMO (default 1), TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, EXTRA_ORIGINS
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
  return row;
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

async function sendTwilioSms(env, phone, code) {
  const sid = env.TWILIO_SID;
  const token = env.TWILIO_TOKEN;
  const from = env.TWILIO_FROM;
  if (!sid || !token || !from) return false;
  const to = phone.startsWith('+') ? phone : '+' + phone;
  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: `Pitlane код: ${code}`,
  });
  const auth = btoa(`${sid}:${token}`);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }
  );
  return res.ok;
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
        const phone = String(body?.phone || '').replace(/\D/g, '');
        if (phone.length < 10) return json({ error: 'bad phone' }, 400, headers);

        const ip = clientIp(req);
        const phoneLimited = await rateHit(env.PITLANE, 'rl:otp:ph:' + phone, OTP_PHONE_LIMIT, 900);
        const ipLimited = await rateHit(env.PITLANE, 'rl:otp:ip:' + ip, OTP_IP_LIMIT, 900);
        if (phoneLimited || ipLimited) {
          return json({ error: 'rate limit', retry: 900 }, 429, headers);
        }

        const code = String(Math.floor(1000 + Math.random() * 9000));
        await env.PITLANE.put(
          'otp:' + phone,
          JSON.stringify({ code, exp: Date.now() + 10 * 60 * 1000 }),
          { expirationTtl: 600 }
        );

        let sent = false;
        try {
          sent = await sendTwilioSms(env, phone, code);
        } catch (_) {
          sent = false;
        }

        const demo = String(env.SMS_DEMO ?? '1') !== '0';
        // SMS_DEMO=0 and no Twilio → hard error, never leak demoCode
        if (!demo && !sent) {
          return json(
            { ok: false, error: 'SMS not configured', sent: false },
            503,
            headers
          );
        }

        const out = { ok: true, sent, demo: demo && !sent };
        if (demo && !sent) out.demoCode = code;
        return json(out, 200, headers);
      }

      if (req.method === 'POST' && path === '/auth/verify') {
        const body = await req.json().catch(() => null);
        const phone = String(body?.phone || '').replace(/\D/g, '');
        const code = String(body?.code || '').trim();
        const raw = await env.PITLANE.get('otp:' + phone);
        if (!raw) return json({ ok: false, error: 'no otp' }, 400, headers);
        let otp;
        try {
          otp = JSON.parse(raw);
        } catch {
          return json({ ok: false }, 400, headers);
        }
        if (Date.now() > otp.exp) return json({ ok: false, error: 'expired' }, 400, headers);
        if (code !== String(otp.code)) return json({ ok: false, error: 'bad code' }, 400, headers);
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
        const key = `lap:${trackId}`;
        const rows = await readList(env.PITLANE, key);
        rows.push(row);
        await writeList(env.PITLANE, key, rows);
        return json(rows.filter(isValidGpsRow), 200, headers);
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

      return json({ error: 'not found', path }, 404, headers);
    } catch (err) {
      return json({ error: String(err?.message || err) }, 500, headers);
    }
  },
};
