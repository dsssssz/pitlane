// v146: светлая «Старт» реально перебивает «#app .form-row button !important», HUD без колец, пустые состояния с одной кнопкой.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const c = css.slice(css.indexOf('v146: спокойный тон'));
ok(/#app \.form-row #btnArm\.go-btn[^{]*\{[^}]*background: #ecebe8 !important[^}]*text-transform: none !important/.test(c), 'Старт: светлая, без капса, с !important на уровне #app .form-row');
ok(/\.run-drive \.run-drive-top::before \{[^}]*content: none/.test(c) && !/#view-run #runIdleCard/.test(c) && /\.run-drive \{ background: (#0b0c0e|var\(--ds-bg-1\)) !important/.test(c), 'HUD: без радиального фона и колец');
ok(/--ds-bg: #000; --ds-bg-1: #0a0a0a/.test(css) && /--bg: var\(--ds-bg\); --panel: var\(--ds-bg-1\)/.test(css), /* v159: чистый чёрный, одна палитра */ 'палитра: почти чёрный фон, мягкие панели');
ok(/hwEmpty\('Пока пусто', 'Первый замер появится здесь', 'Сделать замер'\)/.test(app) && /hwEmpty\('Топ пока пуст', 'Стань первым в таблице', 'Сделать замер'\)/.test(app), 'пустые состояния — одна кнопка');
ok(/#view-home \.home-go \{ background: #ecebe8/.test(c), 'Главная: «Замер» — светлая главная кнопка');
ok(!/text-shadow|drop-shadow|#30d158|(?<!backdrop-filter: )blur\(/.test(c), 'без свечения');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v146 OK');
