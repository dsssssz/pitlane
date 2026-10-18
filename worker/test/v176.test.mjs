// v176: perf — салон скрыт, стёкла непрозрачные тёмные (в рантайме, без правки .glb), фары/фонари не трогаются, есть выключатель.
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const sw = rd('sw.js');
ok(/const APP_VERSION = 'v1(7[6-9]|[89]\d)'/.test(app) && /const CACHE = 'pitlane-v1(7[6-9]|[89]\d)'/.test(sw) && /'v175', 'v176'/.test(app), 'версия v176');
ok(/function liteModel175\(root\)/.test(app) && /liteModel175\(glbRoot\)/.test(app), 'облегчение применяется к каждой загруженной модели');
ok(/color: 0x0b0c0e[^}]*clearcoat: 1[^}]*transparent: false[^}]*transmission: 0/.test(app), 'стекло: #0b0c0e, лак, непрозрачное, без transmission');
ok(/LITE_LIGHT_RE = \/light\|ligts\|lamp\|lens/.test(app) && /red\|orange\|amber/.test(app), 'линзы фар и фонарей остаются как были');
ok(/userData\.__darkGlass\) return true/.test(app), 'тёмное стекло не попадает в покраску');
ok(/lite=0/.test(app) && /pitlane-lite-off/.test(app), 'выключатель ?lite=0 / localStorage');
ok(!/inner\.containsBox/.test(app), 'без грубой проверки «внутри объёма стёкол»');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v176 OK');
