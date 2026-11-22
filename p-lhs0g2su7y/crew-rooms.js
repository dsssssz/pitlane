const TEAMS_OFF = true; // v198: команды/экипажи убраны
/**
 * v97: «Это моя машина» + комнаты экипажей (private) + оплата сезона на комнату (Telegram Stars).
 * All user text → textContent. The server decides membership and the paywall; this file only renders.
 */
import { api } from './api.js';
import { teamLapsPublic, setTeamLapsPublic } from './teams-ui.js';
import { openCarDb, brandLogoEl } from './car-db.js';
const CARX_KEY = 'pitlane-carx-v1'; // v220: год и доработки — только на устройстве, по названию машины
function carX(model) { try { return (JSON.parse(localStorage.getItem(CARX_KEY) || '{}') || {})[model] || {}; } catch (_) { return {}; } }
function setCarX(model, x) { try { const m = JSON.parse(localStorage.getItem(CARX_KEY) || '{}') || {}; m[model] = x; localStorage.setItem(CARX_KEY, JSON.stringify(m)); } catch (_) {} }

const ACTIVE_KEY = 'pitlane-room-active-v1';
const CAR_KEY = 'pitlane-mycar-v1';
const TYRES = ['Michelin Pilot Sport 4S', 'Michelin Pilot Sport Cup 2', 'Pirelli P Zero Trofeo R', 'Pirelli P Zero', 'Yokohama Advan A052', 'Toyo Proxes R888R', 'Bridgestone Potenza RE-71RS', 'Nankang CR-S', 'Continental SportContact 7'];

