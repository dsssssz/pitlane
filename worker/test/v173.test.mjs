// v173: финальный QA — iPhone SE 320: призрак не вылезает за экран, свотчи 6 в ряд, хит-зона вкладки «Мат», параллакс гаснет раньше.
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js');
ok(/const APP_VERSION = 'v1(7[3-9]|[89]\d)'/.test(app) && /const CACHE = 'pitlane-v1(7[3-9]|[89]\d)'/.test(sw) && /'v172', 'v173'/.test(app), 'версия v173');
ok(/\.ds-row\.z61-ghost \.ghost-pick \{ min-width: 0;/.test(css), 'выбор призрака сжимается на 320px');
ok(/@media \(max-width: 359px\) \{[^}]*#colorBar \{ grid-template-columns: repeat\(6/.test(css), 'свотчи 6 в ряд на узком экране');
ok(/#paintFinish button::before \{ content: ""; position: absolute;[^}]*left: -9px/.test(css), 'хит-зона коротких вкладок отделки');
ok(/Math\.min\(120, y \* 0\.28\)/.test(app) && /1 - k \* 0\.9/.test(app), 'параллакс гаража ограничен и гаснет');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v173 OK');
