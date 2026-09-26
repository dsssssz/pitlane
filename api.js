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

export function setSessionToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, String(token));
    else localStorage.removeItem(TOKEN_KEY);
  } catch (_) {}
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

function pilotHeaders() {
  const h = { 'Content-Type': 'application/json' };
  try {
    const token = getSessionToken();
    if (token && !token.startsWith('local-')) h['Authorization'] = 'Bearer ' + token;
    const prof = JSON.parse(localStorage.getItem('pitlane-prof-v1') || '{}');
    // Guest id only; the session (Bearer) identifies logged-in pilots. Never send the phone.
    if (!h['Authorization']) h['X-Pilot-Id'] = devicePilotId();
    const nick = String(prof.nick || '').slice(0, 48);
    // Header values must be ISO-8859-1 → URI-encode (Cyrillic nicks used to make fetch() throw).
    h['X-Pilot-Name'] = encodeURIComponent(nick && !/(?:\+?\d[\s\-()]?){10,}/.test(nick) ? nick : 'гость');
  } catch (_) {}
  return h;
}

async function remote(path, opts = {}) {
  const base = apiBase();
  if (!base) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(base + path, {
      ...opts,
      headers: { ...pilotHeaders(), ...(opts.headers || {}) },
      signal: ctrl.signal,
    });
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
    const res = await fetch(base + path, {
      ...fetchOpts,
      headers: { ...pilotHeaders(), ...(opts.headers || {}) },
      signal: ctrl.signal,
    });
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
    return localListStraight(carId);
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
    let rows = localListLap(trackId);
    if (weather === 'dry' || weather === 'damp' || weather === 'wet') {
      rows = rows.filter((r) => r && r.weather === weather);
    }
    return rows;
  },
  async addStraight(carId, row) {
    // Do NOT force valid:true — client/server compute honesty
    const body = {
      ...row,
      gps: true,
      valid: row.valid === true,
      flags: Array.isArray(row.flags) ? row.flags : undefined,
    };
    const remoteRows = await remote('/tops/straight/' + encodeURIComponent(carId), {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (Array.isArray(remoteRows)) return remoteRows;
    const d = db();
    d.topsStraight[carId] = d.topsStraight[carId] || [];
    d.topsStraight[carId].push(body);
    saveDb(d);
    return localListStraight(carId);
  },
  async addLap(trackId, row) {
    const body = {
      ...row,
      gps: true,
      valid: row.valid === true,
      flags: Array.isArray(row.flags) ? row.flags : undefined,
    };
    const remoteRows = await remote('/tops/lap/' + encodeURIComponent(trackId), {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (Array.isArray(remoteRows)) return remoteRows;
    const d = db();
    d.topsLap[trackId] = d.topsLap[trackId] || [];
    d.topsLap[trackId].push(body);
    saveDb(d);
    return localListLap(trackId);
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
  async likePulse(id, who) {
    const remoteRows = await remote('/pulse/' + encodeURIComponent(id) + '/like', {
      method: 'POST',
      body: JSON.stringify({ who }),
    });
    if (Array.isArray(remoteRows)) return remoteRows;
    const d = db();
    const p = (d.pulse || []).find((x) => x.id === id);
    if (!p) return localListPulse();
    p.likes = p.likes || [];
    const i = p.likes.indexOf(who);
    if (i >= 0) p.likes.splice(i, 1);
    else p.likes.push(who);
    saveDb(d);
    return localListPulse();
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

  /** POST /duel { type, trackId?, createdBy, note? } */
  async createDuel(payload) {
    const body = {
      type: payload?.type === 'lap' ? 'lap' : 'drag',
      trackId: payload?.trackId || undefined,
      createdBy: payload?.createdBy || undefined,
      note: payload?.note || undefined,
      name: payload?.name || payload?.createdBy || undefined,
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
    // Offline / local: derive from local lap tops that carry sectors
    const laps = localListLap(trackId);
    const board = localBuildSectorBoard(laps, sector == null || sector === 'all' ? null : Number(sector) | 0);
    return board;
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
    return await remoteKeep('/auth/logout', { method: 'POST', body: '{}' });
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
