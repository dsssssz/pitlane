/* v317: первый запуск (онбординг B), итог сезона (сторис A → C → B), «Сейчас на трассе» над чатом, пружины для топов.
 * Только реальные данные пилота: чего нет — не показываем. Весь текст → textContent. Строки — в V317_I18N.
 *
 * Перенесено на чистый JS (без React) с сохранением анимации, отступов и поведения; перекрашено в чёрный стиль PITLANE:
 *  - Number Ticker — Magic UI, MIT, Copyright (c) Magic UI. https://21st.dev/@dillionverma/components/number-ticker
 *      пружина damping 60 / stiffness 100 (motion useSpring), старт при появлении на экране, задержка в секундах.
 *  - Blur Fade — Magic UI, MIT, Copyright (c) Magic UI. https://21st.dev/@dillionverma/components/blur-fade
 *      сдвиг 6 px, размытие 6 px → 0, 0.4 s ease-out, задержка 0.04 s + delay.
 *  - Animated List — Magic UI, MIT, Copyright (c) Magic UI. https://21st.dev/@dillionverma/components/animated-list
 *      появление/перестановка на пружине stiffness 350 / damping 40, scale от верхнего края.
 *  - Carousel Cards — Kokonut UI, MIT, Copyright (c) 2025 kokonutUI. https://21st.dev/@kokonutd/components/carousel-cards
 *      рельс со scroll-snap, наклон карточки по view-timeline: perspective 900px, translateZ −180px, rotateY ±14°; детали проявляются у центра.
 *  - Notification Stack — Kokonut UI, MIT, Copyright (c) 2025 kokonutUI. https://21st.dev/@kokonutd/components/notification-stack
 *      PEEK 10 px, видно 2 карточки сзади, scale 1 − 0.05·глубина, 300 ms cubic-bezier(.23,1,.32,1); тап — раскрыть (GAP 8 px);
 *      смахнуть в сторону — скрыть (100 px или 0.11 px/ms), возврат — критически задемпфированная пружина k 520.
 * Лицензия MIT: «Permission is hereby granted, free of charge, … The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.» Полный текст — github.com/magicuidesign/magicui и github.com/kokonut-labs/kokonutui.
 */
export const V317_I18N = { ru: {
  skip: 'Пропустить', next: 'Дальше', later: 'Позже',
  heroCap: '0–100', heroUnit: 'с', heroTxt: 'Замеряй разгон телефоном или чипом PITLANE GPS. Цифра — пример, твоя появится после первого заезда.',
  carsCap: 'Шаг 1 из 2', carsTitle: 'На чём ездишь?', carsMine: 'Это моя машина', carsOther: 'Другая машина — каталог', carsFactory: 'заводские',
  carsLoading: 'Загружаю каталог…', carsFail: 'Каталог не загрузился — выбери машину позже в профиле.',
  stepsCap: 'Шаг 2 из 2', stepsTitle: 'Первый замер', stepsGo: 'Открыть замер', stock: 'сток 0–100',
  steps: ['Закрепи телефон или подключи GPS-чип по Wi-Fi', 'Встань на ровном прямом участке и дождись «Готов»', 'Газ в пол — замер начнётся сам'],
  hp: 'л.с.',
  nowCap: 'Сейчас на трассе', nowCollapse: 'Свернуть', nowPut: (n, t, d) => [n, ' поставил ', t, ' на ', d], nowPilot: 'Пилот',
  rcOpen: 'Итоги сезона', rcYear: (y) => 'Твой ' + y, rcRuns: (n) => plural(n, 'заезд', 'заезда', 'заездов'), rcBest: 'Лучший 0–100', rcImpr: 'Прогресс',
  rcKm: (k) => k + ' км замеров', rcLaps: (n) => n + ' ' + plural(n, 'круг', 'круга', 'кругов'),
  rcCity: (c) => c, rcOf: (n) => 'из ' + n + ' ' + plural(n, 'пилота', 'пилотов', 'пилотов') + ' в топе города', rcCls: (c) => '0–100 · ' + (c === 'c' ? 'телефон C' : 'чип A/B'),
  rcMonths: 'Лучшее 0–100 по месяцам', rcGrid: 'Сезон\nв цифрах', rcN: 'Заездов', rcKmK: 'Км замеров', rcB2: 'Лучший 100–200', rcB4: 'Лучшая ¼ мили', rcLapsK: 'Кругов',
  rcEmpty: 'Сезон только начался', rcEmptyTxt: 'Сделай первый замер — здесь появятся твои цифры за год.', rcGo: 'К замеру',
  rcShare: 'Поделиться', rcClose: 'Закрыть', rcSeason: (y) => 'Сезон ' + y, rcMonthsShort: 'ЯФМАМИИАСОНД',
} };
const L = V317_I18N.ru;
function plural(n, a, b, c) { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; }
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
export const reduced317 = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
const fmt2 = (t) => Number(t).toFixed(2);
let D = {};
export function initV317(ctx) { D = ctx || {}; }

