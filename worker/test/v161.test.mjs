// v161: запуск «панели расходятся», все старые входы → новые экраны, Журнал (замеры + сессии + дуэли), сессия на Треке, консолидация старых слоёв CSS.
import fs from 'fs'; import { execFileSync } from 'child_process'; import os from 'os'; import path from 'path';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const rd = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const html = rd('index.html'); const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js'); const tips = rd('tips.js'); const jn = rd('journal.js');
const sys = css.slice(css.indexOf('/* ===== v161'));
const base = css.slice(0, css.indexOf('/* ===== v159 DESIGN SYSTEM'));

// версия
ok(/const APP_VERSION = 'v1(6[1-9]|[7-9]\d)'/.test(app) && /const CACHE = 'pitlane-v1(6[1-9]|[7-9]\d)'/.test(sw) && /'\.\/journal\.js'/.test(sw) && /'v160', 'v161'/.test(app), 'версия v161, Журнал в офлайн-кэше');
// синтаксис модулей (как их грузит браузер — ES-модули)
for (const f of ['app.js', 'journal.js', 'tips.js', 'motion.js']) {
  const tmp = path.join(os.tmpdir(), 'pl161-' + f.replace('.js', '.mjs')); fs.writeFileSync(tmp, rd(f));
  let good = true; try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); } catch (_) { good = false; }
  ok(good, 'синтаксис ' + f);
}
ok(fs.statSync(new URL('journal.js', root)).size < 12000, 'journal.js < 12 КБ (грузится только при входе в Журнал)');
ok(/_jnMod = _jnMod \|\| await import\('\.\/journal\.js'\)/.test(app) && !/^import[^\n]*journal\.js/m.test(app), 'Журнал — ленивый модуль');

