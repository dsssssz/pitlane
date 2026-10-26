/**
 * v192: Pitlane Awards + витрина профиля + Paddock Pass (макеты v11).
 * Награды НЕ продаются: считаются только из реальных строк общего топа кругов (`/tops/lap/:track`)
 * и собственных кругов пилота (state.laps). Нет данных → «в процессе», ничего не выдумываем.
 * Paddock Pass (149 ★/мес, Telegram Stars) — только внешний вид: номер, карбон, рамки, пины.
 */
const MSK = 3 * 3600 * 1000;
const WEEK = 7 * 86400000;
export const PASS_STARS = 149;
const A = './img/awards/';
export const AWARDS = {
  p1: { n: 'Podium P1', d: 'P1 недели на трассе' },
  p2: { n: 'Podium P2', d: 'P2 недели на трассе' },
  p3: { n: 'Podium P3', d: 'P3 недели на трассе' },
  purple: { n: 'Purple Lap', d: 'быстрейший круг недели' },
  pole: { n: 'Pole', d: 'рекорд трассы за всё время' },
  stint: { n: 'Stint', d: 'недель подряд в топ-10' },
  ring: { n: 'Ring Plaque', d: 'круг в пределах 107% рекорда' },
  master: { n: 'Track Master', d: '50 кругов на одной трассе' },
  km: { n: 'Mileage', d: '100 км кругов за неделю' },
  laurel: { n: 'Season Laurel', d: 'P1 трассы за месяц-сезон' },
  champ: { n: 'Champion', d: 'больше всех лавров за сезон' },
};
export const PASS_ITEMS = [
  ['number', 'Race Number', 'свой номер 0–99 у ника'],
  ['carbon', 'Carbon', 'карбоновый знак'],
  ['helmet', 'Helmet Pin', 'пин-шлем у ника'],
  ['wheel', 'Wheel Pin', 'пин-руль у ника'],
];
export const CROP_CARS = new Set(['g87-m2', 'gt3rs', 'mclaren-765lt', 'g63', 'm4', 'm3', 'x6', 'isf', 'c63-ed507', 'spark']);
export function awardImg(k, small) { return A + k + (small ? '_s' : '') + '.webp'; }
export function carCropSrc(carId) { return carId && CROP_CARS.has(carId) ? './img/cars/crop/' + carId + '.webp' : ''; }

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

/** Аватар в рамке: kind = gold|silver|bronze|purple|carbon|chequer */
export function framedAvatar(avaEl, kind, size) {
  const FR = { gold: 'f1', silver: 'f2', bronze: 'f3', purple: 'fpurple', carbon: 'fcarbon', chequer: 'fcheq' };
  const w = h('span', 'aw-fr' + (kind ? ' on' : ''));
  w.style.setProperty('--s', size + 'px');
  w.appendChild(avaEl);
  if (kind && FR[kind]) w.appendChild(im(A + FR[kind] + '.webp', 'aw-fr-i'));
  return w;
}

