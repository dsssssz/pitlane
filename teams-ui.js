/**
 * v98: команды — публичная страница (профиль + лента), список/поиск, редактор капитана.
 * Приватная часть (круги, дуэли, топ комнаты, сезон) остаётся в crew-rooms.js (только участники).
 * Весь пользовательский текст — textContent; права и лимиты проверяет сервер.
 */
import { api } from './api.js';

let D = null;
const st = { team: null, room: null, feed: [], q: '', composeImg: null };
const PUBLIC_KEY = 'pitlane-team-public-v1';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
}
function btn(cls, text, on) { const b = el('button', cls, text); b.type = 'button'; if (on) b.addEventListener('click', on); return b; }
function body() { return document.getElementById('teamBody'); }
function render(nodes) { const b = body(); if (!b) return; b.replaceChildren(...nodes.filter(Boolean)); const s = document.querySelector('#teamSheet .team-inner'); if (s) s.scrollTop = 0; }
function openSheet() { const s = document.getElementById('teamSheet'); if (!s) return; s.classList.remove('hidden'); s.setAttribute('aria-hidden', 'false'); try { D.onSheet?.(); } catch (_) {} }
function closeSheet() { const s = document.getElementById('teamSheet'); if (!s) return; s.classList.add('hidden'); s.setAttribute('aria-hidden', 'true'); }
function loggedIn() { try { return !!D.isAuthed(); } catch (_) { return false; } }
function fmtAgo(at) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s / 60) + ' мин назад';
  if (s < 86400) return Math.floor(s / 3600) + ' ч назад';
  return new Date(at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function fmtDelta(ms) { return Number.isFinite(ms) ? (Math.abs(ms) / 1000).toFixed(3) : ''; }
function trackName(id) { try { return D.tracks().find((t) => t.id === id)?.name || id; } catch (_) { return id; } }

/** Rooms where my laps are marked public (auto-posts in the team feed). */
export function teamLapsPublic(roomId) {
  try { return (JSON.parse(localStorage.getItem(PUBLIC_KEY) || '[]') || []).includes(roomId); } catch (_) { return false; }
}
export function setTeamLapsPublic(roomId, on) {
  try {
    let a = JSON.parse(localStorage.getItem(PUBLIC_KEY) || '[]'); if (!Array.isArray(a)) a = [];
    a = a.filter((x) => x !== roomId); if (on) a.push(roomId);
    localStorage.setItem(PUBLIC_KEY, JSON.stringify(a.slice(-40)));
  } catch (_) {}
}

function avatar(team, size = 'm') {
  const w = el('div', 'team-ava team-ava-' + size);
  const url = team.avatarV ? api.teamAvatarUrl(team.id, team.avatarV) : '';
  if (url) {
    const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.src = url;
    img.addEventListener('error', () => { img.remove(); w.textContent = initials(team.name); });
    w.appendChild(img);
  } else w.textContent = initials(team.name);
  return w;
}
function initials(name) {
  const p = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
}
function head(title, sub) {
  const h = el('header', 'race-sheet-head');
  h.appendChild(el('div', 'race-sheet-handle'));
  h.appendChild(el('h2', 'race-sheet-title', title));
  if (sub) h.appendChild(el('p', 'race-sheet-sub', sub));
  return h;
}

/* ——— image compression (client): same limit as profile banners, ≤150 KB webp/jpeg ——— */
async function compressImage(file, { square = false, sizes = [1280, 960, 720] } = {}) {
  if (!file || !/^image\//.test(file.type)) throw new Error('нужно фото');
  if (file.size > 20 * 1024 * 1024) throw new Error('файл больше 20 МБ');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('не открылось')); im.src = url; });
    const sw = img.naturalWidth; const sh = img.naturalHeight;
    if (sw < 64 || sh < 64) throw new Error('слишком маленькое фото');
    let sx = 0; let sy = 0; let cw = sw; let ch = sh;
    if (square) { const s = Math.min(sw, sh); sx = Math.round((sw - s) / 2); sy = Math.round((sh - s) / 2); cw = ch = s; }
    const LIMIT = 150 * 1024;
    for (const W of sizes) {
      const k = Math.min(1, W / Math.max(cw, ch));
      const w = Math.round(cw * k); const hh = Math.round(ch * k);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
      const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, cw, ch, 0, 0, w, hh);
      for (const q of [0.86, 0.78, 0.7, 0.6, 0.5]) {
        let blob = await new Promise((r) => cv.toBlob(r, 'image/webp', q));
        if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', q));
        if (blob && blob.size <= LIMIT) return await new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(blob); });
      }
    }
    throw new Error('не удалось сжать до 150 КБ');
  } finally { URL.revokeObjectURL(url); }
}
function filePicker(onFile) {
  const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.className = 'hidden';
  inp.addEventListener('change', () => { const f = inp.files?.[0]; inp.value = ''; if (f) onFile(f); });
  return inp;
}

