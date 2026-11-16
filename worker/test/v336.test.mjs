// v336: S4 B4 ground, 4-tab D dock, Track in the + grid. node test/v336.test.mjs
import fs from 'fs';
let fails = 0;
const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x ?? '')); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const exists = (f) => fs.existsSync(new URL(f, root));
const app = R('app.js');
const css = R('styles.css');
const html = R('index.html');
const sw = R('sw.js');
const tma = R('tma.js');
const man = R('manifest.json');

console.log('[version]');
ok(/const APP_VERSION = 'v336'/.test(app), 'APP_VERSION v336');
ok(/const CACHE = 'pitlane-v336'/.test(sw), 'SW cache pitlane-v336');
ok(/<meta name="theme-color" content="#101214"/.test(html), 'theme-color #101214');
ok(/"theme_color": "#101214"/.test(man) && /"background_color": "#101214"/.test(man), 'manifest theme #101214');
ok(/const THEME = '#101214'/.test(tma), 'Telegram THEME #101214');

console.log('[palette]');
ok(/--pl-s0: #101214/.test(css) && /--pl-t1: #F0F1F2/.test(css) && /--pl-t2: #909396/.test(css), 'S4 ground + text tokens');
ok(/--pl-acc: #D3262E/.test(css) && /--pl-s2: #1E2023/.test(css), 'S4 accent and glass colour');
ok(!/#9A1F33/.test(css) && !/#A8233B/.test(css), 'v335 burgundy hexes removed from CSS');

console.log('[background]');
ok(exists('img/bg-b4.webp') && exists('img/bg-b4.avif'), 'B4 webp + avif present');
ok(/url\('\.\/img\/bg-b4\.webp'\)/.test(css) && /url\('\.\/img\/bg-b4\.avif'\)/.test(css), 'CSS image-set points at B4');
ok(/position:\s*fixed/.test(css.slice(css.indexOf('.pl-bg'))) && !/filter:\s*blur/.test(css.slice(css.indexOf('.pl-bg'), css.indexOf('.pl-bg') + 800)), 'fixed bg, no runtime blur');
ok(/\.\/img\/bg-b4\.webp/.test(sw) && /\.\/img\/bg-b4\.avif/.test(sw), 'SW precaches B4');

console.log('[tab bar + plus]');
const nav = html.slice(html.indexOf('id="nav3"'), html.indexOf('id="n3Fab"'));
ok(/data-n3="zamer"/.test(nav) && /data-n3="tops"/.test(nav) && /data-n3="pulse"/.test(nav) && /data-n3="shop"/.test(nav), 'four tabs: Замер / Топы / Чат / Магазин');
ok(!/data-n3="lap"/.test(nav), 'Track is not a tab button');
ok(/id="n3Fab"/.test(html) && /id="n3Grid"/.test(html), '+ button and grid exist');
const grid = html.slice(html.indexOf('id="n3Grid"'), html.indexOf('id="n3Grid"') + 1800);
ok(/data-act="lap"/.test(grid) && grid.indexOf('data-act="lap"') < grid.indexOf('data-act="zamer"'), 'Track is the first + action');
ok(/data-act="zamer"/.test(grid) && /data-act="duel"/.test(grid) && /data-act="car"/.test(grid) && /data-act="share"/.test(grid), '+ grid keeps existing actions');
ok(/goToView\(act\)/.test(app) && /openDuelSheet\(\{ createOnly: true \}\)/.test(app) && /openMyCarSheet/.test(app), 'actions call existing app functions');
ok(/const ORDER = \['zamer', 'lap', 'tops', 'pulse', 'shop'\]/.test(app), 'swipe order still includes lap');
ok(/window\.__n3Plus/.test(app) && /cubic-bezier\(\.22, 1\.2, \.36, 1\)/.test(css), 'spring open + test hook');

console.log(fails ? 'FAIL ' + fails : 'OK');
process.exit(fails ? 1 : 0);
