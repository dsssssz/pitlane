// v317: онбординг первого запуска, плотные топы с «До №N» и стрелками мест, итоги сезона, белая «Отправить» и «Сейчас на трассе».
import fs from 'fs';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x ?? '')); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const app = R('app.js'); const css = R('styles.css'); const v = R('v317.js'); const html = R('index.html'); const cdb = R('car-db.js'); const cr = R('crew-rooms.js');
// мини-окружение для v317.js
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, x) => store.set(k, String(x)), removeItem: (k) => store.delete(k) };
globalThis.matchMedia = () => ({ matches: true });
globalThis.window = globalThis; globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
const M = await import(new URL('v317.js', root));

console.log('[лицензии и подключение]');
ok(/Magic UI, MIT/.test(v) && /Kokonut UI, MIT/.test(v) && /Permission is hereby granted/.test(v), 'атрибуция MIT в v317.js');
ok(/from '\.\/v317\.js'/.test(app) && /initV317\(\{/.test(app) && /onbMaybeShow/.test(app), 'v317 подключён в app.js');
ok(/export async function carDbShowcase/.test(cdb) && /export async function pickCatalogCar/.test(cr), 'витрина машин и общий выбор машины из каталога');
ok(/V317_I18N = \{ ru: \{/.test(v), 'строки — в V317_I18N');
ok(!/паддок|paddock/i.test(v) && !/паддок|paddock/i.test(app.match(/const T317 = [^\n]+/)?.[0] || ''), 'без «паддок» в новых строках');

console.log('[онбординг]');
ok(M.onbSeen() === false, 'новый телефон — онбординг не показан');
M.onbMark('skip'); ok(M.onbSeen() === true && /^skip:/.test(store.get('pitlane-onb-v317')), 'после «Пропустить» флаг стоит навсегда');
ok(/hasAnyRun|myCarLocal/.test(v) && /onbMark\('old'\)/.test(v), 'старые пользователи онбординг не видят');

console.log('[сезон]');
{ store.clear(); const now = Date.now(); const y = new Date(now + 3 * 3600e3).getUTCFullYear(); const at = (m, d = 10) => Date.UTC(y, m, d) - 3 * 3600e3;
  const st = { slips: [{ at: at(0), v0100: 3.71, rc: { dist: 800 } }, { at: at(2), v0100: 3.5 }, { at: Date.UTC(y - 1, 5, 1), v0100: 3.0 }],
    dragBest: { a: { '0-100': { t: 3.29, at: at(3) }, '402m': { t: 11.41, at: at(3) } } }, laps: {} };
  const d = M.seasonData(st, { tracks: [] });
  ok(d.n === 2 && !d.capped, 'заезды — только этого года', JSON.stringify(d));
  ok(d.best === 3.29 && Math.abs(d.impr - 0.42) < 1e-9, 'лучшее 0–100 и прогресс от первого замера года');
  ok(d.b4 === 11.41 && d.b2 == null && d.km === 0.8, 'нет данных — нет цифры (100–200 скрыто)');
  ok(d.months.length === 3, 'лучшее по месяцам', JSON.stringify(d.months));
  M.seasonNoteRun(st, { at: at(4), v0100: 3.4 }); ok(M.seasonData(st).n === 3, 'новый замер копится в сезон');
  store.clear(); const e = M.seasonData({}); ok(e.n === 0 && e.best == null && e.impr == null && e.km === 0, 'пустой сезон — без выдуманных цифр'); }

console.log('[топы]');
ok(/T317_RANK_KEY = 'pitlane-tops-ranks-v317'/.test(app) && /function t317Ranks/.test(app) && /prev: live \? rec\.prev : null/.test(app), 'прошлые места — только сохранённые локально, по доске');
ok(/function t317Chip[\s\S]{0,120}if \(!rk\.prev\) return;/.test(app), 'нет прошлых мест — нет стрелок');
ok(/\.t317-chip\.dn \{ color: #e10600/.test(css) && /\.t317-chip \{[^}]*color: (#f2f2f2|var\(--pl-t1\))/.test(css), '↑ белая, ↓ красная');
ok(/function t317GapCard/.test(app) && /t317-pin/.test(app) && /t317Overtake/.test(app) && /springFlip/.test(v), '«До №N», своя строка снизу, пружина обгона');

console.log('[чат]');
ok(/#chatPage #chatFoot #pulseSend \{[^}]*background: (#f2f2f2|var\(--pl-btn\)) !important; color: #0a0a0a !important/.test(css), 'белая кнопка «Отправить», чёрная стрелка');
ok(/id="cpNow" hidden/.test(html) && /function cpNowPaint/.test(app) && /export function renderNowStack/.test(v), '«Сейчас на трассе» над чатом, скрыт без событий');
ok(/id="pf6Recap"/.test(html) && /Итоги сезона/.test(html), 'кнопка «Итоги сезона» в профиле');

console.log('[движение]');
ok(/prefers-reduced-motion/.test(v) && /if \(reduced317\(\)\) \{ onUpdate\?\.\(to\)/.test(v), 'пружины уважают «уменьшить движение»');
{ let last = null, done = false; M.springTo(0, 10, { onUpdate: (x) => (last = x), onDone: () => (done = true) }); ok(last === 10 && done, 'reduced: сразу в конечное значение'); }
ok((css.match(/@media \(prefers-reduced-motion: reduce\)[^{]*\{[^}]*\.(onb|k317|rc-|t317|nw-)/g) || []).length >= 1, 'CSS: reduced-motion для новых блоков');
ok(!/gradient|glow|shimmer|backdrop-filter/i.test(css.slice(css.indexOf('/* v317'))), 'без градиентов/свечения/стекла в стилях v317');

if (fails) { console.log('\n✗ v317: ' + fails); process.exit(1); } else console.log('\n✓ v317');
