// v160: фирменные моменты движения — пружинный прибор замера, полоса дельты, вход в сессию, прорисовка трассы, общие элементы, тактильные отклики.
import fs from 'fs';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x ?? '')); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const html = R('index.html'); const app = R('app.js'); const css = R('styles.css'); const sw = R('sw.js'); const mo = R('motion.js'); const shop = R('shop-ui.js');
const mc = css.slice(css.indexOf('/* ===== v160 MOTION'));
ok(/const CACHE = 'pitlane-v1(6\d|[7-9]\d)'/.test(sw) && /APP_VERSION = 'v1(6\d|[7-9]\d)'/.test(app) && /'v159', 'v160'[,)]/.test(app), 'версия ≥ v160');
ok(/'\.\/motion\.js'/.test(sw) && fs.statSync(new URL('motion.js', root)).size < 7000, 'motion.js в precache и маленький (< 7 КБ)');
ok(/import \{ spring, countUp, flyShared, drawIn, reduced as motionReduced \} from '\.\/motion\.js'/.test(app) && /import \{ flyShared \} from '\.\/motion\.js'/.test(shop), 'один модуль движения для приложения и магазина');
console.log('[производительность]');
ok(/raf = live\.size \? requestAnimationFrame\(loop\) : 0/.test(mo), 'один общий rAF, останавливается, когда ничего не движется');
{ const kf = [...mc.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\}\s*\}/g)].map((m) => m[1]); const props = kf.join(' ').match(/[\w-]+(?=\s*:)/g) || [];
  ok(kf.length >= 4 && props.every((p) => ['opacity', 'transform', 'stroke-dashoffset'].includes(p)), 'ключевые кадры — только opacity/transform (и dashoffset линии)', [...new Set(props)]); }
ok(/ghost\.animate\(\[\{ transform: 'none', opacity: 1 \}/.test(mo) && !/left|top|width|height/.test((mo.match(/ghost\.animate\(([\s\S]*?)\)\.finished/) || ['', 'x'])[1]), 'общий элемент летит transform-ом (WAAPI), без анимации размеров');
ok(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.ds-draw[^}]*\.lh60-in \*[^}]*animation: none !important/.test(mc) && /export const reduced = \(\) => !!\(mq && mq\.matches\) \|\| document\.documentElement\.classList\.contains\('q-low'\)/.test(mo), 'уважает «уменьшить движение» и слабые устройства (q-low)');
console.log('[пружина — математика]');
{ const q = []; globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; }; globalThis.document = { hidden: false, documentElement: { classList: { contains: () => false } } }; globalThis.performance = globalThis.performance || { now: () => Date.now() };
  const M = await import(new URL('motion.js', root));
  let x = 0, peak = 0; const s = M.spring({ k: 70, zeta: 0.72, value: 0, eps: 2e-4, onUpdate: (v) => { x = v; peak = Math.max(peak, v); } });
  s.set(1); let t = 0, frames = 0; while (q.length && frames < 600) { const f = q.shift(); t += 16.7; f(t); frames++; }
  ok(Math.abs(x - 1) < 1e-3, 'стрелка приходит в цель', x);
  ok(peak > 1.01 && peak < 1.1, 'лёгкий «живой» перелёт стрелки 1–10 %', peak.toFixed(3));
  ok(q.length === 0 && frames < 200, 'после остановки цикл rAF выключен (≈ ' + frames + ' кадров)', frames);
  let y = 0, py = 0; const b = M.spring({ k: 120, zeta: 1, onUpdate: (v) => { y = v; py = Math.max(py, v); } }); b.set(0.5); t = 0; while (q.length) { const f = q.shift(); t += 16.7; f(t); }
  ok(Math.abs(y - 0.5) < 1e-3 && py <= 0.5 + 1e-3, 'полоса дельты — без перелёта (ζ = 1)', py); }
console.log('[моменты]');
ok(/class: 'hgz-needle'/.test(app) && /spring\(\{ k: 70, zeta: 0\.72/.test(app) && /\.hgz-needle \{ stroke: var\(--ds-acc\)/.test(mc), 'прибор замера: стрелка + дуга на пружине между отсчётами GPS');
ok(/id="lh60Bar"/.test(html) && /function lh60Bar\(delta\)/.test(app) && /-delta \/ 2000/.test(app) && /\.lh60-bar\[data-tone="better"\] i \{ background: var\(--ds-good\); \}/.test(mc), 'полоса дельты ±2 с: быстрее — зелёный вправо, медленнее — красный влево');
ok(/function lh60Enter\(\)/.test(app) && /function lh58Start\(\) \{ lh60Enter\(\);/.test(app) && /\.lh60-in \.lh58-dv \{ animation: ds-num/.test(mc), 'кинематографичный вход в сессию');
ok(/pathLength="1"/.test(html) && /p\.setAttribute\('pathLength', '1'\)/.test(app) && /TK58\.drawn/.test(app) && /@keyframes ds-draw \{ to \{ stroke-dashoffset: 0; \} \}/.test(mc), 'контур трассы прорисовывается (карточки и мини-карта HUD)');
ok(/prev\.id === 'view-home' && id === 'garage'/.test(app) && /flyShared\(\{ el: fly60, rect: fly60r \}, document\.querySelector\('#view-garage \.g53-ph'\)/.test(app) && /const fly60r = fly60 \? fly60\.getBoundingClientRect\(\) : null/.test(app), 'общий элемент: машина Главной → подиум Гаража');
ok(/flyShared\(src, dst, \{ dur: 520, radius: 0 \}\)/.test(app) && /flyShared\(from, document\.querySelector\('#shopBody \.shop-gal-slide img'\)/.test(shop), 'общие элементы: трасса → HUD, фото товара → галерея');
ok(/function hap60\(kind\)/.test(app) && /hap60\('light'\)/.test(app) && /'success' : 'medium'/.test(app), 'тактильно: сектор — лёгкий, лучший круг — успех');
ok(/countUp\(v, val\.v\)/.test(app) && /\/:\\d\/\.test\(text\)/.test(mo), 'цифры статистики «досчитываются» при первом показе (время круга — без счёта)');
ok(!/text-shadow|drop-shadow|(?<!backdrop-filter: )blur\(|orange|#ff9|#30d158|0 0 \d+px|gradient\(/.test(mc), 'движение без свечения и градиентов');
console.log(fails ? `FAIL ${fails}` : 'OK v160'); process.exit(fails ? 1 : 0);
