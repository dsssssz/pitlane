// v163: крупный запуск и шильдик, светлые баннеры с рабочими тапами, Главная в логике «Замера», шоурум Гаража, одна система кнопок.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const root = new URL('../../', import.meta.url); const rd = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js'); const html = rd('index.html');
const sys = css.slice(css.indexOf('/* ===== v163'));
ok(/const APP_VERSION = 'v1(6[3-9]|[7-9]\d)'/.test(app) && /const CACHE = 'pitlane-v1(6[3-9]|[7-9]\d)'/.test(sw) && /'v162', 'v163'/.test(app), 'версия v163');
// 1. запуск
ok(/\.ln61-mark \{[^}]*font: 650 min\(13\.6vw, 96px\)\/1[^}]*letter-spacing: \.2em[^}]*color: #fff/.test(css), 'знак запуска ~75–80vw, 650, белый, широкий трекинг');
ok(/\.ln61-sub \{[^}]*font: 500 min\(4vw, 17px\)/.test(css), 'подзаголовок крупнее');
ok(/@keyframes ln61-mark \{ 0% \{ opacity: 0; transform: translateY\(10px\); \} 100% \{ opacity: 1; transform: none; \} \}/.test(css), 'знак не гаснет до раскрытия панелей — читается');
// 2. шильдик в шапке
ok(/\.brand-bar b \{ position: relative; font: 600 18px\/1[^}]*color: #fff/.test(css) && /\.brand-bar b::after \{[^}]*height: 1\.5px; background: var\(--ds-acc\)/.test(css), 'PITLANE в шапке: 18 px, белый, полужирный + тонкая мятная линия');
// 3. баннеры
const keys = [...html.matchAll(/data-bn52="([a-z]+)"/g)].map((m) => m[1]);
ok((html.match(/class="bn52-cta"/g) || []).length === keys.length && keys.length === 5, 'у каждого баннера — кнопка-CTA');
ok(/\.bn52-s img \{ filter: none !important; \}/.test(css) && /\.bn52-s::after \{ top: auto; height: (6[0-9]|7[0-9]|80)%;/.test(css), 'фото в полную яркость, скрим только под текстом');
ok(/function bn63Open\(k\)/.test(app) && /openShopSheet\('pitlane-gps'\)/.test(app) && /r\(k\)/.test(app), 'каждый баннер открывает свой раздел: товар GPS, топы, дуэли, видео, трасса');
{ const r48 = app.slice(app.indexOf('function route48(k)'), app.indexOf('window.__route48 = route48;')); ok(['tops', 'duels', 'video', 'suggest'].every((k) => r48.includes(`'${k}'`)), 'у route48 есть маршрут для каждого ключа баннера'); }
// 5. Главная
ok(/id="hwCarStats"/.test(html) && /hwSet\('hwCarStats'/.test(app), 'карточка моей машины — лучшие времена крупными цифрами');
ok(/id="hwStats" data-hw="stats"[^>]*hidden><button type="button" class="hw hw58-c" id="hw58Place" data-hw="tops"/.test(html), 'статистика — три отдельные плитки (место → топы, неделя/последняя → Журнал)');
ok(/#view-home\.active \{ display: grid !important; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(sys) && /#view-home #homeWidgets \{ display: contents !important; \}/.test(sys), 'ровная сетка 2 × N');
ok(/height: 132px !important; min-height: 132px !important/.test(sys) && /function h63Balance\(\)/.test(app) && /tiles\.length % 2 === 1/.test(app), 'плитки одной высоты; нечётная последняя — во всю ширину (без дыр)');
ok(/#view-home #hwCar \{ order: 0; \}/.test(sys) && /#view-home #bn52 \{ order: 1;/.test(sys), 'порядок: машина → баннеры → плитки');
// 4. Гараж
const sc = app.slice(app.indexOf('function build3dScene()'), app.indexOf('let podiumIdleTimer = null;'));
ok(/ring\.visible = false; ringGlow\.visible = false;/.test(sc) && /showroomGlow = new THREE\.Mesh/.test(sc) && /showroomFade = new THREE\.Mesh/.test(sc), 'шоурум: без колец-постамента, пятно света, край пола растворяется');
ok(/const SHOWROOM_BG = 0x000000;/.test(app) && /renderer\.setClearColor\(SHOWROOM_BG, 1\)/.test(sc) && /color: 0x121215/.test(app), 'чёрный фон и тёмный отражающий пол');
ok(/id="g63Dots"/.test(html) && /id="g63Specs"/.test(html) && /id="g63Info"/.test(html) && /function g63Paint\(/.test(app) && /cell\('Мощность'/.test(app) && /cell\('Мой лучший'/.test(app), 'имя крупно + строка характеристик + точки');
ok(/g63Step\(dx < 0 \? 1 : -1\)/.test(app) && /pickPodiumCar\(list\[\(i \+ d \+ list\.length\) % list\.length\]\.id\)/.test(app), 'свайп по имени — следующая машина');
ok(/img\/cars\/studio\/\$\{x\.id\}-780\.webp/.test(app), 'лента — студийные рендеры, а не снимки подиума');
ok(/\.g53-acts > button, html\.v159:not\(#_\):not\(#_\) \.g53-add \{ flex: 1 1 0 !important;[^}]*height: 48px !important/.test(css), 'кнопки Гаража — одна строка, одинаковые, плоские');
ok(!fs.readdirSync(new URL('models/', root)).some((f) => /\.glb$/.test(f) && fs.statSync(new URL('models/' + f, root)).mtimeMs > Date.parse('2026-10-18T07:00:00Z')), '.glb не тронуты');
// 6. кнопки
ok(/#btnAutodromesLap\.ad-linkish \{[^}]*height: 48px !important/.test(sys) && /#btnMyCarLap\.mycar-chip \{[^}]*min-height: 56px !important/.test(sys), 'Трек: вторичное — строкой во всю ширину, выбор машины — строка параметров');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v163 OK');
