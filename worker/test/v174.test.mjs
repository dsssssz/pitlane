// v174: баннеры без наложения текста на кнопку, видео-баннер с экраном телефона, «Призрак» — строка + шторка.
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js'); const html = rd('index.html');
ok(/const APP_VERSION = 'v1(7[4-9]|[89]\d)'/.test(app) && /const CACHE = 'pitlane-v1(7[4-9]|[89]\d)'/.test(sw) && /'v173', 'v174'/.test(app), 'версия v174');
ok(/\.bn52-cta \{ position: relative !important; right: auto !important; bottom: auto !important;/.test(css) && /\.bn52-s \{ aspect-ratio: auto !important; min-height:/.test(css), 'кнопка баннера своей строкой, слайд растёт');
ok(/\.bn52-t \{ max-width: 100%;[^}]*-webkit-line-clamp: 2/.test(css), 'заголовок до 2 строк');
ok(/\.b-video img \{ object-position: 74% 28%; \}/.test(css) && fs.statSync(path.join(ROOT, 'img/banners/bn-video-1560.webp')).size < 200000, 'видео-баннер: экран телефона в кадре');
ok(/id="z61Ghost"/.test(html) && /id="ghost74"[\s\S]{0,900}id="runGhostPick"/.test(html) && !/class="ds-row z61-ghost"/.test(html), 'Призрак — строка, выбор в шторке');
ok(/function ghostRowValue74\(\)/.test(app) && /\['ghost74', 'ghost74Close'\]/.test(app), 'значение справа и закрытие шторки кнопкой «Назад»');
ok(/\.gh74 \.gp-chip b \{[^}]*text-overflow: clip/.test(css), 'в шторке ничего не обрезается');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v174 OK');
