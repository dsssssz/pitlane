// v340: open panel stays left of the X; one-line labels. node test/v340.test.mjs
import fs from 'fs';
let fails = 0;
const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x ?? '')); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const app = R('app.js');
const css = R('styles.css');
const html = R('index.html');
const sw = R('sw.js');
const v340 = css.slice(css.lastIndexOf('===== v340:'));
const dock = html.slice(html.indexOf('id="n3Dock"'), html.indexOf('id="n3GridMask"'));

console.log('[version]');
ok(/const APP_VERSION = 'v340'/.test(app), 'APP_VERSION v340');
ok(/const CACHE = 'pitlane-v340'/.test(sw), 'SW cache pitlane-v340');

console.log('[labels]');
ok(/<span>Старт<\/span>/.test(dock) && !/Старт замера/.test(dock), 'Старт, not Старт замера');
ok(/<span>Машина<\/span>/.test(dock) && !/Добавить машину/.test(dock), 'Машина, not Добавить машину');
ok(/<span>Видео<\/span>/.test(dock) && !/Видео-замер/.test(dock), 'Видео, not Видео-замер');
ok(/white-space: nowrap/.test(v340), 'labels nowrap');

console.log('[panel vs X]');
ok(/Panel keeps the idle pill/.test(app) && /wIdle/.test(app) && /rightIdle/.test(app), 'panel width stays the pill, right stays the 7px gap');
ok(!/wOpen = dockW/.test(app) && !/rightOpen = 0/.test(app), 'panel no longer grows under the X');
ok(/bottom: 12px !important/.test(v340) && !/bottom: calc\(var\(--n3-fab\)/.test(v340), 'grid fills the pill, not reserved under the X');
ok(/right: calc\(var\(--n3-fab\) \+ var\(--n3-gap\)/.test(v340), 'grid stays inside the pill, not under the X');
ok(/min-width: var\(--n3-fab\)/.test(v340) && /transition: none !important/.test(v340), 'fab is exactly --n3-fab; grid fade has no leftover CSS transition');

console.log('[timing]');
ok(/\(c - 0\.55\) \/ 0\.40/.test(app), 'grid fades in late (after ~100ms, clear by ~200ms)');

console.log('[kept]');
ok(/background: #000 !important/.test(css), 'black ground');
ok(/data-n3="zamer"/.test(dock) && !/data-n3="lap"/.test(dock) && /data-act="lap"/.test(dock), '4 tabs, Track in +');
ok(/n3-act-ghost/.test(html), 'BR cell inside the panel stays empty');

console.log(fails ? 'FAIL ' + fails : 'OK');
process.exit(fails ? 1 : 0);
