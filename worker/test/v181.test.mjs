// v181: немного карбона — 2/2 саржа SVG-плиткой, 4 места, без свечения/градиентов, лёгкая.
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const sw = rd('sw.js'); const css = rd('styles.css'); const svg = rd('img/carbon-twill.svg');
ok(/const APP_VERSION = 'v1(8[1-9]|9\d)'/.test(app) && /const CACHE = 'pitlane-v1(8[1-9]|9\d)'/.test(sw) && /'v180', 'v181'/.test(app), 'версия v181');
ok(svg.length < 3000 && !/gradient|filter|<image/i.test(svg) && /fill="#fff"/.test(svg), 'плитка: <3 КБ, плоские прямоугольники, без градиента/фильтра');
const op = [...svg.matchAll(/fill-opacity="([\d.]+)"/g)].map((m) => +m[1]);
ok(op.length && Math.max(...op) <= 0.06, 'низкая непрозрачность (≤ 6 %)', Math.max(...op));
const uses = css.split('\n').filter((l) => /var\(--carbon\)/.test(l));
ok(uses.length >= 2 && uses.length <= 4, 'карбон в 2–4 местах', uses.length);
ok(uses.every((l) => /prof-banner|rd-hero|shop-card-hero|g63Specs/.test(l) && !/box-shadow|glow|gradient/i.test(l)), 'места: профиль, итог замера, чип в магазине, характеристики в Гараже');
ok(/'\.\/img\/carbon-twill\.svg'/.test(sw), 'плитка в precache');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v181 OK');
