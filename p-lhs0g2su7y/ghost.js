/**
 * v89 · Ghosts on the client: IndexedDB store, ~10 Hz recorder, track-line progress, delta maths.
 * Wire format + plausibility live in ghost-codec.js (shared with the Worker).
 */
import { encodeGhost, decodeGhost } from './ghost-codec.js';

export { encodeGhost, decodeGhost };

/* ———————————— IndexedDB ———————————— */
const DB_NAME = 'pitlane-ghosts';
const STORE = 'ghosts';
const KEEP_PER_REF = 20;
let _dbP = null;

function openDb() {
  if (_dbP) return _dbP;
  _dbP = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          st.createIndex('kref', 'kref', { unique: false });
        }
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(null);
      rq.onblocked = () => resolve(null);
    } catch (_) { resolve(null); }
  });
  return _dbP;
}

function reqP(rq) {
  return new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
}

async function allFor(kref) {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE, 'readonly');
    return (await reqP(tx.objectStore(STORE).index('kref').getAll(kref))) || [];
  } catch (_) { return []; }
}

const isAb = (r) => r && r.valid !== false && (r.gpsQ === 'A' || r.gpsQ === 'B');

/** Save one finished lap / run. rec: { kind, ref, tMs, valid, gpsQ, car, carId, mode, L, data } → id */
export async function saveGhostLocal(rec) {
  const db = await openDb();
  if (!db || !rec || !rec.data) return null;
  const row = { ...rec, kref: rec.kind + ':' + rec.ref, at: rec.at || Date.now() };
  delete row.id;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const id = await reqP(tx.objectStore(STORE).add(row));
    await new Promise((r) => { tx.oncomplete = r; tx.onerror = r; tx.onabort = r; });
    void pruneLocal(row.kref);
    return id;
  } catch (_) { return null; }
}

async function pruneLocal(kref) {
  const list = await allFor(kref);
  if (list.length <= KEEP_PER_REF) return;
  const best = list.filter(isAb).sort((a, b) => a.tMs - b.tMs)[0];
  const drop = list.slice().sort((a, b) => b.at - a.at).slice(KEEP_PER_REF).filter((r) => r !== best);
  const db = await openDb();
  if (!db || !drop.length) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    for (const r of drop) tx.objectStore(STORE).delete(r.id);
  } catch (_) {}
}

/** Personal best: fastest valid A/B trace; falls back to the fastest of any kind. */
export async function bestGhostLocal(kind, ref, { abOnly = false } = {}) {
  const list = await allFor(kind + ':' + ref);
  const ab = list.filter(isAb).sort((a, b) => a.tMs - b.tMs);
  if (ab.length || abOnly) return ab[0] || null;
  return list.sort((a, b) => a.tMs - b.tMs)[0] || null;
}

export async function markGhostUploaded(id, serverId) {
  const db = await openDb();
  if (!db || id == null) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    const r = await reqP(st.get(id));
    if (r) { r.serverId = serverId; st.put(r); }
  } catch (_) {}
}

/* ———————————— recorder (~10 Hz) ———————————— */
export function createRecorder(minDtMs = 95) {
  let pts = [];
  return {
    reset() { pts = []; },
    push(p) {
      if (!p || !Number.isFinite(p.t) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
      const last = pts[pts.length - 1];
      if (last && p.t - last.t < minDtMs) return;
      pts.push({ t: p.t, d: Math.max(last ? last.d : 0, p.d || 0), v: p.v || 0, lat: p.lat, lon: p.lon });
    },
    /** force the final sample (finish line) even if closer than minDt */
    finish(p) {
      if (!p) return;
      const last = pts[pts.length - 1];
      if (last && p.t <= last.t) { last.t = Math.max(last.t, p.t); return; }
      pts.push({ t: p.t, d: Math.max(last ? last.d : 0, p.d || 0), v: p.v || 0, lat: p.lat, lon: p.lon });
    },
    get length() { return pts.length; },
    points() { return pts.slice(); },
  };
}

/* ———————————— progress along the track line ———————————— */
const M_PER_DEG = 111320;
/** coords: [[lon,lat]…] (geo/outlines.js), sf: [lon,lat]. project() → metres from S/F along the line. */
export function makeLineRef(coords, sf) {
  if (!Array.isArray(coords) || coords.length < 3 || !sf) return null;
  const lat0 = sf[1]; const kx = M_PER_DEG * Math.cos(lat0 * Math.PI / 180);
  const P = coords.map(([lo, la]) => [(lo - sf[0]) * kx, (la - sf[1]) * M_PER_DEG]);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1];
  if (!(L > 200)) return null;
  const segs = P.length - 1;
  const projSeg = (x, y, i) => {
    const [ax, ay] = P[i]; const [bx, by] = P[i + 1];
    const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    const px = ax + dx * k; const py = ay + dy * k;
    return { d2: (x - px) ** 2 + (y - py) ** 2, s: cum[i] + Math.sqrt(l2) * k, i };
  };
  const rawProject = (lat, lon, hint) => {
    const x = (lon - sf[0]) * kx; const y = (lat - sf[1]) * M_PER_DEG;
    let best = null;
    const scan = (i) => { const r = projSeg(x, y, ((i % segs) + segs) % segs); if (!best || r.d2 < best.d2) best = r; };
    if (hint != null && hint >= 0) { for (let k = -25; k <= 40; k++) scan(hint + k); if (best.d2 > 150 * 150) best = null; }
    if (!best) for (let i = 0; i < segs; i++) scan(i);
    return best;
  };
  const sf0 = rawProject(sf[1], sf[0], null).s;
  return {
    L,
    /** → { s: 0..L metres after S/F, off: metres off the line, i: segment hint } */
    project(lat, lon, hint) {
      const r = rawProject(lat, lon, hint);
      return { s: ((r.s - sf0) % L + L) % L, off: Math.sqrt(r.d2), i: r.i };
    },
  };
}

