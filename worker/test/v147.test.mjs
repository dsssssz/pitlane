// v147: Telegram Mini App — тот же билд; цвета окна = фон, высота/безопасные зоны, haptics только Старт/Стоп, BackButton для оверлеев.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const tma = fs.readFileSync(new URL('../../tma.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const bot = fs.readFileSync(new URL('../src/botcopy.js', import.meta.url), 'utf8');
ok(/APP_URL = 'https:\/\/dsssssz\.github\.io\/pitlane\/'/.test(bot), 'Mini App открывает тот же адрес, что и веб');
ok(/const THEME = '#0b0c0e'/.test(tma) && /setBottomBarColor\(THEME\)/.test(tma) && /disableVerticalSwipes/.test(tma) && /expand\(\)/.test(tma), 'шапка/фон/нижняя панель = #0b0c0e, expand, без вертикальных свайпов');
ok(/viewportStableHeight/.test(tma) && /--tma-vh/.test(css), 'стабильная высота окна');
ok(/HAP_KEYS = new Set\(\['h48Start', 'btnArm', 'runDriveStop'/.test(app) && /if \(isTMA && !_hapKey\) return;/.test(app), 'haptics в Telegram — только Старт/Стоп');
ok(/\['vtSheet', 'vtClose'\], \['shopSheet', 'shopClose'\]/.test(app), 'BackButton закрывает видео и магазин');
ok(!/var\(--tg-theme/.test(css), 'стили не завязаны на тему Telegram');
const c = css.slice(css.indexOf('v147: Telegram Mini App'));
ok(/html\.tma \{ color-scheme: dark; background: (#0b0c0e|var\(--ds-bg-1\)) !important/.test(c), 'светлая тема Telegram не перекрашивает приложение');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v147 OK');
