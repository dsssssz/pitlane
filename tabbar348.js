// v348→v349: нижняя навигация как tab bar iOS 26 Liquid Glass (ТЗ Маги, эталон — TabBar из Glisse, github.com/0kzh/glisse).
// Ванильный JS поверх существующих кнопок #nav3: роутинг не трогаем — по отпусканию вызываем click() нужной вкладки.
// v349 «плавно»: индикатор и линза анимируются Web Animations API (transform/opacity) — это идёт в потоке композитора
// (GPU) и не дёргается, даже если главный поток занят отрисовкой нового экрана. Кривая — критически
// демпфированная пружина (без перелёта), заданная через linear(); JS-цикл rAF работает только во время протяжки пальцем.
// Слои: .tb-lens (translate3d по X) > .tb-scale (scale — подъём в линзу) > .tb-rest (покой, фон .145) + .tb-lift (линза .055 + ободок).
// Ободок/фон не анимируются покадрово — только opacity двух готовых слоёв.
import { makeFilter, mapURL } from './glass345.js';

const GROW_X = 24, GROW_Y = 16;          // подъём в линзу (ТЗ)
const MOVE_MS = 420;                     // снап к вкладке: без перелёта, оседание ~350–420 мс
const LIFT_UP_MS = 90;                   // подъём линзы 80–100 мс, ease-out
const LIFT_DOWN_MS = 400;                // отпускание ~400 мс
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// критически демпфированная пружина, нормированная к 1 в конце: p(t) = 1 − (1 + Wt)·e^(−Wt)
const W = 7;
// пружина со стартовой скоростью v (в «долях пути за длительность»): продолжение движения без рывка при перенацеливании.
// v ≤ W — без перелёта.
const springV = (v = 0) => { const B = W - v, P = 1 - (1 + B) * Math.exp(-W); return (t) => (1 - (1 + B * t) * Math.exp(-W * t)) / P; };
const springF = springV(0);
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
let LINEAR_OK = false;
try { LINEAR_OK = CSS.supports('transition-timing-function', 'linear(0, 1)'); } catch (_) {}
const easeOf = (f) => { if (!LINEAR_OK) return 'cubic-bezier(0.22, 1, 0.36, 1)'; const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(`${f(t).toFixed(4)} ${(t * 100).toFixed(1)}%`); } return `linear(${pts.join(', ')})`; };
const SPRING_EASE = easeOf(springF);
const OUT_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)'; // = outCubic

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
  const canAnimate = typeof Element.prototype.animate === 'function';

  const tabs = [...nav.querySelectorAll('.nav3-btn')];
  nav.setAttribute('role', 'tablist');
  tabs.forEach((b) => { b.setAttribute('role', 'tab'); b.setAttribute('draggable', 'false'); });
  if (v5) {
    const fab = document.getElementById('n3Fab');
    if (fab && !fab.querySelector('.tb-fab-label')) { const l = document.createElement('span'); l.className = 'tb-fab-label'; l.textContent = 'Ещё'; fab.appendChild(l); }
  }
  const mk = (c) => { const e = document.createElement('span'); e.className = c; return e; };
  const lens = mk('tb-lens'), scaler = mk('tb-scale'), rest = mk('tb-rest'), lift = mk('tb-lift');
  lens.setAttribute('aria-hidden', 'true');
  scaler.append(rest, lift); lens.append(scaler); nav.insertBefore(lens, nav.firstChild);
  nav.style.setProperty('--tabs', String(tabs.length + (v5 ? 1 : 0)));

  // размеры кэшируются: читаются только при нажатии и при ResizeObserver, никогда — в кадре анимации
  let slot = 0, active = -1, hi = -1, gesture = null, suppress = false, swipe = false;
  const measure = () => {
    const cs = getComputedStyle(nav);
    slot = (nav.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)) / tabs.length;
    lens.style.width = slot + 'px';
  };
  const setHi = (n) => { if (n === hi) return; tabs[hi]?.classList.remove('tb-hi'); hi = n; tabs[hi]?.classList.add('tb-hi'); };

  // will-change только пока идёт анимация или нажатие
  let wcT = 0;
  const animOn = (ms) => { lens.classList.add('tb-anim'); clearTimeout(wcT); wcT = setTimeout(() => { if (!gesture && !swipe) lens.classList.remove('tb-anim'); }, ms + 60); };

  let dragVel = 0, dragT = 0;
  // текущее значение считается аналитически (без getComputedStyle) — повторный тап продолжает с того же места, без скачка
  const tr = { x: { from: 0, to: 0, t0: 0, dur: 0, f: springF }, l: { from: 0, to: 0, t0: 0, dur: 0, f: springF } };
  const cur = (a, now = performance.now()) => (!a.dur ? a.to : a.from + (a.to - a.from) * a.f(clamp((now - a.t0) / a.dur, 0, 1)));
  let xAnim = null, lAnims = [];
  const xStr = (x) => `translate3d(${x.toFixed(2)}px,0,0)`;
  const sStr = (l) => `scale(${(1 + (GROW_X / (slot || 70)) * l).toFixed(4)},${(1 + (GROW_Y / 52) * l).toFixed(4)})`;
  const setX = (x) => { xAnim?.cancel(); xAnim = null; tr.x = { from: x, to: x, t0: 0, dur: 0, f: springF }; lens.style.transform = xStr(x); };
  const animX = (to, ms = MOVE_MS) => {
    const now = performance.now(), from = cur(tr.x, now);
    if (xAnim && tr.x.dur && Math.abs(tr.x.to - to) < 0.5 && now < tr.x.t0 + tr.x.dur) return; // та же цель — не перезапускаем
    const vel = tr.x.dur ? (from - cur(tr.x, now - 8)) / 8 : (now - dragT < 50 ? dragVel : 0); // px/мс текущего движения (или пальца)
    xAnim?.cancel(); xAnim = null;
    lens.style.transform = xStr(to);
    if (!ms || !canAnimate || reducedMotion() || Math.abs(to - from) < 0.5) { tr.x = { from: to, to, t0: 0, dur: 0, f: springF }; return; }
    const v = clamp((vel * ms) / (to - from), 0, W), f = v > 0.05 ? springV(v) : springF;
    tr.x = { from, to, t0: now, dur: ms, f };
    animOn(ms);
    xAnim = lens.animate([{ transform: xStr(from) }, { transform: xStr(to) }], { duration: ms, easing: f === springF ? SPRING_EASE : easeOf(f) });
  };
  const applyL = (l) => { scaler.style.transform = sStr(l); rest.style.opacity = String(1 - l); lift.style.opacity = String(l); };
  const animL = (to, up) => {
    const now = performance.now(), from = clamp(cur(tr.l, now), 0, 1);
    lAnims.forEach((a) => a.cancel()); lAnims = [];
    if (reducedMotion()) to = 0; // без подъёма линзы
    applyL(to);
    const ms = up ? LIFT_UP_MS : LIFT_DOWN_MS;
    if (!canAnimate || reducedMotion() || Math.abs(to - from) < 0.01) { tr.l = { from: to, to, t0: 0, dur: 0, f: springF }; return; }
    tr.l = { from, to, t0: now, dur: ms, f: up ? outCubic : springF };
    animOn(ms);
    const o = { duration: ms, easing: up ? OUT_EASE : SPRING_EASE };
    lAnims = [
      scaler.animate([{ transform: sStr(from) }, { transform: sStr(to) }], o),
      rest.animate([{ opacity: 1 - from }, { opacity: 1 - to }], o),
      lift.animate([{ opacity: from }, { opacity: to }], o),
    ];
  };

  // «дешёвое стекло» на время протяжки/скролла: меньше blur, без SVG-рефракции; после — как было
  // класс ставится на сам док (не на <html>), чтобы не пересчитывать стили всей страницы
  const dock = document.getElementById('n3Dock') || nav;
  let mvT = 0, mv = false, mvUntil = 0;
  const unmove = () => { mvT = 0; if (gesture?.moved || swipe) { mvT = setTimeout(unmove, 120); return; } const left = mvUntil - performance.now(); if (left > 8) { mvT = setTimeout(unmove, left); return; } mv = false; dock.classList.remove('tb-moving'); };
  const moving = (ms = 160) => { mvUntil = performance.now() + ms; if (!mv) { mv = true; dock.classList.add('tb-moving'); } if (!mvT) mvT = setTimeout(unmove, ms); };

  const show = (on) => lens.classList.toggle('tb-off', !on);
  const settle = (instant) => {
    if (gesture) return;
    show(active >= 0);
    setHi(active);
    if (active >= 0) { if (instant) setX(active * slot); else animX(active * slot); }
    animL(0, false);
  };
  const readActive = () => tabs.findIndex((b) => b.classList.contains('on'));
  const setActive = (i, instant) => {
    active = i;
    tabs.forEach((b, j) => b.setAttribute('aria-selected', j === i ? 'true' : 'false'));
    settle(instant);
  };

  // протяжка: цель обновляется в pointermove, запись стиля — строго в rAF, с мягким догоном (без лага и без рывка на старте)
  let dragRaf = 0, dragX = 0, dragTarget = 0, dragLast = 0;
  const dragLoop = (t) => {
    dragRaf = 0; if (!gesture?.moved && !swipe) return;
    const dt = Math.min(0.05, dragLast ? (t - dragLast) / 1000 : 0.016); dragLast = t;
    const px = dragX; dragX += (dragTarget - dragX) * (1 - Math.exp(-dt * 34));
    dragVel = dt ? (dragX - px) / (dt * 1000) : 0; dragT = performance.now();
    if (Math.abs(dragTarget - dragX) < 0.2) dragX = dragTarget;
    setX(dragX); setHi(clamp(Math.round(dragX / slot), 0, tabs.length - 1));
    dragRaf = requestAnimationFrame(dragLoop);
  };
  const startDrag = () => { dragX = cur(tr.x); dragVel = 0; dragLast = 0; if (!dragRaf) dragRaf = requestAnimationFrame(dragLoop); };

  const pos = (x) => clamp(gesture.anchor + x - gesture.x, 0, slot * (tabs.length - 1));
  nav.addEventListener('pointerdown', (e) => {
    const tab = e.target.closest('.nav3-btn');
    if (!tab || !e.isPrimary || e.button !== 0 || gesture) return;
    if (!slot) measure();
    const box = nav.getBoundingClientRect();
    gesture = { id: e.pointerId, x: e.clientX, anchor: tabs.indexOf(tab) * slot, moved: false, box };
    suppress = false;
    nav.classList.add('is-pressed'); show(true);
    nav.style.setProperty('--tb-x', clamp(((e.clientX - box.left) / box.width) * 100, 0, 100) + '%'); // один раз на нажатие
    lens.classList.add('tb-anim');
    if (active < 0) setX(gesture.anchor); else animX(gesture.anchor);
    animL(1, true);
  }, { passive: true });
  window.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    if (!gesture.moved && Math.abs(e.clientX - gesture.x) > 6) { gesture.moved = true; try { nav.setPointerCapture(e.pointerId); } catch (_) {} startDrag(); }
    if (gesture.moved) { dragTarget = pos(e.clientX); moving(200); }
  }, { passive: true });
  const end = (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    if (e.type === 'lostpointercapture' && e.target !== nav) return;
    const g = gesture; const idx = clamp(Math.round(pos(e.clientX) / slot), 0, tabs.length - 1);
    gesture = null; nav.classList.remove('is-pressed');
    if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; }
    try { if (nav.hasPointerCapture(g.id)) nav.releasePointerCapture(g.id); } catch (_) {}
    if (g.moved) moving(120);
    const near = e.clientY >= g.box.top - 24 && e.clientY <= g.box.bottom + 24;
    if (e.type === 'pointerup' && (g.moved || near)) {
      suppress = true;
      active = idx; settle(); // линза сразу едет (на GPU) к выбранной вкладке
      // тяжёлая отрисовка экрана — после старта анимации (2 кадра); роутинг тот же: click() существующей кнопки
      pending = idx; clearTimeout(pendT);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        tabs[idx]?.click();
        // если роутер не отметил вкладку (напр., открыл шторку), через 600 мс линза вернётся к фактической .on
        pendT = setTimeout(() => { pending = -1; lastOn = readActive(); if (!gesture && lastOn !== active) setActive(lastOn); }, 600);
      }));
    } else { suppress = g.moved; settle(); }
  };
  window.addEventListener('pointerup', end, { passive: true });
  window.addEventListener('pointercancel', end, { passive: true });
  nav.addEventListener('lostpointercapture', end, { passive: true });
  // нативный click после pointerup уже обработан выше (синтетический click() — isTrusted=false, проходит)
  nav.addEventListener('click', (e) => { if (e.isTrusted && suppress) { suppress = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  nav.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => { if (gesture) { gesture = null; nav.classList.remove('is-pressed'); settle(true); } });
  // скролл любого экрана — дешёвое стекло на время движения
  document.addEventListener('scroll', () => moving(160), { capture: true, passive: true });

  // свайп между экранами (существующий жест) двигает индикатор
  window.__n3BlobDrag = (dx, fromKey, vw) => {
    if (!slot) measure();
    const order = (window.__n6Swipe && window.__n6Swipe.order) || ['zamer', 'lap', 'tops', 'pulse', 'shop'];
    const i = order.indexOf(fromKey); if (i < 0) return;
    const toKey = order[i + (dx < 0 ? 1 : -1)];
    const a = tabs.findIndex((b) => b.dataset.n3 === fromKey), b = tabs.findIndex((t) => t.dataset.n3 === toKey);
    if (a < 0 || b < 0) return;
    const p = Math.min(1, Math.abs(dx) / Math.max(64, (vw || innerWidth) * 0.28));
    if (!swipe) { swipe = true; show(true); lens.classList.add('tb-anim'); startDrag(); }
    dragTarget = (a + (b - a) * p) * slot; moving(200);
  };
  window.__n3BlobRelease = () => { swipe = false; if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; } lastOn = readActive(); setActive(lastOn); };

  // реагируем только на смену .on (класс is-press и т.п. на кнопках не трогает линзу);
  // пока ждём отложенный click() — не возвращаем линзу на старую вкладку
  let pending = -1, pendT = 0, lastOn = -1;
  const mo = new MutationObserver(() => {
    const i = readActive(); if (i === lastOn) return; lastOn = i;
    if (pending >= 0) { if (i !== pending) return; pending = -1; clearTimeout(pendT); }
    if (i !== active && !gesture) setActive(i);
  });
  tabs.forEach((b) => mo.observe(b, { attributes: true, attributeFilter: ['class'] }));
  new ResizeObserver(() => { measure(); if (!gesture) { applyL(clamp(tr.l.to, 0, 1)); settle(true); } }).observe(nav);
  measure(); applyL(0); lastOn = readActive(); setActive(lastOn, true);

  // Chromium: линза в подъёме преломляет фон (SVG-карта смещения под форму капсулы 52px)
  if (de.classList.contains('lg-refract')) {
    try {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      document.body.appendChild(svg);
      const img = makeFilter(svg, 'tb348l', 18);
      let key = '';
      const fit = () => { const w = Math.round(slot); if (!w || key === String(w)) return; key = String(w); img.setAttribute('width', String(w)); img.setAttribute('height', '52'); img.setAttribute('href', mapURL(w, 52, 26, 14)); };
      fit(); new ResizeObserver(fit).observe(nav);
      de.classList.add('tb-refract');
    } catch (_) {}
  }
  window.__tb348 = { measure, setActive, get active() { return active; }, get x() { return cur(tr.x); }, get l() { return cur(tr.l); }, ease: SPRING_EASE.slice(0, 40), linear: LINEAR_OK };
}
