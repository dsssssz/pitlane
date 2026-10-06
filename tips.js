/**
 * v99: навигационные подсказки.
 * — первый запуск: короткий тур по нижним вкладкам (4 шага, подсветка вкладки);
 * — первый заход в каждый раздел: аккуратная карточка в 1–2 строки + «Понятно»;
 * — флаги «уже видел» в localStorage; «Показать подсказки снова» в профиле сбрасывает их.
 * Только textContent. Существующие «i»-подсказки не трогаем (свои классы pl-tip*, pl-tour*).
 */
const KEY = 'pitlane-tips-v1';

export const TIPS = {
  home: ['Главная', 'Сводка: твоя машина, трасса дня и свежие результаты. Отсюда — в любой раздел.'],
  garage: ['Бокс', 'Выбери машину и резину и отметь «Это моя машина» — к ней привяжется каждый круг.'],
  run: ['Замер', 'Разгон 0–100 и другие отрезки по GPS. Встань, дождись точности A/B — старт ловится сам.'],
  lap: ['Круг', 'Выбери автодром и жми «Старт круга». Старт, финиш и сектора ловятся по GPS.'],
  tops: ['Топ', 'Лучшие честные заезды по трассам и секторам. Здесь же — команды и экипажи.'],
  duels: ['Дуэли', 'Брось вызов по ссылке: побеждает лучший GPS-заезд за выбранный срок.'],
  pulse: ['Paddock', 'Лента заездов и постов сообщества. Лайкай и комментируй.'],
  teams: ['Команды', 'Публичная страница с лентой. Дуэли, топ и сезон — только внутри команды.'],
  account: ['Профиль', 'Вход через Telegram сохраняет результаты. Тут же обратная связь и подсказки.'],
};

const TOUR = [
  { view: 'home', title: 'Добро пожаловать в PITLANE', text: 'Четыре вкладки — и ты на старте. Покажем за 20 секунд.' },
  { view: 'run', title: 'Заезд', text: 'Замер 0–100 и круг по GPS. Старт и финиш ловятся сами.' },
  { view: 'garage', title: 'Бокс', text: 'Твоя машина и резина. Без активной машины круг не идёт в зачёт.' },
  { view: 'tops', title: 'Топ и команды', text: 'Честные рекорды трасс. Собери команду — дуэли и топ для своих.' },
];

