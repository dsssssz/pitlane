// v100: GPS → chase tracker on the real Sochi centreline — node tests/chase-match.test.mjs
import { TRACK_OUTLINES } from '../geo/outlines.js';
import { createChaseTracker } from '../chase-match.js';

let fails = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m); } };
// centreline in scene metres (same projection as app.js), resampled evenly
const o = TRACK_OUTLINES.sochi;
const midLat = o.coords.reduce((a, c) => a + c[1], 0) / o.coords.length;
const midLon = o.coords.reduce((a, c) => a + c[0], 0) / o.coords.length;
const k = Math.cos(midLat * Math.PI / 180); const M = 111320;
const proj = (lat, lon) => ({ x: (lon - midLon) * M * k, z: -(lat - midLat) * M });
const poly = o.coords.map(([lo, la]) => proj(la, lo));
const seg = []; let L = 0;
for (let i = 0; i < poly.length - 1; i++) { const a = poly[i]; const b = poly[i + 1]; const l = Math.hypot(b.x - a.x, b.z - a.z); if (l > 0.01) { seg.push({ a, b, l, s0: L }); L += l; } }
const at = (s) => { s = ((s % L) + L) % L; const g = seg.find((q) => s <= q.s0 + q.l) || seg[seg.length - 1]; const t = (s - g.s0) / g.l; return { x: g.a.x + (g.b.x - g.a.x) * t, z: g.a.z + (g.b.z - g.a.z) * t, tx: (g.b.x - g.a.x) / g.l, tz: (g.b.z - g.a.z) / g.l }; };
const N = 900; const samples = new Float32Array(N * 4);
for (let i = 0; i < N; i++) { const p = at((i / N) * L); samples.set([p.x, p.z, p.tx, p.tz], i * 4); }
console.log('Sochi centreline', Math.round(L), 'm');

let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

/** stand 20 s → accelerate to 130 km/h → cruise → brake → stand 20 s. Returns truth(t) = { s, v }. */
function profile() {
  const S0 = 380; const phases = [];
  const truth = (t) => {
    if (t < 20) return { s: S0, v: 0 };
    let tt = t - 20; let s = S0;
    const a = 6; const vmax = 36; const ta = vmax / a; // 6 s
    if (tt < ta) return { s: s + 0.5 * a * tt * tt, v: a * tt };
    s += 0.5 * a * ta * ta; tt -= ta;
    if (tt < 45) return { s: s + vmax * tt, v: vmax };
    s += vmax * 45; tt -= 45;
    const b = 8; const tb = vmax / b;
    if (tt < tb) return { s: s + vmax * tt - 0.5 * b * tt * tt, v: vmax - b * tt };
    s += vmax * tb - 0.5 * b * tb * tb;
    return { s, v: 0 };
  };
  return { truth, T: 20 + 6 + 45 + 4.5 + 20 };
}

function run(hz, { doppler = true, noise = 5 } = {}) {
  const tr = createChaseTracker(samples, L);
  const { truth, T } = profile();
  const stats = { standMove: 0, standMove2: 0, maxErr: 0, errs: [], lead: -Infinity, jumps: 0, wrongDir: 0 };
  let nextFix = 0; let prev = null; let lastFrame = null;
  const dtF = 1 / 60;
  for (let t = 0; t <= T; t += dtF) {
    if (t >= nextFix) {
      nextFix += 1 / hz;
      const g = truth(t); const p = at(g.s);
      // 1.5 m left of the centreline + noise (σ per axis so that the radial error is ~noise m)
      const sig = noise / Math.SQRT2;
      const x = p.x - p.tz * 1.5 + gauss() * sig; const z = p.z + p.tx * 1.5 + gauss() * sig;
      const hScene = Math.atan2(p.tx, p.tz); // scene heading → compass course
      const cog = (Math.atan2(Math.sin(hScene), -Math.cos(hScene)) * 180 / Math.PI + 360 + gauss() * 3) % 360;
      tr.feed({ x, z, t, speedMs: doppler ? Math.max(0, g.v + gauss() * 0.3) : null, headingDeg: g.v > 1 ? cog : null, acc: noise });
    }
    const f = tr.frame(t, dtF);
    const g = truth(t);
    if (lastFrame) {
      const mv = Math.hypot(f.x - lastFrame.x, f.z - lastFrame.z);
      if (t > 3 && t < 20) stats.standMove += mv;
      if (t > 85 && g.v === 0 && truth(t - 3).v === 0) stats.standMove2 += mv;
      if (lastFrame.state !== 'idle' && mv > Math.max(2, g.v * dtF * 3 + 1.2)) { stats.jumps++; if (process.env.DBG) console.log('jump', t.toFixed(2), mv.toFixed(2), g.v.toFixed(1), f.state); }
    }
    if (t > 3 && f.state !== 'idle') {
      let e = f.s - g.s; e -= Math.round(e / L) * L;
      stats.maxErr = Math.max(stats.maxErr, Math.abs(e));
      if (g.v > 10) { stats.errs.push(Math.abs(e)); stats.lead = Math.max(stats.lead, e - g.v * 0.5); }
      if (g.v > 10) { const pt = at(g.s); const dh = Math.atan2(Math.sin(f.h - Math.atan2(pt.tx, pt.tz)), Math.cos(f.h - Math.atan2(pt.tx, pt.tz))); if (Math.abs(dh) > Math.PI / 2) stats.wrongDir++; }
    }
    lastFrame = f; prev = g;
  }
  stats.errs.sort((a, b) => a - b);
  stats.med = stats.errs[Math.floor(stats.errs.length / 2)];
  stats.p95 = stats.errs[Math.floor(stats.errs.length * 0.95)];
  return stats;
}

