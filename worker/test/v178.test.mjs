// v178: сигнальный красный токен --accent-signal (#e12323) для 7 индикаторов; версия.
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const sw = rd('sw.js'); const css = rd('styles.css');
ok(/const APP_VERSION = 'v1(7[8-9]|[89]\d)'/.test(app) && /const CACHE = 'pitlane-v1(7[8-9]|[89]\d)'/.test(sw) && /'v177', 'v178'/.test(app), 'версия v178');
ok(/--accent-signal: #e12323;/.test(css), 'токен --accent-signal в :root');
ok(/tools\/design-system\.html/ && /accent-signal/.test(rd('tools/design-system.html')), 'дизайн-система описывает --accent-signal');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v178 OK');
