// v169: candy-полировка — жидкое стекло, пружинное нажатие, появление при скролле, смахивание шторок, тост, хит-зоны точек, отсвет пола от краски.
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js');
ok(/const APP_VERSION = 'v1(69|[7-9]\d)'/.test(app) && /const CACHE = 'pitlane-v1(69|[7-9]\d)'/.test(sw) && /'v168', 'v169'/.test(app), 'версия v169');
ok(/\.nav3 \{ background: rgba\(10,10,10,\.72\)[^}]*saturate\(1\.5\)/.test(css) && /\.brand-bar \{[^}]*rgba\(10,10,10,\.7\)[^}]*saturate\(1\.5\)/.test(css), 'жидкое стекло на шапке/навигации (размытие только у них — ради iPhone)');
ok(/scale: \.965/.test(css) && /cubic-bezier\(\.34,1\.56,\.64,1\)/.test(css), 'пружинное нажатие через scale (не ломает transform)');
ok(/@supports \(animation-timeline: view\(\)\)/.test(css) && /prefers-reduced-motion: no-preference/.test(css), 'появление при скролле только где поддерживается и без reduced-motion');
ok(/function sheetDrag169\(\)/.test(app) && /\.ds-sheet-x/.test(app), 'шторки смахиваются вниз через существующую кнопку закрытия');
ok(/\.bn52-dot::after/.test(css) && /top: -13px; bottom: -13px/.test(css), 'хит-зона точек карусели ≥ 28px');
ok(/function showroomTint\(hex\)/.test(app) && (app.match(/showroomTint\(/g) || []).length >= 3, 'отсвет пола шоурума берёт оттенок краски');
ok(!/255,180,67/.test(css.split('v169')[1] || ''), 'тост без оранжевой рамки');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v169 OK');
