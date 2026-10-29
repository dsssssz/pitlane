/**
 * v215 · Pitlane measure engine — траекторный расчёт замера разгона (как у Dragy/RaceBox/VBOX, только в JS).
 * Pure JS (браузер, Worker, Node). Один код для клиента и сервера (через gps-core.dragSplits/dragTime).
 *
 * Конвейер:
 *  1) prepare: сортировка по времени GPS, выкидываем дубли/повторы кеша/битые точки;
 *  2) прямая заезда («map matching» для драга): PCA по координатам движения → s = проекция на ось заезда (м),
 *     поперечный разброс → флаг «не прямая»;
 *  3) Калман [s, v, a] (модель постоянного ускорения) по ВСЕМ данным: доплер v (σ = sAcc), позиция s (σ = hAcc),
 *     «стоим» (ZUPT) до старта, опционально акселерометр a; выбросы — NIS-гейт (χ², 1 dof);
 *  4) RTS-сглаживание назад (offline, по всему заезду) на плотной сетке 20 мс → время пересечения порогов
 *     интерполируется по траектории модели, а не по сырым 1-Гц точкам;
 *  5) старт = момент трогания (v ↑ 0.5 км/ч на сглаженной кривой), опц. роллаут 1 фут (0.3048 м);
 *  6) уклон по высоте (если есть) vs s; флаг валидности с причинами.
 * Для экрана — отдельный DisplaySpeed (плавный, ограниченная частота); на тайминг он не влияет.
 */
const R_E = 6371008.8;
const D2R = Math.PI / 180;
export const ROLLOUT_M = 0.3048;
export const ENGINE_V = 1;

const fin = (x) => typeof x === 'number' && Number.isFinite(x);

/** Точки {t мс, lat, lon, v км/ч|null, acc м|null, sAcc м/с?, sv?, alt?, a м/с²?} → чистый массив по возрастанию t. */
export function prepare(points) {
  const pts = (points || []).filter((p) => p && fin(p.t) && fin(p.lat) && fin(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
  pts.sort((a, b) => a.t - b.t);
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && p.t - q.t < 1) continue; // дубль/тот же момент
    // iOS кеш: та же точка и та же скорость с новым временем — не измерение
    if (q && p.lat === q.lat && p.lon === q.lon && p.v === q.v && p.v != null && p.v > 3) continue;
    out.push(p);
  }
  return out;
}

