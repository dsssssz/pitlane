/**
 * v97: «Это моя машина» + комнаты экипажей (private) + оплата сезона на комнату (Telegram Stars).
 * All user text → textContent. The server decides membership and the paywall; this file only renders.
 */
import { api } from './api.js';
import { teamLapsPublic, setTeamLapsPublic } from './teams-ui.js';

const ACTIVE_KEY = 'pitlane-room-active-v1';
const CAR_KEY = 'pitlane-mycar-v1';
const TYRES = ['Michelin Pilot Sport 4S', 'Michelin Pilot Sport Cup 2', 'Pirelli P Zero Trofeo R', 'Pirelli P Zero', 'Yokohama Advan A052', 'Toyo Proxes R888R', 'Bridgestone Potenza RE-71RS', 'Nankang CR-S', 'Continental SportContact 7'];

let D = null; // deps from app.js
const st = { car: null, carLoaded: false, rooms: [], room: null, tab: 'laps', laps: [], pending: null, inviteCode: null };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
}
function btn(cls, text, on) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (on) b.addEventListener('click', on);
  return b;
}
function fmtMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  const s = ms / 1000; const m = Math.floor(s / 60);
  return m + ':' + (s - m * 60).toFixed(3).padStart(6, '0');
}
function fmtDelta(ms) {
  if (!Number.isFinite(ms)) return '—';
  return (ms > 0 ? '+' : ms < 0 ? '−' : '±') + (Math.abs(ms) / 1000).toFixed(3);
}
function fmtDate(d) {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); } catch (_) { return d || ''; }
}
function trackName(id) { return (D.tracks().find((t) => t.id === id)?.name) || id; }
function activeRoomId() { try { return localStorage.getItem(ACTIVE_KEY) || ''; } catch (_) { return ''; } }
function setActiveRoom(id) { try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch (_) {} }
function loggedIn() { try { return !!D.isAuthed(); } catch (_) { return false; } }

function openSheet(id) {
  const s = document.getElementById(id);
  if (!s) return;
  s.classList.remove('hidden');
  s.setAttribute('aria-hidden', 'false');
  if (id === 'roomSheet') { try { D?.onSheet?.(); } catch (_) {} }
}
function closeSheet(id) {
  const s = document.getElementById(id);
  if (!s) return;
  s.classList.add('hidden');
  s.setAttribute('aria-hidden', 'true');
}

/* ———————————————— «Это моя машина» ———————————————— */
function cacheCar(car) {
  st.car = car && car.model && car.tyre ? car : null;
  st.carLoaded = true;
  try { if (st.car) localStorage.setItem(CAR_KEY, JSON.stringify(st.car)); else localStorage.removeItem(CAR_KEY); } catch (_) {}
  document.querySelectorAll('[data-mycar-line]').forEach((n) => { n.textContent = st.car ? st.car.model + ' · ' + st.car.tyre : 'не выбрана'; });
  try { refreshMyCarBar(); } catch (_) {}
}
export async function loadMyCar(force) {
  if (st.carLoaded && !force) return st.car;
  const fromLs = () => {
    try {
      const c = JSON.parse(localStorage.getItem(CAR_KEY) || 'null');
      return c && c.model && c.tyre ? c : null;
    } catch (_) { return null; }
  };
  if (!loggedIn()) {
    cacheCar(fromLs());
    return st.car;
  }
  const r = await api.getMyCar();
  if (r && r.ok !== false) {
    if (r.car && r.car.model && r.car.tyre) cacheCar(r.car);
    else {
      // server empty → keep a locally chosen car and push it up (covers TMA login after offline pick)
      const local = fromLs();
      if (local) {
        const up = await api.putMyCar({ model: local.model, tyre: local.tyre, carId: local.carId || undefined });
        cacheCar(up && up.ok !== false && up.car ? up.car : local);
      } else cacheCar(null);
    }
  } else {
    cacheCar(fromLs());
  }
  return st.car;
}

/** Call after Telegram / TMA login so a car picked offline lands on the server and the bar refreshes. */
export async function syncMyCarAfterAuth() {
  st.carLoaded = false;
  return loadMyCar(true);
}

/** Short tyre label for chips («Michelin Pilot Sport Cup 2» → «PS Cup 2 · Michelin»). */
function tyreShort(t) {
  const m = String(t).match(/^(\S+)\s+(.*)$/);
  if (!m) return t;
  const rest = m[2].replace(/^Pilot Sport\s*/i, 'PS ').replace(/^P Zero\s*/i, 'P Zero ').trim();
  return rest + ' · ' + m[1];
}

/**
 * v101: «Это моя машина» — три понятных шага в одном листе:
 *   1) машина — карточки из гаража (текущая сверху) + «Другая»;  2) резина — чипы + «Своя»;
 *   3) итог «Круги запишутся на: …» и большая кнопка «Это моя машина».
 * opts.preselect = имя машины (из Бокса), opts.reason = почему спрашиваем, opts.skip = { label, fn } (заезд без зачёта).
 */
