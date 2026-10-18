/* v161: Журнал — единая история: замеры, сессии кругов и дуэли в одном списке, фильтры, группировка по дням.
 * Сессия = как в Track Precision: трасса, число кругов, лучший круг; тап — итог сессии / разбор / аналитика.
 * Модуль грузится при первом входе в Журнал. Только textContent — данные не попадают в разметку. */
const GAP = 45 * 60 * 1000; // круги без сохранённой сессии — склеиваем, если между ними < 45 мин
const KINDS = [['all', 'Все'], ['run', 'Замеры'], ['lap', 'Круги'], ['duel', 'Дуэли']];
const FKEY = 'pitlane-journal-f';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function journalFilter(v) {
  if (v) { try { localStorage.setItem(FKEY, v); } catch (_) {} return v; }
  try { const s = localStorage.getItem(FKEY); if (KINDS.some(([k]) => k === s)) return s; } catch (_) {}
  return 'all';
}

/** Собирает записи журнала из локального состояния (+ дуэли с сервера). */
export function buildEntries(D, duels = []) {
  const st = D.state || {}; const out = [];
  // замеры: слипы + личные рекорды (402 м и т. п., если их нет в слипах)
  const slips = Array.isArray(st.slips) ? st.slips : [];
  slips.forEach((s, i) => {
    const t = num(s.v0100); if (t == null && num(s.v100200) == null) return;
    out.push({ kind: 'run', at: Number(s.at) || 0, title: s.car || 'Замер', label: '0–100', main: t != null ? t.toFixed(2) : '—', unit: 'с',
      sub: num(s.v100200) != null ? '100–200 ' + num(s.v100200).toFixed(2) + ' с' : '', latest: i === 0, slip: s });
  });
  const best = st.dragBest || {};
  for (const [car, discs] of Object.entries(best)) {
    for (const [disc, r] of Object.entries(discs || {})) {
      const t = num(r && r.t); if (t == null) continue;
      if (disc === '0-100' && slips.some((s) => Math.abs((Number(s.at) || 0) - (Number(r.at) || 0)) < 120000 || num(s.v0100) === t)) continue;
      const nm = (D.carName && D.carName(car)) || car;
      out.push({ kind: 'run', at: Number(r.at) || 0, title: nm, label: disc === '402m' ? '402 м' : disc.replace('-', '–'), main: t.toFixed(2), unit: 'с', sub: 'личный рекорд' + (r.gpsQ ? ' · GPS ' + r.gpsQ : ''), pb: true });
    }
  }
  // круги: сохранённые сессии + «свободные» круги, склеенные по времени
  const days = Array.isArray(st.trackDays) ? st.trackDays : [];
  const seen = new Set();
  days.forEach((s, idx) => {
    (s.laps || []).forEach((l) => seen.add(s.trackId + ':' + l.at + ':' + l.ms));
    out.push(sessionEntry(D, s.trackId, s.laps || [], Number(s.at) || 0, { idx, bestMs: s.bestMs }));
  });
  for (const [tid, list] of Object.entries(st.laps || {})) {
    const loose = (list || []).filter((l) => l && Number.isFinite(l.ms) && !seen.has(tid + ':' + l.at + ':' + l.ms)).sort((a, b) => (a.at || 0) - (b.at || 0));
    let cur = [];
    const flush = () => { if (cur.length) out.push(sessionEntry(D, tid, cur, cur[0].at || 0, {})); cur = []; };
    loose.forEach((l) => { if (cur.length && (l.at || 0) - (cur[cur.length - 1].at || 0) > GAP) flush(); cur.push(l); });
    flush();
  }
  // отмечаем лучший круг трассы
  const bestBy = {};
  out.filter((e) => e.kind === 'lap' && e.okMs != null).forEach((e) => { if (bestBy[e.trackId] == null || e.okMs < bestBy[e.trackId]) bestBy[e.trackId] = e.okMs; });
  out.forEach((e) => { if (e.kind === 'lap' && e.okMs != null && e.okMs === bestBy[e.trackId]) e.pb = true; }); // ручной финиш и «не в зачёт» рекордом не считаются
  // дуэли
  duels.forEach((d) => {
    if (!d || !d.id) return;
    out.push({ kind: 'duel', at: Number(d.createdAt) || 0, title: D.duelType ? D.duelType(d) : 'Дуэль', label: D.duelStatus ? D.duelStatus(d) : '', main: '', unit: '',
      sub: D.duelVs ? D.duelVs(d) : '', id: d.id, done: d.status === 'ready' || d.status === 'expired' });
  });
  return out.sort((a, b) => b.at - a.at);
}

function sessionEntry(D, tid, laps, at, { idx = null, bestMs = null } = {}) {
  const ok = laps.filter((l) => l.how !== 'manual' && l.valid !== false);
  const b = bestMs != null ? bestMs : (ok.length ? Math.min(...ok.map((l) => l.ms)) : (laps.length ? Math.min(...laps.map((l) => l.ms)) : null));
  const tr = (D.tracks || []).find((t) => t.id === tid);
  const n = laps.length; const okMs = ok.length ? Math.min(...ok.map((l) => l.ms)) : null;
  return { kind: 'lap', at, trackId: tid, laps, idx, bestMs: b, okMs, title: tr ? tr.name : tid, label: 'лучший круг', main: b != null ? D.fmtLap(b) : '—', unit: '',
    sub: n + ' ' + plural(n, 'круг', 'круга', 'кругов') + (ok.length < n ? ' · в зачёт ' + ok.length : '') };
}