/* ——— list / search ——— */
export async function openTeamsList() {
  openSheet();
  const search = el('input', 'room-input team-search'); search.type = 'search'; search.maxLength = 40; search.placeholder = 'поиск команды'; search.value = st.q;
  const mine = el('div', 'team-mine');
  const list = el('ul', 'team-list race-list');
  const run = async () => {
    st.q = search.value.trim();
    list.replaceChildren(el('li', 'room-empty', 'Загрузка…'));
    const r = await api.listTeams(st.q);
    const rows = r?.teams || [];
    list.replaceChildren();
    if (!rows.length) { list.appendChild(el('li', 'room-empty', st.q ? 'Ничего не нашли' : 'Пока ни одной команды — собери первую')); return; }
    rows.forEach((t) => list.appendChild(teamRow(t)));
  };
  let tmr = 0;
  search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(run, 300); });
  render([
    head('Команды', 'Публичные страницы: профиль и лента. Дуэли, топ и сезон — только внутри'),
    search,
    mine,
    el('h3', 'race-list-title', 'Все команды'),
    list,
    btn('go-btn race-cta', 'Собрать команду', () => { closeSheet(); D.openRooms(); }),
  ]);
  void run();
  if (loggedIn()) {
    const my = await api.listRooms();
    if (Array.isArray(my) && my.length) {
      mine.append(el('h3', 'race-list-title', 'Мои команды'));
      const ul = el('ul', 'team-list race-list');
      my.forEach((t) => ul.appendChild(teamRow({ ...t, about: t.role === 'captain' ? 'ты капитан' : 'участник' })));
      mine.appendChild(ul);
    }
  }
}
function teamRow(t) {
  const li = el('li', 'team-row'); li.tabIndex = 0;
  li.appendChild(avatar(t, 's'));
  const main = el('div', 'team-row-main');
  main.appendChild(el('b', '', t.name));
  main.appendChild(el('small', '', (t.memberCount || 0) + ' в команде' + (t.about ? ' · ' + t.about : '')));
  li.appendChild(main);
  li.addEventListener('click', () => void openTeamPage(t.id));
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter') void openTeamPage(t.id); });
  return li;
}

