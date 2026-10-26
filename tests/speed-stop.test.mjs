// v195: iOS-поток в маршрутке: 60 км/ч → стоп, speed=-1, дрожание ±5 м, редкие точки → спидометр должен упасть в 0 за ≤3 с
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const a = src.indexOf('const GpsFusion = (() => {');
const b = src.indexOf('\n})();', a) + 6;
function mk() {
  const ctx = { Date, Math, Number, console };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nthis.F = GpsFusion;', ctx);
  return ctx.F;
}
const LAT = 55.75, LON = 37.6, MD = 111320, ML = 111320 * Math.cos(LAT * Math.PI / 180);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

/** stopMode: 'neg' speed=-1 + jitter; 'silent' — точки перестают приходить; 'sparse' — точки раз в 3 с */
function run(stopMode, { v0 = 60 / 3.6, dopplerWhileMoving = true } = {}) {
  const F = mk(); F.reset(); seed = 7;
  let x = 0, t = 1e9, v = v0; const fixes = [];
  // 20 с езды 60 км/ч, затем торможение 3 м/с² до 0, затем стоянка 60 с
  for (let tt = 0; tt < 90; tt += 1) {
    const T = t + tt * 1000;
    const stopT = 20 + v0 / 3;
    let vel;
    if (tt < 20) vel = v0; else if (tt < stopT) vel = Math.max(0, v0 - 3 * (tt - 20)); else vel = 0;
    x += vel;
    const stopped = tt >= stopT;
    if (stopMode === 'silent' && tt >= 20 && vel < 6) continue; // iOS перестал слать точки ещё на торможении (~20 км/ч)
    if (stopMode === 'repeat' && tt >= 20 && vel < 6) { fixes.push({ ...fixes[fixes.length - 1], T }); continue; } // опрос отдаёт старый закешированный фикс
    if (stopped && stopMode === 'sparse' && Math.round(tt) % 3) continue;
    const jit = stopped ? 5 : 2;
    const sp = (stopped || vel < 3) ? -1 : (dopplerWhileMoving ? vel + rnd() * 0.3 : -1); // iOS: на малой скорости/стоянке speed=-1
    fixes.push({ T, stopped, vel, c: { latitude: LAT + (x + rnd() * jit) / MD, longitude: LON + rnd() * jit / ML, accuracy: stopped ? (stopMode === 'badacc' ? 65 : 12) : 6, speed: sp, heading: 90 } });
  }
  const STOP_T = t + Math.ceil(20 + v0 / 3) * 1000; // физическая остановка
  // реальное время: rAF каждые 50 мс
  let i = 0, stopAt = null, zeroAt = null, maxK = 0, cruise = [];
  const end = t + 90000;
  for (let now = fixes[0].T; now < end; now += 50) {
    while (i < fixes.length && fixes[i].T <= now) { F.ingestGps(fixes[i].c, fixes[i].T, fixes[i].T); i++; }
    if (stopAt == null && now >= STOP_T) stopAt = STOP_T;
    F.tick(now);
    const k = F.displayKmhAt(now);
    maxK = Math.max(maxK, k);
    if (now - fixes[0].T > 8000 && now - fixes[0].T < 19000) cruise.push(k);
    if (stopAt != null && now >= stopAt && zeroAt == null && Math.round(k) === 0) zeroAt = now;
    if (stopAt != null && zeroAt != null && Math.round(k) !== 0) zeroAt = null; // ноль должен держаться
  }
  return { zeroS: zeroAt == null ? Infinity : (zeroAt - stopAt) / 1000, maxK, cruiseAvg: cruise.reduce((s, v) => s + v, 0) / cruise.length };
}

for (const mode of ['neg', 'silent', 'repeat', 'sparse', 'badacc']) {
  test(`стоп (${mode}): 0 за ≤3 с, круиз 60 точный`, () => {
    const r = run(mode);
    console.log(mode, 'ноль через', r.zeroS.toFixed(2), 'с; круиз', r.cruiseAvg.toFixed(1), 'макс', r.maxK.toFixed(1));
    assert.ok(r.zeroS <= 3, 'zero ' + r.zeroS);
    assert.ok(Math.abs(r.cruiseAvg - 60) < 1.5);
    assert.ok(r.maxK < 63.5);
  });
}
test('без доплера (speed=-1 всегда, по смещению): круиз не обнуляется, стоп ≤3 с', () => {
  const r = run('neg', { dopplerWhileMoving: false });
  console.log('nodoppler ноль через', r.zeroS.toFixed(2), 'круиз', r.cruiseAvg.toFixed(1));
  assert.ok(r.zeroS <= 3); assert.ok(Math.abs(r.cruiseAvg - 60) < 4);
});
test('разгон 0→100 по доплеру не тормозится фильтром', () => {
  const F = mk(); F.reset(); let x = 0; const t0 = 1e9; let hit = null;
  for (let k = 0; k <= 120; k++) { // 10 Гц, 4 м/с²
    const T = t0 + k * 100; const v = Math.min(4 * k / 10, 30); x += v / 10;
    F.ingestGps({ latitude: LAT + x / MD, longitude: LON, accuracy: 5, speed: v, heading: 0 }, T, T);
    if (hit == null && F.getState().vKmh >= 100) hit = (T - t0) / 1000;
  }
  console.log('0-100 факт 6.94 с, фильтр', hit);
  assert.ok(hit != null && Math.abs(hit - 6.94) < 0.25);
});
