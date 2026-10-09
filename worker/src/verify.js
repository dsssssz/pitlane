/**
 * v104 · Серверный зачёт: время, оценка GPS и флаги считаются ЗДЕСЬ по сырым точкам.
 * Клиентские gpsQ / valid / t / flags игнорируются. Пороги антифрода живут только в Worker'е
 * и наружу не отдаются — в ответе только код причины.
 *
 * Коды отказа (клиент показывает русский текст): no_trace, gps_c, manual_finish, teleport,
 * speed_flag, pause, too_short, simulator, track_uncalibrated, phone_source, low_hz, stale, duplicate, phone_disc.
 *
 * v118 · Два класса зачёта, никогда не смешиваются:
 *   cls 'ab' — внешний приёмник (разгоны: ≥10 Гц), оценка A/B по точкам;
 *   cls 'c'  — телефон (или внешний < 10 Гц на разгонах): честная метка gpsQ 'C' («зачёт C»), свой топ.
 * Для класса C антифрод тот же (телепорт, скорость/ускорение, симулятор, синтетика, дубли), но пороги
 * под ~1 Гц: дыра до PHONE_RULE.*GapMs, частота не ниже minHz, точность не хуже B, без коротких отметок.
 */
import {
  decodeTrace, traceStats, gradeTrace, dragTime, lapFromTrace, haversineM, withSpeed, traceHash,
  DRAG_TOP_MIN_HZ,
} from '../../gps-core.js';
import { trackCal } from '../../track-cal.js';

const AC = {
  maxMs: 120,          // м/с — быстрее между точками = телепорт (с поправкой на accuracy)
  maxKmh: 360,         // Doppler выше — speed_flag
  maxAccel: 16,        // м/с² — разгон сильнее (окно ≥0.3 с) нереален даже для 2-секундных электрокаров
  maxDecel: 20,        // м/с² — торможение
  lapGapMs: 2500,      // дыра в треке круга = пауза
  dragGapMs: 1500,     // дыра в треке разгона = пауза
  maxAgeMs: 14 * 86400_000,
  futureMs: 5 * 60_000,
};
/** v118: зачёт C (телефон, ~1 Гц). 60 ft и 0–50 короче 2–3 точек телефона — не зачитываются. */
export const PHONE_RULE = { minHz: 0.8, dragGapMs: 2600, lapGapMs: 4000, noDiscs: ['60ft', '0-50'] };

function flagsOf(pts, gapMs) {
  const v = withSpeed(pts);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]; const b = pts[i];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return 'teleport';
    const slack = (a.acc || 10) + (b.acc || 10) + 5;
    if (haversineM(a, b) > AC.maxMs * dt + slack) return 'teleport';
    if (b.t - a.t > gapMs) return 'pause';
    if (v[i].v > AC.maxKmh) return 'speed_flag';
  }
  // ускорение по окну ≥0.3 с (два указателя, O(n))
  let k = 0;
  for (let i = 1; i < v.length; i++) {
    while (k + 1 < i && v[i].t - v[k + 1].t >= 300) k++;
    const span = v[i].t - v[k].t;
    if (span < 300 || span > 1500) continue;
    const acc = ((v[i].v - v[k].v) / 3.6) / (span / 1000);
    if (acc > AC.maxAccel || -acc > AC.maxDecel) return 'speed_flag';
  }
  return null;
}

/** Синтетика без шума: одинаковая accuracy, идеальный шаг и нулевая «дрожь» координат. */
function looksSynthetic(pts) {
  if (pts.length < 50) return false;
  const acc0 = pts[0].acc;
  if (acc0 == null || !pts.every((p) => p.acc === acc0)) return false;
  let smooth = 0;
  for (let i = 2; i < pts.length; i++) {
    const ddl = (pts[i].lat - 2 * pts[i - 1].lat + pts[i - 2].lat) * 1e6;
    const ddo = (pts[i].lon - 2 * pts[i - 1].lon + pts[i - 2].lon) * 1e6;
    if (Math.abs(ddl) <= 1 && Math.abs(ddo) <= 1) smooth++;
  }
  return smooth / (pts.length - 2) > 0.95;
}

function base(trace, now, gapMs, phoneGapMs = gapMs) {
  const dec = decodeTrace(trace);
  if (!dec) return { code: 'no_trace' };
  if (dec.src === 'sim') return { code: 'simulator', dec };
  if (dec.t0 > now + AC.futureMs || dec.t0 < now - AC.maxAgeMs) return { code: 'stale', dec };
  if (looksSynthetic(dec.pts)) return { code: 'simulator', dec };
  const f = flagsOf(dec.pts, dec.src === 'ext' ? gapMs : phoneGapMs);
  if (f) return { code: f, dec };
  return { dec };
}

