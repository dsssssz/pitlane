/**
 * v130: разбор сессии («стенд после сессии») — только данные сессии на клиенте (времена кругов и сектора),
 * сырые треки не хранятся и не уходят на сервер. Сектора = трети дистанции круга (как в замере круга).
 */
/** Кумулятивные отметки [c1,c2,c3?] + ms → [S1,S2,S3] (мс) или null. */
export function splitsOf(lap) {
  const cum = lap && lap.sectors;
  if (!Array.isArray(cum) || cum.length < 2) return null;
  const c0 = Number(cum[0]); const c1 = Number(cum[1]);
  if (!(c0 > 0) || !(c1 > c0)) return null;
  let c2 = Number(cum[2]);
  if (!(c2 > c1)) c2 = Number(lap.ms);
  if (!(c2 > c1)) return null;
  return [c0, c1 - c0, c2 - c1];
}

/**
 * laps: [{ ms, at, sectors, valid }] одной сессии → разбор.
 * Эталон сектора — лучший сектор сессии среди зачётных кругов (если зачётных < 2 — среди всех с секторами).
 */
export function analyzeSession(laps, { pbSectors = null } = {}) {
  const all = (laps || []).map((l, i) => ({ n: i + 1, ms: Number(l.ms), at: l.at || null, valid: l.valid !== false, sp: splitsOf(l) }))
    .filter((l) => Number.isFinite(l.ms) && l.ms > 0);
  const withSp = all.filter((l) => l.sp);
  const pool = withSp.filter((l) => l.valid).length >= 2 ? withSp.filter((l) => l.valid) : withSp;
  if (pool.length < 2) return { ok: false, laps: all, reason: withSp.length ? 'few' : 'nosectors' };
  const bestSec = [0, 1, 2].map((i) => Math.min(...pool.map((l) => l.sp[i])));
  const idealMs = bestSec[0] + bestSec[1] + bestSec[2];
  const bestLap = pool.reduce((a, b) => (b.ms < a.ms ? b : a));
  const loss = [0, 1, 2].map((i) => {
    const d = pool.map((l) => l.sp[i] - bestSec[i]);
    const avg = d.reduce((a, b) => a + b, 0) / d.length;
    const worst = Math.max(...d);
    const vals = pool.map((l) => l.sp[i]);
    return { idx: i + 1, avgMs: Math.round(avg), worstMs: Math.round(worst), spreadMs: Math.round(Math.max(...vals) - Math.min(...vals)) };
  });
  const worst = loss.reduce((a, b) => (b.avgMs > a.avgMs ? b : a));
  const rows = all.map((l) => ({
    ...l,
    inPool: pool.includes(l),
    best: l === bestLap,
    cells: l.sp ? l.sp.map((v, i) => ({ ms: v, d: v - bestSec[i], best: v === bestSec[i], pb: pbSectors && pbSectors[i] != null ? v <= pbSectors[i] : false })) : null,
  }));
  return { ok: true, laps: rows, bestSec, idealMs, bestLapMs: bestLap.ms, bestLapN: bestLap.n, gainMs: bestLap.ms - idealMs, loss, worst, n: pool.length };
}

/** Цвет сектора на карте: относительно своего лучшего (эталона) — 'best' | 'near' (≤0.15 с) | 'loss'. */
export function sectorTone(d) { return d <= 0 ? 'best' : d <= 150 ? 'near' : 'loss'; }

const R = 6371000;
function hav(a, b) {
  const r = Math.PI / 180; const dLat = (b[1] - a[1]) * r; const dLon = (b[0] - a[0]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
/**
 * Контур [[lon,lat],…] (замкнутый) + С/Ф [lon,lat] → 3 полилинии секторов (трети длины от С/Ф).
 * dirPt [lon,lat] — точка ~150 м после старта (направление езды); без неё — порядок контура.
 */
export function splitOutline(coords, sf, dirPt = null) {
  if (!Array.isArray(coords) || coords.length < 4) return null;
  let pts = coords.slice();
  if (hav(pts[0], pts[pts.length - 1]) < 1) pts.pop();
  let k = 0; if (sf) { let bd = Infinity; pts.forEach((p, i) => { const d = hav(p, sf); if (d < bd) { bd = d; k = i; } }); }
  pts = pts.slice(k).concat(pts.slice(0, k));
  if (sf) pts.unshift(sf);
  if (dirPt) {
    // вперёд по контуру или назад: какая сторона ближе к точке после старта
    const near = (arr) => Math.min(...arr.slice(1, Math.max(3, Math.floor(arr.length / 6))).map((p) => hav(p, dirPt)));
    const rev = [pts[0]].concat(pts.slice(1).reverse());
    if (near(rev) < near(pts)) pts = rev;
  }
  pts.push(pts[0]);
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1], pts[i]));
  const L = cum[cum.length - 1];
  const cut = (tgt) => { for (let i = 1; i < pts.length; i++) if (cum[i] >= tgt) { const f = (tgt - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]); return { i, p: [pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])] }; } return { i: pts.length - 1, p: pts[pts.length - 1] }; };
  const a = cut(L / 3); const b = cut((2 * L) / 3);
  const s1 = pts.slice(0, a.i).concat([a.p]);
  const s2 = [a.p].concat(pts.slice(a.i, b.i), [b.p]);
  const s3 = [b.p].concat(pts.slice(b.i));
  return { sectors: [s1, s2, s3], lengthM: Math.round(L), sf: pts[0] };
}
