/**
 * v101: coach-marks (Apple / Revolut level).
 * — затемнение с вырезом-spotlight вокруг элемента (скруглённый, мягкий ореол), пузырь со стрелкой,
 *   автопозиция сверху/снизу без выхода за экран (320–430 px, safe-area), spring-перетекание ~300 мс;
 * — прогресс-точки, «Далее» / «Назад» / «Пропустить», свайп влево/вправо, Esc / ← →;
 * — haptic через Telegram.WebApp.HapticFeedback; тап по выделенному элементу работает как обычно и ведёт туда;
 * — сценарии: тур первого запуска (нижние вкладки), первый заход в каждый раздел, «Это моя машина» (пошагово);
 * — флаги «уже видел» в localStorage; prefers-reduced-motion — без анимации. Только textContent, без эмодзи.
 * Существующие «i»-подсказки не трогаем (свои классы cm-*).
 */
const KEY = 'pitlane-tips-v2';

/** Each step: target (selector list, first visible wins), title, text, tap: 'end' | 'next' | 'stay', before(): prepare UI. */
const nav = (v) => `.nav-btn[data-view="${v}"]`;
export const SCENARIOS = {
  tour: [
    { target: nav('garage'), title: 'Бокс', text: 'Твои машины. Отметь ту, на которой едешь, — круги запишутся на неё.' },
    { target: nav('run'), title: 'Заезд', text: 'Замер 0–100 и круг по GPS. Старт и финиш ловятся сами.' },
    { target: nav('duels'), title: 'Дуэли', text: 'Вызов по ссылке. Побеждает лучший GPS-заезд за срок.' },
    { target: nav('tops'), title: 'Топ', text: 'Честные рекорды трасс. Здесь же — команды.' },
  ],
  home: [{ target: '#homeHero', title: 'Главная', text: 'Твоя машина и главное за день. Тап по машине — в Бокс.' }],
  garage: [
    { target: '#btnMyCarGarage', title: 'Это моя машина', text: 'Выбери машину стрелками и нажми сюда. Каждый круг запишется на неё.' },
    { target: '#btnCarPicker', title: 'Весь гараж', text: 'Листай стрелками или открой список всех машин.' },
  ],
  run: [{ target: '#runIdleCard', title: 'Замер', text: 'Встань, дождись точности GPS и жми «Старт». Разгон ловится сам.' }],
  lap: [
    { target: '#trackWheel', title: 'Трасса', text: 'Крути барабан и выбери автодром.' },
    { target: '#btnMyCarLap', title: 'Машина для зачёта', text: 'На эту машину запишется круг. Тап — сменить.' },
    { target: '#btnLapStart', title: 'Старт круга', text: 'Старт, финиш и сектора ловятся по GPS.' },
  ],
  tops: [
    { target: '#topsChips', title: 'Топ', text: 'Выбери трассу или замер — увидишь лучшие честные заезды.' },
    { target: '#btnRoomsOpen', title: 'Команды', text: 'Свой топ и дуэли — только для своих.' },
  ],
  duels: [{ target: '#btnDuelOpen', title: 'Дуэли', text: 'Брось вызов по ссылке. Побеждает лучший GPS-заезд за срок.' }],
  pulse: [{ target: '#pulseText', title: 'Paddock', text: 'Лента сообщества. Поделись заездом или фото.' }],
  account: [{ target: '#btnMyCarAcc', title: 'Профиль', text: 'Вход через Telegram хранит результаты. Здесь же — машина и команды.' }],
  teams: [{ target: '#teamSheet:not(.hidden) .race-sheet-head, #roomSheet:not(.hidden) .race-sheet-head', title: 'Команды', text: 'Публичная страница и лента. Дуэли, топ и сезон — только для своих.' }],
  // first time the «Это моя машина» sheet opens
  mycar: [
    { target: '#myCarModels', title: 'Шаг 1 · Машина', text: 'Выбери, на чём едешь сегодня.', tap: 'stay' },
    { target: '#myCarTyres', title: 'Шаг 2 · Резина', text: 'Выбери шины — топ сравнивает равных.', tap: 'stay' },
    { target: '#myCarSave', title: 'Шаг 3 · Готово', text: 'Нажми — и каждый круг запишется на эту машину.' },
  ],
};
// explicit «Как привязать машину?» walkthrough: garage button → sheet → model → tyre → save
SCENARIOS.mycarHow = [
  { target: '#btnMyCarGarage', title: 'Как привязать машину', text: 'Открой Бокс, выбери машину стрелками и нажми «Это моя машина».', before: () => D.goToView?.('garage'), tap: 'next' },
  { ...SCENARIOS.mycar[0], before: () => D.openMyCar?.() },
  SCENARIOS.mycar[1],
  SCENARIOS.mycar[2],
];

