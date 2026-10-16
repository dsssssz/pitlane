/* v142: аналитика и коучинг круга — скорость/дистанция, продольное ускорение, боковая G, наложение кругов,
 * правила «где потерял время» по секторам. Чистые функции тестируются в node; графики — SVG через createElementNS. */
const G = 9.81;
const R_EARTH = 6371000;
const rad = Math.PI / 180;
function hav(a, b) { const dLa = (b.lat - a.lat) * rad, dLo = (b.lon - a.lon) * rad; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLo / 2) ** 2; return 2 * R_EARTH * Math.asin(Math.sqrt(x)); }
function brg(a, b) { const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad); const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad); return Math.atan2(y, x); }
const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
function smooth(arr, k = 2) { return arr.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(arr.length - 1, i + k); j++) if (Number.isFinite(arr[j])) { s += arr[j]; n++; } return n ? s / n : 0; }); }

/** points [{t(ms), d(m)?, v(km/h), lat?, lon?}] → {t,d,v,ax(g),gl(g)} */
export function derive(points) {
  const p = (points || []).filter((x) => x && Number.isFinite(x.t) && Number.isFinite(x.v));
  if (p.length < 3) return { t: [], d: [], v: [], ax: [], gl: [], L: 0, ms: 0 };
  const t = p.map((x) => x.t), v = p.map((x) => x.v);
  const d = []; let acc = 0;
  for (let i = 0; i < p.length; i++) {
    if (Number.isFinite(p[i].d)) d.push(p[i].d);
    else { if (i > 0 && p[i].lat != null && p[i - 1].lat != null) acc += hav(p[i - 1], p[i]); else if (i > 0) acc += ((v[i] + v[i - 1]) / 7.2) * ((t[i] - t[i - 1]) / 1000); d.push(acc); }
  }
  const ax = [0]; const gl = [0];
  for (let i = 1; i < p.length; i++) {
    const dt = Math.max(0.05, (t[i] - t[i - 1]) / 1000);
    ax.push(((v[i] - v[i - 1]) / 3.6) / dt / G);
    if (i >= 2 && p[i].lat != null && p[i - 2].lat != null) {
      const h1 = brg(p[i - 2], p[i - 1]), h2 = brg(p[i - 1], p[i]);
      const dt2 = Math.max(0.05, (t[i] - t[i - 2]) / 2000);
      gl.push(((v[i] / 3.6) * (wrap(h2 - h1) / dt2)) / G);
    } else gl.push(0);
  }
  const clampG = (x) => Math.max(-2.5, Math.min(2.5, x));
  return { t, d, v, ax: smooth(ax.map(clampG), 2), gl: smooth(gl.map(clampG), 2), L: d[d.length - 1], ms: t[t.length - 1] - t[0] };
}

/** значение ряда в точке дистанции x (линейная интерполяция) */
export function atD(s, key, x) {
  const d = s.d; if (!d.length) return null;
  if (x <= d[0]) return s[key][0]; if (x >= d[d.length - 1]) return s[key][d.length - 1];
  let lo = 0, hi = d.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d[m] <= x) lo = m; else hi = m; }
  const f = (x - d[lo]) / Math.max(1e-6, d[hi] - d[lo]); return s[key][lo] + (s[key][hi] - s[key][lo]) * f;
}
/** время в точке дистанции x */
export function timeAtD(s, x) { const r = atD({ d: s.d, t: s.t }, 't', x); return r == null ? null : r - s.t[0]; }

/** Сектор [a,b] (м): апекс (мин. скорость), точка торможения, скорость выхода, время. */
export function sectorStats(s, a, b) {
  const idx = []; for (let i = 0; i < s.d.length; i++) if (s.d[i] >= a && s.d[i] <= b) idx.push(i);
  if (idx.length < 3) return null;
  let iMin = idx[0]; for (const i of idx) if (s.v[i] < s.v[iMin]) iMin = i;
  let iBrake = iMin; for (let i = iMin; i > idx[0]; i--) { if (s.ax[i] < -0.25) iBrake = i; else if (iBrake !== iMin) break; }
  const vMax = Math.max(...idx.map((i) => s.v[i]));
  return { vMin: s.v[iMin], dMin: s.d[iMin], dBrake: s.d[iBrake], vExit: s.v[idx[idx.length - 1]], vMax, tMs: (timeAtD(s, b) ?? 0) - (timeAtD(s, a) ?? 0), glMax: Math.max(...idx.map((i) => Math.abs(s.gl[i]))) };
}

