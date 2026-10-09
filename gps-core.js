/**
 * v104 · GPS core — ОДИН код для приложения и Worker'а (сервер пересчитывает то же самое по сырым точкам).
 * Только математика замера: кодек сырого трека, статистика (Гц, точность, точки), оценка A/B/C,
 * интерполяция пересечения порога скорости/дистанции, ворота С/Ф и секторов.
 * Пороги антифрода (телепорт, пауза, симулятор, дубли) здесь НЕ живут — они только на сервере.
 * Pure JS, без DOM/Buffer — работает в браузере, Workers и Node.
 */
export const TRACE_V = 1;
export const TRACE_MAX_POINTS = 8000;

/** Grade = product rule (то же, что показывает паспорт замера): A — точно, B — годно, C — не в топ. */
export const GRADE_RULE = {
  A: { acc: 8, bad: 0.08, hz: 1 },
  B: { acc: 15, bad: 0.18 },
  badAcc: 25, // точка с accuracy хуже этого — «плохая»
};
/** Топ разгонов: только внешний приёмник с частотой не ниже этой. */
export const DRAG_TOP_MIN_HZ = 10;

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
export function haversineM(a, b) {
  const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* ———————————— трек: кодек ————————————
 * points: [{ t: epoch ms, lat, lon, v: км/ч (Doppler или null), acc: м (или null) }]
 * wire:   { v:1, src:'ext'|'phone'|'sim', t0, p:[[dt_ms, dlat_e6, dlon_e6, v_x10, acc_x10], ...] }
 *         первая строка — абсолют (dt=0, lat_e6, lon_e6), дальше дельты; v/acc абсолютные, −1 = нет.
 */
export function encodeTrace(points, src) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length < 2) return null;
  const sl = pts.length > TRACE_MAX_POINTS ? pts.slice(pts.length - TRACE_MAX_POINTS) : pts;
  const t0 = Math.round(sl[0].t);
  const p = [];
  let pt = t0; let pla = 0; let plo = 0;
  sl.forEach((q, i) => {
    const t = Math.round(q.t); const la = Math.round(q.lat * 1e6); const lo = Math.round(q.lon * 1e6);
    const v = Number.isFinite(q.v) && q.v >= 0 ? Math.round(q.v * 10) : -1;
    const a = Number.isFinite(q.acc) && q.acc >= 0 ? Math.min(99999, Math.round(q.acc * 10)) : -1;
    if (i === 0) p.push([0, la, lo, v, a]);
    else p.push([t - pt, la - pla, lo - plo, v, a]);
    pt = t; pla = la; plo = lo;
  });
  return { v: TRACE_V, src: src === 'ext' || src === 'sim' ? src : 'phone', t0, p };
}

/** wire → { src, t0, pts:[{t (ms от начала), lat, lon, v|null, acc|null}] } или null (битый/слишком большой). */
export function decodeTrace(w) {
  if (!w || typeof w !== 'object' || w.v !== TRACE_V || !Array.isArray(w.p)) return null;
  if (w.p.length < 2 || w.p.length > TRACE_MAX_POINTS) return null;
  const src = w.src === 'ext' || w.src === 'sim' ? w.src : 'phone';
  const t0 = Number(w.t0);
  if (!Number.isFinite(t0)) return null;
  const pts = [];
  let t = 0; let la = 0; let lo = 0;
  for (let i = 0; i < w.p.length; i++) {
    const r = w.p[i];
    if (!Array.isArray(r) || r.length < 5 || !r.every((x) => Number.isFinite(x))) return null;
    if (i === 0) { la = r[1]; lo = r[2]; } else { t += r[0]; la += r[1]; lo += r[2]; }
    if (r[0] < 0 || Math.abs(la) > 90e6 || Math.abs(lo) > 180e6) return null;
    pts.push({ t, lat: la / 1e6, lon: lo / 1e6, v: r[3] >= 0 ? r[3] / 10 : null, acc: r[4] >= 0 ? r[4] / 10 : null });
  }
  return { src, t0, pts };
}