/* ——— public page ——— */
export async function openTeamPage(id) {
  openSheet();
  render([head('Команда', ''), el('p', 'room-empty', 'Загрузка…')]);
  const t = await api.getTeam(id);
  if (!t || t.ok === false) { render([head('Команда', ''), el('p', 'room-empty', 'Команда не найдена.'), btn('btn-secondary', 'Все команды', () => void openTeamsList())]); return; }
  st.team = t;
  const hero = el('section', 'team-hero');
  hero.appendChild(avatar(t, 'l'));
  hero.appendChild(el('h2', 'team-name', t.name));
  hero.appendChild(el('p', 'team-count', t.memberCount + ' в команде'));
  if (t.about) hero.appendChild(el('p', 'team-about', t.about));
  const mem = el('div', 'room-members team-members');
  t.members.forEach((m) => { const c = el('span', 'room-member' + (m.role === 'captain' ? ' cap' : ''), m.nick); c.title = m.role === 'captain' ? 'капитан' : 'участник'; mem.appendChild(c); });
  hero.appendChild(mem);
  const acts = el('div', 'team-actions');
  const msg = el('p', 'tiny room-msg');
  if (t.viewer.member) {
    acts.appendChild(btn('go-btn race-cta', 'Внутри: дуэли, топ, сезон', () => { closeSheet(); D.openRooms({ roomId: t.id }); }));
    if (t.viewer.role === 'captain') acts.appendChild(btn('btn-secondary', 'Редактировать', () => void openTeamEditor(t.id)));
  } else if (t.viewer.requested) {
    acts.appendChild(btn('btn-secondary', 'Заявка отправлена · отменить', async () => { await api.cancelTeamRequest(t.id); void openTeamPage(t.id); }));
  } else {
    acts.appendChild(btn('go-btn race-cta', 'Попроситься', async (e) => {
      if (!loggedIn()) { msg.textContent = 'Войди через Telegram в «Профиле», чтобы попроситься'; return; }
      const b = e.currentTarget; b.disabled = true;
      const r = await api.requestTeam(t.id, '');
      if (!r || r.ok === false) { b.disabled = false; msg.textContent = r?.status === 429 ? 'Слишком часто — попробуй позже' : r?.error === 'room full' ? 'В команде нет мест' : 'Не вышло: ' + (r?.error || 'сеть'); return; }
      void openTeamPage(t.id);
    }));
    acts.appendChild(el('p', 'tiny muted', 'Есть код приглашения? Вступай сразу в «Командах» → «Собрать команду» → «Вступить».'));
  }
  acts.appendChild(btn('btn-ghost team-share', 'Поделиться страницей', () => D.share('team_' + t.id, D.teamLink(t.id), 'Команда «' + t.name + '» в PITLANE')));
  hero.append(acts, msg);
  const feedWrap = el('section', 'team-feed');
  feedWrap.appendChild(el('h3', 'race-list-title', 'Лента'));
  if (t.viewer.member) feedWrap.appendChild(composer(t));
  const ul = el('ul', 'team-posts');
  feedWrap.appendChild(ul);
  render([head(t.name, 'Публичная страница команды'), hero, feedWrap, btn('btn-ghost team-back', '← Все команды', () => void openTeamsList())]);
  await loadFeed(t, ul);
}

async function loadFeed(t, ul, before) {
  const r = await api.teamFeed(t.id, before);
  const posts = r?.posts || [];
  if (!before) ul.replaceChildren();
  if (!posts.length && !before) { ul.appendChild(el('li', 'room-empty', 'В ленте пока тихо.')); return; }
  posts.forEach((p) => ul.appendChild(postRow(t, p)));
  if (r?.more) {
    const more = el('li', 'team-more');
    more.appendChild(btn('btn-ghost', 'Показать ещё', () => { more.remove(); void loadFeed(t, ul, posts[posts.length - 1].at); }));
    ul.appendChild(more);
  }
}

