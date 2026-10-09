/**
 * v117 · Экран замера разгона: одна правда для живых отметок, итога и шейра.
 * Все цифры — из gps-core.dragSplits по сырому треку (тот же код, что пересчитывает сервер).
 * Здесь: пошаговое «что нового прошли», серия для графика, перепад высоты, компактная кривая для шейра,
 * отрисовка графика на canvas. Без DOM, кроме переданного canvas-контекста.
 */
import { dragSplits } from './gps-core.js';

/** Сетка отметок (3 × 4) на живом экране: ключ = дисциплина gps-core. */
export const GRID = [
  { k: '0-60', label: '0–60' }, { k: '0-100', label: '0–100', hero: true }, { k: '0-200', label: '0–200' },
  { k: '0-300', label: '0–300' }, { k: '100-200', label: '100–200' }, { k: '200-300', label: '200–300' },
  { k: '60ft', label: '60 ft', dist: true }, { k: '201m', label: '⅛ мили', dist: true }, { k: '402m', label: '¼ мили', dist: true },
  { k: '80-120', label: '80–120' }, { k: '0-50', label: '0–50' }, { k: 'vmax', label: 'Vmax' },
];
export const LABEL = Object.fromEntries(GRID.map((g) => [g.k, g.label]));
export const DIST_KEYS = ['60ft', '201m', '402m'];
export const DIST_M = { '60ft': 18.288, '201m': 201.168, '402m': 402.336 };

/** Состояние живых отметок одного заезда. */
export function createRunMarks() { return { seen: {}, S: null }; }

/**
 * Новый кусок трека → { S, fresh: [ключи, пройденные впервые] }.
 * Отметка принимается, только когда её значение уже окончательное: если у точек нет доплера (телефон),
 * скорость последней точки считается по одной стороне — ждём следующую точку.
 */
export function stepRunMarks(st, pts) {
  const S = dragSplits(pts);
  const fresh = [];
  const n = pts.length;
  const allV = n > 0 && pts[n - 1].v != null && (n < 2 || pts[n - 2].v != null);
  const settledT = allV ? Infinity : (n >= 2 ? pts[n - 2].t : -Infinity);
  for (const [k, m] of Object.entries(S.marks)) {
    if (st.seen[k] != null) continue;
    if (!(m.t <= settledT)) continue;
    st.seen[k] = m.sec;
    fresh.push(k);
  }
  st.S = S;
  return { S, fresh };
}

/** Серия для графика: [{ x: с от старта, v: км/ч, alt? }], прорежена до maxN точек (сохраняем пики). */
export function speedSeries(pts, t0, maxN = 360) {
  if (t0 == null || !pts || !pts.length) return [];
  const from = Math.max(0, pts.findIndex((p) => p.t >= t0 - 400));
  const src = pts.slice(from);
  const step = Math.max(1, Math.ceil(src.length / maxN));
  const out = [];
  for (let i = 0; i < src.length; i += step) {
    let best = src[i];
    for (let j = i; j < Math.min(src.length, i + step); j++) if ((src[j].v || 0) > (best.v || 0)) best = src[j];
    out.push({ x: Math.max(0, (best.t - t0) / 1000), v: Math.max(0, best.v || 0), alt: Number.isFinite(best.alt) ? best.alt : null });
  }
  return out;
}

/**
 * Перепад высоты и уклон — только если высота реально есть в точках (телефон её даёт, PITLANE GPS — нет).
 * → { dAlt (м, + = в гору), slope (%), dist (м) } или null.
 */
