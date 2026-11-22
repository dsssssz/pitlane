/**
 * v89 · Ghost codec — shared by the app (ghost.js) and the Worker (POST /ghost validation).
 * A ghost is a compact trace of one lap / straight-line run, ~10 Hz:
 *   t  — ms from start (quantum 10 ms)
 *   d  — progress metres along the reference (track line or own trajectory; quantum 0.1 m, never decreases)
 *   v  — speed km/h (quantum 0.1)
 *   lat/lon — degrees (quantum 1e-5 ≈ 1 m)
 * Wire form: { v:1, n, hz, la0, lo0, p } where p = base64url(zigzag-varint deltas of the 5 quantised
 * columns, point by point). Pure JS, no Buffer/atob — runs the same in browsers, Workers and Node.
 */
export const GHOST_V = 1;
export const GHOST_MAX_POINTS = 3000;
export const GHOST_MAX_CHARS = 30000;
export const GHOST_MAX_KMH = 400;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64I = (() => { const m = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) m[B64.charCodeAt(i)] = i; return m; })();

const zz = (n) => (n >= 0 ? n * 2 : -n * 2 - 1);
const unzz = (u) => (u % 2 === 1 ? -(u + 1) / 2 : u / 2);

function pushVarint(out, n) {
  let u = zz(n);
  while (u >= 128) { out.push((u % 128) + 128); u = Math.floor(u / 128); }
  out.push(u);
}

function bytesToB64(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const x = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    s += B64[(x >> 18) & 63] + B64[(x >> 12) & 63];
    if (i + 1 < b.length) s += B64[(x >> 6) & 63];
    if (i + 2 < b.length) s += B64[x & 63];
  }
  return s;
}

function b64ToBytes(s) {
  const n = s.length;
  if (n % 4 === 1) return null;
  const out = new Uint8Array(Math.floor(n * 3 / 4));
  let o = 0;
  for (let i = 0; i < n; i += 4) {
    let x = 0; let k = 0;
    for (let j = 0; j < 4; j++) {
      if (i + j < n) {
        const c = s.charCodeAt(i + j);
        const v = c < 128 ? B64I[c] : -1;
        if (v < 0) return null;
        x = x * 64 + v; k++;
      } else x *= 64;
    }
    out[o++] = (x >> 16) & 255;
    if (k > 2) out[o++] = (x >> 8) & 255;
    if (k > 3) out[o++] = x & 255;
  }
  return out.subarray(0, o);
}

/**
 * points: [{ t, d, v, lat, lon }] (t ms from start). Points closer than 10 ms are dropped,
 * d is made non-decreasing. Long traces are resampled to ≤ GHOST_MAX_POINTS.
 */
export function encodeGhost(points, { hz = 10 } = {}) {
  let pts = (points || []).filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length > GHOST_MAX_POINTS) {
    const step = (pts.length - 1) / (GHOST_MAX_POINTS - 1);
    const res = [];
    for (let i = 0; i < GHOST_MAX_POINTS; i++) res.push(pts[Math.round(i * step)]);
    pts = res;
  }
  if (!pts.length) return null;
  const la0 = Math.round(pts[0].lat * 1e5);
  const lo0 = Math.round(pts[0].lon * 1e5);
  const t0 = pts[0].t;
  const out = [];
  let pt = 0; let pd = 0; let pv = 0; let pla = la0; let plo = lo0; let n = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const tq = Math.round((p.t - t0) / 10);
    if (i > 0 && tq <= pt) continue;
    const dq = Math.max(pd, Math.round(Math.max(0, Number(p.d) || 0) * 10));
    const vq = Math.round(Math.max(0, Math.min(GHOST_MAX_KMH, Number(p.v) || 0)) * 10);
    const laq = Math.round(p.lat * 1e5);
    const loq = Math.round(p.lon * 1e5);
    pushVarint(out, tq - pt); pushVarint(out, dq - pd); pushVarint(out, vq - pv);
    pushVarint(out, laq - pla); pushVarint(out, loq - plo);
    pt = tq; pd = dq; pv = vq; pla = laq; plo = loq; n++;
  }
  return { v: GHOST_V, n, hz: Math.round(Math.max(0.2, Math.min(50, hz)) * 10) / 10, la0: la0 / 1e5, lo0: lo0 / 1e5, p: bytesToB64(out) };
}

