/** Shared API: remote Worker when configured, else localStorage fallback. */
const API_KEY = 'pitlane-api-v1';
const TOKEN_KEY = 'pitlane-token-v1';

export function apiBase() {
  try {
    const meta = document.querySelector('meta[name="pitlane-api"]');
    const fromMeta = meta?.content?.trim();
    if (fromMeta) return fromMeta.replace(/\/+$/, '');
    if (typeof window !== 'undefined' && window.PITLANE_API) {
      return String(window.PITLANE_API).replace(/\/+$/, '');
    }
  } catch (_) {}
  return '';
}

export function getSessionToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch (_) {
    return '';
  }
}

/* v104: короткий access-токен + одноразовый refresh (httpOnly-cookie между github.io и workers.dev
 * невозможна: кросс-сайт, Safari/Telegram режут сторонние cookie). */
const REFRESH_KEY = 'pitlane-refresh-v1';
export function setSessionToken(token, refreshToken) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, String(token));
    else localStorage.removeItem(TOKEN_KEY);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, String(refreshToken));
    else if (!token || refreshToken === null) localStorage.removeItem(REFRESH_KEY);
  } catch (_) {}
}
export function getRefreshToken() {
  try { return localStorage.getItem(REFRESH_KEY) || ''; } catch (_) { return ''; }
}

let _refreshing = null;
/** Обмен refresh → новая пара. true — сессия продлена; false — сессии больше нет (локальные данные целы). */
async function refreshSession() {
  const rt = getRefreshToken();
  const base = apiBase();
  if (!rt || !base) return false;
  if (!_refreshing) {
    _refreshing = (async () => {
      try {
        const res = await fetch(base + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
        const d = await res.json().catch(() => ({}));
        if (res.ok && d.token) { setSessionToken(d.token, d.refreshToken); return true; }
        if (res.status === 401) {
          setSessionToken('', null);
          try { window.dispatchEvent(new CustomEvent('pitlane:session-lost')); } catch (_) {}
        }
        return false;
      } catch (_) { return false; } finally { setTimeout(() => { _refreshing = null; }, 0); }
    })();
  }
  return _refreshing;
}

/** fetch с Bearer; на 401 session_expired — один раз обновляем сессию и повторяем. */
async function authedFetch(url, opts) {
  let res = await fetch(url, { ...opts, headers: { ...pilotHeaders(), ...(opts.headers || {}) } });
  if (res.status === 401 && getRefreshToken()) {
    const d = await res.clone().json().catch(() => null);
    if (d && d.code === 'session_expired' && await refreshSession()) {
      res = await fetch(url, { ...opts, headers: { ...pilotHeaders(), ...(opts.headers || {}) } });
    }
  }
  return res;
}

function devicePilotId() {
  try {
    let id = localStorage.getItem('pitlane-device-v1');
    if (!id) {
      let rnd = '';
      try {
        const a = new Uint8Array(12);
        crypto.getRandomValues(a);
        rnd = [...a].map((b) => (b % 36).toString(36)).join('');
      } catch (_) { rnd = Math.random().toString(36).slice(2, 10); }
      id = 'dev_' + Date.now().toString(36) + rnd;
      localStorage.setItem('pitlane-device-v1', id);
    }
    return id;
  } catch (_) {
    return 'dev_anon';
  }
}

/** Opaque account id (p_<uuid>) of the logged-in pilot, or '' (never a phone number). */
export function accountPilotId() {
  try {
    const auth = JSON.parse(localStorage.getItem('pitlane-auth-v2') || localStorage.getItem('pitlane-auth-v1') || '{}');
    const sid = String(auth.session || '');
    return /^p_[0-9a-f-]{36}$/.test(sid) ? sid : '';
  } catch (_) {
    return '';
  }
}

/**
 * v80: the Worker never publishes raw guest device ids (they act as the guest's credential) — public
 * rows carry g_<sha256('pitlane-guest:'+deviceId)[0..16]>. Precompute ours so UI can recognise own rows.
 */
let _guestPub = '';
async function _computeGuestPub() {
  try {
    const id = devicePilotId();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pitlane-guest:' + id));
    _guestPub = 'g_' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  } catch (_) { _guestPub = ''; }
}
void _computeGuestPub();

/** True when a public pilot id (account uuid, raw device id or its g_ hash) is the current pilot. */
export function isMyPilotId(id) {
  if (!id) return false;
  const acc = accountPilotId();
  if (acc && id === acc) return true;
  if (acc) return false;
  return id === devicePilotId() || (!!_guestPub && id === _guestPub);
}

/** Id used for duels / crews: account uuid when logged in, else the device guest id. */
export function actingPilotId() {
  return accountPilotId() || devicePilotId();
}

const DEVICE_KEY = 'pitlane-device-v1';
function pilotHeaders() {
  const h = { 'Content-Type': 'application/json' };
  try {
    // v104: автор — только сессия (Bearer). Гостевой X-Pilot-Id больше не отправляется.
    const token = getSessionToken();
    if (token && !token.startsWith('local-')) h['Authorization'] = 'Bearer ' + token;
  } catch (_) {}
  // v107: случайный id устройства (не отпечаток железа) — сервер хранит только его хэш для антифрода
  try {
    let dev = localStorage.getItem(DEVICE_KEY);
    if (!dev || !/^[A-Za-z0-9_-]{8,80}$/.test(dev)) {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      dev = 'd' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_KEY, dev);
    }
    h['X-Device'] = dev;
  } catch (_) {}
  return h;
}

