// v179: тонировка — почти чёрная база, отражения только бликами (проверено на GT3 RS: 3 варианта).
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const sw = rd('sw.js');
ok(/const APP_VERSION = 'v1(79|[89]\d)'/.test(app) && /const CACHE = 'pitlane-v1(79|[89]\d)'/.test(sw) && /'v178', 'v179'/.test(app), 'версия v179');
const g = app.match(/const GLASS177 = \{ clearcoat: ([\d.]+), spec: ([\d.]+), env: ([\d.]+) \}/);
ok(g && +g[1] <= 0.4 && +g[2] <= 0.2 && +g[3] <= 0.5, 'стекло: лак ≤ .4, спекуляр ≤ .2, env ≤ .5', g && g[0]);
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v179 OK');