function passport(st, grade, src) {
  return { gpsQ: grade, src, hz: st.hz, avgAcc: st.avgAcc, n: st.n };
}
/** v118: паспорт зачёта C — метка всегда 'C' (класс источника), сырая оценка точности — в acq. */
function classC(st, grade, src) {
  return { ...passport(st, 'C', src), cls: 'c', acq: grade };
}

/** Круг. → { ok:true, tMs, sectors, dist, hash, pass } | { ok:false, code } */
export function verifyLap(body, trackId, now = Date.now()) {
  if (body?.how === 'manual') return { ok: false, code: 'manual_finish' };
  const cal = trackCal(trackId);
  if (!cal || !cal.calibrated) return { ok: false, code: 'track_uncalibrated' };
  const b = base(body?.trace, now, AC.lapGapMs, PHONE_RULE.lapGapMs);
  if (b.code) return { ok: false, code: b.code };
  const lap = lapFromTrace(b.dec.pts, cal);
  if (!lap.ok) return { ok: false, code: lap.code };
  if (lap.dist < cal.lenM * cal.tol[0] || lap.dist > cal.lenM * cal.tol[1]) return { ok: false, code: 'too_short' };
  const seg = b.dec.pts.filter((p) => p.t >= lap.startT - 1500 && p.t <= lap.endT + 1500);
  const st = traceStats(seg);
  const grade = gradeTrace(st);
  if (grade === 'C') return { ok: false, code: 'gps_c' };
  let pass;
  if (b.dec.src === 'ext') pass = { ...passport(st, grade, b.dec.src), cls: 'ab' };
  else {
    if (!(st.hz >= PHONE_RULE.minHz)) return { ok: false, code: 'low_hz' };
    pass = classC(st, grade, b.dec.src);
  }
  return { ok: true, tMs: lap.ms, sectors: lap.sectors, dist: Math.round(lap.dist), hash: traceHash(b.dec.pts), pass };
}

/**
 * Разгон/дистанция. bounds = { lo, hi } секунд.
 * v118: внешний ≥10 Гц → класс 'ab' (как раньше); телефон / внешний < 10 Гц → класс 'c' (зачёт C).
 * allowC=false — старое правило «только внешний ≥10 Гц» (коды phone_source / low_hz).
 * → { ok:true, t, hash, pass:{ gpsQ, cls, … } } | { ok:false, code }
 */
export function verifyDrag(body, disc, bounds, now = Date.now(), { allowC = true } = {}) {
  const b = base(body?.trace, now, AC.dragGapMs, PHONE_RULE.dragGapMs);
  if (b.code) return { ok: false, code: b.code };
  const t = dragTime(b.dec.pts, disc);
  if (t == null) return { ok: false, code: 'too_short' };
  if (bounds && t < bounds.lo) return { ok: false, code: 'speed_flag' };
  if (bounds && t > bounds.hi) return { ok: false, code: 'too_short' };
  const st = traceStats(b.dec.pts);
  const grade = gradeTrace(st);
  if (grade === 'C') return { ok: false, code: 'gps_c' };
  const hash = traceHash(b.dec.pts);
  if (b.dec.src === 'ext' && st.hz >= DRAG_TOP_MIN_HZ - 0.5) return { ok: true, t, hash, pass: { ...passport(st, grade, b.dec.src), cls: 'ab' } };
  if (!allowC) return { ok: false, code: b.dec.src !== 'ext' ? 'phone_source' : 'low_hz' };
  if (PHONE_RULE.noDiscs.includes(disc)) return { ok: false, code: 'phone_disc' };
  if (!(st.hz >= PHONE_RULE.minHz)) return { ok: false, code: 'low_hz' };
  return { ok: true, t, hash, pass: classC(st, grade, b.dec.src) };
}

/** Круг внутри комнаты на некалиброванной трассе: автокруг (не ручной), без флагов, A/B по точкам. */
export function verifyLapLoose(body, now = Date.now(), tMs = 0) {
  if (body?.how === 'manual') return { ok: false, code: 'manual_finish' };
  const b = base(body?.trace, now, AC.lapGapMs);
  if (b.code) return { ok: false, code: b.code };
  const st = traceStats(b.dec.pts);
  if (st.durMs < tMs - 2000) return { ok: false, code: 'too_short' };
  const grade = gradeTrace(st);
  if (grade === 'C') return { ok: false, code: 'gps_c' };
  return { ok: true, hash: traceHash(b.dec.pts), pass: passport(st, grade, b.dec.src) };
}
