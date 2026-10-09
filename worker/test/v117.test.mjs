// v117: одна правда для отметок разгона (живой экран = итог = сервер) + график на шейр-карточке — node test/v117.test.mjs
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { dragTime, dragSplits, DRAG_DEFS, withSpeed, launchTime, distCross, haversineM } from '../../gps-core.js';
import { createRunMarks, stepRunMarks, shareCurve, shareSplits, cleanCurve, cleanSplits, elevation, speedSeries, chartTags } from '../../run-marks.js';
import { makeRun, vKmhWire } from '../../hardware/pitlane-gps/tools/run-profile.mjs';
const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };
const close = (a, b, eps = 0.0005) => a != null && b != null && Math.abs(a - b) <= eps;

const asApp = (run) => run.map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, v: vKmhWire(p), acc: p.hAcc }));
const profiles = {
  'PITLANE GPS 25 Гц (эмулятор)': asApp(makeRun({ hz: 25, t0: 1.79e12 })),
  'PITLANE GPS 10 Гц': asApp(makeRun({ hz: 10, t0: 1.79e12, seed: 3, vmax: 240 })),
  'шумный 25 Гц, другой seed': asApp(makeRun({ hz: 25, t0: 1.79e12, seed: 99, vmax: 210 })),
  // телефон: 1 Гц без доплера (скорость по координатам) — у последней точки скорость «односторонняя»
  'телефон 1 Гц без доплера': asApp(makeRun({ hz: 25, t0: 1.79e12, seed: 5, vmax: 180 })).filter((_, i) => i % 25 === 0).map((p) => ({ ...p, v: null })),
};

console.log('[живые отметки = итог = сервер]');
for (const [name, pts] of Object.entries(profiles)) {
  const st = createRunMarks();
  const live = {};
  for (let n = 2; n <= pts.length; n++) {
    const { S, fresh } = stepRunMarks(st, pts.slice(0, n));
    for (const k of fresh) live[k] = S.marks[k].sec;
  }
  const fin = dragSplits(pts);
  const keys = Object.keys(fin.marks);
  ok(keys.length >= 5, `${name}: отметок ${keys.length}`);
  ok(keys.every((k) => close(live[k], fin.marks[k].sec)), `${name}: живое значение каждой отметки = итоговому (${keys.map((k) => `${k} ${live[k]}/${fin.marks[k].sec}`).join(', ')})`);
  ok(Object.keys(DRAG_DEFS).every((d) => close(dragTime(pts, d), fin.marks[d]?.sec ?? null) || (dragTime(pts, d) == null && !fin.marks[d])), `${name}: итог = dragTime сервера по всем дисциплинам`);
}

console.log('[60 ft: причина расхождения v116]');
{
  const pts = profiles['PITLANE GPS 25 Гц (эмулятор)'];
  const fin = dragSplits(pts);
  const m = fin.marks['60ft'];
  ok(close(m.sec, 2.052), `60 ft по сырому треку = ${m.sec} с (как итог v116 2.05)`);
  ok(m.v > 60 && m.sec > fin.marks['0-60'].sec, `60 ft (${Math.round(m.v)} км/ч) позже 0–60 (${fin.marks['0-60'].sec} с) — порядок физичен`);
  // v116: живой экран считал дистанцию сам (смесь ∫v и хаверсина по шумным координатам от момента 8 км/ч).
  // Шум координат (±0.25 м на точку × 25 Гц) раздувает хаверсин → 18.288 м «наступали» раньше, чем в сыром треке;
  // dragTime в этот момент ещё возвращал null, и показывался запасной живой расчёт.
  const P = withSpeed(pts); const t0 = launchTime(P);
  let dist = 0; let launched = false; let prev = null; let legacyT = null;
  for (const q of P) {
    if (!launched) { if (q.v >= 8) launched = true; prev = q; continue; }
    const dt = (q.t - prev.t) / 1000;
    const step = 0.62 * (q.v / 3.6) * dt + 0.38 * haversineM(prev, q);
    if (dist < 18.288 && dist + step >= 18.288) legacyT = prev.t + (q.t - prev.t) * ((18.288 - dist) / step);
    dist += step; prev = q;
    if (legacyT) break;
  }
  const rawAt = distCross(P, 18.288, t0);
  ok(legacyT != null && rawAt != null && legacyT !== rawAt, `старый живой путь давал другое время пересечения 60 ft (${((legacyT - t0) / 1000).toFixed(3)} с против ${((rawAt - t0) / 1000).toFixed(3)} с) — теперь его нет`);
}

