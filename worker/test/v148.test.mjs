// v148: Главная = «Старт»; нижняя панель — Замер/Гараж/Профиль; всё остальное доступно из Профиля (Топы и Дуэли первыми).
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
ok(/id="h48Start"[^>]*>Старт</.test(html) && /const sb = document\.getElementById\('h48Start'\)[\s\S]{0,1200}sb\?\.addEventListener\('click', \(\) => \{[\s\S]{0,1400}withSafety\(armRun\)\(\);/.test(app) /* v153: та же логика + анимация */, 'Главная: «Старт» запускает тот же замер (безопасность → armRun)');
const nav = html.slice(html.indexOf('id="nav3"'), html.indexOf('</nav>', html.indexOf('id="nav3"')));
// v152: вкладок стало 4 — Главная / Замер / Гараж / Профиль (Замер, Гараж, Профиль на месте, в том же порядке)
ok((nav.match(/data-n3=/g) || []).length === 4 && /data-n3="home"[\s\S]*Главная[\s\S]*data-n3="zamer"[\s\S]*Замер[\s\S]*data-n3="garage"[\s\S]*Гараж[\s\S]*data-n3="account"[\s\S]*Профиль/.test(nav), 'нижняя панель: Главная / Замер / Гараж / Профиль');
const p = html.slice(html.indexOf('id="p48"'), html.indexOf('</section>', html.indexOf('id="p48"')));
const keys = [...p.matchAll(/data-p48="([a-z]+)"/g)].map((m) => m[1]);
ok(keys[0] === 'tops' && keys[1] === 'duels', 'Профиль: Топы и Дуэли — первые');
for (const k of ['history', 'lap', 'tracks', 'analytics', 'pulse', 'team', 'video', 'suggest', 'shop']) ok(keys.includes(k) && app.includes(`k === '${k}'`), 'из Профиля доступно: ' + k);
const c = css.slice(css.indexOf('v148: Старт / Гараж / Профиль'));
ok(/html\.v148 main, html\.v148\.nav-widgets main \{ padding-bottom: calc\(var\(--n3-h\) \+ var\(--sab, 0px\) \+ 28px\) !important/.test(c), 'контент не уходит под нижнюю панель (высота + safe area)');
ok(/\.nav3-btn\.on \{ color: rgb\(158,205,176\)/.test(c) && /\.h48-start \{[^}]*background: #ecebe8 !important[^}]*text-transform: none/.test(c), 'мята — активный пункт; «Старт» светлый, без капса');
ok(/rd48In \.25s/.test(c) && /prefers-reduced-motion: reduce/.test(c), 'анимация старта 250 мс + reduced-motion');
ok(!/text-shadow|drop-shadow|#30d158|blur\(|orange|#ff9/.test(c), 'без неона/оранжевого');
ok(/html\.v148 \.mycar-bar\.is-empty \.mycar-bar-k \{ color: #75787e/.test(c) && /html\.v148 main > \.brand-bar \{ background: #0b0c0e/.test(c), 'гараж без янтаря, шапка непрозрачная');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v148 OK');
