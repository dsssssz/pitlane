// v135: флаг страны марки справа от названия машины (SVG, не эмодзи). Логотипов/эмблем марок НЕ добавляем (решение Маги).
// node test/v135.test.mjs
import fs from 'fs';
let fails = 0; const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const U = (f) => new URL('../../' + f, import.meta.url);
const R = (f) => fs.readFileSync(U(f), 'utf8');
const { BRANDS, COUNTRIES, brandOf, flagUrl } = await import(U('car-brands.js').href);
const app = R('app.js'); const css = R('styles.css'); const html = R('index.html'); const sw = R('sw.js'); const mod = R('car-brands.js');

console.log('каталог: у каждой машины — марка и флаг страны марки');
const cars = [...app.slice(app.indexOf('const CARS = ['), app.indexOf('];', app.indexOf('const CARS = ['))).matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
const models = [...app.slice(app.indexOf('const MODEL_CATALOG = ['), app.indexOf('];', app.indexOf('const MODEL_CATALOG = ['))).matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
ok(cars.length >= 28 && models.length >= 10, 'каталоги прочитаны', [cars.length, models.length]);
const miss = [...new Set([...cars, ...models])].filter((n) => !brandOf(n));
ok(miss.length === 0, 'все машины каталога распознаны', miss);
const expect = { 'McLaren 765LT': 'gb', 'BMW G87 M2 Widebody': 'de', 'Lamborghini Huracán STO': 'it', 'Chevrolet Spark GT': 'us', 'Mercedes-AMG G 63': 'de', 'Lexus IS-F': 'jp', 'Porsche 911 GT3 RS': 'de', 'Ferrari SF90 Stradale': 'it', 'Nissan GT-R Nismo': 'jp', 'Tesla Model S Plaid': 'us', 'Ford Mustang Dark Horse': 'us', 'Volkswagen Golf R': 'de', 'Honda Civic Type R': 'jp', 'Toyota GR Supra': 'jp', 'Audi RS6 Avant': 'de' };
for (const [n, cc] of Object.entries(expect)) ok(brandOf(n)?.cc === cc, `${n} → ${COUNTRIES[cc]}`, brandOf(n)?.cc);
console.log('свободный текст пилота (кириллица, границы слов)');
for (const [n, cc] of [['лада веста', 'ru'], ['Мерс E63', 'de'], ['бмв м5', 'de'], ['Range Rover Sport', 'gb'], ['Kia Rio', 'kr'], ['рено логан', 'fr'], ['mini cooper s', 'gb']]) ok(brandOf(n)?.cc === cc, `«${n}» → ${cc}`, brandOf(n)?.cc);
for (const n of ['Fordson', 'Моя ласточка', '', 'Minivan']) ok(!brandOf(n), `«${n}» — без флага`, brandOf(n)?.key);

console.log('флаги: локальные SVG, без скриптов/внешних ссылок');
for (const cc of new Set(BRANDS.map((b) => b.cc))) {
  ok(!!COUNTRIES[cc], `страна ${cc} названа по-русски`);
  const p = flagUrl({ cc }).replace('./', ''); let s = '';
  try { s = R(p); } catch { /* */ }
  ok(/^<svg[\s\S]*<\/svg>\s*$/.test(s) && !/<script|href="http|xlink:href="http|on\w+=/i.test(s) && s.length < 4000, `${p} — чистый SVG`, s.length);
}
ok(fs.existsSync(U('img/flags/LICENSE.txt')) && /MIT/.test(R('img/flags/LICENSE.txt')), 'лицензия flag-icons (MIT) лежит рядом');

console.log('никаких логотипов марок (v135: только флаг)');
ok(!/logo|simple-?icons|img\/brands/i.test(mod), 'car-brands.js не знает о логотипах');
ok(!/cb-logo/.test(app + css + html), 'нет класса логотипа в UI');
const brandFiles = fs.readdirSync(U('img/brands')).sort();
ok(JSON.stringify(brandFiles) === JSON.stringify(['bmw.png', 'bmw.svg']), 'новых файлов эмблем нет (только прежние bmw с v-ранних версий)', brandFiles);
ok(/эмблемы марок — только для превью/.test(html), 'честная пометка «превью» в Боксе сохранена');
ok(!/[\u{1F1E6}-\u{1F1FF}]{2}/u.test(app + html + mod), 'флаги не эмодзи');

console.log('разметка и стили');
ok(/id="hwCarRow"[^>]*><b id="hwCarName" class="cb-name">/.test(html), 'главная: строка «название · флаг»');
ok(/fillCarNameRow\(row, m\.name, \{ tag: 'b', id: 'hwCarName' \}\)/.test(app), 'главная заполняется через fillCarNameRow');
ok(/id="boxName"[^\n]*<\/h1>\s*<span class="cb-flag box-flag" id="boxFlag"/.test(html) && /applyBoxFlag\(p\.name\)/.test(app), 'Бокс: флаг справа от названия');
ok(/cp-name cb-row/.test(app), 'выбор машины: флаг у названия');
ok(/carNameRow\(pr\.car, \{ rowTag: 'p', cls: 'pilot-car' \}\)/.test(app), 'публичный профиль: флаг у машины пилота');
ok(/n\.textContent = name/.test(mod) && !/innerHTML/.test(mod), 'название — textContent');
ok(/\.cb-row \.cb-name \{[^}]*text-overflow: ellipsis/.test(css) && /\.cb-flag \{[^}]*flex: none/.test(css), 'длинное название — многоточие, флаг не сжимается');
const v135css = css.slice(css.indexOf('v135: флаг страны марки'));
ok(!/text-shadow|drop-shadow|0 0 ([2-9]|\d{2,})px|#0f0|#39ff|lime/i.test(v135css), 'без неона/свечения');
ok(!/hw-top|top-row|tops-/.test(v135css), 'таблицы топа не трогаем');
ok(/'\.\/car-brands\.js'/.test(sw) && /img\/flags\/gb\.svg/.test(sw), 'SW: модуль и флаги в precache');
ok(/const CACHE = 'pitlane-v135'/.test(sw) && /APP_VERSION = 'v135'/.test(app), 'версии подняты');

if (fails) { console.log(`\n✗ v135: ${fails}`); process.exit(1); }
console.log('\nv135 OK');
