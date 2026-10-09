/**
 * v115: музыка в профиле (как в Telegram). Треки добавляются пересылкой аудио боту; здесь — плашки
 * (обложка, название, исполнитель, play/pause), порядок и удаление. Один общий <audio>, без автоплея.
 * Файлы играют через стрим-прокси Worker (/music/<pid>/<tid>/audio) — токен бота клиенту не нужен.
 * Весь пользовательский текст → textContent.
 */
import { api } from './api.js';
import { WebApp, isTMA } from './tma.js';

const BOT_FALLBACK = 'pitlane_official_bot';
let player = null;
let playing = null; // { key, btn }

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
}
function fmtDur(s) {
  s = Number(s);
  if (!Number.isFinite(s) || s <= 0) return '';
  return Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
}
function setBtn(btn, on) {
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-label', on ? 'Пауза' : 'Слушать');
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function stopAll() {
  if (playing) setBtn(playing.btn, false);
  playing = null;
  try { player?.pause(); } catch (_) {}
}
function toggle(pid, t, btn, row) {
  const key = pid + '/' + t.id;
  if (!player) {
    player = new Audio();
    player.preload = 'none';
    player.addEventListener('ended', () => stopAll());
    player.addEventListener('error', () => {
      if (!playing) return;
      const r = playing.btn.closest('.mu-row');
      r?.querySelector('.mu-err')?.classList.remove('hidden');
      stopAll();
    });
  }
  if (playing && playing.key === key) {
    if (player.paused) { void player.play().catch(() => {}); setBtn(btn, true); }
    else { player.pause(); setBtn(btn, false); }
    return;
  }
  stopAll();
  row.querySelector('.mu-err')?.classList.add('hidden');
  player.src = api.musicUrl(pid, t.id, 'audio');
  playing = { key, btn };
  setBtn(btn, true);
  void player.play().catch(() => {
    if (playing?.key === key) stopAll();
  });
}

function trackRow(pid, t, i, n, own, onAct) {
  const row = el('li', 'mu-row');
  const cov = el('span', 'mu-cover');
  if (t.cover) {
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = api.musicUrl(pid, t.id, 'cover');
    img.addEventListener('error', () => img.remove());
    cov.appendChild(img);
  }
  row.appendChild(cov);
  const meta = el('span', 'mu-meta');
  meta.appendChild(el('b', 'mu-title', t.title || 'Без названия'));
  meta.appendChild(el('span', 'mu-sub', [t.performer, fmtDur(t.dur)].filter(Boolean).join(' · ') || 'исполнитель не указан'));
  meta.appendChild(el('span', 'mu-err hidden', 'не удалось воспроизвести — попробуй позже'));
  row.appendChild(meta);
  if (own) {
    const ctl = el('span', 'mu-ctl');
    const mk = (cls, label, act, dis) => {
      const b = el('button', 'mu-mini ' + cls);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.title = label;
      b.disabled = !!dis;
      b.addEventListener('click', () => onAct(act, t.id, i));
      ctl.appendChild(b);
    };
    mk('mu-up', 'Выше', 'up', i === 0);
    mk('mu-down', 'Ниже', 'down', i === n - 1);
    mk('mu-del', 'Удалить трек', 'del');
    row.appendChild(ctl);
  }
  const play = el('button', 'mu-play');
  play.type = 'button';
  setBtn(play, !!(playing && playing.key === pid + '/' + t.id && player && !player.paused));
  if (playing && playing.key === pid + '/' + t.id) playing.btn = play;
  play.addEventListener('click', () => toggle(pid, t, play, row));
  row.appendChild(play);
  return row;
}

/** Plaques for a public profile (read-only). Returns a <ul> or null when empty. */
export function musicList(pid, tracks) {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const ul = el('ul', 'mu-list');
  tracks.forEach((t, i) => ul.appendChild(trackRow(pid, t, i, tracks.length, false)));
  return ul;
}

function openBot(bot) {
  const url = 'https://t.me/' + (bot || BOT_FALLBACK) + '?start=music';
  try {
    if (isTMA && WebApp?.openTelegramLink) { WebApp.openTelegramLink(url); return; }
  } catch (_) {}
  window.open(url, '_blank', 'noopener');
}

/** Own profile card (#accMusic). */
export async function renderMyMusic(pid) {
  const card = document.getElementById('accMusic');
  if (!card) return;
  const list = card.querySelector('[data-mu-list]');
  const hint = card.querySelector('[data-mu-hint]');
  const add = card.querySelector('[data-mu-add]');
  if (!pid) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const r = await api.myMusic();
  if (!r || r.ok === false) {
    list.replaceChildren();
    hint.textContent = r && r.status === 401 ? 'Войди, чтобы добавить музыку в профиль.' : 'Музыка сейчас не загрузилась — проверь связь.';
    add.classList.add('hidden');
    return;
  }
  const tracks = r.tracks || [];
  const max = r.max || 3;
  const draw = (ts) => {
    list.replaceChildren(...ts.map((t, i) => trackRow(pid, t, i, ts.length, true, onAct)));
    hint.textContent = ts.length
      ? (ts.length >= max ? `${ts.length}/${max} — чтобы добавить новый, удали один.` : `${ts.length}/${max} · перешли боту ещё аудио, чтобы добавить.`)
      : 'Пока пусто. Нажми «Добавить трек» и перешли аудио боту — до 3 треков, файл до 20 МБ.';
    add.classList.toggle('hidden', ts.length >= max);
  };
  let cur = tracks.slice();
  async function onAct(act, id, i) {
    let res = null;
    if (act === 'del') {
      if (playing && playing.key === pid + '/' + id) stopAll();
      res = await api.delMusic(id);
    } else {
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= cur.length) return;
      const ids = cur.map((t) => t.id);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      res = await api.orderMusic(ids);
    }
    if (res && res.ok && Array.isArray(res.tracks)) { cur = res.tracks; draw(cur); }
    else hint.textContent = res && res.status === 429 ? 'Слишком часто — подожди немного.' : 'Не получилось — попробуй ещё раз.';
  }
  add.onclick = () => openBot(r.bot);
  draw(cur);
}

/** Re-check the list when the user comes back from the bot chat. */
export function initMusic(getPid) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!document.getElementById('view-account')?.classList.contains('active')) return;
    const pid = getPid();
    if (pid) void renderMyMusic(pid);
  });
}
export function stopMusic() { stopAll(); }
