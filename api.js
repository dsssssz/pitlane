/** Shared API: remote Worker when configured, else localStorage fallback. */
const API_KEY = 'pitlane-api-v1';

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

function pilotHeaders() {
  const h = { 'Content-Type': 'application/json' };
  try {
    const auth = JSON.parse(localStorage.getItem('pitlane-auth-v1') || '{}');
    const phone = auth.session || null;
    const prof = JSON.parse(localStorage.getItem('pitlane-prof-v1') || '{}');
    if (phone) h['X-Pilot-Id'] = String(phone);
    if (prof.nick) h['X-Pilot-Name'] = String(prof.nick).slice(0, 48);
    else if (phone) h['X-Pilot-Name'] = '+' + String(phone).slice(-10);
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
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('pitlane api remote fail', path, err);
    return null;
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
  const d = { topsStraight: {}, topsLap: {}, pulse: [], shares: {} };
  saveDb(d);
  return d;
}

/** GPS + valid: missing valid counts as true (legacy); false drops */
function isValidGpsRow(r) {
  return !!(r && r.gps && r.valid !== false);
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
  // prune old local shares (~keep 50)
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
  async listLap(trackId) {
    const remoteRows = await remote('/tops/lap/' + encodeURIComponent(trackId));
    if (Array.isArray(remoteRows)) return remoteRows.filter(isValidGpsRow).slice();
    return localListLap(trackId);
  },
  async addStraight(carId, row) {
    const body = { ...row, gps: true, valid: row.valid !== false };
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
    // gate laps always carry valid:true going forward
    const body = { ...row, gps: true, valid: row.valid !== false };
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
  /** POST /share → {id}; falls back to localStorage */
  async createShare(payload) {
    const remoteRes = await remote('/share', {
      method: 'POST',
      body: JSON.stringify({ payload }),
    });
    if (remoteRes && remoteRes.id) return remoteRes;
    return localCreateShare(payload);
  },
  /** GET /share/:id */
  async getShare(id) {
    const remoteRes = await remote('/share/' + encodeURIComponent(id));
    if (remoteRes && !remoteRes.error) return remoteRes;
    return localGetShare(id);
  },
};

export function isRemoteApi() {
  return Boolean(apiBase());
}
