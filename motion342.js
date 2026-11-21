// v342: motion-полировка по подборке designbookmark.com/motion — без смены дизайна и компоновки.
// 1) Сегменты (Вручную/Автостарт, Журнал, Топы: класс и период): плашка выбранного «переезжает» на пружине (Segmented control / Tab pill).
// 2) Списки и карточки появляются лесенкой (stagger) при входе на экран и при смене фильтра.
// 3) Нажатие: видимое «вдавливание» даже на коротком тапе, отпускание — пружиной (Springy press).
// 4) Смена вкладки панели: экран приезжает со стороны вкладки (Smooth tab).
// Всё — только transform/translate/scale/opacity, пружина по dt на одном rAF (motion.js). «Уменьшить движение» — мгновенно.
// Нижняя панель (#n3Dock) не трогается.
import { spring, reduced } from './motion.js';

const DOCK = '#n3Dock';
const inDock = (el) => !!(el && el.closest && el.closest(DOCK));
const ACTIVE = '.on, [aria-checked="true"], [aria-selected="true"], [aria-pressed="true"]';
const visible = (el) => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
const off = (k) => typeof window !== 'undefined' && window.__m342off && window.__m342off[k]; // только для замеров QA
const scale = () => (typeof window !== 'undefined' && window.__motionScale) || 1;