let D = {};
let state = load();
let cur = null; // { id, steps, i, root, spot, bubble, ... }
let pending = null;

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { seen: s.seen || {}, tour: !!s.tour }; } catch (_) { return { seen: {}, tour: false }; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function btn(cls, text, on) { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); on(e); }); return b; }
const reduceMotion = () => { try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
function haptic(kind) {
  try {
    const h = window.Telegram?.WebApp?.HapticFeedback;
    if (!h) return;
    if (kind === 'select') h.selectionChanged();
    else if (kind === 'done') h.notificationOccurred('success');
    else h.impactOccurred(kind || 'light');
  } catch (_) {}
}

/** Something else owns the screen: intro, HUDs, dialogs (sheets are fine for sheet scenarios). */
function busy(allowSheets) {
  const intro = document.getElementById('intro');
  if (intro && !intro.classList.contains('done') && getComputedStyle(intro).display !== 'none') return true;
  for (const id of ['lapDrive', 'runDrive']) { const n = document.getElementById(id); if (n && !n.classList.contains('hidden')) return true; }
  if (document.querySelector('.share-card:not(.hidden), .ghost-result:not(.hidden)')) return true;
  if (!allowSheets && document.querySelector('.crew-sheet:not(.hidden)')) return true;
  return false;
}

function visible(n) {
  if (!n) return false;
  const r = n.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(n);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}
function findTarget(sel) {
  if (!sel) return null;
  for (const n of document.querySelectorAll(sel)) if (visible(n)) return n;
  return null;
}

let safe = null;
function safeArea() {
  if (safe) return safe;
  const p = el('div');
  p.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(p);
  const cs = getComputedStyle(p);
  safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  p.remove();
  return safe;
}

/* ——————————————— overlay ——————————————— */
function build() {
  const root = el('div', 'cm-root');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  if (reduceMotion()) root.classList.add('cm-still');
  const spot = el('div', 'cm-spot');
  // four blockers around the hole: taps on the dim area do nothing, the highlighted element stays tappable
  const blk = ['t', 'r', 'b', 'l'].map((k) => { const b = el('div', 'cm-block cm-block-' + k); root.appendChild(b); return b; });
  const bubble = el('div', 'cm-bubble');
  bubble.setAttribute('aria-live', 'polite');
  const arrow = el('i', 'cm-arrow');
  const inner = el('div', 'cm-inner');
  bubble.append(arrow, inner);
  root.append(spot, bubble);
  document.body.appendChild(root);
  // swipe on the bubble: ← next, → back
  let sx = null; let sy = null;
  bubble.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  bubble.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const t = e.changedTouches[0]; const dx = t.clientX - sx; const dy = t.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4) { if (dx < 0) next(); else back(); }
  }, { passive: true });
  return { root, spot, blk, bubble, arrow, inner };
}

function onDocClick(e) {
  if (!cur || !cur.target) return;
  if (cur.root.contains(e.target)) return;
  if (!cur.target.contains(e.target)) return;
  // the real element handles the tap (navigation etc.); the coach-mark follows
  const step = cur.steps[cur.i];
  const how = step.tap || 'end';
  if (how === 'stay') { setTimeout(() => place(), 30); return; }
  setTimeout(() => { if (how === 'next') next(); else finish(true); }, 60);
}
function onKey(e) {
  if (!cur) return;
  if (e.key === 'Escape') { e.preventDefault(); finish(true); }
  else if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') back();
}
let raf = 0;
function schedulePlace() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; place(); }); }

