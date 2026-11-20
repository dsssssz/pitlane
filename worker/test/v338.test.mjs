// v338: Nextmove pink glow + 120 Hz tab spring. node test/v338.test.mjs
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
const v338 = css.slice(css.lastIndexOf('===== v338:'));

console.log('[version]');
ok(/const APP_VERSION = 'v338'/.test(app), 'APP_VERSION v338');
ok(/const CACHE = 'pitlane-v338'/.test(sw), 'SW cache pitlane-v338');

console.log('[glow]');
ok(exists('img/tab-glow.png'), 'pre-rendered glow PNG');
ok(/#E41F85/.test(v338) && /tab-glow\.png/.test(v338), 'glow uses sampled #E41F85 and PNG layer');
ok(/\.\/img\/tab-glow\.png/.test(sw), 'SW precaches glow');
ok(/n3-glow/.test(html) && /n3-glow/.test(v338), 'glow is a separate layer inside the blob');
ok(/will-change: transform/.test(v338) && !/box-shadow[\s\S]{0,40}transition/.test(v338), 'compositor-only: no animated shadow');

console.log('[spring]');
ok(/const K = 260, D = 30/.test(app), 'critically-damped k=260 d=30');
ok(/requestAnimationFrame\(tick\)/.test(app) && /\/ 1000/.test(app), 'dt-based rAF, not a CSS duration');
ok(/pointerdown/.test(app.slice(app.indexOf('v338: 120 Hz'))) && /is-press/.test(app), 'starts on pointerdown, press 0.96');
ok(/__n3BlobDrag/.test(app) && /__n3BlobRelease/.test(app), 'swipe drags the highlight then springs to rest');
ok(/scaleX\(/ .test(app) && /sv \/ 900/.test(app), 'liquid stretch along motion');
ok(/cacheSlots/.test(app), 'no layout reads in the rAF hot path');

console.log('[kept]');
ok(/background: #000 !important/.test(css), 'pure black ground kept');
ok(/data-n3="zamer"/.test(html) && !/data-n3="lap"/.test(html.slice(html.indexOf('id="nav3"'), html.indexOf('id="n3Fab"'))), '4 tabs, Track not in the bar');
ok(/data-act="lap"/.test(html), 'Track still in +');

console.log(fails ? 'FAIL ' + fails : 'OK');
process.exit(fails ? 1 : 0);
