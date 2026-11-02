/**
 * v192: Pitlane Awards + витрина профиля + Paddock Pass (макеты v11).
 * Награды НЕ продаются: считаются только из реальных строк общего топа кругов (`/tops/lap/:track`)
 * и собственных кругов пилота (state.laps). Нет данных → «в процессе», ничего не выдумываем.
 * Paddock Pass (149 ★/мес, Telegram Stars) — только внешний вид: карбон, рамки, пины.
 */
const MSK = 3 * 3600 * 1000;
const WEEK = 7 * 86400000;
export const PASS_STARS = 250; // v225: сезон 90 дней
export const PASS_PLANS = [{ id: 'year', stars: 799, days: 365, t: 'Год', sub: '365 дней · 67 ★ в месяц', old: 1000, badge: '−20%' }, { id: 'season', stars: 250, days: 90, t: 'Сезон', sub: '90 дней · 83 ★ в месяц' }];
const A = './img/awards/';
export const AWARDS = {
  p1: { n: 'Подиум P1', d: 'P1 недели на трассе' },
  p2: { n: 'Подиум P2', d: 'P2 недели на трассе' },
  p3: { n: 'Подиум P3', d: 'P3 недели на трассе' },
  purple: { n: 'Фиолетовый круг', d: 'быстрейший круг недели' },
  pole: { n: 'Поул', d: 'рекорд трассы за всё время' },
  stint: { n: 'Стинт', d: 'недель подряд в топ-10' },
  ring: { n: 'Плакетка 107%', d: 'круг в пределах 107% рекорда' },
  master: { n: 'Мастер трассы', d: '50 кругов на одной трассе' },
  km: { n: 'Пробег', d: '100 км кругов за неделю' },
  laurel: { n: 'Лавр сезона', d: 'P1 трассы за месяц-сезон' },
  champ: { n: 'Чемпион', d: 'больше всех лавров за сезон' },
};
export const PASS_ITEMS = [
  ['carbon', 'Carbon Pin', 'карбоновый знак у ника'],
  ['helmet', 'Helmet Pin', 'пин-шлем у ника'],
  ['wheel', 'Wheel Pin', 'пин-руль у ника'],
];
export const CROP_CARS = new Set(['g87-m2', 'gt3rs', 'mclaren-765lt', 'g63', 'm4', 'm3', 'x6', 'isf', 'c63-ed507', 'spark']);
export function awardImg(k, small) { return A + k + (small ? '_s' : '') + '.webp'; }
/* v293: свои фото Маги (вырезка) — везде, где показывается машина; у M3 выбор фото (фиолетовая по умолчанию / бордовая) */
export const USER_PH = { m8: 1, m4: 1, m3: 1, 'bmw-g70': 1, 'gls63-x166': 1, 'e63-w213': 1, lc200: 1, 'camry-xv80': 1, 'li-l9': 1, 'camry-xv70': 1, 'x7-g07': 1 };
export const PH_ALT = { m3: [['', 'Фиолетовая'], ['m3-burgundy', 'Бордовая']] };
const PHK = 'pitlane-car-photo-v293';
export function carPhotoPick(id) { try { const v = JSON.parse(localStorage.getItem(PHK) || '{}')[id] || ''; return PH_ALT[id]?.some((a) => a[0] === v) ? v : ''; } catch (_) { return ''; } }
export function setCarPhotoPick(id, v) { try { const o = JSON.parse(localStorage.getItem(PHK) || '{}'); if (v) o[id] = v; else delete o[id]; localStorage.setItem(PHK, JSON.stringify(o)); } catch (_) {} }
export function userCarPhoto(id) { if (!id || !USER_PH[id]) return ''; return './img/cars/user/' + (carPhotoPick(id) || id) + '.webp'; }
export function carCropSrc(carId) { return userCarPhoto(carId) || (carId && CROP_CARS.has(carId) ? './img/cars/crop/' + carId + '.webp' : ''); }

