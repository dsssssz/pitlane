/* v318: отсчёт перед замером (идея «Countdown», godly.website), карточка шейра заезда в духе Strava / деков (сторис 1080×1920 и пост 1080×1350),
 * колода машин в духе Wallet (идея «E-Wallet», godly.website).
 * Всё — своя реализация на ванильном JS/CSS (код с сайтов не копировался). Строки — в V318_I18N.
 * Отсчёт — только визуальный: замер уже вооружён до его начала, время по-прежнему стартует с реального движения (GPS), отсчёт ни на что не влияет. */
export const V318_I18N = { ru: {
  cdCap: 'Приготовься', cdGo: 'GO', cdReady: 'Готов — трогайся', cdSub: 'время пойдёт с первого движения', cdSkip: 'Коснись, чтобы скрыть',
  measured: 'Measured by PITLANE GPS', measuredPhone: 'Measured by PITLANE · GPS телефона', measuredSim: 'PITLANE · симуляция',
  pb: (d) => d + ' к лучшему', pbFirst: 'Первый замер', pbSame: 'Повтор лучшего', lap: 'Круг', s: 'с', kmh: 'км/ч',
  hero: { '0-100': '0–100 км/ч', '402m': '¼ мили', '100-200': '100–200 км/ч', '201m': '⅛ мили', '0-60': '0–60 км/ч', '60ft': '60 ft' },
  sp: { '60ft': '60 ft', '0-100': '0–100', '100-200': '100–200', '402m': '¼ мили', vmax: 'Vmax' },
  post: 'Пост 4:5',
  deckMain: 'Основная', deckPick: 'Сделать основной', deckOf: (i, n) => i + ' из ' + n, deckHint: 'Листай — другие машины из гаража',
} };
const L = V318_I18N.ru;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
let D = {};
export function initV318(ctx) { D = ctx || {}; }

/* ———————————— 1. Отсчёт 3-2-1 ———————————— */
let CD = null;
/** Показывает 3 · 2 · 1 · GO поверх экрана замера. Не трогает замер: только картинка и лёгкая вибрация.
 *  Закрывается касанием, сам — после GO, и сразу, если машина уже поехала (isLive). «Уменьшить движение» — без отсчёта. */
export function countdown318({ isLive = () => false, hap = () => {}, step = 720 } = {}) {
  cdClose(true);
  if (reduced()) return null;
  const host = document.getElementById('runDrive') || document.body;
  const root = el('div', 'cd318'); root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'assertive');
  const cap = el('span', 'cd-cap', L.cdCap); const win = el('div', 'cd-win'); const sub = el('span', 'cd-sub', L.cdSkip);
  const bar = el('i', 'cd-bar'); root.append(cap, win, bar, sub);
  host.appendChild(root);
  const st = { root, win, timers: [], poll: 0, done: false };
  CD = st;
  const put = (txt, go) => {
    const old = win.querySelector('.cd-d:not(.out)'); if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 420); }
    const d = el('b', 'cd-d' + (go ? ' go' : ''), txt); win.appendChild(d);
    root.classList.toggle('is-go', !!go);
  };
  const seq = [['3'], ['2'], ['1'], [L.cdGo, true]];
  seq.forEach(([t, go], i) => st.timers.push(setTimeout(() => {
    if (st.done) return;
    put(t, go); try { hap(go ? 'medium' : 'light'); } catch (_) {}
    if (go) { cap.textContent = L.cdReady; sub.textContent = L.cdSub; }
  }, i * step)));
  root.style.setProperty('--cd-step', step + 'ms');
  st.timers.push(setTimeout(() => cdClose(), seq.length * step + 700));
  root.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); cdClose(); }, { once: true });
  st.poll = setInterval(() => { try { if (isLive()) cdClose(true); } catch (_) {} }, 50);
  requestAnimationFrame(() => root.classList.add('on'));
  return st;
}
export function cdClose(now = false) {
  const st = CD; if (!st || st.done) return; st.done = true; CD = null;
  st.timers.forEach(clearTimeout); clearInterval(st.poll);
  if (now || reduced()) { st.root.remove(); return; }
  st.root.classList.remove('on'); st.root.classList.add('bye'); setTimeout(() => st.root.remove(), 260);
}
export const cdActive = () => !!CD;