/** Витрина профиля (машина сверху, без пилота) */
export function renderShowcase(root, { car, carName, nick, res, pass }) {
  root.replaceChildren();
  const hero = h('div', 'sc-hero');
  const src = carCropSrc(car);
  if (src) hero.appendChild(im(src, 'sc-car', carName || ''));
  else hero.appendChild(h('p', 'tiny muted sc-nocar', 'Выбери машину в «Моя машина» — она встанет на витрину'));
  const cap = h('div', 'sc-cap');
  cap.appendChild(h('b', '', nick || 'пилот'));
  if (pass?.active && pass.number != null) cap.appendChild(h('span', 'sc-num', '#' + pass.number));
  if (carName) cap.appendChild(h('small', '', carName));
  hero.appendChild(cap);
  root.appendChild(hero);
  const head = h('div', 'sc-head');
  head.appendChild(h('h3', '', 'Витрина наград'));
  const tot = Object.values(res.earned).reduce((a, b) => a + b, 0);
  head.appendChild(h('span', 'tiny muted', tot ? tot + ' за время на трассе' : 'только за время · не купить'));
  root.appendChild(head);
  const g = h('div', 'sc-grid');
  for (const [k, a] of Object.entries(AWARDS)) {
    const n = res.earned[k] || 0; const p = res.progress[k];
    const c = h('div', 'sc-it' + (n ? '' : ' off'));
    c.title = a.d;
    const box = h('div', 'sc-m'); box.appendChild(im(awardImg(k), '', a.n));
    if (n > 1) box.appendChild(h('i', 'sc-x', '×' + n));
    c.appendChild(box);
    c.appendChild(h('b', '', a.n));
    c.appendChild(h('small', '', n ? a.d : (p ? p.label : a.d)));
    if (!n && p && p.of) { const bar = h('span', 'sc-bar'); const f = h('i'); f.style.width = Math.min(100, Math.round(100 * p.v / p.of)) + '%'; bar.appendChild(f); c.appendChild(bar); }
    g.appendChild(c);
  }
  root.appendChild(g);
}

/** Карточка Paddock Pass */
export function renderPassCard(root, { pass, onBuy, onSave, available }) {
  root.replaceChildren();
  const top = h('div', 'pp-top');
  top.appendChild(im(awardImg('pass'), 'pp-ic', ''));
  const t = h('div'); t.appendChild(h('b', '', 'Paddock Pass'));
  t.appendChild(h('small', '', pass?.active ? 'активен до ' + new Date(pass.until).toLocaleDateString('ru-RU') : 'только внешний вид · награды не продаются'));
  top.appendChild(t);
  top.appendChild(h('span', 'pp-price', PASS_STARS + ' ★ / мес'));
  root.appendChild(top);
  const g = h('div', 'pp-grid');
  for (const [k, n, d] of PASS_ITEMS) { const c = h('div', 'pp-it'); c.appendChild(im(awardImg(k), '', n)); c.appendChild(h('b', '', n)); c.appendChild(h('small', '', d)); g.appendChild(c); }
  root.appendChild(g);
  const msg = h('p', 'tiny muted pp-msg');
  if (pass?.active) {
    const row = h('div', 'pp-cos');
    const num = h('input'); num.type = 'number'; num.min = '0'; num.max = '99'; num.placeholder = 'номер'; num.value = pass.number ?? '';
    const pin = h('select'); [['', 'без пина'], ['helmet', 'шлем'], ['wheel', 'руль'], ['carbon', 'карбон']].forEach(([v, l]) => { const o = h('option', '', l); o.value = v; if (pass.pin === v) o.selected = true; pin.appendChild(o); });
    const fr = h('select'); [['', 'без рамки'], ['carbon', 'карбон'], ['chequer', 'клетка']].forEach(([v, l]) => { const o = h('option', '', l); o.value = v; if (pass.frame === v) o.selected = true; fr.appendChild(o); });
    const sv = h('button', 'go-btn', 'Сохранить'); sv.type = 'button';
    sv.addEventListener('click', async () => { sv.disabled = true; msg.textContent = await onSave({ number: num.value === '' ? null : Math.max(0, Math.min(99, Math.round(Number(num.value)))), pin: pin.value, frame: fr.value }); sv.disabled = false; });
    row.append(num, pin, fr, sv); root.appendChild(row);
  } else {
    const b = h('button', 'go-btn race-cta pp-buy', available ? `Оформить · ${PASS_STARS} ★` : 'Скоро'); b.type = 'button';
    b.disabled = !available;
    b.addEventListener('click', async () => { b.disabled = true; msg.textContent = await onBuy(); b.disabled = false; });
    root.appendChild(b);
    msg.textContent = available ? 'Оплата Telegram Stars. Отменить можно в Telegram в любой момент.' : 'Подписка откроется после обновления сервера. Награды за время уже считаются.';
  }
  root.appendChild(msg);
}
