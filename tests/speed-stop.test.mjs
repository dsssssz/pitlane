// v195/v196: симуляция iOS-потока для спидометра телефона (GpsFusion из app.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const APP = process.env.APP_JS || new URL('../app.js', import.meta.url);
const src = fs.readFileSync(APP, 'utf8');
const a = src.indexOf('const GpsFusion = (() => {');
const b = src.indexOf('\n})();', a) + 6;
function mk() {
  const ctx = { Date, Math, Number, console };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nthis.F = GpsFusion;', ctx);
  return ctx.F;
}
const LAT = 55.75, LON = 37.6, MD = 111320, ML = 111320 * Math.cos(LAT * Math.PI / 180);

/**
 * prof(t) → скорость м/с; opt.fix(t, v) → null (нет точки) | 'repeat' | {acc, sp}; шаг точек 1 с (или opt.hz).
 * Возвращает показ на экране (rAF 50 мс) рядом с истинной скоростью.
 */
export function sim(prof, dur, opt = {}) {
  const F = mk(); F.reset();
  let seed = opt.seed || 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const t0 = 1e9, dtFix = 1000 / (opt.hz || 1);
  let x = 0, last = null, nextFix = 0; const out = [];
  for (let ms = 0; ms <= dur * 1000; ms += 50) {
    const v = prof(ms / 1000); x += v * 0.05;
    if (ms >= nextFix) {
      nextFix += dtFix;
      const f = opt.fix ? opt.fix(ms / 1000, v) : {};
      if (f === 'repeat') { if (last) F.ingestGps(last, t0 + ms, t0 + ms); }
      else if (f) {
        const stopped = v < 0.05;
        const acc = f.acc ?? (stopped ? 12 : 6);
        const jit = f.jit ?? (stopped ? 5 : 2);
        const sp = f.sp !== undefined ? f.sp : (v < 3 ? -1 : v + rnd() * 0.3); // iOS: на малой скорости/стоянке speed=-1
        last = { latitude: LAT + (x + rnd() * jit) / MD, longitude: LON + rnd() * jit / ML, accuracy: acc, speed: sp, heading: 90 };
        F.ingestGps(last, t0 + ms, t0 + ms);
      }
    }
    F.tick(t0 + ms);
    out.push({ t: ms / 1000, v: v * 3.6, k: F.displayKmhAt(t0 + ms), timing: F.getState().vKmh });
  }
  return out;
}
/** время до «0 на экране» от каждой физической остановки (0 должен держаться до начала движения) */
function zeroDelays(o) {
  const res = []; let stopAt = null;
  for (let i = 0; i < o.length; i++) {
    const s = o[i];
    if (s.v < 0.05 && stopAt == null && (i === 0 || o[i - 1].v >= 0.05)) stopAt = s.t;
    if (s.v >= 0.05) stopAt = null;
    if (stopAt != null && s.v < 0.05) {
      // первый момент, начиная с которого до конца стоянки на экране 0
      let j = i; while (j < o.length && o[j].v < 0.05) j++;
      let z = null; for (let q = j - 1; q >= i && Math.round(o[q].k) === 0; q--) z = o[q].t;
      res.push(z == null ? Infinity : Math.max(0, z - stopAt)); stopAt = null; i = j - 1;
    }
  }
  return res;
}
const mae = (o, f) => { const s = o.filter(f); return s.reduce((p, x) => p + Math.abs(x.k - x.v), 0) / s.length; };
const sd = (o, f) => { const s = o.filter(f).map((x) => x.k); const m = s.reduce((p, x) => p + x, 0) / s.length; return Math.sqrt(s.reduce((p, x) => p + (x - m) ** 2, 0) / s.length); };

// профили
const brake60 = (t) => (t < 20 ? 16.67 : Math.max(0, 16.67 - 3 * (t - 20)));
function cityProf(t) { // маршрутка: 5 циклов «разгон 2 м/с² до 50 → 10 с едем → торможение 2.5 → стоим 15 с»
  const c = t % 45; const V = 13.9;
  if (c < 7) return Math.min(V, 2 * c);
  if (c < 17) return V;
  if (c < 22.6) return Math.max(0, V - 2.5 * (c - 17));
  return 0;
}

export const R = {};
const SC = {
  'Стоп: speed=-1, дрожание ±5 м': () => { const o = sim(brake60, 80); return { zero: Math.max(...zeroDelays(o)) }; },
  'Стоп: iOS перестал слать точки': () => { const o = sim(brake60, 80, { fix: (t, v) => (t >= 20 && v < 6 ? null : {}) }); return { zero: Math.max(...zeroDelays(o)) }; },
  'Стоп: кеш-повторы старой точки': () => { const o = sim(brake60, 80, { fix: (t, v) => (t >= 20 && v < 6 ? 'repeat' : {}) }); return { zero: Math.max(...zeroDelays(o)) }; },
  'Стоп: точность 65 м': () => { const o = sim(brake60, 80, { fix: (t, v) => (v < 0.05 ? { acc: 65 } : {}) }); return { zero: Math.max(...zeroDelays(o)) }; },
  'Маршрутка 5 остановок (худший 0)': () => {
    const o = sim(cityProf, 225, { fix: (t, v) => (v < 4 && Math.floor(t) % 2 ? null : {}) });
    return { zero: Math.max(...zeroDelays(o)), mae: mae(o, (s) => s.v > 5) };
  },
  'Тоннель 10 с на 60': () => {
    const o = sim((t) => 16.67, 40, { fix: (t) => (t >= 15 && t < 25 ? null : {}) });
    const tun = o.filter((s) => s.t >= 15 && s.t < 25);
    return { tunnelMin: Math.min(...tun.map((s) => s.k)), mae: mae(o, (s) => s.t >= 15 && s.t < 28) };
  },
  'Постоянные 60': () => { const o = sim((t) => 16.67, 40); return { mae: mae(o, (s) => s.t > 5), sd: sd(o, (s) => s.t > 5) }; },
  'Разгон 0→100, 1 Гц (экран)': () => {
    const o = sim((t) => (t < 2 ? 0 : Math.min(27.78, 4 * (t - 2))), 15);
    const hit = o.find((s) => s.k >= 100); return { lag100: hit ? hit.t - 2 - 6.944 : Infinity, mae: mae(o, (s) => s.t > 2.5 && s.t < 9) };
  },
  'Разгон 0→100, 10 Гц (замер)': () => {
    const o = sim((t) => (t < 2 ? 0 : Math.min(27.78, 4 * (t - 2))), 12, { hz: 10, fix: () => ({ acc: 5, jit: 0.2 }) });
    const hit = o.find((s) => s.timing >= 100); return { t100: hit ? hit.t - 2 : Infinity };
  },
};
for (const [name, fn] of Object.entries(SC)) {
  test(name, () => {
    const r = fn(); R[name] = r;
    console.log('RES', JSON.stringify({ name, ...r }));
    if ('zero' in r) assert.ok(r.zero <= 3, 'ноль через ' + r.zero);
    if ('tunnelMin' in r) assert.ok(r.tunnelMin > 50, 'тоннель ' + r.tunnelMin);
    if ('sd' in r) assert.ok(r.sd < 1, 'дрожание ' + r.sd);
    if ('t100' in r) assert.ok(Math.abs(r.t100 - 6.944) < 0.25, 't100 ' + r.t100);
  });
}
