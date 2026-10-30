// v158: ровный ритм главной, про-трек (выбор/HUD/итоги), магазин как страница.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const html = R('index.html'); const app = R('app.js'); const css = R('styles.css'); const sw = R('sw.js'); const shop = R('shop-ui.js');
const secOf = (s, m) => { const a = s.indexOf(m); const b = s.indexOf('\n/* ===== ', a + 5); return s.slice(a, b < 0 ? undefined : b); }; // v231: правило проверяется в своём разделе, а не до конца файла
const c = secOf(css, '/* ===== v159 DESIGN SYSTEM'); // v159: правила v158 переписаны в системе
ok(/const CACHE = 'pitlane-v(?:[2-9]\d\d|1(5[8-9]|[6-9]\d))'/.test(sw) && /APP_VERSION = 'v(?:[2-9]\d\d|1(5[8-9]|[6-9]\d))'/.test(app) && /'v158'/.test(app), 'версия ≥ v158');
// главная
ok(/id="hwStats"[^>]*data-hw="stats"[^>]*hidden/.test(html) && /id="hw58Place"/.test(html) && /id="hw58Week"/.test(html) && /id="hw58Last"/.test(html), 'строка статистики: место в топе, за неделю, последняя сессия');
ok(/function renderHwStats\(/.test(app) && (app.match(/renderHwStats\(/g) || []).length >= 3, 'статистика рендерится в обоих проходах');
ok(/\[hidden\]\s*\{[^}]*display: none/.test(c), 'скрытые виджеты действительно скрыты');
ok(/hw58-next/.test(app), 'ближайшая дуэль');
// трек
// v193: карточки tk58 заменены модулем track-v2 (tv2)
ok(/tv2/.test(html + app) && fs.existsSync(new URL('../../track-v2/tv2.js', import.meta.url)), 'карточки трасс: модуль tv2 (v193 заменил tk58)');
for (const id of ['lh58Delta', 'lh58Pred', 'lh58Cur', 'lh58Best', 'lh58Sec', 'lh58Map', 'lh58Video', 'lh58Arm', 'lh58End']) ok(new RegExp(`id="${id}"`).test(html), 'HUD: ' + id);
ok(/function lh58Tick\(/.test(app) && /function lh58Theo\(/.test(app) && /function ls58Open\(/.test(app) && /id="ls58"/.test(html), 'дельта, теоретический лучший, итог сессии');
ok(/openVideoTele\('lap'\)/.test(app) && /btnLapArmedStart/.test(app) && /lapDriveEnd/.test(app), 'старая логика, видео и аналитика сохранены');
// магазин
ok(/<section id="view-shop" class="view[^"]*"[^>]*>\s*<div class="shop-body" id="shopBody">/.test(html), 'магазин — отдельная страница');
ok(/function openShopSheet\([^)]*\)\s*\{[\s\S]{0,900}goToView\('shop'\)/.test(app), 'вход из ☰ и баннера ведёт на страницу');
ok(/shop58Back\(\)/.test(app.slice(app.indexOf('const backTarget'), app.indexOf('const backTarget') + 3000)), 'Telegram BackButton возвращает назад');
ok(/shop-grid/.test(shop) && /shop-card/.test(shop) && /Предзаказ/.test(shop) && /Скоро/.test(shop), 'сетка карточек, предзаказ, подписки «Скоро»');
// стиль
ok(!/text-shadow|drop-shadow|(?<!backdrop-filter: )blur\(|orange|#ff9|#30d158|shadow:[^;]*(?<!inset |inset 0 )0 0 [1-9]\d*px/.test(c), 'без неона и свечения');
console.log(fails ? `FAIL ${fails}` : 'OK v158'); process.exit(fails ? 1 : 0);