export function openMyCarSheet(opts = {}) {
  const body = document.getElementById('myCarBody');
  if (!body) return;
  body.replaceChildren();
  if (opts.reason) body.appendChild(el('p', 'mycar-warn', opts.reason));
  const cars = [];
  const seen = new Set();
  const cur = D.currentCar?.();
  for (const c of [cur, ...D.garageCars()]) {
    if (!c || !c.name || seen.has(c.name)) continue;
    seen.add(c.name); cars.push(c);
  }
  const stock = (D.stockCars() || []).filter((c) => c && c.name && !seen.has(c.name));
  const pick = { model: '', carId: '', tyre: '' };
  if (opts.preselect) { const c = cars.find((x) => x.name === opts.preselect); if (c) { pick.model = c.name; pick.carId = c.id || ''; } }
  if (!pick.model && st.car) { pick.model = st.car.model; pick.carId = st.car.carId || ''; }
  if (!pick.model && cars[0]) { pick.model = cars[0].name; pick.carId = cars[0].id || ''; }
  if (st.car && st.car.model === pick.model) pick.tyre = st.car.tyre;

  // —— step 1: машина ——
  const s1 = el('section', 'mycar-step');
  s1.appendChild(el('span', 'mycar-step-k', '1 · Машина'));
  const list = el('div', 'mycar-cars'); list.id = 'myCarModels'; list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-label', 'Машина');
  const sel = el('select', 'mycar-select hidden'); sel.id = 'myCarModel'; sel.setAttribute('aria-label', 'Другая машина');
  const ph = el('option', '', 'Выбрать из каталога…'); ph.value = ''; sel.appendChild(ph);
  [...cars, ...stock].forEach((c) => { const o = el('option', '', c.name); o.value = c.name; o.dataset.carId = c.id || ''; sel.appendChild(o); });
  const otherO = el('option', '', 'Нет в списке — ввести вручную'); otherO.value = '__other'; sel.appendChild(otherO);
  const custom = el('input', 'mycar-custom hidden'); custom.maxLength = 80; custom.placeholder = 'например Toyota GR Supra A90'; custom.setAttribute('aria-label', 'Модель вручную');
  const carBtns = [];
  const mkCar = (name, sub, onPick) => {
    const b = btn('mycar-car', null, onPick);
    b.setAttribute('role', 'radio');
    b.append(el('b', '', name));
    if (sub) b.append(el('span', '', sub));
    carBtns.push(b); list.appendChild(b);
    return b;
  };
  cars.slice(0, 6).forEach((c, k) => {
    const b = mkCar(c.name, k === 0 && cur && c.name === cur.name ? 'сейчас в Боксе' : (c.year ? String(c.year) : ''), () => {
      pick.model = c.name; pick.carId = c.id || ''; sel.classList.add('hidden'); custom.classList.add('hidden'); refresh();
    });
    b.dataset.model = c.name;
  });
  const otherB = mkCar('Другая', 'из каталога или вручную', () => { sel.classList.remove('hidden'); sel.focus?.(); pick.model = ''; refresh(); });
  otherB.dataset.model = '__other';
  sel.addEventListener('change', () => {
    if (sel.value === '__other') { custom.classList.remove('hidden'); pick.model = custom.value.trim(); pick.carId = ''; }
    else { custom.classList.add('hidden'); pick.model = sel.value; pick.carId = sel.selectedOptions[0]?.dataset.carId || ''; }
    refresh();
  });
  custom.addEventListener('input', () => { pick.model = custom.value.trim(); pick.carId = ''; refresh(); });
  if (pick.model && !cars.slice(0, 6).some((c) => c.name === pick.model)) {
    sel.classList.remove('hidden');
    if ([...sel.options].some((o) => o.value === pick.model)) sel.value = pick.model;
    else { sel.value = '__other'; custom.value = pick.model; custom.classList.remove('hidden'); }
  }
  s1.append(list, sel, custom);

  // —— step 2: резина ——
  const s2 = el('section', 'mycar-step');
  s2.appendChild(el('span', 'mycar-step-k', '2 · Резина'));
  const chips = el('div', 'mycar-tyres'); chips.id = 'myCarTyres'; chips.setAttribute('role', 'radiogroup'); chips.setAttribute('aria-label', 'Резина');
  const tyre = el('input', 'mycar-tyre hidden'); tyre.id = 'myCarTyre'; tyre.maxLength = 40; tyre.placeholder = 'например Hankook Ventus RS4'; tyre.setAttribute('aria-label', 'Своя резина');
  tyre.setAttribute('list', 'myCarTyreList');
  const dl = el('datalist'); dl.id = 'myCarTyreList';
  TYRES.forEach((t) => { const o = el('option'); o.value = t; dl.appendChild(o); });
  const tyreBtns = [];
  TYRES.forEach((t) => {
    const b = btn('mycar-tyre-chip', tyreShort(t), () => { pick.tyre = t; tyre.value = t; tyre.classList.add('hidden'); refresh(); });
    b.dataset.tyre = t; b.title = t; b.setAttribute('role', 'radio');
    tyreBtns.push(b); chips.appendChild(b);
  });
  const ownB = btn('mycar-tyre-chip', 'Своя…', () => { tyre.classList.remove('hidden'); tyre.focus?.(); pick.tyre = tyre.value.trim(); refresh(); });
  ownB.dataset.tyre = '__own'; tyreBtns.push(ownB); chips.appendChild(ownB);
  tyre.addEventListener('input', () => { pick.tyre = tyre.value.trim(); refresh(); });
  if (pick.tyre) { tyre.value = pick.tyre; if (!TYRES.includes(pick.tyre)) tyre.classList.remove('hidden'); }
  s2.append(chips, tyre, dl);

  // —— step 3: итог + кнопка ——
  const sum = el('div', 'mycar-sum');
  const sumK = el('span', 'mycar-sum-k', 'Круги запишутся на');
  const sumV = el('b', 'mycar-sum-v', '—');
  sum.append(sumK, sumV);
  const note = el('p', 'tiny muted mycar-note', 'К кругу навсегда привязываются машина, резина, трасса, дата, время и сектора. Сменить можно в любой момент — старые круги останутся как были.');
  const msg = el('p', 'tiny mycar-msg');
  const save = btn('go-btn race-cta mycar-save', 'Это моя машина', async () => {
    const model = pick.model.trim();
    const t = pick.tyre.trim();
    if (!model) { msg.textContent = 'Выбери машину'; msg.classList.add('mycar-msg-err'); return; }
    if (!t) { msg.textContent = 'Выбери резину — топ сравнивает только равных'; msg.classList.add('mycar-msg-err'); return; }
    msg.classList.remove('mycar-msg-err');
    const local = { model, tyre: t, carId: pick.carId || undefined, at: Date.now() };
    save.disabled = true;
    let car = local;
    if (loggedIn()) {
      const r = await api.putMyCar({ model, tyre: t, carId: pick.carId || undefined });
      if (!r || r.ok === false) {
        save.disabled = false;
        msg.textContent = 'Не сохранилось: ' + (r?.error || 'нет сети');
        msg.classList.add('mycar-msg-err');
        try { D.flash?.('Не сохранилось — проверь сеть'); } catch (_) {}
        return;
      }
      car = r.car || local;
    } else {
      // v103: keep the choice locally so the bar / lap gate work even before Telegram login;
      // tops & rooms still require an account (server). Sync to server on the next login.
      msg.textContent = 'Сохранено на этом устройстве. Для топа и команд войди через Telegram в Профиле.';
    }
    save.disabled = false;
    cacheCar(car);
    if (loggedIn()) msg.textContent = 'Готово: ' + car.model + ' · ' + car.tyre;
    msg.classList.remove('mycar-msg-err');
    D.hap?.(12);
    try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'); } catch (_) {}
    try { window.__plTips?.dismiss?.(); } catch (_) {}
    const p = st.pending; st.pending = null;
    if (p) { closeSheet('myCarSheet'); try { await p(car); } catch (_) {} }
    else setTimeout(() => closeSheet('myCarSheet'), 450);
  });
  save.id = 'myCarSave';
  const tail = [sum, save];
  if (opts.skip && typeof opts.skip.fn === 'function') {
    tail.push(btn('mycar-skip', opts.skip.label || 'Без зачёта', () => { st.pending = null; closeSheet('myCarSheet'); opts.skip.fn(); }));
  }
  const how = btn('mycar-how', 'Как это работает?', () => { closeSheet('myCarSheet'); D.howCar?.(); });
  body.append(s1, s2, ...tail, msg, note, how);

  function refresh() {
    carBtns.forEach((b) => {
      const on = b.dataset.model === '__other' ? (!sel.classList.contains('hidden')) : b.dataset.model === pick.model && sel.classList.contains('hidden');
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    tyreBtns.forEach((b) => {
      const on = b.dataset.tyre === '__own' ? !tyre.classList.contains('hidden') : b.dataset.tyre === pick.tyre && tyre.classList.contains('hidden');
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    const ready = !!(pick.model.trim() && pick.tyre.trim());
    sumV.textContent = ready ? pick.model.trim() + ' · ' + pick.tyre.trim() : (pick.model.trim() ? pick.model.trim() + ' · выбери резину' : 'выбери машину и резину');
    sum.classList.toggle('ready', ready);
    save.classList.toggle('is-dim', !ready);
    save.setAttribute('aria-disabled', ready ? 'false' : 'true');
    if (ready) msg.textContent = '';
  }
  refresh();
  openSheet('myCarSheet');
  try { D.onCarSheet?.(); } catch (_) {}
}

/** Garage bar + lap chip: show which car laps are recorded on; highlight when it is the car on the podium. */
export function refreshMyCarBar() {
  const cur = D?.currentCar?.();
  const active = !!(st.car && cur && st.car.model === cur.name);
  document.querySelectorAll('.mycar-bar, .mycar-chip').forEach((n) => {
    n.classList.toggle('is-empty', !st.car);
    n.classList.toggle('is-active', active);
  });
  document.querySelectorAll('.mycar-chip-go').forEach((n) => { n.textContent = st.car ? 'сменить' : 'выбрать'; });
  const b = document.getElementById('btnMyCarGarage');
  if (b) b.textContent = active ? 'Сменить резину' : 'Это моя машина';
  const k = document.getElementById('myCarBarK');
  if (k) k.textContent = active ? 'Моя машина · круги пишутся на неё' : (st.car ? 'Круги пишутся на' : 'Машина для зачёта');
}

/** Before a run: no active car → ask first (the run starts right after saving), or ride without counting. */
export async function ensureCarBeforeRun(fn) {
  const car = await loadMyCar();
  if (car) return fn(car);
  st.pending = () => fn();
  openMyCarSheet({ reason: 'Выбери машину и резину — тогда круг пойдёт в зачёт.', preselect: D.currentCar?.()?.name, skip: { label: 'Ехать без зачёта', fn } });
  return null;
}

/** Lap flow: run fn(car) now if an active car exists, else ask «Это моя машина» first (fn runs after save). */
export async function requireCar(fn, reason) {
  const car = await loadMyCar();
  if (car) return await fn(car);
  st.pending = fn;
  openMyCarSheet({ reason: reason || 'Без активной машины круг не идёт в зачёт. Выбери машину и резину — круг сохранится сразу после этого.', preselect: D.currentCar?.()?.name });
  return null;
}

/** After a finished lap: also save it into the active crew room (server binds car + tyre). */
export async function pushLapToActiveRoom(lap) {
  const rid = activeRoomId();
  if (!rid || !loggedIn()) return null;
  const r = await api.postRoomLap(rid, { ...lap, public: teamLapsPublic(rid) });
  if (r && r.status === 402) D.flash?.('Комната молчит — экипаж оплачивает сезон');
  else if (r && r.status === 403) setActiveRoom('');
  return r;
}

/* ———————————————— rooms sheet ———————————————— */
function head(title, sub) {
  const h = el('header', 'race-sheet-head');
  h.appendChild(el('div', 'race-sheet-handle'));
  h.appendChild(el('h2', 'race-sheet-title', title));
  if (sub) h.appendChild(el('p', 'race-sheet-sub', sub));
  return h;
}
function body() { return document.getElementById('roomBody'); }
function render(nodes) {
  const b = body(); if (!b) return;
  b.replaceChildren(...nodes.filter(Boolean));
  b.scrollTop = 0;
}

function carLine() {
  const row = el('div', 'room-car');
  row.appendChild(el('span', 'room-car-k', 'Моя машина'));
  const v = el('b', 'room-car-v', st.car ? st.car.model + ' · ' + st.car.tyre : 'не выбрана');
  v.setAttribute('data-mycar-line', '');
  row.appendChild(v);
  row.appendChild(btn('room-link', st.car ? 'изменить' : 'выбрать', () => openMyCarSheet()));
  return row;
}

function quotaBadge(q) {
  if (!q) return el('span', 'room-badge', '—');
  if (q.paid) return el('span', 'room-badge paid', 'сезон до ' + new Date(q.paidUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
  if (q.locked) return el('span', 'room-badge locked', 'молчит');
  return el('span', 'room-badge free', 'бесплатно ' + q.sessionsUsed + '/' + q.freeSessions + ' сесс.');
}

async function showList() {
  st.room = null;
  if (!loggedIn()) {
    render([head('Мои команды', 'Внутри: круги, дуэли и топ — только для своих'),
      el('p', 'room-empty', 'Войди через Telegram в «Профиле» — комнаты привязаны к аккаунту.'),
      btn('go-btn race-cta', 'Войти', () => { closeSheet('roomSheet'); D.goToView('account'); })]);
    return;
  }
  await loadMyCar();
  render([head('Мои команды', 'Внутри: круги, дуэли и топ — только для своих'), carLine(), el('p', 'room-empty', 'Загрузка…')]);
  const r = await api.listRooms();
  st.rooms = Array.isArray(r) ? r : [];
  const list = el('ul', 'room-list race-list');
  st.rooms.forEach((room) => {
    const li = el('li', 'room-item');
    li.tabIndex = 0;
    const main = el('div', 'room-item-main');
    main.appendChild(el('b', '', room.name));
    main.appendChild(el('small', '', room.memberCount + ' в экипаже' + (room.role === 'captain' ? ' · ты капитан' : '') + (activeRoomId() === room.id ? ' · круги пишутся сюда' : '')));
    li.append(main, quotaBadge(room.quota));
    li.addEventListener('click', () => void showRoom(room.id));
    list.appendChild(li);
  });
  const name = el('input', 'room-input'); name.maxLength = 48; name.placeholder = 'название команды';
  const msg = el('p', 'tiny room-msg');
  const create = btn('go-btn race-cta', 'Собрать команду', async () => {
    if (!name.value.trim()) { msg.textContent = 'Назови команду'; return; }
    create.disabled = true;
    const c = await api.createRoom(name.value.trim());
    create.disabled = false;
    if (!c || c.ok === false) { msg.textContent = c?.status === 429 ? 'Слишком часто — попробуй позже' : (c?.error === 'too many rooms' ? 'Лимит комнат' : 'Не вышло: ' + (c?.error || 'сеть')); return; }
    setActiveRoom(c.id);
    void showRoom(c.id);
  });
  const code = el('input', 'room-input'); code.maxLength = 8; code.placeholder = 'код приглашения';
  const join = btn('btn-secondary', 'Вступить', () => { if (code.value.trim()) void showInvite(code.value.trim().toUpperCase()); });
  const joinRow = el('div', 'room-join'); joinRow.append(code, join);
  render([
    head('Мои команды', 'Внутри: круги, дуэли и топ — только для своих'),
    carLine(),
    st.rooms.length ? el('h3', 'race-list-title', 'Мои комнаты') : el('p', 'room-empty', 'Пока ни одной комнаты. Создай свою или вступи по ссылке.'),
    st.rooms.length ? list : null,
    el('h3', 'race-list-title', 'Новая комната'),
    name, create,
    joinRow, msg,
    el('p', 'tiny muted room-rules', 'Бесплатно: 3 сессии и 1 трек на комнату. Дальше экипаж оплачивает сезон — одна оплата на всю комнату, доступ у всех. Общий рекорд бота — бесплатно всегда.'),
  ]);
}

async function showInvite(code) {
  st.inviteCode = code;
  if (!loggedIn()) {
    render([head('Приглашение', 'Комната экипажа'), el('p', 'room-empty', 'Войди через Telegram, чтобы вступить.'),
      btn('go-btn race-cta', 'Войти', () => { closeSheet('roomSheet'); D.goToView('account'); })]);
    return;
  }
  const p = await api.roomInvitePreview(code);
  if (!p || p.ok === false) { render([head('Приглашение', ''), el('p', 'room-empty', 'Ссылка устарела или неверный код.'), btn('btn-secondary', 'К комнатам', () => void showList())]); return; }
  if (p.member) { void showRoom(p.id); return; }
  const msg = el('p', 'tiny room-msg');
  render([
    head('Тебя зовут в экипаж', ''),
    el('p', 'room-invite-name', p.name),
    el('p', 'room-empty', p.memberCount + ' в экипаже · внутри дуэли и топ только для участников'),
    btn('go-btn race-cta', 'Вступить', async () => {
      const r = await api.joinRoom(code);
      if (!r || r.ok === false) { msg.textContent = r?.error === 'room full' ? 'Комната заполнена' : 'Не вышло: ' + (r?.error || 'сеть'); return; }
      setActiveRoom(r.id);
      void showRoom(r.id);
    }),
    msg,
  ]);
}

function paywallCard(pw, room) {
  const q = pw?.quota || room?.quota || {};
  const price = q.price || { stars: 0, days: 90 };
  const card = el('section', 'room-paywall');
  card.appendChild(el('div', 'room-paywall-ico', '⭐'));
  card.appendChild(el('h3', '', 'Экипаж оплачивает сезон'));
  const why = pw?.reason === 'track' ? 'Бесплатно — 1 трек на комнату. Новый трек открывает сезон.'
    : 'Бесплатные 3 сессии закончились — новые круги, дуэли и топ в комнате на паузе.';
  card.appendChild(el('p', '', why));
  const ul = el('ul', 'room-paywall-list');
  ['Одна оплата на всю комнату — доступ у всех участников', `Сезон ${price.days} дней: круги, дуэли, топ без лимитов`, 'Старые круги видны всегда', 'Общий рекорд бота — бесплатно'].forEach((t) => ul.appendChild(el('li', '', t)));
  card.appendChild(ul);
  const msg = el('p', 'tiny room-msg');
  const pay = btn('go-btn race-cta room-pay', `Оплатить сезон · ${price.stars} ⭐`, async () => {
    pay.disabled = true;
    msg.textContent = 'Готовим счёт…';
    const r = await api.roomInvoice(room.id, 'link');
    pay.disabled = false;
    if (!r || r.ok === false || !r.link) { msg.textContent = 'Оплата недоступна: ' + (r?.error || 'сеть'); return; }
    msg.textContent = '';
    const TG = D.tg?.();
    if (TG && typeof TG.openInvoice === 'function') {
      TG.openInvoice(r.link, (status) => {
        if (status === 'paid') { msg.textContent = 'Оплачено — открываем сезон…'; setTimeout(() => void showRoom(room.id), 1500); }
        else if (status === 'failed') msg.textContent = 'Платёж не прошёл';
      });
    } else {
      window.open(r.link, '_blank', 'noopener');
      msg.textContent = 'Счёт открыт в Telegram. После оплаты вернись и обнови.';
    }
  });
  card.append(pay, msg);
  card.appendChild(el('p', 'tiny muted', 'Оплата Telegram Stars. Платит любой участник.'));
  return card;
}

async function showRoom(id, tab) {
  if (tab) st.tab = tab;
  const room = await api.getRoom(id);
  if (!room || room.ok === false) {
    render([head('Комната', ''), el('p', 'room-empty', room?.status === 403 ? 'Только для участников.' : 'Комната не найдена.'), btn('btn-secondary', 'К комнатам', () => void showList())]);
    return;
  }
  st.room = room;
  const nodes = [head(room.name, room.memberCount + ' в экипаже')];
  const top = el('div', 'room-top');
  top.append(quotaBadge(room.quota));
  const q = room.quota;
  top.appendChild(el('span', 'room-q', q.paid ? 'без лимитов' : `сессии ${q.sessionsUsed}/${q.freeSessions} · треки ${q.tracks.length}/${q.freeTracks}`));
  nodes.push(top);
  const mem = el('div', 'room-members');
  room.members.forEach((m) => {
    const c = el('span', 'room-member' + (m.role === 'captain' ? ' cap' : ''), m.nick);
    if (m.role === 'captain') c.title = 'капитан';
    mem.appendChild(c);
  });
  nodes.push(mem);
  nodes.push(carLine());
  // write my laps here
  const act = el('label', 'room-active');
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = activeRoomId() === room.id;
  cb.addEventListener('change', () => { setActiveRoom(cb.checked ? room.id : ''); });
  act.append(cb, el('span', '', 'Записывать мои круги в эту комнату'));
  nodes.push(act);
  // v98: public laps → auto-posts in the team feed
  const pub = el('label', 'room-active');
  const cb2 = el('input'); cb2.type = 'checkbox'; cb2.checked = teamLapsPublic(room.id);
  cb2.addEventListener('change', () => setTeamLapsPublic(room.id, cb2.checked));
  pub.append(cb2, el('span', '', 'Публиковать мои лучшие круги в ленте команды'));
  nodes.push(pub);
  const teamRow = el('div', 'room-team-row');
  teamRow.appendChild(btn('btn-secondary', 'Страница команды', () => { closeSheet('roomSheet'); D.openTeam?.(room.id); }));
  if (room.role === 'captain') {
    const n = (room.requests || []).length;
    teamRow.appendChild(btn('btn-secondary' + (n ? ' has-badge' : ''), n ? 'Заявки · ' + n : 'Редактор', () => { closeSheet('roomSheet'); D.openTeamEditor?.(room.id); }));
  }
  nodes.push(teamRow);
  // invite
  if (room.invite) {
    const inv = el('div', 'room-invite');
    const link = D.inviteLink('room_' + room.invite);
    inv.appendChild(el('span', 'room-invite-code', room.invite));
    inv.appendChild(btn('btn-secondary', 'Позвать по ссылке', () => D.share('room_' + room.invite, link, `Залетай в экипаж «${room.name}» в PITLANE`)));
    if (room.role === 'captain') inv.appendChild(btn('room-link', 'новый код', async () => { const r = await api.rotateRoomInvite(room.id); if (r && r.ok !== false) void showRoom(room.id); }));
    nodes.push(inv);
  }
  // tabs
  const tabs = el('div', 'room-tabs seg-control');
  [['laps', 'Круги'], ['duel', 'Дуэль'], ['top', 'Топ']].forEach(([k, t]) => {
    const b = btn('seg-btn' + (st.tab === k ? ' on' : ''), t, () => void showRoom(room.id, k));
    tabs.appendChild(b);
  });
  nodes.push(tabs);
  const pane = el('div', 'room-pane');
  nodes.push(pane);
  nodes.push(el('div', 'room-foot'));
  nodes[nodes.length - 1].append(btn('btn-ghost', '← Все комнаты', () => void showList()), btn('btn-ghost', 'Выйти из комнаты', async () => {
    if (!confirm('Выйти из комнаты «' + room.name + '»?')) return;
    await api.leaveRoom(room.id); if (activeRoomId() === room.id) setActiveRoom(''); void showList();
  }));
  render(nodes);
  if (st.tab === 'duel') await renderDuel(pane, room);
  else if (st.tab === 'top') await renderTop(pane, room);
  else await renderLaps(pane, room);
}

function lapRow(l) {
  const li = el('li', 'room-lap');
  const a = el('div', 'room-lap-main');
  a.appendChild(el('b', 'room-lap-t', l.t || fmtMs(l.ms)));
  a.appendChild(el('span', 'room-lap-who', l.nick));
  const b = el('div', 'room-lap-meta');
  b.appendChild(el('span', '', l.model + ' · ' + l.tyre));
  b.appendChild(el('span', '', trackName(l.trackId) + ' · ' + fmtDate(l.date) + (l.gpsQ ? ' · GPS ' + l.gpsQ : '')));
  if (Array.isArray(l.sectors) && l.sectors.length >= 2) {
    const s = l.sectors.map((x, i) => 'S' + (i + 1) + ' ' + ((i ? x - l.sectors[i - 1] : x) / 1000).toFixed(2));
    b.appendChild(el('span', 'room-lap-sec', s.join(' · ')));
  }
  li.append(a, b);
  return li;
}

async function renderLaps(pane, room) {
  pane.replaceChildren(el('p', 'room-empty', 'Загрузка…'));
  const r = await api.roomLaps(room.id);
  st.laps = r?.laps || [];
  pane.replaceChildren();
  if (room.quota.locked) pane.appendChild(paywallCard({ reason: 'locked', quota: room.quota }, room));
  if (!st.laps.length) {
    pane.appendChild(el('p', 'room-empty', 'Кругов пока нет. Включи «Записывать мои круги в эту комнату» и проедь круг с GPS.'));
    return;
  }
  const ul = el('ul', 'room-laps race-list');
  st.laps.slice(0, 80).forEach((l) => ul.appendChild(lapRow(l)));
  pane.appendChild(ul);
}

async function renderDuel(pane, room) {
  pane.replaceChildren();
  if (room.quota.locked) { pane.appendChild(paywallCard({ reason: 'locked', quota: room.quota }, room)); return; }
  const r = await api.roomLaps(room.id);
  const laps = r?.laps || [];
  const tracks = [...new Set(laps.map((l) => l.trackId))];
  if (!tracks.length) { pane.appendChild(el('p', 'room-empty', 'Для дуэли нужны два круга на одном треке.')); return; }
  const tSel = el('select', 'room-select');
  tracks.forEach((t) => { const o = el('option', '', trackName(t)); o.value = t; tSel.appendChild(o); });
  const aSel = el('select', 'room-select'); const bSel = el('select', 'room-select');
  const out = el('div', 'room-duel-out');
  const fill = () => {
    const ls = laps.filter((l) => l.trackId === tSel.value);
    for (const [s, idx] of [[aSel, 0], [bSel, 1]]) {
      s.replaceChildren();
      ls.forEach((l) => { const o = el('option', '', `${l.nick} · ${l.t} · ${l.model}`); o.value = l.id; s.appendChild(o); });
      if (ls[idx]) s.value = ls[idx].id;
    }
    void run();
  };
  const run = async () => {
    out.replaceChildren();
    if (!aSel.value || !bSel.value || aSel.value === bSel.value) { out.appendChild(el('p', 'room-empty', 'Выбери два разных круга этого трека.')); return; }
    const d = await api.roomDuel(room.id, aSel.value, bSel.value);
    if (!d || d.ok === false) {
      if (d?.status === 402) { out.appendChild(paywallCard(d, room)); return; }
      out.appendChild(el('p', 'room-empty', d?.code === 'TRACK_MISMATCH' ? 'Разные треки не сравниваем.' : 'Не вышло: ' + (d?.error || 'сеть')));
      return;
    }
    const grid = el('div', 'room-duel');
    for (const [side, L] of [['a', d.a], ['b', d.b]]) {
      const c = el('div', 'room-duel-card ' + side);
      c.appendChild(el('span', 'room-duel-who', L.nick));
      c.appendChild(el('b', 'room-duel-t', L.t));
      c.appendChild(el('small', '', L.model + ' · ' + L.tyre));
      c.appendChild(el('small', '', fmtDate(L.date)));
      grid.appendChild(c);
    }
    const delta = el('div', 'room-duel-delta' + (d.delta > 0 ? ' a-wins' : d.delta < 0 ? ' b-wins' : ''));
    delta.appendChild(el('span', '', 'дельта'));
    delta.appendChild(el('b', '', fmtDelta(d.delta)));
    out.append(el('p', 'room-duel-track', trackName(d.trackId)), grid, delta);
    if (d.sectors) {
      const sl = el('ul', 'room-duel-sectors');
      d.sectors.forEach((s, i) => {
        const li = el('li', s.delta > 0 ? 'a-wins' : s.delta < 0 ? 'b-wins' : '');
        li.append(el('span', '', 'S' + (i + 1)), el('span', '', (s.a / 1000).toFixed(2)), el('b', '', fmtDelta(s.delta)), el('span', '', (s.b / 1000).toFixed(2)));
        sl.appendChild(li);
      });
      out.appendChild(sl);
    }
    // v98: «выиграл дуэль» → team feed, only when both laps are public
    if (d.a.public && d.b.public && d.a.pilotId !== d.b.pilotId) {
      const m2 = el('p', 'tiny room-msg');
      const share = btn('btn-secondary room-duel-post', 'Победу — в ленту команды', async () => {
        share.disabled = true;
        const r = await api.teamDuelPost(room.id, d.a.id, d.b.id);
        m2.textContent = r && r.ok !== false ? (r.dup ? 'Уже в ленте' : 'Опубликовано в ленте') : 'Не вышло: ' + (r?.error || 'сеть');
      });
      out.append(share, m2);
    } else out.appendChild(el('p', 'tiny muted', 'В ленту команды попадают только публичные круги.'));
  };
  tSel.addEventListener('change', fill); aSel.addEventListener('change', run); bSel.addEventListener('change', run);
  const row = el('div', 'room-filter');
  row.append(tSel, aSel, bSel);
  pane.append(el('p', 'tiny muted', 'Два круга одного трека рядом. Разные треки не смешиваем.'), row, out);
  fill();
}

async function renderTop(pane, room) {
  pane.replaceChildren();
  if (room.quota.locked) { pane.appendChild(paywallCard({ reason: 'locked', quota: room.quota }, room)); return; }
  const f = room.facets || { tracks: [], models: [], tyres: [] };
  if (!f.tracks.length) { pane.appendChild(el('p', 'room-empty', 'Топ появится после первых кругов в комнате.')); return; }
  const mk = (arr, label, cur) => { const s = el('select', 'room-select'); s.setAttribute('aria-label', label); arr.forEach((v) => { const o = el('option', '', label === 'трек' ? trackName(v) : v); o.value = v; s.appendChild(o); }); if (cur && arr.includes(cur)) s.value = cur; return s; };
  const tS = mk(f.tracks, 'трек'); const mS = mk(f.models, 'модель', st.car?.model); const yS = mk(f.tyres, 'резина', st.car?.tyre);
  const out = el('div');
  const run = async () => {
    out.replaceChildren(el('p', 'room-empty', 'Загрузка…'));
    const r = await api.roomTop(room.id, tS.value, mS.value, yS.value);
    out.replaceChildren();
    if (!r || r.ok === false) { out.appendChild(r?.status === 402 ? paywallCard(r, room) : el('p', 'room-empty', 'Не вышло: ' + (r?.error || 'сеть'))); return; }
    out.appendChild(el('p', 'room-top-cap', `${trackName(r.track)} · ${r.model} · ${r.tyre}`));
    if (!r.rows.length) { out.appendChild(el('p', 'room-empty', 'На этой связке модель + резина кругов A/B пока нет.')); return; }
    const ol = el('ol', 'room-toplist race-list');
    r.rows.forEach((x) => {
      const li = el('li', x.pos === 1 ? 'p1' : '');
      li.append(el('span', 'room-pos', x.pos), el('span', 'room-top-who', x.nick), el('b', 'room-top-t', x.t), el('span', 'room-top-gap', x.pos === 1 ? 'лидер' : fmtDelta(x.gap)));
      ol.appendChild(li);
    });
    out.appendChild(ol);
  };
  [tS, mS, yS].forEach((s) => s.addEventListener('change', run));
  const row = el('div', 'room-filter'); row.append(tS, mS, yS);
  pane.append(el('p', 'tiny muted', 'Топ только внутри комнаты и только для одной связки модель + резина.'), row, out);
  void run();
}

export function openRoomSheet(opts = {}) {
  openSheet('roomSheet');
  if (opts.invite) void showInvite(opts.invite);
  else if (opts.roomId) void showRoom(opts.roomId);
  else void showList();
}

export function initCrewRooms(deps) {
  D = deps;
  document.getElementById('roomSheetClose')?.addEventListener('click', () => closeSheet('roomSheet'));
  document.getElementById('myCarSheetClose')?.addEventListener('click', () => { st.pending = null; closeSheet('myCarSheet'); });
  for (const id of ['roomSheet', 'myCarSheet']) {
    document.getElementById(id)?.addEventListener('click', (e) => { if (e.target?.id === id) { if (id === 'myCarSheet') st.pending = null; closeSheet(id); } });
  }
  setTimeout(() => { void loadMyCar(); }, 1500);
  try {
    window.__plRooms = { open: openRoomSheet, openCar: openMyCarSheet, showRoom: (id, tab) => { openSheet('roomSheet'); return showRoom(id, tab); }, state: () => ({ car: st.car, room: st.room?.id || null, active: activeRoomId() }), syncCar: () => syncMyCarAfterAuth() };
  } catch (_) {}
}