function postRow(t, p) {
  const li = el('li', 'team-post' + (p.kind !== 'post' ? ' auto ' + p.kind : ''));
  li.dataset.postId = p.id;
  const top = el('div', 'team-post-head');
  top.appendChild(el('b', 'team-post-who', p.nick));
  if (p.role === 'captain') top.appendChild(el('span', 'team-post-role', 'капитан'));
  top.appendChild(el('span', 'team-post-at', fmtAgo(p.at)));
  li.appendChild(top);
  if (p.kind === 'best' && p.meta) {
    const c = el('div', 'team-auto');
    c.appendChild(el('span', 'team-auto-k', 'Новый лучший круг'));
    c.appendChild(el('b', 'team-auto-t', p.meta.t));
    c.appendChild(el('span', 'team-auto-sub', trackName(p.meta.trackId) + ' · ' + p.meta.model + ' · ' + p.meta.tyre));
    if (p.meta.prevNick && Number.isFinite(p.meta.delta)) c.appendChild(el('span', 'team-auto-gap', 'прежний рекорд: ' + p.meta.prevNick + ' · −' + fmtDelta(p.meta.delta)));
    li.appendChild(c);
  } else if (p.kind === 'duel' && p.meta) {
    const c = el('div', 'team-auto');
    c.appendChild(el('span', 'team-auto-k', 'Выиграл дуэль'));
    c.appendChild(el('b', 'team-auto-t', p.meta.t + '  vs  ' + p.meta.vsT));
    c.appendChild(el('span', 'team-auto-sub', 'соперник: ' + p.meta.vsNick + ' · ' + trackName(p.meta.trackId) + ' · ' + fmtDelta(p.meta.delta) + ' с'));
    li.appendChild(c);
  }
  if (p.text) li.appendChild(el('p', 'team-post-text', p.text));
  if (p.img) {
    const img = el('img', 'team-post-img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.src = api.teamImgUrl(t.id, p.id);
    li.appendChild(img);
  }
  const foot = el('div', 'team-post-foot');
  if (p.canDelete) foot.appendChild(btn('room-link danger', 'удалить', async () => {
    if (!confirm('Удалить пост?')) return;
    const r = await api.deleteTeamPost(t.id, p.id);
    if (r && r.ok !== false) li.remove();
  }));
  if (!p.mine) foot.appendChild(btn('room-link muted', 'пожаловаться', () => D.report(`Жалоба на пост в команде «${t.name}» (team ${t.id}, post ${p.id}, автор ${p.nick}): `)));
  li.appendChild(foot);
  return li;
}

function composer(t) {
  const box = el('div', 'team-compose');
  const ta = el('textarea', 'team-compose-text'); ta.maxLength = 600; ta.rows = 3; ta.placeholder = 'Новость команды: трек-день, сбор, итоги…';
  const cnt = el('span', 'team-compose-cnt', '0/600');
  ta.addEventListener('input', () => { cnt.textContent = ta.value.length + '/600'; });
  const prev = el('div', 'team-compose-prev');
  const msg = el('p', 'tiny room-msg');
  st.composeImg = null;
  const pick = filePicker(async (f) => {
    msg.textContent = 'сжимаю фото…';
    try {
      st.composeImg = await compressImage(f);
      prev.replaceChildren();
      const im = el('img'); im.alt = ''; im.src = st.composeImg; prev.appendChild(im);
      prev.appendChild(btn('room-link', 'убрать', () => { st.composeImg = null; prev.replaceChildren(); }));
      msg.textContent = '';
    } catch (e) { msg.textContent = String(e?.message || e); }
  });
  const row = el('div', 'team-compose-row');
  row.append(btn('btn-ghost team-photo', 'Фото', () => pick.click()), cnt, btn('go-btn team-post-btn', 'Опубликовать', async (e) => {
    const text = ta.value.trim();
    if (!text && !st.composeImg) { msg.textContent = 'Напиши текст или добавь фото'; return; }
    const b = e.currentTarget; b.disabled = true; msg.textContent = 'публикую…';
    const r = await api.postTeam(t.id, { text, image: st.composeImg || undefined });
    b.disabled = false;
    if (!r || r.ok === false) { msg.textContent = r?.status === 429 ? 'Лимит постов на сегодня' : r?.error === 'no phone numbers' ? 'Без номеров телефонов' : 'Не вышло: ' + (r?.error || 'сеть'); return; }
    ta.value = ''; cnt.textContent = '0/600'; st.composeImg = null; prev.replaceChildren(); msg.textContent = '';
    const ul = box.parentElement?.querySelector('.team-posts');
    if (ul) { ul.querySelector('.room-empty')?.remove(); ul.prepend(postRow(t, r.post)); }
  }));
  box.append(ta, prev, row, msg, pick);
  return box;
}

/* ——— captain editor ——— */
export async function openTeamEditor(id) {
  openSheet();
  const [t, room] = await Promise.all([api.getTeam(id), api.getRoom(id)]);
  if (!t || t.ok === false || !room || room.ok === false || room.role !== 'captain') { render([head('Редактор', ''), el('p', 'room-empty', 'Редактировать может только капитан.'), btn('btn-secondary', 'Назад', () => void openTeamPage(id))]); return; }
  const msg = el('p', 'tiny room-msg');
  const avaBox = el('div', 'team-ed-ava');
  const drawAva = (tt) => { avaBox.replaceChildren(avatar(tt, 'l')); };
  drawAva(t);
  const pick = filePicker(async (f) => {
    msg.textContent = 'сжимаю…';
    try {
      const data = await compressImage(f, { square: true, sizes: [512, 384, 256] });
      msg.textContent = 'загружаю…';
      const r = await api.setTeamAvatar(id, data);
      if (!r || r.ok === false) { msg.textContent = 'Не загрузилось: ' + (r?.error || 'сеть'); return; }
      drawAva(r); msg.textContent = 'Аватар обновлён';
    } catch (e) { msg.textContent = String(e?.message || e); }
  });
  const avaRow = el('div', 'team-ed-ava-row');
  avaRow.append(avaBox, btn('btn-secondary', 'Загрузить фото', () => pick.click()), pick);
  if (t.avatarV) avaRow.appendChild(btn('room-link danger', 'убрать', async () => { const r = await api.setTeamAvatar(id, null); if (r && r.ok !== false) drawAva(r); }));
  const name = el('input', 'room-input'); name.maxLength = 48; name.value = t.name;
  const about = el('textarea', 'room-input team-about-in'); about.maxLength = 280; about.rows = 4; about.value = t.about || ''; about.placeholder = 'О команде: на чём ездите, где, когда';
  const aboutCnt = el('span', 'team-compose-cnt', about.value.length + '/280');
  about.addEventListener('input', () => { aboutCnt.textContent = about.value.length + '/280'; });
  const listed = el('label', 'room-active');
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = t.listed !== false;
  listed.append(cb, el('span', '', 'Показывать в списке команд'));
  const save = btn('go-btn race-cta', 'Сохранить', async () => {
    save.disabled = true;
    const r = await api.updateTeam(id, { name: name.value.trim(), about: about.value, listed: cb.checked });
    save.disabled = false;
    if (!r || r.ok === false) { msg.textContent = r?.error === 'no phone numbers' ? 'Без номеров телефонов' : 'Не сохранилось: ' + (r?.error || 'сеть'); return; }
    msg.textContent = 'Сохранено';
    D.hap?.(12);
  });
  const lab = (t2, ...n) => { const l = el('label', 'crew-field', t2); l.append(...n); return l; };
  // requests
  const reqs = el('ul', 'team-reqs race-list');
  (room.requests || []).forEach((rq) => {
    const li = el('li', 'team-req');
    const m = el('div', 'team-row-main'); m.append(el('b', '', rq.nick), el('small', '', fmtAgo(rq.at) + (rq.note ? ' · ' + rq.note : '')));
    li.append(m,
      btn('btn-secondary', 'Принять', async () => { const r = await api.teamRequestAct(id, rq.id, 'approve'); if (r && r.ok !== false) li.remove(); else msg.textContent = 'Не вышло: ' + (r?.error || 'сеть'); }),
      btn('room-link muted', 'отклонить', async () => { const r = await api.teamRequestAct(id, rq.id, 'decline'); if (r && r.ok !== false) li.remove(); }));
    reqs.appendChild(li);
  });
  const mems = el('ul', 'team-reqs race-list');
  (room.members || []).forEach((mm) => {
    const li = el('li', 'team-req');
    const m = el('div', 'team-row-main'); m.append(el('b', '', mm.nick), el('small', '', mm.role === 'captain' ? 'капитан' : 'участник'));
    li.appendChild(m);
    if (mm.role !== 'captain' && mm.pilotId) {
      li.appendChild(btn('room-link', 'сделать капитаном', async () => { if (!confirm('Передать капитанство ' + mm.nick + '?')) return; const r = await api.teamMemberAct(id, mm.pilotId, 'captain'); if (r && r.ok !== false) void openTeamPage(id); }));
      li.appendChild(btn('room-link danger', 'убрать', async () => { if (!confirm('Убрать ' + mm.nick + ' из команды?')) return; const r = await api.teamMemberAct(id, mm.pilotId, 'remove'); if (r && r.ok !== false) li.remove(); }));
    }
    mems.appendChild(li);
  });
  render([
    head('Редактор команды', 'Аватар, описание и состав — только капитан'),
    avaRow,
    lab('Название', name),
    lab('Описание', about, aboutCnt),
    listed,
    save, msg,
    el('h3', 'race-list-title', 'Заявки' + ((room.requests || []).length ? ' · ' + room.requests.length : '')),
    (room.requests || []).length ? reqs : el('p', 'room-empty', 'Новых заявок нет.'),
    el('h3', 'race-list-title', 'Состав'),
    mems,
    btn('btn-ghost team-back', '← К странице команды', () => void openTeamPage(id)),
  ]);
}

export function initTeams(deps) {
  D = deps;
  document.getElementById('teamSheetClose')?.addEventListener('click', closeSheet);
  document.getElementById('teamSheet')?.addEventListener('click', (e) => { if (e.target?.id === 'teamSheet') closeSheet(); });
  try { window.__plTeams = { list: openTeamsList, page: openTeamPage, editor: openTeamEditor, state: () => ({ team: st.team?.id || null }) }; } catch (_) {}
}
