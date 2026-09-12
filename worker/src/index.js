/**
 * Pitlane shared tops API — Cloudflare Worker + KV
 * Bindings: PITLANE (KV namespace)
 */
const DEFAULT_ORIGINS = [
  'https://dsssssz.github.io',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

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
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Pilot-Id, X-Pilot-Name',
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

function pilotFrom(req) {
  const id = (req.headers.get('X-Pilot-Id') || '').trim().slice(0, 64);
  const name = (req.headers.get('X-Pilot-Name') || '').trim().slice(0, 48);
  return { id, name };
}

function sanitizeStraight(body, pilot) {
  const t = Number(body?.t);
  if (!Number.isFinite(t) || t <= 0 || t > 60) return null;
  if (!body?.gps) return null;
  const name = String(body.name || pilot.name || 'пилот').slice(0, 48);
  const car = String(body.car || '').slice(0, 80);
  return {
    name,
    car,
    t: Math.round(t * 1000) / 1000,
    gps: true,
    pilotId: pilot.id || null,
    at: Date.now(),
  };
}

function sanitizeLap(body, pilot) {
  const t = String(body?.t || '').trim();
  if (!/^\d+:\d{2}(\.\d+)?$/.test(t)) return null;
  if (!body?.gps) return null;
  const name = String(body.name || pilot.name || 'пилот').slice(0, 48);
  const car = String(body.car || '').slice(0, 80);
  return {
    name,
    car,
    t,
    gps: true,
    pilotId: pilot.id || null,
    at: Date.now(),
  };
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
  };
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
    const pilot = pilotFrom(req);

    try {
      if (req.method === 'GET' && path === '/health') {
        return json({ ok: true, service: 'pitlane-api' }, 200, headers);
      }

      // GET /tops/straight/:carId
      let m = path.match(/^\/tops\/straight\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const carId = decodeURIComponent(m[1]);
        const rows = (await readList(env.PITLANE, `straight:${carId}`))
          .filter((r) => r && r.gps)
          .sort((a, b) => a.t - b.t);
        return json(rows, 200, headers);
      }
      if (req.method === 'POST' && m) {
        const carId = decodeURIComponent(m[1]);
        const body = await req.json().catch(() => null);
        const row = sanitizeStraight(body, pilot);
        if (!row) return json({ error: 'invalid gps straight row' }, 400, headers);
        const key = `straight:${carId}`;
        const rows = await readList(env.PITLANE, key);
        rows.push(row);
        rows.sort((a, b) => a.t - b.t);
        await writeList(env.PITLANE, key, rows);
        return json(rows.filter((r) => r.gps), 200, headers);
      }

      m = path.match(/^\/tops\/lap\/([^/]+)$/);
      if (req.method === 'GET' && m) {
        const trackId = decodeURIComponent(m[1]);
        const rows = (await readList(env.PITLANE, `lap:${trackId}`)).filter((r) => r && r.gps);
        return json(rows, 200, headers);
      }
      if (req.method === 'POST' && m) {
        const trackId = decodeURIComponent(m[1]);
        const body = await req.json().catch(() => null);
        const row = sanitizeLap(body, pilot);
        if (!row) return json({ error: 'invalid gps lap row' }, 400, headers);
        const key = `lap:${trackId}`;
        const rows = await readList(env.PITLANE, key);
        rows.push(row);
        await writeList(env.PITLANE, key, rows);
        return json(rows.filter((r) => r.gps), 200, headers);
      }

      if (path === '/pulse') {
        if (req.method === 'GET') {
          const rows = await readList(env.PITLANE, 'pulse');
          rows.sort((a, b) => (b.at || 0) - (a.at || 0));
          return json(rows.slice(0, 200), 200, headers);
        }
        if (req.method === 'POST') {
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
      if (req.method === 'POST' && path.endsWith('/del')) {
        /* unused */
      }
      if (req.method === 'DELETE' && m) {
        const id = decodeURIComponent(m[1]);
        const who = pilot.name || pilot.id || '';
        let rows = await readList(env.PITLANE, 'pulse');
        rows = rows.filter((x) => !(x.id === id && x.who === who));
        await writeList(env.PITLANE, 'pulse', rows);
        return json(rows.slice(0, 200), 200, headers);
      }

      return json({ error: 'not found', path }, 404, headers);
    } catch (err) {
      return json({ error: String(err?.message || err) }, 500, headers);
    }
  },
};