function run(id, steps, opts = {}) {
  if (cur) return false;
  const list = steps.slice();
  const ui = build();
  cur = { id, steps: list, i: -1, ...ui, target: null, opts };
  ui.root.setAttribute('aria-label', id === 'tour' ? 'Короткий тур по PITLANE' : 'Подсказка');
  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', schedulePlace);
  window.visualViewport?.addEventListener('resize', schedulePlace);
  document.addEventListener('scroll', schedulePlace, { capture: true, passive: true });
  // follow the element while it moves (smooth scroll, hero animations, sheet slide-in) — cheap rect compare per frame
  let last = '';
  const follow = () => {
    if (cur !== c) return;
    const t = c.target;
    if (t && t.isConnected) {
      const r = t.getBoundingClientRect();
      const key = Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width) + ',' + Math.round(r.height) + ',' + window.innerWidth + ',' + window.innerHeight;
      if (key !== last) { last = key; place(); }
    }
    c.follow = requestAnimationFrame(follow);
  };
  const c = cur;
  c.follow = requestAnimationFrame(follow);
  go(0, 1);
  requestAnimationFrame(() => ui.root.classList.add('on'));
  return true;
}

async function go(i, dir) {
  if (!cur) return;
  const c = cur;
  let k = i;
  // skip steps whose target is not on screen (after their before() hook had a chance to open it)
  while (k >= 0 && k < c.steps.length) {
    const s = c.steps[k];
    if (s.before) { try { await s.before(); } catch (_) {} await waitFor(s.target, 1600); }
    if (cur !== c) return;
    if (findTarget(s.target)) break;
    k += dir;
  }
  if (k < 0) k = c.i >= 0 ? c.i : 0;
  if (k >= c.steps.length || !findTarget(c.steps[k]?.target)) {
    if (c.i < 0) { finish(false, true); return; }
    if (k >= c.steps.length) { finish(true); return; }
    return;
  }
  c.i = k;
  c.target = findTarget(c.steps[k].target);
  ensureInView(c.target);
  draw();
  const first = !c.root.dataset.placed;
  if (first) c.root.classList.add('cm-snap');
  // spring between steps; afterwards the spot sticks to a moving element without lag
  c.root.classList.remove('cm-track');
  clearTimeout(c.trackT);
  c.trackT = setTimeout(() => { if (cur === c) c.root.classList.add('cm-track'); }, reduceMotion() ? 0 : 380);
  place();
  if (first) { c.root.dataset.placed = '1'; requestAnimationFrame(() => requestAnimationFrame(() => c.root.classList.remove('cm-snap'))); }
  setTimeout(() => cur === c && place(), reduceMotion() ? 0 : 360);
}
function waitFor(sel, ms) {
  return new Promise((res) => {
    const t0 = performance.now();
    const tick = () => { if (findTarget(sel) || performance.now() - t0 > ms) res(); else setTimeout(tick, 60); };
    tick();
  });
}
function ensureInView(n) {
  const r = n.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top < 70 || r.bottom > vh - 110) {
    try { n.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }); } catch (_) { n.scrollIntoView(); }
  }
}

function draw() {
  const c = cur; const s = c.steps[c.i]; const n = c.steps.length;
  const inner = c.inner;
  inner.classList.remove('cm-in');
  void inner.offsetWidth;
  inner.replaceChildren();
  if (n > 1) inner.appendChild(el('span', 'cm-k', (c.i + 1) + ' из ' + n));
  inner.appendChild(el('b', 'cm-title', s.title));
  inner.appendChild(el('p', 'cm-text', s.text));
  const row = el('div', 'cm-row');
  if (n > 1) {
    const dots = el('div', 'cm-dots');
    dots.setAttribute('aria-hidden', 'true');
    for (let k = 0; k < n; k++) dots.appendChild(el('i', k === c.i ? 'on' : (k < c.i ? 'done' : '')));
    row.appendChild(dots);
  } else row.appendChild(el('span', 'cm-dots'));
  const last = c.i >= n - 1;
  if (!last) row.appendChild(btn('cm-skip', 'Пропустить', () => finish(true)));
  if (c.i > 0) row.appendChild(btn('cm-back', 'Назад', back));
  const ok = btn('cm-next', last ? (n > 1 ? 'Готово' : 'Понятно') : 'Далее', next);
  row.appendChild(ok);
  inner.appendChild(row);
  inner.classList.add('cm-in');
  c.root.dataset.step = String(c.i + 1);
  c.root.dataset.scenario = c.id;
  try { ok.focus({ preventScroll: true }); } catch (_) {}
}