// 1. запуск
ok(!/id="intro"/.test(html) && !/intro-mark-svg|introChevronGlow/.test(html), 'старая заставка удалена из разметки');
ok(!/[.#]intro[\w-]*\s*[{,]/.test(css) && !/\.intro-/.test(css), 'и её стили');
ok(/<div id="launch" class="ln61"[^>]*aria-hidden="true">\s*<i class="ln61-p ln61-t"><b class="ln61-mark">PITLANE<\/b><\/i>\s*<i class="ln61-p ln61-b"><small class="ln61-sub">[^<]+<\/small><\/i>\s*<i class="ln61-line"><\/i>/.test(html), 'запуск: две панели (слово — на верхней, подпись — на нижней) и волосок');
{ const kf = [...sys.matchAll(/@keyframes (ln61[\w-]*) \{([\s\S]*?)\}\s*\}/g)]; const props = kf.map((m) => m[2]).join(' ').match(/[\w-]+(?=\s*:)/g) || [];
  ok(kf.length >= 7 && props.every((p) => p === 'opacity' || p === 'transform'), 'запуск анимирует только transform/opacity (' + kf.length + ' keyframes)'); }
ok(/@keyframes ln61-line \{ 0% \{ transform: scaleX\(0\)/.test(sys) && /\.ln61\.go \.ln61-t \{ animation: ln61-up 520ms[^;]*540ms both; \}/.test(sys) && /@keyframes ln61-up \{ from \{ transform: none; \} to \{ transform: translateY\(-100%\); \} \}/.test(sys) && /@keyframes ln61-dn [^\n]*translateY\(100%\)/.test(sys), 'волосок из центра, затем панели расходятся вверх/вниз');
ok(/const LN61 = \{ T: 1100, UI: 560 \}/.test(app) && 540 + 520 <= 1100, 'весь запуск ≤ 1,1 с (< 1,2 с)');
ok(/html\.ln61-ui \.brand-bar > \* \{ animation: ln61-hdr/.test(sys) && /@keyframes ln61-hdr \{ from \{ opacity: 0; transform: translateY\(32px\)/.test(sys) && /@keyframes ln61-nav \{ from \{ opacity: 0; transform: translateY\(-32px\)/.test(sys) && /html\.ln61-ui \.view\.active > \* \{ animation: ln61-in/.test(sys), 'шапка, панель и контент разъезжаются по местам от центральной линии');
ok(/const KEY = 'pitlane-intro-seen'/.test(app) && /sessionStorage\.getItem\(KEY\)/.test(app) && /sessionStorage\.setItem\(KEY, launchId\)/.test(app), 'раз за запуск (не на каждой вкладке; v162 — ключ запуска)');
ok(/el\.addEventListener\('pointerdown', skip, \{ once: true \}\)/.test(app) && /\.ln61\.skip [^{]*\{ animation: ln61-fade 160ms/.test(sys), 'тап — пропустить (160 мс)');
ok(/if \(seen \|\| deepSkip \|\| reduceMotion\) \{ finish\(\); return; \}/.test(app) && /prefers-reduced-motion: reduce\) \{ \.ln61 \{ display: none !important; \}/.test(sys), 'reduced-motion — без анимации (v162: q-low больше не отключает)');
ok(/animation: ln61-gone 1ms linear (6|20)s forwards/.test(sys), 'страховка: без скрипта экран запуска уходит сам');
ok(/introBlocking3d = false;/.test(app.slice(app.indexOf('function setupLaunch'), app.indexOf('function setupLaunch') + 1500)), '3D ждёт конца запуска, как раньше');

// 2. старые входы
ok(/const VIEW_ALIAS61 = \{ run: 'zamer', cars: 'garage', journal: 'history'/.test(app) && /function goToView\(id, opts = \{\}\) \{\n  id = VIEW_ALIAS61\[id\] \|\| id;/.test(app), 'маршрут run → Замер, cars → Гараж (все вызовы goToView)');
ok(!/ride-seg/.test(html) && !/class="seg-btn[^"]*" data-view="run"/.test(html), 'сегмент «Замер / Круг» со старым экраном удалён');
ok(/<section id="view-run" class="view v61-legacy" hidden aria-hidden="true">/.test(html) && /#view-run, html\.v159:not\(#_\):not\(#_\) #view-cars \{ display: none !important; \}/.test(sys), 'старый спидометр и «Парк» не показываются');
ok(!/#view-run\b|\.ride-seg\b|\.l53-open\b/.test(base), 'стили старых экранов удалены');
ok(/'zamer', 'history', 'journal'\]\)/.test(app), 'deep links ?view=zamer / history');
ok(!/view=run/.test(rd('zamer.html')) && /view=zamer/.test(rd('zamer.html')) && !/view=run/.test(rd('manifest.json')) && /background: #000/.test(rd('zamer.html')), 'иконка «Замер» и ярлык PWA → новый Замер');
ok(/else if \(k === 'history'\) journalGo61\(\);/.test(app) && !/goToView\('run'\); scrollTo\('runHistory'\)/.test(app), '«Мои замеры» → Журнал');
ok(/<span>Журнал<small>замеры, сессии, дуэли<\/small><\/span>/.test(html), 'меню ☰: «Журнал»');
ok(/`\.nav3-btn\[data-n3="\$\{v\}"\]`/.test(tips) && !/#runIdleCard|#trackWheel|#homeGoBtn/.test(tips) && /zamer: \[\{ target: '#h48Start'/.test(tips), 'подсказки указывают на новые экраны');

// 3. Журнал
ok(/<section id="view-history" class="view jn61" aria-label="Журнал">/.test(html) && /id="jnHost"/.test(html), 'экран «Журнал»');
{ const h = html.slice(html.indexOf('<section id="view-history"'), html.indexOf('<!-- v158: Магазин'));
  ok(['lapAnalyticsCard', 'trackHistCard', 'sectorBattleCard', 'compareCard', 'trackDayList', 'lapList', 'btnShareRun', 'btnVideoRun', 'runHistory'].every((id) => h.includes(`id="${id}"`)), 'история, аналитика, битва секторов, сравнение, track-day, все круги и слипы — в Журнале'); }
{ const z = html.slice(html.indexOf('<section id="view-zamer"'), html.indexOf('<section id="view-garage"'));
  ok(z.includes('id="runGhostPick"') && z.includes('id="z61Gps"') && z.includes('data-view="history" data-jf="run"'), 'Замер: строки «Источник GPS», «Призрак», «Журнал замеров»'); }
ok(/<div class="ds-sheet hidden" id="gps61"[\s\S]{0,900}id="extGpsCard"/.test(html) && /\['gps61', 'gps61Close'\]/.test(app), 'источник GPS — шторка (Замер и Трек), закрывается BackButton');
const J = await import(new URL('journal.js', root));
{ const L = (ms, at, extra = {}) => ({ ms, at, valid: true, how: 'gate', ...extra });
  const day = [L(100000, 1e9), L(99000, 1e9 + 1e5)];
  const st = { slips: [{ car: 'M2', v0100: 4.2, v100200: 8.1, at: 2e9 }], dragBest: { m2: { '0-100': { t: 4.2, at: 2e9 }, '402m': { t: 12.4, at: 1.5e9, gpsQ: 'A' } } },
    trackDays: [{ trackId: 'sochi', at: 1e9, n: 2, bestMs: 99000, laps: day }],
    laps: { sochi: [...day, L(101000, 3e9), L(98000, 3e9 + 2e5), L(97000, 3e9 + 99e6, { how: 'manual' })] } };
  const D = { state: st, tracks: [{ id: 'sochi', name: 'Сочи' }], fmtLap: (ms) => (ms / 1000).toFixed(2), carName: () => 'M2', duelType: () => '0–100', duelStatus: () => 'идёт', duelVs: () => 'A — B' };
  const e = J.buildEntries(D, [{ id: 'd1', createdAt: 2.5e9, status: 'open' }]);
  const runs = e.filter((x) => x.kind === 'run'); const laps = e.filter((x) => x.kind === 'lap'); const duels = e.filter((x) => x.kind === 'duel');
  ok(runs.length === 2 && runs.some((r) => r.label === '402 м' && r.pb) && runs.some((r) => r.latest && r.main === '4.20'), 'замеры: слипы + рекорды без дублей');
  ok(laps.length === 3 && laps.filter((x) => x.trackId === 'sochi' && x.idx === 0).length === 1, 'круги: сохранённая сессия + свободные круги склеены по времени (45 мин), без дублей');
  ok(laps.find((x) => x.bestMs === 98000)?.pb === true && !laps.find((x) => x.bestMs === 99000)?.pb, 'лучшая сессия трассы отмечена');
  ok(laps.some((x) => x.laps.length === 1 && x.bestMs === 97000) && laps.find((x) => x.laps.length === 1).sub === '1 круг · в зачёт 0', 'ручной финиш не в зачёт');
  ok(duels.length === 1 && duels[0].id === 'd1', 'дуэли в той же ленте');
  ok(e.every((x, i) => i === 0 || e[i - 1].at >= x.at), 'новое — сверху');
  ok(J.journalFilter() === 'all', 'фильтр по умолчанию — «Все»'); }
ok(/KINDS = \[\['all', 'Все'\], \['run', 'Замеры'\], \['lap', 'Круги'\], \['duel', 'Дуэли'\]\]/.test(jn) && /add\('Итог сессии', \(\) => D\.openSummary/.test(jn) && /add\('Разбор', \(\) => D\.openReview/.test(jn) && /add\('Аналитика'/.test(jn) && /add\('Открыть дуэль'/.test(jn) && /add\('Поделиться слипом'/.test(jn), 'фильтры и действия: итог, разбор, аналитика, дуэль, слип');
ok(!/innerHTML/.test(jn), 'Журнал — только textContent');
ok(/\$P \.jn-v|html\.v159:not\(#_\):not\(#_\) \.jn-v \{ font: 300 28px\/1 var\(--font-num\)/.test(sys) && /\.jn-day \{ font: var\(--t-label\)/.test(sys), 'Журнал в системе: лёгкие табличные цифры, подписи-капс');

// 3b. сессия на Треке
ok(/'lap\.start':'Начать сессию'/.test(app) && /class="t61-sess"/.test(html) && /id="t61Gps"/.test(html) && /data-view="history" data-jf="lap"/.test(html), 'Трек: трасса → параметры сессии строками → «Начать сессию»');
ok(/#view-lap \.lap-start-hero \{ width: 100% !important; height: 56px[^}]*border-radius: var\(--r1\) !important; background: var\(--ds-light\)/.test(sys), '«Начать сессию» — плоская светлая кнопка');
ok(!/lap-howto|l53More/.test(html) && /<section class="card ts-card t61-suggest" id="trackSuggestCard">/.test(html), 'старые «как это работает» и «История и аналитика» убраны, «Предложить трассу» на месте');
// 3c. перелёт машины
ok(/\{ dur: 520, ease: 'cubic-bezier\(\.45, 0, \.2, 1\)' \}\); \} catch \(_\) \{\} \}\);/.test(app) && /ease: easeIn = ''/.test(rd('motion.js')), 'Главная → Гараж: перелёт 520 мс, ровная кривая');

// 3d. консолидация старых слоёв
ok(!/html\.v153 \.h48-start\.h53-press/.test(css) && /html\.v156 \.h48-start\.h53-press/.test(css), 'переопределённые объявления старых слоёв сняты (v148–v156 — один слой)');
{ const outside = base.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '');
  ok(!/#9ecdb0|rgba\(\s*158\s*,\s*205\s*,\s*176/i.test(outside), 'мятный в старых слоях — только через токен'); }
ok((base.match(/var\(--ds-(text|sub|mute|bg|bg-1|bg-2|line|line-2|line-3|acc)\)/g) || []).length > 300, 'старые слои ссылаются на токены (' + (base.match(/var\(--ds-/g) || []).length + ')');

console.log(fails ? `FAIL ${fails}` : 'v161 OK'); process.exit(fails ? 1 : 0);
