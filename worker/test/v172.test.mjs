// v172: системные prompt()/alert() заменены своим листом ввода и тостами.
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js');
ok(/const APP_VERSION = 'v1(7[2-9]|[89]\d)'/.test(app) && /const CACHE = 'pitlane-v1(7[2-9]|[89]\d)'/.test(sw) && /'v171', 'v172'/.test(app), 'версия v172');
ok(/function askText172\(/.test(app) && (app.match(/await askText172\(/g) || []).length === 4, 'лист ввода в 4 местах (жалоба, дуэль, экипаж, ник)');
ok(!/[^.\w]prompt\('Вставь|window\.prompt\('Что не так|prompt\('Твой ник/.test(app), 'системных prompt() для ввода нет');
ok(!/[^.\w]alert\(/.test(app), 'системных alert() нет — тосты');
ok(/\.ask172 \.ask172-in \{[^}]*font: 400 16px/.test(css), 'поле 16px — iOS не зумит');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v172 OK');
