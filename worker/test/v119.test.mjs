// v119: лёгкая загрузка — GLB/three.js/Leaflet не грузятся на первом экране и не докачиваются SW в фоне;
// CSP (script-src 'self' + хэши) не ослаблен — node test/v119.test.mjs
import fs from 'fs';
const R = new URL('../../', import.meta.url).pathname;
const app = fs.readFileSync(R + 'app.js', 'utf8');
const sw = fs.readFileSync(R + 'sw.js', 'utf8');
const html = fs.readFileSync(R + 'index.html', 'utf8');
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x ?? ''); } };

const core = eval(sw.match(/const CORE = (\[[\s\S]*?\]);/)[1]);
ok(!core.some((u) => /\.glb$/.test(u)), 'CORE без GLB');
ok(!core.some((u) => /vendor\/(three|leaflet)/.test(u)), 'CORE без three.js / Leaflet (кэш по первому запросу)');
ok(!/GLB_MODELS|THREE_CDN/.test(sw), 'SW: нет списков фоновой докачки GLB/CDN');
ok(!/activate[\s\S]*softPut\(g,/.test(sw), 'SW activate не качает модели');
ok(/isGlb[\s\S]*GLB_CACHE[\s\S]*put/.test(sw), 'SW кладёт открытую модель в GLB-кэш после загрузки');
let total = 0; for (const u of core) { const p = u === './' ? 'index.html' : u.slice(2); total += fs.statSync(R + p).size; }
ok(total < 3.5e6, 'объём precache < 3,5 МБ', (total / 1e6).toFixed(2) + ' МБ');

ok(!/^import [^;]*from 'three/m.test(app) && !/^import [^;]*from '\.\/plates\.js'/m.test(app), 'app.js: three/plates не импортируются статически');
ok(/import\('three'\)/.test(app) && /import\('\.\/plates\.js'\)/.test(app), 'three/plates — dynamic import');
ok(!/startGlbPrefetch/.test(app), 'фоновая докачка каталога GLB удалена');
ok(/const glbPrefetchDone = true/.test(app), 'замер качества 3D не ждёт несуществующую докачку');
ok(!/<script[^>]+leaflet\.js/.test(html) && !/<link[^>]+leaflet\.css/.test(html), 'index.html: Leaflet не грузится статически');
ok(/vendor\/leaflet\/leaflet\.js/.test(app) && /vendor\/leaflet\/leaflet\.css/.test(app), 'Leaflet вставляется скриптом при первом заходе на карту');

const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
const scriptSrc = (csp.match(/script-src ([^;]+)/) || [])[1] || '';
ok(/^'self'( 'sha256-[^']+')*$/.test(scriptSrc.trim()), "CSP script-src только 'self' + хэши", scriptSrc);
ok(!/unsafe-eval/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp), 'CSP без unsafe-eval / unsafe-inline в скриптах');
ok(!/script-src[^;]*https:/.test(csp), 'CSP script-src без внешних хостов');

const ver = (app.match(/APP_VERSION = '(v\d+)'/) || [])[1];
ok(ver && ver >= 'v119' && sw.includes(`pitlane-${ver}`), 'APP_VERSION = SW CACHE', ver);
console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v119 all passed');
process.exit(fails ? 1 : 0);
