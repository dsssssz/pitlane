// v156: стеклянный «Старт», переход в спидометр без вспышки, автостарт по GPS.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const html = R('index.html'); const app = R('app.js'); const css = R('styles.css'); const sw = R('sw.js');
const c = css.slice(css.indexOf('/* ===== v156'));
// (1) стекло
{ const g = (c.match(/html\.v156 \.h48-start, html\.v156 #app #view-lap \.lap-start-hero \{[^}]*\}/) || [''])[0];
ok(/rgba\(255,255,255,\.10\)/.test(g) && /backdrop-filter: blur\(20px\) saturate\(1\.6\)/.test(g) && /color: #f4f3f0/.test(g), '«Старт» и «Старт круга»: полупрозрачное стекло, blur + saturate, светлый текст'); }
ok(/\.lap-start-hero::before \{[^}]*padding: 1px;[^}]*linear-gradient\(180deg, rgba\(255,255,255,\.46\)[^}]*mask/.test(c), 'обводка 1px градиентом, верх светлее');
ok(/inset 0 1px 0 rgba\(255,255,255,\.22\)/.test(c), 'тонкий внутренний блик сверху');
ok(/@keyframes s56Sheen \{[^}]*translateX\(-105%\)/.test(c) && /classList\.add\('s56-sheen'\)/.test(app), 'мягкий блик проходит по нажатию');
ok(!/text-shadow|drop-shadow|(?<!backdrop-filter: )blur\(|orange|#ff9|#30d158|0 0 \d+px/.test(c), 'без неона/свечения (blur — только backdrop-filter стекла)');
ok(!/\.h48-start[^{]*\{[^}]*background: #ecebe8/.test(c), 'белой заливки у старта больше нет');
// (2) переход без вспышки
ok(/html\.v156 #runDrive\.rd56-pre \{ visibility: hidden; pointer-events: none; \}/.test(c) && /function rd56Pre\(\)/.test(app) && /if \(on\) \(window\.requestIdleCallback/.test(app), 'спидометр пре-смонтирован скрытым, пока открыт «Замер»');
ok(/if \(!ul \|\| rd56Skip\(ul\)\) return;/.test(app) && /function rd56Skip\(ul\) \{ if \(ul\.dataset\.pre56 !== '1'\) return false;/.test(app), 'на старте сетка не пересобирается');
ok(/body\.run-drive-on\.rd56-anim #app \{ visibility: visible; \}/.test(c) && /rd56-anim'\), 460\)/.test(app), 'страница под кругом не исчезает, пока круг не закрыл экран');
ok(/#runDrive\.rd53-in::before \{ background: rgba\(255,255,255,\.07\); \}/.test(c), 'без белой вспышки (wash — стекло)');
ok(/#runDrive\.rd56-done \.hud-gauge/.test(c) && /el\.classList\.add\('rd56-done'\); el\.classList\.remove\('rd53-in'\);/.test(app), 'входные анимации не перезапускаются после раскрытия');
ok(/will-change: clip-path/.test(c) && !/rd53Clip[^}]*(width|height|top|left):/.test(c), 'только clip-path / opacity / transform, will-change');
ok(/if \(document\.body\.classList\.contains\('run-drive-on'\)\) return; \/\/ v156/.test(app), 'под спидометром «Замер» не перерисовывается');
// (3) автостарт
ok(/id="h56Mode" role="radiogroup"[\s\S]{0,200}data-as56="0"[^>]*>Вручную<[\s\S]{0,120}data-as56="1"[^>]*>Автостарт</.test(html), '«Замер»: режим Вручную / Автостарт');
ok(/ready: \['Готов', /.test(app) && /if \(as56Mode\(\)\) \{ if \(AS56\.wait\) as56Stop\(\); else withSafety\(as56Start\)\(\); return; \}/.test(app), 'в автостарте кнопка = «Готов» (повторно — отмена)');
ok(/if \(AS56\.wait && !run\.armed\) as56Tick\(pos, v, now\);/.test(app) && /run\.rawSeq0 = opts\.rawSeq0 != null \? opts\.rawSeq0 : rawSeq;/.test(app), 'GPS-точки → автостарт; трек с момента остановки');
{ // поведение as56Tick: стоим ≥ 1 с → трогание > 1.5 км/ч две точки подряд
  const src = app.slice(app.indexOf('function as56Tick('), app.indexOf('function as56Fire('));
  const mk = () => { const AS56 = { wait: true, still: [], stillSince: 0, mv: 0 }; let fired = 0; let rawSeq = 0;
    const f = new Function('AS56', 'as56Fire', 'as56Ui', 'getSeq', src.replace(/rawSeq/g, 'getSeq()') + '; return as56Tick;')(AS56, () => { fired++; }, () => {}, () => rawSeq);
    return { tick: (k, t) => { rawSeq++; f({ coords: { speed: k / 3.6 } }, k, t); }, fired: () => fired, AS56 }; };
  let s = mk(); s.tick(0.3, 1000); s.tick(1.8, 1300); s.tick(2, 1600); ok(s.fired() === 0, 'нет срабатывания без остановки ≥ 1 с');
  s = mk(); [1000, 1400, 1800, 2200].forEach((t) => s.tick(0.2, t)); s.tick(1.2, 2500); ok(s.fired() === 0, 'дрожание GPS 1.2 км/ч — не старт');
  s.tick(1.8, 2700); ok(s.fired() === 0, 'одна точка 1.8 км/ч — ещё ждём'); s.tick(2.2, 2900); ok(s.fired() === 1, 'две точки > 1.5 км/ч после остановки — старт');
  s = mk(); [1000, 1500, 2100].forEach((t) => s.tick(0, t)); s.tick(5, 2300); ok(s.fired() === 1, '≥ 4 км/ч — сразу старт');
}
ok(/else \{ rd56Unpre\(\); as56Stop\(\); \}/.test(app), 'ушли с «Замера» — ожидание автостарта снято');
ok(/const CACHE = 'pitlane-v15[6-9]'/.test(sw) && /APP_VERSION = 'v15[6-9]'/.test(app) && /'v155', 'v156'\)/.test(app), 'версия ≥ v156');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v156 OK');
