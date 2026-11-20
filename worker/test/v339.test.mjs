// v339: expandable tab bar from roman's video. node test/v339.test.mjs
import fs from 'fs';
let fails = 0;
const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x ?? '')); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const app = R('app.js');
const css = R('styles.css');
const html = R('index.html');
const sw = R('sw.js');
const v339 = css.slice(css.lastIndexOf('===== v339:'));
const dock = html.slice(html.indexOf('id="n3Dock"'), html.indexOf('id="n3GridMask"'));

console.log('[version]');
ok(/const APP_VERSION = 'v339'/.test(app), 'APP_VERSION v339');
ok(/const CACHE = 'pitlane-v339'/.test(sw), 'SW cache pitlane-v339');

console.log('[structure]');
ok(/id="n3Pill"/.test(html) && /id="n3Surface"/.test(html) && /id="n3FabIcon"/.test(html), 'one morphing pill + surface + fab icon');
ok(!/id="n3Blob"/.test(html), 'v338 blob/glow removed from HTML');
ok(/data-n3="zamer"/.test(dock) && /data-n3="tops"/.test(dock) && /data-n3="pulse"/.test(dock) && /data-n3="shop"/.test(dock), '4 tabs present');
ok(!/data-n3="lap"/.test(dock), 'Track is not a tab');
ok(/data-act="lap"/.test(dock.split('n3-grid')[1] || dock), 'Track is first in + grid');
ok(['zamer','duel','car','share','profile','settings','journal','ghost','video','help'].every((a) => dock.includes('data-act="'+a+'"')), 'menu2 actions present');
ok(/n3-act-ghost/.test(html), 'BR cell left empty for the X');

console.log('[look]');
ok(/background: #000 !important/.test(css), 'pure black ground kept');
ok(/--n3-pill-h: 48px/.test(v339) && /--n3-open-h: 218px/.test(v339) && /--n3-gap: 7px/.test(v339), 'measured idle/open/gap tokens');
ok(/clip: rect\(0,0,0,0\)/.test(v339), 'idle tabs are icons only (labels visually hidden)');
ok(/rgba\(255, 255, 255, 0\.08\)/.test(v339) && /content: none/.test(v339), 'active tab is a subtle plate, no underline/glow');
ok(!/#E41F85/.test(v339), 'no v338 pink capsule in v339 rules');

console.log('[motion]');
ok(/const K = 196, D = 18\.2/.test(app), 'spring fitted to 0.30s peak / 6.5% overshoot');
ok(/requestAnimationFrame\(tick\)/.test(app) && /\/ 1000/.test(app), 'dt-based rAF');
ok(/pointerdown/.test(app.slice(app.indexOf('v339: expandable'))) && /rotate\(/.test(app), 'starts on pointerdown, plus rotates to X');
ok(/0\.8 \+ 0\.2/.test(app) && /0\.18/.test(app), 'grid fades and scales 0.8→1');

console.log(fails ? 'FAIL ' + fails : 'OK');
process.exit(fails ? 1 : 0);
