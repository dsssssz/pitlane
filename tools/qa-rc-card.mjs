// QA: чек заезда — синтетический трек через gps-core в node, карточка открывается в странице через window.__rc287.open. Использование: node tools/qa-rc-card.mjs <url> <outdir>
import { chromium } from 'playwright';
import fs from 'fs';
import { dragSplits } from '../gps-core.js';
import { shareCurve } from '../run-marks.js';
const [url = 'http://localhost:8787/', out = '/tmp'] = process.argv.slice(2);
const hz = 25, pts = [], t0 = Date.now() - 20000; let d = 0;
for (let i = 0; i < hz * 16; i++) { const t = i / hz; const v = t < 1 ? 0 : Math.min(212, 262 * (1 - Math.exp(-(t - 1) / 7.2))); d += v / 3.6 / hz; pts.push({ seq: i, t: t0 + t * 1000, lat: 45 + d / 111000, lon: 39, v, acc: 0.9, src: 'ext', sAcc: 0.2, sv: 14 }); }
const S = dragSplits(pts, undefined, {});
const ORDER = ['0-50', '0-60', '0-100', '80-120', '0-200', '100-200', '0-300', '200-300', '60ft', '201m', '402m'];
const splits = ORDER.filter((k) => S.marks[k]).map((k) => { const m = S.marks[k]; return { k, sec: +m.sec.toFixed(2), v: Math.round(m.v), d: (k.startsWith('0-') || /ft|m$/.test(k)) ? Math.round(m.d) : null }; });
const rc = { demo: true, at: Date.now(), car: 'BMW M2 (G87)', tyre: 'Michelin Pilot Sport 4S', cls: 'Stage 1 · уличные', splits, vmax: Math.round(S.vmax), dist: Math.round(S.dist), curve: shareCurve(pts, S),
  gps: { src: 'ext', hz: 25, acc: 0.9, sv: 14, slope: null, q: 'A' }, wx: { t: 12, ws: 3, hw: 2 }, ver: true, stamp: { code: '7K3Q9WMD', disc: '0-100', t: splits.find((s) => s.k === '0-100').sec, car: 'BMW M2 (G87)', src: 'chip', cls: 'A', at: Date.now() } };
const b = await chromium.launch();
for (const [w, h, n] of [[390, 844, 'live-card'], [375, 667, 'live-card-se']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(3000);
  await p.evaluate((rc) => window.__rc287.open(rc), rc); await p.waitForTimeout(800);
  const fit = await p.evaluate(() => { const c = document.querySelector('.rc-card').getBoundingClientRect(); return [Math.round(c.bottom), Math.round(document.querySelector('.rc-bar').getBoundingClientRect().top), !!document.querySelector('.rc-logo'), typeof window.__rc287.demo]; });
  console.log(n, 'cardBottom/barTop/logo/demo', fit, errs);
  await p.screenshot({ path: `${out}/${n}.png` });
  if (n === 'live-card') { const u = await p.evaluate(async () => (await window.__rc287.canvas(window.__rc287.cur())).toDataURL('image/png')); fs.writeFileSync(`${out}/share-export.png`, Buffer.from(u.split(',')[1], 'base64')); }
  await p.close();
}
await b.close();
