// v145: спидометр по референсу — дуга-шкала, серебряные цифры, кольца, без свечения.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
ok((html.match(/class="hud-gauge"/g) || []).length === 2 && (html.match(/class="hud-zones"/g) || []).length === 2, 'дуга и зоны в idle и в заезде');
ok(/function hudGaugeBuild/.test(app) && /\(hudPeak > 200 \|\| v > 200\) \? 300 : 200/.test(app), 'шкала 0–200, при >200 — 0–300');
const c = css.slice(css.indexOf('v145: спидометр'));
ok(/background-clip: text/.test(c) && /font-weight: 200/.test(c), 'тонкие серебряные цифры');
ok(/\.hgz-fill \{[^}]*transition/.test(c), 'плавная анимация');
ok(!/text-shadow|drop-shadow|box-shadow|#30d158|blur\(/.test(c), 'без свечения/неона');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v145 OK');