/** Начало недели (понедельник 00:00 МСК), мс UTC. */
export function weekStart(ms = Date.now()) {
  const d = new Date(ms + MSK);
  const dow = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) - MSK;
}
function monthBounds(ms, back = 0) {
  const d = new Date(ms + MSK);
  return { from: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1) - MSK, to: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back + 1, 1) - MSK };
}
export function lapMsOf(r) {
  const m = Number(r?.ms); if (m > 0) return m;
  const t = String(r?.t ?? ''); const mm = t.match(/^(\d+):(\d+(?:[.,]\d+)?)$/);
  if (mm) return (Number(mm[1]) * 60 + Number(mm[2].replace(',', '.'))) * 1000;
  const n = Number(t); return n > 0 ? n * 1000 : NaN;
}
const keyOf = (r) => r.pilotId || ('n:' + (r.name || '') + ':' + (r.car || ''));
/** Лучший круг каждого пилота в окне [from, to). */
export function bestPerPilot(rows, from = 0, to = Infinity) {
  const best = new Map();
  for (const r of rows || []) {
    if (!r) continue;
    const at = Number(r.at) || 0;
    if (from > 0 && (at < from || at >= to)) continue;
    const ms = lapMsOf(r); if (!Number.isFinite(ms)) continue;
    const k = keyOf(r); const p = best.get(k);
    if (!p || ms < p._ms) best.set(k, { ...r, _ms: ms });
  }
  return [...best.values()].sort((a, b) => a._ms - b._ms);
}
export function fmtGap(ms) { if (!(ms > 0)) return ''; const s = ms / 1000; return '+' + (s >= 60 ? Math.floor(s / 60) + ':' + (s % 60).toFixed(3).padStart(6, '0') : s.toFixed(3)); }

/** Награды пилота pid по одной доске (все строки трассы). */
function boardFacts(rows, pid, now) {
  const f = { p: 0, purple: false, pole: false, ring: false, laurel: false, top10Weeks: new Set() };
  if (!pid) return f;
  const all = bestPerPilot(rows);
  if (all[0] && all[0].pilotId === pid) f.pole = true;
  const mine = all.find((r) => r.pilotId === pid);
  if (mine && all[0] && mine._ms <= all[0]._ms * 1.07) f.ring = true;
  const wk = bestPerPilot(rows, weekStart(now), Infinity);
  const wi = wk.findIndex((r) => r.pilotId === pid);
  if (wi >= 0 && wi < 3) f.p = wi + 1;
  if (wi === 0) f.purple = true;
  for (let w = 0; w < 26; w++) { // недели подряд в топ-10 (до полугода назад)
    const from = weekStart(now) - w * WEEK;
    const b = bestPerPilot(rows, from, from + WEEK);
    const i = b.findIndex((r) => r.pilotId === pid);
    if (i >= 0 && i < 10) f.top10Weeks.add(w);
  }
  const pm = monthBounds(now, 1);
  const mb = bestPerPilot(rows, pm.from, pm.to);
  if (mb[0] && mb[0].pilotId === pid) f.laurel = true;
  f.laurelWinner = mb[0]?.pilotId || null;
  return f;
}

/**
 * Считает награды текущего пилота. boards: { trackId: rows[] }, laps: state.laps, tracks: [{id, km}]
 * → { earned: {k: count}, progress: {k: {v, of, label}} }
 */
export function computeAwards({ boards, laps, tracks, pid, now = Date.now() }) {
  const earned = {}; const progress = {};
  const inc = (k, n = 1) => { earned[k] = (earned[k] || 0) + n; };
  const weeks = new Set(); const laurelCount = new Map();
  for (const [tid, rows] of Object.entries(boards || {})) {
    if (!Array.isArray(rows) || !rows.length) continue;
    const f = boardFacts(rows, pid, now);
    if (f.p) inc('p' + f.p);
    if (f.purple) inc('purple');
    if (f.pole) inc('pole');
    if (f.ring) inc('ring');
    if (f.laurel) inc('laurel');
    if (f.laurelWinner) laurelCount.set(f.laurelWinner, (laurelCount.get(f.laurelWinner) || 0) + 1);
    f.top10Weeks.forEach((w) => weeks.add(w));
    void tid;
  }
  let streak = 0; while (weeks.has(streak)) streak++;
  if (!streak && weeks.has(1)) { streak = 1; while (weeks.has(streak + 1)) streak++; } // текущая неделя ещё не закрыта
  if (streak >= 2) earned.stint = streak; else progress.stint = { v: streak, of: 2, label: streak + ' / 2 недели' };
  if (pid && laurelCount.size) {
    const top = Math.max(...laurelCount.values());
    if ((laurelCount.get(pid) || 0) === top && top > 0) inc('champ');
  }
  // свои круги: Track Master (50 на трассе) и пробег недели
  let bestN = 0; let bestT = ''; let km = 0; const ws = weekStart(now);
  for (const [tid, list] of Object.entries(laps || {})) {
    const ok = (list || []).filter((l) => l && l.ms > 0 && l.how !== 'manual' && l.valid !== false);
    if (ok.length >= 50) inc('master');
    if (ok.length > bestN) { bestN = ok.length; bestT = tid; }
    const tr = (tracks || []).find((t) => t.id === tid); const tkm = Number(tr?.km) || 0;
    for (const l of ok) if (Number(l.at) >= ws) km += Number(l.dist) > 0 ? l.dist / 1000 : tkm;
  }
  if (!earned.master) progress.master = { v: bestN, of: 50, label: bestN + ' / 50' + (bestT ? ' · ' + bestT : '') };
  if (km >= 100) inc('km'); else progress.km = { v: Math.round(km), of: 100, label: Math.round(km) + ' / 100 км' };
  return { earned, progress };
}

