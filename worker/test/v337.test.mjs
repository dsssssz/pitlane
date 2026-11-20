// v337: pure black ground, sliding tab highlight, 4-tab D dock. node test/v337.test.mjs
import fs from 'fs';
let fails = 0;
const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x ?? '')); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const app = R('app.js');
const css = R('styles.css');
const html = R('index.html');
const sw = R('sw.js');
const tma = R('tma.js');
const man = R('manifest.json');
const v337 = css.slice(css.lastIndexOf('===== v337:'));

console.log('[version]');
ok(/const APP_VERSION = 'v337'/.test(app), 'APP_VERSION v337');
ok(/const CACHE = 'pitlane-v337'/.test(sw), 'SW cache pitlane-v337');
ok(/<meta name="theme-color" content="#000000"/.test(html), 'theme-color #000000');
ok(/"theme_color": "#000000"/.test(man) && /"background_color": "#000000"/.test(man), 'manifest theme #000000');
ok(/const THEME = '#000000'/.test(tma), 'Telegram THEME #000000');

console.log('[background]');
ok(!/id="plBg"/.test(html) && !/bg-b4/.test(html), 'no B4 photo layer or preload in HTML');
ok(!/\.\/img\/bg-b4\.(webp|avif)/.test(sw), 'SW does not precache B4');
ok(!/url\('\.\/img\/bg-b4\.(webp|avif)'\)/.test(css), 'CSS does not load B4');
ok(/--pl-s0: #000000/.test(css) && /html \{ background: #000 !important; \}/.test(css), 'pure black ground');
ok(/--pl-t1: #F0F1F2/.test(css) && /--pl-t2: #909396/.test(css) && /--pl-acc: #D3262E/.test(css), 'S4 text and accent kept');
ok(/--pl-glass: rgba\(30, 32, 35, 0\.72\)/.test(css), 'smoked glass token kept');

console.log('[tab highlight]');
ok(/background: rgba\(255, 255, 255, 0\.08\)/.test(v337), 'smoky plate 0.08');
ok(/inset 0 0 0 1px rgba\(255, 255, 255, 0\.14\)/.test(v337), 'inner light border on plate');
ok(/background: #D3262E/.test(v337) && /box-shadow: 0 0 4px 0\.5px rgba\(211, 38, 46, 0\.40\)/.test(v337), 'crisp scarlet line with soft bloom');
ok(/\.nav3-btn\.on::after \{[\s\S]*display: none !important/.test(v337), 'v336 blotchy drop disabled');
ok(/color: #fff !important/.test(v337) && /color: #909396 !important/.test(v337), 'active white / inactive #909396');
ok(/border: 1px solid rgba\(255, 255, 255, 0\.12\)/.test(v337) && /inset 0 1px 0 rgba\(255, 255, 255, 0\.16\)/.test(v337), 'panel crisp border + top highlight');
ok(/transform 380ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(v337) && /translate3d\(/.test(app), '380ms transform-only spring, no overshoot');
ok(/scale\(0\.96\)/.test(v337), 'press scale 0.96');
ok(/dataset\.pos === key/.test(app), 'skip identical blob targets (no swipe flicker)');

console.log('[tab bar + plus]');
const nav = html.slice(html.indexOf('id="nav3"'), html.indexOf('id="n3Fab"'));
ok(/data-n3="zamer"/.test(nav) && /data-n3="tops"/.test(nav) && /data-n3="pulse"/.test(nav) && /data-n3="shop"/.test(nav), 'four tabs: Замер / Топы / Чат / Магазин');
ok(!/data-n3="lap"/.test(nav), 'Track is not a tab button');
ok(/id="n3Fab"/.test(html) && /id="n3Grid"/.test(html), '+ button and grid exist');
const grid = html.slice(html.indexOf('id="n3Grid"'), html.indexOf('id="n3Grid"') + 1800);
ok(/data-act="lap"/.test(grid) && grid.indexOf('data-act="lap"') < grid.indexOf('data-act="zamer"'), 'Track is the first + action');
ok(/const ORDER = \['zamer', 'lap', 'tops', 'pulse', 'shop'\]/.test(app), 'swipe order still includes lap');
ok(/window\.__n3Plus/.test(app), 'plus test hook');

console.log(fails ? 'FAIL ' + fails : 'OK');
process.exit(fails ? 1 : 0);