async function remote(path, opts = {}) {
  const base = apiBase();
  if (!base) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await authedFetch(base + path, { ...opts, signal: ctrl.signal });
    if (!res.ok) {
      let errBody = null;
      try { errBody = await res.json(); } catch (_) {}
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      err.body = errBody;
      throw err;
    }
    return await res.json();
  } catch (err) {
    console.warn('pitlane api remote fail', path, err);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Like remote but returns { ok:false, error, ...body, status } on HTTP errors instead of null. */
async function remoteKeep(path, opts = {}) {
  const base = apiBase();
  if (!base) return null;
  const ctrl = new AbortController();
  const { timeoutMs, ...fetchOpts } = opts;
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
  try {
    const res = await authedFetch(base + path, { ...fetchOpts, headers: opts.headers || {}, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.error || ('HTTP ' + res.status), ...data };
    }
    return data;
  } catch (err) {
    console.warn('pitlane api remoteKeep fail', path, err);
    return { ok: false, error: String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}

function db() {
  try {
    const raw = JSON.parse(localStorage.getItem(API_KEY));
    if (!raw) return seed();
    const dump = JSON.stringify(raw);
    if (dump.includes('Иванченко') || dump.includes('Олег Сергеевич')) return seed();
    return raw;
  } catch {
    return seed();
  }
}
function saveDb(d) {
  localStorage.setItem(API_KEY, JSON.stringify(d));
}
function seed() {
  const d = { topsStraight: {}, topsLap: {}, pulse: [], shares: {}, garage: null };
  saveDb(d);
  return d;
}

/** GPS + valid: false drops; teleport flags drop */
function isValidGpsRow(r) {
  if (!r || !r.gps || r.valid === false) return false;
  if (Array.isArray(r.flags) && r.flags.includes('teleport')) return false;
  return true;
}

function localListStraight(carId) {
  const d = db();
  return (d.topsStraight[carId] || []).filter(isValidGpsRow).slice().sort((a, b) => a.t - b.t);
}
function localListLap(trackId) {
  const d = db();
  return (d.topsLap[trackId] || []).filter(isValidGpsRow).slice();
}
function localListPulse() {
  const d = db();
  d.pulse = d.pulse || [];
  return d.pulse.slice().sort((a, b) => b.at - a.at);
}

function localCreateShare(payload) {
  const d = db();
  d.shares = d.shares || {};
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  d.shares[id] = { payload, at: Date.now() };
  const keys = Object.keys(d.shares);
  if (keys.length > 50) {
    keys
      .sort((a, b) => (d.shares[a].at || 0) - (d.shares[b].at || 0))
      .slice(0, keys.length - 50)
      .forEach((k) => delete d.shares[k]);
  }
  saveDb(d);
  return { id };
}

function localGetShare(id) {
  const d = db();
  const row = (d.shares || {})[id];
  return row ? row.payload : null;
}

export const api = {
  async listStraight(carId) {
    const remoteRows = await remote('/tops/straight/' + encodeURIComponent(carId));
    if (Array.isArray(remoteRows)) return remoteRows.filter(isValidGpsRow).slice().sort((a, b) => a.t - b.t);
    return []; // v104: без сервера топа нет (локальные строки не выдаём за топ)
  },
  async listLap(trackId, weather) {
    let path = '/tops/lap/' + encodeURIComponent(trackId);
    if (weather === 'dry' || weather === 'damp' || weather === 'wet') {
      path += '?weather=' + encodeURIComponent(weather);
    }
    const remoteRows = await remote(path);
    if (Array.isArray(remoteRows)) {
      let rows = remoteRows.filter(isValidGpsRow).slice();
      if (weather === 'dry' || weather === 'damp' || weather === 'wet') {
        rows = rows.filter((r) => r && r.weather === weather);
      }
      return rows;
    }
    return []; // v104: без сервера топа нет
  },
  /**
   * v104: в топ пишет только сервер — время, A/B и флаги он пересчитывает по сырому треку (row.trace).
   * Ответ: массив строк топа (принято) | { ok:false, code } (отказ с кодом причины). Локального «топа» нет.
   */
  async addStraight(carId, row) {
    if (!apiBase()) return { ok: false, code: 'offline' };
    const r = await remoteKeep('/tops/straight/' + encodeURIComponent(carId), { method: 'POST', body: JSON.stringify({ ...row, gps: true }), timeoutMs: 20000 });
    return r;
  },
  /** v131: подписки на пилота / команду */
  async getFollows() {
    if (!apiBase() || !getSessionToken()) return null;
    const r = await remote('/me/follows');
    return r && r.ok ? r : null;
  },
  async setFollow(kind, id, on) {
    if (!apiBase()) return { ok: false, code: 'offline' };
    return remoteKeep('/follow', { method: 'POST', body: JSON.stringify({ kind, id, on: !!on }) });
  },
  /** v129: история трассы своего пилота (место, срез машины, лучший сектор, свои круги) — только вошедшим */
  async trackHistory(trackId) {
    if (!apiBase() || !getSessionToken()) return null;
    const r = await remote('/tops/lap/' + encodeURIComponent(trackId) + '/me');
    return r && r.ok ? r : null;
  },
  async addLap(trackId, row) {
    if (!apiBase()) return { ok: false, code: 'offline' };
    return remoteKeep('/tops/lap/' + encodeURIComponent(trackId), { method: 'POST', body: JSON.stringify({ ...row, gps: true }), timeoutMs: 20000 });
  },
  /** v125: свежие посты без картинок (превью чата на Главной); локально — свои посты */
  async listPulseRecent() {
    const rows = await remote('/pulse?recent=1');
    if (Array.isArray(rows)) return rows.slice(0, 12).map((p) => ({ ...p, img: null }));
    return localListPulse().slice(0, 12);
  },
  async listPulse() {
    const remoteRows = await remote('/pulse');
    if (Array.isArray(remoteRows)) return remoteRows;
    return localListPulse();
  },
  async addPulse(row) {
    const remoteRows = await remote('/pulse', { method: 'POST', body: JSON.stringify(row) });
    if (Array.isArray(remoteRows)) return remoteRows;
    const d = db();
    d.pulse = d.pulse || [];
    d.pulse.unshift(row);
    d.pulse = d.pulse.slice(0, 200);
    saveDb(d);
    return localListPulse();
  },
  /** v83: like toggle with explicit desired state → { ok, id, likeCount, liked } | { ok:false, status, error }. */
  async likePulse(id, liked) {
    if (!apiBase()) return { ok: false, error: 'offline' };
    const body = typeof liked === 'boolean' ? { liked } : {};
    return remoteKeep('/pulse/' + encodeURIComponent(id) + '/like', { method: 'POST', body: JSON.stringify(body) });
  },
  /** v84: global straight-line board for a discipline (0-100, 100-200, 402m…). */
  async listDrag(disc, { car, weather, cls } = {}) {
    let path = '/tops/drag/' + encodeURIComponent(disc);
    const q = [];
    if (cls === 'c') q.push('cls=c'); // v118: зачёт C (телефон)
    if (car) q.push('car=' + encodeURIComponent(car));
    if (weather === 'dry' || weather === 'damp' || weather === 'wet') q.push('weather=' + weather);
    if (q.length) path += '?' + q.join('&');
    const rows = await remote(path);
    return Array.isArray(rows) ? rows : [];
  },
  async addDrag(disc, row) {
    if (!apiBase()) return { ok: false, error: 'offline' };
    return remoteKeep('/tops/drag/' + encodeURIComponent(disc), { method: 'POST', body: JSON.stringify({ ...row, gps: true }), timeoutMs: 20000 });
  },
  /** v84: lap board with avatars (pilotmeta) for the compact tops list. */
  async listLapBoard(trackId, weather, cls) {
    let path = '/tops/lap/' + encodeURIComponent(trackId) + '?avatars=1' + (cls === 'c' ? '&cls=c' : '');
    if (weather === 'dry' || weather === 'damp' || weather === 'wet') path += '&weather=' + weather;
    const rows = await remote(path);
    return Array.isArray(rows) ? rows : [];
  },
  /** v84: Paddock posts of the last 24 h, most liked first (no images). */
  async listPulseTopDay() {
    const rows = await remote('/pulse?top=day');
    return Array.isArray(rows) ? rows : null;
  },
  /** v83: comments under a Paddock post. */
  async listComments(postId) {
    if (!apiBase()) return { ok: false, error: 'offline' };
    return remoteKeep('/pulse/' + encodeURIComponent(postId) + '/comments');
  },
  async addComment(postId, text) {
    if (!apiBase()) return { ok: false, error: 'offline' };
    return remoteKeep('/pulse/' + encodeURIComponent(postId) + '/comments', { method: 'POST', body: JSON.stringify({ text }) });
  },
  async delComment(postId, commentId) {
    if (!apiBase()) return { ok: false, error: 'offline' };
    return remoteKeep('/pulse/' + encodeURIComponent(postId) + '/comments/' + encodeURIComponent(commentId), { method: 'DELETE' });
  },
  /** v83: public pilot profile (public fields only). */
  async pilotProfile(pilotId) {
    if (!apiBase()) return { ok: false, error: 'offline' };
    return remoteKeep('/pilot/' + encodeURIComponent(pilotId));
  },
  async delPulse(id, who) {
    const base = apiBase();
    if (base) {
      const remoteRows = await remote('/pulse/' + encodeURIComponent(id), { method: 'DELETE' });
      if (Array.isArray(remoteRows)) return remoteRows;
    }
    const d = db();
    d.pulse = (d.pulse || []).filter((x) => !(x.id === id && x.who === who));
    saveDb(d);
    return localListPulse();
  },
  async createShare(payload) {
    const remoteRes = await remote('/share', {
      method: 'POST',
      body: JSON.stringify({ payload }),
    });
    if (remoteRes && remoteRes.id) return remoteRes;
    return localCreateShare(payload);
  },
  /** v114: crews monthly season table (public). */
  async getCrewSeason(month, trackId) {
    const q = new URLSearchParams();
    if (month) q.set('month', month);
    if (trackId) q.set('track', trackId);
    return await remote('/season/crews?' + q.toString());
  },
  /** v112: best real A/B stock row (same model, class «сток») → { best } | null when offline. */
  async getStockRef(kind, ref, carId, model) {
    const q = new URLSearchParams();
    if (carId) q.set('car', carId);
    if (model) q.set('model', String(model).slice(0, 80));
    const r = await remote('/stock/' + (kind === 'lap' ? 'lap' : 'drag') + '/' + encodeURIComponent(ref) + '?' + q.toString());
    return r && !r.error && 'best' in r ? r : null;
  },
  async getShare(id) {
    const remoteRes = await remote('/share/' + encodeURIComponent(id));
    if (remoteRes && !remoteRes.error) return remoteRes;
    return localGetShare(id);
  },
  /** GET /garage → { cars, carId } */
  async getGarage() {
    const remoteRes = await remote('/garage');
    if (remoteRes && Array.isArray(remoteRes.cars)) return remoteRes;
    const d = db();
    return d.garage || { cars: [], carId: null };
  },
  /** PUT /garage { cars, carId } */
  async putGarage(payload) {
    const body = {
      cars: Array.isArray(payload?.cars) ? payload.cars : [],
      carId: payload?.carId || null,
    };
    const remoteRes = await remote('/garage', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (remoteRes && remoteRes.ok) return remoteRes;
    const d = db();
    d.garage = { ...body, at: Date.now() };
    saveDb(d);
    return { ok: true, ...d.garage };
  },

  /* —— v89: ghosts —— */
  async postGhost(body) {
    return await remoteKeep('/ghost', { method: 'POST', body: JSON.stringify(body || {}) });
  },
  async getGhost(id) {
    if (!id) return null;
    const r = await remote('/ghost/' + encodeURIComponent(id));
    return r && r.id ? r : null;
  },
  /** kind 'lap' → ref = trackId; kind 'drag' → '0-100' | '402m' */
  async ghostTop(kind, ref) {
    if (!ref) return null;
    const path = kind === 'drag' ? '/ghosts/top/drag/' + encodeURIComponent(ref) : '/ghosts/top/' + encodeURIComponent(ref);
    return await remote(path);
  },
  /* —— v132: фото своей машины —— */
  async putCarPhoto(body) {
    return await remoteKeep('/me/car-photo', { method: 'PUT', body: JSON.stringify(body || {}), timeoutMs: 25000 });
  },
  async deleteCarPhoto() { return await remoteKeep('/me/car-photo', { method: 'DELETE' }); },
  carPhotoUrl(pilotId, v) {
    const base = apiBase();
    if (!base || !pilotId || !v) return '';
    return base + '/car-photo/' + encodeURIComponent(pilotId) + '?v=' + encodeURIComponent(v);
  },
  /* —— v89: profile banner —— */
  async setBanner(body) {
    return await remoteKeep('/me/banner', { method: 'PUT', body: JSON.stringify(body || {}), timeoutMs: 20000 });
  },
  bannerUrl(pilotId, v) {
    const base = apiBase();
    if (!base || !pilotId) return '';
    return base + '/banner/' + encodeURIComponent(pilotId) + (v ? '?v=' + encodeURIComponent(v) : '');
  },

  /** POST /duel { type, trackId?, createdBy, note?, days?, ghostId? } */
  async createDuel(payload) {
    const body = {
      type: payload?.type === 'lap' ? 'lap' : 'drag',
      trackId: payload?.trackId || undefined,
      createdBy: payload?.createdBy || undefined,
      note: payload?.note || undefined,
      name: payload?.name || payload?.createdBy || undefined,
      days: payload?.days || undefined,
      ghostId: payload?.ghostId || undefined,
      to: payload?.to || undefined, // v121: вызов конкретному пилоту
    };
    const remoteRes = await remote('/duel', { method: 'POST', body: JSON.stringify(body) });
    if (remoteRes && remoteRes.id) {
      try {
        const key = 'pitlane-duels-mine-v1';
        const ids = JSON.parse(localStorage.getItem(key) || '[]');
        const next = [remoteRes.id, ...(Array.isArray(ids) ? ids : [])].filter((x, i, a) => a.indexOf(x) === i).slice(0, 40);
        localStorage.setItem(key, JSON.stringify(next));
      } catch (_) {}
      return remoteRes;
    }
    return null;
  },

  async getDuel(id) {
    if (!id) return null;
    const remoteRes = await remote('/duel/' + encodeURIComponent(id));
    if (remoteRes && remoteRes.id) return remoteRes;
    return null;
  },

  async submitDuelRun(id, run) {
    if (!id) return null;
    return await remoteKeep('/duel/' + encodeURIComponent(id) + '/run', {
      method: 'POST',
      body: JSON.stringify(run || {}),
    });
  },

  async listMyDuels(mineId) {
    const id = (mineId && !/^\+?\d{10,15}$/.test(String(mineId))) ? mineId : actingPilotId();
    const remoteRes = await remote('/duels?mine=' + encodeURIComponent(id));
    if (Array.isArray(remoteRes)) return remoteRes;
    try {
      const ids = JSON.parse(localStorage.getItem('pitlane-duels-mine-v1') || '[]');
      if (!Array.isArray(ids) || !ids.length) return [];
      const out = [];
      for (const did of ids.slice(0, 20)) {
        const d = await remote('/duel/' + encodeURIComponent(did));
        if (d && d.id) out.push(d);
      }
      return out;
    } catch (_) {
      return [];
    }
  },

  /** POST /crew { name, trackId, createdBy } */
  async createCrew(payload) {
    const body = {
      name: payload?.name || '',
      trackId: payload?.trackId || '',
      createdBy: payload?.createdBy || undefined,
      nick: payload?.nick || payload?.createdBy || undefined,
      pilotId: payload?.pilotId || undefined,
    };
    const remoteRes = await remoteKeep('/crew', { method: 'POST', body: JSON.stringify(body) });
    if (remoteRes && remoteRes.id) {
      try {
        const key = 'pitlane-crews-mine-v1';
        const ids = JSON.parse(localStorage.getItem(key) || '[]');
        const next = [remoteRes.id, ...(Array.isArray(ids) ? ids : [])].filter((x, i, a) => a.indexOf(x) === i).slice(0, 20);
        localStorage.setItem(key, JSON.stringify(next));
      } catch (_) {}
      return remoteRes;
    }
    return remoteRes;
  },

  async getCrew(id) {
    if (!id) return null;
    const remoteRes = await remote('/crew/' + encodeURIComponent(id));
    if (remoteRes && remoteRes.id) return remoteRes;
    return null;
  },

  async joinCrew(id, payload) {
    if (!id) return null;
    const body = {
      pilotId: payload?.pilotId || undefined,
      nick: payload?.nick || undefined,
      name: payload?.nick || undefined,
    };
    return await remoteKeep('/crew/' + encodeURIComponent(id) + '/join', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async joinCrewByCode(code, payload) {
    const body = {
      code: String(code || '').trim(),
      pilotId: payload?.pilotId || undefined,
      nick: payload?.nick || undefined,
      name: payload?.nick || undefined,
    };
    return await remoteKeep('/crew/join', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async getCrewBoard(id) {
    if (!id) return null;
    const remoteRes = await remote('/crew/' + encodeURIComponent(id) + '/board');
    if (remoteRes && remoteRes.id) return remoteRes;
    return null;
  },

  async pushCrewBest(id, row) {
    if (!id) return null;
    return await remoteKeep('/crew/' + encodeURIComponent(id) + '/best', {
      method: 'POST',
      body: JSON.stringify(row || {}),
    });
  },

  async listMyCrews(mineId) {
    const id = (mineId && !/^\+?\d{10,15}$/.test(String(mineId))) ? mineId : actingPilotId();
    const remoteRes = await remote('/crews?mine=' + encodeURIComponent(id));
    if (Array.isArray(remoteRes)) return remoteRes;
    try {
      const ids = JSON.parse(localStorage.getItem('pitlane-crews-mine-v1') || '[]');
      if (!Array.isArray(ids) || !ids.length) return [];
      const out = [];
      for (const cid of ids.slice(0, 12)) {
        const c = await remote('/crew/' + encodeURIComponent(cid));
        if (c && c.id) out.push(c);
      }
      return out;
    } catch (_) {
      return [];
    }
  },



  /**
   * GET /tops/sector/:trackId?sector=0|1|2
   * → { trackId, sector, rows: [{ name, avatar, t, ms, pilotId, car, gpsQ }] }
   * or sector=all → { trackId, sectors: [rows, rows, rows] }
   */
  async listSector(trackId, sector) {
    if (!trackId) return { trackId: '', sector: 0, rows: [] };
    let path = '/tops/sector/' + encodeURIComponent(trackId);
    if (sector === 'all' || sector == null) {
      path += '?sector=all';
    } else {
      path += '?sector=' + encodeURIComponent(String(Math.max(0, Math.min(2, Number(sector) | 0))));
    }
    const remoteRes = await remote(path);
    if (remoteRes && (Array.isArray(remoteRes.rows) || Array.isArray(remoteRes.sectors))) {
      return remoteRes;
    }
    // v104: офлайн — пустые секторы (никаких локальных «топов»)
    return localBuildSectorBoard([], sector == null || sector === 'all' ? null : Number(sector) | 0);
  },

  /** GET /auth/config → { sms, telegram, telegramBotId } or null (offline / no Worker). */
  async authConfig() {
    const base = apiBase();
    if (!base) return null;
    if (typeof window !== 'undefined' && window.__PITLANE_AUTH_CONFIG) return window.__PITLANE_AUTH_CONFIG; // tests
    const res = await remoteKeep('/auth/config');
    if (res && typeof res.sms === 'boolean') return res;
    return null;
  },

  /** POST /auth/telegram with the raw Login Widget payload. */
  async telegramLogin(payload) {
    return await remoteKeep('/auth/telegram', { method: 'POST', body: JSON.stringify(payload || {}) });
  },

  /** POST /auth/tma with the raw Mini App initData string (server validates HMAC). */
  async tmaLogin(initData) {
    return await remoteKeep('/auth/tma', { method: 'POST', body: JSON.stringify({ initData: String(initData || '') }) });
  },

  /** POST /tma/share-prepare → { id } for WebApp.shareMessage (Bot API savePreparedInlineMessage). */
  async tmaSharePrepare(initData, param, text) {
    return await remoteKeep('/tma/share-prepare', { method: 'POST', body: JSON.stringify({ initData: String(initData || ''), param, text }) });
  },

  /** GET /me → { pilotId, nick, user } (auth required). */
  async me() {
    return await remoteKeep('/me');
  },

  /** POST /auth/logout → revoke the session token on the server (best effort). */
  async logout() {
    const token = getSessionToken();
    if (!token || token.startsWith('local-')) return null;
    return await remoteKeep('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: getRefreshToken() || undefined }) });
  },

  /**
   * POST /feedback. Offline / network failure → queued in localStorage and retried on `online`
   * (flushFeedbackQueue). Returns { ok, queued?, error?, status? }.
   */
  async sendFeedback(payload) {
    if (!apiBase()) return { ok: false, error: 'no api' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return queueFeedback(payload) ? { ok: true, queued: true } : { ok: false, error: 'offline' };
    }
    const res = await remoteKeep('/feedback', { method: 'POST', body: JSON.stringify(payload), timeoutMs: 20000 });
    if (res && res.ok) return res;
    // network error (no HTTP status) → queue; HTTP 4xx/5xx → report to the user
    if (res && !res.status) return queueFeedback(payload) ? { ok: true, queued: true } : { ok: false, error: 'offline' };
    return res || { ok: false, error: 'no api' };
  },

  /** v107: POST /dispute {kind, board, target, at, reason} → { ok, id } (аккаунт обязателен). */
  async dispute(payload) {
    if (!apiBase()) return { ok: false, error: 'no api' };
    return (await remoteKeep('/dispute', { method: 'POST', body: JSON.stringify(payload), timeoutMs: 20000 })) || { ok: false };
  },

  async flushFeedbackQueue() {
    return flushFeedbackQueue();
  },

  /** DELETE /account → { ok, deleted } (auth required). */
  async deleteAccount() {
    return await remoteKeep('/account', { method: 'DELETE' });
  },

  /** GET /session/today → { trackId, title, date, tops, attendees } */
  async getSessionToday() {
    const remoteRes = await remote('/session/today');
    if (remoteRes && remoteRes.trackId) return remoteRes;
    return null;
  },

  /* —— v97: «Это моя машина» + комнаты экипажей (server decides paywall; errors come back as { ok:false, status, code }) —— */
  async getMyCar() { return await remoteKeep('/me/car'); },
  async putMyCar(car) { return await remoteKeep('/me/car', { method: 'PUT', body: JSON.stringify(car || {}) }); },
  async listRooms() { return await remoteKeep('/rooms'); },
  // v121: уведомления бота
  async getNotify() { return await remoteKeep('/me/notify'); },
  async putNotify(prefs) { return await remoteKeep('/me/notify', { method: 'PUT', body: JSON.stringify(prefs || {}) }); },
  async createRoom(name) { return await remoteKeep('/rooms', { method: 'POST', body: JSON.stringify({ name }) }); },
  async getRoom(id) { return await remoteKeep('/rooms/' + encodeURIComponent(id)); },
  async roomInvitePreview(code) { return await remoteKeep('/rooms/invite/' + encodeURIComponent(code)); },
  async joinRoom(code) { return await remoteKeep('/rooms/join', { method: 'POST', body: JSON.stringify({ code }) }); },
  async leaveRoom(id) { return await remoteKeep('/rooms/' + encodeURIComponent(id) + '/leave', { method: 'POST', body: '{}' }); },
  async rotateRoomInvite(id) { return await remoteKeep('/rooms/' + encodeURIComponent(id) + '/invite', { method: 'POST', body: '{}' }); },
  async roomLaps(id, track) { return await remoteKeep('/rooms/' + encodeURIComponent(id) + '/laps' + (track ? '?track=' + encodeURIComponent(track) : '')); },
  async postRoomLap(id, lap) { return await remoteKeep('/rooms/' + encodeURIComponent(id) + '/laps', { method: 'POST', body: JSON.stringify(lap || {}) }); },
  async roomDuel(id, a, b) { return await remoteKeep('/rooms/' + encodeURIComponent(id) + '/duel?a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b)); },
  async roomTop(id, track, model, tyre) {
    const q = new URLSearchParams({ track: track || '', model: model || '', tyre: tyre || '' });
    return await remoteKeep('/rooms/' + encodeURIComponent(id) + '/top?' + q.toString());
  },
  async roomInvoice(id, via) { return await remoteKeep('/rooms/' + encodeURIComponent(id) + '/invoice', { method: 'POST', body: JSON.stringify({ via: via || 'link' }) }); },
  // v98: teams (public profile + feed; private part = rooms above)
  async listTeams(q) { return await remoteKeep('/teams' + (q ? '?q=' + encodeURIComponent(q) : '')); },
  async getTeam(id) { return await remoteKeep('/teams/' + encodeURIComponent(id)); },
  async teamFeed(id, before) { return await remoteKeep('/teams/' + encodeURIComponent(id) + '/feed' + (before ? '?before=' + Number(before) : '')); },
  async updateTeam(id, patch) { return await remoteKeep('/teams/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(patch || {}) }); },
  async setTeamAvatar(id, image) { return await remoteKeep('/teams/' + encodeURIComponent(id) + '/avatar', { method: 'PUT', body: JSON.stringify({ image }), timeoutMs: 20000 }); },
  async postTeam(id, post) { return await remoteKeep('/teams/' + encodeURIComponent(id) + '/posts', { method: 'POST', body: JSON.stringify(post || {}), timeoutMs: 20000 }); },
  async deleteTeamPost(id, pid) { return await remoteKeep('/teams/' + encodeURIComponent(id) + '/posts/' + encodeURIComponent(pid), { method: 'DELETE' }); },
  async requestTeam(id, note) { return await remoteKeep('/teams/' + encodeURIComponent(id) + '/request', { method: 'POST', body: JSON.stringify({ note: note || '' }) }); },
  async cancelTeamRequest(id) { return await remoteKeep('/teams/' + encodeURIComponent(id) + '/request', { method: 'DELETE' }); },
  async teamRequestAct(id, rid, act) { return await remoteKeep('/teams/' + encodeURIComponent(id) + '/requests/' + encodeURIComponent(rid) + '/' + (act === 'approve' ? 'approve' : 'decline'), { method: 'POST' }); },
  async teamMemberAct(id, mid, act) { return await remoteKeep('/teams/' + encodeURIComponent(id) + '/members/' + encodeURIComponent(mid) + '/' + (act === 'captain' ? 'captain' : 'remove'), { method: 'POST' }); },
  async teamDuelPost(id, a, b) { return await remoteKeep('/teams/' + encodeURIComponent(id) + '/duelpost', { method: 'POST', body: JSON.stringify({ a, b }) }); },
  /** v115: profile music (tracks are added by forwarding audio to the bot). */
  async myMusic() { if (!apiBase()) return { ok: false, error: 'offline' }; return await remoteKeep('/me/music'); },
  async orderMusic(ids) { return await remoteKeep('/me/music', { method: 'PUT', body: JSON.stringify({ order: ids }) }); },
  async delMusic(id) { return await remoteKeep('/me/music/' + encodeURIComponent(id), { method: 'DELETE' }); },
  musicUrl(pid, tid, kind) { const b = apiBase(); return b ? b + '/music/' + encodeURIComponent(pid) + '/' + encodeURIComponent(tid) + '/' + (kind === 'cover' ? 'cover' : 'audio') : ''; },
  /** v116: PITLANE GPS по Wi-Fi — привязка чипа и live-сокет (сессия в subprotocol, не в URL). */
  async gpsPair() { if (!apiBase()) return { ok: false, error: 'offline' }; return await remoteKeep('/gps/pair', { method: 'POST', body: '{}' }); },
  async gpsDevices() { if (!apiBase()) return { ok: false, error: 'offline' }; return await remoteKeep('/gps/devices'); },
  async gpsRevoke(id) { return await remoteKeep('/gps/devices/' + encodeURIComponent(id), { method: 'DELETE' }); },
  gpsLiveSocket() {
    const b = apiBase(); const tok = getSessionToken();
    if (!b || !tok || typeof WebSocket === 'undefined') return null;
    return new WebSocket(b.replace(/^http/i, 'ws') + '/gps/live', ['pitlane.v1', 'bearer.' + tok]);
  },
  teamAvatarUrl(id, v) { const b = apiBase(); return b && v ? b + '/teams/' + encodeURIComponent(id) + '/avatar?v=' + encodeURIComponent(v) : ''; },
  teamImgUrl(id, pid) { const b = apiBase(); return b ? b + '/teams/' + encodeURIComponent(id) + '/img/' + encodeURIComponent(pid) : ''; },

  /** POST /session/today/checkin { nick, pilotId? } */
  async sessionCheckin(payload) {
    const body = {
      nick: payload?.nick || undefined,
      pilotId: payload?.pilotId || undefined,
      name: payload?.nick || undefined,
    };
    return await remoteKeep('/session/today/checkin', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },


};

const FB_QUEUE_KEY = 'pitlane-feedback-queue-v1';
function readFbQueue() {
  try { const q = JSON.parse(localStorage.getItem(FB_QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch (_) { return []; }
}
function queueFeedback(payload) {
  try {
    const q = readFbQueue();
    if (q.length >= 3) return false; // keep localStorage small (screenshots!)
    q.push({ ...payload, diag: { ...(payload.diag || {}), queued: true }, queuedAt: Date.now() });
    localStorage.setItem(FB_QUEUE_KEY, JSON.stringify(q));
    return true;
  } catch (_) {
    // quota (big screenshot) → retry without it
    try {
      if (!payload.screenshot) return false;
      const q = readFbQueue();
      q.push({ ...payload, screenshot: undefined, diag: { ...(payload.diag || {}), queued: true, shotDropped: true }, queuedAt: Date.now() });
      localStorage.setItem(FB_QUEUE_KEY, JSON.stringify(q));
      return true;
    } catch (_) { return false; }
  }
}
let _fbFlushing = false;
async function flushFeedbackQueue() {
  if (_fbFlushing || !apiBase()) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const q = readFbQueue();
  if (!q.length) return 0;
  _fbFlushing = true;
  let sent = 0;
  try {
    const rest = [];
    for (const item of q) {
      if (Date.now() - (item.queuedAt || 0) > 7 * 86400000) continue; // stale → drop
      const { queuedAt, ...payload } = item;
      const res = await remoteKeep('/feedback', { method: 'POST', body: JSON.stringify(payload), timeoutMs: 20000 });
      if (res && res.ok) sent++;
      else if (res && res.status && res.status !== 429 && res.status < 500) { /* invalid → drop */ }
      else rest.push(item);
    }
    try { localStorage.setItem(FB_QUEUE_KEY, JSON.stringify(rest)); } catch (_) {}
  } finally {
    _fbFlushing = false;
  }
  return sent;
}

export function isRemoteApi() {
  return Boolean(apiBase());
}

export { devicePilotId };
