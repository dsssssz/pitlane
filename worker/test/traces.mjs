// v104: synthetic-but-noisy GPS traces for tests (MemKV only). Not used anywhere near prod.
import { encodeTrace, decodeTrace, lapFromTrace, haversineM } from '../../gps-core.js';
import { TRACK_CAL } from '../../track-cal.js';
import { TRACK_OUTLINES } from '../../geo/outlines.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const M_LAT = 110540;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

/** Straight run: stand 2 s, constant-ish accel a (m/s²) to vMax, heading north. */
export function dragPoints({ hz = 10, a = 5, vMax = 160, seed = 1, t0 = Date.now() - 60_000, lat0 = 55.75, lon0 = 37.6, noise = 0.6, acc = 2.5 } = {}) {
  const r = rng(seed); const dt = 1000 / hz; const pts = [];
  let v = 0; let d = 0; let t = 0;
  while (v < vMax / 3.6 - 1e-6 || t < 2000) {
    if (t >= 2000) { v = Math.min(vMax / 3.6, v + a * dt / 1000 * (0.97 + r() * 0.06)); }
    d += v * dt / 1000;
    const j = () => (r() - 0.5) * 2 * noise;
    pts.push({ t: t0 + t, lat: lat0 + (d + j()) / M_LAT, lon: lon0 + j() / mLon(lat0), v: Math.max(0, v * 3.6 + (r() - 0.5) * 0.4), acc: acc + r() });
    t += dt;
  }
  for (let k = 0; k < hz; k++) { d += v * dt / 1000; pts.push({ t: t0 + t, lat: lat0 + d / M_LAT, lon: lon0, v: v * 3.6, acc: acc + r() }); t += dt; }
  return pts;
}
export function dragTrace(opts = {}) { return encodeTrace(dragPoints(opts), opts.src || 'ext'); }

/** Sochi: drive the centreline from a bit before S/F, over 1 lap + a bit, at ~kmh, 10 Hz, with noise. */
export function sochiLapPoints({ kmh = 140, hz = 10, seed = 3, t0 = Date.now() - 600_000, acc = 3, laps = 1, extraM = 200 } = {}) {
  const r = rng(seed);
  const P = TRACK_OUTLINES.sochi.coords.map(([lon, lat]) => ({ lat, lon }));
  P.push(P[0]);
  const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + haversineM(P[i - 1], P[i]));
  const L = cum[cum.length - 1];
  // find arc position of S/F gate projection
  const sf = { lat: 43.406047, lon: 39.95787 };
  let s0 = 0; let bd = 1e9;
  for (let s = 0; s < L; s += 2) { const q = at(s); const dd = haversineM(q, sf); if (dd < bd) { bd = dd; s0 = s; } }
  function at(s) { s = ((s % L) + L) % L; let i = cum.findIndex((c) => c >= s); if (i < 1) i = 1; const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return { lat: P[i - 1].lat + (P[i].lat - P[i - 1].lat) * k, lon: P[i - 1].lon + (P[i].lon - P[i - 1].lon) * k }; }
  const pts = []; const v = kmh / 3.6; const dt = 1000 / hz;
  for (let t = 0, s = s0 - extraM; s <= s0 + L * laps + extraM; t += dt, s += v * dt / 1000) {
    const q = at(s); const j = () => (r() - 0.5) * 1.2;
    pts.push({ t: t0 + t, lat: q.lat + j() / M_LAT, lon: q.lon + j() / mLon(q.lat), v: kmh + (r() - 0.5), acc: acc + r() });
  }
  return { pts, L, expectMs: Math.round(L * laps / v * 1000) };
}
export function sochiLapTrace(opts = {}) { const o = sochiLapPoints(opts); return { trace: encodeTrace(o.pts, opts.src || 'ext'), ...o }; }

/* ——— helpers: request bodies whose server-recomputed result equals the wanted time ——— */
function lapMsOf(t) { const m = /^(\d+):(\d\d(?:\.\d+)?)$/.exec(String(t)); return m ? (Number(m[1]) * 60 + Number(m[2])) * 1000 : Number(t); }
/** Sochi lap trace with lap time ≈ t ('m:ss.xxx'); acc>25 → grade C. */
export function lapTrace(t, { acc = 3, seed = 3, src = 'ext', hz = 10 } = {}) {
  // подгоняем скорость, пока серверный (gate-to-gate) расчёт не даст ровно t — для тестов с точным временем
  const want = Math.round(lapMsOf(t));
  let kmh = 5832.7 / (want / 1000) * 3.6;
  let best = null;
  for (let k = 0; k < 8; k++) {
    const o = sochiLapTrace({ kmh, acc, seed, src, hz });
    const dec = decodeTrace(o.trace);
    const lap = lapFromTrace(dec.pts, TRACK_CAL.sochi);
    if (!lap.ok) return o.trace;
    best = o.trace;
    if (lap.ms === want) return best;
    kmh *= lap.ms / want;
  }
  for (let j = 1; j < 200; j++) { // квантование координат даёт ±1 мс — добираем перебором
    const kk = kmh * (1 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 2e-6);
    const o = sochiLapTrace({ kmh: kk, acc, seed, src, hz });
    const lap = lapFromTrace(decodeTrace(o.trace).pts, TRACK_CAL.sochi);
    if (lap.ok && lap.ms === want) return o.trace;
  }
  return best;
}
export function lapBody(t, extra = {}, opts = {}) { return { t, gps: true, ...extra, trace: lapTrace(t, opts) }; }
const SPEED_TO = { '0-50': [0, 50], '0-60': [0, 60], '0-100': [0, 100], '0-200': [0, 200], '80-120': [80, 120], '100-200': [100, 200], '200-300': [200, 300] };
const DIST = { '60ft': 18.288, '201m': 201.168, '402m': 402.336 };
/** Drag trace whose disc time ≈ t seconds. */
export function dragTraceFor(disc, t, { hz = 10, src = 'ext', acc = 2.5, seed = 1 } = {}) {
  let a; let vMax;
  if (SPEED_TO[disc]) { const [lo, hi] = SPEED_TO[disc]; a = (hi - lo) / 3.6 / t; vMax = hi + 15; }
  else { a = (2 * DIST[disc]) / (t * t); vMax = Math.min(350, a * t * 3.6 + 10); }
  return dragTrace({ a, vMax, hz, src, acc, seed });
}
export function dragBody(disc, t, extra = {}, opts = {}) { return { t, gps: true, ...extra, trace: dragTraceFor(disc, t, opts) }; }
