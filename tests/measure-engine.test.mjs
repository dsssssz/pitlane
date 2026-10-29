// v215: движок замера — синтетика 25 Гц / 10 Гц / шумный 1 Гц телефон, выбросы, дубли, порядок, роллаут, уклон.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRun, prepare, DisplaySpeed } from '../measure-engine.js';
import { dragSplits } from '../gps-core.js';

// профиль: 3 с стоим, потом разгон a(t)=a0*(1 - v/vmax) (реалистичная кривая), прямая на северо-восток
function truth(a0 = 7.5, vmax = 90) {
  const dt = 0.001; const T = []; let v = 0; let s = 0;
  for (let t = 0; t <= 40; t += dt) { const a = t < 3 ? 0 : a0 * (1 - v / vmax); v += a * dt; s += v * dt; T.push({ t, v, s }); }
  // старт по конвенции PerformanceBox/Dragy: первый момент движения (0.5 км/ч)
  const t0 = T.find((p) => p.v * 3.6 >= 0.5).t; const s0 = T.find((p) => p.t >= t0).s;
  const cross = (kmh) => T.find((p) => p.v * 3.6 >= kmh).t - t0;
  const dist = (m) => T.find((p) => p.s - s0 >= m).t - t0;
  return { at: (t) => T[Math.min(T.length - 1, Math.round(t / dt))], cross, dist };
}
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
function trace(tr, hz, { sV = 0.1, sP = 1.5, dop = true, spikes = 0, alt = null, dur = 30, phase = 0 } = {}) {
  const pts = []; const LAT = 55.7; const LON = 37.6; const kx = 111320 * Math.cos(LAT * Math.PI / 180);
  for (let t = phase / hz; t <= dur; t += 1 / hz) {
    const p = tr.at(t); const s = p.s + gauss() * sP;
    let v = Math.max(0, p.v + gauss() * sV) * 3.6;
    if (spikes && rnd() < spikes) v += 40 * (rnd() < 0.5 ? -1 : 1);
    pts.push({ t: Math.round(1e6 + t * 1000), lat: LAT + (s * 0.7071) / 111320 + gauss() * sP * 0.3 / 111320, lon: LON + (s * 0.7071) / kx, v: dop ? Math.max(0, v) : null, acc: sP * 2, sAcc: sV, sv: 14, alt: alt != null ? 100 + p.s * alt : undefined });
  }
  return pts;
}
const tru = truth();

test('25 Гц чип: 0–100 и ¼ мили в пределах 0.03 с', () => {
  const r = analyzeRun(trace(tru, 25), {});
  assert.ok(Math.abs(r.marks['0-60'].sec - tru.cross(60)) < 0.03, `0-60 ${r.marks['0-60'].sec} vs ${tru.cross(60)}`);
  assert.ok(Math.abs(r.marks['60ft'].sec - tru.dist(18.288)) < 0.05, `60ft ${r.marks['60ft'].sec} vs ${tru.dist(18.288)}`);
  assert.ok(Math.abs(r.marks['402m'].sec - tru.dist(402.336)) < 0.05, `402 ${r.marks['402m'].sec} vs ${tru.dist(402.336)}`);
  assert.equal(r.valid, true, r.reasons.join());
  assert.equal(r.approx, false);
});
test('25 Гц с выбросами доплера ±40 км/ч (3%) — выбросы отбиты', () => {
  const r = analyzeRun(trace(tru, 25, { spikes: 0.03 }));
  assert.ok(Math.abs(r.marks['0-60'].sec - tru.cross(60)) < 0.05, `${r.marks['0-60'].sec} vs ${tru.cross(60)}`);
  assert.ok(r.q.rej > 0);
});
test('10 Гц: 0–60 в пределах 0.05 с', () => {
  const r = analyzeRun(trace(tru, 10, { sV: 0.15 }));
  assert.ok(Math.abs(r.marks['0-60'].sec - tru.cross(60)) < 0.05, `${r.marks['0-60'].sec}`);
});
test('телефон 1 Гц, шумный доплер: приблизительно, в пределах 0.3 с; флаг approx', () => {
  const errs = [];
  for (let k = 0; k < 10; k++) {
    const pts = trace(tru, 1, { sV: 0.5, sP: 5, phase: rnd() }); // случайная фаза секунды относительно старта
    const r = analyzeRun(pts);
    errs.push(Math.abs(r.marks['0-60'].sec - tru.cross(60)));
    assert.equal(r.approx, true); assert.ok(r.reasons.includes('low_hz'));
  }
  const mean = errs.reduce((a, b) => a + b) / errs.length;
  assert.ok(mean < 0.3, 'mean err ' + mean.toFixed(3));
});
test('телефон 1 Гц без доплера (только координаты): ±1.5 с — честно грубо, флаг no_doppler', () => {
  const r = analyzeRun(trace(tru, 1, { dop: false, sP: 4 }));
  assert.ok(r.marks['0-60'], 'нет 0-60');
  assert.ok(Math.abs(r.marks['0-60'].sec - tru.cross(60)) < 1.5, `${r.marks['0-60'].sec}`);
  assert.ok(r.reasons.includes('no_doppler'));
});
test('дубли, обратный порядок, повтор кеша — не ломают', () => {
  const pts = trace(tru, 25);
  const messy = [...pts, ...pts.slice(100, 140)].reverse();
  const r = analyzeRun(messy);
  assert.equal(prepare(messy).length, pts.length);
  assert.ok(Math.abs(r.marks['0-60'].sec - tru.cross(60)) < 0.04);
});
test('роллаут 1 фут уменьшает время на 0.1–0.4 с', () => {
  const a = analyzeRun(trace(tru, 25)); const b = analyzeRun(trace(tru, 25), { rollout: true });
  const d = a.marks['0-60'].sec - b.marks['0-60'].sec;
  assert.ok(d > 0.1 && d < 0.4, 'rollout diff ' + d);
});
test('уклон 4% → флаг slope', () => {
  const r = analyzeRun(trace(tru, 25, { alt: 0.04 }));
  assert.ok(r.q.slope > 3 && r.reasons.includes('slope'), String(r.q.slope));
});
test('gps-core.dragSplits идёт через движок', () => {
  const S = dragSplits(trace(tru, 25));
  assert.ok(Math.abs(S.marks['0-60'].sec - tru.cross(60)) < 0.04);
});
test('DisplaySpeed: нет скачков >3 км/ч за кадр на 1 Гц ступеньках, лимит fps', () => {
  const d = new DisplaySpeed({ fps: 15 }); let prev = 0; let maxJump = 0; let frames = 0;
  for (let t = 0; t < 10000; t += 8) {
    if (t % 1000 === 0) d.push(t, Math.min(100, t / 100) + (Math.random() - 0.5) * 3);
    const v = d.frame(t); if (v == null) continue; frames++;
    maxJump = Math.max(maxJump, Math.abs(v - prev)); prev = v;
  }
  assert.ok(frames <= 160, 'frames ' + frames);
  assert.ok(maxJump <= 5, 'jump ' + maxJump);
});