/** Лучшая награда для значка у ника (по одной доске, видна для любого пилота). */
export function rowBadge(rowsAll, r, now = Date.now()) {
  if (!r?.pilotId) return '';
  const f = boardFacts(rowsAll, r.pilotId, now);
  if (f.purple) return 'purple';
  if (f.pole) return 'pole';
  if (f.p) return 'p' + f.p;
  if (f.laurel) return 'laurel';
  if (f.ring) return 'ring';
  return '';
}

function h(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function im(src, cls, alt = '') { const e = document.createElement('img'); e.src = src; e.alt = alt; e.decoding = 'async'; e.loading = 'lazy'; if (cls) e.className = cls; return e; }

/** Аватар в рамке: kind = gold|silver|bronze|purple | Pass: forged|titanium|ceramic|gold18|chrome */
/** v210: рамки Pass — фото-кольца снаружи аватарки; старые id мигрируют */
export const PASS_FRAMES = [['forged', 'Forged Carbon'], ['titanium', 'Black Titanium'], ['ceramic', 'Carbon Ceramic'], ['gold18', '18K Gold'], ['chrome', 'Black Chrome']];
const FR_LEGACY = { carbon: 'forged', chequer: 'chrome' };
export function passFrame(k) { k = FR_LEGACY[k] || k; return PASS_FRAMES.some(([v]) => v === k) ? k : ''; }
export function passFrameSrc(k) { k = passFrame(k); return k ? A + 'fr_' + k + '.webp' : ''; }
export function framedAvatar(avaEl, kind, size) {
  const FR = { gold: 'f1', silver: 'f2', bronze: 'f3', purple: 'fpurple' };
  const pf = passFrame(kind);
  const w = h('span', 'aw-fr' + (kind ? ' on' : '') + (pf ? ' rg' : ''));
  w.style.setProperty('--s', size + 'px');
  w.appendChild(avaEl);
  if (pf) w.appendChild(im(A + 'fr_' + pf + '.webp', 'aw-fr-i'));
  else if (kind && FR[kind]) w.appendChild(im(A + FR[kind] + '.webp', 'aw-fr-i'));
  return w;
}

/** Витрина профиля (машина сверху, без пилота) */
export function renderShowcase(root, { car, carName, nick, res, pass, spec, cardHtml }) {
  root.replaceChildren();
  if (cardHtml) { const cw = h('div', 'cw291 big sc293'); cw.innerHTML = cardHtml; root.appendChild(cw); } else {
  // v212: «Моя машина» — editorial-карточка: машина растворяется в фоне, крупная контурная модель, характеристики, мой лучший 0–100
  const hero = h('div', 'sc-hero ce');
  const sp = spec || {};
  if (car || carName) {
    const big = String(sp.big || carName || '').replace(/^(BMW|Audi)\s+/i, '');
    const bg = h('div', 'ce-big', big); if (Array.from(big).length > 4) bg.classList.add('l'); if (Array.from(big).length > 7) bg.classList.add('xl');
    hero.appendChild(bg);
    const src = userCarPhoto(car) || (car && CROP_CARS.has(car) ? './img/cars/studio/' + car + '-1170.webp' : '');
    if (src) { hero.appendChild(im(src, 'ce-car ce-refl', '')); hero.appendChild(im(src, 'ce-car', carName || '')); }
    else if (sp.side) hero.appendChild(im(sp.side, 'ce-sil', ''));
    hero.appendChild(h('div', 'ce-ln'));
    const info = h('div', 'ce-info');
    info.appendChild(h('div', 'ce-k', 'My car'));
    const md = h('div', 'ce-md'); if (sp.brand) md.appendChild(document.createTextNode(sp.brand + ' ')); md.appendChild(h('b', '', sp.model || carName || '')); info.appendChild(md);
    if (sp.sub) info.appendChild(h('div', 'ce-sub', sp.sub));
    hero.appendChild(info);
    const row = h('div', 'ce-row');
    const cell = (v, u, k, cls) => { const d = h('div', 'ce-c' + (cls ? ' ' + cls : '')); const vv = h('div', 'ce-v', v == null ? '—' : String(v)); if (v != null) vv.appendChild(h('small', '', u)); d.appendChild(vv); d.appendChild(h('div', 'ce-kk', k)); row.appendChild(d); };
    const f2 = (x) => (x == null || !(x > 0) ? null : (x < 10 ? Number(x).toFixed(x * 10 % 1 ? 2 : 1) : Number(x).toFixed(1)));
    cell(sp.hp > 0 ? Math.round(sp.hp) : null, 'HP', 'Power');
    cell(sp.nm > 0 ? Math.round(sp.nm) : null, 'NM', 'Torque');
    cell(f2(sp.v0100), 'S', 'Factory 0–100');
    cell(sp.best > 0 ? Number(sp.best).toFixed(2) : null, 'S', 'My best', 'best');
    hero.appendChild(row);
  } else { hero.classList.add('empty'); hero.appendChild(h('p', 'tiny muted sc-nocar', 'Выбери машину — она встанет на витрину')); }
  root.appendChild(hero);
  }
  const tot = Object.values(res.earned).reduce((a, b) => a + b, 0);
  // v209: компактное превью + полноэкранная витрина по тапу
  const head = h('button', 'sc-head sc-head-btn'); head.type = 'button';
  head.setAttribute('aria-label', 'Все награды');
  head.appendChild(h('h3', '', 'Витрина наград'));
  head.appendChild(h('span', 'sc-all', 'Все награды ›'));
  root.appendChild(head);
  const keys = Object.keys(AWARDS);
  const earned = keys.filter((k) => res.earned[k]);
  const order = earned.concat(keys.filter((k) => !res.earned[k]));
  const row = h('button', 'sc-row'); row.type = 'button'; row.setAttribute('aria-label', 'Открыть витрину наград');
  for (const k of order.slice(0, 5)) {
    const n = res.earned[k] || 0;
    const c = h('span', 'sc-mini' + (n ? '' : ' off'));
    c.appendChild(im(awardImg(k), '', AWARDS[k].n));
    if (n > 1) c.appendChild(h('i', 'sc-x', '×' + n));
    row.appendChild(c);
  }
  root.appendChild(row);
  root.appendChild(h('p', 'sc-sum', tot ? `Получено ${earned.length} из ${keys.length} · всего ${tot}` : `0 из ${keys.length} · награды дают только за время на трассе`));
  const open = () => openAwardsScreen(res);
  head.addEventListener('click', open); row.addEventListener('click', open);
}

/** v209: полноэкранная витрина наград: сетка, назад, детали по тапу */
export function openAwardsScreen(res) {
  document.getElementById('awScreen')?.remove();
  const scr = h('div', 'aw-scr'); scr.id = 'awScreen'; scr.setAttribute('role', 'dialog'); scr.setAttribute('aria-label', 'Витрина наград');
  const bar = h('div', 'aw-scr-bar');
  const back = h('button', 'aw-back', '‹ Назад'); back.type = 'button';
  bar.append(back, h('b', '', 'Витрина наград'), h('span', ''));
  scr.appendChild(bar);
  const keys = Object.keys(AWARDS);
  const got = keys.filter((k) => res.earned[k]).length;
  scr.appendChild(h('p', 'aw-scr-sub', `Получено ${got} из ${keys.length}. Награды не продаются — только за время на трассе.`));
  const g = h('div', 'aw-scr-grid');
  const det = h('div', 'aw-det hidden');
  const showDet = (k) => {
    const a = AWARDS[k]; const n = res.earned[k] || 0; const p = res.progress[k];
    det.replaceChildren();
    const card = h('div', 'aw-det-card');
    card.appendChild(im(awardImg(k), 'aw-det-i' + (n ? '' : ' off'), a.n));
    card.appendChild(h('h3', '', a.n));
    card.appendChild(h('p', '', a.d));
    card.appendChild(h('span', 'aw-det-st' + (n ? ' on' : ''), n ? (n > 1 ? `Получена ×${n}` : 'Получена') : (p && p.label ? 'Прогресс: ' + p.label : 'Ещё не получена')));
    if (!n && p && p.of) { const b2 = h('span', 'sc-bar'); const f = h('i'); f.style.width = Math.min(100, Math.round(100 * p.v / p.of)) + '%'; b2.appendChild(f); card.appendChild(b2); }
    const ok = h('button', 'aw-det-ok', 'Понятно'); ok.type = 'button'; ok.addEventListener('click', () => det.classList.add('hidden'));
    card.appendChild(ok);
    det.appendChild(card); det.classList.remove('hidden');
  };
  det.addEventListener('click', (e) => { if (e.target === det) det.classList.add('hidden'); });
  for (const [k, a] of Object.entries(AWARDS)) {
    const n = res.earned[k] || 0; const p = res.progress[k];
    const c = h('button', 'sc-it' + (n ? '' : ' off')); c.type = 'button';
    const box = h('div', 'sc-m'); box.appendChild(im(awardImg(k), '', a.n));
    if (n > 1) box.appendChild(h('i', 'sc-x', '×' + n));
    c.appendChild(box);
    c.appendChild(h('b', '', a.n));
    c.appendChild(h('small', '', n ? a.d : (p ? p.label : a.d)));
    if (!n && p && p.of) { const b2 = h('span', 'sc-bar'); const f = h('i'); f.style.width = Math.min(100, Math.round(100 * p.v / p.of)) + '%'; b2.appendChild(f); c.appendChild(b2); }
    c.addEventListener('click', () => showDet(k));
    g.appendChild(c);
  }
  scr.appendChild(g); scr.appendChild(det);
  const close = () => { scr.classList.remove('on'); setTimeout(() => scr.remove(), 250); };
  back.addEventListener('click', close);
  document.body.appendChild(scr);
  requestAnimationFrame(() => requestAnimationFrame(() => scr.classList.add('on')));
  try { const TG = window.Telegram?.WebApp; if (TG?.BackButton) { TG.BackButton.show(); const f = () => { TG.BackButton.offClick(f); close(); }; TG.BackButton.onClick(f); } } catch (_) {}
}

/** Карточка Paddock Pass */
export function renderPassCard(root, { pass, onBuy, onSave, available }) {
  root.replaceChildren();
  const top = h('div', 'pp-top');
  top.appendChild(im(awardImg('pass'), 'pp-ic', ''));
  const t = h('div'); t.appendChild(h('b', '', 'Paddock Pass'));
  t.appendChild(h('small', '', pass?.active ? 'активен до ' + new Date(pass.until).toLocaleDateString('ru-RU') : 'только внешний вид · награды не продаются'));
  top.appendChild(t);
  top.appendChild(h('span', 'pp-price', 'от ' + PASS_STARS + ' ★'));
  root.appendChild(top);
  const g = h('div', 'pp-grid');
  for (const [k, n, d] of PASS_ITEMS) { const c = h('div', 'pp-it'); c.appendChild(im(awardImg(k), '', n)); c.appendChild(h('b', '', n)); c.appendChild(h('small', '', d)); g.appendChild(c); }
  root.appendChild(g);
  const msg = h('p', 'tiny muted pp-msg');
  if (pass?.active) {
    const row = h('div', 'pp-cos');
    const pin = h('select'); [['', 'без пина'], ['helmet', 'шлем'], ['wheel', 'руль'], ['carbon', 'карбон']].forEach(([v, l]) => { const o = h('option', '', l); o.value = v; if (pass.pin === v) o.selected = true; pin.appendChild(o); });
    const fr = h('select'); [['', 'No frame'], ...PASS_FRAMES].forEach(([v, l]) => { const o = h('option', '', l); o.value = v; if (passFrame(pass.frame) === v) o.selected = true; fr.appendChild(o); });
    const sv = h('button', 'go-btn', 'Сохранить'); sv.type = 'button';
    sv.addEventListener('click', async () => { sv.disabled = true; msg.textContent = await onSave({ pin: pin.value, frame: fr.value }); sv.disabled = false; });
    row.append(pin, fr, sv); root.appendChild(row);
  } else {
    const b = h('button', 'go-btn race-cta pp-buy', available ? `Оформить · ${PASS_STARS} ★` : 'Скоро'); b.type = 'button';
    b.disabled = !available;
    b.addEventListener('click', async () => { b.disabled = true; msg.textContent = await onBuy('season'); b.disabled = false; });
    root.appendChild(b);
    msg.textContent = available ? 'Оплата Telegram Stars, разово, без автопродления.' : 'Подписка откроется после обновления сервера. Награды за время уже считаются.';
  }
  root.appendChild(msg);
}

/** v211: 3D-вращение на 360° — спрайт n кадров (полный оборот), авто-вращение + свободный drag по горизонтали с инерцией, без ограничения угла */
/** v213: 3D-шлем — единая точка: sm=иконка у ника (120px кадры), иначе 240px */
export function helmet3d(cls, drag, big) { return big ? spin3d('./img/pass/helmet-sprite-240.webp', 240, 12, 120, 9000, cls, drag) : spin3d('./img/pass/helmet-sprite.webp', 120, 12, 120, 9000, cls, drag); }
export function spin3d(src, px, cols, n, period, cls, drag) {
  const c = document.createElement('canvas'); c.className = cls + (drag ? ' spin-drag' : ''); c.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const img = new Image(); img.decoding = 'async'; img.src = src;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const auto = n / (reduce ? period * 2 : period); // v213: и при «уменьшении движения» крутится — просто медленнее
  let pos = 0, last = 0, vel = auto, held = false, px0 = 0, lastMove = 0, raf = 0;
  const kick = () => { if (!raf) raf = requestAnimationFrame(draw); };
  function draw(now) {
    raf = 0;
    if (!c.isConnected && last) return;
    const dt = last ? Math.min(64, now - last) : 0; last = now;
    if (!held) { vel += (auto - vel) * Math.min(1, dt / 600); pos += vel * dt; } // инерция → плавный возврат к авто
    const w = c.clientWidth || 40;
    const W = Math.round(w * dpr); if (c.width !== W) { c.width = W; c.height = W; }
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    const f = ((pos % n) + n) % n;
    const a = Math.floor(f) % n, b = (a + 1) % n, k = f - Math.floor(f);
    g.clearRect(0, 0, W, W);
    const fr = (i, al) => { g.globalAlpha = al; g.drawImage(img, (i % cols) * px, ((i / cols) | 0) * px, px, px, 0, 0, W, W); };
    fr(a, 1); if (k > 0.01) fr(b, k);
    g.globalAlpha = 1;
    if (auto || held || Math.abs(vel) > 1e-4) kick();
  }
  c.__spin = { set: (deg) => { pos = (deg / 360) * n; last = 0; kick(); } }; // скриншоты/отладка
  if (drag) {
    // полный оборот = ширина канваса × 2.5 → удобно крутить и на маленькой иконке
    const perPx = () => n / ((c.clientWidth || 40) * 2.5);
    c.addEventListener('pointerdown', (e) => { held = true; px0 = e.clientX; lastMove = performance.now(); vel = 0; try { c.setPointerCapture(e.pointerId); } catch (_) {} kick(); });
    c.addEventListener('pointermove', (e) => {
      if (!held) return;
      const now = performance.now(), d = (e.clientX - px0) * perPx(); px0 = e.clientX;
      pos -= d; const dt = Math.max(8, now - lastMove); vel = vel * 0.6 + (-d / dt) * 0.4; lastMove = now; kick();
    });
    const up = () => { if (!held) return; held = false; if (performance.now() - lastMove > 80) vel = 0; last = 0; kick(); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up); c.addEventListener('lostpointercapture', up);
  }
  img.onload = kick;
  return c;
}

/** v200: шторка Paddock Pass — герой, что входит (только то, что уже работает), цена, одна кнопка */
export function renderPassSheet(root, { pass, onBuy, onSave, available, onCustomize, guest, onLogin }) {
  root.replaceChildren();
  const hero = h('div', 'ps-hero');
  hero.appendChild(spin3d('./img/pass/pass-emblem-sprite.webp', 264, 12, 120, 6000, 'ps-ic'));
  hero.appendChild(h('span', 'ps-k', 'PITLANE'));
  hero.appendChild(h('h2', 'ps-t', 'Paddock Pass'));
  hero.appendChild(h('p', 'ps-d', pass?.active ? 'Активен до ' + new Date(pass.until).toLocaleDateString('ru-RU') : 'Твой стиль в паддоке: пины и рамка у ника'));
  root.appendChild(hero);
  const ul = h('ul', 'ps-list');
  const perks = [
    ['helmet', 'Nick Pins', 'Helmet, Wheel or Carbon'],
    ['fr_forged', 'Avatar Frames', 'Forged Carbon · Black Titanium · Carbon Ceramic · 18K Gold · Black Chrome'],
  ];
  for (const [k, n, d] of perks) {
    const li = h('li', 'ps-it');
    li.appendChild(k === 'helmet' ? helmet3d('ps-it-i', true) : im( k[0] === 'f' && k.length > 4 ? A + k + '.webp' : awardImg(k), 'ps-it-i', ''));
    const t = h('div'); t.appendChild(h('b', '', n)); t.appendChild(h('small', '', d)); li.appendChild(t);
    ul.appendChild(li);
  }
  root.appendChild(ul);
  root.appendChild(h('p', 'ps-note', 'Только внешний вид. Награды и места в топах не продаются — их дают только за время на трассе.'));
  const msg = h('p', 'tiny muted ps-msg');
  if (pass?.active) {
    // v209: вместо кривых select — одна понятная кнопка в «Оформление Pass»
    const cur = h('div', 'ps-cur');
    const PN = { helmet: 'Helmet', wheel: 'Wheel', carbon: 'Carbon' }, FN = Object.fromEntries(PASS_FRAMES);
    cur.appendChild(h('span', '', 'Пин: ' + (PN[pass.pin] || 'нет')));
    cur.appendChild(h('span', '', 'Рамка: ' + (FN[passFrame(pass.frame)] || 'нет')));
    root.appendChild(cur);
    const b = h('button', 'ps-buy', 'Настроить оформление'); b.type = 'button';
    b.addEventListener('click', () => { if (typeof onCustomize === 'function') onCustomize(); });
    root.appendChild(b);
  } else {
    // v225: выбор плана в стиле Telegram Premium — год (выгодно) / сезон
    let sel = 'year';
    const plans = h('div', 'ps-plans'); plans.setAttribute('role', 'radiogroup');
    const b = h('button', 'ps-buy'); b.type = 'button';
    const sync = () => {
      for (const c of plans.children) { const on = c.dataset.plan === sel; c.classList.toggle('on', on); c.setAttribute('aria-checked', on ? 'true' : 'false'); }
      const P = PASS_PLANS.find((x) => x.id === sel);
      b.textContent = guest ? 'Войти, чтобы купить' : available ? `Купить ${P.id === 'year' ? 'год' : 'сезон'} за ${P.stars} ★` : 'Скоро';
    };
    for (const P of PASS_PLANS) {
      const c = h('button', 'ps-plan'); c.type = 'button'; c.dataset.plan = P.id; c.setAttribute('role', 'radio');
      c.appendChild(h('i', 'ps-plan-dot'));
      const t = h('div', 'ps-plan-t'); const tt = h('b', '', P.t); if (P.badge) tt.appendChild(h('em', 'ps-plan-badge', P.badge)); t.appendChild(tt); t.appendChild(h('small', '', P.sub)); c.appendChild(t);
      const pr = h('div', 'ps-plan-p'); if (P.old) pr.appendChild(h('s', '', P.old.toLocaleString('ru-RU') + ' ★')); pr.appendChild(h('b', '', P.stars + ' ★')); c.appendChild(pr);
      c.addEventListener('click', () => { sel = P.id; sync(); });
      plans.appendChild(c);
    }
    root.appendChild(plans);
    b.disabled = !available && !guest;
    b.addEventListener('click', async () => { if (guest) { if (typeof onLogin === 'function') onLogin(); return; } b.disabled = true; msg.textContent = await onBuy(sel); b.disabled = false; });
    root.appendChild(b); sync();
    msg.textContent = guest ? 'Покупка — после входа через Telegram.' : available ? 'Telegram Stars · разовая оплата, без автопродления.' : 'Продажи откроются после обновления сервера.';
  }
  root.appendChild(msg);
}
