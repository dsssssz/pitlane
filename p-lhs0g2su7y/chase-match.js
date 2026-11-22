/**
 * v100: GPS → 3D chase car on the track centreline (pure JS, no THREE — unit-testable in node).
 *
 *  - map-matching to the nearest centreline segment, searched first around the previous position
 *    (so a fix never snaps onto a neighbouring section of the circuit), global re-acquire only when lost;
 *  - along-track alpha–beta filter (GPS noise ~5 m) + short prediction by speed, never more than LEAD_S ahead;
 *  - speed < STOP_KMH (hysteresis to MOVE_KMH) → the car stands still (GPS drift filtered out);
 *  - lateral distance > FAR_M → «Вы не на треке», car parked on S/F;
 *  - no fix for > LOST_S → «нет сигнала» (holds last spot), > IDLE_S → parked on S/F.
 * Coordinates: scene metres x/z (same projection as the 3D track); s = arc length along the centreline.
 */
export const CHASE = { STOP_KMH: 2, MOVE_KMH: 3.5, FAR_M: 150, NEAR_M: 130, LEAD_S: 0.5, LOST_S: 2.5, IDLE_S: 10, WINDOW_M: 90, REACQ_M: 35 };

function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

/** samples: Float32Array [x, z, tx, tz] * N, evenly spaced along a closed curve of length L. */
export function createChaseTracker(samples, L, opts = {}) {
  const C = { ...CHASE, ...opts };
  const N = Math.floor(samples.length / 4);
  const ds = L / N;
  const st = {
    has: false, sU: 0, sF: 0, v: 0, dir: 1, off: 0, tFix: 0, acc: null, kmh: 0, moving: false,
    far: false, d: 0, disp: null, hold: 0, lastX: 0, lastZ: 0, hist: [], magS: 0, a: 0, fixDt: 1,
  };

  const px = (i) => samples[((i % N) + N) % N * 4];
  const pz = (i) => samples[((i % N) + N) % N * 4 + 1];

  /** Project (x,z) on segment i→i+1 → { s, d2, off }. */
  function segProj(i, x, z) {
    const ax = px(i); const az = pz(i); const bx = px(i + 1); const bz = pz(i + 1);
    const vx = bx - ax; const vz = bz - az;
    const len2 = vx * vx + vz * vz || 1e-9;
    let t = ((x - ax) * vx + (z - az) * vz) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + vx * t; const qz = az + vz * t;
    const dx = x - qx; const dz = z - qz;
    const len = Math.sqrt(len2);
    const off = (vx * dz - vz * dx) / len; // signed lateral (left +)
    const ii = ((i % N) + N) % N;
    return { s: (ii + t) * ds, d2: dx * dx + dz * dz, off };
  }
  function search(x, z, from, to) {
    let best = null;
    for (let i = from; i <= to; i++) {
      const p = segProj(i, x, z);
      if (!best || p.d2 < best.d2) best = p;
    }
    return best;
  }
  /** Map-match with continuity: local window around the previous s, global only when the window fails. */
  function match(x, z, span) {
    const glob = search(x, z, 0, N - 1);
    if (!st.has) return { ...glob, d: Math.sqrt(glob.d2), reacq: true };
    const c = Math.round(st.sF / ds);
    const w = Math.max(3, Math.ceil(span / ds));
    const loc = search(x, z, c - w, c + w);
    const dl = Math.sqrt(loc.d2); const dg = Math.sqrt(glob.d2);
    if (dl <= C.REACQ_M || dl - dg < C.REACQ_M) return { ...loc, d: dl, reacq: false };
    return { ...glob, d: dg, reacq: true };
  }
  function unwrapS(s) {
    const k = Math.round((st.sU - s) / L);
    return s + k * L;
  }
  function tangentAt(s) {
    const f = ((s % L) + L) % L / ds;
    const i = Math.floor(f); const t = f - i;
    const i0 = (i % N) * 4; const i1 = ((i + 1) % N) * 4;
    const tx = samples[i0 + 2] * (1 - t) + samples[i1 + 2] * t;
    const tz = samples[i0 + 3] * (1 - t) + samples[i1 + 3] * t;
    return Math.atan2(tx, tz);
  }
  function pointAt(s) {
    const f = ((s % L) + L) % L / ds;
    const i = Math.floor(f); const t = f - i;
    return { x: px(i) + (px(i + 1) - px(i)) * t, z: pz(i) + (pz(i + 1) - pz(i)) * t };
  }

  /**
   * One GPS fix. t = seconds (monotonic). speedMs = Doppler speed (coords.speed) or filtered speed, null if unknown.
   * headingDeg = course over ground (0 = north, clockwise), null if unknown. acc = horizontal accuracy (m).
   */
  function feed({ x, z, t, speedMs = null, headingDeg = null, acc = null }) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(t)) return;
    const dt = st.has ? Math.max(0.02, Math.min(3, t - st.tFix)) : 1;
    const m = match(x, z, C.WINDOW_M + Math.abs(st.v) * dt * 1.5);
    st.d = m.d; st.acc = acc; st.lastX = x; st.lastZ = z;
    // far from the circuit (hysteresis)
    st.far = st.far ? m.d > C.NEAR_M : m.d > C.FAR_M;
    if (st.far) { st.has = false; st.tFix = t; st.hist = []; st.kmh = speedMs != null ? Math.max(0, speedMs * 3.6) : 0; st.moving = false; st.v = 0; return; }
    const sMatch = st.has && !m.reacq ? unwrapS(m.s) : m.s;
    // speed magnitude: GPS Doppler / filter first, else regression of matched s over ~3 s
    st.hist.push({ t, s: sMatch });
    while (st.hist.length > 2 && t - st.hist[0].t > 5) st.hist.shift();
    let mag = null;
    if (speedMs != null && Number.isFinite(speedMs) && speedMs >= 0) mag = speedMs;
    else if (st.hist.length >= 3) {
      // no Doppler speed: least-squares slope of s(t), accepted only when it is above the GPS noise (2σ)
      const n = st.hist.length; let mt = 0; let ms = 0;
      for (const h of st.hist) { mt += h.t; ms += h.s; }
      mt /= n; ms /= n;
      let num = 0; let den = 0;
      for (const h of st.hist) { num += (h.t - mt) * (h.s - ms); den += (h.t - mt) ** 2; }
      const slope = den > 0 ? Math.abs(num / den) : 0;
      const sig = den > 0 ? Math.max(2, Number(acc) || 5) / Math.sqrt(den) : Infinity;
      mag = slope > 2 * sig ? slope : 0;
    } else mag = 0;
    if (st.has) { const dv = (mag - Math.abs(st.v)) / dt; st.a += (Math.max(-12, Math.min(8, dv)) - st.a) * Math.min(1, dt / 0.6); }
    // stop / go on smoothed speed with hysteresis — standing still means the car does not move at all
    st.magS += (mag - st.magS) * (1 - Math.exp(-dt / 0.5));
    st.kmh = mag * 3.6;
    const kS = st.magS * 3.6;
    st.moving = st.moving ? kS >= C.STOP_KMH : kS >= C.MOVE_KMH;
    st.fixDt += (dt - st.fixDt) * 0.3;
    // direction of travel: GPS course vs centreline tangent, else sign of recent Δs
    if (st.moving) {
      const tan = tangentAt(sMatch);
      if (headingDeg != null && Number.isFinite(headingDeg) && mag > 1) {
        const cog = headingDeg * Math.PI / 180; // north = -z in scene → atan2 frame: heading h with fx=sin h, fz=cos h; north is -z
        const hScene = Math.atan2(Math.sin(cog), -Math.cos(cog));
        st.dir = Math.abs(wrap(hScene - tan)) > Math.PI / 2 ? -1 : 1;
      } else if (st.hist.length >= 2) {
        const dS = st.hist[st.hist.length - 1].s - st.hist[0].s;
        if (Math.abs(dS) > 4) st.dir = dS < 0 ? -1 : 1;
      }
    }
    if (!st.has || m.reacq) {
      st.sF = sMatch; st.sU = sMatch; st.v = st.moving ? st.dir * mag : 0; st.off = m.off;
      st.has = true; st.tFix = t;
      if (!st.disp) st.disp = { s: st.sF, off: st.off };
      else if (m.reacq) { st.disp.s = st.sF; st.disp.off = st.off; }
      return;
    }
    if (!st.moving) {
      // parked: hold the filtered position, ignore drift
      st.v = 0; st.tFix = t; st.sU = st.sF;
      return;
    }
    // alpha–beta along the track (alpha depends on fix rate: ~0.35 at 1 Hz, smaller at 10–25 Hz)
    const pred = st.sF + st.v * dt;
    const alpha = 1 - Math.exp(-dt / 0.9);
    let innov = sMatch - pred;
    if (Math.abs(innov) > 60) innov = Math.sign(innov) * 60;
    st.sF = pred + alpha * innov;
    st.v = st.dir * mag;
    st.sU = st.sF;
    st.off += (Math.max(-5, Math.min(5, m.off)) - st.off) * Math.min(1, alpha * 0.8);
    st.tFix = t;
  }

  /** Render-time pose. tNow = seconds (same clock as feed). frameDt = seconds since last frame. */
  function frame(tNow, frameDt = 1 / 60) {
    const age = st.tFix ? tNow - st.tFix : Infinity;
    let state;
    if (!st.tFix || age > C.IDLE_S) state = 'idle';
    else if (st.far) state = 'far';
    else if (!st.has) state = 'idle';
    else if (age > C.LOST_S) state = 'lost';
    else state = st.moving ? 'moving' : 'stopped';
    if (state === 'idle' || state === 'far') {
      const sf = C.sfS || 0;
      const p = pointAt(sf);
      return { state, x: p.x, z: p.z, h: tangentAt(sf), s: sf, kmh: state === 'far' && age <= C.LOST_S && st.kmh >= C.STOP_KMH ? st.kmh : 0, acc: st.acc, d: st.d }; // v118: старая точка вне трассы — скорость 0, а не последняя
    }
    // extrapolate to «now» (between fixes), with the measured acceleration so braking does not overshoot;
    // horizon ≤ one fix interval + LEAD_S, so the car is never shown more than ~0.5 s ahead of the real spot
    let target = st.sF;
    if (state === 'moving') {
      const tau = Math.min(Math.max(0, age), Math.min(1.5, st.fixDt) + C.LEAD_S);
      const v0 = Math.abs(st.v); const a = st.a;
      const tStop = a < 0 ? Math.min(tau, v0 / -a) : tau;
      target = st.sF + st.dir * (v0 * tStop + 0.5 * a * tStop * tStop);
    }
    const d = st.disp || (st.disp = { s: target, off: st.off });
    // smooth the step at each new fix (time constant ~120 ms), snap on big jumps
    const k = 1 - Math.exp(-frameDt / 0.12);
    if (Math.abs(target - d.s) > 80) d.s = target; else d.s += (target - d.s) * k;
    d.off += (st.off - d.off) * k;
    const p = pointAt(d.s);
    const hc = tangentAt(d.s); // centreline forward (tx = sin, tz = cos)
    const h = st.dir < 0 ? wrap(hc + Math.PI) : hc;
    // lateral offset was measured against the centreline direction: n = (-tz, tx)
    return { state, x: p.x - Math.cos(hc) * d.off, z: p.z + Math.sin(hc) * d.off, h, s: d.s, kmh: state === 'moving' ? st.kmh : 0, acc: st.acc, d: st.d };
  }

  function reset() { Object.assign(st, { has: false, sU: 0, sF: 0, v: 0, dir: 1, off: 0, tFix: 0, acc: null, kmh: 0, moving: false, far: false, d: 0, disp: null, hist: [], magS: 0, a: 0, fixDt: 1 }); }
  /** Arc length of the centreline point nearest to (x,z) (used for the S/F line). */
  function nearestS(x, z) { return search(x, z, 0, N - 1).s; }
  function setSF(s) { C.sfS = Number(s) || 0; }
  return { feed, frame, reset, pointAt, tangentAt, nearestS, setSF, get state() { return st; }, length: L };
}
