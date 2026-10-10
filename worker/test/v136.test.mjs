// v136: никаких эмблем и никакого зелёного неона в запечённых картинках (миниатюры выбора машины, карты трасс,
// баннер дуэлей, баннер бота, иконки). Профильные баннеры «неон» и покраска «Неон» — исключение по ТЗ.
// node test/v136.test.mjs  (декодирование WebP/PNG/JPEG — через python3 + Pillow, как в tools/)
import fs from 'fs'; import { execFileSync } from 'child_process';
let fails = 0; const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const U = (f) => new URL('../../' + f, import.meta.url);
const R = (f) => fs.readFileSync(U(f), 'utf8');
const root = U('').pathname;
const files = [
  ...['c63-ed507', 'g63', 'g87-m2', 'gt3rs', 'isf', 'm3', 'm4', 'mclaren-765lt', 'spark', 'x6'].map((i) => `img/cars/${i}.webp`),
  ...fs.readdirSync(U('img/track-maps')).filter((f) => f.endsWith('.webp')).map((f) => 'img/track-maps/' + f),
  'img/banners/duels-800.webp', 'img/banners/duels-1280.webp', 'img/tg/banner.jpg',
  'img/favicon-32.png', 'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png',
];
// доля «неоновых» пикселей: зелёный тон 70–170°, насыщенность > 0.55, яркость > 0.45
const py = `
import sys, json, colorsys
from PIL import Image
out = {}
for p in sys.argv[1:]:
    im = Image.open(p).convert('RGB'); im.thumbnail((256, 256)); px = list(im.getdata()); n = 0
    for r, g, b in px:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if 70 / 360 <= h <= 170 / 360 and s > 0.55 and v > 0.45: n += 1
    out[p] = n / len(px)
print(json.dumps(out))`;
let share = {};
try { share = JSON.parse(execFileSync('python3', ['-c', py, ...files], { cwd: root, encoding: 'utf8' })); } catch (e) { ok(false, 'python3 + Pillow для проверки картинок', String(e).slice(0, 200)); }
console.log('зелёный неон в запечённых картинках');
for (const f of files) {
  // GT3 RS — зелёные диски/полосы самой машины (ливрея модели), не подиум: допускаем немного
  const lim = /gt3rs/.test(f) ? 0.03 : 0.002;
  ok(share[f] !== undefined && share[f] <= lim, `${f}: неона ${((share[f] || 0) * 100).toFixed(2)}%`, share[f]);
}
console.log('вес не вырос');
const sz = (fs_) => fs_.reduce((s, f) => s + fs.statSync(U(f)).size, 0);
ok(sz(files.slice(0, 10)) <= 70920, 'миниатюры выбора машины ≤ прежних 70 920 Б', sz(files.slice(0, 10)));
ok(sz(files.filter((f) => f.includes('track-maps'))) <= 2498072, 'карты трасс не тяжелее прежних', sz(files.filter((f) => f.includes('track-maps'))));
ok(fs.statSync(U('img/tg/banner.jpg')).size <= 159403 && fs.statSync(U('img/favicon-32.png')).size <= 597, 'баннер бота и favicon не тяжелее');
console.log('источники не вернут неон');
ok(!/#5dff95|#1bb84f|#2ee56a|#39ff14/i.test(R('favicon.svg')), 'favicon.svg — мятный, без кислотного зелёного');
ok(!/#39ff14|57,\s*255,\s*20/i.test(R('tools/tg-banner.mjs')), 'генератор баннера бота без #39FF14');
ok(/banner\.jpg\?v=3/.test(R('worker/src/index.js')), 'URL баннера бота сменён (кэш Telegram)');
ok(/podiumModel\?\.\(\) === x/.test(R('tools/car-thumbs.mjs')) && /DIRECT/.test(R('tools/car-thumbs.mjs')), 'car-thumbs ждёт нужную модель (765LT ≠ GT3 RS)');
ok(/workers\\\.dev/.test(R('tools/car-thumbs.mjs')), 'car-thumbs не ходит в прод-API');
const sw = R('sw.js'); const app = R('app.js');
ok(/const CACHE = 'pitlane-v136'/.test(sw) && /APP_VERSION = 'v136'/.test(app), 'версии v136');
if (fails) { console.log(`\n✗ v136: ${fails}`); process.exit(1); }
console.log('\nv136 OK');
