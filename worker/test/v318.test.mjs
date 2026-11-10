// v318: дизайн-токены (одна система), отсчёт 3-2-1 перед замером (только картинка), карточка шейра Strava/дек (1080×1920 и 1080×1350), колода машин (Wallet).
import fs from 'fs';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x ?? '')); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const app = R('app.js'); const css = R('styles.css'); const v = R('v318.js'); const html = R('index.html'); const cr = R('crew-rooms.js');
globalThis.matchMedia = () => ({ matches: true });
const M = await import(new URL('v318.js', root));
const v318css = css.slice(css.indexOf('/* ===== v318'));

console.log('[токены]');
ok(/--pl-s0: #000; --pl-s1: #0d0d0d; --pl-s2: #101010;/.test(css) && /--pl-line: #1a1a1a;/.test(css), 'поверхности #000/#0d0d0d/#101010 и волосяная линия #1a1a1a');
ok(/--pl-t1: #f2efe9;/.test(css) && /--pl-btn: #f2efe9; --pl-on-btn: #0a0a0a;/.test(css) && /--pl-bad: #e10600;/.test(css), 'уровни текста, светлая главная кнопка, красный — только «хуже»');
ok(/--pl-r1:[^;]+;[^}]*--pl-pill: 999px;/.test(css) && /--pl-sp-1: 4px;[^}]*--pl-sp-12: 48px;/.test(css), 'радиусы и шкала отступов');
ok(/--pl-f-huge:/.test(css) && /--pl-f-title:/.test(css) && /--pl-f-label:[^;]+; --pl-ls-label: \.16em;/.test(css), 'шрифты: огромная цифра, заголовок, подпись капсом с разрядкой');
ok(/--accent-cta: var\(--pl-btn\); --accent-signal: var\(--pl-acc\);/.test(css) && /--ds-good: var\(--pl-t1\); --ds-bad: var\(--pl-bad\);/.test(css), 'старые имена указывают на систему: красных CTA и зелёного больше нет');
ok((css.match(/var\(--pl-s[0-4]\)/g) || []).length > 150 && (css.match(/var\(--pl-r[1-5]\)/g) || []).length > 300, 'разбросанные значения заменены токенами', (css.match(/var\(--pl-s[0-4]\)/g) || []).length);
ok(/:is\(\.cta289-go,[^)]*\) \{ background: var\(--pl-btn\) !important; color: var\(--pl-on-btn\)/.test(css), 'главные кнопки — светлые');
ok(/:is\(\.race-sheet-inner, \.ds-sheet-panel\) \{ background: var\(--pl-s1\)/.test(css) && /\.race-sheet-handle \{ background: var\(--pl-line-2\)/.test(css), 'шторки — одна поверхность и ручка');
ok(!/gradient|glow|shimmer|backdrop-filter: blur|neon|gold/i.test(v318css.replace(/backdrop-filter: none/g, '').replace(/--gold[^;]*;/g, '')), 'в v318 нет градиентов, свечения, стекла, неона, золота');

console.log('[отсчёт]');
ok(/import \{ initV318, countdown318, cdClose, drawRunCard318, mountWalletDeck \} from '\.\/v318\.js'/.test(app), 'v318 подключён');
{ const arm = app.slice(app.indexOf('function armRun('), app.indexOf('function cd318Hap'));
  ok(arm.indexOf('run.armed = true') > 0 && arm.indexOf('countdown318(') > arm.indexOf('run.armed = true') && arm.indexOf('countdown318(') > arm.indexOf('openRunDrive()'), 'отсчёт — после вооружения: замер уже идёт, ничего не ждёт');
  ok(/opts\.rawSeq0 == null && opts\.cd !== false/.test(arm) && !/await/.test(arm), 'автостарт (уже едем) — без отсчёта, без ожиданий'); }
ok(!/run\.t0|armRun|rawSeq|gps-core|launched =/.test(v), 'модуль отсчёта не трогает логику замера');
ok(/isLive: \(\) => !!run\.launched \|\| !run\.armed/.test(app) && /if \(isLive\(\)\) cdClose\(true\)/.test(v), 'поехал — отсчёт сразу пропадает');
ok(/addEventListener\('pointerdown'[^\n]*cdClose\(\)/.test(v), 'касание — скрыть');
ok(/function cd318Hap[\s\S]{0,300}tmaHaptic\(kind === 'medium' \? 'medium' : 'light'\)/.test(app) && /pitlane-hap-off/.test(app.slice(app.indexOf('function cd318Hap'))), 'лёгкая вибрация, уважает «без вибрации»');
ok(M.countdown318() === null, '«уменьшить движение» — без отсчёта');
ok(/\.cd-d \{[^}]*var\(--pl-num\)/.test(css) && !/Michroma/.test(v318css), 'огромная цифра Sofia Sans Condensed, без Michroma');
ok(/armRun\(\{ cd: false \}\); void openVideoTele/.test(app), 'с видео — без отсчёта (камера сама стартует)');

console.log('[карточка шейра]');
const P = { type: '0-100', time: '3.29 с', splits: { '60ft': [1.84, 58], '0-100': [3.29, 100], '100-200': [8.92, 200], '402m': [11.41, 196] }, vmax: 214, pbD: -0.08, src: 'ext' };
{ const c = M.runCells(P); ok(c.map((x) => x.k).join(',') === '60 ft,100–200,¼ мили,Vmax', 'сетка: 60 ft · 100–200 · ¼ мили · Vmax (герой не дублируется)', JSON.stringify(c)); }
ok(M.runCells({ type: '0-100', splits: { '0-100': [3.6, 100] } }).length === 0, 'нет отметок — нет выдуманных клеток');
ok(M.runCells({ type: '402m', curve: { s: 12, v: [0, 80, 150, 199] } }).find((x) => x.k === 'Vmax')?.v === '199', 'Vmax из кривой, если нет отдельной');
ok(M.pbLine(P).cls === 'up' && M.pbLine({ pbD: 0.12 }).cls === 'dn' && M.pbLine({ pbFirst: true }).t === 'Первый замер' && M.pbLine({}) === null, 'дельта к лучшему: лучше — светлым, хуже — красным');
ok(M.measuredLabel({ src: 'ext' }) === 'Measured by PITLANE GPS' && M.measuredLabel({ src: 'phone' }) !== M.measuredLabel({ src: 'ext' }), '«Measured by PITLANE GPS» — только у чипа, честно');
ok(/const W = 1080, H = fmt === 'post' \? 1350 : 1920/.test(v), 'сторис 1080×1920 и пост 1080×1350');
ok(/cv = await drawRunCard318\(p, 'story'\); \} catch \(_\) \{ cv = drawStoryCard\(p\); \}/.test(app) && /api\.uploadStory\(id, cv\.toDataURL/.test(app) && /WA\.shareToStory\(/.test(app), 'тот же путь в Telegram Stories, старая картинка — запасная');
ok(/id="shareCardPost"/.test(html) && /drawRunCard318\(p, 'post'\)[\s\S]{0,80}shareImageFile\(cv, 'pitlane-post\.jpg'\)/.test(app), 'кнопка «Пост 4:5» — общий share картинки');
ok(/if \(S\.vmax > 0\) p\.vmax = Math\.round\(S\.vmax\)/.test(app), 'Vmax заезда в данные карточки');

console.log('[гараж]');
ok(/export async function pickOwnCar/.test(cr) && /const pickCar = \(c\) => pickOwnCar\(c\);/.test(cr), 'выбор своей машины — общий для шторки и колоды');
ok(/function wl318Mount[\s\S]{0,300}if \(!others\.length\) return;/.test(app) && /garageList\(\)/.test(app.slice(app.indexOf('function wl318Others'))), 'колода — только если в гараже больше одной машины');
ok(/\.emb318 \.cw-h \{[^}]*border: 1px solid #242424; box-shadow: inset 0 1px 0 rgba\(255,255,255,\.07\)/.test(css), '«тиснёная» плашка: волосяная линия + внутренний блик');
ok(/Math\.abs\(dx\) > 80 \|\| v > 0\.5/.test(v) && /wlSwiped/.test(v), 'свайп листает, клик после свайпа не открывает каталог');

console.log('[общее]');
ok(/V318_I18N = \{ ru: \{/.test(v), 'строки — в V318_I18N');
ok(!/паддок|paddock/i.test(v + v318css), 'без «паддок»');
ok(/@media \(prefers-reduced-motion: reduce\) \{[^@]*\.wl-card \{ transition: none[^@]*\.cd318/.test(v318css), 'CSS: «уменьшить движение»');
if (fails) { console.log('\n✗ v318: ' + fails); process.exit(1); } else console.log('\n✓ v318');
