// v348: нижняя навигация как tab bar iOS 26 Liquid Glass (по ТЗ Маги, эталон — TabBar из Glisse, github.com/0kzh/glisse).
// Ванильный JS поверх существующих кнопок #nav3: роутинг не трогаем — по отпусканию вызываем click() нужной вкладки.
// Индикатор (.tb-lens): в покое плоская капсула 52px; при нажатии «поднимается в линзу» (+24px по ширине, +16px по высоте),
// едет за пальцем вдоль бара, по отпусканию — снап к ближайшей вкладке. Анимируются только transform и opacity.
// Пружины — аналитическое решение как в Glisse (spring.ts), масса 1.
import { makeFilter, mapURL } from './glass345.js';

const REST = [1024, 58.9];      // ход индикатора между вкладками (ТЗ)
const DRAG = [2500, 94];        // за пальцем
const LIFT_UP = [3600, 118];    // подъём в линзу: 90% за ≈ 70 мс
const LIFT_DOWN = [260, 31];     // опускание: 98% за ≈ 360–400 мс
const GROW_X = 24, GROW_Y = 16;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const moving = new Set(); let frame = 0, last = 0;
function advance(s, dt) {
  const x = s.value - s.target, v = s.velocity, half = s.d / 2, disc = half * half - s.k;
  if (Math.abs(disc) < 1e-4) { const e = Math.exp(-half * dt), b = v + half * x; s.value = s.target + e * (x + b * dt); s.velocity = e * (v - half * b * dt); }
  else if (disc > 0) { const r = Math.sqrt(disc), r1 = -half + r, r2 = -half - r, a = (v - r2 * x) / (r1 - r2), b = x - a; s.value = s.target + a * Math.exp(r1 * dt) + b * Math.exp(r2 * dt); s.velocity = a * r1 * Math.exp(r1 * dt) + b * r2 * Math.exp(r2 * dt); }
  else { const w = Math.sqrt(-disc), e = Math.exp(-half * dt), c = Math.cos(w * dt), sn = Math.sin(w * dt); s.value = s.target + e * (x * c + ((v + half * x) / w) * sn); s.velocity = e * (v * c - ((half * v + s.k * x) / w) * sn); }
}
function tick(t) {
  frame = 0; const dt = Math.min(0.064, Math.max(0, (t - last) / 1000)); last = t;
  for (const s of moving) { advance(s, dt); if (Math.abs(s.value - s.target) < 1e-3 && Math.abs(s.velocity) < 1e-2) { s.value = s.target; s.velocity = 0; moving.delete(s); } }
  paintAll(); if (moving.size) frame = requestAnimationFrame(tick);
}
let paintAll = () => {};
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function spring(v0) {
  const s = { value: v0, target: v0, velocity: 0, k: REST[0], d: REST[1] };
  s.tune = (p) => { s.k = p[0]; s.d = p[1]; };
  s.set = (to, instant) => {
    s.target = to;
    if (instant || document.hidden || reducedMotion()) { s.value = to; s.velocity = 0; moving.delete(s); paintAll(); return; }
    moving.add(s); if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
  };
  return s;
}