/* ———————————— 1. Сегменты: плашка переезжает ———————————— */
// Группы, где плашку рисует сама кнопка (у #topsChips и «Телефон/Чип» свой бегунок — их не трогаем).
const SEG = '#h56Mode, .jn-seg, #topsCls, #topsPeriod, .seg-control, .lb-chips';
const segKey = (g) => (g.id ? '#' + g.id : '.' + [...g.classList].join('.'));
let segPrev = null;
function segActive(g) { return [...g.children].find((c) => c.matches && c.matches(ACTIVE) && c.getClientRects().length); }
function segFind(key, view) {
  try { return (view && view.isConnected ? view : document).querySelector(key); } catch (_) { return null; }
}
function onSegClickCapture(e) {
  if (reduced() || off('seg')) return;
  const btn = e.target && e.target.closest && e.target.closest('button, [role="tab"], [role="radio"]');
  const g = btn && btn.parentElement && btn.parentElement.matches(SEG) ? btn.parentElement : null;
  if (!g || inDock(g) || g.querySelector('.t72-ind, .t282-thumb')) return;
  const a = segActive(g); if (!a || a === btn) return;
  const snap = segPrev = { key: segKey(g), view: g.closest('.view, [role="dialog"]') || null, group: g, rect: a.getBoundingClientRect(), idx: [...g.children].indexOf(btn) };
  setTimeout(() => { if (segPrev === snap) onSegClickLate(); }, 0); // если клик дальше не всплыл
}
// после всех обработчиков клика (window, всплытие) — в том же кадре, до отрисовки: без мигания второй плашки
function onSegClickLate() {
  const snap = segPrev; if (!snap) return; segPrev = null;
  if (!segRun(snap)) requestAnimationFrame(() => segRun(snap)); // обработчик перерисовал асинхронно — следующий кадр
}
const SEG_LIVE = new WeakMap();
function segRun(s) {
  const g = s.group.isConnected ? s.group : segFind(s.key, s.view);
  if (!g) return true;
  const to = segActive(g); if (!to) return false;
  const gr = g.getBoundingClientRect(); const b = to.getBoundingClientRect(); const a = s.rect;
  if (!b.width || Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1) return false;
  if (Math.abs(a.top - b.top) > b.height) return true; // перенос строки — не летим
  const prevRun = SEG_LIVE.get(g); if (prevRun) prevRun.stop();
  // чтения одним блоком (позиции, слои), потом записи — без лишних пересчётов стилей
  const kids = [...g.children];
  const fixPos = getComputedStyle(g).position === 'static';
  const lift = kids.map((c) => { const p = getComputedStyle(c); return [p.position === 'static', p.position === 'static' || p.zIndex === 'auto']; });
  const saved = kids.map((c) => [c, c.style.getPropertyValue('background'), c.style.getPropertyPriority('background'), c.style.getPropertyValue('border-color'), c.style.getPropertyValue('box-shadow'), c.style.getPropertyValue('transition-property'), c.style.position, c.style.zIndex]);
  // CSS-переход заливки, который только начался, гасим — и читаем конечный вид выбранной кнопки (пересчёт только этих кнопок)
  kids.forEach((c) => c.style.setProperty('transition-property', 'color, scale', 'important'));
  const c0 = getComputedStyle(to);
  const ghost = document.createElement('i');
  ghost.className = 'm342-plate'; ghost.setAttribute('aria-hidden', 'true');
  const left = b.left - gr.left - g.clientLeft + g.scrollLeft; const top = b.top - gr.top - g.clientTop + g.scrollTop;
  Object.assign(ghost.style, {
    left: left + 'px', top: top + 'px', width: b.width + 'px', height: b.height + 'px',
    backgroundColor: c0.backgroundColor, backgroundImage: c0.backgroundImage, borderRadius: c0.borderRadius, boxShadow: c0.boxShadow,
    borderTop: `${c0.borderTopWidth} ${c0.borderTopStyle} ${c0.borderTopColor}`, borderRight: `${c0.borderRightWidth} ${c0.borderRightStyle} ${c0.borderRightColor}`,
    borderBottom: `${c0.borderBottomWidth} ${c0.borderBottomStyle} ${c0.borderBottomColor}`, borderLeft: `${c0.borderLeftWidth} ${c0.borderLeftStyle} ${c0.borderLeftColor}`,
  });
  if (fixPos) g.style.position = 'relative';
  // своя заливка у кнопок на время перелёта — прозрачная (видна только «плашка»), текст — над ней
  kids.forEach((c, i) => {
    if (lift[i][0]) c.style.position = 'relative'; if (lift[i][1]) c.style.zIndex = '2';
    c.style.setProperty('background', 'transparent', 'important'); c.style.setProperty('border-color', 'transparent', 'important'); c.style.setProperty('box-shadow', 'none', 'important');
  });
  g.insertBefore(ghost, g.firstChild);
  const sx0 = a.width / b.width; const dx0 = (a.left + a.width / 2) - (b.left + b.width / 2);
  const apply = (p) => { const sx = sx0 + (1 - sx0) * p; ghost.style.transform = `translate3d(${(dx0 * (1 - p)).toFixed(2)}px,0,0) scaleX(${sx.toFixed(4)})`; };
  apply(0);
  let done = false;
  const finish = () => {
    if (done) return; done = true; SEG_LIVE.delete(g);
    ghost.remove();
    saved.forEach(([c, bg, pr, bc, bs, , pos, z]) => {
      c.style.removeProperty('background'); if (bg) c.style.setProperty('background', bg, pr);
      c.style.removeProperty('border-color'); if (bc) c.style.setProperty('border-color', bc);
      c.style.removeProperty('box-shadow'); if (bs) c.style.setProperty('box-shadow', bs);
      c.style.position = pos; c.style.zIndex = z;
    });
    if (fixPos) g.style.position = '';
    // свой фон вернулся без перехода; переходы — со следующего кадра (без принудительного пересчёта)
    requestAnimationFrame(() => requestAnimationFrame(() => saved.forEach(([c, , , , , tp]) => { c.style.removeProperty('transition-property'); if (tp) c.style.setProperty('transition-property', tp); })));
  };
  const sp = spring({ k: 380, zeta: 0.78, value: 0, eps: 6e-4, onUpdate: (x, v) => { apply(x); if (x === 1 && v === 0) finish(); } });
  SEG_LIVE.set(g, { stop: () => { sp.snap(1); finish(); } });
  sp.set(1);
  setTimeout(finish, 900 / scale()); // страховка
  return true;
}

/* ———————————— 2. Лесенка появления ———————————— */
const STAG_ITEMS = '.tv2-row, .st66-g, .jn-sum-c, .jn-row, .jn-day, .jn-empty, .pf6-st, .p48-group, .shop-card, .tb-row, .t72-dc, .sc-mini, .hw, .card';
const EASE = 'cubic-bezier(.22, 1, .36, 1)';
export function stagger(items, { step = 32, dur = 420, dy = 10, delay = 0, max = 12 } = {}) {
  if (reduced() || off('stag') || !items || !items.length) return 0;
  const list = [...items].filter((el) => !inDock(el) && visible(el)).sort((p, q) => p.getBoundingClientRect().top - q.getBoundingClientRect().top || 0).slice(0, max);
  list.forEach((el, i) => {
    if (!el.animate) return;
    try { el.__m342?.cancel(); } catch (_) {}
    el.__m342 = el.animate([{ opacity: 0, translate: `0 ${dy}px` }, { opacity: 1, translate: '0 0' }], { duration: dur, delay: delay + i * step, easing: EASE, fill: 'backwards' });
  });
  return list.length;
}
function itemsIn(root) {
  const all = [...root.querySelectorAll(STAG_ITEMS)];
  return all.filter((el) => !all.some((o) => o !== el && el.contains(o))); // самые «мелкие»: строки внутри карточки, а не вся карточка
}