/** Monotone unwrapping of line progress across a lap (S/F wrap + small backwards noise). */
export function createLineProgress(ref) {
  let last = 0; let hint = null; let started = false;
  return {
    reset() { last = 0; hint = null; started = false; },
    update(lat, lon) {
      const r = ref.project(lat, lon, hint);
      hint = r.i;
      let s = r.s;
      if (!started) { started = true; if (s > ref.L * 0.7) s -= ref.L; last = Math.max(0, s); return last; }
      // candidates: same lap position, or wrapped (+L) near the finish
      const cand = [s, s + ref.L, s - ref.L].filter((c) => c > -50);
      let best = cand[0];
      for (const c of cand) if (Math.abs(c - last) < Math.abs(best - last)) best = c;
      if (Math.abs(best - last) > 400) return last; // projected onto the wrong part of the circuit
      last = Math.max(last, best);
      return last;
    },
    get value() { return last; },
  };
}

/* ———————————— ghost track maths ———————————— */
function bsearch(arr, x) {
  let lo = 0; let hi = arr.length - 1;
  if (x <= arr[0]) return 0;
  if (x >= arr[hi]) return hi - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m; else hi = m; }
  return lo;
}

/**
 * rec: { data, tMs, mode, L, kind } (local IDB row or server ghost) → helper with interpolation, or null.
 */
export function ghostTrack(rec) {
  const g = rec && (rec.data || rec.ghost);
  const dec = decodeGhost(g);
  if (!dec) return null;
  const { n, t, d, v, lat, lon } = dec;
  const vMono = new Array(n); let mx = 0;
  for (let i = 0; i < n; i++) { mx = Math.max(mx, v[i]); vMono[i] = mx; }
  const lerpAt = (xs, x, ys) => {
    const i = bsearch(xs, x);
    const span = xs[i + 1] - xs[i];
    const k = span > 0 ? Math.max(0, Math.min(1, (x - xs[i]) / span)) : 0;
    return ys[i] + (ys[i + 1] - ys[i]) * k;
  };
  // strictly increasing copies for inverse lookups (plateaus → first time reached)
  const strict = (xs) => { const o = xs.slice(); for (let i = 1; i < n; i++) if (o[i] <= o[i - 1]) o[i] = o[i - 1] + 1e-6; return o; };
  const dS = strict(d); const vS = strict(vMono);
  return {
    n, t, d, v, lat, lon,
    tMs: Number(rec.tMs) || t[n - 1],
    L: Number(rec.L) || d[n - 1],
    mode: rec.mode || 'traj',
    kind: rec.kind || 'lap',
    dMax: d[n - 1],
    vMax: mx,
    /** ghost time (ms) when it had covered x metres */
    timeAtD(x) { return lerpAt(dS, x, t); },
    /** ghost time (ms) when it first reached x km/h */
    timeAtV(x) { return lerpAt(vS, x, t); },
    /** ghost position at elapsed ms */
    posAt(ms) {
      return { lat: lerpAt(t, ms, lat), lon: lerpAt(t, ms, lon), d: lerpAt(t, ms, d), v: lerpAt(t, ms, v) };
    },
  };
}

/** Delta (s) of the current run vs the ghost at the same progress x. axis 'd' | 'v'. */
export function deltaAt(track, axis, x, elapsedMs) {
  if (!track || !Number.isFinite(x) || !Number.isFinite(elapsedMs)) return null;
  if (axis === 'v') { if (x < 3 || x > track.vMax) return null; return (elapsedMs - track.timeAtV(x)) / 1000; }
  if (x < 5) return null;
  const xx = Math.min(x, track.dMax);
  return (elapsedMs - track.timeAtD(xx)) / 1000;
}

/** [{x, dt}] along the current trace (≤ 240 samples), x = progress (m or km/h). scale maps current x → ghost x. */
export function deltaSeries(points, track, axis = 'd', scale = 1) {
  if (!track || !points || points.length < 2) return [];
  const out = [];
  const step = Math.max(1, Math.floor(points.length / 240));
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    const x = axis === 'v' ? p.v : p.d;
    const dt = deltaAt(track, axis, x * scale, p.t);
    if (dt != null && Number.isFinite(dt)) out.push({ x, dt });
  }
  const last = points[points.length - 1];
  const lx = axis === 'v' ? last.v : last.d;
  const ldt = deltaAt(track, axis, lx * scale, last.t);
  if (ldt != null) out.push({ x: lx, dt: ldt });
  return out;
}

/** Split the series into 3 equal sectors → [{ i, gain }] (gain < 0: won time, > 0: lost time). */
export function sectorGains(series, total, finalDelta) {
  if (!series.length || !(total > 0)) return [];
  const at = (x) => {
    let best = series[0];
    for (const s of series) { if (s.x <= x) best = s; else break; }
    return best.dt;
  };
  const cuts = [0, total / 3, (2 * total) / 3, total];
  const vals = cuts.map((c, i) => (i === 0 ? 0 : i === 3 && Number.isFinite(finalDelta) ? finalDelta : at(c)));
  return [0, 1, 2].map((i) => ({ i, gain: vals[i + 1] - vals[i] }));
}

/** "+0.34" / "−0.12" / "±0.00" */
export function fmtDelta(sec, digits = 2) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  if (Math.abs(sec) < 0.5 * 10 ** -digits) return '±' + (0).toFixed(digits);
  return (sec < 0 ? '−' : '+') + Math.abs(sec).toFixed(digits);
}
