// v154: финальный аудит + живое 3D, ☰ и аватар в шапке, вкладки Главная/Замер/Трек/Гараж, «С видео».
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const html = R('index.html'); const app = R('app.js'); const css = R('styles.css'); const sw = R('sw.js'); const vt = R('video-tele.js');
const c = css.slice(css.indexOf('/* ===== v154'));
// шапка
ok(/id="btnMenu"[^>]*aria-controls="plMenu"/.test(html) && /id="btnProfile"[^>]*data-view="account"|data-view="account"[^>]*id="btnProfile"/.test(html), 'в шапке справа: ☰ и аватар (Профиль)');
ok(/html\.v154 #btnMenu, html\.v154 #btnProfile \{ display: grid !important;[^}]*width: 44px; height: 44px/.test(c), '☰ и аватар видны на всех вкладках, 44×44');
const menu = html.slice(html.indexOf('id="plMenu"'), html.indexOf('</aside>', html.indexOf('id="plMenu"')));
for (const k of ['history', 'pulse', 'team', 'shop', 'suggest', 'settings', 'feedback', 'method']) ok(menu.includes(`data-plm="${k}"`), '☰: ' + k);
ok(['privacy', 'terms', 'offer', 'delete-account'].every((p) => menu.includes(`./${p}.html`)), '☰: правовые страницы');
ok(/window\.__route48\?\.\(k\)/.test(app) && /if \(k === 'settings'\)/.test(app), '☰ и Профиль — общий маршрутизатор');
const p = html.slice(html.indexOf('id="p48"'), html.indexOf('</section>', html.indexOf('id="p48"')));
ok([...p.matchAll(/data-p48="([a-z]+)"/g)].map((m) => m[1]).join() === 'tops,duels', 'Профиль (аватар): Топы и Дуэли первыми');
// нижняя панель
const nav = html.slice(html.indexOf('id="nav3"'), html.indexOf('</nav>', html.indexOf('id="nav3"')));
ok([...nav.matchAll(/data-n3="(\w+)"/g)].map((m) => m[1]).join() === 'home,zamer,lap,garage' && /Трек/.test(nav) && !/Профиль/.test(nav), 'вкладки: Главная / Замер / Трек / Гараж');
ok(/act === 'lap' \? 'lap'/.test(app), 'вкладка «Трек» подсвечивается на экране круга');
// живое 3D
ok(/function mountPodium\(where\)/.test(app) && /mountPodium\('garage'\)/.test(app) && !/mountPodium\('home'\)/.test(app), 'v155: живое 3D — только в Гараже');
ok(/id="g53Art"/.test(html) && !/id="hwCar3d"/.test(html) && !/id="g53Img"/.test(html), 'v155: Гараж — 3D-хост; «Моя машина» на Главной — снова студийный рендер');
ok(/av && canvas && av\.contains\(canvas\)/.test(app), '3D рисуется только на активной вкладке (батарея)');
const IDS = ['g87-m2', 'gt3rs', 'mclaren-765lt', 'g63', 'm4', 'm3', 'x6', 'isf', 'c63-ed507', 'spark'];
const studio = fs.readdirSync(new URL('img/cars/studio', root));
ok(studio.length === 40 && IDS.every((i) => [780, 1170].every((w) => ['webp', 'avif'].every((e) => studio.includes(`${i}-${w}.${e}`) && sw.includes(`'./img/cars/studio/${i}-${w}.${e}'`)))), 'v155: для виджета — только 780/1170 webp+avif всех машин, все в кэше SW');
ok(!fs.existsSync(new URL('img/cars/hero', root)) && !/-1560\./.test(app + sw) && !/cars\/hero\//.test(html + app + sw), 'v155: hero и 1560 не возвращались');
ok(/function studioSrcset\(id, ext\) \{ return \[780, 1170\]/.test(app) && /img\.src = `\.\/img\/cars\/studio\/\$\{m\.id\}-1170\.webp`;/.test(app), 'v155: «Моя машина» — studio srcset 780w/1170w');

// «С видео»
ok(/id="h54Video"[^>]*>[\s\S]{0,300}С видео/.test(html) && /id="l54Video"[^>]*>[\s\S]{0,300}С видео/.test(html), '«С видео» под «Старт» (Замер) и «Старт круга» (Трек)');
ok(/withSafety\(\(\) => \{ armRun\(\); void openVideoTele\('run', \{ autostart: true \}\); \}\)\(\)/.test(app) && /lapStartFlow\(\(\) => \{ void openVideoTele\('lap', \{ autostart: true \}\); \}\)/.test(app), '«С видео» запускает замер/круг и запись сразу');
ok(/if \(autostart\) void \(async \(\) => \{ await step\(\); if \(phase === 'ready'\) await step\(\); \}\)\(\);/.test(vt), 'видео: камера и запись включаются без лишних нажатий');
ok(/\.v54-video \{[^}]*min-height: 44px/.test(c), '«С видео» — тихая кнопка, 44 px');
// круг без лишней шторки
ok(/if \(mine \|\| state\.carId\) \{ go\(\); return; \}/.test(app), 'машина уже выбрана — «Старт круга» сразу открывает HUD без «Это моя машина»');
// аудит
ok(!/data-hex="#39FF14"/.test(html), 'нет неонового цвета кузова');
ok(/html\.v154 \.cult-tag\.rough-sf \{ color: #a3a6ab/.test(c) && /html\.v154 \.mycar-warn \{[^}]*color: #c9cacd/.test(c), 'без жёлтого/оранжевого в подписях');
ok(/body:has\(\.race-sheet:not\(\.hidden\)\) \.nav3/.test(c) && /body:has\(#vtSheet\) \.nav3/.test(c), 'нижняя панель не перекрывает шторки и видео');
ok(/html\.v154 \.tgs-close, html\.v154 \.share-card-close \{ width: 44px !important; height: 44px !important/.test(c) && /\.bn52-dot::after/.test(c), 'зоны нажатия ≥ 44 px');
ok(/html\.v154 \.nav3-btn \{ color: #8a8d93; \}/.test(c), 'контраст подписей нижней панели ≥ 4.5:1');
ok(!/Sector Battle/.test(html) && !/'Sector Battle/.test(app), 'без непереведённых «Sector Battle»');
ok(!fs.existsSync(new URL('models/ferrari.glb', root)) && !fs.existsSync(new URL('img/p-taycan.png', root)) && !fs.existsSync(new URL('img/c63pack', root)), 'неиспользуемые ассеты удалены (ferrari.glb, старые jpg/png)');
const core = [...sw.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]).filter((x) => x !== './');
ok(core.every((f) => fs.existsSync(new URL(f.slice(2), root))), 'SW: в precache нет удалённых файлов');
ok(/@media \(min-width: 901px\) \{\s*html\.v154 \.rail \{ display: none !important; \}/.test(c) && /html\.v154 main \{ max-width: 520px/.test(c), 'десктоп: та же мобильная колонка, нижняя панель, без старого rail');
ok(/const CACHE = 'pitlane-v15[5-9]'/.test(sw) && /APP_VERSION = 'v15[5-9]'/.test(app), 'версия ≥ v155');
ok(!/text-shadow|drop-shadow|(?<!backdrop-filter: )blur\(|orange|#ff9|#30d158/.test(c), 'без неона/свечения');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v154 OK');
