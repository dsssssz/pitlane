// v341: video-matched active tab plate + pressed/selected tiles. node test/v341.test.mjs
import fs from 'fs';
let fails = 0;
const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x ?? '')); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const app = R('app.js');
const css = R('styles.css');
const sw = R('sw.js');
const v341 = css.slice(css.lastIndexOf('===== v341:'));

console.log('[version]');
ok(/const APP_VERSION = 'v341'/.test(app), 'APP_VERSION v341');
ok(/const CACHE = 'pitlane-v341'/.test(sw), 'SW cache pitlane-v341');

console.log('[idle plate]');
ok(/display: block !important/.test(v341) && /\.n3-blob \{/.test(v341), 'blob plate is visible');
ok(/rgba\(255, 255, 255, 0\.10\)/.test(v341), 'plate fill sampled to video contrast (0.10 over glass)');
ok(/border-radius: 999px/.test(v341), 'stadium plate');
ok(/\.nav3-btn\.on::before/.test(v341) && /content: none/.test(v341), 'old faint ::before plate is off');
ok(!/window\.__placeN3Blob = function \(\) \{ const b = document\.getElementById\('n3Blob'\); if \(b\) b\.style\.display = 'none'/.test(app), 'blob is not stubbed hidden');
ok(/window\.__placeN3Blob = placeN3Blob/.test(app) && /window\.__n3BlobDrag = function/.test(app), 'existing rAF spring still drives the plate');

console.log('[tiles]');
ok(/rgb\(152, 151, 158\)/.test(v341), 'pressed/selected tile uses sampled Undo grey');
ok(/function syncActOn/.test(app) && /is-on/.test(app) && /is-press/.test(app), 'current-screen selected + pointerdown press');
ok(/press\(act\)/.test(app), 'QA press hook');

console.log('[kept]');
ok(/background: #000 !important/.test(css), 'black ground');
ok(/data-n3="zamer"/.test(R('index.html')) && /data-act="lap"/.test(R('index.html')), '4 tabs, Track in +');

console.log(fails ? 'FAIL ' + fails : 'OK');
process.exit(fails ? 1 : 0);