// v113: класс подготовки + тип шин (со слов пилота, тот же список, что на сервере)
export const PREP_LABEL = { stock: 'Сток', st1: 'Stage 1', st2: 'Stage 2+' };
export const TYRE_T_LABEL = { street: 'уличные', semi: 'полуслик' };
export function classLine(c) {
  if (!c || !PREP_LABEL[c.prep]) return 'класс не указан';
  return PREP_LABEL[c.prep] + (TYRE_T_LABEL[c.tyreT] ? ' · ' + TYRE_T_LABEL[c.tyreT] : '');
}
function passportOf(c) {
  const o = {};
  for (const k of ['prep', 'tyreT', 'hp', 'kg', 'bar']) if (c && c[k] != null && c[k] !== '') o[k] = c[k];
  return o;
}

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
  try { window.dispatchEvent(new Event('pl-car')); } catch (_) {} // v280: воронка
  document.querySelectorAll('[data-mycar-line]').forEach((n) => { n.textContent = st.car ? String(st.car.model).replace(/\s*\([^)]*\)\s*$/, '') + ' · ' + (TYRE_T_LABEL[st.car.tyre] || st.car.tyre) : 'не выбрана'; }); // v298: без «(G80)» и кода резины
  document.querySelectorAll('[data-mycar-class]').forEach((n) => {
    if (!st.car) { n.textContent = ''; n.hidden = true; return; }
    const nums = [st.car.hp ? st.car.hp + ' л.с.' : '', st.car.kg ? st.car.kg + ' кг' : '', st.car.bar ? st.car.bar + ' бар' : ''].filter(Boolean).join(' · ');
    n.textContent = classLine(st.car) + (nums ? ' · ' + nums : '') + (st.car.prep ? ' · со слов пилота' : '');
    n.hidden = false;
  });
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
        const up = await api.putMyCar({ model: local.model, tyre: local.tyre, carId: local.carId || undefined, ...passportOf(local) });
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
  { const sh = document.getElementById('myCarSheet'); const h = sh?.querySelector('.race-sheet-title'); const p = sh?.querySelector('.race-sheet-sub'); if (h) h.textContent = 'Это моя машина'; if (p) { p.textContent = 'Каждый круг запишется на эту машину и шины'; p.hidden = false; } }
  body.replaceChildren();
  if (opts.reason) body.appendChild(el('p', 'mycar-warn', opts.reason));
  const cars = [];
  const seen = new Set();
  const cur = D.currentCar?.();
  const dbc = opts.dbCar && opts.dbCar.name ? { name: opts.dbCar.name, id: opts.dbCar.id || '', year: opts.dbCar.years || '' } : null;
  const mine = st.car?.model ? { name: st.car.model, id: st.car.carId || '' } : null;
  for (const c of [dbc, cur, mine, ...D.garageCars()]) {
    if (!c || !c.name || seen.has(c.name)) continue;
    seen.add(c.name); cars.push(c);
  }
  const stock = (D.stockCars() || []).filter((c) => c && c.name && !seen.has(c.name));
  const pick = { model: '', carId: '', tyre: '' };
  if (dbc) { pick.model = dbc.name; pick.carId = dbc.id; }
  if (!pick.model && opts.preselect) { const c = cars.find((x) => x.name === opts.preselect); if (c) { pick.model = c.name; pick.carId = c.id || ''; } }
  if (!pick.model && st.car) { pick.model = st.car.model; pick.carId = st.car.carId || ''; }
  if (!pick.model && cars[0]) { pick.model = cars[0].name; pick.carId = cars[0].id || ''; }
  if (st.car && st.car.model === pick.model) pick.tyre = st.car.tyre;
  if (opts.tyre && !pick.tyre) pick.tyre = opts.tyre;
  const pass = opts.keepPass ? { ...opts.keepPass } : passportOf(st.car && st.car.model === pick.model ? st.car : null);
  if (dbc && pass.hp == null && opts.dbCar.hp) pass.hp = opts.dbCar.hp;
  const xtra = { ...carX(pick.model) };

  // —— v283: вариант A — строки «Машина» и «Шины» открывают выбор, класс — сегменты, характеристики — список с единицами ——
  const CAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 15.5v-3.2l2-4.8h13l2 4.8v3.2z"/><circle cx="7.5" cy="16" r="1.8"/><circle cx="16.5" cy="16" r="1.8"/></svg>';
  const TYRE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6"/></svg>';
  const sec = (k) => el('p', 'mc3-k', k);
  const rowBtn = (id, svg, onTap) => {
    const b = btn('mc3-row', null, () => { D.hap?.(6); onTap(); }); b.id = id;
    const ic = el('span', 'mc3-ic'); ic.innerHTML = svg;
    const tx = el('span', 'mc3-tx'); const t = el('b', ''); const s = el('span', '');
    tx.append(t, s); b.append(ic, tx, el('span', 'mc3-chev', '›'));
    return { b, t, s, ic };
  };
  // v284: логотипы брендов шин (официальные SVG из Wikimedia Commons, лежат в img/tyres), монохром
  const TYRE_BRANDS = ['michelin', 'pirelli', 'yokohama', 'toyo', 'bridgestone', 'nankang', 'continental'];
  const tyreLogo = (t) => {
    const w = String(t || '').trim(); const b = w.split(/\s+/)[0].toLowerCase();
    const tile = el('span', 'mc3-logo');
    if (TYRE_BRANDS.includes(b)) { const im = el('img'); im.src = 'img/tyres/' + b + '.svg'; im.alt = w.split(/\s+/)[0]; im.decoding = 'async'; tile.appendChild(im); }
    else { tile.classList.add('mc3-logo-ini'); tile.textContent = w ? w.charAt(0).toUpperCase() : '+'; }
    return tile;
  };
  // v285: эмблема марки (img/brands, маской в светлый монохром), иначе первая буква
  const carLogo = (name) => {
    const n = String(name || '').trim(); const tile = el('span', 'mc3-logo mc3-carlogo');
    const lg = n ? brandLogoEl(n) : null;
    if (lg && lg.querySelector('i')) tile.appendChild(lg);
    else { tile.classList.add('mc3-logo-ini'); tile.textContent = n ? n.charAt(0).toUpperCase() : '+'; }
    return tile;
  };
  // машина
  const carRow = rowBtn('myCarModels', CAR_SVG, () => openCarPick());
  const carBox = el('div', 'mc3-glass'); carBox.appendChild(carRow.b);
  // каталог «Выбрать из каталога» (как раньше) — для машин не из Бокса и ручного ввода
  const sel = el('select', 'mycar-select hidden'); sel.id = 'myCarModel'; sel.setAttribute('aria-label', 'Другая машина');
  const ph = el('option', '', 'Выбрать из каталога…'); ph.value = ''; sel.appendChild(ph);
  [...cars, ...stock].forEach((c) => { const o = el('option', '', c.name); o.value = c.name; o.dataset.carId = c.id || ''; sel.appendChild(o); });
  const otherO = el('option', '', 'Нет в списке — ввести вручную'); otherO.value = '__other'; sel.appendChild(otherO);
  const custom = el('input', 'mycar-custom mc3-in hidden'); custom.maxLength = 80; custom.placeholder = 'Модель, например Toyota GR Supra A90'; custom.setAttribute('aria-label', 'Модель вручную');
  sel.addEventListener('change', () => {
    if (sel.value === '__other') { custom.classList.remove('hidden'); pick.model = custom.value.trim(); pick.carId = ''; custom.focus?.(); }
    else { custom.classList.add('hidden'); pick.model = sel.value; pick.carId = sel.selectedOptions[0]?.dataset.carId || ''; }
    refresh();
  });
  custom.addEventListener('input', () => { pick.model = custom.value.trim(); pick.carId = ''; refresh(); });
  if (pick.model && !cars.some((c) => c.name === pick.model) && ![...sel.options].some((o) => o.value === pick.model)) { sel.value = '__other'; custom.value = pick.model; custom.classList.remove('hidden'); }
  const s1 = el('section', 'mycar-step mc3-step'); s1.append(sec('Машина'), carBox, sel, custom);

  // шины
  const tyreRow = rowBtn('myCarTyres', TYRE_SVG, () => openTyrePick());
  const tyreBox = el('div', 'mc3-glass'); tyreBox.appendChild(tyreRow.b);
  const tyre = el('input', 'hidden'); tyre.id = 'myCarTyre'; tyre.value = pick.tyre || '';
  const s2 = el('section', 'mycar-step mc3-step'); s2.append(sec('Шины'), tyreBox, tyre);

  // класс подготовки — сегменты со стеклянным бегунком
  const seg = (id, label, map, key) => {
    const row = el('div', 'mc3-seg'); row.id = id; row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-label', label);
    const bs = Object.entries(map).map(([v, t]) => {
      const b = btn('mc3-sb', t, () => { D.hap?.(6); pass[key] = pass[key] === v ? undefined : v; refresh(); });
      b.dataset.v = v; b.setAttribute('role', 'radio'); row.appendChild(b); return b;
    });
    return { row, bs, key };
  };
  const prepRow = seg('myCarPrep', 'Класс подготовки', PREP_LABEL, 'prep');
  const s3 = el('section', 'mycar-step mc3-step');
  s3.append(sec('Класс подготовки'), prepRow.row, el('p', 'mc3-hint', 'Со слов пилота, проверить мы не можем. Нажми ещё раз, чтобы снять.'));

  // характеристики
  const specs = el('div', 'mc3-glass mc3-specs');
  const fld = (lab, id, unit, mode, val, onIn, lo, hi, step) => {
    const w = el('label', 'mc3-fld'); w.appendChild(el('span', 'mc3-fl', lab));
    const r = el('span', 'mc3-fr');
    const i = el('input', 'mc3-num'); i.id = id; i.inputMode = mode; i.autocomplete = 'off';
    if (mode !== 'text') { i.type = 'number'; i.min = String(lo); i.max = String(hi); i.step = String(step); i.placeholder = '—'; }
    else { i.type = 'text'; i.maxLength = 120; i.placeholder = 'прошивка, даунпайп…'; i.classList.add('mc3-txt'); }
    if (val != null && val !== '') i.value = String(val);
    i.addEventListener('input', () => onIn(i.value.trim()));
    r.appendChild(i); if (unit) r.appendChild(el('span', 'mc3-u', unit));
    w.appendChild(r); specs.appendChild(w); return i;
  };
  const numSet = (key) => (v) => { pass[key] = v === '' ? undefined : Number(v.replace(',', '.')); };
  fld('Мощность', 'myCar_hp', 'л.с.', 'numeric', pass.hp, numSet('hp'), 30, 2500, 1);
  fld('Масса', 'myCar_kg', 'кг', 'numeric', pass.kg, numSet('kg'), 400, 4000, 1);
  fld('Давление шин', 'myCar_bar', 'бар', 'decimal', pass.bar, numSet('bar'), 1, 4, 0.1);
  fld('Год', 'myCar_year', '', 'numeric', xtra.year, (v) => { xtra.year = v ? Number(v) : undefined; }, 1960, 2027, 1);
  fld('Доработки', 'myCar_mods', '', 'text', xtra.mods, (v) => { xtra.mods = v || undefined; });
  const s4 = el('section', 'mycar-step mc3-step'); s4.append(sec('Характеристики · необязательно'), specs);

  // —— итог + закреплённая кнопка ——
  const sum = el('div', 'mycar-sum hidden');
  const sumV = el('b', 'mycar-sum-v', '—'); sum.appendChild(sumV);
  const msg = el('p', 'tiny mycar-msg');
  const save = btn('go-btn race-cta mycar-save mc3-save', 'Сохранить', async () => {
    const model = pick.model.trim();
    const t = pick.tyre.trim();
    if (!model) { msg.textContent = 'Выбери машину'; msg.classList.add('mycar-msg-err'); return; }
    if (!t) { msg.textContent = 'Выбери шины — топ сравнивает только равных'; msg.classList.add('mycar-msg-err'); return; }
    if (pass.prep && !pass.tyreT) { msg.textContent = 'Укажи тип шин: уличные или полуслик'; msg.classList.add('mycar-msg-err'); return; }
    const LIM = { hp: [30, 2500], kg: [400, 4000], bar: [1, 4] };
    for (const [k, [lo, hi]] of Object.entries(LIM)) {
      if (pass[k] != null && !(Number.isFinite(pass[k]) && pass[k] >= lo && pass[k] <= hi)) { msg.textContent = 'Проверь поле: ' + ({ hp: 'мощность', kg: 'масса', bar: 'давление' }[k]) + ' (' + lo + '–' + hi + ')'; msg.classList.add('mycar-msg-err'); return; }
    }
    msg.classList.remove('mycar-msg-err');
    const local = { model, tyre: t, carId: pick.carId || undefined, ...passportOf(pass), at: Date.now() };
    setCarX(model, { year: xtra.year, mods: xtra.mods });
    save.disabled = true;
    let car = local;
    if (loggedIn()) {
      const r = await api.putMyCar({ model, tyre: t, carId: pick.carId || undefined, ...passportOf(pass) });
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
      msg.textContent = 'Сохранено на этом устройстве. Для топа войди через Telegram в Профиле.';
    }
    save.disabled = false;
    cacheCar(car);
    if (loggedIn()) msg.textContent = 'Сохранено: ' + car.model + ' · ' + car.tyre;
    msg.classList.remove('mycar-msg-err');
    D.hap?.(12);
    try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'); } catch (_) {}
    try { window.__plTips?.dismiss?.(); } catch (_) {}
    const p = st.pending; st.pending = null;
    if (p) { closeSheet('myCarSheet'); try { await p(car); } catch (_) {} }
    else setTimeout(() => closeSheet('myCarSheet'), 450);
  });
  save.id = 'myCarSave';
  const foot = el('div', 'mc3-foot'); foot.append(msg, save);
  if (opts.skip && typeof opts.skip.fn === 'function') {
    foot.appendChild(btn('mycar-skip', opts.skip.label || 'Без зачёта', () => { st.pending = null; closeSheet('myCarSheet'); opts.skip.fn(); }));
  }
  const note = el('p', 'tiny muted mycar-note', 'К кругу привязываются машина, шины, трасса, дата и сектора. Сменишь — старые круги не изменятся.');
  const how = btn('mycar-how', 'Как это работает?', () => { closeSheet('myCarSheet'); D.howCar?.(); });
  body.append(s1, s2, s3, s4, sum, note, how, foot);

  // —— под-шторки выбора ——
  function subSheet(title) {
    document.getElementById('mc3Sub')?.remove();
    const wrap = el('div', 'mc3-sub'); wrap.id = 'mc3Sub'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', title);
    const inner = el('div', 'mc3-sub-in');
    const hd = el('div', 'mc3-sub-hd'); hd.appendChild(el('b', '', title));
    const done = btn('mc3-done', 'Готово', () => close()); hd.appendChild(done);
    const bd = el('div', 'mc3-sub-bd');
    inner.append(el('div', 'mc3-grab'), hd, bd); wrap.appendChild(inner);
    const close = () => { wrap.remove(); refresh(); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    return { bd, close };
  }
  function optRow(label, sub, on, onTap, lead) {
    const b = btn('mc3-opt' + (on ? ' on' : ''), null, () => { D.hap?.(6); onTap(); });
    b.setAttribute('role', 'option'); b.setAttribute('aria-selected', on ? 'true' : 'false');
    const tx = el('span', 'mc3-tx'); tx.appendChild(el('b', '', label)); if (sub) tx.appendChild(el('span', '', sub));
    const ck = el('span', 'mc3-ck'); if (on) ck.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    if (lead) b.appendChild(lead);
    b.append(tx, ck);
    return b;
  }
  function openCarPick() {
    const { bd, close } = subSheet('Машина');
    const g = el('div', 'mc3-glass');
    cars.slice(0, 8).forEach((c, k) => g.appendChild(optRow(c.name, k === 0 && cur && c.name === cur.name ? 'текущая' : (c.year ? String(c.year) : ''), c.name === pick.model, () => {
      pick.model = c.name; pick.carId = c.id || ''; sel.value = ''; custom.classList.add('hidden'); close();
    }, carLogo(c.name))));
    const all = optRow('Все марки и модели', 'каталог с характеристиками', false, () => {
      close();
      openCarDb({
        onPick: (c) => openMyCarSheet({ ...opts, preselect: undefined, dbCar: c, tyre: pick.tyre || opts.tyre, keepPass: { ...pass, hp: undefined } }),
        onManual: () => { sel.classList.remove('hidden'); sel.value = '__other'; custom.classList.remove('hidden'); custom.focus?.(); pick.model = custom.value.trim(); refresh(); },
      });
    });
    const man = optRow('Ввести вручную', 'если модели нет в каталоге', false, () => {
      close(); sel.value = '__other'; custom.classList.remove('hidden'); custom.focus?.(); pick.model = custom.value.trim(); pick.carId = ''; refresh();
    });
    const g2 = el('div', 'mc3-glass'); g2.append(all, man);
    if (g.childNodes.length) bd.appendChild(g);
    bd.appendChild(g2);
  }
  function openTyrePick() {
    const { bd, close } = subSheet('Шины');
    const tseg = seg('myCarTyreT', 'Тип шин', TYRE_T_LABEL, 'tyreT');
    tseg.bs.forEach((b) => { b.textContent = b.textContent.charAt(0).toUpperCase() + b.textContent.slice(1); });
    const syncT = () => tseg.bs.forEach((b) => { const on = pass.tyreT === b.dataset.v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    tseg.row.addEventListener('click', () => setTimeout(syncT, 0)); syncT();
    const q = el('input', 'mc3-in mc3-q'); q.type = 'search'; q.placeholder = 'Найти или ввести свою модель'; q.maxLength = 40; q.setAttribute('aria-label', 'Поиск шин'); q.autocomplete = 'off';
    const list = el('div', 'mc3-glass'); list.setAttribute('role', 'listbox');
    const setT = (t) => { pick.tyre = t; tyre.value = t; refresh(); draw(); };
    function draw() {
      const s = q.value.trim(); const lo = s.toLowerCase();
      const hits = TYRES.filter((t) => !lo || t.toLowerCase().includes(lo));
      list.replaceChildren(...hits.map((t) => { const [b, ...m] = t.split(' '); return optRow(m.join(' '), b, pick.tyre === t, () => setT(t), tyreLogo(t)); }));
      const own = pick.tyre && !TYRES.includes(pick.tyre) ? pick.tyre : '';
      if (s && !TYRES.some((t) => t.toLowerCase() === lo)) list.appendChild(optRow('Своя: ' + s, 'нет в списке', own === s, () => setT(s), tyreLogo(s)));
      else if (own) list.appendChild(optRow(own, 'своя модель', true, () => {}, tyreLogo(own)));
      else if (!s) list.appendChild(optRow('Своя…', 'впиши модель в поиск', false, () => q.focus?.(), tyreLogo('')));
    }
    q.addEventListener('input', draw);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && q.value.trim()) { e.preventDefault(); setT(q.value.trim()); close(); } });
    draw();
    bd.append(el('p', 'mc3-k', 'Тип'), tseg.row, el('p', 'mc3-k', 'Модель'), q, list);
  }

  function refresh() {
    const m = pick.model.trim();
    carRow.t.textContent = m || 'Выбрать машину';
    const curN = cur && m === cur.name;
    carRow.s.textContent = m ? [curN ? 'текущая' : '', pass.hp ? pass.hp + ' л.с.' : ''].filter(Boolean).join(' · ') || 'сменить' : 'марка, модель, кузов';
    carRow.b.classList.toggle('is-empty', !m);
    if (m) carRow.ic.replaceChildren(carLogo(m)); else carRow.ic.innerHTML = CAR_SVG;
    carRow.ic.classList.toggle('mc3-ic-logo', !!m);
    const t = pick.tyre.trim();
    const sp = t.indexOf(' ');
    tyreRow.t.textContent = t ? (TYRES.includes(t) ? t.slice(sp + 1) : t) : 'Выбрать шины';
    tyreRow.s.textContent = [t && TYRES.includes(t) ? t.slice(0, sp) : '', pass.tyreT ? TYRE_T_LABEL[pass.tyreT] : 'тип не указан'].filter(Boolean).join(' · ');
    tyreRow.b.classList.toggle('is-empty', !t);
    if (t) tyreRow.ic.replaceChildren(tyreLogo(t)); else tyreRow.ic.innerHTML = TYRE_SVG;
    tyreRow.ic.classList.toggle('mc3-ic-logo', !!t);
    prepRow.bs.forEach((b) => { const on = pass.prep === b.dataset.v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    const ready = !!(m && t);
    sumV.textContent = ready ? m + ' · ' + t + ' · ' + classLine(pass) : '';
    save.classList.toggle('is-dim', !ready);
    save.setAttribute('aria-disabled', ready ? 'false' : 'true');
    if (ready && !msg.classList.contains('mycar-msg-err')) msg.textContent = msg.textContent.startsWith('Сохран') ? msg.textContent : '';
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
  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
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
  if (q.sales === false) return el('span', 'room-badge free', 'пока бесплатно · без лимитов');
  return el('span', 'room-badge free', 'бесплатно ' + q.sessionsUsed + '/' + q.freeSessions + ' сесс.');
}

async function showList() {
  st.room = null;
  if (!loggedIn()) {
    render([head('Мои команды', 'Внутри: круги и топ — только для своих'),
      el('p', 'room-empty', 'Войди через Telegram в «Профиле» — комнаты привязаны к аккаунту.'),
      btn('go-btn race-cta', 'Войти', () => { closeSheet('roomSheet'); D.goToView('account'); })]);
    return;
  }
  await loadMyCar();
  render([head('Мои команды', 'Внутри: круги и топ — только для своих'), carLine(), el('p', 'room-empty', 'Загрузка…')]);
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
    head('Мои команды', 'Внутри: круги и топ — только для своих'),
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
    el('p', 'room-empty', p.memberCount + ' в экипаже · внутри круги и топ только для участников'),
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
  // v108: продажа сезона выключена, пока нет реквизитов продавца — кнопку оплаты не показываем
  // v120: продажи нет — и блок про оплату не показываем вовсе (инвойсы скрыты, пока не включены продажи)
  if (q.sales === false) return document.createComment('no-sales');
  const price = q.price || { stars: 0, days: 90 };
  const card = el('section', 'room-paywall');
  card.appendChild(el('div', 'room-paywall-ico', '⭐'));
  card.appendChild(el('h3', '', 'Экипаж оплачивает сезон'));
  const why = pw?.reason === 'track' ? 'Бесплатно — 1 трек на комнату. Новый трек открывает сезон.'
    : 'Бесплатные 3 сессии закончились — новые круги и топ в комнате на паузе.';
  card.appendChild(el('p', '', why));
  const ul = el('ul', 'room-paywall-list');
  ['Одна оплата на всю комнату — доступ у всех участников', `Сезон ${price.days} дней: круги, топ без лимитов`, 'Старые круги видны всегда', 'Общий рекорд бота — бесплатно'].forEach((t) => ul.appendChild(el('li', '', t)));
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
  [['laps', 'Круги'], ['top', 'Топ']].forEach(([k, t]) => {
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
  if (st.tab === 'duel') st.tab = 'laps';
  if (st.tab === 'top') await renderTop(pane, room);
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
  return; // v206: комнаты/экипажи убраны — ни одного входа

  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
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

/**
 * v219: быстрый выбор машины со вкладки «Замер» — сразу список, один тап.
 * Резина/паспорт берутся с текущей «Моей машины»; если их нет — открываем полный лист с выбранной машиной.
 */
/* v302: тап по карточке «Моя машина» — сразу каталог (марка → модель → кузов), выбор = моя машина */
/** v317: тот же путь, что и выбор в каталоге (онбординг передаёт выбранную машину сюда — экраны выбора не меняются). */
export async function pickCatalogCar(c) {
  const base = st.car || null;
  if (!base || !base.tyre) { setTimeout(() => openMyCarSheet({ dbCar: c }), 280); return; }
  // v305: другая машина — паспорт (л.с./масса) не переносим со старой; мощность берём из варианта каталога
  const same = (base.carId || '') === (c.id || '') && base.model === c.name;
  const pp = same ? passportOf(base) : { ...passportOf(base), hp: c.hp ?? undefined, kg: undefined };
  const local = { ...base, ...pp, model: c.name, carId: c.id || undefined, at: Date.now() }; if (!same) { if (pp.hp == null) delete local.hp; delete local.kg; delete local.mods; }
  let car = local;
  if (loggedIn()) {
    const r = await api.putMyCar({ model: c.name, tyre: base.tyre, carId: c.id || undefined, ...pp });
    if (!r || r.ok === false) { try { D.flash?.('Не сохранилось — проверь сеть'); } catch (_) {} return; }
    car = r.car || local;
  }
  cacheCar(car); D.hap?.(10);
}
export function openCarPicker() {
  const pickCar = (c) => pickCatalogCar(c);
  openCarDb({ onPick: (c) => pickCar(c), onManual: () => setTimeout(() => openMyCarSheet(), 280) });
}
/** v318: своя машина (из гаража / быстрого выбора) → «Моя машина»; общий для шторки и колоды в профиле. */
export async function pickOwnCar(c) {
  const base = st.car || null;
  if (!base || !base.tyre) { closeSheet('myCarSheet'); setTimeout(() => openMyCarSheet(c.db ? { dbCar: c.db } : { preselect: c.name }), 280); return; }
  const local = { ...base, model: c.name, carId: c.id || undefined, at: Date.now() };
  let car = local;
  if (loggedIn()) {
    const r = await api.putMyCar({ model: c.name, tyre: base.tyre, carId: c.id || undefined, ...passportOf(base) });
    if (!r || r.ok === false) { try { D.flash?.('Не сохранилось — проверь сеть'); } catch (_) {} return; }
    car = r.car || local;
  }
  cacheCar(car); D.hap?.(10);
  closeSheet('myCarSheet');
}
export function openQuickCarSheet() {
  // v226: 0 своих машин → сразу сетка марок с эмблемами (car-db); есть свои → их карточки (один тап) + «Другая машина» → та же сетка.
  const body = document.getElementById('myCarBody');
  if (!body) return;
  const seen = new Set(); const cars = [];
  if (st.car?.model) { seen.add(st.car.model); cars.push({ name: st.car.model, id: st.car.carId || '', mine: true, tyre: st.car.tyre || '' }); }
  for (const c of (D.garageCars() || [])) {
    if (!c || !c.name || seen.has(c.name)) continue;
    seen.add(c.name); cars.push(c);
  }
  const pickCar = (c) => pickOwnCar(c);
  const openDb = () => openCarDb({
    onPick: (c) => pickCar({ name: c.name, id: c.id, db: c }),
    onManual: () => { closeSheet('myCarSheet'); setTimeout(() => openMyCarSheet(), 280); },
  });
  if (!cars.length) { closeSheet('myCarSheet'); openDb(); return; }
  body.replaceChildren();
  const sh = document.getElementById('myCarSheet'); const h = sh?.querySelector('.race-sheet-title'); const p = sh?.querySelector('.race-sheet-sub');
  if (h) h.textContent = 'Машина'; if (p) { p.textContent = 'Ваши машины — выбор в одно касание'; p.hidden = false; }
  const list = el('div', 'qc-cards'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Мои машины');
  cars.slice(0, 12).forEach((c) => {
    const on = st.car?.model === c.name;
    const b = btn('qc-card' + (on ? ' on' : ''), null, () => pickCar(c));
    b.setAttribute('role', 'option'); b.setAttribute('aria-selected', on ? 'true' : 'false');
    const tx = el('span', 'qc-tx'); tx.append(el('b', '', c.name), el('span', '', on ? ('Сейчас · ' + (st.car.tyre || '')).replace(/ · $/, '') : (c.year ? String(c.year) : 'Мой гараж')));
    b.append(brandLogoEl(c.name), tx, el('i', 'qc-tick'));
    list.appendChild(b);
  });
  body.appendChild(list);
  const other = btn('qc-other', null, openDb);
  other.append(el('span', 'qc-plus', '+'), el('b', '', 'Другая машина'), el('span', '', 'все марки и модели'));
  body.appendChild(other);
  openSheet('myCarSheet');
}