/* ——— пружина (единичная масса, полу-неявный Эйлер с подшагами — как у Kokonut; совпадает с motion spring по форме) ——— */
export function springTo(from, to, { k = 100, c = 60, onUpdate, onDone } = {}) {
  if (reduced317()) { onUpdate?.(to); onDone?.(); return () => {}; }
  let x = from, v = 0, last = performance.now(), stop = false;
  const f = (now) => {
    if (stop) return;
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) { const a = -k * (x - to) - c * v; v += a * h; x += v * h; }
    const span = Math.max(1e-6, Math.abs(to - from));
    if (Math.abs(x - to) < span * 1e-4 && Math.abs(v) < span * 1e-3) { onUpdate?.(to); onDone?.(); return; }
    onUpdate?.(x); requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  return () => { stop = true; };
}
/** Magic UI Number Ticker: пружина 100/60 от start к value, при появлении на экране. */
export function numberTicker(node, value, { start = 0, dp = 0, delay = 0, suffix = '' } = {}) {
  const put = (x) => { node.textContent = Number(x).toFixed(dp) + suffix; };
  node.style.fontVariantNumeric = 'tabular-nums';
  if (reduced317()) { put(value); return; }
  put(start);
  const go = () => setTimeout(() => springTo(start, value, { k: 100, c: 60, onUpdate: put }), delay * 1000);
  if (typeof IntersectionObserver === 'undefined') { go(); return; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }); io.observe(node);
}
/** Magic UI Blur Fade: 6 px сдвиг + blur 6 px → 0 за 0.4 s ease-out. */
export function blurFade(node, { delay = 0, dir = 'down' } = {}) {
  if (reduced317()) return;
  const ax = dir === 'left' || dir === 'right' ? 'X' : 'Y'; const s = dir === 'right' || dir === 'down' ? -6 : 6;
  node.style.opacity = '0'; node.style.filter = 'blur(6px)'; node.style.transform = `translate${ax}(${s}px)`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const d = (0.04 + delay) + 's'; node.style.transition = `opacity .4s ease-out ${d}, transform .4s ease-out ${d}, filter .4s ease-out ${d}`;
    node.style.opacity = '1'; node.style.filter = 'blur(0px)'; node.style.transform = 'none';
    setTimeout(() => { node.style.transition = ''; node.style.filter = ''; }, 500 + (0.04 + delay) * 1000);
  }));
}
/** Magic UI Animated List — перестановка строки на пружине 350/40 (FLIP): строка едет со старого места, соседи — на шаг. */
export function springFlip(node, dy, { k = 350, c = 40 } = {}) {
  if (!node || !dy || reduced317()) return;
  node.style.willChange = 'transform';
  springTo(dy, 0, { k, c, onUpdate: (y) => { node.style.transform = Math.abs(y) < 0.05 ? '' : `translateY(${y.toFixed(2)}px)`; }, onDone: () => { node.style.transform = ''; node.style.willChange = ''; } });
}

/* ——— Kokonut Carousel Cards: CSS view-timeline; где его нет (iOS < 26), тот же ключевой кадр считаем на scroll ——— */
function railFallback(rail) {
  if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timeline: view()')) return;
  if (reduced317()) return;
  const paint = () => {
    const rr = rail.getBoundingClientRect(); const cx = rr.left + rr.width / 2;
    for (const c of rail.querySelectorAll('.k317-card')) {
      const r = c.getBoundingClientRect();
      // прогресс view-timeline по inline: 0 — входит справа, 0.5 — по центру, 1 — уходит слева
      const p = Math.max(0, Math.min(1, (rr.right - r.left) / (rr.width + r.width)));
      const t = (p - 0.5) * 2; // −1..1
      const tilt = c.querySelector('.k317-tilt'); if (tilt) tilt.style.transform = `perspective(900px) translateZ(${(-180 * Math.abs(t)).toFixed(1)}px) rotateY(${(14 * t).toFixed(2)}deg)`;
      const det = c.querySelector('.k317-det'); if (det) { const a = Math.abs(t); const o = a <= 0.1 ? 1 : a >= 0.36 ? 0 : 1 - (a - 0.1) / 0.26; det.style.opacity = o.toFixed(2); det.style.transform = `translate3d(0, ${(6 * (1 - o)).toFixed(1)}px, 0)`; }
      void cx;
    }
  };
  rail.addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true });
  requestAnimationFrame(paint);
}

