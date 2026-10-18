// v162: запуск играет при каждом новом открытии Mini App (Telegram держит sessionStorage WebView), не глушится q-low, пропуск — только явные ссылки.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const root = new URL('../../', import.meta.url); const rd = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js'); const tma = rd('tma.js');
const L = app.slice(app.indexOf('(function setupLaunch'), app.indexOf('renderTracks();\napplyCarUI();'));
ok(/const APP_VERSION = 'v1(6[2-9]|[7-9]\d)'/.test(app) && /const CACHE = 'pitlane-v1(6[2-9]|[7-9]\d)'/.test(sw) && /'v161', 'v162'/.test(app), 'версия v162');
ok(/if \(isTMA && tmaInitData\) \{ const q = new URLSearchParams\(tmaInitData\); return 'tg:' \+ \(q\.get\('auth_date'\)/.test(L), 'ключ запуска в Telegram — auth_date + подпись initData (меняются при каждом открытии)');
ok(/seen = launchId === 'tg:same' \? !!v : v === launchId/.test(L) && /sessionStorage\.setItem\(KEY, launchId\)/.test(L), 'старый флаг «1» в sessionStorage WebView больше не глушит новый запуск');
ok(/nav\.type !== 'navigate'/.test(L) && /new URL\(document\.referrer\)\.origin === location\.origin/.test(L), 'запуск без initData: новая навигация — играет, возврат со своих страниц / reload — нет');
ok(!/motionReduced\(\)/.test(L) && !/q-low/.test(L.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')) && /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/.test(L), 'отключает только системное «Уменьшить движение», не эвристика q-low');
ok(!/html\.q-low \.ln61/.test(css), 'CSS: q-low не прячет запуск');
ok(/animation: ln61-gone 1ms linear 20s forwards/.test(css), 'страховка 20 с — холодный запуск в Telegram (SDK до 3,5 с + app.js) успевает');
ok(/deepSkip = !!getDeepLinkView\(\)\.skipIntro/.test(L) && /return \{ view, skipIntro: skipFlag \|\| !!view \}/.test(app) && /if \(!DEEP_VIEWS\.has\(view\)\) view = '';/.test(app) && !/tgWebApp/.test(app.slice(app.indexOf('function getDeepLinkView'), app.indexOf('function clearDeepLinkUrl'))), 'пропуск — только явные ?view= / skipIntro (служебные tgWebApp* не считаются)');
ok(/else if \(r\.kind === 'track'\) \{ q\.set\('view', 'lap'\); q\.set\('skipIntro', '1'\); \}/.test(tma) && !/r\.kind === 'duel'\) [^\n]*skipIntro/.test(tma), 'startapp=track_/tops_ — явная ссылка (пропуск), duel/crew/обычный запуск — с анимацией');
ok(/window\.__ln61 = \{ launchId, seen, deepSkip, reduceMotion \}/.test(L), 'диагностика причины пропуска');
console.log(fails ? `FAIL ${fails}` : 'v162 OK'); process.exit(fails ? 1 : 0);
