// v133: без зелёного неона — ни ярко-зелёных цветов, ни green glow (box/text-shadow, drop-shadow, canvas shadowBlur, SVG blur).
// Палитра: графит + приглушённый мятный акцент (--acc-rgb), светлая графитовая заливка главных кнопок (--c-fill), приглушённые дельты.
// node test/v133.test.mjs
import fs from 'fs';
let fails = 0; const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } };
const R = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const COL = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b|%23(?:[0-9a-f]{6})\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)|\blime\b|\bchartreuse\b|0x[0-9a-f]{6}\b/gi;
function hls(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; if (mx === mn) return [0, l, 0]; const d = mx - mn; const s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, l, s]; }
function rgbOf(s) { s = s.toLowerCase(); if (s === 'lime' || s === 'chartreuse') return [0, 255, 0]; let h = s.startsWith('%23') ? s.slice(3) : s.startsWith('0x') ? s.slice(2) : s.startsWith('#') ? s.slice(1) : null; if (h) { if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); } return (s.match(/\d+/g) || []).slice(0, 3).map(Number); }
const neon = (s) => { const [h, l, sat] = hls(...rgbOf(s)); return h >= 75 && h <= 165 && sat > .45 && l > .25; };
const noComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
const greensIn = (t) => (noComments(t).match(COL) || []).filter(neon);