export function initTabbar348() {
  const de = document.documentElement;
  const nav = document.getElementById('nav3');
  if (!nav) return;
  const q = new URLSearchParams(location.search);
  // для сравнения на телефоне: ?tbc=blue — активный #0091ff; ?tbv=b — «+» пятым табом внутри капсулы
  if (q.get('tbc') === 'blue') de.classList.add('tb-blue');
  const v5 = q.get('tbv') === 'b';
  if (v5) de.classList.add('tb-v5');
  de.classList.add('tb348');
  try { const bf = CSS.supports('backdrop-filter', 'blur(2px)') || CSS.supports('-webkit-backdrop-filter', 'blur(2px)'); if (!bf) de.classList.add('tb-nobf'); } catch (_) {}

  const tabs = [...nav.querySelectorAll('.nav3-btn')];
  nav.setAttribute('role', 'tablist');
  tabs.forEach((b) => { b.setAttribute('role', 'tab'); b.setAttribute('draggable', 'false'); });
  if (v5) {
    const fab = document.getElementById('n3Fab');
    if (fab && !fab.querySelector('.tb-fab-label')) { const l = document.createElement('span'); l.className = 'tb-fab-label'; l.textContent = 'Ещё'; fab.appendChild(l); }
  }
  const lens = document.createElement('span'); lens.className = 'tb-lens'; lens.setAttribute('aria-hidden', 'true');
  const rest = document.createElement('span'); rest.className = 'tb-rest';
  const lift = document.createElement('span'); lift.className = 'tb-lift';
  lens.append(rest, lift); nav.insertBefore(lens, nav.firstChild);
  nav.style.setProperty('--tabs', String(tabs.length + (v5 ? 1 : 0)));

  let slot = 0, pad = 0, active = -1, hi = -1, gesture = null, suppress = false, swipe = false;
  const X = spring(0), L = spring(0);
  const measure = () => {
    const cs = getComputedStyle(nav); pad = parseFloat(cs.paddingLeft) || 0;
    slot = (nav.clientWidth - pad - (parseFloat(cs.paddingRight) || 0)) / tabs.length;
    lens.style.width = slot + 'px';
  };
  const paint = () => {
    if (!slot) return;
    const l = clamp(L.value, 0, 1.2), lc = clamp(L.value, 0, 1);
    const sx = 1 + (GROW_X / slot) * l, sy = 1 + (GROW_Y / 52) * l;
    lens.style.transform = `translate3d(${X.value}px,0,0) scale(${sx},${sy})`;
    rest.style.opacity = String(1 - lc); lift.style.opacity = String(lc);
    const n = clamp(Math.round(X.value / slot), 0, tabs.length - 1);
    const show = active >= 0 || gesture || swipe;
    if ((show ? n : -1) !== hi) { tabs[hi]?.classList.remove('tb-hi'); hi = show ? n : -1; tabs[hi]?.classList.add('tb-hi'); }
  };
  paintAll = paint;

  const settle = (instant) => {
    if (gesture) return;
    const show = active >= 0;
    lens.classList.toggle('tb-off', !show);
    X.tune(REST); L.tune(LIFT_DOWN);
    if (show) X.set(active * slot, instant);
    L.set(0, instant); paint();
  };
  const readActive = () => tabs.findIndex((b) => b.classList.contains('on'));
  const setActive = (i, instant) => {
    active = i;
    tabs.forEach((b, j) => b.setAttribute('aria-selected', j === i ? 'true' : 'false'));
    settle(instant);
  };

  const pos = (e) => clamp(gesture.anchor + e.clientX - gesture.x, 0, slot * (tabs.length - 1));
  const light = (e) => { const r = gesture.box; nav.style.setProperty('--tb-x', clamp(((e.clientX - r.left) / r.width) * 100, 0, 100) + '%'); };
  nav.addEventListener('pointerdown', (e) => {
    const tab = e.target.closest('.nav3-btn');
    if (!tab || !e.isPrimary || e.button !== 0 || gesture) return;
    measure();
    gesture = { id: e.pointerId, x: e.clientX, anchor: tabs.indexOf(tab) * slot, moved: false, box: nav.getBoundingClientRect() };
    suppress = false;
    nav.classList.add('is-pressed'); lens.classList.remove('tb-off');
    light(e);
    if (reducedMotion()) { X.set(gesture.anchor, true); return; } // без подъёма линзы
    X.tune(DRAG); L.tune(LIFT_UP);
    X.set(gesture.anchor, active < 0); L.set(1);
  });
  window.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    if (!gesture.moved && Math.abs(e.clientX - gesture.x) > 6) { gesture.moved = true; try { nav.setPointerCapture(e.pointerId); } catch (_) {} }
    if (gesture.moved) X.set(pos(e));
    light(e);
  });
  const end = (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    if (e.type === 'lostpointercapture' && e.target !== nav) return;
    const g = gesture; const idx = Math.round(pos(e) / slot);
    gesture = null; nav.classList.remove('is-pressed');
    try { if (nav.hasPointerCapture(g.id)) nav.releasePointerCapture(g.id); } catch (_) {}
    const near = e.clientY >= g.box.top - 24 && e.clientY <= g.box.bottom + 24;
    if (e.type === 'pointerup' && (g.moved || near)) {
      suppress = true;
      active = idx; settle();          // линза сразу едет к выбранной вкладке, не ждёт роутинга
      tabs[idx]?.click();              // существующий обработчик вкладок (роутинг не меняем)
    } else { suppress = g.moved; settle(); }
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  nav.addEventListener('lostpointercapture', end);
  // нативный click после pointerup уже обработан выше (синтетический click() — isTrusted=false, проходит)
  nav.addEventListener('click', (e) => { if (e.isTrusted && suppress) { suppress = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  nav.addEventListener('touchmove', (e) => { if (gesture && gesture.moved && e.cancelable) e.preventDefault(); }, { passive: false });
  nav.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => { if (gesture) { gesture = null; nav.classList.remove('is-pressed'); settle(true); } });

  // свайп между экранами (существующий жест) двигает индикатор
  window.__n3BlobDrag = (dx, fromKey, vw) => {
    if (!slot) measure();
    const order = (window.__n6Swipe && window.__n6Swipe.order) || ['zamer', 'lap', 'tops', 'pulse', 'shop'];
    const i = order.indexOf(fromKey); if (i < 0) return;
    const toKey = order[i + (dx < 0 ? 1 : -1)];
    const a = tabs.findIndex((b) => b.dataset.n3 === fromKey), b = tabs.findIndex((t) => t.dataset.n3 === toKey);
    const p = Math.min(1, Math.abs(dx) / Math.max(64, (vw || innerWidth) * 0.28));
    if (a < 0 || b < 0) return;
    swipe = true; lens.classList.remove('tb-off');
    X.set((a + (b - a) * p) * slot, true);
  };
  window.__n3BlobRelease = () => { swipe = false; setActive(readActive()); };

  const mo = new MutationObserver(() => { const i = readActive(); if (i !== active && !gesture) setActive(i); });
  tabs.forEach((b) => mo.observe(b, { attributes: true, attributeFilter: ['class'] }));
  new ResizeObserver(() => { measure(); if (!gesture) settle(true); }).observe(nav);
  measure(); setActive(readActive(), true);

  // Chromium: линза в подъёме преломляет фон (SVG-карта смещения под форму капсулы 52px)
  if (de.classList.contains('lg-refract')) {
    try {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      document.body.appendChild(svg);
      const img = makeFilter(svg, 'tb348l', 18);
      const fit = () => { const w = Math.round(slot), h = 52; if (!w) return; img.setAttribute('width', String(w)); img.setAttribute('height', String(h)); img.setAttribute('href', mapURL(w, h, 26, 14)); };
      fit(); new ResizeObserver(fit).observe(nav);
      de.classList.add('tb-refract');
    } catch (_) {}
  }
  window.__tb348 = { measure, setActive, get active() { return active; }, X, L };
}