/** Ось заезда: PCA по точкам движения. → { o:{lat,lon}, ux, uy, xy(p), crossRms } */
export function runAxis(pts) {
  if (!pts.length) return null;
  const o = pts[0];
  const kx = R_E * D2R * Math.cos(o.lat * D2R); const ky = R_E * D2R;
  const xy = (p) => ({ x: (p.lon - o.lon) * kx, y: (p.lat - o.lat) * ky });
  const mv = pts.filter((p) => p.v == null || p.v > 5).map(xy);
  const use = mv.length >= 3 ? mv : pts.map(xy);
  let mx = 0; let my = 0; for (const q of use) { mx += q.x; my += q.y; } mx /= use.length; my /= use.length;
  let sxx = 0; let syy = 0; let sxy = 0;
  for (const q of use) { const dx = q.x - mx; const dy = q.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ux = Math.cos(th); let uy = Math.sin(th);
  // направление — по ходу движения
  const a = use[0]; const b = use[use.length - 1];
  if ((b.x - a.x) * ux + (b.y - a.y) * uy < 0) { ux = -ux; uy = -uy; }
  let c2 = 0; for (const q of use) { const c = -(q.x - mx) * uy + (q.y - my) * ux; c2 += c * c; }
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  return { ux, uy, xy, crossRms: Math.sqrt(c2 / use.length), span, s: (p) => { const q = xy(p); return q.x * ux + q.y * uy; } };
}

/** Частота: медианный шаг. */
export function medianDt(pts) {
  const d = []; for (let i = 1; i < pts.length; i++) d.push(pts[i].t - pts[i - 1].t);
  if (!d.length) return null; d.sort((a, b) => a - b); return d[d.length >> 1];
}

/**
 * Калман [s, v, a] + RTS. Время — секунды от t0. Возвращает плотную сглаженную траекторию
 * [{ t мс, s м, v м/с, a м/с² }] (сетка gridMs + моменты измерений), и статистику отбраковки.
 */
export function smoothTrajectory(pts, opt = {}) {
  const n = pts.length;
  if (n < 2) return { traj: [], rej: 0, used: 0 };
  const gridMs = opt.gridMs || 20;
  const hz = 1000 / Math.max(1, medianDt(pts));
  const lowHz = hz < 5;
  const q = opt.jerkQ ?? (lowHz ? 25 : 60); // спектр рывка (м²/с⁵) — разгон авто: рывок до ~10–20 м/с³
  let axis = opt.axis || runAxis(pts);
  { // координаты, противоречащие доплеру (застывшие/кэш), в фильтр не берём
    let D = 0; for (let i = 1; i < n; i++) if (fin(pts[i].v) && fin(pts[i - 1].v)) D += (pts[i].v + pts[i - 1].v) / 7.2 * (pts[i].t - pts[i - 1].t) / 1000;
    if (axis && D > 20 && axis.span < Math.max(5, 0.3 * D)) axis = null;
  }
  const tBase = pts[0].t;
  // события: измерения и (для < 10 Гц) узлы сетки — траектория модели между редкими точками
  const ev = [];
  for (const p of pts) ev.push({ t: p.t, p });
  if (hz < 9.5) for (let t = tBase + gridMs; t < pts[n - 1].t; t += gridMs) ev.push({ t, p: null });
  ev.sort((a, b) => a.t - b.t || (a.p ? -1 : 1));
  const N = ev.length;
  // плоские массивы: x (3), P (9, row-major)
  const Xf = new Float64Array(N * 3); const Pf = new Float64Array(N * 9);
  const Xp = new Float64Array(N * 3); const Pp = new Float64Array(N * 9); const DT = new Float64Array(N);
  const x = [axis ? axis.s(pts[0]) : 0, fin(pts[0].v) ? pts[0].v / 3.6 : 0, 0];
  const P = [100, 0, 0, 0, 4, 0, 0, 0, 9];
  let tPrev = ev[0].t; let rej = 0; let used = 0;
  // скалярное измерение компоненты h (0=s,1=v,2=a)
  const upd = (h, z, Rm, gate) => {
    const S = P[h * 4] + Rm; const y = z - x[h];
    if (gate && (y * y) / S > gate) { rej++; return false; }
    const c0 = P[h]; const c1 = P[3 + h]; const c2 = P[6 + h]; // столбец h = P·Hᵀ
    const k0 = c0 / S; const k1 = c1 / S; const k2 = c2 / S;
    x[0] += k0 * y; x[1] += k1 * y; x[2] += k2 * y;
    const r0 = P[h * 3]; const r1 = P[h * 3 + 1]; const r2 = P[h * 3 + 2]; // строка h
    P[0] -= k0 * r0; P[1] -= k0 * r1; P[2] -= k0 * r2;
    P[3] -= k1 * r0; P[4] -= k1 * r1; P[5] -= k1 * r2;
    P[6] -= k2 * r0; P[7] -= k2 * r1; P[8] -= k2 * r2;
    used++; return true;
  };
  // предсказание: x ← F x, P ← F P Fᵀ + Q, F = [[1,dt,dt²/2],[0,1,dt],[0,0,1]]
  const predict = (dt) => {
    const h2 = dt * dt / 2;
    x[0] += dt * x[1] + h2 * x[2]; x[1] += dt * x[2];
    // A = F P
    const a0 = P[0] + dt * P[3] + h2 * P[6]; const a1 = P[1] + dt * P[4] + h2 * P[7]; const a2 = P[2] + dt * P[5] + h2 * P[8];
    const b0 = P[3] + dt * P[6]; const b1 = P[4] + dt * P[7]; const b2 = P[5] + dt * P[8];
    const c0 = P[6]; const c1 = P[7]; const c2 = P[8];
    // A Fᵀ
    P[0] = a0 + dt * a1 + h2 * a2; P[1] = a1 + dt * a2; P[2] = a2;
    P[3] = b0 + dt * b1 + h2 * b2; P[4] = b1 + dt * b2; P[5] = b2;
    P[6] = c0 + dt * c1 + h2 * c2; P[7] = c1 + dt * c2; P[8] = c2;
    const d5 = q * dt ** 5 / 20; const d4 = q * dt ** 4 / 8; const d3 = q * dt ** 3 / 6; const d3b = q * dt ** 3 / 3; const d2 = q * dt * dt / 2;
    P[0] += d5; P[1] += d4; P[2] += d3; P[3] += d4; P[4] += d3b; P[5] += d2; P[6] += d3; P[7] += d2; P[8] += q * dt;
  };
  let movedOnce = false; let rejStreak = 0;
  for (let k = 0; k < N; k++) {
    const e = ev[k];
    const dt = Math.max(0, (e.t - tPrev) / 1000); tPrev = e.t;
    predict(dt); DT[k] = dt;
    Xp.set(x, k * 3); Pp.set(P, k * 9);
    const p = e.p;
    if (p) {
      const vMs = fin(p.v) && p.v >= 0 ? p.v / 3.6 : null;
      const sA = fin(p.sAcc) && p.sAcc > 0 ? Math.max(0.05, p.sAcc) : (lowHz ? 0.6 : 0.25);
      if (vMs != null) {
        // доплер — главный источник; NIS-гейт (χ² 1 dof = 16 ≈ 4σ); 3 «выброса» подряд = реальность → принять
        let ok = upd(1, vMs, sA * sA, used > 3 && rejStreak < 3 ? 16 : 0);
        if (!ok) rejStreak++; else rejStreak = 0;
        if (!ok && rejStreak >= 3) { P[4] += sA * sA * 4 + 1; P[8] += 4; ok = upd(1, vMs, sA * sA, 0); rejStreak = 0; }
        if (ok && vMs > 1.5) movedOnce = true;
        if (vMs < 0.15 && !movedOnce) { upd(1, 0, 0.01, 0); upd(2, 0, 0.04, 0); } // ZUPT: стоим
      }
      const hA = fin(p.acc) && p.acc > 0 ? Math.max(0.5, p.acc) : 15;
      if (axis && hA <= 30) upd(0, axis.s(p), (vMs == null ? 1 : 2.5) * hA * hA, used > 3 ? 12 : 0);
      if (fin(p.a)) upd(2, p.a, lowHz ? 0.5 : 0.36, 16); // акселерометр (вдоль хода), если есть
    }
    Xf.set(x, k * 3); Pf.set(P, k * 9);
  }
  // RTS назад: C = Pf_k Fᵀ (Pp_{k+1})⁻¹; xs_k = xf_k + C (xs_{k+1} − xp_{k+1})
  const Xs = new Float64Array(N * 3); const Ps = new Float64Array(N * 9);
  Xs.set(Xf.subarray((N - 1) * 3, N * 3), (N - 1) * 3); Ps.set(Pf.subarray((N - 1) * 9), (N - 1) * 9);
  for (let k = N - 2; k >= 0; k--) {
    const dt = DT[k + 1]; const h2 = dt * dt / 2;
    const Fm = [1, dt, h2, 0, 1, dt, 0, 0, 1];
    const Pk = Pf.subarray(k * 9, k * 9 + 9);
    const PFt = m3(Pk, t3(Fm));
    const C = m3(PFt, i3(Pp.subarray((k + 1) * 9, (k + 2) * 9)));
    const d = [0, 1, 2].map((i) => Xs[(k + 1) * 3 + i] - Xp[(k + 1) * 3 + i]);
    for (let i = 0; i < 3; i++) Xs[k * 3 + i] = Xf[k * 3 + i] + C[i * 3] * d[0] + C[i * 3 + 1] * d[1] + C[i * 3 + 2] * d[2];
    const dP = new Array(9); for (let i = 0; i < 9; i++) dP[i] = Ps[(k + 1) * 9 + i] - Pp[(k + 1) * 9 + i];
    const CdC = m3(m3(C, dP), t3(C));
    for (let i = 0; i < 9; i++) Ps[k * 9 + i] = Pk[i] + CdC[i];
  }
  const traj = new Array(N);
  for (let k = 0; k < N; k++) traj[k] = { t: ev[k].t, s: Xs[k * 3], v: Math.max(0, Xs[k * 3 + 1]), a: Xs[k * 3 + 2], sv: Math.sqrt(Math.max(0, Ps[k * 9 + 4])) };
  return { traj, rej, used, hz, axis };
}
function m3(A, B) {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return o;
}
function t3(A) { return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]]; }
function i3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h; const B = -(d * i - f * g); const C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** Первое пересечение v (км/ч) вверх после индекса from по траектории → { t, i }. */
function crossV(tr, kmh, from = 1) {
  const z = kmh / 3.6;
  for (let i = Math.max(1, from); i < tr.length; i++) {
    if (tr[i - 1].v < z && tr[i].v >= z) { const k = (z - tr[i - 1].v) / Math.max(1e-9, tr[i].v - tr[i - 1].v); return { t: tr[i - 1].t + (tr[i].t - tr[i - 1].t) * k, i }; }
  }
  return null;
}
/** Дистанция вдоль пути: ∫v dt по сглаженной траектории (доплер точнее координат), от индекса. */
function distSeries(tr) {
  const d = [0];
  for (let i = 1; i < tr.length; i++) d.push(d[i - 1] + ((tr[i - 1].v + tr[i].v) / 2) * ((tr[i].t - tr[i - 1].t) / 1000));
  return d;
}
function atT(tr, arr, t) {
  for (let i = 1; i < tr.length; i++) if (tr[i].t >= t) { const k = (t - tr[i - 1].t) / Math.max(1e-9, tr[i].t - tr[i - 1].t); return arr[i - 1] + (arr[i] - arr[i - 1]) * k; }
  return arr[arr.length - 1];
}