export function elevation(pts, t0, tEnd, dist) {
  if (t0 == null || !(dist >= 50)) return null;
  const seg = pts.filter((p) => p.t >= t0 && p.t <= tEnd);
  const withAlt = seg.filter((p) => Number.isFinite(p.alt));
  if (seg.length < 5 || withAlt.length < seg.length * 0.6) return null;
  const med = (a) => { const s = a.map((p) => p.alt).sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const k = Math.max(1, Math.min(5, Math.floor(withAlt.length / 4)));
  const dAlt = med(withAlt.slice(-k)) - med(withAlt.slice(0, k));
  return { dAlt: Math.round(dAlt * 10) / 10, slope: Math.round((dAlt / dist) * 1000) / 10, dist };
}

/** Компактная кривая для шейр-карточки: только скорость по времени (никаких координат). */
export function shareCurve(pts, S, n = 48) {
  if (!S || S.t0 == null) return null;
  const end = Math.min(S.tEnd, S.t0 + 120000);
  const dur = (end - S.t0) / 1000;
  if (!(dur >= 1)) return null;
  const v = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = S.t0 + (dur * 1000 * i) / (n - 1);
    while (j < pts.length - 1 && pts[j + 1].t < t) j++;
    const a = pts[j]; const b = pts[Math.min(pts.length - 1, j + 1)];
    const va = a.v || 0; const vb = b.v || 0;
    const k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
    v.push(Math.max(0, Math.min(500, Math.round(va + (vb - va) * k))));
  }
  return { s: Math.round(dur * 10) / 10, v };
}
/** Отметки для шейра: { disc: [sec, км/ч в момент] } — только то, что пройдено. */
export const SHARE_SPLITS = ['0-60', '0-100', '100-200', '0-200', '200-300', '0-300', '60ft', '201m', '402m'];
export function shareSplits(S) {
  const out = {};
  if (!S) return out;
  for (const k of SHARE_SPLITS) {
    const m = S.marks[k];
    if (m) out[k] = [m.sec, Math.round(m.v || 0)];
  }
  return out;
}
/** Проверка недоверенной кривой/отметок (из ссылки шейра) перед отрисовкой. */
export function cleanCurve(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.v)) return null;
  const s = Number(c.s);
  if (!(s >= 0.5 && s <= 120) || c.v.length < 2 || c.v.length > 64) return null;
  const v = c.v.map(Number);
  if (!v.every((x) => Number.isFinite(x) && x >= 0 && x <= 500)) return null;
  return { s, v };
}
export function cleanSplits(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of SHARE_SPLITS) {
    const r = o[k];
    if (!Array.isArray(r)) continue;
    const sec = Number(r[0]); const kmh = Number(r[1]);
    if (sec > 0 && sec <= 600 && kmh >= 0 && kmh <= 500) out[k] = [sec, kmh];
  }
  return out;
}

/**
 * График скорость/время (canvas 2D). series: [{x, v, alt?}], tags: [{x, v, text, dist?}].
 * opts: { w, h, dpr, xMax, live, acc }. Рисует целиком — вызывать не чаще кадра (requestAnimationFrame).
 */