let state = load();
let shownTip = null; // { id, el }
let tour = null; // { i, root }
let pending = null;

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { seen: s.seen || {}, tour: !!s.tour }; } catch (_) { return { seen: {}, tour: false }; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function btn(cls, text, on) { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', on); return b; }

/** Something else owns the screen: intro, HUDs, bottom sheets, dialogs. */
function busy() {
  const intro = document.getElementById('intro');
  if (intro && !intro.classList.contains('done') && getComputedStyle(intro).display !== 'none') return true;
  for (const id of ['lapDrive', 'runDrive']) { const n = document.getElementById(id); if (n && !n.classList.contains('hidden')) return true; }
  if (document.querySelector('.crew-sheet:not(.hidden), .share-card:not(.hidden), .ghost-result:not(.hidden)')) return true;
  return false;
}

function navBtnFor(view) {
  return document.querySelector(`.nav-btn[data-view="${view}"]`) || document.querySelector(`.nav-btn[data-alias~="${view}"]`);
}

/* ——— single tip card ——— */
function hideTip(markSeen = true) {
  if (!shownTip) return;
  if (markSeen) { state.seen[shownTip.id] = 1; save(); }
  const n = shownTip.el;
  shownTip = null;
  n.classList.remove('on');
  setTimeout(() => n.remove(), 220);
}
function renderTip(id) {
  const [title, text] = TIPS[id];
  const card = el('div', 'pl-tip');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  card.setAttribute('aria-label', 'Подсказка: ' + title);
  card.dataset.tip = id;
  const head = el('div', 'pl-tip-head');
  head.append(el('span', 'pl-tip-k', 'Подсказка'), el('b', 'pl-tip-title', title));
  const p = el('p', 'pl-tip-text', text);
  const ok = btn('pl-tip-ok', 'Понятно', () => hideTip(true));
  card.append(head, p, ok);
  document.body.appendChild(card);
  requestAnimationFrame(() => card.classList.add('on'));
  shownTip = { id, el: card };
  try { ok.focus({ preventScroll: true }); } catch (_) {}
}

/** Called on every view / section entry. */
export function tipsOnView(id) {
  if (!TIPS[id]) return;
  if (!state.tour) { if (id === 'home') queueTour(); return; } // the tour comes first
  if (state.seen[id] || tour) return;
  if (shownTip && shownTip.id === id) return;
  clearTimeout(pending);
  pending = setTimeout(() => {
    if (state.seen[id] || tour) return;
    if (id !== 'teams' && busy()) return; // retried on the next entry
    if (id === 'teams' && !document.querySelector('#teamSheet:not(.hidden), #roomSheet:not(.hidden)')) return;
    if (shownTip) hideTip(false);
    renderTip(id);
  }, 650);
}

/* ——— first-launch tour ——— */
function queueTour() {
  clearTimeout(pending);
  pending = setTimeout(() => {
    if (state.tour || tour) return;
    if (busy()) { pending = setTimeout(queueTour, 1500); return; }
    startTour();
  }, 900);
}
export function startTour() {
  if (tour) return;
  if (shownTip) hideTip(false);
  const root = el('div', 'pl-tour');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Короткий тур по PITLANE');
  const ring = el('div', 'pl-tour-ring');
  const card = el('div', 'pl-tour-card');
  root.append(ring, card);
  root.addEventListener('click', (e) => { if (e.target === root) nextStep(); });
  document.body.appendChild(root);
  tour = { i: 0, root, ring, card };
  window.addEventListener('resize', placeTour);
  drawStep();
  requestAnimationFrame(() => root.classList.add('on'));
}
function endTour(markDone = true) {
  if (!tour) return;
  const r = tour.root;
  tour = null;
  window.removeEventListener('resize', placeTour);
  r.classList.remove('on');
  setTimeout(() => r.remove(), 220);
  if (markDone) {
    state.tour = true;
    state.seen.home = 1; // the user is on «Главная»; other sections still get their own tip on first entry
    save();
  }
}
function nextStep() {
  if (!tour) return;
  if (tour.i >= TOUR.length - 1) { endTour(true); return; }
  tour.i++;
  drawStep();
}
function drawStep() {
  const s = TOUR[tour.i];
  const c = tour.card;
  c.replaceChildren();
  const dots = el('div', 'pl-tour-dots');
  TOUR.forEach((_, k) => dots.appendChild(el('i', k === tour.i ? 'on' : '')));
  c.append(
    el('span', 'pl-tip-k', 'Шаг ' + (tour.i + 1) + ' из ' + TOUR.length),
    el('b', 'pl-tip-title', s.title),
    el('p', 'pl-tip-text', s.text),
  );
  const row = el('div', 'pl-tour-row');
  row.append(dots);
  if (tour.i < TOUR.length - 1) row.append(btn('pl-tour-skip', 'Пропустить', () => endTour(true)));
  const ok = btn('pl-tip-ok', tour.i < TOUR.length - 1 ? 'Далее' : 'Понятно', nextStep);
  row.append(ok);
  c.append(row);
  tour.root.dataset.step = String(tour.i + 1);
  placeTour();
  try { ok.focus({ preventScroll: true }); } catch (_) {}
}
function placeTour() {
  if (!tour) return;
  const b = navBtnFor(TOUR[tour.i].view);
  const r = b ? b.getBoundingClientRect() : null;
  const ring = tour.ring;
  if (!r || !r.width) { ring.style.display = 'none'; return; }
  ring.style.display = '';
  const pad = 6;
  ring.style.left = (r.left - pad) + 'px';
  ring.style.top = (r.top - pad) + 'px';
  ring.style.width = (r.width + pad * 2) + 'px';
  ring.style.height = (r.height + pad * 2) + 'px';
  // card sits above the highlighted tab (tabbar is at the bottom on phones; on desktop the rail is on the left)
  const card = tour.card;
  const vw = window.innerWidth; const vh = window.innerHeight;
  if (r.top > vh * 0.5) {
    card.style.top = ''; card.style.bottom = (vh - r.top + 18) + 'px';
    const w = Math.min(340, vw - 24);
    card.style.left = Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
    card.style.width = w + 'px';
  } else {
    card.style.bottom = ''; card.style.top = Math.max(12, r.top) + 'px';
    card.style.left = (r.right + 18) + 'px';
    card.style.width = Math.min(340, vw - r.right - 30) + 'px';
  }
}

/** Profile → «Показать подсказки снова». */
export function resetTips() {
  state = { seen: {}, tour: false };
  save();
  if (shownTip) hideTip(false);
}

export function initTips() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (tour) endTour(true); else if (shownTip) hideTip(true); }
  });
  try { window.__plTips = { state: () => JSON.parse(JSON.stringify(state)), reset: resetTips, tour: startTour, show: (id) => { if (shownTip) hideTip(false); renderTip(id); }, next: nextStep, onView: tipsOnView, open: () => ({ tip: shownTip?.id || null, tour: tour ? tour.i + 1 : 0 }) }; } catch (_) {}
}
