// v159: одна система интерфейса — токены в одном месте, один шрифт (Inter OFL, самохост), старые слои без «кожи».
import fs from 'fs';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x ?? '')); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const html = R('index.html'); const app = R('app.js'); const css = R('styles.css'); const sw = R('sw.js'); const legal = R('legal.css'); const method = R('method.html');
const noC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const sysAt = css.indexOf('/* ===== v159 DESIGN SYSTEM'); const sys = css.slice(sysAt); const base = noC(css.slice(0, sysAt));
ok(/const CACHE = 'pitlane-v1(59|[6-9]\d)'/.test(sw) && /APP_VERSION = 'v1(59|[6-9]\d)'/.test(app) && /'v158', 'v159'[,)]/.test(app) && /<html lang="ru" class="v159">/.test(html), 'версия ≥ v159, класс системы сразу в <html>');
console.log('[токены — одно место]');
ok(css.indexOf('/* ===== v159 TOKENS') >= 0 && css.indexOf('/* ===== v159 TOKENS') < 200, 'токены — в начале файла');
for (const t of ['--ds-bg: #000', '--ds-bg-1: #0a0a0a', '--ds-line: rgba(255,255,255,.08)', '--ds-sub: #8a8a8a', '--ds-acc: rgb(var(--acc-rgb))', '--gutter: 24px', '--s1: 8px', '--r1: 4px', '--r3: 8px', '--ds-t: 200ms']) ok(css.includes(t), 'токен ' + t);
{ const roots = noC(css).match(/:root\s*\{[^}]*\}/g) || []; const defs = roots.join('').match(/--(c|h|r|sp|sh)-[a-z0-9-]+:/g) || []; ok(defs.length > 0 && new Set(defs).size === defs.length, 'старые имена токенов определены один раз (алиасы на систему)', defs.length + ' / ' + new Set(defs).size); }
ok(!/--h-card:\s*linear-gradient/.test(css) && /--h-card: transparent/.test(css) && /--sh-1: none; --sh-2: none/.test(css), 'карточки и тени старых слоёв сведены к токенам системы');
console.log('[шрифт]');
ok(/@font-face \{ font-family: "PL Sans"; src: url\("\.\/fonts\/pl-sans\.woff2"\)/.test(css) && /--font-ui: "PL Sans"/.test(css), 'один шрифт: PL Sans (Inter) для текста');
ok(!/fonts\.googleapis\.com\/css2/.test(html) && !/fonts\.googleapis\.com\/css2/.test(method) && /rel="preload" href="\.\/fonts\/pl-sans\.woff2"/.test(html), 'без Google Fonts, шрифт предзагружается');
ok(!/Manrope|Barlow/.test(noC(css)) && !/Manrope|Barlow/.test(legal) && !/Manrope/.test(app) && !/Manrope/.test(R('video-tele.js')) && !/Manrope/.test(R('run-marks.js')), 'Manrope/Barlow больше нигде не используются');
console.log('[старые слои без «кожи»]');
{ const sh = [...base.matchAll(/box-shadow:\s*([^;}]+)/g)].map((m) => m[1].trim()).map((v) => v.replace(/\([^()]*\)/g, '()')).filter((v) => !/^none/.test(v) && !v.split(',').every((p) => /^\s*inset 0 0 0 1px /.test(p)) && !/^var\(--sh-\d\)/.test(v));
  ok(sh.length === 0, 'тени остались только как кольца-волоски (inset 0 0 0 1px)', sh.slice(0, 5)); }
ok(!/text-shadow\s*:\s*(?!none)/.test(noC(css)) && !/drop-shadow\(/.test(noC(css)), 'нет text-shadow и drop-shadow во всём файле');
{ const big = [...noC(css).matchAll(/border(?:-(?:top|bottom)-(?:left|right))?-radius:\s*([^;}]+)/g)].map((m) => m[1]).filter((v) => (v.match(/(\d*\.?\d+)px/g) || []).some((x) => { const n = parseFloat(x); return n > 8 && n < 60; }));
  ok(big.length === 0, 'радиусы 4–8 px (кроме кругов и пилюль-индикаторов)', big.slice(0, 5)); }
