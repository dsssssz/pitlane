// v167: палитра «чёрный + платина» — ни следа мятного/неонового зелёного; зелёный/красный только для дельт и приглушённые.
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js');
ok(/const APP_VERSION = 'v1(6[7-9]|[7-9]\d)'/.test(app) && /const CACHE = 'pitlane-v1(6[7-9]|[7-9]\d)'/.test(sw) && /'v166', 'v167'/.test(app), 'версия v167');
const files = []; const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/^(vendor|node_modules|\.git|models|hardware|worker[\\/]test)$/.test(p) && !/node_modules|\.git$/.test(p)) walk(p); } else if (/\.(js|mjs|css|html|svg|json|py)$/.test(e.name)) files.push(p); } };
walk('.');
const MINT = /158\s*,\s*205\s*,\s*176|9ecdb0|0x9ecdb0|#39ff14|#30d158|#6cbf85|#4fae8f/i;
const bad = files.filter((f) => MINT.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
ok(bad.length === 0, 'старого мятного и неона нет ни в одном файле', bad.slice(0, 6).join(', '));
ok(/--acc-rgb: 201, 198, 191;/.test(css) && /--ds-text: #f2efe9;/.test(css) && /--ds-bg-2: #141414; --ds-bg-3: #1c1c1e;/.test(css), 'токены: платина, тёплый белый, графит');
ok(/--ds-good: #7fae8f; --ds-bad: #d0675c;/.test(css), 'дельты — приглушённые зелёный/красный');
ok(/function degreenModel\(root\)/.test(app) && /degreenModel\(car\)/.test(app), '3D: зелёная ливрея → графит на лету (без правки .glb)');
ok(!/'Мятный'|'Малахит'|'Кэнди-изумруд'/.test(app), 'в палитрах красок нет зелёных');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v167 OK');