/** Правила «где потерял время»: cur vs ref (оба derive), 3 равных по длине сектора (как HUD). */
export function whereLost(cur, ref, n = 3) {
  if (!cur.d.length || !ref.d.length) return [];
  const L = Math.min(cur.L, ref.L); const out = [];
  for (let k = 0; k < n; k++) {
    const a = (L * k) / n, b = (L * (k + 1)) / n;
    const c = sectorStats(cur, a, b), r = sectorStats(ref, a, b);
    if (!c || !r) { out.push({ sector: k + 1, dMs: null, tips: [] }); continue; }
    const dMs = Math.round(c.tMs - r.tMs); const tips = [];
    if (dMs > 80) {
      const dvMin = c.vMin - r.vMin, dBrake = c.dBrake - r.dBrake, dExit = c.vExit - r.vExit, dTop = c.vMax - r.vMax;
      if (dBrake < -12) tips.push(`тормозите на ${Math.round(-dBrake)} м раньше эталона — попробуйте позже`);
      if (dvMin < -4) tips.push(`в повороте на ${Math.round(-dvMin)} км/ч медленнее — несите больше скорости через апекс`);
      if (dvMin > 4 && dExit < -3) tips.push(`зашли быстрее, но вышли на ${Math.round(-dExit)} км/ч медленнее — жертвуйте входом ради выхода`);
      else if (dExit < -4) tips.push(`выход на ${Math.round(-dExit)} км/ч медленнее — раньше и плавнее в газ`);
      if (dTop < -5 && !tips.length) tips.push(`на прямой на ${Math.round(-dTop)} км/ч ниже — это следствие выхода из предыдущего поворота`);
      if (!tips.length) tips.push('потеря размазана по сектору — сравните траекторию на карте');
    } else if (dMs < -80) tips.push('быстрее эталона — запомните, что сделали здесь');
    else tips.push('вровень с эталоном');
    out.push({ sector: k + 1, dMs, tips, cur: c, ref: r });
  }
  return out;
}

/** Демо-круг для пустого состояния и скриншотов (синтетический, помечается как демо). */
export function demoLap(seed = 1, slow = 0) {
  const pts = []; let t = 0, d = 0, h = 0; const R = 600; const lat0 = 43.4, lon0 = 39.95;
  const corners = [[300, 85, 120], [900, 70, 90], [1500, 110, 160], [2100, 60, 80], [2700, 95, 130]];
  let lat = lat0, lon = lon0;
  while (d < 3200) {
    let vt = 210 + 10 * Math.sin(seed + d / 400);
    for (const [cd, vmin, len] of corners) { const x = d - cd; if (x > -260 && x < len) vt = Math.min(vt, x < 0 ? vmin + (-x / 260) * 140 : vmin + (x / len) * 10); }
    vt -= slow * (d > 900 && d < 1300 ? 9 : d > 2000 && d < 2300 ? 6 : 0);
    const dt = 0.1; const prev = pts.length ? pts[pts.length - 1].v : 200; const vRaw = Math.max(40, vt);
    const v = Math.max(prev - 1.15 * G * 3.6 * dt, Math.min(prev + 0.55 * G * 3.6 * dt * (1 - prev / 330), vRaw)); const step = (v / 3.6) * dt;
    let turn = 0; for (const [cd, , len] of corners) if (d >= cd && d < cd + len) turn = Math.PI / 2 / (len / step);
    h += turn; lat += (step * Math.cos(h)) / 111320; lon += (step * Math.sin(h)) / (111320 * Math.cos(lat0 * rad));
    d += step; t += dt * 1000; pts.push({ t: Math.round(t), d, v, lat, lon });
  }
  return pts;
}