/* ———————————— Онбординг (первый запуск) ———————————— */
const ONB_KEY = 'pitlane-onb-v317';
const SHOWCASE = ['bmw|M3 (G80)', 'mercedes|E 63 (W213)', 'bmw|M5 (F90)', 'audi|RS 6 Avant (C8)', 'mercedes|C 63 (W205)', 'toyota|Camry (XV70)', 'bmw|M4 (G82/G83)', 'toyota|Land Cruiser 200 / 300', 'mercedes|CLS 63 (C218)', 'porsche|Panamera (971)', 'toyota|GR Supra (A90)', 'mercedes|G 63 (W463)'];
export function onbSeen() { try { return !!localStorage.getItem(ONB_KEY); } catch (_) { return true; } }
export function onbMark(v) { try { localStorage.setItem(ONB_KEY, v + ':' + Date.now()); } catch (_) {} }
/** Новый пользователь: ни одного заезда, нет своей машины, не по ссылке. Старым — флаг сразу, чтобы никогда не показывать. */
export function onbMaybeShow() {
  if (onbSeen()) return false;
  let old = false; try { old = !!(D.hasAnyRun?.() || D.myCarLocal?.()); } catch (_) {}
  if (old) { onbMark('old'); return false; }
  if (D.deepLink?.()) return false;
  openOnboarding(); return true;
}
let ONB = null;
export function openOnboarding() {
  if (ONB) return;
  const root = el('div', 'onb317'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'PITLANE');
  const seg = el('div', 'onb-seg'); for (let i = 0; i < 3; i++) { const s = el('i'); s.appendChild(el('b')); seg.appendChild(s); }
  const head = el('header', 'onb-head'); head.appendChild(el('span', 'onb-wm', 'PITLANE'));
  const skip = el('button', 'onb-skip', L.skip); skip.type = 'button'; head.appendChild(skip);
  const stage = el('div', 'onb-stage');
  root.append(seg, head, stage);
  document.body.appendChild(root); document.documentElement.classList.add('onb-open');
  ONB = { root, stage, seg, step: -1, car: null, cars: null };
  skip.addEventListener('click', () => { D.hap?.(6); onbFinish('skip'); });
  requestAnimationFrame(() => root.classList.add('on'));
  onbStep(0);
}
function onbSeg(i) { ONB.seg.querySelectorAll('i').forEach((s, k) => { s.classList.toggle('done', k < i); s.classList.toggle('cur', k === i); }); }
function onbStep(i) {
  if (!ONB) return; ONB.step = i; onbSeg(i);
  const st = ONB.stage; st.replaceChildren(); st.scrollTop = 0;
  const scr = el('section', 'onb-scr s' + i); st.appendChild(scr);
  const foot = el('div', 'onb-foot');
  if (i === 0) {
    const cap = el('div', 'onb-cap', L.heroCap);
    const big = el('div', 'onb-big'); const v = el('span', 'onb-bigv'); big.append(v, el('small', '', L.heroUnit));
    const txt = el('p', 'onb-txt', L.heroTxt);
    scr.append(cap, big, el('i', 'onb-hl'), txt);
    numberTicker(v, 3.42, { start: 0, dp: 2, delay: 0.15 }); // иллюстрация в подписи помечена как пример
    blurFade(cap); blurFade(txt, { delay: 0.15 });
    const b = el('button', 'onb-btn', L.next); b.type = 'button'; b.addEventListener('click', () => { D.hap?.(6); onbStep(1); }); foot.appendChild(b);
  } else if (i === 1) {
    scr.append(el('div', 'onb-cap', L.carsCap), el('h2', 'onb-h', L.carsTitle));
    const rail = el('div', 'k317-rail'); rail.setAttribute('role', 'listbox'); rail.setAttribute('aria-label', L.carsTitle); scr.appendChild(rail);
    const note = el('p', 'onb-note'); scr.appendChild(note);
    const mine = el('button', 'onb-btn', L.carsMine); mine.type = 'button'; mine.disabled = true;
    const other = el('button', 'onb-link', L.carsOther); other.type = 'button';
    foot.append(mine, other);
    const fill = (cars) => {
      rail.replaceChildren();
      if (!cars.length) { note.textContent = L.carsFail; return; }
      cars.forEach((c, k) => {
        const card = el('div', 'k317-card'); card.setAttribute('role', 'option'); card.dataset.i = String(k);
        const tilt = el('div', 'k317-tilt'); const ph = el('div', 'k317-ph'); const im = el('img'); im.alt = ''; im.decoding = 'async'; im.src = c.photo; im.addEventListener('error', () => ph.classList.add('none')); ph.appendChild(im); tilt.appendChild(ph);
        const tx = el('div', 'k317-tx'); tx.appendChild(el('b', '', c.name.replace(/\s*\([^)]*\)\s*$/, '')));
        const det = el('div', 'k317-det'); const ch = (c.name.match(/\(([^)]+)\)\s*$/) || [])[1];
        det.appendChild(el('span', '', [ch, c.hp ? c.hp + ' ' + L.hp : ''].filter(Boolean).join(' · ')));
        if (c.v0100) det.appendChild(el('span', 'k317-t', '0–100 ' + String(c.v0100).replace('.', ',') + ' с'));
        tx.appendChild(det); tilt.appendChild(tx); card.appendChild(tilt); rail.appendChild(card);
        card.addEventListener('click', () => { card.scrollIntoView({ behavior: reduced317() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' }); });
      });
      note.textContent = L.carsFactory === '' ? '' : '0–100 и мощность — ' + L.carsFactory;
      mine.disabled = false; railFallback(rail);
      const idx = Math.max(0, cars.findIndex((c) => ONB.car && c.id === ONB.car.id));
      requestAnimationFrame(() => { const c = rail.children[idx]; if (c) rail.scrollLeft = c.offsetLeft - (rail.clientWidth - c.offsetWidth) / 2; });
    };
    if (ONB.cars) fill(ONB.cars);
    else { note.textContent = L.carsLoading; Promise.resolve(D.carShowcase?.(SHOWCASE)).then((cars) => { if (!ONB) return; ONB.cars = Array.isArray(cars) ? cars : []; if (ONB.step === 1) fill(ONB.cars); }).catch(() => { if (ONB) { ONB.cars = []; if (ONB.step === 1) fill([]); } }); }
    const centered = () => { const rr = rail.getBoundingClientRect(); const cx = rr.left + rr.width / 2; let best = 0, bd = 1e9; [...rail.children].forEach((c, k) => { const r = c.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - cx); if (d < bd) { bd = d; best = k; } }); return best; };
    mine.addEventListener('click', () => { const c = ONB.cars?.[centered()]; if (!c) return; D.hap?.(10); ONB.car = c; onbStep(2); });
    other.addEventListener('click', () => {
      D.hap?.(6);
      D.openCarDb?.({ onPick: (c) => { if (!ONB) return; ONB.car = { ...c, photo: D.carPhoto?.(c.id) || '' }; onbStep(2); },
        onManual: () => { onbFinish('manual'); setTimeout(() => D.openMyCarSheet?.(), 300); } });
    });
  } else {
    scr.append(el('div', 'onb-cap', L.stepsCap), el('h2', 'onb-h', L.stepsTitle));
    const c = ONB.car;
    if (c) {
      const card = el('div', 'onb-car');
      if (c.photo) { const im = el('img'); im.alt = ''; im.src = c.photo; im.addEventListener('error', () => im.remove()); card.appendChild(im); }
      const tx = el('div'); tx.appendChild(el('b', '', c.name)); if (c.v0100) tx.appendChild(el('span', '', L.stock + ' · ' + String(c.v0100).replace('.', ',') + ' с (' + L.carsFactory + ')'));
      card.appendChild(tx); scr.appendChild(card);
    }
    const ol = el('ol', 'onb-steps');
    L.steps.forEach((t, k) => { const li = el('li'); li.append(el('b', '', String(k + 1)), el('span', '', t)); ol.appendChild(li); blurFade(li, { delay: 0.08 * k }); });
    scr.appendChild(ol);
    const go = el('button', 'onb-btn', L.stepsGo); go.type = 'button';
    go.addEventListener('click', () => { D.hap?.(10); const car = ONB.car; onbFinish('done'); D.goToView?.('run'); if (car) setTimeout(() => { void D.pickCar?.(car); }, 350); });
    const later = el('button', 'onb-link', L.later); later.type = 'button';
    later.addEventListener('click', () => { D.hap?.(6); const car = ONB.car; onbFinish('later'); if (car) setTimeout(() => { void D.pickCar?.(car); }, 350); });
    foot.append(go, later);
  }
  scr.appendChild(foot);
}
function onbFinish(why) {
  onbMark(why); if (!ONB) return;
  const r = ONB.root; ONB = null; r.classList.remove('on'); document.documentElement.classList.remove('onb-open');
  setTimeout(() => r.remove(), reduced317() ? 0 : 320);
}

/* ———————————— Итог сезона ———————————— */
const SZ_KEY = 'pitlane-season-v317';
const yearOf = (at) => new Date(Number(at) + 3 * 3600e3).getUTCFullYear(); // МСК
const monthOf = (at) => new Date(Number(at) + 3 * 3600e3).getUTCMonth();
function szLoad() { try { return JSON.parse(localStorage.getItem(SZ_KEY) || 'null'); } catch (_) { return null; } }
function szSave(s) { try { localStorage.setItem(SZ_KEY, JSON.stringify(s)); } catch (_) {} }
/** Счётчик сезона: копится с v317 на каждом замере; при первом запуске — из того, что уже лежит в журнале (слипы — последние 20). */
export function seasonEnsure(state, now = Date.now()) {
  const y = yearOf(now); let s = szLoad();
  if (s && s.y === y) return s;
  const slips = (Array.isArray(state?.slips) ? state.slips : []).filter((x) => x && x.at && yearOf(x.at) === y);
  s = { y, n: slips.length, capped: slips.length >= 20, distM: 0, first: null, m: {} };
  for (const x of slips.slice().sort((a, b) => a.at - b.at)) szAdd(s, x, false);
  szSave(s); return s;
}
function szAdd(s, x, count = true) {
  if (count) s.n += 1;
  const t = Number(x.v0100);
  if (t > 0) { if (!s.first) s.first = { t, at: x.at }; const m = String(monthOf(x.at)); if (!(s.m[m] > 0) || t < s.m[m]) s.m[m] = t; }
  const d = Number(x.rc?.dist); if (d > 0 && d < 5000) s.distM += d;
}
export function seasonNoteRun(state, slip) {
  try { const s = seasonEnsure(state, slip.at); if (yearOf(slip.at) !== s.y) return; szAdd(s, slip, true); szSave(s); } catch (_) {}
}
/** Собирает итог из реальных данных: счётчик сезона, личные рекорды за год, круги за год (× длина трассы), место в городе. */
export function seasonData(state, { tracks = [], carName = '' } = {}) {
  const s = seasonEnsure(state); const y = s.y;
  const bestOf = (d) => { let b = null; for (const st of [state?.dragBest, state?.dragBestC]) for (const c of Object.values(st || {})) { const r = c?.[d]; const t = Number(r?.t); if (t > 0 && r.at && yearOf(r.at) === y && (!b || t < b.t)) b = { t, at: Number(r.at) }; } return b; };
  const b0 = bestOf('0-100');
  const m = { ...s.m }; if (b0) { const k = String(monthOf(b0.at)); if (!(m[k] > 0) || b0.t < m[k]) m[k] = b0.t; }
  let best = b0 ? b0.t : null; for (const v of Object.values(m)) if (v > 0 && (best == null || v < best)) best = v;
  const impr = s.first && best != null && s.first.t - best >= 0.01 ? s.first.t - best : null;
  let laps = 0, lapKm = 0;
  for (const [tid, list] of Object.entries(state?.laps || {})) { const km = parseFloat(tracks.find((t) => t.id === tid)?.km) || 0; for (const l of (Array.isArray(list) ? list : [])) if (l && l.at && yearOf(l.at) === y) { laps += 1; lapKm += km; } }
  const km = Math.round((s.distM / 1000 + lapKm) * 10) / 10;
  const months = Object.keys(m).map(Number).filter((k) => m[k] > 0).sort((a, b) => a - b).map((k) => ({ k, t: m[k] }));
  return { y, n: s.n, capped: s.capped, best, impr, km: km >= 0.1 ? km : 0, laps, b2: bestOf('100-200')?.t || null, b4: bestOf('402m')?.t || null, months, car: carName };
}
let RC = null;
export async function openRecap() {
  if (RC) return;
  const st = D.state?.() || {};
  const data = seasonData(st, { tracks: D.tracks?.() || [], carName: D.carName?.() || '' });
  data.photo = D.carPhotoMine?.() || '';
  data.nick = D.nick?.() || '';
  const root = el('div', 'rc317'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', L.rcOpen);
  const panel = el('div', 'rc-panel'); root.appendChild(panel);
  const seg = el('div', 'rc-seg'); const stage = el('div', 'rc-stage'); const bar = el('div', 'rc-bar');
  const x = el('button', 'rc-x pl-x', '×'); x.type = 'button'; x.setAttribute('aria-label', L.rcClose);
  const sh = el('button', 'rc-share', L.rcShare); sh.type = 'button';
  bar.append(sh); panel.append(seg, x, stage, bar);
  document.body.appendChild(root); document.documentElement.classList.add('rc-open');
  RC = { root, panel, stage, seg, data, i: 0, slides: [], timer: 0, city: null };
  RC.slides = rcSlides(data);
  rcPaint();
  requestAnimationFrame(() => root.classList.add('on'));
  x.addEventListener('click', () => rcClose());
  sh.addEventListener('click', () => { D.hap?.(10); void rcShare(); });
  // тап справа — дальше, слева — назад (как в сторис); свайп вниз — закрыть
  let sy = 0, sx = 0, dy = 0, t0 = 0, drag = false;
  panel.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; sy = e.clientY; sx = e.clientX; dy = 0; t0 = performance.now(); drag = true; rcPause(true); });
  panel.addEventListener('pointermove', (e) => { if (!drag) return; dy = Math.max(0, e.clientY - sy); if (dy > 4) { panel.style.transition = 'none'; panel.style.transform = `translateY(${dy}px)`; } });
  const up = (e) => {
    if (!drag) return; drag = false; const dt = performance.now() - t0; const v = dy / Math.max(1, dt);
    panel.style.transition = ''; panel.style.transform = '';
    if (dy > 120 || (dy > 40 && v > 0.6)) { rcClose(); return; }
    rcPause(false);
    if (dy < 8 && dt < 350 && !e.target.closest('button')) { const r = panel.getBoundingClientRect(); rcGo(e.clientX - r.left < r.width / 3 ? RC.i - 1 : RC.i + 1); }
    void sx;
  };
  panel.addEventListener('pointerup', up); panel.addEventListener('pointercancel', () => { drag = false; panel.style.transform = ''; rcPause(false); });
  // место в городе — с сервера (топ города), если есть город и ты в топе; иначе слайд без него
  void Promise.resolve(D.cityRank?.()).then((r) => { if (!RC || !r) return; RC.data.city = r; RC.slides = rcSlides(RC.data); rcPaint(); }).catch(() => {});
}
function rcSlides(d) {
  const out = [];
  if (d.n > 0 || d.best != null) out.push('a');
  if (d.city || d.months.length >= 2) out.push('c');
  if ([d.n, d.best, d.impr, d.km, d.b2, d.b4, d.laps].filter((v) => v).length >= 2) out.push('b');
  if (!out.length) out.push('empty');
  return out;
}
const SLIDE_MS = 6000;
function rcPaint() {
  if (!RC) return;
  RC.i = Math.max(0, Math.min(RC.i, RC.slides.length - 1));
  RC.seg.replaceChildren(...RC.slides.map((_, k) => { const s = el('i', k < RC.i ? 'done' : k === RC.i ? 'cur' : ''); s.appendChild(el('b')); return s; }));
  const cur = RC.seg.children[RC.i]?.firstChild; if (cur && !reduced317()) { cur.style.animationDuration = SLIDE_MS + 'ms'; }
  RC.stage.replaceChildren(rcSlideEl(RC.slides[RC.i], RC.data));
  { const sh = RC.panel.querySelector('.rc-share'); if (sh) sh.hidden = RC.slides[RC.i] === 'empty'; }
  clearTimeout(RC.timer); RC.left = SLIDE_MS; RC.t0 = performance.now();
  if (!reduced317() && RC.i < RC.slides.length - 1) RC.timer = setTimeout(() => rcGo(RC.i + 1), SLIDE_MS);
}
function rcPause(on) {
  if (!RC) return; const cur = RC.seg.children[RC.i]?.firstChild;
  if (on) { clearTimeout(RC.timer); RC.left = Math.max(0, RC.left - (performance.now() - RC.t0)); if (cur) cur.style.animationPlayState = 'paused'; }
  else { if (cur) cur.style.animationPlayState = ''; RC.t0 = performance.now(); if (!reduced317() && RC.i < RC.slides.length - 1) { clearTimeout(RC.timer); RC.timer = setTimeout(() => rcGo(RC.i + 1), RC.left); } }
}
function rcGo(i) { if (!RC) return; if (i < 0) i = 0; if (i >= RC.slides.length) { rcClose(); return; } if (i === RC.i) { rcPaint(); return; } RC.i = i; D.hap?.(4); rcPaint(); }
export function rcClose() { if (!RC) return; clearTimeout(RC.timer); const r = RC.root; RC = null; r.classList.remove('on'); document.documentElement.classList.remove('rc-open'); setTimeout(() => r.remove(), reduced317() ? 0 : 300); }
const tFmt = (t) => fmt2(t);
function rcSlideEl(kind, d) {
  const s = el('section', 'rc-slide rc-' + kind);
  const top = el('div', 'rc-top'); top.append(el('span', 'rc-wm', 'PITLANE'), el('span', 'rc-sz', L.rcSeason(d.y))); s.appendChild(top);
  if (kind === 'empty') {
    s.append(el('h2', 'rc-h', L.rcEmpty), el('p', 'rc-p', L.rcEmptyTxt));
    const go = el('button', 'onb-btn', L.rcGo); go.type = 'button'; go.addEventListener('click', () => { rcClose(); D.goToView?.('run'); }); s.appendChild(go);
    return s;
  }
  if (kind === 'a') {
    s.appendChild(el('div', 'rc-cap', L.rcYear(d.y)));
    if (d.n > 0) { const big = el('div', 'rc-huge'); const v = el('span'); big.appendChild(v); numberTicker(v, d.n, { start: 0 }); if (d.capped) big.appendChild(el('small', 'rc-plus', '+')); s.append(big, el('div', 'rc-unit', L.rcRuns(d.n))); }
    const g = el('div', 'rc-pair');
    if (d.best != null) { const c = el('div'); c.appendChild(el('span', 'rc-cap', L.rcBest)); const b = el('b', 'rc-num'); numberTicker(b, d.best, { start: d.best + 1.5, dp: 2 }); c.appendChild(b); g.appendChild(c); }
    if (d.impr != null) { const c = el('div'); c.appendChild(el('span', 'rc-cap', L.rcImpr)); c.appendChild(el('b', 'rc-num', '−' + tFmt(d.impr))); g.appendChild(c); }
    if (g.children.length) s.appendChild(g);
    const line = [d.car, d.km ? L.rcKm(String(d.km).replace('.', ',')) : '', d.laps ? L.rcLaps(d.laps) : ''].filter(Boolean).join(' · ');
    if (line) s.appendChild(el('p', 'rc-p', line));
  } else if (kind === 'c') {
    if (d.city) {
      s.appendChild(el('div', 'rc-cap', [d.city.city, L.rcCls(d.city.cls)].join(' · ')));
      const big = el('div', 'rc-rank'); big.appendChild(el('small', '', '№')); const v = el('span'); numberTicker(v, d.city.rank, { start: Math.min(d.city.n, d.city.rank + 20) }); big.appendChild(v); s.appendChild(big);
      s.appendChild(el('div', 'rc-unit sm', L.rcOf(d.city.n)));
    }
    if (d.months.length >= 2) {
      const ch = el('div', 'rc-chart'); const ts = d.months.map((m) => m.t); const hi = Math.max(...ts), lo = Math.min(...ts); const span = Math.max(0.05, hi - lo);
      for (let k = 0; k < 12; k++) {
        const m = d.months.find((x) => x.k === k); const col = el('div', 'rc-col');
        const bar = el('i', m && m.t === lo ? 'best' : ''); bar.style.height = m ? (14 + ((hi - m.t) / span) * 86).toFixed(1) + '%' : '0'; if (!m) bar.classList.add('none');
        col.append(bar, el('span', '', L.rcMonthsShort[k])); ch.appendChild(col);
      }
      s.appendChild(ch);
      const f = el('div', 'rc-chf'); f.append(el('span', '', L.rcMonths), el('b', '', tFmt(d.months[0].t) + ' → ' + tFmt(lo) + ' с')); s.appendChild(f);
    }
  } else if (kind === 'b') {
    s.appendChild(el('h2', 'rc-h', L.rcGrid));
    if (d.photo) { const im = el('img', 'rc-car'); im.alt = ''; im.src = d.photo; im.addEventListener('error', () => im.remove()); s.appendChild(im); }
    const g = el('div', 'rc-grid');
    const add = (k, v, u = '') => { if (g.children.length >= 6) return; const c = el('div'); c.appendChild(el('span', 'rc-cap', k)); const b = el('b', 'rc-num', v); if (u) b.appendChild(el('small', '', ' ' + u)); c.appendChild(b); g.appendChild(c); };
    if (d.n) add(L.rcN, d.n + (d.capped ? '+' : ''));
    if (d.best != null) add(L.rcBest, tFmt(d.best), 'с');
    if (d.impr != null) add(L.rcImpr, '−' + tFmt(d.impr), 'с');
    if (d.km) add(L.rcKmK, String(d.km).replace('.', ','));
    if (d.b2) add(L.rcB2, tFmt(d.b2), 'с');
    if (d.b4) add(L.rcB4, tFmt(d.b4), 'с');
    if (d.laps) add(L.rcLapsK, String(d.laps));
    s.appendChild(g);
  }
  if (d.nick) s.appendChild(el('div', 'rc-nick', '@' + d.nick));
  return s;
}
/* 1080×1920: тот же слайд рисуем на холсте (Sofia Sans Condensed), отдаём в общий механизм шейра картинки */
async function rcShare() {
  if (!RC) return;
  rcPause(true);
  try { await document.fonts?.load?.('700 200px "Sofia Sans Condensed"'); await document.fonts?.load?.('500 40px "Golos Text"'); } catch (_) {}
  const cv = rcCanvas(RC.slides[RC.i], RC.data);
  try { await D.shareImage?.(cv, 'pitlane-season-' + RC.data.y + '.jpg'); } finally { rcPause(false); }
}
export function rcCanvas(kind, d) {
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  const S = (w, px) => `${w} ${px}px "Sofia Sans Condensed", "Arial Narrow", sans-serif`; const G = (w, px) => `${w} ${px}px "Golos Text", -apple-system, Roboto, Arial, sans-serif`;
  const txt = (s, X, Y, font, col = '#fff', ls = 0) => { x.font = font; x.fillStyle = col; try { x.letterSpacing = ls + 'px'; } catch (_) {} x.fillText(s, X, Y); try { x.letterSpacing = '0px'; } catch (_) {} };
  const line = (Y) => { x.fillStyle = '#1f1f22'; x.fillRect(72, Y, W - 144, 2); };
  const P = 72;
  txt('PITLANE', P, 150, S(700, 34), '#fff', 10); x.textAlign = 'right'; txt(L.rcSeason(d.y), W - P, 150, G(500, 30), '#8a8a8f'); x.textAlign = 'left';
  const cap = (s, Y) => txt(s.toUpperCase(), P, Y, G(600, 26), '#8a8a8f', 4);
  if (kind === 'a') {
    cap(L.rcYear(d.y), 330);
    let y = 330;
    if (d.n > 0) { const s = String(d.n) + (d.capped ? '+' : ''); let fs = 560; x.font = S(700, fs); while (x.measureText(s).width > W - 2 * P && fs > 200) { fs -= 20; x.font = S(700, fs); } txt(s, P - 10, 330 + fs * 0.86, S(700, fs), '#fff', -fs * 0.03); y = 330 + fs * 0.86 + 90; txt(L.rcRuns(d.n), P, y + 20, S(700, 84)); y += 100; }
    else y = 420;
    line(y); y += 70;
    const cols = []; if (d.best != null) cols.push([L.rcBest, tFmt(d.best)]); if (d.impr != null) cols.push([L.rcImpr, '−' + tFmt(d.impr)]);
    cols.forEach(([k, v], n) => { const X = P + n * ((W - 2 * P) / 2) + (n ? 40 : 0); txt(k.toUpperCase(), X, y, G(600, 26), '#8a8a8f', 4); txt(v, X - 4, y + 190, S(700, 190), '#fff', -5); });
    if (cols.length === 2) { x.fillStyle = '#1f1f22'; x.fillRect(W / 2, y - 40, 2, 260); }
    y += 260; line(y);
    const ln = [d.car, d.km ? L.rcKm(String(d.km).replace('.', ',')) : '', d.laps ? L.rcLaps(d.laps) : ''].filter(Boolean).join(' · ');
    if (ln) txt(ln.slice(0, 54), P, y + 80, G(500, 34), '#b4b4b8');
  } else if (kind === 'c') {
    let y = 330;
    if (d.city) {
      cap([d.city.city, L.rcCls(d.city.cls)].join(' · '), y);
      txt('№', P, y + 300, S(700, 200));
      x.font = S(700, 200); const nw = x.measureText('№').width;
      txt(String(d.city.rank), P + nw + 20, y + 560, S(700, 640), '#fff', -18);
      y += 680; txt(L.rcOf(d.city.n), P, y, S(700, 64)); y += 120;
    }
    if (d.months.length >= 2) {
      const ts = d.months.map((m) => m.t); const hi = Math.max(...ts), lo = Math.min(...ts); const span = Math.max(0.05, hi - lo);
      const top = Math.max(y + 40, 1240), bot = 1660, cw = (W - 2 * P - 11 * 12) / 12;
      for (let k = 0; k < 12; k++) {
        const m = d.months.find((q) => q.k === k); const X = P + k * (cw + 12);
        if (m) { const h = (bot - top) * (0.14 + ((hi - m.t) / span) * 0.86); x.fillStyle = m.t === lo ? '#fff' : '#2a2a2d'; x.fillRect(X, bot - h, cw, h); }
        x.textAlign = 'center'; txt(L.rcMonthsShort[k], X + cw / 2, bot + 44, G(500, 24), '#8a8a8f'); x.textAlign = 'left';
      }
      txt(L.rcMonths, P, bot + 110, G(500, 30), '#8a8a8f'); x.textAlign = 'right'; txt(tFmt(d.months[0].t) + ' → ' + tFmt(lo) + ' с', W - P, bot + 110, G(600, 30)); x.textAlign = 'left';
    }
  } else if (kind === 'b') {
    txt(L.rcGrid.split('\n')[0], P, 330, S(700, 120)); txt(L.rcGrid.split('\n')[1], P, 440, S(700, 120));
    const im = RC?.stage?.querySelector('img.rc-car'); if (im && im.complete && im.naturalWidth) { const w = 760, h = w * im.naturalHeight / im.naturalWidth; try { x.drawImage(im, W - w + 60, 380, w, h); } catch (_) {} }
    const items = [];
    if (d.n) items.push([L.rcN, d.n + (d.capped ? '+' : ''), '']); if (d.best != null) items.push([L.rcBest, tFmt(d.best), 'с']); if (d.impr != null) items.push([L.rcImpr, '−' + tFmt(d.impr), 'с']);
    if (d.km) items.push([L.rcKmK, String(d.km).replace('.', ','), '']); if (d.b2) items.push([L.rcB2, tFmt(d.b2), 'с']); if (d.b4) items.push([L.rcB4, tFmt(d.b4), 'с']); if (d.laps) items.push([L.rcLapsK, String(d.laps), '']);
    let y = 820; const cw = (W - 2 * P) / 2;
    items.slice(0, 6).forEach((it, k) => {
      const col = k % 2, row = Math.floor(k / 2); const X = P + col * cw + (col ? 40 : 0), Y = y + row * 300;
      if (col === 0) { x.fillStyle = '#1f1f22'; x.fillRect(P, Y - 60, W - 2 * P, 2); x.fillRect(P + cw, Y - 60, 2, 300); }
      txt(it[0].toUpperCase(), X, Y, G(600, 24), '#8a8a8f', 3);
      txt(it[1], X - 4, Y + 170, S(700, 170), '#fff', -4); if (it[2]) { x.font = S(700, 170); const w2 = x.measureText(it[1]).width; txt(it[2], X + w2 + 10, Y + 170, G(500, 34), '#8a8a8f'); }
    });
  }
  x.fillStyle = '#1f1f22'; x.fillRect(P, 1790, W - 2 * P, 2);
  txt('t.me/pitlane_official_bot', P, 1850, G(500, 30), '#8a8a8f');
  if (d.nick) { x.textAlign = 'right'; txt('@' + d.nick, W - P, 1850, G(600, 30)); x.textAlign = 'left'; }
  return c;
}

