// v171: большой заголовок сворачивается в стеклянную шапку, параллакс машины, скелетоны вместо «Загружаем…».
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js');
ok(/const APP_VERSION = 'v1(7[1-9]|[89]\d)'/.test(app) && /const CACHE = 'pitlane-v1(7[1-9]|[89]\d)'/.test(sw) && /'v170', 'v171'/.test(app), 'версия v171');
ok(/function collapse171\(\)/.test(app) && /\.brand-bar\.bb-t-on \.bb-title \{ opacity: 1/.test(css), 'заголовок экрана сворачивается в шапку');
ok(!/\.brand-bar \{ position: relative; \}/.test(css), 'шапка остаётся sticky (не перебита position: relative)');
ok(/--px171/.test(app) && /translate: 0 var\(--px171/.test(css), 'параллакс через translate (не ломает transform)');
ok(/function skel171\(/.test(app) && (app.match(/skel171\(\d/g) || []).length >= 4 && !/'Загружаем дуэли…'/.test(app), 'скелетоны вместо «Загружаем…»');
ok(/\.pl-skel-row \{ height: 64px; border-radius: var\(--r2\)/.test(css), 'скелетон в радиусах дизайн-системы');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v171 OK');
