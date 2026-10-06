/**
 * v97: «Это моя машина» + комнаты экипажей (private) + оплата сезона на комнату (Telegram Stars).
 * All user text → textContent. The server decides membership and the paywall; this file only renders.
 */
import { api } from './api.js';

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
}
export async function loadMyCar(force) {
  if (st.carLoaded && !force) return st.car;
  if (!loggedIn()) { try { st.car = JSON.parse(localStorage.getItem(CAR_KEY) || 'null'); } catch (_) { st.car = null; } return st.car; }
  const r = await api.getMyCar();
  if (r && r.ok !== false) cacheCar(r.car || null);
  else { try { st.car = JSON.parse(localStorage.getItem(CAR_KEY) || 'null'); } catch (_) {} }
  return st.car;
}

export function openMyCarSheet(opts = {}) {
  const body = document.getElementById('myCarBody');
  if (!body) return;
  body.replaceChildren();
  if (opts.reason) body.appendChild(el('p', 'mycar-warn', opts.reason));
  const cars = [];
  const seen = new Set();
  for (const c of [D.currentCar(), ...D.garageCars(), ...D.stockCars()]) {
    if (!c || !c.name || seen.has(c.name)) continue;
    seen.add(c.name); cars.push(c);
  }
  const lab1 = el('label', 'crew-field', 'Машина (модель)');
  const sel = el('select', 'mycar-select'); sel.id = 'myCarModel';
  cars.forEach((c) => { const o = el('option', '', c.name); o.value = c.name; o.dataset.carId = c.id || ''; sel.appendChild(o); });
  const other = el('option', '', 'Другая — ввести вручную'); other.value = '__other'; sel.appendChild(other);
  const custom = el('input', 'mycar-custom hidden'); custom.maxLength = 80; custom.placeholder = 'например Toyota GR Supra A90';
  if (st.car) {
    const has = cars.some((c) => c.name === st.car.model);
    sel.value = has ? st.car.model : '__other';
    if (!has) { custom.value = st.car.model; custom.classList.remove('hidden'); }
  }
  sel.addEventListener('change', () => custom.classList.toggle('hidden', sel.value !== '__other'));
  lab1.append(sel, custom);
  const lab2 = el('label', 'crew-field', 'Резина');
  const tyre = el('input', 'mycar-tyre'); tyre.id = 'myCarTyre'; tyre.maxLength = 40; tyre.placeholder = 'например Michelin Pilot Sport Cup 2';
  tyre.setAttribute('list', 'myCarTyreList');
  if (st.car) tyre.value = st.car.tyre;
  const dl = el('datalist'); dl.id = 'myCarTyreList';
  TYRES.forEach((t) => { const o = el('option'); o.value = t; dl.appendChild(o); });
  lab2.append(tyre, dl);
  const note = el('p', 'tiny muted', 'Каждый сохранённый круг навсегда привязывается к этой записи: машина, резина, трек, дата, время, сектора. Без активной машины круг в зачёт не идёт.');
  const msg = el('p', 'tiny mycar-msg');
  const save = btn('go-btn race-cta', 'Это моя машина', async () => {
    const model = sel.value === '__other' ? custom.value.trim() : sel.value;
    const t = tyre.value.trim();
    if (!model) { msg.textContent = 'Выбери или впиши модель'; return; }
    if (!t) { msg.textContent = 'Впиши резину — топ комнаты фильтруется по модели + резине'; return; }
    if (!loggedIn()) { msg.textContent = 'Войди через Telegram в «Профиле» — машина хранится в аккаунте'; return; }
    save.disabled = true;
    const carId = sel.value === '__other' ? undefined : (sel.selectedOptions[0]?.dataset.carId || undefined);
    const r = await api.putMyCar({ model, tyre: t, carId });
    save.disabled = false;
    if (!r || r.ok === false) { msg.textContent = 'Не сохранилось: ' + (r?.error || 'нет сети'); return; }
    cacheCar(r.car);
    msg.textContent = 'Готово: ' + r.car.model + ' · ' + r.car.tyre;
    D.hap?.(12);
    const p = st.pending; st.pending = null;
    setTimeout(() => closeSheet('myCarSheet'), 350);
    if (p) { try { await p(r.car); } catch (_) {} }
  });
  body.append(lab1, lab2, note, save, msg);
  openSheet('myCarSheet');
}

/** Lap flow: run fn(car) now if an active car exists, else ask «Это моя машина» first (fn runs after save). */
export async function requireCar(fn, reason) {
  const car = await loadMyCar();
  if (car) return await fn(car);
  st.pending = fn;
  openMyCarSheet({ reason: reason || 'Без активной машины круг не идёт в зачёт. Выбери машину и резину — круг сохранится сразу после этого.' });
  return null;
}

/** After a finished lap: also save it into the active crew room (server binds car + tyre). */
export async function pushLapToActiveRoom(lap) {
  const rid = activeRoomId();
  if (!rid || !loggedIn()) return null;
  const r = await api.postRoomLap(rid, lap);
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
    render([head('Комнаты экипажа', 'Закрытые комнаты: дуэли и топ только для своих'),
      el('p', 'room-empty', 'Войди через Telegram в «Профиле» — комнаты привязаны к аккаунту.'),
      btn('go-btn race-cta', 'Войти', () => { closeSheet('roomSheet'); D.goToView('account'); })]);
    return;
  }
  await loadMyCar();
  render([head('Комнаты экипажа', 'Закрытые комнаты: дуэли и топ только для своих'), carLine(), el('p', 'room-empty', 'Загрузка…')]);
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
  const name = el('input', 'room-input'); name.maxLength = 48; name.placeholder = 'название комнаты';
  const msg = el('p', 'tiny room-msg');
  const create = btn('go-btn race-cta', 'Создать комнату', async () => {
    if (!name.value.trim()) { msg.textContent = 'Назови комнату'; return; }
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
    head('Комнаты экипажа', 'Закрытые комнаты: дуэли и топ только для своих'),
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
    window.__plRooms = { open: openRoomSheet, openCar: openMyCarSheet, showRoom: (id, tab) => { openSheet('roomSheet'); return showRoom(id, tab); }, state: () => ({ car: st.car, room: st.room?.id || null, active: activeRoomId() }) };
  } catch (_) {}
}