// v134: исключение — разбор сессии. Насыщенные зелёный/красный (лучше/хуже) разрешены ТОЛЬКО в правилах,
// где каждый селектор начинается с #sessionSheet, и только через токены --ss-good / --ss-bad (без свечения).
const SS_RULE = /(^|})\s*((?:#sessionSheet\b[^{},]*)(?:,\s*#sessionSheet\b[^{},]*)*)\{([^}]*)\}/g;
const stripSession = (t) => t.replace(SS_RULE, '$1');
const ssRules = []; noComments(R('styles.css')).replace(SS_RULE, (_, a, sel, body) => { ssRules.push([sel.trim(), body]); return _; });
console.log('\n[CSS: ни одного неонового зелёного (кроме разбора сессии)]');
for (const f of ['styles.css', 'legal.css']) ok(greensIn(stripSession(noComments(R(f)))).length === 0, `${f}: нет ярко-зелёных цветов (вкл. 8-значный hex и %23 в SVG-иконках)`, greensIn(R(f)).slice(0, 8));
const css = stripSession(noComments(R('styles.css')));
{
  const greenDecl = ssRules.flatMap(([sel, body]) => body.split(';').filter((d) => (d.match(COL) || []).some(neon)).map((d) => sel + ' {' + d.trim() + '}'));
  ok(greenDecl.length === 1 && /^#sessionSheet \{--ss-good:/.test(greenDecl[0]), 'зелёный в разборе сессии — один токен --ss-good на #sessionSheet', greenDecl);
  ok(ssRules.every(([, b]) => !/shadow|filter/.test(b)), 'разбор сессии: без свечения (ни shadow, ни filter)', ssRules.filter(([, b]) => /shadow|filter/.test(b)));
}
const tok = css.match(/--acc-rgb:\s*(\d+),\s*(\d+),\s*(\d+)/);
ok(!!tok && hls(+tok[1], +tok[2], +tok[3])[2] < .45, 'токен --acc-rgb — приглушённый (насыщенность < 45%)', tok?.slice(1));
ok(/--c-acc:\s*rgb\(var\(--acc-rgb\)\)/.test(css) && /--c-fill:\s*#e8e9ea/.test(css) && /--c-bad:\s*#d49a9a/.test(css) && /--c-good:/.test(css), 'токены: --c-acc из --acc-rgb, --c-fill, --c-good, --c-bad');
ok(!/--c-acc:\s*var\(--c-acc\)/.test(css), 'нет циклической переменной');
for (const v of ['accent', 'gold', 'h-acc']) { const m = css.match(new RegExp('--' + v + ':\\s*([^;]+);', 'g')) || []; ok(m.length && m.every((d) => !(d.match(COL) || []).some(neon)), `--${v} не неон`, m); }

console.log('\n[CSS: без свечения акцентом / цветом]');
const decls = []; css.replace(/(box-shadow|text-shadow|-webkit-box-shadow|filter|-webkit-filter)\s*:\s*([^;{}]+)/g, (_, p, v) => { decls.push([p, v]); return _; });
const colored = (v) => /var\(--(?:hg-glow|acc-rgb|c-acc|accent|gold|h-acc)\b|acc-rgb/.test(v) || (v.match(COL) || []).some((c) => { const [, l, s] = hls(...rgbOf(c)); return s > .4 && l > .15 && !/,\s*0\s*\)$/.test(c); });
const glow = decls.filter(([p, v]) => (/shadow/.test(p) || /drop-shadow/.test(v)) && colored(v));
ok(glow.length === 0, 'box-shadow / text-shadow / drop-shadow — без цветного свечения', glow.slice(0, 6));
ok(!/--hg-glow:\s*rgba\(var/.test(css), '--hg-glow погашен');
const radialAcc = (css.match(/radial-gradient\([^;]*acc-rgb[^;]*/g) || []);
ok(radialAcc.length === 0, 'нет «зелёного света» радиальными градиентами на карточках', radialAcc.slice(0, 3));
ok(!/background(?:-color)?\s*:\s*var\(--(?:accent|gold|h-acc)\)/.test(css), 'главные кнопки не заливаются акцентом (только --c-fill)');
ok(/\.rd-hero-v\s*\{[^}]*color:\s*var\(--h-text\)/.test(css), 'крупное время итога — белое, не акцент');
ok(/\.ss-sec\.loss\s*\{\s*stroke:\s*var\(--c-bad\)/.test(css) && /\.ss-sec\.best\s*\{\s*stroke:\s*var\(--c-acc\)/.test(css), 'базовые .ss-* — приглушённые; насыщенные только в #sessionSheet (v134)');

console.log('\n[JS / HTML]');
const allow = (line) => /data-hex="#39FF14"|id="paintCustom"/.test(line) || /^\s*\{ id: '[\w-]+', name: '[^']+', cls: .*color: 0x/.test(line); // краска машины (данные пользователя), не интерфейс
for (const f of ['app.js', 'run-marks.js', 'plates.js', 'track-sat-map.js', 'session-review.js', 'index.html', 'zamer.html', 'method.html', 'api.js']) {
  const bad = noComments(R(f)).split('\n').filter((L) => !allow(L) && (L.match(COL) || []).some(neon) && !/^\s*\/\//.test(L));
  ok(bad.length === 0, `${f}: нет неонового зелёного`, bad.map((x) => x.trim().slice(0, 140)).slice(0, 5));
}
const rm = R('run-marks.js');
ok(!/shadowBlur\s*=\s*[1-9]/.test(rm) && !/shadowColor\s*=\s*'rgba/.test(rm), 'график: без canvas-свечения');
ok(!/shadowBlur\s*=\s*Math/.test(R('plates.js')), 'номер PITLANE на подиуме: без свечения');
const html = R('index.html');
ok(!/feGaussianBlur/.test(html) && !/introNeon/.test(html), 'заставка: без SVG-blur glow');
ok(/opacity: 0\.04, \/\/ v133/.test(R('app.js')), 'кольцо подиума: без ореола (геометрия прежняя)');
const app = R('app.js'); const sw = R('sw.js');
const ver = Number((app.match(/APP_VERSION = 'v(\d+)'/) || [])[1]);
ok(ver >= 133 && Number((sw.match(/pitlane-v(\d+)/) || [])[1]) === ver, 'APP_VERSION / SW ≥ v133 и совпадают');
const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
ok(/script-src 'self'/.test(csp) && !/unsafe-eval/.test(csp), 'CSP не ослаблен');

console.log(fails ? `\n✗ v133: ${fails} fail(s)` : '\n✓ v133: all ok');
process.exit(fails ? 1 : 0);