/* ———————————— 4. Смена вкладки: экран приезжает со стороны ———————————— */
const TAB_ORDER = ['zamer', 'run', 'lap', 'tops', 'history', 'account', 'settings', 'shop'];
export function viewEnter(next, prev) {
  if (!next || reduced()) return;
  const id = next.id.replace(/^view-/, ''); const pid = prev ? prev.id.replace(/^view-/, '') : '';
  const i = TAB_ORDER.indexOf(id); const j = TAB_ORDER.indexOf(pid);
  if (i >= 0 && j >= 0 && i !== j && next.animate && !off('tab')) {
    const dx = (i > j ? 1 : -1) * 18;
    try { next.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 380, easing: EASE }); } catch (_) {}
  }
  requestAnimationFrame(() => stagger(itemsIn(next), { delay: 30 }));
}

/* ———————————— списки, которые дорисовываются после входа ———————————— */
const LISTS = ['#topsBoard', '#view-history', '#tv2']; // экраны с живыми цифрами (замер, круг) не слушаем
const SIG = new WeakMap();
function watchLists() {
  if (typeof MutationObserver !== 'function') return;
  const mo = new MutationObserver((recs) => {
    if (reduced()) return;
    const fresh = new Set();
    for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1) {
      if (n.matches(STAG_ITEMS)) fresh.add(n); else n.querySelectorAll?.(STAG_ITEMS).forEach((x) => fresh.add(x));
    }
    if (fresh.size < 2) return;
    const top = [...fresh].filter((el) => ![...fresh].some((o) => o !== el && el.contains(o)) && el.closest('.view.active') && !el.matches('.jn-sum-c')); // счётчики журнала при смене фильтра стоят на месте
    if (top.length < 2) return;
    // тихая перерисовка тех же строк (опрос топа, обновление данных) — без повторной лесенки
    const host = top[0].closest(LISTS.join(',')) || document.body;
    const sig = top.slice(0, 12).map((el) => el.textContent.replace(/\s+/g, ' ').trim()).join('|');
    if (SIG.get(host) === sig) return; SIG.set(host, sig);
    stagger(top, { step: 26, dur: 380, dy: 8 });
  });
  const hook = () => LISTS.forEach((sel) => { const el = document.querySelector(sel); if (el && !el.__m342mo) { el.__m342mo = 1; mo.observe(el, { childList: true, subtree: true }); } });
  hook(); setTimeout(hook, 1500); setTimeout(hook, 5000);
}

/* ———————————— 3. Нажатие: короткий тап тоже видно ———————————— */
const PRESS = '.jn-f, .jn-sum-c, .jn-hit, .jn-go, .jn-a, .jn-tr, #h56Mode button, .seg-btn, .tq-chip, .tv2-row, .tb-row[data-pilot], .t72-dc';
const PRESS_MIN = 110;
function initPress() {
  let cur = null; let t0 = 0; let sx = 0; let sy = 0;
  const up = () => { if (!cur) return; const el = cur; cur = null; const wait = Math.max(0, PRESS_MIN - (performance.now() - t0)); setTimeout(() => el.classList.remove('m342-dn'), wait); };
  document.addEventListener('pointerdown', (e) => {
    if (reduced() || e.button > 0) return;
    const el = e.target && e.target.closest && e.target.closest(PRESS);
    if (!el || inDock(el) || el.disabled) return;
    cur = el; t0 = performance.now(); sx = e.clientX; sy = e.clientY; el.classList.add('m342-dn');
  }, { passive: true, capture: true });
  document.addEventListener('pointermove', (e) => { if (cur && Math.hypot(e.clientX - sx, e.clientY - sy) > 9) { cur.classList.remove('m342-dn'); cur = null; } }, { passive: true, capture: true });
  ['pointerup', 'pointercancel', 'blur'].forEach((ev) => (ev === 'blur' ? window : document).addEventListener(ev, up, { passive: true, capture: true }));
}

let inited = false;
export function initMotion342() {
  if (inited || typeof document === 'undefined') return; inited = true;
  document.documentElement.classList.add('m342');
  document.addEventListener('click', onSegClickCapture, true);
  window.addEventListener('click', onSegClickLate);
  initPress();
  watchLists();
}
// для QA-съёмки
if (typeof window !== 'undefined') window.__m342 = { stagger, viewEnter, itemsIn };