for (const hz of [1, 5, 25]) {
  console.log(`\n[${hz} Hz, noise 5 m, Doppler speed]`);
  const s = run(hz);
  ok(s.standMove < 0.5, `standing at start: car moves ${s.standMove.toFixed(2)} m (< 0.5)`);
  ok(s.standMove2 < 0.5, `standing at the end: car moves ${s.standMove2.toFixed(2)} m (< 0.5)`);
  ok(s.med < 5 && s.p95 < 12, `driving: along-track error median ${s.med.toFixed(1)} m, p95 ${s.p95.toFixed(1)} m`);
  ok(s.maxErr < 40, `never snaps to another section: max error ${s.maxErr.toFixed(1)} m`);
  ok(s.lead < 6, `never runs ahead > 0.5 s (+noise): worst lead beyond 0.5 s ${s.lead.toFixed(1)} m`);
  ok(s.jumps === 0, `no visual jumps (${s.jumps})`);
  ok(s.wrongDir === 0, `heading follows travel direction (${s.wrongDir} wrong frames)`);
}
console.log('\n[1 Hz, no Doppler speed (regression fallback)]');
{ const s = run(1, { doppler: false });
  ok(s.standMove < 0.5 && s.standMove2 < 1.0, `standing still without Doppler: ${s.standMove.toFixed(2)} / ${s.standMove2.toFixed(2)} m`);
  ok(s.med < 12 && s.maxErr < 60, `driving without Doppler: median ${s.med.toFixed(1)} m, max ${s.maxErr.toFixed(1)} m`); }

console.log('\n[far / no GPS]');
{ const tr = createChaseTracker(samples, L);
  const p = at(1000);
  const maxX = Math.max(...poly.map((q) => q.x));
  tr.feed({ x: maxX + 400, z: p.z, t: 1, speedMs: 0, acc: 5 });
  let f = tr.frame(1.1);
  const sf = at(0);
  ok(f.state === 'far' && Math.hypot(f.x - sf.x, f.z - sf.z) < 1, '> 150 m from track → «far», car parked on S/F');
  tr.feed({ x: p.x + 20, z: p.z, t: 2, speedMs: 0, acc: 5 });
  f = tr.frame(2.1);
  ok(f.state === 'stopped' && Math.abs(f.s - 1000) < 25, 'back near the track → matched spot, standing');
  f = tr.frame(5);
  ok(f.state === 'lost', 'no fix 3 s → «lost» (holds position)');
  f = tr.frame(14);
  ok(f.state === 'idle' && Math.hypot(f.x - sf.x, f.z - sf.z) < 1, 'no fix 12 s → idle on S/F'); }
{ const tr = createChaseTracker(samples, L);
  const f = tr.frame(0);
  ok(f.state === 'idle' && f.kmh === 0, 'no GPS at all → idle on S/F, 0 km/h'); }

console.log(fails ? `\n${fails} FAILED` : '\nall chase-match tests passed');
process.exit(fails ? 1 : 0);
