/* v141: Sector battle в HUD круга, сектора на карте, призрак на SVG-карте, «Предложить трассу».
 * Чистые функции (splitsOf, bestSplits, sectorDelta, toneOf) тестируются в node; DOM — только textContent. */
export const SECTOR_BETTER = '#30d158';
export const SECTOR_WORSE = '#ff453a';

/** cumulative [t1,t2,t3] → splits [s1,s2,s3] (null где нет). */
export function splitsOf(cum) {
  const a = Array.isArray(cum) ? cum : [];
  return [0, 1, 2].map((i) => {
    const c = a[i], p = i === 0 ? 0 : a[i - 1];
    return Number.isFinite(c) && Number.isFinite(p) && c > p ? c - p : null;
  });
}
/** Лучшие сплиты по секторам среди кругов [{sectors:[cum…], valid?}] */
export function bestSplits(laps) {
  const best = [null, null, null];
  for (const l of laps || []) {
    if (!l || l.valid === false) continue;
    splitsOf(l.sectors).forEach((s, i) => { if (s != null && (best[i] == null || s < best[i])) best[i] = s; });
  }
  return best;
}
export function sectorDelta(split, ref) { return Number.isFinite(split) && Number.isFinite(ref) ? split - ref : null; }
export function toneOf(d) { return d == null ? 'none' : d <= 0 ? 'better' : 'worse'; }
export function fmtDelta(ms) { if (ms == null) return '—'; const s = Math.abs(ms) / 1000; return (ms <= 0 ? '−' : '+') + s.toFixed(2); }

const NS = 'http://www.w3.org/2000/svg';
/** Три сегмента трассы поверх линии: pathLength=3, каждый сектор = 1/3. */
export function ensureSectorLayer(svg) {
  if (!svg) return null;
  let g = svg.querySelector('.lb-sectors');
  if (g) return g;
  const line = svg.querySelector('.track-line'); if (!line) return null;
  g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'lb-sectors');
  for (let i = 0; i < 3; i++) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', line.getAttribute('d')); p.setAttribute('pathLength', '3'); p.setAttribute('fill', 'none');
    p.setAttribute('stroke-width', '4.2'); p.setAttribute('stroke-linecap', 'butt');
    p.setAttribute('stroke-dasharray', '1 3'); p.setAttribute('stroke-dashoffset', String(-i));
    p.setAttribute('class', 'lb-sec'); p.dataset.i = String(i); p.dataset.tone = 'none';
    g.appendChild(p);
  }
  line.after(g);
  const gh = document.createElementNS(NS, 'circle'); gh.setAttribute('class', 'lb-ghost'); gh.setAttribute('r', '5'); gh.style.display = 'none';
  g.after(gh);
  return g;
}
export function paintSector(svg, i, tone) {
  const g = ensureSectorLayer(svg); if (!g) return;
  const p = g.querySelector('.lb-sec[data-i="' + i + '"]'); if (p) p.dataset.tone = tone;
}
export function resetSectors(svg) { const g = svg?.querySelector('.lb-sectors'); if (g) g.querySelectorAll('.lb-sec').forEach((p) => { p.dataset.tone = 'none'; }); }
export function setGhostDot(svg, pt) {
  ensureSectorLayer(svg); const c = svg?.querySelector('.lb-ghost'); if (!c) return;
  if (!pt) { c.style.display = 'none'; return; }
  c.style.display = ''; c.setAttribute('cx', pt.x.toFixed(1)); c.setAttribute('cy', pt.y.toFixed(1));
}
/** Чип сектора в HUD: «S1 −0.21». */
export function paintChip(el, i, split, d) {
  if (!el) return;
  el.textContent = '';
  const b = document.createElement('b'); b.textContent = 'S' + (i + 1);
  const t = document.createElement('span'); t.textContent = split != null ? (split / 1000).toFixed(2) : '—';
  const dd = document.createElement('i'); dd.textContent = d != null ? fmtDelta(d) : '';
  el.append(b, t, dd); el.dataset.tone = toneOf(d);
}

/* ——— «Предложить / откалибровать трассу» ——— */
const rid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return [...a].map((x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); };
export function mountSuggest(host, { api, needLogin, currentUser, hap, getPos }) {
  if (!host || host.dataset.on) return; host.dataset.on = '1';
  const st = { sf: null, sectors: [], cid: rid(), busy: false };
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const name = mk('input', 'ts-in'); name.placeholder = 'Название трассы'; name.maxLength = 60;
  const city = mk('input', 'ts-in'); city.placeholder = 'Город'; city.maxLength = 60;
  const pts = mk('ol', 'ts-pts');
  const msg = mk('p', 'ts-msg tiny'); msg.setAttribute('role', 'status');
  const bSf = mk('button', 'ts-btn', 'Отметить старт/финиш здесь'); bSf.type = 'button';
  const bSec = mk('button', 'ts-btn', 'Добавить точку сектора'); bSec.type = 'button';
  const note = mk('input', 'ts-in'); note.placeholder = 'Комментарий (необязательно)'; note.maxLength = 300;
  const send = mk('button', 'ts-send', 'Отправить на модерацию'); send.type = 'button';
  const draw = () => {
    pts.textContent = '';
    const row = (lab, p) => { const li = mk('li'); li.append(mk('b', null, lab), mk('span', null, p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) + (p.acc != null ? ' · ±' + Math.round(p.acc) + ' м' : ''))); pts.appendChild(li); };
    if (st.sf) row('С/Ф', st.sf);
    st.sectors.forEach((p, i) => row('Сектор ' + (i + 1), p));
    bSec.disabled = !st.sf || st.sectors.length >= 6;
    send.disabled = st.busy || !st.sf;
  };
  const grab = async (cb) => {
    msg.textContent = 'Ловим GPS…';
    try { const p = await getPos(); if (p.acc != null && p.acc > 30) msg.textContent = 'Точность ±' + Math.round(p.acc) + ' м — лучше встать на открытом месте и повторить.'; else msg.textContent = ''; cb(p); hap?.(8); draw(); }
    catch (_) { msg.textContent = 'Нет доступа к GPS. Разрешите геолокацию и повторите.'; }
  };
  bSf.addEventListener('click', () => grab((p) => { st.sf = p; }));
  bSec.addEventListener('click', () => grab((p) => { st.sectors.push(p); }));
  send.addEventListener('click', async () => {
    if (!currentUser()) { needLogin?.(); return; }
    st.busy = true; draw(); msg.textContent = 'Отправляем…';
    const r = await api.trackSuggest({ name: name.value.trim(), city: city.value.trim(), sf: st.sf, sectors: st.sectors, note: note.value.trim(), cid: st.cid }).catch(() => null);
    st.busy = false;
    if (r && r.ok) { msg.textContent = 'Принято. Трасса появится после проверки.'; st.sf = null; st.sectors = []; st.cid = rid(); name.value = ''; city.value = ''; note.value = ''; }
    else msg.textContent = r?.field === 'name' ? 'Укажите название (от 3 символов).' : r?.field === 'city' ? 'Укажите город.' : 'Не отправилось. Попробуйте позже.';
    draw();
  });
  const steps = mk('p', 'tiny muted ts-steps', 'Встаньте на линии старта/финиша и отметьте точку. Затем по ходу круга — 2–3 точки на границах секторов. Мы проверим и добавим трассу.');
  host.append(steps, name, city, bSf, bSec, pts, note, send, msg);
  draw();
}
