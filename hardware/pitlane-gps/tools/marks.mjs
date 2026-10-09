// JS-зеркало src/marks.cpp (для эмулятора чипа и сверки C++ ↔ JS ↔ gps-core в тестах). Менять вместе!
export const STAND_KMH = 1.5, ROLL_KMH = 8, END_DROP_KMH = 6, END_HOLD_MS = 600, END_DROP_FAST_KMH = 15, END_MIN_PEAK_KMH = 30;
export const GATES = [100, 200, 300];
export const GATE_KEYS = ['0-100', '0-200', '0-300'];
const roundMs = (x) => (x >= 0 ? Math.trunc(x + 0.5) : Math.trunc(x - 0.5));

export function createTracker() {
  let st = 'IDLE'; let haveS = false; let S = null; let b = null; let c = null; let nAfterS = 0;
  let prev = null; let t0Known = false; let t0 = 0; let launchSent = false;
  let crossed = [false, false, false]; let crossT = [0, 0, 0]; let pk = 0; let dropSince = -1;
  const f32 = (x) => Math.fround(x);
  function computeT0() {
    const slope = (c.v - b.v) / Math.max(1, c.t - b.t);
    if (!(slope > 0)) t0 = S.t;
    else t0 = Math.max(S.t, Math.min(b.t, b.t - b.v / slope));
    t0Known = true;
  }
  function feed(t, v0, fixOk = true) {
    const out = [];
    if (!fixOk) return out;
    const v = f32(v0);
    const p = { t, v };
    if (v <= STAND_KMH) {
      if (st === 'LAUNCHED' && !crossed[0]) out.push({ e: 'abort', at: t });
      if (st !== 'ARMED') { st = 'ARMED'; t0Known = false; launchSent = false; pk = 0; dropSince = -1; crossed = [false, false, false]; }
      S = p; haveS = true; nAfterS = 0;
    } else if (haveS && nAfterS < 2) {
      if (nAfterS === 0) b = p; else c = p;
      nAfterS++;
      if (nAfterS === 2 && st === 'LAUNCHED' && !t0Known) computeT0();
    }
    if (st === 'ARMED' && prev && prev.v < ROLL_KMH && v >= ROLL_KMH && haveS) {
      st = 'LAUNCHED'; pk = v; dropSince = -1;
      if (nAfterS >= 2) computeT0();
    }
    if (st === 'LAUNCHED') {
      if (t0Known && !launchSent) { out.push({ e: 'launch', at: Math.trunc(t0 + 0.5) }); launchSent = true; }
      if (prev) {
        for (let i = 0; i < 3; i++) {
          if (crossed[i]) continue;
          if (prev.v < GATES[i] && v >= GATES[i]) {
            const k = (GATES[i] - prev.v) / Math.max(1e-6, v - prev.v);
            crossT[i] = prev.t + (t - prev.t) * k; crossed[i] = true;
            if (t0Known) out.push({ e: 'mark', k: GATE_KEYS[i], ms: roundMs(crossT[i] - t0), at: Math.trunc(crossT[i] + 0.5) });
          }
        }
      }
      if (v > pk) pk = v;
      const drop = pk - v; let end = false;
      if (pk >= END_MIN_PEAK_KMH) {
        if (drop >= END_DROP_FAST_KMH) end = true;
        else if (drop >= END_DROP_KMH) { if (dropSince < 0) dropSince = t; else if (t - dropSince >= END_HOLD_MS) end = true; }
        else dropSince = -1;
      }
      if (end && t0Known) {
        const marks = {};
        for (let i = 0; i < 3; i++) if (crossed[i]) marks[GATE_KEYS[i]] = roundMs(crossT[i] - t0);
        out.push({ e: 'end', at: t, vmax: pk, marks });
        st = 'DONE';
      }
    }
    prev = p;
    return out;
  }
  return { feed, launched: () => st === 'LAUNCHED' };
}