/* ———————————— «Сейчас на трассе» над чатом (Kokonut Notification Stack) ———————————— */
const NOW_WIN = 24 * 3600e3; const NOW_MAX = 5;
const NS = { PEEK: 10, BEHIND: 2, GAP: 8, DISMISS: 100, DISMISS_V: 0.11, K: 520 };
let _nowOpen = false; const _nowGone = new Set();
/** items: [{ id, nick, pilotId, t, d, car, at }] — реальные замеры (топы + замеры из чата) за последние 24 ч. */
export function renderNowStack(host, items, { onPilot } = {}) {
  if (!host) return;
  const list = (items || []).filter((it) => it && !_nowGone.has(it.id) && Date.now() - it.at < NOW_WIN).slice(0, NOW_MAX);
  host.replaceChildren(); host.hidden = !list.length; if (!list.length) return;
  const head = el('div', 'nw-head'); head.append(el('span', '', L.nowCap));
  const tg = el('button', 'nw-tg', _nowOpen ? L.nowCollapse : String(list.length)); tg.type = 'button'; tg.setAttribute('aria-expanded', _nowOpen ? 'true' : 'false'); head.appendChild(tg);
  const ol = el('ol', 'nw-list' + (_nowOpen ? ' open' : '')); host.append(head, ol);
  const cards = list.map((it) => {
    const li = el('li', 'nw-item'); li.dataset.id = it.id;
    const a = el('article', 'nw-card');
    a.appendChild(el('span', 'nw-ic', it.dl));
    const tx = el('div', 'nw-tx'); const p = el('p'); const [n1, s1, t1, s2, d1] = L.nowPut(it.nick, fmt2(it.t), it.dl);
    p.append(el('b', '', n1), document.createTextNode(s1), el('b', '', t1), document.createTextNode(s2 + d1)); tx.appendChild(p);
    tx.appendChild(el('span', 'nw-sub', [it.car, it.ago].filter(Boolean).join(' · ')));
    a.appendChild(tx); li.appendChild(a); ol.appendChild(li); return li;
  });
  const layout = () => {
    const hs = cards.map((c) => c.offsetHeight || 64);
    if (_nowOpen) { let y = 0; cards.forEach((c, d) => { c.style.transform = `translateY(${y}px) scale(1)`; c.style.opacity = '1'; c.style.zIndex = String(cards.length - d); c.style.pointerEvents = ''; y += hs[d] + NS.GAP; }); ol.style.height = (y - NS.GAP) + 'px'; }
    else {
      const front = hs[0];
      cards.forEach((c, d) => { const sc = 1 - d * 0.05; const y = front + d * NS.PEEK - hs[d] * sc; const hid = d > NS.BEHIND; c.style.transform = `translateY(${y}px) scale(${sc})`; c.style.opacity = hid ? '0' : '1'; c.style.zIndex = String(cards.length - d); c.style.pointerEvents = hid || d > 0 ? 'none' : ''; });
      ol.style.height = (front + Math.min(NS.BEHIND, cards.length - 1) * NS.PEEK) + 'px';
    }
  };
  requestAnimationFrame(layout); layout();
  const toggle = () => { _nowOpen = !_nowOpen; ol.classList.toggle('open', _nowOpen); tg.textContent = _nowOpen ? L.nowCollapse : String(list.length); tg.setAttribute('aria-expanded', _nowOpen ? 'true' : 'false'); D.hap?.(4); layout(); };
  tg.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  // свайп в сторону — скрыть карточку; тап по свёрнутой стопке — раскрыть, по раскрытой — профиль пилота
  cards.forEach((c, d) => {
    const it = list[d]; let x0 = 0, y0 = 0, dx = 0, lock = '', t0 = 0, samples = [];
    const a = c.firstChild;
    a.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; dx = 0; lock = ''; t0 = performance.now(); samples = [{ t: t0, x: x0 }]; try { a.setPointerCapture(e.pointerId); } catch (_) {} });
    a.addEventListener('pointermove', (e) => {
      if (!t0) return; const mx = e.clientX - x0, my = e.clientY - y0;
      if (!lock && Math.hypot(mx, my) > 6) lock = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (lock !== 'x' || (!_nowOpen && d > 0)) return;
      dx = mx; a.style.transition = 'none'; a.style.transform = `translateX(${dx}px)`; a.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 300));
      samples.push({ t: performance.now(), x: e.clientX }); if (samples.length > 8) samples.shift();
    });
    const end = () => {
      if (!t0) return; const dt = performance.now() - t0; t0 = 0;
      if (lock === 'x') {
        const s0 = samples.find((s) => performance.now() - s.t <= 80) || samples[0]; const s1 = samples[samples.length - 1]; const v = (s1.x - s0.x) / Math.max(8, s1.t - s0.t);
        if (Math.abs(dx) > NS.DISMISS || Math.abs(v) > NS.DISMISS_V && Math.sign(v) === Math.sign(dx)) {
          const dir = Math.sign(dx || v); a.style.transition = 'transform .2s cubic-bezier(.23,1,.32,1), opacity .2s'; a.style.transform = `translateX(${dir * 420}px)`; a.style.opacity = '0';
          _nowGone.add(it.id); D.hap?.(6); setTimeout(() => renderNowStack(host, items, { onPilot }), 200); return;
        }
        a.style.transition = ''; springTo(dx, 0, { k: NS.K, c: 2 * Math.sqrt(NS.K), onUpdate: (q) => { a.style.transform = Math.abs(q) < 0.1 ? '' : `translateX(${q}px)`; }, onDone: () => { a.style.transform = ''; a.style.opacity = ''; } });
        a.style.opacity = ''; return;
      }
      if (lock === 'y' || dt > 600) return;
      if (!_nowOpen) toggle(); else if (it.pilotId) onPilot?.(it.pilotId);
    };
    a.addEventListener('pointerup', end); a.addEventListener('pointercancel', () => { t0 = 0; a.style.transform = ''; a.style.opacity = ''; });
  });
}
