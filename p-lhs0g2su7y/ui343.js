// v343: три макета Маги (qa/motion): A — «потянуть вниз — обновить» в Топах, B — кнопка «Отправляем → ✓ готово / ошибка»,
// C — стопка уведомлений (до 3) и «Копировать → Готово ✓». Только transform/opacity, пружины, «уменьшить движение» — без анимаций.
// Нижняя панель (#n3Dock) не трогается.
import { spring, reduced } from './motion.js';

const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(kind) {
  const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 22 22'); s.setAttribute('aria-hidden', 'true');
  if (kind === 'spin') { const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', '11'); c.setAttribute('cy', '11'); c.setAttribute('r', '8.5'); s.appendChild(c); }
  else { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', kind === 'ok' ? 'M5 11.5l4 4 8-9' : 'M7 7l8 8M15 7l-8 8'); s.appendChild(p); }
  s.classList.add('u343-ic', 'u343-ic-' + kind); return s;
}

/* ———————————— C. Стопка уведомлений ———————————— */
const MAX = 3;
const POS = [{ y: 0, s: 1, o: 1 }, { y: -10, s: 0.95, o: 0.7 }, { y: -18, s: 0.9, o: 0.4 }];
let host = null; const items = [];
function stackHost() {
  if (host && host.isConnected) return host;
  host = mk('div', 'u343-stack'); host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host); return host;
}
function layout() {
  items.forEach((it, i) => {
    const p = POS[Math.min(i, POS.length - 1)];
    it.el.style.zIndex = String(10 - i);
    if (it.drag) return;
    it.el.style.transform = `translate3d(0, ${p.y}px, 0) scale(${p.s})`;
    it.el.style.opacity = i >= MAX ? '0' : String(p.o);
    it.el.style.pointerEvents = i === 0 ? 'auto' : 'none';
  });
}
function drop(it, dir = 0) {
  const i = items.indexOf(it); if (i < 0) return;
  items.splice(i, 1); clearTimeout(it.t);
  const el = it.el;
  el.classList.add('out');
  el.style.transform = dir ? `translate3d(${dir * 120}%, 0, 0)` : 'translate3d(0, -18px, 0) scale(.9)';
  el.style.opacity = '0'; el.style.pointerEvents = 'none';
  setTimeout(() => el.remove(), reduced() ? 0 : 360);
  layout();
}
function swipe(it) {
  const el = it.el; let x0 = 0, y0 = 0, dx = 0, on = false, id = null;
  el.addEventListener('pointerdown', (e) => { if (items[0] !== it) return; on = true; id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; clearTimeout(it.t); try { el.setPointerCapture(id); } catch (_) {} });
  el.addEventListener('pointermove', (e) => {
    if (!on || e.pointerId !== id) return; dx = e.clientX - x0; const dy = e.clientY - y0;
    if (!it.drag && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    it.drag = true; el.classList.add('drag');
    const up = Math.min(0, dy);
    el.style.transform = `translate3d(${dx}px, ${up}px, 0)`; el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 260 + up / 120));
  });
  const end = () => {
    if (!on) return; on = false; el.classList.remove('drag');
    const was = it.drag; it.drag = false;
    if (was && Math.abs(dx) > 70) { drop(it, dx > 0 ? 1 : -1); return; }
    if (was && parseFloat((el.style.transform.match(/,\s*(-?[\d.]+)px/) || [])[1]) < -24) { drop(it); return; }
    layout(); arm(it, 1800);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
function arm(it, ms) { clearTimeout(it.t); it.t = setTimeout(() => drop(it), ms); }
/** toast('Текст', { sub, ms }) — новое сверху, старые уходят назад (до трёх). */
export function toast(text, { sub = '', ms = 2600 } = {}) {
  text = String(text || '').trim(); if (!text) return;
  const h = stackHost();
  const top = items[0];
  if (top && top.text === text && top.sub === sub) { arm(top, ms); top.el.classList.remove('bump'); void top.el.offsetWidth; top.el.classList.add('bump'); return; }
  const el = mk('div', 'u343-toast');
  const body = mk('div', 'u343-tb'); body.appendChild(mk('b', '', text)); if (sub) body.appendChild(mk('small', '', sub));
  el.appendChild(body);
  el.style.transform = 'translate3d(0, -30px, 0) scale(.96)'; el.style.opacity = '0';
  h.appendChild(el);
  const it = { el, text, sub, t: 0, drag: false };
  items.unshift(it);
  while (items.length > MAX + 1) drop(items[items.length - 1]);
  if (items.length > MAX) setTimeout(() => { if (items.length > MAX) drop(items[items.length - 1]); }, 0);
  void el.offsetWidth; // стартовое положение — до перехода
  layout(); swipe(it); arm(it, ms);
}

/* ———————————— C. «Копировать → Готово ✓» ———————————— */
/** Кнопка на 1.6 с показывает «Готово ✓» (ширина не меняется) + уведомление. */
export function copyDone(btn, { label = 'Готово ✓', note = 'Скопировано' } = {}) {
  if (note) toast(note);
  if (!btn || !btn.isConnected) return;
  if (!btn.__cp) {
    const w = btn.getBoundingClientRect().width;
    const a = mk('span', 'u343-cp-a'); while (btn.firstChild) a.appendChild(btn.firstChild);
    const b = mk('span', 'u343-cp-b', label); b.setAttribute('aria-hidden', 'true');
    btn.__cp = { a, b, w0: btn.style.width, t: 0 };
    if (w) btn.style.width = w + 'px';
    btn.classList.add('u343-cp'); btn.append(a, b); void btn.offsetWidth;
  }
  const cp = btn.__cp; clearTimeout(cp.t);
  btn.classList.add('on');
  cp.t = setTimeout(() => {
    btn.classList.remove('on');
    cp.t = setTimeout(() => { if (btn.__cp !== cp) return; while (cp.a.firstChild) btn.insertBefore(cp.a.firstChild, cp.a); cp.a.remove(); cp.b.remove(); btn.classList.remove('u343-cp'); btn.style.width = cp.w0; btn.__cp = null; }, reduced() ? 0 : 420);
  }, 1600);
}
/** Копирование + морф кнопки; при отказе буфера — уведомление об ошибке. */
export async function copyText(text, btn, opts) {
  try { await navigator.clipboard.writeText(String(text)); copyDone(btn, opts); return true; }
  catch (_) { toast('Не удалось скопировать'); return false; }
}

/* ———————————— B. Кнопка отправки: Отправляем → ✓ / ошибка ———————————— */
/** sendBtn(btn).busy('Отправляем'), .ok('Заявка у нас'), .err('Не отправилось'), .idle() — размер кнопки не меняется. */
export function sendBtn(btn) {
  if (!btn) return { busy() {}, ok() {}, err() {}, idle() {} };
  if (!btn.__sb) {
    const lab = mk('span', 'u343-sb-l'); while (btn.firstChild) lab.appendChild(btn.firstChild);
    const busy = mk('span', 'u343-sb-x u343-sb-busy'); busy.append(svgEl('spin'), mk('span', '', 'Отправляем'));
    const ok = mk('span', 'u343-sb-x u343-sb-ok'); ok.append(svgEl('ok'), mk('span', '', 'Готово'));
    const err = mk('span', 'u343-sb-x u343-sb-err'); err.append(svgEl('err'), mk('span', '', 'Не отправилось'));
    btn.classList.add('u343-sb'); btn.append(lab, busy, ok, err);
    btn.__sb = { lab, busy, ok, err, t: 0 };
  }
  const S = btn.__sb;
  const set = (st, text) => {
    clearTimeout(S.t);
    if (text && S[st]) S[st].lastChild.textContent = text;
    btn.dataset.sb = st;
    if (st === 'err') { btn.classList.remove('u343-shake'); void btn.offsetWidth; btn.classList.add('u343-shake'); }
  };
  return {
    label(text) { S.lab.textContent = text; },
    busy(t) { set('busy', t); btn.setAttribute('aria-busy', 'true'); },
    ok(t) { set('ok', t); btn.removeAttribute('aria-busy'); },
    err(t, back = 2200) { set('err', t); btn.removeAttribute('aria-busy'); S.t = setTimeout(() => { btn.dataset.sb = 'idle'; }, back); },
    idle() { set('idle'); btn.removeAttribute('aria-busy'); },
  };
}

/* ———————————— A. Потянуть вниз — обновить ———————————— */
const TH = 64; const HOLD = 58; const MAXP = 120;
const rubber = (d) => MAXP * (1 - Math.exp(-d / 150));
/** initPull({ view: '#view-tops', refresh: async () => {} }) — только когда экран прокручен до верха и тянут вниз. */
export function initPull({ view, refresh, blocked = () => false }) {
  const isTma = () => document.documentElement.classList.contains('tma');
  // В Telegram тянуть вниз безопасно только если вертикальные свайпы (закрытие мини-аппа) выключены
  const allowed = () => { if (!isTma()) return true; const W = window.Telegram?.WebApp; return !!W && W.isVerticalSwipesEnabled === false; };
  let ring = null, pill = null, st = null, busy = false, pos = 0;
  const vEl = () => document.querySelector(view);
  const ensure = () => {
    if (ring && ring.isConnected) return;
    ring = mk('div', 'u343-ring'); ring.setAttribute('aria-hidden', 'true');
    const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 30 30'); const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', '15'); c.setAttribute('cy', '15'); c.setAttribute('r', '11'); c.setAttribute('pathLength', '100'); s.appendChild(c); ring.appendChild(s);
    pill = mk('div', 'u343-upd'); pill.setAttribute('role', 'status');
    document.body.append(ring, pill);
  };
  let top0 = 0;
  const paint = (p, spin) => {
    const v = vEl(); if (!v) return; pos = p;
    v.style.translate = p > 0.3 ? `0 ${p.toFixed(1)}px` : '';
    const k = Math.min(1, p / TH);
    ring.style.top = (top0 + p / 2 - 15) + 'px';
    ring.style.opacity = String(Math.min(1, Math.max(0, (p - 8) / 30)));
    ring.style.transform = `scale(${(0.6 + 0.4 * k).toFixed(3)})${spin ? '' : ` rotate(${(-90 + k * 270).toFixed(1)}deg)`}`;
    ring.firstChild.firstChild.style.strokeDashoffset = String(100 - Math.max(4, k * 74));
  };
  const sp = spring({ k: 260, zeta: 0.82, value: 0, eps: 0.2, onUpdate: (x) => paint(Math.max(0, x), busy) });
  const fmt = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  async function run() {
    busy = true; ring.classList.add('spin'); sp.set(HOLD);
    try { navigator.vibrate?.(8); window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch (_) {}
    const t0 = performance.now(); let ok = true;
    try { await refresh(); } catch (_) { ok = false; }
    const wait = Math.max(0, 650 - (performance.now() - t0)); await new Promise((r) => setTimeout(r, wait));
    ring.classList.remove('spin'); busy = false;
    pill.textContent = ok ? 'Обновлено · ' + fmt() : 'Не обновилось — проверь интернет';
    pill.style.top = (top0 + 4) + 'px';
    pill.classList.add('on'); clearTimeout(pill.__t); pill.__t = setTimeout(() => pill.classList.remove('on'), 1700);
    sp.set(0);
  }
  const y = (e) => (e.touches && e.touches[0] ? e.touches[0] : e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e);
  document.addEventListener('touchstart', (e) => {
    const v = vEl();
    if (busy || !v || !v.classList.contains('active') || !allowed() || blocked() || e.touches.length !== 1) return;
    if ((window.scrollY || document.scrollingElement?.scrollTop || 0) > 0) return;
    if (!e.target.closest || !e.target.closest(view) || e.target.closest('input, textarea, select, [role="dialog"], .t72-discs, #n3Dock')) return;
    const p = y(e); ensure(); top0 = Math.max(0, v.getBoundingClientRect().top);
    st = { x: p.clientX, y: p.clientY, lock: '' };
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', (e) => {
    if (!st) return; const p = y(e); const dx = p.clientX - st.x; const dy = p.clientY - st.y;
    if (!st.lock) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
      st.lock = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.15 && (window.scrollY || 0) <= 0 ? 'y' : 'no'; // горизонталь — свайп вкладок
      if (st.lock === 'no') { st = null; return; }
      st.y0 = p.clientY;
    }
    if (e.cancelable) e.preventDefault();
    const d = Math.max(0, p.clientY - st.y0);
    const r = reduced() ? Math.min(d, HOLD) : rubber(d);
    sp.snap(r); paint(r, false);
    if (!st.armed && r >= TH) { st.armed = true; try { window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); } catch (_) {} }
    if (st.armed && r < TH - 6) st.armed = false;
  }, { passive: false, capture: true });
  const end = () => { if (!st) return; const go = st.lock === 'y' && pos >= TH; st = null; if (go) void run(); else sp.set(0); };
  document.addEventListener('touchend', end, { passive: true, capture: true });
  document.addEventListener('touchcancel', end, { passive: true, capture: true });
  return { refreshNow: () => { ensure(); const v = vEl(); if (v) top0 = Math.max(0, v.getBoundingClientRect().top); void run(); } };
}
if (typeof window !== 'undefined') window.__u343 = { toast, copyDone, sendBtn };