/* ———————————— статистика + оценка ———————————— */
export function traceStats(pts) {
  const n = pts ? pts.length : 0;
  if (n < 2) return { n, durMs: 0, hz: null, medDtMs: null, avgAcc: null, badRatio: null, dist: 0, maxGapMs: 0 };
  const dts = [];
  let dist = 0; let maxGap = 0; let accS = 0; let accN = 0; let bad = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i].acc;
    if (a != null) { accS += a; accN++; if (a > GRADE_RULE.badAcc) bad++; }
    if (i) {
      const dt = pts[i].t - pts[i - 1].t;
      dts.push(dt); if (dt > maxGap) maxGap = dt;
      dist += haversineM(pts[i - 1], pts[i]);
    }
  }
  dts.sort((x, y) => x - y);
  const med = dts[Math.floor(dts.length / 2)];
  const durMs = pts[n - 1].t - pts[0].t;
  return {
    n, durMs,
    hz: med > 0 ? Math.round((1000 / med) * 10) / 10 : null,
    medDtMs: med,
    avgAcc: accN ? Math.round((accS / accN) * 10) / 10 : null,
    badRatio: accN ? bad / accN : null,
    dist, maxGapMs: maxGap,
  };
}

/** A/B/C по сырым точкам (без флагов антифрода — их добавляет сервер). */
export function gradeTrace(st) {
  if (!st || st.n < 2) return 'C';
  const acc = st.avgAcc; const br = st.badRatio;
  if (acc != null && acc <= GRADE_RULE.A.acc && (br == null || br < GRADE_RULE.A.bad) && (st.hz == null || st.hz >= GRADE_RULE.A.hz)) return 'A';
  if (acc != null && acc <= GRADE_RULE.B.acc && (br == null || br < GRADE_RULE.B.bad)) return 'B';
  return 'C';
}

/* ———————————— разгоны: интерполяция пересечения порога ———————————— */
/** Скорость точки: Doppler, иначе по соседним координатам. */
export function withSpeed(pts) {
  return pts.map((p, i) => {
    if (p.v != null) return p;
    const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)];
    const dt = (b.t - a.t) / 1000;
    return { ...p, v: dt > 0 ? (haversineM(a, b) / dt) * 3.6 : 0 };
  });
}

const STAND_KMH = 1.5; // «стоим»
const ROLL_KMH = 8;    // «поехали»
/**
 * Момент старта (мс): пересечение 1.5 км/ч вверх между последней «стоячей» точкой и следующей.
 * Если стоячей точки нет (1 Гц) — линейная экстраполяция к 0 по двум точкам до 8 км/ч.
 */
export function launchTime(p) {
  let L = -1;
  for (let i = 1; i < p.length; i++) if (p[i].v >= ROLL_KMH && p[i - 1].v < ROLL_KMH) { L = i; break; }
  if (L < 0) return null;
  let S = -1;
  for (let i = L - 1; i >= 0; i--) if (p[i].v <= STAND_KMH) { S = i; break; }
  if (S >= 0) {
    // старт = экстраполяция к v=0 по первым двум точкам движения, но не раньше последней «стоячей»
    const a = p[S]; const b = p[S + 1]; const c = p[S + 2];
    const slope = c ? (c.v - b.v) / Math.max(1, c.t - b.t) : 0;
    if (!(slope > 0)) return a.t;
    return Math.max(a.t, Math.min(b.t, b.t - b.v / slope));
  }
  const a = p[L - 1]; const b = p[L];
  const acc = (b.v - a.v) / Math.max(1, b.t - a.t);
  if (acc <= 0) return a.t;
  return Math.max(L >= 2 ? p[L - 2].t : a.t - 1000, a.t - a.v / acc);
}

/** Первое пересечение kmh вверх начиная с индекса from → { t, i } (линейно между соседними точками). */
export function speedCross(p, kmh, from = 0) {
  for (let i = Math.max(1, from); i < p.length; i++) {
    const a = p[i - 1]; const b = p[i];
    if (a.v < kmh && b.v >= kmh) {
      const k = (kmh - a.v) / Math.max(1e-6, b.v - a.v);
      return { t: a.t + (b.t - a.t) * k, i };
    }
  }
  return null;
}