export const DEFS = {
  '0-50': { to: 50 }, '0-60': { to: 60 }, '0-100': { to: 100 }, '0-200': { to: 200 }, '0-300': { to: 300 },
  '80-120': { from: 80, to: 120 }, '100-200': { from: 100, to: 200 }, '200-300': { from: 200, to: 300 },
  '60ft': { dist: 18.288 }, '201m': { dist: 201.168 }, '402m': { dist: 402.336 },
};
const LAUNCH_KMH = 8; const MOVE_KMH = 0.5;

/**
 * Полный расчёт заезда. → { t0, tEnd, dist, vmax, marks:{k:{sec,t,v,d}}, valid, reasons[], approx, q:{hz,rej,slope,crossRms} }
 * opt: { rollout:false, defs }
 */
export function analyzeRun(points, opt = {}) {
  const defs = opt.defs || DEFS;
  const out = { t0: null, tEnd: null, dist: 0, vmax: 0, marks: {}, valid: false, reasons: [], approx: false, q: {} };
  const pts = prepare(points);
  if (pts.length < 2) { out.reasons.push('few_points'); return out; }
  const { traj, rej, used, hz, axis } = smoothTrajectory(pts, opt);
  if (!traj.length) return out;
  out.tEnd = pts[pts.length - 1].t;
  const d = distSeries(traj);
  const vs = traj.map((p) => p.v * 3.6);
  // старт: первое пересечение 8 км/ч, затем назад — последний момент, где v ≤ 0.5 км/ч (трогание)
  const L = crossV(traj, LAUNCH_KMH);
  if (L) {
    // Сглаживатель «размазывает» излом в момент трогания (особенно на 1–10 Гц), поэтому старт берём так:
    // касательная к сглаженной кривой на 8 км/ч продлевается назад до 0.5 км/ч (начальный разгон почти линеен),
    // но не раньше последней сырой точки «стоим» (доплер ≤ 0.5 км/ч) и не позже первой сырой точки «едем».
    const p8 = traj[L.i];
    const aL = Math.max(0.8, p8.a);
    let t0 = L.t - ((LAUNCH_KMH - MOVE_KMH) / 3.6 / aL) * 1000;
    let still = null; let moving = null;
    for (const p of pts) { if (p.t > L.t) break; if (fin(p.v) && p.v <= MOVE_KMH) { still = p; moving = null; } else if (fin(p.v) && p.v > 1.5 && !moving) moving = p; }
    if (still) t0 = Math.max(t0, still.t); else out.reasons.push('no_standstill');
    if (moving) { // не позже, чем даёт прямая назад от первой сырой точки «едем» (ускорение — по сырым соседям, но не меньше сглаженного)
      const m2 = pts[pts.indexOf(moving) + 1];
      const aRaw = hz >= 5 && m2 && fin(m2.v) ? (m2.v - moving.v) / 3.6 / ((m2.t - moving.t) / 1000) : 0;
      t0 = Math.min(t0, moving.t - 1000 * (Math.max(0, moving.v - MOVE_KMH) / 3.6) / Math.max(aL, aRaw, hz >= 5 ? 0.8 : 15));
    }
    t0 = Math.min(t0, L.t);
    // v217: телефон (< 5 Гц) — трогание по акселерометру (как Harry's LapTimer / Dragy-приложения: IMU 50–100 Гц точнее 1 Гц GPS).
    // Принимаем только внутри окна [последняя сырая «стоим» − 0.3 с, первая сырая «едем»]: подделка не сдвинет старт больше чем на ~1 с.
    const hiT = moving ? moving.t : L.t;
    // метка: у фикса GPS поле imuT — момент толчка по акселерометру (абсолютное время, мс), берём последний до первой точки «едем»
    const imuTs = hz < 5 ? pts.filter((p) => fin(p.imuT) && p.imuT <= hiT).map((p) => p.imuT) : [];
    const imu = imuTs.length ? { t: imuTs[imuTs.length - 1] } : null;
    if (imu) {
      const lo = still ? still.t - 300 : -Infinity;
      if (imu.t >= lo && imu.t <= hiT) { t0 = imu.t; out.imuLaunch = true; }
    }
    if (opt.rollout) { const d0 = atT(traj, d, t0); for (let i = 1; i < traj.length; i++) if (d[i] - d0 >= ROLLOUT_M) { const k = (d0 + ROLLOUT_M - d[i - 1]) / Math.max(1e-9, d[i] - d[i - 1]); t0 = traj[i - 1].t + (traj[i].t - traj[i - 1].t) * k; break; } }
    out.t0 = t0;
  }
  const d0 = out.t0 != null ? atT(traj, d, out.t0) : 0;
  if (out.t0 != null) {
    out.dist = d[d.length - 1] - d0;
    for (let i = 0; i < traj.length; i++) if (traj[i].t >= out.t0 && vs[i] > out.vmax) out.vmax = vs[i];
  }
  const vAtT = (t) => atT(traj, vs, t);
  for (const [k, def] of Object.entries(defs)) {
    let c = null;
    if (def.from != null) {
      const a = crossV(traj, def.from); const b = a && crossV(traj, def.to, a.i);
      if (b) c = { t: b.t, from: a.t };
    } else if (out.t0 != null && def.dist != null) {
      for (let i = 1; i < traj.length; i++) {
        if (traj[i].t <= out.t0) continue;
        if (d[i] - d0 >= def.dist) { const k2 = (d0 + def.dist - d[i - 1]) / Math.max(1e-9, d[i] - d[i - 1]); c = { t: traj[i - 1].t + (traj[i].t - traj[i - 1].t) * k2, from: out.t0 }; break; }
      }
    } else if (out.t0 != null) {
      const from = traj.findIndex((p) => p.t >= out.t0);
      const b = crossV(traj, def.to, Math.max(1, from));
      if (b) c = { t: b.t, from: out.t0 };
    }
    if (!c) continue;
    out.marks[k] = { sec: Math.round(c.t - c.from) / 1000, t: c.t, v: vAtT(c.t), d: out.t0 != null ? atT(traj, d, c.t) - d0 : null };
  }
  // качество и причины
  const seg = out.t0 != null ? pts.filter((p) => p.t >= out.t0 - 500) : pts;
  const sats = seg.map((p) => p.sv).filter(fin);
  const sAccs = seg.map((p) => p.sAcc).filter(fin).sort((a, b) => a - b);
  const hAccs = seg.map((p) => p.acc).filter(fin).sort((a, b) => a - b);
  const med = (a) => (a.length ? a[a.length >> 1] : null);
  let maxGap = 0; for (let i = 1; i < seg.length; i++) maxGap = Math.max(maxGap, seg[i].t - seg[i - 1].t);
  const noDoppler = seg.filter((p) => !fin(p.v)).length > seg.length * 0.3;
  // уклон: регрессия высоты по пройденному пути
  let slope = null;
  const alt = seg.filter((p) => fin(p.alt));
  if (out.t0 != null && alt.length >= 5 && out.dist >= 50) {
    const xs = alt.map((p) => atT(traj, d, p.t) - d0); const ys = alt.map((p) => p.alt);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length; const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0; let den = 0; for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    if (den > 0) slope = Math.round((num / den) * 1000) / 10; // %
  }
  out.q = { hz: Math.round(hz * 10) / 10, rej, used, crossRms: axis ? Math.round(axis.crossRms * 10) / 10 : null, slope, sats: med(sats.sort((a, b) => a - b)), sAcc: med(sAccs), hAcc: med(hAccs), maxGapMs: maxGap };
  const R = out.reasons;
  if (hz < 9.5) { R.push('low_hz'); out.approx = true; }
  if (noDoppler) { R.push('no_doppler'); out.approx = true; }
  if (out.q.sats != null && out.q.sats < 6) R.push('low_sats');
  if (out.q.sAcc != null && out.q.sAcc > 0.5) R.push('bad_speed_acc');
  if (out.q.hAcc != null && out.q.hAcc > 15) R.push('bad_pos_acc');
  if (maxGap > Math.max(1500, 3 * 1000 / hz)) R.push('gap');
  if (slope != null && Math.abs(slope) > 2) R.push('slope');
  if (axis && axis.span > 30 && axis.crossRms > 6) R.push('not_straight');
  if (used && rej / (rej + used) > 0.15) R.push('outliers');
  if (out.t0 == null) R.push('no_launch');
  out.valid = !R.some((r) => r !== 'low_hz' && r !== 'no_doppler' && r !== 'no_standstill');
  return out;
}

