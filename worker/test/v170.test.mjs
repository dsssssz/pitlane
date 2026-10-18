// v170: новые баннеры главной — свои фото в палитре «чёрный + платина», WebP 800/1560, < 200 КБ, без фильтров яркости.
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js'); const html = rd('index.html');
ok(/const APP_VERSION = 'v1(7\d|[89]\d)'/.test(app) && /const CACHE = 'pitlane-v1(7\d|[89]\d)'/.test(sw) && /'v169', 'v170'/.test(app), 'версия v170');
const K = ['gps', 'tops', 'duels', 'video', 'track'];
const tr = html.slice(html.indexOf('id="bn52Track"'), html.indexOf('id="bn52Dots"'));
for (const k of K) {
  for (const w of [800, 1560]) { const f = `img/banners/bn-${k}-${w}.webp`; const ex = fs.existsSync(path.join(ROOT, f)); ok(ex && fs.statSync(path.join(ROOT, f)).size < 200000, `${f} есть и < 200 КБ`); }
  ok(tr.includes(`bn-${k}-1560.webp 1560w`), `баннер ${k} подключён со srcset`);
  ok(sw.includes(`./img/banners/bn-${k}-800.webp`), `баннер ${k} в precache`);
}
ok(!/gps-hero-720|banners\/(tracks|duels|paddock)-800|auto-msk-full/.test(tr), 'в карусели не осталось старых картинок');
ok(/\.bn52-s img \{ filter: none !important; \}/.test(css) && !/b-track img \{ filter: brightness\(1\.18\)/.test(css), 'без старого фильтра яркости');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v170 OK');