/** Пересечение дистанции m от момента t0 (дистанция = ∫v dt трапецией, как у Dragy). */
export function distCross(p, m, t0) {
  let d = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]; const b = p[i];
    if (b.t <= t0) continue;
    const ta = Math.max(a.t, t0);
    const va = a.t >= t0 ? a.v : a.v + (b.v - a.v) * ((t0 - a.t) / Math.max(1, b.t - a.t));
    const seg = (((va + b.v) / 2) / 3.6) * ((b.t - ta) / 1000);
    if (d + seg >= m && seg > 0) {
      const k = (m - d) / seg;
      return ta + (b.t - ta) * k;
    }
    d += seg;
  }
  return null;
}

export const DRAG_DEFS = {
  '0-50': { to: 50 }, '0-60': { to: 60 }, '0-100': { to: 100 }, '0-200': { to: 200 },
  '80-120': { from: 80, to: 120 }, '100-200': { from: 100, to: 200 }, '200-300': { from: 200, to: 300 },
  '60ft': { dist: 18.288 }, '201m': { dist: 201.168 }, '402m': { dist: 402.336 },
};

/** v117: дистанция ∫v dt (трапецией) от t0 до t — та же математика, что distCross. */
export function distAt(p, t0, t) {
  let d = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]; const b = p[i];
    if (b.t <= t0) continue;
    if (a.t >= t) break;
    const ta = Math.max(a.t, t0); const tb = Math.min(b.t, t);
    const vAt = (x) => a.v + (b.v - a.v) * ((x - a.t) / Math.max(1, b.t - a.t));
    d += (((vAt(ta) + vAt(tb)) / 2) / 3.6) * ((tb - ta) / 1000);
  }
  return d;
}
/** Скорость (км/ч) в момент t — линейно между соседними точками. */
export function speedAt(p, t) {
  for (let i = 1; i < p.length; i++) {
    if (p[i].t >= t) { const a = p[i - 1]; const b = p[i]; return a.v + (b.v - a.v) * ((t - a.t) / Math.max(1, b.t - a.t)); }
  }
  return p.length ? p[p.length - 1].v : null;
}

/** Пересечение дисциплины → { t (момент пересечения), tFrom (момент начала отсчёта) } или null. p — после withSpeed. */
function discCross(p, def, t0) {
  if (def.from != null) {
    const a = speedCross(p, def.from);
    if (!a) return null;
    const b = speedCross(p, def.to, a.i);
    return b ? { t: b.t, tFrom: a.t } : null;
  }
  if (t0 == null) return null;
  if (def.dist != null) {
    const t = distCross(p, def.dist, t0);
    return t != null ? { t, tFrom: t0 } : null;
  }
  const from = p.findIndex((q) => q.t >= t0);
  const b = speedCross(p, def.to, Math.max(1, from));
  return b ? { t: b.t, tFrom: t0 } : null;
}
const secOf = (c) => Math.round(c.t - c.tFrom) / 1000;

/** Время дисциплины в секундах (null, если порог не пересечён). Одна функция для клиента и сервера. */
export function dragTime(points, disc) {
  const def = DRAG_DEFS[disc];
  if (!def || !points || points.length < 2) return null;
  const p = withSpeed(points);
  const c = discCross(p, def, def.from != null ? null : launchTime(p));
  return c ? secOf(c) : null;
}

/** v117: дисциплины экрана замера (= DRAG_DEFS сервера + 0–300 для показа). */
export const SPLIT_DEFS = { ...DRAG_DEFS, '0-300': { to: 300 } };
/**
 * v117: ОДИН расчёт всех отметок заезда по сырому треку — для живого экрана, итога, шейра (и он же = dragTime сервера).
 * → { t0, tEnd, dist, vmax, marks: { disc: { sec, t, v (км/ч в момент пересечения), d (м от старта) } } }
 */
