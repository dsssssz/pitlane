/**
 * v116: PITLANE GPS по Wi-Fi (режим модема телефона) → Worker → Mini App почти в реальном времени.
 *
 * Привязка:  Mini App  POST /gps/pair            → код (6 символов, 20 мин, одноразовый)
 *            чип       POST /gps/claim {code}     → токен устройства (только чипу; в KV — лишь sha256)
 *            Mini App  GET /gps/devices · DELETE /gps/devices/<id> (отзыв: хэш удаляется, live-сокет рвётся)
 * Live:      чип       GET /gps/ws   (WSS, Authorization: Bearer <токен устройства>)
 *            Mini App  GET /gps/live (WSS, Sec-WebSocket-Protocol: pitlane.v1, bearer.<сессия>) — токен не в URL
 *            Оба сокета живут в Durable Object GpsLive (один на пилота, idFromName(pilotId)).
 * KV — только привязка (пара записей на привязку); live-поток в KV не пишется вообще.
 * Экран — справочно: зачёт в топ идёт прежним путём (приложение шлёт сырой трек, сервер пересчитывает gps-core).
 *
 * KV:  gpspair:<CODE> {pid, at} TTL 20 мин · gpsdev:<sha256> {pid, devId, name, at} · gpsdevs:<pid> [{devId, h, name, at, fw}]
 */
export const GPS_PAIR_TTL = 20 * 60;
export const GPS_MAX_DEVICES = 3;
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const DEV_ID_RE = /^g[a-z0-9]{8}$/;
const TOKEN_RE = /^[a-f0-9]{48}$/;
const BID_RE = /^[a-z0-9]{4,16}$/;
const WS_PROTO = 'pitlane.v1';

function randCode() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((b) => CODE_ALPHA[b % 32]).join('');
}
export const devHash = (h, token) => h.sha256Hex('pitlane-gpsdev:' + token);

async function listDevices(kv, pid, h) {
  const l = await h.kvJson(kv, 'gpsdevs:' + pid);
  return Array.isArray(l) ? l.filter((d) => d && DEV_ID_RE.test(d.devId)).slice(0, GPS_MAX_DEVICES) : [];
}
const publicDev = (d) => ({ devId: d.devId, name: d.name || 'PITLANE GPS', at: d.at || null, fw: d.fw || null });

/** Token of the chip → { pid, devId, name } | null. One KV read per connection. */
export async function deviceFromToken(kv, token, h) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  const d = await h.kvJson(kv, 'gpsdev:' + devHash(h, token));
  return d && h.isPilotUuid(d.pid) && DEV_ID_RE.test(d.devId) ? d : null;
}

/** Session token from «Sec-WebSocket-Protocol: pitlane.v1, bearer.<token>». */
export function protoToken(req) {
  const raw = String(req.headers.get('Sec-WebSocket-Protocol') || '');
  const parts = raw.split(',').map((s) => s.trim());
  if (!parts.includes(WS_PROTO)) return null;
  const b = parts.find((p) => p.startsWith('bearer.'));
  const t = b ? b.slice(7) : '';
  return /^[A-Za-z0-9_-]{20,128}$/.test(t) ? t : null;
}

function liveStub(env, pid) {
  const ns = env.GPS_LIVE;
  if (!ns || typeof ns.idFromName !== 'function') return null;
  return ns.get(ns.idFromName(pid));
}

/** WS refusal the chip can read (an HTTP 401 on upgrade is opaque to most WS clients). */
function wsRefuse(env, code, headers, h) {
  const Pair = env.__WebSocketPair || (typeof WebSocketPair !== 'undefined' ? WebSocketPair : null);
  if (!Pair) return h.json({ error: code, code }, 401, headers);
  const [client, server] = Object.values(new Pair());
  server.accept();
  try { server.send(JSON.stringify({ err: code })); server.close(4001, code); } catch (_) {}
  return (env.__upgrade || ((c) => new Response(null, { status: 101, webSocket: c })))(client, {});
}

