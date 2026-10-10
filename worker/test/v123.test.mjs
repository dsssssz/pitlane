// v123: Главная из окошек-виджетов, меню ☰, студийные превью машин — node test/v123.test.mjs
import fs from 'fs';
let fails = 0; const ok = (c, m) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m); } };
const root = new URL('../../', import.meta.url).pathname;
const html = fs.readFileSync(root + 'index.html', 'utf8'); const css = fs.readFileSync(root + 'styles.css', 'utf8');
const app = fs.readFileSync(root + 'app.js', 'utf8'); const sw = fs.readFileSync(root + 'sw.js', 'utf8');
console.log('[превью машин]');
const IDS = ['g87-m2', 'gt3rs', 'mclaren-765lt', 'g63', 'm4', 'm3', 'x6', 'isf', 'c63-ed507', 'spark'];
const webpW = (f) => { const b = fs.readFileSync(f); const t = b.toString('ascii', 12, 16); if (t === 'VP8X') return 1 + b.readUIntLE(24, 3); if (t === 'VP8 ') return b.readUInt16LE(26) & 0x3fff; return 0; };
let allOk = true, wOk = true;
for (const id of IDS) for (const w of [780, 1170, 1560]) for (const ext of ['webp', 'avif']) { const f = `${root}img/cars/studio/${id}-${w}.${ext}`; if (!fs.existsSync(f) || fs.statSync(f).size < 4000) allOk = false; if (ext === 'webp' && fs.existsSync(f) && webpW(f) !== w) wOk = false; }
ok(allOk, 'студийные превью: 10 машин × 780/1170/1560 × AVIF/WebP');
ok(wOk, 'реальная ширина WebP совпадает с дескриптором srcset (макс. 1560 ≥ 1170 px)');
ok(/<source id="hwCarAvif" type="image\/avif"/.test(html) && /id="hwCarImg"[^>]*sizes=/.test(html), '<picture>: AVIF + WebP, sizes');
ok(/function studioSrcset\(id, ext\) \{ return \[780, 1170, 1560\]/.test(app), 'srcset 780w/1170w/1560w');
ok(/<img id="homeHeroImg" class="hh-img" alt="" decoding="async" loading="lazy">/.test(html), 'старое превью без src (не грузится на Главной)');
ok(!/img\/cars\/hero\//.test(sw) && /'\.\/img\/cars\/studio\/g87-m2-1170\.avif'/.test(sw), 'SW: в precache только одно новое превью (машина по умолчанию)');
console.log('[меню ☰]');
ok(/id="btnMenu"[^>]*aria-controls="plMenu"/.test(html) && /id="btnProfile"/.test(html), 'кнопка меню рядом с профилем, профиль на месте');
const menu = html.slice(html.indexOf('id="plMenu"'), html.indexOf('</aside>', html.indexOf('id="plMenu"')));
for (const k of ['home', 'run', 'duels', 'tops', 'team', 'pulse', 'garage', 'autodromes', 'gps', 'method', 'feedback']) ok(menu.includes(`data-plm="${k}"`), 'пункт меню: ' + k);
ok(/privacy\.html/.test(menu) && /terms\.html/.test(menu), 'правовая информация в меню');
ok(/\['plMenu', 'plMenuClose'\]/.test(app), 'Telegram BackButton закрывает меню первым');
ok(/plMenuScrim'\)\?\.addEventListener\('click', plMenuClose\)/.test(app) && /touchend[\s\S]{0,80}dx > 70\) plMenuClose\(\)/.test(app) && /e\.key === 'Escape'\) plMenuClose\(\)/.test(app), 'закрытие: фон, свайп вправо, Esc');
console.log('[виджеты Главной]');
for (const id of ['hwCar', 'hwRec', 'hwDuels', 'hwPad', 'hwTeam', 'hwTop']) ok(new RegExp(`id="${id}"[^>]*data-hw=`).test(html), 'виджет ' + id);
for (const id of ['homeHero', 'homeQuick', 'homeDuelsSec', 'homeTrackSec', 'homeLeadersSec', 'homeStatsSec']) ok(new RegExp(`class="[^"]*v123-off"[^>]*id="${id}"[^>]*hidden|id="${id}" hidden`).test(html) || new RegExp(`v123-off" id="${id}" hidden`).test(html), 'старый блок скрыт (не удалён): ' + id);
ok(/e\.hidden = !on \|\| e\.classList\.contains\('v123-off'\)/.test(app), 'скрытые блоки не всплывают через showWhen');
const blk = app.slice(app.indexOf('/* ——— v123: Главная из окошек'), app.indexOf('/* v120: главная кнопка'));
ok(blk.length > 1000 && !/innerHTML/.test(blk), 'v123: только textContent/DOM, без innerHTML');
ok(/hwEmpty\('Пока пусто'/.test(blk) && /hwEmpty\('Нет активных'/.test(blk) && /hwEmpty\('Сегодня тихо'/.test(blk) && /hwEmpty\('Нет команды'/.test(blk) && /hwEmpty\('Топ пока пуст'/.test(blk), 'честные пустые состояния, без фейковых цифр');
console.log('[навигация]');
// v124: решение v123 «без таббара» заменено панелью из трёх шторок — старые 4 вкладки на телефоне по-прежнему скрыты
ok(/document\.documentElement\.classList\.add\('nav-widgets'\)/.test(app) && /html\.nav-widgets \.rail nav\.tabbar > \.nav-btn:not\(\.sheet-tab\) \{ display: none !important; \}/.test(css), 'на телефоне старые 4 вкладки скрыты (код и десктопный рейл остаются)');
ok(/id="btnHome"[^>]*aria-label="На главную"/.test(html) && /b\.hidden = onHome \|\| tg/.test(app), 'вне Telegram — ‹ «На главную» в шапке; в Telegram — системная «Назад»');
ok(/<meta http-equiv="Content-Security-Policy"[^>]*script-src 'self'/.test(html), 'CSP не тронут');
ok(/APP_VERSION = 'v1(2[3-9]|[3-9]\d)'/.test(app) && /pitlane-v1(2[3-9]|[3-9]\d)/.test(sw), 'APP_VERSION / SW ≥ v123');
console.log(fails ? `✗ ${fails} failed` : '✓ v123 all passed'); process.exit(fails ? 1 : 0);