function place() {
  const c = cur;
  if (!c) return;
  if (!c.target || !c.target.isConnected || !visible(c.target)) {
    const t = findTarget(c.steps[c.i]?.target);
    if (!t) return;
    c.target = t;
  }
  const r = c.target.getBoundingClientRect();
  const vw = window.innerWidth; const vh = window.innerHeight;
  const sa = safeArea();
  const pad = r.height < 56 ? 6 : 8;
  const sx = Math.max(4, r.left - pad); const sy = Math.max(4, r.top - pad);
  const sw = Math.min(vw - 4, r.right + pad) - sx; const sh = Math.min(vh - 4, r.bottom + pad) - sy;
  const rad = Math.min(18, Math.max(10, Math.min(sw, sh) / 2.6));
  Object.assign(c.spot.style, { transform: `translate(${sx}px, ${sy}px)`, width: sw + 'px', height: sh + 'px', borderRadius: rad + 'px' });
  // blockers frame the hole
  const [bt, br, bb, bl] = c.blk;
  Object.assign(bt.style, { left: '0px', top: '0px', width: vw + 'px', height: sy + 'px' });
  Object.assign(bb.style, { left: '0px', top: (sy + sh) + 'px', width: vw + 'px', height: Math.max(0, vh - sy - sh) + 'px' });
  Object.assign(bl.style, { left: '0px', top: sy + 'px', width: sx + 'px', height: sh + 'px' });
  Object.assign(br.style, { left: (sx + sw) + 'px', top: sy + 'px', width: Math.max(0, vw - sx - sw) + 'px', height: sh + 'px' });
  // bubble: width 320–430 px screens → min(340, vw − 24 − safe), below if it fits, else above, else the larger side
  const b = c.bubble;
  const margin = 12;
  const w = Math.min(340, vw - margin * 2 - sa.l - sa.r);
  b.style.width = w + 'px';
  const bh = b.offsetHeight || 150;
  const gap = 14;
  const topLimit = margin + sa.t; const botLimit = vh - margin - sa.b;
  const spaceBelow = botLimit - (sy + sh) - gap;
  const spaceAbove = (sy - gap) - topLimit;
  let side = spaceBelow >= bh ? 'below' : (spaceAbove >= bh ? 'above' : (spaceBelow >= spaceAbove ? 'below' : 'above'));
  let top = side === 'below' ? sy + sh + gap : sy - gap - bh;
  top = Math.max(topLimit, Math.min(botLimit - bh, top));
  const cx = r.left + r.width / 2;
  let left = cx - w / 2;
  left = Math.max(margin + sa.l, Math.min(vw - margin - sa.r - w, left));
  Object.assign(b.style, { transform: `translate(${Math.round(left)}px, ${Math.round(top)}px)` });
  b.dataset.side = side;
  // arrow points at the element centre (kept inside the rounded corners)
  const ax = Math.max(22, Math.min(w - 22, cx - left));
  const overlaps = side === 'below' ? top < sy + sh : top + bh > sy;
  c.arrow.style.left = ax + 'px';
  c.arrow.classList.toggle('hidden', overlaps);
}