/** Wire form → columns { n, t[], d[], v[], lat[], lon[] } or null when malformed. */
export function decodeGhost(g) {
  if (!g || typeof g !== 'object' || g.v !== GHOST_V) return null;
  const n = Number(g.n);
  if (!Number.isInteger(n) || n < 2 || n > GHOST_MAX_POINTS) return null;
  if (typeof g.p !== 'string' || g.p.length > GHOST_MAX_CHARS || !/^[A-Za-z0-9_-]+$/.test(g.p)) return null;
  const la0 = Number(g.la0); const lo0 = Number(g.lo0);
  if (!Number.isFinite(la0) || !Number.isFinite(lo0) || Math.abs(la0) > 90 || Math.abs(lo0) > 180) return null;
  const b = b64ToBytes(g.p);
  if (!b) return null;
  const t = new Array(n); const d = new Array(n); const v = new Array(n); const lat = new Array(n); const lon = new Array(n);
  let i = 0;
  const next = () => {
    let u = 0; let mul = 1; let k = 0;
    for (;;) {
      if (i >= b.length || k > 5) return null;
      const x = b[i++];
      u += (x % 128) * mul;
      if (x < 128) break;
      mul *= 128; k++;
    }
    return unzz(u);
  };
  let ct = 0; let cd = 0; let cv = 0; let cla = Math.round(la0 * 1e5); let clo = Math.round(lo0 * 1e5);
  for (let j = 0; j < n; j++) {
    const a = next(); const bb = next(); const c = next(); const e = next(); const f = next();
    if (a == null || bb == null || c == null || e == null || f == null) return null;
    ct += a; cd += bb; cv += c; cla += e; clo += f;
    t[j] = ct * 10; d[j] = cd / 10; v[j] = cv / 10; lat[j] = cla / 1e5; lon[j] = clo / 1e5;
  }
  if (i !== b.length) return null;
  return { n, t, d, v, lat, lon, hz: Number(g.hz) || 10 };
}

function hav(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const p1 = aLat * Math.PI / 180; const p2 = bLat * Math.PI / 180;
  const dp = p2 - p1; const dl = (bLon - aLon) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Plausibility of a decoded ghost. opts: { kind:'lap'|'drag', disc?:'0-100'|'402m', tMs }.
 * → { ok, why, dist, vmax }
 */
export function checkGhost(dec, opts = {}) {
  const bad = (why) => ({ ok: false, why });
  if (!dec) return bad('malformed');
  const { n, t, d, v, lat, lon } = dec;
  const kind = opts.kind === 'drag' ? 'drag' : 'lap';
  if (n < (kind === 'lap' ? 20 : 4)) return bad('too few points');
  if (t[0] !== 0) return bad('must start at t=0');
  const vmaxMs = GHOST_MAX_KMH / 3.6;
  let vmax = 0;
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (!(v[i] >= 0 && v[i] <= GHOST_MAX_KMH)) return bad('speed out of range');
    if (Math.abs(lat[i]) > 90 || Math.abs(lon[i]) > 180) return bad('bad position');
    if (v[i] > vmax) vmax = v[i];
    if (i === 0) continue;
    const dt = (t[i] - t[i - 1]) / 1000;
    if (!(dt > 0)) return bad('time not increasing');
    if (dt > 5) return bad('gap over 5 s');
    if (d[i] < d[i - 1]) return bad('progress decreasing');
    if (d[i] - d[i - 1] > vmaxMs * 1.15 * dt + 3) return bad('progress jump');
    if (hav(lat[i - 1], lon[i - 1], lat[i], lon[i]) > vmaxMs * dt + 25) return bad('position jump');
    // acceleration and average speed over a ≥ 1 s window (raw 10 Hz points are noisy)
    while (j < i && t[i] - t[j + 1] >= 1000) j++;
    const span = (t[i] - t[j]) / 1000;
    if (span >= 1) {
      if (Math.abs(v[i] - v[j]) / 3.6 / span > 16) return bad('implausible acceleration');
      if ((d[i] - d[j]) / span > vmaxMs * 1.08) return bad('implausible speed (progress)');
      if (hav(lat[j], lon[j], lat[i], lon[i]) / span > vmaxMs * 1.08 + 4) return bad('implausible speed (position)');
    }
  }
  const total = t[n - 1];
  const tMs = Number(opts.tMs);
  if (Number.isFinite(tMs)) {
    if (kind === 'lap' && Math.abs(total - tMs) > 1500) return bad('trace length ≠ lap time');
    if (kind === 'drag' && (total < tMs - 600 || total > tMs + 3000)) return bad('trace length ≠ run time');
  }
  const dist = d[n - 1];
  if (kind === 'lap' && dist < 300) return bad('lap too short');
  if (kind === 'drag') {
    if (v[0] > 12) return bad('not a standing start');
    if (opts.disc === '0-100' && vmax < 95) return bad('never reached 100 km/h');
    if (opts.disc === '402m' && dist < 380) return bad('never reached 402 m');
  }
  return { ok: true, why: '', dist, vmax };
}