/* ——— графики ——— */
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; }
function pathOf(xs, ys, x0, x1, y0, y1, W, H) {
  let s = ''; for (let i = 0; i < xs.length; i++) { const x = ((xs[i] - x0) / (x1 - x0 || 1)) * W; const y = H - ((ys[i] - y0) / (y1 - y0 || 1)) * H; s += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
  return s;
}
/** Один график: ряд key по дистанции, cur (светлый) поверх ref (приглушённый). */
export function chart(title, unit, cur, ref, key, { sym = false, n = 3 } = {}) {
  const W = 340, H = 110;
  const box = document.createElement('figure'); box.className = 'la-chart';
  const cap = document.createElement('figcaption'); const b = document.createElement('b'); b.textContent = title; const u = document.createElement('span'); u.textContent = unit; cap.append(b, u); box.appendChild(cap);
  const all = [...cur[key], ...(ref ? ref[key] : [])];
  let y0 = Math.min(...all), y1 = Math.max(...all); if (sym) { const m = Math.max(Math.abs(y0), Math.abs(y1), 0.5); y0 = -m; y1 = m; } else { y0 = Math.floor(y0 / 20) * 20; y1 = Math.ceil(y1 / 20) * 20; }
  const L = Math.max(cur.L, ref ? ref.L : 0);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'la-svg', preserveAspectRatio: 'none' });
  for (let k = 1; k < n; k++) svg.appendChild(svgEl('line', { x1: (W * k) / n, x2: (W * k) / n, y1: 0, y2: H, class: 'la-sec' }));
  if (sym) svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: H / 2, y2: H / 2, class: 'la-zero' }));
  if (ref) svg.appendChild(svgEl('path', { d: pathOf(ref.d, ref[key], 0, L, y0, y1, W, H), class: 'la-ref' }));
  svg.appendChild(svgEl('path', { d: pathOf(cur.d, cur[key], 0, L, y0, y1, W, H), class: 'la-cur' }));
  box.appendChild(svg);
  const ax = document.createElement('div'); ax.className = 'la-ax'; [['0', 0], ['S2', 1 / 3], ['S3', 2 / 3], [Math.round(L) + ' м', 1]].forEach(([t, f]) => { const s = document.createElement('span'); s.textContent = t; s.style.left = (f * 100).toFixed(2) + '%'; ax.appendChild(s); }); box.appendChild(ax);
  const leg = document.createElement('div'); leg.className = 'la-range'; leg.textContent = (sym ? '±' + y1.toFixed(1) : y0 + '–' + y1) + ' ' + unit; box.appendChild(leg);
  return box;
}
/** Дельта времени по дистанции (cur − ref): выше нуля — проигрыш. */
export function deltaSeriesD(cur, ref, N = 120) {
  const L = Math.min(cur.L, ref.L); const d = [], v = [];
  for (let i = 0; i <= N; i++) { const x = (L * i) / N; d.push(x); v.push(((timeAtD(cur, x) ?? 0) - (timeAtD(ref, x) ?? 0)) / 1000); }
  return { d, dt: v, L };
}

export function renderAnalytics(host, { cur, ref, curLabel, refLabel, demo }) {
  host.textContent = '';
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const C = derive(cur), Rf = ref ? derive(ref) : null;
  if (C.d.length < 3) { host.appendChild(mk('p', 'la-empty', 'Проедьте круг с GPS — здесь появятся графики и разбор секторов.')); return; }
  const leg = mk('div', 'la-legend'); const a = mk('span', 'la-l-cur', curLabel || 'этот круг'); leg.appendChild(a); if (Rf) leg.appendChild(mk('span', 'la-l-ref', refLabel || 'эталон')); if (demo) leg.appendChild(mk('span', 'la-demo', 'демо'));
  host.appendChild(leg);
  if (Rf) {
    const ds = deltaSeriesD(C, Rf); const fin = ds.dt[ds.dt.length - 1];
    const head = mk('div', 'la-delta'); head.append(mk('b', null, (fin <= 0 ? '−' : '+') + Math.abs(fin).toFixed(2) + ' с'), mk('span', null, fin <= 0 ? 'быстрее эталона' : 'медленнее эталона'));
    host.appendChild(head);
    host.appendChild(chart('Дельта', 'с', { d: ds.d, dt: ds.dt, L: ds.L }, null, 'dt', { sym: true }));
  }
  host.appendChild(chart('Скорость', 'км/ч', C, Rf, 'v'));
  host.appendChild(chart('Ускорение', 'g', C, Rf, 'ax', { sym: true }));
  host.appendChild(chart('Боковая G', 'g', C, Rf, 'gl', { sym: true }));
  if (Rf) {
    const list = mk('ol', 'la-coach');
    for (const s of whereLost(C, Rf)) {
      const li = mk('li'); li.dataset.tone = s.dMs == null ? 'none' : s.dMs > 80 ? 'worse' : s.dMs < -80 ? 'better' : 'even';
      const top = mk('div', 'la-c-top'); top.append(mk('b', null, 'S' + s.sector), mk('span', 'la-c-d', s.dMs == null ? '—' : (s.dMs <= 0 ? '−' : '+') + (Math.abs(s.dMs) / 1000).toFixed(2) + ' с'));
      li.appendChild(top); for (const t of s.tips) li.appendChild(mk('p', null, t)); list.appendChild(li);
    }
    host.appendChild(mk('h4', 'la-h', 'Где потеряно время')); host.appendChild(list);
  }
}