export async function gpsRoute(ctx) {
  const { req, env, path, headers, ip, pilot, h } = ctx;
  if (!path.startsWith('/gps/')) return null;
  const kv = env.PITLANE;

  // —— chip: live socket ——
  if (path === '/gps/ws') {
    if (String(req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return h.json({ error: 'upgrade required' }, 426, headers);
    const m = String(req.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/i);
    const dev = m ? await deviceFromToken(kv, m[1], h) : null;
    if (!dev) return wsRefuse(env, 'token', headers, h);
    const stub = liveStub(env, dev.pid);
    if (!stub) return wsRefuse(env, 'unavailable', headers, h);
    const fwd = new Headers(req.headers);
    fwd.delete('Authorization');
    fwd.set('X-Gps-Role', 'dev');
    fwd.set('X-Gps-Dev', dev.devId);
    fwd.set('X-Gps-Name', String(dev.name || '').slice(0, 32));
    return stub.fetch(new Request('https://gpslive/ws', { method: 'GET', headers: fwd }));
  }

  // —— Mini App: live socket (session token in the subprotocol, never in the URL) ——
  if (path === '/gps/live') {
    if (String(req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return h.json({ error: 'upgrade required' }, 426, headers);
    const origin = req.headers.get('Origin') || '';
    if (origin && headers['Access-Control-Allow-Origin'] !== origin) return h.json({ error: 'origin' }, 403, headers);
    const tok = protoToken(req);
    const sess = tok ? await h.kvJson(kv, 'sess:' + tok) : null;
    if (!sess || !h.isPilotUuid(sess.pilotId)) return h.json({ error: 'auth required', code: 'session_expired' }, 401, headers);
    const stub = liveStub(env, sess.pilotId);
    if (!stub) return h.json({ error: 'live unavailable', code: 'live_unavailable' }, 503, headers);
    const fwd = new Headers();
    fwd.set('Upgrade', 'websocket');
    fwd.set('X-Gps-Role', 'app');
    return stub.fetch(new Request('https://gpslive/ws', { method: 'GET', headers: fwd }));
  }

  // —— chip: exchange the pairing code for a device token ——
  if (path === '/gps/claim' && req.method === 'POST') {
    const lim = await h.limitOr429(env, headers, [['rl:gpsclaim:ip:' + ip, 20, 3600]]);
    if (lim) return lim;
    const body = await h.readJson(req, 1024);
    const code = String(body?.code || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) return h.json({ error: 'bad code', code: 'bad_code' }, 400, headers);
    const pair = await h.kvJson(kv, 'gpspair:' + code);
    if (!pair || !h.isPilotUuid(pair.pid) || Date.now() - Number(pair.at || 0) > GPS_PAIR_TTL * 1000) return h.json({ error: 'code expired', code: 'code_expired' }, 404, headers);
    await kv.delete('gpspair:' + code); // single use
    const devs = await listDevices(kv, pair.pid, h);
    if (devs.length >= GPS_MAX_DEVICES) return h.json({ error: 'too many devices', code: 'devices_full' }, 409, headers);
    const name = h.cleanLabel(body?.name, 32) || 'PITLANE GPS';
    const fw = /^[0-9][0-9a-z.+-]{0,15}$/i.test(String(body?.fw || '')) ? String(body.fw) : null;
    const token = h.randomToken();
    const hash = devHash(h, token);
    const devId = 'g' + h.randB36(8);
    const at = Date.now();
    await kv.put('gpsdev:' + hash, JSON.stringify({ pid: pair.pid, devId, name, at }));
    devs.push({ devId, h: hash, name, at, fw });
    await kv.put('gpsdevs:' + pair.pid, JSON.stringify(devs));
    return h.json({ ok: true, token, devId }, 200, headers);
  }

  // —— Mini App (authed) ——
  const denied = h.requireAuth(pilot, headers);
  if (denied) return denied;
  if (path === '/gps/pair' && req.method === 'POST') {
    const lim = await h.limitOr429(env, headers, [['rl:gpspair:p:' + pilot.id, 10, 3600]]);
    if (lim) return lim;
    const devs = await listDevices(kv, pilot.id, h);
    if (devs.length >= GPS_MAX_DEVICES) return h.json({ error: 'too many devices', code: 'devices_full', max: GPS_MAX_DEVICES }, 409, headers);
    let code = randCode();
    for (let i = 0; i < 3 && (await kv.get('gpspair:' + code)); i++) code = randCode();
    await kv.put('gpspair:' + code, JSON.stringify({ pid: pilot.id, at: Date.now() }), { expirationTtl: GPS_PAIR_TTL });
    return h.json({ ok: true, code, ttl: GPS_PAIR_TTL }, 200, headers);
  }
  if (path === '/gps/devices' && req.method === 'GET') {
    const devs = await listDevices(kv, pilot.id, h);
    let live = null;
    const stub = liveStub(env, pilot.id);
    if (stub) { try { live = await (await stub.fetch(new Request('https://gpslive/state'))).json(); } catch (_) { live = null; } }
    return h.json({ ok: true, devices: devs.map(publicDev), max: GPS_MAX_DEVICES, live: live ? { online: !!live.online, devId: live.devId || null, status: live.status || null, lastAt: live.lastAt || null } : null, liveAvailable: !!stub }, 200, headers);
  }
  const m = path.match(/^\/gps\/devices\/([^/]+)$/);
  if (m && req.method === 'DELETE') {
    const id = h.safeDecode(m[1]);
    const devs = await listDevices(kv, pilot.id, h);
    const d = devs.find((x) => x.devId === id);
    if (!d) return h.json({ error: 'not found' }, 404, headers);
    if (d.h) await kv.delete('gpsdev:' + d.h);
    const rest = devs.filter((x) => x.devId !== id);
    if (rest.length) await kv.put('gpsdevs:' + pilot.id, JSON.stringify(rest)); else await kv.delete('gpsdevs:' + pilot.id);
    const stub = liveStub(env, pilot.id);
    if (stub) { try { await stub.fetch(new Request('https://gpslive/kick?dev=' + encodeURIComponent(id), { method: 'POST' })); } catch (_) {} }
    return h.json({ ok: true, devices: rest.map(publicDev) }, 200, headers);
  }
  return h.json({ error: 'not found' }, 404, headers);
}

export async function deleteAccountGps(kv, pid, h) {
  const devs = await listDevices(kv, pid, h);
  for (const d of devs) if (d.h) await kv.delete('gpsdev:' + d.h);
  if (devs.length) await kv.delete('gpsdevs:' + pid);
  return { gpsDevices: devs.length };
}

/* ———————————————— Durable Object: one live room per pilot ———————————————— */
const KEEP_PTS_MS = 90 * 1000;   // backlog for a Mini App that (re)connects mid-run
const KEEP_PTS_MAX = 2600;
const KEEP_EV = 24;
const MAX_APPS = 4;
const MAX_ROWS = 80;
const MAX_MSG = 12 * 1024;
const EV_KINDS = new Set(['launch', 'mark', 'end', 'abort']);
const MARK_KEYS = new Set(['0-60', '0-100', '0-200', '0-300', '100-200', '200-300']);

/** Validate one batch row [dt, lat_e7, lon_e7, v_cms, hAcc_cm, sAcc_cms, numSV, fix]. */
function rowOk(r) {
  return Array.isArray(r) && r.length === 8 && r.every((x) => Number.isInteger(x)) &&
    r[0] >= 0 && r[0] <= 60000 && Math.abs(r[1]) <= 900000000 && Math.abs(r[2]) <= 1800000000 &&
    r[3] >= 0 && r[3] <= 15000 && r[4] >= 0 && r[4] <= 65535 && r[5] >= 0 && r[5] <= 65535 && r[6] >= 0 && r[6] <= 99 && r[7] >= 0 && r[7] <= 15;
}

export class GpsLive {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.m = { bid: null, seq: -1, ev: -1, pts: [], evs: [], status: null, lastAt: 0, devId: null, name: null, loaded: false, rate: { s: 0, n: 0 } };
  }
  now() { return Date.now(); }
  async load() {
    if (this.m.loaded) return;
    this.m.loaded = true;
    try { const s = await this.ctx.storage.get('cur'); if (s && BID_RE.test(s.bid || '')) { this.m.bid = s.bid; this.m.seq = s.seq; this.m.ev = s.ev; } } catch (_) {}
  }
  sockets(tag) { try { return this.ctx.getWebSockets(tag); } catch (_) { return []; } }
  bcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.sockets('app')) { try { ws.send(s); } catch (_) {} }
  }
  devOnline() { return this.sockets('dev').length > 0; }
  pair() { const P = this.env.__WebSocketPair || WebSocketPair; return Object.values(new P()); }
  upgrade(client, hdr) { return (this.env.__upgrade || ((c, hh) => new Response(null, { status: 101, webSocket: c, headers: hh })))(client, hdr); }

  async fetch(req) {
    await this.load();
    const u = new URL(req.url);
    if (u.pathname === '/state') {
      return new Response(JSON.stringify({ online: this.devOnline(), devId: this.m.devId, status: this.m.status, lastAt: this.m.lastAt || null }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (u.pathname === '/kick') {
      const id = u.searchParams.get('dev');
      for (const ws of this.sockets('dev')) {
        const a = ws.deserializeAttachment() || {};
        if (a.devId === id) { try { ws.send(JSON.stringify({ err: 'token' })); ws.close(4001, 'revoked'); } catch (_) {} }
      }
      this.bcast({ type: 'dev', on: false, devId: id, revoked: true });
      return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
    }
    if (String(req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('upgrade required', { status: 426 });
    const role = req.headers.get('X-Gps-Role');
    const [client, server] = this.pair();
    if (role === 'dev') {
      const devId = String(req.headers.get('X-Gps-Dev') || '');
      for (const old of this.sockets('dev')) { try { old.close(4000, 'replaced'); } catch (_) {} } // newest chip wins
      this.ctx.acceptWebSocket(server, ['dev']);
      server.serializeAttachment({ role: 'dev', devId });
      this.m.devId = devId;
      this.m.name = String(req.headers.get('X-Gps-Name') || '').slice(0, 32) || null;
      this.m.lastAt = this.now();
      this.bcast({ type: 'dev', on: true, devId, name: this.m.name });
      return this.upgrade(client, {});
    }
    if (role === 'app') {
      const apps = this.sockets('app');
      if (apps.length >= MAX_APPS) { try { apps[0].close(4002, 'too many'); } catch (_) {} }
      this.ctx.acceptWebSocket(server, ['app']);
      server.serializeAttachment({ role: 'app' });
      const cut = this.now() - KEEP_PTS_MS;
      const pts = this.m.pts.filter((b) => b.at >= cut);
      server.send(JSON.stringify({ type: 'hello', s: this.now(), dev: { on: this.devOnline(), devId: this.m.devId, name: this.m.name }, status: this.m.status, bid: this.m.bid }));
      for (const b of pts) server.send(b.msg);
      for (const e of this.m.evs) if (e.at >= this.now() - 10 * 60 * 1000) server.send(e.msg);
      return this.upgrade(client, { 'Sec-WebSocket-Protocol': WS_PROTO });
    }
    return new Response('bad role', { status: 400 });
  }

  async webSocketMessage(ws, raw) {
    await this.load();
    const a = ws.deserializeAttachment() || {};
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    if (!msg || typeof msg !== 'object') return;
    if (a.role === 'app') {
      if (msg.type === 'ping') { try { ws.send(JSON.stringify({ type: 'pong', c: Number(msg.c) || 0, s: this.now() })); } catch (_) {} }
      return;
    }
    if (a.role !== 'dev') return;
    // flood guard: ≤ 60 messages per second from the chip
    const sec = Math.floor(this.now() / 1000);
    if (this.m.rate.s !== sec) { this.m.rate.s = sec; this.m.rate.n = 0; }
    if (++this.m.rate.n > 60) return;
    this.m.lastAt = this.now();
    if (msg.h === 1) {
      const bid = String(msg.bid || '');
      if (!BID_RE.test(bid)) return;
      if (bid !== this.m.bid) { this.m.bid = bid; this.m.seq = -1; this.m.ev = -1; this.m.pts = []; }
      ws.send(JSON.stringify({ ack: this.m.seq, eack: this.m.ev, s: this.now() }));
      return;
    }
    if (!this.m.bid) return; // hello first
    if (Number.isInteger(msg.b) && Array.isArray(msg.p)) {
      const first = msg.b; const t0 = Number(msg.t0);
      const nowMs = this.now();
      if (first < 0 || !Number.isFinite(t0) || t0 < nowMs - 6 * 3600e3 || t0 > nowMs + 600e3) return;
      const rows = msg.p.slice(0, MAX_ROWS);
      if (!rows.every(rowOk)) return;
      const skip = Math.max(0, this.m.seq + 1 - first); // idempotent: resends of acked points are dropped
      if (skip >= rows.length) { ws.send(JSON.stringify({ ack: this.m.seq })); return; }
      const keep = rows.slice(skip);
      const q = first + skip;
      const kt0 = t0 + keep[0][0];
      const out = keep.map((r) => [r[0] - keep[0][0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]]);
      const m = JSON.stringify({ type: 'pts', bid: this.m.bid, q, t0: kt0, p: out, s: nowMs });
      this.m.seq = q + keep.length - 1;
      this.m.pts.push({ at: nowMs, msg: m, n: out.length });
      let n = this.m.pts.reduce((s, b) => s + b.n, 0);
      while (this.m.pts.length && (n > KEEP_PTS_MAX || this.m.pts[0].at < nowMs - KEEP_PTS_MS)) { n -= this.m.pts[0].n; this.m.pts.shift(); }
      this.bcast(JSON.parse(m));
      ws.send(JSON.stringify({ ack: this.m.seq }));
      return;
    }
    if (typeof msg.e === 'string' && Number.isInteger(msg.id)) {
      if (!EV_KINDS.has(msg.e) || msg.id < 0) return;
      if (msg.id <= this.m.ev) { ws.send(JSON.stringify({ eack: msg.id })); return; }
      const ev = { type: 'ev', bid: this.m.bid, e: msg.e, id: msg.id, s: this.now() };
      if (Number.isFinite(msg.at)) ev.at = Math.round(msg.at);
      if (msg.e === 'mark') {
        if (!MARK_KEYS.has(msg.k) || !Number.isInteger(msg.ms) || msg.ms <= 0 || msg.ms > 120000) return;
        ev.k = msg.k; ev.ms = msg.ms;
      }
      if (msg.e === 'end') {
        if (Number.isFinite(msg.vmax)) ev.vmax = Math.max(0, Math.min(500, Math.round(msg.vmax * 10) / 10));
        if (msg.marks && typeof msg.marks === 'object') {
          ev.marks = {};
          for (const k of MARK_KEYS) if (Number.isInteger(msg.marks[k]) && msg.marks[k] > 0 && msg.marks[k] <= 120000) ev.marks[k] = msg.marks[k];
        }
      }
      this.m.ev = msg.id;
      const s = JSON.stringify(ev);
      this.m.evs.push({ at: this.now(), msg: s });
      if (this.m.evs.length > KEEP_EV) this.m.evs.shift();
      this.bcast(ev);
      ws.send(JSON.stringify({ eack: msg.id }));
      return;
    }
    if (msg.s && typeof msg.s === 'object') {
      const s = msg.s; const n = (x, lo, hi) => (Number.isFinite(Number(x)) ? Math.max(lo, Math.min(hi, Math.round(Number(x)))) : null);
      this.m.status = { hz: n(s.hz, 0, 50), bat: n(s.bat, 0, 5000), pct: n(s.pct, 0, 100), sv: n(s.sv, 0, 99), rssi: n(s.rssi, -127, 0), buf: n(s.buf, 0, 100000), fix: n(s.fix, 0, 15), fw: /^[0-9][0-9a-z.+-]{0,15}$/i.test(String(s.fw || '')) ? String(s.fw) : null, at: this.now() };
      this.bcast({ type: 'st', ...this.m.status, s: this.now() });
    }
  }

  async webSocketClose(ws) { await this.onGone(ws); }
  async webSocketError(ws) { await this.onGone(ws); }
  async onGone(ws) {
    const a = ws.deserializeAttachment() || {};
    if (a.role !== 'dev') return;
    if (!this.devOnline() || this.sockets('dev').every((x) => x === ws)) {
      this.bcast({ type: 'dev', on: false, devId: a.devId });
      // one storage write per chip disconnect: keeps resends idempotent even if this object is evicted
      if (this.m.bid) { try { await this.ctx.storage.put('cur', { bid: this.m.bid, seq: this.m.seq, ev: this.m.ev }); } catch (_) {} }
    }
  }
}