function dayLabel(at) {
  if (!at) return 'Раньше';
  const d = new Date(at); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, t)) return 'Сегодня';
  if (same(d, y)) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}
const hhmm = (at) => (at ? new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');

/** Рисует Журнал в host. */
export function renderJournal(host, D, entries, filter) {
  host.replaceChildren();
  const cnt = { run: 0, lap: 0, duel: 0 }; entries.forEach((e) => { cnt[e.kind]++; });
  // сводка — три прибора, они же фильтры
  const sum = el('div', 'jn-sum');
  [['run', 'замеры', cnt.run], ['lap', 'сессии', cnt.lap], ['duel', 'дуэли', cnt.duel]].forEach(([k, l, n]) => {
    const b = el('button', 'jn-sum-c'); b.type = 'button'; b.dataset.jf = k; b.setAttribute('aria-pressed', String(filter === k));
    b.append(el('b', '', n), el('span', '', l)); sum.appendChild(b);
  });
  host.appendChild(sum);
  const seg = el('div', 'jn-seg'); seg.setAttribute('role', 'tablist'); seg.setAttribute('aria-label', 'Фильтр журнала');
  KINDS.forEach(([k, l]) => { const b = el('button', 'jn-f', l); b.type = 'button'; b.dataset.jf = k; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(filter === k)); seg.appendChild(b); });
  host.appendChild(seg);
  const list = entries.filter((e) => filter === 'all' || e.kind === filter);
  if (!list.length) {
    const e = el('div', 'jn-empty');
    const msg = filter === 'lap' ? ['Сессий пока нет', 'Выберите трассу на вкладке «Трек» и начните сессию.', 'Трек', 'lap']
      : filter === 'duel' ? ['Дуэлей пока нет', 'Вызов 1 на 1 — разгон или круг.', 'Вызвать', 'duel']
        : ['Журнал пуст', 'Первый замер — на вкладке «Замер». Здесь появятся замеры, сессии и дуэли.', 'Замер', 'run'];
    e.append(el('b', '', msg[0]), el('span', '', msg[1]));
    const go = el('button', 'jn-go', msg[2]); go.type = 'button'; go.dataset.jgo = msg[3]; e.appendChild(go);
    host.appendChild(e); return;
  }
  let day = null; let ul = null;
  list.slice(0, 120).forEach((e, i) => {
    const dl = dayLabel(e.at);
    if (dl !== day) { day = dl; host.appendChild(el('h3', 'jn-day', dl)); ul = el('ul', 'jn-list'); host.appendChild(ul); }
    const li = el('li', 'jn-row'); li.dataset.kind = e.kind; li.dataset.i = String(entries.indexOf(e));
    const btn = el('button', 'jn-hit'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false');
    const left = el('span', 'jn-l');
    left.append(el('small', 'jn-k', (e.kind === 'run' ? 'Замер' : e.kind === 'lap' ? 'Сессия' : 'Дуэль') + (e.at ? ' · ' + hhmm(e.at) : '')), el('b', 'jn-t', e.title));
    if (e.sub) left.appendChild(el('span', 'jn-s', e.sub));
    const right = el('span', 'jn-r');
    if (e.main) { const v = el('b', 'jn-v', e.main); if (e.unit) v.appendChild(el('i', '', ' ' + e.unit)); right.appendChild(v); }
    right.appendChild(el('small', 'jn-lb' + (e.pb ? ' jn-pb' : ''), e.pb ? (e.kind === 'lap' ? 'лучший на трассе' : 'рекорд') : e.label));
    btn.append(left, right); li.appendChild(btn);
    ul.appendChild(li);
  });
}

/** Детали строки (раскрытие на месте) — кнопки действий. */
export function rowActions(e, D) {
  const box = el('div', 'jn-x');
  const add = (t, fn, primary) => { const b = el('button', 'jn-a' + (primary ? ' jn-a-p' : ''), t); b.type = 'button'; b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); }); box.appendChild(b); };
  if (e.kind === 'lap') {
    const g = el('div', 'jn-laps');
    e.laps.slice(0, 12).forEach((l, i) => { const r = el('span', 'jn-lap' + (l.ms === e.bestMs ? ' best' : '') + (l.valid === false || l.how === 'manual' ? ' off' : '')); r.append(el('small', '', String(i + 1)), el('b', '', D.fmtLap(l.ms))); g.appendChild(r); });
    box.appendChild(g);
    add('Итог сессии', () => D.openSummary(e.laps, e.trackId), true);
    if (e.idx != null && D.canReview && D.canReview(e.laps)) add('Разбор', () => D.openReview(e.idx));
    add('Аналитика', () => D.openAnalytics(e.trackId));
  } else if (e.kind === 'run') {
    if (e.slip && num(e.slip.v100200) != null) box.appendChild(el('p', 'jn-note', '0–100 ' + (num(e.slip.v0100) != null ? num(e.slip.v0100).toFixed(2) + ' с' : '—') + ' · 100–200 ' + num(e.slip.v100200).toFixed(2) + ' с'));
    if (e.latest) add('Поделиться слипом', () => D.shareLatest(), true);
    add('Новый замер', () => D.go('run'));
    add('Видео с телеметрией', () => D.video());
  } else if (e.kind === 'duel') {
    add('Открыть дуэль', () => D.openDuel(e.id), true);
  }
  return box;
}