console.log('[график и шейр]');
{
  const pts = profiles['PITLANE GPS 25 Гц (эмулятор)'];
  const S = dragSplits(pts);
  const c = shareCurve(pts, S);
  ok(c && c.v.length === 48 && c.s > 20 && Math.max(...c.v) >= 295, `кривая для шейра: 48 точек, ${c?.s} с, пик ${Math.max(...(c?.v || [0]))} км/ч`);
  ok(JSON.stringify(c).length < 400, 'кривая компактная (< 400 байт)');
  const sp = shareSplits(S);
  ok(close(sp['60ft'][0], S.marks['60ft'].sec) && sp['402m'][1] > 200, 'отметки шейра = dragSplits');
  ok(cleanCurve({ s: 9, v: [0, 'x'] }) === null && cleanCurve({ s: 9, v: [0, 600] }) === null && cleanCurve({ s: 999, v: [0, 1] }) === null, 'недоверенная кривая отбрасывается');
  ok(Object.keys(cleanSplits({ '0-100': [3.7, 101], evil: [1, 2], '60ft': ['<b>', 3] })).join() === '0-100', 'недоверенные отметки фильтруются');
  const ser = speedSeries(pts, S.t0, 300);
  ok(ser.length <= 300 && ser[0].x >= 0 && Math.abs(Math.max(...ser.map((p) => p.v)) - S.vmax) < 0.5, `серия графика прорежена (${ser.length} точек) и сохраняет пик`);
  ok(elevation(pts, S.t0, S.tEnd, S.dist) === null, 'нет высоты в точках → уклон не выдумываем (null)');
  const withAlt = pts.map((p, i) => ({ ...p, alt: 100 + (i / pts.length) * 8 }));
  const el = elevation(withAlt, S.t0, S.tEnd, S.dist);
  ok(el && el.dAlt > 3 && el.slope > 0, `есть высота → перепад ${el?.dAlt} м, уклон ${el?.slope}%`);
  const tags = chartTags(S.marks);
  ok(tags.length === 5 && tags[0].x < tags[tags.length - 1].x, 'бирки графика упорядочены по времени');
}

console.log('[сервер: кривая и отметки на карточке]');
{
  const kv = new MemKV(); const env = { PITLANE: kv, SMS_DEMO: '1' };
  const call = async (method, path, body) => {
    const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.17.0.' + Math.floor(Math.random() * 200) }, body: body ? JSON.stringify(body) : undefined }), env);
    const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: res.status, data: d };
  };
  let r = await call('POST', '/share', { payload: { car: 'BMW', type: '0-100', time: '3.73 с', curve: { s: 27.5, v: [0, 50.4, 100, 200, 300] }, splits: { '0-100': [3.728, 100.2], '60ft': [2.052, 62], hack: [1, 1], '402m': [11.35, 9999] }, lat: 55.1, trace: [1] } });
  ok(r.status === 200 && r.data.id, 'POST /share ок');
  const p = ((x) => x.payload || x)((await call('GET', '/share/' + r.data.id)).data);
  ok(p.curve && p.curve.s === 27.5 && p.curve.v.join() === '0,50,100,200,300', 'кривая сохранена и округлена');
  ok(p.splits && Object.keys(p.splits).sort().join() === '0-100,60ft' && p.splits['0-100'][0] === 3.728, 'отметки по белому списку, мусор и > 500 км/ч отброшены');
  ok(!('lat' in p) && !('trace' in p), 'координат / трека на карточке нет');
  r = await call('POST', '/share', { payload: { car: 'BMW', type: '0-100', curve: { s: 5, v: Array(65).fill(1) }, splits: [1, 2] } });
  const p2 = ((x) => x.payload || x)((await call('GET', '/share/' + r.data.id)).data);
  ok(!p2.curve && !p2.splits, 'слишком длинная кривая / не-объект отметок — не сохраняются');
  r = await call('POST', '/share', { payload: { car: 'BMW', type: 'lap', time: '2:00.00', curve: { s: 5, v: [1, 2] } } });
  const p3 = ((x) => x.payload || x)((await call('GET', '/share/' + r.data.id)).data);
  ok(!p3.curve, 'у круга кривой разгона нет');
}

if (fails) { console.log(`\n✗ v117: ${fails} failed`); process.exit(1); }
console.log('\n✓ v117 all passed');
