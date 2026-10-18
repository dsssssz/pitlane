// v164: плитки без переполнения, флаг у имени в Гараже, чёткое 3D на iPhone, настройка «Графика», квадратные образцы цвета.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const root = new URL('../../', import.meta.url); const rd = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js'); const html = rd('index.html');
ok(/const APP_VERSION = 'v1(6[4-9]|[7-9]\d)'/.test(app) && /const CACHE = 'pitlane-v1(6[4-9]|[7-9]\d)'/.test(sw) && /'v163', 'v164'/.test(app), 'версия v164');
ok(/#homeWidgets \.hw\[hidden\], html\.v159:not\(#_\):not\(#_\) #view-home #homeWidgets \.hw\[data-empty="1"\]/.test(css) && /#homeWidgets \.hw-empty-cta \{ display: none !important; \}/.test(css), 'скрытые/пустые плитки скрыты, кнопки внутри плитки нет — не вылезает');
ok(/brandOf\(m\.name\)/.test(app) && /g64-flag/.test(app) && /\.g53-name \.g64-flag/.test(css), 'флаг страны у имени в Гараже');
ok(/const Q_KEY = 'pitlane-quality-v2'/.test(app), 'сброс ложного «low» прежнего замера');
ok(/high: \{ dprCap: 3,/.test(app) && /medium: \{ dprCap: 2,/.test(app) && /function q3dDpr\(\)/.test(app) && /renderer\.setPixelRatio\(q3dDpr\(\)\)/.test(app), 'плотность до ×3 (бюджет 2,4 Мп)');
ok(/if \(!podiumShouldRun\(\) \|\| driveIn\)/.test(app) && /if \(d > 250\) \{ qm\.phase = 'idle'; return true; \}/.test(app), 'замер FPS не считает паузы цикла и drive-in');
ok(/if \(qm\.done \|\| Q\.locked \|\|/.test(app) && /function setGfxMode\(m\)/.test(app) && /Q\.locked = true; qm\.done = true/.test(app), 'ручной выбор графики не понижается автоматически');
ok(['auto', 'smooth', 'balance', 'max'].every((k) => html.includes(`data-gfx="${k}"`)) && (html.match(/data-gfx-open/g) || []).length >= 2, 'Графика: 4 варианта, вход в Настройках и в Гараже');
ok(/#colorBar \{ display: grid !important; grid-template-columns: repeat\(8/.test(css) && /#colorBar > button\.on[^{]*\{ outline: 1\.5px solid var\(--ds-acc\) !important; outline-offset: 2px/.test(css) && /#colorBar > button[^{]*\{[^}]*aspect-ratio: 1 \/ 1;[^}]*border-radius: var\(--r1\)/.test(css), 'образцы цвета — квадраты сеткой, выбранный — мятная обводка с отступом');
ok(/\.g53-3d #view-garage \.mycar > \.hero-title \{ display: none !important; \}/.test(css), 'нет дубля имени со стрелками в «Цвет и детали»');
ok(!/^\.g53-3d \{/m.test(css) && /^button\.g53-3d \{/m.test(css), 'класс g53-3d на <html> больше не сдвигает страницу (стиль только у кнопки)');
ok(/#colorBar > button, [^{]*\{[^}]*min-width: 0 !important/.test(css), 'квадраты не распирает старый min-width 44px');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v164 OK');