ok(!/\.run-secondary \{ margin-top: 12px; \}\s*\}/.test(css), 'лишняя «}» (ломала следующее правило) убрана');
console.log('[система]');
ok(/\$P|html\.v159:not\(#_\):not\(#_\)/.test(sys) && (sys.match(/html\.v159:not\(#_\):not\(#_\)/g) || []).length > 200, 'один слой системы с единым весом');
ok(!/gradient\(/.test(noC(sys).replace(/\.bn52-s::after \{[^}]*\}/, '')), 'в системе нет градиентов (кроме функционального скрима под текстом на фото)');
ok(!/text-shadow|drop-shadow|(?<!backdrop-filter: )blur\(|orange|#ff9|#30d158|0 0 \d+px/.test(sys), 'без свечения, blur — только функциональный backdrop');
ok([...sys.matchAll(/backdrop-filter: blur/g)].length <= 4 && /\.brand-bar \{[^}]*backdrop-filter: blur\(16px\)/.test(sys) && /\.nav3 \{[^}]*backdrop-filter: blur\(16px\)/.test(sys), 'размытие только у шапки и панели');
ok(/\.hw-k, html\.v159[^{]*\{\s*font: var\(--t-label\) !important; letter-spacing: \.08em !important; text-transform: uppercase !important; color: var\(--ds-sub\)/.test(sys), 'подписи разделов: 11px, капс, трекинг .08em, серый');
ok(/#app \.card, html\.v159[^{]*\{\s*background: transparent !important; border: 0 !important; border-top: 1px solid var\(--ds-line\)/.test(sys), 'без карточек — волосок сверху');
ok(/\.go-btn, html\.v159[^{]*\{\s*background: var\(--ds-light\) !important; color: var\(--ds-on-light\) !important;[^}]*border-radius: var\(--r1\)/.test(sys), 'основная кнопка: плоская светлая, прямоугольная');
ok(/\.btn-secondary, html\.v159[^{]*\{\s*background: transparent !important; color: var\(--ds-text\) !important; border: 1px solid var\(--ds-line-2\)/.test(sys), 'вторичная: тонкий контур');
ok(/\.nav3-btn\.on::before \{ transform: scaleX\(1\); \}/.test(sys) && /\.nav3-btn::before \{[^}]*background: var\(--ds-acc\)/.test(sys), 'акцент — индикатор активной вкладки');
ok(/\.lh58\[data-tone="better"\] \.lh58-dv \{ color: var\(--ds-good\); \}/.test(sys) && /\.lh58\[data-tone="worse"\] \.lh58-dv \{ color: var\(--ds-bad\); \}/.test(sys), 'зелёный/красный — только дельты');
ok(/\.view \{ padding-left: var\(--gutter\) !important; padding-right: var\(--gutter\) !important; \}/.test(sys), 'единые поля экранов 24 px');
ok(/@keyframes ds-view \{ from \{ opacity: 0; transform: translateY\(4px\); \}/.test(sys) && /prefers-reduced-motion: reduce\) \{[^}]*\.view\.active \{ animation: none; \}/.test(sys), 'движение: 200 мс fade/slide, уважает reduced-motion');
for (const s of ['.brand-bar', '.nav3', '#hwStats', '.h48-start', '.run-drive', '.tk58-c', '.lh58-delta', '.ls58-hero', '#view-shop .shop-grid', '.g53-hero', '.prof-banner', '.plm-panel', '.tgs-panel', '.seg-control', '.tb-row']) ok(sys.includes(s), 'система покрывает ' + s);
console.log('[справочник]');
ok(fs.existsSync(new URL('tools/design-system.html', root)) && /var\(--ds-acc\)/.test(R('tools/design-system.html')), 'tools/design-system.html — живой справочник на тех же токенах');
console.log(fails ? `FAIL ${fails}` : 'OK v159'); process.exit(fails ? 1 : 0);
