// v140: HUD замера — линия скорости, зоны 0–60/0–100/0–200, светлая кнопка Старт.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
ok((html.match(/class="hud-zones"/g) || []).length === 2, 'зоны в idle и в заезде');
for (const z of ['60', '100', '200']) ok(html.includes(`data-to="${z}"`), 'зона 0–' + z);
ok(app.includes('function hudZones') && app.includes('hudZones(vShow)'), 'зоны обновляются от скорости');
const v140 = css.slice(css.indexOf('v140'));
ok(/#btnArm\.go-btn[^{]*\{[^}]*background:\s*#ecebe8/.test(v140), 'Старт светлый');
ok(!/glow|text-shadow:\s*0 0|box-shadow:\s*0 0 \d+px rgba?\(\s*(48|0),\s*2/.test(v140), 'без свечения');
ok(/pitlane-v14\d/.test(sw), 'кэш sw поднят');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v140 OK');