export function drawSpeedChart(ctx, series, tags, opts) {
  const { w, h } = opts; const dpr = opts.dpr || 1;
  const acc = opts.acc || '#39FF14';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const padL = 30; const padR = 10; const padT = 14; const padB = 20;
  const vTop = Math.max(...series.map((p) => p.v), ...tags.map((t) => t.v), 0);
  const vMax = Math.max(120, Math.ceil((vTop + 8) / 50) * 50);
  const xMax = Math.max(opts.xMax || 0, series.length ? series[series.length - 1].x : 0, 4);
  const X = (x) => padL + (x / xMax) * (w - padL - padR);
  const Y = (v) => h - padB - (v / vMax) * (h - padT - padB);
  ctx.font = '600 9px Manrope, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  // сетка по скорости
  const gridStep = vMax > 250 ? 100 : 50;
  for (let v = 0; v <= vMax; v += gridStep) {
    ctx.strokeStyle = v === 0 ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, Math.round(Y(v)) + 0.5); ctx.lineTo(w - padR, Math.round(Y(v)) + 0.5); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.38)'; ctx.textAlign = 'right';
    ctx.fillText(String(v), padL - 6, Y(v));
  }
  // метки времени
  const xStep = xMax > 40 ? 10 : xMax > 16 ? 5 : xMax > 8 ? 2 : 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let x = 0; x <= xMax + 1e-6; x += xStep) { ctx.fillStyle = 'rgba(255,255,255,.32)'; ctx.fillText(x + ' с', X(x), h - padB + 6); }
  // высота (если есть) — тусклая линия на своей шкале
  const alts = series.filter((p) => p.alt != null);
  if (alts.length >= 5 && alts.length >= series.length * 0.6) {
    const a0 = Math.min(...alts.map((p) => p.alt)); const a1 = Math.max(...alts.map((p) => p.alt));
    const span = Math.max(4, a1 - a0);
    const YA = (a) => padT + (h - padT - padB) * (0.25 + 0.5 * (1 - (a - a0) / span));
    ctx.strokeStyle = 'rgba(120,200,255,.45)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
    ctx.beginPath(); alts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), YA(p.alt)) : ctx.moveTo(X(p.x), YA(p.alt)))); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (series.length >= 2) {
    // заливка под кривой
    const g = ctx.createLinearGradient(0, padT, 0, h - padB);
    g.addColorStop(0, 'rgba(57,255,20,.28)'); g.addColorStop(1, 'rgba(57,255,20,0)');
    ctx.beginPath(); ctx.moveTo(X(series[0].x), Y(0));
    for (const p of series) ctx.lineTo(X(p.x), Y(p.v));
    ctx.lineTo(X(series[series.length - 1].x), Y(0)); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath();
    series.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.v)) : ctx.moveTo(X(p.x), Y(p.v))));
    ctx.strokeStyle = acc; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
    if (opts.glow) { ctx.shadowColor = 'rgba(57,255,20,.55)'; ctx.shadowBlur = 8; } // свечение — только в итоге (на 25 Гц дорого)
    ctx.stroke(); ctx.shadowBlur = 0;
    if (opts.live) {
      const p = series[series.length - 1];
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(X(p.x), Y(p.v), 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  // отметки: вертикальная пунктирная линия для дистанций, бирка «3.73» у пересечения
  ctx.textBaseline = 'middle';
  const lastTagX = {}; const flips = { d: 0, s: 0 }; let flip = 0;
  for (const t of tags) {
    const x = X(t.x); const y = Y(t.v);
    if (t.dist) {
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, padT); ctx.lineTo(Math.round(x) + 0.5, h - padB); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = '#0a0a0a'; ctx.strokeStyle = t.dist ? 'rgba(255,255,255,.7)' : acc; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const text = String(t.text);
    ctx.font = '600 10px "Barlow Condensed", Manrope, system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 8;
    const lane = t.dist ? 'd' : 's';
    flip = x - (lastTagX[lane] ?? -1e9) < tw + 6 ? (flips[lane] ^= 1) : (flips[lane] = 0);
    lastTagX[lane] = x;
    // дистанции — бирка внизу у оси (под кривой), скорости — над точкой: так они не налезают друг на друга
    let ty = t.dist ? h - padB - 10 - (flip ? 16 : 0) : y - 13 - (flip ? 14 : 0);
    if (!t.dist && ty < padT) ty = y + 13;
    const tx = Math.max(padL + tw / 2, Math.min(w - padR - tw / 2, x));
    ctx.fillStyle = t.dist ? 'rgba(255,255,255,.12)' : 'rgba(57,255,20,.16)';
    roundRect(ctx, tx - tw / 2, ty - 7, tw, 14, 4); ctx.fill();
    ctx.fillStyle = t.dist ? '#e8e8e8' : acc; ctx.textAlign = 'center';
    ctx.fillText(text, tx, ty + 0.5);
  }
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
/** Бирки графика из отметок заезда (S.marks) или шейра ({disc:[sec,kmh]}). */
export function chartTags(marks, keys = ['0-100', '0-200', '0-300', '201m', '402m']) {
  const out = [];
  for (const k of keys) {
    const m = marks?.[k];
    if (!m) continue;
    const sec = Array.isArray(m) ? m[0] : m.sec;
    const v = Array.isArray(m) ? m[1] : m.v;
    // для «100–200» и т.п. x — не от старта, поэтому бирки только для дисциплин от нуля / дистанций
    out.push({ x: sec, v: v || 0, text: (DIST_KEYS.includes(k) ? LABEL[k] + ' ' : '') + Number(sec).toFixed(2), dist: DIST_KEYS.includes(k) });
  }
  return out.sort((a, b) => a.x - b.x);
}
