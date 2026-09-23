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
      id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('pitlane-device-v1', id);
    }
    return id;
  } catch (_) {
    return 'dev_anon';
  }
}

function pilotHeaders() {
  const h = { 'Content-Type': 'application/json' };
  try {
    const token = getSessionToken();
    if (token) h['Authorization'] = 'Bearer ' + token;
    const auth = JSON.parse(localStorage.getItem('pitlane-auth-v2') || localStorage.getItem('pitlane-auth-v1') || '{}');
    const phone = auth.session || null;
    const prof = JSON.parse(localStorage.getItem('pitlane-prof-v1') || '{}');
    if (phone) h['X-Pilot-Id'] = String(phone);
    else h['X-Pilot-Id'] = devicePilotId();
    if (prof.nick) h['X-Pilot-Name'] = String(prof.nick).slice(0, 48);
    else if (phone) h['X-Pilot-Name'] = '+' + String(phone).slice(-10);
    else h['X-Pilot-Name'] = 'гость';
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
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(base + path, {
      ...opts,
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
    const id = mineId || (() => {
      try {
        const auth = JSON.parse(localStorage.getItem('pitlane-auth-v2') || localStorage.getItem('pitlane-auth-v1') || '{}');
        if (auth.session) return String(auth.session);
      } catch (_) {}
      return devicePilotId();
    })();
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
};

export function isRemoteApi() {
  return Boolean(apiBase());
}

export { devicePilotId };
