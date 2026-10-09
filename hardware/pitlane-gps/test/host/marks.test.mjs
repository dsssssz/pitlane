// Сверка: отметки чипа (C++ marks.cpp через marks_cli) == JS-зеркало (tools/marks.mjs) == gps-core.js (сервер/Mini App).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createTracker } from '../../tools/marks.mjs';
import { makeRun, vKmhWire } from '../../tools/run-profile.mjs';
import { dragTime, withSpeed, launchTime, speedCross } from '../../../../gps-core.js';
const here = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const cpp = (pts) => execFileSync(path.join(here, 'build/marks_cli'), { input: pts.map((p) => `${p.t} ${vKmhWire(p)} ${p.fixOk ? 1 : 0}`).join('\n') + '\n' }).toString().trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const js = (pts) => { const tr = createTracker(); const out = []; for (const p of pts) out.push(...tr.feed(p.t, vKmhWire(p), p.fixOk)); return out; };
const core = (pts) => pts.map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, v: Math.round(p.v * 100) / 100 * 3.6, acc: p.hAcc }));
const core0300 = (pts) => { const p = withSpeed(core(pts)); const t0 = launchTime(p); const from = p.findIndex((q) => q.t >= t0); const b = speedCross(p, 300, Math.max(1, from)); return b ? Math.round(b.t - t0) : null; };
const near = (a, b, tol = 1) => a != null && b != null && Math.abs(a - b) <= tol;

function check(name, opts, expect) {
  console.log(`\n[${name}]`);
  const pts = makeRun(opts);
  const c = cpp(pts); const j = js(pts);
  const marksOf = (ev) => Object.fromEntries(ev.filter((e) => e.e === 'mark').map((e) => [e.k, e.ms]));
  const mc = marksOf(c); const mj = marksOf(j);
  ok(JSON.stringify(c.map((e) => e.e)) === JSON.stringify(j.map((e) => e.e)), 'C++ и JS: одинаковая последовательность событий ' + c.map((e) => e.e + (e.k ? ':' + e.k : '')).join(' '), j.map((e) => e.e));
  for (const k of ['0-100', '0-200', '0-300']) if (mc[k] != null || mj[k] != null) ok(near(mc[k], mj[k]), `${k}: C++ ${mc[k]} = JS ${mj[k]} мс`);
  const s100 = dragTime(core(pts), '0-100'); const s200 = dragTime(core(pts), '0-200'); const s300 = core0300(pts);
  if (expect.has100) ok(near(mc['0-100'], s100 * 1000), `0-100 чип ${mc['0-100']} мс = gps-core ${s100 * 1000} мс (сервер/приложение)`);
  if (expect.has200) ok(near(mc['0-200'], s200 * 1000), `0-200 чип ${mc['0-200']} = gps-core ${s200 * 1000}`);
  if (expect.has300) ok(near(mc['0-300'], s300), `0-300 чип ${mc['0-300']} = gps-core(launchTime+speedCross) ${s300}`);
  if (!expect.has300) ok(mc['0-300'] == null, '0-300 не достигнуто — отметки нет');
  const end = c.find((e) => e.e === 'end');
  ok(!!end, 'итог («начал сбавлять») есть');
  if (end) {
    const peakAt = pts.reduce((a, p) => (vKmhWire(p) > vKmhWire(a) ? p : a), pts[0]);
    const lag = end.at - peakAt.t;
    ok(lag > 0 && lag < (expect.maxEndLagMs || 1600), `итог через ${lag} мс после пика ${vKmhWire(peakAt).toFixed(1)} км/ч`);
    ok(near(end.m[0], mc['0-100']) && (expect.has300 ? near(end.m[2], mc['0-300']) : end.m[2] === 0), 'итог несёт те же отметки');
    const marksAfter = c.filter((e) => e.e === 'mark' && e.at > end.at);
    ok(!marksAfter.length, 'после итога отметок нет');
  }
  const launch = c.find((e) => e.e === 'launch');
  ok(!!launch && c.indexOf(launch) < c.findIndex((e) => e.e === 'mark'), 'старт раньше первой отметки');
  return { c, pts };
}

check('25 Гц, 0–305 км/ч, переключения −2.5 км/ч', { hz: 25, vmax: 305, seed: 3 }, { has100: true, has200: true, has300: true });
check('10 Гц, 0–215 км/ч (300 нет)', { hz: 10, vmax: 215, seed: 11 }, { has100: true, has200: true, has300: false });
check('25 Гц, переключения −4 км/ч на 250+ — не «итог»', { hz: 25, vmax: 300.5, seed: 5, shiftDipKmh: 4 }, { has100: true, has200: true, has300: true });
check('25 Гц, сразу тормоз', { hz: 25, vmax: 180, seed: 9, brake: 'brake' }, { has100: true, has200: false, has300: false, maxEndLagMs: 700 });

console.log('\n[тронулся и встал, потом настоящий разгон]');
{
  const a = makeRun({ hz: 25, vmax: 40, seed: 2, tailS: 2 });
  const b = makeRun({ hz: 25, vmax: 120, seed: 4, t0: a.at(-1).t + 40 });
  // первый «разгон» до 40 без отметки 100: ок, чип его закрывает через abort или итог (пик ≥ 30)
  const all = [...a, ...b]; const c = cpp(all); const j = js(all);
  ok(JSON.stringify(c.map((e) => e.e + (e.k || ''))) === JSON.stringify(j.map((e) => e.e + (e.k || ''))), 'C++ = JS: ' + c.map((e) => e.e + (e.k ? ':' + e.k : '')).join(' '));
  const m = c.filter((e) => e.e === 'mark');
  ok(m.length === 1 && m[0].k === '0-100' && near(m[0].ms, dragTime(core(b), '0-100') * 1000), `0–100 второго разгона ${m[0]?.ms} мс = gps-core по его точкам`);
}
console.log('\n[без фикса]');
{
  const pts = makeRun({ hz: 25, vmax: 150, seed: 8 }).map((p) => ({ ...p, fixOk: false }));
  ok(cpp(pts).length === 0 && js(pts).length === 0, 'без фикса событий нет');
}
console.log(fails ? `\n✗ ${fails} failed` : '\n✓ marks: all passed');
process.exit(fails ? 1 : 0);