export function dragSplits(points, defs = SPLIT_DEFS) {
  const out = { t0: null, tEnd: null, dist: 0, vmax: 0, marks: {} };
  if (!points || points.length < 2) return out;
  const p = withSpeed(points);
  const t0 = launchTime(p);
  out.t0 = t0; out.tEnd = p[p.length - 1].t;
  for (const q of p) if (t0 != null && q.t >= t0 && q.v > out.vmax) out.vmax = q.v;
  if (t0 != null) out.dist = distAt(p, t0, out.tEnd);
  for (const [k, def] of Object.entries(defs)) {
    const c = discCross(p, def, def.from != null ? null : t0);
    if (!c) continue;
    out.marks[k] = { sec: secOf(c), t: c.t, v: speedAt(p, c.t), d: t0 != null ? distAt(p, t0, c.t) : null };
  }
  return out;
}

/* ———————————— круги: ворота ———————————— */
/** Локальная плоскость (м) вокруг опорной точки. */
function toXY(o, q) {
  const kx = 111320 * Math.cos(rad(o.lat));
  return { x: (q.lon - o.lon) * kx, y: (q.lat - o.lat) * 110540 };
}
/** Доля k∈[0,1] пересечения отрезка a→b с воротами g=[p1,p2] и знак (сторона), иначе null. */
export function gateCross(a, b, g) {
  const o = g[0];
  const A = toXY(o, a); const B = toXY(o, b); const P = { x: 0, y: 0 }; const Q = toXY(o, g[1]);
  const r = { x: B.x - A.x, y: B.y - A.y }; const s = { x: Q.x - P.x, y: Q.y - P.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const qp = { x: P.x - A.x, y: P.y - A.y };
  const k = (qp.x * s.y - qp.y * s.x) / den;
  const u = (qp.x * r.y - qp.y * r.x) / den;
  if (k < 0 || k > 1 || u < 0 || u > 1) return null;
  return { k, dir: den > 0 ? 1 : -1 };
}

/** Все пересечения ворот по треку → [{ t, i, dir }]. */
export function gateCrossings(pts, g) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const c = gateCross(pts[i - 1], pts[i], g);
    if (c) out.push({ t: pts[i - 1].t + (pts[i].t - pts[i - 1].t) * c.k, i, dir: c.dir });
  }
  return out;
}

/**
 * Круг по сырым точкам на калиброванной трассе: старт и финиш — автопересечение С/Ф в одну сторону,
 * секторы — ворота S1/S2. → { ok, ms, sectors:[cum ms], dist } | { ok:false, code }
 */
export function lapFromTrace(pts, track) {
  if (!track || !track.calibrated || !track.sf) return { ok: false, code: 'track_uncalibrated' };
  const sf = gateCrossings(pts, track.sf);
  if (sf.length < 2) return { ok: false, code: 'manual_finish' };
  const s = sf[0];
  const e = sf.find((c, k) => k > 0 && c.dir === s.dir && c.t > s.t);
  if (!e) return { ok: false, code: 'manual_finish' };
  let dist = 0;
  for (let i = s.i; i < e.i; i++) dist += haversineM(pts[i - 1] || pts[i], pts[i]);
  const sectors = [];
  for (const g of track.sectors || []) {
    const c = gateCrossings(pts.slice(s.i - 1, e.i + 1), g)[0];
    if (c) sectors.push(Math.round(c.t - s.t));
  }
  const ms = Math.round(e.t - s.t);
  if (sectors.length === (track.sectors || []).length && sectors.length) sectors.push(ms);
  return { ok: true, ms, startT: s.t, endT: e.t, dist, sectors: sectors.length ? sectors : null };
}

/** Короткий хэш сырого трека (FNV-1a 64 по квантованным координатам/времени) — для дедупа повторов. */
export function traceHash(pts) {
  let h1 = 0x811c9dc5; let h2 = 0x01000193;
  const mix = (x) => {
    h1 = Math.imul(h1 ^ (x & 0xffff), 16777619) >>> 0;
    h2 = Math.imul(h2 ^ ((x >>> 16) & 0xffff), 2246822519) >>> 0;
  };
  for (const p of pts || []) {
    mix(Math.round(p.lat * 1e5)); mix(Math.round(p.lon * 1e5)); mix(Math.round(p.t / 100));
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