/* ———————————— 2. Карточка заезда (сторис 1080×1920, пост 1080×1350) ———————————— */
const num = (v) => Number(String(v ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
function loadImg(src) { return new Promise((r) => { if (!src) return r(null); const i = new Image(); i.decoding = 'async'; i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); }
async function fontsReady() {
  try { await Promise.all(['500 200px "Sofia Sans Condensed"', '700 60px "Sofia Sans Condensed"', '500 30px "Golos Text"', '600 30px "Golos Text"'].map((f) => document.fonts.load(f))); } catch (_) {}
}
/** Сетка отметок: только то, что реально пройдено в этом заезде (никаких выдуманных цифр). */
export function runCells(p) {
  const sp = (p && typeof p.splits === 'object' && p.splits) || {};
  const out = [];
  const hero = String(p?.type || '');
  for (const k of ['60ft', '0-100', '100-200', '402m']) {
    const r = sp[k]; const t = Array.isArray(r) ? Number(r[0]) : NaN;
    if (k === hero || !(t > 0 && t < 600)) continue;
    out.push({ k: L.sp[k], v: t.toFixed(2), u: L.s, at: k === '402m' && r[1] > 0 ? '@' + Math.round(r[1]) : '' });
  }
  const vm = Number(p?.vmax) > 0 ? Number(p.vmax) : (Array.isArray(p?.curve?.v) ? Math.max(...p.curve.v.map(Number).filter((x) => x >= 0 && x <= 500)) : 0);
  if (vm > 0 && Number.isFinite(vm)) out.push({ k: L.sp.vmax, v: String(Math.round(vm)), u: L.kmh, at: '' });
  return out.slice(0, 6);
}
export function pbLine(p) {
  if (!p) return null;
  if (Number.isFinite(p.pbD)) { const a = Math.abs(p.pbD); if (a < 0.005) return { t: L.pbSame, cls: 'eq' }; return { t: L.pb((p.pbD < 0 ? '−' : '+') + a.toFixed(2).replace(/0$/, '')), cls: p.pbD < 0 ? 'up' : 'dn' }; }
  if (p.pbFirst) return { t: L.pbFirst, cls: 'eq' };
  return null;
}
export function measuredLabel(p) { return p?.src === 'ext' ? L.measured : p?.src === 'sim' ? L.measuredSim : L.measuredPhone; }
/** fmt: 'story' (1080×1920) | 'post' (1080×1350). */
export async function drawRunCard318(p, fmt = 'story') {
  await fontsReady();
  const W = 1080, H = fmt === 'post' ? 1350 : 1920, post = fmt === 'post';
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const S = (w, px) => `${w} ${px}px "Sofia Sans Condensed", "Arial Narrow", sans-serif`;
  const G = (w, px) => `${w} ${px}px "Golos Text", -apple-system, Roboto, Arial, sans-serif`;
  const T1 = '#f2efe9', T2 = '#a8a8a8', T3 = '#8f8f8f', LINE = '#1f1f1f', BAD = '#e10600';
  const txt = (s, X, Y, font, col = T1, ls = 0, align = 'left') => { x.font = font; x.fillStyle = col; x.textAlign = align; try { x.letterSpacing = ls + 'px'; } catch (_) {} x.fillText(s, X, Y); try { x.letterSpacing = '0px'; } catch (_) {} x.textAlign = 'left'; };
  const hline = (Y, X0 = P, X1 = W - P) => { x.fillStyle = LINE; x.fillRect(X0, Y, X1 - X0, 2); };
  const P = 72;
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  // шапка
  txt('PITLANE', P, post ? 110 : 150, S(700, 34), T1, 10);
  txt(String(p.date || '').slice(0, 17), W - P, post ? 110 : 150, G(500, 28), T3, 0, 'right');
  // что меряли
  const isLap = p.type === 'lap' || p.type === 'круг';
  const kind = isLap ? (L.lap + (p.track ? ' · ' + String(p.track) : '')) : (L.hero[p.type] || String(p.type || ''));
  let y = post ? 230 : 330;
  txt(kind.toUpperCase().slice(0, 34), P, y, G(600, 28), T3, 5);
  // огромная цифра
  const raw = String(p.time || '—').replace(/\s*с\s*$/, '');
  let fs = post ? 340 : 420; x.font = S(500, fs);
  while (x.measureText(raw).width > W - 2 * P - 90 && fs > 140) { fs -= 10; x.font = S(500, fs); }
  const base = y + fs * 0.84;
  txt(raw, P - 8, base, S(500, fs), '#fff', -fs * 0.03);
  const wNum = x.measureText(raw).width;
  if (!isLap) txt(L.s, P + wNum + 6, base, S(500, Math.round(fs * 0.2)), T3);
  y = base + (post ? 70 : 90);
  const pb = pbLine(p);
  if (pb) { txt(pb.t, P, y, S(600, post ? 52 : 60), pb.cls === 'dn' ? BAD : T1); y += post ? 40 : 50; }
  // фото машины — справа, с выходом за край
  const photo = await loadImg(D.photoFor?.(p) || '');
  const carTop = post ? y + 10 : y + 40; const carH = post ? 330 : 360;
  if (photo) {
    const r = photo.naturalWidth / photo.naturalHeight; let w = carH * r; let h = carH; if (w > W * 0.98) { w = W * 0.98; h = w / r; }
    x.drawImage(photo, W - w + Math.round(w * 0.08), carTop + (carH - h) / 2, w, h);
  }
  y = carTop + carH + (post ? 30 : 50);
  txt(String(p.car || '').slice(0, 34), P, y, G(600, post ? 40 : 46), T1); y += post ? 52 : 62;
  // сетка отметок на волосяных линиях
  const cells = runCells(p);
  if (cells.length) {
    const cols = post ? Math.min(cells.length, 4) : cells.length === 4 ? 2 : Math.min(cells.length, 3); const rows = Math.ceil(cells.length / cols);
    const cw = (W - 2 * P) / cols; const ch = post ? 150 : 160;
    hline(y);
    for (let i = 0; i < cells.length; i++) {
      const cx = P + (i % cols) * cw; const cy = y + Math.floor(i / cols) * ch;
      if (i % cols) { x.fillStyle = LINE; x.fillRect(cx, cy + 24, 2, ch - 48); }
      const pad = i % cols ? 28 : 0;
      txt(cells[i].k.toUpperCase(), cx + pad, cy + 54, G(600, 24), T3, 4);
      txt(cells[i].v, cx + pad - 3, cy + (post ? 128 : 138), S(500, post ? 76 : 88), T1, -1);
      x.font = S(500, post ? 76 : 88); const vw = x.measureText(cells[i].v).width;
      txt(cells[i].u + (cells[i].at && cols < 4 ? ' ' + cells[i].at : ''), cx + pad + vw + 6, cy + (post ? 128 : 138), G(500, 24), T3);
      if ((i + 1) % cols === 0 || i === cells.length - 1) hline(cy + ch);
    }
    y += rows * ch;
  }
  // подвал
  const fy = H - (post ? 80 : 110);
  hline(fy - (post ? 40 : 56));
  txt(measuredLabel(p).toUpperCase(), P, fy, G(600, 24), T2, 4);
  const nick = String(p.nick || '').slice(0, 24);
  if (nick) txt('@' + nick.replace(/^@/, ''), W - P, fy, G(600, 30), T1, 0, 'right');
  return c;
}

/* ———————————— 3. Колода машин (Wallet) ———————————— */
/** front — готовая карточка .cw291 (основная машина), others — [{ id, name, html }] из гаража.
 *  Карты сзади выглядывают сверху; свайп в сторону — следующая карта; у неосновной — «Сделать основной». */
export function mountWalletDeck(front, others, { onPick } = {}) {
  if (!front || !Array.isArray(others) || !others.length || front.closest('.wl318')) return null;
  const wrap = el('div', 'wl318'); const stack = el('div', 'wl-stack'); const foot = el('div', 'wl-foot');
  front.parentNode.insertBefore(wrap, front);
  const cards = [{ el: front, main: true }];
  for (const o of others.slice(0, 4)) {
    const c = el('div', 'cw291 big sc293 wl-card emb318'); c.innerHTML = o.html; c.setAttribute('aria-hidden', 'true');
    const b = el('button', 'wl-pick', L.deckPick); b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); try { onPick?.(o); } catch (_) {} });
    c.appendChild(b); cards.push({ el: c, main: false, o });
  }
  front.classList.add('wl-card');
  const tag = el('span', 'wl-main', L.deckMain); front.appendChild(tag);
  cards.forEach((c) => stack.appendChild(c.el));
  const dots = el('span', 'wl-n'); const hint = el('span', 'wl-hint', L.deckHint);
  foot.append(hint, dots); wrap.append(stack, foot);
  wrap.style.setProperty('--wl-n', String(Math.min(cards.length, 3) - 1));
  let order = cards.map((_, i) => i);
  const paint = () => {
    order.forEach((ci, d) => { const c = cards[ci].el; c.style.setProperty('--d', String(d)); c.classList.toggle('wl-front', d === 0); c.classList.toggle('wl-hide', d > 2); c.setAttribute('aria-hidden', d === 0 ? 'false' : 'true'); c.style.zIndex = String(10 - d); });
    dots.textContent = L.deckOf(order[0] + 1, cards.length);
  };
  paint();
  const next = (dir) => { if (dir > 0) order = [...order.slice(1), order[0]]; else order = [order[order.length - 1], ...order.slice(0, -1)]; paint(); try { D.hap?.(8); } catch (_) {} };
  // свайп (жест по передней карте)
  let sx = 0, sy = 0, dx = 0, drag = false, cur = null, t0 = 0;
  stack.addEventListener('pointerdown', (e) => { cur = cards[order[0]].el; if (!cur.contains(e.target)) { cur = null; return; } sx = e.clientX; sy = e.clientY; dx = 0; drag = false; t0 = performance.now(); });
  stack.addEventListener('pointermove', (e) => {
    if (!cur) return; const mx = e.clientX - sx, my = e.clientY - sy;
    if (!drag && Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.3) { drag = true; cur.classList.add('wl-drag'); try { stack.setPointerCapture(e.pointerId); } catch (_) {} }
    if (drag) { dx = mx; cur.style.setProperty('--wl-dx', dx.toFixed(1) + 'px'); cur.style.setProperty('--wl-rot', (dx / 40).toFixed(2) + 'deg'); }
  });
  const end = () => {
    if (!cur) return; const c = cur; cur = null; c.classList.remove('wl-drag'); c.style.removeProperty('--wl-dx'); c.style.removeProperty('--wl-rot');
    if (!drag) return; const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
    if (Math.abs(dx) > 80 || v > 0.5) { c.dataset.wlSwiped = '1'; setTimeout(() => { delete c.dataset.wlSwiped; }, 350); next(dx < 0 ? 1 : -1); }
    drag = false;
  };
  stack.addEventListener('pointerup', end); stack.addEventListener('pointercancel', end);
  // клик после свайпа не должен открывать каталог
  stack.addEventListener('click', (e) => { const c = e.target.closest('.wl-card'); if (c?.dataset.wlSwiped) { e.stopPropagation(); e.preventDefault(); } }, true);
  stack.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') next(1); else if (e.key === 'ArrowLeft') next(-1); });
  return { next, order: () => order.slice() };
}