/** Человеческие подписи причин. */
export const REASON_RU = {
  low_hz: 'GPS телефона ~1 Гц — время приблизительное', no_doppler: 'нет доплеровской скорости', low_sats: 'мало спутников',
  bad_speed_acc: 'низкая точность скорости', bad_pos_acc: 'низкая точность координат', gap: 'пропуски данных', slope: 'уклон больше 2%',
  not_straight: 'заезд не по прямой', outliers: 'много выбросов GPS', no_launch: 'не найден старт с места', no_standstill: 'старт не с полной остановки', few_points: 'мало точек',
};

/**
 * Спидометр для экрана: целевая скорость от измерений + экстраполяция по ускорению ≤ 0.6 с,
 * плавный подход (критически демпфированный), вывод не чаще fps; на тайминг не влияет.
 */
export class DisplaySpeed {
  constructor({ fps = 15, tau = 0.12 } = {}) { this.fps = fps; this.tau = tau; this.v = 0; this.a = 0; this.tm = 0; this.shown = 0; this.tShow = 0; this.last = 0; this.tLast = 0; }
  /** измерение: tMs — время прихода (часы экрана), kmh, accel (км/ч в с, опц.) */
  push(tMs, kmh, accel) {
    if (!fin(kmh)) return;
    if (this.tm) { const dt = (tMs - this.tm) / 1000; if (dt > 0.02) this.a = fin(accel) ? accel : 0.6 * this.a + 0.4 * (kmh - this.v) / dt; }
    this.v = kmh; this.tm = tMs;
  }
  /** кадр: возвращает целое км/ч или null, если обновлять рано (лимит fps) */
  frame(now) {
    if (this.tShow && now - this.tShow < 1000 / this.fps) return null;
    const age = Math.min(0.6, Math.max(0, (now - this.tm) / 1000));
    let target = this.v + (Math.abs(this.a) > 2 ? this.a * age : 0);
    if ((now - this.tm) > 2500) target = 0;
    if (target < 0.8) target = 0;
    const dt = this.tShow ? Math.min(0.5, (now - this.tShow) / 1000) : 1;
    this.tShow = now;
    let step = (target - this.shown) * (1 - Math.exp(-dt / this.tau));
    const lim = (step > 0 ? 60 : 90) * dt; // физический предел ~1.7 g разгон / 2.5 g торможение (км/ч за с)
    step = Math.max(-lim, Math.min(lim, step));
    this.shown = target === 0 && this.shown < 2 ? 0 : this.shown + step;
    const r = Math.round(this.shown);
    // гистерезис 0.6 км/ч — цифра не мигает между двумя значениями
    if (Math.abs(this.shown - this.last) < 0.6 && r !== 0) return this.lastR ?? r;
    this.last = this.shown; this.lastR = r; return r;
  }
}