function next() {
  if (!cur) return;
  // v103: last step of «Это моя машина» — tip «Готово» must actually save, not only dismiss the coach-mark
  const last = cur.i >= cur.steps.length - 1;
  if (last && (cur.id === 'mycar' || cur.id === 'mycarHow')) {
    const save = document.getElementById('myCarSave') || cur.target;
    if (save && (save.id === 'myCarSave' || cur.target?.id === 'myCarSave')) {
      try { save.click(); } catch (_) {}
      return;
    }
  }
  if (last) { finish(true); return; }
  go(cur.i + 1, 1);
}
function back() {
  if (!cur || cur.i <= 0) return;
  go(cur.i - 1, -1);
}
function finish(markSeen, silent) {
  const c = cur;
  if (!c) return;
  cur = null;
  if (c.follow) cancelAnimationFrame(c.follow);
  document.removeEventListener('click', onDocClick, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('resize', schedulePlace);
  window.visualViewport?.removeEventListener('resize', schedulePlace);
  document.removeEventListener('scroll', schedulePlace, { capture: true });
  if (markSeen) {
    if (c.id === 'tour') { state.tour = true; state.seen.home = 1; } else state.seen[c.id] = 1;
    if (c.id === 'mycarHow') state.seen.mycar = 1;
    save();
    // v103: no haptic on tip navigation / finish (Maga: buzz on «Далее»)
  }
  const r = c.root;
  r.classList.remove('on');
  setTimeout(() => r.remove(), reduceMotion() ? 0 : 240);
  c.opts.onEnd?.();
  // a tap on the highlighted tab navigated somewhere → that section gets its own coach-mark now
  if (markSeen) setTimeout(() => { try { const v = document.querySelector('.view.active')?.id?.slice(5); if (v && !cur) tipsOnView(v); } catch (_) {} }, 350);
}

/* ——————————————— public API ——————————————— */
/** Called on every view / section entry (and when a sheet opens: 'teams', 'mycar'). */
export function tipsOnView(id) {
  if (!SCENARIOS[id] || id === 'tour' || id === 'mycarHow') return;
  if (!state.tour) { if (id === 'home') queueTour(); return; } // the tour comes first
  if (state.seen[id] || cur) return;
  clearTimeout(pending);
  const sheet = id === 'teams' || id === 'mycar';
  pending = setTimeout(() => {
    if (state.seen[id] || cur) return;
    if (busy(sheet)) return; // retried on the next entry
    if (id === 'teams' && !document.querySelector('#teamSheet:not(.hidden), #roomSheet:not(.hidden)')) return;
    if (id === 'mycar' && !document.querySelector('#myCarSheet:not(.hidden)')) return;
    run(id, SCENARIOS[id]);
  }, sheet ? 450 : 700);
}

function queueTour() {
  clearTimeout(pending);
  pending = setTimeout(() => {
    if (state.tour || cur) return;
    if (busy(false)) { pending = setTimeout(queueTour, 1500); return; }
    run('tour', SCENARIOS.tour);
  }, 900);
}
export function startTour() { if (cur) finish(false, true); return run('tour', SCENARIOS.tour); }
/** «Как привязать машину?» — full walkthrough from any screen. */
export function showMyCarHowTo() {
  if (cur) finish(false, true);
  // close sheets that could cover the garage
  return run('mycarHow', SCENARIOS.mycarHow);
}
export function tipsActive() { return !!cur; }
/** Close an open coach-mark without re-triggering section tips (used after «Это моя машина» saves). */
export function dismissTips() { if (cur) finish(true, true); }

/** Profile → «Показать подсказки снова». */
export function resetTips() {
  state = { seen: {}, tour: false };
  save();
  if (cur) finish(false, true);
}

export function initTips(deps = {}) {
  D = deps || {};
  try {
    window.__plTips = {
      state: () => JSON.parse(JSON.stringify(state)),
      reset: resetTips,
      tour: startTour,
      show: (id) => { if (cur) finish(false, true); return run(id, SCENARIOS[id]); },
      howCar: showMyCarHowTo,
      next, back, skip: () => finish(true), dismiss: () => { if (cur) finish(true, true); },
      onView: tipsOnView,
      open: () => (cur ? { scenario: cur.id, step: cur.i + 1, total: cur.steps.length, target: cur.target?.id || cur.target?.className || null, side: cur.bubble.dataset.side } : null),
      geom: () => {
        if (!cur) return null;
        const b = cur.bubble.getBoundingClientRect(); const s = cur.spot.getBoundingClientRect(); const t = cur.target?.getBoundingClientRect();
        return { vw: window.innerWidth, vh: window.innerHeight, bubble: { l: b.left, t: b.top, r: b.right, b: b.bottom }, spot: { l: s.left, t: s.top, r: s.right, b: s.bottom }, target: t ? { l: t.left, t: t.top, r: t.right, b: t.bottom } : null, side: cur.bubble.dataset.side };
      },
    };
  } catch (_) {}
}
