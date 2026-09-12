/** Локальный слой «сервера». Позже заменить fetch('/api/...') на тот же контракт. */
const API_KEY = 'pitlane-api-v1';

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
  const d = { topsStraight: {}, topsLap: {} };
  saveDb(d);
  return d;
}

export const api = {
  listStraight(carId) {
    const d = db();
    return (d.topsStraight[carId] || []).filter((r) => r.gps).slice().sort((a, b) => a.t - b.t);
  },
  listLap(trackId) {
    const d = db();
    return (d.topsLap[trackId] || []).filter((r) => r.gps).slice();
  },
  addStraight(carId, row) {
    const d = db();
    d.topsStraight[carId] = d.topsStraight[carId] || [];
    d.topsStraight[carId].push(row);
    saveDb(d);
    return this.listStraight(carId);
  },
  addLap(trackId, row) {
    const d = db();
    d.topsLap[trackId] = d.topsLap[trackId] || [];
    d.topsLap[trackId].push(row);
    saveDb(d);
    return this.listLap(trackId);
  },
  listPulse() {
    const d = db();
    d.pulse = d.pulse || [];
    return d.pulse.slice().sort((a, b) => b.at - a.at);
  },
  addPulse(row) {
    const d = db();
    d.pulse = d.pulse || [];
    d.pulse.unshift(row);
    d.pulse = d.pulse.slice(0, 200);
    saveDb(d);
    return this.listPulse();
  },
  likePulse(id, who) {
    const d = db();
    const p = (d.pulse || []).find((x) => x.id === id);
    if (!p) return this.listPulse();
    p.likes = p.likes || [];
    const i = p.likes.indexOf(who);
    if (i >= 0) p.likes.splice(i, 1);
    else p.likes.push(who);
    saveDb(d);
    return this.listPulse();
  },
  delPulse(id, who) {
    const d = db();
    d.pulse = (d.pulse || []).filter((x) => !(x.id === id && x.who === who));
    saveDb(d);
    return this.listPulse();
  },
};
