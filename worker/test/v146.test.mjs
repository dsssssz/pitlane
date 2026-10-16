// v146: светлая «Старт» реально перебивает «#app .form-row button !important», HUD без колец, пустые состояния с одной кнопкой.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const c = css.slice(css.indexOf('v146: спокойный тон'));
ok(/#app \.form-row #btnArm\.go-btn[^{]*\{[^}]*background: #ecebe8 !important[^}]*text-transform: none !important/.test(c), 'Старт: светлая, без капса, с !important на уровне #app .form-row');
ok(/#runIdleCard::before[^{]*\{[^}]*content: none/.test(c) && /\.run-drive \{ background: #0b0c0e !important/.test(c), 'HUD: без радиального фона и колец');
ok(/--bg: #0b0c0e; --panel: #141518/.test(c), 'палитра: почти чёрный фон, мягкие панели');
ok(/hwEmpty\('Пока пусто', 'Первый замер появится здесь', 'Сделать замер'\)/.test(app) && /hwEmpty\('Топ пока пуст', 'Стань первым в таблице', 'Сделать замер'\)/.test(app), 'пустые состояния — одна кнопка');
ok(/#view-home \.home-go \{ background: #ecebe8/.test(c), 'Главная: «Замер» — светлая главная кнопка');
ok(!/text-shadow|drop-shadow|#30d158|blur\(/.test(c), 'без свечения');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v146 OK');
