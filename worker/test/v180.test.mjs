// v180: баннеры на Главной листаются сами — 5 с, переход 300 мс, по кругу, паузы, reduced-motion, прогресс на точке.
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const sw = rd('sw.js'); const css = rd('styles.css');
ok(/const APP_VERSION = 'v1(8\d|9\d)'/.test(app) && /const CACHE = 'pitlane-v1(8\d|9\d)'/.test(sw) && /'v179', 'v180'/.test(app), 'версия v180');
const a = app.indexOf('const BN_MS = 5000'); const blk = app.slice(a, a + 6000);
ok(a > 0 && /BN_TW = 300/.test(blk) && /BN_RESUME = 4000/.test(blk), '5 с на баннер, переход 300 мс, пауза 4 с после касания');
ok(/\(i \+ slides\.length\) % slides\.length/.test(blk) && /go\(cur \+ 1\)/.test(blk), 'по кругу');
ok(/!reduce && !touching/.test(blk) && /document\.hidden/.test(blk) && /onScreen/.test(blk) && /homeActive\(\)/.test(blk), 'пауза: касание, вкладка скрыта, вне экрана, не Главная, reduced-motion');
ok(/IntersectionObserver/.test(blk) && /visibilitychange/.test(blk), 'наблюдатели видимости');
ok(/offsetLeft - slides\[0\]\.offsetLeft/.test(blk) && !/offsetWidth \+ 12/.test(blk), 'позиции из offsetLeft (старый шаг +12 px сбивал индекс)');
ok(!/setInterval\(\(\) => \{\s*if \(paused/.test(app), 'старый setInterval 6 с убран');
ok(/\.bn52-track\.bn80-tw \{ scroll-snap-type: none/.test(css) && /@keyframes bn80p \{ from \{ transform: scaleX\(0\); \} to \{ transform: scaleX\(1\); \} \}/.test(css) && /bn80p 5000ms linear/.test(css), 'прогресс на активной точке (только transform), snap выключен на время перехода');
ok(/prefers-reduced-motion: reduce\) \{ html\.v159:not\(#_\):not\(#_\) \.bn52-dot\.on::before \{ animation: none/.test(css), 'reduced-motion: без анимации прогресса');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v180 OK');
