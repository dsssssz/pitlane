// v160: движение PITLANE — пружины на одном rAF, «общие элементы» (FLIP через WAAPI), счёт цифр, прорисовка трассы.
// Только transform/opacity (и одна SVG-линия), цикл rAF работает лишь пока что-то движется. «Уменьшить движение» — всё мгновенно.
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reduced = () => !!(mq && mq.matches) || document.documentElement.classList.contains('q-low');
const scale = () => (typeof window !== 'undefined' && window.__motionScale) || 1; // только для съёмки кадров
const live = new Set(); let raf = 0; let last = 0;
function loop(t) {
  const dt = Math.min(0.064, Math.max(0, (t - (last || t)) / 1000)) * scale(); last = t;
  for (const s of live) s.step(dt);
  raf = live.size ? requestAnimationFrame(loop) : 0; if (!raf) last = 0;
}
// Пружина: k — жёсткость, zeta — демпфирование (1 — без перелёта; < 1 — лёгкий «живой» перелёт стрелки).
export function spring({ k = 140, zeta = 1, value = 0, eps = 1e-4, onUpdate = () => {} } = {}) {
  const c = 2 * zeta * Math.sqrt(k);
  const s = {
    x: value, v: 0, target: value,
    set(t) {
      if (!Number.isFinite(t)) return;
      s.target = t;
      if (reduced() || document.hidden) { s.snap(t); return; }
      if (!live.has(s)) { live.add(s); if (!raf) raf = requestAnimationFrame(loop); }
    },
    snap(t) { s.x = s.target = t; s.v = 0; live.delete(s); onUpdate(s.x, 0); },
    step(dt) {
      const n = Math.max(1, Math.ceil(dt / (1 / 240))); const h = dt / n;
      for (let i = 0; i < n; i++) { const a = -k * (s.x - s.target) - c * s.v; s.v += a * h; s.x += s.v * h; }
      if (Math.abs(s.x - s.target) < eps && Math.abs(s.v) < eps * 10) { s.x = s.target; s.v = 0; live.delete(s); }
      onUpdate(s.x, s.v);
    },
  };
  return s;
}
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
// Счёт цифр: «#2», «4.21 с», «2:18.40» — анимируется только число, формат остаётся (минуты:секунды — как есть, без счёта).
export function countUp(el, text, { dur = 700 } = {}) {
  if (!el) return;
  const m = String(text).match(/^([^\d]*)(\d+(?:[.,]\d+)?)(.*)$/);
  if (!m || reduced() || /:\d/.test(text)) { el.textContent = text; return; }
  const [, pre, num, post] = m; const sep = num.includes(',') ? ',' : '.'; const dec = (num.split(/[.,]/)[1] || '').length; const to = parseFloat(num.replace(',', '.'));
  const t0 = performance.now(); const tok = (el.__cu = (el.__cu || 0) + 1);
  const tick = (t) => {
    if (el.__cu !== tok) return;
    const p = Math.min(1, ((t - t0) / dur) * scale()); const v = to * easeOut(p);
    el.textContent = p >= 1 ? text : pre + v.toFixed(dec).replace('.', sep) + post;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// Общий элемент: копия источника летит в прямоугольник цели и растворяется; цель проявляется. 360–420 мс, только transform/opacity.
export function flyShared(from, to, { dur = 420, radius = 8 } = {}) {
  const rectA = from && from.rect; if (from && from.el) from = from.el; // можно передать { el, rect }, снятый до перестройки DOM
  if (!from || !to || reduced() || !to.animate) return false;
  const a = rectA || from.getBoundingClientRect(); const b = to.getBoundingClientRect();
  if (!a.width || !a.height || !b.width || !b.height) return false;
  if (a.bottom < 0 || a.top > innerHeight) return false;
  const ghost = from.cloneNode(true); ghost.removeAttribute('id'); ghost.querySelectorAll?.('[id]').forEach((n) => n.removeAttribute('id'));
  if (from.isConnected && from.querySelectorAll) { // SVG/вложенные стили не переживут перенос в body — копируем вычисленные
    const src = [from, ...from.querySelectorAll('*')]; const dst = [ghost, ...ghost.querySelectorAll('*')];
    src.forEach((n, i) => { const d = dst[i]; if (!d || !(n instanceof SVGElement)) return; const c = getComputedStyle(n); d.classList?.remove('ds-draw'); d.style.fill = c.fill; d.style.stroke = c.stroke; d.style.strokeWidth = c.strokeWidth; d.style.opacity = c.opacity; d.style.strokeDasharray = 'none'; d.style.animation = 'none'; });
  }
  Object.assign(ghost.style, { position: 'fixed', left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', margin: '0', zIndex: '13000', pointerEvents: 'none', transformOrigin: '0 0', borderRadius: radius + 'px', overflow: 'hidden', willChange: 'transform, opacity', objectFit: 'cover' });
  ghost.setAttribute('aria-hidden', 'true'); ghost.classList.add('ds-ghost');
  document.body.appendChild(ghost);
  const sx = b.width / a.width; const sy = b.height / a.height; const s = Math.min(sx, sy);
  const dx = b.left + (b.width - a.width * s) / 2 - a.left; const dy = b.top + (b.height - a.height * s) / 2 - a.top;
  const ease = 'cubic-bezier(.2, 0, 0, 1)'; const d = dur / scale();
  ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 1, offset: 0.8 }, { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 }], { duration: d, easing: ease, fill: 'forwards' }).finished.then(() => ghost.remove(), () => ghost.remove());
  to.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: d, easing: 'linear' });
  return true;
}
// Прорисовка контура трассы (path с pathLength="1"): класс + задержка; без «уменьшить движение».
export function drawIn(paths, { delay = 0, stagger = 90 } = {}) {
  if (reduced()) return;
  [...paths].forEach((p, i) => { if (!p) return; p.style.setProperty('--dd', (delay + i * stagger) / scale() + 'ms'); p.classList.remove('ds-draw'); void p.getBoundingClientRect?.(); p.classList.add('ds-draw'); });
}
