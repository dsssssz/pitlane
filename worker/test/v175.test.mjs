// v175: логотип PITLANE (дуга + геометрический знак) — шапка, запуск, иконки, бот, дизайн-система; perf-хуки 3D.
import fs from 'fs'; import path from 'path';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x || '')); if (!c) fails++; };
const ROOT = new URL('../../', import.meta.url).pathname;
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js'); const html = rd('index.html');
ok(/const APP_VERSION = 'v1(7[5-9]|[89]\d)'/.test(app) && /const CACHE = 'pitlane-v1(7[5-9]|[89]\d)'/.test(sw) && /'v174', 'v175'/.test(app), 'версия v175');
const logo = rd('img/logo/pitlane-logo.svg');
ok(/fill="#(c9c6bf|e12323)"/.test(logo) && /fill="#f2efe9"/.test(logo) && !/gradient|filter|<text/i.test(logo), 'логотип: платиновая дуга, тёплый белый знак, контуры (не шрифт), без градиента/свечения');
ok(/<b class="bb-logo" role="img" aria-label="PITLANE"><svg[^>]*>.*class="lg-arc".*class="lg-word"/.test(html), 'шапка: SVG-логотип с дугой');
ok(/\.brand-bar b\.bb-logo::after \{ content: none/.test(css), 'старая мятная/платиновая линия под словом убрана');
ok(/class="ln61-arc"/.test(html) && /\.ln61\.go \.ln61-arc \{ animation: ln75-arc/.test(css) && /\.ln61\.go \.ln61-word \{ animation: ln61-mark 420ms var\(--ds-ease\) 300ms/.test(css), 'запуск: сначала дуга, потом знак, затем раскрытие панелей');
ok(/<circle cx="256" cy="256" r="236" fill="#1c1c1e"\/>/.test(rd('favicon.svg')) && fs.statSync(path.join(ROOT, 'img/favicon-32.png')).size <= 597, 'favicon/иконки — логотип в круге на #0a0a0a');
ok(fs.existsSync(path.join(ROOT, 'img/tg/avatar.png')) && /img\/logo\/pitlane-logo\.svg/.test(rd('tools/tg-banner.mjs')) && /pitlane-logo\.svg/.test(rd('tools/design-system.html')), 'аватар/баннер бота и дизайн-система с логотипом');
ok(/stats: \(n = 20\)/.test(app) && /dump: \(\) =>/.test(app), 'perf-хуки 3D для замеров');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v175 OK');
